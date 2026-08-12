/** ANSI helpers — zero dependências, terminal top */

export const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  bgBlack: '\x1b[40m',
  bgBlue: '\x1b[44m',
  bgGreen: '\x1b[42m',
  bgMagenta: '\x1b[45m',
  bgYellow: '\x1b[43m',
  bgCyan: '\x1b[46m',
  bgGray: '\x1b[100m',
  bgWhite: '\x1b[47m',
};

export function paint(color: string, text: string): string {
  return `${color}${text}${c.reset}`;
}

export function bold(text: string): string {
  return `${c.bold}${text}${c.reset}`;
}

export function dim(text: string): string {
  return `${c.dim}${text}${c.reset}`;
}

export function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

export function pad(s: string, n: number, align: 'left' | 'right' = 'left'): string {
  const plain = stripAnsi(s);
  if (plain.length >= n) return s.slice(0, n);
  const spaces = ' '.repeat(n - plain.length);
  return align === 'left' ? s + spaces : spaces + s;
}

export function truncate(s: string, max: number): string {
  const plain = stripAnsi(s);
  if (plain.length <= max) return s;
  return plain.slice(0, Math.max(0, max - 1)) + '…';
}

export function clock(d = new Date()): string {
  return d.toTimeString().slice(0, 8);
}

export function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function progressBar(ratio: number, width = 16): string {
  const r = Math.max(0, Math.min(1, ratio));
  const filled = Math.round(r * width);
  const empty = width - filled;
  return (
    paint(c.cyan, '█'.repeat(filled)) + paint(c.gray, '░'.repeat(empty))
  );
}

export function uptime(startedAt: number): string {
  const s = Math.floor((Date.now() - startedAt) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, '0')).join(':');
}
