
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, formatRupiah } from '../services/api'

export default function HomePage() {
  const [info, setInfo] = useState({})
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)

  const [form, setForm] = useState({
    name: '',
    phone: '',
    address: '',
    service_id: '',
    pairs: 1,
    schedule: '',
    return_method: 'DELIVERY',
    notes: '',
  })

  const [booking, setBooking] = useState(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    Promise.all([
      api('/api/public/info'),
      api('/api/public/services'),
    ])
      .then(([businessInfo, serviceList]) => {
        setInfo(businessInfo)
        setServices(serviceList)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  function updateForm(event) {
    const { name, value } = event.target

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }))
  }

  async function submitBooking(event) {
    event.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      const result = await api('/api/public/booking', {
        method: 'POST',
        body: {
          ...form,
          pairs: Number(form.pairs),
        },
      })

      setBooking(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <header id="site-nav">
        <div className="wrap nav-in">
          <Link to="/" className="logo">
            <img src="/favicon.svg" alt="" />
            <span>{info.business_name || 'Sepatu Kinclong'}</span>
          </Link>

          <nav className="nav-links">
            <a href="#layanan">Layanan</a>
            <a href="#cara-kerja">Cara kerja</a>
            <Link to="/profil">Profil</Link>
            <Link to="/lacak">Lacak order</Link>
            <Link to="/login">Staf</Link>
            <a href="#booking" className="btn btn-primary btn-sm">
              Jemput sekarang
            </a>
          </nav>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="wrap hero-grid">
            <div>
              <span className="eyebrow">
                {info.tagline || 'Cuci sepatu profesional'}
              </span>

              <h1>
                Sepatu kotor?
                <br />
                Kami bikin <span className="hl">kinclong</span> lagi.
              </h1>

              <p className="lead">
                Sepatu kesayangan Anda dirawat oleh teknisi profesional,
                diperiksa sebelum dikembalikan, dan dapat dilacak secara online.
              </p>

              <div className="hero-cta">
                <a href="#booking" className="btn btn-primary btn-lg">
                  Jemput sepatu saya
                </a>

                <a href="#layanan" className="btn btn-ghost btn-lg">
                  Lihat harga
                </a>
              </div>

              <div className="chips">
                <span className="chip">Jemput dan antar</span>
                <span className="chip">QRIS dan tunai</span>
                <span className="chip">Garansi cuci ulang</span>
              </div>
            </div>

            <div className="hero-art">
              <div className="card" style={{ padding: 35 }}>
                <h2>Sepatu Kinclong</h2>
                <p>Jemput. Cuci. Antar.</p>
                <h1>✨ 👟 ✨</h1>
                <p className="muted">
                  Perawatan sepatu profesional dengan proses yang transparan.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="layanan">
          <div className="wrap">
            <span className="eyebrow">Layanan dan harga</span>
            <h2 className="section-title">
              Perawatan untuk setiap bahan sepatu
            </h2>

            <div className="services">
              {loading ? (
                <p>Memuat layanan...</p>
              ) : services.length ? (
                services.map((service) => (
                  <article className="svc" key={service.id}>
                    <h3>{service.name}</h3>
                    <p>{service.description}</p>
                    <div className="price">
                      {formatRupiah(service.price)}
                    </div>
                    <small>
                      Estimasi {service.duration_days} hari
                    </small>
                  </article>
                ))
              ) : (
                <p>Belum ada layanan tersedia.</p>
              )}
            </div>
          </div>
        </section>

        <section className="dark" id="cara-kerja">
          <div className="wrap">
            <span className="eyebrow">Cara kerja</span>
            <h2 className="section-title">
              Tinggal booking, kami yang jemput
            </h2>

            <div className="steps">
              {['Booking online', 'Dijemput kurir', 'Dicuci dan QC', 'Diantar kembali']
                .map((step, index) => (
                  <div className="step" key={step}>
                    <h3>{index + 1}. {step}</h3>
                  </div>
                ))}
            </div>
          </div>
        </section>

        <section id="booking">
          <div className="wrap booking">
            <div>
              <span className="eyebrow">Booking jemput</span>
              <h2 className="section-title">Mager ke toko? Kami jemput.</h2>
              <p className="lead">
                Isi data penjemputan. Kurir akan menghubungi melalui WhatsApp.
              </p>
              <p>{info.open_hours || ''}</p>
              <p>{info.phone || ''}</p>
            </div>

            <div className="card" id="booking-card">
              {booking ? (
                <div className="success-box">
                  <h3>Booking berhasil!</h3>
                  <p>{booking.message}</p>
                  <h2>{booking.code}</h2>
                  <Link
                    className="btn btn-primary"
                    to={`/lacak?kode=${encodeURIComponent(booking.code)}&hp=${encodeURIComponent(form.phone)}`}
                  >
                    Lacak order
                  </Link>
                </div>
              ) : (
                <form onSubmit={submitBooking}>
                  <div className="field">
                    <label>Nama</label>
                    <input
                      name="name"
                      value={form.name}
                      onChange={updateForm}
                      required
                      maxLength={80}
                    />
                  </div>

                  <div className="field">
                    <label>Nomor WhatsApp</label>
                    <input
                      name="phone"
                      value={form.phone}
                      onChange={updateForm}
                      required
                      placeholder="0812xxxxxxx"
                    />
                  </div>

                  <div className="field">
                    <label>Alamat penjemputan</label>
                    <textarea
                      name="address"
                      value={form.address}
                      onChange={updateForm}
                      required
                      maxLength={300}
                    />
                  </div>

                  <div className="field">
                    <label>Layanan</label>
                    <select
                      name="service_id"
                      value={form.service_id}
                      onChange={updateForm}
                    >
                      <option value="">Belum tahu, minta saran</option>
                      {services.map((service) => (
                        <option key={service.id} value={service.id}>
                          {service.name} - {formatRupiah(service.price)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label>Jumlah pasang</label>
                    <input
                      type="number"
                      name="pairs"
                      min="1"
                      max="20"
                      value={form.pairs}
                      onChange={updateForm}
                    />
                  </div>

                  <div className="field">
                    <label>Jadwal jemput</label>
                    <input
                      type="datetime-local"
                      name="schedule"
                      value={form.schedule}
                      onChange={updateForm}
                    />
                  </div>

                  <div className="field">
                    <label>Metode pengembalian</label>
                    <select
                      name="return_method"
                      value={form.return_method}
                      onChange={updateForm}
                    >
                      <option value="DELIVERY">Antar ke alamat</option>
                      <option value="STORE">Ambil di toko</option>
                    </select>
                  </div>

                  <div className="field">
                    <label>Catatan</label>
                    <input
                      name="notes"
                      value={form.notes}
                      onChange={updateForm}
                      maxLength={300}
                    />
                  </div>

                  {error && (
                    <p style={{ color: '#c0392b' }} role="alert">
                      {error}
                    </p>
                  )}

                  <button
                    className="btn btn-primary btn-lg btn-block"
                    disabled={submitting}
                  >
                    {submitting ? 'Mengirim...' : 'Kirim booking'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer id="site-foot">
        <div className="wrap">
          <div className="copy">
            © {new Date().getFullYear()} {info.business_name || 'Sepatu Kinclong'}
          </div>
        </div>
      </footer>
    </>
  )
}