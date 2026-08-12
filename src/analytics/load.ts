import fs from 'fs';
import path from 'path';
import type { ChatSession } from '../config/types.js';
import { readMessages, type MessageLogEntry } from '../core/message-log.js';

const DATA = path.join(process.cwd(), 'data');

export interface LeadRecord {
  chatId: string;
  profile: Record<string, string>;
  source: string;
  note?: string;
  at: string;
}

export function loadSessions(): ChatSession[] {
  const file = path.join(DATA, 'sessions.json');
  try {
    if (!fs.existsSync(file)) return [];
    return JSON.parse(fs.readFileSync(file, 'utf8')) as ChatSession[];
  } catch {
    return [];
  }
}

export function loadLeads(): LeadRecord[] {
  const file = path.join(DATA, 'leads.jsonl');
  try {
    if (!fs.existsSync(file)) return [];
    return fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l) as LeadRecord;
        } catch {
          return null;
        }
      })
      .filter(Boolean) as LeadRecord[];
  } catch {
    return [];
  }
}

export function loadMessages(limit?: number): MessageLogEntry[] {
  return readMessages(limit);
}

export function dataPaths() {
  return {
    data: DATA,
    sessions: path.join(DATA, 'sessions.json'),
    leads: path.join(DATA, 'leads.jsonl'),
    messages: path.join(DATA, 'messages.jsonl'),
    tokens: path.join(process.cwd(), 'tokens'),
  };
}
