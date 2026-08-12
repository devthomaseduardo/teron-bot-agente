/**
 * Tempo real do painel (SSE).
 * Observa data/*.json e notifica browsers conectados quando agenda/fila/tickets mudam.
 */
import fs from 'fs';
import path from 'path';
import type http from 'http';
import { tenantPaths } from '../platform/tenant-runtime.js';

export type LiveEvent = {
  type: string;
  at: string;
  source?: string;
  meta?: Record<string, unknown>;
};

type Client = {
  id: number;
  res: http.ServerResponse;
  tenant: string;
};

const clients = new Map<number, Client>();
let nextId = 1;
const watchers = new Map<string, fs.FSWatcher>();
let debounceTimer: NodeJS.Timeout | null = null;
const pending = new Set<string>();

function dataRoot(): string {
  return path.join(process.cwd(), 'data');
}

function mapFileToType(file: string): string {
  const base = path.basename(file);
  if (base === 'appointments.json') return 'appointments';
  if (base === 'tickets.json') return 'tickets';
  if (base === 'shop-ops.json') return 'ops';
  if (base === 'owner-outbox.json') return 'outbox';
  if (base === 'wa-status.json') return 'wa';
  if (base === 'growth-opportunities.json') return 'growth';
  if (base === 'payments.json') return 'payments';
  if (base === 'platform.json') return 'platform';
  if (base === 'messages.jsonl' || base === 'messages.stamp') return 'messages';
  if (base === 'barbershop.json') return 'shop';
  return 'data';
}

/** Emite para todos (ou tenant específico no futuro) */
export function broadcast(evt: LiveEvent, _tenant = '_root'): void {
  const payload = `event: ${evt.type}\ndata: ${JSON.stringify(evt)}\n\n`;
  for (const c of clients.values()) {
    try {
      c.res.write(payload);
    } catch {
      /* client morto */
    }
  }
}

export function notifyChange(
  type: string,
  source = 'api',
  meta?: Record<string, unknown>
): void {
  broadcast({
    type,
    at: new Date().toISOString(),
    source,
    meta,
  });
  // heartbeat de “qualquer mudança” para UI genérica
  if (type !== 'ping' && type !== 'hello') {
    broadcast({
      type: 'change',
      at: new Date().toISOString(),
      source,
      meta: { ...(meta || {}), kind: type },
    });
  }
}

function scheduleNotify(filePath: string): void {
  pending.add(filePath);
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    const files = [...pending];
    pending.clear();
    for (const f of files) {
      notifyChange(mapFileToType(f), 'fs', { file: path.basename(f) });
    }
  }, 120);
}

function watchFile(file: string): void {
  if (watchers.has(file)) return;
  try {
    // garante arquivo
    if (!fs.existsSync(path.dirname(file))) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
    }
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, file.endsWith('.json') ? '[]' : '', 'utf8');
    }
    const w = fs.watch(file, { persistent: false }, (ev) => {
      if (ev === 'rename' || ev === 'change') scheduleNotify(file);
    });
    w.on('error', () => {
      try {
        w.close();
      } catch {
        /* ignore */
      }
      watchers.delete(file);
      setTimeout(() => watchFile(file), 2000);
    });
    watchers.set(file, w);
  } catch {
    /* ignore watch errors */
  }
}

function watchDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      return;
    }
  }
  // arquivos críticos na raiz data/
  for (const name of [
    'appointments.json',
    'tickets.json',
    'shop-ops.json',
    'owner-outbox.json',
    'wa-status.json',
    'growth-opportunities.json',
    'payments.json',
    'messages.jsonl',
    'messages.stamp',
  ]) {
    watchFile(path.join(dir, name));
  }
  // config da loja (horários / nomes editados no painel)
  try {
    watchFile(path.join(process.cwd(), 'config', 'barbershop.json'));
  } catch {
    /* ignore */
  }

  // tenants/*/data/appointments.json se existirem
  const tenantsRoot = path.join(process.cwd(), 'tenants');
  if (fs.existsSync(tenantsRoot)) {
    try {
      for (const slug of fs.readdirSync(tenantsRoot)) {
        const tData = path.join(tenantsRoot, slug, 'data');
        if (!fs.existsSync(tData)) continue;
        for (const name of ['appointments.json', 'tickets.json', 'shop-ops.json']) {
          const f = path.join(tData, name);
          if (fs.existsSync(f)) watchFile(f);
        }
      }
    } catch {
      /* ignore */
    }
  }
}

export function startLiveWatchers(): void {
  // paths do tenant atual + root
  try {
    const p = tenantPaths();
    watchFile(p.appointments);
    watchFile(p.tickets);
    watchFile(p.shopOps);
    watchFile(p.ownerOutbox);
  } catch {
    /* ignore */
  }
  watchDir(dataRoot());
  // re-scan tenants a cada 60s (novos)
  setInterval(() => watchDir(dataRoot()), 60_000).unref?.();
}

export function attachSseClient(
  res: http.ServerResponse,
  tenant = '_root'
): number {
  const id = nextId++;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no',
  });
  res.write(`event: hello\ndata: ${JSON.stringify({ id, at: new Date().toISOString() })}\n\n`);
  clients.set(id, { id, res, tenant });

  const ping = setInterval(() => {
    try {
      res.write(`event: ping\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
    } catch {
      clearInterval(ping);
    }
  }, 20000);
  ping.unref?.();

  const cleanup = () => {
    clearInterval(ping);
    clients.delete(id);
  };
  res.on('close', cleanup);
  res.on('error', cleanup);
  return id;
}

export function liveClientCount(): number {
  return clients.size;
}
