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
  dashboard: ['Início', 'Resumo do dia · atendimentos · urgências'],
  agenda: ['Agenda', 'Todos os horários e a equipe'],
  mensagens: ['Mensagens', 'Conversas do WhatsApp ao vivo'],
  pagamentos: ['Pagamentos', 'Pendentes e formas de receber'],
  clientes: ['Clientes', 'Reclamações e avaliações'],
  growth: ['Oportunidades', 'Demanda local para captar'],
  config: ['Configurações', 'Negócio, equipe, horários e WhatsApp'],
};

/** rotas antigas → view unificada */
const VIEW_ALIASES = {
  fila: 'agenda',
  pix: 'pagamentos',
  equipe: 'config',
  loja: 'config',
  whatsapp: 'config',
  tickets: 'clientes',
  ratings: 'clientes',
  configuracoes: 'config',
};

const DAY_LABELS = {
  0: 'Dom',
  1: 'Seg',
  2: 'Ter',
  3: 'Qua',
  4: 'Qui',
  5: 'Sex',
  6: 'Sáb',
};

const state = {
  dash: null,
  view: 'dashboard',
  live: false,
  lastLiveAt: null,
  agendaDay: null,
  refreshing: false,
  lastAgendaSig: '',
  lastMsgSig: '',
  shopConfig: null,
  unreadIn: 0,
  agendaFilter: 'all',
  labels: null,
};

function L() {
  return (
    state.labels || {
      professional: 'profissional',
      professionals: 'equipe',
      service: 'serviço',
      booking: 'atendimento',
      bookings: 'atendimentos',
      queue: 'fila',
      client: 'cliente',
      dayReport: 'Resumo do dia',
      daySchedule: 'Atendimentos de hoje',
      urgency: 'Precisa de você',
    }
  );
}

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
  const st = String(a.status || '');
  // ações principais por contexto (menos botões = mais organizado)
  const primary = [];
  if (['booked', 'paid', 'awaiting_payment'].includes(st)) {
    primary.push(
      `<button class="btn btn-sm" data-act="arrived" data-id="${id}">Chegou</button>`
    );
  }
  if (['waiting', 'checked_in', 'booked', 'paid'].includes(st)) {
    primary.push(
      `<button class="btn btn-sm btn-primary" data-act="serve" data-id="${id}">Atender</button>`
    );
  }
  if (['in_service', 'waiting', 'checked_in'].includes(st)) {
    primary.push(
      `<button class="btn btn-sm btn-success" data-act="done" data-id="${id}">Finalizar</button>`
    );
  }
  if (a.payment?.status !== 'confirmed') {
    primary.push(
      `<button class="btn btn-sm btn-success" data-act="paid" data-id="${id}">Pagou</button>`
    );
  }
  // secundárias
  const more = `
    <details class="act-more">
      <summary class="btn btn-sm btn-ghost">Mais</summary>
      <div class="act-more-menu">
        <button class="btn btn-sm btn-warn" data-act="no_show" data-id="${id}">Falta</button>
        <button class="btn btn-sm btn-danger" data-act="cancel" data-id="${id}">Cancelar</button>
        <button class="btn btn-sm" data-act="msg" data-id="${id}">Mensagem</button>
      </div>
    </details>`;
  return primary.join('') + more;
}

function bookingRow(a, tag) {
  const labels = L();
  // universal: professional pode vir como barberName (legado) ou professionalName
  const pro =
    a.professionalName ||
    a.barberName ||
    a.barberNickname ||
    a.staffName ||
    '—';
  const client = a.clientName || labels.client || 'Cliente';
  const svc = a.serviceName || labels.service || 'Serviço';
  return `
    <div class="row">
      <div class="row-main">
        <div class="row-title">
          <span class="time-pill">${esc(a.time || '—')}</span>
          <span class="client-name">${esc(client)}</span>
          ${chipStatus(a.status)}
          <span class="chip pro" title="${esc(labels.professional)}">● ${esc(pro)}</span>
          ${tag ? `<span class="chip blue">${esc(tag)}</span>` : ''}
        </div>
        <div class="row-sub">
          ${esc(svc)}
          · ${money(a.price)}
          · pag <strong>${esc(a.payment?.status || 'none')}</strong>
          ${a.date ? ` · ${esc(a.date)}` : ''}
        </div>
      </div>
      <div class="row-actions">${bookingActions(a)}</div>
    </div>`;
}

function messageRow(m) {
  const dir = m.direction === 'in' ? 'in' : 'out';
  const label = dir === 'in' ? 'Cliente' : 'Bot/loja';
  const t = m.at
    ? new Date(m.at).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '—';
  const chat = String(m.chatId || m.from || '').replace(/@.*/, '');
  return `
    <div class="row msg-row msg-${dir}">
      <div class="row-main">
        <div class="row-title">
          <span class="chip ${dir === 'in' ? 'warn' : 'ok'}">${label}</span>
          <span class="mono muted-sm">${esc(chat)}</span>
          <span class="meta">${esc(t)}</span>
          ${m.source ? `<span class="chip blue">${esc(m.source)}</span>` : ''}
        </div>
        <div class="row-sub msg-text">${esc((m.text || '').slice(0, 400))}</div>
      </div>
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
  if (d.labels) state.labels = d.labels;
  const labels = L();

  const nameEl = document.getElementById('shopName');
  if (nameEl) nameEl.textContent = d.shop?.name || 'Seu negócio';
  const openEl = document.getElementById('shopOpen');
  if (openEl) openEl.checked = d.ops?.open !== false;

  const r = d.dayReport || {};
  const k = d.kpis || {};
  const today = d.today || [];

  // hero do dia
  const heroLabel = document.getElementById('dayHeroLabel');
  if (heroLabel) heroLabel.textContent = labels.dayReport || 'Resumo do dia';
  const heroDate = document.getElementById('dayHeroDate');
  if (heroDate) {
    const iso = r.date || new Date().toISOString().slice(0, 10);
    try {
      heroDate.textContent = new Date(iso + 'T12:00:00').toLocaleDateString(
        'pt-BR',
        { weekday: 'long', day: '2-digit', month: 'long' }
      );
    } catch {
      heroDate.textContent = iso;
    }
  }
  const revPaid = document.getElementById('dayRevenuePaid');
  if (revPaid) revPaid.textContent = money(r.revenuePaid ?? k.revenuePaid ?? 0);
  const revPend = document.getElementById('dayRevenuePending');
  if (revPend) {
    const p = r.revenuePending ?? k.revenuePending ?? 0;
    revPend.textContent =
      p > 0 ? `a receber ${money(p)}` : 'nada pendente de valor';
  }

  // KPIs universais do dia
  const kpis = document.getElementById('kpis');
  if (kpis) {
    kpis.innerHTML = `
    <div class="kpi"><div class="kpi-label">Agendados</div><div class="kpi-value">${r.total ?? k.today ?? 0}</div>
      <div class="kpi-sub">no dia</div></div>
    <div class="kpi blue"><div class="kpi-label">A fazer</div><div class="kpi-value">${r.upcoming ?? 0}</div>
      <div class="kpi-sub">ainda não chegou</div></div>
    <div class="kpi warn"><div class="kpi-label">Em espera</div><div class="kpi-value">${r.inQueue ?? 0}</div>
      <div class="kpi-sub">${esc(labels.queue)}</div></div>
    <div class="kpi blue"><div class="kpi-label">Em andamento</div><div class="kpi-value">${r.inService ?? 0}</div>
      <div class="kpi-sub">agora</div></div>
    <div class="kpi ok"><div class="kpi-label">Concluídos</div><div class="kpi-value">${r.completed ?? k.done ?? 0}</div>
      <div class="kpi-sub">finalizados</div></div>
    <div class="kpi danger"><div class="kpi-label">A receber</div><div class="kpi-value">${r.payPending ?? k.pixPending ?? 0}</div>
      <div class="kpi-sub">pagamentos</div></div>
  `;
  }

  setBadge('navFila', r.waiting ?? k.waiting ?? 0);
  setBadge('navPix', r.payPending ?? k.pixPending ?? 0);
  setBadge('navTickets', r.ticketsOpen ?? k.ticketsOpen ?? 0);
  setBadge('navGrowth', k.growthOpen || d.growth?.openCount || 0);

  // títulos com vocabulário do nicho
  const schTitle = document.getElementById('homeScheduleTitle');
  if (schTitle) schTitle.textContent = labels.daySchedule || 'Atendimentos de hoje';
  const urgTitle = document.getElementById('homeUrgencyTitle');
  if (urgTitle) urgTitle.textContent = labels.urgency || 'Precisa de você';
  const todayCount = document.getElementById('todayCount');
  if (todayCount) {
    todayCount.textContent = `${today.length} ${labels.bookings || 'atendimentos'}`;
  }
  const qFilter = document.getElementById('filterQueueLabel');
  if (qFilter) qFilter.textContent = labels.queue || 'Em espera';

  // Atendimentos de hoje (lista operacional completa do dia)
  const listToday = document.getElementById('listToday');
  if (listToday) {
    const active = today.filter((a) => a.status !== 'cancelled');
    listToday.innerHTML = active.length
      ? active.map((a) => bookingRow(a)).join('')
      : empty(
          'Nenhum atendimento hoje',
          'Quando agendarem pelo WhatsApp, a lista aparece aqui em tempo real.'
        );
    bindActions(listToday);
  }

  // Urgências (só o que pede dono)
  const attn = [
    ...(d.pix || []).map((a) => ({ ...a, _tag: 'PAGAR' })),
    ...(d.waiting || [])
      .filter((a) => ['waiting', 'checked_in'].includes(a.status))
      .map((a) => ({ ...a, _tag: (labels.queue || 'ESPERA').toUpperCase() })),
    ...today
      .filter((a) => a.status === 'in_service')
      .map((a) => ({ ...a, _tag: 'ANDAMENTO' })),
    ...today
      .filter((a) => a.status === 'no_show')
      .map((a) => ({ ...a, _tag: 'FALTA' })),
  ];
  const seen = new Set();
  const unique = attn.filter((a) => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });

  const listAtt = document.getElementById('listAttention');
  if (listAtt) {
    listAtt.innerHTML = unique.length
      ? unique.slice(0, 12).map((a) => bookingRow(a, a._tag)).join('')
      : empty('Tudo em dia', 'Nenhuma urgência agora. O dia roda na lista ao lado.');
    bindActions(listAtt);
  }

  const shopInfo = document.getElementById('shopInfo');
  if (shopInfo) {
    const shop = d.shop || {};
    shopInfo.innerHTML = `${esc(shop.name || '')} · ${esc(shop.phone || '')}`;
  }
  const h = d.health || {};
  const botHint = document.getElementById('botHint');
  if (botHint) {
    botHint.textContent = h.logExists
      ? `ok ${h.logAgeSec != null ? h.logAgeSec + 's' : ''}`
      : 'sem log';
  }
  const ticketsHint = document.getElementById('ticketsHint');
  if (ticketsHint) ticketsHint.textContent = String(r.ticketsOpen ?? k.ticketsOpen ?? 0);
  const ratingHint = document.getElementById('ratingHint');
  if (ratingHint) {
    ratingHint.textContent = k.ratingCount
      ? `${Number(k.ratingAvg).toFixed(1)} (${k.ratingCount})`
      : '—';
  }

  // filtro de equipe: texto universal
  const barberFilter = document.getElementById('agendaBarberFilter');
  if (barberFilter && barberFilter.options[0]) {
    barberFilter.options[0].textContent = `Toda a ${labels.professionals || 'equipe'}`;
  }
}

function agendaSignature(list) {
  return (list || [])
    .map(
      (a) =>
        `${a.id}|${a.status}|${a.time}|${a.payment?.status || ''}|${a.updatedAt || a.createdAt || ''}`
    )
    .join(';');
}

function setAgendaMeta(list, day) {
  const countEl = document.getElementById('agendaCount');
  const updEl = document.getElementById('agendaUpdated');
  const hint = document.getElementById('agendaLiveHint');
  if (countEl) countEl.textContent = `${list.length} horário(s) · ${day}`;
  if (updEl) {
    updEl.textContent = `atualizado ${new Date().toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })}`;
  }
  if (hint) {
    hint.textContent = state.live ? '● tempo real' : 'atualizando…';
    hint.style.color = state.live ? 'var(--success, #059669)' : '';
  }
}

async function fillBarberFilter() {
  const sel = document.getElementById('agendaBarberFilter');
  if (!sel) return;
  const prev = sel.value;
  try {
    if (!state.shopConfig) {
      state.shopConfig = await api('/api/shop');
    }
    const barbers = state.shopConfig.barbers || [];
    const opts = ['<option value="">Todos profissionais</option>']
      .concat(
        barbers.map(
          (b) =>
            `<option value="${esc(b.id)}">${esc(b.nickname || b.name)}</option>`
        )
      )
      .join('');
    sel.innerHTML = opts;
    if (prev) sel.value = prev;
  } catch {
    /* ignore */
  }
}

function matchAgendaFilter(a, filter) {
  const st = String(a.status || '');
  if (filter === 'all') return !['cancelled'].includes(st);
  if (filter === 'fila')
    return ['waiting', 'checked_in', 'in_service'].includes(st);
  if (filter === 'booked')
    return ['booked', 'paid'].includes(st);
  if (filter === 'pay')
    return (
      a.payment?.status === 'pending' ||
      a.payment?.status === 'none' ||
      st === 'awaiting_payment'
    ) && !['cancelled', 'no_show', 'done', 'rated'].includes(st);
  return true;
}

async function renderAgenda(opts = {}) {
  const silent = Boolean(opts.silent);
  const dayPicker = document.getElementById('dayPicker');
  const day =
    (dayPicker && dayPicker.value) ||
    new Date().toISOString().slice(0, 10);
  if (dayPicker) dayPicker.value = day;
  state.agendaDay = day;
  await fillBarberFilter();
  const data = await api(`/api/bookings?day=${day}`);
  const barberId = document.getElementById('agendaBarberFilter')?.value || '';
  const filter = state.agendaFilter || 'all';
  let list = (data.bookings || [])
    .slice()
    .sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
  if (barberId) list = list.filter((a) => a.barberId === barberId);
  list = list.filter((a) => matchAgendaFilter(a, filter));

  const sig = agendaSignature(list) + '|' + barberId + '|' + filter;
  const el = document.getElementById('listAgenda');
  if (!el) return;
  if (silent && sig === state.lastAgendaSig && el.children.length) {
    setAgendaMeta(list, day);
    return;
  }
  const changed = state.lastAgendaSig && state.lastAgendaSig !== sig;
  state.lastAgendaSig = sig;

  const emptyMsg =
    filter === 'fila'
      ? ['Fila vazia', 'Ninguém esperando na loja agora.']
      : filter === 'pay'
        ? ['Nada a pagar', 'Sem pendências de pagamento neste dia.']
        : barberId
          ? ['Sem horários', 'Nada para este profissional.']
          : ['Dia livre', 'Quando agendarem no WhatsApp, aparece aqui.'];

  el.innerHTML = list.length
    ? list.map((a) => {
        let tag = '';
        if (['waiting', 'checked_in'].includes(a.status)) tag = 'FILA';
        if (a.status === 'in_service') tag = 'ATENDENDO';
        if (a.payment?.status === 'pending' || a.status === 'awaiting_payment')
          tag = tag || 'PIX';
        return bookingRow(a, tag || undefined);
      }).join('')
    : empty(emptyMsg[0], emptyMsg[1]);
  bindActions(el);
  setAgendaMeta(list, day);
  if (changed) {
    el.classList.remove('flash-update');
    void el.offsetWidth;
    el.classList.add('flash-update');
  }
}

async function renderMessages(opts = {}) {
  const silent = Boolean(opts.silent);
  const data = await api('/api/messages?limit=100');
  const list = data.messages || [];
  const sig = list
    .map((m) => `${m.at}|${m.direction}|${(m.text || '').slice(0, 40)}`)
    .join(';');
  const el = document.getElementById('listMessages');
  if (!el) return;
  if (silent && sig === state.lastMsgSig && el.children.length) {
    return;
  }
  const prev = state.lastMsgSig;
  state.lastMsgSig = sig;
  // conta entradas novas
  const ins = list.filter((m) => m.direction === 'in').length;
  if (state.view !== 'mensagens' && prev && sig !== prev) {
    state.unreadIn = Math.min(99, (state.unreadIn || 0) + 1);
    setBadge('navMsg', state.unreadIn);
  }
  if (state.view === 'mensagens') {
    state.unreadIn = 0;
    setBadge('navMsg', 0);
  }
  el.innerHTML = list.length
    ? list
        .slice()
        .reverse()
        .map((m) => messageRow(m))
        .join('')
    : empty('Sem mensagens ainda', 'Quando alguém falar no WhatsApp, aparece aqui.');
  const upd = document.getElementById('msgUpdated');
  if (upd) {
    upd.textContent = new Date().toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }
  const hint = document.getElementById('msgLiveHint');
  if (hint) hint.textContent = state.live ? '● ao vivo' : 'atualizando…';
  if (prev && prev !== sig) {
    el.classList.remove('flash-update');
    void el.offsetWidth;
    el.classList.add('flash-update');
  }
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

function resolveView(name) {
  name = String(name || 'dashboard');
  if (VIEW_ALIASES[name]) name = VIEW_ALIASES[name];
  if (!TITLES[name]) name = 'dashboard';
  return name;
}

function setView(name, opts = {}) {
  name = resolveView(name);
  state.view = name;
  document.querySelectorAll('.nav-item').forEach((b) => {
    b.classList.toggle('active', b.dataset.view === name);
  });
  document.querySelectorAll('.view').forEach((v) => {
    v.classList.toggle('active', v.id === `view-${name}`);
  });
  const [t, d] = TITLES[name] || [name, ''];
  const vt = document.getElementById('viewTitle');
  const vd = document.getElementById('viewDesc');
  if (vt) vt.textContent = t;
  if (vd) vd.textContent = d;

  if (!opts.skipHash) {
    const hash = '#' + name;
    if (location.hash !== hash) history.replaceState(null, '', hash);
  }

  // sub-aba pedida
  if (opts.tab) {
    const group =
      name === 'config'
        ? 'config'
        : name === 'pagamentos'
          ? 'pay'
          : name === 'clientes'
            ? 'clientes'
            : null;
    activateTab(group, opts.tab);
  }

  if (name === 'agenda') {
    if (opts.agendaFilter) {
      state.agendaFilter = opts.agendaFilter;
      syncAgendaFilterChips();
    }
    renderAgenda().catch(console.error);
  }
  if (name === 'mensagens') {
    state.unreadIn = 0;
    setBadge('navMsg', 0);
    renderMessages().catch(console.error);
  }
  if (name === 'pagamentos') {
    if (state.dash) renderPix(state.dash);
    loadOwnerPayments().catch(console.error);
  }
  if (name === 'clientes') {
    renderTickets().catch(console.error);
    renderRatings().catch(console.error);
  }
  if (name === 'growth') loadGrowth().catch(console.error);
  if (name === 'config') {
    loadShopForm().catch(console.error);
    loadEquipeEditor().catch(console.error);
    loadWaStatus().catch(console.error);
  }
}

function activateTab(group, tabId) {
  if (!group || !tabId) return;
  const root = document.querySelector(`.tabs[data-tabs="${group}"]`);
  if (!root) return;
  root.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t.getAttribute('data-tab') === tabId);
  });
  // panels are siblings after tabs inside the same view
  const view = root.closest('.view');
  if (!view) return;
  view.querySelectorAll('.tab-panel').forEach((p) => {
    p.classList.toggle('active', p.getAttribute('data-panel') === tabId);
  });
}

function initTabs() {
  document.querySelectorAll('.tabs').forEach((tabs) => {
    const group = tabs.getAttribute('data-tabs');
    tabs.querySelectorAll('.tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-tab');
        activateTab(group, id);
        // carrega conteúdo sob demanda
        if (id === 'cfg-equipe') loadEquipeEditor().catch(console.error);
        if (id === 'cfg-loja') loadShopForm().catch(console.error);
        if (id === 'cfg-wa') loadWaStatus().catch(console.error);
        if (id === 'config-pay') loadOwnerPayments().catch(console.error);
        if (id === 'ratings') renderRatings().catch(console.error);
        if (id === 'tickets') renderTickets().catch(console.error);
      });
    });
  });
}

function syncAgendaFilterChips() {
  document.querySelectorAll('#agendaStatusFilters .chip-btn').forEach((b) => {
    b.classList.toggle(
      'active',
      b.getAttribute('data-filter') === state.agendaFilter
    );
  });
}

function routeFromHash() {
  let h = (location.hash || '').replace(/^#/, '').trim();
  // #config/equipe ou #pagamentos/config-pay
  let tab = null;
  if (h.includes('/')) {
    const [v, t] = h.split('/');
    h = v;
    tab = t;
  }
  // aliases de tab
  if (h === 'equipe') {
    h = 'config';
    tab = 'cfg-equipe';
  }
  if (h === 'loja') {
    h = 'config';
    tab = 'cfg-loja';
  }
  if (h === 'whatsapp') {
    h = 'config';
    tab = 'cfg-wa';
  }
  if (h === 'pix') {
    h = 'pagamentos';
    tab = 'pendentes';
  }
  if (h === 'fila') {
    setView('agenda', { skipHash: true, agendaFilter: 'fila' });
    if (tab) activateTab('config', tab);
    return;
  }
  if (h === 'tickets') {
    h = 'clientes';
    tab = 'tickets';
  }
  if (h === 'ratings') {
    h = 'clientes';
    tab = 'ratings';
  }
  const view = resolveView(h || 'dashboard');
  setView(view, { skipHash: true, tab: tab || undefined });
  if (tab) {
    if (view === 'config') activateTab('config', tab);
    if (view === 'pagamentos') activateTab('pay', tab);
    if (view === 'clientes') activateTab('clientes', tab);
  }
}

function tempChip(t) {
  if (t === 'hot') return '<span class="chip danger">🔥 Quente</span>';
  if (t === 'warm') return '<span class="chip warn">🟡 Morno</span>';
  return '<span class="chip">⚪ Frio</span>';
}

async function loadGrowth() {
  const data = await api('/api/growth/opportunities?all=1');
  const f = data.funnel || {};
  const box = document.getElementById('growthKpis');
  if (box) {
    box.innerHTML = `
    <div class="kpi"><div class="kpi-label">Novas</div><div class="kpi-value">${f.found || 0}</div></div>
    <div class="kpi blue"><div class="kpi-label">Quentes</div><div class="kpi-value">${f.hot || 0}</div></div>
    <div class="kpi warn"><div class="kpi-label">Respondidas</div><div class="kpi-value">${f.contacted || 0}</div></div>
    <div class="kpi ok"><div class="kpi-label">Fecharam</div><div class="kpi-value">${f.won || 0}</div></div>
  `;
  }

  const list = data.opportunities || [];
  const el = document.getElementById('listGrowth');
  if (!el) return;
  const open = list.filter((o) =>
    ['new', 'delivered', 'contacted'].includes(o.status)
  );
  el.innerHTML = open.length
    ? open
        .map((o) => {
          const c = o.classification || {};
          return `
      <div class="row">
        <div class="row-main">
          <div class="row-title">
            ${tempChip(c.temperature)}
            <span class="chip blue">${esc(c.nicheLabel || c.niche || '—')}</span>
            ${chipStatus(o.status)}
          </div>
          <div class="row-sub">
            “${esc((o.rawText || '').slice(0, 140))}${(o.rawText || '').length > 140 ? '…' : ''}”
            · ${esc(c.neighborhood || c.city || '—')}
          </div>
        </div>
        <div class="row-actions">
          <button class="btn btn-sm btn-primary" data-g="wa" data-id="${o.id}">Responder</button>
          <button class="btn btn-sm btn-success" data-g="won" data-id="${o.id}">Fechou</button>
          <button class="btn btn-sm btn-ghost" data-g="dismiss" data-id="${o.id}">Dispensar</button>
        </div>
      </div>`;
        })
        .join('')
    : empty(
        'Nenhuma oportunidade',
        'Cole um pedido acima para capturar a primeira.'
      );

  el.querySelectorAll('[data-g]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      const act = btn.getAttribute('data-g');
      try {
        if (act === 'wa') {
          const r = await api(`/api/growth/opportunities/${id}/contact`, {
            method: 'POST',
            body: '{}',
          });
          const url = r.whatsapp?.url;
          if (url) window.open(url, '_blank');
          toast('WhatsApp aberto com mensagem pronta');
          await loadGrowth();
        } else if (act === 'dismiss') {
          await api(`/api/growth/opportunities/${id}/dismiss`, {
            method: 'POST',
            body: '{}',
          });
          toast('Dispensada');
          await loadGrowth();
        } else if (act === 'won') {
          const rev = prompt('Valor da venda (R$), se souber:', '');
          await api(`/api/growth/opportunities/${id}/won`, {
            method: 'POST',
            body: JSON.stringify({
              revenue: rev ? Number(String(rev).replace(',', '.')) : undefined,
            }),
          });
          toast('Marcada como fechada');
          await loadGrowth();
        }
      } catch (e) {
        toast('Erro: ' + String(e.message).slice(0, 80));
      }
    });
  });
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
    state.shopConfig = cfg;
    const s = cfg.shop || {};
    document.getElementById('oShopName').value = s.name || '';
    document.getElementById('oShopPhone').value = s.phone || '';
    document.getElementById('oShopAddress').value = s.address || '';
    document.getElementById('oShopLat').value = s.lat ?? '';
    document.getElementById('oShopLng').value = s.lng ?? '';
    document.getElementById('oServices').value = (cfg.services || [])
      .map((x) => `${x.name} | ${x.price} | ${x.durationMin}`)
      .join('\n');
    const ob = document.getElementById('oBarbers');
    if (ob) {
      ob.value = (cfg.barbers || [])
        .map((x) => `${x.name} | ${x.nickname || ''} | ${x.specialty || ''}`)
        .join('\n');
    }
    const slot = document.getElementById('oSlotMin');
    if (slot) slot.value = s.slotMinutes || 30;
    renderDaysOpen(s.daysOpen || [1, 2, 3, 4, 5, 6]);
  } catch (e) {
    console.error(e);
  }
}

function renderDaysOpen(days) {
  const box = document.getElementById('oDaysOpen');
  if (!box) return;
  const set = new Set((days || []).map(Number));
  box.innerHTML = [1, 2, 3, 4, 5, 6, 0]
    .map(
      (d) => `
    <label class="day-chip">
      <input type="checkbox" data-day="${d}" ${set.has(d) ? 'checked' : ''}/>
      ${DAY_LABELS[d] || d}
    </label>`
    )
    .join('');
}

function readDaysOpen() {
  return [...document.querySelectorAll('#oDaysOpen [data-day]:checked')].map((el) =>
    Number(el.getAttribute('data-day'))
  );
}

function scheduleInputs(barber) {
  return [1, 2, 3, 4, 5, 6]
    .map((d) => {
      const win = (barber.schedule && barber.schedule[String(d)]) || null;
      const on = Boolean(win);
      const start = win ? win[0] : '09:00';
      const end = win ? win[1] : '18:00';
      return `
      <div class="sched-day" data-d="${d}">
        <label class="day-chip">
          <input type="checkbox" class="sch-on" ${on ? 'checked' : ''}/> ${DAY_LABELS[d]}
        </label>
        <input type="time" class="input sch-start" value="${esc(start)}" ${on ? '' : 'disabled'} />
        <span class="muted-sm">às</span>
        <input type="time" class="input sch-end" value="${esc(end)}" ${on ? '' : 'disabled'} />
      </div>`;
    })
    .join('');
}

function wireEquipeCards(box) {
  box.querySelectorAll('.sch-on').forEach((cb) => {
    cb.addEventListener('change', () => {
      const row = cb.closest('.sched-day');
      row.querySelectorAll('.sch-start, .sch-end').forEach((inp) => {
        inp.disabled = !cb.checked;
      });
    });
  });
  box.querySelectorAll('.btn-rm-barber').forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = Number(btn.getAttribute('data-idx'));
      if (!confirm('Remover este profissional?')) return;
      const list = collectBarbersFromEditor();
      list.splice(i, 1);
      state.shopConfig = state.shopConfig || {};
      state.shopConfig.barbers = list;
      renderEquipeFromState();
    });
  });
}

function barberCardHtml(b, i) {
  return `
    <div class="card barber-card" data-idx="${i}" style="border:1px solid var(--border);padding:12px;border-radius:12px">
      <div class="form-grid">
        <label class="field">Nome
          <input class="b-name" type="text" value="${esc(b.name || '')}" />
        </label>
        <label class="field">Apelido (WhatsApp)
          <input class="b-nick" type="text" value="${esc(b.nickname || '')}" />
        </label>
        <label class="field span-2">Especialidade
          <input class="b-spec" type="text" value="${esc(b.specialty || '')}" />
        </label>
        <input type="hidden" class="b-id" value="${esc(b.id || 'b' + (i + 1))}" />
      </div>
      <div class="muted-sm mt-2 mb-0">Horários da semana</div>
      <div class="sched-grid mt-2">${scheduleInputs(b)}</div>
      <button type="button" class="btn btn-sm btn-danger mt-2 btn-rm-barber" data-idx="${i}">Remover</button>
    </div>`;
}

async function loadEquipeEditor() {
  const cfg = await api('/api/shop');
  state.shopConfig = cfg;
  const s = cfg.shop || {};
  const slot = document.getElementById('oSlotMin');
  if (slot) slot.value = s.slotMinutes || 30;
  renderDaysOpen(s.daysOpen || [1, 2, 3, 4, 5, 6]);
  renderEquipeFromState();
}

function renderEquipeFromState() {
  const box = document.getElementById('equipeEditor');
  if (!box) return;
  const barbers = (state.shopConfig && state.shopConfig.barbers) || [];
  box.innerHTML = barbers.length
    ? barbers.map((b, i) => barberCardHtml(b, i)).join('')
    : empty('Sem profissionais', 'Clique em + Profissional');
  wireEquipeCards(box);
}

function collectBarbersFromEditor() {
  return [...document.querySelectorAll('#equipeEditor .barber-card')].map((card, i) => {
    const schedule = {};
    card.querySelectorAll('.sched-day').forEach((row) => {
      const d = row.getAttribute('data-d');
      const on = row.querySelector('.sch-on')?.checked;
      if (!on) return;
      const start = row.querySelector('.sch-start')?.value || '09:00';
      const end = row.querySelector('.sch-end')?.value || '18:00';
      schedule[d] = [start, end];
    });
    return {
      id: card.querySelector('.b-id')?.value || 'b' + (i + 1),
      name: card.querySelector('.b-name')?.value?.trim() || 'Profissional',
      nickname: card.querySelector('.b-nick')?.value?.trim() || '',
      specialty: card.querySelector('.b-spec')?.value?.trim() || 'Geral',
      schedule,
      onDuty: true,
    };
  });
}

async function saveEquipe() {
  const cfg = state.shopConfig || (await api('/api/shop'));
  const barbers = collectBarbersFromEditor();
  const shop = {
    ...(cfg.shop || {}),
    slotMinutes: Number(document.getElementById('oSlotMin')?.value) || 30,
    daysOpen: readDaysOpen().length ? readDaysOpen() : cfg.shop?.daysOpen,
  };
  await api('/api/shop', {
    method: 'POST',
    body: JSON.stringify({
      shop,
      barbers,
      services: cfg.services,
    }),
  });
  state.shopConfig = null;
  toast('Equipe e horários salvos ✓');
  await loadEquipeEditor();
  await refresh(true);
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
  if (state.refreshing) return;
  state.refreshing = true;
  try {
    const d = await api('/api/dashboard');
    state.dash = d;
    const st = document.getElementById('apiStatus');
    if (st) {
      st.className = 'status-pill online';
      st.innerHTML = '<span class="dot"></span> Online';
    }
    // dashboard / loja / ou full
    if (full || state.view === 'dashboard' || state.view === 'loja') {
      renderDashboard(d);
    }
    if (state.view === 'agenda') await renderAgenda({ silent: !full });
    if (state.view === 'mensagens') await renderMessages({ silent: !full });
    if (state.view === 'pagamentos') renderPix(d);
    if (state.view === 'clientes' && full) {
      await renderTickets().catch(() => {});
      await renderRatings().catch(() => {});
    }
    if (state.view === 'growth' && full) await loadGrowth().catch(() => {});
    if (state.view === 'config' && full) await loadWaStatus().catch(() => {});
  } catch (e) {
    const st = document.getElementById('apiStatus');
    if (st) {
      st.className = 'status-pill offline';
      st.innerHTML = '<span class="dot"></span> Offline';
    }
    console.error(e);
  } finally {
    state.refreshing = false;
  }
}

function setLiveUi(on) {
  state.live = on;
  const el = document.getElementById('liveStatus');
  if (!el) return;
  if (on) {
    el.className = 'status-pill live';
    el.innerHTML = '<span class="dot live-dot"></span> Ao vivo';
  } else {
    el.className = 'status-pill live-off';
    el.innerHTML = '<span class="dot live-dot"></span> Reconectando…';
  }
}

/** SSE — agenda/fila/dashboard atualizam no instante em que o JSON muda (WhatsApp ou painel) */
function connectLive() {
  if (typeof EventSource === 'undefined') {
    setLiveUi(false);
    return;
  }
  const url = `/api/events?token=${encodeURIComponent(TOKEN)}`;
  let es;
  try {
    es = new EventSource(url);
  } catch (e) {
    console.warn('SSE unavailable', e);
    setLiveUi(false);
    return;
  }

  let reconnectTimer = null;
  const bump = (kind) => {
    state.lastLiveAt = Date.now();
    setLiveUi(true);
    // debounce leve se vier rajada de eventos
    clearTimeout(connectLive._t);
    connectLive._t = setTimeout(() => {
      const heavy = ['tickets', 'growth', 'wa', 'payments'].includes(kind);
      refresh(heavy || state.view === 'dashboard').catch(console.error);
    }, 150);
  };

  es.addEventListener('hello', () => {
    setLiveUi(true);
    refresh(true).catch(console.error);
  });
  es.addEventListener('ping', () => setLiveUi(true));
  es.addEventListener('appointments', () => bump('appointments'));
  es.addEventListener('tickets', () => bump('tickets'));
  es.addEventListener('ops', () => bump('ops'));
  es.addEventListener('outbox', () => bump('outbox'));
  es.addEventListener('wa', () => bump('wa'));
  es.addEventListener('growth', () => bump('growth'));
  es.addEventListener('payments', () => bump('payments'));
  es.addEventListener('messages', () => {
    // mensagens: prioriza inbox
    if (state.view === 'mensagens') {
      renderMessages().catch(console.error);
    } else {
      renderMessages({ silent: true }).catch(() => {});
      bump('messages');
    }
  });
  es.addEventListener('shop', () => {
    state.shopConfig = null;
    if (state.view === 'config') {
      loadEquipeEditor().catch(() => {});
      loadShopForm().catch(() => {});
    }
    bump('shop');
  });
  es.addEventListener('change', (ev) => {
    try {
      const data = JSON.parse(ev.data || '{}');
      const kind = data.meta?.kind || 'change';
      if (kind === 'messages') {
        renderMessages({ silent: state.view !== 'mensagens' }).catch(() => {});
      }
      bump(kind);
    } catch {
      bump('change');
    }
  });
  es.onerror = () => {
    setLiveUi(false);
    try {
      es.close();
    } catch {
      /* ignore */
    }
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectLive, 2500);
  };
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
document.getElementById('btnRefresh')?.addEventListener('click', () => refresh());

// filtros da agenda
document.getElementById('agendaStatusFilters')?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-filter]');
  if (!btn) return;
  state.agendaFilter = btn.getAttribute('data-filter') || 'all';
  syncAgendaFilterChips();
  state.lastAgendaSig = '';
  renderAgenda().catch(console.error);
});

initTabs();
document.getElementById('btnGrowthRefresh')?.addEventListener('click', () => loadGrowth());
document.getElementById('btnGrowthPreview')?.addEventListener('click', async () => {
  const text = document.getElementById('growthRaw').value.trim();
  const box = document.getElementById('growthPreview');
  if (!text) {
    toast('Cole um texto');
    return;
  }
  box.textContent = 'Classificando…';
  try {
    const r = await api('/api/growth/classify', {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
    const c = r.classification || {};
    box.innerHTML = `
      ${tempChip(c.temperature)}
      <strong>${esc(c.nicheLabel)}</strong>
      · ${esc(c.neighborhood || c.city || '—')}
      · ${Math.round((c.confidence || 0) * 100)}%<br/>
      <span class="muted">${c.isRealDemand ? 'Demanda real' : 'Pode não ser demanda'}</span><br/>
      <em>${esc(c.suggestedReply || '')}</em>`;
  } catch (e) {
    box.textContent = String(e.message);
  }
});
document.getElementById('btnGrowthIngest')?.addEventListener('click', async () => {
  const text = document.getElementById('growthRaw').value.trim();
  const sourceUrl = document.getElementById('growthUrl').value.trim();
  if (!text) {
    toast('Cole o pedido');
    return;
  }
  try {
    const r = await api('/api/growth/ingest', {
      method: 'POST',
      body: JSON.stringify({ text, sourceUrl: sourceUrl || undefined }),
    });
    if (!r.ok) {
      toast(r.discarded || 'Não salvou');
      const c = r.preview || {};
      document.getElementById('growthPreview').textContent =
        c.discardReason || JSON.stringify(c);
      return;
    }
    toast('Oportunidade salva no inbox');
    document.getElementById('growthRaw').value = '';
    document.getElementById('growthUrl').value = '';
    await loadGrowth();
  } catch (e) {
    toast('Erro: ' + String(e.message).slice(0, 80));
  }
});
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
    const cfg = state.shopConfig || (await api('/api/shop'));
    await api('/api/setup/shop', {
      method: 'POST',
      body: JSON.stringify({
        shop: {
          name: document.getElementById('oShopName').value,
          phone: document.getElementById('oShopPhone').value,
          address: document.getElementById('oShopAddress').value,
          lat: Number(document.getElementById('oShopLat').value) || undefined,
          lng: Number(document.getElementById('oShopLng').value) || undefined,
          slotMinutes: Number(document.getElementById('oSlotMin')?.value) || cfg.shop?.slotMinutes,
          daysOpen: readDaysOpen().length ? readDaysOpen() : cfg.shop?.daysOpen,
        },
        services: parseServices(document.getElementById('oServices').value),
        // mantém equipe/horários do editor (não sobrescreve com texto vazio)
        barbers: cfg.barbers,
      }),
    });
    state.shopConfig = null;
    toast('Loja salva — configuração sua ✓');
    await loadSetup();
    await refresh();
  } catch (e) {
    toast('Erro: ' + String(e.message).slice(0, 80));
  }
});

document.getElementById('btnSaveEquipe')?.addEventListener('click', () => {
  saveEquipe().catch((e) => toast('Erro: ' + String(e.message).slice(0, 80)));
});

document.getElementById('btnAddBarber')?.addEventListener('click', () => {
  if (!state.shopConfig) state.shopConfig = { barbers: [] };
  const list = collectBarbersFromEditor();
  list.push({
    id: 'b' + Date.now().toString(36),
    name: 'Novo profissional',
    nickname: 'Pro',
    specialty: 'Geral',
    schedule: {
      1: ['09:00', '18:00'],
      2: ['09:00', '18:00'],
      3: ['09:00', '18:00'],
      4: ['09:00', '18:00'],
      5: ['09:00', '18:00'],
      6: ['09:00', '14:00'],
    },
    onDuty: true,
  });
  state.shopConfig.barbers = list;
  renderEquipeFromState();
});

document.getElementById('btnMsgRefresh')?.addEventListener('click', () => {
  state.lastMsgSig = '';
  renderMessages().catch(console.error);
});

document.querySelectorAll('[data-view-jump]').forEach((b) => {
  b.addEventListener('click', () => {
    const target = b.getAttribute('data-view-jump');
    if (target === 'equipe') setView('config', { tab: 'cfg-equipe' });
    else if (target === 'loja') setView('config', { tab: 'cfg-loja' });
    else if (target === 'whatsapp') setView('config', { tab: 'cfg-wa' });
    else if (target === 'pix') setView('pagamentos', { tab: 'pendentes' });
    else if (target === 'fila') setView('agenda', { agendaFilter: 'fila' });
    else setView(target);
  });
});

// day picker da agenda → recarrega na hora
document.getElementById('dayPicker')?.addEventListener('change', () => {
  state.lastAgendaSig = '';
  renderAgenda().catch(console.error);
});
document.getElementById('agendaBarberFilter')?.addEventListener('change', () => {
  state.lastAgendaSig = '';
  renderAgenda().catch(console.error);
});

document.getElementById('btnRefreshTop')?.addEventListener('click', () =>
  refresh(true)
);

window.addEventListener('hashchange', () => routeFromHash());

tickClock();
setInterval(tickClock, 20000);
refresh()
  .then(() => loadSetup())
  .then(() => routeFromHash());
// fallback se SSE cair: poll mais rápido na agenda (2s) e geral (8s)
setInterval(() => {
  if (!state.live) refresh(false).catch(() => {});
}, 8000);
setInterval(() => {
  if (state.view === 'agenda') renderAgenda({ silent: true }).catch(() => {});
  else if (state.view === 'mensagens')
    renderMessages({ silent: true }).catch(() => {});
  else if (!state.live) refresh(false).catch(() => {});
}, 2000);
setInterval(() => {
  if (state.view === 'whatsapp') loadWaStatus().catch(() => {});
}, 5000);
// mensagens sempre polled leve (mesmo fora da aba) se SSE ok a cada 4s só se view mensagens
setInterval(() => {
  if (state.view === 'mensagens' || !state.live) {
    renderMessages({ silent: true }).catch(() => {});
  }
}, 4000);

connectLive();

// se veio com ?setup=1, abre loja
if (new URL(location.href).searchParams.get('setup') === '1') {
  setTimeout(() => setView('loja'), 400);
}
