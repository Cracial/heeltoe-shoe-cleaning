'use strict';
// Tes end-to-end: menjalankan server dengan database sementara lalu menguji seluruh alur bisnis.
// Jalankan: npm test
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const PORT = 3000 + Math.floor(Math.random() * 1000) + 1000;
const BASE = `http://127.0.0.1:${PORT}`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-test-'));
let proc;

async function api(method, url, body, cookie) {
  const res = await fetch(BASE + url, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return { status: res.status, data, cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
}
async function login(u, p) {
  const r = await api('POST', '/api/auth/login', { username: u, password: p });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.cookie;
}

before(async () => {
  proc = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DB_PATH: path.join(tmp, 'test.db'), SEED_DEMO: '0' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((resolve, reject) => {
    proc.stdout.on('data', (d) => { if (String(d).includes('berjalan')) resolve(); });
    proc.on('exit', (c) => reject(new Error('server exit ' + c)));
  });
});

after(async () => {
  // Hentikan server pengujian terlebih dahulu.
  if (proc && proc.exitCode === null && proc.signalCode === null) {
    const exited = new Promise((resolve) => {
      proc.once('exit', resolve);
    });

    proc.kill();
    await exited;
  }

  // Hapus database sementara setelah server benar-benar berhenti.
  await fs.promises.rm(tmp, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 200,
  });
});

let admin, fo, bo, kurir;
test('login per peran & pembatasan akses', async () => {
  admin = await login('admin', 'admin123');
  fo = await login('fo', 'fo123');
  bo = await login('bo', 'bo123');
  kurir = await login('kurir1', 'kurir123');
  assert.equal((await api('POST', '/api/auth/login', { username: 'admin', password: 'salah' })).status, 401);
  assert.equal((await api('GET', '/api/orders')).status, 401);
  assert.equal((await api('GET', '/api/orders', null, kurir)).status, 403);
  assert.equal((await api('GET', '/api/users', null, fo)).status, 403);
  assert.equal((await api('POST', '/api/items', { sku: 'X', name: 'x', unit: 'ml' }, fo)).status, 403);
});

test('inventory LIFO: batch terbaru terpakai lebih dulu', async () => {
  const create = await api('POST', '/api/items', { sku: 'TST-1', name: 'Sabun Uji', unit: 'ml', min_stock: 10 }, bo);
  assert.equal(create.status, 200, JSON.stringify(create.data));
  const id = create.data.id;
  await api('POST', `/api/items/${id}/stock-in`, { qty: 100, unit_cost: 10 }, bo); // batch lama
  await new Promise((r) => setTimeout(r, 1100)); // beda detik agar urutan received_at jelas
  await api('POST', `/api/items/${id}/stock-in`, { qty: 50, unit_cost: 20 }, bo); // batch baru
  // keluar 70: 50 dari batch baru (@20) + 20 dari batch lama (@10) = 1000 + 200 = 1200
  const adj = await api('POST', `/api/items/${id}/adjust`, { qty: -70, note: 'uji LIFO' }, bo);
  assert.equal(adj.status, 200, JSON.stringify(adj.data));
  assert.equal(adj.data.stock, 80);
  assert.equal(adj.data.layers.length, 1, 'batch baru harus habis duluan');
  assert.equal(adj.data.layers[0].unit_cost, 10);
  assert.equal(adj.data.layers[0].qty_remaining, 80);
  const outs = adj.data.moves.filter((m) => m.type === 'ADJ_OUT');
  assert.deepEqual(outs.map((m) => [m.qty, m.unit_cost]).sort(), [[20, 10], [50, 20]].sort());
  assert.equal(adj.data.stock_value, 800);
  const over = await api('POST', `/api/items/${id}/adjust`, { qty: -1000, note: 'terlalu banyak' }, bo);
  assert.equal(over.status, 400);
});

let orderId, orderCode;
test('front office: buat order, alur produksi memotong stok (LIFO)', async () => {
  const svc = (await api('GET', '/api/services', null, fo)).data;
  const deep = svc.find((s) => s.code === 'DEEP');
  const r = await api('POST', '/api/orders', {
    customer: { name: 'Tester', phone: '0812-9999-0001', address: 'Jl. Uji 1' },
    items: [{ service_id: deep.id, shoe: 'Sneaker putih', qty: 2 }],
    discount: 10000, return_method: 'DELIVERY', address: 'Jl. Uji 1', delivery_fee: 10000,
  }, fo);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  orderId = r.data.id; orderCode = r.data.code;
  assert.equal(r.data.total, 55000 * 2 - 10000 + 10000);
  assert.equal(r.data.customer_phone, '6281299990001');
  assert.match(orderCode, /^SK-\d{6}-\d{3}$/);

  // kurir tidak boleh ubah status order
  assert.equal((await api('POST', `/api/orders/${orderId}/status`, { status: 'WASHING' }, kurir)).status, 403);
  // lompat status tidak boleh
  assert.equal((await api('POST', `/api/orders/${orderId}/status`, { status: 'READY' }, bo)).status, 400);

  const shampooBefore = (await api('GET', '/api/items', null, bo)).data.find((i) => i.sku === 'SHP-01');
  const w = await api('POST', `/api/orders/${orderId}/status`, { status: 'WASHING' }, bo);
  assert.equal(w.status, 200, JSON.stringify(w.data));
  assert.ok(w.data.material_cost > 0);
  const shampooAfter = (await api('GET', '/api/items', null, bo)).data.find((i) => i.sku === 'SHP-01');
  assert.equal(shampooBefore.stock - shampooAfter.stock, 60); // 30 ml × 2 pasang
  // Seed: batch terbaru sabun @52/ml -> 60 ml = 3120
  const shp = w.data.materials.find((m) => m.name.startsWith('Sabun'));
  assert.equal(shp.cost, 3120);

  // QC gagal -> cuci ulang: stok tidak dipotong lagi
  await api('POST', `/api/orders/${orderId}/status`, { status: 'QC' }, bo);
  await api('POST', `/api/orders/${orderId}/status`, { status: 'WASHING', note: 'masih ada noda' }, bo);
  const again = (await api('GET', '/api/items', null, bo)).data.find((i) => i.sku === 'SHP-01');
  assert.equal(again.stock, shampooAfter.stock);
  await api('POST', `/api/orders/${orderId}/status`, { status: 'QC' }, bo);
  const ready = await api('POST', `/api/orders/${orderId}/status`, { status: 'READY' }, bo);
  assert.equal(ready.status, 200);
  assert.equal(ready.data.deliveries.filter((d) => d.type === 'DROPOFF' && d.status === 'PENDING').length, 1, 'tugas antar otomatis dibuat');
  // order belum lunas tidak boleh diambil
  assert.equal((await api('POST', `/api/orders/${orderId}/status`, { status: 'PICKED_UP' }, fo)).status, 400);
});

test('pembayaran: DP tunai + QRIS dinamis dengan CRC valid', async () => {
  const cash = await api('POST', `/api/orders/${orderId}/payments`, { method: 'CASH', amount: 50000, cash_received: 100000 }, fo);
  assert.equal(cash.status, 200, JSON.stringify(cash.data));
  assert.equal(cash.data.payment.change_amount, 50000);
  assert.equal(cash.data.order.outstanding, 60000);
  assert.equal(cash.data.order.payment_status, 'PARTIAL');
  const over = await api('POST', `/api/orders/${orderId}/payments`, { method: 'CASH', amount: 999999 }, fo);
  assert.equal(over.status, 400);

  const q = await api('POST', `/api/orders/${orderId}/payments`, { method: 'QRIS', amount: 20000 }, fo);
  assert.equal(q.status, 200, JSON.stringify(q.data));
  const p = q.data.payment;
  assert.ok(p.id && p.qris_payload.includes('5405' + '20000'));
  assert.ok(p.qr_svg.startsWith('<svg'));
  const qris = require('../src/lib/qris');
  const info = qris.validate(p.qris_payload);
  assert.equal(info.amount, 20000);
  assert.equal(info.isStatic, false);

  // pelanggan cek via halaman lacak
  const tr = await api('POST', '/api/public/track', { code: orderCode, phone: '081299990001' });
  assert.equal(tr.status, 200);
  assert.equal(tr.data.pending_qris.ref, p.ref);
  assert.equal((await api('POST', '/api/public/track', { code: orderCode, phone: '081200000000' })).status, 404);

  // konfirmasi via webhook (salah secret ditolak)
  assert.equal((await api('POST', '/api/payments/webhook', { ref: p.ref, status: 'PAID' })).status, 401);
  const settings = (await api('GET', '/api/settings', null, admin)).data;
  const wh = await fetch(BASE + '/api/payments/webhook', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': settings.webhook_secret },
    body: JSON.stringify({ ref: p.ref, status: 'PAID', amount: 20000 }),
  });
  assert.equal(wh.status, 200);
  const st = await api('GET', `/api/payments/${p.id}`, null, fo);
  assert.equal(st.data.status, 'PAID');
});


test('pembayaran QRIS: konfirmasi manual dan pembatalan', async () => {
  // Buat order khusus agar pengujian tidak mengubah order utama.
  const services = (await api('GET', '/api/services', null, fo)).data;
  const deep = services.find((s) => s.code === 'DEEP');

  assert.ok(deep, 'Layanan DEEP harus tersedia');

  const created = await api('POST', '/api/orders', {
    customer: {
      name: 'Tester Pembayaran Manual',
      phone: '081299990002',
      address: 'Jl. Pengujian Pembayaran',
    },
    items: [
      {
        service_id: deep.id,
        shoe: 'Sneaker pengujian',
        qty: 1,
      },
    ],
    return_method: 'STORE',
  }, fo);

  assert.equal(created.status, 200, JSON.stringify(created.data));

  const testOrderId = created.data.id;
  const originalTotal = created.data.total;

  assert.ok(originalTotal > 15000, 'Total order harus cukup untuk pengujian');

  // Buat pembayaran QRIS pertama.
  const q1 = await api(
    'POST',
    `/api/orders/${testOrderId}/payments`,
    { method: 'QRIS', amount: 10000 },
    fo
  );

  assert.equal(q1.status, 200, JSON.stringify(q1.data));

  const paymentId = q1.data.payment.id;

  // Back Office tidak boleh mengonfirmasi pembayaran.
  const forbidden = await api(
    'POST',
    `/api/payments/${paymentId}/confirm`,
    {},
    bo
  );

  assert.equal(forbidden.status, 403);

  // Konfirmasi manual oleh Front Office.
  const confirmed = await api(
    'POST',
    `/api/payments/${paymentId}/confirm`,
    {},
    fo
  );

  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.data));
  assert.equal(confirmed.data.payment.status, 'PAID');
  assert.equal(confirmed.data.order.outstanding, originalTotal - 10000);

  // Konfirmasi ulang tidak boleh menggandakan pembayaran.
  const repeated = await api(
    'POST',
    `/api/payments/${paymentId}/confirm`,
    {},
    fo
  );

  assert.equal(repeated.status, 200);
  assert.equal(repeated.data.order.outstanding, originalTotal - 10000);

  // Pembayaran yang sudah lunas tidak boleh dibatalkan.
  const cancelPaid = await api(
    'POST',
    `/api/payments/${paymentId}/cancel`,
    {},
    fo
  );

  assert.equal(cancelPaid.status, 400);

  // Buat QRIS kedua untuk menguji pembatalan.
  const q2 = await api(
    'POST',
    `/api/orders/${testOrderId}/payments`,
    { method: 'QRIS', amount: 5000 },
    fo
  );

  assert.equal(q2.status, 200, JSON.stringify(q2.data));

  const cancelledId = q2.data.payment.id;

  // Back Office juga tidak boleh membatalkan pembayaran.
  const forbiddenCancel = await api(
    'POST',
    `/api/payments/${cancelledId}/cancel`,
    {},
    bo
  );

  assert.equal(forbiddenCancel.status, 403);

  // Front Office membatalkan QRIS.
  const cancelled = await api(
    'POST',
    `/api/payments/${cancelledId}/cancel`,
    {},
    fo
  );

  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.data.ok, true);

  // Pastikan status pembayaran berubah menjadi CANCELLED.
  const cancelledStatus = await api(
    'GET',
    `/api/payments/${cancelledId}`,
    null,
    fo
  );

  assert.equal(cancelledStatus.data.status, 'CANCELLED');

  // Pembayaran yang dibatalkan tidak boleh dikonfirmasi.
  const confirmCancelled = await api(
    'POST',
    `/api/payments/${cancelledId}/confirm`,
    {},
    fo
  );

  assert.equal(confirmCancelled.status, 400);

  // Pastikan pembatalan tidak mengurangi sisa tagihan.
  const finalOrder = await api(
    'GET',
    `/api/orders/${testOrderId}`,
    null,
    fo
  );

  assert.equal(finalOrder.data.outstanding, originalTotal - 10000);
  assert.equal(finalOrder.data.payment_status, 'PARTIAL');
});

test('dispatch & kurir: antar dengan COD sisa tagihan', async () => {
  const list = (await api('GET', '/api/deliveries', null, fo)).data;
  const d = list.find((x) => x.order_id === orderId && x.type === 'DROPOFF');
  const couriers = (await api('GET', '/api/couriers', null, fo)).data;
  const agus = couriers.find((c) => c.name.startsWith('Agus'));
  const bayu = couriers.find((c) => c.name.startsWith('Bayu'));
  const as = await api('POST', `/api/deliveries/${d.id}/assign`, { courier_id: agus.id, scheduled_at: '2026-10-26T10:00' }, fo);
  assert.equal(as.status, 200, JSON.stringify(as.data));
  // kurir lain tidak boleh pegang tugas ini
  const bayuCookie = await login('kurir2', 'kurir123');
  assert.equal((await api('POST', `/api/deliveries/${d.id}/status`, { status: 'ON_THE_WAY' }, bayuCookie)).status, 403);
  assert.ok(bayu);

  const mine = (await api('GET', '/api/my/deliveries', null, kurir)).data;
  assert.ok(mine.find((x) => x.id === d.id));
  const otw = await api('POST', `/api/deliveries/${d.id}/status`, { status: 'ON_THE_WAY' }, kurir);
  assert.equal(otw.data.order_status, 'DELIVERING');
  // belum lunas 40.000 -> harus COD
  const noCash = await api('POST', `/api/deliveries/${d.id}/status`, { status: 'DONE' }, kurir);
  assert.equal(noCash.status, 400);
  const done = await api('POST', `/api/deliveries/${d.id}/status`, { status: 'DONE', collect_cash: true, proof_note: 'Diterima satpam' }, kurir);
  assert.equal(done.status, 200, JSON.stringify(done.data));
  assert.equal(done.data.order_status, 'DELIVERED');
  const o = (await api('GET', `/api/orders/${orderId}`, null, fo)).data;
  assert.equal(o.outstanding, 0);
  assert.equal(o.payment_status, 'PAID');
});

test('booking web -> jemput kurir -> order diterima', async () => {
  const b = await api('POST', '/api/public/booking', { name: 'Web User', phone: '081377778888', address: 'Jl. Web 9', pairs: 2, return_method: 'DELIVERY' });
  assert.equal(b.status, 200, JSON.stringify(b.data));
  const d = (await api('GET', '/api/deliveries', null, fo)).data.find((x) => x.order_code === b.data.code && x.type === 'PICKUP');
  const agus = (await api('GET', '/api/couriers', null, fo)).data.find((c) => c.name.startsWith('Agus'));
  await api('POST', `/api/deliveries/${d.id}/assign`, { courier_id: agus.id }, fo);
  await api('POST', `/api/deliveries/${d.id}/status`, { status: 'ON_THE_WAY' }, kurir);
  const done = await api('POST', `/api/deliveries/${d.id}/status`, { status: 'DONE' }, kurir);
  assert.equal(done.data.order_status, 'RECEIVED');
  // FO melengkapi item lalu bisa proses
  const fast = (await api('GET', '/api/services', null, fo)).data.find((s) => s.code === 'FAST');
  const up = await api('PUT', `/api/orders/${d.order_id}`, { items: [{ service_id: fast.id, qty: 2 }] }, fo);
  assert.equal(up.status, 200, JSON.stringify(up.data));
  assert.equal(up.data.total, 60000 + 10000);
});

test('dispute: pelanggan komplain, staf balas & refund', async () => {
  const c = await api('POST', '/api/public/disputes', { code: orderCode, phone: '6281299990001', category: 'QUALITY', description: 'Masih ada noda di bagian samping sepatu.' });
  assert.equal(c.status, 200, JSON.stringify(c.data));
  const dup = await api('POST', '/api/public/disputes', { code: orderCode, phone: '6281299990001', category: 'OTHER', description: 'komplain kedua sekaligus' });
  assert.equal(dup.status, 400);
  const list = (await api('GET', '/api/disputes?status=active', null, fo)).data;
  const d = list.find((x) => x.code === c.data.code);
  await api('POST', `/api/disputes/${d.id}/messages`, { message: 'Mohon maaf, kami cek dulu ya.' }, fo);
  const tooMuch = await api('POST', `/api/disputes/${d.id}/resolve`, { status: 'RESOLVED', resolution: 'REFUND', refund_amount: 999999, note: 'x' }, fo);
  assert.equal(tooMuch.status, 400);
  const res = await api('POST', `/api/disputes/${d.id}/resolve`, { status: 'RESOLVED', resolution: 'REFUND', refund_amount: 20000, note: 'Refund sebagian' }, fo);
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const tr = (await api('POST', '/api/public/track', { code: orderCode, phone: '081299990001' })).data;
  assert.equal(tr.refunded, 20000);
  assert.equal(tr.disputes[0].status, 'RESOLVED');
  assert.ok(tr.disputes[0].messages.length >= 4);
});

test('laporan & dashboard konsisten', async () => {
  const r = (await api('GET', '/api/reports/summary', null, bo)).data;
  assert.equal(r.cash + r.qris, r.received);
  assert.equal(r.refunds, 20000);
  assert.ok(r.material_cost > 0);
  assert.equal(r.daily.length, 30);
  const d = (await api('GET', '/api/dashboard', null, fo)).data;
  assert.equal(d.open_disputes, 0);
  assert.equal(typeof d.money.received, 'number');
});

test('pengaturan: QRIS tidak valid ditolak', async () => {
  const bad = await api('PUT', '/api/settings', { qris_static: '000201010211xxxx6304ABCD' }, admin);
  assert.equal(bad.status, 400);
});
