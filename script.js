/* ============================================================
   RANCHO APARTE — CRM · script.js
   100% Vanilla JS + LocalStorage. Sin dependencias.
   ------------------------------------------------------------
   Secciones:
     1. Configuración base y constantes
     2. Almacenamiento (LocalStorage)
     3. Utilidades (fechas, dinero, ids, fechas AR)
     4. Lógica de canchas y solapamientos
     5. UI helpers (toast, modal)
     6. Router + navegación
     7. Vistas: Dashboard, Reservas, Calendario, Clientes,
        Finanzas, Eventos, Reportes, Configuración
     8. Formularios (reserva, evento, cliente) + validación
     9. WhatsApp
    10. Gráficos (canvas)
    11. Inicialización + datos de ejemplo
   ============================================================ */

'use strict';

/* ============================================================
   1. CONFIGURACIÓN BASE
   ============================================================ */
const APP = 'rancho_aparte_crm';

const COURTS = [
  { id: 'c5a', name: 'Cancha 5A', short: '5A', type: 'F5' },
  { id: 'c5b', name: 'Cancha 5B', short: '5B', type: 'F5' },
  { id: 'c5c', name: 'Cancha 5C', short: '5C', type: 'F5' },
  { id: 'c7',  name: 'Cancha 7',  short: '7',  type: 'F7' },
  { id: 'c8',  name: 'Cancha 8 (combinada)', short: '8', type: 'F8' },
];

// Qué espacios físicos ocupa cada "cancha" reservable.
// La Cancha 8 surge de combinar las tres de fútbol 5.
const OCCUPIES = {
  c5a: ['c5a'],
  c5b: ['c5b'],
  c5c: ['c5c'],
  c7:  ['c7'],
  c8:  ['c5a', 'c5b', 'c5c'],
};

const ESTADOS = ['Confirmada', 'Pendiente', 'Cancelada', 'Finalizada'];
const ESTADO_CLASS = { Confirmada: 'b-conf', Pendiente: 'b-pend', Cancelada: 'b-canc', Finalizada: 'b-fin' };
const ESTADO_EV = { Confirmada: 's-conf', Pendiente: 's-pend', Cancelada: 's-canc', Finalizada: 's-fin' };

const TIPOS_EVENTO = ['Cumpleaños', 'Torneo', 'Evento corporativo', 'Reserva especial'];

const DEFAULT_CONFIG = {
  nombre: 'Rancho Aparte',
  direccion: 'C. José María Paz 548, B1714 Ituzaingó, Buenos Aires',
  whatsapp: '+54 9 11 2314-9842',
  horaApertura: 9,
  horaCierre: 24,
  precios: { F5: 24000, F7: 32000, F8: 60000 },
};

/* ============================================================
   2. ALMACENAMIENTO
   ============================================================ */
const Store = {
  read(key, fallback) {
    try {
      const raw = localStorage.getItem(`${APP}_${key}`);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  },
  write(key, value) {
    localStorage.setItem(`${APP}_${key}`, JSON.stringify(value));
  },
};

const db = {
  get reservas()  { return Store.read('reservas', []); },
  set reservas(v) { Store.write('reservas', v); },
  get clientes()  { return Store.read('clientes', []); },
  set clientes(v) { Store.write('clientes', v); },
  get eventos()   { return Store.read('eventos', []); },
  set eventos(v)  { Store.write('eventos', v); },
  get config()    { return Object.assign({}, DEFAULT_CONFIG, Store.read('config', {})); },
  set config(v)   { Store.write('config', v); },
};

/* ============================================================
   3. UTILIDADES
   ============================================================ */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const money = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR');

const pad = (n) => String(n).padStart(2, '0');

const DIAS   = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DIAS_S = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MESES  = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// YYYY-MM-DD del objeto Date (local, no UTC)
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayISO = () => isoDate(new Date());

// Convierte 'YYYY-MM-DD' a Date local
const parseDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };

const fmtFecha = (iso) => {
  const d = parseDate(iso);
  return `${DIAS_S[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()].slice(0,3)}`;
};
const fmtFechaLarga = (iso) => {
  const d = parseDate(iso);
  return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
};

// 'HH:MM' -> minutos desde medianoche
const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const minToHHMM = (min) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;

const courtById = (id) => COURTS.find(c => c.id === id);
const courtClass = (type) => type === 'F7' ? 'f7' : type === 'F8' ? 'f8' : '';

// Normaliza teléfono para wa.me (solo dígitos, con código país AR)
const waNumber = (tel) => {
  let n = String(tel || '').replace(/\D/g, '');
  if (!n) return '';
  if (n.startsWith('54')) return n;
  if (n.startsWith('0')) n = n.slice(1);
  if (n.startsWith('15')) n = n.slice(2);
  return '549' + n; // móvil Argentina
};

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

/* ============================================================
   4. LÓGICA DE CANCHAS Y SOLAPAMIENTOS
   ============================================================ */
function reservaInterval(r) {
  const start = toMin(r.hora);
  const end = start + Math.round(Number(r.duracion) * 60);
  return { start, end };
}

// Busca un conflicto de horario para una reserva dada. Ignora canceladas y la propia (excludeId).
function findConflict(reserva, excludeId) {
  const occ = OCCUPIES[reserva.courtId] || [reserva.courtId];
  const { start, end } = reservaInterval(reserva);
  return db.reservas.find(r => {
    if (r.id === excludeId) return false;
    if (r.estado === 'Cancelada') return false;
    if (r.fecha !== reserva.fecha) return false;
    const otherOcc = OCCUPIES[r.courtId] || [r.courtId];
    if (!occ.some(o => otherOcc.includes(o))) return false; // no comparten espacio físico
    const oi = reservaInterval(r);
    return start < oi.end && oi.start < end; // solapamiento temporal
  }) || null;
}

// Reservas activas que ocupan un espacio físico concreto en un rango horario (para el calendario)
function reservasEnFecha(iso) {
  return db.reservas
    .filter(r => r.fecha === iso && r.estado !== 'Cancelada')
    .sort((a, b) => toMin(a.hora) - toMin(b.hora));
}

/* ============================================================
   5. UI HELPERS — TOAST & MODAL
   ============================================================ */
function toast(msg, type = 'ok') {
  const wrap = document.getElementById('toastWrap');
  const el = document.createElement('div');
  const ico = type === 'ok' ? '✓' : type === 'err' ? '!' : 'i';
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="ti">${ico}</span><span>${esc(msg)}</span>`;
  wrap.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 2600);
  setTimeout(() => el.remove(), 2950);
}

const modalHost = document.getElementById('modalHost');
const modalCard = document.getElementById('modalCard');

function openModal(html) {
  modalCard.innerHTML = html;
  modalHost.hidden = false;
  document.body.style.overflow = 'hidden';
  const firstInput = modalCard.querySelector('input,select,textarea');
  if (firstInput) setTimeout(() => firstInput.focus(), 60);
}
function closeModal() {
  modalHost.hidden = true;
  modalCard.innerHTML = '';
  document.body.style.overflow = '';
}
document.getElementById('modalBackdrop').addEventListener('click', closeModal);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modalHost.hidden) closeModal(); });

// Confirmación reutilizable
function confirmAction({ title, msg, okText = 'Confirmar', danger = false, onOk }) {
  openModal(`
    <div class="modal-head"><div><h3>${esc(title)}</h3></div>
      <button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body"><p style="color:var(--txt-soft);font-size:14.5px;line-height:1.5">${esc(msg)}</p></div>
    <div class="modal-foot">
      <button class="btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="${danger ? 'btn-danger' : 'btn-primary'}" id="confirmOk">${esc(okText)}</button>
    </div>`);
  document.getElementById('confirmOk').addEventListener('click', () => { onOk(); closeModal(); });
}

/* ============================================================
   6. ROUTER + NAVEGACIÓN
   ============================================================ */
const VIEWS = {
  dashboard:  { title: 'Dashboard',     render: renderDashboard },
  reservas:   { title: 'Reservas',      render: renderReservas },
  calendario: { title: 'Calendario',    render: renderCalendario },
  clientes:   { title: 'Clientes',      render: renderClientes },
  finanzas:   { title: 'Finanzas',      render: renderFinanzas },
  eventos:    { title: 'Eventos',       render: renderEventos },
  reportes:   { title: 'Reportes',      render: renderReportes },
  config:     { title: 'Configuración', render: renderConfig },
};

let currentView = 'dashboard';

function navigate(view) {
  if (!VIEWS[view]) view = 'dashboard';
  currentView = view;
  document.getElementById('main').innerHTML = '';
  VIEWS[view].render();
  document.getElementById('topbarTitle').textContent = VIEWS[view].title;

  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  document.querySelectorAll('.bn-item[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  closeSidebar();
  document.getElementById('main').scrollTo?.(0, 0);
  window.scrollTo(0, 0);
}

// Sidebar mobile
const sidebar = document.getElementById('sidebar');
const scrim = document.getElementById('scrim');
function openSidebar()  { sidebar.classList.add('open'); scrim.classList.add('show'); }
function closeSidebar() { sidebar.classList.remove('open'); scrim.classList.remove('show'); }
document.getElementById('hambBtn').addEventListener('click', openSidebar);
scrim.addEventListener('click', closeSidebar);

document.getElementById('nav').addEventListener('click', e => {
  const b = e.target.closest('.nav-item'); if (b) navigate(b.dataset.view);
});
document.getElementById('bottomNav').addEventListener('click', e => {
  const b = e.target.closest('.bn-item[data-view]'); if (b) navigate(b.dataset.view);
});
document.getElementById('quickReserva').addEventListener('click', () => openReservaForm());
document.getElementById('bnFab').addEventListener('click', () => openReservaForm());

// Tema claro / oscuro
function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  const next = cur === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('rancho_theme', next);
}
document.getElementById('themeToggleTop')?.addEventListener('click', toggleTheme);
document.getElementById('themeToggleSide')?.addEventListener('click', toggleTheme);

/* ============================================================
   7. VISTAS
   ============================================================ */

/* -------------------- DASHBOARD -------------------- */
function renderDashboard() {
  const cfg = db.config;
  const reservas = db.reservas;
  const hoy = todayISO();
  const mañana = isoDate(new Date(Date.now() + 86400000));

  const activas = (r) => r.estado !== 'Cancelada';
  const cobrable = (r) => r.estado === 'Confirmada' || r.estado === 'Finalizada';

  const revHoy = reservas.filter(r => r.fecha === hoy && cobrable(r)).reduce((a, r) => a + Number(r.precio || 0), 0);

  // Semana (lunes a domingo de la semana actual)
  const now = new Date();
  const dow = (now.getDay() + 6) % 7; // 0 = lunes
  const lunes = new Date(now); lunes.setDate(now.getDate() - dow);
  const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6);
  const inWeek = (iso) => { const d = parseDate(iso); return d >= parseDate(isoDate(lunes)) && d <= parseDate(isoDate(domingo)); };
  const revSemana = reservas.filter(r => inWeek(r.fecha) && cobrable(r)).reduce((a, r) => a + Number(r.precio || 0), 0);

  const mesActual = hoy.slice(0, 7);
  const revMes = reservas.filter(r => r.fecha.startsWith(mesActual) && cobrable(r)).reduce((a, r) => a + Number(r.precio || 0), 0);

  const resHoy = reservas.filter(r => r.fecha === hoy && activas(r));
  const resMañana = reservas.filter(r => r.fecha === mañana && activas(r));
  const numClientes = db.clientes.length;

  // Ocupación AHORA (espacios físicos: 3 de F5 + 1 de F7 = 4 espacios)
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const espaciosFisicos = ['c5a', 'c5b', 'c5c', 'c7'];
  const ocupadosAhora = new Set();
  resHoy.forEach(r => {
    const { start, end } = reservaInterval(r);
    if (nowMin >= start && nowMin < end) (OCCUPIES[r.courtId] || []).forEach(o => ocupadosAhora.add(o));
  });
  const nOcup = ocupadosAhora.size;
  const nLibre = espaciosFisicos.length - nOcup;

  const main = document.getElementById('main');
  main.innerHTML = `
    <div class="view-head">
      <div><h1>Hola, Rancho Aparte</h1><p>${fmtFechaLarga(hoy)} · Resumen operativo</p></div>
      <div class="actions"><button class="btn-primary" onclick="openReservaForm()">+ Nueva reserva</button></div>
    </div>

    <div class="grid kpi-grid">
      ${kpi('◷', 'green',  resHoy.length, 'Reservas hoy', `${resMañana.length} mañana`)}
      ${kpi('$',  'green',  money(revHoy), 'Facturación hoy', `Semana: ${money(revSemana)}`)}
      ${kpi('▦',  'amber',  `${nOcup}/${espaciosFisicos.length}`, 'Canchas ocupadas ahora', `${nLibre} libres`)}
      ${kpi('☻',  'blue',   numClientes, 'Clientes registrados', `Mes: ${money(revMes)}`)}
    </div>

    <div class="grid cols-2 section-gap">
      <div class="card chart-box">
        <div class="card-title">Facturación últimos 7 días <small>cobrado</small></div>
        <canvas id="chartWeek" height="220"></canvas>
      </div>
      <div class="card">
        <div class="card-title">Ocupación de hoy</div>
        <div class="donut-wrap">
          <canvas id="chartOcc" width="170" height="170"></canvas>
          <div class="legend" id="occLegend"></div>
        </div>
      </div>
    </div>

    <div class="grid cols-2 section-gap">
      <div class="card">
        <div class="card-title">Próximas reservas de hoy <small>${resHoy.length}</small></div>
        <div class="list-tight" id="hoyList"></div>
      </div>
      <div class="card">
        <div class="card-title">Agenda de mañana <small>${resMañana.length}</small></div>
        <div class="list-tight" id="mananaList"></div>
      </div>
    </div>
  `;

  // Lista hoy / mañana
  renderMiniReservas('hoyList', resHoy.sort((a, b) => toMin(a.hora) - toMin(b.hora)), true);
  renderMiniReservas('mananaList', resMañana.sort((a, b) => toMin(a.hora) - toMin(b.hora)), false);

  // Gráfico semanal
  const labels = [], values = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(now.getDate() - i);
    const iso = isoDate(d);
    labels.push(DIAS_S[d.getDay()]);
    values.push(reservas.filter(r => r.fecha === iso && cobrable(r)).reduce((a, r) => a + Number(r.precio || 0), 0));
  }
  drawBarChart(document.getElementById('chartWeek'), labels, values, '#3fae5a');

  // Donut ocupación
  drawDonut(document.getElementById('chartOcc'), [
    { label: 'Ocupadas', value: nOcup, color: '#e0a83a' },
    { label: 'Libres', value: nLibre, color: '#3fae5a' },
  ], document.getElementById('occLegend'));
}

function kpi(ico, tone, val, lbl, sub) {
  return `<div class="kpi"><div class="k-ico ${tone}">${ico}</div>
    <div class="k-val">${val}</div><div class="k-lbl">${lbl}</div><div class="k-sub">${sub}</div></div>`;
}

function renderMiniReservas(id, list, conBoton) {
  const box = document.getElementById(id);
  if (!list.length) { box.innerHTML = `<div class="empty"><div class="e-ico">◷</div><p>Sin reservas.</p></div>`; return; }
  box.innerHTML = list.map(r => {
    const c = courtById(r.courtId);
    const wa = conBoton ? `<button class="btn-soft btn-sm btn-wa" onclick="recordatorioWA('${r.id}')">WhatsApp</button>` : '';
    return `<div class="mini-row">
      <div class="mini-avatar">${esc((r.nombre || '?')[0].toUpperCase())}</div>
      <div class="mr-main"><strong>${esc(r.nombre)}</strong>
        <span>${r.hora} · ${c ? c.name : '—'} · ${money(r.precio)}</span></div>
      <span class="badge ${ESTADO_CLASS[r.estado]}">${r.estado}</span>
      ${wa}
    </div>`;
  }).join('');
}

/* -------------------- RESERVAS -------------------- */
let reservasFilter = { estado: '', court: '', q: '', fecha: '' };

function renderReservas() {
  const main = document.getElementById('main');
  main.innerHTML = `
    <div class="view-head">
      <div><h1>Reservas</h1><p>Gestión completa de turnos</p></div>
      <div class="actions"><button class="btn-primary" onclick="openReservaForm()">+ Nueva reserva</button></div>
    </div>
    <div class="filter-bar">
      <div class="search-box"><input id="resSearch" placeholder="Buscar por nombre o teléfono..." value="${esc(reservasFilter.q)}"></div>
      <select class="select-inline" id="resEstado">
        <option value="">Todos los estados</option>
        ${ESTADOS.map(e => `<option ${reservasFilter.estado === e ? 'selected' : ''}>${e}</option>`).join('')}
      </select>
      <select class="select-inline" id="resCourt">
        <option value="">Todas las canchas</option>
        ${COURTS.map(c => `<option value="${c.id}" ${reservasFilter.court === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
      </select>
      <input type="date" class="select-inline" id="resFecha" value="${reservasFilter.fecha}">
      <button class="btn-ghost btn-sm" onclick="clearResFilter()">Limpiar</button>
    </div>
    <div id="resTable"></div>
  `;

  const apply = () => {
    reservasFilter.q = document.getElementById('resSearch').value.trim().toLowerCase();
    reservasFilter.estado = document.getElementById('resEstado').value;
    reservasFilter.court = document.getElementById('resCourt').value;
    reservasFilter.fecha = document.getElementById('resFecha').value;
    drawResTable();
  };
  document.getElementById('resSearch').addEventListener('input', apply);
  document.getElementById('resEstado').addEventListener('change', apply);
  document.getElementById('resCourt').addEventListener('change', apply);
  document.getElementById('resFecha').addEventListener('change', apply);
  drawResTable();
}

function clearResFilter() { reservasFilter = { estado: '', court: '', q: '', fecha: '' }; renderReservas(); }

function drawResTable() {
  const f = reservasFilter;
  let list = db.reservas.slice().sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora));
  if (f.estado) list = list.filter(r => r.estado === f.estado);
  if (f.court) list = list.filter(r => r.courtId === f.court);
  if (f.fecha) list = list.filter(r => r.fecha === f.fecha);
  if (f.q) list = list.filter(r => (r.nombre || '').toLowerCase().includes(f.q) || (r.telefono || '').includes(f.q));

  const box = document.getElementById('resTable');
  if (!list.length) { box.innerHTML = `<div class="card"><div class="empty"><div class="e-ico">◷</div><p>No hay reservas que coincidan.</p></div></div>`; return; }

  box.innerHTML = `<div class="table-wrap"><table>
    <thead><tr>
      <th>Cliente</th><th>Cancha</th><th>Fecha</th><th>Horario</th>
      <th>Precio</th><th>Seña</th><th>Estado</th><th></th>
    </tr></thead><tbody>
    ${list.map(r => {
      const c = courtById(r.courtId);
      const fin = minToHHMM(toMin(r.hora) + Math.round(r.duracion * 60));
      const saldo = Number(r.precio || 0) - Number(r.sena || 0);
      return `<tr>
        <td><div class="t-strong">${esc(r.nombre)}</div><div class="t-dim">${esc(r.telefono || '')}</div></td>
        <td><span class="court-chip ${courtClass(c?.type)}">${c ? c.short : '?'}</span></td>
        <td>${fmtFecha(r.fecha)}</td>
        <td>${r.hora}–${fin}<div class="t-dim">${r.duracion}h</div></td>
        <td class="t-strong">${money(r.precio)}</td>
        <td>${Number(r.sena) ? money(r.sena) : '<span class="t-dim">—</span>'}<div class="t-dim">${saldo > 0 ? 'Resta ' + money(saldo) : 'Pagado'}</div></td>
        <td><span class="badge ${ESTADO_CLASS[r.estado]}">${r.estado}</span></td>
        <td><div class="row-actions">
          <button class="btn-soft btn-sm btn-wa" title="WhatsApp" onclick="recordatorioWA('${r.id}')">✆</button>
          <button class="btn-soft btn-sm" title="Editar" onclick="openReservaForm('${r.id}')">✎</button>
          <button class="btn-danger btn-sm" title="Eliminar" onclick="deleteReserva('${r.id}')">🗑</button>
        </div></td>
      </tr>`;
    }).join('')}
    </tbody></table></div>`;
}

function deleteReserva(id) {
  const r = db.reservas.find(x => x.id === id); if (!r) return;
  confirmAction({
    title: 'Eliminar reserva', danger: true, okText: 'Eliminar',
    msg: `¿Eliminar la reserva de ${r.nombre} del ${fmtFecha(r.fecha)} a las ${r.hora}? Esta acción no se puede deshacer.`,
    onOk: () => {
      db.reservas = db.reservas.filter(x => x.id !== id);
      toast('Reserva eliminada');
      navigate(currentView);
    },
  });
}

/* -------------------- CALENDARIO -------------------- */
let calView = 'dia';
let calDate = todayISO();

function renderCalendario() {
  const main = document.getElementById('main');
  main.innerHTML = `
    <div class="view-head">
      <div><h1>Calendario</h1><p>Disponibilidad y ocupación visual</p></div>
      <div class="actions">
        <div class="seg">
          <button class="${calView === 'dia' ? 'active' : ''}" onclick="setCalView('dia')">Día</button>
          <button class="${calView === 'semana' ? 'active' : ''}" onclick="setCalView('semana')">Semana</button>
        </div>
      </div>
    </div>
    <div class="cal-toolbar">
      <div class="cal-nav">
        <button class="btn-soft btn-sm" onclick="calMove(-1)">‹</button>
        <button class="btn-soft btn-sm" onclick="calToday()">Hoy</button>
        <button class="btn-soft btn-sm" onclick="calMove(1)">›</button>
      </div>
      <div class="cal-date" id="calDateLbl"></div>
      <div style="margin-left:auto" class="actions"><button class="btn-primary btn-sm" onclick="openReservaForm()">+ Reserva</button></div>
    </div>
    <div id="calBody"></div>
  `;
  drawCalendar();
}

function setCalView(v) { calView = v; renderCalendario(); }
function calToday() { calDate = todayISO(); drawCalendar(); }
function calMove(dir) {
  const d = parseDate(calDate);
  d.setDate(d.getDate() + (calView === 'dia' ? dir : dir * 7));
  calDate = isoDate(d);
  drawCalendar();
}

function drawCalendar() {
  const cfg = db.config;
  const lbl = document.getElementById('calDateLbl');
  if (calView === 'dia') { lbl.textContent = fmtFechaLarga(calDate); drawCalDia(cfg); }
  else { drawCalSemana(cfg); }
}

function drawCalDia(cfg) {
  const body = document.getElementById('calBody');
  const start = cfg.horaApertura, end = cfg.horaCierre;
  const hours = []; for (let h = start; h < end; h++) hours.push(h);
  const cols = COURTS.filter(c => c.type !== 'F8'); // espacios físicos en columnas; F8 se pinta sobre las tres

  let head = `<div class="dch corner"></div>` + cols.map(c =>
    `<div class="dch">${c.short}<div class="t-dim" style="font-weight:500">${c.type}</div></div>`).join('');

  // Construye grilla: columna horas + área de columnas
  let hourCol = hours.map(h => `<div class="hour-cell">${pad(h)}:00</div>`).join('');
  let colsHtml = cols.map(c => {
    let slots = hours.map(h => `<div class="slot" onclick="quickSlot('${c.id}','${pad(h)}:00')"></div>`).join('');
    return `<div class="court-col" data-court="${c.id}">${slots}</div>`;
  }).join('');

  body.innerHTML = `
    <div class="table-wrap">
      <div class="day-court-head" style="grid-template-columns:64px repeat(${cols.length},1fr)">${head}</div>
      <div class="day-grid" style="grid-template-columns:64px 1fr; min-width:${64 + cols.length * 120}px">
        <div class="hour-col">${hourCol}</div>
        <div class="courts-area" style="grid-template-columns:repeat(${cols.length},1fr)">${colsHtml}</div>
      </div>
    </div>
    <p class="hint">Tocá una franja libre para crear una reserva. Las reservas de Cancha 8 ocupan las tres de fútbol 5.</p>
  `;

  // Pinta eventos
  const rowH = 56;
  const colsArea = body.querySelector('.courts-area');
  reservasEnFecha(calDate).forEach(r => {
    const occ = OCCUPIES[r.courtId] || [r.courtId];
    const { start: s, end: e } = reservaInterval(r);
    const top = ((s - start * 60) / 60) * rowH;
    const height = ((e - s) / 60) * rowH - 4;
    occ.forEach(spaceId => {
      const idx = cols.findIndex(c => c.id === spaceId);
      if (idx < 0) return;
      const col = colsArea.children[idx];
      if (!col) return;
      const c = courtById(r.courtId);
      const ev = document.createElement('div');
      ev.className = `ev ${ESTADO_EV[r.estado]}`;
      ev.style.top = Math.max(0, top) + 'px';
      ev.style.height = Math.max(24, height) + 'px';
      ev.innerHTML = `${esc(r.nombre)}<small>${r.hora} · ${c ? c.short : ''}</small>`;
      ev.onclick = (ev2) => { ev2.stopPropagation(); openReservaForm(r.id); };
      col.appendChild(ev);
    });
  });
}

function drawCalSemana(cfg) {
  const body = document.getElementById('calBody');
  const start = cfg.horaApertura, end = cfg.horaCierre;
  const hours = []; for (let h = start; h < end; h++) hours.push(h);

  const base = parseDate(calDate);
  const dow = (base.getDay() + 6) % 7;
  const lunes = new Date(base); lunes.setDate(base.getDate() - dow);
  const dias = []; for (let i = 0; i < 7; i++) { const d = new Date(lunes); d.setDate(lunes.getDate() + i); dias.push(isoDate(d)); }

  document.getElementById('calDateLbl').textContent =
    `${fmtFecha(dias[0])} – ${fmtFecha(dias[6])}`;

  let head = `<div class="wk-head"></div>` + dias.map(iso => {
    const d = parseDate(iso);
    const isToday = iso === todayISO();
    return `<div class="wk-head ${isToday ? 'today' : ''}">${DIAS_S[d.getDay()]}<small>${d.getDate()}/${d.getMonth() + 1}</small></div>`;
  }).join('');

  let rows = '';
  hours.forEach(h => {
    rows += `<div class="wk-hour">${pad(h)}:00</div>`;
    dias.forEach(iso => {
      const evs = reservasEnFecha(iso).filter(r => toMin(r.hora) >= h * 60 && toMin(r.hora) < (h + 1) * 60);
      const inner = evs.map(r => {
        const c = courtById(r.courtId);
        return `<div class="wk-ev ${ESTADO_EV[r.estado]}" onclick="openReservaForm('${r.id}')" title="${esc(r.nombre)} · ${c?.name}">${r.hora.slice(0,5)} ${c ? c.short : ''} ${esc(r.nombre.split(' ')[0])}</div>`;
      }).join('');
      rows += `<div class="wk-cell">${inner}</div>`;
    });
  });

  body.innerHTML = `<div class="table-wrap"><div class="week-grid">${head}${rows}</div></div>`;
}

function quickSlot(courtId, hora) {
  openReservaForm(null, { courtId, fecha: calDate, hora });
}

/* -------------------- CLIENTES -------------------- */
function renderClientes() {
  const main = document.getElementById('main');
  main.innerHTML = `
    <div class="view-head">
      <div><h1>Clientes</h1><p>Base de datos generada automáticamente desde las reservas</p></div>
      <div class="actions"><button class="btn-soft" onclick="openClienteForm()">+ Cargar cliente</button></div>
    </div>
    <div class="filter-bar"><div class="search-box"><input id="cliSearch" placeholder="Buscar cliente por nombre o teléfono..."></div></div>
    <div id="cliTable"></div>
  `;
  document.getElementById('cliSearch').addEventListener('input', drawCliTable);
  drawCliTable();
}

function clienteStats(cli) {
  const rs = db.reservas.filter(r => r.telefono && cli.telefono && r.telefono.replace(/\D/g,'') === cli.telefono.replace(/\D/g,'') && r.estado !== 'Cancelada');
  const total = rs.length;
  const ultima = rs.map(r => r.fecha).sort().pop();
  const gastado = rs.filter(r => r.estado === 'Confirmada' || r.estado === 'Finalizada').reduce((a, r) => a + Number(r.precio || 0), 0);
  return { total, ultima, gastado };
}

function drawCliTable() {
  const q = (document.getElementById('cliSearch')?.value || '').trim().toLowerCase();
  let list = db.clientes.slice();
  if (q) list = list.filter(c => (c.nombre || '').toLowerCase().includes(q) || (c.telefono || '').includes(q));
  list.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

  const box = document.getElementById('cliTable');
  if (!list.length) { box.innerHTML = `<div class="card"><div class="empty"><div class="e-ico">☻</div><p>Aún no hay clientes. Se crean solos al cargar reservas.</p></div></div>`; return; }

  box.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>Cliente</th><th>Teléfono</th><th>Reservas</th><th>Última visita</th><th>Total gastado</th><th>Observaciones</th><th></th></tr></thead>
    <tbody>${list.map(c => {
      const s = clienteStats(c);
      return `<tr>
        <td><div class="t-strong">${esc(c.nombre)}</div></td>
        <td>${esc(c.telefono || '—')}</td>
        <td><span class="court-chip">${s.total}</span></td>
        <td>${s.ultima ? fmtFecha(s.ultima) : '<span class="t-dim">—</span>'}</td>
        <td class="t-strong">${money(s.gastado)}</td>
        <td class="t-dim">${esc(c.obs || '—')}</td>
        <td><div class="row-actions">
          <button class="btn-soft btn-sm btn-wa" title="WhatsApp" onclick="waCliente('${c.id}')">✆</button>
          <button class="btn-soft btn-sm" title="Editar" onclick="openClienteForm('${c.id}')">✎</button>
          <button class="btn-danger btn-sm" title="Eliminar" onclick="deleteCliente('${c.id}')">🗑</button>
        </div></td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
}

function deleteCliente(id) {
  const c = db.clientes.find(x => x.id === id); if (!c) return;
  confirmAction({ title: 'Eliminar cliente', danger: true, okText: 'Eliminar',
    msg: `¿Eliminar a ${c.nombre}? Sus reservas no se borran.`,
    onOk: () => { db.clientes = db.clientes.filter(x => x.id !== id); toast('Cliente eliminado'); drawCliTable(); } });
}

function waCliente(id) {
  const c = db.clientes.find(x => x.id === id); if (!c) return;
  const n = waNumber(c.telefono);
  if (!n) return toast('Cliente sin teléfono válido', 'err');
  const msg = `Hola ${c.nombre}, te escribimos de ${db.config.nombre}.`;
  window.open(`https://wa.me/${n}?text=${encodeURIComponent(msg)}`, '_blank');
}

/* -------------------- FINANZAS -------------------- */
function renderFinanzas() {
  const reservas = db.reservas;
  const cobrable = (r) => r.estado === 'Confirmada' || r.estado === 'Finalizada';
  const hoy = todayISO();

  const now = new Date();
  const dow = (now.getDay() + 6) % 7;
  const lunes = new Date(now); lunes.setDate(now.getDate() - dow);
  const inWeek = (iso) => parseDate(iso) >= parseDate(isoDate(lunes));
  const mes = hoy.slice(0, 7), año = hoy.slice(0, 4);

  const sum = (arr) => arr.reduce((a, r) => a + Number(r.precio || 0), 0);
  const revHoy = sum(reservas.filter(r => r.fecha === hoy && cobrable(r)));
  const revSem = sum(reservas.filter(r => inWeek(r.fecha) && cobrable(r)));
  const revMes = sum(reservas.filter(r => r.fecha.startsWith(mes) && cobrable(r)));
  const revAño = sum(reservas.filter(r => r.fecha.startsWith(año) && cobrable(r)));

  // Pendientes
  const señasPend = reservas.filter(r => r.estado === 'Pendiente');
  const totalSeñas = señasPend.reduce((a, r) => a + (Number(r.precio || 0) - Number(r.sena || 0)), 0);
  const incompletos = reservas.filter(r => cobrable(r) && Number(r.sena || 0) > 0 && Number(r.sena) < Number(r.precio));
  const totalIncompleto = incompletos.reduce((a, r) => a + (Number(r.precio) - Number(r.sena)), 0);

  // Estadísticas
  const facturadas = reservas.filter(cobrable);
  const promedio = facturadas.length ? Math.round(sum(facturadas) / facturadas.length) : 0;

  const cnt = {};
  reservas.filter(r => r.estado !== 'Cancelada').forEach(r => {
    const key = r.telefono ? r.telefono.replace(/\D/g,'') : r.nombre;
    cnt[key] = cnt[key] || { nombre: r.nombre, n: 0 };
    cnt[key].n++;
  });
  const topCli = Object.values(cnt).sort((a, b) => b.n - a.n)[0];

  const courtCnt = {};
  reservas.filter(r => r.estado !== 'Cancelada').forEach(r => { courtCnt[r.courtId] = (courtCnt[r.courtId] || 0) + 1; });
  const topCourtId = Object.entries(courtCnt).sort((a, b) => b[1] - a[1])[0]?.[0];

  const main = document.getElementById('main');
  main.innerHTML = `
    <div class="view-head"><div><h1>Finanzas</h1><p>Panel financiero · solo reservas confirmadas/finalizadas</p></div></div>

    <div class="grid kpi-grid">
      ${kpi('$', 'green', money(revHoy), 'Ingresos hoy', '')}
      ${kpi('$', 'green', money(revSem), 'Ingresos semana', '')}
      ${kpi('$', 'green', money(revMes), 'Ingresos mes', '')}
      ${kpi('$', 'blue',  money(revAño), 'Ingresos año', '')}
    </div>

    <div class="grid cols-2 section-gap">
      <div class="card">
        <div class="card-title">Pendientes de cobro</div>
        <div class="stat-line"><span>Señas pendientes (reservas sin confirmar)</span><strong>${señasPend.length} · ${money(totalSeñas)}</strong></div>
        <div class="stat-line"><span>Pagos incompletos (saldo restante)</span><strong>${incompletos.length} · ${money(totalIncompleto)}</strong></div>
        <div class="stat-line"><span>Total por cobrar</span><strong style="color:var(--amber)">${money(totalSeñas + totalIncompleto)}</strong></div>
      </div>
      <div class="card">
        <div class="card-title">Estadísticas</div>
        <div class="stat-line"><span>Reserva promedio</span><strong>${money(promedio)}</strong></div>
        <div class="stat-line"><span>Cliente más frecuente</span><strong>${topCli ? esc(topCli.nombre) + ' (' + topCli.n + ')' : '—'}</strong></div>
        <div class="stat-line"><span>Cancha más utilizada</span><strong>${topCourtId ? esc(courtById(topCourtId)?.name) : '—'}</strong></div>
      </div>
    </div>

    <div class="card section-gap chart-box">
      <div class="card-title">Ingresos por mes <small>últimos 6 meses</small></div>
      <canvas id="chartMonths" height="240"></canvas>
    </div>

    <div class="card section-gap">
      <div class="card-title">Cobros pendientes en detalle</div>
      ${pendientesTabla([...señasPend, ...incompletos.filter(r => r.estado !== 'Pendiente')])}
    </div>
  `;

  // Gráfico 6 meses
  const labels = [], values = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    labels.push(MESES[d.getMonth()].slice(0, 3));
    values.push(sum(reservas.filter(r => r.fecha.startsWith(key) && cobrable(r))));
  }
  drawBarChart(document.getElementById('chartMonths'), labels, values, '#2b6fb0');
}

function pendientesTabla(list) {
  if (!list.length) return `<div class="empty"><div class="e-ico">✓</div><p>Todo cobrado. Sin pendientes.</p></div>`;
  return `<div class="table-wrap"><table>
    <thead><tr><th>Cliente</th><th>Fecha</th><th>Total</th><th>Seña</th><th>Resta</th><th>Estado</th><th></th></tr></thead>
    <tbody>${list.map(r => {
      const resta = Number(r.precio || 0) - Number(r.sena || 0);
      return `<tr>
        <td class="t-strong">${esc(r.nombre)}</td><td>${fmtFecha(r.fecha)}</td>
        <td>${money(r.precio)}</td><td>${money(r.sena)}</td>
        <td class="t-strong" style="color:var(--amber)">${money(resta)}</td>
        <td><span class="badge ${ESTADO_CLASS[r.estado]}">${r.estado}</span></td>
        <td><button class="btn-soft btn-sm" onclick="openReservaForm('${r.id}')">Gestionar</button></td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
}

/* -------------------- EVENTOS -------------------- */
function renderEventos() {
  const main = document.getElementById('main');
  main.innerHTML = `
    <div class="view-head">
      <div><h1>Eventos y cumpleaños</h1><p>Torneos, cumpleaños y reservas especiales</p></div>
      <div class="actions"><button class="btn-primary" onclick="openEventoForm()">+ Nuevo evento</button></div>
    </div>
    <div id="evTable"></div>
  `;
  drawEvTable();
}

function drawEvTable() {
  const list = db.eventos.slice().sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
  const box = document.getElementById('evTable');
  if (!list.length) { box.innerHTML = `<div class="card"><div class="empty"><div class="e-ico">★</div><p>Sin eventos cargados.</p></div></div>`; return; }
  box.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>Tipo</th><th>Cliente</th><th>Fecha</th><th>Horario</th><th>Personas</th><th>Observaciones</th><th></th></tr></thead>
    <tbody>${list.map(e => `<tr>
      <td><span class="court-chip f8">${esc(e.tipo)}</span></td>
      <td><div class="t-strong">${esc(e.cliente)}</div><div class="t-dim">${esc(e.telefono || '')}</div></td>
      <td>${e.fecha ? fmtFecha(e.fecha) : '—'}</td>
      <td>${esc(e.hora || '—')}</td>
      <td>${esc(e.personas || '—')}</td>
      <td class="t-dim">${esc(e.obs || '—')}</td>
      <td><div class="row-actions">
        <button class="btn-soft btn-sm btn-wa" onclick="waEvento('${e.id}')" title="WhatsApp">✆</button>
        <button class="btn-soft btn-sm" onclick="openEventoForm('${e.id}')">✎</button>
        <button class="btn-danger btn-sm" onclick="deleteEvento('${e.id}')">🗑</button>
      </div></td>
    </tr>`).join('')}</tbody></table></div>`;
}

function deleteEvento(id) {
  const e = db.eventos.find(x => x.id === id); if (!e) return;
  confirmAction({ title: 'Eliminar evento', danger: true, okText: 'Eliminar',
    msg: `¿Eliminar el evento "${e.tipo}" de ${e.cliente}?`,
    onOk: () => { db.eventos = db.eventos.filter(x => x.id !== id); toast('Evento eliminado'); drawEvTable(); } });
}

function waEvento(id) {
  const e = db.eventos.find(x => x.id === id); if (!e) return;
  const n = waNumber(e.telefono);
  if (!n) return toast('Sin teléfono válido', 'err');
  const msg = `Hola ${e.cliente}, te confirmamos tu ${e.tipo.toLowerCase()} en ${db.config.nombre}${e.fecha ? ' para el ' + fmtFechaLarga(e.fecha) : ''}${e.hora ? ' a las ' + e.hora : ''}. ¡Te esperamos!`;
  window.open(`https://wa.me/${n}?text=${encodeURIComponent(msg)}`, '_blank');
}

/* -------------------- REPORTES -------------------- */
function renderReportes() {
  const reservas = db.reservas.filter(r => r.estado !== 'Cancelada');
  const main = document.getElementById('main');
  main.innerHTML = `
    <div class="view-head"><div><h1>Reportes</h1><p>Análisis visual del negocio</p></div></div>

    <div class="grid cols-2">
      <div class="card chart-box"><div class="card-title">Reservas por cancha</div><canvas id="rCourt" height="220"></canvas></div>
      <div class="card chart-box"><div class="card-title">Horarios más utilizados</div><canvas id="rHours" height="220"></canvas></div>
    </div>

    <div class="card section-gap chart-box">
      <div class="card-title">Ingresos por mes <small>últimos 12 meses</small></div>
      <canvas id="rMonths" height="240"></canvas>
    </div>

    <div class="card section-gap">
      <div class="card-title">Clientes recurrentes <small>top 8</small></div>
      <div id="rTopCli" class="list-tight"></div>
    </div>
  `;

  // Reservas por cancha
  const courtLabels = [], courtVals = [];
  COURTS.forEach(c => { const n = reservas.filter(r => r.courtId === c.id).length; if (c.type !== 'F8' || n) { courtLabels.push(c.short); courtVals.push(n); } });
  drawBarChart(document.getElementById('rCourt'), courtLabels, courtVals, '#3fae5a', false);

  // Horarios
  const cfg = db.config;
  const hLabels = [], hVals = [];
  for (let h = cfg.horaApertura; h < cfg.horaCierre; h++) {
    hLabels.push(pad(h));
    hVals.push(reservas.filter(r => Math.floor(toMin(r.hora) / 60) === h).length);
  }
  drawBarChart(document.getElementById('rHours'), hLabels, hVals, '#e0a83a', false);

  // 12 meses
  const now = new Date();
  const cobrable = (r) => r.estado === 'Confirmada' || r.estado === 'Finalizada';
  const mLabels = [], mVals = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    mLabels.push(MESES[d.getMonth()].slice(0, 3));
    mVals.push(db.reservas.filter(r => r.fecha.startsWith(key) && cobrable(r)).reduce((a, r) => a + Number(r.precio || 0), 0));
  }
  drawBarChart(document.getElementById('rMonths'), mLabels, mVals, '#2b6fb0');

  // Top clientes
  const cnt = {};
  reservas.forEach(r => { const k = r.telefono ? r.telefono.replace(/\D/g,'') : r.nombre; cnt[k] = cnt[k] || { nombre: r.nombre, n: 0 }; cnt[k].n++; });
  const top = Object.values(cnt).sort((a, b) => b.n - a.n).slice(0, 8);
  const box = document.getElementById('rTopCli');
  box.innerHTML = top.length ? top.map((c, i) => `<div class="mini-row">
    <div class="mini-avatar">${i + 1}</div>
    <div class="mr-main"><strong>${esc(c.nombre)}</strong><span>${c.n} reserva${c.n !== 1 ? 's' : ''}</span></div>
  </div>`).join('') : `<div class="empty"><p>Sin datos.</p></div>`;
}

/* -------------------- CONFIGURACIÓN -------------------- */
function renderConfig() {
  const cfg = db.config;
  const main = document.getElementById('main');
  main.innerHTML = `
    <div class="view-head"><div><h1>Configuración</h1><p>Datos del complejo, precios y gestión de datos</p></div></div>

    <div class="grid cols-2">
      <div class="card">
        <div class="card-title">Datos del complejo</div>
        <div class="field"><label>Nombre</label><input id="cfgNombre" value="${esc(cfg.nombre)}"></div>
        <div class="field"><label>Dirección</label><input id="cfgDir" value="${esc(cfg.direccion)}"></div>
        <div class="field"><label>WhatsApp</label><input id="cfgWa" value="${esc(cfg.whatsapp)}"></div>
        <div class="field-row">
          <div class="field"><label>Hora apertura</label><input type="number" id="cfgAp" min="0" max="23" value="${cfg.horaApertura}"></div>
          <div class="field"><label>Hora cierre</label><input type="number" id="cfgCi" min="1" max="24" value="${cfg.horaCierre}"></div>
        </div>
      </div>
      <div class="card">
        <div class="card-title">Precios por defecto <small>por turno</small></div>
        <div class="field"><label>Fútbol 5</label><input type="number" id="cfgP5" value="${cfg.precios.F5}"></div>
        <div class="field"><label>Fútbol 7</label><input type="number" id="cfgP7" value="${cfg.precios.F7}"></div>
        <div class="field"><label>Fútbol 8 (combinada)</label><input type="number" id="cfgP8" value="${cfg.precios.F8}"></div>
        <p class="hint">Se autocompletan al crear una reserva según la cancha. Podés editar el precio en cada reserva.</p>
      </div>
    </div>

    <div class="modal-foot" style="padding:18px 0 0;justify-content:flex-start">
      <button class="btn-primary" onclick="saveConfig()">Guardar configuración</button>
    </div>

    <div class="card section-gap">
      <div class="card-title">Gestión de datos</div>
      <p class="hint" style="margin-bottom:14px">Tus datos se guardan en este dispositivo (LocalStorage). Exportá una copia de seguridad periódicamente.</p>
      <div class="actions" style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn-soft" onclick="exportData()">⤓ Exportar copia (JSON)</button>
        <label class="btn-soft" style="cursor:pointer">⤒ Importar copia<input type="file" accept="application/json" id="importFile" style="display:none"></label>
        <button class="btn-soft" onclick="seedDemo(true)">Cargar datos de ejemplo</button>
        <button class="btn-danger" onclick="wipeData()">Borrar todos los datos</button>
      </div>
    </div>
  `;
  document.getElementById('importFile').addEventListener('change', importData);
}

function saveConfig() {
  const cfg = db.config;
  cfg.nombre = document.getElementById('cfgNombre').value.trim() || cfg.nombre;
  cfg.direccion = document.getElementById('cfgDir').value.trim();
  cfg.whatsapp = document.getElementById('cfgWa').value.trim();
  cfg.horaApertura = Math.max(0, Math.min(23, +document.getElementById('cfgAp').value || 9));
  cfg.horaCierre = Math.max(cfg.horaApertura + 1, Math.min(24, +document.getElementById('cfgCi').value || 24));
  cfg.precios = {
    F5: +document.getElementById('cfgP5').value || 0,
    F7: +document.getElementById('cfgP7').value || 0,
    F8: +document.getElementById('cfgP8').value || 0,
  };
  db.config = cfg;
  toast('Configuración guardada');
}

function exportData() {
  const data = { reservas: db.reservas, clientes: db.clientes, eventos: db.eventos, config: db.config, _exported: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `rancho-aparte-backup-${todayISO()}.json`;
  a.click();
  toast('Copia exportada');
}

function importData(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const d = JSON.parse(reader.result);
      if (d.reservas) db.reservas = d.reservas;
      if (d.clientes) db.clientes = d.clientes;
      if (d.eventos) db.eventos = d.eventos;
      if (d.config) db.config = d.config;
      toast('Datos importados');
      navigate('dashboard');
    } catch (err) { toast('Archivo inválido', 'err'); }
  };
  reader.readAsText(file);
}

function wipeData() {
  confirmAction({ title: 'Borrar TODO', danger: true, okText: 'Borrar todo',
    msg: 'Se eliminarán reservas, clientes y eventos de este dispositivo. ¿Continuar?',
    onOk: () => { db.reservas = []; db.clientes = []; db.eventos = []; toast('Datos borrados'); navigate('dashboard'); } });
}

/* ============================================================
   8. FORMULARIOS
   ============================================================ */

/* ----- RESERVA ----- */
function openReservaForm(id, prefill = {}) {
  const cfg = db.config;
  const editing = id ? db.reservas.find(r => r.id === id) : null;
  const r = editing || Object.assign({ estado: 'Confirmada', duracion: 1, sena: 0 }, prefill);
  const horas = []; for (let h = cfg.horaApertura; h < cfg.horaCierre; h++) { horas.push(`${pad(h)}:00`); horas.push(`${pad(h)}:30`); }

  openModal(`
    <div class="modal-head">
      <div><h3>${editing ? 'Editar reserva' : 'Nueva reserva'}</h3><div class="sub">${editing ? '#' + id.slice(-5) : 'Completá los datos del turno'}</div></div>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      <form id="resForm" novalidate>
        <div class="field-row">
          <div class="field" id="f-nombre"><label>Nombre <span class="req">*</span></label><input name="nombre" value="${esc(r.nombre || '')}" placeholder="Ej: Juan Pérez" autocomplete="off"><div class="field-err">Ingresá el nombre</div></div>
          <div class="field" id="f-tel"><label>Teléfono <span class="req">*</span></label><input name="telefono" value="${esc(r.telefono || '')}" placeholder="11 2345 6789" inputmode="tel"><div class="field-err">Ingresá el teléfono</div></div>
        </div>
        <div class="field-row">
          <div class="field" id="f-court"><label>Cancha <span class="req">*</span></label>
            <select name="courtId">${COURTS.map(c => `<option value="${c.id}" ${r.courtId === c.id ? 'selected' : ''}>${c.name} · ${c.type}</option>`).join('')}</select>
          </div>
          <div class="field"><label>Estado</label><select name="estado">${ESTADOS.map(e => `<option ${r.estado === e ? 'selected' : ''}>${e}</option>`).join('')}</select></div>
        </div>
        <div class="field-row-3">
          <div class="field" id="f-fecha"><label>Fecha <span class="req">*</span></label><input type="date" name="fecha" value="${r.fecha || todayISO()}"><div class="field-err">Elegí la fecha</div></div>
          <div class="field"><label>Hora <span class="req">*</span></label><select name="hora">${horas.map(h => `<option ${r.hora === h ? 'selected' : ''}>${h}</option>`).join('')}</select></div>
          <div class="field"><label>Duración</label><select name="duracion">
            <option value="1" ${r.duracion == 1 ? 'selected' : ''}>1 hora</option>
            <option value="1.5" ${r.duracion == 1.5 ? 'selected' : ''}>1.5 horas</option>
            <option value="2" ${r.duracion == 2 ? 'selected' : ''}>2 horas</option>
            <option value="3" ${r.duracion == 3 ? 'selected' : ''}>3 horas</option>
          </select></div>
        </div>
        <div class="field-row">
          <div class="field" id="f-precio"><label>Precio <span class="req">*</span></label><input type="number" name="precio" value="${r.precio || ''}" placeholder="0"><div class="field-err">Ingresá un precio</div></div>
          <div class="field"><label>Seña</label><input type="number" name="sena" value="${r.sena || 0}" placeholder="0"></div>
        </div>
        <div class="field"><label>Observaciones</label><textarea name="obs" placeholder="Notas opcionales...">${esc(r.obs || '')}</textarea></div>
        <p class="hint" id="conflictHint"></p>
      </form>
    </div>
    <div class="modal-foot spread">
      <div>${editing ? `<button class="btn-danger" onclick="deleteReserva('${id}')">Eliminar</button>` : ''}</div>
      <div style="display:flex;gap:10px">
        <button class="btn-ghost" onclick="closeModal()">Cancelar</button>
        <button class="btn-primary" onclick="saveReserva('${id || ''}')">${editing ? 'Guardar cambios' : 'Crear reserva'}</button>
      </div>
    </div>
  `);

  const form = document.getElementById('resForm');
  // Autocompleta precio según cancha si está vacío
  const courtSel = form.courtId, precioInput = form.precio;
  const setPrecio = () => {
    if (!precioInput.value || precioInput.dataset.auto === '1') {
      const c = courtById(courtSel.value);
      precioInput.value = cfg.precios[c.type] || '';
      precioInput.dataset.auto = '1';
    }
    checkConflictLive();
  };
  precioInput.addEventListener('input', () => { precioInput.dataset.auto = '0'; });
  courtSel.addEventListener('change', setPrecio);
  ['fecha', 'hora', 'duracion'].forEach(n => form[n].addEventListener('change', checkConflictLive));
  if (!editing && !r.precio) setPrecio();
  checkConflictLive();
}

function checkConflictLive() {
  const form = document.getElementById('resForm'); if (!form) return;
  const hint = document.getElementById('conflictHint');
  const data = formToReserva(form);
  if (!data.fecha || !data.hora) { hint.textContent = ''; return; }
  const editingId = document.querySelector('.modal-foot .btn-primary')?.getAttribute('onclick')?.match(/'([^']*)'/)?.[1] || '';
  const conflict = findConflict(data, editingId);
  if (conflict && data.estado !== 'Cancelada') {
    const c = courtById(conflict.courtId);
    hint.style.color = 'var(--red)';
    hint.textContent = `⚠ Se superpone con: ${conflict.nombre} (${c?.name}, ${conflict.hora}).`;
  } else {
    hint.style.color = 'var(--green)';
    hint.textContent = '✓ Horario disponible.';
  }
}

function formToReserva(form) {
  return {
    nombre: form.nombre.value.trim(),
    telefono: form.telefono.value.trim(),
    courtId: form.courtId.value,
    estado: form.estado.value,
    fecha: form.fecha.value,
    hora: form.hora.value,
    duracion: parseFloat(form.duracion.value),
    precio: parseFloat(form.precio.value) || 0,
    sena: parseFloat(form.sena.value) || 0,
    obs: form.obs.value.trim(),
  };
}

function saveReserva(id) {
  const form = document.getElementById('resForm');
  const data = formToReserva(form);

  // Validación
  let ok = true;
  const invalid = (fid, cond) => { const el = document.getElementById(fid); if (el) { el.classList.toggle('invalid', cond); if (cond) ok = false; } };
  invalid('f-nombre', !data.nombre);
  invalid('f-tel', !data.telefono);
  invalid('f-fecha', !data.fecha);
  invalid('f-precio', !(data.precio > 0));
  if (!ok) { toast('Revisá los campos marcados', 'err'); return; }

  // Prevención de solapamiento (salvo canceladas)
  if (data.estado !== 'Cancelada') {
    const conflict = findConflict(data, id || null);
    if (conflict) {
      const c = courtById(conflict.courtId);
      toast(`Choca con la reserva de ${conflict.nombre} (${c?.short} ${conflict.hora})`, 'err');
      return;
    }
    // Prevención de duplicado exacto
    const dup = db.reservas.find(r => r.id !== id && r.nombre.toLowerCase() === data.nombre.toLowerCase() && r.courtId === data.courtId && r.fecha === data.fecha && r.hora === data.hora && r.estado !== 'Cancelada');
    if (dup) { toast('Ya existe una reserva idéntica', 'err'); return; }
  }

  const reservas = db.reservas;
  if (id) {
    const idx = reservas.findIndex(r => r.id === id);
    if (idx >= 0) reservas[idx] = Object.assign(reservas[idx], data);
    toast('Reserva actualizada');
  } else {
    data.id = uid();
    data.createdAt = new Date().toISOString();
    reservas.push(data);
    toast('Reserva creada');
  }
  db.reservas = reservas;

  // Cliente automático
  upsertClienteFromReserva(data);

  closeModal();
  navigate(currentView);
}

function upsertClienteFromReserva(r) {
  if (!r.telefono) return;
  const clientes = db.clientes;
  const key = r.telefono.replace(/\D/g, '');
  let cli = clientes.find(c => (c.telefono || '').replace(/\D/g, '') === key);
  if (cli) {
    if (!cli.nombre && r.nombre) cli.nombre = r.nombre;
  } else {
    clientes.push({ id: uid(), nombre: r.nombre, telefono: r.telefono, obs: '', createdAt: new Date().toISOString() });
  }
  db.clientes = clientes;
}

/* ----- CLIENTE ----- */
function openClienteForm(id) {
  const editing = id ? db.clientes.find(c => c.id === id) : null;
  const c = editing || {};
  openModal(`
    <div class="modal-head"><div><h3>${editing ? 'Editar cliente' : 'Nuevo cliente'}</h3></div><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body"><form id="cliForm">
      <div class="field" id="cf-nombre"><label>Nombre <span class="req">*</span></label><input name="nombre" value="${esc(c.nombre || '')}"><div class="field-err">Ingresá el nombre</div></div>
      <div class="field"><label>Teléfono</label><input name="telefono" value="${esc(c.telefono || '')}" placeholder="11 2345 6789"></div>
      <div class="field"><label>Observaciones</label><textarea name="obs">${esc(c.obs || '')}</textarea></div>
    </form></div>
    <div class="modal-foot"><button class="btn-ghost" onclick="closeModal()">Cancelar</button><button class="btn-primary" onclick="saveCliente('${id || ''}')">Guardar</button></div>
  `);
}

function saveCliente(id) {
  const form = document.getElementById('cliForm');
  const nombre = form.nombre.value.trim();
  if (!nombre) { document.getElementById('cf-nombre').classList.add('invalid'); return; }
  const data = { nombre, telefono: form.telefono.value.trim(), obs: form.obs.value.trim() };
  const clientes = db.clientes;
  if (id) { const i = clientes.findIndex(c => c.id === id); if (i >= 0) Object.assign(clientes[i], data); toast('Cliente actualizado'); }
  else { data.id = uid(); data.createdAt = new Date().toISOString(); clientes.push(data); toast('Cliente creado'); }
  db.clientes = clientes;
  closeModal();
  drawCliTable();
}

/* ----- EVENTO ----- */
function openEventoForm(id) {
  const editing = id ? db.eventos.find(e => e.id === id) : null;
  const e = editing || { tipo: 'Cumpleaños' };
  openModal(`
    <div class="modal-head"><div><h3>${editing ? 'Editar evento' : 'Nuevo evento'}</h3></div><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body"><form id="evForm">
      <div class="field-row">
        <div class="field"><label>Tipo</label><select name="tipo">${TIPOS_EVENTO.map(t => `<option ${e.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        <div class="field" id="ef-cliente"><label>Cliente <span class="req">*</span></label><input name="cliente" value="${esc(e.cliente || '')}"><div class="field-err">Ingresá el cliente</div></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Teléfono</label><input name="telefono" value="${esc(e.telefono || '')}"></div>
        <div class="field"><label>Personas</label><input type="number" name="personas" value="${esc(e.personas || '')}" placeholder="Ej: 20"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Fecha</label><input type="date" name="fecha" value="${e.fecha || todayISO()}"></div>
        <div class="field"><label>Horario</label><input name="hora" value="${esc(e.hora || '')}" placeholder="Ej: 16:00 a 19:00"></div>
      </div>
      <div class="field"><label>Observaciones</label><textarea name="obs">${esc(e.obs || '')}</textarea></div>
    </form></div>
    <div class="modal-foot"><button class="btn-ghost" onclick="closeModal()">Cancelar</button><button class="btn-primary" onclick="saveEvento('${id || ''}')">Guardar</button></div>
  `);
}

function saveEvento(id) {
  const form = document.getElementById('evForm');
  const cliente = form.cliente.value.trim();
  if (!cliente) { document.getElementById('ef-cliente').classList.add('invalid'); return; }
  const data = {
    tipo: form.tipo.value, cliente, telefono: form.telefono.value.trim(),
    personas: form.personas.value.trim(), fecha: form.fecha.value, hora: form.hora.value.trim(), obs: form.obs.value.trim(),
  };
  const eventos = db.eventos;
  if (id) { const i = eventos.findIndex(e => e.id === id); if (i >= 0) Object.assign(eventos[i], data); toast('Evento actualizado'); }
  else { data.id = uid(); data.createdAt = new Date().toISOString(); eventos.push(data); toast('Evento creado'); }
  db.eventos = eventos;
  closeModal();
  drawEvTable();
}

/* ============================================================
   9. WHATSAPP — recordatorio de reserva
   ============================================================ */
function recordatorioWA(id) {
  const r = db.reservas.find(x => x.id === id); if (!r) return;
  const n = waNumber(r.telefono);
  if (!n) return toast('Reserva sin teléfono válido', 'err');
  const cfg = db.config;
  const msg = `Hola ${r.nombre}. Te recordamos tu reserva para el ${fmtFechaLarga(r.fecha)} a las ${r.hora} en ${courtById(r.courtId)?.name}. Te esperamos en ${cfg.nombre}. 🟢⚽`;
  window.open(`https://wa.me/${n}?text=${encodeURIComponent(msg)}`, '_blank');
}

/* ============================================================
   10. GRÁFICOS (canvas) — sin librerías
   ============================================================ */
function fitCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = rect.width || canvas.parentElement.clientWidth || 300;
  const h = parseInt(canvas.getAttribute('height')) || 220;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  return { ctx, w, h };
}

function drawBarChart(canvas, labels, values, color, isMoney = true) {
  if (!canvas) return;
  const { ctx, w, h } = fitCanvas(canvas);
  ctx.clearRect(0, 0, w, h);
  const padL = 46, padR = 12, padT = 14, padB = 28;
  const cw = w - padL - padR, ch = h - padT - padB;
  const max = Math.max(...values, 1);
  // niceMax redondeado
  const niceMax = max <= 1 ? 1 : Math.ceil(max / Math.pow(10, Math.floor(Math.log10(max)))) * Math.pow(10, Math.floor(Math.log10(max)));

  // Grid + ejes Y
  ctx.font = '11px Inter, sans-serif';
  ctx.fillStyle = '#6f8579';
  ctx.strokeStyle = 'rgba(255,255,255,.05)';
  ctx.lineWidth = 1;
  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    const y = padT + ch - (ch * i / steps);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
    const v = (niceMax * i / steps);
    const lbl = isMoney ? (v >= 1000 ? '$' + Math.round(v / 1000) + 'k' : '$' + Math.round(v)) : Math.round(v);
    ctx.textAlign = 'right'; ctx.fillText(lbl, padL - 8, y + 4);
  }

  const n = values.length;
  const bw = cw / n;
  const barW = Math.min(bw * 0.55, 44);
  values.forEach((v, i) => {
    const x = padL + bw * i + (bw - barW) / 2;
    const bh = (v / niceMax) * ch;
    const y = padT + ch - bh;
    const grad = ctx.createLinearGradient(0, y, 0, padT + ch);
    grad.addColorStop(0, color);
    grad.addColorStop(1, color + '44');
    ctx.fillStyle = grad;
    roundRect(ctx, x, y, barW, Math.max(bh, 1), 5);
    ctx.fill();
    ctx.fillStyle = '#a9bcb0';
    ctx.textAlign = 'center';
    ctx.fillText(labels[i], x + barW / 2, h - 9);
  });
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawDonut(canvas, segments, legendEl) {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const size = 170;
  canvas.width = size * dpr; canvas.height = size * dpr;
  canvas.style.width = size + 'px'; canvas.style.height = size + 'px';
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
  const cx = size / 2, cy = size / 2, rO = 72, rI = 48;
  const total = segments.reduce((a, s) => a + s.value, 0);
  ctx.clearRect(0, 0, size, size);

  if (total === 0) {
    ctx.beginPath(); ctx.arc(cx, cy, (rO + rI) / 2, 0, Math.PI * 2);
    ctx.lineWidth = rO - rI; ctx.strokeStyle = '#16271b'; ctx.stroke();
  } else {
    let ang = -Math.PI / 2;
    segments.forEach(s => {
      const a2 = ang + (s.value / total) * Math.PI * 2;
      ctx.beginPath(); ctx.arc(cx, cy, (rO + rI) / 2, ang, a2);
      ctx.lineWidth = rO - rI; ctx.strokeStyle = s.color; ctx.lineCap = 'butt'; ctx.stroke();
      ang = a2;
    });
  }
  // Centro
  ctx.fillStyle = '#eaf2ec'; ctx.textAlign = 'center';
  ctx.font = '700 22px Poppins, sans-serif';
  ctx.fillText(total, cx, cy - 2);
  ctx.font = '11px Inter, sans-serif'; ctx.fillStyle = '#6f8579';
  ctx.fillText('espacios', cx, cy + 15);

  if (legendEl) {
    legendEl.innerHTML = segments.map(s =>
      `<div class="legend-item"><span class="legend-dot" style="background:${s.color}"></span>${s.label}<strong>${s.value}</strong></div>`
    ).join('');
  }
}

/* ============================================================
   11. INICIALIZACIÓN + DATOS DE EJEMPLO
   ============================================================ */
function seedDemo(force) {
  if (!force && (db.reservas.length || db.clientes.length)) return;
  if (force) confirmSeed(); else doSeed();
}
function confirmSeed() {
  confirmAction({ title: 'Cargar datos de ejemplo', okText: 'Cargar',
    msg: 'Se agregarán reservas, clientes y eventos de muestra para que veas el sistema funcionando. ¿Continuar?',
    onOk: () => { doSeed(); navigate('dashboard'); } });
}
function doSeed() {
  const cfg = db.config;
  const hoy = new Date();
  const d = (offset) => isoDate(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + offset));
  const nombres = [
    ['Juan Pérez', '11 2345 6789'], ['Equipo Los Pibes', '11 5566 7788'], ['Martín Gómez', '11 3344 5566'],
    ['Lucas Fernández', '11 9988 7766'], ['Diego Sosa', '11 2211 3344'], ['Cumple Tomás', '11 4455 6677'],
    ['Carlos Díaz', '11 7788 9900'], ['Nicolás Ruiz', '11 1212 3434'],
  ];
  const reservas = [];
  const push = (nombreIdx, courtId, fecha, hora, dur, estado, senaFrac) => {
    const [nombre, tel] = nombres[nombreIdx];
    const c = courtById(courtId);
    const precio = cfg.precios[c.type];
    reservas.push({ id: uid(), nombre, telefono: tel, courtId, fecha, hora, duracion: dur, precio, sena: Math.round(precio * senaFrac), estado, obs: '', createdAt: new Date().toISOString() });
  };
  // Hoy
  push(0, 'c5a', d(0), '18:00', 1, 'Confirmada', 0.5);
  push(1, 'c5b', d(0), '19:00', 1, 'Confirmada', 1);
  push(2, 'c7',  d(0), '20:00', 1.5, 'Pendiente', 0.3);
  push(3, 'c5c', d(0), '21:00', 1, 'Confirmada', 0.5);
  // Mañana
  push(4, 'c5a', d(1), '19:00', 1, 'Confirmada', 0.5);
  push(6, 'c7',  d(1), '20:00', 1, 'Pendiente', 0);
  push(7, 'c8',  d(1), '21:00', 2, 'Confirmada', 0.4);
  // Días pasados (para finanzas/reportes)
  push(0, 'c5a', d(-1), '18:00', 1, 'Finalizada', 1);
  push(1, 'c5b', d(-2), '19:00', 1, 'Finalizada', 1);
  push(3, 'c7',  d(-3), '20:00', 1.5, 'Finalizada', 1);
  push(2, 'c5c', d(-4), '21:00', 1, 'Finalizada', 1);
  push(4, 'c5a', d(-6), '20:00', 1, 'Finalizada', 1);
  push(0, 'c5b', d(-12), '18:00', 1, 'Finalizada', 1);
  push(1, 'c7',  d(-20), '19:00', 1, 'Finalizada', 1);
  push(3, 'c5a', d(-45), '20:00', 1, 'Finalizada', 1);
  push(2, 'c5b', d(-75), '21:00', 1, 'Finalizada', 1);

  db.reservas = reservas;

  // Clientes a partir de las reservas
  db.clientes = [];
  reservas.forEach(upsertClienteFromReserva);

  // Eventos
  db.eventos = [
    { id: uid(), tipo: 'Cumpleaños', cliente: 'Familia Ramírez', telefono: '11 4455 6677', personas: '25', fecha: d(5), hora: '16:00 a 19:00', obs: 'Cumple de 12 años. Pidieron mesa para torta.', createdAt: new Date().toISOString() },
    { id: uid(), tipo: 'Torneo', cliente: 'Liga Amistosa Ituzaingó', telefono: '11 5566 7788', personas: '60', fecha: d(10), hora: '09:00 a 18:00', obs: 'Torneo F5 todo el día. Reservar las 3 canchas.', createdAt: new Date().toISOString() },
  ];

  toast('Datos de ejemplo cargados');
}

// Arranque
function init() {
  // Primera vez: cargar demo automáticamente
  if (!localStorage.getItem(`${APP}_init`)) {
    doSeed();
    localStorage.setItem(`${APP}_init`, '1');
  }
  navigate('dashboard');
  // Redibuja gráficos al rotar/redimensionar
  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => navigate(currentView), 200); });
}

document.addEventListener('DOMContentLoaded', init);

// Exponer funciones usadas en onclick inline
Object.assign(window, {
  navigate, openReservaForm, saveReserva, deleteReserva, recordatorioWA,
  openClienteForm, saveCliente, deleteCliente, waCliente,
  openEventoForm, saveEvento, deleteEvento, waEvento,
  setCalView, calMove, calToday, quickSlot,
  clearResFilter, saveConfig, exportData, wipeData, seedDemo,
  closeModal, confirmAction,
});
