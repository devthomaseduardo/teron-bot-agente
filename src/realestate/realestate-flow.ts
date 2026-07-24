import { sessionStore } from '../core/session.js';
import { appendLead } from '../core/leads.js';
import { normalize } from '../util/text.js';
import type { RichMessage } from '../messaging/types.js';
import {
  tplReMenu,
  tplAskRegion,
  tplAskRooms,
  tplAskBudget,
  tplAskName,
  tplAskVisit,
  tplReDone,
  tplListProperty,
  tplDocsFaq,
  tplHandoff,
  tplError,
} from './templates.js';

export interface ReFlowResult {
  handled: boolean;
  text: string;
  source: string;
  rich?: RichMessage;
}

type Step =
  | 'idle'
  | 'menu'
  | 'region'
  | 'rooms'
  | 'budget'
  | 'name'
  | 'visit'
  | 'list_prop'
  | 'done';

function stepOf(id: string): Step {
  return (sessionStore.get(id).profile.re_step as Step) || 'idle';
}
function setStep(id: string, s: Step) {
  sessionStore.setProfile(id, 're_step', s);
  sessionStore.setTopic(id, 'realestate', { intentId: 'realestate', awaiting: s });
}
function rich(r: RichMessage): ReFlowResult {
  return { handled: true, text: r.text, source: 'realestate', rich: r };
}
function isEscape(text: string, n: string) {
  const t = text.trim().toLowerCase();
  return /^(oi+|ola+|olá|bom dia|boa tarde|boa noite|menu|0|voltar|cancelar)[\s!.?]*$/i.test(t) ||
    /^(menu|voltar|0)$/i.test(n.trim());
}
function mapRooms(n: string, text: string) {
  if (n === '1' || n.includes('studio') || n.includes('1 quarto')) return '1 quarto / studio';
  if (n === '2' || n.includes('2')) return '2 quartos';
  if (n === '3' || n.includes('3')) return '3 quartos';
  if (n === '4' || n.includes('4')) return '4+ quartos';
  if (n === '5' || n.includes('comercial')) return 'Comercial / outro';
  return text.trim() || 'A definir';
}

export async function runRealestateFlow(chatId: string, userText: string): Promise<ReFlowResult | null> {
  const text = (userText || '').trim();
  const n = normalize(text);
  if (isEscape(text, n)) {
    setStep(chatId, 'menu');
    return rich(tplReMenu());
  }

  const cur = stepOf(chatId);

  if (cur === 'done') {
    if (n === '5' || n.includes('corretor') || n.includes('humano')) {
      sessionStore.setHandoff(chatId, true);
      return rich(tplHandoff());
    }
    setStep(chatId, 'menu');
    return rich(tplReMenu());
  }

  if (cur === 'menu' || cur === 'idle') {
    if (n === '1' || n.includes('comprar') || n.includes('compra')) {
      sessionStore.setProfile(chatId, 'deal_type', 'Comprar');
      setStep(chatId, 'region');
      return rich(tplAskRegion('Comprar'));
    }
    if (n === '2' || n.includes('alugar') || n.includes('aluguel') || n.includes('locacao') || n.includes('locação')) {
      sessionStore.setProfile(chatId, 'deal_type', 'Alugar');
      setStep(chatId, 'region');
      return rich(tplAskRegion('Alugar'));
    }
    if (n === '3' || n.includes('visita') || n.includes('visitar')) {
      sessionStore.setProfile(chatId, 'deal_type', 'Visita');
      setStep(chatId, 'name');
      sessionStore.setProfile(chatId, 're_fast_visit', '1');
      return rich(tplAskName());
    }
    if (n === '4' || n.includes('anunciar') || n.includes('vender meu')) {
      setStep(chatId, 'list_prop');
      return rich(tplListProperty());
    }
    if (n === '5' || n.includes('corretor') || n.includes('humano')) {
      sessionStore.setHandoff(chatId, true);
      return rich(tplHandoff());
    }
    if (n === '6' || n.includes('documento') || n.includes('faq')) {
      return rich(tplDocsFaq());
    }
    if (cur === 'idle') {
      setStep(chatId, 'menu');
      return rich(tplReMenu());
    }
  }

  if (cur === 'list_prop') {
    if (text.length < 8) return rich(tplError());
    sessionStore.setProfile(chatId, 'listing_note', text);
    appendLead({
      chatId,
      profile: { intent: 'anuncio', note: text, name: sessionStore.get(chatId).profile.name || '' },
      source: 'realestate:listing',
    });
    setStep(chatId, 'done');
    return rich({
      text: 'Recebemos os dados do imóvel. Um consultor retorna com a proposta de captação. Digite *menu* se precisar de outra coisa.',
      keepTogether: true,
    });
  }

  if (cur === 'region') {
    if (text.length < 2) return rich(tplError());
    sessionStore.setProfile(chatId, 'region', text);
    setStep(chatId, 'rooms');
    return rich(tplAskRooms());
  }

  if (cur === 'rooms') {
    sessionStore.setProfile(chatId, 'rooms', mapRooms(n, text));
    setStep(chatId, 'budget');
    const deal = sessionStore.get(chatId).profile.deal_type || 'Busca';
    return rich(tplAskBudget(deal));
  }

  if (cur === 'budget') {
    if (text.length < 1) return rich(tplError());
    sessionStore.setProfile(chatId, 'budget', text);
    setStep(chatId, 'name');
    return rich(tplAskName());
  }

  if (cur === 'name') {
    if (text.length < 2) return rich(tplError());
    sessionStore.setProfile(chatId, 'name', text);
    if (sessionStore.get(chatId).profile.re_fast_visit === '1') {
      setStep(chatId, 'visit');
      return rich(tplAskVisit());
    }
    setStep(chatId, 'visit');
    return rich(tplAskVisit());
  }

  if (cur === 'visit') {
    const visit = text.trim() || 'depois';
    sessionStore.setProfile(chatId, 'preferred_slot', visit);
    const p = sessionStore.get(chatId).profile;
    appendLead({
      chatId,
      profile: {
        name: p.name || '',
        deal_type: p.deal_type || '',
        region: p.region || '',
        rooms: p.rooms || '',
        budget: p.budget || '',
        visit,
        intent: 'imovel',
      },
      source: 'realestate:qualify',
    });
    setStep(chatId, 'done');
    return rich(
      tplReDone({
        name: p.name || 'cliente',
        deal: p.deal_type || 'Busca',
        region: p.region || 'A definir',
        rooms: p.rooms || 'A definir',
        budget: p.budget || 'A definir',
        visit,
      })
    );
  }

  return null;
}
