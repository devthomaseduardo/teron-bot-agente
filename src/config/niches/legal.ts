import type { NicheTemplate } from '../types.js';

/**
 * Escritório de advocacia / consultoria jurídica
 * NICHE_ID=legal  (aliases: lawyer, advogado, advocacia)
 */
export const legalNiche: NicheTemplate = {
  id: 'legal',
  name: 'Escritório Jurídico',
  description:
    'Recepção jurídica: áreas de atuação, triagem de caso, agendamento de consulta e encaminhamento ao advogado.',
  persona: {
    name: process.env.ASSISTANT_NAME || 'Helena',
    role: 'secretary',
    tone: 'formal',
    companyName: process.env.COMPANY_NAME || 'Escritório Jurídico',
    companyDescription:
      process.env.COMPANY_DESCRIPTION ||
      'Atendimento jurídico com triagem inicial, orientação de áreas e agendamento de consulta.',
    boundaries: [
      'Não presta consultoria jurídica definitiva pelo chat',
      'Não garante resultado de processo',
      'Não solicita senhas, dados bancários completos ou documentos sigilosos desnecessários no primeiro contato',
      'Casos urgentes (prisão, violência): orienta procurar autoridade / plantão competente',
    ],
    goals: [
      'Triagem rápida do caso',
      'Identificar área do direito',
      'Agendar consulta',
      'Capturar lead qualificado para o advogado',
    ],
    greeting:
      'Olá. Sou {name}, do {company}. Posso ajudar com informações sobre áreas de atuação ou agendamento de consulta.',
    farewell: 'Agradecemos o contato. Estamos à disposição.',
    handoffMessage:
      'Vou encaminhar você a um advogado do escritório para atendimento personalizado.',
  },
  intents: [
    {
      id: 'greeting',
      keywords: ['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'menu', '0'],
      priority: 10,
      reply: {
        replies: [
          'Olá. Sou a assistente do escritório. Digite *menu* para ver as opções ou *consulta* para agendar.',
        ],
        exclusive: true,
      },
    },
    {
      id: 'emergency',
      keywords: ['preso', 'prisão', 'prisao', 'flagrante', 'violência', 'violencia', 'ameaça', 'ameaca', 'plantão', 'plantao'],
      priority: 100,
      reply: {
        replies: [
          'Situações urgentes exigem atendimento imediato. Se houver risco à integridade, procure a autoridade policial ou o plantão judiciário da sua comarca. Posso registrar seu contato para um advogado retornar com prioridade — diga *urgente* e seu nome.',
        ],
        exclusive: true,
      },
    },
  ],
  flows: [],
  faq: [
    {
      id: 'areas',
      questions: ['quais áreas', 'o que vocês atendem', 'trabalham com'],
      answer:
        'Atendemos as principais áreas (cível, família, trabalhista, consumidor, empresarial e outras conforme o escritório). Informe o tema do seu caso que eu oriento o próximo passo.',
    },
    {
      id: 'documents',
      questions: ['documentos', 'o que levar', 'preciso levar'],
      answer:
        'Para a primeira consulta, leve documento com foto e, se tiver, contratos, notificações ou decisões relacionadas ao caso. O advogado indicará o restante.',
    },
  ],
  businessHours: undefined,
};
