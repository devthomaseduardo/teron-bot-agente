// Token do dono: URL ?token=  ou localStorage (cada cliente tem o seu)
(function initAuthFromUrl() {
  const u = new URL(window.location.href);
  const t = u.searchParams.get('token');
  const tenant = u.searchParams.get('tenant');
  if (t) {
    localStorage.setItem('panel_token', t);
    if (tenant) localStorage.setItem('panel_tenant', tenant);
    // limpa token da URL (segurança básica)
    u.searchParams.delete('token');
    window.history.replaceState({}, '', u.pathname + (u.searchParams.toString() ? '?' + u.searchParams : '') + (u.searchParams.get('setup') ? '' : ''));
  }
})();

const TOKEN = localStorage.getItem('panel_token') || 'navalha-dev';

const TITLES = {
  dashboard: ['Dashboard', 'Visão geral do dia'],
  agenda: ['Agenda', 'Horários do dia selecionado'],
  fila: ['Fila virtual', 'Quem está esperando ou em atendimento'],
  pix: ['Pagamentos', 'PIX e pendências'],
  tickets: ['Reclamações', 'Chamados abertos pelo WhatsApp'],
  ratings: ['Avaliações', 'Notas e comentários'],
  whatsapp: ['WhatsApp / QR', 'Conecte o celular da loja'],
  pagamentos: ['Formas de pagar', 'PIX Nubank e demais opções'],
  loja: ['Configurações', 'Dados da loja e status'],
};

const state = { dash: null, view: 'dashboard' };

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) throw new Error((await res.text()) || res.statusText);
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
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function money(n) {
  return Number(n || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function chipStatus(status) {
  const s = String(status || '');
  let cls = '';
  if (['done', 'rated', 'paid', 'resolved', 'closed', 'live', 'online'].includes(s))
    cls = 'ok';
  else if (['waiting', 'checked_in', 'open', 'in_progress', 'awaiting_payment'].includes(s))
    cls = 'warn';
  else if (['no_show', 'cancelled', 'suspended', 'failed'].includes(s)) cls = 'danger';
  else if (['in_service', 'booked', 'qr', 'qr_pending', 'provisioning'].includes(s))
    cls = 'blue';
  return `<span class="chip ${cls}">${esc(s.replace(/_/g, ' '))}</span>`;
}

function empty(title, sub) {
  return `
    <div class="empty">
      <div class="empty-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/></svg>
      </div>
      <strong>${esc(title)}</strong>
      <div>${esc(sub || '')}</div>
    </div>`;
}

function bookingActions(a) {
  const id = a.id;
  return `
    <button class="btn btn-sm" data-act="arrived" data-id="${id}">Chegou</button>
    <button class="btn btn-sm btn-primary" data-act="serve" data-id="${id}">Atender</button>
    <button class="btn btn-sm btn-success" data-act="done" data-id="${id}">Finalizar</button>
    <button class="btn btn-sm btn-success" data-act="paid" data-id="${id}">Pagou</button>
    <button class="btn btn-sm btn-warn" data-act="no_show" data-id="${id}">Falta</button>
    <button class="btn btn-sm btn-danger" data-act="cancel" data-id="${id}">Cancelar</button>
    <button class="btn btn-sm btn-ghost" data-act="msg" data-id="${id}">Msg</button>
  `;
}

function bookingRow(a, tag) {
  return `
    <div class="row">
      <div class="row-main">
        <div class="row-title">
          <span>${esc(a.time || '—')} · ${esc(a.clientName || 'Cliente')}</span>
          ${chipStatus(a.status)}
          ${tag ? `<span class="chip blue">${esc(tag)}</span>` : ''}
        </div>
        <div class="row-sub">
          ${esc(a.serviceName || '')} · ${esc(a.barberName || '')}<br/>
          ${money(a.price)} · pag: <strong>${esc(a.payment?.status || 'none')}</strong>
          · <span class="mono">${esc(a.id)}</span>
        </div>
      </div>
      <div class="row-actions">${bookingActions(a)}</div>
    </div>`;
}

function bindActions(root) {
  root.querySelectorAll('[data-act]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      const action = btn.getAttribute('data-act');
      try {
        if (action === 'msg') {
          const text = prompt('Mensagem para o cliente no WhatsApp:');
          if (!text) return;
          await api(`/api/bookings/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ action: 'msg', text }),
          });
          toast('Mensagem enfileirada');
        } else {
          if (action === 'cancel' && !confirm('Cancelar este horário?')) return;
          if (action === 'no_show' && !confirm('Marcar falta?')) return;
          await api(`/api/bookings/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ action }),
          });
          toast('Atualizado');
        }
        await refresh();
      } catch (e) {
        toast('Erro: ' + String(e.message).slice(0, 100));
      }
    });
  });
}

function setBadge(id, n) {
  const el = document.getElementById(id);
  if (!el) return;
  if (n > 0) {
    el.style.display = '';
    el.textContent = String(n);
  } else {
    el.style.display = 'none';
  }
}

function renderDashboard(d) {
  document.getElementById('shopName').textContent = d.shop?.name || 'Sua loja';
  document.getElementById('shopOpen').checked = d.ops?.open !== false;

  const k = d.kpis || {};
  document.getElementById('kpis').innerHTML = `
    <div class="kpi"><div class="kpi-label">Hoje</div><div class="kpi-value">${k.today || 0}</div></div>
    <div class="kpi warn"><div class="kpi-label">Na fila</div><div class="kpi-value">${k.waiting || 0}</div></div>
    <div class="kpi danger"><div class="kpi-label">PIX pendente</div><div class="kpi-value">${k.pixPending || 0}</div></div>
    <div class="kpi danger"><div class="kpi-label">Faltas</div><div class="kpi-value">${k.noShow || 0}</div></div>
    <div class="kpi warn"><div class="kpi-label">Chamados</div><div class="kpi-value">${k.ticketsOpen || 0}</div></div>
    <div class="kpi ok"><div class="kpi-label">Nota média</div><div class="kpi-value">${
      k.ratingCount ? Number(k.ratingAvg).toFixed(1) : '—'
    }</div></div>
  `;

  setBadge('navFila', k.waiting || 0);
  setBadge('navPix', k.pixPending || 0);
  setBadge('navTickets', k.ticketsOpen || 0);

  const today = d.today || [];
  document.getElementById('todayCount').textContent = `${today.length} horário(s)`;
  const listToday = document.getElementById('listToday');
  listToday.innerHTML = today.length
    ? today.map((a) => bookingRow(a)).join('')
    : empty('Nada na agenda', 'Quando agendarem no WhatsApp, aparece aqui.');
  bindActions(listToday);

  const attn = [
    ...(d.pix || []).map((a) => ({ ...a, _tag: 'PIX' })),
    ...(d.waiting || []).map((a) => ({ ...a, _tag: 'FILA' })),
    ...today.filter((a) => a.status === 'no_show').map((a) => ({ ...a, _tag: 'FALTA' })),
  ];
  const listAtt = document.getElementById('listAttention');
  listAtt.innerHTML = attn.length
    ? attn.slice(0, 12).map((a) => bookingRow(a, a._tag)).join('')
    : empty('Tudo em dia', 'Nenhuma pendência urgente.');
  bindActions(listAtt);

  const shop = d.shop || {};
  document.getElementById('shopInfo').innerHTML = `
    <div style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:6px">${esc(shop.name)}</div>
    ${esc(shop.address || '')}<br/>
    ${esc(shop.phone || '')}<br/><br/>
    <span class="muted-sm">PIX</span><br/>
    <span class="mono">${esc(shop.pixKey || '—')}</span><br/>
    ${esc(shop.pixName || '')}
  `;
  const h = d.health || {};
  document.getElementById('botHint').textContent = h.logExists
    ? `log ${h.logAgeSec != null ? h.logAgeSec + 's' : 'ok'}`
    : 'sem log';
  document.getElementById('ticketsHint').textContent = String(k.ticketsOpen || 0);
  document.getElementById('ratingHint').textContent = k.ratingCount
    ? `${Number(k.ratingAvg).toFixed(2)} (${k.ratingCount})`
    : '—';
}

async function renderAgenda() {
  const day =
    document.getElementById('dayPicker').value ||
    new Date().toISOString().slice(0, 10);
  document.getElementById('dayPicker').value = day;
  const data = await api(`/api/bookings?day=${day}`);
  const list = data.bookings || [];
  const el = document.getElementById('listAgenda');
  el.innerHTML = list.length
    ? list.map((a) => bookingRow(a)).join('')
    : empty('Sem horários', 'Nenhum agendamento neste dia.');
  bindActions(el);
}

function renderFila(d) {
  const list = d.waiting || [];
  const el = document.getElementById('listFila');
  el.innerHTML = list.length
    ? list.map((a) => bookingRow(a)).join('')
    : empty('Fila vazia', 'Ninguém esperando agora.');
  bindActions(el);
}

function renderPix(d) {
  const list = d.pix || [];
  const el = document.getElementById('listPix');
  el.innerHTML = list.length
    ? list.map((a) => bookingRow(a)).join('')
    : empty('Sem pendências', 'Nenhum pagamento aguardando.');
  bindActions(el);
}

async function renderTickets() {
  const data = await api('/api/tickets');
  const list = data.tickets || [];
  const el = document.getElementById('listTickets');
  el.innerHTML = list.length
    ? list
        .map(
          (t) => `
      <div class="row">
        <div class="row-main">
          <div class="row-title">
            <span class="mono">${esc(t.id)}</span>
            ${chipStatus(t.status)}
            <span class="chip">${esc(t.kind)}</span>
          </div>
          <div class="row-sub">
            <strong>${esc(t.subject)}</strong><br/>
            ${esc(t.clientName || t.chatId)}<br/>
            ${esc((t.body || '').slice(0, 160))}
          </div>
        </div>
        <div class="row-actions">
          <button class="btn btn-sm btn-primary" data-ticket="${t.id}" data-st="in_progress">Andamento</button>
          <button class="btn btn-sm btn-success" data-ticket="${t.id}" data-st="resolved">Resolver</button>
          <button class="btn btn-sm btn-ghost" data-ticket="${t.id}" data-st="reply">Responder</button>
        </div>
      </div>`
        )
        .join('')
    : empty('Sem reclamações', 'Nenhum chamado aberto.');

  el.querySelectorAll('[data-ticket]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-ticket');
      const st = btn.getAttribute('data-st');
      try {
        if (st === 'reply') {
          const reply = prompt('Resposta no WhatsApp do cliente:');
          if (!reply) return;
          await api(`/api/tickets/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'in_progress', reply }),
          });
        } else {
          await api(`/api/tickets/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: st }),
          });
        }
        toast('Chamado atualizado');
        await renderTickets();
        await refresh(false);
      } catch (e) {
        toast('Erro: ' + String(e.message).slice(0, 80));
      }
    });
  });
}

async function renderRatings() {
  const r = await api('/api/ratings');
  document.getElementById('ratingsBox').innerHTML = `
    <div style="display:flex;gap:28px;align-items:flex-end;flex-wrap:wrap">
      <div>
        <div class="muted-sm">Média geral</div>
        <div style="font-size:40px;font-weight:800;letter-spacing:-1.5px;line-height:1">
          ${r.count ? r.avg.toFixed(2) : '—'}
        </div>
      </div>
      <div class="muted" style="padding-bottom:6px">${r.count || 0} avaliações</div>
    </div>
    <div class="muted mt-3" style="font-size:13px">
      ${(r.byBarber || [])
        .map(
          (b) =>
            `<strong style="color:var(--text)">${esc(b.name)}</strong>: ${b.avg.toFixed(1)} (${b.count})`
        )
        .join(' · ') || 'Sem notas por profissional ainda'}
    </div>`;
  document.getElementById('listRatings').innerHTML = (r.recent || []).length
    ? r.recent
        .map(
          (x) => `
      <div class="row">
        <div class="row-main">
          <div class="row-title">${'★'.repeat(x.stars)}${'☆'.repeat(5 - x.stars)} · ${esc(x.name)}</div>
          <div class="row-sub">${esc(x.barber)}${x.comment ? ' · ' + esc(x.comment) : ''}</div>
        </div>
      </div>`
        )
        .join('')
    : empty('Sem avaliações', 'Depois dos atendimentos as notas aparecem aqui.');
}

async function loadWaStatus() {
  const wa = await api('/api/wa/status');
  const st = wa.state || 'unknown';
  document.getElementById('waStatusBox').innerHTML = `
    <div class="stat"><span>Status</span>${chipStatus(st)}</div>
    <div class="muted mt-2">${esc(wa.detail || '')}</div>
  `;
  const pill = document.getElementById('waStatePill');
  pill.textContent = st;
  pill.className = `chip ${st === 'online' ? 'ok' : st === 'qr' ? 'blue' : ''}`;
  document.getElementById('waSession').textContent = wa.session || '—';
  document.getElementById('waUpdated').textContent = wa.updatedAt
    ? new Date(wa.updatedAt).toLocaleString('pt-BR')
    : '—';

  const box = document.getElementById('qrBox');
  if (st === 'online') {
    box.innerHTML = `<div class="qr-ok">WhatsApp conectado</div>`;
  } else if (wa.qrDataUrl) {
    box.innerHTML = `<img src="${wa.qrDataUrl}" alt="QR WhatsApp" />`;
  } else if (wa.qrWebUrl) {
    box.innerHTML = `<img src="${esc(wa.qrWebUrl)}" alt="QR WhatsApp" />`;
  } else {
    box.innerHTML = empty(
      'Sem QR no momento',
      'Se o bot subiu agora, aguarde e clique em Atualizar. Se já está logado, o status fica online.'
    );
  }
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
  if (name === 'agenda') renderAgenda().catch(console.error);
  if (name === 'tickets') renderTickets().catch(console.error);
  if (name === 'ratings') renderRatings().catch(console.error);
  if (name === 'whatsapp') loadWaStatus().catch(console.error);
  if (name === 'pagamentos') loadOwnerPayments().catch(console.error);
  if (name === 'loja') loadShopForm().catch(console.error);
  if (name === 'fila' && state.dash) renderFila(state.dash);
  if (name === 'pix' && state.dash) renderPix(state.dash);
}

async function loadOwnerPayments() {
  const cfg = await api('/api/payments/config');
  const sum = cfg.summary || {};
  document.getElementById('ownerPaySummary').textContent = sum.label
    ? `${sum.label} · ${sum.detail || ''}`
    : '—';
  document.getElementById('ownerPixBank').value = cfg.pixKey?.bank || 'nubank';
  document.getElementById('ownerPixKey').value = cfg.pixKey?.key || '';
  document.getElementById('ownerPixName').value = cfg.pixKey?.holderName || '';
  if (document.getElementById('ownerPayActive')) {
    document.getElementById('ownerPayActive').value = cfg.activeProvider || 'pix_key';
  }
  if (document.getElementById('ownerMpEnabled')) {
    document.getElementById('ownerMpEnabled').checked = Boolean(cfg.mercadoPago?.enabled);
  }
}

async function loadSetup() {
  try {
    const me = await api('/api/me');
    const setup = me.setup;
    const banner = document.getElementById('setupBanner');
    if (!setup || setup.percent >= 100) {
      banner.style.display = 'none';
      return;
    }
    banner.style.display = '';
    document.getElementById('setupPercent').textContent = setup.percent + '%';
    document.getElementById('setupSteps').innerHTML = (setup.steps || [])
      .map(
        (s) =>
          `<span class="chip ${s.done ? 'ok' : 'warn'}">${s.done ? '✓' : '○'} ${esc(s.label)}</span>`
      )
      .join('');
  } catch {
    /* ignore */
  }
}

async function loadShopForm() {
  try {
    const cfg = await api('/api/shop');
    const s = cfg.shop || {};
    document.getElementById('oShopName').value = s.name || '';
    document.getElementById('oShopPhone').value = s.phone || '';
    document.getElementById('oShopAddress').value = s.address || '';
    document.getElementById('oShopLat').value = s.lat ?? '';
    document.getElementById('oShopLng').value = s.lng ?? '';
    document.getElementById('oServices').value = (cfg.services || [])
      .map((x) => `${x.name} | ${x.price} | ${x.durationMin}`)
      .join('\n');
    document.getElementById('oBarbers').value = (cfg.barbers || [])
      .map((x) => `${x.name} | ${x.nickname || ''} | ${x.specialty || ''}`)
      .join('\n');
  } catch (e) {
    console.error(e);
  }
}

function parseServices(text) {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l, i) => {
      const [name, price, durationMin] = l.split('|').map((x) => x.trim());
      return {
        id: 's' + (i + 1),
        name: name || 'Serviço',
        price: Number(price) || 0,
        durationMin: Number(durationMin) || 30,
        keywords: [(name || '').toLowerCase()],
      };
    });
}

function parseBarbers(text) {
  const schedule = {
    '1': ['09:00', '18:00'],
    '2': ['09:00', '18:00'],
    '3': ['09:00', '18:00'],
    '4': ['09:00', '18:00'],
    '5': ['09:00', '18:00'],
    '6': ['09:00', '14:00'],
  };
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l, i) => {
      const [name, nickname, specialty] = l.split('|').map((x) => x.trim());
      return {
        id: 'b' + (i + 1),
        name: name || 'Profissional',
        nickname: nickname || name || 'Pro',
        specialty: specialty || 'Geral',
        schedule,
        onDuty: true,
      };
    });
}

async function refresh(full = true) {
  try {
    const d = await api('/api/dashboard');
    state.dash = d;
    const st = document.getElementById('apiStatus');
    st.className = 'status-pill online';
    st.innerHTML = '<span class="dot"></span> Online';
    if (full || state.view === 'dashboard' || state.view === 'loja') {
      renderDashboard(d);
    }
    if (state.view === 'fila') renderFila(d);
    if (state.view === 'pix') renderPix(d);
  } catch (e) {
    const st = document.getElementById('apiStatus');
    st.className = 'status-pill offline';
    st.innerHTML = '<span class="dot"></span> Offline';
    console.error(e);
  }
}

function tickClock() {
  document.getElementById('clock').textContent = new Date().toLocaleString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

document.querySelectorAll('.nav-item').forEach((b) => {
  b.addEventListener('click', () => setView(b.dataset.view));
});
document.getElementById('btnRefresh').addEventListener('click', () => refresh());
document.getElementById('btnRefreshQr')?.addEventListener('click', () => {
  loadWaStatus()
    .then(() => toast('Status atualizado'))
    .catch((e) => toast(e.message));
});
document.getElementById('dayPicker')?.addEventListener('change', () => renderAgenda());
document.getElementById('shopOpen').addEventListener('change', async (e) => {
  try {
    await api('/api/ops', {
      method: 'POST',
      body: JSON.stringify({ open: e.target.checked }),
    });
    toast(e.target.checked ? 'Loja aberta' : 'Loja fechada');
  } catch {
    toast('Erro ao salvar');
  }
});

document.getElementById('btnSaveOwnerPay')?.addEventListener('click', async () => {
  try {
    const body = {
      activeProvider: document.getElementById('ownerPayActive')?.value || 'pix_key',
      pixKey: {
        enabled: true,
        bank: document.getElementById('ownerPixBank').value,
        key: document.getElementById('ownerPixKey').value,
        holderName: document.getElementById('ownerPixName').value,
      },
      mercadoPago: {
        enabled: document.getElementById('ownerMpEnabled')?.checked || false,
      },
    };
    const tok = document.getElementById('ownerMpToken')?.value?.trim();
    if (tok) body.mercadoPago.accessToken = tok;
    if (body.activeProvider === 'mercado_pago') body.mercadoPago.enabled = true;
    await api('/api/payments/config', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    toast('Pagamentos salvos — você configurou sozinho ✓');
    await loadOwnerPayments();
    await loadSetup();
  } catch (e) {
    toast('Erro: ' + String(e.message).slice(0, 80));
  }
});

document.getElementById('btnOwnerTestPix')?.addEventListener('click', async () => {
  const el = document.getElementById('ownerPayTest');
  el.textContent = 'Gerando…';
  try {
    const r = await api('/api/payments/test-pix', {
      method: 'POST',
      body: JSON.stringify({ amount: 1 }),
    });
    const c = r.charge || {};
    el.innerHTML = c.ok
      ? `<span class="chip ok">OK</span> ${esc(c.provider)} · ${(c.pixCopyPaste || '').slice(0, 80)}…`
      : `<span class="chip danger">Falhou</span> ${esc(c.message || '')}`;
  } catch (e) {
    el.textContent = String(e.message);
  }
});

document.getElementById('btnSaveShopOwner')?.addEventListener('click', async () => {
  try {
    await api('/api/setup/shop', {
      method: 'POST',
      body: JSON.stringify({
        shop: {
          name: document.getElementById('oShopName').value,
          phone: document.getElementById('oShopPhone').value,
          address: document.getElementById('oShopAddress').value,
          lat: Number(document.getElementById('oShopLat').value) || undefined,
          lng: Number(document.getElementById('oShopLng').value) || undefined,
        },
        services: parseServices(document.getElementById('oServices').value),
        barbers: parseBarbers(document.getElementById('oBarbers').value),
      }),
    });
    toast('Loja salva — configuração sua ✓');
    await loadSetup();
    await refresh();
  } catch (e) {
    toast('Erro: ' + String(e.message).slice(0, 80));
  }
});

document.querySelectorAll('[data-view-jump]').forEach((b) => {
  b.addEventListener('click', () => setView(b.getAttribute('data-view-jump')));
});

tickClock();
setInterval(tickClock, 20000);
refresh().then(() => loadSetup());
setInterval(() => refresh(false), 10000);
setInterval(() => {
  if (state.view === 'whatsapp') loadWaStatus().catch(() => {});
}, 5000);
// se veio com ?setup=1, abre loja
if (new URL(location.href).searchParams.get('setup') === '1') {
  setTimeout(() => setView('loja'), 400);
}
