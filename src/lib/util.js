'use strict';
// Utilitas umum: error HTTP, validasi, waktu lokal, format nomor HP.

class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const bad = (msg, extra) => new HttpError(400, msg, extra);
const notFound = (msg = 'Data tidak ditemukan') => new HttpError(404, msg);
const forbidden = (msg = 'Akses ditolak') => new HttpError(403, msg);

const TZ = process.env.APP_TZ || 'Asia/Jakarta';
const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

/** Waktu lokal 'YYYY-MM-DD HH:MM:SS' (zona APP_TZ, default Asia/Jakarta). */
function now(date = new Date()) {
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}
const today = () => now().slice(0, 10);
function addDays(dateStr, days) {
  const d = new Date(dateStr.slice(0, 10) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Normalisasi nomor HP Indonesia ke format 62xxxxxxxx. */
function normPhone(raw) {
  let p = String(raw || '').replace(/\D/g, '');
  if (p.startsWith('0')) p = '62' + p.slice(1);
  else if (p.startsWith('8')) p = '62' + p;
  if (!/^62\d{8,13}$/.test(p)) return null;
  return p;
}

// ---- Validasi ringan ----
function str(v, name, { required = true, max = 500, min = 0 } = {}) {
  if (v === undefined || v === null || String(v).trim() === '') {
    if (required) throw bad(`${name} wajib diisi`);
    return null;
  }
  const s = String(v).trim();
  if (s.length > max) throw bad(`${name} maksimal ${max} karakter`);
  if (s.length < min) throw bad(`${name} minimal ${min} karakter`);
  return s;
}
function int(v, name, { required = true, min = -Infinity, max = Infinity } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) throw bad(`${name} wajib diisi`);
    return null;
  }
  const n = Number(v);
  if (!Number.isInteger(n)) throw bad(`${name} harus bilangan bulat`);
  if (n < min) throw bad(`${name} minimal ${min}`);
  if (n > max) throw bad(`${name} maksimal ${max}`);
  return n;
}
function num(v, name, { required = true, min = -Infinity, max = Infinity } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) throw bad(`${name} wajib diisi`);
    return null;
  }
  const n = Number(v);
  if (!Number.isFinite(n)) throw bad(`${name} harus angka`);
  if (n < min) throw bad(`${name} minimal ${min}`);
  if (n > max) throw bad(`${name} maksimal ${max}`);
  return n;
}
function oneOf(v, name, list) {
  if (!list.includes(v)) throw bad(`${name} tidak valid (pilihan: ${list.join(', ')})`);
  return v;
}
function date(v, name, { required = true } = {}) {
  if (!v) {
    if (required) throw bad(`${name} wajib diisi`);
    return null;
  }
  const s = String(v).trim().replace('T', ' ');
  if (!/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?$/.test(s)) throw bad(`${name} format tanggal salah`);
  return s.length === 16 ? s + ':00' : s;
}

const rupiah = (n) => 'Rp ' + Math.round(n).toLocaleString('id-ID');

module.exports = {
  HttpError, bad, notFound, forbidden, now, today, addDays, normPhone,
  str, int, num, oneOf, date, rupiah, TZ,
};
