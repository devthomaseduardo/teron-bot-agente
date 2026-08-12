/**
 * Pagamentos multi-provedor (plataforma).
 * Mercado Pago, PIX chave (Nubank/qualquer banco), maquininha manual.
 */

export type PaymentProviderId =
  | 'mercado_pago'
  | 'pix_key'
  | 'manual'
  | 'none';

export type BankLabel =
  | 'nubank'
  | 'inter'
  | 'itau'
  | 'bradesco'
  | 'bb'
  | 'caixa'
  | 'c6'
  | 'picpay'
  | 'outro';

export interface PaymentProviderConfig {
  activeProvider: PaymentProviderId;
  /** Preferência de exibição no menu */
  enabledMethods: Array<'pix' | 'card_credit' | 'card_debit' | 'cash' | 'later'>;

  mercadoPago?: {
    enabled: boolean;
    /** Access token (produção ou teste TEST-…) */
    accessToken: string;
    /** Public key (opcional, front futuro) */
    publicKey?: string;
    /** Webhook secret / validação simples */
    webhookSecret?: string;
    sandbox?: boolean;
  };

  /** PIX estático — Nubank, Inter, Itaú, etc. */
  pixKey?: {
    enabled: boolean;
    key: string;
    holderName: string;
    bank?: BankLabel;
    city?: string;
  };

  manual?: {
    /** Loja usa maquininha própria (sem API) */
    cardOnSite: boolean;
    cash: boolean;
  };

  updatedAt?: string;
}

export interface ChargeRequest {
  amount: number;
  description: string;
  externalId: string;
  payerEmail?: string;
  payerName?: string;
}

export interface ChargeResult {
  ok: boolean;
  provider: PaymentProviderId;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'error';
  amount: number;
  /** ID no provedor (ex: payment id MP) */
  providerPaymentId?: string;
  /** ID local / tx */
  externalId: string;
  /** PIX copia-e-cola */
  pixCopyPaste?: string;
  /** QR base64 (data URL ou raw) */
  pixQrBase64?: string;
  /** Link de checkout (cartão online, se houver) */
  checkoutUrl?: string;
  message?: string;
  raw?: unknown;
}

export interface PaymentProvider {
  id: PaymentProviderId;
  label: string;
  createPixCharge(req: ChargeRequest): Promise<ChargeResult>;
  /** Consulta status no provedor (opcional) */
  getStatus?(providerPaymentId: string): Promise<ChargeResult | null>;
}
