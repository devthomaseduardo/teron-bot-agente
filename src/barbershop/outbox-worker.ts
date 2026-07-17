/**
 * Entrega mensagens enfileiradas pelo terminal do dono.
 */
import { takePendingOutbox, markOutboxSent } from './store.js';
import { fileLog } from '../core/file-log.js';

export function startOutboxWorker(
  sendFn: (chatId: string, text: string) => Promise<void>
): NodeJS.Timeout {
  const timer = setInterval(() => {
    void flush(sendFn);
  }, 4000);
  timer.unref?.();
  return timer;
}

async function flush(
  sendFn: (chatId: string, text: string) => Promise<void>
): Promise<void> {
  const pending = takePendingOutbox();
  for (const msg of pending) {
    try {
      await sendFn(msg.chatId, `📢 *Mensagem da barbearia:*\n\n${msg.text}`);
      markOutboxSent(msg.id);
      fileLog('outbox', `sent ${msg.id} → ${msg.chatId}`);
    } catch (e) {
      fileLog('outbox', `fail ${msg.id}: ${e}`);
    }
  }
}
