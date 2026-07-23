import type { AppConfig } from '../config/types.js';
import { runScriptEngine } from '../engine/script-engine.js';
import { runAiEngine } from '../engine/ai-engine.js';
import { sessionStore } from './session.js';
import { isWithinHours, interpolate } from '../util/text.js';
import { runBarbershopFlow } from '../barbershop/booking-flow.js';

export interface OrchestratorReply {
  text: string;
  source: string;
  /** Mensagem rica: GPS, lista, botões, foto */
  rich?: import('../messaging/types.js').RichMessage;
}

/**
 * Cérebro conversacional:
 * - mantém tópico e histórico
 * - script para fluxos/intents claros
 * - IA para continuar com sentido quando falta regra
 * - sempre responde
 */
export async function processMessage(
  config: AppConfig,
  chatId: string,
  rawText: string
): Promise<OrchestratorReply> {
  const text = (rawText || '').trim() || 'Olá';

  sessionStore.touchUser(chatId, text);
  const session = sessionStore.get(chatId);

  // ── Teron B2B: Nicho Teron (modal + formulário de orçamento em 5 etapas) ──
  const isTeron =
    config.nicheId === 'teron' ||
    session.topic === 'teron_b2b' ||
    Boolean(session.profile.teron_step);

  if (isTeron) {
    try {
      const { runTeronFlow } = await import('../teron/teron-flow.js');
      const teronResult = await runTeronFlow(chatId, text);
      if (teronResult?.handled) {
        const outText =
          (teronResult.text && teronResult.text.trim()) ||
          teronResult.rich?.intro ||
          teronResult.rich?.text ||
          config.fallbackMessage;
        sessionStore.touchBot(chatId, outText);
        return {
          text: outText,
          source: teronResult.source || 'teron',
          rich: teronResult.rich || { text: outText, keepTogether: true },
        };
      }
    } catch (err) {
      /* fallback se o fluxo Teron falhar */
    }
  }

  // ── Barbearia: prioridade quando nicheId === 'barbershop' ──
  const forceBarbershop =
    config.nicheId === 'barbershop' ||
    (session.topic === 'barbearia' && config.nicheId !== 'teron') ||
    Boolean(
      config.nicheId === 'barbershop' &&
        session.profile.booking_step &&
        session.profile.booking_step !== 'idle' &&
        session.profile.booking_step !== 'done'
    );

  if (forceBarbershop) {
    try {
      const bb = await runBarbershopFlow(chatId, text);
      if (bb?.handled) {
        const outText =
          (bb.text && bb.text.trim()) ||
          bb.rich?.intro ||
          bb.rich?.text ||
          config.fallbackMessage;
        sessionStore.touchBot(chatId, outText);
        return {
          text: outText,
          source: bb.source || 'barbershop',
          rich: bb.rich || { text: outText, keepTogether: true },
        };
      }
    } catch (err) {
      // se o fluxo quebrar, ainda manda menu modal em vez de fallback IA
      try {
        const { tplMenu } = await import('../barbershop/templates.js');
        const menu = tplMenu();
        sessionStore.touchBot(chatId, menu.text);
        return { text: menu.text, source: 'barbershop+recovery', rich: menu };
      } catch {
        /* segue abaixo */
      }
    }
  }

  // Fora do horário (se configurado)
  const hours = config.niche.businessHours;
  if (hours) {
    const day = new Date().getDay();
    const inDay = hours.days.includes(day);
    const inTime = isWithinHours(hours.start, hours.end);
    if ((!inDay || !inTime) && hours.offlineMessage) {
      const emergency = config.niche.intents.find((i) => i.id === 'emergency');
      if (emergency) {
        const n = text.toLowerCase();
        if (emergency.keywords.some((k) => n.includes(k))) {
          const msg = interpolate(
            emergency.reply.replies[0],
            config.niche.persona,
            session.profile
          );
          sessionStore.touchBot(chatId, msg);
          return { text: msg, source: 'emergency' };
        }
      }

      if (!session.flowId && !session.humanHandoff) {
        const script = runScriptEngine(config, chatId, text);
        const offline = interpolate(
          hours.offlineMessage,
          config.niche.persona,
          session.profile
        );

        if (!session.offlineNotified) {
          session.offlineNotified = true;
          if (script.handled && script.text) {
            const combined = `${offline}\n\n${script.text}`;
            sessionStore.touchBot(chatId, combined);
            return { text: combined, source: `offline+${script.source}` };
          }
          sessionStore.touchBot(chatId, offline);
          return { text: offline, source: 'offline' };
        }

        if (script.handled && script.text && !script.preferAiContinue) {
          sessionStore.touchBot(chatId, script.text);
          return { text: script.text, source: script.source };
        }
      }
    }
  }

  // --- SCRIPT (fluxos / intents / continuidade) ---
  let scriptPreferAi = false;
  if (config.mode === 'script' || config.mode === 'hybrid') {
    const script = runScriptEngine(config, chatId, text);

    if (script.handled && script.text && !script.preferAiContinue) {
      sessionStore.touchBot(chatId, script.text);
      return { text: script.text, source: script.source };
    }

    if (script.preferAiContinue) scriptPreferAi = true;

    if (config.mode === 'script') {
      if (script.handled && script.text) {
        sessionStore.touchBot(chatId, script.text);
        return { text: script.text, source: script.source };
      }
      const generic = buildContextualFallback(config, chatId);
      sessionStore.touchBot(chatId, generic);
      return { text: generic, source: 'catch_all' };
    }
  }

  // --- IA (continuidade com histórico) ---
  // Em hybrid: usa IA quando script não fechou OU pediu continuação
  const shouldUseAi =
    config.mode === 'ai' ||
    (config.mode === 'hybrid' &&
      config.aiProvider !== 'NONE' &&
      (scriptPreferAi || true));

  // hybrid: se script já respondeu exclusive, já retornou acima.
  // Chegamos aqui = precisa de resposta aberta/continua
  if (shouldUseAi && config.aiProvider !== 'NONE') {
    const ai = await runAiEngine(config, chatId, text);
    if (ai && ai.trim()) {
      const cleaned = cleanupAiReply(ai.trim(), sessionStore.get(chatId).greeted);
      sessionStore.touchBot(chatId, cleaned);
      // se a IA fez pergunta, marca awaiting genérico
      if (cleaned.includes('?')) {
        sessionStore.setTopic(chatId, sessionStore.get(chatId).topic || 'conversa', {
          awaiting: sessionStore.get(chatId).awaiting || 'resposta',
        });
      }
      return { text: cleaned, source: 'ai' };
    }
  }

  const catchAll = buildContextualFallback(config, chatId);
  sessionStore.touchBot(chatId, catchAll);
  return { text: catchAll, source: 'fallback' };
}

/** Remove saudações repetidas da IA se a conversa já começou */
function cleanupAiReply(text: string, alreadyGreeted: boolean): string {
  if (!alreadyGreeted) return text;
  let t = text;
  t = t.replace(/^(ol[aá]|oi|bom dia|boa tarde|boa noite)[!.,\s]*/i, '');
  t = t.replace(/^(tudo bem\??|como vai\??)[!.,\s]*/i, '');
  return t.trim() || text;
}

function buildContextualFallback(config: AppConfig, chatId: string): string {
  const s = sessionStore.get(chatId);
  const name = s.profile.name ? ` ${s.profile.name}` : '';
  const need = s.profile.need || s.profile.interest;

  if (need) {
    return `Anotado${name}: "${need}". Quer que eu fale de valores, agende um horário ou passe para um especialista?`;
  }
  if (s.topic === 'preco') {
    return `Para te passar um valor realista${name}, me diga em uma frase o que você precisa.`;
  }
  if (s.topic === 'agendamento') {
    return `Para agendar${name}, me passe o melhor dia e período (manhã/tarde).`;
  }
  if (s.greeted) {
    return `Pode detalhar um pouco mais${name}? Assim eu sigo no mesmo assunto e te ajudo melhor.`;
  }

  const botName = config.niche.persona.name;
  const company = config.niche.persona.companyName;
  return (
    config.fallbackMessage ||
    `Oi${name}! Sou ${botName}, da ${company}. Como posso te ajudar agora?`
  );
}
