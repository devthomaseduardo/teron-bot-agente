import type { Whatsapp } from '@wppconnect-team/wppconnect';
import type { AntiBanConfig } from '../config/types.js';
import { RateLimiter } from './rate-limiter.js';
import {
  computeBubbleGap,
  computeReplyDelay,
  computeTypingMs,
  sleep,
} from './humanizer.js';
import { splitIntoBubbles } from '../util/text.js';
import { isWithinHours } from '../util/text.js';
import { getUI } from '../terminal/ui.js';
import { logMessage } from '../core/message-log.js';

/** WhatsApp: grupos = @g.us | listas = @broadcast */
function isGroupTarget(id: string): boolean {
  if (!id) return false;
  const lower = String(id).toLowerCase();
  return lower.includes('@g.us') || lower.includes('@broadcast');
}

export class SafeSender {
  private limiter: RateLimiter;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private client: Whatsapp,
    private cfg: AntiBanConfig
  ) {
    this.limiter = new RateLimiter(
      cfg.maxMessagesPerMinute,
      cfg.maxMessagesPerChatPerHour,
      cfg.maxUniqueChatsPerHour
    );
  }

  /** Enfileira envio para não disparar em paralelo (anti-ban) */
  send(
    chatId: string,
    targetNumber: string,
    text: string,
    source?: string
  ): Promise<void> {
    const job = this.queue.then(() =>
      this.sendNow(chatId, targetNumber, text, source)
    );
    this.queue = job.catch((err) => {
      getUI()?.error(`fila de envio: ${String(err)}`);
    });
    return job;
  }

  private async sendNow(
    chatId: string,
    targetNumber: string,
    text: string,
    source?: string
  ): Promise<void> {
    const ui = getUI();

    if (isGroupTarget(chatId) || isGroupTarget(targetNumber)) {
      ui?.blocked('destino é grupo');
      return;
    }

    if (this.cfg.quietHours) {
      if (isWithinHours(this.cfg.quietHours.start, this.cfg.quietHours.end)) {
        ui?.warn('quiet hours — envio pausado');
        return;
      }
    }

    const gate = this.limiter.canSend(chatId);
    if (!gate.ok) {
      ui?.warn(`rate limit (${gate.reason}) — aguardando…`);
      if (ui) await ui.humanDelay('rate limit', Math.min(gate.retryMs, 15_000));
      else await sleep(Math.min(gate.retryMs, 15_000));
      const again = this.limiter.canSend(chatId);
      if (!again.ok) {
        ui?.blocked('rate limit ainda ativo — protege sessão');
        return;
      }
    }

    // Delay humano (mais curto para não parecer “morto”)
    const delay = computeReplyDelay(this.cfg);
    ui?.setActivity(`⏳ delay ${Math.round(delay)}ms`, delay);
    await sleep(delay);

    if (this.cfg.markAsRead) {
      try {
        await this.client.sendSeen(targetNumber);
        ui?.setActivity('👁 lido', 600);
      } catch {
        /* ignore */
      }
    }

    const bubbles = splitIntoBubbles(text);
    for (let i = 0; i < bubbles.length; i++) {
      const bubble = bubbles[i];
      const typingMs = computeTypingMs(bubble, this.cfg);

      ui?.setActivity(`⌨ digitando ${Math.round(typingMs)}ms`, typingMs);
      try {
        await this.client.startTyping(targetNumber, typingMs);
      } catch {
        await sleep(typingMs);
      }

      try {
        await this.client.sendText(targetNumber, bubble);
        this.limiter.recordSend(chatId);
        logMessage({
          at: new Date().toISOString(),
          direction: 'out',
          chatId,
          from: targetNumber,
          type: 'chat',
          text: bubble,
          source: source || `bolha ${i + 1}/${bubbles.length}`,
        });
        ui?.outbound(
          targetNumber,
          bubble,
          source || `bolha ${i + 1}/${bubbles.length}`
        );
      } catch (err) {
        ui?.error(`falha sendText: ${String(err)}`);
        // fallback: tenta sendText sem typing
        try {
          await this.client.sendText(targetNumber, bubble);
          ui?.outbound(targetNumber, bubble, 'retry');
        } catch (e2) {
          ui?.error(`sendText retry: ${String(e2)}`);
        }
      }

      if (i < bubbles.length - 1) {
        const gap = computeBubbleGap(this.cfg);
        await sleep(gap);
      }
    }
  }
}
