import type { RichMessage } from '../messaging/types.js';

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const CONFIRMATIONS = ['Excelente!', 'Perfeito!', 'Registrado.', 'Entendido.', 'Anotado.'];

export function getRandomConfirmation(): string {
  return randomChoice(CONFIRMATIONS);
}

export function tplTeronMenu(botName = 'Teron Bot'): RichMessage {
  const intro =
    `Olá! Bem-vindo ao atendimento digital Teron OS 🏢\n` +
    `Como podemos impulsionar o seu projeto hoje?`;

  return {
    text: intro,
    intro,
    modalOnly: true,
    keepTogether: true,
    list: {
      buttonText: 'Clique Aqui 👈',
      title: 'Opções',
      description: 'Escolha uma das opções abaixo:',
      footer: '',
      sections: [
        {
          title: 'Selecione uma opção:',
          rows: [
            { rowId: '1', title: 'Quero um orçamento', description: 'Elabore sua proposta B2B em minutos' },
            { rowId: '2', title: 'Já sou cliente', description: 'Acesse o Workspace & Suporte Técnico' },
            { rowId: '3', title: 'Prazos e valores', description: 'Consulte estimativas e modalidades' },
            { rowId: '4', title: 'Falar com o time', description: 'Atendimento direto com especialista' },
            { rowId: '5', title: 'Agendar uma call', description: 'Reunião de alinhamento estratégico' },
            { rowId: '6', title: 'Acessar o site', description: 'Plataforma oficial Teron OS' },
          ],
        },
      ],
    },
  };
}

export function tplAskStep1FirstName(): RichMessage {
  return {
    text: 'Para iniciarmos seu atendimento, qual o seu primeiro nome?',
    keepTogether: true,
  };
}

export function tplAskStep2CompanyName(name: string): RichMessage {
  const ack = randomChoice(['Excelente', 'Perfeito', 'Prazer', 'Ótimo']);
  const first = (name || '').split(' ')[0];
  const greeting = first ? `${ack}, ${first}!` : `${ack}!`;
  return {
    text: `${greeting} E qual o nome da sua empresa?`,
    keepTogether: true,
  };
}

export function tplAskStep3Email(): RichMessage {
  const ack = getRandomConfirmation();
  return {
    text: `${ack}\n\nQual o seu e-mail corporativo para envio da proposta?`,
    keepTogether: true,
  };
}

export function tplAskStep4City(): RichMessage {
  const ack = randomChoice(['Registrado.', 'Excelente.', 'Entendido.']);
  return {
    text: `${ack}\n\nEm qual cidade e estado fica a sede da sua empresa?`,
    keepTogether: true,
  };
}

export function tplAskStep5Website(): RichMessage {
  const ack = randomChoice(['Perfeito.', 'Excelente.', 'Anotado.']);
  return {
    text: `${ack}\n\nA empresa possui site oficial ou Instagram? (Caso não possua, basta responder "não")`,
    keepTogether: true,
  };
}

export function tplAskStep6ProjectType(): RichMessage {
  const ack = getRandomConfirmation();
  const intro = `${ack}\n\nQual a modalidade de solução desejada para o seu projeto? Selecione uma opção:`;
  return {
    text: intro,
    intro,
    modalOnly: false,
    keepTogether: true,
    list: {
      buttonText: 'Clique Aqui 👈',
      title: 'Opções',
      description: 'Escolha uma das opções abaixo:',
      footer: '',
      sections: [
        {
          title: 'Modalidade de Solução',
          rows: [
            { rowId: '1', title: 'Landing Page', description: 'Página de alta conversão & performance' },
            { rowId: '2', title: 'Portal / Web App', description: 'Plataforma web B2B com banco de dados' },
            { rowId: '3', title: 'Automação WhatsApp & OS', description: 'Robô de atendimento & integração OS' },
            { rowId: '4', title: 'Sistema Sob Medida / Outro', description: 'Arquitetura de software personalizada' },
          ],
        },
      ],
    },
  };
}

export function tplAskStep7ProjectDetails(): RichMessage {
  const ack = randomChoice(['Perfeito!', 'Excelente!', 'Entendido!']);
  return {
    text: `${ack}\n\nDescreva brevemente os objetivos e requisitos principais do projeto (briefing).`,
    keepTogether: true,
  };
}

export function tplAskStep8Deadline(): RichMessage {
  const ack = randomChoice(['Registrado!', 'Excelente!', 'Anotado!']);
  const intro = `${ack}\n\nPara finalizar: qual o seu horizonte de prazo em mente para entrega? Selecione uma opção:`;
  return {
    text: intro,
    intro,
    modalOnly: false,
    keepTogether: true,
    list: {
      buttonText: 'Clique Aqui 👈',
      title: 'Opções',
      description: 'Escolha uma das opções abaixo:',
      footer: '',
      sections: [
        {
          title: 'Horizonte de Prazo',
          rows: [
            { rowId: '1', title: 'Até 15 dias (Urgente)', description: 'Sprint de desenvolvimento rápido' },
            { rowId: '2', title: 'Até 30 dias (1 mês)', description: 'Entrega padrão com homologação' },
            { rowId: '3', title: '60+ dias (Sem pressa)', description: 'Desenvolvimento em etapas estruturadas' },
            { rowId: '4', title: 'A definir / Orçamento', description: 'Análise prévia de escopo' },
          ],
        },
      ],
    },
  };
}

export function tplTeronCompleted(leadData: { name: string; company: string; proposalUrl?: string }): RichMessage {
  const first = (leadData.name || 'cliente').split(' ')[0];
  const company = leadData.company ? ` (*${leadData.company}*)` : '';
  const proposalUrl = leadData.proposalUrl || 'https://os.thomaseduardo.com.br/';

  const intro =
    `🏢 *TERON OS — PROPOSTA COMERCIAL B2B GERADA*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Tudo pronto, ${first}! Sua solicitação${company} foi processada com sucesso em nossa plataforma.\n\n` +
    `📄 *Sua Proposta Interativa & Ordem de Serviço:*\n` +
    `👉 ${proposalUrl}\n\n` +
    `🔒 *Próximos Passos no Teron OS:*\n` +
    `No link acima você pode revisar o escopo, selecionar módulos adicionais e assinar o contrato digital.`;

  return {
    text: intro,
    intro,
    modalOnly: false,
    keepTogether: true,
    list: {
      buttonText: 'Clique Aqui 👈',
      title: 'Opções',
      description: 'Escolha uma das opções abaixo:',
      footer: '',
      sections: [
        {
          title: 'Ações Disponíveis',
          rows: [
            { rowId: 'status', title: 'Ver status & onboarding', description: 'Orientações de contrato e acesso' },
            { rowId: 'reiniciar', title: 'Reiniciar atendimento', description: 'Iniciar novo orçamento ou consulta' },
            { rowId: 'humano', title: 'Falar com o time', description: 'Conectar com consultor de vendas' },
          ],
        },
      ],
    },
  };
}

export function tplClientInfo(): RichMessage {
  return {
    text:
      `🏢 *TERON WORKSPACE — ÁREA DO CLIENTE*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `Se você já possui um contrato ativo ou conta de cliente Teron OS, acesse seu painel em:\n` +
      `👉 https://os.thomaseduardo.com.br/`,
    keepTogether: true,
    list: {
      buttonText: 'Clique Aqui 👈',
      title: 'Opções',
      description: 'Escolha uma das opções abaixo:',
      footer: '',
      sections: [
        {
          title: 'O que deseja fazer?',
          rows: [
            { rowId: '1', title: 'Quero um orçamento', description: 'Criar novo projeto ou demanda' },
            { rowId: '4', title: 'Falar com o time', description: 'Suporte técnico ou financeiro' },
            { rowId: 'reiniciar', title: 'Menu principal', description: 'Voltar ao início' },
          ],
        },
      ],
    },
  };
}

export function tplPricingInfo(): RichMessage {
  return {
    text:
      `📊 *TERON OS — INVESTIMENTOS & ESCOPOS*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `Trabalhamos com pacotes sob medida para Landing Pages, Portais B2B, Robôs de Atendimento e Plataformas de Gestão.`,
    keepTogether: true,
    list: {
      buttonText: 'Clique Aqui 👈',
      title: 'Opções',
      description: 'Escolha uma das opções abaixo:',
      footer: '',
      sections: [
        {
          title: 'Como prefere avançar?',
          rows: [
            { rowId: '1', title: 'Quero um orçamento', description: 'Gerar proposta personalizada em 2 min' },
            { rowId: '5', title: 'Agendar uma call', description: 'Reunião com especialista de soluções' },
            { rowId: 'reiniciar', title: 'Menu principal', description: 'Voltar ao início' },
          ],
        },
      ],
    },
  };
}

export function tplHandoff(): RichMessage {
  return {
    text:
      `👤 *ATENDIMENTO ESPECIALIZADO TERON*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `Transferindo seu atendimento para um especialista do nosso time corporativo.\n\n` +
      `Um consultor assumirá esta conversa em breve!`,
    keepTogether: true,
  };
}

export function tplScheduleCall(): RichMessage {
  return {
    text:
      `📅 *AGENDAMENTO ESTRATÉGICO — TERON OS*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `Agende uma demonstração ao vivo ou reunião com nossos arquitetos de software:\n` +
      `👉 https://os.thomaseduardo.com.br/`,
    keepTogether: true,
    list: {
      buttonText: 'Clique Aqui 👈',
      title: 'Opções',
      description: 'Escolha uma das opções abaixo:',
      footer: '',
      sections: [
        {
          title: 'Como deseja continuar?',
          rows: [
            { rowId: '1', title: 'Quero um orçamento', description: 'Elaborar proposta prévia' },
            { rowId: 'reiniciar', title: 'Menu principal', description: 'Voltar ao início' },
          ],
        },
      ],
    },
  };
}

export function tplVisitWebsite(): RichMessage {
  return {
    text:
      `🌐 *TERON OS — PLATAFORMA OFICIAL*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `Conheça nosso ecossistema de gestão e automação comercial:\n` +
      `👉 https://os.thomaseduardo.com.br/`,
    keepTogether: true,
    list: {
      buttonText: 'Clique Aqui 👈',
      title: 'Opções',
      description: 'Escolha uma das opções abaixo:',
      footer: '',
      sections: [
        {
          title: 'Como deseja continuar?',
          rows: [
            { rowId: '1', title: 'Quero um orçamento', description: 'Gerar proposta B2B' },
            { rowId: 'reiniciar', title: 'Menu principal', description: 'Voltar ao início' },
          ],
        },
      ],
    },
  };
}

export function tplPosProposta(name: string): RichMessage {
  const first = (name || 'cliente').split(' ')[0];
  const intro =
    `🚀 *ONBOARDING & FORMALIZAÇÃO DE CONTRATO*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Excelente, ${first}! Para dar andamento ao seu projeto:\n\n` +
    `1. *Assinatura Digital:* Digite o código OTP (6 dígitos) enviado ao e-mail para assinar o contrato na proposta.\n` +
    `2. *Confirmação de Entrada:* Realize a entrada de 50% via PIX ou Cartão.\n` +
    `3. *Liberação do Workspace:* Após o pagamento, sua Workstation B2B e repositório serão liberados automaticamente.\n\n` +
    `Portal do Cliente: https://os.thomaseduardo.com.br/`;

  return {
    text: intro,
    intro,
    modalOnly: false,
    keepTogether: true,
    list: {
      buttonText: 'Clique Aqui 👈',
      title: 'Opções',
      description: 'Escolha uma das opções abaixo:',
      footer: '',
      sections: [
        {
          title: 'Como deseja continuar?',
          rows: [
            { rowId: 'reiniciar', title: 'Menu principal', description: 'Voltar ao início' },
            { rowId: 'humano', title: 'Falar com o time', description: 'Falar com suporte corporativo' },
          ],
        },
      ],
    },
  };
}

export function tplEmailError(attempt = 1): RichMessage {
  if (attempt >= 2) {
    return {
      text: 'Por favor, informe um e-mail corporativo válido (exemplo: nome@empresa.com.br).',
      keepTogether: true,
    };
  }
  return {
    text: 'Formato de e-mail não identificado. Verifique se o endereço contém o caractere @ e tente novamente.',
    keepTogether: true,
  };
}

export function tplGenericError(attempt = 1): RichMessage {
  if (attempt >= 2) {
    return {
      text: 'Não compreendemos a resposta. Por favor, tente enviar novamente.',
      keepTogether: true,
    };
  }
  return {
    text: 'Resposta não identificada. Por favor, repita sua resposta.',
    keepTogether: true,
  };
}
