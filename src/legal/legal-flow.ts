import { sessionStore } from '../core/session.js';
import { appendLead } from '../core/leads.js';
import { normalize } from '../util/text.js';
import type { RichMessage } from '../messaging/types.js';
import {
  tplLegalMenu,
  tplAreas,
  tplFees,
  tplClientExisting,
  tplLocation,
  tplHandoff,
  tplAskName,
  tplAskArea,
  tplAskBrief,
  tplAskUrgency,
  tplAskSlot,
  tplCompleted,
  tplGenericError,
} from './templates.js';

export interface LegalFlowResult {
  handled: boolean;
  text: string;
  source: string;
  rich?: RichMessage;
}

type LegalStep =
  | 'idle'
  | 'menu'
  | 'name'
  | 'area'
  | 'brief'
  | 'urgency'
  | 'slot'
  | 'client_info'
  | 'done';

function stepOf(chatId: string): LegalStep {
  return (sessionStore.get(chatId).profile.legal_step as LegalStep) || 'idle';
}

function setStep(chatId: string, step: LegalStep): void {
  sessionStore.setProfile(chatId, 'legal_step', step);
  sessionStore.setTopic(chatId, 'legal', { intentId: 'legal', awaiting: step });
}

function rich(r: RichMessage, source = 'legal'): LegalFlowResult {
  return { handled: true, text: r.text, source, rich: r };
}

function isEscape(text: string, n: string): boolean {
  const t = (text || '').trim().toLowerCase();
  if (/^(oi+|ola+|olá|bom dia|boa tarde|boa noite|menu|0|voltar|cancelar|sair)[\s!.?]*$/i.test(t))
    return true;
  return /^(menu|voltar|cancelar|sair|0|reiniciar)$/i.test(n.trim());
}

function mapArea(n: string, text: string): string {
  if (n === '1' || n.includes('civel') || n.includes('cível') || n.includes('contrato'))
    return 'Cível / contratos';
  if (n === '2' || n.includes('familia') || n.includes('família') || n.includes('divorcio'))
    return 'Família';
  if (n === '3' || n.includes('trabalh')) return 'Trabalhista';
  if (n === '4' || n.includes('consumidor')) return 'Consumidor';
  if (n === '5' || n.includes('empres') || n.includes('societ')) return 'Empresarial';
  if (n === '6' || n.includes('outra') || n.includes('nao sei') || n.includes('não sei'))
    return 'Outra / a classificar';
  return text.trim() || 'A classificar';
}

function mapUrgency(n: string, text: string): string {
  if (n === '1' || n.includes('alta') || n.includes('hoje') || n.includes('urgent'))
    return 'Alta (hoje/amanhã)';
  if (n === '2' || n.includes('media') || n.includes('média') || n.includes('semana'))
    return 'Média (esta semana)';
  if (n === '3' || n.includes('normal')) return 'Normal';
  return text.trim() || 'Normal';
}

export async function runLegalFlow(chatId: string, userText: string): Promise<LegalFlowResult | null> {
  const text = (userText || '').trim();
  const n = normalize(text);

  if (isEscape(text, n)) {
    sessionStore.setHandoff(chatId, false);
    sessionStore.clearFails(chatId);
    setStep(chatId, 'menu');
    return rich(tplLegalMenu());
  }

  const current = stepOf(chatId);

  if (current === 'done') {
    if (n === '5' || n.includes('advogado') || n.includes('humano')) {
      sessionStore.setHandoff(chatId, true);
      return rich(tplHandoff());
    }
    setStep(chatId, 'menu');
    return rich(tplLegalMenu());
  }

  // MENU
  if (current === 'menu' || current === 'idle') {
    if (
      n === '1' ||
      n.includes('consulta') ||
      n.includes('agendar') ||
      n.includes('marcar') ||
      n.includes('triagem')
    ) {
      setStep(chatId, 'name');
      sessionStore.clearFails(chatId);
      return rich(tplAskName());
    }
    if (n === '2' || n.includes('area') || n.includes('área') || n.includes('atuacao') || n.includes('atuação')) {
      return rich(tplAreas());
    }
    if (n === '3' || n.includes('valor') || n.includes('honor') || n.includes('preco') || n.includes('preço')) {
      return rich(tplFees());
    }
    if (n === '4' || n.includes('cliente') || n.includes('processo')) {
      setStep(chatId, 'client_info');
      return rich(tplClientExisting());
    }
    if (n === '5' || n.includes('advogado') || n.includes('humano') || n.includes('atendente')) {
      sessionStore.setHandoff(chatId, true);
      return rich(tplHandoff());
    }
    if (n === '6' || n.includes('endereco') || n.includes('endereço') || n.includes('horario') || n.includes('horário')) {
      return rich(tplLocation());
    }
    // primeira mensagem aberta → menu
    if (current === 'idle') {
      setStep(chatId, 'menu');
      return rich(tplLegalMenu());
    }
  }

  if (current === 'client_info') {
    if (text.length < 3) return rich(tplGenericError());
    sessionStore.setProfile(chatId, 'client_note', text);
    appendLead({
      chatId,
      profile: {
        name: sessionStore.get(chatId).profile.name || 'Cliente',
        note: text,
        intent: 'cliente_existente',
      },
      source: 'legal:existing_client',
    });
    setStep(chatId, 'done');
    return rich({
      text: 'Registramos sua mensagem. A equipe retorna com o andamento. Digite *menu* para outras opções.',
      keepTogether: true,
    });
  }

  // TRIAGEM
  if (current === 'name') {
    if (text.length < 2) return rich(tplGenericError());
    sessionStore.setProfile(chatId, 'name', text);
    setStep(chatId, 'area');
    return rich(tplAskArea(text));
  }

  if (current === 'area') {
    const area = mapArea(n, text);
    sessionStore.setProfile(chatId, 'legal_area', area);
    setStep(chatId, 'brief');
    return rich(tplAskBrief());
  }

  if (current === 'brief') {
    if (text.length < 5) return rich(tplGenericError());
    sessionStore.setProfile(chatId, 'legal_brief', text);
    setStep(chatId, 'urgency');
    return rich(tplAskUrgency());
  }

  if (current === 'urgency') {
    const urgency = mapUrgency(n, text);
    sessionStore.setProfile(chatId, 'legal_urgency', urgency);
    setStep(chatId, 'slot');
    return rich(tplAskSlot());
  }

  if (current === 'slot') {
    if (text.length < 2) return rich(tplGenericError());
    sessionStore.setProfile(chatId, 'preferred_slot', text);
    const p = sessionStore.get(chatId).profile;

    appendLead({
      chatId,
      profile: {
        name: p.name || '',
        area: p.legal_area || '',
        brief: p.legal_brief || '',
        urgency: p.legal_urgency || '',
        slot: text,
        intent: 'consulta_juridica',
      },
      source: 'legal:intake',
    });

    setStep(chatId, 'done');
    return rich(
      tplCompleted({
        name: p.name || 'cliente',
        area: p.legal_area || 'A classificar',
        urgency: p.legal_urgency || 'Normal',
        slot: text,
      })
    );
  }

  return null;
}
