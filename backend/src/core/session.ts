import fs from 'fs';
import path from 'path';
import type { ChatSession } from '../config/types.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function blankSession(chatId: string): ChatSession {
  const now = Date.now();
  return {
    chatId,
    createdAt: now,
    updatedAt: now,
    state: null,
    flowId: null,
    stepId: null,
    profile: {},
    messageCount: 0,
    lastUserMessageAt: 0,
    lastBotMessageAt: 0,
    humanHandoff: false,
    offlineNotified: false,
    greeted: false,
    lastIntentId: null,
    topic: null,
    awaiting: null,
    summary: '',
    history: [],
  };
}

/** Migra sessões antigas sem campos novos */
function normalizeSession(raw: Partial<ChatSession> & { chatId: string }): ChatSession {
  const base = blankSession(raw.chatId);
  return {
    ...base,
    ...raw,
    profile: raw.profile || {},
    history: raw.history || [],
    greeted: raw.greeted ?? (raw.history?.some((h) => h.role === 'assistant') || false),
    lastIntentId: raw.lastIntentId ?? null,
    topic: raw.topic ?? null,
    awaiting: raw.awaiting ?? null,
    summary: raw.summary ?? '',
    offlineNotified: raw.offlineNotified ?? false,
    humanHandoff: raw.humanHandoff ?? false,
  };
}

export class SessionStore {
  private sessions = new Map<string, ChatSession>();

  constructor() {
    this.load();
  }

  private load(): void {
    ensureDataDir();
    try {
      if (!fs.existsSync(SESSIONS_FILE)) return;
      const raw = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8')) as ChatSession[];
      for (const s of raw) {
        this.sessions.set(s.chatId, normalizeSession(s));
      }
    } catch {
      console.warn('[session] Não foi possível carregar sessions.json — iniciando vazio.');
    }
  }

  persist(): void {
    ensureDataDir();
    const all = Array.from(this.sessions.values());
    all.sort((a, b) => b.updatedAt - a.updatedAt);
    const trimmed = all.slice(0, 500);
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(trimmed, null, 2), 'utf8');
  }

  get(chatId: string): ChatSession {
    let s = this.sessions.get(chatId);
    if (!s) {
      s = blankSession(chatId);
      this.sessions.set(chatId, s);
    }
    return s;
  }

  touchUser(chatId: string, text: string): ChatSession {
    const s = this.get(chatId);
    s.updatedAt = Date.now();
    s.lastUserMessageAt = s.updatedAt;
    s.messageCount += 1;
    s.history.push({ role: 'user', text, at: s.updatedAt });
    if (s.history.length > 50) s.history = s.history.slice(-50);
    // acumula resumo simples
    if (text.length > 8 && text.length < 200) {
      if (!s.summary) s.summary = text;
      else if (!s.summary.includes(text.slice(0, 40))) {
        s.summary = (s.summary + ' | ' + text).slice(0, 400);
      }
    }
    return s;
  }

  touchBot(chatId: string, text: string): void {
    const s = this.get(chatId);
    s.updatedAt = Date.now();
    s.lastBotMessageAt = s.updatedAt;
    s.greeted = true;
    s.history.push({ role: 'assistant', text, at: s.updatedAt });
    if (s.history.length > 50) s.history = s.history.slice(-50);
  }

  setProfile(chatId: string, field: string, value: string): void {
    const s = this.get(chatId);
    s.profile[field] = value;
    s.updatedAt = Date.now();
  }

  setFlow(chatId: string, flowId: string | null, stepId: string | null): void {
    const s = this.get(chatId);
    s.flowId = flowId;
    s.stepId = stepId;
    s.state = flowId ? `flow:${flowId}:${stepId}` : null;
    s.updatedAt = Date.now();
  }

  setHandoff(chatId: string, value: boolean): void {
    const s = this.get(chatId);
    s.humanHandoff = value;
    s.updatedAt = Date.now();
  }

  setTopic(
    chatId: string,
    topic: string | null,
    opts?: { intentId?: string | null; awaiting?: string | null }
  ): void {
    const s = this.get(chatId);
    s.topic = topic;
    if (opts?.intentId !== undefined) s.lastIntentId = opts.intentId;
    if (opts?.awaiting !== undefined) s.awaiting = opts.awaiting;
    s.updatedAt = Date.now();
  }

  clearFlow(chatId: string): void {
    this.setFlow(chatId, null, null);
  }

  /**
   * Reinicia conversa do chat (anti-loop).
   * Mantém nome se já souber.
   */
  resetConversation(
    chatId: string,
    opts?: { keepName?: boolean }
  ): ChatSession {
    const prev = this.get(chatId);
    const name = opts?.keepName !== false ? prev.profile?.name : undefined;
    const fresh = blankSession(chatId);
    if (name) fresh.profile.name = name;
    fresh.createdAt = prev.createdAt || fresh.createdAt;
    this.sessions.set(chatId, fresh);
    return fresh;
  }

  /** Se o cliente sumiu por X ms, limpa fluxo */
  maybeIdleReset(chatId: string, idleMs = 30 * 60_000): boolean {
    const s = this.get(chatId);
    const last = Math.max(s.lastUserMessageAt || 0, s.lastBotMessageAt || 0);
    if (!last) return false;
    // touchUser já atualizou lastUser — usar updatedAt anterior via history
    const lastUserPrev =
      s.history.filter((h) => h.role === 'user').slice(-2)[0]?.at || 0;
    // se a penúltima msg do user foi há mais de idleMs (conversa voltou depois de sumiço)
    if (lastUserPrev && s.lastUserMessageAt - lastUserPrev > idleMs) {
      this.resetConversation(chatId);
      return true;
    }
    // se última atividade total é antiga (não usa na msg atual)
    if (Date.now() - s.updatedAt > idleMs * 2) {
      this.resetConversation(chatId);
      return true;
    }
    return false;
  }

  bumpFail(chatId: string): number {
    const s = this.get(chatId);
    const n = Number(s.profile._fails || 0) + 1;
    s.profile._fails = String(n);
    s.updatedAt = Date.now();
    return n;
  }

  clearFails(chatId: string): void {
    const s = this.get(chatId);
    delete s.profile._fails;
  }

  /** Histórico formatado para a IA */
  historyForAI(chatId: string, limit = 16): Array<{ role: 'user' | 'assistant'; content: string }> {
    const s = this.get(chatId);
    return s.history.slice(-limit).map((h) => ({
      role: h.role === 'assistant' ? 'assistant' : 'user',
      content: h.text,
    }));
  }

  contextSummary(chatId: string): string {
    const s = this.get(chatId);
    const lines = [
      s.topic ? `Tópico atual: ${s.topic}` : null,
      s.awaiting ? `Aguardando do cliente: ${s.awaiting}` : null,
      s.lastIntentId ? `Último intent: ${s.lastIntentId}` : null,
      s.summary ? `Resumo da conversa: ${s.summary}` : null,
      Object.keys(s.profile).length
        ? `Dados capturados: ${JSON.stringify(s.profile)}`
        : null,
      s.flowId ? `Fluxo ativo: ${s.flowId}/${s.stepId}` : null,
    ].filter(Boolean);
    return lines.join('\n');
  }
}

export const sessionStore = new SessionStore();

const persistTimer = setInterval(() => sessionStore.persist(), 30_000);
persistTimer.unref?.();
process.on('exit', () => sessionStore.persist());
process.on('SIGINT', () => {
  sessionStore.persist();
  process.exit(0);
});
