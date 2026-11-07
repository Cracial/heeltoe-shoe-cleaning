'use strict';
// API back office: inventory LIFO dan layanan + resep bahan (BOM).
const { all, get, run, tx } = require('../db');
const { bad, notFound, str, int, num } = require('../lib/util');
const { requireRole } = require('../lib/auth');
const inv = require('../services/inventory');

const BO = requireRole('backoffice');
const STAFF = requireRole('frontoffice', 'backoffice');

function readItem(b) {
  return {
    sku: str(b.sku, 'SKU', { max: 30 }).toUpperCase(),
    name: str(b.name, 'Nama barang', { max: 100 }),
    unit: str(b.unit, 'Satuan', { max: 10 }),
    min_stock: int(b.min_stock || 0, 'Stok minimum', { min: 0 }),
    active: b.active === false || b.active === 0 ? 0 : 1,
  };
}

function readService(b) {
  return {
    code: str(b.code, 'Kode', { max: 10 }).toUpperCase(),
    name: str(b.name, 'Nama layanan', { max: 80 }),
    description: str(b.description, 'Deskripsi', { required: false, max: 400 }),
    price: int(b.price, 'Harga', { min: 0 }),
    duration_days: int(b.duration_days, 'Durasi (hari)', { min: 0, max: 60 }),
    active: b.active === false || b.active === 0 ? 0 : 1,
    sort: int(b.sort || 0, 'Urutan', { min: 0 }),
    materials: (Array.isArray(b.materials) ? b.materials : []).filter((m) => m && m.item_id).map((m) => ({
      item_id: int(m.item_id, 'Bahan'), qty: int(m.qty, 'Jumlah bahan', { min: 1 }),
    })),
  };
}

function writeMaterials(serviceId, materials) {
  run('DELETE FROM service_materials WHERE service_id = ?', serviceId);
  const seen = new Set();
  for (const m of materials) {
    if (seen.has(m.item_id)) throw bad('Bahan yang sama tercantum dua kali di resep');
    seen.add(m.item_id);
    if (!get('SELECT id FROM items WHERE id = ?', m.item_id)) throw bad('Bahan tidak ditemukan');
    run('INSERT INTO service_materials (service_id, item_id, qty) VALUES (?, ?, ?)', serviceId, m.item_id, m.qty);
  }
}

function serviceList() {
  const services = all('SELECT * FROM services ORDER BY active DESC, sort, name');
  const mats = all(
    `SELECT sm.service_id, sm.item_id, sm.qty, i.name, i.unit,
            (SELECT unit_cost FROM stock_batches b WHERE b.item_id = i.id ORDER BY received_at DESC, id DESC LIMIT 1) AS last_cost
       FROM service_materials sm JOIN items i ON i.id = sm.item_id`);
  return services.map((s) => {
    const materials = mats.filter((m) => m.service_id === s.id);
    const est = materials.reduce((t, m) => t + m.qty * (m.last_cost || 0), 0);
    return { ...s, materials, est_material_cost: Math.round(est), est_margin: s.price - Math.round(est) };
  });
}

module.exports = (r) => {
  // ---------- Barang ----------
  r.get('/api/items', STAFF, () => inv.listItems());
  r.get('/api/items/:id', STAFF, (ctx) => inv.itemDetail(int(ctx.params.id, 'ID')));

  r.post('/api/items', BO, (ctx) => {
    const it = readItem(ctx.body);
    if (get('SELECT id FROM items WHERE sku = ?', it.sku)) throw bad('SKU sudah dipakai');
    const id = Number(run('INSERT INTO items (sku, name, unit, min_stock, active) VALUES (?, ?, ?, ?, ?)',
      it.sku, it.name, it.unit, it.min_stock, it.active).lastInsertRowid);
    const qty = int(ctx.body.initial_qty, 'Stok awal', { required: false, min: 0 });
    if (qty) inv.stockIn({ itemId: id, qty, unitCost: num(ctx.body.initial_cost, 'Harga per satuan', { min: 0 }), note: 'Stok awal', userId: ctx.user.id });
    return inv.itemDetail(id);
  });

  r.put('/api/items/:id', BO, (ctx) => {
    const id = int(ctx.params.id, 'ID');
    const it = readItem(ctx.body);
    if (!get('SELECT id FROM items WHERE id = ?', id)) throw notFound();
    if (get('SELECT id FROM items WHERE sku = ? AND id <> ?', it.sku, id)) throw bad('SKU sudah dipakai');
    run('UPDATE items SET sku = ?, name = ?, unit = ?, min_stock = ?, active = ? WHERE id = ?', it.sku, it.name, it.unit, it.min_stock, it.active, id);
    return inv.itemDetail(id);
  });

  r.post('/api/items/:id/stock-in', BO, (ctx) => {
    const id = int(ctx.params.id, 'ID');
    inv.stockIn({
      itemId: id, qty: int(ctx.body.qty, 'Jumlah', { min: 1 }),
      unitCost: ctx.body.total_cost ? num(ctx.body.total_cost, 'Total harga', { min: 0 }) / int(ctx.body.qty, 'Jumlah', { min: 1 })
        : num(ctx.body.unit_cost, 'Harga per satuan', { min: 0 }),
      supplier: str(ctx.body.supplier, 'Supplier', { required: false, max: 100 }),
      note: str(ctx.body.note, 'Catatan', { required: false, max: 200 }), userId: ctx.user.id,
    });
    return inv.itemDetail(id);
  });

  r.post('/api/items/:id/adjust', BO, (ctx) => {
    const id = int(ctx.params.id, 'ID');
    inv.adjust({
      itemId: id, qty: int(ctx.body.qty, 'Jumlah penyesuaian'),
      unitCost: ctx.body.unit_cost !== undefined && ctx.body.unit_cost !== '' ? num(ctx.body.unit_cost, 'Harga', { min: 0 }) : null,
      note: str(ctx.body.note, 'Alasan penyesuaian', { max: 200 }), userId: ctx.user.id,
    });
    return inv.itemDetail(id);
  });

  // Ringkasan nilai persediaan
  r.get('/api/inventory/summary', STAFF, () => {
    const items = inv.listItems();
    return {
      total_value: items.reduce((s, i) => s + i.stock_value, 0),
      low_stock: items.filter((i) => i.active && i.stock <= i.min_stock),
      item_count: items.length,
    };
  });

  // ---------- Layanan ----------
  r.get('/api/services', STAFF, () => serviceList());

  r.post('/api/services', BO, (ctx) => {
    const s = readService(ctx.body);
    if (get('SELECT id FROM services WHERE code = ?', s.code)) throw bad('Kode layanan sudah dipakai');
    tx(() => {
      const id = Number(run('INSERT INTO services (code, name, description, price, duration_days, active, sort) VALUES (?, ?, ?, ?, ?, ?, ?)',
        s.code, s.name, s.description, s.price, s.duration_days, s.active, s.sort).lastInsertRowid);
      writeMaterials(id, s.materials);
    });
    return serviceList();
  });

  r.put('/api/services/:id', BO, (ctx) => {
    const id = int(ctx.params.id, 'ID');
    const s = readService(ctx.body);
    if (!get('SELECT id FROM services WHERE id = ?', id)) throw notFound();
    if (get('SELECT id FROM services WHERE code = ? AND id <> ?', s.code, id)) throw bad('Kode layanan sudah dipakai');
    tx(() => {
      run('UPDATE services SET code = ?, name = ?, description = ?, price = ?, duration_days = ?, active = ?, sort = ? WHERE id = ?',
        s.code, s.name, s.description, s.price, s.duration_days, s.active, s.sort, id);
      writeMaterials(id, s.materials);
    });
    return serviceList();
  });
};
