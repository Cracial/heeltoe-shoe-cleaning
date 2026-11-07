'use strict';
// API publik (tanpa login): info usaha, daftar layanan, booking jemput, lacak order, bayar QRIS, dispute, kontak.
const { all, get, run, tx, getSetting } = require('../db');
const { bad, notFound, HttpError, now, normPhone, str, oneOf } = require('../lib/util');
const orders = require('../services/orders');
const qr = require('../lib/qr');

const PUBLIC_KEYS = ['business_name', 'tagline', 'about', 'vision', 'mission', 'address', 'phone', 'email', 'open_hours', 'maps_url', 'instagram', 'delivery_fee'];

// Pembatas sederhana per IP untuk endpoint yang menulis data.
const hits = new Map();
function limit(ctx, key, max, windowMs) {
  const k = `${key}:${ctx.ip}`;
  const t = Date.now();
  const arr = (hits.get(k) || []).filter((x) => t - x < windowMs);
  if (arr.length >= max) throw new HttpError(429, 'Terlalu banyak permintaan, coba lagi nanti');
  arr.push(t);
  hits.set(k, arr);
}

/** Cari order berdasarkan kode + nomor HP pelanggan (verifikasi kepemilikan). */
function findOwnedOrder(code, phone) {
  const p = normPhone(phone);
  const o = get(
    `SELECT o.id FROM orders o JOIN customers c ON c.id = o.customer_id
      WHERE o.code = ? COLLATE NOCASE AND c.phone = ?`, String(code || '').trim(), p || '-');
  if (!o) throw notFound('Order tidak ditemukan. Periksa kembali kode order & nomor HP.');
  return o.id;
}

function publicView(id) {
  const o = orders.orderFull(id);
  const pending = o.payments.find((p) => p.method === 'QRIS' && p.status === 'PENDING');
  return {
    code: o.code,
    status: o.status,
    status_label: o.status_label,
    customer_name: o.customer_name,
    return_method: o.return_method,
    created_at: o.created_at,
    due_date: o.due_date,
    items: o.items.map((i) => ({ service_name: i.service_name, shoe: i.shoe, qty: i.qty, price: i.price })),
    subtotal: o.subtotal, discount: o.discount, delivery_fee: o.delivery_fee,
    total: o.total, paid: o.paid, refunded: o.refunded, outstanding: o.outstanding, payment_status: o.payment_status,
    timeline: o.logs.map((l) => ({ status: l.status, label: orders.STATUS[l.status], note: l.note, at: l.created_at })),
    deliveries: o.deliveries.map((d) => ({ type: d.type, status: d.status, label: orders.DSTATUS[d.status], scheduled_at: d.scheduled_at, courier: d.courier_name ? d.courier_name.replace(/\s*\(.*\)/, '') : null })),
    pending_qris: pending ? paymentView(pending) : null,
    disputes: all('SELECT id, code, category, status, resolution, refund_amount, description, created_at FROM disputes WHERE order_id = ? ORDER BY id DESC', id)
      .map((d) => ({ ...d, messages: all('SELECT author_type, author_name, message, created_at FROM dispute_messages WHERE dispute_id = ? ORDER BY id', d.id) })),
  };
}

function paymentView(p) {
  return {
    ref: p.ref, amount: p.amount, status: p.status, method: p.method,
    expires_at: p.expires_at, qris_payload: p.status === 'PENDING' ? p.qris_payload : null,
    qr_svg: p.status === 'PENDING' && p.qris_payload ? qr.toSvg(p.qris_payload) : null,
    is_demo: /DEMO/.test(getSetting('qris_static') || ''),
  };
}

module.exports = (r) => {
  r.get('/api/public/info', () => {
    const out = {};
    for (const k of PUBLIC_KEYS) out[k] = getSetting(k, '');
    out.mission = (out.mission || '').split('|').filter(Boolean);
    out.delivery_fee = Number(out.delivery_fee || 0);
    out.stats = get(`SELECT (SELECT COUNT(*) FROM orders WHERE status IN ('DELIVERED','PICKED_UP')) AS done,
                            (SELECT COUNT(*) FROM customers) AS customers`);
    return out;
  });

  r.get('/api/public/services', () =>
    all('SELECT id, code, name, description, price, duration_days FROM services WHERE active = 1 ORDER BY sort, name'));

  r.post('/api/public/booking', (ctx) => {
    limit(ctx, 'booking', 8, 60 * 60 * 1000);
    const b = ctx.body;
    const name = str(b.name, 'Nama', { max: 80 });
    const phone = str(b.phone, 'Nomor HP', { max: 20 });
    const address = str(b.address, 'Alamat penjemputan', { max: 300 });
    const pairs = Math.min(20, Math.max(1, Number(b.pairs) || 1));
    const svc = b.service_id ? get('SELECT id, name FROM services WHERE id = ? AND active = 1', Number(b.service_id)) : null;
    const schedule = b.schedule ? String(b.schedule).replace('T', ' ').slice(0, 16) : null;
    const returnMethod = b.return_method === 'STORE' ? 'STORE' : 'DELIVERY';
    const notes = [`${pairs} pasang`, svc ? `layanan: ${svc.name}` : null, b.notes ? String(b.notes).slice(0, 300) : null].filter(Boolean).join(' · ');
    const fee = returnMethod === 'DELIVERY' ? Number(getSetting('delivery_fee', 0)) : 0;
    const id = tx(() => {
      const oid = orders.createOrder({
        customer: { name, phone, address }, booked: true, source: 'WEB', returnMethod,
        address: returnMethod === 'DELIVERY' ? address : null, deliveryFee: fee, notes,
      });
      orders.createDelivery(oid, 'PICKUP', { address, phone: normPhone(phone), scheduledAt: schedule ? schedule + ':00' : null, note: 'Booking dari website' });
      return oid;
    });
    const o = get('SELECT code FROM orders WHERE id = ?', id);
    return { code: o.code, message: 'Booking diterima! Kurir kami akan menghubungi Anda sebelum menjemput.' };
  });

  r.post('/api/public/track', (ctx) => {
    limit(ctx, 'track', 60, 10 * 60 * 1000);
    return publicView(findOwnedOrder(ctx.body.code, ctx.body.phone));
  });

  r.post('/api/public/pay-qris', (ctx) => {
    limit(ctx, 'payqris', 20, 10 * 60 * 1000);
    const id = findOwnedOrder(ctx.body.code, ctx.body.phone);
    return paymentView(orders.createQris(id));
  });

  r.post('/api/public/payment-status', (ctx) => {
    const id = findOwnedOrder(ctx.body.code, ctx.body.phone);
    orders.expireStale();
    const p = get('SELECT * FROM payments WHERE ref = ? AND order_id = ?', String(ctx.body.ref || ''), id);
    if (!p) throw notFound('Pembayaran tidak ditemukan');
    return { ...paymentView(p), ...orders.money(id) };
  });

  r.post('/api/public/disputes', (ctx) => {
    limit(ctx, 'dispute', 5, 60 * 60 * 1000);
    const id = findOwnedOrder(ctx.body.code, ctx.body.phone);
    const category = oneOf(ctx.body.category, 'Kategori', ['DAMAGE', 'LOST', 'QUALITY', 'LATE', 'PAYMENT', 'OTHER']);
    const description = str(ctx.body.description, 'Deskripsi keluhan', { max: 1500, min: 10 });
    const o = get('SELECT o.status, c.name FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = ?', id);
    if (o.status === 'CANCELLED') throw bad('Order yang dibatalkan tidak bisa diajukan komplain');
    const open = get(`SELECT code FROM disputes WHERE order_id = ? AND status IN ('OPEN','INVESTIGATING')`, id);
    if (open) throw bad(`Masih ada komplain aktif (${open.code}) untuk order ini. Silakan balas di thread tersebut.`);
    return tx(() => {
      const code = orders.nextCode('disputes', 'DSP');
      const t = now();
      const did = Number(run(`INSERT INTO disputes (code, order_id, category, description, status, source, created_at, updated_at)
                              VALUES (?, ?, ?, ?, 'OPEN', 'CUSTOMER', ?, ?)`, code, id, category, description, t, t).lastInsertRowid);
      run(`INSERT INTO dispute_messages (dispute_id, author_type, author_name, message, created_at) VALUES (?, 'CUSTOMER', ?, ?, ?)`, did, o.name, description, t);
      run(`INSERT INTO dispute_messages (dispute_id, author_type, author_name, message, created_at) VALUES (?, 'SYSTEM', 'Sistem', ?, ?)`,
        did, 'Komplain diterima. Tim kami akan merespons maksimal 1×24 jam kerja.', t);
      return { code, message: 'Komplain terkirim. Pantau balasan kami di halaman ini.' };
    });
  });

  r.post('/api/public/disputes/:code/messages', (ctx) => {
    limit(ctx, 'dmsg', 30, 60 * 60 * 1000);
    const id = findOwnedOrder(ctx.body.order_code, ctx.body.phone);
    const d = get('SELECT * FROM disputes WHERE code = ? AND order_id = ?', ctx.params.code, id);
    if (!d) throw notFound('Komplain tidak ditemukan');
    if (!['OPEN', 'INVESTIGATING'].includes(d.status)) throw bad('Komplain sudah ditutup');
    const message = str(ctx.body.message, 'Pesan', { max: 1500 });
    const c = get('SELECT c.name FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = ?', id);
    run(`INSERT INTO dispute_messages (dispute_id, author_type, author_name, message, created_at) VALUES (?, 'CUSTOMER', ?, ?, ?)`, d.id, c.name, message, now());
    run('UPDATE disputes SET updated_at = ? WHERE id = ?', now(), d.id);
    return { ok: true };
  });

  r.post('/api/public/contact', (ctx) => {
    limit(ctx, 'contact', 5, 60 * 60 * 1000);
    run('INSERT INTO contact_messages (name, phone, message, created_at) VALUES (?, ?, ?, ?)',
      str(ctx.body.name, 'Nama', { max: 80 }), str(ctx.body.phone, 'Nomor HP', { required: false, max: 20 }),
      str(ctx.body.message, 'Pesan', { max: 1500 }), now());
    return { message: 'Terima kasih! Pesan Anda sudah kami terima.' };
  });
};

module.exports.paymentView = paymentView;
