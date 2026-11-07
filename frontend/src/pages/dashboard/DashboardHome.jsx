
import { useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { api, formatRupiah } from '../../services/api'

const STATUS_LABEL = {
  BOOKED: 'Menunggu dijemput',
  RECEIVED: 'Diterima di toko',
  WASHING: 'Proses cuci',
  QC: 'Quality control',
  READY: 'Siap',
  DELIVERING: 'Sedang diantar',
  DELIVERED: 'Sudah diantar',
  PICKED_UP: 'Sudah diambil',
  CANCELLED: 'Dibatalkan',
}

const PIPELINE = [
  'BOOKED',
  'RECEIVED',
  'WASHING',
  'QC',
  'READY',
  'DELIVERING',
]

const STATUS_BADGE = {
  BOOKED: 'b-sun',
  RECEIVED: 'b-info',
  WASHING: 'b-brand',
  QC: 'b-brand',
  READY: 'b-ok',
  DELIVERING: 'b-info',
  DELIVERED: '',
  PICKED_UP: '',
  CANCELLED: 'b-danger',
}

function formatDate(value, withTime = true) {
  if (!value) return '-'

  const date = new Date(String(value).replace(' ', 'T'))

  if (Number.isNaN(date.getTime())) return String(value)

  const result = date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  if (!withTime) return result

  return `${result}, ${date.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  })}`
}

export default function DashboardHome() {
  const { user } = useOutletContext()

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    async function loadDashboard() {
      try {
        const result = await api('/api/dashboard')

        if (active) setData(result)
      } catch (err) {
        if (active) setError(err.message)
      } finally {
        if (active) setLoading(false)
      }
    }

    loadDashboard()

    return () => {
      active = false
    }
  }, [])

  if (loading) {
    return (
      <div className="empty">
        <span className="spinner" />
        <p>Memuat dashboard...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="card card-pad">
        <h2>Dashboard tidak dapat dimuat</h2>
        <p className="muted">{error}</p>
        <button
          className="btn btn-primary"
          onClick={() => window.location.reload()}
        >
          Coba lagi
        </button>
      </div>
    )
  }

  const counts = data.status_counts || {}
  const money = data.money || {}
  const deliveries = data.deliveries || {}

  const recent = data.recent || []
  const overdue = data.overdue || []
  const lowStock = data.low_stock || []

  const activeOrders = PIPELINE.reduce(
    (total, status) => total + (counts[status] || 0),
    0
  )

  const isAdmin = user.role === 'admin'
  const canCreateOrder =
    isAdmin || user.role === 'frontoffice'

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Halo, {user.name.split(' ')[0]} 👋</h1>
          <p className="muted small">
            Ringkasan aktivitas usaha Sepatu Kinclong.
          </p>
        </div>

        {canCreateOrder && (
          <div className="actions">
            <Link to="/app/kasir" className="btn btn-primary">
              + Order baru
            </Link>
          </div>
        )}
      </div>

      <div className="kpis">
        <div className="kpi">
          <div className="label">Uang masuk hari ini</div>

          <div className="value">
            {formatRupiah(money.received)}
          </div>

          <div className="sub">
            Tunai {formatRupiah(money.cash)}
            {' · '}
            QRIS {formatRupiah(money.qris)}

            {money.refunds ? (
              <> · Refund {formatRupiah(money.refunds)}</>
            ) : null}
          </div>
        </div>

        <div className="kpi">
          <div className="label">Order masuk hari ini</div>

          <div className="value">
            {data.orders_today || 0}
          </div>

          <div className="sub">
            {data.pairs_today || 0} pasang
          </div>
        </div>

        <div className="kpi">
          <div className="label">Order aktif</div>

          <div className="value">{activeOrders}</div>

          <div className="sub">
            {overdue.length} melewati estimasi
          </div>
        </div>

        <Link
          to="/app/dispute"
          className={`kpi ${data.open_disputes ? 'alert' : ''}`}
          style={{ textDecoration: 'none', color: 'inherit' }}
        >
          <div className="label">Dispute aktif</div>

          <div className="value">
            {data.open_disputes || 0}
          </div>

          <div className="sub">
            {data.pending_qris || 0} QRIS menunggu konfirmasi
          </div>
        </Link>
      </div>

      <section className="card" style={{ marginBottom: 20 }}>
        <div className="card-head">
          <h3>Alur pesanan</h3>
          <Link to="/app/orders" className="small">
            Semua order
          </Link>
        </div>

        <div className="pipeline">
          {PIPELINE.map((status) => (
            <Link
              to={`/app/orders/${status}`}
              className="pipe"
              key={status}
            >
              <div className="n">
                {counts[status] || 0}
              </div>

              <div className="t">
                {STATUS_LABEL[status]}
              </div>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid g-main">
        <section className="card">
          <div className="card-head">
            <h3>Order terbaru</h3>

            <Link to="/app/orders" className="small">
              Lihat semua
            </Link>
          </div>

          <div className="card-body">
            {recent.length ? (
              recent.map((order) => (
                <div className="list-row" key={order.id}>
                  <Link to={`/app/order/${order.id}`}>
                    <strong className="mono">
                      {order.code}
                    </strong>

                    <span className="muted">
                      {' · '}{order.customer_name}
                    </span>

                    <div className="small muted">
                      {formatDate(order.created_at)}
                    </div>
                  </Link>

                  <div className="right">
                    <span className={`badge ${STATUS_BADGE[order.status] || ''}`}>
                      {order.status_label || STATUS_LABEL[order.status] || order.status}
                    </span>

                    <div className="small" style={{ marginTop: 4 }}>
                      {formatRupiah(order.total)}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="empty">Belum ada order.</p>
            )}
          </div>
        </section>

        <div className="grid">
          <section className="card">
            <div className="card-head">
              <h3>Pengiriman</h3>

              <Link to="/app/dispatch" className="small">
                Dispatch
              </Link>
            </div>

            <div className="card-body">
              <div className="list-row">
                <span>Belum ada kurir</span>
                <strong>{deliveries.pending || 0}</strong>
              </div>

              <div className="list-row">
                <span>Ditugaskan</span>
                <strong>{deliveries.assigned || 0}</strong>
              </div>

              <div className="list-row">
                <span>Dalam perjalanan</span>
                <strong>{deliveries.on_the_way || 0}</strong>
              </div>

              <div className="list-row">
                <span>Gagal / jadwal ulang</span>
                <strong style={{
                  color: deliveries.failed
                    ? 'var(--danger)'
                    : 'inherit',
                }}>
                  {deliveries.failed || 0}
                </strong>
              </div>
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h3>Lewat estimasi</h3>
            </div>

            <div className="card-body">
              {overdue.length ? (
                overdue.map((order) => (
                  <div className="list-row" key={order.id}>
                    <Link to={`/app/order/${order.id}`}>
                      <strong className="mono">
                        {order.code}
                      </strong>

                      <div className="small muted">
                        {order.customer_name}
                      </div>
                    </Link>

                    <div className="right small">
                      <span style={{ color: 'var(--danger)' }}>
                        {formatDate(order.due_date, false)}
                      </span>

                      <div>
                        {STATUS_LABEL[order.status] || order.status}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="muted small">
                  Semua order sesuai jadwal.
                </p>
              )}
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h3>Stok menipis</h3>

              <Link to="/app/inventori" className="small">
                Inventori
              </Link>
            </div>

            <div className="card-body">
              {lowStock.length ? (
                lowStock.map((item) => (
                  <div className="list-row" key={item.id}>
                    <span>{item.name}</span>

                    <span className="badge b-danger">
                      {item.stock} {item.unit}
                    </span>
                  </div>
                ))
              ) : (
                <p className="muted small">
                  Stok aman.
                </p>
              )}
            </div>
          </section>
        </div>
      </div>
    </>
  )
}
