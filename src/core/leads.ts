import fs from 'fs';
import path from 'path';

const LEADS_FILE = path.join(process.cwd(), 'data', 'leads.jsonl');

export function appendLead(payload: {
  chatId: string;
  profile: Record<string, string>;
  source: string;
  note?: string;
}): void {
  try {
    const dir = path.dirname(LEADS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const line = JSON.stringify({
      ...payload,
      at: new Date().toISOString(),
    });
    fs.appendFileSync(LEADS_FILE, line + '\n', 'utf8');
  } catch (err) {
    console.error('[leads] falha ao gravar:', err);
  }
}
