/**
 * Classifica demanda (pedido de serviço) — heurística + Gemini se disponível.
 */
import type { ClassifiedDemand, OpportunityTemperature } from './types.js';
import { loadBarbershop } from '../barbershop/store.js';

const NICHE_KEYWORDS: Array<{ niche: string; label: string; keys: string[] }> = [
  {
    niche: 'barbershop',
    label: 'Barbearia / cabelo',
    keys: ['barbeiro', 'barbearia', 'corte', 'cabelo', 'barba', 'navalha'],
  },
  {
    niche: 'clinic',
    label: 'Clínica / saúde',
    keys: ['dentista', 'clínica', 'clinica', 'medico', 'médico', 'consulta', 'fisioterapia'],
  },
  {
    niche: 'laundry',
    label: 'Lavanderia',
    keys: ['lavanderia', 'lavar roupa', 'busca roupa', 'passar roupa'],
  },
  {
    niche: 'electrician',
    label: 'Eletricista',
    keys: ['eletricista', 'elétrica', 'eletrica', 'disjuntor', 'fio'],
  },
  {
    niche: 'plumber',
    label: 'Encanador',
    keys: ['encanador', 'encanamento', 'vazamento', 'desentope', 'hidraulica', 'hidráulica'],
  },
  {
    niche: 'mechanic',
    label: 'Oficina / auto',
    keys: ['mecanico', 'mecânico', 'oficina', 'carro', 'funilaria'],
  },
  {
    niche: 'restaurant',
    label: 'Restaurante / comida',
    keys: ['restaurante', 'marmita', 'delivery comida', 'almoço'],
  },
  {
    niche: 'realestate',
    label: 'Imóveis',
    keys: ['apartamento', 'aluguel', 'imovel', 'imóvel', 'corretor'],
  },
  {
    niche: 'pet',
    label: 'Pet / vet',
    keys: ['veterinario', 'veterinário', 'petshop', 'banho e tosa'],
  },
  {
    niche: 'gym',
    label: 'Academia',
    keys: ['academia', 'personal', 'musculação'],
  },
];

const DEMAND_MARKERS = [
  'indica',
  'indicação',
  'indicacao',
  'procuro',
  'preciso',
  'alguém sabe',
  'alguem sabe',
  'recomend',
  'bom',
  'barato',
  'urgente',
  'ajuda',
  'quero',
  'busco',
  'onde acho',
  'onde encontrar',
];

const SP_NEIGHBORHOODS = [
  'mooca',
  'cambuci',
  'centro',
  'liberdade',
  'bela vista',
  'consolação',
  'consolacao',
  'pinheiros',
  'vila madalena',
  'santana',
  'tucuruvi',
  'tatuapé',
  'tatuape',
  'penha',
  'ipiranga',
  'saúde',
  'saude',
  'brooklin',
  'moema',
  'jardins',
  'república',
  'republica',
  'bras',
  'brás',
  'belém',
  'belem',
  'lapa',
  'butantã',
  'butanta',
  'santos',
  'guarulhos',
  'osasco',
  'sbc',
  'são paulo',
  'sao paulo',
  'sp',
];

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function detectNiche(text: string): { niche: string; label: string; hits: number } {
  const t = norm(text);
  let best = { niche: 'generic', label: 'Serviço local', hits: 0 };
  for (const n of NICHE_KEYWORDS) {
    let hits = 0;
    for (const k of n.keys) {
      if (t.includes(norm(k))) hits += 1;
    }
    if (hits > best.hits) best = { niche: n.niche, label: n.label, hits };
  }
  return best;
}

function detectPlace(text: string): { city: string; neighborhood: string } {
  const t = norm(text);
  let neighborhood = '';
  for (const b of SP_NEIGHBORHOODS) {
    if (t.includes(b) && b.length > 2) {
      neighborhood = b.replace(/\b\w/g, (c) => c.toUpperCase());
      break;
    }
  }
  const city =
    t.includes('sao paulo') || t.includes('são paulo') || t.includes(' sp') || neighborhood
      ? 'São Paulo'
      : '';
  return { city, neighborhood };
}

function temperatureOf(text: string, isDemand: boolean, conf: number): OpportunityTemperature {
  const t = norm(text);
  if (!isDemand) return 'cold';
  if (t.includes('urgente') || t.includes('hoje') || t.includes('agora') || conf >= 0.85)
    return 'hot';
  if (conf >= 0.6) return 'warm';
  return 'cold';
}

function shopSuggestedReply(
  classification: Pick<ClassifiedDemand, 'nicheLabel' | 'neighborhood' | 'city'>
): string {
  let shopName = 'nossa loja';
  try {
    shopName = loadBarbershop().shop.name || shopName;
  } catch {
    /* */
  }
  const where = classification.neighborhood || classification.city || 'sua região';
  return (
    `Oi! Vi que você procura ${classification.nicheLabel.toLowerCase()} em ${where}. ` +
    `Somos a *${shopName}* e atendemos por aqui. Posso te passar valores e horários?`
  );
}

/** Classificação local (sempre disponível) */
export function classifyHeuristic(rawText: string): ClassifiedDemand {
  const t = norm(rawText);
  const demandHits = DEMAND_MARKERS.filter((m) => t.includes(norm(m))).length;
  const niche = detectNiche(rawText);
  const place = detectPlace(rawText);
  const isRealDemand = demandHits >= 1 || (niche.hits >= 1 && t.includes('?'));
  let confidence = 0.35;
  if (demandHits) confidence += 0.2 * Math.min(demandHits, 2);
  if (niche.hits) confidence += 0.15 * Math.min(niche.hits, 2);
  if (place.neighborhood) confidence += 0.15;
  if (place.city) confidence += 0.05;
  if (t.includes('urgente') || t.includes('hoje')) confidence += 0.1;
  confidence = Math.min(0.96, confidence);

  if (!isRealDemand && niche.hits === 0) {
    return {
      isRealDemand: false,
      intent: 'unknown',
      niche: 'generic',
      nicheLabel: '—',
      city: place.city,
      neighborhood: place.neighborhood,
      urgency: 'low',
      temperature: 'cold',
      confidence: Math.min(confidence, 0.4),
      suggestedReply: '',
      discardReason: 'Não parece pedido de serviço',
    };
  }

  const urgency =
    t.includes('urgente') || t.includes('agora') || t.includes('hoje')
      ? 'high'
      : t.includes('semana') || t.includes('amanha') || t.includes('amanhã')
        ? 'medium'
        : 'low';

  const base: ClassifiedDemand = {
    isRealDemand: true,
    intent: 'looking_for_service',
    niche: niche.niche,
    nicheLabel: niche.label,
    city: place.city || 'São Paulo',
    neighborhood: place.neighborhood,
    urgency,
    temperature: temperatureOf(rawText, true, confidence),
    confidence: Math.round(confidence * 100) / 100,
    suggestedReply: '',
  };
  base.suggestedReply = shopSuggestedReply(base);
  return base;
}

/** Classificação com Gemini (fallback heurística) */
export async function classifyDemand(rawText: string): Promise<ClassifiedDemand> {
  const heuristic = classifyHeuristic(rawText);
  if (!process.env.GEMINI_KEY || rawText.trim().length < 8) {
    return heuristic;
  }

  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);
    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    });
    const prompt = `Você classifica pedidos de serviço em posts/mensagens públicas no Brasil.
Responda APENAS JSON válido (sem markdown):
{
  "isRealDemand": boolean,
  "intent": string,
  "niche": string,
  "nicheLabel": string,
  "city": string,
  "neighborhood": string,
  "urgency": "high"|"medium"|"low",
  "temperature": "hot"|"warm"|"cold",
  "confidence": number,
  "suggestedReply": string em português, curta, profissional, para WhatsApp de um negócio local responder o pedido,
  "discardReason": string|null
}
Texto:
"""${rawText.slice(0, 1500)}"""`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return heuristic;
    const parsed = JSON.parse(jsonMatch[0]) as ClassifiedDemand;
    // merge seguro
    return {
      isRealDemand: Boolean(parsed.isRealDemand),
      intent: parsed.intent || heuristic.intent,
      niche: parsed.niche || heuristic.niche,
      nicheLabel: parsed.nicheLabel || heuristic.nicheLabel,
      city: parsed.city || heuristic.city,
      neighborhood: parsed.neighborhood || heuristic.neighborhood,
      urgency: parsed.urgency || heuristic.urgency,
      temperature: parsed.temperature || heuristic.temperature,
      confidence: Math.min(
        0.99,
        Math.max(0, Number(parsed.confidence) || heuristic.confidence)
      ),
      suggestedReply:
        (parsed.suggestedReply || '').trim() || heuristic.suggestedReply,
      discardReason: parsed.discardReason || undefined,
    };
  } catch {
    return heuristic;
  }
}
