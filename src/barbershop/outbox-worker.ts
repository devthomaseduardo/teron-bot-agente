/**
 * Entrega mensagens enfileiradas pelo terminal do dono.
 * - single-flight (sem corrida no JSON)
 * - ignora chatIds de teste / inválidos
 * - marca sent só após envio; falha permanente após N tentativas
 */
import {
  claimPendingOutbox,
  markOutboxSent,
  markOutboxFailed,
} from './store.js';
import { fileLog } from '../core/file-log.js';

/** chatIds sintéticos / de teste — nunca enviar no WhatsApp real */
function isUnreachableChat(chatId: string): boolean {
  const id = String(chatId || '').toLowerCase();
  if (!id) return true;
  if (id.includes('barber-test')) return true;
  if (id.includes('fix-oi')) return true;
  if (id.includes('test@') || id.startsWith('test-')) return true;
  if (id.includes('example') || id.includes('dummy')) return true;
  // precisa de @c.us, @lid ou @s.whatsapp.net
  if (!/@/.test(id)) return true;
  return false;
}

let flushing = false;

export function startOutboxWorker(
  sendFn: (chatId: string, text: string) => Promise<void>
): NodeJS.Timeout {
  const timer = setInterval(() => {
    void flush(sendFn);
  }, 5000);
  timer.unref?.();
  // limpa fila morta no boot
  void flush(sendFn);
  return timer;
}

async function flush(
  sendFn: (chatId: string, text: string) => Promise<void>
): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    // claim marca "sending" no disco → evita reentrega por race
    const pending = claimPendingOutbox(5);
    for (const msg of pending) {
      if (isUnreachableChat(msg.chatId)) {
        markOutboxSent(msg.id, 'skip:chat-invalido');
        fileLog('outbox', `skip invalid ${msg.id} → ${msg.chatId}`);
        continue;
      }
      try {
        await sendFn(msg.chatId, `📢 *Mensagem da barbearia:*\n\n${msg.text}`);
        markOutboxSent(msg.id);
        fileLog('outbox', `sent ${msg.id} → ${msg.chatId}`);
      } catch (e) {
        const attempts = markOutboxFailed(msg.id, String(e).slice(0, 160));
        fileLog('outbox', `fail ${msg.id} (try ${attempts}): ${e}`);
      }
    }
  } finally {
    flushing = false;
  }
}
