
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, formatRupiah } from '../services/api'

const STAGES = ['Diterima', 'Dicuci', 'QC', 'Siap', 'Selesai']

const STAGE_OF = {
  BOOKED: 0,
  RECEIVED: 1,
  WASHING: 2,
  QC: 3,
  READY: 4,
  DELIVERING: 4,
  DELIVERED: 5,
  PICKED_UP: 5,
  CANCELLED: 0,
}

const ORDER_BADGE = {
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

const PAY_LABEL = {
  UNPAID: ['Belum bayar', 'b-danger'],
  PARTIAL: ['DP / sebagian', 'b-warn'],
  PAID: ['Lunas', 'b-ok'],
}

const DISPUTE_CAT = {
  DAMAGE: 'Kerusakan',
  LOST: 'Kehilangan',
  QUALITY: 'Hasil kurang bersih',
  LATE: 'Keterlambatan',
  PAYMENT: 'Pembayaran',
  OTHER: 'Lainnya',
}

const DISPUTE_STATUS = {
  OPEN: ['Baru', 'b-danger'],
  INVESTIGATING: ['Ditangani', 'b-warn'],
  RESOLVED: ['Selesai', 'b-ok'],
  REJECTED: ['Ditolak', ''],
}

function formatDate(value, withTime = true) {
  if (!value) return '-'

  const date = new Date(String(value).replace(' ', 'T'))

  if (Number.isNaN(date.getTime())) return String(value)

  const dateText = date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  if (!withTime) return dateText

  const timeText = date.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  })

  return `${dateText} ${timeText}`
}

export default function TrackPage() {
  const initialParams = new URLSearchParams(window.location.search)

  const [code, setCode] = useState(initialParams.get('kode') || '')
  const [phone, setPhone] = useState(
    initialParams.get('hp') || sessionStorage.getItem('sk_phone') || ''
  )

  const [credentials, setCredentials] = useState(null)
  const [order, setOrder] = useState(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')

  const [qrisPayment, setQrisPayment] = useState(null)
  const [qrisStatus, setQrisStatus] = useState('Menunggu pembayaran...')
  const [qrisRemaining, setQrisRemaining] = useState(0)

  async function loadOrder(creds) {
    setLoading(true)
    setError('')
    setActionError('')

    try {
      const result = await api('/api/public/track', {
        method: 'POST',
        body: creds,
      })

      setOrder(result)
      setCredentials(creds)

      sessionStorage.setItem('sk_phone', creds.phone)

      const params = new URLSearchParams()
      params.set('kode', result.code)

      window.history.replaceState(
        null,
        '',
        `/lacak?${params.toString()}${window.location.hash}`
      )

      if (
        result.pending_qris &&
        sessionStorage.getItem('sk_qris_open') === result.pending_qris.ref
      ) {
        setQrisPayment(result.pending_qris)
      }
    } catch (err) {
      setOrder(null)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Otomatis mencari order jika kode dan nomor HP tersedia di URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)

    const initialCode = params.get('kode') || ''
    const initialPhone =
      params.get('hp') || sessionStorage.getItem('sk_phone') || ''

    if (initialCode && initialPhone) {
      setCode(initialCode)
      setPhone(initialPhone)

      loadOrder({
        code: initialCode.trim().toUpperCase(),
        phone: initialPhone,
      })
    }
  }, [])

  // Scroll otomatis menuju bagian komplain.
  useEffect(() => {
    if (order && window.location.hash === '#komplain') {
      document.getElementById('komplain')?.scrollIntoView({
        behavior: 'smooth',
      })
    }
  }, [order])

  async function handleTrack(event) {
    event.preventDefault()

    if (!code.trim() || !phone.trim()) {
      setError('Isi kode order dan nomor HP terlebih dahulu.')
      return
    }

    await loadOrder({
      code: code.trim().toUpperCase(),
      phone: phone.trim(),
    })
  }

  async function handleDispute(event) {
    event.preventDefault()

    if (!credentials) return

    const form = event.currentTarget
    const data = Object.fromEntries(new FormData(form).entries())

    setActionError('')

    try {
      const result = await api('/api/public/disputes', {
        method: 'POST',
        body: {
          ...credentials,
          ...data,
        },
      })

      setActionError(result.message || 'Komplain berhasil dikirim.')

      await loadOrder(credentials)

      setTimeout(() => {
        document.getElementById('komplain')?.scrollIntoView({
          behavior: 'smooth',
        })
      }, 100)
    } catch (err) {
      setActionError(err.message)
    }
  }

  async function handleReply(event, disputeCode) {
    event.preventDefault()

    if (!credentials) return

    const form = event.currentTarget
    const data = Object.fromEntries(new FormData(form).entries())

    setActionError('')

    try {
      await api(
        `/api/public/disputes/${encodeURIComponent(disputeCode)}/messages`,
        {
          method: 'POST',
          body: {
            order_code: credentials.code,
            phone: credentials.phone,
            message: data.message,
            },
        }
      )

      await loadOrder(credentials)
    } catch (err) {
      setActionError(err.message)
    }
  }

  async function handlePayQris() {
    if (!credentials) return

    setActionError('')

    try {
      const payment = await api('/api/public/pay-qris', {
        method: 'POST',
        body: credentials,
      })

      setQrisStatus('Menunggu pembayaran...')
      setQrisPayment(payment)
      setQrisRemaining(
        Math.max(0, Math.round((payment.expires_at - Date.now()) / 1000))
      )

      sessionStorage.setItem('sk_qris_open', payment.ref)
    } catch (err) {
      setActionError(err.message)
    }
  }

  function closeQris() {
    setQrisPayment(null)
    sessionStorage.removeItem('sk_qris_open')

    if (credentials) {
      loadOrder(credentials)
    }
  }

  // Memantau pembayaran QRIS setiap 5 detik.
  useEffect(() => {
    if (!qrisPayment || !credentials) return

    let seconds = 0
    let closeTimer

    const checkPayment = async () => {
      const remaining = Math.max(
        0,
        Math.round((qrisPayment.expires_at - Date.now()) / 1000)
      )

      setQrisRemaining(remaining)

      if (seconds % 5 !== 0 && remaining > 0) return

      try {
        const result = await api('/api/public/payment-status', {
          method: 'POST',
          body: {
            ...credentials,
            ref: qrisPayment.ref,
          },
        })

        if (result.status === 'PAID') {
          setQrisStatus('Pembayaran diterima. Terima kasih!')

          clearInterval(interval)

          closeTimer = setTimeout(() => {
            sessionStorage.removeItem('sk_qris_open')
            setQrisPayment(null)
            loadOrder(credentials)
          }, 1800)
        } else if (result.status !== 'PENDING' || remaining <= 0) {
          setQrisStatus('QR kedaluwarsa. Silakan tutup dan buat ulang.')
          clearInterval(interval)
        }
      } catch {
        // Polling berikutnya akan mencoba kembali.
      }
    }

    const interval = setInterval(() => {
      seconds += 1
      checkPayment()
    }, 1000)

    checkPayment()

    return () => {
      clearInterval(interval)
      clearTimeout(closeTimer)
    }
  }, [qrisPayment, credentials])

  const orderItems = order?.items || []
  const disputes = order?.disputes || []
  const timeline = order?.timeline || []
  const deliveries = order?.deliveries || []

  const stage = STAGE_OF[order?.status] ?? 0

  const paymentInfo = PAY_LABEL[order?.payment_status] || [
    'Status pembayaran tidak diketahui',
    '',
  ]

  const activeDispute = disputes.some(
    (dispute) =>
      dispute.status === 'OPEN' ||
      dispute.status === 'INVESTIGATING'
  )

  const latestDelivery = deliveries
    .filter((delivery) => delivery.status !== 'CANCELLED')
    .at(-1)

  const canPay =
    order &&
    Number(order.outstanding) > 0 &&
    order.status !== 'CANCELLED' &&
    orderItems.length > 0

  const showInitialComplaintMessage =
    window.location.hash === '#komplain' && !order

  return (
    <>
      <header id="site-nav">
        <div className="wrap nav-in">
          <Link to="/" className="logo">
            <img src="/favicon.svg" alt="" />
            <span>Sepatu Kinclong</span>
          </Link>

          <nav className="nav-links">
            <Link to="/">Beranda</Link>
            <Link to="/profil">Profil</Link>
            <Link to="/lacak">Lacak order</Link>
            <Link to="/login">Staf</Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="page-hero" style={{ paddingBottom: 24 }}>
          <div className="wrap">
            <span className="eyebrow">Lacak order</span>

            <h1 style={{ fontSize: 'clamp(30px, 4vw, 44px)' }}>
              Di mana sepatu saya sekarang?
            </h1>

            <p className="lead">
              Masukkan kode order dari nota atau WhatsApp
              dan nomor HP yang didaftarkan.
            </p>

            <form
              className="card card-pad track-form"
              style={{ marginTop: 20 }}
              onSubmit={handleTrack}
            >
              <div className="field">
                <label>Kode order</label>
                <input
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  required
                  placeholder="SK-261025-001"
                  autoCapitalize="characters"
                  className="mono"
                />
              </div>

              <div className="field">
                <label>Nomor HP</label>
                <input
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  required
                  inputMode="tel"
                  placeholder="0812xxxxxxx"
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-lg"
                disabled={loading}
              >
                {loading ? 'Mencari...' : 'Lacak'}
              </button>
            </form>

            {error && (
              <p role="alert" style={{ color: '#c0392b', marginTop: 14 }}>
                {error}
              </p>
            )}

            {showInitialComplaintMessage && (
              <div className="card card-pad" style={{ marginTop: 20 }}>
                Untuk mengajukan komplain, lacak order terlebih dahulu.
                Tombol komplain tersedia di detail pesanan.
              </div>
            )}
          </div>
        </section>

        {order && (
          <section style={{ paddingTop: 0 }}>
            <div className="wrap">
              <div className="grid-2">
                <div style={{ display: 'grid', gap: 20 }}>
                  <div className="card card-pad">
                    <div className="order-heading">
                      <div>
                        <div className="muted small">Order</div>

                        <h2 className="mono" style={{ margin: 0 }}>
                          {order.code}
                        </h2>

                        <div className="muted small">
                          a.n. {order.customer_name}
                          {' · '}dibuat {formatDate(order.created_at)}
                        </div>
                      </div>

                      <span
                        className={`badge ${ORDER_BADGE[order.status] || ''}`}
                        style={{ fontSize: 13, padding: '6px 12px' }}
                      >
                        {order.status_label}
                      </span>
                    </div>

                    {order.status !== 'CANCELLED' && (
                      <>
                        <div className="progress">
                          {STAGES.map((item, index) => (
                            <div
                              key={item}
                              className={index < stage ? 'on' : ''}
                            />
                          ))}
                        </div>

                        <div className="progress-labels">
                          {STAGES.map((item, index) => (
                            <span
                              key={item}
                              className={index < stage ? 'on' : ''}
                            >
                              {item}
                            </span>
                          ))}
                        </div>
                      </>
                    )}

                    {order.due_date &&
                      !['DELIVERED', 'PICKED_UP', 'CANCELLED'].includes(
                        order.status
                      ) && (
                        <p className="small" style={{ margin: '14px 0 0' }}>
                          Estimasi selesai:
                          <strong> {formatDate(order.due_date, false)}</strong>
                        </p>
                      )}

                    {latestDelivery && (
                      <p className="small" style={{ margin: '8px 0 0' }}>
                        {latestDelivery.type === 'PICKUP'
                          ? 'Penjemputan'
                          : 'Pengantaran'}
                        : <strong>{latestDelivery.label}</strong>
                        {latestDelivery.courier &&
                          ` · kurir ${latestDelivery.courier}`}
                        {latestDelivery.scheduled_at &&
                          ` · jadwal ${formatDate(latestDelivery.scheduled_at)}`}
                      </p>
                    )}
                  </div>

                  <div className="card card-pad">
                    <h3>Riwayat pesanan</h3>

                    {timeline.length > 0 ? (
                      <ul className="timeline">
                        {[...timeline].reverse().map((item, index) => (
                          <li key={`${item.at}-${index}`}>
                            <strong>{item.label}</strong>
                            <span className="muted small">
                              {' · '}{formatDate(item.at)}
                            </span>

                            {item.note && (
                              <div className="small muted">{item.note}</div>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="muted small">
                        Belum ada riwayat pesanan.
                      </p>
                    )}
                  </div>

                  <div className="card card-pad" id="komplain">
                    <h3>Komplain</h3>

                    {disputes.length > 0 ? (
                      disputes.map((dispute, index) => {
                        const [statusText, statusClass] =
                          DISPUTE_STATUS[dispute.status] || [
                            dispute.status,
                            '',
                          ]

                        const isOpen = [
                          'OPEN',
                          'INVESTIGATING',
                        ].includes(dispute.status)

                        return (
                          <div key={dispute.code}>
                            {index > 0 && (
                              <hr className="track-divider" />
                            )}

                            <div className="dispute-heading">
                              <strong className="mono">
                                {dispute.code}
                              </strong>

                              <span className={`badge ${statusClass}`}>
                                {statusText}
                              </span>
                            </div>

                            <div className="small muted">
                              {DISPUTE_CAT[dispute.category] || dispute.category}
                              {' · '}{formatDate(dispute.created_at)}
                            </div>

                            <div className="thread">
                              {(dispute.messages || []).map((item, messageIndex) => (
                                <div
                                  key={messageIndex}
                                  className={`msg ${item.author_type === 'CUSTOMER' ? 'customer' : 'staff'}`}
                                >
                                  <div className="who">
                                    {item.author_type === 'CUSTOMER'
                                      ? 'Anda'
                                      : item.author_name || 'Tim kami'}
                                    {' · '}{formatDate(item.created_at)}
                                  </div>

                                  <div>{item.message}</div>
                                </div>
                              ))}
                            </div>

                            {isOpen && (
                              <form
                                className="reply-form"
                                onSubmit={(event) =>
                                  handleReply(event, dispute.code)
                                }
                              >
                                <input
                                  name="message"
                                  required
                                  maxLength={1500}
                                  placeholder="Tulis balasan..."
                                />

                                <button className="btn btn-primary" type="submit">
                                  Kirim
                                </button>
                              </form>
                            )}
                          </div>
                        )
                      })
                    ) : (
                      <p className="muted small">
                        Belum ada komplain untuk order ini.
                      </p>
                    )}

                    {!activeDispute && order.status !== 'CANCELLED' && (
                      <details style={{ marginTop: 12 }}>
                        <summary className="btn btn-ghost btn-sm">
                          Ajukan komplain baru
                        </summary>

                        <form
                          onSubmit={handleDispute}
                          style={{ marginTop: 14 }}
                        >
                          <div className="field">
                            <label>Jenis masalah</label>

                            <select name="category" defaultValue="QUALITY">
                              {Object.entries(DISPUTE_CAT).map(
                                ([key, label]) => (
                                  <option key={key} value={key}>
                                    {label}
                                  </option>
                                )
                              )}
                            </select>
                          </div>

                          <div className="field">
                            <label>Ceritakan masalahnya</label>

                            <textarea
                              name="description"
                              required
                              minLength={10}
                              maxLength={1500}
                              placeholder="Jelaskan masalah yang dialami..."
                            />
                          </div>

                          <button className="btn btn-primary" type="submit">
                            Kirim komplain
                          </button>
                        </form>
                      </details>
                    )}

                    {actionError && (
                      <p role="status" style={{ marginTop: 12 }}>
                        {actionError}
                      </p>
                    )}
                  </div>
                </div>

                <div
                  className="card card-pad"
                  style={{ position: 'sticky', top: 84, alignSelf: 'start' }}
                >
                  <h3>Rincian &amp; pembayaran</h3>

                  {orderItems.length > 0 ? (
                    orderItems.map((item, index) => (
                      <div className="sum-row" key={index}>
                        <span>
                          {item.qty}× {item.service_name}

                          {item.shoe && (
                            <span className="muted small">
                              <br />{item.shoe}
                            </span>
                          )}
                        </span>

                        <span className="nowrap">
                          {formatRupiah(item.price * item.qty)}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="muted small">
                      Rincian layanan akan diisi setelah sepatu diperiksa.
                    </p>
                  )}

                  {order.discount > 0 && (
                    <div className="sum-row">
                      <span>Diskon</span>
                      <span>-{formatRupiah(order.discount)}</span>
                    </div>
                  )}

                  {order.delivery_fee > 0 && (
                    <div className="sum-row">
                      <span>Ongkir</span>
                      <span>{formatRupiah(order.delivery_fee)}</span>
                    </div>
                  )}

                  <div className="sum-row total">
                    <strong>Total</strong>
                    <strong>{formatRupiah(order.total)}</strong>
                  </div>

                  <div className="sum-row">
                    <span>Sudah dibayar</span>
                    <span>{formatRupiah(order.paid)}</span>
                  </div>

                  {order.refunded > 0 && (
                    <div className="sum-row">
                      <span>Dikembalikan</span>
                      <span>{formatRupiah(order.refunded)}</span>
                    </div>
                  )}

                  <div className="sum-row">
                    <strong>Sisa tagihan</strong>
                    <strong>{formatRupiah(order.outstanding)}</strong>
                  </div>

                  <div style={{ margin: '10px 0 16px' }}>
                    <span className={`badge ${paymentInfo[1]}`}>
                      {paymentInfo[0]}
                    </span>
                  </div>

                  {canPay && (
                    <>
                      <button
                        className="btn btn-primary btn-block"
                        onClick={handlePayQris}
                      >
                        Bayar {formatRupiah(order.outstanding)} via QRIS
                      </button>

                      <p className="small muted" style={{ marginTop: 8 }}>
                        Atau bayar tunai di toko atau saat sepatu diantar.
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      <footer id="site-foot">
        <div className="wrap">
          <div className="copy">
            © {new Date().getFullYear()} Sepatu Kinclong.
            {' '}Semua hak dilindungi.
          </div>
        </div>
      </footer>

      {qrisPayment && (
        <div
          className="qris-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeQris()
          }}
        >
          <section
            className="qris-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="qris-title"
          >
            <div className="qris-header">
              <h2 id="qris-title">Bayar dengan QRIS</h2>

              <button
                type="button"
                className="qris-close"
                onClick={closeQris}
                aria-label="Tutup"
              >
                ×
              </button>
            </div>

            <div className="qris-body">
              <div
                className="qris-svg"
                dangerouslySetInnerHTML={{
                  __html: qrisPayment.qr_svg,
                }}
              />

              <div className="qris-amount">
                {formatRupiah(qrisPayment.amount)}
              </div>

              <p className="small muted">
                Scan dengan aplikasi mobile banking atau e-wallet.
                Nominal pembayaran sudah terisi otomatis.
              </p>

              <p role="status">
                {qrisStatus}
              </p>

              {qrisStatus.startsWith('Menunggu') && (
                <strong className="mono">
                  {Math.floor(qrisRemaining / 60)}:
                  {String(qrisRemaining % 60).padStart(2, '0')}
                </strong>
              )}

              <p className="small muted">
                Ref: <span className="mono">{qrisPayment.ref}</span>
              </p>

              {qrisPayment.is_demo && (
                <div className="demo-note">
                  Mode demo: QRIS ini contoh dan tidak bisa menerima uang.
                  Pemilik toko perlu memasang QRIS asli di pengaturan.
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  )
}