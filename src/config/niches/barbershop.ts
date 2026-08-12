import type { NicheTemplate } from '../types.js';

/** Barbearia — white-label: nome vem do .env do cliente */
export const barbershopNiche: NicheTemplate = {
  id: 'barbershop',
  name: 'Barbearia',
  description:
    'Agendamento completo: serviços, profissionais, horários, PIX, fila e avaliação.',
  persona: {
    name: process.env.ASSISTANT_NAME || 'Alex',
    role: 'assistant',
    tone: 'amigavel',
    companyName: process.env.COMPANY_NAME || 'Barbearia',
    companyDescription:
      process.env.COMPANY_DESCRIPTION ||
      'Barbearia com profissionais, cortes, barba e agendamento pelo WhatsApp.',
    boundaries: [
      'Não inventa horários fora da agenda real',
      'Não confirma valor diferente da tabela configurada',
      'Não promete vaga sem confirmação do fluxo',
    ],
    goals: [
      'Agendar com serviço, profissional, dia e horário',
      'Informar preços e duração',
      'Confirmar reserva e pagamento',
      'Passar endereço e fila do dia',
    ],
    greeting:
      process.env.GREETING ||
      `Olá! Bem-vindo à ${process.env.COMPANY_NAME || 'nossa barbearia'}. Quer agendar, ver preços ou conhecer a equipe?`,
    farewell: 'Valeu! Te esperamos 💈',
    handoffMessage: 'Vou te passar para a recepção 👤',
  },
  intents: [
    {
      id: 'greeting',
      keywords: ['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'menu', '0'],
      priority: 10,
      reply: {
        replies: [
          `Olá! ${process.env.COMPANY_NAME || 'Barbearia'}. Digite *menu* para opções ou *agendar* para marcar horário.`,
        ],
        exclusive: true,
      },
    },
  ],
  flows: [],
  faq: [
    {
      id: 'parking',
      questions: ['estacionamento', 'onde estacionar'],
      answer:
        'Se precisar de estacionamento, pergunte na recepção ou digite *endereço* para a localização.',
    },
  ],
  businessHours: undefined,
};
