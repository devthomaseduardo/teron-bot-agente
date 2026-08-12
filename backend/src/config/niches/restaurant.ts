import type { NicheTemplate } from '../types.js';
import { genericNiche } from './generic.js';

/** Restaurante / delivery */
export const restaurantNiche: NicheTemplate = {
  ...genericNiche,
  id: 'restaurant',
  name: 'Restaurante & Delivery',
  description: 'Cardápio, horários, reservas e pedidos por mensagem.',
  persona: {
    ...genericNiche.persona,
    name: process.env.ASSISTANT_NAME || 'Leo',
    role: 'assistant',
    companyName: process.env.COMPANY_NAME || 'Sabor & Arte',
    companyDescription: 'Restaurante com salão e delivery.',
    goals: ['Informar cardápio', 'Reservar mesa', 'Orientar pedidos', 'Horários'],
    greeting: 'Oi! Sou {name} do {company} 🍽️ Quer cardápio, reserva ou delivery?',
  },
  intents: [
    ...genericNiche.intents.filter((i) => !['buy'].includes(i.id)),
    {
      id: 'menu',
      keywords: ['cardápio', 'cardapio', 'menu', 'pratos', 'promoção', 'promocao'],
      priority: 18,
      reply: {
        replies: [
          'Nosso cardápio completo está aqui: {menuUrl}\nDestaques do dia eu te conto também — quer prato principal, porção ou sobremesa?',
        ],
        exclusive: true,
      },
    },
    {
      id: 'reserve',
      keywords: ['reserva', 'reservar', 'mesa', 'lugares'],
      priority: 18,
      reply: {
        replies: ['Claro! Para quantas pessoas e qual dia/horário?'],
        exclusive: true,
        nextState: 'flow:reserva',
      },
    },
    {
      id: 'delivery',
      keywords: ['delivery', 'entrega', 'pedir', 'pedido', 'ifood'],
      priority: 17,
      reply: {
        replies: [
          'Delivery sim! Me diga o bairro para checar a área e o que deseja pedir 🛵',
        ],
        exclusive: true,
        captureField: 'region',
      },
    },
  ],
  flows: [
    {
      id: 'reserva',
      name: 'Reserva de mesa',
      triggerIntentIds: ['reserve'],
      steps: [
        {
          id: 'people',
          message: 'Para quantas pessoas?',
          captureField: 'party_size',
          next: 'when',
        },
        {
          id: 'when',
          message: 'Qual dia e horário?',
          captureField: 'preferred_slot',
          next: 'name',
        },
        {
          id: 'name',
          message: 'Nome para a reserva?',
          captureField: 'name',
          next: 'done',
        },
        {
          id: 'done',
          message:
            'Reserva solicitada: {name}, {party_size} pessoas, {preferred_slot}. Confirmamos em breve! ✅',
          end: true,
        },
      ],
    },
  ],
  faq: [
    {
      id: 'parking',
      questions: ['estacionamento', 'onde estacionar'],
      answer: 'Temos estacionamento conveniado próximo. Na chegada a equipe te orienta.',
    },
  ],
};
