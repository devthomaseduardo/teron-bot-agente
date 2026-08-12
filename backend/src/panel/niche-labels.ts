/**
 * Vocabulário do painel por nicho — UI universal.
 */
export type NicheLabels = {
  nicheId: string;
  business: string;
  professional: string;
  professionals: string;
  service: string;
  services: string;
  booking: string;
  bookings: string;
  queue: string;
  client: string;
  clients: string;
  dayReport: string;
  daySchedule: string;
  urgency: string;
};

const MAP: Record<string, Partial<NicheLabels>> = {
  barbershop: {
    business: 'barbearia',
    professional: 'barbeiro',
    professionals: 'equipe',
    service: 'serviço',
    services: 'serviços',
    booking: 'horário',
    bookings: 'agendamentos',
    queue: 'fila',
    client: 'cliente',
    clients: 'clientes',
  },
  barbearia: {
    business: 'barbearia',
    professional: 'barbeiro',
    professionals: 'equipe',
    service: 'serviço',
    services: 'serviços',
    booking: 'horário',
    bookings: 'agendamentos',
    queue: 'fila',
    client: 'cliente',
    clients: 'clientes',
  },
  clinic: {
    business: 'clínica',
    professional: 'profissional',
    professionals: 'equipe',
    service: 'procedimento',
    services: 'procedimentos',
    booking: 'consulta',
    bookings: 'consultas',
    queue: 'espera',
    client: 'paciente',
    clients: 'pacientes',
  },
  clinica: {
    business: 'clínica',
    professional: 'profissional',
    professionals: 'equipe',
    service: 'procedimento',
    services: 'procedimentos',
    booking: 'consulta',
    bookings: 'consultas',
    queue: 'espera',
    client: 'paciente',
    clients: 'pacientes',
  },
  dental: {
    business: 'consultório',
    professional: 'dentista',
    professionals: 'equipe',
    service: 'procedimento',
    services: 'procedimentos',
    booking: 'consulta',
    bookings: 'consultas',
    queue: 'espera',
    client: 'paciente',
    clients: 'pacientes',
  },
  beauty: {
    business: 'salão',
    professional: 'profissional',
    professionals: 'equipe',
    service: 'serviço',
    services: 'serviços',
    booking: 'atendimento',
    bookings: 'atendimentos',
    queue: 'fila',
    client: 'cliente',
    clients: 'clientes',
  },
  pet: {
    business: 'pet shop',
    professional: 'profissional',
    professionals: 'equipe',
    service: 'serviço',
    services: 'serviços',
    booking: 'atendimento',
    bookings: 'atendimentos',
    queue: 'fila',
    client: 'tutor',
    clients: 'tutores',
  },
  auto: {
    business: 'oficina',
    professional: 'mecânico',
    professionals: 'equipe',
    service: 'serviço',
    services: 'serviços',
    booking: 'serviço',
    bookings: 'serviços',
    queue: 'oficina',
    client: 'cliente',
    clients: 'clientes',
  },
  legal: {
    business: 'escritório',
    professional: 'advogado',
    professionals: 'equipe jurídica',
    service: 'consulta',
    services: 'serviços jurídicos',
    booking: 'consulta',
    bookings: 'consultas',
    queue: 'espera',
    client: 'cliente',
    clients: 'clientes',
  },
  lawyer: {
    business: 'escritório',
    professional: 'advogado',
    professionals: 'equipe jurídica',
    service: 'consulta',
    services: 'serviços jurídicos',
    booking: 'consulta',
    bookings: 'consultas',
    queue: 'espera',
    client: 'cliente',
    clients: 'clientes',
  },
  advogado: {
    business: 'escritório',
    professional: 'advogado',
    professionals: 'equipe jurídica',
    service: 'consulta',
    services: 'serviços jurídicos',
    booking: 'consulta',
    bookings: 'consultas',
    queue: 'espera',
    client: 'cliente',
    clients: 'clientes',
  },
  teron: {
    business: 'studio',
    professional: 'consultor',
    professionals: 'time',
    service: 'projeto',
    services: 'projetos',
    booking: 'call',
    bookings: 'reuniões',
    queue: 'pipeline',
    client: 'cliente B2B',
    clients: 'clientes',
  },
  generic: {},
};

const BASE: NicheLabels = {
  nicheId: 'generic',
  business: 'negócio',
  professional: 'profissional',
  professionals: 'equipe',
  service: 'serviço',
  services: 'serviços',
  booking: 'atendimento',
  bookings: 'atendimentos',
  queue: 'fila',
  client: 'cliente',
  clients: 'clientes',
  dayReport: 'Resumo do dia',
  daySchedule: 'Atendimentos de hoje',
  urgency: 'Precisa de você',
};

export function resolveNicheLabels(nicheId?: string | null): NicheLabels {
  const id = String(nicheId || process.env.NICHE_ID || 'generic').toLowerCase();
  const patch = MAP[id] || MAP.generic || {};
  return {
    ...BASE,
    ...patch,
    nicheId: id,
    dayReport: 'Resumo do dia',
    daySchedule: 'Atendimentos de hoje',
    urgency: 'Precisa de você',
  };
}
