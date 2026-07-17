/**
 * Automação operacional multi-nicho (barbearia primeiro).
 * - no-show: passou do horário + grace sem check-in
 * - unpaid reminder: agendado sem pagamento
 * - post-service rating nudge
 */
import {
  loadAppointments,
  updateAppointment,
  enqueueOwnerMessage,
} from '../barbershop/store.js';
import type { Appointment } from '../barbershop/types.js';

const GRACE_NO_SHOW_MIN = Number(process.env.NO_SHOW_GRACE_MIN || 25);
const UNPAID_REMIND_HOURS = Number(process.env.UNPAID_REMIND_HOURS || 12);

function apptStartMs(a: Appointment): number {
  const [y, m, d] = a.date.split('-').map(Number);
  const [hh, mm] = a.time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm).getTime();
}

function alreadyFlagged(a: Appointment, key: string): boolean {
  return Boolean(a.notes && a.notes.includes(`[${key}]`));
}

function flag(a: Appointment, key: string): string {
  const base = (a.notes || '').trim();
  return base ? `${base} [${key}]` : `[${key}]`;
}

export interface LifecyclePush {
  chatId: string;
  text: string;
  kind: 'no_show' | 'unpaid' | 'rate';
}

/**
 * Roda a cada ciclo do worker. Retorna msgs a enviar ao cliente.
 */
export function runLifecyclePass(): LifecyclePush[] {
  const now = Date.now();
  const out: LifecyclePush[] = [];
  const all = loadAppointments();

  for (const a of all) {
    if (['cancelled', 'no_show', 'rated', 'done', 'in_service'].includes(a.status)) {
      // pós-serviço: pedir nota se done e ainda não pediu
      if (a.status === 'done' && !a.rating && !alreadyFlagged(a, 'rate_asked')) {
        const end = apptStartMs(a) + a.durationMin * 60_000;
        if (now > end + 10 * 60_000) {
          updateAppointment(a.id, { notes: flag(a, 'rate_asked') });
          const first = (a.clientName || '').split(' ')[0] || 'aí';
          out.push({
            chatId: a.chatId,
            kind: 'rate',
            text:
              `Oi, *${first}*! ⭐\n\n` +
              `Como foi o corte com *${a.barberName}*?\n` +
              `Me manda uma nota de *1* a *5* (ou digita *avaliar*).\n` +
              `Sua opinião ajuda demais 🙏`,
          });
        }
      }
      continue;
    }

    const start = apptStartMs(a);
    if (Number.isNaN(start)) continue;

    // NO-SHOW: passou horário + grace, ainda booked/paid/awaiting_payment
    if (
      ['booked', 'paid', 'awaiting_payment'].includes(a.status) &&
      now > start + GRACE_NO_SHOW_MIN * 60_000
    ) {
      updateAppointment(a.id, {
        status: 'no_show',
        notes: flag(a, 'auto_no_show'),
      });
      enqueueOwnerMessage(
        a.chatId,
        `⚠️ Falta automática: ${a.clientName} · ${a.date} ${a.time} · ${a.serviceName}`
      );
      const first = (a.clientName || '').split(' ')[0] || 'tudo bem';
      out.push({
        chatId: a.chatId,
        kind: 'no_show',
        text:
          `Oi, *${first}* 😊\n\n` +
          `Passou o horário das *${a.time}* e a gente não te viu por aqui.\n\n` +
          `Se ainda der pra vir, manda *cheguei*.\n` +
          `Quer remarcar? *remarcar* · cancelar: *cancelar* · menu: *0*`,
      });
      continue;
    }

    // UNPAID: booked sem pagamento, falta > N horas para o horário
    if (
      a.status === 'booked' &&
      a.payment?.status !== 'confirmed' &&
      !alreadyFlagged(a, 'unpaid_remind')
    ) {
      const hoursToGo = (start - now) / 3_600_000;
      // lembrete se o agendamento foi criado há mais de UNPAID_REMIND e ainda não pagou
      const created = new Date(a.createdAt).getTime();
      const hoursSinceCreate = (now - created) / 3_600_000;
      if (
        hoursSinceCreate >= UNPAID_REMIND_HOURS &&
        hoursToGo > 2 &&
        hoursToGo < 72
      ) {
        updateAppointment(a.id, { notes: flag(a, 'unpaid_remind') });
        const first = (a.clientName || '').split(' ')[0] || 'tudo bem';
        out.push({
          chatId: a.chatId,
          kind: 'unpaid',
          text:
            `Oi, *${first}*! 💳\n\n` +
            `Seu horário *${a.date} às ${a.time}* ainda tá sem pagamento por aqui.\n\n` +
            `Se quiser adiantar, manda *pagar* (PIX ou maquininha).\n` +
            `Pode pagar no dia também — sem pressão 😊`,
        });
      }
    }
  }

  return out;
}

export function startLifecycleWorker(
  pushText: (chatId: string, text: string) => Promise<void> | void
): NodeJS.Timeout {
  const tick = async () => {
    try {
      const msgs = runLifecyclePass();
      for (const m of msgs) {
        await pushText(m.chatId, m.text);
      }
    } catch {
      /* ignore cycle errors */
    }
  };
  void tick();
  // a cada 3 min
  return setInterval(() => void tick(), 3 * 60_000);
}
