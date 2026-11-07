
import { test, expect } from '@playwright/test'

const accounts = [
  {
    role: 'Admin',
    username: 'admin',
    password: 'admin123',
    path: '/app/dashboard',
    visible: [
      'dashboard', 'kasir', 'orders', 'produksi',
      'dispatch', 'kurir', 'dispute', 'inventori',
      'layanan', 'laporan', 'pesan', 'pengguna',
      'pengaturan',
    ],
    hidden: [],
  },
  {
    role: 'Front Office',
    username: 'fo',
    password: 'fo123',
    path: '/app/dashboard',
    visible: [
      'dashboard', 'kasir', 'orders', 'produksi',
      'dispatch', 'dispute', 'inventori', 'pesan',
    ],
    hidden: ['kurir', 'layanan', 'laporan', 'pengguna', 'pengaturan'],
  },
  {
    role: 'Back Office',
    username: 'bo',
    password: 'bo123',
    path: '/app/dashboard',
    visible: [
      'dashboard', 'orders', 'produksi', 'dispatch',
      'dispute', 'inventori', 'layanan', 'laporan', 'pesan',
    ],
    hidden: ['kasir', 'kurir', 'pengguna', 'pengaturan'],
  },
  {
    role: 'Kurir',
    username: 'kurir1',
    password: 'kurir123',
    path: '/app/kurir',
    visible: ['kurir'],
    hidden: [
      'dashboard', 'kasir', 'orders', 'produksi',
      'dispatch', 'dispute', 'inventori', 'layanan',
      'laporan', 'pesan', 'pengguna', 'pengaturan',
    ],
  },
]

async function login(page, account) {
  if (!account.password) {
    throw new Error(`Password untuk akun ${account.role} belum tersedia.`)
  }

  await page.goto('/login')

  await page.locator('input[name="username"]').fill(account.username)
  await page.locator('input[name="password"]').fill(account.password)

  await page.getByRole('button', { name: 'Masuk' }).click()

  const result = await Promise.race([
    page.waitForURL(
      (url) => url.pathname.startsWith('/app/'),
      { waitUntil: 'domcontentloaded', timeout: 15000 }
    ).then(() => ({ type: 'success' })),

    page.getByRole('alert').waitFor({
      state: 'visible',
      timeout: 15000,
    }).then(async () => ({
      type: 'error',
      message: await page.getByRole('alert').innerText(),
    })),
  ])

  if (result.type === 'error') {
    throw new Error(
      `Login ${account.role} ditolak: ${result.message}. Periksa akun pengujian.`
    )
  }
}

// Helper membuat order baru melalui halaman kasir.

async function createOrder(page, suffix = 'E2E', options = {}) {
  const account = accounts.find(
    (item) => item.role === 'Front Office'
  )

  await login(page, account)
  await page.goto('/app/kasir')

  const customerName = `Pelanggan ${suffix}`
  const phone = `0812${Date.now().toString().slice(-8)}`
  const address = options.address || 'Jl. Pengujian Sepatu Kinclong'

  await page.locator('input[name="phone"]').fill(phone)
  await page.locator('input[name="name"]').fill(customerName)

  await page.locator('.item-row input').first().fill('Sneaker E2E')

  if (options.delivery) {
    await page.getByRole('button', {
      name: 'Antar ke alamat',
    }).click()

    await page.locator('input[name="address"]').fill(address)
  }

  await page.getByRole('button', { name: 'Simpan order' }).click()

  await expect(page).toHaveURL(/\/app\/order\/\d+$/)

  await expect(
    page.getByRole('heading', { name: 'Item pesanan' })
  ).toBeVisible()

  await expect(
    page.locator('#view').getByText(customerName, { exact: true })
  ).toBeVisible()

  return {
    customerName,
    phone,
    address,
  }
}

test.describe('Halaman publik', () => {
  test('Landing page berhasil dibuka', async ({ page }) => {
    await page.goto('/')

    await expect(
      page.getByRole('heading', { name: /Sepatu kotor/i })
    ).toBeVisible()

    await expect(page.locator('#booking')).toBeAttached()
  })

  test('Profil perusahaan berhasil dibuka', async ({ page }) => {
    await page.goto('/profil')

    await expect(
      page.getByRole('heading', {
        name: /Merawat sepatu dengan teliti/i,
      })
    ).toBeVisible()
  })

  test('Halaman lacak pesanan berhasil dibuka', async ({ page }) => {
    await page.goto('/lacak')

    await expect(
      page.getByRole('heading', {
        name: /Di mana sepatu saya sekarang/i,
      })
    ).toBeVisible()

    await expect(
      page.locator('input').nth(0)
    ).toBeVisible()
  })
})

test.describe('Autentikasi dan hak akses staf', () => {
  for (const account of accounts) {
    test(`Login ${account.role} dan periksa menu`, async ({ page }) => {
      await login(page, account)

      await expect(page).toHaveURL(
        new RegExp(account.path.replaceAll('/', '\\/'))
      )

      for (const menu of account.visible) {
        await expect(
          page.locator(`a[data-nav="${menu}"]`)
        ).toBeVisible()
      }

      for (const menu of account.hidden) {
        await expect(
          page.locator(`a[data-nav="${menu}"]`)
        ).toHaveCount(0)
      }
    })
  }

  test('Front Office tidak dapat membuka halaman pengguna', async ({ page }) => {
    const account = accounts.find(
      (item) => item.role === 'Front Office'
    )

    await login(page, account)
    await page.goto('/app/pengguna')

    await expect(page).toHaveURL(/\/app\/dashboard$/)
  })

  test('Pengguna tanpa sesi diarahkan ke login', async ({ page }) => {
    await page.goto('/app/dashboard')

    await expect(page).toHaveURL(/\/login$/)
  })
})

test.describe('Modul kasir dan order', () => {
  test('Front Office dapat membuka kasir dan memuat layanan', async ({ page }) => {
    const account = accounts.find(
      (item) => item.role === 'Front Office'
    )

    await login(page, account)
    await page.goto('/app/kasir')

    await expect(
      page.getByRole('heading', { name: 'Order baru' })
    ).toBeVisible()

    await expect(
      page.getByRole('heading', { name: 'Pelanggan' })
    ).toBeVisible()

    await expect(
      page.locator('.item-row select').first()
    ).toBeVisible()

    await expect(
      page.getByRole('button', { name: 'Simpan order' })
    ).toBeVisible()
  })

  test('Front Office dapat membuka daftar order dan filter', async ({ page }) => {
    const account = accounts.find(
      (item) => item.role === 'Front Office'
    )

    await login(page, account)
    await page.goto('/app/orders')

    await expect(
      page.getByRole('heading', { name: 'Semua order' })
    ).toBeVisible()

    await expect(
      page.getByPlaceholder('Cari kode, nama, atau nomor HP')
    ).toBeVisible()

    await expect(
      page.locator('select').first()
    ).toBeVisible()
  })
})

test.describe('Transaksi dan detail order', () => {
  test('Front Office dapat membuat order, membuka detail, dan mencetak nota', async ({ page }) => {
    const customer = await createOrder(page, 'Cetak')

    const detail = page.locator('#view')

    // Pastikan informasi item tampil pada halaman detail.
    await expect(
      detail.getByText(/Fast Clean/)
    ).toBeVisible()

    await expect(
      detail.getByText('Sneaker E2E', { exact: true })
    ).toBeVisible()

    // Pastikan data pelanggan tampil pada halaman detail.
    await expect(
      detail.getByText(customer.customerName, { exact: true })
    ).toBeVisible()

    // Ganti window.print agar pengujian tidak membuka dialog printer.
    await page.evaluate(() => {
      window.__e2ePrintCalled = false

      window.print = () => {
        window.__e2ePrintCalled = true
      }
    })

    await page.getByRole('button', { name: 'Cetak nota' }).click()

    await expect.poll(
      () => page.evaluate(() => window.__e2ePrintCalled)
    ).toBe(true)

    // Pemeriksaan khusus bagian nota cetak.
    const receipt = page.locator('#print-area .receipt')

    await expect(receipt).toContainText('Sepatu Kinclong')
    await expect(receipt).toContainText(customer.customerName)
    await expect(receipt).toContainText('Sneaker E2E')

    await expect(page.locator('body')).toHaveClass(/printing/)

    // Simulasikan printer selesai agar class printing dibersihkan.
    await page.evaluate(() => {
      window.dispatchEvent(new Event('afterprint'))
    })

    await expect(page.locator('body')).not.toHaveClass(/printing/)
  })

  test('Front Office dapat menerima DP dan melunasi pembayaran tunai', async ({ page }) => {
    await createOrder(page, 'Tunai')

    // Order Fast Clean 1 pasang memiliki total Rp30.000.
    await page.getByRole('button', {
      name: 'Terima pembayaran',
    }).click()

    let dialog = page.getByRole('dialog')

    await expect(dialog).toBeVisible()

    let amounts = dialog.locator('input[type="number"]')

    await expect(amounts).toHaveCount(2)

    // Pembayaran pertama: DP Rp10.000.
    await amounts.nth(0).fill('10000')
    await amounts.nth(1).fill('10000')

    await dialog.getByRole('button', {
      name: 'Simpan pembayaran tunai',
    }).click()

    await expect(dialog).toHaveCount(0)

    await expect(
      page.locator('.order-badges')
    ).toContainText('DP / sebagian')

    // Sisa tagihan Rp20.000.
    // Lakukan pelunasan melalui transaksi tunai kedua.
    await page.getByRole('button', {
      name: 'Terima pembayaran',
    }).click()

    dialog = page.getByRole('dialog')

    await expect(dialog).toBeVisible()

    amounts = dialog.locator('input[type="number"]')

    await amounts.nth(0).fill('20000')
    await amounts.nth(1).fill('20000')

    await dialog.getByRole('button', {
      name: 'Simpan pembayaran tunai',
    }).click()

    await expect(dialog).toHaveCount(0)

    await expect(
      page.locator('.order-badges')
    ).toContainText('Lunas')

    // Pastikan pembayaran tunai tercatat.
    await expect(
      page.locator('.order-detail-grid')
    ).toContainText('CASH')
  })

  // TES BARU: perhitungan uang kembalian.
  test('Front Office dapat menghitung dan menyimpan uang kembalian', async ({ page }) => {
    await createOrder(page, 'Kembalian')

    await page.getByRole('button', {
      name: 'Terima pembayaran',
    }).click()

    const dialog = page.getByRole('dialog')

    await expect(dialog).toBeVisible()

    const amounts = dialog.locator('input[type="number"]')

    await expect(amounts).toHaveCount(2)

    // Total Fast Clean satu pasang: Rp30.000.
    await amounts.nth(0).fill('30000')

    // Pelanggan membayar Rp50.000.
    await amounts.nth(1).fill('50000')

    // Pastikan kembalian dihitung menjadi Rp20.000.
    const changeSummary = dialog.locator('.summary-box .sum-row.total')

    await expect(changeSummary).toContainText('Kembalian')
    await expect(changeSummary).toContainText('20.000')

    // Simpan pembayaran.
    await dialog.getByRole('button', {
      name: 'Simpan pembayaran tunai',
    }).click()

    await expect(dialog).toHaveCount(0)

    // Pastikan nominal uang diterima dan kembalian tersimpan.
    const detail = page.locator('#view .order-detail-grid')

    await expect(detail).toContainText(/Terima[\s\S]*50\.000/)
    await expect(detail).toContainText(/Kembali[\s\S]*20\.000/)

    // Order harus berstatus lunas.
    await expect(
      page.locator('#view .order-badges')
    ).toContainText('Lunas')
  })

  test('Front Office dapat membuat dan membatalkan QRIS demo', async ({ page }) => {
    await createOrder(page, 'QRIS')

    await page.getByRole('button', {
      name: 'Terima pembayaran',
    }).click()

    const dialog = page.getByRole('dialog')

    await expect(dialog).toBeVisible()

    // Pilih metode QRIS.
    await dialog.getByRole('button', {
      name: 'QRIS',
      exact: true,
    }).click()

    await dialog.getByRole('button', {
      name: 'Buat QRIS',
    }).click()

    // Pastikan QR berhasil dibuat.
    await expect(
      dialog.locator('.payment-qr svg')
    ).toBeVisible()

    await expect(
      dialog.getByText(/QRIS DEMO/i)
    ).toBeVisible()

    // QRIS demo tidak boleh dikonfirmasi sebagai pembayaran nyata.
    await expect(
      dialog.getByRole('button', {
        name: 'Konfirmasi diterima',
      })
    ).toBeDisabled()

    // Terima dialog konfirmasi pembatalan.
    page.once('dialog', async (browserDialog) => {
      await browserDialog.accept()
    })

    await dialog.getByRole('button', {
      name: 'Batalkan QRIS',
    }).click()

    await expect(dialog).toHaveCount(0)

    // Pembayaran yang dibatalkan tidak boleh membuat order lunas.
    await expect(
      page.locator('.order-badges')
    ).toContainText('Belum bayar')

    await expect(
      page.locator('#view').getByText('CANCELLED', { exact: true })
    ).toBeVisible()
  })
})

test.describe('Modul produksi', () => {
  test('Front Office dapat memproses order sampai lolos QC', async ({ page }) => {
    // Buat order baru melalui halaman kasir.
    const customer = await createOrder(page, 'Produksi')

    // Buka halaman produksi.
    await page.goto('/app/produksi')

    await expect(
        page.getByRole('heading', {
        name: 'Produksi',
        exact: true,
    })
    ).toBeVisible()

    // Temukan baris order berdasarkan nama pelanggan.
    const row = page.locator('#view tbody tr').filter({
      hasText: customer.customerName,
    })

    await expect(row).toBeVisible()
    await expect(row).toContainText('Diterima di toko')

    // Tahap 1: mulai pencucian.
    await row.getByRole('button', {
      name: 'Mulai cuci',
    }).click()

    await expect(row).toContainText('Sedang dicuci')

    // Tahap 2: kirim ke Quality Control.
    await row.getByRole('button', {
      name: 'Kirim ke QC',
    }).click()

    await expect(row).toContainText('Quality control')

    // Tahap 3: lolos QC.
    page.once('dialog', async (browserDialog) => {
      await browserDialog.accept()
    })

    await row.getByRole('button', {
      name: 'Lolos QC',
    }).click()

    // Order READY harus keluar dari antrian produksi.
    await expect(row).toHaveCount(0)
  })
})

test.describe('Modul Delivery & Dispatch', () => {
  test('Dispatcher menugaskan kurir dan kurir menyelesaikan pengantaran COD', async ({ page }) => {
    // 1. Front Office membuat order dengan metode pengantaran.
    const customer = await createOrder(page, 'Dispatch', {
      delivery: true,
      address: 'Jl. Pengujian Dispatch No. 10',
    })

    // 2. Proses order sampai READY agar tugas antar dibuat otomatis.
    await page.goto('/app/produksi')

    const productionRow = page.locator('#view tbody tr').filter({
      hasText: customer.customerName,
    })

    await expect(productionRow).toBeVisible()

    await productionRow.getByRole('button', {
      name: 'Mulai cuci',
    }).click()

    await expect(productionRow).toContainText('Sedang dicuci')

    await productionRow.getByRole('button', {
      name: 'Kirim ke QC',
    }).click()

    await expect(productionRow).toContainText('Quality control')

    page.once('dialog', async (dialog) => {
      await dialog.accept()
    })

    await productionRow.getByRole('button', {
      name: 'Lolos QC',
    }).click()

    await expect(productionRow).toHaveCount(0)

    // 3. Front Office membuka Dispatch.
    await page.goto('/app/dispatch')

    await expect(
      page.getByRole('heading', {
        name: 'Delivery & dispatch',
        exact: true,
      })
    ).toBeVisible()

    const dispatchRow = page.locator('#view tbody tr').filter({
      hasText: customer.customerName,
    })

    await expect(dispatchRow).toBeVisible()
    await expect(dispatchRow).toContainText('Menunggu kurir')

    // 4. Pilih kurir pertama yang tersedia.
    const courierSelect = dispatchRow.locator(
      'select[aria-label^="Pilih kurir"]'
    )

    await courierSelect.selectOption({ index: 1 })

    // Tentukan jadwal pengantaran.
    await dispatchRow.locator('input[type="datetime-local"]').fill(
      '2026-11-10T10:00'
    )

    await dispatchRow.getByRole('button', {
      name: 'Tugaskan kurir',
    }).click()

    await expect(dispatchRow).toContainText('Kurir ditugaskan')

    // 5. Front Office keluar, lalu kurir login.
    await page.getByRole('button', {
      name: 'Keluar',
    }).click()

    await expect(page).toHaveURL(/\/login$/)

    const courierAccount = accounts.find(
      (item) => item.role === 'Kurir'
    )

    await login(page, courierAccount)
    await page.goto('/app/kurir')

    await expect(
      page.getByRole('heading', {
        name: 'Tugas saya',
        exact: true,
      })
    ).toBeVisible()

    const task = page.locator('.courier-task-card').filter({
      hasText: customer.customerName,
    })

    await expect(task).toBeVisible()
    await expect(task).toContainText('Ditugaskan kepada Anda')

    // 6. Kurir memulai perjalanan.
    await task.getByRole('button', {
      name: 'Mulai perjalanan',
    }).click()

    await expect(task).toContainText('Dalam perjalanan')

    // 7. Kurir menerima pembayaran COD.
    await expect(task).toContainText('COD tunai')

    page.once('dialog', async (dialog) => {
      await dialog.accept()
    })

    await task.getByRole('button', {
      name: 'Selesaikan & terima COD',
    }).click()

    // 8. Pastikan tugas selesai dan tagihan lunas.
    await expect(task).toContainText('Selesai')
    await expect(task).toContainText('Sudah lunas')
  })
})

test.describe('Modul inventori', () => {
  test('Back Office mengelola barang, batch LIFO, dan stok opname', async ({ page }) => {
    const backOffice = accounts.find(
      (account) => account.role === 'Back Office'
    )

    const suffix = Date.now()
    const sku = `E2E${suffix}`
    const itemName = `Bahan E2E ${suffix}`
    const supplier = `Supplier E2E ${suffix}`

    // Login Back Office.
    await login(page, backOffice)
    await page.goto('/app/inventori')

    await expect(
      page.getByRole('heading', { name: 'Inventori bahan' })
    ).toBeVisible()

    // Tambah barang dengan stok awal 10 dan harga Rp1.000/unit.
    await page.getByRole('button', {
      name: '+ Barang baru',
    }).click()

    const createDialog = page.getByRole('dialog')

    await createDialog.locator('input[name="sku"]').fill(sku)
    await createDialog.locator('input[name="unit"]').fill('pcs')
    await createDialog.locator('input[name="name"]').fill(itemName)
    await createDialog.locator('input[name="min_stock"]').fill('2')
    await createDialog.locator('input[name="initial_qty"]').fill('10')
    await createDialog.locator('input[name="initial_cost"]').fill('1000')

    await createDialog.getByRole('button', {
      name: 'Simpan barang',
    }).click()

    const itemRow = page.locator('.inventory-table tbody tr')
      .filter({ hasText: itemName })

    await expect(itemRow).toBeVisible()

    // Tambahkan batch kedua: 5 pcs dengan total harga Rp15.000.
    await itemRow.getByRole('button', {
      name: '+ Masuk',
    }).click()

    const stockDialog = page.getByRole('dialog')

    await stockDialog.locator('input[name="qty"]').fill('5')
    await stockDialog.locator('input[name="total_cost"]').fill('15000')
    await stockDialog.locator('input[name="supplier"]').fill(supplier)
    await stockDialog.locator('input[name="note"]').fill('Pembelian batch kedua')

    await stockDialog.getByRole('button', {
      name: 'Simpan batch baru',
    }).click()

    await expect(itemRow).toContainText('15 pcs')

    // Periksa batch terbaru menjadi urutan pertama LIFO.
    await itemRow.getByRole('button', {
      name: 'Detail',
    }).click()

    let detailDialog = page.getByRole('dialog')

    await expect(detailDialog).toBeVisible()

    let layerRows = detailDialog
      .locator('.inventory-detail-section')
      .nth(0)
      .locator('tbody tr')

    await expect(layerRows.first()).toContainText(supplier)
    await expect(layerRows.first()).toContainText('5 / 5')
    await expect(layerRows.first()).toContainText('Dipakai berikutnya')

    // Lakukan stok opname: stok fisik 12, stok sistem 15.
    await detailDialog.getByRole('button', {
      name: 'Stok opname',
    }).click()

    const adjustDialog = page.getByRole('dialog')

    await adjustDialog.locator('input[name="physical"]').fill('12')
    await adjustDialog.locator('input[name="note"]').fill(
      'Pengujian stok opname E2E'
    )

    await adjustDialog.getByRole('button', {
      name: 'Simpan penyesuaian',
    }).click()

    // Pastikan stok akhir menjadi 12 pcs.
    await expect(itemRow).toContainText('12 pcs')

    // Periksa bahwa pengurangan memakai batch terbaru.
    await itemRow.getByRole('button', {
      name: 'Detail',
    }).click()

    detailDialog = page.getByRole('dialog')

    layerRows = detailDialog
      .locator('.inventory-detail-section')
      .nth(0)
      .locator('tbody tr')

    await expect(layerRows.first()).toContainText(supplier)
    await expect(layerRows.first()).toContainText('2 / 5')

    // Periksa kartu stok mencatat penyesuaian.
    const movementRows = detailDialog
      .locator('.inventory-detail-section')
      .nth(1)
      .locator('tbody tr')

    await expect(movementRows.first()).toContainText('Opname berkurang')
    await expect(movementRows.first()).toContainText('Pengujian stok opname E2E')
  })

  test('Front Office hanya dapat melihat inventori', async ({ page }) => {
    const frontOffice = accounts.find(
      (account) => account.role === 'Front Office'
    )

    await login(page, frontOffice)
    await page.goto('/app/inventori')

    await expect(
      page.getByRole('heading', { name: 'Inventori bahan' })
    ).toBeVisible()

    // FO tidak boleh mendapatkan tombol pengelolaan barang.
    await expect(
      page.getByRole('button', { name: '+ Barang baru' })
    ).toHaveCount(0)

    await expect(
      page.getByRole('button', { name: '+ Masuk' })
    ).toHaveCount(0)
  })
})

test.describe('Modul layanan & resep', () => {
  test('Back Office membuat, mengubah, dan menonaktifkan layanan dengan resep bahan', async ({ page }) => {
    const backOffice = accounts.find(
      (account) => account.role === 'Back Office'
    )

    const suffix = Date.now()
    const serviceCode = `E${String(suffix).slice(-8)}`
    const serviceName = `Layanan E2E ${suffix}`
    const updatedName = `Layanan Edit E2E ${suffix}`

    // Login Back Office dan buka halaman layanan.
    await login(page, backOffice)
    await page.goto('/app/layanan')

    await expect(
      page.getByRole('heading', { name: 'Layanan & resep bahan' })
    ).toBeVisible()

    // Buat layanan baru.
    await page.getByRole('button', {
      name: '+ Layanan',
    }).click()

    const dialog = page.getByRole('dialog')

    await dialog.locator('input[name="code"]').fill(serviceCode)
    await dialog.locator('input[name="name"]').fill(serviceName)

    await dialog.locator('textarea[name="description"]').fill(
      'Layanan untuk pengujian migrasi React.'
    )

    await dialog.locator('input[name="price"]').fill('75000')
    await dialog.locator('input[name="duration_days"]').fill('2')
    await dialog.locator('input[name="sort"]').fill('99')

    // Tambahkan satu bahan dari inventori.
    await dialog.getByRole('button', {
      name: '+ Bahan',
    }).click()

    const materialSelect = dialog.locator(
      'select[name="item_id"]'
    ).first()

    await expect(materialSelect.locator('option')).not.toHaveCount(0)

    const optionCount = await materialSelect.locator('option').count()

    expect(optionCount).toBeGreaterThan(0)

    const materialName = (
      await materialSelect.locator('option').first().innerText()
    ).split(' (')[0]

    await materialSelect.selectOption({ index: 0 })

    await dialog.locator('input[name="qty"]').fill('2')

    await dialog.getByRole('button', {
      name: 'Simpan layanan',
    }).click()

    // Pastikan layanan dan resep tersimpan.
    const serviceRow = page.locator('.services-table tbody tr')
      .filter({ hasText: serviceName })

    await expect(serviceRow).toBeVisible()
    await expect(serviceRow).toContainText(serviceCode)
    await expect(serviceRow).toContainText('Rp')
    await expect(serviceRow).toContainText(materialName)

    // Edit layanan dan jumlah resep.
    await serviceRow.getByRole('button', {
      name: `Ubah ${serviceName}`,
    }).click()

    const editDialog = page.getByRole('dialog')

    await editDialog.locator('input[name="name"]').fill(updatedName)
    await editDialog.locator('input[name="qty"]').fill('3')

    // Nonaktifkan layanan.
    await editDialog.locator('input[name="active"]').uncheck()

    await editDialog.getByRole('button', {
      name: 'Simpan layanan',
    }).click()

    // Pastikan nama, resep, dan status berhasil diperbarui.
    const updatedRow = page.locator('.services-table tbody tr')
      .filter({ hasText: updatedName })

    await expect(updatedRow).toBeVisible()
    await expect(updatedRow).toContainText('Nonaktif')
    await expect(updatedRow).toContainText(materialName)
    await expect(updatedRow).toContainText('3')
  })

  test('Front Office tidak dapat membuka modul layanan & resep', async ({ page }) => {
    const frontOffice = accounts.find(
      (account) => account.role === 'Front Office'
    )

    await login(page, frontOffice)
    await page.goto('/app/layanan')

    // Front Office diarahkan kembali ke dashboard.
    await expect(page).toHaveURL(/\/app\/dashboard$/)

    await expect(
      page.getByRole('link', { name: /Layanan & resep/ })
    ).toHaveCount(0)
  })
})

test.describe('Modul pesan website', () => {
  test('Front Office membaca dan menandai pesan website selesai', async ({ page }) => {
    await page.goto('/')

    const suffix = Date.now()
    const contact = {
      name: `Kontak E2E ${suffix}`,
      phone: '081234567890',
      message: `Pesan untuk pengujian E2E ${suffix}`,
    }

    const created = await page.evaluate(async (payload) => {
      const response = await fetch('/api/public/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      return {
        ok: response.ok,
        data: await response.json(),
      }
    }, contact)

    expect(created.ok).toBeTruthy()
    expect(created.data.message).toContain('Pesan Anda sudah kami terima')

    const frontOffice = accounts.find(
      (account) => account.role === 'Front Office'
    )

    await login(page, frontOffice)
    await page.goto('/app/pesan')

    await expect(
      page.getByRole('heading', { name: 'Pesan dari website' })
    ).toBeVisible()

    const messageCard = page.locator('.contact-message-card').filter({
      hasText: contact.message,
    })

    await expect(messageCard).toBeVisible()
    await expect(messageCard).toContainText(contact.name)
    await expect(messageCard).toContainText('Belum ditangani')

    const whatsappLink = messageCard.getByRole('link', {
      name: 'Balas WA',
    })

    await expect(whatsappLink).toHaveAttribute(
      'href',
      /https:\/\/wa\.me\/6281234567890/
    )

    await messageCard.getByRole('button', {
      name: 'Tandai selesai',
    }).click()

    await expect(messageCard).toContainText('Selesai')
    await expect(
      messageCard.getByRole('button', { name: 'Tandai selesai' })
    ).toHaveCount(0)
  })

  test('Back Office dapat membuka daftar pesan website', async ({ page }) => {
    const backOffice = accounts.find(
      (account) => account.role === 'Back Office'
    )

    await login(page, backOffice)
    await page.goto('/app/pesan')

    await expect(
      page.getByRole('heading', { name: 'Pesan dari website' })
    ).toBeVisible()

    await expect(
      page.getByRole('button', { name: 'Muat ulang' })
    ).toBeVisible()
  })

  test('Kurir tidak dapat membuka pesan website', async ({ page }) => {
    const courier = accounts.find(
      (account) => account.role === 'Kurir'
    )

    await login(page, courier)
    await page.goto('/app/pesan')

    await expect(page).toHaveURL(/\/app\/kurir$/)
  })
})
test.describe('Modul laporan usaha', () => {
  test('Back Office melihat laporan, memfilter tanggal, dan mengunduh CSV', async ({ page }) => {
    const backOffice = accounts.find(
      (item) => item.role === 'Back Office'
    )

    await login(page, backOffice)
    await page.goto('/app/laporan')

    await expect(
      page.getByRole('heading', { name: 'Laporan usaha' })
    ).toBeVisible()

    await expect(page.locator('.report-kpi')).toHaveCount(5)
    await expect(
      page.getByRole('heading', { name: 'Uang masuk bersih per hari' })
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Per layanan' })
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Harian', exact: true })
    ).toBeVisible()

    await expect(page.getByLabel('Dari tanggal')).toBeVisible()
    await expect(page.getByLabel('Sampai tanggal')).toBeVisible()

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Unduh CSV' }).click()
    const download = await downloadPromise

    expect(download.suggestedFilename()).toMatch(
      /^laporan-\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.csv$/
    )

    await page.getByLabel('Dari tanggal').fill('2026-12-31')
    await page.getByLabel('Sampai tanggal').fill('2026-01-01')
    await page.getByRole('button', { name: 'Terapkan filter' }).click()

    await expect(page.getByRole('alert')).toContainText(
      'Tanggal mulai tidak boleh melebihi tanggal akhir.'
    )
  })

  test('Front Office tidak dapat membuka halaman laporan', async ({ page }) => {
    const frontOffice = accounts.find(
      (item) => item.role === 'Front Office'
    )

    await login(page, frontOffice)
    await page.goto('/app/laporan')

    await expect(page).toHaveURL(/\/app\/dashboard$/)
  })
})
test.describe('Modul dispute', () => {
  test('Front Office membalas dan menyelesaikan dispute', async ({ page }) => {
    const customer = await createOrder(page, 'Dispute')

    const orderMatch = page.url().match(/\/app\/order\/(\d+)$/)

    expect(orderMatch).not.toBeNull()

    const orderId = Number(orderMatch[1])

    // Buat dispute melalui API sebagai persiapan data pengujian.
    const created = await page.evaluate(async (id) => {
      const response = await fetch('/api/disputes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          order_id: id,
          category: 'QUALITY',
          description: 'Hasil pencucian masih kurang bersih pada bagian sol.',
        }),
      })

      const body = await response.json()

      return {
        ok: response.ok,
        status: response.status,
        body,
      }
    }, orderId)

    expect(
      created.ok,
      `Gagal membuat dispute pengujian: ${JSON.stringify(created.body)}`
    ).toBeTruthy()

    // Buka daftar dispute.
    await page.goto('/app/dispute')

    await expect(
      page.getByRole('heading', { name: 'Dispute & komplain' })
    ).toBeVisible()

    const disputeCode = created.body.code

    const row = page.locator('.dispute-table tbody tr')
      .filter({ hasText: disputeCode })

    await expect(row).toBeVisible()
    await expect(row).toContainText('Hasil kurang bersih')

    // Buka detail.
    await row.getByRole('link', {
      name: `Lihat dispute ${disputeCode}`,
    }).click()

    await expect(
      page.getByRole('heading', { name: disputeCode })
    ).toBeVisible()

    await expect(
      page.getByText(
        'Hasil pencucian masih kurang bersih pada bagian sol.'
      )
    ).toBeVisible()

    // Kirim balasan kepada pelanggan.
    const staffReply =
      'Terima kasih atas laporannya. Kami akan menindaklanjuti keluhan Anda.'

    await page.locator('textarea[name="message"]').fill(staffReply)

    await page.getByRole('button', {
      name: 'Kirim balasan',
    }).click()

    await expect(
      page.locator('.dispute-message-staff').filter({
        hasText: staffReply,
      })
    ).toBeVisible()

    await expect(
        page.locator('.dispute-heading-badges').getByText(
            'Sedang ditangani',
            { exact: true }
        )
        ).toBeVisible()

    // Selesaikan dispute tanpa refund.
    await page.locator('select[name="status"]').selectOption('RESOLVED')
    await page.locator('select[name="resolution"]').selectOption('NONE')

    await page.locator('textarea[name="note"]').fill(
      'Pemeriksaan selesai. Keluhan sudah dijelaskan kepada pelanggan.'
    )

    await page.getByRole('button', {
      name: 'Simpan keputusan',
    }).click()

    // Pastikan dispute sudah ditutup.
    await expect(
      page.locator('.dispute-resolution-result')
    ).toContainText('Selesai')

    await expect(
      page.locator('.dispute-resolution-result')
    ).toContainText('Tanpa tindakan')
  })

  test('Front Office membuat dispute dari detail order', async ({ page }) => {
    const customer = await createOrder(page, 'DisputeManual')

    await expect(page).toHaveURL(/\/app\/order\/\d+$/)

    // Buka form pembuatan komplain dari detail order.
    await page.getByRole('button', {
      name: '+ Buat komplain',
    }).click()

    await expect(
      page.getByRole('heading', { name: 'Buat komplain baru' })
    ).toBeVisible()

    await page.locator('#dispute-category').selectOption('DAMAGE')

    const description =
      'Terdapat kerusakan pada bagian sol sepatu yang ditemukan pelanggan.'

    await page.locator('#dispute-description').fill(description)

    await page.getByRole('button', {
      name: 'Kirim komplain',
    }).click()

    // Pastikan diarahkan ke detail dispute yang baru dibuat.
    await expect(page).toHaveURL(/\/app\/dispute\/\d+$/)

    await expect(
      page.locator('.dispute-detail-heading h1')
    ).toBeVisible()

    await expect(
      page.locator('.dispute-message').filter({
        hasText: description,
      })
    ).toBeVisible()

    await expect(
      page.locator('.dispute-heading-badges')
    ).toContainText('Kerusakan')

    await expect(
      page.locator('.dispute-order-body')
    ).toContainText(customer.customerName)
  })
  test('Kurir tidak dapat membuka manajemen dispute', async ({ page }) => {
    const courier = accounts.find(
      (account) => account.role === 'Kurir'
    )

    await login(page, courier)
    await page.goto('/app/dispute')

    await expect(page).toHaveURL(/\/app\/kurir$/)
  })
})

test.describe('Modul pengaturan usaha', () => {
  test('Admin melihat profil usaha, QRIS, operasional, dan webhook', async ({ page }) => {
    const admin = accounts.find((item) => item.role === 'Admin')

    await login(page, admin)
    await page.goto('/app/pengaturan')

    await expect(
      page.getByRole('heading', { name: 'Pengaturan usaha' })
    ).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Profil usaha' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Pembayaran QRIS' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Operasional' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Webhook payment gateway' })).toBeVisible()

    await expect(page.locator('input[name="business_name"]')).toBeVisible()
    await expect(page.locator('textarea[name="qris_static"]')).toBeVisible()
    await expect(page.locator('input[name="delivery_fee"]')).toBeVisible()
    await expect(page.getByTestId('webhook-secret')).toBeVisible()
  })

  test('Admin menyimpan pengaturan dan membuat webhook secret baru', async ({ page }) => {
    const admin = accounts.find((item) => item.role === 'Admin')

    await login(page, admin)
    await page.goto('/app/pengaturan')

    const previousSecret = await page.getByTestId('webhook-secret').innerText()
    const tagline = `Tagline E2E ${Date.now()}`

    await page.locator('input[name="tagline"]').fill(tagline)
    await page.locator('input[name="delivery_fee"]').fill('12345')
    await page.getByRole('checkbox', {
      name: 'Buat secret baru saat menyimpan',
    }).check()

    await page.getByRole('button', {
      name: 'Simpan pengaturan',
    }).click()

    await expect(page.getByRole('status')).toContainText(
      'Pengaturan usaha berhasil disimpan.'
    )
    await expect(page.getByTestId('webhook-secret')).not.toHaveText(previousSecret)

    await page.reload()

    await expect(page.locator('input[name="tagline"]')).toHaveValue(tagline)
    await expect(page.locator('input[name="delivery_fee"]')).toHaveValue('12345')
  })

  test('Front Office tidak dapat membuka halaman pengaturan', async ({ page }) => {
    const frontOffice = accounts.find((item) => item.role === 'Front Office')

    await login(page, frontOffice)
    await page.goto('/app/pengaturan')

    await expect(page).toHaveURL(/\/app\/dashboard$/)
  })
})
test.describe('Modul manajemen pengguna', () => {
  test('Admin membuat, mengubah, dan menonaktifkan pengguna', async ({ page }) => {
    const admin = accounts.find((item) => item.role === 'Admin')
    await login(page, admin)
    await page.goto('/app/pengguna')

    await expect(
      page.getByRole('heading', { name: 'Pengguna & peran' })
    ).toBeVisible()

    await page.getByRole('button', { name: '+ Pengguna' }).click()
    await expect(
      page.getByRole('heading', { name: 'Pengguna baru' })
    ).toBeVisible()

    const username = `e2euser${Date.now()}`
    await page.locator('#user-name').fill('Pengguna E2E Baru')
    await page.locator('#user-username').fill(username)
    await page.locator('#user-role').selectOption('frontoffice')
    await page.locator('#user-phone').fill('081234567890')
    await page.locator('#user-password').fill('e2epassword123')
    await page.getByRole('button', { name: 'Simpan pengguna' }).click()

    const userRow = page.locator('tr[data-user-id]').filter({ hasText: username })
    await expect(userRow).toBeVisible()
    await expect(userRow).toContainText('Pengguna E2E Baru')
    await expect(userRow).toContainText('Front office')
    await expect(userRow).toContainText('Aktif')

    await userRow.getByRole('button', { name: 'Ubah' }).click()
    await expect(
      page.getByRole('heading', { name: 'Ubah pengguna' })
    ).toBeVisible()

    await page.locator('#user-name').fill('Pengguna E2E Diperbarui')
    await page.locator('#user-role').selectOption('backoffice')
    await page.locator('#user-active').uncheck()
    await page.getByRole('button', { name: 'Simpan pengguna' }).click()

    const updatedRow = page.locator('tr[data-user-id]').filter({ hasText: username })
    await expect(updatedRow).toContainText('Pengguna E2E Diperbarui')
    await expect(updatedRow).toContainText('Back office')
    await expect(updatedRow).toContainText('Nonaktif')
  })

  test('Front Office tidak dapat membuka manajemen pengguna', async ({ page }) => {
    const frontOffice = accounts.find((item) => item.role === 'Front Office')
    await login(page, frontOffice)
    await page.goto('/app/pengguna')
    await expect(page).toHaveURL(/\/app\/dashboard$/)
  })

  test('Back Office tidak dapat membuka manajemen pengguna', async ({ page }) => {
    const backOffice = accounts.find((item) => item.role === 'Back Office')
    await login(page, backOffice)
    await page.goto('/app/pengguna')
    await expect(page).toHaveURL(/\/app\/dashboard$/)
  })
})
