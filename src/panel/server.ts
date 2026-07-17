/**
 * Painéis web:
 *   Dono     → http://localhost:8787/
 *   Super    → http://localhost:8787/admin
 *
 *   npm run panel
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import {
  loadAppointments,
  loadBarbershop,
  loadShopOps,
  saveShopOps,
  todaysAppointments,
  updateAppointment,
  enqueueOwnerMessage,
  cancelAppointment,
  saveBarbershop,
} from '../barbershop/store.js';
import { confirmPayment } from '../barbershop/payment.js';
import { ratingsSummary } from '../barbershop/ratings.js';
import { estimateWait } from '../barbershop/queue.js';
import { listTickets, updateTicket, openTicketsCount } from '../ops/tickets.js';
import {
  loadPlatform,
  savePlatform,
  botHealthHint,
} from '../platform/tenants.js';
import { listNiches } from '../config/niches/index.js';
import { readWaStatus } from '../platform/wa-status.js';
import {
  loadPaymentConfig,
  savePaymentConfig,
  paymentProviderSummary,
  handleMercadoPagoWebhook,
  confirmByExternalId,
} from '../payments/index.js';
import { enqueueOwnerMessage as pushOwner } from '../barbershop/store.js';
import {
  provisionTenant,
  resolveToken,
  setupStatus,
  setRequestTenant,
  getProcessTenant,
} from '../platform/tenant-runtime.js';
import type { VisitStatus } from '../barbershop/types.js';

const PUBLIC = path.join(process.cwd(), 'panel', 'public');
const PORT = Number(process.env.PANEL_PORT || 8787);
const PANEL_TOKEN = process.env.PANEL_TOKEN || 'navalha-dev';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || process.env.PANEL_TOKEN || 'admin-dev';

function json(res: http.ServerResponse, code: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Panel-Role',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,OPTIONS',
  });
  res.end(data);
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function bearer(req: http.IncomingMessage): string {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7).trim();
  return '';
}

function requestToken(req: http.IncomingMessage): string {
  const t = bearer(req);
  if (t) return t;
  try {
    return new URL(req.url || '/', 'http://x').searchParams.get('token') || '';
  } catch {
    return '';
  }
}

/** Resolve tenant do token do dono; null = root/dev */
function resolveOwnerTenant(req: http.IncomingMessage): string | null {
  const t = requestToken(req);
  if (!t) {
    if (PANEL_TOKEN === 'navalha-dev') return process.env.TENANT_ID || null;
    return null;
  }
  if (t === PANEL_TOKEN || t === ADMIN_TOKEN) {
    return process.env.TENANT_ID || null; // root / default
  }
  const resolved = resolveToken(t);
  return resolved?.slug || null;
}

function authOwner(req: http.IncomingMessage): boolean {
  const t = requestToken(req);
  if (t && (t === PANEL_TOKEN || t === ADMIN_TOKEN)) return true;
  if (t && resolveToken(t)) return true;
  return PANEL_TOKEN === 'navalha-dev' && !t;
}

function authAdmin(req: http.IncomingMessage): boolean {
  const t = requestToken(req);
  if (t === ADMIN_TOKEN || t === PANEL_TOKEN) return true;
  return ADMIN_TOKEN === 'admin-dev' || ADMIN_TOKEN === 'navalha-dev';
}

function maskSecret(s: string): string {
  if (!s || s.length < 8) return '••••';
  return s.slice(0, 6) + '••••' + s.slice(-4);
}

function serveStatic(res: http.ServerResponse, urlPath: string): void {
  let rel = urlPath;
  if (rel === '/' || rel === '') rel = '/index.html';
  if (rel === '/admin' || rel === '/admin/') rel = '/admin.html';
  rel = rel.split('?')[0];
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  const ext = path.extname(file);
  const types: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.json': 'application/json',
    '.woff2': 'font/woff2',
  };
  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

async function handleApi(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string
): Promise<void> {
  if (req.method === 'OPTIONS') {
    json(res, 204, {});
    return;
  }

  // ── Super-admin ──────────────────────────────────────────
  if (pathname.startsWith('/api/admin')) {
    if (!authAdmin(req)) {
      json(res, 401, { error: 'unauthorized_admin' });
      return;
    }

    if (pathname === '/api/admin/overview' && req.method === 'GET') {
      const platform = loadPlatform();
      const health = botHealthHint();
      const shop = loadBarbershop();
      const today = todaysAppointments();
      const ratings = ratingsSummary();
      json(res, 200, {
        platform,
        health,
        niches: listNiches(),
        liveTenant: {
          shop: shop.shop,
          services: shop.services.length,
          barbers: shop.barbers.length,
          today: today.length,
          ticketsOpen: openTicketsCount(),
          ratingAvg: ratings.avg,
          ratingCount: ratings.count,
        },
      });
      return;
    }

    if (pathname === '/api/admin/platform' && req.method === 'GET') {
      json(res, 200, loadPlatform());
      return;
    }

    if (pathname === '/api/admin/platform' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const next = savePlatform(body);
      json(res, 200, next);
      return;
    }

    if (pathname === '/api/admin/tenants' && req.method === 'GET') {
      json(res, 200, { tenants: loadPlatform().tenants });
      return;
    }

    if (pathname === '/api/admin/tenants' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const result = provisionTenant({
        name: body.name || 'Novo cliente',
        slug: body.slug,
        nicheId: body.nicheId || 'barbershop',
        plan: body.plan || 'starter',
        email: body.email,
        panelBaseUrl:
          process.env.PANEL_PUBLIC_URL || `http://localhost:${PORT}`,
      });
      json(res, 200, {
        tenant: result.tenant,
        setupUrl: result.setupUrl,
        accessToken: result.accessToken,
        message:
          'Cliente criado! Envie o setupUrl para ele configurar sozinho (loja, PIX, WhatsApp).',
        platform: loadPlatform(),
      });
      return;
    }

    // reenviar link de acesso do tenant
    const accessMatch = pathname.match(
      /^\/api\/admin\/tenants\/([^/]+)\/access$/
    );
    if (accessMatch && req.method === 'POST') {
      const slug = accessMatch[1];
      const { loadOwner, tenantPaths, provisionTenant: prov } = await import(
        '../platform/tenant-runtime.js'
      );
      let owner = loadOwner(slug);
      if (!owner) {
        const meta = loadPlatform().tenants.find((x) => x.slug === slug);
        const r = provisionTenant({
          name: meta?.name || slug,
          slug,
          nicheId: meta?.nicheId,
          plan: meta?.plan,
        });
        owner = r.owner;
      }
      const base =
        process.env.PANEL_PUBLIC_URL || `http://localhost:${PORT}`;
      const setupUrl = `${base.replace(/\/$/, '')}/?tenant=${encodeURIComponent(slug)}&token=${encodeURIComponent(owner.token)}&setup=1`;
      json(res, 200, {
        slug,
        setupUrl,
        accessToken: owner.token,
        paths: tenantPaths(slug).root,
      });
      return;
    }

    const tenantPatch = pathname.match(/^\/api\/admin\/tenants\/([^/]+)$/);
    if (tenantPatch && req.method === 'PATCH') {
      const id = tenantPatch[1];
      const body = JSON.parse((await readBody(req)) || '{}');
      const p = loadPlatform();
      const cur = p.tenants.find((x) => x.id === id);
      if (!cur) {
        json(res, 404, { error: 'not_found' });
        return;
      }
      const next = { ...cur, ...body, id: cur.id };
      upsertTenant(next);
      json(res, 200, { tenant: next });
      return;
    }

    if (pathname === '/api/admin/shop-config' && req.method === 'GET') {
      json(res, 200, loadBarbershop());
      return;
    }

    if (pathname === '/api/admin/shop-config' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      // merge shop fields
      const cur = loadBarbershop();
      if (body.shop) {
        cur.shop = { ...cur.shop, ...body.shop };
      }
      if (Array.isArray(body.services)) cur.services = body.services;
      if (Array.isArray(body.barbers)) cur.barbers = body.barbers;
      if (typeof saveBarbershop === 'function') {
        saveBarbershop(cur);
      } else {
        // fallback write config/barbershop.json
        const f = path.join(process.cwd(), 'config', 'barbershop.json');
        fs.writeFileSync(f, JSON.stringify(cur, null, 2), 'utf8');
      }
      json(res, 200, cur);
      return;
    }

    if (pathname === '/api/admin/business' && req.method === 'GET') {
      try {
        const f = path.join(process.cwd(), 'config', 'business.json');
        json(res, 200, JSON.parse(fs.readFileSync(f, 'utf8')));
      } catch (e) {
        json(res, 500, { error: String(e) });
      }
      return;
    }

    if (pathname === '/api/admin/business' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const f = path.join(process.cwd(), 'config', 'business.json');
      let cur: Record<string, unknown> = {};
      try {
        cur = JSON.parse(fs.readFileSync(f, 'utf8'));
      } catch {
        /* empty */
      }
      const next = { ...cur, ...body };
      fs.writeFileSync(f, JSON.stringify(next, null, 2), 'utf8');
      json(res, 200, next);
      return;
    }

    json(res, 404, { error: 'admin_not_found', path: pathname });
    return;
  }

  // ── Webhook Mercado Pago (público — antes do auth do painel) ──
  if (
    (pathname === '/api/payments/webhook/mercadopago' ||
      pathname === '/api/webhooks/mercadopago') &&
    (req.method === 'POST' || req.method === 'GET')
  ) {
    try {
      let payload: Record<string, unknown> = {};
      if (req.method === 'POST') {
        const raw = await readBody(req);
        payload = raw ? JSON.parse(raw) : {};
      }
      const url = new URL(req.url || '/', 'http://x');
      const qid = url.searchParams.get('data.id') || url.searchParams.get('id');
      if (qid && !payload.data) payload.data = { id: qid };
      if (url.searchParams.get('topic'))
        payload.type = url.searchParams.get('topic') || payload.type;

      const result = await handleMercadoPagoWebhook(payload);
      if (result?.approved && result.externalId) {
        const appt = confirmByExternalId(result.externalId, 'system');
        if (appt) {
          try {
            pushOwner(
              appt.chatId,
              `Pagamento confirmado automaticamente ✅\nValor: R$ ${appt.price.toFixed(2).replace('.', ',')}\n\nValeu! Te esperamos 💈`
            );
          } catch {
            /* ignore */
          }
        }
      }
      json(res, 200, { ok: true, result });
    } catch (e) {
      json(res, 200, { ok: false, error: String(e) });
    }
    return;
  }

  // ── Owner API (self-service por tenant) ──────────────────
  if (!authOwner(req)) {
    json(res, 401, { error: 'unauthorized' });
    return;
  }

  const tenantSlug = resolveOwnerTenant(req);
  setRequestTenant(tenantSlug);

  if (pathname === '/api/me' && req.method === 'GET') {
    const setup = setupStatus(tenantSlug || '_root');
    const wa = readWaStatus();
    if (wa.state === 'online') {
      const step = setup.steps.find((s) => s.id === 'wa');
      if (step) step.done = true;
      setup.percent = Math.round(
        (setup.steps.filter((s) => s.done).length / setup.steps.length) * 100
      );
    }
    json(res, 200, {
      tenantSlug: tenantSlug || getProcessTenant() || 'default',
      role: 'owner',
      setup,
      payments: paymentProviderSummary(),
      selfService: true,
    });
    return;
  }

  if (pathname === '/api/health') {
    json(res, 200, {
      ok: true,
      niche: 'barbershop',
      role: 'owner',
      tenantSlug: tenantSlug || 'default',
      time: new Date().toISOString(),
      health: botHealthHint(),
      wa: readWaStatus(),
      payments: paymentProviderSummary(),
    });
    return;
  }

  // setup self-service: loja + equipe + serviços
  if (pathname === '/api/setup/shop' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)) || '{}');
    const cur = loadBarbershop();
    if (body.shop) cur.shop = { ...cur.shop, ...body.shop };
    if (Array.isArray(body.services)) cur.services = body.services;
    if (Array.isArray(body.barbers)) cur.barbers = body.barbers;
    saveBarbershop(cur);
    json(res, 200, {
      ok: true,
      shop: cur.shop,
      setup: setupStatus(tenantSlug || '_root'),
    });
    return;
  }

  if (pathname === '/api/setup/status' && req.method === 'GET') {
    const setup = setupStatus(tenantSlug || '_root');
    const wa = readWaStatus();
    if (wa.state === 'online') {
      const step = setup.steps.find((s) => s.id === 'wa');
      if (step) step.done = true;
    }
    json(res, 200, setup);
    return;
  }

  // Status + QR WhatsApp (dono e admin)
  if (pathname === '/api/wa/status' && req.method === 'GET') {
    json(res, 200, readWaStatus());
    return;
  }

  if (pathname === '/api/payments/config' && req.method === 'GET') {
    if (!authOwner(req) && !authAdmin(req)) {
      json(res, 401, { error: 'unauthorized' });
      return;
    }
    const cfg = loadPaymentConfig();
    // não vaza token completo no dono — admin vê mascarado
    const masked = {
      ...cfg,
      mercadoPago: cfg.mercadoPago
        ? {
            ...cfg.mercadoPago,
            accessToken: cfg.mercadoPago.accessToken
              ? maskSecret(cfg.mercadoPago.accessToken)
              : '',
            webhookSecret: cfg.mercadoPago.webhookSecret
              ? '••••'
              : '',
          }
        : undefined,
      summary: paymentProviderSummary(cfg),
      webhookUrl: `http://localhost:${PORT}/api/payments/webhook/mercadopago`,
    };
    // admin com token admin vê flag hasToken
    if (authAdmin(req)) {
      (masked as any).mercadoPagoHasToken = Boolean(
        loadPaymentConfig().mercadoPago?.accessToken
      );
    }
    json(res, 200, masked);
    return;
  }

  if (pathname === '/api/payments/config' && req.method === 'POST') {
    if (!authAdmin(req) && !authOwner(req)) {
      json(res, 401, { error: 'unauthorized' });
      return;
    }
    const body = JSON.parse((await readBody(req)) || '{}');
    // se token mascarado, não sobrescreve
    if (
      body.mercadoPago?.accessToken &&
      String(body.mercadoPago.accessToken).includes('••••')
    ) {
      delete body.mercadoPago.accessToken;
    }
    if (body.mercadoPago?.accessToken === '') {
      delete body.mercadoPago.accessToken;
    }
    // merge: se veio accessToken novo, grava
    const cur = loadPaymentConfig();
    if (body.mercadoPago && !body.mercadoPago.accessToken) {
      body.mercadoPago.accessToken = cur.mercadoPago?.accessToken || '';
    }
    // dono pode ativar MP sozinho
    if (body.mercadoPago?.accessToken && body.activeProvider === 'mercado_pago') {
      body.mercadoPago.enabled = true;
    }
    const next = savePaymentConfig(body);
    // sync chave PIX com barbershop shop se veio pixKey
    if (body.pixKey?.key) {
      try {
        const shopCfg = loadBarbershop();
        shopCfg.shop.pixKey = body.pixKey.key;
        if (body.pixKey.holderName) shopCfg.shop.pixName = body.pixKey.holderName;
        saveBarbershop(shopCfg);
      } catch {
        /* ignore */
      }
    }
    json(res, 200, {
      ...next,
      mercadoPago: {
        ...next.mercadoPago,
        accessToken: next.mercadoPago?.accessToken
          ? maskSecret(next.mercadoPago.accessToken)
          : '',
      },
      summary: paymentProviderSummary(next),
    });
    return;
  }

  if (pathname === '/api/payments/test-pix' && req.method === 'POST') {
    if (!authAdmin(req) && !authOwner(req)) {
      json(res, 401, { error: 'unauthorized' });
      return;
    }
    const body = JSON.parse((await readBody(req)) || '{}');
    const amount = Number(body.amount || 1);
    const { createPixForAppointment } = await import('../payments/index.js');
    const fake = {
      id: 'TEST' + Date.now(),
      price: amount,
      serviceName: 'Teste PIX',
      clientName: 'Teste',
      date: new Date().toISOString().slice(0, 10),
      time: '12:00',
    } as any;
    const { charge } = await createPixForAppointment(fake);
    json(res, 200, { charge, summary: paymentProviderSummary() });
    return;
  }

  if (pathname === '/api/dashboard' && req.method === 'GET') {
    const today = todaysAppointments();
    const waiting = today.filter((a) =>
      ['waiting', 'checked_in', 'in_service'].includes(a.status)
    );
    const pix = today.filter(
      (a) =>
        a.payment?.status === 'pending' || a.status === 'awaiting_payment'
    );
    const noShow = today.filter((a) => a.status === 'no_show');
    const ratings = ratingsSummary();
    const shop = loadBarbershop().shop;
    const ops = loadShopOps();
    json(res, 200, {
      shop: {
        name: shop.name,
        phone: shop.phone,
        address: shop.address,
        pixKey: shop.pixKey,
        pixName: shop.pixName,
      },
      ops,
      health: botHealthHint(),
      kpis: {
        today: today.length,
        waiting: waiting.length,
        pixPending: pix.length,
        noShow: noShow.length,
        ticketsOpen: openTicketsCount(),
        ratingAvg: ratings.avg,
        ratingCount: ratings.count,
        done: today.filter((a) => a.status === 'done' || a.status === 'rated')
          .length,
      },
      today,
      waiting,
      pix,
      ratings,
    });
    return;
  }

  if (pathname === '/api/bookings' && req.method === 'GET') {
    const url = new URL(req.url || '/', 'http://x');
    const day = url.searchParams.get('day');
    let list = loadAppointments();
    if (day) list = list.filter((a) => a.date === day);
    else list = todaysAppointments();
    list = list.slice().sort((a, b) => a.time.localeCompare(b.time));
    json(res, 200, { bookings: list });
    return;
  }

  const bookMatch = pathname.match(/^\/api\/bookings\/([^/]+)$/);
  if (bookMatch && req.method === 'PATCH') {
    const id = bookMatch[1];
    const body = JSON.parse((await readBody(req)) || '{}');
    const action = String(body.action || '');
    const a = loadAppointments().find((x) => x.id === id);
    if (!a) {
      json(res, 404, { error: 'not_found' });
      return;
    }

    if (action === 'arrived' || action === 'checkin') {
      json(res, 200, { booking: updateAppointment(id, { status: 'waiting' }) });
      return;
    }
    if (action === 'serve' || action === 'start') {
      json(res, 200, {
        booking: updateAppointment(id, { status: 'in_service' }),
      });
      return;
    }
    if (action === 'done' || action === 'finish') {
      const u = updateAppointment(id, { status: 'done' });
      if (u) {
        const first = (u.clientName || '').split(' ')[0];
        enqueueOwnerMessage(
          u.chatId,
          `Pronto, *${first}*! ✅\n\nSeu atendimento acabou de ser finalizado.\nSe puder, me manda uma notinha de *1 a 5* (ou digita *avaliar*) — ajuda demais 🙏`
        );
      }
      json(res, 200, { booking: u });
      return;
    }
    if (action === 'no_show' || action === 'falta') {
      const u = updateAppointment(id, { status: 'no_show' });
      if (u) {
        const first = (u.clientName || '').split(' ')[0];
        enqueueOwnerMessage(
          u.chatId,
          `Oi, *${first}* 😊\n\nA gente registrou *falta* no horário das *${u.time}*.\nQuer remarcar? Manda *remarcar* — ou *0* pro menu.`
        );
      }
      json(res, 200, { booking: u });
      return;
    }
    if (action === 'cancel') {
      cancelAppointment(id);
      enqueueOwnerMessage(
        a.chatId,
        `❌ *${a.clientName}*, seu horário de *${a.date} ${a.time}* foi cancelado.\n\nDigite *1* para remarcar.`
      );
      json(res, 200, { ok: true });
      return;
    }
    if (action === 'paid' || action === 'confirm_payment') {
      confirmPayment(id, 'owner');
      const u = loadAppointments().find((x) => x.id === id);
      if (u) {
        const first = (u.clientName || '').split(' ')[0];
        enqueueOwnerMessage(
          u.chatId,
          `Pagamento confirmado, *${first}*! ✅\nValor: R$ ${u.price.toFixed(2).replace('.', ',')}\n\nValeu demais 🙏`
        );
      }
      json(res, 200, { booking: u });
      return;
    }
    if (action === 'status' && body.status) {
      json(res, 200, {
        booking: updateAppointment(id, {
          status: body.status as VisitStatus,
        }),
      });
      return;
    }
    if (action === 'msg' && body.text) {
      enqueueOwnerMessage(a.chatId, String(body.text));
      json(res, 200, { ok: true, queued: true });
      return;
    }

    json(res, 400, { error: 'unknown_action', action });
    return;
  }

  if (pathname === '/api/tickets' && req.method === 'GET') {
    json(res, 200, { tickets: listTickets() });
    return;
  }

  const tickMatch = pathname.match(/^\/api\/tickets\/([^/]+)$/);
  if (tickMatch && req.method === 'PATCH') {
    const body = JSON.parse((await readBody(req)) || '{}');
    const t = updateTicket(tickMatch[1], {
      status: body.status,
      ownerNote: body.ownerNote,
    });
    if (!t) {
      json(res, 404, { error: 'not_found' });
      return;
    }
    if (body.reply && t.chatId) {
      enqueueOwnerMessage(t.chatId, String(body.reply));
    }
    json(res, 200, { ticket: t });
    return;
  }

  if (pathname === '/api/ratings' && req.method === 'GET') {
    json(res, 200, ratingsSummary());
    return;
  }

  if (pathname === '/api/ops' && req.method === 'GET') {
    json(res, 200, loadShopOps());
    return;
  }
  if (pathname === '/api/ops' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)) || '{}');
    json(res, 200, saveShopOps({ ...loadShopOps(), ...body }));
    return;
  }

  if (pathname === '/api/shop' && req.method === 'GET') {
    json(res, 200, loadBarbershop());
    return;
  }

  const etaMatch = pathname.match(/^\/api\/queue-eta\/([^/]+)$/);
  if (etaMatch && req.method === 'GET') {
    const a = loadAppointments().find((x) => x.id === etaMatch[1]);
    if (!a) {
      json(res, 404, { error: 'not_found' });
      return;
    }
    json(res, 200, estimateWait(a));
    return;
  }

  json(res, 404, { error: 'not_found', path: pathname });
}

export function startPanelServer(): http.Server {
  if (!fs.existsSync(PUBLIC)) {
    fs.mkdirSync(PUBLIC, { recursive: true });
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(
        req.url || '/',
        `http://${req.headers.host || 'localhost'}`
      );
      if (url.pathname.startsWith('/api/')) {
        await handleApi(req, res, url.pathname);
        return;
      }
      serveStatic(res, url.pathname);
    } catch (e) {
      json(res, 500, { error: String(e) });
    } finally {
      setRequestTenant(null);
    }
  });

  server.listen(PORT, () => {
    console.log(`\n  ════════════════════════════════════════`);
    console.log(`  🖥️  Painel DONO     → http://localhost:${PORT}/`);
    console.log(`  🛠️  Painel ADMIN    → http://localhost:${PORT}/admin`);
    console.log(`  🔑  Owner token     → ${PANEL_TOKEN}`);
    console.log(`  🔑  Admin token     → ${ADMIN_TOKEN}`);
    console.log(`  ════════════════════════════════════════\n`);
  });
  return server;
}

const entry = process.argv[1] || '';
const isMain =
  /panel[\\/]server\.(ts|js|cjs)$/.test(entry) ||
  entry.endsWith('server.cjs') ||
  entry.includes('panel/server');
if (isMain) {
  startPanelServer();
}
