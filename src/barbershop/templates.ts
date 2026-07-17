/**
 * Templates — tom de atendente real (leve, humano, direto).
 * Intro curta + modal. Limites WhatsApp respeitados.
 */
import type { RichMessage, MsgListRow } from '../messaging/types.js';
import { card, duration, money } from '../messaging/format.js';
import type { Barber, ServiceItem } from './types.js';
import { loadBarbershop } from './store.js';
import { availableSlots, openDaysWithSlots } from './schedule.js';

const FOOTER = 'Navalha Fina';

function clip(s: string, n: number): string {
  const t = (s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  return t.slice(0, n - 1) + '…';
}

/**
 * Linha do modal: SÓ o texto da opção (title).
 * Descrição do row fica vazia — o contexto vai na mensagem ANTES do modal.
 */
function row(rowId: string, title: string, _description?: string): MsgListRow {
  const cleanTitle = String(title || '')
    .replace(/^\d{1,2}\s*[·.\-)]\s*/, '')
    .trim();
  return {
    rowId: String(rowId),
    title: clip(cleanTitle, 24) || 'Opção',
    // sem description = lista limpa, só opção
  };
}

/**
 * Sempre: mensagem de texto (intro) + modal com opções puras.
 * modalOnly=false → rich-sender manda a bolha de texto antes da lista.
 */
function withList(
  list: NonNullable<RichMessage['list']>,
  introMsg?: string
): RichMessage {
  const title = clip(list.title || 'Opções', 24);
  const buttonText = clip(list.buttonText || 'Opções', 20);
  const footer = clip(list.footer || FOOTER, 60);

  // mensagem ANTES do modal (humana, curta)
  const intro = (introMsg || list.description || 'Escolha uma opção 👇').trim();

  return {
    text: intro,
    intro,
    // false = sempre manda texto antes do modal
    modalOnly: false,
    keepTogether: true,
    list: {
      buttonText,
      // cabeçalho do modal enxuto — detalhe já foi na mensagem
      title,
      description: 'Toque e escolha',
      footer,
      sections: list.sections.map((sec) => ({
        title: clip(sec.title || 'Opções', 24),
        rows: sec.rows.map((r) => row(r.rowId, r.title)),
      })),
    },
    buttons: undefined,
    image: undefined,
  };
}

export function tplActions(
  title: string,
  description: string,
  actions: Array<{ id: string; title: string; desc?: string }>,
  buttonText = 'Opções',
  introMsg?: string
): RichMessage {
  return withList(
    {
      buttonText,
      title,
      description,
      sections: [
        {
          title: 'Opções',
          rows: actions.map((a) => row(a.id, a.title)),
        },
      ],
    },
    introMsg || description
  );
}

export function tplMenu(): RichMessage {
  const s = loadBarbershop().shop;
  return withList(
    {
      buttonText: 'Menu',
      title: 'Menu',
      description: 'Como podemos ajudar?',
      sections: [
        {
          title: 'Opções',
          rows: [
            row('1', 'Agendar'),
            row('2', 'Preços'),
            row('3', 'Equipe'),
            row('4', 'Como chegar'),
            row('5', 'Pagamento'),
            row('6', 'Status / fila'),
            row('7', 'Meus horários'),
            row('8', 'Falar com a loja'),
            row('9', 'Reclamação'),
          ],
        },
      ],
    },
    `Olá! Sou o atendimento da *${clip(s.name, 40)}*.\nComo posso te ajudar?`
  );
}

/** Nudge curto quando o cliente manda algo sem sentido no menu (sem reenviar modal) */
export function tplSoftNudge(): RichMessage {
  return {
    text: 'Não entendi 😅\nToque em *Menu* na mensagem acima, ou digite *0* para recomeçar.',
    keepTogether: true,
    modalOnly: false,
  };
}

export function tplWaitingMenu(opts: {
  name: string;
  etaMsg: string;
  barber: string;
  service: string;
}): RichMessage {
  const first = (opts.name || 'cliente').split(' ')[0];
  const eta = clip(opts.etaMsg.replace(/\n/g, ' '), 55);
  return withList(
    {
      buttonText: '⏳ Enquanto isso',
      title: 'Você na fila',
      description: eta || `Oi, ${first}`,
      sections: [
        {
          title: 'Enquanto espera',
          rows: [
            row('1', 'Atualizar espera', 'Quanto falta?'),
            row('2', 'Pagar', 'PIX ou maquininha'),
            row('3', 'Como chegar', 'GPS da loja'),
            row('4', 'Meus horários', 'Ver ou remarcar'),
            row('5', 'Pausar avisos', 'Sem spam'),
            row('0', 'Menu', 'Voltar'),
          ],
        },
      ],
    },
    `Oi, *${first}*! ☕\n\nVocê tá na fila com *${opts.barber}* (${opts.service}).\n${opts.etaMsg}\n\nSe precisar de algo, é só tocar 👇`
  );
}

/** Tabela de preços (menu 2) — só consulta, não inicia agendamento */
export function tplServices(): RichMessage {
  const { services } = loadBarbershop();
  // preço entra no TEXTO da opção (único campo do modal)
  const priceLines = services
    .map((s) => `• ${s.name} — ${money(s.price)} (${duration(s.durationMin)})`)
    .join('\n');
  return withList(
    {
      buttonText: 'Preços',
      title: 'Preços',
      sections: [
        {
          title: 'Opções',
          rows: [
            ...services.map((s) =>
              row(`svc_${s.id}`, clip(`${s.name} ${money(s.price)}`, 24))
            ),
            row('1', 'Agendar agora'),
            row('0', 'Menu'),
          ],
        },
      ],
    },
    `Nossa tabela:\n${priceLines}\n\nQuer agendar? Toque em *Agendar agora*.`
  );
}

/** Início do fluxo de agendamento (menu 1) */
export function tplServicesCover(): RichMessage {
  const { services } = loadBarbershop();
  return withList(
    {
      buttonText: 'Serviços',
      title: 'Serviços',
      sections: [
        {
          title: 'Opções',
          rows: services.map((s, i) =>
            row(String(i + 1), clip(`${s.name}`, 24))
          ),
        },
      ],
    },
    'Beleza! Qual serviço você quer?'
  );
}

export function tplBarbers(service?: ServiceItem): RichMessage {
  const { barbers } = loadBarbershop();
  return withList(
    {
      buttonText: 'Equipe',
      title: 'Equipe',
      sections: [
        {
          title: 'Opções',
          rows: [
            ...barbers.map((b, i) =>
              row(String(i + 1), b.nickname || b.name)
            ),
            row('qualquer', 'Tanto faz'),
          ],
        },
      ],
    },
    service
      ? `*${service.name}* · ${money(service.price)}\nEscolha o profissional:`
      : 'Escolha o profissional:'
  );
}

export function tplDays(barber: Barber, service: ServiceItem): RichMessage {
  const days = openDaysWithSlots(barber, service, 7);
  const nick = barber.nickname || barber.name;
  return withList(
    {
      buttonText: 'Dias',
      title: 'Dias',
      sections: [
        {
          title: 'Opções',
          rows: days.map((d, i) => row(String(i + 1), d.label)),
        },
      ],
    },
    `Com *${nick}* · ${service.name}\nQual dia fica melhor?`
  );
}

export function tplSlots(
  barber: Barber,
  dateLabel: string,
  date: string,
  service: ServiceItem
): RichMessage {
  const slots = availableSlots(barber, date, service).slice(0, 12);
  const nick = barber.nickname || barber.name;
  return withList(
    {
      buttonText: 'Horários',
      title: 'Horários',
      sections: [
        {
          title: 'Opções',
          rows: slots.map((t, i) => row(String(i + 1), t)),
        },
      ],
    },
    `*${dateLabel}* com ${nick}\n${service.name} · ${money(service.price)} · ${duration(service.durationMin)}\nEscolha o horário:`
  );
}

export function tplConfirm(data: {
  clientName: string;
  barber: Barber;
  service: ServiceItem;
  dateLabel: string;
  time: string;
}): RichMessage {
  const first = data.clientName.split(' ')[0];
  const nick = data.barber.nickname || data.barber.name;
  return withList(
    {
      buttonText: '✅ Confirmar',
      title: 'Confere aí',
      description: clip(
        `${data.dateLabel} ${data.time} · ${data.service.name}`,
        60
      ),
      sections: [
        {
          title: 'Tá certo?',
          rows: [
            row(
              '1',
              '1 · Pode confirmar',
              `${money(data.service.price)} · ${nick}`
            ),
            row('2', '2 · Melhor não', 'Quero mudar'),
          ],
        },
      ],
    },
    `*${first}*, confere se tá tudo certo:\n\n` +
      `✂️ ${data.service.name} · ${money(data.service.price)}\n` +
      `💇 ${nick}\n` +
      `📅 ${data.dateLabel} às *${data.time}*\n\n` +
      `Se bater, confirma pra mim 👇`
  );
}

export function tplPayment(opts: {
  amount: number;
  serviceName: string;
  pixKey: string;
  pixName: string;
  pixCode?: string;
  txId?: string;
}): RichMessage {
  const valor = opts.amount > 0 ? money(opts.amount) : 'no valor do serviço';
  return withList(
    {
      buttonText: '💳 Como pagar',
      title: 'Pagamento',
      description: clip(`${valor} · ${opts.serviceName}`, 60),
      sections: [
        {
          title: 'Forma de pagamento',
          rows: [
            row('1', '1 · PIX', 'Rápido no celular'),
            row('2', '2 · Crédito', 'Maquininha na loja'),
            row('3', '3 · Débito', 'Maquininha na loja'),
            row('4', '4 · Dinheiro', 'No balcão'),
            row('5', '5 · No dia', 'Pago quando for'),
          ],
        },
      ],
    },
    `Sobre o pagamento 💳\n\nValor: *${valor}* (${opts.serviceName}).\nComo você prefere pagar?`
  );
}

export function tplPixDetails(opts: {
  amount: number;
  pixKey: string;
  pixName: string;
  pixCode?: string;
  txId?: string;
  providerLabel?: string;
  providerMessage?: string;
}): RichMessage {
  const valor = opts.amount > 0 ? money(opts.amount) : 'conforme o serviço';
  const via = opts.providerLabel ? ` via *${opts.providerLabel}*` : '';
  return {
    text: [
      `PIX pra facilitar 📱${via}`,
      ``,
      `Valor: *${valor}*`,
      `Nome: ${opts.pixName}`,
      ``,
      opts.pixKey ? `Chave:\n\`${opts.pixKey}\`` : '',
      opts.txId ? `\nRef: ${opts.txId}` : '',
      opts.pixCode
        ? `\n*Copia e cola:*\n\`${opts.pixCode.length > 180 ? opts.pixCode.slice(0, 180) + '…' : opts.pixCode}\``
        : '',
      opts.providerMessage ? `\n_${opts.providerMessage}_` : '',
      ``,
      `Quando pagar, me manda *1* (já paguei).`,
      `Outra forma: digita *2*.`,
    ]
      .filter((l) => l !== undefined && l !== '')
      .join('\n'),
    keepTogether: true,
    modalOnly: false,
  };
}

export function tplLocation(): RichMessage {
  const s = loadBarbershop().shop;
  const lat = s.lat ?? -23.5505;
  const lng = s.lng ?? -46.6333;
  return {
    text:
      `A gente fica aqui 📍\n\n` +
      `*${s.name}*\n` +
      `${s.address}\n` +
      `📞 ${s.phone}\n\n` +
      `Te mando o pin no Maps 👇`,
    intro:
      `A gente fica aqui 📍\n\n` +
      `*${s.name}*\n` +
      `${s.address}\n` +
      `📞 ${s.phone}`,
    keepTogether: true,
    modalOnly: false,
    location: {
      lat,
      lng,
      name: s.name,
      address: s.address,
    },
  };
}

export function tplBooked(opts: {
  id: string;
  name: string;
  service: string;
  price: number;
  durationMin: number;
  barber: string;
  when: string;
}): RichMessage {
  const first = opts.name.split(' ')[0];
  return withList(
    {
      buttonText: '✨ Próximo',
      title: 'Horário garantido',
      description: clip(`${opts.when} · ${opts.service}`, 60),
      sections: [
        {
          title: 'Quer adiantar?',
          rows: [
            row('1', '1 · Pagar agora', money(opts.price)),
            row('2', '2 · Como chegar', 'GPS da loja'),
            row('3', '3 · Ver fila', 'Tempo de espera'),
            row('0', '0 · Menu', 'Tudo certo por agora'),
          ],
        },
      ],
    },
    `Fechado, *${first}*! 🎉\n\n` +
      `Seu horário tá confirmado:\n` +
      `📅 *${opts.when}*\n` +
      `✂️ ${opts.service} com *${opts.barber}*\n` +
      `💰 ${money(opts.price)} · ⏱️ ${duration(opts.durationMin)}\n` +
      `Código: \`${opts.id}\`\n\n` +
      `Qualquer coisa é só chamar. Quer adiantar algo?`
  );
}

export function tplStatus(opts: {
  id: string;
  status: string;
  payment: string;
  etaMsg: string;
  detail: string;
}): RichMessage {
  return withList(
    {
      buttonText: '⏳ Status',
      title: 'Como tá sua vez',
      description: clip(`${opts.status} · ${opts.payment}`, 60),
      sections: [
        {
          title: 'Ações',
          rows: [
            row('pagar', 'Pagar', 'PIX ou maquininha'),
            row('cheguei', 'Cheguei', 'Já tô na loja'),
            row('0', 'Menu', 'Voltar'),
          ],
        },
      ],
    },
    `Deixa eu te atualizar ⏳\n\n` +
      `${opts.etaMsg}\n` +
      `${opts.detail}\n\n` +
      `Situação: *${opts.status}* · pagamento: *${opts.payment}*`
  );
}

export function tplMachinePay(method: 'crédito' | 'débito' | 'dinheiro'): RichMessage {
  const title =
    method === 'dinheiro' ? 'Dinheiro' : `Maquininha · ${method}`;
  const body =
    method === 'dinheiro'
      ? 'Pode pagar no balcão na hora, sem problema.'
      : `Na loja a gente passa a maquininha no *${method}*.`;
  return withList(
    {
      buttonText: 'Beleza',
      title: clip(title, 60),
      description: clip(body, 60),
      sections: [
        {
          title: 'Opções',
          rows: [
            row('cheguei', 'Cheguei', 'Já tô aqui'),
            row('4', 'GPS', 'Como chegar'),
            row('0', 'Menu', 'Voltar'),
          ],
        },
      ],
    },
    `Combinado 👍\n\n${body}\n\nQuando chegar, me avisa.`
  );
}

export function tplAskName(): RichMessage {
  return {
    text:
      `Quase lá! 😊\n\n` +
      `Me fala seu *nome* (pode ser só o primeiro).`,
    keepTogether: true,
    modalOnly: false,
  };
}

export function tplHandoff(): RichMessage {
  return tplActions(
    'Falar com a loja',
    'Vou te passar pro time da loja',
    [
      { id: '0', title: '0 · Voltar ao menu', desc: 'Continuar comigo' },
      { id: '4', title: '4 · Como chegar', desc: 'GPS' },
      { id: '1', title: '1 · Agendar', desc: 'Marcar horário' },
    ],
    'Opções',
    `Beleza — vou te conectar com a *loja* 👤\n\n` +
      `Alguém do time responde por aqui.\n` +
      `Se mudar de ideia, é só voltar pro menu 👇`
  );
}

export function tplServicePicked(svc: ServiceItem): string {
  return `Boa escolha: *${svc.name}* (${money(svc.price)} · ${duration(svc.durationMin)}). Agora o barbeiro 👇`;
}
