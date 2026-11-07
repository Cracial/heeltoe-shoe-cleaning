
import { useCallback, useEffect, useState } from 'react'
import { api, formatRupiah } from '../../services/api'

const STATUS_INFO = {
  PENDING: ['Menunggu kurir', 'b-warn'],
  ASSIGNED: ['Kurir ditugaskan', 'b-info'],
  ON_THE_WAY: ['Dalam perjalanan', 'b-brand'],
  DONE: ['Selesai', 'b-ok'],
  FAILED: ['Pengiriman gagal', 'b-danger'],
  CANCELLED: ['Dibatalkan', ''],
}

function formatDate(value) {
  if (!value) return 'Belum dijadwalkan'

  const date = new Date(String(value).replace(' ', 'T'))

  if (Number.isNaN(date.getTime())) return String(value)

  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function toDateTimeInput(value) {
  if (!value) return ''
  return String(value).replace(' ', 'T').slice(0, 16)
}

export default function DispatchPage() {
  const [scope, setScope] = useState('active')
  const [deliveries, setDeliveries] = useState([])
  const [couriers, setCouriers] = useState([])
  const [assignments, setAssignments] = useState({})
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const [deliveryData, courierData] = await Promise.all([
        api(`/api/deliveries?scope=${scope}`),
        api('/api/couriers'),
      ])

      setDeliveries(deliveryData)
      setCouriers(courierData)
    } catch (err) {
      setError(err.message || 'Gagal memuat data pengiriman.')
    } finally {
      setLoading(false)
    }
  }, [scope])

  useEffect(() => {
    loadData()
  }, [loadData])

  function updateAssignment(id, field, value) {
    setAssignments((previous) => ({
      ...previous,
      [id]: {
        ...previous[id],
        [field]: value,
      },
    }))
  }

  async function assignCourier(delivery) {
    const assignment = assignments[delivery.id] || {}

    const courierId = assignment.courierId !== undefined
      ? assignment.courierId
      : String(delivery.courier_id || '')

    const scheduledAt = assignment.scheduledAt !== undefined
      ? assignment.scheduledAt
      : toDateTimeInput(delivery.scheduled_at)

    if (!courierId) {
      setError('Pilih kurir terlebih dahulu.')
      return
    }

    setProcessingId(delivery.id)
    setError('')
    setNotice('')

    try {
      const body = {
        courier_id: Number(courierId),
      }

      if (scheduledAt) {
        body.scheduled_at = scheduledAt
      }

      await api(`/api/deliveries/${delivery.id}/assign`, {
        method: 'POST',
        body,
      })

      setNotice(
        `Tugas ${delivery.order_code} berhasil ditugaskan kepada kurir.`
      )

      await loadData()
    } catch (err) {
      setError(err.message || 'Gagal menugaskan kurir.')
    } finally {
      setProcessingId(null)
    }
  }

  async function cancelDelivery(delivery) {
    const confirmed = window.confirm(
      `Batalkan tugas ${delivery.type === 'PICKUP' ? 'penjemputan' : 'pengantaran'} untuk order ${delivery.order_code}?`
    )

    if (!confirmed) return

    setProcessingId(delivery.id)
    setError('')
    setNotice('')

    try {
      await api(`/api/deliveries/${delivery.id}/status`, {
        method: 'POST',
        body: {
          status: 'CANCELLED',
        },
      })

      setNotice(`Tugas pengiriman ${delivery.order_code} berhasil dibatalkan.`)

      await loadData()
    } catch (err) {
      setError(err.message || 'Gagal membatalkan tugas.')
    } finally {
      setProcessingId(null)
    }
  }

  const pendingCount = deliveries.filter(
    (delivery) => delivery.status === 'PENDING'
  ).length

  const assignedCount = deliveries.filter(
    (delivery) => delivery.status === 'ASSIGNED'
  ).length

  const failedCount = deliveries.filter(
    (delivery) => delivery.status === 'FAILED'
  ).length

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Delivery &amp; dispatch</h1>
          <p className="muted small">
            Atur penjemputan, pengantaran, kurir, dan jadwal pengiriman.
          </p>
        </div>

        <button
          type="button"
          className="btn btn-ghost"
          onClick={loadData}
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

      <div className="dispatch-summary">
        <section className="card card-pad">
          <div className="small muted">Menunggu kurir</div>
          <div className="dispatch-count">{pendingCount}</div>
          <span className="badge b-warn">PENDING</span>
        </section>

        <section className="card card-pad">
          <div className="small muted">Sudah ditugaskan</div>
          <div className="dispatch-count">{assignedCount}</div>
          <span className="badge b-info">ASSIGNED</span>
        </section>

        <section className="card card-pad">
          <div className="small muted">Pengiriman gagal</div>
          <div className="dispatch-count">{failedCount}</div>
          <span className="badge b-danger">FAILED</span>
        </section>
      </div>

      <section className="card">
        <div className="card-head dispatch-toolbar">
          <div>
            <h3>Daftar tugas pengiriman</h3>
            <div className="small muted">
              {deliveries.length} tugas ditemukan
            </div>
          </div>

          <div className="dispatch-tabs">
            <button
              type="button"
              className={`btn btn-sm ${scope === 'active' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => {
                setScope('active')
                setAssignments({})
                setNotice('')
              }}
            >
              Tugas aktif
            </button>

            <button
              type="button"
              className={`btn btn-sm ${scope === 'done' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => {
                setScope('done')
                setAssignments({})
                setNotice('')
              }}
            >
              Riwayat
            </button>
          </div>
        </div>

        <div className="card-body">
          {loading ? (
            <div className="empty">
              <span className="spinner" />
              <p>Memuat tugas pengiriman...</p>
            </div>
          ) : deliveries.length === 0 ? (
            <div className="empty">
              <h3>
                {scope === 'active'
                  ? 'Belum ada tugas aktif'
                  : 'Belum ada riwayat pengiriman'}
              </h3>
              <p className="muted small">
                Tugas penjemputan dari booking web dan pengantaran
                order akan muncul di halaman ini.
              </p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Jenis</th>
                    <th>Pelanggan</th>
                    <th>Alamat</th>
                    <th>Kurir &amp; jadwal</th>
                    <th>Status</th>
                    <th className="right">Sisa tagihan</th>
                    {scope === 'active' && <th>Aksi</th>}
                  </tr>
                </thead>

                <tbody>
                  {deliveries.map((delivery) => {
                    const status = STATUS_INFO[delivery.status] || [
                      delivery.status,
                      '',
                    ]

                    const canAssign = [
                      'PENDING',
                      'ASSIGNED',
                      'FAILED',
                    ].includes(delivery.status)

                    const canCancel = [
                      'PENDING',
                      'ASSIGNED',
                      'FAILED',
                    ].includes(delivery.status)

                    const assignment = assignments[delivery.id] || {}

                    const selectedCourier =
                      assignment.courierId !== undefined
                        ? assignment.courierId
                        : String(delivery.courier_id || '')

                    const scheduledAt =
                      assignment.scheduledAt !== undefined
                        ? assignment.scheduledAt
                        : toDateTimeInput(delivery.scheduled_at)

                    return (
                      <tr key={delivery.id}>
                        <td>
                          <strong className="mono">
                            {delivery.order_code}
                          </strong>

                          <div className="small muted">
                            {delivery.pairs || 0} pasang
                          </div>

                          <div className="small">
                            <a href={`/app/order/${delivery.order_id}`}>
                              Detail order
                            </a>
                          </div>
                        </td>

                        <td>
                          <span className="badge b-info">
                            {delivery.type === 'PICKUP'
                              ? 'Jemput'
                              : 'Antar'}
                          </span>
                        </td>

                        <td>
                          <strong>{delivery.customer_name}</strong>
                          <div className="small muted">
                            {delivery.customer_phone}
                          </div>
                        </td>

                        <td>
                          <div className="dispatch-address">
                            {delivery.address}
                          </div>
                        </td>

                        <td>
                          {scope === 'active' && canAssign ? (
                            <div className="dispatch-assignment">
                              <select
                                aria-label={`Pilih kurir ${delivery.order_code}`}
                                value={selectedCourier}
                                onChange={(event) =>
                                  updateAssignment(
                                    delivery.id,
                                    'courierId',
                                    event.target.value
                                  )
                                }
                              >
                                <option value="">Pilih kurir</option>

                                {couriers.map((courier) => (
                                  <option
                                    key={courier.id}
                                    value={String(courier.id)}
                                  >
                                    {courier.name} ({courier.active_tasks} tugas aktif)
                                  </option>
                                ))}
                              </select>

                              <input
                                type="datetime-local"
                                aria-label={`Jadwal ${delivery.order_code}`}
                                value={scheduledAt}
                                onChange={(event) =>
                                  updateAssignment(
                                    delivery.id,
                                    'scheduledAt',
                                    event.target.value
                                  )
                                }
                              />

                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                disabled={
                                  processingId !== null ||
                                  couriers.length === 0
                                }
                                onClick={() => assignCourier(delivery)}
                              >
                                {processingId === delivery.id
                                  ? 'Menyimpan...'
                                  : delivery.status === 'FAILED'
                                    ? 'Jadwalkan ulang'
                                    : delivery.status === 'ASSIGNED'
                                      ? 'Perbarui tugas'
                                      : 'Tugaskan kurir'}
                              </button>
                            </div>
                          ) : (
                            <>
                              <div>{delivery.courier_name || '-'}</div>
                              <div className="small muted">
                                {formatDate(delivery.scheduled_at)}
                              </div>
                            </>
                          )}
                        </td>

                        <td>
                          <span className={`badge ${status[1]}`}>
                            {status[0]}
                          </span>

                          {delivery.proof_note && (
                            <div className="small muted dispatch-proof">
                              {delivery.proof_note}
                            </div>
                          )}
                        </td>

                        <td className="right nowrap">
                          {formatRupiah(delivery.outstanding)}
                        </td>

                        {scope === 'active' && (
                          <td>
                            {canCancel ? (
                              <button
                                type="button"
                                className="btn btn-danger btn-sm"
                                disabled={processingId !== null}
                                onClick={() => cancelDelivery(delivery)}
                              >
                                Batalkan
                              </button>
                            ) : (
                              <span className="small muted">-</span>
                            )}
                          </td>
                        )}
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
