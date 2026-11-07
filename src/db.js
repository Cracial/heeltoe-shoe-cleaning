'use strict';
// Database: SQLite bawaan Node (node:sqlite) — tanpa dependensi, satu file, mode WAL.
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'sepatu-kinclong.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
  PRAGMA temp_store = MEMORY;
  PRAGMA cache_size = -16000;
`);

// Cache prepared statement agar query berulang tidak di-parse ulang.
const cache = new Map();
function stmt(sql) {
  let s = cache.get(sql);
  if (!s) { s = db.prepare(sql); cache.set(sql, s); }
  return s;
}
const clean = (p) => p.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));
const all = (sql, ...p) => stmt(sql).all(...clean(p));
const get = (sql, ...p) => stmt(sql).get(...clean(p));
const run = (sql, ...p) => stmt(sql).run(...clean(p));

// Transaksi (bersarang = ikut transaksi luar).
let depth = 0;
function tx(fn) {
  if (depth > 0) return fn();
  db.exec('BEGIN IMMEDIATE');
  depth = 1;
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  } finally {
    depth = 0;
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin','frontoffice','backoffice','kurir')),
  phone         TEXT,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL UNIQUE,
  address    TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS services (
  id            INTEGER PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  description   TEXT,
  price         INTEGER NOT NULL CHECK (price >= 0),
  duration_days INTEGER NOT NULL DEFAULT 3,
  active        INTEGER NOT NULL DEFAULT 1,
  sort          INTEGER NOT NULL DEFAULT 0
);

-- Barang habis pakai (sabun, cat, lem, plastik...). Satuan bulat terkecil: ml, gr, pcs.
CREATE TABLE IF NOT EXISTS items (
  id        INTEGER PRIMARY KEY,
  sku       TEXT NOT NULL UNIQUE,
  name      TEXT NOT NULL,
  unit      TEXT NOT NULL,
  min_stock INTEGER NOT NULL DEFAULT 0,
  active    INTEGER NOT NULL DEFAULT 1
);

-- Resep/BOM: pemakaian bahan per 1 pasang untuk tiap layanan.
CREATE TABLE IF NOT EXISTS service_materials (
  service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  item_id    INTEGER NOT NULL REFERENCES items(id),
  qty        INTEGER NOT NULL CHECK (qty > 0),
  PRIMARY KEY (service_id, item_id)
);

-- Lapisan stok (layer) untuk LIFO: setiap penerimaan barang = 1 batch dengan harga sendiri.
CREATE TABLE IF NOT EXISTS stock_batches (
  id            INTEGER PRIMARY KEY,
  item_id       INTEGER NOT NULL REFERENCES items(id),
  qty_in        INTEGER NOT NULL CHECK (qty_in > 0),
  qty_remaining INTEGER NOT NULL CHECK (qty_remaining >= 0),
  unit_cost     REAL NOT NULL CHECK (unit_cost >= 0),
  supplier      TEXT,
  note          TEXT,
  received_at   TEXT NOT NULL,
  user_id       INTEGER
);
CREATE INDEX IF NOT EXISTS idx_batches_lifo ON stock_batches (item_id, received_at DESC, id DESC) WHERE qty_remaining > 0;

-- Kartu stok: semua mutasi masuk/keluar, lengkap dengan batch & harga pokoknya.
CREATE TABLE IF NOT EXISTS stock_moves (
  id         INTEGER PRIMARY KEY,
  item_id    INTEGER NOT NULL REFERENCES items(id),
  batch_id   INTEGER REFERENCES stock_batches(id),
  type       TEXT NOT NULL CHECK (type IN ('IN','OUT','ADJ_IN','ADJ_OUT')),
  qty        INTEGER NOT NULL,
  unit_cost  REAL NOT NULL,
  ref_type   TEXT,
  ref_id     INTEGER,
  note       TEXT,
  user_id    INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_moves_item ON stock_moves (item_id, id);
CREATE INDEX IF NOT EXISTS idx_moves_ref ON stock_moves (ref_type, ref_id);
CREATE INDEX IF NOT EXISTS idx_moves_date ON stock_moves (created_at);

CREATE TABLE IF NOT EXISTS orders (
  id                 INTEGER PRIMARY KEY,
  code               TEXT NOT NULL UNIQUE,
  customer_id        INTEGER NOT NULL REFERENCES customers(id),
  status             TEXT NOT NULL,
  source             TEXT NOT NULL DEFAULT 'COUNTER' CHECK (source IN ('COUNTER','WEB')),
  return_method      TEXT NOT NULL DEFAULT 'STORE' CHECK (return_method IN ('STORE','DELIVERY')),
  address            TEXT,
  subtotal           INTEGER NOT NULL DEFAULT 0,
  discount           INTEGER NOT NULL DEFAULT 0,
  delivery_fee       INTEGER NOT NULL DEFAULT 0,
  total              INTEGER NOT NULL DEFAULT 0,
  material_cost      INTEGER NOT NULL DEFAULT 0,
  materials_consumed INTEGER NOT NULL DEFAULT 0,
  notes              TEXT,
  due_date           TEXT,
  created_by         INTEGER,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders (created_at);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders (customer_id);

CREATE TABLE IF NOT EXISTS order_items (
  id             INTEGER PRIMARY KEY,
  order_id       INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  service_id     INTEGER NOT NULL REFERENCES services(id),
  service_name   TEXT NOT NULL,
  shoe           TEXT,
  qty            INTEGER NOT NULL CHECK (qty > 0),
  price          INTEGER NOT NULL,
  condition_note TEXT
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items (order_id);

CREATE TABLE IF NOT EXISTS order_logs (
  id         INTEGER PRIMARY KEY,
  order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status     TEXT NOT NULL,
  note       TEXT,
  user_name  TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_order_logs_order ON order_logs (order_id);

CREATE TABLE IF NOT EXISTS payments (
  id            INTEGER PRIMARY KEY,
  order_id      INTEGER NOT NULL REFERENCES orders(id),
  method        TEXT NOT NULL CHECK (method IN ('CASH','QRIS','REFUND')),
  amount        INTEGER NOT NULL,
  cash_received INTEGER,
  change_amount INTEGER,
  status        TEXT NOT NULL CHECK (status IN ('PENDING','PAID','CANCELLED','EXPIRED')),
  ref           TEXT NOT NULL UNIQUE,
  qris_payload  TEXT,
  expires_at    INTEGER,
  note          TEXT,
  user_id       INTEGER,
  created_at    TEXT NOT NULL,
  paid_at       TEXT
);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments (order_id);
CREATE INDEX IF NOT EXISTS idx_payments_paid ON payments (status, paid_at);

CREATE TABLE IF NOT EXISTS deliveries (
  id            INTEGER PRIMARY KEY,
  order_id      INTEGER NOT NULL REFERENCES orders(id),
  type          TEXT NOT NULL CHECK (type IN ('PICKUP','DROPOFF')),
  address       TEXT NOT NULL,
  contact_phone TEXT,
  scheduled_at  TEXT,
  courier_id    INTEGER REFERENCES users(id),
  status        TEXT NOT NULL CHECK (status IN ('PENDING','ASSIGNED','ON_THE_WAY','DONE','FAILED','CANCELLED')),
  note          TEXT,
  proof_note    TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  done_at       TEXT
);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries (status);
CREATE INDEX IF NOT EXISTS idx_deliveries_courier ON deliveries (courier_id, status);
CREATE INDEX IF NOT EXISTS idx_deliveries_order ON deliveries (order_id);

CREATE TABLE IF NOT EXISTS disputes (
  id            INTEGER PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  order_id      INTEGER NOT NULL REFERENCES orders(id),
  category      TEXT NOT NULL CHECK (category IN ('DAMAGE','LOST','QUALITY','LATE','PAYMENT','OTHER')),
  description   TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('OPEN','INVESTIGATING','RESOLVED','REJECTED')),
  resolution    TEXT CHECK (resolution IN ('REWASH','REFUND','COMPENSATION','NONE')),
  refund_amount INTEGER NOT NULL DEFAULT 0,
  source        TEXT NOT NULL DEFAULT 'CUSTOMER',
  handled_by    INTEGER REFERENCES users(id),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  resolved_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes (status);
CREATE INDEX IF NOT EXISTS idx_disputes_order ON disputes (order_id);

CREATE TABLE IF NOT EXISTS dispute_messages (
  id          INTEGER PRIMARY KEY,
  dispute_id  INTEGER NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  author_type TEXT NOT NULL CHECK (author_type IN ('CUSTOMER','STAFF','SYSTEM')),
  author_name TEXT,
  message     TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dmsg ON dispute_messages (dispute_id);

CREATE TABLE IF NOT EXISTS contact_messages (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  phone      TEXT,
  message    TEXT NOT NULL,
  handled    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
`;

function migrate() {
  const v = db.prepare('PRAGMA user_version').get().user_version;
  if (v < 1) {
    db.exec(SCHEMA);
    db.exec('PRAGMA user_version = 1');
  }
}

function getSetting(key, fallback = null) {
  const r = get('SELECT value FROM settings WHERE key = ?', key);
  return r ? r.value : fallback;
}
function setSetting(key, value) {
  run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, String(value));
}

module.exports = { db, all, get, run, tx, migrate, getSetting, setSetting, DB_PATH };
