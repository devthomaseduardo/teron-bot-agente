import type { RichMessage } from '../messaging/types.js';

const company = () => process.env.COMPANY_NAME || 'Escritório Jurídico';
const botName = () => process.env.ASSISTANT_NAME || 'Helena';

export function tplLegalMenu(): RichMessage {
  const intro =
    `Olá. Bem-vindo(a) ao *${company()}*.\n` +
    `Sou ${botName()}, assistente de atendimento. Como deseja prosseguir?`;

  return {
    text: intro,
    intro,
    modalOnly: true,
    keepTogether: true,
    list: {
      buttonText: 'Ver opções',
      title: 'Atendimento',
      description: 'Escolha uma opção:',
      footer: company(),
      sections: [
        {
          title: 'Menu',
          rows: [
            { rowId: '1', title: 'Agendar consulta', description: 'Triagem e horário' },
            { rowId: '2', title: 'Áreas de atuação', description: 'O que atendemos' },
            { rowId: '3', title: 'Valores e honorários', description: 'Como funciona a cobrança' },
            { rowId: '4', title: 'Já sou cliente', description: 'Processo em andamento' },
            { rowId: '5', title: 'Falar com advogado', description: 'Atendimento humano' },
            { rowId: '6', title: 'Endereço e horários', description: 'Onde estamos' },
          ],
        },
      ],
    },
  };
}

export function tplAreas(): RichMessage {
  return {
    text:
      `*Áreas de atuação* — ${company()}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `• Cível e contratos\n` +
      `• Família e sucessões\n` +
      `• Trabalhista\n` +
      `• Consumidor\n` +
      `• Empresarial / societário\n` +
      `• Previdenciário (conforme equipe)\n\n` +
      `Não encontramos sua área? Descreva o caso e agendamos triagem.`,
    keepTogether: true,
    list: {
      buttonText: 'Continuar',
      title: 'Opções',
      description: 'Escolha:',
      footer: '',
      sections: [
        {
          title: 'Próximo passo',
          rows: [
            { rowId: '1', title: 'Agendar consulta', description: 'Triagem do caso' },
            { rowId: '5', title: 'Falar com advogado', description: 'Humano' },
            { rowId: 'menu', title: 'Menu principal', description: 'Voltar' },
          ],
        },
      ],
    },
  };
}

export function tplFees(): RichMessage {
  return {
    text:
      `*Honorários* — ${company()}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `Os valores dependem da área, complexidade e fase do caso.\n` +
      `Na consulta inicial alinhamos escopo e proposta de honorários (fixo, êxito ou misto, conforme o caso).\n\n` +
      `Não enviamos tabela genérica pelo chat para não gerar expectativa incorreta.`,
    keepTogether: true,
    list: {
      buttonText: 'Continuar',
      title: 'Opções',
      description: 'Escolha:',
      footer: '',
      sections: [
        {
          title: 'Próximo passo',
          rows: [
            { rowId: '1', title: 'Agendar consulta', description: 'Avaliação do caso' },
            { rowId: 'menu', title: 'Menu principal', description: 'Voltar' },
          ],
        },
      ],
    },
  };
}

export function tplClientExisting(): RichMessage {
  return {
    text:
      `*Cliente do escritório*\n` +
      `Informe seu *nome completo* e o *número do processo* (se tiver).\n` +
      `Um responsável retorna com o andamento. Para urgência, escolha *Falar com advogado*.`,
    keepTogether: true,
  };
}

export function tplLocation(): RichMessage {
  const address =
    process.env.BUSINESS_ADDRESS ||
    'Endereço conforme combinado na consulta (presencial ou online).';
  return {
    text:
      `*Local e horários* — ${company()}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `${address}\n\n` +
      `Atendimento: seg–sex, horário comercial (consultas sob agendamento).\n` +
      `Também realizamos reuniões online quando combinado.`,
    keepTogether: true,
    list: {
      buttonText: 'Continuar',
      title: 'Opções',
      description: 'Escolha:',
      footer: '',
      sections: [
        {
          title: 'Próximo passo',
          rows: [
            { rowId: '1', title: 'Agendar consulta', description: 'Marcar horário' },
            { rowId: 'menu', title: 'Menu principal', description: 'Voltar' },
          ],
        },
      ],
    },
  };
}

export function tplHandoff(): RichMessage {
  return {
    text:
      `*Atendimento humano*\n` +
      `Encaminhando para um advogado do ${company()}.\n` +
      `Se for urgente, descreva em uma frase o ocorrido enquanto aguarda.`,
    keepTogether: true,
  };
}

export function tplAskName(): RichMessage {
  return {
    text: 'Para iniciar a triagem, qual o seu *nome completo*?',
    keepTogether: true,
  };
}

export function tplAskArea(name: string): RichMessage {
  const first = (name || '').split(' ')[0] || '';
  const intro = `${first ? first + ', ' : ''}qual a *área* mais próxima do seu caso?`;
  return {
    text: intro,
    intro,
    keepTogether: true,
    list: {
      buttonText: 'Escolher área',
      title: 'Área do direito',
      description: 'Selecione:',
      footer: '',
      sections: [
        {
          title: 'Áreas',
          rows: [
            { rowId: '1', title: 'Cível / contratos', description: 'Ações, cobranças, danos' },
            { rowId: '2', title: 'Família', description: 'Divórcio, pensão, guarda' },
            { rowId: '3', title: 'Trabalhista', description: 'CLT, rescisão, verbas' },
            { rowId: '4', title: 'Consumidor', description: 'Produto, banco, plano' },
            { rowId: '5', title: 'Empresarial', description: 'Empresa, sócios, contratos' },
            { rowId: '6', title: 'Outra / não sei', description: 'Descrevo depois' },
          ],
        },
      ],
    },
  };
}

export function tplAskBrief(): RichMessage {
  return {
    text:
      'Em *poucas frases*, o que aconteceu e o que você busca (ex.: orientações, ação, defesa, acordo)?\n' +
      '_Não envie senhas nem dados bancários completos neste chat._',
    keepTogether: true,
  };
}

export function tplAskUrgency(): RichMessage {
  const intro = 'Qual a *urgência* do seu caso?';
  return {
    text: intro,
    intro,
    keepTogether: true,
    list: {
      buttonText: 'Urgência',
      title: 'Prioridade',
      description: 'Selecione:',
      footer: '',
      sections: [
        {
          title: 'Urgência',
          rows: [
            { rowId: '1', title: 'Alta (hoje/amanhã)', description: 'Prazo curto ou risco' },
            { rowId: '2', title: 'Média (esta semana)', description: 'Preciso avançar logo' },
            { rowId: '3', title: 'Normal', description: 'Posso aguardar retorno' },
          ],
        },
      ],
    },
  };
}

export function tplAskSlot(): RichMessage {
  return {
    text: 'Qual o *melhor dia e período* para a consulta? (ex.: quinta à tarde, ou online)',
    keepTogether: true,
  };
}

export function tplCompleted(p: {
  name: string;
  area: string;
  urgency: string;
  slot: string;
}): RichMessage {
  const first = (p.name || 'cliente').split(' ')[0];
  return {
    text:
      `*Triagem registrada* — ${company()}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `Olá, ${first}. Recebemos sua solicitação:\n\n` +
      `• Área: *${p.area}*\n` +
      `• Urgência: *${p.urgency}*\n` +
      `• Preferência: *${p.slot}*\n\n` +
      `Um advogado entrará em contato para confirmar a consulta e os próximos documentos.\n` +
      `_Esta conversa não substitui parecer jurídico formal._`,
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
            { rowId: 'menu', title: 'Menu principal', description: 'Voltar' },
            { rowId: '5', title: 'Falar com advogado', description: 'Urgente' },
          ],
        },
      ],
    },
  };
}

export function tplGenericError(): RichMessage {
  return {
    text: 'Não compreendi. Por favor, responda novamente ou digite *menu*.',
    keepTogether: true,
  };
}
