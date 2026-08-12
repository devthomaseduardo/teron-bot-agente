import { sessionStore } from '../core/session.js';
import { appendLead } from '../core/leads.js';
import { normalize } from '../util/text.js';
import type { RichMessage } from '../messaging/types.js';
import {
  tplClinicMenu,
  tplEmergency,
  tplAskSpecialty,
  tplAskPatientName,
  tplAskSlot,
  tplAskInsurance,
  tplClinicDone,
  tplInsuranceInfo,
  tplPrices,
  tplReschedule,
  tplLocation,
  tplHandoff,
  tplError,
} from './templates.js';

export interface ClinicFlowResult {
  handled: boolean;
  text: string;
  source: string;
  rich?: RichMessage;
}

type Step = 'idle' | 'menu' | 'specialty' | 'name' | 'slot' | 'coverage' | 'reschedule_info' | 'done';

function stepOf(id: string): Step {
  return (sessionStore.get(id).profile.clinic_step as Step) || 'idle';
}
function setStep(id: string, s: Step) {
  sessionStore.setProfile(id, 'clinic_step', s);
  sessionStore.setTopic(id, 'clinic', { intentId: 'clinic', awaiting: s });
}
function rich(r: RichMessage): ClinicFlowResult {
  return { handled: true, text: r.text, source: 'clinic', rich: r };
}
function isEscape(text: string, n: string) {
  const t = text.trim().toLowerCase();
  return /^(oi+|ola+|olá|bom dia|boa tarde|boa noite|menu|0|voltar)[\s!.?]*$/i.test(t) ||
    /^(menu|0|voltar)$/i.test(n.trim());
}
function isEmergency(n: string) {
  return ['emergencia', 'emergência', 'socorro', 'passando mal', 'infarto', 'sangrando', 'samu'].some(
    (k) => n.includes(k)
  );
}

export async function runClinicFlow(chatId: string, userText: string): Promise<ClinicFlowResult | null> {
  const text = (userText || '').trim();
  const n = normalize(text);

  if (isEmergency(n)) {
    return rich(tplEmergency());
  }

  if (isEscape(text, n)) {
    setStep(chatId, 'menu');
    return rich(tplClinicMenu());
  }

  const cur = stepOf(chatId);

  if (cur === 'done') {
    if (n === '5' || n.includes('recep') || n.includes('humano')) {
      sessionStore.setHandoff(chatId, true);
      return rich(tplHandoff());
    }
    setStep(chatId, 'menu');
    return rich(tplClinicMenu());
  }

  if (cur === 'menu' || cur === 'idle') {
    if (n === '1' || n.includes('agendar') || n.includes('consulta') || n.includes('marcar')) {
      setStep(chatId, 'specialty');
      return rich(tplAskSpecialty());
    }
    if (n === '2' || n.includes('convenio') || n.includes('convênio') || n.includes('plano')) {
      return rich(tplInsuranceInfo());
    }
    if (n === '3' || n.includes('particular') || n.includes('preco') || n.includes('preço') || n.includes('valor')) {
      return rich(tplPrices());
    }
    if (n === '4' || n.includes('remarcar') || n.includes('cancelar') || n.includes('desmarcar')) {
      setStep(chatId, 'reschedule_info');
      return rich(tplReschedule());
    }
    if (n === '5' || n.includes('recep') || n.includes('humano') || n.includes('atendente')) {
      sessionStore.setHandoff(chatId, true);
      return rich(tplHandoff());
    }
    if (n === '6' || n.includes('endereco') || n.includes('endereço') || n.includes('horario') || n.includes('horário')) {
      return rich(tplLocation());
    }
    if (cur === 'idle') {
      setStep(chatId, 'menu');
      return rich(tplClinicMenu());
    }
  }

  if (cur === 'reschedule_info') {
    if (text.length < 5) return rich(tplError());
    appendLead({
      chatId,
      profile: { intent: 'remarcar', note: text, name: sessionStore.get(chatId).profile.name || '' },
      source: 'clinic:reschedule',
    });
    setStep(chatId, 'done');
    return rich({
      text: 'Registramos o pedido de remarcação/cancelamento. A recepção confirma em breve.',
      keepTogether: true,
    });
  }

  if (cur === 'specialty') {
    if (text.length < 2) return rich(tplError());
    sessionStore.setProfile(chatId, 'specialty', text);
    setStep(chatId, 'name');
    return rich(tplAskPatientName());
  }

  if (cur === 'name') {
    if (text.length < 2) return rich(tplError());
    sessionStore.setProfile(chatId, 'name', text);
    setStep(chatId, 'slot');
    return rich(tplAskSlot());
  }

  if (cur === 'slot') {
    if (text.length < 2) return rich(tplError());
    sessionStore.setProfile(chatId, 'preferred_slot', text);
    setStep(chatId, 'coverage');
    return rich(tplAskInsurance());
  }

  if (cur === 'coverage') {
    let coverage = text;
    if (n === '1' || n.includes('convenio') || n.includes('convênio')) coverage = 'Convênio';
    if (n === '2' || n.includes('particular')) coverage = 'Particular';
    sessionStore.setProfile(chatId, 'coverage', coverage);
    const p = sessionStore.get(chatId).profile;
    appendLead({
      chatId,
      profile: {
        name: p.name || '',
        specialty: p.specialty || '',
        slot: p.preferred_slot || '',
        coverage,
        intent: 'consulta',
      },
      source: 'clinic:booking',
    });
    setStep(chatId, 'done');
    return rich(
      tplClinicDone({
        name: p.name || 'paciente',
        specialty: p.specialty || '',
        slot: p.preferred_slot || '',
        coverage,
      })
    );
  }

  return null;
}
