/**
 * Painel do dono — tela GRANDE e FIXA.
 * Não fica piscando: só redesenha quando você mexe.
 *
 * Clientes numerados: fácil digitar 1, 2, 3…
 *
 *   npm run owner
 */
import readline from 'readline';
import {
  cancelAppointment,
  enqueueOwnerMessage,
  loadShopOps,
  saveShopOps,
  todaysAppointments,
  updateAppointment,
  loadBarbershop,
} from '../barbershop/store.js';
import { confirmPayment } from '../barbershop/payment.js';
import { estimateWait } from '../barbershop/queue.js';
import { ratingsSummary, starsBar } from '../barbershop/ratings.js';
import { formatMoney, formatDuration } from '../barbershop/schedule.js';
import {
  c,
  paint,
  bold,
  dim,
  clock,
  stripAnsi,
  truncate,
  progressBar,
} from '../terminal/theme.js';
import type { Appointment, VisitStatus } from '../barbershop/types.js';

type View = 'hoje' | 'fila' | 'pix' | 'notas' | 'ajuda';

interface State {
  view: View;
  selected: number; // índice 1-based na lista visível
  flash: string;
  flashAt: number;
  list: Appointment[];
}

const STATUS_SHORT: Record<string, string> = {
  booked: 'AGEND',
  awaiting_payment: 'PIX…',
  paid: 'PAGO',
  checked_in: 'CHECK',
  waiting: 'FILA',
  in_service: 'ATEND',
  done: 'FIM',
  rated: 'NOTA',
  cancelled: 'CANC',
  no_show: 'FALTA',
};

export async function runOwnerTerminal(): Promise<void> {
  if (!process.stdout.isTTY) {
    console.log('Rode em um terminal interativo (TTY).');
    console.log('Ex: npm run owner');
    return;
  }

  const shop = loadBarbershop().shop;
  const state: State = {
    view: 'hoje',
    selected: 1,
    flash: '',
    flashAt: 0,
    list: [],
  };

  // tela alternativa — não bagunça o histórico do terminal
  process.stdout.write('\x1b[?1049h\x1b[?25l');
  const restore = () => {
    process.stdout.write('\x1b[?25h\x1b[?1049l');
  };
  process.on('exit', restore);
  process.on('SIGINT', () => {
    restore();
    process.exit(0);
  });

  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);

  let cmdBuf = '';
  let running = true;

  const paintScreen = () => {
    state.list = buildList(state.view);
    if (state.selected > state.list.length) {
      state.selected = Math.max(1, state.list.length);
    }
    if (state.selected < 1 && state.list.length) state.selected = 1;
    drawFixed(shop.name, state, cmdBuf);
  };

  paintScreen();

  // refresh suave só dos dados (mesmo layout, sem “piscar” texto solto)
  // a cada 20s redesenha no lugar — tela fixa
  const timer = setInterval(() => {
    if (running) paintScreen();
  }, 20000);
  timer.unref?.();

  process.stdout.on('resize', () => paintScreen());

  await new Promise<void>((resolve) => {
    const onKey = (str: string, key: readline.Key) => {
      if (!running) return;

      if (key?.ctrl && key.name === 'c') {
        running = false;
        process.stdin.removeListener('keypress', onKey);
        if (process.stdin.isTTY) process.stdin.setRawMode(false);
        clearInterval(timer);
        restore();
        resolve();
        return;
      }

      // navegação
      if (key?.name === 'up' || key?.name === 'k') {
        state.selected = Math.max(1, state.selected - 1);
        paintScreen();
        return;
      }
      if (key?.name === 'down' || key?.name === 'j') {
        state.selected = Math.min(state.list.length || 1, state.selected + 1);
        paintScreen();
        return;
      }

      // abas
      if (key?.name === 'f1' || (str === '1' && key?.ctrl)) {
        /* ignore */
      }

      if (key?.name === 'return' || key?.name === 'enter') {
        const line = cmdBuf.trim();
        cmdBuf = '';
        if (line) {
          handleCommand(line, state);
        }
        paintScreen();
        return;
      }

      if (key?.name === 'backspace') {
        cmdBuf = cmdBuf.slice(0, -1);
        paintScreen();
        return;
      }

      if (key?.name === 'escape') {
        cmdBuf = '';
        state.flash = '';
        paintScreen();
        return;
      }

      // atalhos de 1 tecla (sem Enter) quando buffer vazio
      if (!cmdBuf && str && !key?.ctrl && !key?.meta) {
        if (str === 'r' || str === 'R') {
          state.flash = 'Atualizado';
          state.flashAt = Date.now();
          paintScreen();
          return;
        }
        if (str === 'h' || str === '?') {
          state.view = 'ajuda';
          paintScreen();
          return;
        }
        if (str === 't' || str === 'T') {
          state.view = 'hoje';
          state.selected = 1;
          paintScreen();
          return;
        }
        if (str === 'f' || str === 'F') {
          state.view = 'fila';
          state.selected = 1;
          paintScreen();
          return;
        }
        if (str === 'x' || str === 'X') {
          state.view = 'pix';
          state.selected = 1;
          paintScreen();
          return;
        }
        if (str === 'n' || str === 'N') {
          state.view = 'notas';
          paintScreen();
          return;
        }
        // ações rápidas no cliente selecionado
        if (str === 'p' || str === 'P') {
          doAction(state, 'pagou');
          paintScreen();
          return;
        }
        if (str === 'c' || str === 'C') {
          doAction(state, 'chegou');
          paintScreen();
          return;
        }
        if (str === 'a' || str === 'A') {
          doAction(state, 'atender');
          paintScreen();
          return;
        }
        if (str === 'z' || str === 'Z') {
          doAction(state, 'fim');
          paintScreen();
          return;
        }
        if (str === 'q' || str === 'Q') {
          running = false;
          process.stdin.removeListener('keypress', onKey);
          if (process.stdin.isTTY) process.stdin.setRawMode(false);
          clearInterval(timer);
          restore();
          resolve();
          return;
        }
      }

      if (str && str.length === 1 && str >= ' ') {
        cmdBuf += str;
        // número sozinho muda seleção ao digitar e Enter, ou 1-9 rápido
        paintScreen();
      }
    };

    process.stdin.on('keypress', onKey);
  });
}

function buildList(view: View): Appointment[] {
  const today = todaysAppointments();
  if (view === 'fila') {
    return today.filter((a) =>
      ['waiting', 'checked_in', 'in_service', 'paid'].includes(a.status)
    );
  }
  if (view === 'pix') {
    return today.filter(
      (a) =>
        a.payment?.status === 'pending' || a.status === 'awaiting_payment'
    );
  }
  if (view === 'notas' || view === 'ajuda') return [];
  return today;
}

function selectedAppt(state: State): Appointment | null {
  if (!state.list.length) return null;
  const idx = Math.min(state.selected, state.list.length) - 1;
  return state.list[idx] || null;
}

function doAction(state: State, action: string): void {
  const a = selectedAppt(state);
  if (!a) {
    state.flash = 'Nenhum cliente selecionado';
    state.flashAt = Date.now();
    return;
  }
  try {
    switch (action) {
      case 'pagou':
        confirmPayment(a.id, 'owner');
        enqueueOwnerMessage(
          a.chatId,
          `✅ Pagamento de ${formatMoney(a.price)} *confirmado* pela loja. Obrigado!`
        );
        state.flash = `✓ PIX ok · ${a.clientName}`;
        break;
      case 'chegou':
        updateAppointment(a.id, { status: 'waiting' });
        {
          const snap = estimateWait({ ...a, status: 'waiting' });
          enqueueOwnerMessage(
            a.chatId,
            `👋 Check-in!\n${snap.message}`
          );
          state.flash = `✓ Na fila · ${a.clientName} · ETA ~${snap.etaMinutes}m`;
        }
        break;
      case 'atender':
        updateAppointment(a.id, { status: 'in_service' });
        enqueueOwnerMessage(
          a.chatId,
          `✂️ Sua vez, *${a.clientName}*! Cadeira do *${a.barberName}*.`
        );
        state.flash = `✓ Atendendo · ${a.clientName}`;
        break;
      case 'fim':
        updateAppointment(a.id, { status: 'done' });
        enqueueOwnerMessage(
          a.chatId,
          `✨ Pronto, *${a.clientName}*!\nAvalie: digite *avaliar* (1 a 5 ⭐)`
        );
        state.flash = `✓ Finalizado · ${a.clientName}`;
        break;
      case 'cancela':
        cancelAppointment(a.id);
        enqueueOwnerMessage(
          a.chatId,
          `Horário cancelado (${a.date} ${a.time}). Digite *agendar* se quiser remarcar.`
        );
        state.flash = `✓ Cancelado · ${a.clientName}`;
        break;
      default:
        state.flash = `Ação: ${action}`;
    }
  } catch (e) {
    state.flash = String(e);
  }
  state.flashAt = Date.now();
}

function handleCommand(line: string, state: State): void {
  const parts = line.trim().split(/\s+/);
  let cmd = parts[0].toLowerCase();
  let arg = parts.slice(1).join(' ');

  // "3 pagou" ou "3 p" → seleciona cliente 3 e age
  if (/^\d+$/.test(cmd)) {
    const n = Number(cmd);
    if (n >= 1 && n <= state.list.length) {
      state.selected = n;
      const act = (parts[1] || '').toLowerCase();
      if (!act) {
        state.flash = `Selecionado: ${state.list[n - 1].clientName}`;
        state.flashAt = Date.now();
        return;
      }
      const map: Record<string, string> = {
        p: 'pagou',
        pagou: 'pagou',
        pago: 'pagou',
        c: 'chegou',
        chegou: 'chegou',
        a: 'atender',
        atender: 'atender',
        f: 'fim',
        fim: 'fim',
        z: 'fim',
        x: 'cancela',
        cancela: 'cancela',
      };
      if (map[act]) {
        doAction(state, map[act]);
        return;
      }
      if (act === 'm' || act === 'msg') {
        const a = state.list[n - 1];
        const msg = parts.slice(2).join(' ');
        if (msg) {
          enqueueOwnerMessage(a.chatId, msg);
          state.flash = `✓ Msg → ${a.clientName}`;
          state.flashAt = Date.now();
        } else {
          state.flash = 'Uso: 3 m texto da mensagem';
          state.flashAt = Date.now();
        }
        return;
      }
    }
  }

  switch (cmd) {
    case 't':
    case 'hoje':
      state.view = 'hoje';
      state.selected = 1;
      state.flash = 'Agenda de hoje';
      break;
    case 'f':
    case 'fila':
      state.view = 'fila';
      state.selected = 1;
      state.flash = 'Fila virtual';
      break;
    case 'x':
    case 'pix':
      state.view = 'pix';
      state.selected = 1;
      state.flash = 'PIX pendentes';
      break;
    case 'n':
    case 'notas':
      state.view = 'notas';
      state.flash = 'Avaliações';
      break;
    case 'h':
    case 'help':
    case '?':
      state.view = 'ajuda';
      break;
    case 'p':
    case 'pagou':
      doAction(state, 'pagou');
      break;
    case 'c':
    case 'chegou':
      doAction(state, 'chegou');
      break;
    case 'a':
    case 'atender':
      doAction(state, 'atender');
      break;
    case 'z':
    case 'fim':
      doAction(state, 'fim');
      break;
    case 'cancela':
      doAction(state, 'cancela');
      break;
    case 'msg':
    case 'm': {
      const a = selectedAppt(state);
      if (!a) {
        state.flash = 'Selecione um cliente';
        break;
      }
      if (!arg) {
        state.flash = 'Uso: m texto  ou  2 m texto';
        break;
      }
      enqueueOwnerMessage(a.chatId, arg);
      state.flash = `✓ Msg → ${a.clientName}`;
      break;
    }
    case 'broadcast':
    case 'bc': {
      if (!arg) {
        state.flash = 'Uso: bc texto';
        break;
      }
      const list = todaysAppointments().filter((a) =>
        ['booked', 'paid', 'waiting', 'awaiting_payment'].includes(a.status)
      );
      for (const a of list) enqueueOwnerMessage(a.chatId, arg);
      state.flash = `✓ Broadcast → ${list.length} clientes`;
      break;
    }
    case 'abrir':
      saveShopOps({ open: true });
      state.flash = 'Loja ABERTA';
      break;
    case 'fechar':
      saveShopOps({ open: false });
      state.flash = 'Loja FECHADA';
      break;
    case 'r':
      state.flash = 'Atualizado';
      break;
    default:
      // se digitou só número já tratado
      state.flash = `Comando: ${cmd} · ? ajuda`;
  }
  state.flashAt = Date.now();
}

/** Desenha tela inteira no mesmo lugar — layout fixo */
function drawFixed(shopName: string, state: State, cmdBuf: string): void {
  const W = Math.max(80, process.stdout.columns || 100);
  const H = Math.max(24, process.stdout.rows || 30);
  const lines: string[] = [];

  const ops = loadShopOps();
  const today = todaysAppointments();
  const waiting = today.filter((a) =>
    ['waiting', 'checked_in', 'in_service'].includes(a.status)
  );
  const pixPend = today.filter(
    (a) => a.payment?.status === 'pending' || a.status === 'awaiting_payment'
  );
  const ratings = ratingsSummary();

  // ── HEADER ──
  lines.push(
    paint(
      c.bgCyan + c.black + c.bold,
      padR(`  ${shopName.toUpperCase()}  ·  PAINEL DO DONO  ·  ${clock()}  `, W)
    )
  );

  const open = ops.open
    ? paint(c.bgGreen + c.black + c.bold, ' ABERTO ')
    : paint(c.bgBlack + c.red + c.bold, ' FECHADO ');

  // faturamento do dia (pagos + finalizados)
  const revenue = today
    .filter((a) => a.payment?.status === 'confirmed' || ['done', 'rated', 'in_service', 'paid'].includes(a.status))
    .reduce((s, a) => s + (a.price || 0), 0);
  const doneN = today.filter((a) => ['done', 'rated'].includes(a.status)).length;
  const noShow = today.filter((a) => a.status === 'no_show').length;

  lines.push(
    row(
      W,
      `${open}  ${kpi('HOJE', today.length, c.white)}  ${kpi('FILA', waiting.length, c.yellow)}  ${kpi('PIX…', pixPend.length, c.red)}  ${kpi('★', ratings.count ? ratings.avg.toFixed(1) : '—', c.magenta)}`
    )
  );
  lines.push(
    row(
      W,
      `  ${kpi('R$', formatMoney(revenue).replace('R$ ', ''), c.green)} faturamento  ${kpi('OK', doneN, c.cyan)} finalizados  ${kpi('FALTA', noShow, c.red)} no-show`
    )
  );

  // abas
  const tabs: Array<[View, string, string]> = [
    ['hoje', 'T', 'HOJE'],
    ['fila', 'F', 'FILA'],
    ['pix', 'X', 'PIX'],
    ['notas', 'N', 'NOTAS'],
    ['ajuda', 'H', 'AJUDA'],
  ];
  const tabLine = tabs
    .map(([v, key, label]) => {
      const on = state.view === v;
      const t = ` ${key}:${label} `;
      return on
        ? paint(c.bgMagenta + c.white + c.bold, t)
        : paint(c.gray, t);
    })
    .join(' ');
  lines.push(row(W, tabLine));
  lines.push(paint(c.cyan, '─'.repeat(W)));

  // ── CORPO ──
  const bodyStart = lines.length;
  const footerH = 4;
  const bodyH = Math.max(8, H - bodyStart - footerH - 1);

  if (state.view === 'ajuda') {
    pushHelp(lines, W, bodyH);
  } else if (state.view === 'notas') {
    pushNotas(lines, W, bodyH, ratings);
  } else {
    pushClientTable(lines, W, bodyH, state);
  }

  // preenche altura
  while (lines.length < H - footerH) lines.push('');

  // ── DETALHE do selecionado ──
  const sel = selectedAppt(state);
  lines.push(paint(c.cyan, '─'.repeat(W)));
  if (sel && state.view !== 'ajuda' && state.view !== 'notas') {
    const snap = estimateWait(sel);
    lines.push(
      row(
        W,
        paint(c.bold, ` ▸ ${sel.clientName} `) +
          dim(`#${state.selected}  ${sel.id}`) +
          `  ${statusColor(sel.status)}  ${sel.time}  ${sel.barberName}  ${formatMoney(sel.price)}  ETA~${snap.etaMinutes}m`
      )
    );
    lines.push(
      row(
        W,
        dim(
          `  ${sel.serviceName} · ${formatDuration(sel.durationMin)} · PIX:${sel.payment?.status || '—'} · ${sel.chatId.replace('@c.us', '').replace('@lid', '')}`
        )
      )
    );
  } else {
    lines.push(row(W, dim('  Selecione um cliente com ↑↓ ou digite o número + Enter')));
    lines.push('');
  }

  // ── FOOTER / comando ──
  const flash =
    state.flash && Date.now() - state.flashAt < 8000
      ? paint(c.green, ` ${state.flash} `)
      : dim(' P:pagou C:chegou A:atender Z:fim · 3 p · 2 m oi · bc texto · R:atualizar · Q:sair ');

  lines.push(
    paint(c.bgGray + c.white, padR(flash, W))
  );
  lines.push(
    paint(
      c.bgBlack + c.cyan + c.bold,
      padR(`  ❯ ${cmdBuf}█`, W)
    )
  );

  // render fixo
  process.stdout.write('\x1b[H');
  for (let i = 0; i < H; i++) {
    const line = lines[i] ?? '';
    const plain = stripAnsi(line).length;
    const pad = plain < W ? ' '.repeat(W - plain) : '';
    process.stdout.write(line + pad + '\x1b[K\n');
  }
}

function pushClientTable(
  lines: string[],
  W: number,
  bodyH: number,
  state: State
): void {
  // cabeçalho colunas
  lines.push(
    row(
      W,
      dim(
        `  ${'#'.padStart(2)}  ${'CLIENTE'.padEnd(16)}  ${'HORA'}  ${'BARBEIRO'.padEnd(10)}  ${'SERVIÇO'.padEnd(14)}  ${'VALOR'.padStart(8)}  ${'PIX'.padEnd(6)}  STATUS`
      )
    )
  );
  lines.push(paint(c.dim, '  ' + '─'.repeat(Math.min(W - 4, 90))));

  const list = state.list;
  if (!list.length) {
    lines.push(row(W, paint(c.yellow, '  Nenhum cliente nesta lista agora.')));
    for (let i = 3; i < bodyH; i++) lines.push('');
    return;
  }

  const maxRows = bodyH - 2;
  // scroll window around selection
  let start = 0;
  if (state.selected > maxRows) {
    start = state.selected - maxRows;
  }
  const slice = list.slice(start, start + maxRows);

  for (let i = 0; i < slice.length; i++) {
    const a = slice[i];
    const num = start + i + 1;
    const selected = num === state.selected;
    const snap = ['waiting', 'checked_in', 'in_service'].includes(a.status)
      ? estimateWait(a)
      : null;

    const pix =
      a.payment?.status === 'confirmed'
        ? paint(c.green, 'OK')
        : a.payment?.status === 'pending'
          ? paint(c.red, '…')
          : dim('—');

    const st = statusColor(a.status);
    const name = truncate(a.clientName, 16).padEnd(16);
    const barber = truncate(a.barberName, 10).padEnd(10);
    const svc = truncate(a.serviceName, 14).padEnd(14);
    const val = formatMoney(a.price).padStart(8);
    const eta = snap ? dim(` ~${snap.etaMinutes}m`) : '';

    const content =
      `  ${String(num).padStart(2)}  ${name}  ${a.time}  ${barber}  ${svc}  ${val}  ${pix.padEnd(6)}  ${st}${eta}`;

    if (selected) {
      lines.push(paint(c.bgMagenta + c.white + c.bold, padR(content, W)));
    } else {
      lines.push(row(W, content));
    }
  }

  const used = 2 + slice.length;
  for (let i = used; i < bodyH; i++) lines.push('');
}

function pushNotas(
  lines: string[],
  W: number,
  bodyH: number,
  ratings: ReturnType<typeof ratingsSummary>
): void {
  lines.push(
    row(
      W,
      `  ${bold('Avaliações')}  ${starsBar(ratings.avg)}  ${ratings.avg.toFixed(2)}  (${ratings.count} votos)`
    )
  );
  lines.push(row(W, `  ${progressBar(ratings.avg / 5 || 0, 24)}`));
  lines.push('');
  lines.push(row(W, bold('  Por barbeiro')));
  for (const b of ratings.byBarber.slice(0, 8)) {
    lines.push(
      row(
        W,
        `  ${b.name.padEnd(12)} ${starsBar(b.avg)} ${b.avg.toFixed(1)} (${b.count})`
      )
    );
  }
  lines.push('');
  lines.push(row(W, bold('  Recentes')));
  for (const r of ratings.recent.slice(0, 6)) {
    lines.push(
      row(
        W,
        `  ${starsBar(r.stars)}  ${r.name.padEnd(12)} → ${r.barber}  ${dim(r.comment || '')}`
      )
    );
  }
  while (lines.length < 20) lines.push('');
}

function pushHelp(lines: string[], W: number, bodyH: number): void {
  const help = [
    bold('  COMO USAR (tela fixa)'),
    '',
    '  ↑ ↓     mover entre clientes',
    '  1-9 ↵   selecionar pelo número',
    '  3 p     cliente 3 → confirmar PIX',
    '  2 c     cliente 2 → chegou (fila)',
    '  1 a     cliente 1 → atender',
    '  4 z     cliente 4 → finalizar + pedir nota',
    '  2 m oi  manda "oi" no WhatsApp do cliente 2',
    '',
    '  Teclas rápidas (sem Enter):',
    '  P pagou · C chegou · A atender · Z fim',
    '  T hoje · F fila · X pix · N notas · R atualizar · Q sair',
    '',
    '  Comandos com Enter:',
    '  m texto     mensagem ao selecionado',
    '  bc texto    broadcast do dia',
    '  abrir / fechar',
    '',
    dim('  Bot precisa estar no ar (docker) para entregar msgs.'),
  ];
  for (const h of help) lines.push(row(W, h));
  while (lines.length < bodyH) lines.push('');
}

function statusColor(s: VisitStatus | string): string {
  const t = STATUS_SHORT[s] || s;
  if (s === 'in_service') return paint(c.green + c.bold, t);
  if (s === 'waiting' || s === 'checked_in') return paint(c.yellow + c.bold, t);
  if (s === 'awaiting_payment') return paint(c.red, t);
  if (s === 'paid') return paint(c.cyan, t);
  if (s === 'done' || s === 'rated') return paint(c.magenta, t);
  return dim(t);
}

function kpi(label: string, value: string | number, color: string): string {
  return `${paint(c.gray, label)} ${paint(color + c.bold, String(value))}`;
}

function row(W: number, content: string): string {
  return truncate(content, W - 1);
}

function padR(s: string, W: number): string {
  const p = stripAnsi(s).length;
  if (p >= W) return truncate(s, W);
  return s + ' '.repeat(W - p);
}
