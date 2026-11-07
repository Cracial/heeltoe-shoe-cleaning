# Contributing Guide - HeelToe Shoe Cleaning

## 1. Aturan Branch

Branch `main` digunakan sebagai branch utama dan harus selalu dalam kondisi stabil.

Dilarang mengerjakan fitur atau perubahan langsung pada branch `main`.
Setiap pekerjaan harus menggunakan branch terpisah.

Gunakan format nama branch berikut:

- feat/nama-fitur
- fix/nama-perbaikan
- docs/nama-dokumentasi
- refactor/nama-refactor
- test/nama-pengujian
- chore/nama-konfigurasi

Gunakan huruf kecil dan pemisah tanda hubung (-).

## 2. Alur Kerja Git

Sebelum memulai pekerjaan, sinkronkan branch utama:

    git switch main
    git pull origin main

Buat branch sesuai pekerjaan:

    git switch -c feat/nama-fitur

Lakukan perubahan dan pengujian pada branch tersebut.

Setelah selesai, simpan perubahan:

    git add .
    git commit -m "feat: deskripsi fitur"
    git push -u origin feat/nama-fitur

Selanjutnya buat Pull Request dengan tujuan penggabungan ke branch `main`.

## 3. Format Commit

Gunakan format Conventional Commits:

- feat: menambahkan fitur baru
- fix: memperbaiki bug
- docs: memperbarui dokumentasi
- refactor: merapikan atau menyusun ulang kode
- test: menambahkan atau memperbaiki pengujian
- chore: konfigurasi dan pemeliharaan proyek

Contoh:

    feat: add customer booking
    fix: correct payment validation
    docs: update installation guide
    test: add order checkout tests

## 4. Pengujian Wajib

Sebelum membuat Pull Request, jalankan dari root proyek:

    npm test
    npm run build
    npm run test:e2e

Semua pengujian harus berhasil sebelum perubahan digabung ke `main`.

## 5. Aturan Pull Request

Setiap Pull Request harus:

- Menggunakan `main` sebagai base branch.
- Menjelaskan tujuan perubahan.
- Menjelaskan file atau bagian yang diubah.
- Mencantumkan hasil pengujian.
- Menyertakan screenshot apabila mengubah tampilan.
- Tidak mencampurkan perubahan yang tidak berkaitan.

Periksa komentar reviewer dan selesaikan diskusi sebelum merge.

## 6. Aturan Merge

Pull Request hanya boleh digabung apabila seluruh pemeriksaan berhasil.

Gunakan metode Squash and merge agar riwayat branch utama tetap rapi.

Branch pekerjaan dapat dihapus setelah berhasil digabung.

## 7. Keamanan dan File

Jangan pernah mengunggah:

- File `.env` atau kredensial.
- Database lokal.
- Folder `node_modules`.
- Folder hasil build `dist`.
- Password, API key, token, atau private key.

Jangan menghapus file atau fitur lama tanpa alasan dan pemeriksaan dampaknya.

## 8. Prinsip Pengembangan

- Pertahankan struktur proyek yang sudah ada.
- Hindari mengubah bagian yang tidak berkaitan dengan pekerjaan.
- Gunakan kembali komponen dan fungsi yang tersedia.
- Pastikan perubahan tidak merusak fitur sebelumnya.
- Perbarui dokumentasi apabila terdapat perubahan penting.