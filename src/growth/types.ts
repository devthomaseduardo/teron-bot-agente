/** TERON Growth — oportunidades de negócio */

export type OpportunityTemperature = 'hot' | 'warm' | 'cold';
export type OpportunityStatus =
  | 'new'
  | 'delivered'
  | 'contacted'
  | 'dismissed'
  | 'won'
  | 'lost';

export type OpportunitySource =
  | 'manual'
  | 'paste'
  | 'facebook'
  | 'instagram'
  | 'reddit'
  | 'x'
  | 'forum'
  | 'portal'
  | 'other';

export interface ClassifiedDemand {
  isRealDemand: boolean;
  intent: string;
  niche: string;
  nicheLabel: string;
  city: string;
  neighborhood: string;
  urgency: 'high' | 'medium' | 'low';
  temperature: OpportunityTemperature;
  confidence: number;
  suggestedReply: string;
  discardReason?: string;
}

export interface GrowthOpportunity {
  id: string;
  createdAt: string;
  updatedAt: string;
  /** texto original do pedido */
  rawText: string;
  source: OpportunitySource;
  sourceUrl?: string;
  /** classificação */
  classification: ClassifiedDemand;
  /** tenant dono (slug) */
  tenantSlug: string;
  status: OpportunityStatus;
  distanceKm?: number;
  /** quando dono clicou responder */
  contactedAt?: string;
  dismissedAt?: string;
  wonAt?: string;
  /** booking/pagamento atribuído */
  linkedBookingId?: string;
  attributedRevenue?: number;
  ownerNote?: string;
}

export interface GrowthFunnel {
  found: number;
  delivered: number;
  contacted: number;
  won: number;
  revenue: number;
  hot: number;
  warm: number;
  cold: number;
}
