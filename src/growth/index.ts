/**
 * TERON Growth — inteligência comercial (G0/G1).
 * Cole demanda → classifica → inbox → responder no WhatsApp (humano).
 */
import { classifyDemand } from './classify.js';
import {
  createOpportunity,
  getOpportunity,
  growthFunnel,
  listOpportunities,
  openGrowthCount,
  updateOpportunity,
} from './store.js';
import type {
  GrowthOpportunity,
  OpportunitySource,
  OpportunityStatus,
} from './types.js';
import { loadBarbershop } from '../barbershop/store.js';
import { getProcessTenant } from '../platform/tenant-runtime.js';

export type { GrowthOpportunity, GrowthFunnel } from './types.js';
export {
  listOpportunities,
  getOpportunity,
  growthFunnel,
  openGrowthCount,
  updateOpportunity,
} from './store.js';
export { classifyDemand, classifyHeuristic } from './classify.js';

function digitsPhone(phone: string): string {
  return String(phone || '').replace(/\D/g, '');
}

/** Cria oportunidade a partir de texto/URL colado (G0) */
export async function ingestPaste(input: {
  text: string;
  sourceUrl?: string;
  source?: OpportunitySource;
}): Promise<{ opportunity: GrowthOpportunity | null; discarded?: string }> {
  const raw = (input.text || '').trim();
  if (raw.length < 5) {
    return { opportunity: null, discarded: 'Texto muito curto' };
  }

  const classification = await classifyDemand(raw);
  if (!classification.isRealDemand && classification.confidence < 0.55) {
    return {
      opportunity: null,
      discarded: classification.discardReason || 'Não parece demanda real',
    };
  }

  let distanceKm: number | undefined;
  // placeholder: se tem bairro, marca “local”
  if (classification.neighborhood) distanceKm = 2.5 + Math.random() * 4;

  const shop = (() => {
    try {
      return loadBarbershop().shop;
    } catch {
      return null;
    }
  })();

  // enriquece suggested reply com nome real
  if (shop?.name && classification.suggestedReply) {
    if (!classification.suggestedReply.includes(shop.name)) {
      classification.suggestedReply = classification.suggestedReply.replace(
        /Somos a \*[^*]+\*/,
        `Somos a *${shop.name}*`
      );
    }
  }

  const o = createOpportunity({
    rawText: raw,
    source: input.source || (input.sourceUrl ? 'paste' : 'manual'),
    sourceUrl: input.sourceUrl,
    classification: {
      ...classification,
      isRealDemand: true,
    },
    tenantSlug: getProcessTenant() || 'default',
    status: 'delivered',
    distanceKm,
  });

  return { opportunity: o };
}

export function markContacted(id: string): GrowthOpportunity | null {
  return updateOpportunity(id, {
    status: 'contacted',
    contactedAt: new Date().toISOString(),
  });
}

export function markDismissed(id: string, note?: string): GrowthOpportunity | null {
  return updateOpportunity(id, {
    status: 'dismissed',
    dismissedAt: new Date().toISOString(),
    ownerNote: note,
  });
}

export function markWon(
  id: string,
  opts?: { revenue?: number; bookingId?: string }
): GrowthOpportunity | null {
  return updateOpportunity(id, {
    status: 'won',
    wonAt: new Date().toISOString(),
    attributedRevenue: opts?.revenue,
    linkedBookingId: opts?.bookingId,
  });
}

export function markLost(id: string): GrowthOpportunity | null {
  return updateOpportunity(id, { status: 'lost' });
}

/** Deep link WhatsApp com mensagem pronta */
export function buildWhatsAppLink(opportunityId: string, phone?: string): {
  url: string;
  message: string;
  phone: string;
} | null {
  const o = getOpportunity(opportunityId);
  if (!o) return null;
  let shopPhone = phone || '';
  try {
    shopPhone = shopPhone || loadBarbershop().shop.phone || '';
  } catch {
    /* */
  }
  // Para "responder" a um lead público sem número: abrimos wa.me vazio com texto
  // ou o número da loja para o dono encaminhar — padrão: compose only
  const msg = o.classification.suggestedReply || o.rawText.slice(0, 200);
  const dig = digitsPhone(shopPhone);
  // wa.me sem número abre o app; com número abre conversa (dono pode usar o próprio)
  // Melhor UX: link genérico com text= para o dono escolher contato
  const url = dig
    ? `https://wa.me/${dig.startsWith('55') ? dig : '55' + dig}?text=${encodeURIComponent(msg)}`
    : `https://wa.me/?text=${encodeURIComponent(msg)}`;
  return { url, message: msg, phone: dig };
}

export function growthDashboard() {
  const funnel = growthFunnel();
  const open = listOpportunities({
    status: ['new', 'delivered', 'contacted'],
  }).slice(0, 50);
  return {
    funnel,
    openCount: openGrowthCount(),
    opportunities: open,
  };
}

export function setStatus(
  id: string,
  status: OpportunityStatus
): GrowthOpportunity | null {
  if (status === 'contacted') return markContacted(id);
  if (status === 'dismissed') return markDismissed(id);
  if (status === 'won') return markWon(id);
  if (status === 'lost') return markLost(id);
  return updateOpportunity(id, { status });
}
