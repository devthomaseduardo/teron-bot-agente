/**
 * Multi-tenant: cada cliente tem pasta isolada + token de acesso.
 *
 * Estrutura:
 *   tenants/{slug}/
 *     config/barbershop.json
 *     config/business.json
 *     data/appointments.json, payments.json, ...
 *     owner.json   { token, passwordHint, email }
 *
 * Bot: TENANT_ID=slug  (ou vazio = legacy config/ + data/ raiz)
 * Painel: Authorization Bearer <ownerToken> resolve o tenant
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { TenantMeta } from './types.js';
import { loadPlatform, savePlatform, upsertTenant } from './tenants.js';

const ROOT = () => process.cwd();
const TENANTS_ROOT = () => path.join(ROOT(), 'tenants');

export interface OwnerCredentials {
  token: string;
  email?: string;
  name?: string;
  createdAt: string;
  lastLoginAt?: string;
  /** senha opcional em plain só para dev; produção: hash */
  password?: string;
}

export interface TenantPaths {
  slug: string;
  root: string;
  configDir: string;
  dataDir: string;
  tokensDir: string;
  barbershopConfig: string;
  businessConfig: string;
  payments: string;
  appointments: string;
  ownerOutbox: string;
  shopOps: string;
  tickets: string;
  sessions: string;
  ownerFile: string;
}

/** Tenant ativo do processo (bot) */
let processTenantSlug: string | null =
  process.env.TENANT_ID || process.env.TENANT_SLUG || null;

/** Request-scoped no painel (single-thread Node request) */
let requestTenantSlug: string | null = null;

/** Request-scoped (painel) — Map por token */
const tokenToSlug = new Map<string, string>();

export function setProcessTenant(slug: string | null): void {
  processTenantSlug = slug || null;
  process.env.TENANT_ID = slug || '';
}

export function getProcessTenant(): string | null {
  return (
    requestTenantSlug ||
    processTenantSlug ||
    process.env.TENANT_ID ||
    null
  );
}

export function setRequestTenant(slug: string | null): void {
  requestTenantSlug = slug ? sanitizeSlug(slug) : null;
}

export function withTenant<T>(slug: string | null, fn: () => T): T {
  const prev = requestTenantSlug;
  requestTenantSlug = slug ? sanitizeSlug(slug) : null;
  try {
    return fn();
  } finally {
    requestTenantSlug = prev;
  }
}

export async function withTenantAsync<T>(
  slug: string | null,
  fn: () => Promise<T>
): Promise<T> {
  const prev = requestTenantSlug;
  requestTenantSlug = slug ? sanitizeSlug(slug) : null;
  try {
    return await fn();
  } finally {
    requestTenantSlug = prev;
  }
}

export function resolveSlug(hint?: string | null): string | null {
  if (hint) return sanitizeSlug(hint);
  return getProcessTenant();
}

export function sanitizeSlug(s: string): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

export function tenantPaths(slug?: string | null): TenantPaths {
  const s = sanitizeSlug(slug || getProcessTenant() || '') || null;
  if (!s) {
    // legacy raiz
    return {
      slug: '_root',
      root: ROOT(),
      configDir: path.join(ROOT(), 'config'),
      dataDir: path.join(ROOT(), 'data'),
      tokensDir: path.join(ROOT(), 'tokens'),
      barbershopConfig: path.join(ROOT(), 'config', 'barbershop.json'),
      businessConfig: path.join(ROOT(), 'config', 'business.json'),
      payments: path.join(ROOT(), 'data', 'payments.json'),
      appointments: path.join(ROOT(), 'data', 'appointments.json'),
      ownerOutbox: path.join(ROOT(), 'data', 'owner-outbox.json'),
      shopOps: path.join(ROOT(), 'data', 'shop-ops.json'),
      tickets: path.join(ROOT(), 'data', 'tickets.json'),
      sessions: path.join(ROOT(), 'data', 'sessions.json'),
      ownerFile: path.join(ROOT(), 'data', 'owner.json'),
    };
  }
  const root = path.join(TENANTS_ROOT(), s);
  return {
    slug: s,
    root,
    configDir: path.join(root, 'config'),
    dataDir: path.join(root, 'data'),
    tokensDir: path.join(root, 'tokens'),
    barbershopConfig: path.join(root, 'config', 'barbershop.json'),
    businessConfig: path.join(root, 'config', 'business.json'),
    payments: path.join(root, 'data', 'payments.json'),
    appointments: path.join(root, 'data', 'appointments.json'),
    ownerOutbox: path.join(root, 'data', 'owner-outbox.json'),
    shopOps: path.join(root, 'data', 'shop-ops.json'),
    tickets: path.join(root, 'data', 'tickets.json'),
    sessions: path.join(root, 'data', 'sessions.json'),
    ownerFile: path.join(root, 'owner.json'),
  };
}

export function ensureDirs(p: TenantPaths): void {
  for (const d of [p.root, p.configDir, p.dataDir, p.tokensDir]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}

function newToken(): string {
  return 'own_' + crypto.randomBytes(24).toString('hex');
}

function defaultBarbershop(name: string): unknown {
  return {
    shop: {
      name,
      address: 'Configure o endereço no painel',
      phone: '',
      timezone: 'America/Sao_Paulo',
      greeting: `Bem-vindo à ${name}!`,
      slotMinutes: 30,
      daysOpen: [1, 2, 3, 4, 5, 6],
      notes: '',
      pixKey: '',
      pixName: name,
      waitBufferMin: 5,
      lat: -23.55,
      lng: -46.63,
    },
    services: [
      {
        id: 'servico1',
        name: 'Serviço principal',
        price: 50,
        durationMin: 30,
        keywords: ['servico', 'corte'],
      },
    ],
    barbers: [
      {
        id: 'prof1',
        name: 'Profissional 1',
        nickname: 'Pro',
        specialty: 'Geral',
        schedule: {
          '1': ['09:00', '18:00'],
          '2': ['09:00', '18:00'],
          '3': ['09:00', '18:00'],
          '4': ['09:00', '18:00'],
          '5': ['09:00', '18:00'],
          '6': ['09:00', '14:00'],
        },
        onDuty: true,
      },
    ],
  };
}

function defaultBusiness(name: string, nicheId: string): unknown {
  return {
    mode: 'hybrid',
    nicheId: nicheId || 'barbershop',
    sessionName: sanitizeSlug(name) || 'assistente',
    leadCapture: true,
    fallbackMessage: `Oi! Aqui é da *${name}*. Digite *menu* para ver opções.`,
    niche: {
      persona: {
        name: 'Alex',
        role: 'assistant',
        tone: 'amigavel',
        companyName: name,
        companyDescription: `${name} no WhatsApp`,
      },
    },
  };
}

export interface ProvisionResult {
  tenant: TenantMeta;
  owner: OwnerCredentials;
  paths: TenantPaths;
  /** Link para o dono configurar sozinho */
  setupUrl: string;
  accessToken: string;
}

/**
 * Cria pasta do tenant + credencial do dono.
 * Super-admin chama isso ao vender o produto.
 */
export function provisionTenant(input: {
  name: string;
  slug?: string;
  nicheId?: string;
  plan?: TenantMeta['plan'];
  email?: string;
  panelBaseUrl?: string;
}): ProvisionResult {
  const slug = sanitizeSlug(input.slug || input.name) || 'cliente';
  const p = tenantPaths(slug);
  ensureDirs(p);

  // configs iniciais se não existirem
  if (!fs.existsSync(p.barbershopConfig)) {
    fs.writeFileSync(
      p.barbershopConfig,
      JSON.stringify(defaultBarbershop(input.name), null, 2),
      'utf8'
    );
  }
  if (!fs.existsSync(p.businessConfig)) {
    fs.writeFileSync(
      p.businessConfig,
      JSON.stringify(
        defaultBusiness(input.name, input.nicheId || 'barbershop'),
        null,
        2
      ),
      'utf8'
    );
  }
  for (const f of [
    p.appointments,
    p.ownerOutbox,
    p.tickets,
  ]) {
    if (!fs.existsSync(f)) fs.writeFileSync(f, '[]', 'utf8');
  }
  if (!fs.existsSync(p.shopOps)) {
    fs.writeFileSync(
      p.shopOps,
      JSON.stringify({ open: true, updatedAt: new Date().toISOString() }, null, 2),
      'utf8'
    );
  }
  if (!fs.existsSync(p.payments)) {
    fs.writeFileSync(
      p.payments,
      JSON.stringify(
        {
          activeProvider: 'pix_key',
          enabledMethods: ['pix', 'card_credit', 'card_debit', 'cash', 'later'],
          pixKey: { enabled: true, key: '', holderName: input.name, bank: 'nubank' },
          mercadoPago: { enabled: false, accessToken: '', sandbox: true },
          manual: { cardOnSite: true, cash: true },
        },
        null,
        2
      ),
      'utf8'
    );
  }

  const token = newToken();
  const owner: OwnerCredentials = {
    token,
    email: input.email,
    name: input.name,
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(p.ownerFile, JSON.stringify(owner, null, 2), 'utf8');
  tokenToSlug.set(token, slug);

  const tenant: TenantMeta = {
    id: 't_' + slug,
    name: input.name,
    nicheId: input.nicheId || 'barbershop',
    plan: input.plan || 'starter',
    status: 'qr_pending',
    createdAt: new Date().toISOString(),
    slug,
  };
  upsertTenant(tenant);

  const base =
    input.panelBaseUrl ||
    process.env.PANEL_PUBLIC_URL ||
    loadPlatform().settings?.panelUrl ||
    'http://localhost:8787';

  const setupUrl = `${base.replace(/\/$/, '')}/?tenant=${encodeURIComponent(slug)}&token=${encodeURIComponent(token)}&setup=1`;

  return {
    tenant,
    owner,
    paths: p,
    setupUrl,
    accessToken: token,
  };
}

export function loadOwner(slug: string): OwnerCredentials | null {
  const p = tenantPaths(slug);
  try {
    if (!fs.existsSync(p.ownerFile)) return null;
    return JSON.parse(fs.readFileSync(p.ownerFile, 'utf8')) as OwnerCredentials;
  } catch {
    return null;
  }
}

export function resolveToken(token: string): { slug: string; owner: OwnerCredentials } | null {
  if (!token || token === 'navalha-dev' || token === 'admin-dev') {
    // tokens de dev → root legacy
    return null;
  }
  // cache
  if (tokenToSlug.has(token)) {
    const slug = tokenToSlug.get(token)!;
    const owner = loadOwner(slug);
    if (owner && owner.token === token) return { slug, owner };
  }
  // scan tenants
  const root = TENANTS_ROOT();
  if (!fs.existsSync(root)) return null;
  for (const name of fs.readdirSync(root)) {
    const owner = loadOwner(name);
    if (owner?.token === token) {
      tokenToSlug.set(token, name);
      return { slug: name, owner };
    }
  }
  // também procura em platform tenants
  return null;
}

export function listTenantSlugs(): string[] {
  const root = TENANTS_ROOT();
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root)
    .filter((n) => fs.statSync(path.join(root, n)).isDirectory());
}

export function setupStatus(slug: string): {
  shopNamed: boolean;
  hasPix: boolean;
  hasMercadoPago: boolean;
  hasServices: boolean;
  hasTeam: boolean;
  percent: number;
  steps: Array<{ id: string; label: string; done: boolean }>;
} {
  const p = tenantPaths(slug);
  let shopNamed = false;
  let hasServices = false;
  let hasTeam = false;
  let hasPix = false;
  let hasMercadoPago = false;
  try {
    const b = JSON.parse(fs.readFileSync(p.barbershopConfig, 'utf8'));
    shopNamed =
      Boolean(b.shop?.name) &&
      !String(b.shop.address || '').includes('Configure o endereço');
    hasServices = Array.isArray(b.services) && b.services.length > 0;
    hasTeam = Array.isArray(b.barbers) && b.barbers.length > 0;
  } catch {
    /* */
  }
  try {
    const pay = JSON.parse(fs.readFileSync(p.payments, 'utf8'));
    hasPix = Boolean(pay.pixKey?.key);
    hasMercadoPago = Boolean(pay.mercadoPago?.accessToken && pay.mercadoPago?.enabled);
  } catch {
    /* */
  }
  const steps = [
    { id: 'shop', label: 'Dados da loja', done: shopNamed },
    { id: 'services', label: 'Serviços', done: hasServices },
    { id: 'team', label: 'Equipe', done: hasTeam },
    { id: 'pay', label: 'Pagamentos (PIX ou Mercado Pago)', done: hasPix || hasMercadoPago },
    { id: 'wa', label: 'WhatsApp conectado', done: false }, // preenchido no panel com wa-status
  ];
  const done = steps.filter((s) => s.done).length;
  return {
    shopNamed,
    hasPix,
    hasMercadoPago,
    hasServices,
    hasTeam,
    percent: Math.round((done / steps.length) * 100),
    steps,
  };
}

/** Migra tenant navalha a partir da raiz (uma vez) */
export function ensureDefaultTenantFromRoot(): void {
  const platform = loadPlatform();
  if (!platform.tenants?.length) return;
  const t = platform.tenants[0];
  if (!t.slug) return;
  const p = tenantPaths(t.slug);
  if (fs.existsSync(p.barbershopConfig)) return;
  // se root tem config, copia
  const rootShop = path.join(ROOT(), 'config', 'barbershop.json');
  if (!fs.existsSync(rootShop)) return;
  try {
    provisionTenant({
      name: t.name,
      slug: t.slug,
      nicheId: t.nicheId,
      plan: t.plan,
    });
    // sobrescreve com config real da raiz
    fs.copyFileSync(rootShop, p.barbershopConfig);
    const rootBiz = path.join(ROOT(), 'config', 'business.json');
    if (fs.existsSync(rootBiz)) fs.copyFileSync(rootBiz, p.businessConfig);
    const rootPay = path.join(ROOT(), 'data', 'payments.json');
    if (fs.existsSync(rootPay)) fs.copyFileSync(rootPay, p.payments);
  } catch {
    /* ignore */
  }
}
