// Utilitas bersama situs publik & aplikasi staf.
(function () {
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rp = (n) => 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  function tgl(s, withTime = true) {
    if (!s) return '-';
    const [d, t] = String(s).split(' ');
    const [y, m, dd] = d.split('-');
    return `${Number(dd)} ${MONTHS[Number(m) - 1]} ${y}` + (withTime && t ? ` ${t.slice(0, 5)}` : '');
  }
  function phoneLocal(p) { return p ? String(p).replace(/^62/, '0') : ''; }
  function wa(phone, text) { return `https://wa.me/${String(phone || '').replace(/\D/g, '')}?text=${encodeURIComponent(text || '')}`; }

  async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch(path, {
      method, credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch { /* bukan JSON */ }
    if (!res.ok) {
      const err = new Error((data && data.error) || `Gagal (${res.status})`);
      err.status = res.status; err.data = data;
      throw err;
    }
    return data;
  }

  function toast(msg, type = '') {
    let box = document.querySelector('.toasts');
    if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('role', 'status'); document.body.appendChild(box); }
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => el.remove(), type === 'err' ? 6000 : 3500);
  }

  /** Modal sederhana. content = HTML string. Mengembalikan elemen modal + close(). */
  function modal({ title, content, wide = false, onClose } = {}) {
    const bd = document.createElement('div');
    bd.className = 'modal-backdrop';
    bd.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head"><h3>${esc(title)}</h3><button class="x-btn" data-close aria-label="Tutup">×</button></div>
      <div class="modal-content">${content}</div></div>`;
    const close = () => { bd.remove(); document.removeEventListener('keydown', onKey); onClose && onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    bd.addEventListener('mousedown', (e) => { if (e.target === bd) close(); });
    bd.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
    document.addEventListener('keydown', onKey);
    document.body.appendChild(bd);
    const first = bd.querySelector('input, select, textarea');
    if (first) setTimeout(() => first.focus(), 30);
    return { el: bd, close };
  }

  /** Ambil isi form sebagai objek (angka untuk input number). */
  function formData(form) {
    const out = {};
    for (const el of form.elements) {
      if (!el.name || el.disabled) continue;
      if (el.type === 'checkbox') out[el.name] = el.checked;
      else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
      else if (el.type === 'number') out[el.name] = el.value === '' ? '' : Number(el.value);
      else out[el.name] = el.value;
    }
    return out;
  }

  async function withBusy(btn, fn) {
    if (!btn) return fn();
    const html = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';
    try { return await fn(); } finally { btn.disabled = false; btn.innerHTML = html; }
  }

  const ORDER_BADGE = {
    BOOKED: 'b-sun', RECEIVED: 'b-info', WASHING: 'b-brand', QC: 'b-brand', READY: 'b-ok',
    DELIVERING: 'b-info', DELIVERED: '', PICKED_UP: '', CANCELLED: 'b-danger',
  };
  const PAY_LABEL = { UNPAID: ['Belum bayar', 'b-danger'], PARTIAL: ['DP / sebagian', 'b-warn'], PAID: ['Lunas', 'b-ok'] };
  const DISPUTE_CAT = { DAMAGE: 'Kerusakan', LOST: 'Kehilangan', QUALITY: 'Hasil kurang bersih', LATE: 'Keterlambatan', PAYMENT: 'Pembayaran', OTHER: 'Lainnya' };
  const DISPUTE_STATUS = { OPEN: ['Baru', 'b-danger'], INVESTIGATING: ['Ditangani', 'b-warn'], RESOLVED: ['Selesai', 'b-ok'], REJECTED: ['Ditolak', ''] };

  window.SK = { esc, rp, tgl, phoneLocal, wa, api, toast, modal, formData, withBusy, ORDER_BADGE, PAY_LABEL, DISPUTE_CAT, DISPUTE_STATUS };
})();
