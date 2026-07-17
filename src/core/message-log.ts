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

/** Grava cada mensagem para análise / CLI / painel ao vivo */
export function logMessage(entry: MessageLogEntry): void {
  try {
    ensureDir();
    fs.appendFileSync(MESSAGES_FILE, JSON.stringify(entry) + '\n', 'utf8');
    // carimbo para watchers (SSE do painel)
    try {
      fs.writeFileSync(
        path.join(DATA_DIR, 'messages.stamp'),
        entry.at || new Date().toISOString(),
        'utf8'
      );
    } catch {
      /* ignore stamp */
    }
  } catch (err) {
    console.error('[message-log] falha:', err);
  }
}

/** Últimas mensagens, opcionalmente de um chat */
export function readRecentMessages(
  limit = 80,
  chatId?: string
): MessageLogEntry[] {
  const all = readMessages(Math.max(limit * 4, 200));
  const filtered = chatId
    ? all.filter((m) => m.chatId === chatId || m.from === chatId)
    : all;
  return filtered.slice(-limit);
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
