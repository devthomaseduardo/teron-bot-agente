import fs from 'fs';
import path from 'path';

const LEADS_FILE = path.join(process.cwd(), 'data', 'leads.jsonl');

export interface LeadEntry {
  chatId: string;
  profile: Record<string, string>;
  source: string;
  note?: string;
  at: string;
}

export function appendLead(payload: {
  chatId: string;
  profile: Record<string, string>;
  source: string;
  note?: string;
}): LeadEntry {
  const entry: LeadEntry = {
    ...payload,
    at: new Date().toISOString(),
  };

  try {
    const dir = path.dirname(LEADS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const line = JSON.stringify(entry);
    fs.appendFileSync(LEADS_FILE, line + '\n', 'utf8');

    // Webhook automático para Teron OS (se TERON_OS_WEBHOOK_URL estiver no .env)
    const webhookUrl = process.env.TERON_OS_WEBHOOK_URL;
    if (webhookUrl) {
      void notifyTeronOs(webhookUrl, entry);
    }
  } catch (err) {
    console.error('[leads] falha ao gravar:', err);
  }

  return entry;
}

export function readLeads(): LeadEntry[] {
  try {
    if (!fs.existsSync(LEADS_FILE)) return [];
    const content = fs.readFileSync(LEADS_FILE, 'utf8');
    const lines = content.split('\n').filter((l) => l.trim().length > 0);
    return lines.map((l) => JSON.parse(l) as LeadEntry);
  } catch (err) {
    console.error('[leads] falha ao ler leads:', err);
    return [];
  }
}

async function notifyTeronOs(url: string, entry: LeadEntry): Promise<void> {
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'lead_captured', lead: entry }),
    });
  } catch (e) {
    console.warn(`[leads] falha no webhook para Teron OS (${url}):`, e);
  }
}
