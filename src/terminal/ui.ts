import {
  bold,
  c,
  clock,
  dim,
  fmtMs,
  paint,
  pad,
  progressBar,
  stripAnsi,
  truncate,
  uptime,
} from './theme.js';

export type ConnStatus =
  | 'starting'
  | 'qr'
  | 'connecting'
  | 'online'
  | 'offline'
  | 'error';

export interface DashboardMeta {
  mode: string;
  ai: string;
  niche: string;
  persona: string;
  company: string;
  session: string;
  hasToken: boolean;
}

interface LogLine {
  at: number;
  kind: 'in' | 'out' | 'sys' | 'warn' | 'err' | 'delay' | 'type' | 'ok' | 'qr';
  text: string;
}

/**
 * Terminal dashboard fixo no topo + feed de mensagens.
 * 100% terminal — sem frontend web.
 */
export class TerminalUI {
  private meta: DashboardMeta;
  private status: ConnStatus = 'starting';
  private statusDetail = 'iniciando…';
  private logs: LogLine[] = [];
  private maxLogs = 80;
  private startedAt = Date.now();
  private stats = { in: 0, out: 0, errors: 0, blocked: 0 };
  private activity = '';
  private activityUntil = 0;
  private renderTimer: NodeJS.Timeout | null = null;
  private live = true;
  private qrLines: string[] = [];
  private originalLog = console.log;
  private originalWarn = console.warn;
  private originalError = console.error;
  private patched = false;

  constructor(meta: DashboardMeta) {
    this.meta = meta;
    if (process.stdout.isTTY) {
      process.stdout.write('\x1b[?25l'); // hide cursor
      this.clearScreen();
    }
    this.render();
    // refresh uptime
    this.renderTimer = setInterval(() => this.render(), 1000);
    this.renderTimer.unref?.();

    process.stdout.on('resize', () => this.render());
  }

  /** Silencia console ruidoso e manda pro feed */
  patchConsole(): void {
    if (this.patched) return;
    this.patched = true;
    console.log = (...args: unknown[]) => {
      const msg = args.map(String).join(' ');
      if (this.shouldDrop(msg)) return;
      this.sys(msg);
    };
    console.warn = (...args: unknown[]) => {
      const msg = args.map(String).join(' ');
      if (this.shouldDrop(msg)) return;
      this.warn(msg);
    };
    console.error = (...args: unknown[]) => {
      const msg = args.map(String).join(' ');
      if (this.shouldDrop(msg)) return;
      this.error(msg);
    };
  }

  restoreConsole(): void {
    if (!this.patched) return;
    console.log = this.originalLog;
    console.warn = this.originalWarn;
    console.error = this.originalError;
    this.patched = false;
    if (process.stdout.isTTY) process.stdout.write('\x1b[?25h');
  }

  private shouldDrop(msg: string): boolean {
    const drop = [
      'Checking for updates',
      'new version of Wppconnect',
      'Update your package',
      'For more info visit',
      'wapi.js',
      'Exposing on',
      'Setting WhatsApp WEB version',
      'Loading WhatsApp WEB',
      'Injecting',
      'checking headless',
      'headless option',
      'Using browser folder',
      'Initializing browser',
      'Waiting page load',
      'Checking is logged',
      'Checking QRCode status',
      'Auto close',
      'Current state:',
      'WA-JS version',
      'WhatsApp WEB version',
      'Emitting onInterfaceChange',
    ];
    return drop.some((d) => msg.includes(d));
  }

  setStatus(status: ConnStatus, detail?: string): void {
    this.status = status;
    if (detail) this.statusDetail = detail;
    this.render();
  }

  setActivity(text: string, ms = 2000): void {
    this.activity = text;
    this.activityUntil = Date.now() + ms;
    this.render();
  }

  showQR(ascii: string, url?: string): void {
    this.status = 'qr';
    this.statusDetail = 'escaneie o QR no WhatsApp';
    this.qrLines = ascii.split('\n').filter(Boolean);
    if (url) {
      this.push('qr', `QR web: ${url}`);
    }
    this.push('qr', 'WhatsApp → Aparelhos conectados → Conectar um aparelho');
    this.render();
  }

  clearQR(): void {
    this.qrLines = [];
  }

  inbound(from: string, text: string, type = 'chat'): void {
    this.stats.in += 1;
    this.push('in', `${shortId(from)}  ${type !== 'chat' ? `[${type}] ` : ''}${text}`);
    this.setActivity(`← recebendo de ${shortId(from)}`, 1500);
  }

  outbound(to: string, text: string, source?: string): void {
    this.stats.out += 1;
    const tag = source ? paint(c.dim, `[${source}] `) : '';
    this.push('out', `${shortId(to)}  ${tag}${text}`);
  }

  buffering(from: string, waitMs: number): void {
    this.setActivity(
      `⏳ buffer ${fmtMs(waitMs)} — aguardando mais msgs de ${shortId(from)}`,
      waitMs
    );
    this.push('delay', `buffer ${fmtMs(waitMs)} · ${shortId(from)}`);
  }

  async humanDelay(label: string, ms: number): Promise<void> {
    const steps = Math.max(8, Math.min(24, Math.floor(ms / 120)));
    const stepMs = ms / steps;
    for (let i = 1; i <= steps; i++) {
      const ratio = i / steps;
      this.setActivity(
        `${label} ${progressBar(ratio)} ${fmtMs(Math.floor(ms * ratio))}/${fmtMs(ms)}`,
        stepMs + 50
      );
      this.render();
      await sleep(stepMs);
    }
  }

  sys(text: string): void {
    this.push('sys', text);
  }

  ok(text: string): void {
    this.push('ok', text);
  }

  warn(text: string): void {
    this.push('warn', text);
  }

  error(text: string): void {
    this.stats.errors += 1;
    this.push('err', text);
  }

  blocked(reason: string): void {
    this.stats.blocked += 1;
    this.push('warn', `bloqueado: ${reason}`);
  }

  thinking(source: string): void {
    this.setActivity(`🧠 processando (${source})…`, 3000);
  }

  private push(kind: LogLine['kind'], text: string): void {
    this.logs.push({ at: Date.now(), kind, text: String(text) });
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }
    if (!process.stdout.isTTY) {
      // PM2 / pipe: log linear sem redraw
      this.originalLog(`[${kind}] ${text}`);
      return;
    }
    this.render();
  }

  private clearScreen(): void {
    process.stdout.write('\x1b[2J\x1b[H');
  }

  private cols(): number {
    return process.stdout.columns || 80;
  }

  private rows(): number {
    return process.stdout.rows || 24;
  }

  render(): void {
    if (!this.live) return;
    if (!process.stdout.isTTY) {
      // fallback plain
      return;
    }

    const width = Math.max(60, this.cols());
    const height = this.rows();
    const lines: string[] = [];

    // ── header fixo ──
    lines.push(paint(c.bgCyan + c.black + c.bold, pad('  AGENTE COMERCIAL · TERMINAL  ', width)));
    lines.push(this.borderLine(width, 'top'));

    const statusBadge = this.statusBadge();
    lines.push(
      this.row(
        width,
        `${statusBadge}  ${paint(c.white, this.statusDetail)}`
      )
    );
    lines.push(
      this.row(
        width,
        `${paint(c.cyan, 'modo')} ${bold(this.meta.mode)}  ${paint(c.cyan, 'ia')} ${this.meta.ai}  ${paint(c.cyan, 'nicho')} ${this.meta.niche}`
      )
    );
    lines.push(
      this.row(
        width,
        `${paint(c.cyan, 'persona')} ${this.meta.persona} · ${this.meta.company}  ${paint(c.cyan, 'sessão')} ${this.meta.session}${this.meta.hasToken ? paint(c.green, ' ●token') : paint(c.yellow, ' ○qr')}`
      )
    );

    const act =
      Date.now() < this.activityUntil && this.activity
        ? this.activity
        : dim('aguardando mensagens privadas…');
    lines.push(this.row(width, `${paint(c.magenta, '●')} ${act}`));

    lines.push(
      this.row(
        width,
        `${paint(c.green, `↓${this.stats.in}`)}  ${paint(c.blue, `↑${this.stats.out}`)}  ${paint(c.red, `✗${this.stats.errors}`)}  ${paint(c.yellow, `⊘${this.stats.blocked}`)}  ${paint(c.gray, `uptime ${uptime(this.startedAt)}`)}  ${paint(c.gray, 'grupos OFF')}`
      )
    );
    lines.push(this.borderLine(width, 'mid'));

    // QR se necessário
    if (this.qrLines.length && this.status === 'qr') {
      lines.push(this.row(width, paint(c.yellow + c.bold, ' QR CODE — Abasteça no Painel ou link se o terminal for pequeno ')));
      const maxQr = height > 35 ? this.qrLines.length : Math.min(this.qrLines.length, Math.max(15, height - 12));
      for (let i = 0; i < Math.min(this.qrLines.length, maxQr); i++) {
        lines.push(paint(c.white, this.qrLines[i]));
      }
      if (maxQr < this.qrLines.length) {
        lines.push(paint(c.yellow, ' ⚠️  Terminal pequeno (QR cortado no terminal) — Abra http://localhost:8787/ ou o link do QR '));
      }
      lines.push(this.borderLine(width, 'mid'));
    }

    // ── feed ──
    const headerLines = lines.length + 2; // + footer
    const feedSpace = Math.max(6, height - headerLines - 1);
    const feed = this.logs.slice(-feedSpace);

    for (const item of feed) {
      lines.push(this.formatLog(item, width));
    }

    // preenche espaço vazio do feed
    while (lines.length < height - 1) {
      lines.push('');
    }

    // footer fixo
    lines.push(
      paint(
        c.bgGray + c.white,
        pad(
          `  Ctrl+C sair sem logout  ·  tokens/ preservados  ·  só chat privado  ·  delays humanos ON  `,
          width
        )
      )
    );

    // desenha
    process.stdout.write('\x1b[H'); // home
    for (let i = 0; i < height; i++) {
      const line = lines[i] ?? '';
      const plainLen = stripAnsi(line).length;
      const padRight = plainLen < width ? ' '.repeat(width - plainLen) : '';
      process.stdout.write(line + padRight + '\x1b[K\n');
    }
  }

  private formatLog(item: LogLine, width: number): string {
    const t = paint(c.gray, clock(new Date(item.at)));
    const icons: Record<LogLine['kind'], string> = {
      in: paint(c.green + c.bold, ' IN '),
      out: paint(c.blue + c.bold, ' OUT'),
      sys: paint(c.gray, ' ·  '),
      warn: paint(c.yellow + c.bold, ' !  '),
      err: paint(c.red + c.bold, ' ERR'),
      delay: paint(c.magenta, ' ⏳ '),
      type: paint(c.cyan, ' ⌨  '),
      ok: paint(c.green, ' ✓  '),
      qr: paint(c.yellow, ' QR '),
    };
    const body = truncate(item.text.replace(/\n/g, ' ↵ '), width - 16);
    return `${t} ${icons[item.kind]} ${body}`;
  }

  private statusBadge(): string {
    switch (this.status) {
      case 'online':
        return paint(c.bgGreen + c.black + c.bold, ' ONLINE ');
      case 'qr':
        return paint(c.bgMagenta + c.white + c.bold, ' QR CODE ');
      case 'connecting':
        return paint(c.bgCyan + c.black + c.bold, ' CONECTANDO ');
      case 'offline':
        return paint(c.bgGray + c.white + c.bold, ' OFFLINE ');
      case 'error':
        return paint(c.bgBlack + c.red + c.bold, ' ERRO ');
      default:
        return paint(c.bgGray + c.white + c.bold, ' START ');
    }
  }

  private borderLine(width: number, kind: 'top' | 'mid' | 'bot'): string {
    const ch = kind === 'mid' ? '─' : '═';
    return paint(c.cyan, ch.repeat(width));
  }

  private row(width: number, content: string): string {
    const inner = truncate(content, width - 4);
    return paint(c.cyan, '│ ') + inner;
  }

  destroy(): void {
    this.live = false;
    if (this.renderTimer) clearInterval(this.renderTimer);
    this.restoreConsole();
    if (process.stdout.isTTY) {
      process.stdout.write('\x1b[?25h\n');
    }
  }
}

function shortId(id: string): string {
  const n = String(id).replace('@c.us', '').replace('@s.whatsapp.net', '');
  if (n.length <= 14) return n;
  return n.slice(0, 6) + '…' + n.slice(-4);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Singleton acessível por sender / whatsapp */
let uiRef: TerminalUI | null = null;

export function setUI(ui: TerminalUI): void {
  uiRef = ui;
}

export function getUI(): TerminalUI | null {
  return uiRef;
}
