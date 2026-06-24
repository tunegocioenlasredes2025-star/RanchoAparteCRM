/* ============================================================
   Rancho Aparte · Reservas online (web pública)
   Habla directo con Supabase usando la publishable key.
   ============================================================ */
(function () {
  'use strict';

  const cfg = window.RANCHO;
  const sb = window.supabase.createClient(window.SUPA_URL, window.SUPA_KEY);

  // ---------- Estado ----------
  const state = {
    fecha: null,          // 'YYYY-MM-DD'
    courtId: cfg.courts[0].id,
    duracion: 1,
    hora: null,           // 'HH:00'
    busy: {},             // { 'c5a': Set(horas ocupadas), ... }
    comprobanteFile: null,
  };

  // ---------- Utilidades ----------
  const pad = (n) => String(n).padStart(2, '0');
  const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const money = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR');
  const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseISO = (s) => { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); };
  const courtById = (id) => cfg.courts.find(c => c.id === id);
  const precioCancha = (court, dur) => cfg.precios[court.type] * dur;
  const sena = (precio) => Math.round(precio * cfg.senaPorcentaje / 100);
  const $ = (id) => document.getElementById(id);

  // ---------- 1. Fechas (hoy + 13 días) ----------
  function renderDates() {
    const box = $('dateChips');
    box.innerHTML = '';
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    for (let i = 0; i < 14; i++) {
      const d = new Date(hoy); d.setDate(hoy.getDate() + i);
      const iso = isoDate(d);
      const b = document.createElement('button');
      b.className = 'chip' + (i === 0 ? ' active' : '');
      b.innerHTML = `${i === 0 ? 'Hoy' : DIAS[d.getDay()]}<small>${d.getDate()} ${MESES[d.getMonth()]}</small>`;
      b.onclick = () => { state.fecha = iso; setActive(box, b); loadAvailability(); };
      box.appendChild(b);
      if (i === 0) state.fecha = iso;
    }
  }

  // ---------- 2. Canchas ----------
  function renderCourts() {
    const box = $('courtChips');
    box.innerHTML = '';
    cfg.courts.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'chip' + (c.id === state.courtId ? ' active' : '');
      b.innerHTML = `${c.short}<small>${c.type}</small>`;
      b.onclick = () => { state.courtId = c.id; setActive(box, b); renderSlots(); };
      box.appendChild(b);
    });
  }

  // ---------- 3. Duración ----------
  function bindDuration() {
    $('durToggle').querySelectorAll('button').forEach(b => {
      b.onclick = () => {
        state.duracion = Number(b.dataset.dur);
        $('durToggle').querySelectorAll('button').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        renderSlots();
      };
    });
  }

  function setActive(box, el) {
    box.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
  }

  // ---------- 4. Disponibilidad ----------
  async function loadAvailability() {
    $('slots').innerHTML = '<div class="loading">Buscando horarios…</div>';
    state.busy = {};
    cfg.courts.forEach(c => { if (cfg.occupies[c.id].length === 1) state.busy[c.id] = new Set(); });

    const { data, error } = await sb.rpc('slots_ocupados', { dia: state.fecha });
    if (error) {
      $('slots').innerHTML = '<div class="slots-empty">No se pudo cargar la disponibilidad. Probá de nuevo.</div>';
      console.error(error);
      return;
    }
    // Expandir cada reserva ocupada a sus espacios físicos y horas
    (data || []).forEach(r => {
      const spaces = cfg.occupies[r.court_id] || [r.court_id];
      const start = parseInt(r.hora, 10);
      const dur = Math.ceil(Number(r.duracion) || 1);
      for (let h = start; h < start + dur; h++) {
        spaces.forEach(sp => { if (state.busy[sp]) state.busy[sp].add(h); });
      }
    });
    renderSlots();
  }

  function isFree(courtId, hora, dur) {
    const spaces = cfg.occupies[courtId];
    for (let h = hora; h < hora + dur; h++) {
      for (const sp of spaces) {
        if (state.busy[sp] && state.busy[sp].has(h)) return false;
      }
    }
    return true;
  }

  function renderSlots() {
    const box = $('slots');
    box.innerHTML = '';
    const open = cfg.horaApertura, close = cfg.horaCierre, dur = state.duracion;
    const hoyISO = isoDate(new Date());
    const ahora = new Date().getHours();
    let any = false;
    for (let h = open; h + dur <= close; h++) {
      const past = state.fecha === hoyISO && h <= ahora;       // no mostrar horas ya pasadas hoy
      const free = isFree(state.courtId, h, dur) && !past;
      if (past) continue;
      any = true;
      const b = document.createElement('button');
      b.className = 'slot';
      b.textContent = `${pad(h)}:00`;
      b.disabled = !free;
      if (free) b.onclick = () => openForm(h);
      box.appendChild(b);
    }
    if (!any || !box.querySelector('.slot:not(:disabled)')) {
      if (!box.querySelector('.slot')) box.innerHTML = '<div class="slots-empty">No quedan horarios para esta combinación.</div>';
    }
  }

  // ---------- 5. Formulario ----------
  function openForm(hora) {
    state.hora = `${pad(hora)}:00`;
    const court = courtById(state.courtId);
    const precio = precioCancha(court, state.duracion);
    const montoSena = sena(precio);
    const d = parseISO(state.fecha);
    const fechaTxt = `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}`;
    const finH = hora + state.duracion;

    $('resumen').innerHTML = `
      <div class="r-line"><span>Cancha</span><strong>${court.name}</strong></div>
      <div class="r-line"><span>Día</span><strong>${fechaTxt}</strong></div>
      <div class="r-line"><span>Horario</span><strong>${state.hora} a ${pad(finH)}:00</strong></div>
      <div class="r-line"><span>Precio total</span><strong>${money(precio)}</strong></div>
      <div class="r-line r-tot"><span>Seña a pagar ahora</span><strong>${money(montoSena)}</strong></div>`;

    $('aliasTxt').textContent = cfg.aliasPago;
    $('senaMonto').textContent = `Monto de la seña: ${money(montoSena)}`;
    state._precio = precio; state._sena = montoSena;

    $('flow').classList.add('hidden');
    $('done').classList.add('hidden');
    $('form').classList.remove('hidden');
    window.scrollTo(0, 0);
  }

  function bindForm() {
    $('btnVolver').onclick = () => { $('form').classList.add('hidden'); $('flow').classList.remove('hidden'); window.scrollTo(0,0); };
    $('btnOtra').onclick = () => { resetAll(); };

    $('copyAlias').onclick = () => {
      navigator.clipboard?.writeText(cfg.aliasPago);
      $('copyAlias').textContent = '¡Copiado!';
      setTimeout(() => { $('copyAlias').textContent = 'Copiar'; }, 1500);
    };

    const fileInput = $('fComprobante');
    $('fileDrop').onclick = () => fileInput.click();
    fileInput.onchange = () => {
      const f = fileInput.files[0];
      state.comprobanteFile = f || null;
      if (f) {
        $('fileDrop').classList.add('has-file');
        $('fileLabel').innerHTML = `<span class="file-name">${f.name}</span>`;
        $('fileDrop').querySelector('.fd-ic').textContent = '✓';
      }
    };

    $('btnConfirmar').onclick = submitReserva;
  }

  // ---------- 6. Enviar reserva ----------
  async function submitReserva() {
    const nombre = $('fNombre').value.trim();
    const tel = $('fTel').value.trim();
    const err = $('formErr');
    err.classList.add('hidden');

    if (!nombre) return showErr('Ingresá tu nombre.');
    if (!tel || tel.replace(/\D/g, '').length < 6) return showErr('Ingresá un teléfono válido.');
    if (!state.comprobanteFile) return showErr('Subí la captura del comprobante de la seña.');

    const btn = $('btnConfirmar');
    btn.disabled = true; btn.textContent = 'Enviando…';

    try {
      // a) Subir comprobante a Storage
      const ext = (state.comprobanteFile.name.split('.').pop() || 'jpg').toLowerCase();
      const rid = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      const path = `${state.fecha}/${rid}.${ext}`;
      const up = await sb.storage.from('comprobantes').upload(path, state.comprobanteFile, {
        cacheControl: '3600', upsert: false,
      });
      if (up.error) throw up.error;
      const { data: pub } = sb.storage.from('comprobantes').getPublicUrl(path);

      // b) Crear la reserva (provisoria, pendiente de validar la seña)
      const holdExpira = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      const ins = await sb.from('reservas').insert({
        id: rid,
        nombre, telefono: tel,
        court_id: state.courtId,
        fecha: state.fecha,
        hora: state.hora,
        duracion: state.duracion,
        precio: state._precio,
        sena: 0,                          // se acredita cuando el dueño valida
        estado: 'Pendiente',
        origen: 'web',
        pago_estado: 'comprobante',
        comprobante_url: pub.publicUrl,
        hold_expira: holdExpira,
      });
      if (ins.error) throw ins.error;

      showDone(nombre);
    } catch (e) {
      console.error(e);
      showErr('No se pudo completar la reserva. ' + (e.message || 'Probá de nuevo.'));
      btn.disabled = false; btn.textContent = 'Confirmar reserva';
    }
  }

  function showErr(msg) {
    const err = $('formErr');
    err.textContent = msg; err.classList.remove('hidden');
    const btn = $('btnConfirmar'); btn.disabled = false; btn.textContent = 'Confirmar reserva';
  }

  function showDone(nombre) {
    const court = courtById(state.courtId);
    const d = parseISO(state.fecha);
    const fechaTxt = `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}`;
    $('doneResumen').innerHTML = `<strong>${court.name}</strong> · ${fechaTxt} · ${state.hora}`;
    const msg = encodeURIComponent(`Hola! Hice una reserva web: ${nombre}, ${court.name}, ${fechaTxt} ${state.hora}. Te paso el comprobante.`);
    $('waLink').href = `https://wa.me/${cfg.whatsapp}?text=${msg}`;
    $('form').classList.add('hidden');
    $('flow').classList.add('hidden');
    $('done').classList.remove('hidden');
    window.scrollTo(0, 0);
  }

  function resetAll() {
    state.hora = null; state.comprobanteFile = null;
    $('fNombre').value = ''; $('fTel').value = '';
    $('fComprobante').value = '';
    $('fileDrop').classList.remove('has-file');
    $('fileLabel').textContent = 'Tocá para subir el comprobante';
    $('fileDrop').querySelector('.fd-ic').textContent = '⬆';
    $('btnConfirmar').disabled = false; $('btnConfirmar').textContent = 'Confirmar reserva';
    $('done').classList.add('hidden'); $('form').classList.add('hidden');
    $('flow').classList.remove('hidden');
    loadAvailability();
    window.scrollTo(0, 0);
  }

  // ---------- Init ----------
  renderDates();
  renderCourts();
  bindDuration();
  bindForm();
  loadAvailability();
})();
