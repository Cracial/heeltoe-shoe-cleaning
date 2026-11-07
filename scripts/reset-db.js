'use strict';
// Hapus database lalu buat ulang dengan data awal. Pakai: npm run reset-db  (SEED_DEMO=0 untuk tanpa order contoh)
const fs = require('node:fs');
const path = require('node:path');
const file = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'sepatu-kinclong.db');
for (const f of [file, file + '-wal', file + '-shm']) if (fs.existsSync(f)) fs.unlinkSync(f);
const { migrate } = require('../src/db');
const { seed } = require('../src/seed');
migrate();
seed({ demoOrders: process.env.SEED_DEMO !== '0' });
console.log('✓ Database direset:', file);
