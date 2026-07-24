import { sessionStore } from '../core/session.js';
import { appendLead } from '../core/leads.js';
import { normalize } from '../util/text.js';
import type { RichMessage } from '../messaging/types.js';
import {
  tplRestMenu,
  tplAskPeople,
  tplAskWhen,
  tplAskRestName,
  tplRestDone,
  tplCardapio,
  tplDelivery,
  tplRestLocation,
  tplHandoff,
  tplError,
} from './templates.js';

export interface RestFlowResult {
  handled: boolean;
  text: string;
  source: string;
  rich?: RichMessage;
}

type Step = 'idle' | 'menu' | 'people' | 'when' | 'name' | 'delivery_note' | 'done';

function stepOf(id: string): Step {
  return (sessionStore.get(id).profile.rest_step as Step) || 'idle';
}
function setStep(id: string, s: Step) {
  sessionStore.setProfile(id, 'rest_step', s);
  sessionStore.setTopic(id, 'restaurant', { intentId: 'restaurant', awaiting: s });
}
function rich(r: RichMessage): RestFlowResult {
  return { handled: true, text: r.text, source: 'restaurant', rich: r };
}
function isEscape(text: string, n: string) {
  const t = text.trim().toLowerCase();
  return /^(oi+|ola+|olá|bom dia|boa tarde|boa noite|menu|0|voltar)[\s!.?]*$/i.test(t) ||
    /^(menu|0|voltar)$/i.test(n.trim());
}

export async function runRestaurantFlow(chatId: string, userText: string): Promise<RestFlowResult | null> {
  const text = (userText || '').trim();
  const n = normalize(text);

  if (isEscape(text, n)) {
    setStep(chatId, 'menu');
    return rich(tplRestMenu());
  }

  const cur = stepOf(chatId);

  if (cur === 'done') {
    if (n === '2' || n.includes('cardapio') || n.includes('cardápio')) return rich(tplCardapio());
    setStep(chatId, 'menu');
    return rich(tplRestMenu());
  }

  if (cur === 'menu' || cur === 'idle') {
    if (n === '1' || n.includes('reserva') || n.includes('mesa') || n.includes('reservar')) {
      setStep(chatId, 'people');
      return rich(tplAskPeople());
    }
    if (n === '2' || n.includes('cardapio') || n.includes('cardápio') || n.includes('prato')) {
      return rich(tplCardapio());
    }
    if (n === '3' || n.includes('delivery') || n.includes('entrega') || n.includes('pedir')) {
      setStep(chatId, 'delivery_note');
      return rich(tplDelivery());
    }
    if (n === '4' || n.includes('horario') || n.includes('horário') || n.includes('endereco') || n.includes('endereço')) {
      return rich(tplRestLocation());
    }
    if (n === '5' || n.includes('humano') || n.includes('atendente') || n.includes('garcom') || n.includes('garçom')) {
      sessionStore.setHandoff(chatId, true);
      return rich(tplHandoff());
    }
    if (cur === 'idle') {
      setStep(chatId, 'menu');
      return rich(tplRestMenu());
    }
  }

  if (cur === 'delivery_note') {
    if (text.length < 5) return rich(tplError());
    appendLead({
      chatId,
      profile: { intent: 'delivery', note: text },
      source: 'restaurant:delivery',
    });
    setStep(chatId, 'done');
    return rich({
      text: 'Pedido anotado. A casa confirma área de entrega e tempo. Obrigado!',
      keepTogether: true,
    });
  }

  if (cur === 'people') {
    if (text.length < 1) return rich(tplError());
    sessionStore.setProfile(chatId, 'party_size', text);
    setStep(chatId, 'when');
    return rich(tplAskWhen());
  }

  if (cur === 'when') {
    if (text.length < 2) return rich(tplError());
    sessionStore.setProfile(chatId, 'preferred_slot', text);
    setStep(chatId, 'name');
    return rich(tplAskRestName());
  }

  if (cur === 'name') {
    if (text.length < 2) return rich(tplError());
    sessionStore.setProfile(chatId, 'name', text);
    const p = sessionStore.get(chatId).profile;
    appendLead({
      chatId,
      profile: {
        name: text,
        party_size: p.party_size || '',
        slot: p.preferred_slot || '',
        intent: 'reserva',
      },
      source: 'restaurant:reserve',
    });
    setStep(chatId, 'done');
    return rich(
      tplRestDone({
        name: text,
        people: p.party_size || '',
        when: p.preferred_slot || '',
      })
    );
  }

  return null;
}
