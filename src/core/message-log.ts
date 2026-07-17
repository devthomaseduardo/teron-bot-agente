import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.jsonl');

export type MessageDirection = 'in' | 'out';

export interface MessageLogEntry {
  at: string;
  direction: MessageDirection;
  chatId: string;
  from?: string;
  type?: string;
  text: string;
  source?: string;
  meta?: Record<string, string | number | boolean>;
}

function ensureDir(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

/** Grava cada mensagem para análise / CLI */
export function logMessage(entry: MessageLogEntry): void {
  try {
    ensureDir();
    fs.appendFileSync(MESSAGES_FILE, JSON.stringify(entry) + '\n', 'utf8');
  } catch (err) {
    console.error('[message-log] falha:', err);
  }
}

export function readMessages(limit?: number): MessageLogEntry[] {
  try {
    if (!fs.existsSync(MESSAGES_FILE)) return [];
    const lines = fs.readFileSync(MESSAGES_FILE, 'utf8').split('\n').filter(Boolean);
    const slice = limit ? lines.slice(-limit) : lines;
    const out: MessageLogEntry[] = [];
    for (const line of slice) {
      try {
        out.push(JSON.parse(line) as MessageLogEntry);
      } catch {
        /* skip bad line */
      }
    }
    return out;
  } catch {
    return [];
  }
}

export function messagesFilePath(): string {
  return MESSAGES_FILE;
}
