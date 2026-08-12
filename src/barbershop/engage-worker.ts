/**
 * Engajamento na fila — só automático a cada 4 min.
 * NÃO responde "Oi" (isso é no booking-flow com menu de opções).
 */
import type { Whatsapp } from '@wppconnect-team/wppconnect';
import { activeQueue, updateAppointment } from './store.js';
import { estimateWait } from './queue.js';
import { fileLog } from '../core/file-log.js';
import { card, num } from '../messaging/format.js';
import { sessionStore } from '../core/session.js';

// Menos spam: só a cada 8 min, e só se cliente não falou recentemente
const ENGAGE_EVERY_MS = 8 * 60 * 1000;

export function startEngageWorker(
  client: Whatsapp,
  sendFn: (chatId: string, text: string) => Promise<void>
): NodeJS.Timeout {
  const timer = setInterval(() => {
    void tick(client, sendFn);
  }, ENGAGE_EVERY_MS);
  timer.unref?.();
  return timer;
}

async function tick(
  _client: Whatsapp,
  sendFn: (chatId: string, text: string) => Promise<void>
): Promise<void> {
  try {
    const waiting = activeQueue().filter((a) =>
      ['waiting', 'checked_in'].includes(a.status)
    );
    for (const appt of waiting) {
      const cid = String(appt.chatId || '').toLowerCase();
      // nunca engajar chat de teste / inválido
      if (
        !cid ||
        cid.includes('barber-test') ||
        cid.includes('fix-oi') ||
        cid.includes('test@') ||
        !cid.includes('@')
      ) {
        continue;
      }
      // se cliente falou nos últimos 2 min, não interrompe
      try {
        const sess = sessionStore.get(appt.chatId);
        if (sess.lastUserMessageAt && Date.now() - sess.lastUserMessageAt < 120_000) {
          continue;
        }
      } catch {
        /* ignore */
      }

      const last = appt.lastEngageAt ? new Date(appt.lastEngageAt).getTime() : 0;
      if (Date.now() - last < ENGAGE_EVERY_MS - 5000) continue;

      const snap = estimateWait(appt);
      // mensagem CURTA — não o texto longo de "prepare-se" repetido
      const text = card('⏳ Fila', [
        `*${appt.clientName}*`,
        snap.message,
        `💈 ${appt.barberName}`,
        '',
        `${num(1)} Atualizar  ·  ${num(0)} Menu`,
      ]);

      try {
        await sendFn(appt.chatId, text);
        updateAppointment(appt.id, { lastEngageAt: new Date().toISOString() });
        fileLog('engage', `sent ${appt.id}`);
      } catch (e) {
        fileLog('engage', `fail ${appt.id}: ${e}`);
      }
    }
  } catch (e) {
    fileLog('engage', `tick err: ${e}`);
  }
}
