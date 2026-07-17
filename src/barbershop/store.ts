import fs from 'fs';
import path from 'path';
import type {
  Appointment,
  BarbershopConfig,
  OwnerOutbound,
  ShopOps,
  VisitStatus,
} from './types.js';
import { tenantPaths } from '../platform/tenant-runtime.js';

const cacheBySlug = new Map<string, { cfg: BarbershopConfig; mtimeMs: number; file: string }>();

function paths() {
  return tenantPaths();
}

function ensureDataDir(): void {
  const p = paths();
  if (!fs.existsSync(p.dataDir)) fs.mkdirSync(p.dataDir, { recursive: true });
  if (!fs.existsSync(p.configDir)) fs.mkdirSync(p.configDir, { recursive: true });
}

export function loadBarbershop(): BarbershopConfig {
  const p = paths();
  const key = p.slug;

  // fallback: se tenant sem config, tenta raiz
  let file = p.barbershopConfig;
  if (!fs.existsSync(file)) {
    const root = path.join(process.cwd(), 'config', 'barbershop.json');
    if (fs.existsSync(root)) file = root;
  }

  let mtimeMs = 0;
  try {
    mtimeMs = fs.statSync(file).mtimeMs;
  } catch {
    mtimeMs = 0;
  }

  const hit = cacheBySlug.get(key);
  // recarrega se o dono salvou horários/nomes no painel
  if (hit && hit.file === file && hit.mtimeMs === mtimeMs) {
    return hit.cfg;
  }

  const raw = fs.readFileSync(file, 'utf8');
  const cached = JSON.parse(raw) as BarbershopConfig;
  if (!cached.shop.pixKey) {
    cached.shop.pixKey = cached.shop.pixKey || '';
    cached.shop.pixName = cached.shop.pixName || cached.shop.name;
  }
  if (cached.shop.waitBufferMin == null) cached.shop.waitBufferMin = 5;
  cacheBySlug.set(key, { cfg: cached, mtimeMs, file });
  return cached;
}

export function reloadBarbershop(): BarbershopConfig {
  cacheBySlug.delete(paths().slug);
  return loadBarbershop();
}

export function saveBarbershop(cfg: BarbershopConfig): BarbershopConfig {
  ensureDataDir();
  const p = paths();
  fs.writeFileSync(p.barbershopConfig, JSON.stringify(cfg, null, 2), 'utf8');
  let mtimeMs = Date.now();
  try {
    mtimeMs = fs.statSync(p.barbershopConfig).mtimeMs;
  } catch {
    /* ignore */
  }
  cacheBySlug.set(p.slug, { cfg, mtimeMs, file: p.barbershopConfig });
  return cfg;
}

export function loadAppointments(): Appointment[] {
  try {
    const p = paths();
    if (!fs.existsSync(p.appointments)) return [];
    const list = JSON.parse(fs.readFileSync(p.appointments, 'utf8')) as Appointment[];
    return list.map((a) => normalizeAppt(a));
  } catch {
    return [];
  }
}

function saveAppointments(list: Appointment[]): void {
  ensureDataDir();
  fs.writeFileSync(paths().appointments, JSON.stringify(list, null, 2), 'utf8');
}

function normalizeAppt(a: Appointment): Appointment {
  if (!a.payment) {
    a.payment = {
      status: 'none',
      method: 'none',
      amount: a.price || 0,
    };
  }
  return a;
}

export function getAppointment(id: string): Appointment | null {
  return loadAppointments().find((a) => a.id === id) || null;
}

export function getAppointmentByChat(
  chatId: string,
  activeOnly = true
): Appointment | null {
  const list = loadAppointments()
    .filter((a) => a.chatId === chatId)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  if (!list.length) return null;
  if (!activeOnly) return list[0] || null;

  const rank = (s: string): number => {
    // prioridade: em andamento > agendado > done recente > resto
    if (s === 'in_service' || s === 'checked_in') return 100;
    if (s === 'waiting') return 90;
    if (s === 'awaiting_payment' || s === 'paid' || s === 'booked') return 80;
    if (s === 'done') return 40;
    if (s === 'rated') return 10;
    return 0; // cancelled / no_show
  };

  const today = todayISO();
  const active = list
    .filter((a) => !['cancelled', 'no_show', 'rated'].includes(a.status))
    .sort((a, b) => {
      const rd = rank(b.status) - rank(a.status);
      if (rd !== 0) return rd;
      // preferir data de hoje, depois a mais próxima no futuro
      const da = a.date || '';
      const db = b.date || '';
      const aToday = da === today ? 1 : 0;
      const bToday = db === today ? 1 : 0;
      if (bToday !== aToday) return bToday - aToday;
      // datas futuras próximas primeiro
      return da.localeCompare(db);
    });

  return active[0] || null;
}

export function updateAppointment(
  id: string,
  patch: Partial<Appointment>
): Appointment | null {
  const list = loadAppointments();
  const i = list.findIndex((a) => a.id === id);
  if (i < 0) return null;
  list[i] = {
    ...list[i],
    ...patch,
    payment: patch.payment
      ? { ...list[i].payment, ...patch.payment }
      : list[i].payment,
    updatedAt: new Date().toISOString(),
  };
  saveAppointments(list);
  return list[i];
}

export function cancelAppointment(id: string): boolean {
  const u = updateAppointment(id, { status: 'cancelled' as VisitStatus });
  return Boolean(u);
}

export function todaysAppointments(): Appointment[] {
  const today = new Date().toISOString().slice(0, 10);
  return loadAppointments()
    .filter((a) => a.date === today)
    .sort((a, b) => a.time.localeCompare(b.time));
}

// outbox
export function loadOutbox(): OwnerOutbound[] {
  try {
    const p = paths();
    if (!fs.existsSync(p.ownerOutbox)) return [];
    return JSON.parse(fs.readFileSync(p.ownerOutbox, 'utf8')) as OwnerOutbound[];
  } catch {
    return [];
  }
}

export function enqueueOwnerMessage(
  chatId: string,
  text: string
): OwnerOutbound {
  ensureDataDir();
  const p = paths();
  const all = loadOutbox();
  const now = Date.now();
  const norm = (text || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  // anti-spam: mesma mensagem pro mesmo chat em < 15 min → ignora
  const dup = all.find((m) => {
    if (m.chatId !== chatId) return false;
    const t = (m.text || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (t !== norm) return false;
    const at = new Date(m.createdAt).getTime();
    return now - at < 15 * 60_000;
  });
  if (dup) return dup;

  const msg: OwnerOutbound = {
    id: 'OB' + Date.now().toString(36),
    chatId,
    text,
    createdAt: new Date().toISOString(),
    sent: false,
  };
  all.unshift(msg);
  fs.writeFileSync(p.ownerOutbox, JSON.stringify(all.slice(0, 500), null, 2), 'utf8');
  return msg;
}

export function markOutboxSent(id: string, note?: string): void {
  const p = paths();
  const all = loadOutbox();
  const idx = all.findIndex((m) => m.id === id);
  if (idx < 0) return;
  all[idx].sent = true;
  all[idx].sentAt = new Date().toISOString();
  if (note) {
    (all[idx] as OwnerOutbound & { note?: string }).note = note;
  }
  // limpa flag de claim
  delete (all[idx] as OwnerOutbound & { claiming?: boolean }).claiming;
  fs.writeFileSync(p.ownerOutbox, JSON.stringify(all, null, 2), 'utf8');
}

/** Marca falha; após 3 tentativas abandona (sent=true) para não travar a fila. */
export function markOutboxFailed(id: string, err: string): number {
  const p = paths();
  const all = loadOutbox();
  const idx = all.findIndex((m) => m.id === id);
  if (idx < 0) return 0;
  const cur = all[idx] as OwnerOutbound & {
    attempts?: number;
    lastError?: string;
    claiming?: boolean;
  };
  cur.attempts = (cur.attempts || 0) + 1;
  cur.lastError = err;
  delete cur.claiming;
  if (cur.attempts >= 3) {
    cur.sent = true;
    cur.sentAt = new Date().toISOString();
    cur.note = `abandoned after ${cur.attempts} fails`;
  }
  all[idx] = cur;
  fs.writeFileSync(p.ownerOutbox, JSON.stringify(all, null, 2), 'utf8');
  return cur.attempts;
}

export function loadShopOps(): ShopOps {
  try {
    const p = paths();
    if (!fs.existsSync(p.shopOps)) {
      return { open: true, updatedAt: new Date().toISOString() };
    }
    return JSON.parse(fs.readFileSync(p.shopOps, 'utf8')) as ShopOps;
  } catch {
    return { open: true, updatedAt: new Date().toISOString() };
  }
}

export function saveShopOps(ops: Partial<ShopOps>): ShopOps {
  ensureDataDir();
  const cur = loadShopOps();
  const next: ShopOps = {
    ...cur,
    ...ops,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(paths().shopOps, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

export function todayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function saveAppointment(appt: Appointment): Appointment {
  const list = loadAppointments();
  const i = list.findIndex((a) => a.id === appt.id);
  if (i >= 0) list[i] = appt;
  else list.push(appt);
  ensureDataDir();
  fs.writeFileSync(paths().appointments, JSON.stringify(list, null, 2), 'utf8');
  return appt;
}

/** Status que ocupam a cadeira (bloqueiam slot no WhatsApp e na agenda). */
const SLOT_BLOCKING: VisitStatus[] = [
  'booked',
  'awaiting_payment',
  'paid',
  'waiting',
  'checked_in',
  'in_service',
];

export function appointmentsForBarberDay(
  barberId: string,
  date: string
): Appointment[] {
  return loadAppointments().filter(
    (a) =>
      a.barberId === barberId &&
      a.date === date &&
      SLOT_BLOCKING.includes(a.status)
  );
}

/** Fila ativa do dia (waiting / checked_in / in_service) */
export function activeQueue(): Appointment[] {
  const today = todayISO();
  return loadAppointments()
    .filter(
      (a) =>
        a.date === today &&
        ['waiting', 'checked_in', 'in_service'].includes(a.status)
    )
    .sort((a, b) => a.time.localeCompare(b.time));
}

/** Próximas mensagens do outbox ainda não enviadas (somente leitura). */
export function takePendingOutbox(limit = 10): OwnerOutbound[] {
  return loadOutbox()
    .filter((m) => !m.sent && !(m as OwnerOutbound & { claiming?: boolean }).claiming)
    .slice(0, limit);
}

/**
 * Reserva até `limit` mensagens pendentes (claim no disco).
 * Impede dois flushes concorrentes de reenviar o mesmo id.
 * Claims antigos (>2 min) são liberados (crash recovery).
 */
export function claimPendingOutbox(limit = 5): OwnerOutbound[] {
  ensureDataDir();
  const p = paths();
  const all = loadOutbox();
  const claimed: OwnerOutbound[] = [];
  const now = Date.now();
  let dirty = false;

  for (const m of all) {
    const ext = m as OwnerOutbound & {
      claiming?: boolean;
      claimAt?: string;
      attempts?: number;
      note?: string;
    };
    // claim expirado → libera
    if (ext.claiming && ext.claimAt) {
      const age = now - new Date(ext.claimAt).getTime();
      if (age > 120_000) {
        delete ext.claiming;
        delete ext.claimAt;
        dirty = true;
      }
    }
    if (claimed.length >= limit) continue;
    if (ext.sent || ext.claiming) continue;
    if ((ext.attempts || 0) >= 3) {
      ext.sent = true;
      ext.sentAt = new Date().toISOString();
      ext.note = ext.note || 'abandoned after max attempts';
      dirty = true;
      continue;
    }
    ext.claiming = true;
    ext.claimAt = new Date().toISOString();
    claimed.push(ext);
    dirty = true;
  }
  if (dirty) {
    fs.writeFileSync(p.ownerOutbox, JSON.stringify(all, null, 2), 'utf8');
  }
  return claimed;
}
