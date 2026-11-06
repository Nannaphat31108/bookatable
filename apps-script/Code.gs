/**
 * Ember & Oak — Google Sheets booking backend (Google Apps Script)
 *
 * วิธีติดตั้ง: ดู README.md ในโฟลเดอร์หลักของโปรเจกต์
 *
 * GET  ?action=availability&date=YYYY-MM-DD  → { ok, bookings: [{ table, time }] }
 *      (ส่งกลับเฉพาะโต๊ะและเวลา ไม่มีข้อมูลส่วนตัวของลูกค้า)
 * POST { action: "create", date, time, guests, table, name, phone, email, occasion, note }
 *      → { ok, code } หรือ { ok: false, error }
 * POST { action: "cancel", code, phone } → { ok } หรือ { ok: false, error }
 */

const SHEET_NAME = 'Bookings';
const HEADERS = ['รหัสการจอง', 'เวลาที่จอง', 'สถานะ', 'วันที่', 'เวลา', 'จำนวนแขก', 'โต๊ะ',
  'ชื่อ', 'เบอร์โทร', 'อีเมล', 'โอกาสพิเศษ', 'หมายเหตุ'];
const COL = { code: 0, createdAt: 1, status: 2, date: 3, time: 4, guests: 5, table: 6,
  name: 7, phone: 8, email: 9, occasion: 10, note: 11 };

const STATUS_CONFIRMED = 'ยืนยันแล้ว';
const STATUS_CANCELLED = 'ยกเลิก';

const DINING_MINUTES = 120;
const DAYS_AHEAD = 60;
const SLOTS = ['17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00', '21:30'];
// ต้องตรงกับ TABLES ใน script.js
const TABLE_SEATS = { W1: 2, W2: 2, W3: 4, W4: 4, M1: 4, M2: 6, M3: 4,
  B1: 2, B2: 2, B3: 2, P1: 8, P2: 10, G1: 4, G2: 4 };

// ---------- Entry points ----------

function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    if (p.action === 'availability') {
      if (!isValidDate(p.date)) return json({ ok: false, error: 'BAD_DATE' });
      const bookings = activeRows()
        .filter((r) => r[COL.date] === p.date)
        .map((r) => ({ table: r[COL.table], time: r[COL.time] }));
      return json({ ok: true, bookings: bookings });
    }
    return json({ ok: true, service: 'Ember & Oak bookings' });
  } catch (err) {
    return json({ ok: false, error: 'SERVER', message: String(err) });
  }
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json({ ok: false, error: 'BAD_JSON' });
  }

  // กันการจองซ้อนกันเมื่อมีคนกดจองพร้อมกัน
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return json({ ok: false, error: 'BUSY' });
  try {
    if (body.action === 'create') return json(createBooking(body));
    if (body.action === 'cancel') return json(cancelBooking(body));
    return json({ ok: false, error: 'BAD_ACTION' });
  } catch (err) {
    return json({ ok: false, error: 'SERVER', message: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// ---------- Actions ----------

function createBooking(b) {
  const guests = Number(b.guests);
  const phone = String(b.phone || '').replace(/\D/g, '');
  const name = String(b.name || '').trim();

  if (!isValidDate(b.date) || b.date < today() || b.date > daysFromToday(DAYS_AHEAD)) {
    return { ok: false, error: 'BAD_DATE' };
  }
  if (SLOTS.indexOf(b.time) === -1) return { ok: false, error: 'BAD_TIME' };
  if (!(guests >= 1 && guests <= 10 && guests === Math.floor(guests))) return { ok: false, error: 'BAD_GUESTS' };
  if (!TABLE_SEATS[b.table] || TABLE_SEATS[b.table] < guests) return { ok: false, error: 'BAD_TABLE' };
  if (!name || name.length > 100) return { ok: false, error: 'BAD_NAME' };
  if (!/^0\d{8,9}$/.test(phone)) return { ok: false, error: 'BAD_PHONE' };

  const t = toMin(b.time);
  const clash = activeRows().some((r) =>
    r[COL.date] === b.date && r[COL.table] === b.table && Math.abs(toMin(r[COL.time]) - t) < DINING_MINUTES);
  if (clash) return { ok: false, error: 'TAKEN' };

  const code = newCode();
  const row = [];
  row[COL.code] = code;
  row[COL.createdAt] = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  row[COL.status] = STATUS_CONFIRMED;
  row[COL.date] = b.date;
  row[COL.time] = b.time;
  row[COL.guests] = String(guests);
  row[COL.table] = b.table;
  row[COL.name] = clean(name, 100);
  row[COL.phone] = phone;
  row[COL.email] = clean(b.email, 120);
  row[COL.occasion] = clean(b.occasion, 50);
  row[COL.note] = clean(b.note, 500);

  const sheet = getSheet();
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, HEADERS.length).setValues([row]);
  return { ok: true, code: code };
}

function cancelBooking(b) {
  const code = String(b.code || '');
  const phone = String(b.phone || '').replace(/\D/g, '');
  const sheet = getSheet();
  const rows = allRows();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r[COL.code] === code && r[COL.phone] === phone) {
      if (r[COL.status] === STATUS_CANCELLED) return { ok: true };
      sheet.getRange(i + 2, COL.status + 1).setValue(STATUS_CANCELLED);
      return { ok: true };
    }
  }
  return { ok: false, error: 'NOT_FOUND' };
}

// ---------- Sheet helpers ----------

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    // เก็บทุกช่องเป็นข้อความ เพื่อไม่ให้ Sheets แปลงวันที่/เวลา หรือตัดเลข 0 หน้าเบอร์โทร
    sheet.getRange(1, 1, sheet.getMaxRows(), HEADERS.length).setNumberFormat('@');
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS])
      .setFontWeight('bold').setBackground('#2e2219').setFontColor('#f1e6d6');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function allRows() {
  const sheet = getSheet();
  const n = sheet.getLastRow() - 1;
  if (n < 1) return [];
  return sheet.getRange(2, 1, n, HEADERS.length).getDisplayValues();
}

function activeRows() {
  return allRows().filter((r) => r[COL.status] !== STATUS_CANCELLED);
}

// ---------- Utils ----------

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function isValidDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function today() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function daysFromToday(n) {
  return Utilities.formatDate(new Date(Date.now() + n * 86400000), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function toMin(t) {
  const parts = String(t).split(':');
  return Number(parts[0]) * 60 + Number(parts[1]);
}

function newCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = 'EO';
  for (let i = 0; i < 6; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

// ตัดความยาว และกันไม่ให้ข้อความถูกตีความเป็นสูตรใน Sheets
function clean(v, max) {
  let s = String(v == null ? '' : v).trim().slice(0, max);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}
