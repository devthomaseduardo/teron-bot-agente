/**
 * Gateway de pagamento da plataforma.
 */
import type { ChargeRequest, ChargeResult, PaymentProviderId } from './types.js';
import {
  loadPaymentConfig,
  paymentProviderSummary,
  savePaymentConfig,
} from './config.js';
import { createMercadoPagoProvider } from './providers/mercado-pago.js';
import { createPixKeyProvider } from './providers/pix-key.js';
import type { Appointment, PaymentInfo } from '../barbershop/types.js';
import {
  loadAppointments,
  loadBarbershop,
  updateAppointment,
} from '../barbershop/store.js';

export {
  loadPaymentConfig,
  savePaymentConfig,
  paymentProviderSummary,
  bankLabel,
} from './config.js';
export type { PaymentProviderConfig, ChargeResult } from './types.js';
export {
  handleMercadoPagoWebhook,
  createCheckoutPreference,
} from './providers/mercado-pago.js';

export async function createPixForAppointment(
  appt: Appointment
): Promise<{ pay: PaymentInfo; charge: ChargeResult }> {
  const cfg = loadPaymentConfig();
  const providerId: PaymentProviderId = cfg.activeProvider || 'pix_key';

  const req: ChargeRequest = {
    amount: appt.price,
    description: `${appt.serviceName} · ${appt.clientName} · ${appt.date} ${appt.time}`,
    externalId: appt.id,
    payerName: appt.clientName,
    payerEmail: undefined,
  };

  let charge: ChargeResult;

  if (providerId === 'mercado_pago' && cfg.mercadoPago?.accessToken) {
    charge = await createMercadoPagoProvider().createPixCharge(req);
    // fallback automático para chave PIX se MP falhar
    if (!charge.ok) {
      const fallback = await createPixKeyProvider().createPixCharge(req);
      if (fallback.ok) {
        charge = {
          ...fallback,
          message: `Mercado Pago indisponível (${charge.message}). Usei sua chave PIX.`,
        };
      }
    }
  } else {
    charge = await createPixKeyProvider().createPixCharge(req);
  }

  // se ainda falhou, monta info mínima com chave da loja
  const shop = loadBarbershop().shop;
  const pay: PaymentInfo = {
    status: charge.status === 'approved' ? 'confirmed' : 'pending',
    method: 'pix',
    amount: appt.price,
    pixCode: charge.pixCopyPaste,
    pixTxId: charge.providerPaymentId || charge.externalId,
    requestedAt: new Date().toISOString(),
    provider: charge.provider,
    providerPaymentId: charge.providerPaymentId,
    checkoutUrl: charge.checkoutUrl,
    pixQrBase64: charge.pixQrBase64,
    providerMessage: charge.message,
  };

  // garante chave legível no texto mesmo se EMV falhar
  if (!pay.pixCode && shop.pixKey) {
    pay.pixCode = undefined;
    pay.providerMessage = (pay.providerMessage || '') + ` Chave: ${shop.pixKey}`;
  }

  return { pay, charge };
}

export async function markPixPending(apptId: string): Promise<Appointment | null> {
  const appt = updateAppointment(apptId, { status: 'awaiting_payment' });
  if (!appt) return null;
  const { pay } = await createPixForAppointment(appt);
  return updateAppointment(apptId, {
    payment: pay,
    status: 'awaiting_payment',
  });
}

/** Confirma pagamento se external_reference = appointment id */
export function confirmByExternalId(
  externalId: string,
  by: 'client' | 'owner' | 'system' = 'system'
): Appointment | null {
  if (!externalId) return null;
  const list = loadAppointments();
  const appt =
    list.find((a) => a.id === externalId) ||
    list.find((a) => a.payment?.providerPaymentId === externalId) ||
    list.find((a) => a.payment?.pixTxId === externalId);
  if (!appt) return null;
  return updateAppointment(appt.id, {
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
