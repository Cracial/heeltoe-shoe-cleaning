
import { useEffect, useState } from 'react'
import {
  Link,
  useNavigate,
  useParams,
  useOutletContext,
} from 'react-router-dom'

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

  return `${result} ${date.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  })}`
}

function PaymentBadge({ order }) {
  const status =
    order.payment_status ||
    (order.paid <= 0
      ? 'UNPAID'
      : order.outstanding > 0
        ? 'PARTIAL'
        : 'PAID')

  if (order.total === 0 && order.status === 'BOOKED') {
    return <span className="badge plain">Belum dihitung</span>
  }

  const options = {
    UNPAID: ['Belum bayar', 'b-danger'],
    PARTIAL: ['DP / sebagian', 'b-warn'],
    PAID: ['Lunas', 'b-ok'],
  }

  const [label, badge] = options[status] || [status, '']

  return <span className={`badge ${badge}`}>{label}</span>
}

export default function OrdersPage() {
  const navigate = useNavigate()
  const { status: routeStatus } = useParams()
  const { user } = useOutletContext()

  const [query, setQuery] = useState('')
  const [status, setStatus] = useState(routeStatus || '')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [hasLoaded, setHasLoaded] = useState(false)

  useEffect(() => {
    setStatus(routeStatus || '')
  }, [routeStatus])

  useEffect(() => {
    let active = true

    const timer = setTimeout(async () => {
      setLoading(true)
      setError('')

      const params = new URLSearchParams()

      if (query.trim()) params.set('q', query.trim())

      if (status === 'active') {
        params.set('active', '1')
      } else if (status) {
        params.set('status', status)
      }

      if (dateFrom) params.set('from', dateFrom)
      if (dateTo) params.set('to', dateTo)

      try {
        const result = await api('/api/orders?' + params.toString())

        if (active) {
          setOrders(Array.isArray(result) ? result : [])
          setHasLoaded(true)
        }
      } catch (err) {
        if (active) setError(err.message)
      } finally {
        if (active) setLoading(false)
      }
    }, 250)

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [query, status, dateFrom, dateTo])

  function changeStatus(value) {
    setStatus(value)

    if (
      value &&
      value !== 'active'
    ) {
      navigate(`/app/orders/${encodeURIComponent(value)}`, {
        replace: true,
      })
    } else {
      navigate('/app/orders', {
        replace: true,
      })
    }
  }

  function formatPhone(phone) {
    return phone ? String(phone).replace(/^62/, '0') : '-'
  }

  const canCreateOrder =
    user.role === 'admin' || user.role === 'frontoffice'

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Semua order</h1>

          <p className="muted small">
            Kelola dan pantau seluruh transaksi pelanggan.
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

      <section className="filters">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Cari kode, nama, atau nomor HP"
        />

        <select
          value={status}
          onChange={(event) => changeStatus(event.target.value)}
        >
          <option value="">Semua status</option>
          <option value="active">Semua yang aktif</option>

          {Object.entries(STATUS_LABEL).map(([key, label]) => (
            <option value={key} key={key}>
              {label}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={dateFrom}
          onChange={(event) => setDateFrom(event.target.value)}
          title="Dari tanggal"
        />

        <input
          type="date"
          value={dateTo}
          onChange={(event) => setDateTo(event.target.value)}
          title="Sampai tanggal"
        />

        {(query || status || dateFrom || dateTo) && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setQuery('')
              setDateFrom('')
              setDateTo('')
              setStatus('')
              navigate('/app/orders', { replace: true })
            }}
          >
            Reset filter
          </button>
        )}
      </section>

      {error && (
        <div className="alert-box warn" role="alert">
          {error}

          <button
            className="btn btn-sm btn-ghost"
            onClick={() => window.location.reload()}
          >
            Coba lagi
          </button>
        </div>
      )}

      <section className="card">
        <div className="card-head">
          <h3>Daftar transaksi</h3>

          <span className="small muted">
            {loading
              ? 'Memuat...'
              : `${orders.length} order ditemukan`}
          </span>
        </div>

        <div className="table-wrap">
          {loading && !hasLoaded ? (
            <div className="empty">
              <span className="spinner" />
              <p>Memuat data order...</p>
            </div>
          ) : orders.length ? (
            <table>
              <thead>
                <tr>
                  <th>Kode order</th>
                  <th>Pelanggan</th>
                  <th>Item</th>
                  <th className="right">Total</th>
                  <th>Pembayaran</th>
                  <th>Status</th>
                  <th>Estimasi</th>
                </tr>
              </thead>

              <tbody>
                {orders.map((order) => (
                  <tr
                    key={order.id}
                    className="clickable"
                    onClick={() => navigate(`/app/order/${order.id}`)}
                  >
                    <td>
                      <Link
                        to={`/app/order/${order.id}`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <strong className="mono">
                          {order.code}
                        </strong>
                      </Link>

                      {order.source === 'WEB' && (
                        <div>
                          <span className="badge b-sun plain">
                            Booking web
                          </span>
                        </div>
                      )}

                      <div className="small muted">
                        {formatDate(order.created_at)}
                      </div>
                    </td>

                    <td>
                      <strong>{order.customer_name}</strong>

                      <div className="small muted">
                        {formatPhone(order.customer_phone)}
                      </div>
                    </td>

                    <td className="small">
                      {order.items_text || '—'}
                    </td>

                    <td className="right nowrap">
                      {formatRupiah(order.total)}

                      {order.outstanding > 0 && order.total > 0 && (
                        <div
                          className="small"
                          style={{ color: 'var(--danger)' }}
                        >
                          Sisa {formatRupiah(order.outstanding)}
                        </div>
                      )}
                    </td>

                    <td>
                      <PaymentBadge order={order} />
                    </td>

                    <td>
                      <span
                        className={`badge ${STATUS_BADGE[order.status] || ''}`}
                      >
                        {order.status_label ||
                          STATUS_LABEL[order.status] ||
                          order.status}
                      </span>

                      {order.return_method === 'DELIVERY' && (
                        <div className="small muted">Antar</div>
                      )}
                    </td>

                    <td className="small nowrap">
                      {formatDate(order.due_date, false)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">
              {hasLoaded
                ? 'Tidak ada order yang cocok dengan pencarian.'
                : 'Belum ada data order.'}
            </div>
          )}
        </div>
      </section>
    </>
  )
}
