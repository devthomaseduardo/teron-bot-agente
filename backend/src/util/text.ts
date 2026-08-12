import type { PersonaConfig } from '../config/types.js';

const ROLE_LABELS: Record<string, string> = {
  assistant: 'assistente virtual',
  agent: 'agente de atendimento',
  representative: 'representante comercial',
  secretary: 'secretária virtual',
  support: 'suporte ao cliente',
  sales: 'consultora de vendas',
};

/** Interpola {name}, {company}, profile fields, etc. */
export function interpolate(
  template: string,
  persona: PersonaConfig,
  profile: Record<string, string> = {},
  extra: Record<string, string> = {}
): string {
  const map: Record<string, string> = {
    name: persona.name,
    company: persona.companyName,
    companyDescription: persona.companyDescription,
    role: persona.role,
    roleLabel: ROLE_LABELS[persona.role] || persona.role,
    handoff: persona.handoffMessage,
    menuUrl: process.env.MENU_URL || '(link do cardápio)',
    ...profile,
    ...extra,
  };

  return template.replace(/\{(\w+)\}/g, (_, key: string) => map[key] ?? `{${key}}`);
}

export function normalize(text: string): string {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/** Quebra texto longo em bolhas naturais (por parágrafo / frase) */
export function splitIntoBubbles(text: string, maxLen = 350): string[] {
  const cleaned = text.replace(/\r/g, '').trim();
  if (!cleaned) return [];

  // Preferir quebra por linhas duplas
  const paragraphs = cleaned.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const bubbles: string[] = [];

  for (const p of paragraphs) {
    if (p.length <= maxLen) {
      bubbles.push(p);
      continue;
    }
    // Quebra por frases
    const sentences = p.match(/[^.!?]+[.!?]+["']?|[^.!?]+$/g) || [p];
    let buf = '';
    for (const s of sentences) {
      const piece = s.trim();
      if (!piece) continue;
      if ((buf + ' ' + piece).trim().length > maxLen) {
        if (buf) bubbles.push(buf.trim());
        buf = piece;
      } else {
        buf = (buf + ' ' + piece).trim();
      }
    }
    if (buf) bubbles.push(buf.trim());
  }

  return bubbles.length ? bubbles : [cleaned];
}

export function parseTimeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function isWithinHours(
  start: string,
  end: string,
  now = new Date()
): boolean {
  const mins = now.getHours() * 60 + now.getMinutes();
  const a = parseTimeToMinutes(start);
  const b = parseTimeToMinutes(end);
  if (a <= b) return mins >= a && mins <= b;
  // cruza meia-noite
  return mins >= a || mins <= b;
}
