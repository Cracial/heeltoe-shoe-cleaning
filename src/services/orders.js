'use strict';
// Logika inti: order, alur status produksi, pembayaran (cash/QRIS), pengiriman (delivery & dispatch).
const crypto = require('node:crypto');
const { all, get, run, tx, getSetting } = require('../db');
const { bad, notFound, forbidden, now, today, addDays, normPhone, rupiah } = require('../lib/util');
const inventory = require('./inventory');
const qris = require('../lib/qris');

const STATUS = {
  BOOKED: 'Menunggu dijemput',
  RECEIVED: 'Diterima di toko',
  WASHING: 'Proses pencucian',
  QC: 'Quality control',
  READY: 'Siap diambil / diantar',
  DELIVERING: 'Sedang diantar',
  DELIVERED: 'Sudah diantar',
  PICKED_UP: 'Sudah diambil',
  CANCELLED: 'Dibatalkan',
};
const FLOW = {
  BOOKED: ['RECEIVED', 'CANCELLED'],
  RECEIVED: ['WASHING', 'CANCELLED'],
  WASHING: ['QC'],
  QC: ['WASHING', 'READY'], // QC gagal -> cuci ulang (bahan tidak dipotong dua kali)
  READY: ['DELIVERING', 'PICKED_UP'],
  DELIVERING: ['DELIVERED', 'READY'],
  DELIVERED: [],
  PICKED_UP: [],
  CANCELLED: [],
};
// Peran yang boleh memindahkan order ke status tujuan (admin selalu boleh).
const STATUS_ROLES = {
  RECEIVED: ['frontoffice'],
  WASHING: ['backoffice', 'frontoffice'],
  QC: ['backoffice', 'frontoffice'],
  READY: ['backoffice', 'frontoffice'],
  PICKED_UP: ['frontoffice'],
  CANCELLED: ['frontoffice'],
  DELIVERING: [],
  DELIVERED: [],
};
const FINAL = ['DELIVERED', 'PICKED_UP', 'CANCELLED'];
const QRIS_TTL_MS = 15 * 60 * 1000;

// ---------- Pelanggan ----------
function upsertCustomer({ name, phone, address }) {
  const p = normPhone(phone);
  if (!p) throw bad('Nomor HP tidak valid (contoh: 0812xxxxxxx)');
  const existing = get('SELECT * FROM customers WHERE phone = ?', p);
  if (existing) {
    run('UPDATE customers SET name = COALESCE(?, name), address = COALESCE(?, address) WHERE id = ?',
      name || null, address || null, existing.id);
    return existing.id;
  }
  if (!name) throw bad('Nama pelanggan wajib diisi');
  return Number(run('INSERT INTO customers (name, phone, address, created_at) VALUES (?, ?, ?, ?)', name, p, address || null, now()).lastInsertRowid);
}

// ---------- Kode dokumen ----------
function nextCode(table, prefix) {
  const day = today().slice(2).replace(/-/g, ''); // YYMMDD
  const base = `${prefix}-${day}-`;
  const last = get(`SELECT code FROM ${table} WHERE code LIKE ? ORDER BY code DESC LIMIT 1`, base + '%');
  const seq = last ? Number(last.code.slice(base.length)) + 1 : 1;
  return base + String(seq).padStart(3, '0');
}

// ---------- Ringkasan keuangan order ----------
function money(orderId) {
  const o = get('SELECT total FROM orders WHERE id = ?', orderId);
  const r = get(
    `SELECT COALESCE(SUM(CASE WHEN method <> 'REFUND' THEN amount END), 0) AS paid,
            COALESCE(-SUM(CASE WHEN method = 'REFUND' THEN amount END), 0) AS refunded
       FROM payments WHERE order_id = ? AND status = 'PAID'`, orderId);
  const outstanding = Math.max(0, o.total - r.paid);
  return {
    total: o.total, paid: r.paid, refunded: r.refunded, outstanding,
    payment_status: r.paid <= 0 ? 'UNPAID' : outstanding > 0 ? 'PARTIAL' : 'PAID',
  };
}

function log(orderId, status, note, userName) {
  run('INSERT INTO order_logs (order_id, status, note, user_name, created_at) VALUES (?, ?, ?, ?, ?)',
    orderId, status, note || null, userName || 'Sistem', now());
}

function orderOrThrow(id) {
  const o = get('SELECT * FROM orders WHERE id = ?', id);
  if (!o) throw notFound('Order tidak ditemukan');
  return o;
}

// ---------- Item & total ----------
function normalizeItems(items) {
  if (!Array.isArray(items)) throw bad('Daftar item tidak valid');
  return items.map((it, i) => {
    const svc = get('SELECT * FROM services WHERE id = ?', Number(it.service_id));
    if (!svc) throw bad(`Layanan pada baris ${i + 1} tidak ditemukan`);
    if (!svc.active) throw bad(`Layanan ${svc.name} sedang tidak aktif`);
    const qty = Number(it.qty || 1);
    if (!Number.isInteger(qty) || qty < 1 || qty > 50) throw bad(`Jumlah pasang baris ${i + 1} tidak valid`);
    return {
      service_id: svc.id, service_name: svc.name, price: svc.price, qty, duration: svc.duration_days,
      shoe: it.shoe ? String(it.shoe).slice(0, 120) : null,
      condition_note: it.condition_note ? String(it.condition_note).slice(0, 300) : null,
    };
  });
}

function writeItems(orderId, items) {
  run('DELETE FROM order_items WHERE order_id = ?', orderId);
  for (const it of items) {
    run(`INSERT INTO order_items (order_id, service_id, service_name, shoe, qty, price, condition_note)
         VALUES (?, ?, ?, ?, ?, ?, ?)`, orderId, it.service_id, it.service_name, it.shoe, it.qty, it.price, it.condition_note);
  }
  const subtotal = items.reduce((s, it) => s + it.price * it.qty, 0);
  const maxDays = items.reduce((m, it) => Math.max(m, it.duration), 0);
  return { subtotal, due: items.length ? addDays(today(), maxDays) : null };
}

function recalcTotal(orderId) {
  const o = orderOrThrow(orderId);
  const total = Math.max(0, o.subtotal - o.discount + o.delivery_fee);
  run('UPDATE orders SET total = ?, updated_at = ? WHERE id = ?', total, now(), orderId);
  return total;
}

function createOrder({ customer, items = [], discount = 0, deliveryFee = 0, returnMethod = 'STORE', address = null, notes = null, source = 'COUNTER', user = null, booked = false }) {
  return tx(() => {
    const customerId = upsertCustomer(customer);
    const norm = normalizeItems(items);
    if (!booked && !norm.length) throw bad('Tambahkan minimal satu item layanan');
    if (returnMethod === 'DELIVERY' && !address) throw bad('Alamat antar wajib diisi untuk layanan antar');
    const code = nextCode('orders', 'SK');
    const status = booked ? 'BOOKED' : 'RECEIVED';
    const t = now();
    const id = Number(run(
      `INSERT INTO orders (code, customer_id, status, source, return_method, address, discount, delivery_fee, notes, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      code, customerId, status, source, returnMethod, address, discount, deliveryFee, notes, user ? user.id : null, t, t).lastInsertRowid);
    const { subtotal, due } = writeItems(id, norm);
    run('UPDATE orders SET subtotal = ?, due_date = ? WHERE id = ?', subtotal, due, id);
    const total = recalcTotal(id);
    if (discount > subtotal + deliveryFee) throw bad('Diskon melebihi nilai order');
    log(id, status, booked ? 'Booking jemput dari website' : `Order dibuat (${rupiah(total)})`, user ? user.name : 'Pelanggan (web)');
    return id;
  });
}

function updateOrder(orderId, { items, discount, deliveryFee, returnMethod, address, notes }, user) {
  return tx(() => {
    const o = orderOrThrow(orderId);
    if (!['BOOKED', 'RECEIVED'].includes(o.status)) throw bad('Item hanya bisa diubah sebelum proses pencucian dimulai');
    const norm = normalizeItems(items);
    if (!norm.length && o.status !== 'BOOKED') throw bad('Order harus memiliki minimal satu item');
    const { subtotal, due } = writeItems(orderId, norm);
    const rm = returnMethod || o.return_method;
    const addr = address !== undefined ? address : o.address;
    if (rm === 'DELIVERY' && !addr) throw bad('Alamat antar wajib diisi untuk layanan antar');
    run(`UPDATE orders SET subtotal = ?, due_date = ?, discount = ?, delivery_fee = ?, return_method = ?, address = ?, notes = ? WHERE id = ?`,
      subtotal, due, discount ?? o.discount, deliveryFee ?? o.delivery_fee, rm, addr, notes !== undefined ? notes : o.notes, orderId);
    const total = recalcTotal(orderId);
    const m = money(orderId);
    if (m.paid > total) throw bad(`Total baru (${rupiah(total)}) lebih kecil dari yang sudah dibayar (${rupiah(m.paid)})`);
    if ((discount ?? o.discount) > subtotal + (deliveryFee ?? o.delivery_fee)) throw bad('Diskon melebihi nilai order');
    log(orderId, o.status, `Item order diperbarui (total ${rupiah(total)})`, user.name);
  });
}

// ---------- Status ----------
function changeStatus(orderId, to, { user = null, note = null, system = false } = {}) {
  return tx(() => {
    const o = orderOrThrow(orderId);
    if (!STATUS[to]) throw bad('Status tidak dikenal');
    if (!FLOW[o.status].includes(to)) {
      throw bad(`Tidak bisa mengubah status dari "${STATUS[o.status]}" ke "${STATUS[to]}"`);
    }
    if (!system && user && user.role !== 'admin' && !(STATUS_ROLES[to] || []).includes(user.role)) {
      throw forbidden(`Peran ${user.role} tidak boleh mengubah status ke "${STATUS[to]}"`);
    }
    const userName = user ? user.name : 'Sistem';
    const count = get('SELECT COUNT(*) AS n FROM order_items WHERE order_id = ?', orderId).n;

    if (to === 'WASHING') {
      if (!count) throw bad('Order belum memiliki item layanan');
      if (!o.materials_consumed) {
        const cost = inventory.consumeForOrder(orderId, o.code, user ? user.id : null);
        run('UPDATE orders SET material_cost = ?, materials_consumed = 1 WHERE id = ?', cost, orderId);
        note = [note, `Bahan dipotong dari stok (LIFO), HPP ${rupiah(cost)}`].filter(Boolean).join(' · ');
      } else {
        note = note || 'Cuci ulang setelah QC';
      }
    }
    if (to === 'RECEIVED' && o.status === 'BOOKED' && !count) {
      note = note || 'Sepatu sudah di toko — lengkapi item layanan';
    }
    if (to === 'PICKED_UP') {
      const m = money(orderId);
      if (m.outstanding > 0) throw bad(`Order belum lunas. Sisa tagihan ${rupiah(m.outstanding)}`);
      cancelActiveDeliveries(orderId, 'Pelanggan ambil sendiri di toko');
    }
    if (to === 'CANCELLED') {
      cancelActiveDeliveries(orderId, 'Order dibatalkan');
      run(`UPDATE payments SET status = 'CANCELLED' WHERE order_id = ? AND status = 'PENDING'`, orderId);
      const m = money(orderId);
      if (m.paid - m.refunded > 0) {
        refund(orderId, m.paid - m.refunded, 'Pengembalian dana karena order dibatalkan', user);
      }
    }

    run('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?', to, now(), orderId);
    log(orderId, to, note, userName);

    if (to === 'READY' && o.return_method === 'DELIVERY') {
      const active = get(`SELECT id FROM deliveries WHERE order_id = ? AND type = 'DROPOFF' AND status IN ('PENDING','ASSIGNED','ON_THE_WAY')`, orderId);
      if (!active) {
        const c = get('SELECT phone, address FROM customers WHERE id = ?', o.customer_id);
        createDelivery(orderId, 'DROPOFF', { address: o.address || c.address, phone: c.phone, note: 'Otomatis: order siap diantar' });
      }
    }
    return orderOrThrow(orderId);
  });
}

// ---------- Pembayaran ----------
const payRef = (prefix) => `${prefix}${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

function payCash(orderId, { amount, cashReceived, note = null, user }) {
  return tx(() => {
    const o = orderOrThrow(orderId);
    if (o.status === 'CANCELLED') throw bad('Order sudah dibatalkan');
    const m = money(orderId);
    if (m.outstanding <= 0) throw bad('Order sudah lunas');
    const amt = amount ? Number(amount) : m.outstanding;
    if (!Number.isInteger(amt) || amt <= 0) throw bad('Nominal pembayaran tidak valid');
    if (amt > m.outstanding) throw bad(`Nominal melebihi sisa tagihan (${rupiah(m.outstanding)})`);
    const received = cashReceived ? Number(cashReceived) : amt;
    if (!Number.isInteger(received) || received < amt) throw bad('Uang diterima kurang dari nominal pembayaran');
    const t = now();
    const id = Number(run(
      `INSERT INTO payments (order_id, method, amount, cash_received, change_amount, status, ref, note, user_id, created_at, paid_at)
       VALUES (?, 'CASH', ?, ?, ?, 'PAID', ?, ?, ?, ?, ?)`,
      orderId, amt, received, received - amt, payRef('CSH'), note, user ? user.id : null, t, t).lastInsertRowid);
    log(orderId, o.status, `Pembayaran tunai ${rupiah(amt)}${received > amt ? ` (kembalian ${rupiah(received - amt)})` : ''}${note ? ' · ' + note : ''}`, user ? user.name : 'Sistem');
    return get('SELECT * FROM payments WHERE id = ?', id);
  });
}

function expireStale() {
  run(`UPDATE payments SET status = 'EXPIRED' WHERE status = 'PENDING' AND method = 'QRIS' AND expires_at < ?`, Date.now());
}

function createQris(orderId, { amount = null, user = null } = {}) {
  return tx(() => {
    expireStale();
    const o = orderOrThrow(orderId);
    if (o.status === 'CANCELLED') throw bad('Order sudah dibatalkan');
    const m = money(orderId);
    if (m.outstanding <= 0) throw bad('Order sudah lunas');
    const amt = amount ? Number(amount) : m.outstanding;
    if (!Number.isInteger(amt) || amt <= 0 || amt > m.outstanding) throw bad(`Nominal QRIS tidak valid (sisa tagihan ${rupiah(m.outstanding)})`);
    const existing = get(`SELECT * FROM payments WHERE order_id = ? AND method = 'QRIS' AND status = 'PENDING' AND amount = ?`, orderId, amt);
    if (existing) return existing;
    const staticPayload = getSetting('qris_static');
    if (!staticPayload) throw bad('QRIS belum diatur. Isi QRIS statis di menu Pengaturan.');
    let payload;
    try { payload = qris.toDynamic(staticPayload, amt); } catch (e) { throw bad('QRIS di pengaturan tidak valid: ' + e.message); }
    const id = Number(run(
      `INSERT INTO payments (order_id, method, amount, status, ref, qris_payload, expires_at, user_id, created_at)
       VALUES (?, 'QRIS', ?, 'PENDING', ?, ?, ?, ?, ?)`,
      orderId, amt, payRef('QR'), payload, Date.now() + QRIS_TTL_MS, user ? user.id : null, now()).lastInsertRowid);
    return get('SELECT * FROM payments WHERE id = ?', id);
  });
}

function confirmPayment(paymentId, { user = null, note = null } = {}) {
  return tx(() => {
    expireStale();
    const p = get('SELECT * FROM payments WHERE id = ?', paymentId);
    if (!p) throw notFound('Pembayaran tidak ditemukan');
    if (p.status === 'PAID') return p;
    if (p.status !== 'PENDING') throw bad(`Pembayaran berstatus ${p.status}, tidak bisa dikonfirmasi`);
    const m = money(p.order_id);
    if (p.amount > m.outstanding) {
      run(`UPDATE payments SET status = 'CANCELLED', note = 'Melebihi sisa tagihan' WHERE id = ?`, p.id);
      throw bad(`Nominal QRIS melebihi sisa tagihan (${rupiah(m.outstanding)}). Pembayaran dibatalkan.`);
    }
    run(`UPDATE payments SET status = 'PAID', paid_at = ?, note = COALESCE(?, note), user_id = COALESCE(?, user_id) WHERE id = ?`,
      now(), note, user ? user.id : null, p.id);
    const o = orderOrThrow(p.order_id);
    log(p.order_id, o.status, `Pembayaran QRIS ${rupiah(p.amount)} terkonfirmasi (ref ${p.ref})`, user ? user.name : 'Payment gateway');
    return get('SELECT * FROM payments WHERE id = ?', p.id);
  });
}

function cancelPayment(paymentId) {
  const p = get('SELECT * FROM payments WHERE id = ?', paymentId);
  if (!p) throw notFound('Pembayaran tidak ditemukan');
  if (p.status !== 'PENDING') throw bad('Hanya pembayaran menunggu yang bisa dibatalkan');
  run(`UPDATE payments SET status = 'CANCELLED' WHERE id = ?`, p.id);
}

function refund(orderId, amount, note, user) {
  return tx(() => {
    const m = money(orderId);
    const refundable = m.paid - m.refunded;
    if (!Number.isInteger(amount) || amount <= 0) throw bad('Nominal refund tidak valid');
    if (amount > refundable) throw bad(`Refund melebihi dana yang sudah dibayar (${rupiah(refundable)})`);
    const t = now();
    run(`INSERT INTO payments (order_id, method, amount, status, ref, note, user_id, created_at, paid_at)
         VALUES (?, 'REFUND', ?, 'PAID', ?, ?, ?, ?, ?)`, orderId, -amount, payRef('RF'), note, user ? user.id : null, t, t);
    const o = orderOrThrow(orderId);
    log(orderId, o.status, `Refund ${rupiah(amount)} · ${note}`, user ? user.name : 'Sistem');
  });
}

// ---------- Pengiriman & dispatch ----------
const DSTATUS = {
  PENDING: 'Menunggu kurir', ASSIGNED: 'Kurir ditugaskan', ON_THE_WAY: 'Dalam perjalanan',
  DONE: 'Selesai', FAILED: 'Gagal', CANCELLED: 'Dibatalkan',
};

function createDelivery(orderId, type, { address, phone = null, scheduledAt = null, note = null }) {
  if (!address) throw bad('Alamat pengiriman wajib diisi');
  const t = now();
  return Number(run(
    `INSERT INTO deliveries (order_id, type, address, contact_phone, scheduled_at, status, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)`, orderId, type, address, phone, scheduledAt, note, t, t).lastInsertRowid);
}

function cancelActiveDeliveries(orderId, reason) {
  run(`UPDATE deliveries SET status = 'CANCELLED', note = COALESCE(note || ' · ', '') || ?, updated_at = ?
        WHERE order_id = ? AND status IN ('PENDING','ASSIGNED','FAILED')`, reason, now(), orderId);
}

function deliveryOrThrow(id) {
  const d = get('SELECT * FROM deliveries WHERE id = ?', id);
  if (!d) throw notFound('Tugas pengiriman tidak ditemukan');
  return d;
}

function assignDelivery(id, { courierId, scheduledAt = null, user }) {
  return tx(() => {
    const d = deliveryOrThrow(id);
    if (!['PENDING', 'ASSIGNED', 'FAILED'].includes(d.status)) throw bad('Tugas ini tidak bisa ditugaskan ulang');
    const c = get(`SELECT id, name FROM users WHERE id = ? AND role = 'kurir' AND active = 1`, courierId);
    if (!c) throw bad('Kurir tidak ditemukan / tidak aktif');
    run(`UPDATE deliveries SET courier_id = ?, scheduled_at = COALESCE(?, scheduled_at), status = 'ASSIGNED', updated_at = ? WHERE id = ?`,
      c.id, scheduledAt, now(), id);
    const o = orderOrThrow(d.order_id);
    log(d.order_id, o.status, `${d.type === 'PICKUP' ? 'Penjemputan' : 'Pengantaran'} ditugaskan ke ${c.name}`, user.name);
  });
}

function updateDeliveryStatus(id, to, { user, proofNote = null, collectCash = false }) {
  return tx(() => {
    const d = deliveryOrThrow(id);
    const allowed = {
      PENDING: ['CANCELLED'], ASSIGNED: ['ON_THE_WAY', 'CANCELLED'], ON_THE_WAY: ['DONE', 'FAILED'],
      FAILED: ['CANCELLED'], DONE: [], CANCELLED: [],
    };
    if (!DSTATUS[to]) throw bad('Status pengiriman tidak dikenal');
    if (!allowed[d.status].includes(to)) throw bad(`Tidak bisa mengubah tugas dari "${DSTATUS[d.status]}" ke "${DSTATUS[to]}"`);
    if (user.role === 'kurir') {
      if (d.courier_id !== user.id) throw forbidden('Tugas ini bukan milik Anda');
      if (to === 'CANCELLED') throw forbidden('Kurir tidak bisa membatalkan tugas, hubungi dispatcher');
    }
    if (to === 'FAILED' && !proofNote) throw bad('Tuliskan alasan gagal');
    const o = orderOrThrow(d.order_id);
    const label = d.type === 'PICKUP' ? 'Penjemputan' : 'Pengantaran';

    if (to === 'ON_THE_WAY' && d.type === 'DROPOFF' && o.status === 'READY') {
      changeStatus(o.id, 'DELIVERING', { user, system: true, note: `Diantar oleh ${user.name}` });
    }
    if (to === 'DONE') {
      if (d.type === 'PICKUP' && o.status === 'BOOKED') {
        changeStatus(o.id, 'RECEIVED', { user, system: true, note: `Sepatu dijemput ${user.name}${proofNote ? ' · ' + proofNote : ''}` });
      }
      if (d.type === 'DROPOFF') {
        const m = money(o.id);
        if (m.outstanding > 0) {
          if (!collectCash) throw bad(`Tagihan belum lunas (${rupiah(m.outstanding)}). Terima pembayaran tunai (COD) dari pelanggan terlebih dulu.`);
          payCash(o.id, { amount: m.outstanding, note: `COD diterima kurir ${user.name}`, user });
        }
        if (o.status === 'DELIVERING' || o.status === 'READY') {
          if (o.status === 'READY') changeStatus(o.id, 'DELIVERING', { user, system: true });
          changeStatus(o.id, 'DELIVERED', { user, system: true, note: proofNote ? `Diterima: ${proofNote}` : 'Diterima pelanggan' });
        }
      }
    }
    if (to === 'FAILED') {
      if (d.type === 'DROPOFF' && o.status === 'DELIVERING') {
        changeStatus(o.id, 'READY', { user, system: true, note: `Pengantaran gagal: ${proofNote}` });
        // buat tugas baru agar dispatcher bisa menjadwalkan ulang
        createDelivery(o.id, 'DROPOFF', { address: d.address, phone: d.contact_phone, note: 'Jadwal ulang setelah gagal antar' });
      } else {
        log(o.id, o.status, `${label} gagal: ${proofNote}`, user.name);
      }
    }
    run(`UPDATE deliveries SET status = ?, proof_note = COALESCE(?, proof_note), updated_at = ?, done_at = CASE WHEN ? IN ('DONE','FAILED') THEN ? ELSE done_at END WHERE id = ?`,
      to, proofNote, now(), to, now(), id);
    if (to === 'CANCELLED') log(o.id, o.status, `${label} dibatalkan`, user.name);
    return deliveryOrThrow(id);
  });
}

// ---------- Detail order ----------
function orderFull(id) {
  expireStale();
  const o = get(
    `SELECT o.*, c.name AS customer_name, c.phone AS customer_phone, c.address AS customer_address, u.name AS created_by_name
       FROM orders o JOIN customers c ON c.id = o.customer_id LEFT JOIN users u ON u.id = o.created_by
      WHERE o.id = ?`, id);
  if (!o) throw notFound('Order tidak ditemukan');
  return {
    ...o,
    status_label: STATUS[o.status],
    ...money(id),
    items: all('SELECT * FROM order_items WHERE order_id = ? ORDER BY id', id),
    logs: all('SELECT * FROM order_logs WHERE order_id = ? ORDER BY id', id),
    payments: all(`SELECT p.*, u.name AS user_name FROM payments p LEFT JOIN users u ON u.id = p.user_id WHERE order_id = ? ORDER BY p.id`, id),
    deliveries: all(`SELECT d.*, u.name AS courier_name FROM deliveries d LEFT JOIN users u ON u.id = d.courier_id WHERE order_id = ? ORDER BY d.id`, id),
    disputes: all('SELECT id, code, category, status, resolution, refund_amount, created_at FROM disputes WHERE order_id = ? ORDER BY id', id),
    materials: all(
      `SELECT i.name, i.unit, SUM(m.qty) AS qty, ROUND(SUM(m.qty * m.unit_cost)) AS cost
         FROM stock_moves m JOIN items i ON i.id = m.item_id
        WHERE m.ref_type = 'ORDER' AND m.ref_id = ? GROUP BY m.item_id ORDER BY i.name`, id),
    next_statuses: FLOW[o.status],
  };
}

module.exports = {
  STATUS, FLOW, FINAL, DSTATUS, upsertCustomer, nextCode, money, log, createOrder, updateOrder, changeStatus,
  payCash, createQris, confirmPayment, cancelPayment, refund, expireStale,
  createDelivery, assignDelivery, updateDeliveryStatus, orderFull, orderOrThrow, deliveryOrThrow,
};
