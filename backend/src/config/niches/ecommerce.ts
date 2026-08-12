import type { NicheTemplate } from '../types.js';
import { genericNiche } from './generic.js';

/** E-commerce / loja */
export const ecommerceNiche: NicheTemplate = {
  ...genericNiche,
  id: 'ecommerce',
  name: 'E-commerce & Loja',
  description: 'Pós-venda, status de pedido, trocas e dúvidas de produto.',
  persona: {
    ...genericNiche.persona,
    name: process.env.ASSISTANT_NAME || 'Bia',
    role: 'support',
    companyName: process.env.COMPANY_NAME || 'Loja Online',
    companyDescription: 'Loja com vendas online e suporte ao cliente.',
    goals: [
      'Tirar dúvidas de produto',
      'Status de pedido',
      'Trocas e devoluções',
      'Gerar venda qualificada',
    ],
    greeting: 'Oi! Sou {name}, da {company}. Precisa de produto, pedido ou troca?',
  },
  intents: [
    ...genericNiche.intents,
    {
      id: 'order_status',
      keywords: ['pedido', 'rastreio', 'rastreamento', 'onde está', 'onde esta', 'código'],
      priority: 18,
      reply: {
        replies: [
          'Claro! Me envia o número do pedido ou o e-mail da compra que eu te oriento no status 📦',
        ],
        exclusive: true,
        captureField: 'order_id',
        nextState: 'awaiting_order',
      },
    },
    {
      id: 'exchange',
      keywords: ['troca', 'devolver', 'devolução', 'devolucao', 'reembolso'],
      priority: 17,
      reply: {
        replies: [
          'Para troca/devolução: em geral até 7 dias após o recebimento, produto sem uso. Me passa o nº do pedido que eu te guio no passo a passo.',
        ],
        exclusive: true,
        captureField: 'order_id',
      },
    },
    {
      id: 'shipping',
      keywords: ['frete', 'prazo de entrega', 'entrega', 'cep'],
      priority: 15,
      reply: {
        replies: [
          'O frete e prazo dependem do CEP. Me manda seu CEP e o produto de interesse 🚚',
        ],
        exclusive: true,
        captureField: 'cep',
      },
    },
  ],
  flows: genericNiche.flows,
  faq: [
    {
      id: 'warranty',
      questions: ['garantia', 'defeito'],
      answer:
        'Produtos têm garantia legal e, quando aplicável, garantia do fabricante. Me diga o produto e o problema que eu abro o protocolo certo.',
    },
  ],
};
