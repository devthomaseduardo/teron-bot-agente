/**
 * Fila virtual + ETA — diferencial: tempo de espera em tempo real no WhatsApp.
 */
import type { Appointment } from './types.js';
import {
  activeQueue,
  loadBarbershop,
  loadAppointments,
  todayISO,
  updateAppointment,
} from './store.js';
import { parseTimeToMin } from './schedule.js';

export interface QueueSnapshot {
  position: number;
  etaMinutes: number;
  ahead: number;
  inService: Appointment | null;
  waiting: Appointment[];
  message: string;
}

/** Calcula ETA para um agendamento do dia */
export function estimateWait(appt: Appointment): QueueSnapshot {
  const shop = loadBarbershop();
  const buffer = shop.shop.waitBufferMin ?? 5;
  const today = todayISO();
  const all = loadAppointments()
    .filter(
      (a) =>
        a.date === today &&
        a.barberId === appt.barberId &&
        !['cancelled', 'no_show', 'rated'].includes(a.status)
    )
    .sort((a, b) => {
      // em atendimento primeiro, depois por horário / check-in
      const rank = (x: Appointment) => {
        if (x.status === 'in_service') return 0;
        if (x.status === 'waiting' || x.status === 'checked_in') return 1;
        return 2;
      };
      const r = rank(a) - rank(b);
      if (r !== 0) return r;
      return a.time.localeCompare(b.time);
    });

  const inService = all.find((a) => a.status === 'in_service') || null;
  const waiting = all.filter((a) =>
    ['waiting', 'checked_in', 'paid', 'awaiting_payment', 'booked'].includes(
      a.status
    )
  );

  // pessoas na frente na mesma cadeira
  const myIdx = all.findIndex((a) => a.id === appt.id);
  let ahead = 0;
  let eta = 0;

  if (myIdx < 0) {
    ahead = waiting.length;
    eta = waiting.reduce((s, a) => s + a.durationMin, 0) + buffer;
  } else {
    for (let i = 0; i < myIdx; i++) {
      const a = all[i];
      if (['cancelled', 'no_show', 'done', 'rated'].includes(a.status)) continue;
      ahead += 1;
      // se em serviço, estima restante ~ metade se já começou
      if (a.status === 'in_service') {
        eta += Math.ceil(a.durationMin * 0.5);
      } else {
        eta += a.durationMin;
      }
    }
    eta += buffer;
  }

  // se ainda não chegou o horário do agendamento, ETA mínimo até o horário
  if (appt.date === today) {
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const apptMin = parseTimeToMin(appt.time);
    const untilSlot = Math.max(0, apptMin - nowMin);
    eta = Math.max(eta, untilSlot);
  }

  const position = ahead + 1;
  updateAppointment(appt.id, {
    queuePosition: position,
    etaMinutes: eta,
  });

  const message =
    ahead === 0
      ? `🔔 Você é o *próximo*! Tempo estimado: *~${eta} min*.`
      : `⏳ Fila: posição *${position}* · *${ahead}* na frente · espera estimada *~${eta} min*.`;

  return { position, etaMinutes: eta, ahead, inService, waiting, message };
}

/** Textos engajamento enquanto espera (único no mercado WhatsApp+fila) */
export function engageMessage(appt: Appointment, tick: number): string {
  const snap = estimateWait(appt);
  const tips = [
    `Enquanto isso: hidrate o cabelo em casa 2x por semana — o resultado do corte dura mais 💧`,
    `Dica Navalha Fina: evite lavar o cabelo no mesmo dia do corte degradê para o visual firmar melhor.`,
    `Sabia? Agendando pelo WhatsApp você fura a fila da calçada 😉`,
    `Curiosidade: o degradê americano nasceu nos barbershops dos EUA nos anos 40.`,
    `Se quiser, peça *status* a qualquer momento para ver sua posição na fila.`,
    `Pagamento PIX já está disponível no chat — digite *pagar* se ainda não pagou.`,
  ];
  const tip = tips[tick % tips.length];

  if (snap.ahead === 0) {
    return (
      `✂️ *${appt.clientName}*, prepare-se!\n` +
      `${snap.message}\n` +
      `Barbeiro: *${appt.barberName}* · ${appt.serviceName}\n\n` +
      `Estamos quase te chamando 🔥`
    );
  }

  return (
    `💈 *Atualização da fila — ${appt.clientName}*\n` +
    `${snap.message}\n` +
    `Serviço: ${appt.serviceName} com ${appt.barberName}\n\n` +
    `💬 ${tip}\n\n` +
    `_Comandos: *status* · *pagar* · *menu*_`
  );
}

export function queueBoard(): string {
  const q = activeQueue();
  const shop = loadBarbershop().shop;
  if (!q.length) {
    return `📋 Fila vazia agora em ${shop.name}.`;
  }
  const lines = q.map((a, i) => {
    const snap = estimateWait(a);
    return (
      `${i + 1}. ${a.clientName} · ${a.serviceName} · ${a.barberName}\n` +
      `   ${a.status} · ETA ~${snap.etaMinutes}min · ${a.time} · ${a.id}`
    );
  });
  return `📋 *Fila virtual — ${shop.name}*\n\n` + lines.join('\n\n');
}
