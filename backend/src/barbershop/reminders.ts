/**
 * Lembretes automáticos D-1 e 2h antes.
 */
import fs from 'fs';
import path from 'path';
import { loadAppointments, updateAppointment } from './store.js';
import { loadBarbershop } from './store.js';
import { formatMoney, formatDuration } from './schedule.js';
import { fileLog } from '../core/file-log.js';
import { num } from '../messaging/format.js';

const SENT_PATH = path.join(process.cwd(), 'data', 'reminders-sent.json');

type SentMap = Record<string, string[]>; // apptId -> ['d1','h2']

function loadSent(): SentMap {
  try {
    if (!fs.existsSync(SENT_PATH)) return {};
    return JSON.parse(fs.readFileSync(SENT_PATH, 'utf8')) as SentMap;
  } catch {
    return {};
  }
}

function saveSent(m: SentMap): void {
  const dir = path.dirname(SENT_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SENT_PATH, JSON.stringify(m, null, 2), 'utf8');
}

function markSent(apptId: string, kind: string): void {
  const m = loadSent();
  const arr = m[apptId] || [];
  if (!arr.includes(kind)) arr.push(kind);
  m[apptId] = arr;
  saveSent(m);
}

function wasSent(apptId: string, kind: string): boolean {
  return (loadSent()[apptId] || []).includes(kind);
}

function apptDateTime(date: string, time: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

export function buildReminderText(
  appt: {
    clientName: string;
    serviceName: string;
    barberName: string;
    date: string;
    time: string;
    price: number;
    durationMin: number;
    id: string;
  },
  kind: 'd1' | 'h2'
): string {
  const shop = loadBarbershop().shop;
  const when = kind === 'd1' ? 'amanhã' : 'em ~2 horas';
  return (
    `🔔 *Lembrete — ${shop.name}*\n\n` +
    `Oi *${appt.clientName}*! Seu horário é *${when}*.\n\n` +
    `📅 ${appt.date} às *${appt.time}*\n` +
    `✂️ ${appt.serviceName} (${formatDuration(appt.durationMin)})\n` +
    `💈 ${appt.barberName}\n` +
    `💰 ${formatMoney(appt.price)}\n` +
    `📍 ${shop.address}\n\n` +
    `${num(1)} ✅ Vou\n` +
    `${num(2)} 🔄 Remarcar\n` +
    `${num(3)} ❌ Cancelar\n` +
    `${num(4)} 📍 GPS\n\n` +
    `_Código: ${appt.id}_`
  );
}

/**
 * Verifica e enfileira lembretes. Retorna mensagens a enviar.
 */
export function collectDueReminders(): Array<{
  chatId: string;
  text: string;
  apptId: string;
  kind: 'd1' | 'h2';
}> {
  const now = Date.now();
  const out: Array<{
    chatId: string;
    text: string;
    apptId: string;
    kind: 'd1' | 'h2';
  }> = [];

  const active = loadAppointments().filter((a) =>
    ['booked', 'paid', 'awaiting_payment'].includes(a.status)
  );

  for (const a of active) {
    const when = apptDateTime(a.date, a.time).getTime();
    const diffH = (when - now) / (1000 * 60 * 60);

    // D-1: entre 20h e 28h antes (janela ~1 dia)
    if (diffH <= 28 && diffH >= 20 && !wasSent(a.id, 'd1')) {
      out.push({
        chatId: a.chatId,
        text: buildReminderText(a, 'd1'),
        apptId: a.id,
        kind: 'd1',
      });
    }

    // 2h: entre 1.5h e 2.5h antes
    if (diffH <= 2.5 && diffH >= 1.5 && !wasSent(a.id, 'h2')) {
      out.push({
        chatId: a.chatId,
        text: buildReminderText(a, 'h2'),
        apptId: a.id,
        kind: 'h2',
      });
    }
  }

  return out;
}

export function startReminderWorker(
  sendFn: (chatId: string, text: string) => Promise<void>,
  onSent?: (chatId: string, apptId: string) => void
): NodeJS.Timeout {
  const tick = async () => {
    try {
      const due = collectDueReminders();
      for (const r of due) {
        try {
          await sendFn(r.chatId, r.text);
          markSent(r.apptId, r.kind);
          updateAppointment(r.apptId, {
            notes: `reminder_${r.kind}_sent`,
          });
          onSent?.(r.chatId, r.apptId);
          fileLog('reminder', `${r.kind} → ${r.chatId} ${r.apptId}`);
        } catch (e) {
          fileLog('reminder', `fail ${r.apptId}: ${e}`);
        }
      }
    } catch (e) {
      fileLog('reminder', `tick: ${e}`);
    }
  };

  void tick();
  const t = setInterval(() => void tick(), 5 * 60 * 1000); // 5 min
  t.unref?.();
  return t;
}
