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
const CLINIC_IDS = new Set(['clinic', 'clinica', 'dental']);
const RE_IDS = new Set(['realestate', 'imobiliaria', 'imobiliária']);
const REST_IDS = new Set(['restaurant', 'restaurante']);

async function tryDedicated(
  label: string,
  runner: () => Promise<{ handled?: boolean; text?: string; source?: string; rich?: any } | null>,
  fallbackMsg: string
): Promise<OrchestratorReply | null> {
  try {
    const result = await runner();
    if (result?.handled) {
      const outText =
        (result.text && result.text.trim()) ||
        result.rich?.intro ||
        result.rich?.text ||
        fallbackMsg;
      return {
        text: outText,
        source: result.source || label,
        rich: result.rich || { text: outText, keepTogether: true },
      };
    }
  } catch {
    /* next */
  }
  return null;
}

export async function processMessage(
  config: AppConfig,
  chatId: string,
  rawText: string
): Promise<OrchestratorReply> {
  const text = (rawText || '').trim() || 'Olá';

  sessionStore.touchUser(chatId, text);
  const session = sessionStore.get(chatId);
  const niche = String(config.nicheId || '').toLowerCase();
  const fb = config.fallbackMessage;

  // Ordem: fluxos dedicados (confiança + solução) antes de script/IA genérico

  // ── TERON OS ──
  if (niche === 'teron' || session.topic === 'teron_b2b' || session.profile.teron_step) {
    const r = await tryDedicated(
      'teron',
      async () => {
        const { runTeronFlow } = await import('../teron/teron-flow.js');
        return runTeronFlow(chatId, text);
      },
      fb
    );
    if (r) {
      sessionStore.touchBot(chatId, r.text);
      return r;
    }
  }

  // ── LEGAL ──
  if (LEGAL_IDS.has(niche) || session.topic === 'legal' || session.profile.legal_step) {
    const r = await tryDedicated(
      'legal',
      async () => {
        const { runLegalFlow } = await import('../legal/legal-flow.js');
        return runLegalFlow(chatId, text);
      },
      fb
    );
    if (r) {
      sessionStore.touchBot(chatId, r.text);
      return r;
    }
  }

  // ── CLÍNICA ──
  if (CLINIC_IDS.has(niche) || session.topic === 'clinic' || session.profile.clinic_step) {
    const r = await tryDedicated(
      'clinic',
      async () => {
        const { runClinicFlow } = await import('../clinic/clinic-flow.js');
        return runClinicFlow(chatId, text);
      },
      fb
    );
    if (r) {
      sessionStore.touchBot(chatId, r.text);
      return r;
    }
  }

  // ── IMOBILIÁRIA ──
  if (RE_IDS.has(niche) || session.topic === 'realestate' || session.profile.re_step) {
    const r = await tryDedicated(
      'realestate',
      async () => {
        const { runRealestateFlow } = await import('../realestate/realestate-flow.js');
        return runRealestateFlow(chatId, text);
      },
      fb
    );
    if (r) {
      sessionStore.touchBot(chatId, r.text);
      return r;
    }
  }

  // ── RESTAURANTE ──
  if (REST_IDS.has(niche) || session.topic === 'restaurant' || session.profile.rest_step) {
    const r = await tryDedicated(
      'restaurant',
      async () => {
        const { runRestaurantFlow } = await import('../restaurant/restaurant-flow.js');
        return runRestaurantFlow(chatId, text);
      },
      fb
    );
    if (r) {
      sessionStore.touchBot(chatId, r.text);
      return r;
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
          fb;
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
