/**
 * Conceitos genéricos multi-nicho.
 * Painel e núcleo usam isto — o plugin traduz para o domínio.
 */

export type TenantId = string;

export type GenericStatus =
  | 'booked'
  | 'awaiting_payment'
  | 'paid'
  | 'checked_in'
  | 'waiting'
  | 'in_service'
  | 'done'
  | 'rated'
  | 'cancelled'
  | 'no_show';

export type TicketKind = 'complaint' | 'praise' | 'support' | 'billing' | 'other';
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export interface TenantMeta {
  id: TenantId;
  name: string;
  nicheId: string;
  plan: 'starter' | 'pro' | 'business';
  status: 'provisioning' | 'qr_pending' | 'live' | 'suspended';
  createdAt: string;
  /** slug do subdomínio painel: {slug}.seudominio.com */
  slug: string;
}

export interface MediaKind {
  kind:
    | 'text'
    | 'audio'
    | 'image'
    | 'video'
    | 'document'
    | 'sticker'
    | 'location'
    | 'contact'
    | 'list'
    | 'buttons'
    | 'unknown';
  text: string;
  caption?: string;
  rawType?: string;
}

export interface Ticket {
  id: string;
  tenantId?: TenantId;
  chatId: string;
  clientName?: string;
  kind: TicketKind;
  status: TicketStatus;
  subject: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  ownerNote?: string;
  linkedBookingId?: string;
}

/** Contrato do plugin de nicho (fase C completa; barbershop adapta) */
export interface NichePluginContext {
  chatId: string;
  text: string;
  media: MediaKind;
  tenantId?: string;
}

export interface NichePluginResult {
  handled: boolean;
  text: string;
  source: string;
  rich?: import('../messaging/types.js').RichMessage;
}
