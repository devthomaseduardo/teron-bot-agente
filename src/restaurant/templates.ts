import type { RichMessage } from '../messaging/types.js';

const company = () => process.env.COMPANY_NAME || 'Restaurante';
const bot = () => process.env.ASSISTANT_NAME || 'Leo';
const menuUrl = () => process.env.MENU_URL || '';

export function tplRestMenu(): RichMessage {
  const intro =
    `Oi! Sou ${bot()} do *${company()}* 🍽️\n` +
    `Reserva, cardápio ou delivery — o que prefere?`;
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
            { rowId: '1', title: 'Reservar mesa', description: 'Salão' },
            { rowId: '2', title: 'Cardápio', description: 'Pratos e destaques' },
            { rowId: '3', title: 'Delivery', description: 'Pedido para entrega' },
            { rowId: '4', title: 'Horários e endereço', description: 'Como chegar' },
            { rowId: '5', title: 'Falar com a casa', description: 'Humano' },
          ],
        },
      ],
    },
  };
}

export function tplAskPeople(): RichMessage {
  return { text: 'Reserva para *quantas pessoas*?', keepTogether: true };
}

export function tplAskWhen(): RichMessage {
  return { text: 'Qual *dia e horário*? (ex.: sexta 20h)', keepTogether: true };
}

export function tplAskRestName(): RichMessage {
  return { text: 'Nome para a *reserva*?', keepTogether: true };
}

export function tplRestDone(p: { name: string; people: string; when: string }): RichMessage {
  return {
    text:
      `*Reserva solicitada* — ${company()}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `• Nome: *${p.name}*\n` +
      `• Pessoas: *${p.people}*\n` +
      `• Quando: *${p.when}*\n\n` +
      `Confirmamos a mesa conforme disponibilidade e te avisamos. ` +
      `Em caso de atraso, avise — ajudamos a segurar a mesa com boa-fé.`,
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
            { rowId: '2', title: 'Ver cardápio' },
            { rowId: 'menu', title: 'Menu principal' },
          ],
        },
      ],
    },
  };
}

export function tplCardapio(): RichMessage {
  const link = menuUrl();
  return {
    text:
      link
        ? `Cardápio: ${link}\nQuer *reservar mesa* ou *delivery*?`
        : `Peça o cardápio atualizado à equipe ou digite *reservar* / *delivery*.\n` +
          `(Configure MENU_URL no .env para enviar o link automático.)`,
    keepTogether: true,
  };
}

export function tplDelivery(): RichMessage {
  return {
    text:
      `*Delivery* — me diga o *bairro* e o que deseja pedir.\n` +
      `Confirmamos área de entrega e tempo estimado. ` +
      `(Pedidos grandes podem ser confirmados pela casa.)`,
    keepTogether: true,
  };
}

export function tplRestLocation(): RichMessage {
  const addr = process.env.BUSINESS_ADDRESS || 'Consulte nosso endereço na bio ou com a equipe.';
  return {
    text: `*${company()}*\n${addr}\nHorário de funcionamento conforme a casa (feriados podem mudar).`,
    keepTogether: true,
  };
}

export function tplHandoff(): RichMessage {
  return {
    text: `Chamando a equipe do *${company()}*. Um instante.`,
    keepTogether: true,
  };
}

export function tplError(): RichMessage {
  return { text: 'Não entendi. Digite de novo ou *menu*.', keepTogether: true };
}
