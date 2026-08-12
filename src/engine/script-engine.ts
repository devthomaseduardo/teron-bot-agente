import type {
  AppConfig,
  Flow,
  FlowStep,
  Intent,
  NicheTemplate,
} from '../config/types.js';
import type { ChatSession } from '../config/types.js';
import { interpolate, normalize, pickRandom } from '../util/text.js';
import { sessionStore } from '../core/session.js';
import { appendLead } from '../core/leads.js';

export interface ScriptResult {
  handled: boolean;
  text?: string;
  exclusive: boolean;
  handoff?: boolean;
  source: 'intent' | 'faq' | 'flow' | 'context' | 'none';
  /** Se false, hybrid pode enriquecer com IA */
  preferAiContinue?: boolean;
}

/** Intents que não devem repetir no meio da conversa */
const ONE_SHOT_INTENTS = new Set(['greeting', 'thanks', 'farewell']);

/** Intents que definem tópico de negócio */
const TOPIC_BY_INTENT: Record<string, string> = {
  price: 'preco',
  buy: 'compra',
  schedule: 'agendamento',
  appointment: 'agendamento',
  human: 'humano',
  hours: 'horario',
  location: 'local',
  menu: 'cardapio',
  delivery: 'delivery',
  reserve: 'reserva',
  order_status: 'pedido',
  exchange: 'troca',
  shipping: 'frete',
  insurance: 'convenio',
  buy_property: 'imovel',
  rent: 'aluguel',
  visit: 'visita',
};

function matchIntent(text: string, intents: Intent[]): Intent | null {
  const n = normalize(text);
  let best: Intent | null = null;
  let bestScore = -1;

  for (const intent of intents) {
    let score = 0;
    for (const kw of intent.keywords) {
      const k = normalize(kw);
      if (n === k) score += 25 + k.length;
      else if (n.includes(k)) score += 10 + k.length;
    }
    if (intent.patterns) {
      for (const p of intent.patterns) {
        try {
          if (new RegExp(p, 'i').test(text)) score += 15;
        } catch {
          /* ignore */
        }
      }
    }
    if (score > 0) {
      score += intent.priority || 0;
      if (score > bestScore) {
        bestScore = score;
        best = intent;
      }
    }
  }
  return best;
}

function matchFaq(text: string, niche: NicheTemplate): string | null {
  const n = normalize(text);
  for (const item of niche.faq) {
    for (const q of item.questions) {
      const qn = normalize(q);
      if (n.includes(qn) || (qn.length > 8 && qn.includes(n))) {
        return item.answer;
      }
    }
  }
  return null;
}

function getFlow(niche: NicheTemplate, flowId: string): Flow | undefined {
  return niche.flows.find((f) => f.id === flowId);
}

function getStep(flow: Flow, stepId: string): FlowStep | undefined {
  return flow.steps.find((s) => s.id === stepId);
}

function render(text: string, config: AppConfig, session: ChatSession): string {
  return interpolate(text, config.niche.persona, session.profile);
}

function continueFlow(
  config: AppConfig,
  session: ChatSession,
  userText: string
): ScriptResult | null {
  if (!session.flowId || !session.stepId) return null;
  const flow = getFlow(config.niche, session.flowId);
  if (!flow) {
    sessionStore.clearFlow(session.chatId);
    return null;
  }
  const step = getStep(flow, session.stepId);
  if (!step) {
    sessionStore.clearFlow(session.chatId);
    return null;
  }

  if (step.captureField) {
    sessionStore.setProfile(session.chatId, step.captureField, userText.trim());
  }

  if (step.options) {
    const n = normalize(userText);
    for (const [key, nextId] of Object.entries(step.options)) {
      if (n.includes(normalize(key))) {
        return advanceToStep(config, session, flow, nextId);
      }
    }
  }

  if (step.end || !step.next) {
    sessionStore.clearFlow(session.chatId);
    sessionStore.setTopic(session.chatId, session.topic, { awaiting: null });
    if (config.leadCapture && Object.keys(session.profile).length) {
      appendLead({
        chatId: session.chatId,
        profile: sessionStore.get(session.chatId).profile,
        source: `flow:${flow.id}`,
      });
    }
    const fresh = sessionStore.get(session.chatId);
    const name = fresh.profile.name ? `, ${fresh.profile.name}` : '';
    return {
      handled: true,
      exclusive: true,
      source: 'flow',
      text: render(
        `Perfeito${name}! Anotei tudo ✅ Se quiser, me conta mais detalhes ou peça um próximo passo.`,
        config,
        fresh
      ),
    };
  }

  return advanceToStep(config, session, flow, step.next);
}

function advanceToStep(
  config: AppConfig,
  session: ChatSession,
  flow: Flow,
  stepId: string
): ScriptResult {
  const step = getStep(flow, stepId);
  if (!step) {
    sessionStore.clearFlow(session.chatId);
    return {
      handled: true,
      exclusive: true,
      source: 'flow',
      text: config.fallbackMessage,
    };
  }

  const fresh = sessionStore.get(session.chatId);
  const text = render(step.message, config, fresh);

  if (step.end) {
    sessionStore.clearFlow(session.chatId);
    sessionStore.setTopic(session.chatId, session.topic, { awaiting: null });
    if (config.leadCapture) {
      appendLead({
        chatId: session.chatId,
        profile: sessionStore.get(session.chatId).profile,
        source: `flow:${flow.id}:end`,
      });
    }
  } else {
    sessionStore.setFlow(session.chatId, flow.id, step.id);
    sessionStore.setTopic(session.chatId, session.topic || flow.id, {
      awaiting: step.captureField || 'resposta',
    });
  }

  return { handled: true, exclusive: true, source: 'flow', text };
}

function startFlow(
  config: AppConfig,
  session: ChatSession,
  flowId: string
): ScriptResult | null {
  const flow = getFlow(config.niche, flowId);
  if (!flow || !flow.steps.length) return null;

  // Pula passos cujo campo já está no profile (continuidade)
  let step = flow.steps[0];
  const fresh = sessionStore.get(session.chatId);
  for (const s of flow.steps) {
    if (s.captureField && fresh.profile[s.captureField]) {
      // já tem o dado — vai para o próximo se existir
      if (s.next) {
        const nxt = getStep(flow, s.next);
        if (nxt) {
          step = nxt;
          continue;
        }
      }
      if (s.end) {
        sessionStore.clearFlow(session.chatId);
        return {
          handled: true,
          exclusive: true,
          source: 'flow',
          text: render(s.message, config, fresh),
        };
      }
    } else {
      step = s;
      break;
    }
  }

  sessionStore.setFlow(session.chatId, flow.id, step.id);
  sessionStore.setTopic(session.chatId, flowId, {
    awaiting: step.captureField || 'resposta',
  });
  return {
    handled: true,
    exclusive: true,
    source: 'flow',
    text: render(step.message, config, sessionStore.get(session.chatId)),
  };
}

/**
 * Continua conversa com base no que o bot pediu antes (sem recomeçar do zero).
 */
function continueContext(
  config: AppConfig,
  session: ChatSession,
  userText: string
): ScriptResult | null {
  if (!session.awaiting && !session.topic) return null;

  // Se estávamos esperando um campo, grava e avança
  if (session.awaiting && session.awaiting !== 'resposta') {
    const field = session.awaiting;
    sessionStore.setProfile(session.chatId, field, userText.trim());
    sessionStore.setTopic(session.chatId, session.topic, { awaiting: null });

    const fresh = sessionStore.get(session.chatId);
    const name = fresh.profile.name ? fresh.profile.name : '';

    // Encadeamentos naturais por tópico
    if (session.topic === 'preco' || session.topic === 'compra') {
      if (field === 'interest' || field === 'need') {
        sessionStore.setTopic(session.chatId, 'preco', { awaiting: 'name' });
        return {
          handled: true,
          exclusive: true,
          source: 'context',
          text: render(
            `Entendi: você precisa de "${userText.trim()}". Qual o seu nome para eu montar a orientação certinha?`,
            config,
            fresh
          ),
        };
      }
      if (field === 'name') {
        sessionStore.setTopic(session.chatId, 'preco', { awaiting: 'contact' });
        return {
          handled: true,
          exclusive: true,
          source: 'context',
          text: render(
            `Obrigado, {name}! Qual e-mail ou WhatsApp prefere para receber a proposta?`,
            config,
            sessionStore.get(session.chatId)
          ),
        };
      }
      if (field === 'contact') {
        if (config.leadCapture) {
          appendLead({
            chatId: session.chatId,
            profile: sessionStore.get(session.chatId).profile,
            source: 'context:preco',
          });
        }
        sessionStore.setTopic(session.chatId, 'preco', { awaiting: null });
        return {
          handled: true,
          exclusive: true,
          source: 'context',
          text: render(
            `Perfeito, {name}! ✅ Anotei seu contato e o que você precisa ({need}). Nossa equipe comercial retorna em breve com os valores. Quer que eu agende um horário de conversa?`,
            config,
            sessionStore.get(session.chatId)
          ),
        };
      }
    }

    if (session.topic === 'agendamento') {
      if (field === 'name') {
        sessionStore.setTopic(session.chatId, 'agendamento', {
          awaiting: 'preferred_slot',
        });
        const n = sessionStore.get(session.chatId).profile.name || userText.trim();
        return {
          handled: true,
          exclusive: true,
          source: 'context',
          text: `Valeu, ${n}! Qual dia e período fica melhor (manhã/tarde)?`,
        };
      }
      if (field === 'preferred_slot') {
        sessionStore.setProfile(session.chatId, 'preferred_slot', userText.trim());
        sessionStore.setTopic(session.chatId, 'agendamento', { awaiting: null });
        if (config.leadCapture) {
          appendLead({
            chatId: session.chatId,
            profile: sessionStore.get(session.chatId).profile,
            source: 'context:agendamento',
          });
        }
        const p = sessionStore.get(session.chatId).profile;
        return {
          handled: true,
          exclusive: true,
          source: 'context',
          text: `Anotei${p.name ? ` (${p.name})` : ''}: preferência "${p.preferred_slot || userText.trim()}". Nossa equipe confirma em breve ✅ Posso ajudar com mais alguma coisa?`,
        };
      }
    }

    // Genérico: confirma e convida a continuar
    return {
      handled: true,
      exclusive: false,
      preferAiContinue: true,
      source: 'context',
      text: render(
        `Anotei: "${userText.trim()}". ${
          name ? name + ', ' : ''
        }me conta o próximo detalhe ou o que você quer fazer agora (valores, agendar, tirar dúvida).`,
        config,
        fresh
      ),
    };
  }

  // Tópico aberto sem awaiting — deixa IA continuar com contexto
  if (session.topic && session.history.length >= 2) {
    return {
      handled: false,
      exclusive: false,
      preferAiContinue: true,
      source: 'none',
    };
  }

  return null;
}

/**
 * Motor script com continuidade de conversa.
 */
export function runScriptEngine(
  config: AppConfig,
  chatId: string,
  userText: string
): ScriptResult {
  const session = sessionStore.get(chatId);

  // Handoff humano
  if (session.humanHandoff) {
    const resume = ['voltar', 'bot', 'assistente', 'menu', 'continuar'].some((k) =>
      normalize(userText).includes(k)
    );
    if (resume) {
      sessionStore.setHandoff(chatId, false);
      return {
        handled: true,
        exclusive: true,
        source: 'intent',
        text: render('Voltei! Em que posso te ajudar?', config, session),
      };
    }
    return {
      handled: true,
      exclusive: true,
      source: 'intent',
      text: render(
        'Já te encaminhei para um especialista 👤 Se quiser seguir comigo, digite *voltar*.',
        config,
        session
      ),
    };
  }

  // Fluxo formal em andamento
  if (session.flowId && session.stepId) {
    const flowResult = continueFlow(config, session, userText);
    if (flowResult?.handled) return flowResult;
  }

  // Continuidade informal (awaiting/topic)
  // Se a mensagem for claramente um intent forte novo, não engole no context
  const intentPreview = matchIntent(userText, config.niche.intents);
  const strongNewIntent =
    intentPreview &&
    !ONE_SHOT_INTENTS.has(intentPreview.id) &&
    (intentPreview.priority || 0) >= 14;

  if (!strongNewIntent) {
    const ctx = continueContext(config, session, userText);
    if (ctx?.handled) return ctx;
  }

  // Intents
  const intent = intentPreview;
  if (intent) {
    // Evita repetir saudação/obrigado no meio da conversa
    if (ONE_SHOT_INTENTS.has(intent.id) && session.greeted && session.history.length > 2) {
      if (intent.id === 'greeting') {
        return {
          handled: true,
          exclusive: true,
          source: 'context',
          text: render(
            session.topic
              ? `Ainda estou aqui! Continuando sobre ${session.topic}… o que mais você precisa?`
              : `Ainda estou por aqui 😊 Me diga o próximo passo — valores, agendar ou uma dúvida.`,
            config,
            session
          ),
        };
      }
      if (intent.id === 'thanks') {
        return {
          handled: true,
          exclusive: true,
          source: 'intent',
          text: render(
            'Por nada! Se quiser, seguimos no que você precisa 🙌',
            config,
            session
          ),
        };
      }
    }

    if (intent.reply.captureField) {
      // Não grava a frase inteira de "quanto custa" como interest cegamente se for só keyword
      const n = normalize(userText);
      const onlyKeyword = intent.keywords.some((k) => n === normalize(k));
      if (!onlyKeyword && userText.trim().length > 12) {
        sessionStore.setProfile(chatId, intent.reply.captureField, userText.trim());
      }
    }

    const topic = TOPIC_BY_INTENT[intent.id] || intent.id;
    sessionStore.setTopic(chatId, topic, { intentId: intent.id });

    if (intent.id === 'human' || intent.reply.nextState === 'human_handoff') {
      sessionStore.setHandoff(chatId, true);
      const text = render(pickRandom(intent.reply.replies), config, session);
      return {
        handled: true,
        exclusive: true,
        handoff: true,
        source: 'intent',
        text,
      };
    }

    if (intent.reply.nextState?.startsWith('flow:')) {
      const flowId = intent.reply.nextState.replace('flow:', '');
      const flowStart = startFlow(config, session, flowId);
      if (flowStart?.text) {
        // Se já está em conversa, não repete intro longa — vai direto à pergunta do fluxo
        if (session.greeted && session.history.length > 2) {
          return flowStart;
        }
        const intro = render(pickRandom(intent.reply.replies), config, session);
        if (intro && intro !== flowStart.text) {
          return {
            handled: true,
            exclusive: true,
            source: 'flow',
            text: `${intro}\n\n${flowStart.text}`,
          };
        }
        return flowStart;
      }
    }

    // Preço: pede objetivo e espera resposta (continuidade)
    if (intent.id === 'price' || intent.id === 'buy') {
      sessionStore.setTopic(chatId, topic, {
        intentId: intent.id,
        awaiting: 'need',
      });
      const text = render(
        intent.id === 'buy'
          ? 'Ótimo! Para avançar, me conta em 1 frase o que você quer contratar/comprar.'
          : 'Sobre valores: depende do que você precisa. Me conta em 1 frase o objetivo do projeto/serviço 💼',
        config,
        session
      );
      return { handled: true, exclusive: true, source: 'intent', text };
    }

    const text = render(pickRandom(intent.reply.replies), config, session);
    // Intents informativos podem abrir waiting
    if (intent.reply.captureField) {
      sessionStore.setTopic(chatId, topic, {
        intentId: intent.id,
        awaiting: intent.reply.captureField,
      });
    }

    return {
      handled: true,
      exclusive: intent.reply.exclusive !== false,
      source: 'intent',
      text,
    };
  }

  // FAQ
  const faq = matchFaq(userText, config.niche);
  if (faq) {
    return {
      handled: true,
      exclusive: true,
      source: 'faq',
      text: render(faq, config, session),
    };
  }

  // Sem intent: se já tem conversa, deixa a IA continuar com sentido
  if (session.history.length >= 2) {
    return {
      handled: false,
      exclusive: false,
      preferAiContinue: true,
      source: 'none',
    };
  }

  return { handled: false, exclusive: false, source: 'none' };
}
