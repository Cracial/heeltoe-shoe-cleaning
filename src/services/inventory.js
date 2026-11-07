'use strict';
// Inventory dengan metode LIFO (Last In, First Out):
// barang yang terakhir masuk adalah yang pertama dikeluarkan, sehingga HPP (biaya bahan)
// tiap pemakaian dihitung dari harga beli batch terbaru.
const { all, get, run, tx } = require('../db');
const { bad, notFound, now } = require('../lib/util');

function itemOrThrow(itemId) {
  const it = get('SELECT * FROM items WHERE id = ?', itemId);
  if (!it) throw notFound('Barang tidak ditemukan');
  return it;
}

function stockOf(itemId) {
  return get(
    `SELECT COALESCE(SUM(qty_remaining), 0) AS qty,
            COALESCE(ROUND(SUM(qty_remaining * unit_cost)), 0) AS value
       FROM stock_batches WHERE item_id = ?`, itemId);
}

/** Barang masuk: membuat batch (layer) baru + catatan kartu stok. */
function stockIn({ itemId, qty, unitCost, supplier = null, note = null, userId = null, type = 'IN', at = now() }) {
  if (!Number.isInteger(qty) || qty <= 0) throw bad('Jumlah masuk harus bilangan bulat > 0');
  if (!(unitCost >= 0)) throw bad('Harga per satuan tidak valid');
  return tx(() => {
    itemOrThrow(itemId);
    const b = run(
      `INSERT INTO stock_batches (item_id, qty_in, qty_remaining, unit_cost, supplier, note, received_at, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, itemId, qty, qty, unitCost, supplier, note, at, userId);
    const batchId = Number(b.lastInsertRowid);
    run(`INSERT INTO stock_moves (item_id, batch_id, type, qty, unit_cost, ref_type, ref_id, note, user_id, created_at)
         VALUES (?, ?, ?, ?, ?, 'BATCH', ?, ?, ?, ?)`, itemId, batchId, type, qty, unitCost, batchId, note, userId, at);
    return batchId;
  });
}

/**
 * Barang keluar dengan LIFO: ambil dari batch paling baru dulu.
 * Mengembalikan { cost, layers } — rincian batch yang terpakai.
 */
function consumeLIFO({ itemId, qty, refType = null, refId = null, note = null, userId = null, type = 'OUT', at = now() }) {
  if (!Number.isInteger(qty) || qty <= 0) throw bad('Jumlah keluar harus bilangan bulat > 0');
  return tx(() => {
    const item = itemOrThrow(itemId);
    const batches = all(
      `SELECT id, qty_remaining, unit_cost FROM stock_batches
        WHERE item_id = ? AND qty_remaining > 0
        ORDER BY received_at DESC, id DESC`, itemId);
    const available = batches.reduce((s, b) => s + b.qty_remaining, 0);
    if (available < qty) {
      throw bad(`Stok ${item.name} tidak cukup: butuh ${qty} ${item.unit}, tersedia ${available} ${item.unit}`);
    }
    let left = qty;
    let cost = 0;
    const layers = [];
    for (const b of batches) {
      if (left === 0) break;
      const take = Math.min(left, b.qty_remaining);
      run('UPDATE stock_batches SET qty_remaining = qty_remaining - ? WHERE id = ?', take, b.id);
      run(`INSERT INTO stock_moves (item_id, batch_id, type, qty, unit_cost, ref_type, ref_id, note, user_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, itemId, b.id, type, take, b.unit_cost, refType, refId, note, userId, at);
      cost += take * b.unit_cost;
      layers.push({ batch_id: b.id, qty: take, unit_cost: b.unit_cost });
      left -= take;
    }
    return { cost, layers };
  });
}

/** Kebutuhan bahan sebuah order berdasarkan resep (BOM) layanan × jumlah pasang. */
function requirementsForOrder(orderId) {
  return all(
    `SELECT sm.item_id, i.name, i.unit, SUM(sm.qty * oi.qty) AS need,
            (SELECT COALESCE(SUM(qty_remaining), 0) FROM stock_batches b WHERE b.item_id = sm.item_id) AS available
       FROM order_items oi
       JOIN service_materials sm ON sm.service_id = oi.service_id
       JOIN items i ON i.id = sm.item_id
      WHERE oi.order_id = ?
      GROUP BY sm.item_id
      ORDER BY i.name`, orderId);
}

/** Potong stok untuk order (dipanggil saat order masuk proses cuci). Return total HPP bahan (Rupiah). */
function consumeForOrder(orderId, orderCode, userId) {
  return tx(() => {
    const req = requirementsForOrder(orderId);
    const short = req.filter((r) => r.available < r.need);
    if (short.length) {
      throw bad('Stok bahan tidak cukup untuk memproses order ini: ' +
        short.map((s) => `${s.name} (butuh ${s.need} ${s.unit}, ada ${s.available})`).join('; '),
      { shortages: short });
    }
    let total = 0;
    for (const r of req) {
      total += consumeLIFO({ itemId: r.item_id, qty: r.need, refType: 'ORDER', refId: orderId, note: `Pemakaian order ${orderCode}`, userId }).cost;
    }
    return Math.round(total);
  });
}

/** Penyesuaian stok opname: qty positif = tambah, negatif = kurangi (LIFO). */
function adjust({ itemId, qty, unitCost = null, note, userId }) {
  if (!Number.isInteger(qty) || qty === 0) throw bad('Jumlah penyesuaian harus bilangan bulat dan bukan 0');
  if (qty > 0) {
    let cost = unitCost;
    if (cost === null || cost === undefined) {
      const last = get('SELECT unit_cost FROM stock_batches WHERE item_id = ? ORDER BY received_at DESC, id DESC LIMIT 1', itemId);
      cost = last ? last.unit_cost : 0;
    }
    stockIn({ itemId, qty, unitCost: cost, note: note || 'Penyesuaian (tambah)', userId, type: 'ADJ_IN' });
    return { cost: qty * cost };
  }
  return consumeLIFO({ itemId, qty: -qty, refType: 'ADJUST', note: note || 'Penyesuaian (kurang)', userId, type: 'ADJ_OUT' });
}

function listItems() {
  return all(
    `SELECT i.*,
            COALESCE(SUM(b.qty_remaining), 0) AS stock,
            COALESCE(ROUND(SUM(b.qty_remaining * b.unit_cost)), 0) AS stock_value,
            (SELECT unit_cost FROM stock_batches x WHERE x.item_id = i.id ORDER BY received_at DESC, id DESC LIMIT 1) AS last_cost
       FROM items i LEFT JOIN stock_batches b ON b.item_id = i.id AND b.qty_remaining > 0
      GROUP BY i.id
      ORDER BY i.active DESC, i.name`);
}

function itemDetail(itemId) {
  const item = itemOrThrow(itemId);
  const s = stockOf(itemId);
  const layers = all(
    `SELECT id, qty_in, qty_remaining, unit_cost, supplier, note, received_at
       FROM stock_batches WHERE item_id = ? AND qty_remaining > 0
      ORDER BY received_at DESC, id DESC`, itemId);
  const moves = all(
    `SELECT m.*, u.name AS user_name, o.code AS order_code
       FROM stock_moves m
       LEFT JOIN users u ON u.id = m.user_id
       LEFT JOIN orders o ON m.ref_type = 'ORDER' AND o.id = m.ref_id
      WHERE m.item_id = ?
      ORDER BY m.id DESC LIMIT 200`, itemId);
  const usedBy = all(
    `SELECT s.id, s.name, sm.qty FROM service_materials sm JOIN services s ON s.id = sm.service_id
      WHERE sm.item_id = ? ORDER BY s.sort, s.name`, itemId);
  return { ...item, stock: s.qty, stock_value: s.value, layers, moves, used_by: usedBy };
}

module.exports = { stockOf, stockIn, consumeLIFO, consumeForOrder, requirementsForOrder, adjust, listItems, itemDetail };
