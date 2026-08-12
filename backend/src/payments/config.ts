import fs from 'fs';
import path from 'path';
import type { PaymentProviderConfig } from './types.js';
import { loadBarbershop } from '../barbershop/store.js';
import { tenantPaths } from '../platform/tenant-runtime.js';

const FILE = () => tenantPaths().payments;

export function defaultPaymentConfig(): PaymentProviderConfig {
  const shop = (() => {
    try {
      return loadBarbershop().shop;
    } catch {
      return null;
    }
  })();

  return {
    activeProvider: shop?.pixKey ? 'pix_key' : 'manual',
    enabledMethods: ['pix', 'card_credit', 'card_debit', 'cash', 'later'],
    mercadoPago: {
      enabled: false,
      accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN || '',
      publicKey: process.env.MERCADOPAGO_PUBLIC_KEY || '',
      webhookSecret: process.env.MERCADOPAGO_WEBHOOK_SECRET || '',
      sandbox: true,
    },
    pixKey: {
      enabled: Boolean(shop?.pixKey),
      key: shop?.pixKey || '',
      holderName: shop?.pixName || shop?.name || '',
      bank: 'outro',
      city: 'Sao Paulo',
    },
    manual: {
      cardOnSite: true,
      cash: true,
    },
    updatedAt: new Date().toISOString(),
  };
}

export function loadPaymentConfig(): PaymentProviderConfig {
  const f = FILE();
  try {
    if (!fs.existsSync(path.dirname(f))) {
      fs.mkdirSync(path.dirname(f), { recursive: true });
    }
    if (!fs.existsSync(f)) {
      const d = defaultPaymentConfig();
      // env overrides
      if (process.env.MERCADOPAGO_ACCESS_TOKEN) {
        d.mercadoPago!.accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
        d.mercadoPago!.enabled = true;
        d.activeProvider = 'mercado_pago';
      }
      fs.writeFileSync(f, JSON.stringify(d, null, 2), 'utf8');
      return d;
    }
    const raw = JSON.parse(fs.readFileSync(f, 'utf8')) as PaymentProviderConfig;
    const base = defaultPaymentConfig();
    return {
      ...base,
      ...raw,
      mercadoPago: { ...base.mercadoPago!, ...raw.mercadoPago },
      pixKey: { ...base.pixKey!, ...raw.pixKey },
      manual: { ...base.manual!, ...raw.manual },
    };
  } catch {
    return defaultPaymentConfig();
  }
}

export function savePaymentConfig(
  patch: Partial<PaymentProviderConfig>
): PaymentProviderConfig {
  const cur = loadPaymentConfig();
  const next: PaymentProviderConfig = {
    ...cur,
    ...patch,
    mercadoPago: { ...cur.mercadoPago!, ...patch.mercadoPago },
    pixKey: { ...cur.pixKey!, ...patch.pixKey },
    manual: { ...cur.manual!, ...patch.manual },
    updatedAt: new Date().toISOString(),
  };
  // se ativou MP com token, habilita
  if (next.mercadoPago?.accessToken && patch.mercadoPago?.enabled !== false) {
    if (patch.activeProvider === 'mercado_pago' || next.activeProvider === 'mercado_pago') {
      next.mercadoPago.enabled = true;
    }
  }
  fs.writeFileSync(FILE(), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

export function paymentProviderSummary(cfg?: PaymentProviderConfig): {
  active: string;
  label: string;
  ready: boolean;
  detail: string;
} {
  const c = cfg || loadPaymentConfig();
  if (c.activeProvider === 'mercado_pago' && c.mercadoPago?.accessToken) {
    return {
      active: 'mercado_pago',
      label: 'Mercado Pago',
      ready: Boolean(c.mercadoPago.enabled && c.mercadoPago.accessToken),
      detail: c.mercadoPago.sandbox ? 'Sandbox/teste' : 'Produção',
    };
  }
  if (c.activeProvider === 'pix_key' && c.pixKey?.key) {
    const bank = c.pixKey.bank || 'outro';
    return {
      active: 'pix_key',
      label: bankLabel(bank),
      ready: true,
      detail: maskKey(c.pixKey.key),
    };
  }
  return {
    active: 'manual',
    label: 'Manual (loja)',
    ready: true,
    detail: 'PIX chave / maquininha no balcão',
  };
}

export function bankLabel(bank: string): string {
  const map: Record<string, string> = {
    nubank: 'Nubank (PIX)',
    inter: 'Inter (PIX)',
    itau: 'Itaú (PIX)',
    bradesco: 'Bradesco (PIX)',
    bb: 'Banco do Brasil (PIX)',
    caixa: 'Caixa (PIX)',
    c6: 'C6 Bank (PIX)',
    picpay: 'PicPay (PIX)',
    outro: 'PIX (chave)',
  };
  return map[bank] || 'PIX';
}

function maskKey(key: string): string {
  if (!key) return '—';
  if (key.length <= 8) return '••••';
  return key.slice(0, 4) + '••••' + key.slice(-4);
}
