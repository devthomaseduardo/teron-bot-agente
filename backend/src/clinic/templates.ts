import type { RichMessage } from '../messaging/types.js';

const company = () => process.env.COMPANY_NAME || 'Clínica';
const bot = () => process.env.ASSISTANT_NAME || 'Sofia';

export function tplClinicMenu(): RichMessage {
  const intro =
    `Olá! Sou ${bot()}, da recepção da *${company()}*.\n` +
    `Posso agendar, informar convênios ou horários — com cuidado e clareza.`;
  return {
    text: intro,
    intro,
    modalOnly: true,
    keepTogether: true,
    list: {
      buttonText: 'Ver opções',
      title: 'Recepção',
      description: 'Escolha:',
      footer: company(),
      sections: [
        {
          title: 'Menu',
          rows: [
            { rowId: '1', title: 'Agendar consulta', description: 'Marcar horário' },
            { rowId: '2', title: 'Convênios', description: 'Planos aceitos' },
            { rowId: '3', title: 'Particular / valores', description: 'Tabela orientativa' },
            { rowId: '4', title: 'Remarcar ou cancelar', description: 'Alterar consulta' },
            { rowId: '5', title: 'Falar com a recepção', description: 'Humano' },
            { rowId: '6', title: 'Endereço e horários', description: 'Como chegar' },
          ],
        },
      ],
    },
  };
}

export function tplEmergency(): RichMessage {
  return {
    text:
      `⚠️ *Emergência*\n` +
      `Se houver risco à vida ou mal-estar grave, ligue *192 (SAMU)* ou vá ao pronto-socorro.\n` +
      `Este canal *não* substitui atendimento de urgência.`,
    keepTogether: true,
  };
}

export function tplAskSpecialty(): RichMessage {
  return {
    text: 'Qual *especialidade* ou profissional você procura?',
    keepTogether: true,
  };
}

export function tplAskPatientName(): RichMessage {
  return {
    text: 'Nome *completo do paciente*?',
    keepTogether: true,
  };
}

export function tplAskSlot(): RichMessage {
  return {
    text: 'Prefere qual *dia da semana* e período (*manhã* ou *tarde*)?',
    keepTogether: true,
  };
}

export function tplAskInsurance(): RichMessage {
  const intro = 'Atendimento por *convênio* ou *particular*?';
  return {
    text: intro,
    intro,
    keepTogether: true,
    list: {
      buttonText: 'Tipo',
      title: 'Cobertura',
      description: 'Selecione:',
      footer: '',
      sections: [
        {
          title: 'Tipo',
          rows: [
            { rowId: '1', title: 'Convênio', description: 'Informar o plano depois' },
            { rowId: '2', title: 'Particular', description: 'Sem plano' },
          ],
        },
      ],
    },
  };
}

export function tplClinicDone(p: {
  name: string;
  specialty: string;
  slot: string;
  coverage: string;
}): RichMessage {
  const first = (p.name || 'paciente').split(' ')[0];
  return {
    text:
      `*Solicitação registrada* — ${company()}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `${first}, recebemos:\n\n` +
      `• Especialidade: *${p.specialty}*\n` +
      `• Preferência: *${p.slot}*\n` +
      `• Cobertura: *${p.coverage}*\n\n` +
      `A recepção *confirma a vaga real* em breve (não garantimos horário antes da confirmação).\n` +
      `Leve documento com foto e cartão do convênio, se houver.`,
    keepTogether: true,
    list: {
      buttonText: 'Opções',
      title: 'Continuar',
      description: 'Escolha:',
      footer: '',
      sections: [
        {
          title: 'Ações',
          rows: [
            { rowId: '5', title: 'Falar com a recepção' },
            { rowId: 'menu', title: 'Menu principal' },
          ],
        },
      ],
    },
  };
}

export function tplInsuranceInfo(): RichMessage {
  return {
    text:
      `Trabalhamos com os principais convênios (lista atualizada na recepção).\n` +
      `Me diga o *nome do seu plano* que verificamos a cobertura, ou agende e confirme na marcação.`,
    keepTogether: true,
    list: {
      buttonText: 'Continuar',
      title: 'Opções',
      description: 'Escolha:',
      footer: '',
      sections: [
        {
          title: 'Próximo',
          rows: [
            { rowId: '1', title: 'Agendar consulta' },
            { rowId: 'menu', title: 'Menu' },
          ],
        },
      ],
    },
  };
}

export function tplPrices(): RichMessage {
  return {
    text:
      `Valores *particulares* variam por especialidade e procedimento.\n` +
      `A recepção informa a tabela atualizada na confirmação do horário — ` +
      `evitamos passar valor desatualizado neste chat.`,
    keepTogether: true,
    list: {
      buttonText: 'Continuar',
      title: 'Opções',
      description: 'Escolha:',
      footer: '',
      sections: [
        {
          title: 'Próximo',
          rows: [
            { rowId: '1', title: 'Agendar consulta' },
            { rowId: 'menu', title: 'Menu' },
          ],
        },
      ],
    },
  };
}

export function tplReschedule(): RichMessage {
  return {
    text:
      `Para *remarcar ou cancelar*, envie: nome do paciente + data aproximada da consulta.\n` +
      `Recomendamos avisar com pelo menos *24h* de antecedência.`,
    keepTogether: true,
  };
}

export function tplLocation(): RichMessage {
  const addr = process.env.BUSINESS_ADDRESS || 'Endereço conforme informado na confirmação da consulta.';
  return {
    text:
      `*Local e horários* — ${company()}\n` +
      `${addr}\n\n` +
      `Atendimento em horário comercial, sob agendamento.\n` +
      `Chegue com ~10 min de antecedência.`,
    keepTogether: true,
  };
}

export function tplHandoff(): RichMessage {
  return {
    text: `Transferindo para a *recepção humana* da ${company()}. Um momento.`,
    keepTogether: true,
  };
}

export function tplError(): RichMessage {
  return { text: 'Não compreendi. Tente de novo ou digite *menu*.', keepTogether: true };
}
