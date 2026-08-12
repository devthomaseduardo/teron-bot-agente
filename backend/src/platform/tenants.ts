/**
 * Tenants da plataforma (super-admin).
 * Fase D: provisionamento real; agora config local em data/platform.json
 */
import fs from 'fs';
import path from 'path';
import type { TenantMeta } from './types.js';

const FILE = () => path.join(process.cwd(), 'data', 'platform.json');

export interface PlatformConfig {
  platformName: string;
  supportEmail: string;
  defaultNiche: string;
  phases: Array<{
    id: string;
    name: string;
    status: 'done' | 'active' | 'planned';
    items: string[];
  }>;
  tenants: TenantMeta[];
  settings: {
    noShowGraceMin: number;
    unpaidRemindHours: number;
    maxTenants: number;
    panelUrl: string;
    adminUrl: string;
  };
}

function defaults(): PlatformConfig {
  return {
    platformName: 'Agente Comercial WhatsApp',
    supportEmail: 'developer.thomas@outlook.com.br',
    defaultNiche: 'barbershop',
    phases: [
      {
        id: 'A',
        name: 'Bot + mídia + ops',
        status: 'done',
        items: [
          'Modal profissional + intro',
          'Áudio/foto/documento',
          'Reclamação (tickets)',
          'No-show / unpaid / avaliação auto',
        ],
      },
      {
        id: 'B',
        name: 'Painel dono + admin + QR',
        status: 'active',
        items: [
          'Painel do dono (agenda, fila, PIX, tickets)',
          'Painel super-admin (tenants, fases, config)',
          'QR WhatsApp no painel (instalação online) ✓',
          'Tom humano nas mensagens ✓',
          'Login JWT / multi-usuário loja',
        ],
      },
      {
        id: 'C',
        name: 'Multi-nicho plugin',
        status: 'planned',
        items: [
          'NichePlugin formal',
          'Clínica / restaurante / imobiliária no mesmo painel',
          'Recursos genéricos (Resource, Offering, Booking)',
        ],
      },
      {
        id: 'D',
        name: 'Instalação online 1-click',
        status: 'planned',
        items: [
          'Checkout → cria tenant',
          'Container bot por tenant',
          'QR self-service + go-live',
          'Isolamento data/tokens',
        ],
      },
      {
        id: 'E',
        name: 'Escala & monétização',
        status: 'planned',
        items: [
          'Billing / planos',
          'White-label',
          'Limites msgs/mês e IA',
          'Métricas multi-tenant',
        ],
      },
    ],
    tenants: [
      {
        id: 't_navalha',
        name: 'Barbearia Navalha Fina',
        nicheId: 'barbershop',
        plan: 'pro',
        status: 'live',
        createdAt: new Date().toISOString(),
        slug: 'navalha',
      },
    ],
    settings: {
      noShowGraceMin: Number(process.env.NO_SHOW_GRACE_MIN || 25),
      unpaidRemindHours: Number(process.env.UNPAID_REMIND_HOURS || 12),
      maxTenants: 50,
      panelUrl: process.env.PANEL_PUBLIC_URL || 'http://localhost:8787',
      adminUrl: process.env.ADMIN_PUBLIC_URL || 'http://localhost:8787/admin',
    },
  };
}

export function loadPlatform(): PlatformConfig {
  const f = FILE();
  const dir = path.dirname(f);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(f)) {
    const d = defaults();
    fs.writeFileSync(f, JSON.stringify(d, null, 2), 'utf8');
    return d;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(f, 'utf8')) as PlatformConfig;
    const base = defaults();
    return {
      ...base,
      ...raw,
      settings: { ...base.settings, ...(raw.settings || {}) },
      phases: raw.phases?.length ? raw.phases : base.phases,
      tenants: raw.tenants?.length ? raw.tenants : base.tenants,
    };
  } catch {
    return defaults();
  }
}

export function savePlatform(patch: Partial<PlatformConfig>): PlatformConfig {
  const cur = loadPlatform();
  const next: PlatformConfig = {
    ...cur,
    ...patch,
    settings: { ...cur.settings, ...(patch.settings || {}) },
    phases: patch.phases || cur.phases,
    tenants: patch.tenants || cur.tenants,
  };
  fs.writeFileSync(FILE(), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

export function upsertTenant(t: TenantMeta): PlatformConfig {
  const p = loadPlatform();
  const i = p.tenants.findIndex((x) => x.id === t.id);
  if (i >= 0) p.tenants[i] = t;
  else p.tenants.unshift(t);
  return savePlatform({ tenants: p.tenants });
}

export function botHealthHint(): {
  logExists: boolean;
  logAgeSec: number | null;
  sessionDir: boolean;
  appointments: number;
} {
  const log = path.join(process.cwd(), 'data', 'bot.log');
  const tokens = path.join(
    process.cwd(),
    'tokens',
    process.env.SESSION_NAME || 'assistente'
  );
  const appts = path.join(process.cwd(), 'data', 'appointments.json');
  let logAgeSec: number | null = null;
  let logExists = false;
  try {
    if (fs.existsSync(log)) {
      logExists = true;
      logAgeSec = Math.floor((Date.now() - fs.statSync(log).mtimeMs) / 1000);
    }
  } catch {
    /* ignore */
  }
  let appointments = 0;
  try {
    if (fs.existsSync(appts)) {
      appointments = (JSON.parse(fs.readFileSync(appts, 'utf8')) as unknown[])
        .length;
    }
  } catch {
    /* ignore */
  }
  return {
    logExists,
    logAgeSec,
    sessionDir: fs.existsSync(tokens),
    appointments,
  };
}
