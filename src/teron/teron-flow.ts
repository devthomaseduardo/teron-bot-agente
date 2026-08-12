import { sessionStore } from '../core/session.js';
import { appendLead } from '../core/leads.js';
import { normalize } from '../util/text.js';
import type { RichMessage } from '../messaging/types.js';
import {
  tplTeronMenu,
  tplAskStep1FirstName,
  tplAskStep2CompanyName,
  tplAskStep3Email,
  tplAskStep4City,
  tplAskStep5Website,
  tplAskStep6ProjectType,
  tplAskStep7ProjectDetails,
  tplAskStep8Deadline,
  tplTeronCompleted,
  tplClientInfo,
  tplPricingInfo,
  tplHandoff,
  tplScheduleCall,
  tplVisitWebsite,
  tplPosProposta,
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
  | 'step1_first_name'
  | 'step2_company_name'
  | 'step3_email'
  | 'step4_city'
  | 'step5_website'
  | 'step6_project_type'
  | 'step7_project_details'
  | 'step8_deadline'
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

function isEscapeCommand(text: string, n: string): boolean {
  return (
    isGreeting(text) ||
    /^(menu|voltar|cancelar|sair|0|reiniciar)$/i.test(n.trim())
  );
}

function handleFail(chatId: string, customErrorFn?: (fails: number) => RichMessage): TeronFlowResult {
  const fails = sessionStore.bumpFail(chatId);
  if (fails >= 3) {
    sessionStore.setHandoff(chatId, true);
    return rich({
      text: 'Notei que tivemos um contratempo para compreender a resposta 😅\nPara agilizar o seu atendimento, estou te transferindo agora mesmo para um especialista humano do nosso time! 👤',
      keepTogether: true,
    });
  }
  if (customErrorFn) {
    return rich(customErrorFn(fails));
  }
  return rich(tplGenericError(fails));
}

function generatePersonalizedProposalUrl(p: {
  name: string;
  company: string;
  email: string;
  city: string;
  project_type: string;
  project_details: string;
  deadline: string;
}): string {
  const companyName = p.company || p.name || 'cliente';
  const slug = companyName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-');
  const randomSuffix = Math.floor(10000 + Math.random() * 90000);
  const proposalId = `os-${slug}-${randomSuffix}`;

  const queryParams = new URLSearchParams({
    cliente: p.name || '',
    empresa: p.company || '',
    email: p.email || '',
    endereco: p.city || 'São Paulo, SP',
    projeto: p.project_type || 'Portal Dealer B2B & Plataforma Web',
    briefing: p.project_details || '',
    prazo: p.deadline || '15 dias úteis',
  }).toString();

  const baseUrl = (process.env.TERON_OS_URL || 'https://os.thomaseduardo.com.br').replace(/\/$/, '');
  return `${baseUrl}/proposta/${proposalId}?${queryParams}`;
}

export async function runTeronFlow(
  chatId: string,
  userText: string
): Promise<TeronFlowResult | null> {
  const text = (userText || '').trim();
  const n = normalize(text);

  // 3.4 Comandos Globais de Escape (menu, voltar, cancelar, sair, 0)
  if (isEscapeCommand(text, n)) {
    sessionStore.setHandoff(chatId, false);
    sessionStore.clearFails(chatId);
    sessionStore.setProfile(chatId, 'booking_step', 'idle');
    setStep(chatId, 'menu');
    return rich(tplTeronMenu());
  }

  const current = stepOf(chatId);

  // 2. ESTADO: FINALIZADO / PROPOSTA_ENVIADA (done)
  if (current === 'done') {
    if (isEscapeCommand(text, n)) {
      sessionStore.setHandoff(chatId, false);
      sessionStore.clearFails(chatId);
      setStep(chatId, 'menu');
      return rich(tplTeronMenu());
    }

    // 5. Etapa pós-resultado (gatilhos de onboarding: acessei, assinei, paguei, status)
    if (n.includes('status') || n.includes('onboarding') || n.includes('acessei') || n.includes('assinei') || n.includes('paguei')) {
      const name = sessionStore.get(chatId).profile.name || 'cliente';
      return rich(tplPosProposta(name));
    }

    if (n.includes('humano') || n.includes('falar') || n.includes('time')) {
      sessionStore.setHandoff(chatId, true);
      return rich(tplHandoff());
    }

    // Qualquer outra interação reabre o menu inicial limpo via modal
    sessionStore.clearFails(chatId);
    setStep(chatId, 'menu');
    return rich(tplTeronMenu());
  }

  // 2. ESTADO: MENU / START (Escolhas 1 a 6)
  if (current === 'menu' || current === 'idle') {
    if (n === '1' || n.includes('orcamento') || n.includes('orçamento') || n.includes('proposta')) {
      setStep(chatId, 'step1_first_name');
      sessionStore.clearFails(chatId);
      return rich(tplAskStep1FirstName());
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
    if (n === '5' || n.includes('agendar') || n.includes('call') || n.includes('reuniao') || n.includes('reunião')) {
      return rich(tplScheduleCall());
    }
    if (n === '6' || n.includes('site') || n.includes('acessar') || n.includes('link')) {
      return rich(tplVisitWebsite());
    }
    if (n.includes('reiniciar')) {
      setStep(chatId, 'menu');
      return rich(tplTeronMenu());
    }
  }

  // 2. ESTADO: QUALIFICACAO (Passo a Passo com Validação Permissiva & Escalonamento)

  // ETAPA 1: Primeiro Nome
  if (current === 'step1_first_name') {
    if (text.length < 2) {
      return handleFail(chatId);
    }
    sessionStore.clearFails(chatId);
    const firstName = text.split(' ')[0];
    sessionStore.setProfile(chatId, 'name', firstName);
    setStep(chatId, 'step2_company_name');
    return rich(tplAskStep2CompanyName(firstName));
  }

  // ETAPA 2: Nome da Empresa
  if (current === 'step2_company_name') {
    if (text.length < 2) {
      return handleFail(chatId);
    }
    sessionStore.clearFails(chatId);
    sessionStore.setProfile(chatId, 'company', text);
    setStep(chatId, 'step3_email');
    return rich(tplAskStep3Email());
  }

  // ETAPA 3: E-mail Corporativo
  if (current === 'step3_email') {
    const validEmail = /\S+@\S+\.\S+/.test(text);
    if (!validEmail) {
      return handleFail(chatId, tplEmailError);
    }
    sessionStore.clearFails(chatId);
    sessionStore.setProfile(chatId, 'email', text);
    setStep(chatId, 'step4_city');
    return rich(tplAskStep4City());
  }

  // ETAPA 4: Cidade / Estado
  if (current === 'step4_city') {
    if (text.length < 2) {
      return handleFail(chatId);
    }
    sessionStore.clearFails(chatId);
    sessionStore.setProfile(chatId, 'city', text);
    setStep(chatId, 'step5_website');
    return rich(tplAskStep5Website());
  }

  // ETAPA 5: Website / Instagram
  if (current === 'step5_website') {
    sessionStore.clearFails(chatId);
    sessionStore.setProfile(chatId, 'website', text);
    setStep(chatId, 'step6_project_type');
    return rich(tplAskStep6ProjectType());
  }

  // ETAPA 6: Tipo de Projeto (Modal List ou Texto Livre)
  if (current === 'step6_project_type') {
    let type = text.trim();
    if (n === '1' || n.includes('landing')) type = 'Landing Page';
    else if (n === '2' || n.includes('portal') || n.includes('web app')) type = 'Portal / Web App';
    else if (n === '3' || n.includes('automação') || n.includes('automacao') || n.includes('whatsapp')) type = 'Automação WhatsApp & OS';
    else if (n === '4' || n.includes('medida') || n.includes('outro')) type = 'Sistema Sob Medida / Outro';

    if (type.length < 2) {
      return handleFail(chatId);
    }
    sessionStore.clearFails(chatId);
    sessionStore.setProfile(chatId, 'project_type', type);
    setStep(chatId, 'step7_project_details');
    return rich(tplAskStep7ProjectDetails());
  }

  // ETAPA 7: Detalhes / Briefing do Projeto
  if (current === 'step7_project_details') {
    if (text.length < 2) {
      return handleFail(chatId);
    }
    sessionStore.clearFails(chatId);
    sessionStore.setProfile(chatId, 'project_details', text);
    setStep(chatId, 'step8_deadline');
    return rich(tplAskStep8Deadline());
  }

  // ETAPA 8: Prazo e Conclusão (Modal List ou Texto Livre)
  if (current === 'step8_deadline') {
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
        website: p.website || '',
        project_type: p.project_type || '',
        project_details: p.project_details || '',
        deadline: deadline,
      },
      source: 'teron:b2b_flow',
    });

    let proposalUrl = '';
    const leadProfile = {
      name: p.name || 'Contato Teron',
      company: p.company || '',
      email: p.email || '',
      city: p.city || '',
      project_type: p.project_type || '',
      project_details: p.project_details || '',
      deadline: deadline,
    };

    try {
      const teronOsUrl = (process.env.TERON_OS_URL || 'https://os.thomaseduardo.com.br').replace(/\/$/, '');
      const leadPayload = {
        name: leadProfile.name,
        company: leadProfile.company,
        email: leadProfile.email,
        phone: chatId.replace(/\D/g, ''),
        city: leadProfile.city,
        address: leadProfile.city || 'São Paulo, SP',
        projectType: leadProfile.project_type || 'Portal Dealer B2B & Plataforma Web',
        briefing: leadProfile.project_details || 'Desenvolvimento de sistema sob medida.',
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

    if (!proposalUrl) {
      proposalUrl = generatePersonalizedProposalUrl(leadProfile);
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
