import type { NicheTemplate } from '../types.js';
import { genericNiche } from './generic.js';
import { clinicNiche } from './clinic.js';
import { realestateNiche } from './realestate.js';
import { restaurantNiche } from './restaurant.js';
import { ecommerceNiche } from './ecommerce.js';
import { barbershopNiche } from './barbershop.js';

const niches: Record<string, NicheTemplate> = {
  generic: genericNiche,
  clinic: clinicNiche,
  realestate: realestateNiche,
  restaurant: restaurantNiche,
  ecommerce: ecommerceNiche,
  barbershop: barbershopNiche,
};

export function listNiches(): Array<{ id: string; name: string; description: string }> {
  return Object.values(niches).map((n) => ({
    id: n.id,
    name: n.name,
    description: n.description,
  }));
}

export function getNiche(id: string): NicheTemplate {
  return niches[id] || genericNiche;
}

export { niches };
