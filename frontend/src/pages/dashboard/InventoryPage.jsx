
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'

import { api, formatRupiah } from '../../services/api'
import '../../styles/inventory.css'

const MOVEMENT_LABELS = {
  IN: 'Barang masuk',
  OUT: 'Pemakaian bahan',
  ADJ_IN: 'Opname bertambah',
  ADJ_OUT: 'Opname berkurang',
}

function numberFormat(value, digits = 0) {
  return Number(value || 0).toLocaleString('id-ID', {
    maximumFractionDigits: digits,
  })
}

function formatDate(value) {
  if (!value) return '-'

  const date = new Date(String(value).replace(' ', 'T'))

  if (Number.isNaN(date.getTime())) return String(value)

  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function isActive(item) {
  return item.active === true || Number(item.active) === 1
}

export default function InventoryPage() {
  const { user, setNotice } = useOutletContext()

  const canEdit = ['admin', 'backoffice'].includes(user?.role)

  const [items, setItems] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')

  const [modal, setModal] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')

  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState('')

  const [stockQty, setStockQty] = useState('')
  const [stockTotalCost, setStockTotalCost] = useState('')
  const [physicalStock, setPhysicalStock] = useState('')

  const detailRequest = useRef(0)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const [itemResult, summaryResult] = await Promise.all([
        api('/api/items'),
        api('/api/inventory/summary'),
      ])

      setItems(Array.isArray(itemResult) ? itemResult : [])
      setSummary(summaryResult)
    } catch (err) {
      setError(err.message || 'Gagal memuat data inventori.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  function notify(message) {
    if (typeof setNotice === 'function') {
      setNotice(message)
    }
  }

  function openModal(nextModal) {
    setActionError('')
    setModal(nextModal)

    if (nextModal.type === 'stock') {
      setStockQty('')
      setStockTotalCost('')
    }

    if (nextModal.type === 'adjust') {
      setPhysicalStock(String(nextModal.item.stock ?? 0))
    }
  }

  function closeModal() {
    detailRequest.current += 1
    setModal(null)
    setDetail(null)
    setDetailError('')
    setActionError('')
  }

  async function openDetail(item) {
    const requestId = ++detailRequest.current

    setModal({ type: 'detail', item })
    setDetail(null)
    setDetailError('')
    setDetailLoading(true)

    try {
      const result = await api(`/api/items/${item.id}`)

      if (detailRequest.current === requestId) {
        setDetail(result)
      }
    } catch (err) {
      if (detailRequest.current === requestId) {
        setDetailError(err.message || 'Gagal memuat detail barang.')
      }
    } finally {
      if (detailRequest.current === requestId) {
        setDetailLoading(false)
      }
    }
  }

  async function submitItem(event) {
    event.preventDefault()

    const form = event.currentTarget
    const data = new FormData(form)
    const editing = modal.type === 'edit'
    const currentItem = modal.item

    const body = {
      sku: String(data.get('sku') || '').trim(),
      name: String(data.get('name') || '').trim(),
      unit: String(data.get('unit') || '').trim(),
      min_stock: Number(data.get('min_stock') || 0),
      active: editing ? data.has('active') : true,
    }

    if (!editing) {
      const initialQty = String(data.get('initial_qty') || '').trim()
      const initialCost = String(data.get('initial_cost') || '').trim()

      if (initialQty !== '') {
        body.initial_qty = Number(initialQty)

        if (body.initial_qty > 0) {
          if (initialCost === '') {
            setActionError('Harga per satuan wajib diisi jika stok awal lebih dari 0.')
            return
          }

          body.initial_cost = Number(initialCost)
        }
      }
    }

    setSaving(true)
    setActionError('')

    try {
      await api(
        editing ? `/api/items/${currentItem.id}` : '/api/items',
        {
          method: editing ? 'PUT' : 'POST',
          body,
        }
      )

      closeModal()
      await loadData()
      notify(editing ? 'Data barang berhasil diperbarui.' : 'Barang baru berhasil ditambahkan.')
    } catch (err) {
      setActionError(err.message || 'Gagal menyimpan barang.')
    } finally {
      setSaving(false)
    }
  }

  async function submitStockIn(event) {
    event.preventDefault()

    const form = event.currentTarget
    const data = new FormData(form)
    const item = modal.item

    const body = {
      qty: Number(data.get('qty')),
      total_cost: Number(data.get('total_cost')),
      supplier: String(data.get('supplier') || '').trim(),
      note: String(data.get('note') || '').trim(),
    }

    setSaving(true)
    setActionError('')

    try {
      await api(`/api/items/${item.id}/stock-in`, {
        method: 'POST',
        body,
      })

      closeModal()
      await loadData()
      notify(`Stok ${item.name} berhasil ditambahkan.`)
    } catch (err) {
      setActionError(err.message || 'Gagal mencatat stok masuk.')
    } finally {
      setSaving(false)
    }
  }

  async function submitAdjustment(event) {
    event.preventDefault()

    const form = event.currentTarget
    const data = new FormData(form)
    const item = modal.item

    const physical = Number(data.get('physical'))
    const difference = physical - Number(item.stock)

    if (!Number.isInteger(physical) || physical < 0) {
      setActionError('Stok fisik harus berupa bilangan bulat dan tidak boleh negatif.')
      return
    }

    if (difference === 0) {
      setActionError('Tidak ada selisih stok yang perlu disesuaikan.')
      return
    }

    const body = {
      qty: difference,
      note: String(data.get('note') || '').trim(),
    }

    setSaving(true)
    setActionError('')

    try {
      await api(`/api/items/${item.id}/adjust`, {
        method: 'POST',
        body,
      })

      closeModal()
      await loadData()
      notify(`Penyesuaian stok ${item.name} berhasil disimpan.`)
    } catch (err) {
      setActionError(err.message || 'Gagal melakukan penyesuaian stok.')
    } finally {
      setSaving(false)
    }
  }

  const visibleItems = items.filter((item) => {
    const keyword = search.trim().toLowerCase()

    const matchesSearch =
      !keyword ||
      String(item.sku || '').toLowerCase().includes(keyword) ||
      String(item.name || '').toLowerCase().includes(keyword)

    const low = isActive(item) &&
      Number(item.stock) <= Number(item.min_stock)

    const matchesFilter =
      filter === 'all' ||
      (filter === 'low' && low) ||
      (filter === 'active' && isActive(item)) ||
      (filter === 'inactive' && !isActive(item))

    return matchesSearch && matchesFilter
  })

  const lowStockItems = items.filter(
    (item) =>
      isActive(item) &&
      Number(item.stock) <= Number(item.min_stock)
  )

  return (
    <div className="inventory-page">
      <div className="page-head inventory-page-head">
        <div>
          <h1>Inventori bahan</h1>
          <p className="muted small">
            Kelola stok bahan, batch pembelian, dan kartu stok menggunakan metode LIFO.
          </p>
        </div>

        {canEdit && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => openModal({ type: 'create' })}
          >
            + Barang baru
          </button>
        )}
      </div>

      <div className="inventory-info">
        <strong>Metode LIFO (Last In, First Out)</strong>
        <p>
          Saat order mulai dicuci, bahan diambil dari batch pembelian
          terbaru lebih dahulu. HPP mengikuti harga batch yang digunakan,
          sedangkan nilai persediaan dihitung dari sisa setiap batch.
        </p>
      </div>

      <div className="inventory-summary">
        <div className="card kpi">
          <div className="label">Nilai persediaan</div>
          <div className="value">
            {formatRupiah(summary?.total_value || 0)}
          </div>
          <div className="sub">
            {summary?.item_count ?? items.length} jenis barang
          </div>
        </div>

        <div className={`card kpi ${lowStockItems.length ? 'alert' : ''}`}>
          <div className="label">Stok menipis</div>
          <div className="value">{lowStockItems.length}</div>
          <div className="sub">
            {lowStockItems.length
              ? lowStockItems.slice(0, 3).map((item) => item.name).join(', ')
              : 'Semua stok masih aman'}
          </div>
        </div>

        <div className="card kpi">
          <div className="label">Barang aktif</div>
          <div className="value">
            {items.filter(isActive).length}
          </div>
          <div className="sub">
            dari {items.length} barang terdaftar
          </div>
        </div>
      </div>

      <div className="card inventory-list-card">
        <div className="inventory-toolbar">
          <div>
            <h3>Daftar barang</h3>
            <p className="small muted">
              Pilih barang untuk melihat batch dan riwayat pergerakan stok.
            </p>
          </div>

          <div className="inventory-filters">
            <input
              type="search"
              aria-label="Cari barang"
              placeholder="Cari SKU atau nama barang..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />

            <select
              aria-label="Filter barang"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            >
              <option value="all">Semua barang</option>
              <option value="low">Stok menipis</option>
              <option value="active">Barang aktif</option>
              <option value="inactive">Barang nonaktif</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="inventory-state">
            <span className="spinner" />
            <p>Memuat data inventori...</p>
          </div>
        ) : error ? (
          <div className="inventory-state inventory-error" role="alert">
            <p>{error}</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={loadData}
            >
              Coba lagi
            </button>
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="inventory-state">
            <h3>Tidak ada barang ditemukan</h3>
            <p className="muted">
              Coba ubah kata pencarian atau filter barang.
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="inventory-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Barang</th>
                  <th className="right">Stok</th>
                  <th className="right">Minimum</th>
                  <th className="right">Harga terakhir</th>
                  <th className="right">Nilai stok</th>
                  <th>Aksi</th>
                </tr>
              </thead>

              <tbody>
                {visibleItems.map((item) => {
                  const active = isActive(item)
                  const low =
                    active &&
                    Number(item.stock) <= Number(item.min_stock)

                  return (
                    <tr
                      key={item.id}
                      className={!active ? 'inventory-inactive' : ''}
                    >
                      <td className="mono small">{item.sku}</td>

                      <td>
                        <strong>{item.name}</strong>
                        {!active && (
                          <span className="badge plain inventory-status">
                            Nonaktif
                          </span>
                        )}
                      </td>

                      <td className="right nowrap">
                        {low ? (
                          <span className="badge b-danger">
                            {numberFormat(item.stock)} {item.unit}
                          </span>
                        ) : (
                          `${numberFormat(item.stock)} ${item.unit}`
                        )}
                      </td>

                      <td className="right">
                        {numberFormat(item.min_stock)}
                      </td>

                      <td className="right nowrap">
                        {item.last_cost != null
                          ? `${formatRupiah(item.last_cost)}/${item.unit}`
                          : '-'}
                      </td>

                      <td className="right nowrap">
                        {formatRupiah(item.stock_value)}
                      </td>

                      <td>
                        <div className="inventory-row-actions">
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            onClick={() => openDetail(item)}
                          >
                            Detail
                          </button>

                          {canEdit && (
                            <button
                              type="button"
                              className="btn btn-sm btn-primary"
                              onClick={() => openModal({
                                type: 'stock',
                                item,
                              })}
                            >
                              + Masuk
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && (
          <div className="inventory-list-footer">
            Menampilkan {visibleItems.length} dari {items.length} barang.
          </div>
        )}
      </div>

      {/* Detail barang */}
      {modal?.type === 'detail' && (
        <div
          className="inventory-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeModal()
          }}
        >
          <section
            className="inventory-modal inventory-modal-wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="inventory-detail-title"
          >
            <div className="inventory-modal-header">
              <div>
                <h2 id="inventory-detail-title">
                  {detail?.name || modal.item.name}
                </h2>
                <p className="small muted">
                  {detail?.sku || modal.item.sku}
                </p>
              </div>

              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={closeModal}
                aria-label="Tutup detail"
              >
                ✕
              </button>
            </div>

            {detailLoading ? (
              <div className="inventory-state">
                <span className="spinner" />
                <p>Memuat detail barang...</p>
              </div>
            ) : detailError ? (
              <div className="inventory-error" role="alert">
                {detailError}
              </div>
            ) : detail ? (
              <div className="inventory-modal-body">
                <div className="inventory-detail-summary">
                  <div className="inventory-detail-stat">
                    <span>Stok tersedia</span>
                    <strong>
                      {numberFormat(detail.stock)} {detail.unit}
                    </strong>
                  </div>

                  <div className="inventory-detail-stat">
                    <span>Nilai persediaan</span>
                    <strong>{formatRupiah(detail.stock_value)}</strong>
                  </div>

                  <div className="inventory-detail-stat">
                    <span>Dipakai di layanan</span>
                    <strong>{detail.used_by?.length || 0} layanan</strong>
                  </div>
                </div>

                {canEdit && (
                  <div className="inventory-detail-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => openModal({
                        type: 'stock',
                        item: detail,
                      })}
                    >
                      + Barang masuk
                    </button>

                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => openModal({
                        type: 'adjust',
                        item: detail,
                      })}
                    >
                      Stok opname
                    </button>

                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => openModal({
                        type: 'edit',
                        item: detail,
                      })}
                    >
                      Ubah barang
                    </button>
                  </div>
                )}

                <section className="inventory-detail-section">
                  <h3>Lapisan stok (urutan LIFO)</h3>
                  <p className="small muted">
                    Batch paling atas adalah stok yang akan dipakai berikutnya.
                  </p>

                  {detail.layers?.length ? (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Urutan</th>
                            <th>Tanggal masuk</th>
                            <th className="right">Sisa / masuk</th>
                            <th className="right">Harga satuan</th>
                            <th>Supplier</th>
                          </tr>
                        </thead>

                        <tbody>
                          {detail.layers.map((layer, index) => (
                            <tr key={layer.id}>
                              <td>
                                {index === 0 ? (
                                  <span className="badge b-brand">
                                    Dipakai berikutnya
                                  </span>
                                ) : (
                                  index + 1
                                )}
                              </td>
                              <td className="small">
                                {formatDate(layer.received_at)}
                              </td>
                              <td className="right">
                                {numberFormat(layer.qty_remaining)} / {numberFormat(layer.qty_in)}
                              </td>
                              <td className="right nowrap">
                                {formatRupiah(layer.unit_cost)}
                              </td>
                              <td>{layer.supplier || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="muted small">Stok kosong. Belum ada batch aktif.</p>
                  )}
                </section>

                <section className="inventory-detail-section">
                  <h3>Kartu stok</h3>
                  <p className="small muted">
                    Maksimal 200 pergerakan stok terbaru.
                  </p>

                  {detail.moves?.length ? (
                    <div className="table-wrap inventory-movement-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Waktu</th>
                            <th>Jenis</th>
                            <th className="right">Jumlah</th>
                            <th className="right">Harga</th>
                            <th>Keterangan</th>
                          </tr>
                        </thead>

                        <tbody>
                          {detail.moves.map((move) => {
                            const outgoing = ['OUT', 'ADJ_OUT'].includes(move.type)

                            return (
                              <tr key={move.id}>
                                <td className="small nowrap">
                                  {formatDate(move.created_at)}
                                </td>
                                <td>
                                  <span className={`badge ${
                                    outgoing ? 'b-info' : 'b-ok'
                                  }`}>
                                    {MOVEMENT_LABELS[move.type] || move.type}
                                  </span>
                                </td>
                                <td className="right nowrap">
                                  {outgoing ? '−' : '+'}
                                  {numberFormat(move.qty)}
                                </td>
                                <td className="right small nowrap">
                                  {formatRupiah(move.unit_cost)}
                                  <div className="muted">
                                    Batch #{move.batch_id}
                                  </div>
                                </td>
                                <td className="small">
                                  {move.order_code ? (
                                    <Link
                                      to={`/app/order/${move.ref_id}`}
                                      onClick={closeModal}
                                    >
                                      {move.order_code}
                                    </Link>
                                  ) : (
                                    move.note || '-'
                                  )}

                                  {move.user_name && (
                                    <div className="muted">
                                      Oleh {move.user_name}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="muted small">Belum ada riwayat pergerakan stok.</p>
                  )}
                </section>

                <section className="inventory-detail-section">
                  <h3>Digunakan di layanan</h3>

                  {detail.used_by?.length ? (
                    <div className="inventory-used-services">
                      {detail.used_by.map((service) => (
                        <span className="inventory-service-tag" key={service.id}>
                          {service.name} · {numberFormat(service.qty)} {detail.unit}/pasang
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="muted small">
                      Barang ini belum digunakan pada resep layanan mana pun.
                    </p>
                  )}
                </section>
              </div>
            ) : null}
          </section>
        </div>
      )}

      {/* Form barang baru / edit */}
      {(modal?.type === 'create' || modal?.type === 'edit') && (
        <div
          className="inventory-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) closeModal()
          }}
        >
          <section
            className="inventory-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="inventory-item-form-title"
          >
            <div className="inventory-modal-header">
              <h2 id="inventory-item-form-title">
                {modal.type === 'edit' ? 'Ubah barang' : 'Barang baru'}
              </h2>

              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={closeModal}
                disabled={saving}
                aria-label="Tutup form"
              >
                ✕
              </button>
            </div>

            <form className="inventory-modal-body" onSubmit={submitItem}>
              <div className="inventory-form-grid">
                <label className="field">
                  <span>SKU</span>
                  <input
                    name="sku"
                    required
                    maxLength={30}
                    defaultValue={modal.item?.sku || ''}
                  />
                </label>

                <label className="field">
                  <span>Satuan terkecil</span>
                  <input
                    name="unit"
                    required
                    maxLength={10}
                    placeholder="ml / gr / pcs"
                    defaultValue={modal.item?.unit || 'ml'}
                  />
                </label>
              </div>

              <label className="field">
                <span>Nama barang</span>
                <input
                  name="name"
                  required
                  maxLength={100}
                  defaultValue={modal.item?.name || ''}
                />
              </label>

              <label className="field">
                <span>Stok minimum (peringatan)</span>
                <input
                  name="min_stock"
                  type="number"
                  min="0"
                  step="1"
                  defaultValue={modal.item?.min_stock ?? 0}
                />
              </label>

              {modal.type === 'edit' ? (
                <label className="inventory-checkbox">
                  <input
                    name="active"
                    type="checkbox"
                    defaultChecked={isActive(modal.item)}
                  />
                  Barang aktif
                </label>
              ) : (
                <>
                  <h3>Stok awal (opsional)</h3>

                  <p className="small muted">
                    Jika diisi, stok awal akan tercatat sebagai batch pertama.
                  </p>

                  <div className="inventory-form-grid">
                    <label className="field">
                      <span>Jumlah awal</span>
                      <input
                        name="initial_qty"
                        type="number"
                        min="0"
                        step="1"
                      />
                    </label>

                    <label className="field">
                      <span>Harga per satuan (Rp)</span>
                      <input
                        name="initial_cost"
                        type="number"
                        min="0"
                        step="any"
                      />
                    </label>
                  </div>
                </>
              )}

              {actionError && (
                <div className="inventory-error" role="alert">
                  {actionError}
                </div>
              )}

              <div className="inventory-form-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={closeModal}
                  disabled={saving}
                >
                  Batal
                </button>

                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving}
                >
                  {saving ? 'Menyimpan...' : 'Simpan barang'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* Form stok masuk */}
      {modal?.type === 'stock' && (
        <div
          className="inventory-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) closeModal()
          }}
        >
          <section
            className="inventory-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="inventory-stock-title"
          >
            <div className="inventory-modal-header">
              <div>
                <h2 id="inventory-stock-title">Barang masuk</h2>
                <p className="small muted">{modal.item.name}</p>
              </div>

              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={closeModal}
                disabled={saving}
                aria-label="Tutup form"
              >
                ✕
              </button>
            </div>

            <form className="inventory-modal-body" onSubmit={submitStockIn}>
              <div className="inventory-form-grid">
                <label className="field">
                  <span>Jumlah ({modal.item.unit})</span>
                  <input
                    name="qty"
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={stockQty}
                    onChange={(event) => setStockQty(event.target.value)}
                  />
                </label>

                <label className="field">
                  <span>Total harga beli (Rp)</span>
                  <input
                    name="total_cost"
                    type="number"
                    min="0"
                    step="any"
                    required
                    value={stockTotalCost}
                    onChange={(event) => setStockTotalCost(event.target.value)}
                  />
                </label>
              </div>

              <div className="inventory-unit-cost">
                Harga per {modal.item.unit}:{' '}
                <strong>
                  {Number(stockQty) > 0 && stockTotalCost !== ''
                    ? formatRupiah(Number(stockTotalCost) / Number(stockQty))
                    : '-'}
                </strong>
              </div>

              <label className="field">
                <span>Supplier</span>
                <input name="supplier" maxLength={100} />
              </label>

              <label className="field">
                <span>Catatan</span>
                <input
                  name="note"
                  maxLength={200}
                  placeholder="Nomor faktur atau keterangan pembelian"
                />
              </label>

              {actionError && (
                <div className="inventory-error" role="alert">
                  {actionError}
                </div>
              )}

              <div className="inventory-form-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={closeModal}
                  disabled={saving}
                >
                  Batal
                </button>

                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving}
                >
                  {saving ? 'Menyimpan...' : 'Simpan batch baru'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* Form stok opname */}
      {modal?.type === 'adjust' && (
        <div
          className="inventory-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) closeModal()
          }}
        >
          <section
            className="inventory-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="inventory-adjust-title"
          >
            <div className="inventory-modal-header">
              <div>
                <h2 id="inventory-adjust-title">Penyesuaian stok</h2>
                <p className="small muted">{modal.item.name}</p>
              </div>

              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={closeModal}
                disabled={saving}
                aria-label="Tutup form"
              >
                ✕
              </button>
            </div>

            <form className="inventory-modal-body" onSubmit={submitAdjustment}>
              <div className="inventory-current-stock">
                Stok menurut sistem:
                <strong>
                  {numberFormat(modal.item.stock)} {modal.item.unit}
                </strong>
              </div>

              <label className="field">
                <span>Stok hasil perhitungan fisik ({modal.item.unit})</span>
                <input
                  name="physical"
                  type="number"
                  min="0"
                  step="1"
                  required
                  value={physicalStock}
                  onChange={(event) => setPhysicalStock(event.target.value)}
                />
              </label>

              {physicalStock !== '' && (
                <div className="inventory-adjust-difference">
                  Selisih:
                  <strong>
                    {Number(physicalStock) - Number(modal.item.stock) > 0 ? '+' : ''}
                    {numberFormat(
                      Number(physicalStock) - Number(modal.item.stock)
                    )}{' '}
                    {modal.item.unit}
                  </strong>
                </div>
              )}

              <label className="field">
                <span>Alasan penyesuaian</span>
                <input
                  name="note"
                  required
                  maxLength={200}
                  placeholder="Stok opname bulanan, tumpah, rusak, dan lainnya"
                />
              </label>

              <p className="small muted">
                Penambahan akan membuat batch baru. Pengurangan akan memakai
                metode LIFO dan dicatat pada kartu stok.
              </p>

              {actionError && (
                <div className="inventory-error" role="alert">
                  {actionError}
                </div>
              )}

              <div className="inventory-form-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={closeModal}
                  disabled={saving}
                >
                  Batal
                </button>

                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={
                    saving ||
                    physicalStock === '' ||
                    Number(physicalStock) === Number(modal.item.stock)
                  }
                >
                  {saving ? 'Menyimpan...' : 'Simpan penyesuaian'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}
