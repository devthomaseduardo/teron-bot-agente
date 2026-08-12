export interface ShopInfo {
  name: string;
  address: string;
  phone: string;
  timezone?: string;
  greeting: string;
  slotMinutes: number;
  daysOpen: number[];
  notes?: string;
  /** Chave PIX fictícia / real */
  pixKey?: string;
  pixName?: string;
  /** Minutos extras de margem no ETA */
  waitBufferMin?: number;
  /** GPS da loja */
  lat?: number;
  lng?: number;
}

export interface ServiceItem {
  id: string;
  name: string;
  price: number;
  durationMin: number;
  keywords: string[];
}

export interface Barber {
  id: string;
  name: string;
  nickname: string;
  specialty: string;
  schedule: Record<string, [string, string]>;
  /** Barbeiro disponível na loja agora (operacional) */
  onDuty?: boolean;
}

export interface BarbershopConfig {
  shop: ShopInfo;
  services: ServiceItem[];
  barbers: Barber[];
}

/** Status operacional do atendimento */
export type VisitStatus =
  | 'booked' // agendado
  | 'awaiting_payment' // esperando PIX
  | 'paid' // pagamento confirmado
  | 'checked_in' // cliente chegou / na fila
  | 'waiting' // aguardando vez
  | 'in_service' // sendo atendido
  | 'done' // finalizado
  | 'rated' // avaliou
  | 'cancelled'
  | 'no_show';

export type PaymentStatus = 'none' | 'pending' | 'confirmed' | 'failed' | 'refunded';

export interface PaymentInfo {
  status: PaymentStatus;
  method: 'pix' | 'cash' | 'card' | 'none';
  amount: number;
  pixCode?: string;
  pixTxId?: string;
  requestedAt?: string;
  confirmedAt?: string;
  confirmedBy?: 'client' | 'owner' | 'system';
  /** mercado_pago | pix_key | manual */
  provider?: string;
  providerPaymentId?: string;
  checkoutUrl?: string;
  pixQrBase64?: string;
  providerMessage?: string;
}

export interface RatingInfo {
  stars: number; // 1-5
  comment?: string;
  barberStars?: number;
  at: string;
}

export interface Appointment {
  id: string;
  createdAt: string;
  updatedAt?: string;
  chatId: string;
  clientName: string;
  clientPhone?: string;
  barberId: string;
  barberName: string;
  serviceId: string;
  serviceName: string;
  price: number;
  durationMin: number;
  date: string;
  time: string;
  status: VisitStatus;
  payment: PaymentInfo;
  rating?: RatingInfo;
  /** Posição na fila quando checked_in */
  queuePosition?: number;
  /** ETA em minutos na última atualização */
  etaMinutes?: number;
  /** Última mensagem de engajamento enviada */
  lastEngageAt?: string;
  notes?: string;
}

export type BookingStep =
  | 'idle'
  | 'menu'
  | 'pick_service'
  | 'pick_barber'
  | 'pick_day'
  | 'pick_time'
  | 'pick_name'
  | 'confirm'
  | 'payment'
  | 'awaiting_pay_confirm'
  | 'waiting_engage'
  | 'rate_stars'
  | 'rate_comment'
  | 'manage_list'
  | 'manage_one'
  | 'complaint_body'
  | 'done';

/** Mensagens do dono → cliente (fila de outbox) */
export interface OwnerOutbound {
  id: string;
  chatId: string;
  text: string;
  createdAt: string;
  sent: boolean;
  sentAt?: string;
  /** claim em voo (anti-race) */
  claiming?: boolean;
  claimAt?: string;
  attempts?: number;
  lastError?: string;
  note?: string;
}

/** Snapshot operacional da loja */
export interface ShopOps {
  open: boolean;
  message?: string;
  updatedAt: string;
}
