import type { NicheTemplate } from '../types.js';

/** Template Teron — Assistente Comercial Teron OS & Workspace */
export const teronNiche: NicheTemplate = {
  id: 'teron',
  name: 'Teron - Assistente Comercial',
  description:
    'Atendimento comercial, automação de WhatsApp, suporte e onboarding integrado ao Teron OS.',
  persona: {
    name: process.env.ASSISTANT_NAME || 'Teron Bot',
    role: 'Assistente Comercial',
    tone: 'amigavel',
    companyName: process.env.COMPANY_NAME || 'Teron OS',
    companyDescription:
      process.env.COMPANY_DESCRIPTION ||
      'Plataforma de automação comercial, gestão de ordens de serviço, leads e projetos.',
    boundaries: [
      'Não promete valores finais sem qualificação prévia do projeto',
      'Não divulga informações de outros clientes',
      'Não pede senhas ou chaves privadas de acesso',
    ],
    goals: [
      'Apresentar soluções da Teron (Teron OS, automação WhatsApp, Workspace)',
      'Qualificar interessados e coletar dados do lead/projeto',
      'Agendar demonstrações ou reuniões de alinhamento',
      'Transferir para um especialista humano quando necessário',
    ],
    greeting:
      'Olá! 👋 Eu sou o {name}, assistente da {company}. Como posso ajudar seu negócio hoje?',
    farewell: 'Qualquer dúvida sobre a Teron, estou à disposição! Abraços. 🙌',
    handoffMessage:
      'Vou te conectar com um consultor especialista da Teron. Um momento! 👤',
    systemPrompt: undefined,
  },
  intents: [
    {
      id: 'greeting',
      keywords: ['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'hey', 'e ai', 'e aí'],
      priority: 10,
      reply: {
        replies: [
          'Olá! 👋 Seja bem-vindo à *Teron OS*! Me chamo {name}. Como posso te ajudar hoje?',
          'Oi! Tudo bem? Sou o {name}, assistente comercial da Teron. Me conta o que seu negócio precisa! 😊',
        ],
        exclusive: true,
      },
    },
    {
      id: 'teron_os',
      keywords: ['teron os', 'teron', 'sistema', 'plataforma', 'workspace', 'ordem de serviço', 'os', 'módulos'],
      priority: 15,
      reply: {
        replies: [
          'A *Teron OS* é nossa solução completa de gestão comercial, controle de ordens de serviço, workspace de clientes e automação do WhatsApp. Quer agendar uma demonstração rápida?',
        ],
        exclusive: true,
      },
    },
    {
      id: 'price',
      keywords: ['preço', 'preco', 'valor', 'quanto custa', 'planos', 'orçamento', 'orcamento', 'tabela'],
      priority: 15,
      reply: {
        replies: [
          'Nossos planos são personalizados de acordo com os módulos que sua empresa precisa (Teron OS, WhatsApp Agente, Workspace). Qual a principal necessidade da sua empresa hoje?',
        ],
        exclusive: false,
        captureField: 'interest',
      },
    },
    {
      id: 'human',
      keywords: ['atendente', 'humano', 'consultor', 'falar com alguém', 'falar com alguem', 'especialista', 'suporte'],
      priority: 20,
      reply: {
        replies: [
          'Com certeza! Vou te conectar com um consultor da Teron. Um momento! 👤',
        ],
        exclusive: true,
        nextState: 'human_handoff',
      },
    },
    {
      id: 'schedule',
      keywords: ['agendar', 'demo', 'demonstração', 'demonstracao', 'reunião', 'reuniao', 'apresentação', 'apresentacao'],
      priority: 18,
      reply: {
        replies: [
          'Ótimo! Vamos agendar uma apresentação da Teron OS. Qual dia e período (manhã/tarde) fica melhor pra você?',
        ],
        exclusive: true,
        nextState: 'flow:agendamento',
      },
    },
  ],
  flows: [
    {
      id: 'agendamento',
      name: 'Agendamento de Demonstração',
      triggerIntentIds: ['schedule'],
      steps: [
        {
          id: 'ask_name',
          message: 'Para agendarmos a demonstração, me diz o seu nome e o nome da sua empresa:',
          captureField: 'name',
          next: 'ask_time',
        },
        {
          id: 'ask_time',
          message: 'Obrigado! Qual dia e horário preferido?',
          captureField: 'preferred_time',
          next: 'done',
        },
        {
          id: 'done',
          message: 'Perfeito! ✅ Agendamento anotado. Um consultor da Teron entrará em contato para confirmar.',
          end: true,
        },
      ],
    },
  ],
  faq: [
    {
      id: 'integrations',
      questions: ['integração', 'integracao', 'api', 'whatsapp', 'sistema'],
      answer:
        'A Teron se integra com WhatsApp, Teron OS, webhooks e APIs de pagamento para automatizar seus processos.',
    },
  ],
  businessHours: undefined,
};
