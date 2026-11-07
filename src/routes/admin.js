'use strict';
// Dashboard, laporan, dispute (sisi staf), pengguna, pengaturan, pesan masuk.
const { all, get, run, tx, getSetting, setSetting } = require('../db');
const { bad, notFound, now, today, addDays, str, int, oneOf, normPhone } = require('../lib/util');
const { requireRole, hashPassword } = require('../lib/auth');
const orders = require('../services/orders');
const inv = require('../services/inventory');
const qris = require('../lib/qris');

const STAFF = requireRole('frontoffice', 'backoffice');
const ADMIN = requireRole(); // admin selalu lolos; peran lain ditolak di bawah
const adminOnly = (ctx) => { ADMIN(ctx); if (ctx.user.role !== 'admin') throw new (require('../lib/util').HttpError)(403, 'Khusus admin'); };

const CATEGORY = { DAMAGE: 'Kerusakan', LOST: 'Kehilangan', QUALITY: 'Hasil kurang bersih', LATE: 'Keterlambatan', PAYMENT: 'Pembayaran', OTHER: 'Lainnya' };

module.exports = (r) => {
  // ---------- Dashboard ----------
  r.get('/api/dashboard', STAFF, () => {
    orders.expireStale();
    const t = today();
    const money = get(
      `SELECT COALESCE(SUM(CASE WHEN method <> 'REFUND' THEN amount END), 0) AS received,
              COALESCE(SUM(CASE WHEN method = 'CASH' THEN amount END), 0) AS cash,
              COALESCE(SUM(CASE WHEN method = 'QRIS' THEN amount END), 0) AS qris,
              COALESCE(-SUM(CASE WHEN method = 'REFUND' THEN amount END), 0) AS refunds
         FROM payments WHERE status = 'PAID' AND substr(paid_at, 1, 10) = ?`, t);
    const statusCounts = all(`SELECT status, COUNT(*) AS n FROM orders WHERE status NOT IN ('DELIVERED','PICKED_UP','CANCELLED') GROUP BY status`);
    return {
      today: t,
      orders_today: get('SELECT COUNT(*) AS n FROM orders WHERE substr(created_at, 1, 10) = ?', t).n,
      pairs_today: get(`SELECT COALESCE(SUM(i.qty), 0) AS n FROM order_items i JOIN orders o ON o.id = i.order_id WHERE substr(o.created_at, 1, 10) = ?`, t).n,
      money,
      status_counts: Object.fromEntries(statusCounts.map((s) => [s.status, s.n])),
      overdue: all(
        `SELECT o.id, o.code, o.status, o.due_date, c.name AS customer_name FROM orders o JOIN customers c ON c.id = o.customer_id
          WHERE o.status IN ('RECEIVED','WASHING','QC') AND o.due_date IS NOT NULL AND o.due_date <= ? ORDER BY o.due_date LIMIT 10`, t),
      deliveries: get(`SELECT SUM(status = 'PENDING') AS pending, SUM(status = 'ASSIGNED') AS assigned, SUM(status = 'ON_THE_WAY') AS on_the_way, SUM(status = 'FAILED') AS failed FROM deliveries`),
      open_disputes: get(`SELECT COUNT(*) AS n FROM disputes WHERE status IN ('OPEN','INVESTIGATING')`).n,
      pending_qris: get(`SELECT COUNT(*) AS n FROM payments WHERE method = 'QRIS' AND status = 'PENDING'`).n,
      unread_messages: get('SELECT COUNT(*) AS n FROM contact_messages WHERE handled = 0').n,
      low_stock: inv.listItems().filter((i) => i.active && i.stock <= i.min_stock).map((i) => ({ id: i.id, name: i.name, stock: i.stock, unit: i.unit, min_stock: i.min_stock })),
      recent: all(
        `SELECT o.id, o.code, o.status, o.total, o.created_at, c.name AS customer_name FROM orders o JOIN customers c ON c.id = o.customer_id
          ORDER BY o.id DESC LIMIT 8`).map((o) => ({ ...o, status_label: orders.STATUS[o.status] })),
    };
  });

  // ---------- Laporan ----------
  r.get('/api/reports/summary', requireRole('backoffice'), (ctx) => {
    const to = ctx.query.to || today();
    const from = ctx.query.from || addDays(to, -29);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw bad('Format tanggal salah');
    const pay = get(
      `SELECT COALESCE(SUM(CASE WHEN method = 'CASH' THEN amount END), 0) AS cash,
              COALESCE(SUM(CASE WHEN method = 'QRIS' THEN amount END), 0) AS qris,
              COALESCE(-SUM(CASE WHEN method = 'REFUND' THEN amount END), 0) AS refunds
         FROM payments WHERE status = 'PAID' AND substr(paid_at, 1, 10) BETWEEN ? AND ?`, from, to);
    const ord = get(
      `SELECT COUNT(*) AS orders, COALESCE(SUM(total), 0) AS sales, COALESCE(SUM(discount), 0) AS discounts,
              COALESCE(SUM(delivery_fee), 0) AS delivery_fees
         FROM orders WHERE status <> 'CANCELLED' AND substr(created_at, 1, 10) BETWEEN ? AND ?`, from, to);
    const hpp = get(
      `SELECT COALESCE(ROUND(SUM(qty * unit_cost)), 0) AS v FROM stock_moves
        WHERE type = 'OUT' AND ref_type = 'ORDER' AND substr(created_at, 1, 10) BETWEEN ? AND ?`, from, to).v;
    const adjLoss = get(
      `SELECT COALESCE(ROUND(SUM(qty * unit_cost)), 0) AS v FROM stock_moves
        WHERE type = 'ADJ_OUT' AND substr(created_at, 1, 10) BETWEEN ? AND ?`, from, to).v;
    const purchases = get(
      `SELECT COALESCE(ROUND(SUM(qty * unit_cost)), 0) AS v FROM stock_moves
        WHERE type = 'IN' AND substr(created_at, 1, 10) BETWEEN ? AND ?`, from, to).v;
    const daily = all(
      `WITH RECURSIVE d(day) AS (SELECT ? UNION ALL SELECT date(day, '+1 day') FROM d WHERE day < ?)
       SELECT d.day,
              (SELECT COUNT(*) FROM orders o WHERE substr(o.created_at, 1, 10) = d.day AND o.status <> 'CANCELLED') AS orders,
              (SELECT COALESCE(SUM(amount), 0) FROM payments p WHERE p.status = 'PAID' AND substr(p.paid_at, 1, 10) = d.day) AS net_received,
              (SELECT COALESCE(ROUND(SUM(qty * unit_cost)), 0) FROM stock_moves m WHERE m.type = 'OUT' AND m.ref_type = 'ORDER' AND substr(m.created_at, 1, 10) = d.day) AS hpp
         FROM d`, from, to);
    const byService = all(
      `SELECT i.service_name AS name, SUM(i.qty) AS pairs, SUM(i.qty * i.price) AS revenue
         FROM order_items i JOIN orders o ON o.id = i.order_id
        WHERE o.status <> 'CANCELLED' AND substr(o.created_at, 1, 10) BETWEEN ? AND ?
        GROUP BY i.service_name ORDER BY revenue DESC`, from, to);
    const received = pay.cash + pay.qris;
    return {
      from, to, ...ord, ...pay, received, net_received: received - pay.refunds,
      material_cost: hpp, adjustment_loss: adjLoss, purchases,
      gross_profit: ord.sales - ord.delivery_fees - hpp,
      daily, by_service: byService,
      by_status: all(`SELECT status, COUNT(*) AS n FROM orders WHERE substr(created_at, 1, 10) BETWEEN ? AND ? GROUP BY status`, from, to),
      inventory_value: inv.listItems().reduce((s, i) => s + i.stock_value, 0),
    };
  });

  // ---------- Dispute (staf) ----------
  r.get('/api/disputes', STAFF, (ctx) => {
    const st = ctx.query.status;
    const where = st === 'active' ? `WHERE d.status IN ('OPEN','INVESTIGATING')` : st ? 'WHERE d.status = ?' : '';
    const params = st && st !== 'active' ? [st] : [];
    return all(
      `SELECT d.*, o.code AS order_code, c.name AS customer_name, c.phone AS customer_phone, u.name AS handler_name,
              (SELECT COUNT(*) FROM dispute_messages m WHERE m.dispute_id = d.id) AS message_count,
              (SELECT author_type FROM dispute_messages m WHERE m.dispute_id = d.id ORDER BY id DESC LIMIT 1) AS last_author
         FROM disputes d JOIN orders o ON o.id = d.order_id JOIN customers c ON c.id = o.customer_id
         LEFT JOIN users u ON u.id = d.handled_by ${where}
        ORDER BY CASE d.status WHEN 'OPEN' THEN 0 WHEN 'INVESTIGATING' THEN 1 ELSE 2 END, d.updated_at DESC LIMIT 200`, ...params)
      .map((d) => ({ ...d, category_label: CATEGORY[d.category] }));
  });

  r.get('/api/disputes/:id', STAFF, (ctx) => {
    const d = get(
      `SELECT d.*, o.code AS order_code, o.id AS order_id, c.name AS customer_name, c.phone AS customer_phone, u.name AS handler_name
         FROM disputes d JOIN orders o ON o.id = d.order_id JOIN customers c ON c.id = o.customer_id
         LEFT JOIN users u ON u.id = d.handled_by WHERE d.id = ?`, int(ctx.params.id, 'ID'));
    if (!d) throw notFound('Dispute tidak ditemukan');
    d.category_label = CATEGORY[d.category];
    d.messages = all('SELECT * FROM dispute_messages WHERE dispute_id = ? ORDER BY id', d.id);
    d.order = orders.orderFull(d.order_id);
    return d;
  });

  r.post('/api/disputes', STAFF, (ctx) => {
    const orderId = int(ctx.body.order_id, 'Order');
    orders.orderOrThrow(orderId);
    const category = oneOf(ctx.body.category, 'Kategori', Object.keys(CATEGORY));
    const description = str(ctx.body.description, 'Deskripsi', { max: 1500, min: 5 });
    if (get(`SELECT id FROM disputes WHERE order_id = ? AND status IN ('OPEN','INVESTIGATING')`, orderId)) throw bad('Masih ada dispute aktif untuk order ini');
    return tx(() => {
      const code = orders.nextCode('disputes', 'DSP');
      const t = now();
      const id = Number(run(`INSERT INTO disputes (code, order_id, category, description, status, source, handled_by, created_at, updated_at)
                             VALUES (?, ?, ?, ?, 'OPEN', 'STAFF', ?, ?, ?)`, code, orderId, category, description, ctx.user.id, t, t).lastInsertRowid);
      run(`INSERT INTO dispute_messages (dispute_id, author_type, author_name, message, created_at) VALUES (?, 'STAFF', ?, ?, ?)`, id, ctx.user.name, description, t);
      return { id, code };
    });
  });

  r.post('/api/disputes/:id/messages', STAFF, (ctx) => {
    const id = int(ctx.params.id, 'ID');
    const d = get('SELECT * FROM disputes WHERE id = ?', id);
    if (!d) throw notFound();
    const message = str(ctx.body.message, 'Pesan', { max: 1500 });
    tx(() => {
      run(`INSERT INTO dispute_messages (dispute_id, author_type, author_name, message, created_at) VALUES (?, 'STAFF', ?, ?, ?)`, id, ctx.user.name, message, now());
      run(`UPDATE disputes SET updated_at = ?, handled_by = COALESCE(handled_by, ?), status = CASE WHEN status = 'OPEN' THEN 'INVESTIGATING' ELSE status END WHERE id = ?`, now(), ctx.user.id, id);
    });
    return { ok: true };
  });

  r.post('/api/disputes/:id/resolve', requireRole('frontoffice', 'backoffice'), (ctx) => {
    const id = int(ctx.params.id, 'ID');
    const d = get('SELECT * FROM disputes WHERE id = ?', id);
    if (!d) throw notFound();
    if (!['OPEN', 'INVESTIGATING'].includes(d.status)) throw bad('Dispute sudah ditutup');
    const status = oneOf(ctx.body.status, 'Keputusan', ['RESOLVED', 'REJECTED', 'INVESTIGATING']);
    const note = str(ctx.body.note, 'Catatan keputusan', { max: 1000 });
    tx(() => {
      if (status === 'INVESTIGATING') {
        run(`UPDATE disputes SET status = 'INVESTIGATING', handled_by = ?, updated_at = ? WHERE id = ?`, ctx.user.id, now(), id);
        run(`INSERT INTO dispute_messages (dispute_id, author_type, author_name, message, created_at) VALUES (?, 'STAFF', ?, ?, ?)`, id, ctx.user.name, note, now());
        return;
      }
      let resolution = 'NONE';
      let amount = 0;
      if (status === 'RESOLVED') {
        resolution = oneOf(ctx.body.resolution, 'Bentuk penyelesaian', ['REWASH', 'REFUND', 'COMPENSATION', 'NONE']);
        if (resolution === 'REFUND' || resolution === 'COMPENSATION') {
          amount = int(ctx.body.refund_amount, 'Nominal', { min: 1 });
          if (resolution === 'REFUND') {
            orders.refund(d.order_id, amount, `Refund dispute ${d.code}`, ctx.user);
          } else {
            // Kompensasi tidak dibatasi nilai order; dicatat sebagai uang keluar (REFUND) tanpa batas dana masuk.
            const t = now();
            run(`INSERT INTO payments (order_id, method, amount, status, ref, note, user_id, created_at, paid_at)
                 VALUES (?, 'REFUND', ?, 'PAID', ?, ?, ?, ?, ?)`, d.order_id, -amount, 'CMP' + Date.now().toString(36).toUpperCase() + id, `Kompensasi dispute ${d.code}`, ctx.user.id, t, t);
            orders.log(d.order_id, orders.orderOrThrow(d.order_id).status, `Kompensasi Rp ${amount.toLocaleString('id-ID')} (dispute ${d.code})`, ctx.user.name);
          }
        }
        if (resolution === 'REWASH') {
          orders.log(d.order_id, orders.orderOrThrow(d.order_id).status, `Cuci ulang gratis disetujui (dispute ${d.code})`, ctx.user.name);
        }
      }
      const label = { REWASH: 'Cuci ulang gratis', REFUND: 'Refund', COMPENSATION: 'Kompensasi', NONE: 'Tanpa tindakan' }[resolution];
      run(`UPDATE disputes SET status = ?, resolution = ?, refund_amount = ?, handled_by = ?, updated_at = ?, resolved_at = ? WHERE id = ?`,
        status, resolution, amount, ctx.user.id, now(), now(), id);
      run(`INSERT INTO dispute_messages (dispute_id, author_type, author_name, message, created_at) VALUES (?, 'STAFF', ?, ?, ?)`,
        id, ctx.user.name, `${status === 'RESOLVED' ? `Selesai — ${label}${amount ? ` Rp ${amount.toLocaleString('id-ID')}` : ''}` : 'Ditolak'}. ${note}`, now());
    });
    return { ok: true };
  });

  // ---------- Pengguna ----------
  r.get('/api/users', adminOnly, () => all('SELECT id, name, username, role, phone, active, created_at FROM users ORDER BY active DESC, role, name'));

  r.post('/api/users', adminOnly, (ctx) => {
    const b = ctx.body;
    const username = str(b.username, 'Username', { max: 40, min: 3 });
    if (!/^[a-zA-Z0-9_.]+$/.test(username)) throw bad('Username hanya huruf, angka, titik, garis bawah');
    if (get('SELECT id FROM users WHERE username = ?', username)) throw bad('Username sudah dipakai');
    const id = Number(run('INSERT INTO users (name, username, password_hash, role, phone, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      str(b.name, 'Nama', { max: 80 }), username, hashPassword(str(b.password, 'Password', { min: 6 })),
      oneOf(b.role, 'Peran', ['admin', 'frontoffice', 'backoffice', 'kurir']), b.phone ? normPhone(b.phone) : null, now()).lastInsertRowid);
    return get('SELECT id, name, username, role, phone, active FROM users WHERE id = ?', id);
  });

  r.put('/api/users/:id', adminOnly, (ctx) => {
    const id = int(ctx.params.id, 'ID');
    const u = get('SELECT * FROM users WHERE id = ?', id);
    if (!u) throw notFound();
    const b = ctx.body;
    const role = oneOf(b.role || u.role, 'Peran', ['admin', 'frontoffice', 'backoffice', 'kurir']);
    const active = b.active === false || b.active === 0 ? 0 : 1;
    if (id === ctx.user.id && (!active || role !== 'admin')) throw bad('Tidak bisa menonaktifkan / menurunkan peran akun sendiri');
    run('UPDATE users SET name = ?, role = ?, phone = ?, active = ? WHERE id = ?',
      str(b.name || u.name, 'Nama', { max: 80 }), role, b.phone ? normPhone(b.phone) : null, active, id);
    if (b.password) run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(str(b.password, 'Password', { min: 6 })), id);
    if (!active) run('DELETE FROM sessions WHERE user_id = ?', id);
    return get('SELECT id, name, username, role, phone, active FROM users WHERE id = ?', id);
  });

  // ---------- Pengaturan ----------
  const SETTING_KEYS = ['business_name', 'tagline', 'about', 'vision', 'mission', 'address', 'phone', 'email', 'open_hours', 'maps_url', 'instagram', 'delivery_fee', 'qris_static', 'public_url'];

  r.get('/api/settings', adminOnly, () => {
    const out = {};
    for (const k of [...SETTING_KEYS, 'webhook_secret']) out[k] = getSetting(k, '');
    try { out.qris_info = qris.validate(out.qris_static); } catch (e) { out.qris_info = { error: e.message }; }
    return out;
  });

  r.put('/api/settings', adminOnly, (ctx) => {
    const b = ctx.body;
    tx(() => {
      for (const k of SETTING_KEYS) {
        if (b[k] === undefined) continue;
        let v = String(b[k]).trim();
        if (k === 'qris_static') {
          try {
            const info = qris.validate(v);
            if (!info.isStatic) throw new Error('Masukkan QRIS STATIS (tanpa nominal), bukan QRIS dinamis');
          } catch (e) { throw bad('QRIS tidak valid: ' + e.message); }
        }
        if (k === 'delivery_fee') v = String(int(v, 'Ongkir default', { min: 0 }));
        if (k === 'phone' && v) v = normPhone(v) || v;
        setSetting(k, v);
      }
      if (b.regenerate_webhook_secret === true) setSetting('webhook_secret', require('node:crypto').randomBytes(18).toString('hex'));
    });
    return { ok: true };
  });

  // ---------- Pesan dari website ----------
  r.get('/api/contacts', STAFF, () => all('SELECT * FROM contact_messages ORDER BY handled, id DESC LIMIT 100'));
  r.post('/api/contacts/:id/handled', STAFF, (ctx) => {
    run('UPDATE contact_messages SET handled = 1 WHERE id = ?', int(ctx.params.id, 'ID'));
    return { ok: true };
  });
};
