/**
 * Vocabulário do painel por nicho — UI universal.
 * Backend de agenda ainda usa appointments genéricos;
 * aqui só rotulamos o que o dono vê.
 */
export type NicheLabels = {
  nicheId: string;
  business: string; // loja / clínica / escritório
  professional: string; // barbeiro / médico / consultor
  professionals: string;
  service: string;
  services: string;
  booking: string; // atendimento / consulta / sessão
  bookings: string;
  queue: string; // fila / sala de espera
  client: string;
  clients: string;
  dayReport: string;
  daySchedule: string;
  urgency: string;
};

const MAP: Record<string, Partial<NicheLabels>> = {
  barbershop: {
    business: 'loja',
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
    professionals: 'equipe',
    service: 'serviço',
    services: 'serviços',
    booking: 'reunião',
    bookings: 'reuniões',
    queue: 'espera',
    client: 'cliente',
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
