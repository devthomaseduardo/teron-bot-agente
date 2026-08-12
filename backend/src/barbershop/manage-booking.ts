/**
 * Meus horários · cancelar · remarcar
 */
import type { Appointment } from './types.js';
import {
  cancelAppointment,
  getAppointment,
  loadAppointments,
  updateAppointment,
} from './store.js';
import { formatMoney } from './schedule.js';
import type { RichMessage } from '../messaging/types.js';
import { sessionStore } from '../core/session.js';

export function listClientAppointments(chatId: string): Appointment[] {
  const now = Date.now();
  return loadAppointments()
    .filter((a) => a.chatId === chatId)
    .filter((a) => !['cancelled', 'no_show', 'rated'].includes(a.status))
    .filter((a) => {
      // futuros ou hoje ainda úteis
      const [y, m, d] = a.date.split('-').map(Number);
      const [hh, mm] = a.time.split(':').map(Number);
      const t = new Date(y, m - 1, d, hh, mm).getTime();
      return t > now - 2 * 60 * 60 * 1000; // ainda mostra 2h depois
    })
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
}

export function tplMyBookings(list: Appointment[]): RichMessage {
  if (!list.length) {
    return {
      text: 'Nenhum horário ativo. Toque no menu para agendar.',
      intro: 'Nenhum horário ativo',
      modalOnly: true,
      keepTogether: true,
      list: {
        buttonText: '📋 Opções',
        title: 'Meus horários',
        description: 'Nenhum ativo no momento',
        footer: 'Navalha Fina · Atendimento',
        sections: [
          {
            title: 'Ações',
            rows: [
              { rowId: '1', title: '📅 Agendar', description: 'Marcar horário' },
              { rowId: '0', title: '🏠 Menu principal', description: 'Início' },
            ],
          },
        ],
      },
    };
  }

  return {
    text: `Seus horários (${list.length}). Toque e escolha.`,
    intro: 'Escolha um horário',
    modalOnly: true,
    keepTogether: true,
    list: {
      buttonText: '📋 Horários',
      title: 'Meus horários',
      description: `${list.length} ativo(s)`,
      footer: 'Navalha Fina · Atendimento',
      sections: [
        {
          title: 'Seus agendamentos',
          rows: [
            ...list.slice(0, 10).map((a, i) => ({
              rowId: String(i + 1),
              title: `${a.date} ${a.time}`,
              description: `${a.serviceName} · ${a.barberName} · ${formatMoney(a.price)}`,
            })),
            { rowId: '0', title: '🏠 Menu principal', description: 'Início' },
          ],
        },
      ],
    },
  };
}

export function tplManageOne(a: Appointment): RichMessage {
  const desc =
    `${a.date} ${a.time} · ${a.serviceName}`.slice(0, 60);
  return {
    text: `Horário ${a.id}: ${a.date} ${a.time}`,
    intro: desc,
    modalOnly: true,
    keepTogether: true,
    list: {
      buttonText: '⚙️ Gerenciar',
      title: 'Seu horário',
      description: desc,
      footer: 'Navalha Fina · Atendimento',
      sections: [
        {
          title: 'Ações',
          rows: [
            { rowId: '1', title: '🔄 Remarcar', description: 'Trocar data/hora' },
            { rowId: '2', title: '❌ Cancelar', description: 'Liberar horário' },
            { rowId: '3', title: '💳 Pagar', description: 'PIX ou maquininha' },
            { rowId: '4', title: '📍 Como chegar', description: 'GPS da loja' },
            { rowId: '0', title: '↩️ Voltar', description: 'Lista de horários' },
          ],
        },
      ],
    },
  };
}

export function cancelClientAppt(apptId: string): boolean {
  return cancelAppointment(apptId);
}

/** Inicia remarcação: cancela o atual e manda pro fluxo de serviço mantendo nome */
export function startReschedule(chatId: string, apptId: string): Appointment | null {
  const a = getAppointment(apptId);
  if (!a || a.chatId !== chatId) return null;
  cancelAppointment(apptId);
  sessionStore.setProfile(chatId, 'name', a.clientName);
  sessionStore.setProfile(chatId, 'service_id', a.serviceId);
  sessionStore.setProfile(chatId, 'service_name', a.serviceName);
  sessionStore.setProfile(chatId, 'barber_id', a.barberId);
  sessionStore.setProfile(chatId, 'barber_name', a.barberName);
  sessionStore.setProfile(chatId, 'booking_step', 'pick_day');
  sessionStore.setProfile(chatId, 'reschedule_from', apptId);
  return a;
}

export function confirmPresence(apptId: string): Appointment | null {
  return updateAppointment(apptId, {
    notes: 'presence_confirmed',
  });
}
