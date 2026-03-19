// ── Tournai Expert Immo — Admin JS ────────────────────────────────

const API = '/api/admin';

// ── Auth helpers ─────────────────────────────────────────────────

function token() { return sessionStorage.getItem('tei_token'); }

function logout() {
  sessionStorage.removeItem('tei_token');
  sessionStorage.removeItem('tei_user');
  window.location.replace('index.html');
}

async function apiFetch(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token()}`,
      ...(opts.headers || {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401) { logout(); return null; }
  return res.json();
}

// ── Date helpers ─────────────────────────────────────────────────

function dateFr(s) {
  if (!s) return '—';
  return new Date(s + 'T00:00:00').toLocaleDateString('fr-BE', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

function isoToday() {
  return new Date().toISOString().split('T')[0];
}

// ── Status badge ─────────────────────────────────────────────────

const STATUS_LABELS = {
  pending_payment:       'Paiement attendu',
  awaiting_confirmation: 'À confirmer',
  confirmed:             'Confirmé',
  rejected:              'Refusé',
  cancelled:             'Annulé',
  expired:               'Expiré',
  pending:               'En attente',
};

function badge(status) {
  const label = STATUS_LABELS[status] || status;
  return `<span class="badge badge-${status}">${label}</span>`;
}

// ── Navigation ───────────────────────────────────────────────────

const VIEWS = ['dashboard', 'calendar', 'appointments', 'clients', 'blocked', 'prices'];

function showView(id) {
  VIEWS.forEach(v => {
    document.getElementById(`view-${v}`).classList.toggle('active', v === id);
    document.querySelector(`[data-view="${v}"]`).classList.toggle('active', v === id);
  });
  document.getElementById('topbar-title').textContent = {
    dashboard:    'Tableau de bord',
    calendar:     'Calendrier',
    appointments: 'Rendez-vous',
    clients:      'Clients',
    blocked:      'Blocages',
    prices:       'Tarifs',
  }[id];

  if (id === 'dashboard')    loadDashboard();
  if (id === 'calendar')     renderCalendar();
  if (id === 'appointments') loadAppointments();
  if (id === 'clients')      loadClients();
  if (id === 'blocked')      loadBlocked();
  if (id === 'prices')       loadPrices();
}

// ── Dashboard ────────────────────────────────────────────────────

async function loadDashboard() {
  const data = await apiFetch(`${API}/stats`);
  if (!data) return;

  const { stats, recent_pending } = data;

  document.getElementById('stat-total').textContent       = stats.total;
  document.getElementById('stat-confirmed').textContent   = stats.confirmed;
  document.getElementById('stat-pending').textContent     = stats.pending;
  document.getElementById('stat-revenue').textContent     = `${(stats.revenue_confirmed || 0).toFixed(0)} €`;
  document.getElementById('stat-pending-rev').textContent = `${(stats.revenue_pending  || 0).toFixed(0)} €`;

  // Badge de notification dans la nav
  const badge_el = document.getElementById('badge-pending');
  if (stats.pending > 0) {
    badge_el.textContent = stats.pending;
    badge_el.hidden = false;
  } else {
    badge_el.hidden = true;
  }

  // Liste des derniers RDV en attente
  const tbody = document.getElementById('recent-pending-body');
  if (!recent_pending.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">Aucun rendez-vous en attente</td></tr>';
  } else {
    tbody.innerHTML = recent_pending.map(a => `
      <tr>
        <td>${dateFr(a.date)} ${a.slot}</td>
        <td>${a.prenom} ${a.nom}</td>
        <td>${a.service_label}</td>
        <td>${badge(a.status)}</td>
        <td><button class="btn btn-sm btn-ghost" onclick="openModal(${a.id})">Voir</button></td>
      </tr>`).join('');
  }
}

// ── Calendar ─────────────────────────────────────────────────────

let calYear, calMonth;

function renderCalendar() {
  const now = new Date();
  if (!calYear) { calYear = now.getFullYear(); calMonth = now.getMonth(); }
  drawCalendar();
}

async function drawCalendar() {
  // Charger les RDV du mois
  const firstDay  = `${calYear}-${String(calMonth + 1).padStart(2,'0')}-01`;
  const lastDay   = new Date(calYear, calMonth + 1, 0).toISOString().split('T')[0];
  const data      = await apiFetch(`${API}/appointments?from=${firstDay}&to=${lastDay}&limit=200`);
  const appts     = data?.appointments || [];

  // Regrouper par date
  const byDate = {};
  appts.forEach(a => {
    if (!byDate[a.date]) byDate[a.date] = [];
    byDate[a.date].push(a);
  });

  const monthNames = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  document.getElementById('cal-month-label').textContent = `${monthNames[calMonth]} ${calYear}`;

  const grid = document.getElementById('cal-grid-days');
  grid.innerHTML = '';

  // Calcul du premier jour (lundi = 0)
  const firstOfMonth = new Date(calYear, calMonth, 1);
  let startDow = firstOfMonth.getDay(); // 0=dim
  startDow = startDow === 0 ? 6 : startDow - 1; // convertir en lun=0

  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const daysInPrev  = new Date(calYear, calMonth, 0).getDate();
  const todayStr    = isoToday();

  // Cases avant le 1er
  for (let i = 0; i < startDow; i++) {
    const d = daysInPrev - startDow + 1 + i;
    grid.insertAdjacentHTML('beforeend', `<div class="cal-day other-month"><div class="cal-day-num">${d}</div></div>`);
  }

  // Jours du mois
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday = dateStr === todayStr;
    const dayAppts = byDate[dateStr] || [];

    const dots = dayAppts.slice(0, 6).map(a => {
      const cls = ['confirmed','awaiting_confirmation'].includes(a.status) ? 'confirmed'
                : ['pending_payment','pending'].includes(a.status) ? 'pending' : 'other';
      return `<span class="cal-dot cal-dot-${cls}"></span>`;
    }).join('');

    grid.insertAdjacentHTML('beforeend', `
      <div class="cal-day${isToday ? ' today' : ''}" onclick="selectCalDay('${dateStr}')">
        <div class="cal-day-num">${d}</div>
        ${dots}
      </div>`);
  }

  // Cases après le dernier
  const totalCells = startDow + daysInMonth;
  const remaining  = (7 - (totalCells % 7)) % 7;
  for (let d = 1; d <= remaining; d++) {
    grid.insertAdjacentHTML('beforeend', `<div class="cal-day other-month"><div class="cal-day-num">${d}</div></div>`);
  }
}

async function selectCalDay(dateStr) {
  // Marquer le jour sélectionné
  document.querySelectorAll('.cal-day.selected').forEach(el => el.classList.remove('selected'));
  const cells = document.querySelectorAll('.cal-day:not(.other-month)');
  const d = parseInt(dateStr.split('-')[2], 10);
  if (cells[d - 1]) cells[d - 1].classList.add('selected');

  const data = await apiFetch(`${API}/appointments?from=${dateStr}&to=${dateStr}&limit=20`);
  const appts = data?.appointments || [];
  const detail = document.getElementById('cal-day-detail');
  const body   = document.getElementById('cal-day-body');

  detail.hidden = false;
  document.getElementById('cal-day-title').textContent = dateFr(dateStr);

  if (!appts.length) {
    body.innerHTML = '<p style="color:var(--text3);font-family:var(--font-mono);font-size:.7rem;">Aucun rendez-vous ce jour.</p>';
  } else {
    body.innerHTML = appts.map(a => `
      <div style="display:flex;align-items:center;gap:.75rem;padding:.5rem 0;border-bottom:1px solid var(--border2)">
        <span style="font-family:var(--font-mono);font-size:.75rem;color:var(--accent);flex-shrink:0">${a.slot}</span>
        <span style="flex:1;font-size:.9rem">${a.prenom} ${a.nom} — ${a.service_label}</span>
        ${badge(a.status)}
        <button class="btn btn-sm btn-ghost" onclick="openModal(${a.id})">Voir</button>
      </div>`).join('');
  }
}

function calPrev() { calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } drawCalendar(); }
function calNext() { calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } drawCalendar(); }

// ── Appointments ─────────────────────────────────────────────────

let apptOffset = 0;
const APPT_LIMIT = 30;

async function loadAppointments(reset = true) {
  if (reset) apptOffset = 0;
  const status  = document.getElementById('filter-status')?.value || '';
  const search  = document.getElementById('filter-search')?.value || '';
  const from    = document.getElementById('filter-from')?.value || '';
  const to      = document.getElementById('filter-to')?.value || '';

  const params = new URLSearchParams({ limit: APPT_LIMIT, offset: apptOffset });
  if (status) params.set('status', status);
  if (search) params.set('search', search);
  if (from)   params.set('from', from);
  if (to)     params.set('to', to);

  const data = await apiFetch(`${API}/appointments?${params}`);
  const appts = data?.appointments || [];
  const tbody = document.getElementById('appt-tbody');

  if (!appts.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7">Aucun résultat</td></tr>';
  } else {
    tbody.innerHTML = appts.map(a => `
      <tr>
        <td class="mono">${dateFr(a.date)}</td>
        <td class="mono">${a.slot}</td>
        <td>${a.prenom} ${a.nom}</td>
        <td>${a.service_label}</td>
        <td>${badge(a.status)}</td>
        <td class="mono">${a.amount_eur ? a.amount_eur.toFixed(0) + ' €' : '—'}</td>
        <td><button class="btn btn-sm btn-ghost" onclick="openModal(${a.id})">Voir</button></td>
      </tr>`).join('');
  }

  document.getElementById('appt-prev').disabled = apptOffset === 0;
  document.getElementById('appt-next').disabled = appts.length < APPT_LIMIT;
}

// ── Appointment modal ─────────────────────────────────────────────

async function openModal(id) {
  const data = await apiFetch(`${API}/appointments/${id}`);
  if (!data) return;
  const a = data.appointment;

  const extras = (() => { try { return JSON.parse(a.extras || '[]'); } catch { return []; } })();

  document.getElementById('modal-token').textContent  = a.token;
  document.getElementById('modal-content').innerHTML  = `
    <div class="detail-row"><div class="detail-label">Statut</div><div>${badge(a.status)}</div></div>
    <div class="detail-row"><div class="detail-label">Date</div><div>${dateFr(a.date)} à ${a.slot} (${a.duration} min)</div></div>
    <div class="detail-row"><div class="detail-label">Prestation</div><div>${a.service_label}</div></div>
    <div class="detail-row"><div class="detail-label">Bien</div><div>${a.property_label}${extras.length ? '<br><small style="color:var(--text2)">'+extras.join(', ')+'</small>' : ''}</div></div>
    <div class="detail-row"><div class="detail-label">Adresse</div><div>${a.adresse_bien}</div></div>
    <div class="detail-row"><div class="detail-label">Client</div><div>${a.prenom} ${a.nom}</div></div>
    <div class="detail-row"><div class="detail-label">Email</div><div><a href="mailto:${a.email}" style="color:var(--accent)">${a.email}</a></div></div>
    <div class="detail-row"><div class="detail-label">Tél.</div><div>${a.telephone}</div></div>
    <div class="detail-row"><div class="detail-label">Montant</div><div>${a.amount_eur ? a.amount_eur.toFixed(2) + ' €' : '—'}</div></div>
    ${a.mollie_payment_id ? `<div class="detail-row"><div class="detail-label">Mollie ID</div><div class="mono">${a.mollie_payment_id}</div></div>` : ''}
    <div class="detail-row"><div class="detail-label">Créé le</div><div class="mono">${new Date(a.created_at).toLocaleString('fr-BE')}</div></div>
  `;

  // Boutons d'action selon le statut
  const footer = document.getElementById('modal-footer-actions');
  footer.innerHTML = '';

  const canConfirm = a.status === 'awaiting_confirmation';
  const canReject  = ['awaiting_confirmation', 'pending'].includes(a.status);
  const canCancel  = ['confirmed', 'awaiting_confirmation'].includes(a.status);

  if (canConfirm) footer.insertAdjacentHTML('beforeend',
    `<button class="btn btn-confirm" onclick="apptAction(${a.id},'confirm')">✓ Confirmer</button>`);
  if (canReject) footer.insertAdjacentHTML('beforeend',
    `<button class="btn btn-danger" onclick="apptAction(${a.id},'reject')">✗ Refuser</button>`);
  if (canCancel) footer.insertAdjacentHTML('beforeend',
    `<button class="btn btn-warn" onclick="apptAction(${a.id},'cancel')">Annuler</button>`);

  document.getElementById('modal-appt').hidden = false;
}

function closeModal() { document.getElementById('modal-appt').hidden = true; }

async function apptAction(id, action) {
  const labels = { confirm: 'Confirmer ce rendez-vous ?', reject: 'Refuser ce rendez-vous ?', cancel: 'Annuler ce rendez-vous ?' };
  if (!confirm(labels[action])) return;
  const data = await apiFetch(`${API}/appointments/${id}`, { method: 'PATCH', body: { action } });
  if (data?.appointment) {
    closeModal();
    loadAppointments();
    loadDashboard();
  }
}

// ── Clients ──────────────────────────────────────────────────────

let clientOffset = 0;
const CLIENT_LIMIT = 30;

async function loadClients(reset = true) {
  if (reset) clientOffset = 0;
  const search = document.getElementById('client-search')?.value || '';
  const params = new URLSearchParams({ limit: CLIENT_LIMIT, offset: clientOffset });
  if (search) params.set('search', search);

  const data    = await apiFetch(`${API}/clients?${params}`);
  const clients = data?.clients || [];
  const tbody   = document.getElementById('clients-tbody');

  if (!clients.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">Aucun client</td></tr>';
  } else {
    tbody.innerHTML = clients.map(c => `
      <tr onclick="openClient(${c.id})" style="cursor:pointer">
        <td>${c.prenom} ${c.nom}</td>
        <td><a href="mailto:${c.email}" style="color:var(--accent)" onclick="event.stopPropagation()">${c.email}</a></td>
        <td class="mono">${c.telephone || '—'}</td>
        <td class="mono" style="text-align:center">${c.total_rdv || 0}</td>
        <td class="mono">${c.last_date ? dateFr(c.last_date) : '—'}</td>
      </tr>`).join('');
  }
}

async function openClient(id) {
  const data = await apiFetch(`${API}/clients/${id}`);
  if (!data) return;
  const { client, history } = data;

  document.getElementById('client-detail').hidden = false;
  document.getElementById('client-name').textContent = `${client.prenom} ${client.nom}`;
  document.getElementById('client-meta').textContent =
    `${client.email}  ·  ${client.telephone || '—'}  ·  Client depuis ${new Date(client.created_at).toLocaleDateString('fr-BE', { month: 'long', year: 'numeric' })}`;

  document.getElementById('client-notes').value = client.notes || '';
  document.getElementById('client-notes').dataset.id = client.id;

  const histDiv = document.getElementById('client-history');
  if (!history.length) {
    histDiv.innerHTML = '<p style="color:var(--text3);font-family:var(--font-mono);font-size:.7rem;">Aucun historique</p>';
  } else {
    histDiv.innerHTML = history.map(a => `
      <div style="display:flex;align-items:center;gap:.75rem;padding:.5rem 0;border-bottom:1px solid var(--border2)">
        <span class="mono" style="font-size:.75rem;color:var(--accent);flex-shrink:0">${dateFr(a.date)}</span>
        <span style="flex:1;font-size:.88rem">${a.service_label}</span>
        ${badge(a.status)}
        <span class="mono" style="font-size:.75rem">${a.amount_eur ? a.amount_eur.toFixed(0)+' €' : ''}</span>
      </div>`).join('');
  }
}

async function saveNotes() {
  const el = document.getElementById('client-notes');
  const id = el.dataset.id;
  await apiFetch(`${API}/clients/${id}`, { method: 'PATCH', body: { notes: el.value } });
  const btn = document.getElementById('notes-save-btn');
  btn.textContent = '✓ Enregistré';
  setTimeout(() => { btn.textContent = 'Enregistrer'; }, 2000);
}

// ── Blocked slots ─────────────────────────────────────────────────

async function loadBlocked() {
  const data = await apiFetch(`${API}/blocked-slots`);
  const rows = data?.blocked_slots || [];
  const tbody = document.getElementById('blocked-tbody');

  if (!rows.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="4">Aucun blocage</td></tr>';
  } else {
    tbody.innerHTML = rows.map(b => `
      <tr>
        <td class="mono">${dateFr(b.date)}</td>
        <td class="mono">${b.slot || 'Journée entière'}</td>
        <td>${b.reason || '—'}</td>
        <td><button class="btn btn-sm btn-danger" onclick="deleteBlocked(${b.id})">Supprimer</button></td>
      </tr>`).join('');
  }
}

async function addBlocked(e) {
  e.preventDefault();
  const date   = document.getElementById('block-date').value;
  const slot   = document.getElementById('block-slot').value;
  const reason = document.getElementById('block-reason').value;

  if (!date) return;
  await apiFetch(`${API}/blocked-slots`, {
    method: 'POST',
    body: { date, slot: slot || null, reason: reason || null },
  });
  document.getElementById('block-form-el').reset();
  loadBlocked();
}

async function deleteBlocked(id) {
  if (!confirm('Supprimer ce blocage ?')) return;
  await apiFetch(`${API}/blocked-slots/${id}`, { method: 'DELETE' });
  loadBlocked();
}

// ── Prices ───────────────────────────────────────────────────────

const SERVICE_LABELS = {
  avant_achat:    'Expertise avant achat',
  litige:         'Expertise litige',
  valeur_locative:'Valeur locative',
  assurance:      'Assurance',
  entree:         'État des lieux entrée',
  sortie:         'État des lieux sortie',
  travaux:        'État des lieux travaux',
  constat:        'Constat contradictoire',
};

const PROPERTY_LABELS = {
  studio:    'Studio',
  appt_1ch:  'Appt 1ch',
  appt_2ch:  'Appt 2ch',
  appt_3ch:  'Appt 3ch',
  maison_3ch:'Maison ≤3ch',
  maison_4ch:'Maison 4ch',
  devis:     'Sur devis',
};

let pricesData = [];

async function loadPrices() {
  const data = await apiFetch(`${API}/prices`);
  pricesData = data?.prices || [];
  renderPrices();
}

function renderPrices() {
  const services = ['avant_achat', 'litige', 'valeur_locative', 'assurance', 'entree', 'sortie', 'travaux', 'constat'];
  const properties = Object.keys(PROPERTY_LABELS);

  const tbody = document.getElementById('prices-tbody');
  tbody.innerHTML = '';

  const groups = [
    { label: 'Expertise (30 min)', services: services.slice(0, 4) },
    { label: 'État des lieux (90 min)', services: services.slice(4) },
  ];

  groups.forEach(group => {
    tbody.insertAdjacentHTML('beforeend',
      `<tr class="price-section-header"><td colspan="${3 + properties.length}">${group.label}</td></tr>`);

    group.services.forEach(svc => {
      const row = document.createElement('tr');
      const svcLabel = SERVICE_LABELS[svc] || svc;

      row.innerHTML = `<td style="font-size:.85rem">${svcLabel}</td>` +
        properties.map(prop => {
          const price = pricesData.find(p => p.service === svc && p.property === prop);
          const val = price ? price.base_eur : 0;
          return `<td><input class="price-input" type="number" min="0" step="1" value="${val}" data-service="${svc}" data-property="${prop}" data-field="base_eur"></td>`;
        }).join('') +
        `<td><input class="price-input" type="number" min="0" step="1" value="${pricesData.find(p => p.service === svc && p.property === 'studio')?.extra_meuble || 0}" data-service="${svc}" data-property="*" data-field="extra_meuble" style="border-color:var(--warn)" title="Supplément meublé"></td>` +
        `<td><input class="price-input" type="number" min="0" step="1" value="${pricesData.find(p => p.service === svc && p.property === 'studio')?.extra_piece || 0}" data-service="${svc}" data-property="*" data-field="extra_piece" style="border-color:var(--warn)" title="Supplément pièce sup."></td>`;

      tbody.appendChild(row);
    });
  });
}

async function savePrices() {
  const inputs = document.querySelectorAll('.price-input');
  const map = {};

  inputs.forEach(inp => {
    const { service, property, field } = inp.dataset;
    if (property === '*') return; // handled separately
    const k = `${service}__${property}`;
    if (!map[k]) map[k] = { service, property, base_eur: 0, extra_meuble: 0, extra_piece: 0 };
    map[k][field] = parseFloat(inp.value) || 0;
  });

  // extras_meuble / extra_piece : apply to all properties of the service
  inputs.forEach(inp => {
    const { service, property, field } = inp.dataset;
    if (property !== '*') return;
    Object.keys(map).filter(k => k.startsWith(service + '__')).forEach(k => {
      map[k][field] = parseFloat(inp.value) || 0;
    });
  });

  const prices = Object.values(map);
  const res = await apiFetch(`${API}/prices`, { method: 'PUT', body: { prices } });
  if (res?.prices) {
    pricesData = res.prices;
    const btn = document.getElementById('prices-save-btn');
    btn.textContent = '✓ Enregistré';
    setTimeout(() => { btn.textContent = 'Enregistrer les tarifs'; }, 2000);
  }
}

// ── Init ─────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  if (!token()) {
    window.location.replace('index.html');
    return;
  }

  document.getElementById('sidebar-user').textContent = sessionStorage.getItem('tei_user') || 'admin';
  document.getElementById('logout-btn').addEventListener('click', logout);

  // Nav
  document.querySelectorAll('[data-view]').forEach(btn => {
    btn.addEventListener('click', () => showView(btn.dataset.view));
  });

  // Appointment filters
  ['filter-status', 'filter-from', 'filter-to'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => loadAppointments());
  });
  document.getElementById('filter-search')?.addEventListener('input', debounce(() => loadAppointments(), 350));

  // Client search
  document.getElementById('client-search')?.addEventListener('input', debounce(() => loadClients(), 350));

  // Pagination
  document.getElementById('appt-prev')?.addEventListener('click', () => { apptOffset = Math.max(0, apptOffset - APPT_LIMIT); loadAppointments(false); });
  document.getElementById('appt-next')?.addEventListener('click', () => { apptOffset += APPT_LIMIT; loadAppointments(false); });

  // Calendar nav
  document.getElementById('cal-prev')?.addEventListener('click', calPrev);
  document.getElementById('cal-next')?.addEventListener('click', calNext);

  // Block form
  document.getElementById('block-form-el')?.addEventListener('submit', addBlocked);

  // Prices save
  document.getElementById('prices-save-btn')?.addEventListener('click', savePrices);

  // Notes save
  document.getElementById('notes-save-btn')?.addEventListener('click', saveNotes);

  // Modal close
  document.getElementById('modal-close')?.addEventListener('click', closeModal);
  document.getElementById('modal-appt')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-appt')) closeModal();
  });

  // Start on dashboard
  showView('dashboard');
});

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
