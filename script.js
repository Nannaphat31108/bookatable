(() => {
  'use strict';

  // ---------- Config ----------
  const STORAGE_KEY = 'ember-oak-bookings';
  const MAX_GUESTS = 10;
  const DAYS_AHEAD = 60;
  const DINING_MINUTES = 120; // a booking holds its table for 2 hours
  const SLOTS = ['17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00', '21:30'];

  // x / y are percentages on the floor plan; w / h are pixel sizes
  const TABLES = [
    // ริมหน้าต่าง
    { id: 'W1', seats: 2, shape: 'round', x: 12, y: 24, w: 54 },
    { id: 'W2', seats: 2, shape: 'round', x: 27, y: 24, w: 54 },
    { id: 'W3', seats: 4, shape: 'round', x: 43, y: 24, w: 66 },
    { id: 'W4', seats: 4, shape: 'round', x: 57, y: 24, w: 66 },
    // กลางร้าน
    { id: 'M1', seats: 4, shape: 'round', x: 13, y: 52, w: 66 },
    { id: 'M2', seats: 6, shape: 'rect',  x: 32, y: 52, w: 100, h: 62 },
    { id: 'M3', seats: 4, shape: 'round', x: 52, y: 52, w: 66 },
    // บาร์ไวน์
    { id: 'B1', seats: 2, shape: 'round', x: 14, y: 76, w: 50 },
    { id: 'B2', seats: 2, shape: 'round', x: 30, y: 76, w: 50 },
    { id: 'B3', seats: 2, shape: 'round', x: 46, y: 76, w: 50 },
    // ห้องส่วนตัว
    { id: 'P1', seats: 8,  shape: 'rect', x: 83, y: 24, w: 112, h: 64 },
    { id: 'P2', seats: 10, shape: 'rect', x: 83, y: 52, w: 124, h: 70 },
    // มุมสวน
    { id: 'G1', seats: 4, shape: 'round', x: 76, y: 84, w: 62 },
    { id: 'G2', seats: 4, shape: 'round', x: 91, y: 84, w: 62 },
  ];
  const ZONE = { W: 'ริมหน้าต่าง', M: 'กลางร้าน', B: 'บาร์ไวน์', P: 'ห้องส่วนตัว', G: 'มุมสวน' };

  // ---------- State ----------
  const state = { date: '', time: '', guests: 2, table: null, step: 1 };

  // ---------- Helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const pad = (n) => String(n).padStart(2, '0');
  const toISODate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseDate = (s) => new Date(`${s}T00:00:00`);
  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

  const fmtDateLong = (s) => parseDate(s).toLocaleDateString('th-TH', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  const fmtMonthShort = (s) => parseDate(s).toLocaleDateString('th-TH', { month: 'short' });

  function loadBookings() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; }
  }
  function saveBookings(list) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch { /* storage unavailable */ }
  }

  // Deterministic pseudo-random so "other guests'" bookings stay stable for a given date/time/table
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) / 4294967295;
  }

  function isTaken(tableId, date, time) {
    const t = toMin(time);
    // Simulated bookings from other guests: a table stays occupied for the dining window
    for (const s of SLOTS) {
      const st = toMin(s);
      if (st <= t && t < st + DINING_MINUTES && hash(`${date}|${s}|${tableId}`) < 0.18) return true;
    }
    // The visitor's own bookings
    return loadBookings().some((b) =>
      b.table === tableId && b.date === date && Math.abs(toMin(b.time) - t) < DINING_MINUTES);
  }

  const fits = (table, guests) => table.seats >= guests;

  function slotIsPast(date, time) {
    const now = new Date();
    if (date !== toISODate(now)) return false;
    return toMin(time) <= now.getHours() * 60 + now.getMinutes() + 30;
  }

  function slotHasTable(date, time, guests) {
    return TABLES.some((t) => fits(t, guests) && !isTaken(t.id, date, time));
  }

  // ---------- Step 1: date, guests, time ----------
  const dateInput = $('#date');
  const guestsInput = $('#guests');
  const slotsEl = $('#timeSlots');

  function initDate() {
    const today = new Date();
    const max = new Date(); max.setDate(max.getDate() + DAYS_AHEAD);
    dateInput.min = toISODate(today);
    dateInput.max = toISODate(max);
    // If it's too late to book today, default to tomorrow
    const lastSlot = SLOTS[SLOTS.length - 1];
    if (slotIsPast(toISODate(today), lastSlot)) today.setDate(today.getDate() + 1);
    dateInput.value = state.date = toISODate(today);
  }

  function renderSlots() {
    slotsEl.innerHTML = '';
    let stillSelected = false;
    SLOTS.forEach((time) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'slot';
      btn.textContent = time;
      btn.setAttribute('role', 'radio');
      const disabled = !state.date || slotIsPast(state.date, time) || !slotHasTable(state.date, time, state.guests);
      btn.disabled = disabled;
      const checked = !disabled && state.time === time;
      if (checked) stillSelected = true;
      btn.setAttribute('aria-checked', String(checked));
      btn.addEventListener('click', () => {
        state.time = time;
        state.table = null;
        $('#err1').textContent = '';
        renderSlots();
      });
      slotsEl.appendChild(btn);
    });
    if (!stillSelected) state.time = '';
  }

  dateInput.addEventListener('change', () => {
    state.date = dateInput.value;
    state.table = null;
    renderSlots();
  });

  $$('[data-guests]').forEach((btn) => btn.addEventListener('click', () => {
    const v = Math.min(MAX_GUESTS, Math.max(1, state.guests + Number(btn.dataset.guests)));
    state.guests = v;
    guestsInput.value = v;
    if (state.table && !fits(TABLES.find((t) => t.id === state.table), v)) state.table = null;
    renderSlots();
  }));

  // ---------- Step 2: floor plan ----------
  const floor = $('#floor');

  function renderFloor() {
    $$('.table', floor).forEach((n) => n.remove());
    TABLES.forEach((t) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `table ${t.shape}`;
      btn.style.left = `${t.x}%`;
      btn.style.top = `${t.y}%`;
      btn.style.setProperty('--w', t.w);
      btn.style.setProperty('--h', t.h || t.w);
      btn.innerHTML = `${t.id}<small>${t.seats} ที่</small>`;

      const taken = isTaken(t.id, state.date, state.time);
      const tooSmall = !fits(t, state.guests);
      let label = `โต๊ะ ${t.id} ${ZONE[t.id[0]]} ${t.seats} ที่นั่ง`;
      if (taken) { btn.classList.add('taken'); btn.disabled = true; label += ' ไม่ว่าง'; }
      else if (tooSmall) { btn.classList.add('small'); btn.disabled = true; label += ' ที่นั่งไม่พอ'; }
      else if (state.table === t.id) { btn.classList.add('picked'); label += ' เลือกแล้ว'; }
      btn.setAttribute('aria-label', label);
      btn.setAttribute('aria-pressed', String(state.table === t.id));

      btn.addEventListener('click', () => {
        state.table = t.id;
        $('#err2').textContent = '';
        renderFloor();
      });
      floor.appendChild(btn);
    });

    const info = $('#pickedInfo');
    if (state.table) {
      const t = TABLES.find((x) => x.id === state.table);
      info.innerHTML = `เลือกโต๊ะ <b>${t.id}</b> · ${ZONE[t.id[0]]} · ${t.seats} ที่นั่ง`;
    } else {
      info.textContent = 'แตะที่โต๊ะเพื่อเลือก';
    }
  }

  function summaryHTML(withTable) {
    let s = `<b>${fmtDateLong(state.date)}</b> · เวลา <b>${state.time} น.</b> · <b>${state.guests} ท่าน</b>`;
    if (withTable && state.table) s += ` · โต๊ะ <b>${state.table}</b> (${ZONE[state.table[0]]})`;
    return s;
  }

  // ---------- Step navigation ----------
  function validateStep(n) {
    if (n === 1) {
      if (!state.date) return ['err1', 'กรุณาเลือกวันที่'];
      if (!state.time) return ['err1', 'กรุณาเลือกเวลา'];
    }
    if (n === 2 && !state.table) return ['err2', 'กรุณาเลือกโต๊ะ'];
    return null;
  }

  function goTo(step) {
    // Only validate when moving forward
    for (let s = 1; s < step; s++) {
      const err = validateStep(s);
      if (err) { $(`#${err[0]}`).textContent = err[1]; step = s; break; }
    }
    state.step = step;
    $$('.step-panel').forEach((p) => { p.hidden = Number(p.dataset.panel) !== step; });
    $$('.steps li').forEach((li) => {
      const n = Number(li.dataset.step);
      li.classList.toggle('active', n === step);
      li.classList.toggle('done', n < step);
    });
    if (step === 1) renderSlots();
    if (step === 2) { $('#summary2').innerHTML = summaryHTML(false); renderFloor(); }
    if (step === 3) { $('#summary3').innerHTML = summaryHTML(true); $('#name').focus({ preventScroll: true }); }
    $('#booking').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  $$('[data-next]').forEach((btn) => btn.addEventListener('click', () => goTo(Number(btn.dataset.next))));

  // ---------- Step 3: submit ----------
  const form = $('#bookingForm');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#name');
    const phone = $('#phone');
    const email = $('#email');
    [name, phone, email].forEach((i) => i.classList.remove('invalid'));

    const digits = phone.value.replace(/\D/g, '');
    let msg = '';
    if (!name.value.trim()) { name.classList.add('invalid'); msg = 'กรุณากรอกชื่อ'; }
    else if (!/^0\d{8,9}$/.test(digits)) { phone.classList.add('invalid'); msg = 'เบอร์โทรไม่ถูกต้อง'; }
    else if (email.value && !email.checkValidity()) { email.classList.add('invalid'); msg = 'อีเมลไม่ถูกต้อง'; }
    if (msg) { $('#err3').textContent = msg; return; }

    // Re-check availability in case it changed while filling the form
    if (isTaken(state.table, state.date, state.time)) {
      $('#err2').textContent = 'ขออภัย โต๊ะนี้เพิ่งถูกจอง กรุณาเลือกใหม่';
      state.table = null;
      goTo(2);
      return;
    }

    const code = 'EO' + Date.now().toString(36).slice(-5).toUpperCase();
    const booking = {
      code,
      date: state.date,
      time: state.time,
      guests: state.guests,
      table: state.table,
      name: name.value.trim(),
      phone: digits,
      email: email.value.trim(),
      occasion: $('#occasion').value,
      note: $('#note').value.trim(),
      createdAt: new Date().toISOString(),
    };
    const list = loadBookings();
    list.push(booking);
    saveBookings(list);

    $('#confirmText').innerHTML =
      `คุณ${escapeHTML(booking.name)} — ${summaryHTML(true)}<br>เราจะโทรยืนยันที่ ${escapeHTML(phone.value)} ภายใน 1 ชั่วโมง`;
    $('#confirmCode').textContent = code;
    const dlg = $('#confirmDialog');
    if (typeof dlg.showModal === 'function') dlg.showModal(); else alert(`จองสำเร็จ รหัส ${code}`);

    // reset
    form.reset();
    $('#err3').textContent = '';
    state.time = '';
    state.table = null;
    state.guests = 2;
    guestsInput.value = 2;
    dateInput.value = state.date;
    renderBookings();
    goTo(1);
  });

  $('#confirmDialog').addEventListener('close', () => {
    $('#mybookings').scrollIntoView({ behavior: 'smooth' });
  });

  // ---------- My bookings ----------
  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function renderBookings() {
    const el = $('#bookingList');
    const today = toISODate(new Date());
    const list = loadBookings()
      .filter((b) => b.date >= today)
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

    if (!list.length) {
      el.innerHTML = '<div class="empty">ยังไม่มีการจอง — <a href="#booking" style="color:var(--amber)">จองโต๊ะแรกของคุณ</a></div>';
      return;
    }
    el.innerHTML = list.map((b) => `
      <article class="booking-item">
        <div class="booking-date"><b>${parseDate(b.date).getDate()}</b><span>${fmtMonthShort(b.date)}</span></div>
        <div class="booking-meta">
          <h4>${b.time} น. · ${b.guests} ท่าน · โต๊ะ ${b.table} (${ZONE[b.table[0]]})</h4>
          <p>${escapeHTML(b.name)}${b.occasion ? ' · ' + escapeHTML(b.occasion) : ''}</p>
          <p><code>${b.code}</code></p>
        </div>
        <button class="btn-cancel" data-cancel="${b.code}">ยกเลิก</button>
      </article>`).join('');

    $$('[data-cancel]', el).forEach((btn) => btn.addEventListener('click', () => {
      if (!confirm('ต้องการยกเลิกการจองนี้ใช่ไหม?')) return;
      saveBookings(loadBookings().filter((b) => b.code !== btn.dataset.cancel));
      renderBookings();
      if (state.step === 1) renderSlots();
      if (state.step === 2) renderFloor();
    }));
  }

  // ---------- Init ----------
  initDate();
  renderSlots();
  renderBookings();
})();
