/**
 * Tickets genéricos: reclamação, suporte, cobrança.
 * Persistidos em data/tickets.json — painel e bot usam o mesmo store.
 */
import fs from 'fs';
import path from 'path';
import type { Ticket, TicketKind, TicketStatus } from '../platform/types.js';

import { tenantPaths } from '../platform/tenant-runtime.js';

const FILE = () => tenantPaths().tickets;

function ensure(): Ticket[] {
  const f = FILE();
  const dir = path.dirname(f);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(f)) {
    fs.writeFileSync(f, '[]', 'utf8');
    return [];
  }
  try {
    const raw = JSON.parse(fs.readFileSync(f, 'utf8'));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function save(list: Ticket[]): void {
  fs.writeFileSync(FILE(), JSON.stringify(list, null, 2), 'utf8');
}

function newId(): string {
  return 'TK' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
}

export function createTicket(input: {
  chatId: string;
  clientName?: string;
  kind?: TicketKind;
  subject: string;
  body: string;
  linkedBookingId?: string;
}): Ticket {
  const list = ensure();
  const now = new Date().toISOString();
  const t: Ticket = {
    id: newId(),
    chatId: input.chatId,
    clientName: input.clientName,
    kind: input.kind || 'complaint',
    status: 'open',
    subject: input.subject.slice(0, 120),
    body: input.body.slice(0, 2000),
    createdAt: now,
    updatedAt: now,
    linkedBookingId: input.linkedBookingId,
  };
  list.unshift(t);
  save(list.slice(0, 2000));
  return t;
}

export function listTickets(filter?: {
  status?: TicketStatus;
  chatId?: string;
}): Ticket[] {
  let list = ensure();
  if (filter?.status) list = list.filter((t) => t.status === filter.status);
  if (filter?.chatId) list = list.filter((t) => t.chatId === filter.chatId);
  return list;
}

export function updateTicket(
  id: string,
  patch: Partial<Pick<Ticket, 'status' | 'ownerNote' | 'subject' | 'body'>>
): Ticket | null {
  const list = ensure();
  const i = list.findIndex((t) => t.id === id);
  if (i < 0) return null;
  const now = new Date().toISOString();
  list[i] = {
    ...list[i],
    ...patch,
    updatedAt: now,
    resolvedAt:
      patch.status === 'resolved' || patch.status === 'closed'
        ? now
        : list[i].resolvedAt,
  };
  save(list);
  return list[i];
}

export function openTicketsCount(): number {
  return ensure().filter((t) => t.status === 'open' || t.status === 'in_progress')
    .length;
}
