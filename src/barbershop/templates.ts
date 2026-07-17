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

function row(rowId: string, title: string, description?: string): MsgListRow {
  return {
    rowId,
    title: clip(title, 24),
    description: description ? clip(description, 72) : undefined,
  };
}

function withList(
  list: NonNullable<RichMessage['list']>,
  introMsg?: string
): RichMessage {
  const title = clip(list.title || 'Menu', 60);
  const description = clip(list.description || 'É só tocar e escolher', 60);
  const buttonText = clip(list.buttonText || 'Ver opções', 20);
  const footer = clip(list.footer || FOOTER, 60);

  const intro = (
    introMsg ||
    `*${title}*\n${description}\n\nÉ só tocar no botão aqui embaixo 👇`
  ).trim();

  return {
    text: intro,
    intro,
    modalOnly: true,
    keepTogether: true,
    list: {
      buttonText,
      title,
      description,
      footer,
      sections: list.sections.map((sec) => ({
        title: clip(sec.title, 24),
        rows: sec.rows.map((r) => row(r.rowId, r.title, r.description)),
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
          rows: actions.map((a) => row(a.id, a.title, a.desc)),
        },
      ],
    },
    introMsg || `${description}\n\nMe fala o que prefere 👇`
  );
}

export function tplMenu(): RichMessage {
  const s = loadBarbershop().shop;
  // Estilo banco: UMA lista — description = frase curta (limite WA)
  return withList(
    {
      buttonText: '📋 Menu',
      title: s.name,
      description: 'Olá! Como podemos ajudar?',
      sections: [
        {
          title: 'Atendimento',
          rows: [
            row('1', 'Agendar', 'Marcar horário'),
            row('2', 'Preços', 'Valores e duração'),
            row('3', 'Equipe', 'Nossos profissionais'),
            row('4', 'Como chegar', 'Endereço e GPS'),
            row('5', 'Pagamento', 'PIX ou maquininha'),
            row('6', 'Status / fila', 'Tempo de espera'),
            row('7', 'Meus horários', 'Remarcar ou cancelar'),
            row('8', 'Falar com a loja', 'Atendente'),
            row('9', 'Reclamação', 'Abrir chamado'),
          ],
        },
      ],
    },
    `Olá! Como podemos ajudar?`
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
            row('1', '1 · Atualizar espera', 'Quanto falta?'),
            row('2', '2 · Pagar', 'PIX ou maquininha'),
            row('3', '3 · GPS', 'Como chegar'),
            row('4', '4 · Meus horários', 'Ver ou remarcar'),
            row('5', '5 · Pausar avisos', 'Sem spam, ok'),
            row('0', '0 · Menu', 'Voltar ao início'),
          ],
        },
      ],
    },
    `Oi, *${first}*! ☕\n\nVocê tá na fila com *${opts.barber}* (${opts.service}).\n${opts.etaMsg}\n\nSe precisar de algo, é só tocar 👇`
  );
}

export function tplServices(): RichMessage {
  const { services } = loadBarbershop();
  return withList(
    {
      buttonText: '💰 Serviços',
      title: 'Serviços',
      description: 'Escolha o serviço desejado',
      sections: [
        {
          title: 'Tabela',
          rows: services.map((s, i) =>
            row(
              String(i + 1),
              s.name,
              `${money(s.price)} · ${duration(s.durationMin)}`
            )
          ),
        },
      ],
    },
    'Escolha o serviço desejado'
  );
}

export function tplServicesCover(): RichMessage {
  return tplServices();
}

export function tplBarbers(service?: ServiceItem): RichMessage {
  const { barbers } = loadBarbershop();
  const desc = service
    ? clip(`${service.name} · ${money(service.price)}`, 60)
    : 'Nossa equipe';

  return withList(
    {
      buttonText: '💇 Equipe',
      title: 'Barbeiros',
      description: desc,
      sections: [
        {
          title: 'Profissionais',
          rows: [
            ...barbers.map((b, i) =>
              row(
                String(i + 1),
                `${i + 1} · ${b.nickname || b.name}`,
                b.specialty
              )
            ),
            row('qualquer', 'Tanto faz', 'Quem estiver livre'),
          ],
        },
      ],
    },
    service
      ? `Escolha o profissional · ${service.name}`
      : 'Escolha o profissional'
  );
}

export function tplDays(barber: Barber, service: ServiceItem): RichMessage {
  const days = openDaysWithSlots(barber, service, 7);
  const nick = barber.nickname || barber.name;
  return withList(
    {
      buttonText: '📅 Dias',
      title: 'Dias livres',
      description: clip(`${nick} · ${service.name}`, 60),
      sections: [
        {
          title: 'Quando',
          rows: days.map((d, i) =>
            row(
              String(i + 1),
              `${i + 1} · ${d.label}`,
              `${d.slots.length} horários`
            )
          ),
        },
      ],
    },
    `${nick} · escolha o dia`
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
      buttonText: '⏰ Horários',
      title: clip(dateLabel, 60),
      description: clip(`${money(service.price)} · ${duration(service.durationMin)}`, 60),
      sections: [
        {
          title: 'Horários livres',
          rows: slots.map((t, i) =>
            row(String(i + 1), `${i + 1} · ${t}`, duration(service.durationMin))
          ),
        },
      ],
    },
    `${dateLabel} · escolha o horário`
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
            row('1', '1 · Pagar', 'PIX ou maquininha'),
            row('2', '2 · Cheguei', 'Já tô na loja'),
            row('0', '0 · Menu', 'Voltar'),
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
