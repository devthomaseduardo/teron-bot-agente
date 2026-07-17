/**
 * Fluxo barbearia — mensagens limpas, opções numeradas, GPS, pagamento completo.
 */
import { sessionStore } from '../core/session.js';
import { appendLead } from '../core/leads.js';
import { normalize } from '../util/text.js';
import type { Barber, BookingStep, ServiceItem } from './types.js';
import type { RichMessage } from '../messaging/types.js';
import {
  availableSlots,
  confirmAppointment,
  findBarber,
  findDay,
  findService,
} from './schedule.js';
import {
  getAppointment,
  getAppointmentByChat,
  loadBarbershop,
  updateAppointment,
} from './store.js';
import {
  confirmPayment,
  generatePixPayloadAsync,
} from './payment.js';
import { paymentProviderSummary, loadPaymentConfig } from '../payments/index.js';
import { estimateWait, engageMessage } from './queue.js';
import { saveRating, starsBar } from './ratings.js';
import {
  tplAskName,
  tplBarbers,
  tplBooked,
  tplConfirm,
  tplDays,
  tplLocation,
  tplMachinePay,
  tplMenu,
  tplPayment,
  tplPixDetails,
  tplServicePicked,
  tplServices,
  tplServicesCover,
  tplSlots,
  tplStatus,
  tplWaitingMenu,
  tplHandoff,
  tplActions,
  tplSoftNudge,
} from './templates.js';
import { card, money, num, askNumber } from '../messaging/format.js';
import { mediaDefaultReply } from '../media/handler.js';
import { createTicket } from '../ops/tickets.js';
import {
  cancelClientAppt,
  listClientAppointments,
  startReschedule,
  tplManageOne,
  tplMyBookings,
  confirmPresence,
} from './manage-booking.js';
import { openDaysWithSlots } from './schedule.js';

export interface BookingResult {
  handled: boolean;
  text: string;
  source: string;
  rich?: RichMessage;
}

function shop() {
  return loadBarbershop();
}

function stepOf(chatId: string): BookingStep {
  return (sessionStore.get(chatId).profile.booking_step as BookingStep) || 'idle';
}

function setStep(chatId: string, step: BookingStep): void {
  sessionStore.setProfile(chatId, 'booking_step', step);
  sessionStore.setTopic(chatId, 'barbearia', { intentId: 'booking', awaiting: step });
}

function getService(chatId: string): ServiceItem | null {
  const id = sessionStore.get(chatId).profile.service_id;
  return id ? shop().services.find((s) => s.id === id) || null : null;
}

function getBarber(chatId: string): Barber | null {
  const id = sessionStore.get(chatId).profile.barber_id;
  return id ? shop().barbers.find((b) => b.id === id) || null : null;
}

function isMenuCommand(text: string): boolean {
  const n = normalize(text);
  return n === 'menu' || n === '0' || n === 'inicio' || n === 'começar' || n === 'comecar';
}

/** oi / oii / ola / bom dia… — sempre volta ao menu modal */
function isGreetingText(n: string): boolean {
  const t = (n || '').trim().toLowerCase();
  if (!t || t.length > 40) return false;
  // oi, oii, oie, ola, olá, eae, eai, fala, salve, hey…
  if (/^(oi+|o+ie|ola+|eae|eai|iae|fala|salve|hey|hi|hello)[\s!.?]*$/.test(t)) {
    return true;
  }
  if (
    /^(bom dia|boa tarde|boa noite|voltar|recomeçar|recomecar|inicio|início)[\s!.?]*$/.test(
      t
    )
  ) {
    return true;
  }
  return false;
}

function rich(r: RichMessage, source = 'barbershop'): BookingResult {
  return { handled: true, text: r.text, source, rich: r };
}

function textOnly(t: string, source = 'barbershop'): BookingResult {
  return { handled: true, text: t, source, rich: { text: t, keepTogether: true } };
}

const BOOKING_STEPS: BookingStep[] = [
  'pick_service',
  'pick_barber',
  'pick_day',
  'pick_time',
  'pick_name',
  'confirm',
  'payment',
  'awaiting_pay_confirm',
];

export async function runBarbershopFlow(
  chatId: string,
  userText: string
): Promise<BookingResult | null> {
  const text = (userText || '').trim();
  const n = normalize(text);
  // lista: "1 · Agendar", "1. Corte", rowId puro, ou título com keyword
  const effective = resolveChoice(text);
  const ne = normalize(effective);

  // Anti-loop: se cliente sumiu e voltou, zera conversa
  sessionStore.maybeIdleReset(chatId, 25 * 60_000);

  let current = stepOf(chatId);
  const inBooking = BOOKING_STEPS.includes(current);

  // RECOMEÇAR sempre: 0 / menu / oi / oii / olá / bom dia… (estilo banco)
  const isGreeting = isGreetingText(n) || isGreetingText(ne);

  if (isMenuCommand(text) || ne === '0' || isGreeting) {
    sessionStore.setHandoff(chatId, false);
    sessionStore.clearFails(chatId);
    // "oi" no meio do fluxo NÃO fica preso — volta ao menu principal (modal)
    sessionStore.resetConversation(chatId, { keepName: true });
    setStep(chatId, 'menu');
    return rich(tplMenu());
  }

  // Reclamação em andamento: grava ticket
  if (current === 'complaint_body') {
    return handleComplaintBody(chatId, text);
  }

  // Mídia (áudio, foto, doc…)
  if (
    text.startsWith('[áudio]') ||
    text.startsWith('[imagem]') ||
    text.startsWith('[vídeo]') ||
    text.startsWith('[documento]') ||
    text.startsWith('[figurinha]') ||
    text.startsWith('[localização]') ||
    text.startsWith('[contato]')
  ) {
    const kind = text.startsWith('[áudio]')
      ? 'audio'
      : text.startsWith('[imagem]')
        ? 'image'
        : text.startsWith('[vídeo]')
          ? 'video'
          : text.startsWith('[documento]')
            ? 'document'
            : text.startsWith('[figurinha]')
              ? 'sticker'
              : text.startsWith('[localização]')
                ? 'location'
                : 'contact';
    const appt = getAppointmentByChat(chatId);
    const awaitingPay =
      current === 'awaiting_pay_confirm' ||
      appt?.status === 'awaiting_payment' ||
      (appt?.payment?.status === 'pending' && appt?.payment?.method === 'pix');
    const reply = mediaDefaultReply(
      { kind, text },
      {
        awaitingPayment: Boolean(
          awaitingPay && (kind === 'image' || kind === 'document')
        ),
        clientName: appt?.clientName || sessionStore.get(chatId).profile.name,
      }
    );
    sessionStore.clearFails(chatId);
    return rich(reply.rich);
  }

  // atalho reclamação
  if (
    ne === '9' ||
    n.includes('reclam') ||
    n.includes('problema') ||
    n.includes('insatisfeit') ||
    n.includes('denuncia')
  ) {
    setStep(chatId, 'complaint_body');
    sessionStore.clearFails(chatId);
    return textOnly(
      `Sinto muito pelo ocorrido.\n\n` +
        `Descreva o problema em *uma mensagem*.\n` +
        `Digite *0* para cancelar.`
    );
  }

  // Na fila
  if (current === 'waiting_engage') {
    return handleWaitingEngage(chatId, ne, text);
  }

  // Resposta a lembrete
  {
    const rem = handleReminderReply(chatId, ne);
    if (rem) {
      sessionStore.clearFails(chatId);
      return rem;
    }
  }

  // ===== AGENDAMENTO =====
  if (current === 'pick_service') {
    const svc = findService(effective);
    if (!svc) {
      return failOrRetry(chatId, () => rich(tplServicesCover()));
    }
    sessionStore.clearFails(chatId);
    sessionStore.setProfile(chatId, 'service_id', svc.id);
    sessionStore.setProfile(chatId, 'service_name', svc.name);
    setStep(chatId, 'pick_barber');
    return rich(tplBarbers(svc));
  }

  if (current === 'pick_barber') {
    const svc = getService(chatId);
    if (!svc) {
      setStep(chatId, 'pick_service');
      return rich(tplServices());
    }
    let barber = findBarber(effective);
    if (!barber && (ne.includes('qualquer') || ne === 'qualquer')) {
      barber = shop().barbers[0];
    }
    if (!barber) return failOrRetry(chatId, () => rich(tplBarbers(svc)));
    sessionStore.clearFails(chatId);
    sessionStore.setProfile(chatId, 'barber_id', barber.id);
    sessionStore.setProfile(chatId, 'barber_name', barber.name);
    setStep(chatId, 'pick_day');
    return rich(tplDays(barber, svc));
  }

  if (current === 'pick_day') {
    const svc = getService(chatId);
    const barber = getBarber(chatId);
    if (!svc || !barber) {
      setStep(chatId, 'pick_service');
      return rich(tplServices());
    }
    const day = findDay(effective, barber, svc);
    if (!day) return failOrRetry(chatId, () => rich(tplDays(barber, svc)));
    const slots = availableSlots(barber, day.date, svc);
    if (!slots.length) return failOrRetry(chatId, () => rich(tplDays(barber, svc)));
    sessionStore.clearFails(chatId);
    sessionStore.setProfile(chatId, 'date', day.date);
    sessionStore.setProfile(chatId, 'date_label', day.label);
    setStep(chatId, 'pick_time');
    return rich(tplSlots(barber, day.label, day.date, svc));
  }

  if (current === 'pick_time') {
    const svc = getService(chatId);
    const barber = getBarber(chatId);
    const date = sessionStore.get(chatId).profile.date;
    const label = sessionStore.get(chatId).profile.date_label || date;
    if (!svc || !barber || !date) {
      setStep(chatId, 'pick_service');
      return rich(tplServices());
    }
    const slots = availableSlots(barber, date, svc);
    let time: string | null = null;
    const numM = effective.match(/^(\d{1,2})$/);
    if (numM) {
      const idx = Number(numM[1]) - 1;
      if (slots[idx]) time = slots[idx];
    }
    const hm = effective.match(/(\d{1,2})[:hH](\d{2})/);
    if (!time && hm) {
      const cand = `${hm[1].padStart(2, '0')}:${hm[2]}`;
      if (slots.includes(cand)) time = cand;
    }
    if (!time)
      return failOrRetry(chatId, () => rich(tplSlots(barber, label, date, svc)));

    sessionStore.clearFails(chatId);
    sessionStore.setProfile(chatId, 'time', time);
    const existingName = sessionStore.get(chatId).profile.name;
    if (existingName && existingName.length > 1) {
      setStep(chatId, 'confirm');
      return rich(
        tplConfirm({
          clientName: existingName,
          barber,
          service: svc,
          dateLabel: label,
          time,
        })
      );
    }
    setStep(chatId, 'pick_name');
    return rich(tplAskName());
  }

  if (current === 'pick_name') {
    const name = text.replace(/[^a-zA-ZÀ-ÿ\s]/g, '').trim();
    if (name.length < 2) {
      return rich(tplAskName());
    }
    sessionStore.setProfile(chatId, 'name', name);
    const svc = getService(chatId)!;
    const barber = getBarber(chatId)!;
    const p = sessionStore.get(chatId).profile;
    setStep(chatId, 'confirm');
    return rich(
      tplConfirm({
        clientName: name,
        barber,
        service: svc,
        dateLabel: p.date_label || p.date,
        time: p.time,
      })
    );
  }

  if (current === 'confirm') {
    if (
      ne === '1' ||
      ne === 'sim' ||
      ne === 's' ||
      ne === 'confirmo' ||
      ne === 'ok' ||
      ne.includes('confirm')
    ) {
      const p = sessionStore.get(chatId).profile;
      const svc = getService(chatId)!;
      const barber = getBarber(chatId)!;
      try {
        const appt = confirmAppointment({
          chatId,
          clientName: p.name || 'Cliente',
          barber,
          service: svc,
          date: p.date,
          time: p.time,
        });
        appendLead({
          chatId,
          profile: {
            name: appt.clientName,
            service: appt.serviceName,
            barber: appt.barberName,
            date: appt.date,
            time: appt.time,
            price: String(appt.price),
          },
          source: 'barbershop:booking',
        });
        sessionStore.setProfile(chatId, 'appt_id', appt.id);
        setStep(chatId, 'payment');
        return rich(
          tplBooked({
            id: appt.id,
            name: appt.clientName,
            service: appt.serviceName,
            price: appt.price,
            durationMin: appt.durationMin,
            barber: appt.barberName,
            when: `${p.date_label || appt.date} às ${appt.time}`,
          })
        );
      } catch {
        setStep(chatId, 'pick_time');
        return rich(
          tplSlots(barber, p.date_label || p.date, p.date, svc)
        );
      }
    }
    if (ne === '2' || ne === 'nao' || ne === 'não' || ne === 'n' || ne.includes('cancel')) {
      setStep(chatId, 'menu');
      return rich(tplMenu());
    }
    const p = sessionStore.get(chatId).profile;
    const svc = getService(chatId)!;
    const barber = getBarber(chatId)!;
    return rich(
      tplConfirm({
        clientName: p.name || 'Cliente',
        barber,
        service: svc,
        dateLabel: p.date_label || p.date,
        time: p.time,
      })
    );
  }

  // ===== PAGAMENTO =====
  if (current === 'payment' || current === 'awaiting_pay_confirm') {
    return await handlePaymentStep(chatId, ne, text);
  }

  // ===== AVALIAÇÃO =====
  if (current === 'rate_stars') {
    const stars = parseInt(ne.replace(/\D/g, '') || text.replace(/\D/g, ''), 10);
    if (!stars || stars < 1 || stars > 5) {
      return rich(
        tplActions(
          'Avalie o atendimento',
          'Toque na nota de 1 a 5',
          [
            { id: '1', title: '1 · Ruim', desc: '😞' },
            { id: '2', title: '2 · Regular', desc: '😐' },
            { id: '3', title: '3 · Bom', desc: '🙂' },
            { id: '4', title: '4 · Ótimo', desc: '😊' },
            { id: '5', title: '5 · Excelente', desc: '🔥' },
          ],
          'Nota'
        )
      );
    }
    sessionStore.setProfile(chatId, 'rate_stars', String(stars));
    setStep(chatId, 'rate_comment');
    return rich(
      tplActions(
        `${starsBar(stars)} Obrigado`,
        'Quer deixar um comentário?',
        [
          { id: '1', title: '1 · Pular', desc: 'Sem comentário' },
          { id: '0', title: '0 · Menu', desc: 'Início' },
        ],
        'Comentário'
      )
    );
  }

  if (current === 'rate_comment') {
    const stars = Number(sessionStore.get(chatId).profile.rate_stars || 5);
    const appt =
      getAppointment(sessionStore.get(chatId).profile.appt_id || '') ||
      getAppointmentByChat(chatId, false);
    const comment =
      ne === '1' || ne === 'pular' || ne === 'nao' || ne === 'não' || ne === '0'
        ? undefined
        : text;
    if (appt) saveRating(appt.id, stars, comment);
    setStep(chatId, 'done');
    return rich(
      tplActions(
        'Avaliação salva',
        starsBar(stars),
        [
          { id: '1', title: '1 · Agendar de novo', desc: 'Novo horário' },
          { id: '0', title: '0 · Menu', desc: 'Início' },
        ]
      )
    );
  }

  // ===== COMANDOS GLOBAIS =====
  {
    const appt = getAppointmentByChat(chatId, false);

    // pós-agendamento atalhos 1-3 do tplBooked
    if (appt && (current === 'done' || current === 'payment' || current === 'idle' || current === 'menu')) {
      if (ne === 'pagar' || (ne === '1' && current === 'done' && appt.payment?.status !== 'confirmed')) {
        // if just finished booking, 1 = pay
      }
    }

    if (
      ne === 'status' ||
      ne === '6' ||
      ne === 'fila' ||
      n.includes('espera') ||
      n.includes('status')
    ) {
      if (!appt || ['cancelled', 'no_show', 'rated'].includes(appt.status)) {
        return rich(
          tplActions('Status', 'Você não está na fila agora', [
            { id: '1', title: '1 · Agendar', desc: 'Marcar horário' },
            { id: '0', title: '0 · Menu', desc: 'Início' },
          ])
        );
      }
      // done: não finge que está na fila — oferece avaliar / remarcar
      if (appt.status === 'done') {
        setStep(chatId, 'menu');
        return rich(
          tplActions(
            'Atendimento finalizado',
            `${appt.serviceName} · ${appt.date}`,
            [
              { id: 'avaliar', title: 'Avaliar', desc: 'Nota de 1 a 5' },
              { id: '1', title: 'Agendar de novo', desc: 'Novo horário' },
              { id: '0', title: 'Menu', desc: 'Início' },
            ],
            'Opções',
            `Seu último atendimento já foi finalizado ✅\n\nQuer avaliar ou marcar outro?`
          )
        );
      }
      const snap = estimateWait(appt);
      setStep(chatId, 'status_view' as BookingStep);
      sessionStore.setProfile(chatId, 'appt_id', appt.id);
      return rich(
        tplStatus({
          id: appt.id,
          status: appt.status,
          payment: appt.payment?.status || 'none',
          etaMsg: snap.message,
          detail: `${appt.serviceName} · ${appt.barberName}\n${appt.date} às ${appt.time}`,
        })
      );
    }

    if (
      ne === 'cheguei' ||
      n.includes('ja cheguei') ||
      n.includes('já cheguei') ||
      ne === 'checkin' ||
      // "2" só conta como cheguei se veio do modal de status
      (ne === '2' && current === ('status_view' as BookingStep))
    ) {
      if (!appt || ['cancelled', 'no_show', 'done', 'rated'].includes(appt.status)) {
        return rich(
          tplActions('Check-in', 'Sem agendamento ativo pra hoje', [
            { id: '1', title: '1 · Agendar', desc: 'Marcar horário' },
            { id: '0', title: '0 · Menu', desc: 'Início' },
          ])
        );
      }
      updateAppointment(appt.id, { status: 'waiting' });
      const snap = estimateWait({ ...appt, status: 'waiting' });
      setStep(chatId, 'waiting_engage');
      sessionStore.setProfile(chatId, 'appt_id', appt.id);
      sessionStore.clearFails(chatId);
      return rich(
        tplWaitingMenu({
          name: appt.clientName,
          etaMsg: snap.message,
          barber: appt.barberName,
          service: appt.serviceName,
        })
      );
    }

    if (
      ne === '5' ||
      ne === 'pagar' ||
      ne === 'pix' ||
      ne === 'pagamento' ||
      ne === 'maquininha' ||
      n.includes('pagar') ||
      n.includes('pagamento') ||
      (ne === '1' && current === ('status_view' as BookingStep))
    ) {
      // menu 5 = pagamento do agendamento ou formas gerais
      if (appt && appt.payment?.status !== 'confirmed') {
        setStep(chatId, 'payment');
        sessionStore.setProfile(chatId, 'appt_id', appt.id);
        const s = shop().shop;
        return rich(
          tplPayment({
            amount: appt.price,
            serviceName: appt.serviceName,
            pixKey: s.pixKey || '',
            pixName: s.pixName || s.name,
          })
        );
      }
      const s = shop().shop;
      setStep(chatId, 'payment');
      return rich(
        tplPayment({
          amount: appt?.price || 0,
          serviceName: appt?.serviceName || 'serviço na loja',
          pixKey: s.pixKey || '',
          pixName: s.pixName || s.name,
        })
      );
    }

    if (
      ne === 'paguei' ||
      n.includes('comprovante') ||
      (ne === '1' && current === 'awaiting_pay_confirm')
    ) {
      if (appt) {
        confirmPayment(appt.id, 'client');
        setStep(chatId, 'done');
        return rich(
          tplActions(
            'Pagamento ok',
            `${money(appt.price)} registrado`,
            [
              { id: 'cheguei', title: 'Cheguei', desc: 'Entrar na fila' },
              { id: '4', title: 'GPS', desc: 'Como chegar' },
              { id: '0', title: 'Menu', desc: 'Início' },
            ]
          )
        );
      }
    }

    if (ne === 'avaliar' || ne === 'avaliacao' || ne === 'avaliação') {
      if (appt && ['done', 'rated', 'in_service'].includes(appt.status)) {
        setStep(chatId, 'rate_stars');
        sessionStore.setProfile(chatId, 'appt_id', appt.id);
        return rich(
          tplActions(
            'Avalie o atendimento',
            appt.barberName,
            [
              { id: '1', title: '1 · Ruim', desc: '😞' },
              { id: '2', title: '2 · Regular', desc: '😐' },
              { id: '3', title: '3 · Bom', desc: '🙂' },
              { id: '4', title: '4 · Ótimo', desc: '😊' },
              { id: '5', title: '5 · Excelente', desc: '🔥' },
            ],
            'Nota'
          )
        );
      }
      return rich(
        tplActions('Avaliação', 'Disponível após o corte', [
          { id: '0', title: '0 · Menu', desc: 'Início' },
        ])
      );
    }

    // Meus horários / remarcar / cancelar
    if (
      ne === '7' ||
      ne === 'meus' ||
      n.includes('meu horario') ||
      n.includes('meus horario') ||
      n.includes('minha agenda') ||
      n.includes('remarcar') ||
      n.includes('cancelar')
    ) {
      if (n.includes('cancelar') && appt && !['cancelled', 'done', 'rated'].includes(appt.status)) {
        cancelClientAppt(appt.id);
        setStep(chatId, 'menu');
        return rich(
          tplActions(
            'Cancelado',
            `${appt.date} ${appt.time} · ${appt.serviceName}`,
            [
              { id: '1', title: '1 · Agendar de novo', desc: 'Novo horário' },
              { id: '0', title: '0 · Menu', desc: 'Início' },
            ]
          )
        );
      }
      if (n.includes('remarcar') && appt) {
        const old = startReschedule(chatId, appt.id);
        if (old) {
          const barber = shop().barbers.find((b) => b.id === old.barberId)!;
          const svc = shop().services.find((s) => s.id === old.serviceId)!;
          return rich(tplDays(barber, svc));
        }
      }
      const list = listClientAppointments(chatId);
      setStep(chatId, 'manage_list' as BookingStep);
      sessionStore.setProfile(chatId, 'manage_ids', list.map((a) => a.id).join(','));
      return rich(tplMyBookings(list));
    }
  }

  // Gerenciar lista de horários (escolher 1, 2…)
  if (current === ('manage_list' as BookingStep)) {
    if (ne === '0' || ne === 'menu') {
      setStep(chatId, 'menu');
      return rich(tplMenu());
    }
    const ids = (sessionStore.get(chatId).profile.manage_ids || '').split(',').filter(Boolean);
    const idx = parseInt(ne, 10) - 1;
    if (idx >= 0 && ids[idx]) {
      sessionStore.setProfile(chatId, 'manage_id', ids[idx]);
      setStep(chatId, 'manage_one' as BookingStep);
      const a = getAppointment(ids[idx])!;
      return rich(tplManageOne(a));
    }
    const list = listClientAppointments(chatId);
    return rich(tplMyBookings(list));
  }

  if (current === ('manage_one' as BookingStep)) {
    const id = sessionStore.get(chatId).profile.manage_id;
    const a = id ? getAppointment(id) : null;
    if (!a) {
      setStep(chatId, 'menu');
      return rich(tplMenu());
    }
    if (ne === '0' || ne === 'voltar') {
      const list = listClientAppointments(chatId);
      setStep(chatId, 'manage_list' as BookingStep);
      return rich(tplMyBookings(list));
    }
    if (ne === '1' || ne === 'remarcar') {
      const old = startReschedule(chatId, a.id);
      if (old) {
        const barber = shop().barbers.find((b) => b.id === old.barberId)!;
        const svc = shop().services.find((s) => s.id === old.serviceId)!;
        return rich(tplDays(barber, svc));
      }
    }
    if (ne === '2' || ne === 'cancelar') {
      cancelClientAppt(a.id);
      setStep(chatId, 'menu');
      return rich(
        tplActions(
          'Cancelado',
          `${a.date} ${a.time} · ${a.serviceName}`,
          [
            { id: '1', title: '1 · Agendar', desc: 'Novo horário' },
            { id: '0', title: '0 · Menu', desc: 'Início' },
          ]
        )
      );
    }
    if (ne === '3' || ne === 'pagar') {
      setStep(chatId, 'payment');
      sessionStore.setProfile(chatId, 'appt_id', a.id);
      const s = shop().shop;
      return rich(
        tplPayment({
          amount: a.price,
          serviceName: a.serviceName,
          pixKey: s.pixKey || '',
          pixName: s.pixName || s.name,
        })
      );
    }
    if (ne === '4' || ne === 'gps') {
      return rich(tplLocation());
    }
    return rich(tplManageOne(a));
  }

  // ===== MENU / IDLE =====
  // (saudação já tratada no topo com reset)

  // 4 = GPS
  if (
    ne === '4' ||
    n.includes('endereco') ||
    n.includes('endereço') ||
    n.includes('mapa') ||
    n.includes('gps') ||
    n.includes('onde fica') ||
    n.includes('localiza')
  ) {
    return rich(tplLocation());
  }

  // 2 = preços
  if (
    ne === '2' ||
    n.includes('preco') ||
    n.includes('preço') ||
    n.includes('valor') ||
    n.includes('tabela') ||
    n.includes('quanto custa')
  ) {
    return rich(tplServices());
  }

  // 3 = barbeiros
  if (
    ne === '3' ||
    n.includes('barbeiro') ||
    n.includes('equipe') ||
    n.includes('profissional')
  ) {
    return rich(tplBarbers());
  }

  // 7 = meus horários (também no menu)
  if (ne === '7' || n.includes('meus horario') || n.includes('meu horario')) {
    const list = listClientAppointments(chatId);
    setStep(chatId, 'manage_list' as BookingStep);
    sessionStore.setProfile(chatId, 'manage_ids', list.map((a) => a.id).join(','));
    return rich(tplMyBookings(list));
  }

  // 8 = humano
  if (ne === '8' || n.includes('atendente') || n.includes('humano')) {
    sessionStore.setHandoff(chatId, true);
    return rich(tplHandoff());
  }

  // 1 ou agendar
  if (
    ne === '1' ||
    n.includes('agendar') ||
    n.includes('marcar') ||
    n.includes('horario') ||
    n.includes('horário')
  ) {
    setStep(chatId, 'pick_service');
    return rich(tplServicesCover());
  }

  // pagamento step when menu 5 with amount 0 - if user picks 1-5
  if (current === 'menu' || current === 'idle' || current === 'done') {
    // direct service name
    const svc = findService(text);
    if (svc && (n.includes('quero') || n.includes('corte') || n.includes('barba'))) {
      sessionStore.setProfile(chatId, 'service_id', svc.id);
      setStep(chatId, 'pick_barber');
      return rich(tplBarbers(svc));
    }
  }

  // Já está no menu: NÃO reenvia o modal inteiro (anti-loop)
  if (current === 'menu') {
    return failOrRetry(chatId, () => rich(tplSoftNudge()), true);
  }

  if (current === 'idle' || current === 'done') {
    sessionStore.clearFails(chatId);
    setStep(chatId, 'menu');
    return rich(tplMenu());
  }

  // Etapa residual: no máximo 1 retry, depois menu limpo
  return failOrRetry(chatId, async () => {
    const resumed = await resumeStepModal(chatId, current);
    return resumed || rich(tplMenu());
  });
}

/**
 * Após 2 erros: limpa conversa e volta ao menu.
 * No menu: só nudge (não spam de modal).
 */
function failOrRetry(
  chatId: string,
  retry: () => BookingResult | Promise<BookingResult>,
  onMenu = false
): BookingResult | Promise<BookingResult> {
  const fails = sessionStore.bumpFail(chatId);
  if (fails >= 2) {
    sessionStore.resetConversation(chatId, { keepName: true });
    setStep(chatId, 'menu');
    sessionStore.clearFails(chatId);
    return rich(tplMenu());
  }
  if (onMenu) {
    return rich(tplSoftNudge());
  }
  return retry();
}

/** Reabre o modal da etapa atual (1 bolha profissional) */
async function resumeStepModal(
  chatId: string,
  step: BookingStep
): Promise<BookingResult | null> {
  const svc = getService(chatId);
  const barber = getBarber(chatId);
  const p = sessionStore.get(chatId).profile;

  switch (step) {
    case 'pick_service':
      return rich(tplServices());
    case 'pick_barber':
      return rich(tplBarbers(svc || undefined));
    case 'pick_day':
      if (svc && barber) return rich(tplDays(barber, svc));
      return rich(tplServices());
    case 'pick_time':
      if (svc && barber && p.date) {
        return rich(
          tplSlots(barber, p.date_label || p.date, p.date, svc)
        );
      }
      return rich(tplServices());
    case 'pick_name':
      return rich(tplAskName());
    case 'confirm':
      if (svc && barber && p.time) {
        return rich(
          tplConfirm({
            clientName: p.name || 'Cliente',
            barber,
            service: svc,
            dateLabel: p.date_label || p.date || '',
            time: p.time,
          })
        );
      }
      return rich(tplMenu());
    case 'payment': {
      const appt =
        getAppointment(p.appt_id || '') || getAppointmentByChat(chatId);
      const s = shop().shop;
      return rich(
        tplPayment({
          amount: appt?.price || svc?.price || 0,
          serviceName: appt?.serviceName || svc?.name || 'Serviço',
          pixKey: s.pixKey || '',
          pixName: s.pixName || s.name,
        })
      );
    }
    case 'awaiting_pay_confirm': {
      const appt =
        getAppointment(p.appt_id || '') || getAppointmentByChat(chatId);
      const s = shop().shop;
      if (!appt) return rich(tplMenu());
      const pix = appt.payment?.pixCode
        ? appt.payment
        : await generatePixPayloadAsync(appt);
      const sum = paymentProviderSummary();
      return rich(
        tplPixDetails({
          amount: appt.price,
          pixKey: loadPaymentConfig().pixKey?.key || s.pixKey || '',
          pixName:
            loadPaymentConfig().pixKey?.holderName || s.pixName || s.name,
          pixCode: pix.pixCode,
          txId: pix.pixTxId || appt.id,
          providerLabel: sum.label,
          providerMessage: pix.providerMessage,
        })
      );
    }
    case 'waiting_engage':
      return handleWaitingEngage(chatId, 'oi', 'oi');
    case 'menu':
      return rich(tplMenu());
    default:
      return null;
  }
}

async function handlePaymentStep(
  chatId: string,
  ne: string,
  _text: string
): Promise<BookingResult> {
  const appt =
    getAppointment(sessionStore.get(chatId).profile.appt_id || '') ||
    getAppointmentByChat(chatId);
  const s = shop().shop;
  const payCfg = loadPaymentConfig();
  const sum = paymentProviderSummary(payCfg);

  // Sem agendamento: ainda mostra formas / PIX da loja
  if (!appt) {
    if (ne === '0' || ne === 'menu') {
      setStep(chatId, 'menu');
      return rich(tplMenu());
    }
    if (ne === '1' || ne === 'pix') {
      return rich(
        tplPixDetails({
          amount: 0,
          pixKey: payCfg.pixKey?.key || s.pixKey || '',
          pixName: payCfg.pixKey?.holderName || s.pixName || s.name,
          providerLabel: sum.label,
        })
      );
    }
    if (ne === '2' || ne.includes('credito') || ne.includes('crédito')) {
      return rich(tplMachinePay('crédito'));
    }
    if (ne === '3' || ne.includes('debito') || ne.includes('débito')) {
      return rich(tplMachinePay('débito'));
    }
    if (ne === '4' || ne.includes('dinheiro')) {
      return rich(tplMachinePay('dinheiro'));
    }
    if (ne === '5' || ne === 'depois') {
      setStep(chatId, 'menu');
      return rich(
        tplActions(
          'Sem problemas',
          'Pague na loja no dia do atendimento',
          [
            { id: '1', title: '1 · Agendar', desc: 'Marcar horário' },
            { id: '0', title: '0 · Menu', desc: 'Início' },
          ]
        )
      );
    }
    return rich(
      tplPayment({
        amount: 0,
        serviceName: 'serviço na loja',
        pixKey: s.pixKey || '',
        pixName: s.pixName || s.name,
      })
    );
  }

  // escolha da forma
  if (ne === '1' || ne === 'pix') {
    const pay = await generatePixPayloadAsync(appt);
    updateAppointment(appt.id, {
      status: 'awaiting_payment',
      payment: pay,
    });
    setStep(chatId, 'awaiting_pay_confirm');
    return rich(
      tplPixDetails({
        amount: appt.price,
        pixKey: payCfg.pixKey?.key || s.pixKey || '',
        pixName: payCfg.pixKey?.holderName || s.pixName || s.name,
        pixCode: pay.pixCode,
        txId: pay.pixTxId || pay.providerPaymentId,
        providerLabel: sum.label,
        providerMessage: pay.providerMessage,
      })
    );
  }

  if (
    ne === '2' ||
    ne.includes('credito') ||
    ne.includes('crédito') ||
    ne === '3' ||
    ne.includes('debito') ||
    ne.includes('débito')
  ) {
    const method =
      ne === '3' || ne.includes('debito') || ne.includes('débito')
        ? 'débito'
        : 'crédito';
    // tenta link Mercado Pago (cartão online)
    try {
      const { createCheckoutPreference } = await import(
        '../payments/index.js'
      );
      const link = await createCheckoutPreference({
        amount: appt.price,
        title: `${appt.serviceName} · ${appt.clientName}`,
        externalId: appt.id,
      });
      if (link.ok && link.checkoutUrl) {
        updateAppointment(appt.id, {
          status: 'awaiting_payment',
          payment: {
            status: 'pending',
            method: 'card',
            amount: appt.price,
            provider: 'mercado_pago',
            checkoutUrl: link.checkoutUrl,
            requestedAt: new Date().toISOString(),
          },
        });
        setStep(chatId, 'awaiting_pay_confirm');
        return textOnly(
          `Beleza — cartão pelo *Mercado Pago* 💳\n\n` +
            `Valor: *R$ ${appt.price.toFixed(2).replace('.', ',')}*\n\n` +
            `Paga neste link seguro:\n${link.checkoutUrl}\n\n` +
            `Quando cair, me manda *1* (já paguei).\n` +
            `Ou se preferir maquininha na loja, digita *loja*.`
        );
      }
    } catch {
      /* cai no maquininha */
    }
    updateAppointment(appt.id, {
      payment: { status: 'pending', method: 'card', amount: appt.price },
    });
    setStep(chatId, 'done');
    return rich(tplMachinePay(method));
  }

  if (ne === '4' || ne.includes('dinheiro')) {
    updateAppointment(appt.id, {
      payment: { status: 'pending', method: 'cash', amount: appt.price },
    });
    setStep(chatId, 'done');
    return rich(tplMachinePay('dinheiro'));
  }

  if (ne === '5' || ne === 'depois') {
    setStep(chatId, 'done');
    return rich(
      tplActions(
        'Combinado',
        'Pague no dia, do jeito que preferir',
        [
          { id: 'cheguei', title: 'Cheguei', desc: 'Entrar na fila' },
          { id: '4', title: 'GPS', desc: 'Como chegar' },
          { id: '0', title: 'Menu', desc: 'Início' },
        ]
      )
    );
  }

  if (
    ne === 'paguei' ||
    (ne === '1' && stepOf(chatId) === 'awaiting_pay_confirm') ||
    ne.includes('comprovante')
  ) {
    if (
      stepOf(chatId) === 'awaiting_pay_confirm' ||
      ne === 'paguei' ||
      ne.includes('comprovante')
    ) {
      confirmPayment(appt.id, 'client');
      setStep(chatId, 'done');
      return rich(
        tplActions(
          'PIX registrado',
          `${money(appt.price)} · Obrigado!`,
          [
            { id: 'cheguei', title: 'Cheguei', desc: 'Entrar na fila' },
            { id: '4', title: 'GPS', desc: 'Como chegar' },
            { id: '0', title: 'Menu', desc: 'Início' },
          ]
        )
      );
    }
  }

  if (ne === '2' && stepOf(chatId) === 'awaiting_pay_confirm') {
    setStep(chatId, 'payment');
    return rich(
      tplPayment({
        amount: appt.price,
        serviceName: appt.serviceName,
        pixKey: s.pixKey || '',
        pixName: s.pixName || s.name,
      })
    );
  }

  // show payment menu
  setStep(chatId, 'payment');
  return rich(
    tplPayment({
      amount: appt.price,
      serviceName: appt.serviceName,
      pixKey: s.pixKey || '',
      pixName: s.pixName || s.name,
    })
  );
}

function labelStep(step: BookingStep): string {
  const map: Record<string, string> = {
    idle: 'início',
    menu: 'menu',
    pick_service: 'serviço',
    pick_barber: 'barbeiro',
    pick_day: 'dia',
    pick_time: 'horário',
    pick_name: 'nome',
    confirm: 'confirmação',
    payment: 'pagamento',
    awaiting_pay_confirm: 'PIX',
    waiting_engage: 'fila',
    rate_stars: 'nota',
    rate_comment: 'comentário',
    done: 'ok',
  };
  return map[step] || step;
}

/**
 * Normaliza toque do modal / digitação:
 * "1 · Agendar", "1. Corte", "📅 Agendar\nMarcar", "qualquer"
 */
function handleComplaintBody(chatId: string, text: string): BookingResult {
  const n = normalize(text);
  if (!text || n === '0' || n === 'cancelar' || n === 'menu') {
    setStep(chatId, 'menu');
    return rich(tplMenu());
  }

  // Cliente digitou 1–5 achando que era avaliação (spam "mande nota" no meio da reclamação)
  const onlyStars = text.replace(/\D/g, '');
  if (/^[1-5]$/.test(onlyStars) && text.trim().length <= 3) {
    const appt =
      getAppointment(sessionStore.get(chatId).profile.appt_id || '') ||
      getAppointmentByChat(chatId, false);
    if (appt && ['done', 'rated', 'in_service'].includes(appt.status)) {
      sessionStore.setProfile(chatId, 'appt_id', appt.id);
      sessionStore.setProfile(chatId, 'rate_stars', onlyStars);
      setStep(chatId, 'rate_comment');
      return rich(
        tplActions(
          `${starsBar(Number(onlyStars))} Obrigado`,
          'Quer deixar um comentário?',
          [
            { id: 'pular', title: 'Pular', desc: 'Só a nota' },
            { id: '0', title: 'Menu', desc: 'Voltar' },
          ],
          'Opções',
          `Anotei *${onlyStars} estrelas* ⭐\n\nSe quiser, manda um comentário rápido — ou toca em *Pular*.`
        )
      );
    }
    return textOnly(
      `Recebi *${onlyStars}* — mas tava no modo *reclamação*.\n\n` +
        `Descreve o problema em uma frase (ex: "corte ficou irregular").\n` +
        `Ou digite *0* pra cancelar e *avaliar* pra dar nota.`
    );
  }

  // Rejeita lixo curto ("ok", "4", "a") — não abre chamado fantasma
  if (text.trim().length < 8) {
    return textOnly(
      `Preciso de um pouco mais de detalhe 🙏\n\n` +
        `Conta o que aconteceu em *uma mensagem* (mín. uma frase).\n` +
        `Ou digite *0* pra cancelar.`
    );
  }

  const name = sessionStore.get(chatId).profile.name;
  const appt = getAppointmentByChat(chatId);
  const ticket = createTicket({
    chatId,
    clientName: name || appt?.clientName,
    kind: 'complaint',
    subject: text.slice(0, 80),
    body: text,
    linkedBookingId: appt?.id,
  });
  setStep(chatId, 'menu');
  return rich(
    tplActions(
      'Chamado aberto',
      `Protocolo ${ticket.id}`,
      [
        { id: '8', title: '8 · Falar com a loja', desc: 'Atendente' },
        { id: '0', title: '0 · Menu', desc: 'Início' },
      ],
      'Opções',
      `Pronto — abri o chamado *${ticket.id}* ✅\n\n` +
        `O time da loja vai olhar isso.\n` +
        `Se quiser falar com alguém agora, é só chamar 👇`
    )
  );
}

function resolveChoice(raw: string): string {
  const text = (raw || '').trim();
  if (!text) return text;

  // 1ª linha (lista manda título + descrição em 2 linhas)
  const first = text.split('\n')[0].trim();

  // "1 · Cheguei" → preferir keyword do título, não só o número
  // (senão "2 · Cheguei" vira "2" = preços e quebra o check-in)
  const lead = first.match(/^(\d{1,2})\s*[·.\-)]\s*(.*)$/);
  const restRaw = lead ? lead[2] : first;
  const t = normalize(restRaw || first);

  // keywords SEMPRE antes do número puro
  if (/cheguei|check.?in|ja to na|já tô na|ja to aqui|já tô aqui/.test(t)) {
    return 'cheguei';
  }
  if (/^pagar|pagamento|pix|maquininha/.test(t) || t === 'pagar') return 'pagar';
  if (/^agendar|marcar horario|agendar agora/.test(t) || t === 'agendar') return '1';
  if (/^preco|preços|precos|valores|tabela/.test(t) || t === 'precos' || t === 'preços')
    return '2';
  if (/^equipe|barbeiro|profissional/.test(t) || t === 'equipe') return '3';
  if (/\bgps\b|como chegar|endereco|mapa|localiza/.test(t)) return '4';
  if (/status|fila|espera|minha vez|como ta sua|como tá sua/.test(t)) return '6';
  if (/meus horario|meu horario|horarios/.test(t)) return '7';
  if (/atendente|falar com|humano/.test(t)) return '8';
  if (/reclam|problema|chamado|abrir chamado/.test(t)) return '9';
  if (/confirmar|pode confirmar|presenca|presença/.test(t)) return '1';
  if (/cancelar|melhor nao|melhor não/.test(t)) return '2';
  if (/menu|inicio|voltar|recomeçar|recomecar/.test(t)) return '0';
  if (/atualizar espera|atualizar|quanto falta/.test(t)) return 'status';
  if (/pausar/.test(t)) return '5';

  // slug direto (rowId semântico do modal)
  const slug = first.toLowerCase().replace(/[^\w]/g, '');
  if (['qualquer', 'cheguei', 'remarcar', 'cancelar', 'pagar'].includes(slug)) {
    return slug;
  }
  if (slug === 'pagar' || first.toLowerCase() === 'pagar') return 'pagar';

  // "1 · …" só número quando não achou keyword
  if (lead) return lead[1];

  // só número
  if (/^\d{1,2}$/.test(first)) return first;
  if (/qualquer|tanto faz/.test(t)) return 'qualquer';
  if (/atualizar|atualiza/.test(t)) return '1';
  if (/pausar|avisos/.test(t)) return '5';

  return first;
}

/** Fila: nunca spammar "prepare-se" no Oi */
function handleWaitingEngage(
  chatId: string,
  ne: string,
  _text: string
): BookingResult {
  const appt =
    getAppointment(sessionStore.get(chatId).profile.appt_id || '') ||
    getAppointmentByChat(chatId);

  // saiu da fila / finalizou
  if (!appt || !['waiting', 'checked_in', 'in_service'].includes(appt.status)) {
    setStep(chatId, 'menu');
    return rich(tplMenu());
  }

  const snap = estimateWait(appt);

  // menu da fila (oi, oie, qualquer coisa vaga)
  if (
    !ne ||
    ne === 'oi' ||
    ne === 'ola' ||
    ne === 'olá' ||
    ne === 'oie' ||
    ne === 'eae' ||
    ne === 'menu' ||
    ne === '0' ||
    ne === 'ajuda' ||
    ne === 'opcoes'
  ) {
    if (ne === '0' || ne === 'menu') {
      // menu completo SEM sair da fila no sistema
      return rich(tplMenu());
    }
    return rich(
      tplWaitingMenu({
        name: appt.clientName,
        etaMsg: snap.message,
        barber: appt.barberName,
        service: appt.serviceName,
      })
    );
  }

  if (ne === '1' || ne === 'status' || ne === 'atualiza' || ne.includes('atualiz')) {
    // Reabre o modal da fila com ETA atualizado (1 bolha)
    return rich(
      tplWaitingMenu({
        name: appt.clientName,
        etaMsg: snap.message,
        barber: appt.barberName,
        service: appt.serviceName,
      })
    );
  }

  if (ne === '2' || ne === 'pagar' || ne === 'pix') {
    setStep(chatId, 'payment');
    sessionStore.setProfile(chatId, 'appt_id', appt.id);
    const s = shop().shop;
    return rich(
      tplPayment({
        amount: appt.price,
        serviceName: appt.serviceName,
        pixKey: s.pixKey || '',
        pixName: s.pixName || s.name,
      })
    );
  }

  if (ne === '3' || ne === 'gps' || ne.includes('mapa')) {
    return rich(tplLocation());
  }

  if (ne === '4' || ne.includes('horario') || ne.includes('meus')) {
    const list = listClientAppointments(chatId);
    setStep(chatId, 'manage_list' as BookingStep);
    sessionStore.setProfile(chatId, 'manage_ids', list.map((a) => a.id).join(','));
    return rich(tplMyBookings(list));
  }

  if (ne === '5' || ne.includes('sair')) {
    // sai só do modo engajamento, mantém waiting na loja
    setStep(chatId, 'done');
    return rich(
      tplActions(
        'Avisos pausados',
        'Você continua na fila da loja',
        [
          { id: '6', title: '6 · Ver status', desc: 'Tempo de espera' },
          { id: '0', title: '0 · Menu', desc: 'Início' },
        ]
      )
    );
  }

  // fallback: opções, nunca o texto longo de engajamento
  return rich(
    tplWaitingMenu({
      name: appt.clientName,
      etaMsg: snap.message,
      barber: appt.barberName,
      service: appt.serviceName,
    })
  );
}

function handleReminderReply(
  chatId: string,
  ne: string
): BookingResult | null {
  // só se última msg do bot foi lembrete — usamos profile flag
  const flag = sessionStore.get(chatId).profile.awaiting_reminder;
  if (!flag) return null;

  const appt = getAppointmentByChat(chatId);
  if (!appt) {
    sessionStore.setProfile(chatId, 'awaiting_reminder', '');
    return null;
  }

  if (ne === '1' || ne === 'vou' || ne.includes('confirmo')) {
    confirmPresence(appt.id);
    sessionStore.setProfile(chatId, 'awaiting_reminder', '');
    return rich(
      tplActions(
        'Presença confirmada',
        `${appt.date} ${appt.time} · ${appt.serviceName}`,
        [
          { id: '4', title: '4 · GPS', desc: 'Como chegar' },
          { id: '0', title: '0 · Menu', desc: 'Início' },
        ]
      )
    );
  }

  if (ne === '2' || ne === 'remarcar') {
    sessionStore.setProfile(chatId, 'awaiting_reminder', '');
    const old = startReschedule(chatId, appt.id);
    if (old) {
      const barber = shop().barbers.find((b) => b.id === old.barberId)!;
      const svc = shop().services.find((s) => s.id === old.serviceId)!;
      return rich(tplDays(barber, svc));
    }
  }

  if (ne === '3' || ne === 'cancelar') {
    sessionStore.setProfile(chatId, 'awaiting_reminder', '');
    cancelClientAppt(appt.id);
    setStep(chatId, 'menu');
    return rich(
      tplActions(
        'Cancelado',
        'Horário liberado',
        [
          { id: '1', title: '1 · Agendar outro', desc: 'Novo horário' },
          { id: '0', title: '0 · Menu', desc: 'Início' },
        ]
      )
    );
  }

  if (ne === '4' || ne === 'gps') {
    return rich(tplLocation());
  }

  return null;
}
