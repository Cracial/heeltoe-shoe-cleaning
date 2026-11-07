# HeelToe Shoe Cleaning

Full-stack web application untuk mendukung operasional UMKM **HeelToe Shoe Cleaning**. Repository ini menyatukan pengembangan aplikasi pengelolaan usaha cuci sepatu dengan konsep bisnis UMKM ASAH HeelToe.

> Catatan transisi: aplikasi operasional yang dimigrasikan sebelumnya masih memiliki sejumlah label dan nama database lama `Sepatu Kinclong`. Nama database lokal sengaja dipertahankan agar data yang sudah ada tetap kompatibel. Penyelarasan identitas visual dan konten merek dapat dilakukan bertahap tanpa mengganggu data maupun alur transaksi.

## Fitur aplikasi

- **Website publik:** landing page, profil usaha, informasi layanan, booking jemput, dan formulir kontak.
- **Autentikasi dan hak akses:** Admin/Pemilik, Front Office, Back Office, dan Kurir.
- **Kasir dan order:** pelanggan, pembuatan order, pembayaran DP, tunai, kembalian, QRIS, dan nota.
- **Produksi dan QC:** penerimaan order, proses pencucian, pemeriksaan kualitas, dan cuci ulang.
- **Inventori LIFO:** barang, batch stok, pembelian, pemakaian bahan otomatis berdasarkan resep/BOM, dan stok opname.
- **Layanan dan resep:** pengelolaan layanan, harga, durasi, bahan, HPP, dan margin.
- **Delivery dan dispatch:** penjadwalan, penugasan kurir, penjemputan, pengantaran, dan COD.
- **Dispute/komplain:** percakapan pelanggan dan staf, tindak lanjut, cuci ulang, refund, atau kompensasi.
- **Laporan usaha:** penjualan, pembayaran, refund, HPP, laba kotor, laporan harian, dan ekspor CSV.
- **Pesan website:** daftar pesan masuk, balasan melalui WhatsApp, dan penandaan pesan selesai.
- **Administrasi:** manajemen pengguna dan pengaturan profil usaha, QRIS, operasional, serta webhook.

## Arsitektur

```text
Browser
  |
  v
React 19 + React Router (Vite build)
  |  frontend/dist
  v
Node.js HTTP server (port 3000)
  |-- Static React files + SPA history fallback
  |-- REST API (/api/*)
  v
SQLite (node:sqlite)
```

- Frontend: React, React Router, Vite, dan CSS.
- Backend: Node.js HTTP server dan API routes tanpa framework server tambahan.
- Database: SQLite melalui modul bawaan `node:sqlite`.
- Frontend production disajikan oleh `server.js` dari `frontend/dist`.
- Folder `public/` root berisi implementasi HTML/CSS/JavaScript lama yang dipertahankan untuk referensi transisi. Folder tersebut tidak dihapus dan bukan lagi entry point frontend production React.

## Persyaratan

- Node.js **22.13 atau lebih baru** (pengembangan proyek ini diuji dengan Node.js 24).
- npm yang disertakan dengan Node.js.

## Instalasi dan menjalankan production build lokal

Dari root repository:

```powershell
# Instal dependency frontend berdasarkan lock file
npm run frontend:install

# Build React ke frontend/dist
npm run build

# Jalankan backend sekaligus frontend production
npm start
```

Buka `http://localhost:3000`.

`npm start` menyajikan halaman React dan REST API dari origin yang sama. Jalankan `npm run build` lagi setiap kali ada perubahan frontend sebelum menguji production build.

## Mode development

Jalankan backend dan frontend pada dua terminal terpisah.

Terminal 1 â€” root proyek:

```powershell
npm run dev
```

Terminal 2 â€” root proyek:

```powershell
npm run frontend:dev
```

Buka `http://127.0.0.1:5173`. Vite meneruskan request `/api` ke backend di `http://127.0.0.1:3000`.

## Pengujian dan pemeriksaan kualitas

Dari root repository:

```powershell
# Backend/API tests
npm test

# Seluruh Playwright end-to-end tests frontend
npm run test:e2e

# Production build React
npm run build

# Lint frontend
npm run lint:frontend
```

Jumlah pengujian yang sudah lulus pada saat repository disiapkan: **10 backend tests** dan **35 Playwright E2E tests**. Jalankan kembali tes setelah setiap perubahan; angka tersebut bukan jaminan hasil tes di masa mendatang.

## Database dan data lokal

Database default tetap menggunakan `data/sepatu-kinclong.db` agar instalasi/data lama tidak terputus. Folder `data/` dan file database SQLite dikecualikan dari Git.

- Jangan mengunggah database operasional atau backup database ke repository.
- Lakukan backup database secara terpisah dan simpan di lokasi aman.
- `npm run reset-db` adalah operasi destruktif yang menghapus dan membuat ulang database. **Jangan jalankan pada database operasional.**
- Untuk pengujian, test suite menggunakan database sementara.

## Konfigurasi lingkungan

Server mendukung variabel lingkungan berikut:

| Variabel | Fungsi |
|---|---|
| `PORT` | Port server (default `3000`) |
| `HOST` | Host bind server (default `0.0.0.0`) |
| `DB_PATH` | Lokasi database SQLite; default `data/sepatu-kinclong.db` |
| `APP_TZ` | Zona waktu aplikasi (default mengikuti konfigurasi backend) |
| `COOKIE_SECURE` | Gunakan cookie secure pada deployment HTTPS (`1`) |
| `TRUST_PROXY` | Percayai forwarded IP dari reverse proxy tepercaya (`1`) |
| `SEED_DEMO` | Isi order demo saat database baru dibuat; gunakan `0` untuk menonaktifkan order demo |

Jangan commit file `.env`, token, password, QRIS produksi, webhook secret, private key, atau kredensial lain. Masukkan nilai environment melalui konfigurasi lokal/hosting yang aman.

## Deployment

Untuk production, build frontend terlebih dahulu lalu jalankan server Node.js di belakang reverse proxy HTTPS (misalnya Nginx atau Caddy). Atur `COOKIE_SECURE=1` dan `TRUST_PROXY=1` hanya bila server benar-benar berjalan di belakang proxy tepercaya yang mengatur header forwarding dengan benar. Pastikan database persisten dan memiliki backup berkala.

QRIS statis dan webhook harus dikonfigurasi menggunakan kredensial merchant yang sah. Jangan memakai QRIS demo untuk menerima pembayaran sungguhan.

## Struktur repository

```text
heeltoe-shoe-cleaning/
â”œâ”€â”€ frontend/               # React application, Vite config, E2E tests
â”‚   â”œâ”€â”€ public/             # Frontend static assets (favicon, icons)
â”‚   â”œâ”€â”€ src/                # React pages, layouts, components, styles
â”‚   â””â”€â”€ e2e/                # Playwright end-to-end tests
â”œâ”€â”€ src/                    # Backend database, services, routes, libraries
â”œâ”€â”€ public/                 # Legacy frontend files retained for reference
â”œâ”€â”€ scripts/                # Operational and development scripts
â”œâ”€â”€ test/                   # Backend/API tests
â”œâ”€â”€ data/                   # Local SQLite data (ignored by Git)
â”œâ”€â”€ server.js               # Node.js HTTP server, API, React static hosting
â”œâ”€â”€ package.json            # Root scripts
â”œâ”€â”€ README.md
â””â”€â”€ .gitignore
```