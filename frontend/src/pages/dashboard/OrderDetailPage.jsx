
import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Link,
  useNavigate,
  useParams,
  useOutletContext,
} from 'react-router-dom'

import { api, formatRupiah } from '../../services/api'
import PaymentModal from '../../components/orders/PaymentModal'

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

const STATUS_ROLES = {
  RECEIVED: ['frontoffice'],
  WASHING: ['backoffice', 'frontoffice'],
  QC: ['backoffice', 'frontoffice'],
  READY: ['backoffice', 'frontoffice'],
  PICKED_UP: ['frontoffice'],
  CANCELLED: ['frontoffice'],
}

const STATUS_ACTION_LABEL = (from, to) => ({
  RECEIVED: 'Terima di toko',
  WASHING: from === 'QC' ? 'Cuci ulang' : 'Mulai cuci',
  QC: 'Kirim ke QC',
  READY: 'Lolos QC — siap',
  PICKED_UP: 'Serahkan ke pelanggan',
  CANCELLED: 'Batalkan order',
}[to] || to)

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

function formatPhone(phone) {
  return phone ? String(phone).replace(/^62/, '0') : '-'
}

function whatsappUrl(phone, message) {
  let digits = String(phone || '').replace(/\D/g, '')

  if (digits.startsWith('0')) {
    digits = '62' + digits.slice(1)
  } else if (digits.startsWith('8')) {
    digits = '62' + digits
  }

  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}

function Badge({ status }) {
  return (
    <span className={`badge ${STATUS_BADGE[status] || ''}`}>
      {STATUS_LABEL[status] || status}
    </span>
  )
}

    function PaymentBadge({ order }) {
        const status =
            order.payment_status ||
            (order.paid <= 0
            ? 'UNPAID'
            : order.paid < order.total
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

function EditItemsModal({ order, onClose, onSaved }) {
  const [services, setServices] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [discount, setDiscount] = useState(order.discount || 0)
  const [deliveryFee, setDeliveryFee] = useState(order.delivery_fee || 0)
  const [returnMethod, setReturnMethod] = useState(
    order.return_method || 'STORE'
  )
  const [address, setAddress] = useState(
    order.address || order.customer_address || ''
  )

  useEffect(() => {
    let active = true

    async function loadServices() {
      try {
        const result = await api('/api/services')

        if (!active) return

        const available = result.filter(
          (service) =>
            service.active ||
            order.items.some((item) => item.service_id === service.id)
        )

        setServices(available)

        const initial = order.items.length
          ? order.items.map((item) => ({
              service_id: item.service_id,
              shoe: item.shoe || '',
              qty: item.qty,
              condition_note: item.condition_note || '',
            }))
          : [
              {
                service_id: available[0]?.id || '',
                shoe: '',
                qty: 1,
                condition_note: '',
              },
            ]

        setItems(initial)
      } catch (err) {
        setError(err.message)
      } finally {
        if (active) setLoading(false)
      }
    }

    loadServices()

    return () => {
      active = false
    }
  }, [order])

  function updateItem(index, field, value) {
    setItems((previous) =>
      previous.map((item, itemIndex) =>
        itemIndex === index
          ? { ...item, [field]: value }
          : item
      )
    )
  }

  function addItem() {
    setItems((previous) => [
      ...previous,
      {
        service_id: services[0]?.id || '',
        shoe: '',
        qty: 1,
        condition_note: '',
      },
    ])
  }

  function removeItem(index) {
    setItems((previous) =>
      previous.filter((_, itemIndex) => itemIndex !== index)
    )
  }

  async function saveItems(event) {
    event.preventDefault()
    setError('')

    if (!items.length) {
      setError('Order harus memiliki minimal satu item.')
      return
    }

    if (
      returnMethod === 'DELIVERY' &&
      !address.trim()
    ) {
      setError('Alamat pengantaran wajib diisi.')
      return
    }

    if (items.some((item) => (
      !item.service_id ||
      !Number.isInteger(Number(item.qty)) ||
      Number(item.qty) < 1
    ))) {
      setError('Periksa kembali layanan dan jumlah pasang.')
      return
    }

    setSaving(true)

    try {
      const updated = await api(`/api/orders/${order.id}`, {
        method: 'PUT',
        body: {
          discount: Number(discount) || 0,
          delivery_fee: Number(deliveryFee) || 0,
          return_method: returnMethod,
          address: returnMethod === 'DELIVERY' ? address.trim() : null,
          items: items.map((item) => ({
            ...item,
            service_id: Number(item.service_id),
            qty: Number(item.qty),
          })),
        },
      })

      await onSaved(updated)
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="payment-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose()
      }}
    >
      <section
        className="payment-dialog edit-order-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-order-title"
      >
        <div className="payment-header">
          <h2 id="edit-order-title">Ubah item {order.code}</h2>

          <button
            className="payment-close"
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Tutup"
          >
            ×
          </button>
        </div>

        <div className="payment-body">
          {loading ? (
            <p>Memuat layanan...</p>
          ) : (
            <form onSubmit={saveItems}>
              {items.map((item, index) => (
                <div className="item-row" key={index}>
                  <div className="field">
                    <label>Layanan</label>

                    <select
                      value={item.service_id}
                      onChange={(event) =>
                        updateItem(index, 'service_id', event.target.value)
                      }
                      required
                    >
                      {services.map((service) => (
                        <option key={service.id} value={service.id}>
                          {service.name} — {formatRupiah(service.price)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label>Sepatu</label>

                    <input
                      value={item.shoe}
                      onChange={(event) =>
                        updateItem(index, 'shoe', event.target.value)
                      }
                    />
                  </div>

                  <div className="field">
                    <label>Pasang</label>

                    <input
                      type="number"
                      min="1"
                      max="50"
                      value={item.qty}
                      onChange={(event) =>
                        updateItem(index, 'qty', event.target.value)
                      }
                      required
                    />
                  </div>

                  <div className="field">
                    <label>Kondisi awal</label>

                    <input
                      value={item.condition_note}
                      onChange={(event) =>
                        updateItem(index, 'condition_note', event.target.value)
                      }
                    />
                  </div>

                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={items.length === 1}
                    onClick={() => removeItem(index)}
                  >
                    Hapus
                  </button>
                </div>
              ))}

              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={addItem}
                disabled={!services.length}
              >
                + Tambah pasang
              </button>

              <div className="field-row" style={{ marginTop: 18 }}>
                <div className="field">
                  <label>Diskon</label>
                  <input
                    type="number"
                    min="0"
                    value={discount}
                    onChange={(event) => setDiscount(event.target.value)}
                  />
                </div>

                <div className="field">
                  <label>Ongkir</label>
                  <input
                    type="number"
                    min="0"
                    value={deliveryFee}
                    onChange={(event) => setDeliveryFee(event.target.value)}
                  />
                </div>

                <div className="field">
                  <label>Pengembalian</label>

                  <select
                    value={returnMethod}
                    onChange={(event) => setReturnMethod(event.target.value)}
                  >
                    <option value="STORE">Ambil di toko</option>
                    <option value="DELIVERY">Antar</option>
                  </select>
                </div>
              </div>

              <div className="field">
                <label>Alamat antar</label>
                <input
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  maxLength={300}
                  disabled={returnMethod !== 'DELIVERY'}
                  required={returnMethod === 'DELIVERY'}
                />
              </div>

              {error && (
                <p className="payment-error" role="alert">
                  {error}
                </p>
              )}

              <button
                type="submit"
                className="btn btn-primary btn-block"
                disabled={saving}
              >
                {saving ? 'Menyimpan...' : 'Simpan perubahan'}
              </button>
            </form>
          )}
        </div>
      </section>
    </div>
  )
}

export default function OrderDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, info } = useOutletContext()

  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')

  const [paymentOpen, setPaymentOpen] = useState(false)
  const [initialPayment, setInitialPayment] = useState(null)
  const [editOpen, setEditOpen] = useState(false)
  const [statusLoading, setStatusLoading] = useState(false)

  // Form pembuatan dispute
  const [disputeFormOpen, setDisputeFormOpen] = useState(false)
  const [disputeCategory, setDisputeCategory] = useState('QUALITY')
  const [disputeDescription, setDisputeDescription] = useState('')
  const [disputeSaving, setDisputeSaving] = useState(false)

  const refreshOrder = useCallback(async () => {
    const latest = await api(`/api/orders/${id}`)
        setOrder(latest)
        return latest
        }, [id])

  useEffect(() => {
    let active = true

    async function loadOrder() {
      setLoading(true)
      setError('')

      try {
        const result = await api(`/api/orders/${id}`)

        if (active) setOrder(result)
      } catch (err) {
        if (active) {
          if (err.status === 401) {
            navigate('/login', { replace: true })
          } else {
            setError(err.message)
          }
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    loadOrder()

    return () => {
      active = false
    }
  }, [id, navigate])

  useEffect(() => {
    setOrder(null)
    setPaymentOpen(false)
    setInitialPayment(null)
    setEditOpen(false)
  }, [id])


async function createDispute(event) {
  event.preventDefault()

  const description = disputeDescription.trim()

  if (description.length < 5) {
    setActionError('Deskripsi komplain minimal 5 karakter.')
    return
  }

  if (description.length > 1500) {
    setActionError('Deskripsi komplain maksimal 1500 karakter.')
    return
  }

  setDisputeSaving(true)
  setActionError('')

  try {
    const result = await api('/api/disputes', {
      method: 'POST',
      body: {
        order_id: order.id,
        category: disputeCategory,
        description,
      },
    })

    await refreshOrder()

    setDisputeFormOpen(false)
    setDisputeDescription('')
    setDisputeCategory('QUALITY')

    navigate(`/app/dispute/${result.id}`)
  } catch (err) {
    setActionError(err.message || 'Gagal membuat komplain.')
  } finally {
    setDisputeSaving(false)
  }
}

  async function changeStatus(nextStatus) {
    let note = ''

    if (
      nextStatus === 'CANCELLED' ||
      (nextStatus === 'WASHING' && order.status === 'QC')
    ) {
      const question =
        nextStatus === 'CANCELLED'
          ? 'Masukkan alasan pembatalan:'
          : 'Masukkan catatan QC (bagian yang belum bersih):'

      note = window.prompt(question)

      if (note === null) return

      if (!note.trim()) {
        setActionError('Catatan atau alasan wajib diisi.')
        return
      }

      if (
        nextStatus === 'CANCELLED' &&
        !window.confirm(
          `Batalkan order ${order.code}? Dana yang sudah dibayar akan dicatat sebagai refund sesuai aturan backend.`
        )
      ) {
        return
      }
    }

    setStatusLoading(true)
    setActionError('')

    try {
      await api(`/api/orders/${order.id}/status`, {
        method: 'POST',
        body: {
          status: nextStatus,
          note,
        },
      })

      await refreshOrder()
    } catch (err) {
      if (err.data?.shortages?.length) {
        const details = err.data.shortages
          .map((item) =>
            `${item.name}: butuh ${item.need} ${item.unit}, tersedia ${item.available}`
          )
          .join('\n')

        setActionError(
          `Stok bahan tidak mencukupi:\n${details}\nCatat barang masuk di Inventori sebelum mencoba lagi.`
        )
      } else {
        setActionError(err.message)
      }
    } finally {
      setStatusLoading(false)
    }
  }

  async function openPendingQris(paymentId) {
    setActionError('')

    try {
      const result = await api(`/api/payments/${paymentId}`)

      setInitialPayment(result)
      setPaymentOpen(true)
    } catch (err) {
      setActionError(err.message)
    }
  }

  function openPayment() {
    setInitialPayment(null)
    setPaymentOpen(true)
  }

  function printReceipt() {
    document.body.classList.add('printing')

    const cleanup = () => {
      document.body.classList.remove('printing')
      window.removeEventListener('afterprint', cleanup)
    }

    window.addEventListener('afterprint', cleanup)

    window.print()
  }

  if (loading) {
    return (
      <div className="empty">
        <span className="spinner" />
        <p>Memuat detail order...</p>
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="card card-pad">
        <h2>Detail order tidak dapat dibuka</h2>

        <p className="muted">
          {error || 'Order tidak ditemukan.'}
        </p>

        <Link to="/app/orders" className="btn btn-primary">
          Kembali ke daftar order
        </Link>
      </div>
    )
  }

  const items = order.items || []
  const payments = order.payments || []
  const materials = order.materials || []
  const logs = order.logs || []
  const deliveries = order.deliveries || []
  const disputes = order.disputes || []

  const isAdmin = user.role === 'admin'
  const canFrontOffice = isAdmin || user.role === 'frontoffice'

  const canManageDispute = [
    'admin',
    'frontoffice',
    'backoffice',
  ].includes(user.role)

  const editable =
    ['BOOKED', 'RECEIVED'].includes(order.status) &&
    canFrontOffice

  const canPay =
    order.outstanding > 0 &&
    order.status !== 'CANCELLED' &&
    items.length > 0 &&
    canFrontOffice

  const actions = (order.next_statuses || []).filter(
    (nextStatus) =>
      STATUS_ROLES[nextStatus] &&
      (
        isAdmin ||
        STATUS_ROLES[nextStatus].includes(user.role)
      )
  )

  const pendingQris = payments.filter(
    (payment) =>
      payment.method === 'QRIS' &&
      payment.status === 'PENDING'
  )

  const activeDeliveries = deliveries.filter(
    (delivery) =>
      ['PENDING', 'ASSIGNED', 'ON_THE_WAY', 'FAILED'].includes(
        delivery.status
      )
  )

  const activeDispute = disputes.some(
    (dispute) =>
      ['OPEN', 'INVESTIGATING'].includes(dispute.status)
  )

  const phoneDigits = String(order.customer_phone || '')
    .replace(/\D/g, '')
    .replace(/^0/, '62')

  const waText =
    `Halo ${order.customer_name}, order ${order.code} di ` +
    `${info?.business_name || 'Sepatu Kinclong'} saat ini: ` +
    `${order.status_label}. Total ${formatRupiah(order.total)}` +
    (order.outstanding > 0
      ? `, sisa tagihan ${formatRupiah(order.outstanding)}`
      : ' (lunas)') +
    `. Lacak: ${order.track_url || ''}`

  const phoneUrl = `https://wa.me/${phoneDigits}?text=${encodeURIComponent(waText)}`

  return (
    <>
      <div className="page-head order-detail-head">
        <div>
          <Link to="/app/orders" className="small">
            ← Semua order
          </Link>

          <h1 className="mono" style={{ marginTop: 8 }}>
            {order.code}
          </h1>

          <div className="order-badges">
            <Badge status={order.status} />

            <PaymentBadge order={order} />

            {order.source === 'WEB' && (
              <span className="badge b-sun plain">
                Booking web
              </span>
            )}
          </div>
        </div>

        <div className="actions">
          {actions.map((status) => (
            <button
              type="button"
              key={status}
              className={`btn ${
                status === 'CANCELLED'
                  ? 'btn-danger'
                  : status === 'WASHING' && order.status === 'QC'
                    ? 'btn-ghost'
                    : 'btn-primary'
              }`}
              disabled={statusLoading}
              onClick={() => changeStatus(status)}
            >
              {STATUS_ACTION_LABEL(order.status, status)}
            </button>
          ))}

          {canPay && (
            <button
              type="button"
              className="btn btn-sun"
              onClick={openPayment}
            >
              Terima pembayaran
            </button>
          )}
        </div>
      </div>

      {actionError && (
        <div className="alert-box warn order-action-error" role="alert">
          {actionError}
        </div>
      )}

      {pendingQris.length > 0 && canFrontOffice && (
        <div className="alert-box info">
          Ada QRIS sebesar{' '}
          <strong>{formatRupiah(pendingQris[0].amount)}</strong>{' '}
          yang menunggu pembayaran.

          {' '}

          <button
            className="btn btn-sm btn-primary"
            type="button"
            onClick={() => openPendingQris(pendingQris[0].id)}
          >
            Buka QR
          </button>
        </div>
      )}

      {order.status === 'BOOKED' && !items.length && (
        <div className="alert-box warn">
          Booking dari website. Item dan harga perlu diisi
          setelah sepatu dijemput atau diterima di toko.
        </div>
      )}

      <div className="grid g-main order-detail-grid">
        <div className="grid">
          <section className="card">
            <div className="card-head">
              <h3>Item pesanan</h3>

              {editable && (
                <button
                  className="btn btn-ghost btn-sm"
                  type="button"
                  onClick={() => setEditOpen(true)}
                >
                  Ubah item
                </button>
              )}
            </div>

            <div className="card-body">
              {items.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Layanan</th>
                        <th>Sepatu</th>
                        <th>Kondisi awal</th>
                        <th className="right">Subtotal</th>
                      </tr>
                    </thead>

                    <tbody>
                      {items.map((item, index) => (
                        <tr key={index}>
                          <td>
                            {item.qty}× {item.service_name}

                            <div className="small muted">
                              @ {formatRupiah(item.price)}
                            </div>
                          </td>

                          <td>{item.shoe || '—'}</td>
                          <td className="small">
                            {item.condition_note || '—'}
                          </td>

                          <td className="right nowrap">
                            {formatRupiah(item.qty * item.price)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted">Belum ada item.</p>
              )}

              <div className="summary-box" style={{ marginTop: 12 }}>
                <div className="sum-row">
                  <span>Subtotal</span>
                  <span>{formatRupiah(order.subtotal)}</span>
                </div>

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
                  <span>Dibayar</span>
                  <span>{formatRupiah(order.paid)}</span>
                </div>

                {order.refunded > 0 && (
                  <div className="sum-row">
                    <span>Refund</span>
                    <span>{formatRupiah(order.refunded)}</span>
                  </div>
                )}

                <div className="sum-row">
                  <strong>Sisa tagihan</strong>

                  <strong
                    style={{
                      color: order.outstanding
                        ? 'var(--danger)'
                        : 'var(--ok)',
                    }}
                  >
                    {formatRupiah(order.outstanding)}
                  </strong>
                </div>
              </div>
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h3>Pembayaran</h3>
              <PaymentBadge order={order} />
            </div>

            <div className="card-body">
              {payments.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Waktu</th>
                        <th>Metode</th>
                        <th className="right">Nominal</th>
                        <th>Status</th>
                        <th></th>
                      </tr>
                    </thead>

                    <tbody>
                      {payments.map((payment) => (
                        <tr key={payment.id}>
                          <td className="small">
                            {formatDate(payment.paid_at || payment.created_at)}

                            <div className="muted mono">
                              {payment.ref}
                            </div>
                          </td>

                          <td>
                            {payment.method}

                            {payment.cash_received > 0 && (
                              <div className="small muted">
                                Terima {formatRupiah(payment.cash_received)}
                                <br />
                                Kembali {formatRupiah(payment.change_amount)}
                              </div>
                            )}

                            {payment.note && (
                              <div className="small muted">
                                {payment.note}
                              </div>
                            )}
                          </td>

                          <td className="right nowrap">
                            {formatRupiah(payment.amount)}
                          </td>

                          <td>
                            <span
                              className={`badge ${
                                payment.status === 'PAID'
                                  ? 'b-ok'
                                  : payment.status === 'PENDING'
                                    ? 'b-warn'
                                    : ''
                              }`}
                            >
                              {payment.status}
                            </span>
                          </td>

                          <td className="right">
                            {payment.status === 'PENDING' &&
                              payment.method === 'QRIS' &&
                              canFrontOffice && (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-ghost"
                                  onClick={() =>
                                    openPendingQris(payment.id)
                                  }
                                >
                                  Buka QR
                                </button>
                              )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted small">
                  Belum ada pembayaran.
                </p>
              )}
            </div>
          </section>

          {materials.length > 0 && (
            <section className="card">
              <div className="card-head">
                <h3>Bahan terpakai (HPP LIFO)</h3>
                <strong>{formatRupiah(order.material_cost)}</strong>
              </div>

              <div className="card-body">
                {materials.map((material, index) => (
                  <div className="list-row" key={index}>
                    <span>{material.name}</span>

                    <span className="small">
                      {material.qty} {material.unit}
                      {' · '}
                      {formatRupiah(material.cost)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="card">
            <div className="card-head">
              <h3>Riwayat pesanan</h3>
            </div>

            <div className="card-body">
              {logs.length ? (
                <ul className="timeline">
                  {[...logs].reverse().map((log, index) => (
                    <li key={index}>
                      <strong>
                        {STATUS_LABEL[log.status] || log.status}
                      </strong>

                      <span className="small muted">
                        {' · '}{formatDate(log.created_at)}
                        {' · '}{log.user_name}
                      </span>

                      {log.note && (
                        <div className="small muted">{log.note}</div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted small">
                  Belum ada riwayat status.
                </p>
              )}
            </div>
          </section>
        </div>

        <div className="grid">
          <section className="card card-pad">
            <h3>Pelanggan</h3>

            <div style={{ fontWeight: 700 }}>
              {order.customer_name}
            </div>

            <div className="muted">
              {formatPhone(order.customer_phone)}
            </div>

            {order.customer_address && (
              <div className="small" style={{ marginTop: 6 }}>
                {order.customer_address}
              </div>
            )}

            <div className="small" style={{ marginTop: 10 }}>
              Pengembalian:{' '}
              <strong>
                {order.return_method === 'DELIVERY'
                  ? 'Diantar'
                  : 'Ambil di toko'}
              </strong>

              {order.address && order.return_method === 'DELIVERY' && (
                <div>{order.address}</div>
              )}
            </div>

            <div className="small">
              Estimasi selesai:{' '}
              <strong>{formatDate(order.due_date, false)}</strong>
            </div>

            {order.notes && (
              <div className="small" style={{ marginTop: 6 }}>
                Catatan: {order.notes}
              </div>
            )}

            <div className="order-customer-actions">
              {order.customer_phone && (
                <a
                  className="btn btn-sm btn-ghost"
                  href={phoneUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  WhatsApp
                </a>
              )}

              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={printReceipt}
              >
                Cetak nota
              </button>
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h3>Jemput / antar</h3>
            </div>

            <div className="card-body">
              {deliveries.length ? (
                deliveries.map((delivery) => (
                  <div className="list-row" key={delivery.id}>
                    <div>
                      <strong>
                        {delivery.type === 'PICKUP' ? 'Jemput' : 'Antar'}
                      </strong>

                      {delivery.courier_name && (
                        <span className="small muted">
                          {' · '}{delivery.courier_name}
                        </span>
                      )}

                      <div className="small muted">
                        {delivery.address}
                      </div>

                      {delivery.scheduled_at && (
                        <div className="small muted">
                          {formatDate(delivery.scheduled_at)}
                        </div>
                      )}

                      {delivery.proof_note && (
                        <div className="small">
                          "{delivery.proof_note}"
                        </div>
                      )}
                    </div>

                    <span
                      className={`badge ${
                        delivery.status === 'DONE'
                          ? 'b-ok'
                          : delivery.status === 'FAILED'
                            ? 'b-danger'
                            : delivery.status === 'CANCELLED'
                              ? ''
                              : 'b-info'
                      }`}
                    >
                      {delivery.status}
                    </span>
                  </div>
                ))
              ) : (
                <p className="muted small">
                  Belum ada tugas jemput atau antar.
                </p>
              )}

              {activeDeliveries.length > 0 && (
                <Link to="/app/dispatch" className="small">
                  Atur di dispatch →
                </Link>
              )}
            </div>
          </section>


<section className="card">
  <div className="card-head">
    <h3>Dispute</h3>

    {canManageDispute && !activeDispute && !disputeFormOpen && (
      <button
        type="button"
        className="btn btn-sm btn-primary"
        onClick={() => {
          setActionError('')
          setDisputeFormOpen(true)
        }}
      >
        + Buat komplain
      </button>
    )}
  </div>

  <div className="card-body">
    {disputeFormOpen && canManageDispute && (
      <form
        className="order-dispute-form"
        onSubmit={createDispute}
      >
        <h4>Buat komplain baru</h4>

        <div className="field">
          <label htmlFor="dispute-category">
            Kategori komplain
          </label>

          <select
            id="dispute-category"
            name="category"
            value={disputeCategory}
            onChange={(event) =>
              setDisputeCategory(event.target.value)
            }
          >
            <option value="DAMAGE">Kerusakan</option>
            <option value="LOST">Kehilangan</option>
            <option value="QUALITY">Hasil kurang bersih</option>
            <option value="LATE">Keterlambatan</option>
            <option value="PAYMENT">Pembayaran</option>
            <option value="OTHER">Lainnya</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="dispute-description">
            Deskripsi komplain
          </label>

          <textarea
            id="dispute-description"
            name="description"
            rows={4}
            minLength={5}
            maxLength={1500}
            required
            placeholder="Jelaskan keluhan pelanggan atau hasil pemeriksaan staf..."
            value={disputeDescription}
            onChange={(event) =>
              setDisputeDescription(event.target.value)
            }
          />

          <small className="muted">
            {disputeDescription.length}/1500 karakter
          </small>
        </div>

        <div className="order-dispute-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={disputeSaving}
            onClick={() => {
              setDisputeFormOpen(false)
              setDisputeDescription('')
              setDisputeCategory('QUALITY')
              setActionError('')
            }}
          >
            Batal
          </button>

          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={
              disputeSaving ||
              disputeDescription.trim().length < 5
            }
          >
            {disputeSaving ? 'Menyimpan...' : 'Kirim komplain'}
          </button>
        </div>
      </form>
    )}

    {disputes.length ? (
      disputes.map((dispute) => {
        const [label, badge] =
          DISPUTE_STATUS[dispute.status] || [
            dispute.status,
            '',
          ]

        return (
          <div className="list-row" key={dispute.id}>
            <Link to={`/app/dispute/${dispute.id}`}>
              <strong className="mono">
                {dispute.code}
              </strong>

              <div className="small muted">
                {DISPUTE_CAT[dispute.category] || dispute.category}
              </div>
            </Link>

            <span className={`badge ${badge}`}>
              {label}
            </span>
          </div>
        )
      })
    ) : (
      <p className="muted small">
        Tidak ada komplain.
      </p>
    )}

    {activeDispute && (
      <p className="small muted">
        Ada komplain yang masih ditangani. Selesaikan komplain
        tersebut sebelum membuat komplain baru untuk order ini.
      </p>
    )}
  </div>
</section>


          {order.track_qr_svg && (
            <section className="card card-pad center">
              <div
                className="order-track-qr"
                dangerouslySetInnerHTML={{
                  __html: order.track_qr_svg,
                }}
              />

              <div className="small muted" style={{ marginTop: 8 }}>
                QR pelacakan untuk pelanggan
              </div>

              {order.track_url && (
                <a
                  href={order.track_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="small"
                >
                  Buka halaman lacak
                </a>
              )}
            </section>
          )}
        </div>
      </div>

      {paymentOpen && (
        <PaymentModal
          order={order}
          initialPayment={initialPayment}
          onClose={() => {
            setPaymentOpen(false)
            setInitialPayment(null)
          }}
          onUpdated={refreshOrder}
        />
      )}

      {editOpen && (
        <EditItemsModal
          order={order}
          onClose={() => setEditOpen(false)}
          onSaved={refreshOrder}
        />
      )}

      {createPortal(
        <div id="print-area">
          <div className="receipt">
            <h2>{info?.business_name || 'Sepatu Kinclong'}</h2>

            <div className="receipt-center">
              {info?.address || ''}
              <br />
              WA {formatPhone(info?.phone)}
            </div>

            <hr />

            <div className="receipt-row">
              <span>No</span>
              <strong>{order.code}</strong>
            </div>

            <div className="receipt-row">
              <span>Tanggal</span>
              <span>{formatDate(order.created_at)}</span>
            </div>

            <div className="receipt-row">
              <span>Pelanggan</span>
              <span>{order.customer_name}</span>
            </div>

            <div className="receipt-row">
              <span>HP</span>
              <span>{formatPhone(order.customer_phone)}</span>
            </div>

            <div className="receipt-row">
              <span>Estimasi</span>
              <span>{formatDate(order.due_date, false)}</span>
            </div>

            <div className="receipt-row">
              <span>Kembali</span>
              <span>
                {order.return_method === 'DELIVERY'
                  ? 'Diantar'
                  : 'Ambil di toko'}
              </span>
            </div>

            <hr />

            {items.map((item, index) => (
              <div key={index}>
                <div>{item.qty}x {item.service_name}</div>

                {item.shoe && <div> {item.shoe}</div>}

                {item.condition_note && (
                  <div> Kondisi: {item.condition_note}</div>
                )}

                <div className="receipt-row">
                  <span>@{formatRupiah(item.price)}</span>
                  <span>{formatRupiah(item.qty * item.price)}</span>
                </div>
              </div>
            ))}

            <hr />

            <div className="receipt-row">
              <span>Subtotal</span>
              <span>{formatRupiah(order.subtotal)}</span>
            </div>

            {order.discount > 0 && (
              <div className="receipt-row">
                <span>Diskon</span>
                <span>-{formatRupiah(order.discount)}</span>
              </div>
            )}

            {order.delivery_fee > 0 && (
              <div className="receipt-row">
                <span>Ongkir</span>
                <span>{formatRupiah(order.delivery_fee)}</span>
              </div>
            )}

            <div className="receipt-row">
              <strong>TOTAL</strong>
              <strong>{formatRupiah(order.total)}</strong>
            </div>

            <div className="receipt-row">
              <span>Dibayar</span>
              <span>{formatRupiah(order.paid)}</span>
            </div>

            <div className="receipt-row">
              <strong>SISA</strong>
              <strong>{formatRupiah(order.outstanding)}</strong>
            </div>

            <hr />

            <div className="receipt-center">
              Lacak status pesanan
            </div>

            {order.track_qr_svg && (
              <div
                className="receipt-qr"
                dangerouslySetInnerHTML={{
                  __html: order.track_qr_svg,
                }}
              />
            )}

            <div className="receipt-center">
              {order.track_url}
            </div>

            <hr />

            <div className="receipt-center">
              Komplain maksimal 3 hari setelah sepatu diterima
              melalui halaman lacak.
              <br />
              Terima kasih!
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
