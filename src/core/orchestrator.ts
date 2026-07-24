import type { AppConfig } from '../config/types.js';
import { runScriptEngine } from '../engine/script-engine.js';
import { runAiEngine } from '../engine/ai-engine.js';
import { sessionStore } from './session.js';
import { isWithinHours, interpolate } from '../util/text.js';
import { runBarbershopFlow } from '../barbershop/booking-flow.js';

export interface OrchestratorReply {
  text: string;
  source: string;
  rich?: import('../messaging/types.js').RichMessage;
}

const LEGAL_IDS = new Set(['legal', 'lawyer', 'advogado', 'advocacia']);

export async function processMessage(
  config: AppConfig,
  chatId: string,
  rawText: string
): Promise<OrchestratorReply> {
  const text = (rawText || '').trim() || 'Olá';

  sessionStore.touchUser(chatId, text);
  const session = sessionStore.get(chatId);
  const niche = String(config.nicheId || '').toLowerCase();

  // ── TERON OS (B2B) ──
  const isTeron =
    niche === 'teron' ||
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
    } catch {
      /* fallback */
    }
  }

  // ── ADVOGADOS / ESCRITÓRIO ──
  const isLegal =
    LEGAL_IDS.has(niche) ||
    session.topic === 'legal' ||
    Boolean(session.profile.legal_step);

  if (isLegal) {
    try {
      const { runLegalFlow } = await import('../legal/legal-flow.js');
      const legalResult = await runLegalFlow(chatId, text);
      if (legalResult?.handled) {
        const outText =
          (legalResult.text && legalResult.text.trim()) ||
          legalResult.rich?.intro ||
          legalResult.rich?.text ||
          config.fallbackMessage;
        sessionStore.touchBot(chatId, outText);
        return {
          text: outText,
          source: legalResult.source || 'legal',
          rich: legalResult.rich || { text: outText, keepTogether: true },
        };
      }
    } catch {
      /* fallback */
    }
  }

  // ── BARBEARIA ──
  const forceBarbershop =
    niche === 'barbershop' ||
    niche === 'barbearia' ||
    (session.topic === 'barbearia' && niche !== 'teron' && !LEGAL_IDS.has(niche)) ||
    Boolean(
      (niche === 'barbershop' || niche === 'barbearia') &&
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
    } catch {
      try {
        const { tplMenu } = await import('../barbershop/templates.js');
        const menu = tplMenu();
        sessionStore.touchBot(chatId, menu.text);
        return { text: menu.text, source: 'barbershop+recovery', rich: menu };
      } catch {
        /* segue */
      }
    }
  }

  // Fora do horário
  const hours = config.niche.businessHours;
  if (hours) {
    const day = new Date().getDay();
    const inDay = hours.days.includes(day);
    const inTime = isWithinHours(hours.start, hours.end);
    if ((!inDay || !inTime) && hours.offlineMessage) {
      const emergency = config.niche.intents.find((i) => i.id === 'emergency');
      if (emergency) {
        const low = text.toLowerCase();
        if (emergency.keywords.some((k) => low.includes(k))) {
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

  const shouldUseAi =
    config.mode === 'ai' ||
    (config.mode === 'hybrid' && config.aiProvider !== 'NONE' && (scriptPreferAi || true));

  if (shouldUseAi && config.aiProvider !== 'NONE') {
    const ai = await runAiEngine(config, chatId, text);
    if (ai && ai.trim()) {
      const cleaned = cleanupAiReply(ai.trim(), sessionStore.get(chatId).greeted);
      sessionStore.touchBot(chatId, cleaned);
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
    return `Anotado${name}: "${need}". Quer valores, agendar ou falar com um especialista?`;
  }
  if (s.topic === 'preco') {
    return `Para um valor realista${name}, descreva em uma frase o que precisa.`;
  }
  if (s.topic === 'agendamento' || s.topic === 'legal') {
    return `Para agendar${name}, informe o melhor dia e período.`;
  }
  if (s.greeted) {
    return `Pode detalhar um pouco mais${name}? Assim eu continuo no mesmo assunto.`;
  }

  const botName = config.niche.persona.name;
  const company = config.niche.persona.companyName;
  return (
    config.fallbackMessage ||
    `Oi${name}! Sou ${botName}, da ${company}. Como posso ajudar?`
  );
}
