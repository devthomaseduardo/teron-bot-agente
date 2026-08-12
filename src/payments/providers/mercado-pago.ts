/**
 * Mercado Pago — PIX real via API.
 * Docs: POST /v1/payments  payment_method_id: pix
 */
import type {
  ChargeRequest,
  ChargeResult,
  PaymentProvider,
} from '../types.js';
import { loadPaymentConfig } from '../config.js';

const API = 'https://api.mercadopago.com';

export function createMercadoPagoProvider(): PaymentProvider {
  return {
    id: 'mercado_pago',
    label: 'Mercado Pago',

    async createPixCharge(req: ChargeRequest): Promise<ChargeResult> {
      const cfg = loadPaymentConfig().mercadoPago;
      const token = cfg?.accessToken || process.env.MERCADOPAGO_ACCESS_TOKEN || '';
      if (!token) {
        return {
          ok: false,
          provider: 'mercado_pago',
          status: 'error',
          amount: req.amount,
          externalId: req.externalId,
          message:
            'Mercado Pago sem access token. Configure em Admin → Pagamentos.',
        };
      }

      const amount = Math.round(req.amount * 100) / 100;
      if (amount < 0.5) {
        return {
          ok: false,
          provider: 'mercado_pago',
          status: 'error',
          amount,
          externalId: req.externalId,
          message: 'Valor mínimo R$ 0,50',
        };
      }

      const body = {
        transaction_amount: amount,
        description: (req.description || 'Pagamento').slice(0, 200),
        payment_method_id: 'pix',
        external_reference: req.externalId,
        payer: {
          email:
            req.payerEmail ||
            `cliente+${req.externalId.replace(/\W/g, '')}@navalhafina.local`,
          first_name: (req.payerName || 'Cliente').split(' ')[0],
        },
      };

      try {
        const res = await fetch(`${API}/v1/payments`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-Idempotency-Key': `pix-${req.externalId}-${Date.now()}`,
          },
          body: JSON.stringify(body),
        });
        const data = (await res.json()) as Record<string, any>;
        if (!res.ok) {
          return {
            ok: false,
            provider: 'mercado_pago',
            status: 'error',
            amount,
            externalId: req.externalId,
            message:
              data?.message ||
              data?.error ||
              `Mercado Pago HTTP ${res.status}`,
            raw: data,
          };
        }

        const tx =
          data?.point_of_interaction?.transaction_data ||
          data?.transaction_details ||
          {};
        const pixCopy =
          tx.qr_code ||
          tx.qr_code_base64 ||
          data?.point_of_interaction?.transaction_data?.qr_code;
        const qrB64 = tx.qr_code_base64;

        return {
          ok: true,
          provider: 'mercado_pago',
          status:
            data.status === 'approved'
              ? 'approved'
              : data.status === 'rejected'
                ? 'rejected'
                : 'pending',
          amount,
          providerPaymentId: String(data.id || ''),
          externalId: req.externalId,
          pixCopyPaste: typeof pixCopy === 'string' && !pixCopy.startsWith('iVBOR')
            ? pixCopy
            : tx.qr_code,
          pixQrBase64: qrB64
            ? qrB64.startsWith('data:')
              ? qrB64
              : `data:image/png;base64,${qrB64}`
            : undefined,
          message: 'PIX gerado via Mercado Pago',
          raw: { id: data.id, status: data.status },
        };
      } catch (e) {
        return {
          ok: false,
          provider: 'mercado_pago',
          status: 'error',
          amount: req.amount,
          externalId: req.externalId,
          message: String(e),
        };
      }
    },

    async getStatus(providerPaymentId: string): Promise<ChargeResult | null> {
      const cfg = loadPaymentConfig().mercadoPago;
      const token = cfg?.accessToken || process.env.MERCADOPAGO_ACCESS_TOKEN || '';
      if (!token || !providerPaymentId) return null;
      try {
        const res = await fetch(`${API}/v1/payments/${providerPaymentId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return null;
        const data = (await res.json()) as Record<string, any>;
        const status =
          data.status === 'approved'
            ? 'approved'
            : data.status === 'rejected' || data.status === 'cancelled'
              ? 'rejected'
              : 'pending';
        return {
          ok: true,
          provider: 'mercado_pago',
          status,
          amount: Number(data.transaction_amount || 0),
          providerPaymentId: String(data.id),
          externalId: String(data.external_reference || ''),
          message: data.status_detail,
          raw: { status: data.status },
        };
      } catch {
        return null;
      }
    },
  };
}

/**
 * Link de pagamento (cartão / PIX na página MP) — Preference Checkout Pro.
 */
export async function createCheckoutPreference(opts: {
  amount: number;
  title: string;
  externalId: string;
  payerEmail?: string;
}): Promise<{ ok: boolean; checkoutUrl?: string; preferenceId?: string; message?: string }> {
  const cfg = loadPaymentConfig().mercadoPago;
  const token = cfg?.accessToken || process.env.MERCADOPAGO_ACCESS_TOKEN || '';
  if (!token) {
    return { ok: false, message: 'Mercado Pago sem token' };
  }
  try {
    const res = await fetch(`${API}/checkout/preferences`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: [
          {
            title: (opts.title || 'Pagamento').slice(0, 200),
            quantity: 1,
            unit_price: Math.round(opts.amount * 100) / 100,
            currency_id: 'BRL',
          },
        ],
        external_reference: opts.externalId,
        payer: opts.payerEmail ? { email: opts.payerEmail } : undefined,
        payment_methods: {
          installments: 12,
        },
        back_urls: {
          success: process.env.PANEL_PUBLIC_URL || 'https://www.mercadopago.com.br',
          failure: process.env.PANEL_PUBLIC_URL || 'https://www.mercadopago.com.br',
          pending: process.env.PANEL_PUBLIC_URL || 'https://www.mercadopago.com.br',
        },
        auto_return: 'approved',
      }),
    });
    const data = (await res.json()) as Record<string, any>;
    if (!res.ok) {
      return {
        ok: false,
        message: data?.message || `HTTP ${res.status}`,
      };
    }
    const url = data.init_point || data.sandbox_init_point;
    return {
      ok: Boolean(url),
      checkoutUrl: url,
      preferenceId: String(data.id || ''),
      message: 'Link de checkout criado',
    };
  } catch (e) {
    return { ok: false, message: String(e) };
  }
}

/**
 * Processa notificação MP (topic payment).
 * Retorna external_reference + se aprovado.
 */
export async function handleMercadoPagoWebhook(
  payload: Record<string, unknown>
): Promise<{ externalId?: string; approved: boolean; paymentId?: string } | null> {
  const cfg = loadPaymentConfig().mercadoPago;
  const token = cfg?.accessToken || process.env.MERCADOPAGO_ACCESS_TOKEN || '';
  if (!token) return null;

  // MP manda data.id ou resource
  const id =
    (payload?.data as { id?: string })?.id ||
    (typeof payload?.id === 'string' || typeof payload?.id === 'number'
      ? String(payload.id)
      : '') ||
    (typeof payload?.resource === 'string'
      ? payload.resource.split('/').pop()
      : '');

  if (!id) return null;

  try {
    const res = await fetch(`${API}/v1/payments/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, any>;
    return {
      paymentId: String(data.id),
      externalId: String(data.external_reference || ''),
      approved: data.status === 'approved',
    };
  } catch {
    return null;
  }
}
