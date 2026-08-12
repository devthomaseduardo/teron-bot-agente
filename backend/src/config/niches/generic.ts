import type { NicheTemplate } from '../types.js';

/** Template genérico — base para qualquer negócio */
export const genericNiche: NicheTemplate = {
  id: 'generic',
  name: 'Assistente Comercial Genérico',
  description:
    'Atendente virtual multi-função: recepção, vendas, suporte e agendamento.',
  persona: {
    name: process.env.ASSISTANT_NAME || 'Alex',
    role: 'representative',
    tone: 'amigavel',
    companyName: process.env.COMPANY_NAME || 'Nossa Empresa',
    companyDescription:
      process.env.COMPANY_DESCRIPTION ||
      'Empresa focada em atendimento excelente e resultados para o cliente.',
    boundaries: [
      'Não inventa preços ou prazos sem confirmação',
      'Não discute política ou assuntos polêmicos',
      'Não pede dados sensíveis desnecessários (senha, cartão completo)',
      'Não promete o que a empresa não entrega',
    ],
    goals: [
      'Qualificar o lead',
      'Responder dúvidas frequentes',
      'Agendar contato ou demonstração',
      'Transferir para humano quando necessário',
    ],
    greeting:
      'Olá! 👋 Eu sou {name}, {roleLabel} da {company}. Como posso te ajudar hoje?',
    farewell: 'Foi um prazer te atender! Qualquer coisa, é só chamar. 🙌',
    handoffMessage:
      'Vou te conectar com um especialista humano para te atender melhor. Um momento! 👤',
    systemPrompt: undefined,
  },
  intents: [
    {
      id: 'greeting',
      keywords: [
        'oi',
        'olá',
        'ola',
        'bom dia',
        'boa tarde',
        'boa noite',
        'eae',
        'e aí',
        'hey',
        'hello',
      ],
      priority: 10,
      reply: {
        replies: [
          'Olá! 👋 Eu sou {name}, da {company}. Em que posso te ajudar?',
          'Oi! Tudo bem? Sou {name}, {roleLabel} da {company}. Me conta o que você precisa 😊',
        ],
        exclusive: true,
      },
    },
    {
      id: 'thanks',
      keywords: ['obrigado', 'obrigada', 'valeu', 'vlw', 'agradec'],
      priority: 8,
      reply: {
        replies: [
          'Por nada! Estou por aqui se precisar 😊',
          'Disponha! Qualquer dúvida, é só mandar.',
        ],
        exclusive: true,
      },
    },
    {
      id: 'farewell',
      keywords: ['tchau', 'até logo', 'ate logo', 'flw', 'falou', 'bye'],
      priority: 8,
      reply: {
        replies: [
          'Até logo! Qualquer coisa é só chamar. 🙌',
          'Foi um prazer! Tenha um ótimo dia ✨',
        ],
        exclusive: true,
      },
    },
    {
      id: 'human',
      keywords: [
        'atendente',
        'humano',
        'pessoa',
        'falar com alguém',
        'falar com alguem',
        'gerente',
        'especialista',
      ],
      priority: 20,
      reply: {
        replies: [
          'Claro! Vou te encaminhar para um especialista humano. {handoff}',
        ],
        exclusive: true,
        nextState: 'human_handoff',
      },
    },
    {
      id: 'price',
      keywords: [
        'preço',
        'preco',
        'valor',
        'quanto custa',
        'orçamento',
        'orcamento',
        'tabela',
      ],
      priority: 15,
      reply: {
        replies: [
          'Sobre valores: depende do que você precisa. Me conta um pouco do seu objetivo que eu te oriento com o melhor plano 💼',
        ],
        exclusive: false,
        captureField: 'interest',
      },
    },
    {
      id: 'hours',
      keywords: [
        'horário',
        'horario',
        'funciona',
        'abre',
        'fecha',
        'atendimento',
      ],
      priority: 12,
      reply: {
        replies: [
          'Nosso horário de atendimento é de segunda a sexta, das 08h às 18h. Fora disso eu anoto tudo e retornamos no próximo horário útil ⏰',
        ],
        exclusive: true,
      },
    },
    {
      id: 'location',
      keywords: ['endereço', 'endereco', 'onde fica', 'localização', 'localizacao', 'mapa'],
      priority: 12,
      reply: {
        replies: [
          'Posso te passar nosso endereço e pontos de referência. Você prefere atendimento presencial ou online?',
        ],
        exclusive: true,
      },
    },
    {
      id: 'schedule',
      keywords: [
        'agendar',
        'agendamento',
        'marcar',
        'horário disponível',
        'horario disponivel',
        'reunião',
        'reuniao',
        'demo',
        'demonstração',
        'demonstracao',
      ],
      priority: 18,
      reply: {
        replies: [
          'Perfeito! Vamos agendar. Qual o melhor dia e período (manhã/tarde) pra você?',
        ],
        exclusive: true,
        nextState: 'flow:agendamento',
        captureField: 'interest',
      },
    },
    {
      id: 'buy',
      keywords: [
        'quero comprar',
        'fechar',
        'contratar',
        'assinar',
        'quero sim',
        'vamos fechar',
      ],
      priority: 19,
      reply: {
        replies: [
          'Excelente! Para avançarmos, me passa seu nome completo e a melhor forma de contato (e-mail ou telefone).',
        ],
        exclusive: true,
        nextState: 'flow:qualificacao',
      },
    },
  ],
  flows: [
    {
      id: 'agendamento',
      name: 'Agendamento',
      triggerIntentIds: ['schedule'],
      steps: [
        {
          id: 'ask_name',
          message: 'Para agendar, qual o seu nome?',
          captureField: 'name',
          next: 'ask_when',
        },
        {
          id: 'ask_when',
          message:
            'Obrigado, {name}! Qual dia e período prefere? (ex: terça de manhã)',
          captureField: 'preferred_slot',
          next: 'confirm',
        },
        {
          id: 'confirm',
          message:
            'Anotei: {name} — preferência "{preferred_slot}". Nossa equipe confirma em breve! Precisa de mais alguma coisa?',
          end: true,
        },
      ],
    },
    {
      id: 'qualificacao',
      name: 'Qualificação de lead',
      triggerIntentIds: ['buy', 'price'],
      steps: [
        {
          id: 'ask_name',
          message: 'Legal! Qual o seu nome?',
          captureField: 'name',
          next: 'ask_need',
        },
        {
          id: 'ask_need',
          message: 'Prazer, {name}! Me conta em 1 frase o que você mais precisa agora.',
          captureField: 'need',
          next: 'ask_contact',
        },
        {
          id: 'ask_contact',
          message:
            'Perfeito. Qual e-mail ou WhatsApp preferido para te enviar a proposta?',
          captureField: 'contact',
          next: 'done',
        },
        {
          id: 'done',
          message:
            'Recebi tudo, {name}! ✅ Vou repassar para o time comercial com sua necessidade: "{need}". Retorno em breve.',
          end: true,
        },
      ],
    },
  ],
  faq: [
    {
      id: 'what_you_do',
      questions: [
        'o que vocês fazem',
        'o que voces fazem',
        'quais serviços',
        'quais servicos',
        'como funciona',
      ],
      answer:
        'Somos a {company}. {companyDescription} Posso te explicar planos, prazos e próximos passos — o que te interessa mais?',
    },
    {
      id: 'payment',
      questions: ['formas de pagamento', 'pix', 'cartão', 'cartao', 'boleto', 'parcel'],
      answer:
        'Aceitamos as principais formas de pagamento (Pix, cartão e boleto, conforme o plano). Quer que eu te oriente no melhor formato pro seu caso?',
    },
  ],
  // Sem bloqueio de horário por padrão — responde 24h (melhor p/ WhatsApp)
  // Para limitar, defina businessHours em config/business.json
  businessHours: undefined,
};
