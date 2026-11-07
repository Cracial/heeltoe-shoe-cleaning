'use strict';
// Data awal: pengaturan usaha, akun per peran, layanan + resep bahan, stok awal (2 batch harga berbeda
// agar efek LIFO langsung terlihat), dan beberapa order contoh.
const crypto = require('node:crypto');
const { get, run, tx, setSetting } = require('./db');
const { hashPassword } = require('./lib/auth');
const { now } = require('./lib/util');
const qris = require('./lib/qris');
const inventory = require('./services/inventory');
const orders = require('./services/orders');

function seed({ demoOrders = true } = {}) {
  if (get('SELECT COUNT(*) AS n FROM users').n > 0) return false;

  tx(() => {
    const settings = {
      business_name: 'Sepatu Kinclong',
      tagline: 'Cuci sepatu profesional — jemput, cuci, antar.',
      about: 'Sepatu Kinclong adalah jasa perawatan sepatu profesional yang berdiri sejak 2021. Kami menangani sneakers, sepatu kulit, suede, hingga sepatu anak dengan bahan pembersih khusus yang aman untuk setiap material. Setiap pasang ditangani manual oleh teknisi terlatih dan melewati quality control sebelum dikembalikan.',
      vision: 'Menjadi layanan perawatan sepatu paling tepercaya di kota kami.',
      mission: 'Mengerjakan setiap pasang dengan teliti dan bahan yang tepat|Transparan soal harga, waktu, dan status pengerjaan|Memudahkan pelanggan lewat layanan jemput-antar dan pembayaran QRIS|Memberdayakan anak muda sekitar sebagai teknisi dan kurir',
      address: 'Jl. Contoh Raya No. 12, Jakarta Selatan',
      phone: '6281234567890',
      email: 'halo@sepatukinclong.id',
      open_hours: 'Senin–Sabtu 09.00–20.00 · Minggu 10.00–17.00',
      maps_url: 'https://maps.google.com/?q=Jakarta+Selatan',
      instagram: 'sepatukinclong',
      delivery_fee: '10000',
      qris_static: qris.demoStatic(),
      webhook_secret: crypto.randomBytes(18).toString('hex'),
      public_url: 'http://localhost:3000',
    };
    for (const [k, v] of Object.entries(settings)) setSetting(k, v);

    const users = [
      ['Pemilik (Admin)', 'admin', 'admin123', 'admin', '6281234567890'],
      ['Rina (Front Office)', 'fo', 'fo123', 'frontoffice', null],
      ['Dimas (Back Office)', 'bo', 'bo123', 'backoffice', null],
      ['Agus (Kurir)', 'kurir1', 'kurir123', 'kurir', '6281300000001'],
      ['Bayu (Kurir)', 'kurir2', 'kurir123', 'kurir', '6281300000002'],
    ];
    for (const [name, username, pw, role, phone] of users) {
      run('INSERT INTO users (name, username, password_hash, role, phone, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        name, username, hashPassword(pw), role, phone, now());
    }

    // Barang habis pakai: [sku, nama, satuan, stok minimum]
    const items = [
      ['SHP-01', 'Sabun / shampoo sepatu', 'ml', 500],
      ['DEO-01', 'Gel unyellowing (deoxidizer)', 'ml', 200],
      ['CAT-01', 'Cat sepatu (repaint)', 'ml', 200],
      ['LEM-01', 'Lem sepatu', 'ml', 100],
      ['PRF-01', 'Parfum / deodorizer sepatu', 'ml', 200],
      ['LTH-01', 'Leather conditioner', 'ml', 100],
      ['WRP-01', 'Water repellent spray', 'ml', 200],
      ['PLS-01', 'Plastik / shoe bag kemasan', 'pcs', 30],
      ['TIS-01', 'Tisu pengisi bentuk (paper stuffing)', 'pcs', 40],
    ];
    const itemId = {};
    for (const [sku, name, unit, min] of items) {
      itemId[sku] = Number(run('INSERT INTO items (sku, name, unit, min_stock) VALUES (?, ?, ?, ?)', sku, name, unit, min).lastInsertRowid);
    }

    // Layanan: [kode, nama, deskripsi, harga, hari, resep {sku: qty per pasang}]
    const services = [
      ['FAST', 'Fast Clean', 'Pembersihan bagian luar (upper & midsole). Cocok untuk perawatan rutin.', 30000, 1, { 'SHP-01': 15, 'PRF-01': 5, 'PLS-01': 1 }],
      ['DEEP', 'Deep Clean', 'Cuci menyeluruh: upper, midsole, outsole, bagian dalam, insole & tali.', 55000, 3, { 'SHP-01': 30, 'PRF-01': 10, 'PLS-01': 1, 'TIS-01': 2 }],
      ['PREM', 'Premium Treatment', 'Untuk bahan sensitif: suede, nubuck, kulit, dan sepatu premium.', 85000, 4, { 'SHP-01': 25, 'LTH-01': 10, 'PRF-01': 10, 'PLS-01': 1, 'TIS-01': 2 }],
      ['UNYL', 'Unyellowing', 'Menghilangkan warna kuning pada midsole & sol karet.', 65000, 4, { 'DEO-01': 20, 'SHP-01': 20, 'PLS-01': 1 }],
      ['RPNT', 'Repaint', 'Pengecatan ulang bagian yang pudar, warna disesuaikan.', 150000, 7, { 'CAT-01': 40, 'SHP-01': 20, 'PLS-01': 1 }],
      ['RGLU', 'Reglue', 'Lem ulang sol yang mengelupas, dipres agar kuat.', 75000, 5, { 'LEM-01': 15, 'PLS-01': 1 }],
      ['WREP', 'Water Repellent', 'Lapisan anti air & noda (tambahan, setelah dicuci).', 25000, 1, { 'WRP-01': 20 }],
      ['KIDS', 'Kids Shoes Clean', 'Cuci bersih sepatu anak, bahan lembut dan aman.', 25000, 2, { 'SHP-01': 10, 'PRF-01': 5, 'PLS-01': 1 }],
    ];
    services.forEach(([code, name, desc, price, days, bom], i) => {
      const sid = Number(run('INSERT INTO services (code, name, description, price, duration_days, sort) VALUES (?, ?, ?, ?, ?, ?)',
        code, name, desc, price, days, i).lastInsertRowid);
      for (const [sku, q] of Object.entries(bom)) run('INSERT INTO service_materials (service_id, item_id, qty) VALUES (?, ?, ?)', sid, itemId[sku], q);
    });

    // Stok awal: batch lama (lebih murah) & batch baru (lebih mahal) -> LIFO memakai batch baru dulu.
    const stock = [
      ['SHP-01', 2000, 45, 2000, 52], ['DEO-01', 500, 180, 500, 195], ['CAT-01', 500, 220, 500, 240],
      ['LEM-01', 300, 150, 300, 160], ['PRF-01', 1000, 60, 1000, 65], ['LTH-01', 300, 200, 300, 215],
      ['WRP-01', 500, 120, 500, 130], ['PLS-01', 200, 1500, 200, 1700], ['TIS-01', 300, 200, 300, 250],
    ];
    const d = now().slice(0, 10);
    for (const [sku, q1, c1, q2, c2] of stock) {
      inventory.stockIn({ itemId: itemId[sku], qty: q1, unitCost: c1, supplier: 'Grosir Kimia Jaya', note: 'Stok awal (batch lama)', at: shiftDate(d, -14) + ' 08:00:00' });
      inventory.stockIn({ itemId: itemId[sku], qty: q2, unitCost: c2, supplier: 'Grosir Kimia Jaya', note: 'Pembelian terbaru', at: shiftDate(d, -2) + ' 08:00:00' });
    }
  });

  if (demoOrders) seedDemoOrders();
  return true;
}

function shiftDate(d, days) {
  const x = new Date(d + 'T00:00:00Z');
  x.setUTCDate(x.getUTCDate() + days);
  return x.toISOString().slice(0, 10);
}

function seedDemoOrders() {
  const fo = get(`SELECT id, name, role FROM users WHERE username = 'fo'`);
  const bo = get(`SELECT id, name, role FROM users WHERE username = 'bo'`);
  const svc = (code) => get('SELECT id FROM services WHERE code = ?', code).id;

  // 1) Order counter, sudah dicuci & siap diambil, lunas tunai
  const a = orders.createOrder({
    customer: { name: 'Andi Pratama', phone: '081211110001', address: 'Jl. Melati 5, Tebet' },
    items: [{ service_id: svc('DEEP'), shoe: 'Nike Air Force 1 putih', qty: 1, condition_note: 'Noda di toe box' }],
    user: fo,
  });
  orders.payCash(a, { amount: 55000, cashReceived: 100000, user: fo });
  orders.changeStatus(a, 'WASHING', { user: bo });
  orders.changeStatus(a, 'QC', { user: bo });
  orders.changeStatus(a, 'READY', { user: bo });

  // 2) Order antar, sedang dicuci, belum bayar
  const b = orders.createOrder({
    customer: { name: 'Sari Wulandari', phone: '081211110002', address: 'Apartemen Kalibata Tower B 12/07' },
    items: [
      { service_id: svc('UNYL'), shoe: 'Converse Chuck 70 putih', qty: 1 },
      { service_id: svc('FAST'), shoe: 'Vans Old Skool hitam', qty: 1 },
    ],
    returnMethod: 'DELIVERY', address: 'Apartemen Kalibata Tower B 12/07', deliveryFee: 10000, user: fo,
  });
  orders.changeStatus(b, 'WASHING', { user: bo });

  // 3) Booking jemput dari website
  const c = orders.createOrder({
    customer: { name: 'Budi Santoso', phone: '081211110003', address: 'Jl. Kenanga 21, Pancoran' },
    returnMethod: 'DELIVERY', address: 'Jl. Kenanga 21, Pancoran', deliveryFee: 10000, source: 'WEB', booked: true,
    notes: '3 pasang sneakers, minta deep clean',
  });
  orders.createDelivery(c, 'PICKUP', { address: 'Jl. Kenanga 21, Pancoran', phone: '6281211110003', note: 'Booking dari website' });
}

module.exports = { seed };
