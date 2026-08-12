import type { Barber, ServiceItem } from './types.js';
import {
  appointmentsForBarberDay,
  loadBarbershop,
  saveAppointment,
} from './store.js';
import type { Appointment } from './types.js';

const DAY_NAMES = [
  'domingo',
  'segunda',
  'terça',
  'quarta',
  'quinta',
  'sexta',
  'sábado',
];

export function dayName(d: number): string {
  return DAY_NAMES[d] || String(d);
}

export function parseTimeToMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function minToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatMoney(n: number): string {
  return `R$ ${n.toFixed(2).replace('.', ',')}`;
}

export function formatDuration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${m}min` : `${h}h`;
}

/** Próximos N dias abertos a partir de hoje */
export function upcomingOpenDays(count = 7): Array<{
  date: string;
  weekday: number;
  label: string;
}> {
  const shop = loadBarbershop().shop;
  const out: Array<{ date: string; weekday: number; label: string }> = [];
  const cur = new Date();
  cur.setHours(12, 0, 0, 0);

  for (let i = 0; i < 21 && out.length < count; i++) {
    const d = new Date(cur);
    d.setDate(cur.getDate() + i);
    const wd = d.getDay();
    if (!shop.daysOpen.includes(wd)) continue;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const date = `${yyyy}-${mm}-${dd}`;
    const when =
      i === 0 ? 'hoje' : i === 1 ? 'amanhã' : dayName(wd);
    out.push({
      date,
      weekday: wd,
      label: `${when} (${dd}/${mm})`,
    });
  }
  return out;
}

export function barberWorksOn(barber: Barber, weekday: number): boolean {
  return Boolean(barber.schedule[String(weekday)]);
}

/**
 * Gera slots livres para barbeiro + dia + duração do serviço.
 * Considera agenda do barbeiro e agendamentos já confirmados.
 */
export function availableSlots(
  barber: Barber,
  date: string,
  service: ServiceItem,
  slotStepMin?: number
): string[] {
  const shop = loadBarbershop().shop;
  const step = slotStepMin || shop.slotMinutes || 30;
  const [y, m, d] = date.split('-').map(Number);
  const weekday = new Date(y, m - 1, d, 12).getDay();
  const window = barber.schedule[String(weekday)];
  if (!window) return [];

  const [startStr, endStr] = window;
  const start = parseTimeToMin(startStr);
  const end = parseTimeToMin(endStr);
  const duration = service.durationMin;
  const booked = appointmentsForBarberDay(barber.id, date);

  const slots: string[] = [];
  for (let t = start; t + duration <= end; t += step) {
    const slotEnd = t + duration;
    const conflict = booked.some((a) => {
      const aStart = parseTimeToMin(a.time);
      const aEnd = aStart + a.durationMin;
      return t < aEnd && slotEnd > aStart;
    });
    if (conflict) continue;

    // não oferecer slots que já passaram (se for hoje)
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (date === today) {
      const nowMin = now.getHours() * 60 + now.getMinutes() + 20; // margem 20 min
      if (t < nowMin) continue;
    }

    slots.push(minToTime(t));
  }
  return slots;
}

export function findService(query: string): ServiceItem | null {
  const shop = loadBarbershop();
  const n = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // por número do menu
  const num = n.match(/^(\d+)$/);
  if (num) {
    const idx = Number(num[1]) - 1;
    if (shop.services[idx]) return shop.services[idx];
  }
  for (const s of shop.services) {
    if (n.includes(s.id)) return s;
    if (n.includes(s.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')))
      return s;
    if (s.keywords.some((k) => n.includes(k.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))))
      return s;
  }
  return null;
}

export function findBarber(query: string): Barber | null {
  const shop = loadBarbershop();
  const n = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const num = n.match(/^(\d+)$/);
  if (num) {
    const idx = Number(num[1]) - 1;
    if (shop.barbers[idx]) return shop.barbers[idx];
  }
  for (const b of shop.barbers) {
    if (
      n.includes(b.name.toLowerCase()) ||
      n.includes(b.nickname.toLowerCase()) ||
      n === b.id
    ) {
      return b;
    }
  }
  if (n.includes('qualquer') || n.includes('tanto faz') || n.includes('indiferente')) {
    return shop.barbers[0];
  }
  return null;
}

export function findDay(
  query: string,
  barber?: Barber,
  service?: ServiceItem
): { date: string; weekday: number; label: string } | null {
  const n = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // Se tiver barbeiro+serviço, numera só dias com slot
  const days =
    barber && service
      ? openDaysWithSlots(barber, service, 10)
      : upcomingOpenDays(10);

  if (n.includes('hoje')) return days.find((d) => d.label.startsWith('hoje')) || null;
  if (n.includes('amanha') || n.includes('amanhã'))
    return days.find((d) => d.label.startsWith('amanhã')) || null;

  const num = n.match(/^(\d+)$/);
  if (num) {
    const idx = Number(num[1]) - 1;
    if (days[idx]) return days[idx];
  }

  for (const d of days) {
    if (n.includes(dayName(d.weekday).normalize('NFD').replace(/[\u0300-\u036f]/g, ''))) {
      return d;
    }
    const dm = d.date.slice(8) + '/' + d.date.slice(5, 7);
    if (n.includes(dm) || n.includes(d.date)) return d;
  }
  return null;
}

export function listServicesText(): string {
  const { services, shop } = loadBarbershop();
  const lines = services.map(
    (s, i) =>
      `${i + 1}) *${s.name}* — ${formatMoney(s.price)} · ${formatDuration(s.durationMin)}`
  );
  return (
    `📋 *Serviços — ${shop.name}*\n\n` +
    lines.join('\n') +
    `\n\nResponda com o *número* ou o nome do serviço.`
  );
}

export function listBarbersText(service?: ServiceItem): string {
  const { barbers, shop } = loadBarbershop();
  const lines = barbers.map((b, i) => {
    const days = Object.keys(b.schedule)
      .map((d) => dayName(Number(d)).slice(0, 3))
      .join(', ');
    return `${i + 1}) *${b.name}* (${b.nickname}) — ${b.specialty}\n   Agenda: ${days}`;
  });
  return (
    `💇 *Barbeiros — ${shop.name}*\n` +
    (service ? `Serviço: ${service.name}\n` : '') +
    `\n` +
    lines.join('\n') +
    `\n\nResponda com o *número* ou o nome. Ou diga *qualquer*.`
  );
}

/** Dias com pelo menos 1 slot livre */
export function openDaysWithSlots(
  barber: Barber,
  service: ServiceItem,
  count = 7
): Array<{ date: string; weekday: number; label: string; slots: string[] }> {
  const raw = upcomingOpenDays(14).filter((d) => barberWorksOn(barber, d.weekday));
  const out: Array<{
    date: string;
    weekday: number;
    label: string;
    slots: string[];
  }> = [];
  for (const d of raw) {
    const slots = availableSlots(barber, d.date, service);
    if (!slots.length) continue;
    out.push({ ...d, slots });
    if (out.length >= count) break;
  }
  return out;
}

export function listDaysText(barber: Barber, service: ServiceItem): string {
  const days = openDaysWithSlots(barber, service, 7);
  if (!days.length) {
    return `${barber.name} não tem horários livres nesta semana. Escolha outro barbeiro.`;
  }
  const lines = days.map(
    (d, i) => `${i + 1}) *${d.label}* — ${d.slots.length} horário(s) livre(s)`
  );
  return (
    `📅 Dias para *${barber.name}* · ${service.name}\n\n` +
    lines.join('\n') +
    `\n\nResponda com o *número* do dia (ex: 1) ou "hoje"/"amanhã".`
  );
}

export function listSlotsText(
  barber: Barber,
  dateLabel: string,
  date: string,
  service: ServiceItem
): string {
  const slots = availableSlots(barber, date, service);
  if (!slots.length) {
    return `Sem horários livres com ${barber.name} em ${dateLabel}. Escolha outro dia ou barbeiro.`;
  }
  const show = slots.slice(0, 12);
  const lines = show.map((t, i) => `${i + 1}) ${t}`);
  return (
    `⏰ Horários — *${barber.name}* · ${dateLabel}\n` +
    `Serviço: ${service.name} (${formatDuration(service.durationMin)}) · ${formatMoney(service.price)}\n\n` +
    lines.join('\n') +
    (slots.length > 12 ? `\n… +${slots.length - 12} horários` : '') +
    `\n\nResponda com o *número* ou o horário (ex: 14:30).`
  );
}

export function buildConfirmation(data: {
  clientName: string;
  barber: Barber;
  service: ServiceItem;
  date: string;
  time: string;
  label: string;
}): string {
  const shop = loadBarbershop().shop;
  return (
    `✅ *Confira seu agendamento*\n\n` +
    `👤 Cliente: *${data.clientName}*\n` +
    `✂️ Serviço: *${data.service.name}*\n` +
    `💰 Valor: *${formatMoney(data.service.price)}*\n` +
    `⌛ Duração: *${formatDuration(data.service.durationMin)}*\n` +
    `💈 Barbeiro: *${data.barber.name}* (${data.barber.nickname})\n` +
    `📅 Quando: *${data.label}* às *${data.time}*\n` +
    `📍 ${shop.address}\n\n` +
    `Confirma? Responda *sim* ou *não*.`
  );
}

export function createBookingId(): string {
  return 'apt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function confirmAppointment(input: {
  chatId: string;
  clientName: string;
  clientPhone?: string;
  barber: Barber;
  service: ServiceItem;
  date: string;
  time: string;
}): Appointment {
  const appt: Appointment = {
    id: createBookingId(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    chatId: input.chatId,
    clientName: input.clientName,
    clientPhone: input.clientPhone,
    barberId: input.barber.id,
    barberName: input.barber.name,
    serviceId: input.service.id,
    serviceName: input.service.name,
    price: input.service.price,
    durationMin: input.service.durationMin,
    date: input.date,
    time: input.time,
    status: 'booked',
    payment: {
      status: 'none',
      method: 'none',
      amount: input.service.price,
    },
  };
  const free = availableSlots(input.barber, input.date, input.service);
  if (!free.includes(input.time)) {
    throw new Error('Horário acabou de ficar indisponível');
  }
  saveAppointment(appt);
  return appt;
}
