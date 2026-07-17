const TOKEN =
  localStorage.getItem('admin_token') ||
  localStorage.getItem('panel_token') ||
  'admin-dev';

const TITLES = {
  overview: ['Overview', 'Controle da plataforma multi-nicho'],
  tenants: ['Clientes', 'Tenants e status de cada instalação'],
  phases: ['Roadmap', 'Fases do produto'],
  shop: ['Loja', 'Configuração do tenant em produção'],
  engine: ['Motor', 'Modo, nicho, sessão e automações'],
  health: ['Saúde', 'Bot, logs e nichos'],
  qr: ['WhatsApp / QR', 'Conexão remota do tenant'],
  payments: ['Pagamentos', 'Mercado Pago, Nubank PIX e maquininha'],
  growth: ['Growth', 'Motor de oportunidades locais'],
};

const state = { data: null, view: 'overview' };

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), 2800);
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function chip(st) {
  const s = String(st || '');
  let cls = '';
  if (['done', 'live', 'online', 'resolved'].includes(s)) cls = 'ok';
  else if (['active', 'qr', 'qr_pending', 'provisioning', 'in_progress'].includes(s))
    cls = 'blue';
  else if (['planned', 'starter'].includes(s)) cls = '';
  else if (['suspended', 'error', 'offline'].includes(s)) cls = 'danger';
  else if (['warn', 'pro'].includes(s)) cls = 'warn';
  return `<span class="chip ${cls}">${esc(s.replace(/_/g, ' '))}</span>`;
}

function setView(name) {
  state.view = name;
  document.querySelectorAll('.nav-item').forEach((b) => {
    b.classList.toggle('active', b.dataset.view === name);
  });
  document.querySelectorAll('.view').forEach((v) => {
    v.classList.toggle('active', v.id === `view-${name}`);
  });
  const [t, d] = TITLES[name] || [name, ''];
  document.getElementById('viewTitle').textContent = t;
  document.getElementById('viewDesc').textContent = d;
  if (name === 'shop') loadShop().catch(console.error);
  if (name === 'engine') loadEngine().catch(console.error);
  if (name === 'qr') loadAdminQr().catch(console.error);
  if (name === 'payments') loadPayments().catch(console.error);
}

async function loadPayments() {
  const cfg = await api('/api/payments/config');
  const sum = cfg.summary || {};
  document.getElementById('payKpis').innerHTML = `
    <div class="kpi blue"><div class="kpi-label">Provedor ativo</div><div class="kpi-value" style="font-size:18px;letter-spacing:-0.3px">${esc(sum.label || cfg.activeProvider)}</div></div>
    <div class="kpi ${sum.ready ? 'ok' : 'danger'}"><div class="kpi-label">Pronto</div><div class="kpi-value" style="font-size:18px">${sum.ready ? 'Sim' : 'Não'}</div></div>
    <div class="kpi"><div class="kpi-label">Detalhe</div><div class="kpi-value" style="font-size:14px;font-weight:600">${esc(sum.detail || '—')}</div></div>
  `;
  document.getElementById('payActive').value = cfg.activeProvider || 'pix_key';
  document.getElementById('mpEnabled').checked = Boolean(cfg.mercadoPago?.enabled);
  document.getElementById('mpToken').value = '';
  document.getElementById('mpToken').placeholder = cfg.mercadoPago?.accessToken || 'APP_USR-… ou TEST-…';
  document.getElementById('mpPublic').value = cfg.mercadoPago?.publicKey || '';
  document.getElementById('mpSandbox').value = cfg.mercadoPago?.sandbox !== false ? 'true' : 'false';
  document.getElementById('mpWebhook').textContent =
    cfg.webhookUrl || window.location.origin + '/api/payments/webhook/mercadopago';

  document.getElementById('pixEnabled').checked = cfg.pixKey?.enabled !== false;
  document.getElementById('pixBank').value = cfg.pixKey?.bank || 'nubank';
  document.getElementById('pixKey').value = cfg.pixKey?.key || '';
  document.getElementById('pixName').value = cfg.pixKey?.holderName || '';
  document.getElementById('pixCity').value = cfg.pixKey?.city || 'Sao Paulo';

  const st = document.getElementById('payStatus');
  st.textContent = sum.ready ? `${sum.label} · ok` : 'Configurar provedor';
  st.className = `chip ${sum.ready ? 'ok' : 'warn'}`;
}

function renderOverview(d) {
  const p = d.platform || {};
  const live = d.liveTenant || {};
  const health = d.health || {};
  document.getElementById('platformName').textContent =
    p.platformName || 'Agente Comercial';

  document.getElementById('kpis').innerHTML = `
    <div class="kpi blue"><div class="kpi-label">Tenants</div><div class="kpi-value">${(p.tenants || []).length}</div></div>
    <div class="kpi"><div class="kpi-label">Nichos</div><div class="kpi-value">${(d.niches || []).length}</div></div>
    <div class="kpi warn"><div class="kpi-label">Agenda hoje</div><div class="kpi-value">${live.today || 0}</div></div>
    <div class="kpi danger"><div class="kpi-label">Chamados</div><div class="kpi-value">${live.ticketsOpen || 0}</div></div>
    <div class="kpi ok"><div class="kpi-label">Nota</div><div class="kpi-value">${
      live.ratingCount ? Number(live.ratingAvg).toFixed(1) : '—'
    }</div></div>
  `;

  document.getElementById('liveBox').innerHTML = `
    <div class="stat"><span>Loja</span><strong>${esc(live.shop?.name)}</strong></div>
    <div class="stat"><span>Telefone</span><span>${esc(live.shop?.phone)}</span></div>
    <div class="stat"><span>Serviços / equipe</span><span>${live.services || 0} · ${live.barbers || 0}</span></div>
    <div class="stat"><span>Sessão</span><span class="mono">${health.sessionDir ? 'tokens ok' : 'sem tokens'}</span></div>
    <div class="stat"><span>Log do bot</span><span class="mono">${
      health.logExists
        ? health.logAgeSec != null
          ? health.logAgeSec + 's atrás'
          : 'ok'
        : '—'
    }</span></div>
    <div class="stat"><span>Agendamentos</span><span>${health.appointments || 0}</span></div>
  `;

  const tb = document.querySelector('#tenantsTable tbody');
  tb.innerHTML = (p.tenants || [])
    .map(
      (t) => `
    <tr>
      <td>
        <strong>${esc(t.name)}</strong>
        <div class="muted-sm mono">${esc(t.id)}</div>
      </td>
      <td>${esc(t.nicheId)}</td>
      <td>${esc(t.plan)}</td>
      <td>${chip(t.status)}</td>
      <td class="mono">${esc(t.slug)}</td>
      <td class="gap-2">
        <button class="btn btn-sm btn-primary" data-access="${esc(t.slug)}">Link dono</button>
        <button class="btn btn-sm btn-success" data-tid="${t.id}" data-st="live">Live</button>
        <button class="btn btn-sm btn-warn" data-tid="${t.id}" data-st="suspended">Suspender</button>
      </td>
    </tr>`
    )
    .join('');

  tb.querySelectorAll('[data-tid]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await api(`/api/admin/tenants/${btn.getAttribute('data-tid')}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: btn.getAttribute('data-st') }),
        });
        toast('Tenant atualizado');
        await refresh();
      } catch (e) {
        toast('Erro: ' + String(e.message).slice(0, 80));
      }
    });
  });

  tb.querySelectorAll('[data-access]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const slug = btn.getAttribute('data-access');
        const r = await api(`/api/admin/tenants/${slug}/access`, {
          method: 'POST',
          body: '{}',
        });
        const url = r.setupUrl || '';
        try {
          await navigator.clipboard.writeText(url);
        } catch {
          /* */
        }
        prompt('Link para o cliente (ele configura sozinho):', url);
        toast('Link gerado');
      } catch (e) {
        toast('Erro: ' + String(e.message).slice(0, 80));
      }
    });
  });

  const opts = (d.niches || [])
    .map((n) => `<option value="${esc(n.id)}">${esc(n.name)}</option>`)
    .join('');
  document.getElementById('tNiche').innerHTML = opts;
  document.getElementById('bNiche').innerHTML = opts;

  document.getElementById('phasesGrid').innerHTML = (p.phases || [])
    .map(
      (ph) => `
    <div class="phase ${ph.status === 'active' ? 'active' : ''}">
      <h4>Fase ${esc(ph.id)} · ${esc(ph.name)} ${chip(ph.status)}</h4>
      <ul>${(ph.items || []).map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
    </div>`
    )
    .join('');

  document.getElementById('healthBox').innerHTML = `
    <div class="stat"><span>Log existe</span><strong>${health.logExists ? 'sim' : 'não'}</strong></div>
    <div class="stat"><span>Idade do log</span><span class="mono">${health.logAgeSec ?? '—'}s</span></div>
    <div class="stat"><span>Pasta tokens</span><strong>${health.sessionDir ? 'ok' : 'ausente'}</strong></div>
    <div class="stat"><span>Appointments</span><span>${health.appointments || 0}</span></div>
    <p class="muted mt-3 mb-0" style="font-size:13px;line-height:1.55">
      Se o log parar, o bot pode estar offline. Use
      <span class="mono">docker compose logs -f agente-barbearia</span>.
    </p>`;

  document.getElementById('nichesBox').innerHTML = (d.niches || [])
    .map(
      (n) => `
    <div class="row">
      <div class="row-main">
        <div class="row-title">${esc(n.name)} ${chip(n.id)}</div>
        <div class="row-sub">${esc(n.description)}</div>
      </div>
    </div>`
    )
    .join('');

  document.getElementById('setNoShow').value = p.settings?.noShowGraceMin ?? 25;
  document.getElementById('setUnpaid').value = p.settings?.unpaidRemindHours ?? 12;
  document.getElementById('setMaxTenants').value = p.settings?.maxTenants ?? 50;
  document.getElementById('setEmail').value = p.supportEmail || '';
}

async function loadShop() {
  const cfg = await api('/api/admin/shop-config');
  const s = cfg.shop || {};
  document.getElementById('sName').value = s.name || '';
  document.getElementById('sPhone').value = s.phone || '';
  document.getElementById('sAddress').value = s.address || '';
  document.getElementById('sPixKey').value = s.pixKey || '';
  document.getElementById('sPixName').value = s.pixName || '';
  document.getElementById('sLat').value = s.lat ?? '';
  document.getElementById('sLng').value = s.lng ?? '';
  document.getElementById('shopMeta').textContent = `${
    (cfg.services || []).length
  } serviços · ${(cfg.barbers || []).length} profissionais`;
}

async function loadEngine() {
  const b = await api('/api/admin/business');
  document.getElementById('bMode').value = b.mode || 'hybrid';
  document.getElementById('bNiche').value = b.nicheId || 'barbershop';
  document.getElementById('bSession').value = b.sessionName || 'assistente';
  document.getElementById('bAssistant').value = b.niche?.persona?.name || '';
  document.getElementById('bFallback').value = b.fallbackMessage || '';
}

async function loadAdminQr() {
  const wa = await api('/api/wa/status');
  const st = wa.state || 'unknown';
  document.getElementById('adminWaStatus').textContent = wa.detail || '';
  const stateEl = document.getElementById('adminWaState');
  stateEl.textContent = st;
  stateEl.className = `chip ${st === 'online' ? 'ok' : st === 'qr' ? 'blue' : ''}`;
  document.getElementById('adminWaSession').textContent = wa.session || '—';
  document.getElementById('adminWaUpdated').textContent = wa.updatedAt
    ? new Date(wa.updatedAt).toLocaleString('pt-BR')
    : '—';
  const box = document.getElementById('adminQrBox');
  if (st === 'online') {
    box.innerHTML = `<div class="qr-ok">Online — sem QR</div>`;
  } else if (wa.qrDataUrl) {
    box.innerHTML = `<img src="${wa.qrDataUrl}" alt="QR" />`;
  } else if (wa.qrWebUrl) {
    box.innerHTML = `<img src="${esc(wa.qrWebUrl)}" alt="QR" />`;
  } else {
    box.innerHTML = `<div class="empty"><strong>Sem QR</strong><div>Suba o bot ou aguarde regenerar</div></div>`;
  }
}

async function refresh() {
  try {
    const d = await api('/api/admin/overview');
    state.data = d;
    const st = document.getElementById('apiStatus');
    st.className = 'status-pill online';
    st.innerHTML = '<span class="dot"></span> Admin online';
    renderOverview(d);
  } catch (e) {
    const st = document.getElementById('apiStatus');
    st.className = 'status-pill offline';
    st.innerHTML = '<span class="dot"></span> Offline';
    console.error(e);
    toast('Falha ao carregar admin');
  }
}

document.querySelectorAll('.nav-item').forEach((b) => {
  b.addEventListener('click', () => setView(b.dataset.view));
});
document.getElementById('btnRefresh').addEventListener('click', () => refresh());
document.getElementById('btnAdminQr')?.addEventListener('click', () => {
  loadAdminQr()
    .then(() => toast('QR atualizado'))
    .catch((e) => toast(e.message));
});

document.getElementById('btnSavePay')?.addEventListener('click', async () => {
  try {
    const body = {
      activeProvider: document.getElementById('payActive').value,
      mercadoPago: {
        enabled: document.getElementById('mpEnabled').checked,
        publicKey: document.getElementById('mpPublic').value,
        sandbox: document.getElementById('mpSandbox').value === 'true',
      },
      pixKey: {
        enabled: document.getElementById('pixEnabled').checked,
        bank: document.getElementById('pixBank').value,
        key: document.getElementById('pixKey').value,
        holderName: document.getElementById('pixName').value,
        city: document.getElementById('pixCity').value,
      },
      manual: { cardOnSite: true, cash: true },
    };
    const token = document.getElementById('mpToken').value.trim();
    if (token) body.mercadoPago.accessToken = token;
    if (body.activeProvider === 'mercado_pago') body.mercadoPago.enabled = true;
    await api('/api/payments/config', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    toast('Pagamentos salvos');
    await loadPayments();
  } catch (e) {
    toast('Erro: ' + String(e.message).slice(0, 100));
  }
});

document.getElementById('btnTestPix')?.addEventListener('click', async () => {
  const el = document.getElementById('payTestResult');
  el.textContent = 'Gerando…';
  try {
    const r = await api('/api/payments/test-pix', {
      method: 'POST',
      body: JSON.stringify({ amount: 1 }),
    });
    const c = r.charge || {};
    el.innerHTML = c.ok
      ? `<span class="chip ok">OK</span> ${esc(c.provider)} · ${esc(c.message || '')}<br/><span class="mono" style="word-break:break-all">${esc((c.pixCopyPaste || '').slice(0, 120))}…</span>`
      : `<span class="chip danger">Falhou</span> ${esc(c.message || 'erro')}`;
    toast(c.ok ? 'PIX de teste gerado' : 'Falha no teste');
  } catch (e) {
    el.textContent = String(e.message);
    toast('Erro no teste');
  }
});

document.getElementById('btnCreateTenant').addEventListener('click', async () => {
  try {
    const r = await api('/api/admin/tenants', {
      method: 'POST',
      body: JSON.stringify({
        name: document.getElementById('tName').value,
        slug: document.getElementById('tSlug').value,
        nicheId: document.getElementById('tNiche').value,
        plan: document.getElementById('tPlan').value,
      }),
    });
    const url = r.setupUrl || '';
    toast('Cliente criado! Link de acesso copiado se possível.');
    if (url) {
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        /* ignore */
      }
      prompt(
        'Envie este link para o cliente configurar SOZINHO (loja, PIX, WhatsApp):',
        url
      );
    }
    document.getElementById('tName').value = '';
    document.getElementById('tSlug').value = '';
    await refresh();
  } catch (e) {
    toast('Erro: ' + String(e.message).slice(0, 80));
  }
});

document.getElementById('btnSaveShop').addEventListener('click', async () => {
  try {
    await api('/api/admin/shop-config', {
      method: 'POST',
      body: JSON.stringify({
        shop: {
          name: document.getElementById('sName').value,
          phone: document.getElementById('sPhone').value,
          address: document.getElementById('sAddress').value,
          pixKey: document.getElementById('sPixKey').value,
          pixName: document.getElementById('sPixName').value,
          lat: Number(document.getElementById('sLat').value) || undefined,
          lng: Number(document.getElementById('sLng').value) || undefined,
        },
      }),
    });
    toast('Loja salva');
  } catch (e) {
    toast('Erro: ' + String(e.message).slice(0, 80));
  }
});

document.getElementById('btnSaveBiz').addEventListener('click', async () => {
  try {
    const cur = await api('/api/admin/business');
    const niche = cur.niche || { persona: {} };
    niche.persona = {
      ...(niche.persona || {}),
      name: document.getElementById('bAssistant').value,
    };
    await api('/api/admin/business', {
      method: 'POST',
      body: JSON.stringify({
        mode: document.getElementById('bMode').value,
        nicheId: document.getElementById('bNiche').value,
        sessionName: document.getElementById('bSession').value,
        fallbackMessage: document.getElementById('bFallback').value,
        niche,
      }),
    });
    toast('Motor salvo — reinicie o bot se mudar nicho/sessão');
  } catch (e) {
    toast('Erro: ' + String(e.message).slice(0, 80));
  }
});

document.getElementById('btnSavePlatform').addEventListener('click', async () => {
  try {
    await api('/api/admin/platform', {
      method: 'POST',
      body: JSON.stringify({
        supportEmail: document.getElementById('setEmail').value,
        settings: {
          noShowGraceMin: Number(document.getElementById('setNoShow').value),
          unpaidRemindHours: Number(document.getElementById('setUnpaid').value),
          maxTenants: Number(document.getElementById('setMaxTenants').value),
        },
      }),
    });
    toast('Plataforma salva');
    await refresh();
  } catch (e) {
    toast('Erro: ' + String(e.message).slice(0, 80));
  }
});

function tickClock() {
  document.getElementById('clock').textContent = new Date().toLocaleString('pt-BR');
}
tickClock();
setInterval(tickClock, 20000);
refresh();
setInterval(refresh, 15000);
