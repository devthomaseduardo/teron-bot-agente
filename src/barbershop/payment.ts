/**
 * Pagamento — integra gateway da plataforma (MP / PIX chave / manual).
 */
import type { Appointment, PaymentInfo } from './types.js';
import { loadBarbershop, updateAppointment } from './store.js';
import { formatMoney } from './schedule.js';
import {
  createPixForAppointment,
  markPixPending,
} from '../payments/index.js';
import { buildPixEmv } from '../payments/providers/pix-key.js';
import { loadPaymentConfig } from '../payments/config.js';

/** @deprecated use createPixForAppointment — mantido sync para fluxos antigos */
export function generatePixPayload(appt: Appointment): PaymentInfo {
  const shop = loadBarbershop().shop;
  const cfg = loadPaymentConfig();
  const key = cfg.pixKey?.key || shop.pixKey || '';
  const name = cfg.pixKey?.holderName || shop.pixName || shop.name || 'LOJA';
  const txId = 'NF' + appt.id.replace(/\W/g, '').slice(-10).toUpperCase();

  let pixCode: string | undefined;
  if (key) {
    try {
      pixCode = buildPixEmv({
        key,
        name,
        city: cfg.pixKey?.city || 'SAO PAULO',
        amount: appt.price,
        txId,
      });
    } catch {
      pixCode = undefined;
    }
  }

  return {
    status: 'pending',
    method: 'pix',
    amount: appt.price,
    pixCode,
    pixTxId: txId,
    requestedAt: new Date().toISOString(),
    provider: cfg.activeProvider || 'pix_key',
  };
}

export async function generatePixPayloadAsync(
  appt: Appointment
): Promise<PaymentInfo> {
  const { pay } = await createPixForAppointment(appt);
  return pay;
}

export function paymentMessage(appt: Appointment, pay: PaymentInfo): string {
  const shop = loadBarbershop().shop;
  return (
    `💳 *Pagar*\n\n` +
    `💰 *${formatMoney(pay.amount)}*\n` +
    `✂️ ${appt.serviceName}\n\n` +
    (pay.pixCode ? `PIX copia e cola pronto no chat.\n` : '') +
    (shop.pixKey ? `Chave: \`${shop.pixKey}\`` : '')
  );
}

export function markPaymentPending(apptId: string): Appointment | null {
  // sync fallback
  const appt = updateAppointment(apptId, { status: 'awaiting_payment' });
  if (!appt) return null;
  const pay = generatePixPayload(appt);
  return updateAppointment(apptId, {
    payment: pay,
    status: 'awaiting_payment',
  });
}

export async function markPaymentPendingAsync(
  apptId: string
): Promise<Appointment | null> {
  return markPixPending(apptId);
}

export function confirmPayment(
  apptId: string,
  by: 'client' | 'owner' | 'system'
): Appointment | null {
  const appt = updateAppointment(apptId, {});
  if (!appt) return null;
  return updateAppointment(apptId, {
    status:
      appt.status === 'awaiting_payment' || appt.status === 'booked'
        ? 'paid'
        : appt.status,
    payment: {
      ...appt.payment,
      status: 'confirmed',
      confirmedAt: new Date().toISOString(),
      confirmedBy: by,
      method: appt.payment?.method || 'pix',
      amount: appt.payment?.amount || appt.price,
    },
  });
}

export function isPaid(appt: Appointment): boolean {
  return (
    appt.payment?.status === 'confirmed' ||
    appt.status === 'paid' ||
    appt.status === 'in_service' ||
    appt.status === 'done' ||
    appt.status === 'rated'
  );
}
