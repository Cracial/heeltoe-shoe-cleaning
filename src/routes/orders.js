'use strict';
// API front office: pelanggan, order, status produksi, pembayaran, delivery & dispatch.
const crypto = require('node:crypto');
const { all, get, getSetting } = require('../db');
const { bad, notFound, HttpError, normPhone, str, int, oneOf, date } = require('../lib/util');
const { requireRole } = require('../lib/auth');
const orders = require('../services/orders');
const qr = require('../lib/qr');
const { paymentView } = require('./public');

const STAFF = requireRole('frontoffice', 'backoffice');
const FO = requireRole('frontoffice');
const DISPATCH = requireRole('frontoffice', 'backoffice');

function readOrderInput(b, partial = false) {
  const returnMethod = b.return_method === undefined && partial ? undefined : oneOf(b.return_method || 'STORE', 'Metode pengembalian', ['STORE', 'DELIVERY']);
  return {
    items: b.items || [],
    discount: b.discount === undefined && partial ? undefined : int(b.discount || 0, 'Diskon', { min: 0, max: 100000000 }),
    deliveryFee: b.delivery_fee === undefined && partial ? undefined : int(b.delivery_fee || 0, 'Ongkir', { min: 0, max: 10000000 }),
    returnMethod,
    address: b.address === undefined && partial ? undefined : str(b.address, 'Alamat', { required: false, max: 300 }),
    notes: b.notes === undefined && partial ? undefined : str(b.notes, 'Catatan', { required: false, max: 500 }),
  };
}

module.exports = (r) => {
  // ---------- Pelanggan ----------
  r.get('/api/customers', STAFF, (ctx) => {
    const q = String(ctx.query.q || '').trim();
    if (!q) return all('SELECT * FROM customers ORDER BY id DESC LIMIT 30');
    const digits = q.replace(/\D/g, '');
    return all(
      `SELECT c.*, (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) AS order_count
         FROM customers c WHERE c.name LIKE ? OR (? <> '' AND c.phone LIKE ?) ORDER BY c.name LIMIT 20`,
      `%${q}%`, digits, `%${digits.replace(/^0/, '')}%`);
  });

  r.get('/api/customers/by-phone/:phone', STAFF, (ctx) => {
    const p = normPhone(ctx.params.phone);
    if (!p) return null;
    const c = get('SELECT * FROM customers WHERE phone = ?', p);
    if (!c) return null;
    c.recent_orders = all('SELECT id, code, status, total, created_at FROM orders WHERE customer_id = ? ORDER BY id DESC LIMIT 5', c.id);
    return c;
  });

  // ---------- Order ----------
  r.get('/api/orders', requireRole('frontoffice', 'backoffice'), (ctx) => {
    orders.expireStale();
    const { status, q, from, to, active } = ctx.query;
    const where = [];
    const params = [];
    if (status) { where.push('o.status = ?'); params.push(status); }
    if (active === '1') where.push(`o.status NOT IN ('DELIVERED','PICKED_UP','CANCELLED')`);
    if (from) { where.push('substr(o.created_at, 1, 10) >= ?'); params.push(from); }
    if (to) { where.push('substr(o.created_at, 1, 10) <= ?'); params.push(to); }
    if (q) {
      where.push('(o.code LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)');
      const digits = String(q).replace(/\D/g, '').replace(/^0/, '');
      params.push(`%${q}%`, `%${q}%`, digits ? `%${digits}%` : '-');
    }
    const rows = all(
      `SELECT o.id, o.code, o.status, o.source, o.return_method, o.total, o.due_date, o.created_at,
              c.name AS customer_name, c.phone AS customer_phone,
              (SELECT COALESCE(SUM(amount), 0) FROM payments p WHERE p.order_id = o.id AND p.status = 'PAID' AND p.method <> 'REFUND') AS paid,
              (SELECT GROUP_CONCAT(qty || '× ' || service_name, ', ') FROM order_items i WHERE i.order_id = o.id) AS items_text,
              (SELECT COALESCE(SUM(qty), 0) FROM order_items i WHERE i.order_id = o.id) AS pairs
         FROM orders o JOIN customers c ON c.id = o.customer_id
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY o.id DESC LIMIT 300`, ...params);
    return rows.map((o) => ({ ...o, status_label: orders.STATUS[o.status], outstanding: Math.max(0, o.total - o.paid) }));
  });

  r.get('/api/orders/:id', STAFF, (ctx) => {
    const o = orders.orderFull(int(ctx.params.id, 'ID'));
    const base = getSetting('public_url', '').replace(/\/$/, '');
    o.track_url = `${base}/lacak?kode=${encodeURIComponent(o.code)}`;
    o.track_qr_svg = qr.toSvg(o.track_url, { level: 'M', border: 2 });
    return o;
  });

  r.post('/api/orders', FO, (ctx) => {
    const b = ctx.body;
    const input = readOrderInput(b);
    const id = orders.createOrder({
      customer: { name: str(b.customer?.name, 'Nama pelanggan', { max: 80 }), phone: str(b.customer?.phone, 'Nomor HP', { max: 20 }), address: str(b.customer?.address, 'Alamat', { required: false, max: 300 }) },
      ...input, user: ctx.user,
    });
    return orders.orderFull(id);
  });

  r.put('/api/orders/:id', FO, (ctx) => {
    const id = int(ctx.params.id, 'ID');
    orders.updateOrder(id, readOrderInput(ctx.body, true), ctx.user);
    return orders.orderFull(id);
  });

  r.post('/api/orders/:id/status', STAFF, (ctx) => {
    const id = int(ctx.params.id, 'ID');
    orders.changeStatus(id, String(ctx.body.status || ''), { user: ctx.user, note: str(ctx.body.note, 'Catatan', { required: false, max: 300 }) });
    return orders.orderFull(id);
  });

  r.get('/api/orders/:id/requirements', STAFF, (ctx) =>
    require('../services/inventory').requirementsForOrder(int(ctx.params.id, 'ID')));

  // ---------- Pembayaran ----------
  r.post('/api/orders/:id/payments', FO, (ctx) => {
    const id = int(ctx.params.id, 'ID');
    const method = oneOf(ctx.body.method, 'Metode', ['CASH', 'QRIS']);
    const amount = int(ctx.body.amount, 'Nominal', { required: false, min: 1 });
    if (method === 'CASH') {
      const p = orders.payCash(id, { amount, cashReceived: int(ctx.body.cash_received, 'Uang diterima', { required: false, min: 1 }), user: ctx.user });
      return { payment: p, order: orders.orderFull(id) };
    }
    const p = orders.createQris(id, { amount, user: ctx.user });
    return { payment: { id: p.id, order_id: id, ...paymentView(p) } };
  });

  r.get('/api/payments/:id', STAFF, (ctx) => {
    orders.expireStale();
    const p = get('SELECT * FROM payments WHERE id = ?', int(ctx.params.id, 'ID'));
    if (!p) throw notFound('Pembayaran tidak ditemukan');
    return { id: p.id, order_id: p.order_id, ...paymentView(p) };
  });

  r.post('/api/payments/:id/confirm', FO, (ctx) => {
    const p = orders.confirmPayment(int(ctx.params.id, 'ID'), { user: ctx.user, note: 'Dikonfirmasi manual oleh kasir' });
    return { payment: p, order: orders.orderFull(p.order_id) };
  });

  r.post('/api/payments/:id/cancel', FO, (ctx) => {
    orders.cancelPayment(int(ctx.params.id, 'ID'));
    return { ok: true };
  });

  // Webhook untuk payment gateway (Midtrans/Xendit/dll). Header X-Webhook-Secret wajib cocok.
  r.post('/api/payments/webhook', (ctx) => {
    const secret = getSetting('webhook_secret', '');
    const given = String(ctx.req.headers['x-webhook-secret'] || '');
    const ok = secret && given.length === secret.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(secret));
    if (!ok) throw new HttpError(401, 'Webhook secret tidak valid');
    const ref = str(ctx.body.ref, 'ref', { max: 64 });
    const p = get('SELECT * FROM payments WHERE ref = ?', ref);
    if (!p) throw notFound('Ref pembayaran tidak dikenal');
    if (ctx.body.status === 'PAID') {
      if (ctx.body.amount !== undefined && Number(ctx.body.amount) !== p.amount) throw bad('Nominal tidak sesuai');
      orders.confirmPayment(p.id, { note: 'Konfirmasi otomatis via webhook' });
    } else if (['FAILED', 'EXPIRED', 'CANCELLED'].includes(ctx.body.status) && p.status === 'PENDING') {
      orders.cancelPayment(p.id);
    }
    return { ok: true };
  });

  // ---------- Delivery & dispatch ----------
  r.get('/api/couriers', DISPATCH, () =>
    all(`SELECT u.id, u.name, u.phone,
                (SELECT COUNT(*) FROM deliveries d WHERE d.courier_id = u.id AND d.status IN ('ASSIGNED','ON_THE_WAY')) AS active_tasks
           FROM users u WHERE u.role = 'kurir' AND u.active = 1 ORDER BY u.name`));

  const deliverySelect = `
    SELECT d.*, o.code AS order_code, o.status AS order_status, o.total, c.name AS customer_name, c.phone AS customer_phone,
           u.name AS courier_name,
           (SELECT COALESCE(SUM(amount), 0) FROM payments p WHERE p.order_id = o.id AND p.status = 'PAID' AND p.method <> 'REFUND') AS paid,
           (SELECT COALESCE(SUM(qty), 0) FROM order_items i WHERE i.order_id = o.id) AS pairs
      FROM deliveries d JOIN orders o ON o.id = d.order_id JOIN customers c ON c.id = o.customer_id
      LEFT JOIN users u ON u.id = d.courier_id`;
  const decorate = (d) => ({ ...d, status_label: orders.DSTATUS[d.status], outstanding: Math.max(0, d.total - d.paid) });

  r.get('/api/deliveries', DISPATCH, (ctx) => {
    const scope = ctx.query.scope || 'active';
    const where = scope === 'active' ? `WHERE d.status IN ('PENDING','ASSIGNED','ON_THE_WAY','FAILED')`
      : scope === 'done' ? `WHERE d.status IN ('DONE','CANCELLED') ORDER BY d.updated_at DESC LIMIT 100` : '';
    const order = scope === 'active' ? ` ORDER BY CASE d.status WHEN 'FAILED' THEN 0 WHEN 'PENDING' THEN 1 WHEN 'ASSIGNED' THEN 2 ELSE 3 END, COALESCE(d.scheduled_at, d.created_at)` : '';
    return all(deliverySelect + ' ' + (scope === 'done' ? where : where + order)).map(decorate);
  });

  r.get('/api/my/deliveries', requireRole('kurir'), (ctx) =>
    all(deliverySelect + ` WHERE d.courier_id = ? AND (d.status IN ('ASSIGNED','ON_THE_WAY') OR substr(d.updated_at, 1, 10) = substr(?, 1, 10))
                           ORDER BY CASE d.status WHEN 'ON_THE_WAY' THEN 0 WHEN 'ASSIGNED' THEN 1 ELSE 2 END, COALESCE(d.scheduled_at, d.created_at)`,
    ctx.user.id, require('../lib/util').now()).map(decorate));

  r.post('/api/orders/:id/deliveries', DISPATCH, (ctx) => {
    const id = int(ctx.params.id, 'ID');
    const o = orders.orderOrThrow(id);
    const type = oneOf(ctx.body.type, 'Jenis', ['PICKUP', 'DROPOFF']);
    if (orders.FINAL.includes(o.status)) throw bad('Order sudah selesai/dibatalkan');
    const active = get(`SELECT id FROM deliveries WHERE order_id = ? AND type = ? AND status IN ('PENDING','ASSIGNED','ON_THE_WAY')`, id, type);
    if (active) throw bad('Masih ada tugas aktif dengan jenis yang sama untuk order ini');
    const c = get('SELECT phone, address FROM customers WHERE id = ?', o.customer_id);
    const did = orders.createDelivery(id, type, {
      address: str(ctx.body.address, 'Alamat', { required: false, max: 300 }) || o.address || c.address,
      phone: c.phone, scheduledAt: date(ctx.body.scheduled_at, 'Jadwal', { required: false }),
      note: str(ctx.body.note, 'Catatan', { required: false, max: 300 }),
    });
    return get('SELECT * FROM deliveries WHERE id = ?', did);
  });

  r.post('/api/deliveries/:id/assign', DISPATCH, (ctx) => {
    const id = int(ctx.params.id, 'ID');
    orders.assignDelivery(id, { courierId: int(ctx.body.courier_id, 'Kurir'), scheduledAt: date(ctx.body.scheduled_at, 'Jadwal', { required: false }), user: ctx.user });
    return decorate(get(deliverySelect + ' WHERE d.id = ?', id));
  });

  r.post('/api/deliveries/:id/status', requireRole('frontoffice', 'backoffice', 'kurir'), (ctx) => {
    const id = int(ctx.params.id, 'ID');
    orders.updateDeliveryStatus(id, String(ctx.body.status || ''), {
      user: ctx.user, proofNote: str(ctx.body.proof_note, 'Catatan', { required: false, max: 300 }), collectCash: ctx.body.collect_cash === true,
    });
    return decorate(get(deliverySelect + ' WHERE d.id = ?', id));
  });
};
