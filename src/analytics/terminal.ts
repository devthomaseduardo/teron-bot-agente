/**
 * Terminal de análise de mensagens — dashboard live (sem web).
 */
import { buildSnapshot, formatAvgReply, type AnalyticsSnapshot } from './stats.js';
import {
  bold,
  c,
  clock,
  dim,
  paint,
  pad,
  progressBar,
  stripAnsi,
  truncate,
  uptime,
} from '../terminal/theme.js';

export function runAnalyticsTerminal(refreshMs = 2000): void {
  const started = Date.now();
  let live = true;

  const draw = () => {
    if (!live) return;
    const snap = buildSnapshot({ recentLimit: 12 });
    render(snap, started);
  };

  if (process.stdout.isTTY) {
    process.stdout.write('\x1b[?25l');
    process.stdout.write('\x1b[2J\x1b[H');
  }

  draw();
  const timer = setInterval(draw, refreshMs);

  const stop = () => {
    live = false;
    clearInterval(timer);
    if (process.stdout.isTTY) process.stdout.write('\x1b[?25h\n');
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

function render(snap: AnalyticsSnapshot, started: number): void {
  const width = Math.max(70, process.stdout.columns || 80);
  const height = process.stdout.rows || 30;
  const lines: string[] = [];

  lines.push(
    paint(c.bgMagenta + c.white + c.bold, pad('  ANALYTICS · MENSAGENS · LEADS · SESSÕES  ', width))
  );
  lines.push(paint(c.magenta, '═'.repeat(width)));
  lines.push(
    row(
      width,
      `${paint(c.cyan, 'gerado')} ${clock(new Date(snap.generatedAt))}  ${paint(c.cyan, 'refresh')} live  ${paint(c.gray, `painel ${uptime(started)}`)}`
    )
  );

  // KPIs
  const t = snap.totals;
  lines.push(
    row(
      width,
      `${kpi('MSG', t.messages, c.white)} ${kpi('IN', t.inbound, c.green)} ${kpi('OUT', t.outbound, c.blue)} ${kpi('CHATS', t.uniqueChats, c.cyan)} ${kpi('LEADS', t.leads, c.yellow)} ${kpi('HANDOFF', t.handoffs, c.magenta)}`
    )
  );

  const ratePct = Math.round(snap.conversion.leadRate * 100);
  lines.push(
    row(
      width,
      `${paint(c.cyan, 'conversão')} ${progressBar(snap.conversion.leadRate, 20)} ${bold(`${ratePct}%`)}  ${paint(c.cyan, 'reply médio')} ${formatAvgReply(snap.response.avgReplyMs)} (${snap.response.samples} amostras)  ${paint(c.cyan, 'fluxos')} ${t.activeFlows}`
    )
  );
  lines.push(paint(c.magenta, '─'.repeat(width)));

  // Heatmap por hora (últimas com tráfego)
  lines.push(row(width, bold('Volume por hora (IN/OUT)')));
  const activeHours = snap.byHour.filter((h) => h.in + h.out > 0);
  const showHours =
    activeHours.length > 0
      ? activeHours
      : snap.byHour.filter((_, i) => i >= 8 && i <= 20);
  const maxH = Math.max(1, ...showHours.map((h) => h.in + h.out));
  for (const h of showHours.slice(-12)) {
    const total = h.in + h.out;
    const bar = progressBar(total / maxH, 22);
    lines.push(
      row(
        width,
        ` ${paint(c.gray, h.hour)} ${bar} ${paint(c.green, `↓${h.in}`)} ${paint(c.blue, `↑${h.out}`)}`
      )
    );
  }

  lines.push(paint(c.magenta, '─'.repeat(width)));

  // duas colunas: sources + top chats
  lines.push(row(width, bold('Fontes de resposta') + '          ' + bold('Top conversas')));
  const left = snap.bySource.slice(0, 8);
  const right = snap.topChats.slice(0, 8);
  const rows = Math.max(left.length, right.length, 1);
  for (let i = 0; i < rows; i++) {
    const L = left[i]
      ? `${pad(truncate(left[i].source, 14), 14)} ${paint(c.yellow, String(left[i].count).padStart(4))}`
      : ' '.repeat(20);
    const R = right[i]
      ? `${pad(truncate(right[i].chatId, 16), 16)} ${paint(c.cyan, String(right[i].count).padStart(4))}`
      : '';
    lines.push(row(width, ` ${L}   │  ${R}`));
  }

  if (snap.byType.length) {
    lines.push(paint(c.magenta, '─'.repeat(width)));
    lines.push(
      row(
        width,
        bold('Tipos de entrada: ') +
          snap.byType
            .slice(0, 6)
            .map((t) => `${t.type}:${paint(c.green, String(t.count))}`)
            .join('  ')
      )
    );
  }

  lines.push(paint(c.magenta, '─'.repeat(width)));
  lines.push(row(width, bold('Mensagens recentes')));
  for (const m of snap.recentMessages.slice(0, 10)) {
    const dir =
      m.direction === 'in'
        ? paint(c.green + c.bold, 'IN ')
        : paint(c.blue + c.bold, 'OUT');
    const who = truncate(m.chatId.replace('@c.us', ''), 12);
    const src = m.source ? dim(`[${m.source}]`) : '';
    const text = truncate(m.text.replace(/\n/g, ' '), width - 36);
    lines.push(
      row(
        width,
        ` ${paint(c.gray, m.at.slice(11, 19))} ${dir} ${who} ${src} ${text}`
      )
    );
  }

  if (snap.recentLeads.length) {
    lines.push(paint(c.magenta, '─'.repeat(width)));
    lines.push(row(width, bold('Leads recentes')));
    for (const l of snap.recentLeads.slice(0, 5)) {
      const name = l.profile?.name || '—';
      const prof = Object.entries(l.profile || {})
        .filter(([k]) => k !== 'name')
        .map(([k, v]) => `${k}=${v}`)
        .join(', ');
      lines.push(
        row(
          width,
          ` ${paint(c.yellow, '★')} ${truncate(name, 16)} ${dim(l.source)} ${truncate(prof, width - 40)}`
        )
      );
    }
  }

  // footer
  while (lines.length < height - 1) lines.push('');
  lines.push(
    paint(
      c.bgGray + c.white,
      pad('  q/Ctrl+C sair  ·  dados: data/messages.jsonl + sessions + leads  ·  npm run cli -- help  ', width)
    )
  );

  if (process.stdout.isTTY) {
    process.stdout.write('\x1b[H');
    const h = height;
    for (let i = 0; i < h; i++) {
      const line = lines[i] ?? '';
      const plain = stripAnsi(line).length;
      const padR = plain < width ? ' '.repeat(width - plain) : '';
      process.stdout.write(line + padR + '\x1b[K\n');
    }
  } else {
    console.log(lines.filter(Boolean).join('\n'));
  }
}

function kpi(label: string, value: number, color: string): string {
  return `${paint(c.gray, label)} ${paint(color + c.bold, String(value))}`;
}

function row(width: number, content: string): string {
  return truncate(content, width);
}
