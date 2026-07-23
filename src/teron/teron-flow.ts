import { sessionStore } from '../core/session.js';
import { appendLead } from '../core/leads.js';
import { normalize } from '../util/text.js';
import type { RichMessage } from '../messaging/types.js';
import {
  tplTeronMenu,
  tplAskStep1NameCompany,
  tplAskStep2EmailCity,
  tplAskStep3ProjectType,
  tplAskStep4ProjectDetails,
  tplAskStep5Deadline,
  tplTeronCompleted,
  tplClientInfo,
  tplPricingInfo,
  tplHandoff,
  tplEmailError,
  tplGenericError,
} from './templates.js';

export interface TeronFlowResult {
  handled: boolean;
  text: string;
  source: string;
  rich?: RichMessage;
}

type TeronStep =
  | 'idle'
  | 'menu'
  | 'step1_name_company'
  | 'step2_email_city'
  | 'step3_project_type'
  | 'step4_project_details'
  | 'step5_deadline'
  | 'done';

function stepOf(chatId: string): TeronStep {
  return (sessionStore.get(chatId).profile.teron_step as TeronStep) || 'idle';
}

function setStep(chatId: string, step: TeronStep): void {
  sessionStore.setProfile(chatId, 'teron_step', step);
  sessionStore.setTopic(chatId, 'teron_b2b', { intentId: 'teron', awaiting: step });
}

function rich(r: RichMessage, source = 'teron'): TeronFlowResult {
  return { handled: true, text: r.text, source, rich: r };
}

function isGreeting(text: string): boolean {
  const t = (text || '').trim().toLowerCase();
  if (!t || t.length > 40) return false;
  return /^(oi+|oie|ola+|olá|eae|eai|iae|fala|salve|hey|hi|hello|bom dia|boa tarde|boa noite|menu|0)[\s!.?]*$/.test(
    t
  );
}

function parseNameAndCompany(raw: string): { name: string; company: string } {
  const parts = raw.split(/[-–—,|/]/).map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { name: parts[0], company: parts.slice(1).join(' ') };
  }
  return { name: raw.trim(), company: '' };
}

function parseEmailAndCity(raw: string): { email: string; city: string; validEmail: boolean } {
  const emailMatch = raw.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  const email = emailMatch ? emailMatch[1] : '';
  const validEmail = Boolean(email);
  const remaining = raw.replace(email, '').replace(/[-–—,e|/]/g, ' ').trim();
  return { email, city: remaining, validEmail };
}

export async function runTeronFlow(
  chatId: string,
  userText: string
): Promise<TeronFlowResult | null> {
  const text = (userText || '').trim();
  const n = normalize(text);

  // Se for saudação ou comando menu, limpa tópicos antigos e exibe o menu Teron B2B
  if (isGreeting(text) || n === 'menu' || n === '0') {
    sessionStore.setHandoff(chatId, false);
    sessionStore.clearFails(chatId);
    sessionStore.setProfile(chatId, 'booking_step', 'idle'); // limpa rastro do barbershop
    setStep(chatId, 'menu');
    return rich(tplTeronMenu());
  }

  const current = stepOf(chatId);

  // ETAPA PÓS-CONCLUSÃO (done)
  if (current === 'done') {
    if (isGreeting(text) || n === 'menu' || n === '0') {
      sessionStore.setHandoff(chatId, false);
      sessionStore.clearFails(chatId);
      setStep(chatId, 'menu');
      return rich(tplTeronMenu());
    }

    if (/^(ok|beleza|show|valeu|obrigad[oa]|perfeito|ótimo|otimo|certo|fechado|blz|entendido)[\s!.?]*$/i.test(n)) {
      return rich({
        text: 'Por nada! Suas informações já estão salvas com a equipe Teron OS. Se precisar de mais alguma coisa, basta digitar *menu* ou *0*! 🙌',
        keepTogether: true,
      });
    }

    // Se mandar qualquer outra mensagem após a conclusão, reabre o menu Teron OS
    sessionStore.clearFails(chatId);
    setStep(chatId, 'menu');
    return rich(tplTeronMenu());
  }

  // Escolhas no menu principal (1, 2, 3, 4 ou palavras-chave)
  if (current === 'menu' || current === 'idle') {
    if (n === '1' || n.includes('orcamento') || n.includes('orçamento') || n.includes('proposta')) {
      setStep(chatId, 'step1_name_company');
      sessionStore.clearFails(chatId);
      return rich(tplAskStep1NameCompany());
    }
    if (n === '2' || n.includes('cliente') || n.includes('ja sou')) {
      return rich(tplClientInfo());
    }
    if (n === '3' || n.includes('prazo') || n.includes('valor')) {
      return rich(tplPricingInfo());
    }
    if (n === '4' || n.includes('falar') || n.includes('atendente') || n.includes('time') || n.includes('humano')) {
      sessionStore.setHandoff(chatId, true);
      return rich(tplHandoff());
    }
  }

  // ETAPA 1: Nome e Empresa
  if (current === 'step1_name_company') {
    if (text.length < 2) {
      const fails = sessionStore.bumpFail(chatId);
      return rich(tplGenericError(fails));
    }
    sessionStore.clearFails(chatId);
    const parsed = parseNameAndCompany(text);
    sessionStore.setProfile(chatId, 'name', parsed.name);
    sessionStore.setProfile(chatId, 'company', parsed.company);
    setStep(chatId, 'step2_email_city');
    return rich(tplAskStep2EmailCity(parsed.name));
  }

  // ETAPA 2: E-mail e Cidade
  if (current === 'step2_email_city') {
    const parsed = parseEmailAndCity(text);
    if (!parsed.validEmail) {
      const fails = sessionStore.bumpFail(chatId);
      return rich(tplEmailError(fails));
    }
    sessionStore.clearFails(chatId);
    sessionStore.setProfile(chatId, 'email', parsed.email);
    if (parsed.city) sessionStore.setProfile(chatId, 'city', parsed.city);
    setStep(chatId, 'step3_project_type');
    return rich(tplAskStep3ProjectType());
  }

  // ETAPA 3: Tipo de Projeto (Modal List ou Texto Livre)
  if (current === 'step3_project_type') {
    let type = text.trim();
    if (n === '1' || n.includes('landing')) type = 'Landing Page';
    else if (n === '2' || n.includes('portal') || n.includes('web app')) type = 'Portal / Web App';
    else if (n === '3' || n.includes('automação') || n.includes('automacao') || n.includes('whatsapp')) type = 'Automação WhatsApp & OS';
    else if (n === '4' || n.includes('medida') || n.includes('outro')) type = 'Sistema Sob Medida / Outro';

    if (type.length < 2) {
      const fails = sessionStore.bumpFail(chatId);
      return rich(tplGenericError(fails));
    }
    sessionStore.clearFails(chatId);
    sessionStore.setProfile(chatId, 'project_type', type);
    setStep(chatId, 'step4_project_details');
    return rich(tplAskStep4ProjectDetails());
  }

  // ETAPA 4: Detalhes do Projeto
  if (current === 'step4_project_details') {
    if (text.length < 2) {
      const fails = sessionStore.bumpFail(chatId);
      return rich(tplGenericError(fails));
    }
    sessionStore.clearFails(chatId);
    sessionStore.setProfile(chatId, 'project_details', text);
    setStep(chatId, 'step5_deadline');
    return rich(tplAskStep5Deadline());
  }

  // ETAPA 5: Prazo e Conclusão (Modal List ou Texto Livre)
  if (current === 'step5_deadline') {
    let deadline = text.trim();
    if (n === '1' || n.includes('15') || n.includes('urgente')) deadline = 'Até 15 dias (Urgente)';
    else if (n === '2' || n.includes('30') || n.includes('1 mes') || n.includes('1 mês')) deadline = 'Até 30 dias (1 mês)';
    else if (n === '3' || n.includes('60') || n.includes('sem pressa')) deadline = '60+ dias (Sem pressa)';
    else if (n === '4' || n.includes('definir')) deadline = 'A definir / Orçamento';

    sessionStore.clearFails(chatId);
    sessionStore.setProfile(chatId, 'deadline', deadline);
    const p = sessionStore.get(chatId).profile;

    // Grava Lead B2B Teron no arquivo local de auditoria
    appendLead({
      chatId,
      profile: {
        name: p.name || 'Contato Teron',
        company: p.company || '',
        email: p.email || '',
        city: p.city || '',
        project_type: p.project_type || '',
        project_details: p.project_details || '',
        deadline: deadline,
      },
      source: 'teron:b2b_flow',
    });

    let proposalUrl = '';
    try {
      const teronOsUrl = (process.env.TERON_OS_URL || 'https://os.thomaseduardo.com.br').replace(/\/$/, '');
      const leadPayload = {
        name: p.name || 'Contato Teron',
        company: p.company || '',
        email: p.email || '',
        phone: chatId.replace(/\D/g, ''),
        city: p.city || '',
        address: p.city || 'São Paulo, SP',
        projectType: p.project_type || 'Portal Dealer B2B & Plataforma Web',
        briefing: p.project_details || 'Desenvolvimento de sistema sob medida.',
        deadline: deadline,
      };

      let res = await fetch(`${teronOsUrl}/api/lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(leadPayload),
      });

      if (!res.ok) {
        res = await fetch(`${teronOsUrl}/_build/createLeadFn`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(leadPayload),
        });
      }

      const rawRes = await res.text();
      try {
        const data = JSON.parse(rawRes) as { url?: string; proposalUrl?: string; result?: { url?: string } };
        proposalUrl = data.url || data.proposalUrl || data.result?.url || '';
      } catch {
        /* fallback texto não-json */
      }
    } catch (err) {
      console.warn('[teron-flow] Integração Teron OS offline ou sem resposta JSON:', err);
    }

    setStep(chatId, 'done');
    return rich(
      tplTeronCompleted({
        name: p.name || 'cliente',
        company: p.company || '',
        proposalUrl,
      })
    );
  }

  return null;
}
