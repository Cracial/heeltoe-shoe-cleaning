
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, formatRupiah } from '../../services/api'

const STATUS_INFO = {
  RECEIVED: {
    label: 'Diterima di toko',
    badge: 'b-info',
    action: 'WASHING',
  },
  WASHING: {
    label: 'Sedang dicuci',
    badge: 'b-brand',
    action: 'QC',
  },
  QC: {
    label: 'Quality control',
    badge: 'b-warn',
    action: null,
  },
}

const STATUS_LABEL = {
  WASHING: 'Mulai cuci',
  QC: 'Kirim ke QC',
  READY: 'Lolos QC — siap diambil / diantar',
}

function formatDate(value) {
  if (!value) return '-'

  const date = new Date(String(value).replace(' ', 'T'))

  if (Number.isNaN(date.getTime())) return String(value)

  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default function ProductionPage() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadOrders = useCallback(async () => {
    setError('')
    setLoading(true)

    try {
      const result = await api('/api/orders?active=1')

      const productionOrders = result.filter((order) =>
        ['RECEIVED', 'WASHING', 'QC'].includes(order.status)
      )

      setOrders(productionOrders)
    } catch (err) {
      setError(err.message || 'Gagal memuat antrian produksi.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  const receivedCount = orders.filter(
    (order) => order.status === 'RECEIVED'
  ).length

  const washingCount = orders.filter(
    (order) => order.status === 'WASHING'
  ).length

  const qcCount = orders.filter(
    (order) => order.status === 'QC'
  ).length

  async function changeStatus(order, nextStatus) {
    let note = ''

    // QC gagal: wajib memberikan catatan sebelum cuci ulang.
    if (order.status === 'QC' && nextStatus === 'WASHING') {
      note = window.prompt(
        'Masukkan catatan QC atau bagian yang belum bersih:'
      )

      if (note === null) return

      if (!note.trim()) {
        setError('Catatan QC wajib diisi untuk proses cuci ulang.')
        return
      }
    }

    // Konfirmasi hasil QC sebelum order dinyatakan siap.
    if (nextStatus === 'READY') {
      const confirmed = window.confirm(
        `Pastikan hasil QC order ${order.code} sudah sesuai. Lanjutkan?`
      )

      if (!confirmed) return
    }

    setProcessingId(order.id)
    setError('')
    setNotice('')

    try {
      await api(`/api/orders/${order.id}/status`, {
        method: 'POST',
        body: {
          status: nextStatus,
          note,
        },
      })

      setNotice(
        `Order ${order.code} berhasil diperbarui menjadi ${
          STATUS_INFO[nextStatus]?.label ||
          (nextStatus === 'READY' ? 'Siap diambil / diantar' : nextStatus)
        }.`
      )

      await loadOrders()
    } catch (err) {
      if (err.data?.shortages?.length) {
        const details = err.data.shortages
          .map((item) =>
            `${item.name}: butuh ${item.need} ${item.unit}, tersedia ${item.available}`
          )
          .join('\n')

        setError(
          `Stok bahan tidak mencukupi:\n${details}\nSilakan periksa Inventori sebelum memulai pencucian.`
        )
      } else {
        setError(err.message || 'Gagal mengubah status order.')
      }
    } finally {
      setProcessingId(null)
    }
  }

  function renderActions(order) {
    const disabled = processingId !== null

    if (order.status === 'RECEIVED') {
      return (
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={disabled}
          onClick={() => changeStatus(order, 'WASHING')}
        >
          {processingId === order.id ? 'Memproses...' : 'Mulai cuci'}
        </button>
      )
    }

    if (order.status === 'WASHING') {
      return (
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={disabled}
          onClick={() => changeStatus(order, 'QC')}
        >
          {processingId === order.id ? 'Memproses...' : 'Kirim ke QC'}
        </button>
      )
    }

    if (order.status === 'QC') {
      return (
        <div className="actions production-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={disabled}
            onClick={() => changeStatus(order, 'WASHING')}
          >
            Cuci ulang
          </button>

          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={disabled}
            onClick={() => changeStatus(order, 'READY')}
          >
            Lolos QC
          </button>
        </div>
      )
    }

    return null
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Produksi</h1>
          <p className="muted small">
            Pantau proses pencucian, quality control, dan kesiapan pesanan.
          </p>
        </div>

        <button
          type="button"
          className="btn btn-ghost"
          onClick={loadOrders}
          disabled={loading || processingId !== null}
        >
          {loading ? 'Memuat...' : 'Muat ulang'}
        </button>
      </div>

      {error && (
        <div className="alert-box warn" role="alert">
          <div style={{ whiteSpace: 'pre-line' }}>{error}</div>
        </div>
      )}

      {notice && (
        <div className="alert-box info" role="status">
          {notice}
        </div>
      )}

      <div className="grid production-summary">
        <section className="card card-pad">
          <div className="small muted">Menunggu pencucian</div>
          <div className="production-count">{receivedCount}</div>
          <span className="badge b-info">Diterima di toko</span>
        </section>

        <section className="card card-pad">
          <div className="small muted">Sedang dicuci</div>
          <div className="production-count">{washingCount}</div>
          <span className="badge b-brand">Proses pencucian</span>
        </section>

        <section className="card card-pad">
          <div className="small muted">Menunggu QC</div>
          <div className="production-count">{qcCount}</div>
          <span className="badge b-warn">Quality control</span>
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <div>
            <h3>Antrian produksi</h3>
            <div className="small muted">
              {orders.length} order dalam proses produksi
            </div>
          </div>
        </div>

        <div className="card-body">
          {loading ? (
            <div className="empty">
              <span className="spinner" />
              <p>Memuat antrian produksi...</p>
            </div>
          ) : orders.length === 0 ? (
            <div className="empty">
              <h3>Belum ada antrian produksi</h3>
              <p className="muted small">
                Order yang sudah diterima di toko akan muncul di sini.
              </p>
              <Link to="/app/orders" className="btn btn-ghost btn-sm">
                Lihat semua order
              </Link>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Nomor order</th>
                    <th>Pelanggan</th>
                    <th>Sepatu & layanan</th>
                    <th>Status</th>
                    <th>Estimasi</th>
                    <th className="right">Total</th>
                    <th>Aksi</th>
                  </tr>
                </thead>

                <tbody>
                  {orders.map((order) => {
                    const status = STATUS_INFO[order.status]

                    return (
                      <tr key={order.id}>
                        <td>
                          <Link
                            to={`/app/order/${order.id}`}
                            className="mono"
                          >
                            {order.code}
                          </Link>

                          <div className="small muted">
                            {order.pairs || 0} pasang
                          </div>
                        </td>

                        <td>
                          <strong>{order.customer_name}</strong>

                          <div className="small muted">
                            {order.customer_phone}
                          </div>
                        </td>

                        <td>
                          {order.items_text || '-'}
                        </td>

                        <td>
                          <span className={`badge ${status.badge}`}>
                            {status.label}
                          </span>
                        </td>

                        <td className="small">
                          {formatDate(order.due_date)}
                        </td>

                        <td className="right nowrap">
                          {formatRupiah(order.total)}
                        </td>

                        <td>
                          {renderActions(order)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </>
  )
}
