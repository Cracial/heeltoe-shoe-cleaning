
import { useCallback, useEffect, useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router-dom'

import { api, formatRupiah } from '../../services/api'
import '../../styles/dispute.css'

const STATUS = {
  OPEN: { label: 'Terbuka', className: 'b-danger' },
  INVESTIGATING: { label: 'Sedang ditangani', className: 'b-sun' },
  RESOLVED: { label: 'Selesai', className: 'b-ok' },
  REJECTED: { label: 'Ditolak', className: 'b-info' },
}

const RESOLUTIONS = {
  REWASH: 'Cuci ulang gratis',
  REFUND: 'Refund',
  COMPENSATION: 'Kompensasi',
  NONE: 'Tanpa tindakan',
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

function whatsappUrl(phone, message) {
  let number = String(phone || '').replace(/\D/g, '')

  if (number.startsWith('0')) {
    number = `62${number.slice(1)}`
  } else if (number.startsWith('8')) {
    number = `62${number}`
  }

  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`
}

export default function DisputeDetailPage() {
  const { id } = useParams()
  const { setNotice } = useOutletContext()

  const [dispute, setDispute] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')
  const [actionError, setActionError] = useState('')

  const [reply, setReply] = useState('')
  const [decision, setDecision] = useState('RESOLVED')
  const [resolution, setResolution] = useState('REWASH')
  const [refundAmount, setRefundAmount] = useState('')
  const [decisionNote, setDecisionNote] = useState('')

  const [sendingReply, setSendingReply] = useState(false)
  const [savingDecision, setSavingDecision] = useState(false)

  const loadDispute = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true)

    setPageError('')

    try {
      const result = await api(`/api/disputes/${id}`)
      setDispute(result)
    } catch (err) {
      setPageError(err.message || 'Gagal memuat detail dispute.')
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [id])

  useEffect(() => {
    loadDispute(true)
  }, [loadDispute])

  async function submitReply(event) {
    event.preventDefault()

    const message = reply.trim()

    if (!message) {
      setActionError('Pesan balasan wajib diisi.')
      return
    }

    setSendingReply(true)
    setActionError('')

    try {
      await api(`/api/disputes/${id}/messages`, {
        method: 'POST',
        body: { message },
      })

      setReply('')
      await loadDispute()

      if (typeof setNotice === 'function') {
        setNotice('Balasan berhasil dikirim kepada pelanggan.')
      }
    } catch (err) {
      setActionError(err.message || 'Gagal mengirim balasan.')
    } finally {
      setSendingReply(false)
    }
  }

  async function submitDecision(event) {
    event.preventDefault()

    const note = decisionNote.trim()

    if (!note) {
      setActionError('Catatan keputusan wajib diisi.')
      return
    }

    const body = {
      status: decision,
      note,
    }

    if (decision === 'RESOLVED') {
      body.resolution = resolution

      if (['REFUND', 'COMPENSATION'].includes(resolution)) {
        const amount = Number(refundAmount)

        if (!Number.isInteger(amount) || amount < 1) {
          setActionError('Nominal harus berupa bilangan bulat lebih dari 0.')
          return
        }

        if (resolution === 'REFUND' && amount > refundable) {
          setActionError(
            `Maksimal refund yang tersedia adalah ${formatRupiah(refundable)}.`
          )
          return
        }

        body.refund_amount = amount
      }
    }

    setSavingDecision(true)
    setActionError('')

    try {
      await api(`/api/disputes/${id}/resolve`, {
        method: 'POST',
        body,
      })

      await loadDispute()

      if (typeof setNotice === 'function') {
        setNotice(
          decision === 'INVESTIGATING'
            ? 'Dispute ditandai sedang ditangani.'
            : 'Keputusan dispute berhasil disimpan.'
        )
      }
    } catch (err) {
      setActionError(err.message || 'Gagal menyimpan keputusan.')
    } finally {
      setSavingDecision(false)
    }
  }

  if (loading) {
    return (
      <div className="dispute-state">
        <span className="spinner" />
        <p>Memuat detail dispute...</p>
      </div>
    )
  }

  if (pageError || !dispute) {
    return (
      <div className="dispute-state dispute-error" role="alert">
        <p>{pageError || 'Dispute tidak ditemukan.'}</p>
        <Link to="/app/dispute" className="btn btn-primary">
          Kembali ke dispute
        </Link>
      </div>
    )
  }

  const order = dispute.order || {}
  const messages = Array.isArray(dispute.messages)
    ? dispute.messages
    : []

  const isOpen = ['OPEN', 'INVESTIGATING'].includes(dispute.status)
  const status = STATUS[dispute.status] || {
    label: dispute.status,
    className: 'plain',
  }

  const refundable = Math.max(
    0,
    Number(order.paid || 0) - Number(order.refunded || 0)
  )

  const orderItems = Array.isArray(order.items) ? order.items : []

  const resolutionLabel =
    RESOLUTIONS[dispute.resolution] || 'Tanpa tindakan'

  const whatsAppMessage =
    `Halo ${dispute.customer_name}, terkait komplain ${dispute.code} ` +
    `untuk order ${dispute.order_code}: `

  return (
    <div className="dispute-page">
      <div className="dispute-detail-heading">
        <div>
          <Link to="/app/dispute" className="small dispute-back-link">
            ← Semua dispute
          </Link>

          <h1 className="mono">{dispute.code}</h1>

          <div className="dispute-heading-badges">
            <span className={`badge ${status.className}`}>
              {status.label}
            </span>

            <span className="badge plain">
              {dispute.category_label || dispute.category}
            </span>

            <span className="badge plain">
              {dispute.source === 'CUSTOMER'
                ? 'Dari pelanggan'
                : 'Dicatat staf'}
            </span>
          </div>
        </div>

        <a
          className="btn btn-ghost"
          href={whatsappUrl(dispute.customer_phone, whatsAppMessage)}
          target="_blank"
          rel="noopener noreferrer"
        >
          WhatsApp pelanggan
        </a>
      </div>

      <div className="dispute-detail-grid">
        <section className="card dispute-conversation-card">
          <div className="dispute-card-heading">
            <div>
              <h2>Percakapan</h2>
              <p className="small muted">
                Riwayat komunikasi pelanggan dan staf.
              </p>
            </div>

            <span className="badge plain">
              {messages.length} pesan
            </span>
          </div>

          <div className="dispute-thread">
            {messages.map((message) => {
              const author = String(
                message.author_type || 'SYSTEM'
              ).toLowerCase()

              return (
                <article
                  className={`dispute-message dispute-message-${author}`}
                  key={message.id}
                >
                  <div className="dispute-message-meta">
                    <strong>{message.author_name || 'Pengirim'}</strong>
                    <span>{formatDate(message.created_at)}</span>
                  </div>

                  <div className="dispute-message-content">
                    {message.message}
                  </div>
                </article>
              )
            })}
          </div>

          {isOpen && (
            <form className="dispute-reply-form" onSubmit={submitReply}>
              <label className="field">
                <span>Balas pelanggan</span>
                <textarea
                  name="message"
                  rows={4}
                  maxLength={1500}
                  required
                  placeholder="Tulis balasan yang akan terlihat di halaman lacak order..."
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                />
              </label>

              <div className="dispute-form-footer">
                <span className="small muted">
                  {reply.length}/1500 karakter
                </span>

                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={sendingReply || !reply.trim()}
                >
                  {sendingReply ? 'Mengirim...' : 'Kirim balasan'}
                </button>
              </div>
            </form>
          )}
        </section>

        <div className="dispute-side-column">
          <section className="card dispute-side-card">
            <div className="dispute-card-heading">
              <h2>Order terkait</h2>
            </div>

            <div className="dispute-order-body">
              <Link
                to={`/app/order/${order.id}`}
                className="dispute-order-code mono"
              >
                {dispute.order_code}
              </Link>

              <div className="small muted">
                {dispute.customer_name} · {order.customer_phone || '-'}
              </div>

              {orderItems.length > 0 && (
                <div className="dispute-order-items">
                  {orderItems.map((item) => (
                    <div key={item.id}>
                      {item.qty}× {item.service_name}
                      {item.shoe ? ` (${item.shoe})` : ''}
                    </div>
                  ))}
                </div>
              )}

              {orderItems.some((item) => item.condition_note) && (
                <div className="dispute-condition-note">
                  <strong>Kondisi awal:</strong>
                  <p>
                    {orderItems
                      .filter((item) => item.condition_note)
                      .map((item) => item.condition_note)
                      .join('; ')}
                  </p>
                </div>
              )}

              <div className="dispute-money-summary">
                <div>
                  <span>Total order</span>
                  <strong>{formatRupiah(order.total)}</strong>
                </div>

                <div>
                  <span>Sudah dibayar</span>
                  <strong>{formatRupiah(order.paid)}</strong>
                </div>

                <div>
                  <span>Sudah direfund</span>
                  <strong>{formatRupiah(order.refunded)}</strong>
                </div>

                <div>
                  <span>Sisa yang dapat direfund</span>
                  <strong>{formatRupiah(refundable)}</strong>
                </div>
              </div>
            </div>
          </section>

          {isOpen ? (
            <section className="card dispute-side-card">
              <div className="dispute-card-heading">
                <div>
                  <h2>Keputusan</h2>
                  <p className="small muted">
                    Tentukan tindak lanjut komplain.
                  </p>
                </div>
              </div>

              <form
                className="dispute-decision-form"
                onSubmit={submitDecision}
              >
                <label className="field">
                  <span>Status keputusan</span>
                  <select
                    name="status"
                    value={decision}
                    onChange={(event) => setDecision(event.target.value)}
                  >
                    <option value="RESOLVED">Selesaikan</option>
                    <option value="INVESTIGATING">Sedang ditangani</option>
                    <option value="REJECTED">Tolak komplain</option>
                  </select>
                </label>

                {decision === 'RESOLVED' && (
                  <>
                    <label className="field">
                      <span>Bentuk penyelesaian</span>
                      <select
                        name="resolution"
                        value={resolution}
                        onChange={(event) => setResolution(event.target.value)}
                      >
                        <option value="REWASH">Cuci ulang gratis</option>
                        <option value="REFUND">
                          Refund (maks. {formatRupiah(refundable)})
                        </option>
                        <option value="COMPENSATION">
                          Kompensasi / ganti rugi
                        </option>
                        <option value="NONE">
                          Tanpa tindakan (klarifikasi)
                        </option>
                      </select>
                    </label>

                    {['REFUND', 'COMPENSATION'].includes(resolution) && (
                      <label className="field">
                        <span>
                          {resolution === 'REFUND'
                            ? 'Nominal refund (Rp)'
                            : 'Nominal kompensasi (Rp)'}
                        </span>

                        <input
                          name="refund_amount"
                          type="number"
                          min="1"
                          max={
                            resolution === 'REFUND'
                              ? refundable
                              : undefined
                          }
                          step="1"
                          required
                          value={refundAmount}
                          onChange={(event) =>
                            setRefundAmount(event.target.value)
                          }
                        />

                        {resolution === 'REFUND' && (
                          <small className="muted">
                            Maksimal refund: {formatRupiah(refundable)}.
                            Kompensasi tidak dibatasi nilai pembayaran order.
                          </small>
                        )}
                      </label>
                    )}
                  </>
                )}

                <label className="field">
                  <span>Catatan untuk pelanggan</span>
                  <textarea
                    name="note"
                    rows={4}
                    maxLength={1000}
                    required
                    value={decisionNote}
                    onChange={(event) => setDecisionNote(event.target.value)}
                    placeholder="Jelaskan hasil pemeriksaan atau alasan keputusan..."
                  />
                </label>

                <button
                  type="submit"
                  className="btn btn-primary btn-block"
                  disabled={
                    savingDecision ||
                    sendingReply ||
                    !decisionNote.trim()
                  }
                >
                  {savingDecision ? 'Menyimpan...' : 'Simpan keputusan'}
                </button>
              </form>
            </section>
          ) : (
            <section className="card dispute-side-card">
              <div className="dispute-card-heading">
                <h2>Hasil penyelesaian</h2>
              </div>

              <div className="dispute-resolution-result">
                <span className={`badge ${status.className}`}>
                  {status.label}
                </span>

                <h3>
                  {dispute.status === 'REJECTED'
                    ? 'Komplain ditolak'
                    : resolutionLabel}
                </h3>

                {Number(dispute.refund_amount) > 0 && (
                  <strong className="dispute-result-amount">
                    {formatRupiah(dispute.refund_amount)}
                  </strong>
                )}

                <p className="small muted">
                  Ditutup {formatDate(dispute.resolved_at)}
                </p>

                <p className="small muted">
                  Ditangani oleh {dispute.handler_name || '-'}
                </p>
              </div>
            </section>
          )}
        </div>
      </div>

      {actionError && (
        <div className="dispute-floating-error" role="alert">
          {actionError}
          <button
            type="button"
            aria-label="Tutup pesan error"
            onClick={() => setActionError('')}
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}
