import fs from 'fs';
import path from 'path';

const LOG = path.join(process.cwd(), 'data', 'bot.log');

export function fileLog(tag: string, msg: string): void {
  try {
    const dir = path.dirname(LOG);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const line = `${new Date().toISOString()} [${tag}] ${msg}\n`;
    fs.appendFileSync(LOG, line, 'utf8');
  } catch {
    /* ignore */
  }
}

export function logPath(): string {
  return LOG;
}
