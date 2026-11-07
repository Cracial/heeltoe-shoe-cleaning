
import { useEffect, useState } from 'react'
import { api, formatRupiah } from '../../services/api'

function getRemaining(expiresAt) {
  if (!expiresAt) return null

  const numeric = Number(expiresAt)
  const expiry = Number.isFinite(numeric)
    ? numeric
    : Date.parse(expiresAt)

  if (!Number.isFinite(expiry)) return null

  return Math.max(0, Math.ceil((expiry - Date.now()) / 1000))
}

function formatCountdown(seconds) {
  if (seconds === null) return '--:--'

  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export default function PaymentModal({
  order,
  initialPayment = null,
  onClose,
  onUpdated,
}) {
  const [method, setMethod] = useState('CASH')
  const [amount, setAmount] = useState(String(order.outstanding))
  const [cashReceived, setCashReceived] = useState(
    String(order.outstanding)
  )

  const [payment, setPayment] = useState(initialPayment)
  const [paymentStatus, setPaymentStatus] = useState('PENDING')
  const [remaining, setRemaining] = useState(
    getRemaining(initialPayment?.expires_at)
  )

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const numericAmount = Number(amount) || 0
  const numericCash = Number(cashReceived) || 0

  const change = Math.max(0, numericCash - numericAmount)

  // Perbarui hitung mundur dan periksa status QRIS dari backend.

    useEffect(() => {
    if (!payment?.id || payment.status !== 'PENDING') return

    let active = true
    let poll
    let countdown

    async function checkPayment() {
        try {
        const result = await api(`/api/payments/${payment.id}`)

        if (!active) return

        setPaymentStatus(result.status)

        if (result.status === 'PAID') {
            clearInterval(poll)
            clearInterval(countdown)
            await onUpdated?.()
        } else if (result.status !== 'PENDING') {
            clearInterval(poll)
            clearInterval(countdown)

            setError(
            result.status === 'EXPIRED'
                ? 'QRIS sudah kedaluwarsa.'
                : 'Pembayaran QRIS tidak lagi aktif.'
            )
        }
        } catch (err) {
        if (active) setError(err.message)
        }
    }

    poll = setInterval(checkPayment, 5000)

    countdown = setInterval(() => {
        if (active) {
        setRemaining(getRemaining(payment.expires_at))
        }
    }, 1000)

    checkPayment()

    return () => {
        active = false
        clearInterval(poll)
        clearInterval(countdown)
    }
    }, [
    payment?.id,
    payment?.status,
    payment?.expires_at,
    onUpdated,
    ])

  async function handleSubmit(event) {
    event.preventDefault()

    setError('')

    if (!Number.isInteger(numericAmount) ||
        numericAmount < 1 ||
        numericAmount > Number(order.outstanding)) {
      setError('Nominal pembayaran tidak valid.')
      return
    }

    if (method === 'CASH' && numericCash < numericAmount) {
      setError('Uang yang diterima tidak boleh kurang dari nominal pembayaran.')
      return
    }

    setLoading(true)

    try {
      const body = {
        method,
        amount: numericAmount,
      }

      if (method === 'CASH') {
        body.cash_received = numericCash
      }

      const result = await api(
        `/api/orders/${order.id}/payments`,
        {
          method: 'POST',
          body,
        }
      )

      if (method === 'CASH') {
        await onUpdated?.(result.order)
        onClose()
        return
      }

      setPayment(result.payment)
      setPaymentStatus(result.payment.status)
      setRemaining(getRemaining(result.payment.expires_at))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function confirmPayment() {
    if (!payment?.id) return

    if (
      !window.confirm(
        'Pastikan pembayaran QRIS benar-benar sudah masuk ke rekening/merchant sebelum mengonfirmasi.'
      )
    ) {
      return
    }

    setLoading(true)
    setError('')

    try {
      await api(`/api/payments/${payment.id}/confirm`, {
        method: 'POST',
      })

      setPaymentStatus('PAID')

      await onUpdated?.()

      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function cancelPayment() {
    if (!payment?.id) return

    if (!window.confirm('Batalkan QRIS ini?')) return

    setLoading(true)
    setError('')

    try {
      await api(`/api/payments/${payment.id}/cancel`, {
        method: 'POST',
      })

      setPaymentStatus('CANCELLED')

      await onUpdated?.()

      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function handleAmountChange(value) {
    setAmount(value)

    if (Number(cashReceived) < Number(value)) {
      setCashReceived(value)
    }
  }

  function setCashPreset(value) {
    setCashReceived(String(value || numericAmount))
  }

  return (
    <div
      className="payment-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !loading) {
          onClose()
        }
      }}
    >
      <section
        className="payment-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-title"
      >
        <div className="payment-header">
          <h2 id="payment-title">
            Pembayaran {order.code}
          </h2>

          <button
            type="button"
            className="payment-close"
            onClick={onClose}
            disabled={loading}
            aria-label="Tutup"
          >
            ×
          </button>
        </div>

        <div className="payment-body">
          {!payment ? (
            <>
              <div className="payment-total center">
                <div className="muted small">Sisa tagihan</div>

                <div className="payment-amount">
                  {formatRupiah(order.outstanding)}
                </div>
              </div>

              <div className="payment-methods">
                <button
                  type="button"
                  className={method === 'CASH' ? 'on' : ''}
                  onClick={() => setMethod('CASH')}
                >
                  Tunai
                </button>

                <button
                  type="button"
                  className={method === 'QRIS' ? 'on' : ''}
                  onClick={() => setMethod('QRIS')}
                >
                  QRIS
                </button>
              </div>

              <form onSubmit={handleSubmit}>
                <div className="field">
                  <label>Nominal dibayar</label>

                  <input
                    type="number"
                    min="1"
                    max={order.outstanding}
                    step="1"
                    value={amount}
                    onChange={(event) =>
                      handleAmountChange(event.target.value)
                    }
                    required
                  />

                  <div className="hint">
                    Masukkan nominal lebih kecil dari tagihan
                    untuk DP atau pembayaran sebagian.
                  </div>
                </div>

                {method === 'CASH' && (
                  <>
                    <div className="field">
                      <label>Uang diterima</label>

                      <input
                        type="number"
                        min={numericAmount || 1}
                        value={cashReceived}
                        onChange={(event) =>
                          setCashReceived(event.target.value)
                        }
                        required
                      />
                    </div>

                    <div className="cash-presets">
                      {[numericAmount, 20000, 50000, 100000, 200000]
                        .filter((value, index, list) =>
                          value >= numericAmount &&
                          list.indexOf(value) === index
                        )
                        .map((value) => (
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            key={value}
                            onClick={() => setCashPreset(value)}
                          >
                            {value === numericAmount
                              ? 'Uang pas'
                              : formatRupiah(value)}
                          </button>
                        ))}
                    </div>

                    <div className="summary-box">
                      <div className="sum-row total">
                        <span>Kembalian</span>
                        <strong>{formatRupiah(change)}</strong>
                      </div>
                    </div>
                  </>
                )}

                {error && (
                  <p className="payment-error" role="alert">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  className="btn btn-primary btn-lg btn-block"
                  style={{ marginTop: 16 }}
                  disabled={loading}
                >
                  {loading
                    ? 'Memproses...'
                    : method === 'CASH'
                      ? 'Simpan pembayaran tunai'
                      : 'Buat QRIS'}
                </button>
              </form>
            </>
          ) : (
            <div className="center">
              {payment.qr_svg && paymentStatus === 'PENDING' && (
                <div
                  className="payment-qr"
                  dangerouslySetInnerHTML={{
                    __html: payment.qr_svg,
                  }}
                />
              )}

              <div className="payment-amount">
                {formatRupiah(payment.amount)}
              </div>

              <p className="small muted">
                Scan QR menggunakan aplikasi mobile banking
                atau e-wallet pelanggan.
              </p>

              <p>
                Referensi: <span className="mono">{payment.ref}</span>
              </p>

              {payment.is_demo && (
                <div className="alert-box warn">
                  QRIS DEMO. QR ini bukan sarana penerimaan uang sungguhan.
                </div>
              )}

              {paymentStatus === 'PENDING' ? (
                <>
                  <p className="payment-waiting">
                    Menunggu pembayaran...
                  </p>

                  <h3 className="mono">
                    {formatCountdown(remaining)}
                  </h3>

                  <div className="alert-box info">
                    Konfirmasi hanya setelah dana benar-benar
                    diterima di akun merchant.
                  </div>

                  {error && (
                    <p className="payment-error" role="alert">
                      {error}
                    </p>
                  )}

                  <button
                    type="button"
                    className="btn btn-primary btn-block"
                    onClick={confirmPayment}
                    disabled={loading || payment.is_demo}
                  >
                    {loading
                      ? 'Memproses...'
                      : 'Konfirmasi diterima'}
                  </button>

                  <button
                    type="button"
                    className="btn btn-danger btn-block"
                    style={{ marginTop: 8 }}
                    onClick={cancelPayment}
                    disabled={loading}
                  >
                    Batalkan QRIS
                  </button>
                </>
              ) : (
                <>
                  <div
                    className={`badge ${paymentStatus === 'PAID' ? 'b-ok' : 'b-danger'}`}
                    style={{ margin: '12px 0' }}
                  >
                    {paymentStatus === 'PAID'
                      ? 'Pembayaran berhasil'
                      : paymentStatus}
                  </div>

                  <button
                    className="btn btn-primary btn-block"
                    onClick={async () => {
                      await onUpdated?.()
                      onClose()
                    }}
                  >
                    Selesai
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
