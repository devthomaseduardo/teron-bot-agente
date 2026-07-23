import type { RichMessage } from '../messaging/types.js';

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const CONFIRMATIONS = ['Show!', 'Legal!', 'Entendi!', 'Bacana!', 'Anotado.'];

export function getRandomConfirmation(): string {
  return randomChoice(CONFIRMATIONS);
}

export function tplTeronMenu(botName = 'Teron Bot', companyName = 'Teron OS'): RichMessage {
  const intro =
    `Oi! Tudo certo? Aqui é o ${botName} do ${companyName} 🙂\n` +
    `Me conta rapidinho o que você precisa:\n\n` +
    `1 - Quero um orçamento\n` +
    `2 - Já sou cliente\n` +
    `3 - Prazos e valores\n` +
    `4 - Falar com alguém do time`;

  return {
    text: intro,
    intro,
    modalOnly: false,
    keepTogether: true,
    list: {
      buttonText: 'Clique Aqui 👈',
      title: 'Teron OS',
      description: 'Escolha uma opção:',
      footer: 'Teron OS & Workspace',
      sections: [
        {
          title: 'Como podemos ajudar?',
          rows: [
            { rowId: '1', title: '1 · Quero um orçamento' },
            { rowId: '2', title: '2 · Já sou cliente' },
            { rowId: '3', title: '3 · Prazos e valores' },
            { rowId: '4', title: '4 · Falar com o time' },
          ],
        },
      ],
    },
  };
}

export function tplAskStep1NameCompany(): RichMessage {
  return {
    text: 'Pra começar, me diz seu nome e o nome da empresa?',
    keepTogether: true,
  };
}

export function tplAskStep2EmailCity(name: string): RichMessage {
  const ack = randomChoice(['Show', 'Legal', 'Bacana']);
  const first = (name || '').split(' ')[0];
  const greeting = first ? `${ack}, ${first}!` : `${ack}!`;
  return {
    text: `${greeting} Me passa seu e-mail e a cidade da empresa, por favor?`,
    keepTogether: true,
  };
}

export function tplAskStep3ProjectType(): RichMessage {
  const ack = getRandomConfirmation();
  const intro = `${ack}\n\nE que tipo de projeto você tem em mente? Escolha uma das opções abaixo:`;
  return {
    text: intro,
    intro,
    modalOnly: false,
    keepTogether: true,
    list: {
      buttonText: 'Clique Aqui 👈',
      title: 'Tipo de Projeto',
      description: 'Selecione a opção do seu projeto:',
      footer: 'Teron OS',
      sections: [
        {
          title: 'Tipos de Projeto',
          rows: [
            { rowId: '1', title: '1 · Landing Page' },
            { rowId: '2', title: '2 · Portal / Web App' },
            { rowId: '3', title: '3 · Automação WhatsApp & OS' },
            { rowId: '4', title: '4 · Sistema Sob Medida / Outro' },
          ],
        },
      ],
    },
  };
}

export function tplAskStep4ProjectDetails(): RichMessage {
  const ack = randomChoice(['Perfeito!', 'Boa!', 'Entendido!']);
  return {
    text: `${ack}\n\nMe conta um pouco mais do que você imagina pro projeto.`,
    keepTogether: true,
  };
}

export function tplAskStep5Deadline(): RichMessage {
  const ack = randomChoice(['Anotado!', 'Legal!', 'Show!']);
  const intro = `${ack}\n\nÚltima coisa: você tem algum prazo em mente pra entrega? Selecione uma opção:`;
  return {
    text: intro,
    intro,
    modalOnly: false,
    keepTogether: true,
    list: {
      buttonText: 'Clique Aqui 👈',
      title: 'Prazo do Projeto',
      description: 'Selecione a expectativa de prazo:',
      footer: 'Teron OS',
      sections: [
        {
          title: 'Expectativa de Prazo',
          rows: [
            { rowId: '1', title: '1 · Até 15 dias (Urgente)' },
            { rowId: '2', title: '2 · Até 30 dias (1 mês)' },
            { rowId: '3', title: '3 · 60+ dias (Sem pressa)' },
            { rowId: '4', title: '4 · A definir / Orçamento' },
          ],
        },
      ],
    },
  };
}

export function tplTeronCompleted(leadData: { name: string; company: string; proposalUrl?: string }): RichMessage {
  const first = (leadData.name || 'parceiro').split(' ')[0];
  const company = leadData.company ? ` da *${leadData.company}*` : '';
  const urlMsg = leadData.proposalUrl
    ? `\n\n📄 *Sua Ordem de Serviço & Proposta Interativa foi gerada com sucesso!*\nPara visualizar a proposta, selecionar pacotes e assinar o contrato, acesse:\n👉 ${leadData.proposalUrl}`
    : '';

  return {
    text:
      `Tudo gravado, ${first}! 🎉\n\n` +
      `Sua solicitação${company} foi registrada com sucesso no Teron OS.${urlMsg}\n\n` +
      `Um de nossos especialistas acompanhará a sua proposta. Qualquer dúvida, é só chamar por aqui!`,
    keepTogether: true,
  };
}

export function tplClientInfo(): RichMessage {
  return {
    text:
      `Que legal! Se você já é cliente Teron OS, pode acessar o seu Workspace ou falar com nosso suporte técnico.\n\n` +
      `Digite *4* se quiser falar diretamente com um consultor ou suporte humano!`,
    keepTogether: true,
  };
}

export function tplPricingInfo(): RichMessage {
  return {
    text:
      `Nossos prazos e valores variam de acordo com o escopo (Teron OS, automações WhatsApp, portal ou sistema sob medida).\n\n` +
      `Quer montar um orçamento rápido? Digite *1* ou clique em *Quero um orçamento*!`,
    keepTogether: true,
  };
}

export function tplHandoff(): RichMessage {
  return {
    text: `Sem problemas! Vou te conectar com um especialista do time Teron 👤\n\nAlguém do time já te responde por aqui em instantes.`,
    keepTogether: true,
  };
}

export function tplEmailError(attempt = 1): RichMessage {
  if (attempt >= 2) {
    return {
      text: 'Deixa eu ser mais específico: preciso de um e-mail tipo nome@empresa.com — pode mandar assim?',
      keepTogether: true,
    };
  }
  return {
    text: 'Esse e-mail não veio certo aqui — confere se tem o @ direitinho?',
    keepTogether: true,
  };
}

export function tplGenericError(attempt = 1): RichMessage {
  if (attempt >= 2) {
    return {
      text: 'Foi mal, não captei certo — pode repetir?',
      keepTogether: true,
    };
  }
  return {
    text: 'Hmm, não peguei direito 🤔 pode me mandar de novo?',
    keepTogether: true,
  };
}
