/** Controle de taxa para reduzir risco de ban e perda de sessão */

interface TimestampBucket {
  times: number[];
}

export class RateLimiter {
  private globalSends: number[] = [];
  private perChat = new Map<string, TimestampBucket>();
  private uniqueChatsHour: Array<{ chatId: string; at: number }> = [];

  constructor(
    private maxPerMinute: number,
    private maxPerChatPerHour: number,
    private maxUniqueChatsPerHour: number
  ) {}

  private prune(list: number[], windowMs: number, now: number): number[] {
    return list.filter((t) => now - t < windowMs);
  }

  /** Retorna null se pode enviar; senão mensagem de bloqueio interno */
  canSend(chatId: string): { ok: true } | { ok: false; reason: string; retryMs: number } {
    const now = Date.now();

    this.globalSends = this.prune(this.globalSends, 60_000, now);
    if (this.globalSends.length >= this.maxPerMinute) {
      return {
        ok: false,
        reason: 'rate_global',
        retryMs: 60_000 - (now - this.globalSends[0]),
      };
    }

    const chat = this.perChat.get(chatId) || { times: [] };
    chat.times = this.prune(chat.times, 3_600_000, now);
    if (chat.times.length >= this.maxPerChatPerHour) {
      return {
        ok: false,
        reason: 'rate_chat',
        retryMs: 3_600_000 - (now - chat.times[0]),
      };
    }

    this.uniqueChatsHour = this.uniqueChatsHour.filter((x) => now - x.at < 3_600_000);
    const known = this.uniqueChatsHour.some((x) => x.chatId === chatId);
    const uniqueCount = new Set(this.uniqueChatsHour.map((x) => x.chatId)).size;
    if (!known && uniqueCount >= this.maxUniqueChatsPerHour) {
      return { ok: false, reason: 'rate_unique_chats', retryMs: 120_000 };
    }

    return { ok: true };
  }

  recordSend(chatId: string): void {
    const now = Date.now();
    this.globalSends.push(now);
    const chat = this.perChat.get(chatId) || { times: [] };
    chat.times.push(now);
    this.perChat.set(chatId, chat);
    this.uniqueChatsHour.push({ chatId, at: now });
  }
}
