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

const cacheBySlug = new Map<string, BarbershopConfig>();

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
  if (cacheBySlug.has(key)) return cacheBySlug.get(key)!;

  // fallback: se tenant sem config, tenta raiz
  let file = p.barbershopConfig;
  if (!fs.existsSync(file)) {
    const root = path.join(process.cwd(), 'config', 'barbershop.json');
    if (fs.existsSync(root)) file = root;
  }
  const raw = fs.readFileSync(file, 'utf8');
  const cached = JSON.parse(raw) as BarbershopConfig;
  if (!cached.shop.pixKey) {
    cached.shop.pixKey = cached.shop.pixKey || '';
    cached.shop.pixName = cached.shop.pixName || cached.shop.name;
  }
  if (cached.shop.waitBufferMin == null) cached.shop.waitBufferMin = 5;
  cacheBySlug.set(key, cached);
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
  cacheBySlug.set(p.slug, cfg);
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
  if (!activeOnly) return list[0] || null;
  return (
    list.find(
      (a) =>
        !['cancelled', 'no_show', 'rated'].includes(a.status) ||
        a.status === 'done'
    ) ||
    list[0] ||
    null
  );
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

export function markOutboxSent(id: string): void {
  const p = paths();
  const all = loadOutbox();
  const idx = all.findIndex((m) => m.id === id);
  if (idx < 0) return;
  all[idx].sent = true;
  all[idx].sentAt = new Date().toISOString();
  fs.writeFileSync(p.ownerOutbox, JSON.stringify(all, null, 2), 'utf8');
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

export function appointmentsForBarberDay(
  barberId: string,
  date: string
): Appointment[] {
  return loadAppointments().filter(
    (a) =>
      a.barberId === barberId &&
      a.date === date &&
      !['cancelled', 'no_show'].includes(a.status)
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

/** Próximas mensagens do outbox ainda não enviadas */
export function takePendingOutbox(limit = 10): OwnerOutbound[] {
  return loadOutbox()
    .filter((m) => !m.sent)
    .slice(0, limit);
}
