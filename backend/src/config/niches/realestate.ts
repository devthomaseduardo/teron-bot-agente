import type { NicheTemplate } from '../types.js';
import { genericNiche } from './generic.js';

/** Imobiliária / corretagem */
export const realestateNiche: NicheTemplate = {
  ...genericNiche,
  id: 'realestate',
  name: 'Imobiliária',
  description: 'Corretor virtual: captação, qualificação e agendamento de visitas.',
  persona: {
    ...genericNiche.persona,
    name: process.env.ASSISTANT_NAME || 'Marina',
    role: 'sales',
    companyName: process.env.COMPANY_NAME || 'Prime Imóveis',
    companyDescription:
      'Imobiliária especializada em venda e locação residencial e comercial.',
    goals: [
      'Entender se é compra, venda ou aluguel',
      'Qualificar orçamento e região',
      'Agendar visita',
      'Passar para corretor humano quando quente',
    ],
    greeting:
      'Olá! Sou {name}, consultora da {company}. Busca comprar, alugar ou anunciar um imóvel?',
  },
  intents: [
    ...genericNiche.intents,
    {
      id: 'buy_property',
      keywords: ['comprar', 'compra', 'quero um imóvel', 'quero um imovel', 'apartamento', 'casa'],
      priority: 16,
      reply: {
        replies: [
          'Ótimo! Para te indicar as melhores opções: é compra ou aluguel? Qual bairro/cidade e faixa de valor?',
        ],
        exclusive: true,
        nextState: 'flow:busca_imovel',
      },
    },
    {
      id: 'rent',
      keywords: ['alugar', 'aluguel', 'locação', 'locacao'],
      priority: 16,
      reply: {
        replies: [
          'Perfeito. Para locação: quantos quartos, bairro preferido e valor aproximado de aluguel?',
        ],
        exclusive: true,
        nextState: 'flow:busca_imovel',
      },
    },
    {
      id: 'visit',
      keywords: ['visitar', 'visita', 'conhecer o imóvel', 'conhecer o imovel'],
      priority: 17,
      reply: {
        replies: [
          'Podemos agendar uma visita! Qual seu nome e qual período fica melhor?',
        ],
        exclusive: true,
        nextState: 'flow:agendamento',
      },
    },
  ],
  flows: [
    {
      id: 'busca_imovel',
      name: 'Qualificação imobiliária',
      triggerIntentIds: ['buy_property', 'rent'],
      steps: [
        {
          id: 'type',
          message: 'É para comprar ou alugar?',
          captureField: 'deal_type',
          next: 'region',
        },
        {
          id: 'region',
          message: 'Qual cidade/bairro você prefere?',
          captureField: 'region',
          next: 'budget',
        },
        {
          id: 'budget',
          message: 'Qual a faixa de valor aproximada?',
          captureField: 'budget',
          next: 'name',
        },
        {
          id: 'name',
          message: 'E qual o seu nome para eu registrar a busca?',
          captureField: 'name',
          next: 'done',
        },
        {
          id: 'done',
          message:
            'Pronto, {name}! Busca: {deal_type} em {region}, orçamento {budget}. Vou separar opções e um corretor te chama em breve 🏠',
          end: true,
        },
      ],
    },
    ...genericNiche.flows,
  ],
  faq: [
    {
      id: 'docs_rent',
      questions: ['documentos para alugar', 'o que preciso para alugar'],
      answer:
        'Em geral: RG/CPF, comprovante de renda e referências. Pode haver fiador, caução ou seguro fiança — te oriento no caso a caso.',
    },
  ],
};
