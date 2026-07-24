import type { NicheTemplate } from '../types.js';
import { genericNiche } from './generic.js';
import { clinicNiche } from './clinic.js';
import { realestateNiche } from './realestate.js';
import { restaurantNiche } from './restaurant.js';
import { ecommerceNiche } from './ecommerce.js';
import { barbershopNiche } from './barbershop.js';
import { teronNiche } from './teron.js';
import { legalNiche } from './legal.js';

const niches: Record<string, NicheTemplate> = {
  generic: genericNiche,
  clinic: clinicNiche,
  realestate: realestateNiche,
  restaurant: restaurantNiche,
  ecommerce: ecommerceNiche,
  barbershop: barbershopNiche,
  teron: teronNiche,
  legal: legalNiche,
  // aliases
  lawyer: legalNiche,
  advogado: legalNiche,
  advocacia: legalNiche,
  barbearia: barbershopNiche,
  clinica: clinicNiche,
  dental: clinicNiche,
  imobiliaria: realestateNiche,
  restaurante: restaurantNiche,
};

/** Os 5 nichos principais para venda (fluxo modal dedicado) */
export const CORE_NICHES = [
  'barbershop',
  'legal',
  'clinic',
  'realestate',
  'restaurant',
] as const;

export function listNiches(): Array<{ id: string; name: string; description: string }> {
  const seen = new Set<string>();
  const out: Array<{ id: string; name: string; description: string }> = [];
  for (const n of Object.values(niches)) {
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    out.push({ id: n.id, name: n.name, description: n.description });
  }
  return out;
}

export function getNiche(id: string): NicheTemplate {
  const key = String(id || 'generic').toLowerCase().trim();
  return niches[key] || genericNiche;
}

export { niches };
