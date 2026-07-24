import type { RichMessage } from '../messaging/types.js';

const company = () => process.env.COMPANY_NAME || 'Imobiliária';
const bot = () => process.env.ASSISTANT_NAME || 'Marina';

export function tplReMenu(): RichMessage {
  const intro =
    `Olá! Sou ${bot()}, da *${company()}*.\n` +
    `Atendo na hora: busca de imóvel, visita ou anúncio. Como posso ajudar?`;
  return {
    text: intro,
    intro,
    modalOnly: true,
    keepTogether: true,
    list: {
      buttonText: 'Ver opções',
      title: 'Atendimento',
      description: 'Escolha:',
      footer: company(),
      sections: [
        {
          title: 'Menu',
          rows: [
            { rowId: '1', title: 'Quero comprar', description: 'Qualificar busca' },
            { rowId: '2', title: 'Quero alugar', description: 'Locação' },
            { rowId: '3', title: 'Agendar visita', description: 'Conhecer imóvel' },
            { rowId: '4', title: 'Anunciar meu imóvel', description: 'Venda ou locação' },
            { rowId: '5', title: 'Falar com corretor', description: 'Atendimento humano' },
            { rowId: '6', title: 'Documentos / FAQ', description: 'Aluguel e compra' },
          ],
        },
      ],
    },
  };
}

export function tplAskRegion(deal: string): RichMessage {
  return {
    text: `Perfeito — *${deal}*.\nQual *cidade e bairro* você prefere?`,
    keepTogether: true,
  };
}

export function tplAskRooms(): RichMessage {
  const intro = 'Quantos *quartos* (ou tipo: studio, comercial)?';
  return {
    text: intro,
    intro,
    keepTogether: true,
    list: {
      buttonText: 'Quartos',
      title: 'Tipo',
      description: 'Selecione:',
      footer: '',
      sections: [
        {
          title: 'Quartos',
          rows: [
            { rowId: '1', title: '1 quarto / studio' },
            { rowId: '2', title: '2 quartos' },
            { rowId: '3', title: '3 quartos' },
            { rowId: '4', title: '4+ quartos' },
            { rowId: '5', title: 'Comercial / outro' },
          ],
        },
      ],
    },
  };
}

export function tplAskBudget(deal: string): RichMessage {
  return {
    text:
      deal.includes('Alug')
        ? 'Qual a *faixa de aluguel* mensal aproximada? (ex.: até 2.500)'
        : 'Qual a *faixa de valor* para compra? (ex.: até 450 mil)',
    keepTogether: true,
  };
}

export function tplAskName(): RichMessage {
  return {
    text: 'Qual o seu *nome completo* para eu registrar a busca?',
    keepTogether: true,
  };
}

export function tplAskVisit(): RichMessage {
  return {
    text: 'Quer *agendar visita* a algum imóvel? Informe o melhor *dia e período* (ou digite *depois*).',
    keepTogether: true,
  };
}

export function tplReDone(p: {
  name: string;
  deal: string;
  region: string;
  rooms: string;
  budget: string;
  visit: string;
}): RichMessage {
  const first = (p.name || 'cliente').split(' ')[0];
  return {
    text:
      `*Busca registrada* — ${company()}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `${first}, anotei com cuidado:\n\n` +
      `• Objetivo: *${p.deal}*\n` +
      `• Região: *${p.region}*\n` +
      `• Tipo: *${p.rooms}*\n` +
      `• Orçamento: *${p.budget}*\n` +
      `• Visita: *${p.visit}*\n\n` +
      `Um corretor vai separar opções *compatíveis* e te chamar. ` +
      `Não prometemos imóvel sem conferir disponibilidade real.`,
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
            { rowId: '5', title: 'Falar com corretor', description: 'Agora' },
            { rowId: 'menu', title: 'Menu principal', description: 'Voltar' },
          ],
        },
      ],
    },
  };
}

export function tplListProperty(): RichMessage {
  return {
    text:
      `*Anunciar imóvel* — ${company()}\n` +
      `Me envie em uma mensagem: *tipo* (casa/apto), *bairro*, *valor* e se é *venda ou aluguel*.\n` +
      `Um consultor retorna com a proposta de captação.`,
    keepTogether: true,
  };
}

export function tplDocsFaq(): RichMessage {
  return {
    text:
      `*Documentos (orientação geral)*\n` +
      `• *Alugar:* RG/CPF, renda e referências (fiador, caução ou seguro-fiança conforme o caso).\n` +
      `• *Comprar:* análise de crédito/financiamento e documentação do imóvel com o corretor.\n\n` +
      `Cada operação tem regras próprias — o corretor confirma no seu caso.`,
    keepTogether: true,
    list: {
      buttonText: 'Continuar',
      title: 'Opções',
      description: 'Escolha:',
      footer: '',
      sections: [
        {
          title: 'Próximo',
          rows: [
            { rowId: '1', title: 'Quero comprar' },
            { rowId: '2', title: 'Quero alugar' },
            { rowId: 'menu', title: 'Menu' },
          ],
        },
      ],
    },
  };
}

export function tplHandoff(): RichMessage {
  return {
    text: `Encaminhando para um *corretor* da ${company()}. Se puder, diga o código do imóvel ou o bairro enquanto aguarda.`,
    keepTogether: true,
  };
}

export function tplError(): RichMessage {
  return {
    text: 'Não entendi. Responda de novo ou digite *menu*.',
    keepTogether: true,
  };
}
