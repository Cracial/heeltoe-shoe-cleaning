
import { useCallback, useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { api, formatRupiah } from '../../services/api'

const STATUS_INFO = {
  PENDING: ['Menunggu kurir', 'b-warn'],
  ASSIGNED: ['Ditugaskan kepada Anda', 'b-info'],
  ON_THE_WAY: ['Dalam perjalanan', 'b-brand'],
  DONE: ['Selesai', 'b-ok'],
  FAILED: ['Gagal', 'b-danger'],
  CANCELLED: ['Dibatalkan', ''],
}

function formatDate(value) {
  if (!value) return 'Belum dijadwalkan'

  const date = new Date(String(value).replace(' ', 'T'))

  if (Number.isNaN(date.getTime())) return String(value)

  return date.toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function CourierPage() {
  const { user } = useOutletContext()

  const [deliveries, setDeliveries] = useState([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadDeliveries = useCallback(async () => {
    if (user?.role !== 'kurir') return

    setLoading(true)
    setError('')

    try {
      const result = await api('/api/my/deliveries')
      setDeliveries(result)
    } catch (err) {
      setError(err.message || 'Gagal memuat tugas kurir.')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (user?.role === 'kurir') {
      loadDeliveries()
    } else {
      setLoading(false)
    }
  }, [user, loadDeliveries])

  async function changeStatus(delivery, nextStatus) {
    let proofNote = ''
    let collectCash = false

    if (nextStatus === 'FAILED') {
      const reason = window.prompt(
        'Tuliskan alasan penjemputan atau pengantaran gagal:'
      )

      if (reason === null) return

      if (!reason.trim()) {
        setError('Alasan kegagalan wajib diisi.')
        return
      }

      proofNote = reason.trim()
    }

    if (nextStatus === 'DONE') {
      const hasCod =
        delivery.type === 'DROPOFF' &&
        Number(delivery.outstanding) > 0

      const message = hasCod
        ? `Pastikan pelanggan sudah menerima sepatu dan membayar COD sebesar ${formatRupiah(delivery.outstanding)} secara tunai. Dana tersebut akan langsung dicatat sebagai pembayaran order. Lanjutkan?`
        : `Tandai tugas ${delivery.type === 'PICKUP' ? 'penjemputan' : 'pengantaran'} order ${delivery.order_code} sebagai selesai?`

      if (!window.confirm(message)) return

      collectCash = hasCod
    }

    setProcessingId(delivery.id)
    setError('')
    setNotice('')

    try {
      await api(`/api/deliveries/${delivery.id}/status`, {
        method: 'POST',
        body: {
          status: nextStatus,
          proof_note: proofNote,
          collect_cash: collectCash,
        },
      })

      const actionLabel = {
        ON_THE_WAY: 'dimulai',
        DONE: 'diselesaikan',
        FAILED: 'dilaporkan gagal',
      }

      setNotice(
        `Tugas ${delivery.order_code} berhasil ${actionLabel[nextStatus]}.`
      )

      await loadDeliveries()
    } catch (err) {
      setError(err.message || 'Gagal memperbarui status tugas.')
    } finally {
      setProcessingId(null)
    }
  }

  const assignedCount = deliveries.filter(
    (delivery) => delivery.status === 'ASSIGNED'
  ).length

  const onTheWayCount = deliveries.filter(
    (delivery) => delivery.status === 'ON_THE_WAY'
  ).length

  const failedCount = deliveries.filter(
    (delivery) => delivery.status === 'FAILED'
  ).length

  if (user?.role !== 'kurir') {
    return (
      <section className="card card-pad">
        <h2>Halaman khusus kurir</h2>
        <p className="muted">
          Halaman ini hanya dapat digunakan oleh akun dengan peran Kurir.
          Pengelolaan penugasan dapat dilakukan melalui halaman Dispatch.
        </p>
        <Link to="/app/dispatch" className="btn btn-primary">
          Buka Dispatch
        </Link>
      </section>
    )
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Tugas saya</h1>
          <p className="muted small">
            Selamat bertugas, {user.name}. Berikut daftar penjemputan
            dan pengantaran Anda.
          </p>
        </div>

        <button
          type="button"
          className="btn btn-ghost"
          onClick={loadDeliveries}
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
          <div className="small muted">Tugas ditugaskan</div>
          <div className="dispatch-count">{assignedCount}</div>
          <span className="badge b-info">ASSIGNED</span>
        </section>

        <section className="card card-pad">
          <div className="small muted">Sedang berjalan</div>
          <div className="dispatch-count">{onTheWayCount}</div>
          <span className="badge b-brand">ON THE WAY</span>
        </section>

        <section className="card card-pad">
          <div className="small muted">Pengiriman gagal</div>
          <div className="dispatch-count">{failedCount}</div>
          <span className="badge b-danger">FAILED</span>
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <div>
            <h3>Daftar tugas pengiriman</h3>
            <div className="small muted">
              {deliveries.length} tugas ditampilkan
            </div>
          </div>
        </div>

        <div className="card-body">
          {loading ? (
            <div className="empty">
              <span className="spinner" />
              <p>Memuat tugas Anda...</p>
            </div>
          ) : deliveries.length === 0 ? (
            <div className="empty">
              <h3>Belum ada tugas pengiriman</h3>
              <p className="muted small">
                Tugas yang ditugaskan oleh dispatcher akan muncul di sini.
              </p>
            </div>
          ) : (
            <div className="courier-task-list">
              {deliveries.map((delivery) => {
                const status = STATUS_INFO[delivery.status] || [
                  delivery.status,
                  '',
                ]

                const isPickup = delivery.type === 'PICKUP'
                const hasCod =
                  !isPickup && Number(delivery.outstanding) > 0

                return (
                  <article
                    className="courier-task-card"
                    key={delivery.id}
                  >
                    <div className="courier-task-top">
                      <div>
                        <span className="badge b-info">
                          {isPickup ? 'PENJEMPUTAN' : 'PENGANTARAN'}
                        </span>

                        <h3 className="mono" style={{ marginTop: 8 }}>
                          {delivery.order_code}
                        </h3>
                      </div>

                      <span className={`badge ${status[1]}`}>
                        {status[0]}
                      </span>
                    </div>

                    <div className="courier-task-details">
                      <div>
                        <div className="small muted">Pelanggan</div>
                        <strong>{delivery.customer_name}</strong>
                      </div>

                      <div>
                        <div className="small muted">Nomor HP</div>
                        <a href={`tel:${delivery.customer_phone}`}>
                          {delivery.customer_phone || '-'}
                        </a>
                      </div>

                      <div>
                        <div className="small muted">Jadwal</div>
                        <strong>{formatDate(delivery.scheduled_at)}</strong>
                      </div>

                      <div>
                        <div className="small muted">Jumlah sepatu</div>
                        <strong>{delivery.pairs || 0} pasang</strong>
                      </div>
                    </div>

                    <div className="courier-task-address">
                      <div className="small muted">Alamat tujuan</div>
                      <strong>{delivery.address}</strong>
                    </div>

                    {!isPickup && (
                      <div className="courier-payment-info">
                        <div>
                          <span className="small muted">Sisa tagihan</span>
                          <strong>{formatRupiah(delivery.outstanding)}</strong>
                        </div>

                        {hasCod && (
                          <span className="badge b-warn">
                            COD tunai
                          </span>
                        )}

                        {!hasCod && (
                          <span className="badge b-ok">
                            Sudah lunas
                          </span>
                        )}
                      </div>
                    )}

                    {delivery.note && (
                      <div className="small muted">
                        Catatan: {delivery.note}
                      </div>
                    )}

                    {delivery.proof_note && (
                      <div className="small muted">
                        Bukti / catatan: {delivery.proof_note}
                      </div>
                    )}

                    <div className="courier-task-actions">
                      {delivery.status === 'ASSIGNED' && (
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={processingId !== null}
                          onClick={() =>
                            changeStatus(delivery, 'ON_THE_WAY')
                          }
                        >
                          {processingId === delivery.id
                            ? 'Memproses...'
                            : 'Mulai perjalanan'}
                        </button>
                      )}

                      {delivery.status === 'ON_THE_WAY' && (
                        <>
                          <button
                            type="button"
                            className="btn btn-primary"
                            disabled={processingId !== null}
                            onClick={() =>
                              changeStatus(delivery, 'DONE')
                            }
                          >
                            {processingId === delivery.id
                              ? 'Memproses...'
                              : isPickup
                                ? 'Selesai menjemput'
                                : hasCod
                                  ? 'Selesaikan & terima COD'
                                  : 'Selesaikan pengantaran'}
                          </button>

                          <button
                            type="button"
                            className="btn btn-danger"
                            disabled={processingId !== null}
                            onClick={() =>
                              changeStatus(delivery, 'FAILED')
                            }
                          >
                            Laporkan gagal
                          </button>
                        </>
                      )}

                      {delivery.status === 'FAILED' && (
                        <div className="alert-box warn">
                          Tugas gagal. Hubungi dispatcher untuk
                          penjadwalan ulang.
                        </div>
                      )}

                      {['DONE', 'CANCELLED'].includes(delivery.status) && (
                        <span className="small muted">
                          Tidak ada tindakan lanjutan.
                        </span>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>
      </section>
    </>
  )
}
