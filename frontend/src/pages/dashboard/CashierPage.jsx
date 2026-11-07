
import { useEffect, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { api, formatRupiah } from '../../services/api'

const emptyItem = (serviceId = '') => ({
  service_id: serviceId,
  shoe: '',
  qty: 1,
  condition_note: '',
})

export default function CashierPage() {
  const navigate = useNavigate()
  const { info, setNotice } = useOutletContext()

  const [services, setServices] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const [customer, setCustomer] = useState({
    name: '',
    phone: '',
    address: '',
  })

  const [discount, setDiscount] = useState(0)
  const [deliveryFee, setDeliveryFee] = useState(0)
  const [returnMethod, setReturnMethod] = useState('STORE')
  const [notes, setNotes] = useState('')

  const [customerHint, setCustomerHint] = useState(
    'Pelanggan lama otomatis terisi berdasarkan nomor HP.'
  )

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    let active = true

    async function loadServices() {
      try {
        const result = await api('/api/services')

        if (!active) return

        const available = result.filter((service) => service.active)

        setServices(available)

        if (available.length) {
          setItems([emptyItem(available[0].id)])
        }
      } catch (err) {
        if (active) setError(err.message)
      } finally {
        if (active) setLoading(false)
      }
    }

    loadServices()

    return () => {
      active = false
    }
  }, [])

  const subtotal = items.reduce((total, item) => {
    const service = services.find(
      (entry) => Number(entry.id) === Number(item.service_id)
    )

    return total + (Number(service?.price) || 0) * (Number(item.qty) || 0)
  }, 0)

  const totalPairs = items.reduce(
    (total, item) => total + (Number(item.qty) || 0),
    0
  )

  const safeDiscount = Math.max(0, Number(discount) || 0)
  const safeDeliveryFee = Math.max(0, Number(deliveryFee) || 0)

  const total = Math.max(
    0,
    subtotal - safeDiscount + safeDeliveryFee
  )

  function updateCustomer(event) {
    const { name, value } = event.target

    setCustomer((previous) => ({
      ...previous,
      [name]: value,
    }))
  }

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
    const serviceId =
      items[items.length - 1]?.service_id || services[0]?.id || ''

    setItems((previous) => [
      ...previous,
      emptyItem(serviceId),
    ])
  }

  function removeItem(index) {
    setItems((previous) =>
      previous.filter((_, itemIndex) => itemIndex !== index)
    )
  }

  function changeReturnMethod(method) {
    setReturnMethod(method)

    setDeliveryFee(
      method === 'DELIVERY'
        ? Number(info?.delivery_fee) || 0
        : 0
    )
  }

  async function lookupCustomer() {
    const phone = customer.phone.replace(/\D/g, '')

    if (phone.length < 9) return

    try {
      const result = await api(
        '/api/customers/by-phone/' + encodeURIComponent(phone)
      )

      if (result) {
        setCustomer((previous) => ({
          ...previous,
          name: result.name || previous.name,
          address: result.address || previous.address,
        }))

        const recent = result.recent_orders || []

        setCustomerHint(
          recent.length
            ? `✓ Pelanggan lama. Order terakhir: ${recent
                .slice(0, 2)
                .map((order) => order.code)
                .join(', ')}`
            : '✓ Pelanggan lama, belum memiliki order sebelumnya.'
        )
      } else {
        setCustomerHint('Pelanggan baru.')
      }
    } catch {
      setCustomerHint('Data pelanggan belum dapat diperiksa.')
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()

    setError('')
    setSuccess('')

    if (!services.length) {
      setError('Belum tersedia layanan aktif.')
      return
    }

    if (!customer.name.trim() || !customer.phone.trim()) {
      setError('Nama dan nomor HP pelanggan wajib diisi.')
      return
    }

    if (returnMethod === 'DELIVERY' && !customer.address.trim()) {
      setError('Alamat pengantaran wajib diisi.')
      return
    }

    if (!items.length) {
      setError('Tambahkan minimal satu item sepatu.')
      return
    }

    for (const item of items) {
      if (!services.some((service) => Number(service.id) === Number(item.service_id))) {
        setError('Pilih layanan yang valid untuk setiap item.')
        return
      }

      const quantity = Number(item.qty)

      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
        setError('Jumlah pasang harus antara 1 sampai 50.')
        return
      }
    }

    if (safeDiscount > subtotal) {
      setError('Diskon tidak boleh melebihi subtotal.')
      return
    }

    setSubmitting(true)

    try {
      const result = await api('/api/orders', {
        method: 'POST',
        body: {
          customer: {
            name: customer.name.trim(),
            phone: customer.phone.trim(),
            address: customer.address.trim(),
          },

          items: items.map((item) => ({
            service_id: Number(item.service_id),
            shoe: item.shoe.trim(),
            qty: Number(item.qty),
            condition_note: item.condition_note.trim(),
          })),

          discount: safeDiscount,
          delivery_fee: safeDeliveryFee,
          return_method: returnMethod,
          address:
            returnMethod === 'DELIVERY'
              ? customer.address.trim()
              : null,
          notes: notes.trim(),
        },
      })

      setSuccess(`Order ${result.code} berhasil disimpan.`)

      setNotice?.(`Order ${result.code} berhasil dibuat.`)

      navigate(`/app/order/${result.id}`, { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="empty">
        <span className="spinner" />
        <p>Memuat daftar layanan...</p>
      </div>
    )
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Order baru</h1>
          <p className="muted small">
            Catat pelanggan dan sepatu yang akan dirawat.
          </p>
        </div>
      </div>

      {error && (
        <div className="alert-box warn" role="alert">
          {error}
        </div>
      )}

      {success && (
        <div className="alert-box info" role="status">
          {success}
        </div>
      )}

      <form
        className="grid g-main"
        onSubmit={handleSubmit}
        autoComplete="off"
      >
        <div className="grid">
          <section className="card card-pad">
            <h3>Pelanggan</h3>

            <div className="field-row">
              <div className="field">
                <label>Nomor HP / WhatsApp</label>

                <input
                  name="phone"
                  value={customer.phone}
                  onChange={updateCustomer}
                  onBlur={lookupCustomer}
                  required
                  inputMode="tel"
                  placeholder="0812xxxxxxx"
                  maxLength={20}
                />

                <div className="hint">
                  {customerHint}
                </div>
              </div>

              <div className="field">
                <label>Nama pelanggan</label>

                <input
                  name="name"
                  value={customer.name}
                  onChange={updateCustomer}
                  required
                  maxLength={80}
                />
              </div>
            </div>

            <div className="field">
              <label>Alamat</label>

              <input
                name="address"
                value={customer.address}
                onChange={updateCustomer}
                maxLength={300}
                placeholder={
                  returnMethod === 'DELIVERY'
                    ? 'Alamat pengantaran (wajib)'
                    : 'Alamat pelanggan (opsional)'
                }
                required={returnMethod === 'DELIVERY'}
              />
            </div>
          </section>

          <section className="card card-pad">
            <div className="cashier-section-heading">
              <h3>Sepatu &amp; layanan</h3>

              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={addItem}
              >
                + Tambah pasang
              </button>
            </div>

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
                  <label>Sepatu (merek / warna)</label>

                  <input
                    value={item.shoe}
                    onChange={(event) =>
                      updateItem(index, 'shoe', event.target.value)
                    }
                    placeholder="Nike AF1 putih"
                    maxLength={150}
                  />
                </div>

                <div className="field">
                  <label>Jumlah pasang</label>

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
                    placeholder="Noda, sol lepas..."
                    maxLength={300}
                  />
                </div>

                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => removeItem(index)}
                  disabled={items.length === 1}
                  aria-label="Hapus item"
                  title="Hapus item"
                >
                  ✕
                </button>
              </div>
            ))}

            <div className="small muted" style={{ marginTop: 10 }}>
              {totalPairs} pasang sepatu dalam order ini.
            </div>
          </section>
        </div>

        <section
          className="card card-pad cashier-summary"
          style={{ position: 'sticky', top: 20, alignSelf: 'start' }}
        >
          <h3>Pengembalian</h3>

          <div className="seg cashier-return">
            <button
              type="button"
              className={returnMethod === 'STORE' ? 'on' : ''}
              onClick={() => changeReturnMethod('STORE')}
            >
              Ambil di toko
            </button>

            <button
              type="button"
              className={returnMethod === 'DELIVERY' ? 'on' : ''}
              onClick={() => changeReturnMethod('DELIVERY')}
            >
              Antar ke alamat
            </button>
          </div>

          <div className="field-row">
            <div className="field">
              <label>Diskon (Rp)</label>

              <input
                type="number"
                min="0"
                step="1000"
                value={discount}
                onChange={(event) => setDiscount(event.target.value)}
              />
            </div>

            <div className="field">
              <label>Ongkir (Rp)</label>

              <input
                type="number"
                min="0"
                step="1000"
                value={deliveryFee}
                onChange={(event) => setDeliveryFee(event.target.value)}
                disabled={returnMethod === 'STORE'}
              />
            </div>
          </div>

          <div className="field">
            <label>Catatan order</label>

            <input
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={500}
              placeholder="Catatan tambahan..."
            />
          </div>

          <div className="summary-box">
            <div className="sum-row">
              <span>Subtotal ({totalPairs} pasang)</span>
              <span>{formatRupiah(subtotal)}</span>
            </div>

            {safeDiscount > 0 && (
              <div className="sum-row">
                <span>Diskon</span>
                <span>-{formatRupiah(safeDiscount)}</span>
              </div>
            )}

            {safeDeliveryFee > 0 && (
              <div className="sum-row">
                <span>Ongkir</span>
                <span>{formatRupiah(safeDeliveryFee)}</span>
              </div>
            )}

            <div className="sum-row total">
              <strong>Total</strong>
              <strong>{formatRupiah(total)}</strong>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-lg btn-block"
            style={{ marginTop: 14 }}
            disabled={submitting || !services.length}
          >
            {submitting ? 'Menyimpan...' : 'Simpan order'}
          </button>
        </section>
      </form>
    </>
  )
}
