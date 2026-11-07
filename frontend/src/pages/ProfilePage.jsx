
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../services/api'

export default function ProfilePage() {
  const [info, setInfo] = useState({})
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    api('/api/public/info')
      .then(setInfo)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  async function handleContact(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    setSending(true)

    const form = event.currentTarget
    const data = Object.fromEntries(new FormData(form).entries())

    try {
      const result = await api('/api/public/contact', {
        method: 'POST',
        body: data,
      })

      setMessage(result.message || 'Pesan berhasil dikirim.')
      form.reset()
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  const missions = Array.isArray(info.mission) ? info.mission : []

  const phone = String(info.phone || '').replace(/\D/g, '')
  const whatsapp = phone
    ? `https://wa.me/${phone}`
    : '#'

  return (
    <>
      <header id="site-nav">
        <div className="wrap nav-in">
          <Link to="/" className="logo">
            <img src="/favicon.svg" alt="" />
            <span>{info.business_name || 'Sepatu Kinclong'}</span>
          </Link>

          <nav className="nav-links">
            <Link to="/">Beranda</Link>
            <a href="/#layanan">Layanan</a>
            <Link to="/profil">Profil</Link>
            <Link to="/lacak">Lacak order</Link>
            <Link to="/login">Staf</Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="page-hero">
          <div className="wrap">
            <span className="eyebrow">Profil perusahaan</span>
            <h1>
              Merawat sepatu dengan teliti,
              transparan, dan tepat waktu.
            </h1>

            <p className="lead">
              {loading
                ? 'Memuat informasi perusahaan...'
                : info.about || 'Sepatu Kinclong adalah layanan perawatan sepatu profesional.'}
            </p>
          </div>
        </section>

        <section style={{ paddingTop: 8 }}>
          <div className="wrap two-col">
            <div className="vm-card">
              <span className="eyebrow">Visi</span>
              <h2 style={{ fontSize: 24 }}>
                {info.vision || 'Menjadi layanan perawatan sepatu terpercaya.'}
              </h2>
            </div>

            <div className="vm-card">
              <span className="eyebrow">Misi</span>

              {missions.length > 0 ? (
                <ol>
                  {missions.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ol>
              ) : (
                <p className="muted">Informasi misi belum tersedia.</p>
              )}
            </div>
          </div>
        </section>

        <section className="dark">
          <div className="wrap">
            <span className="eyebrow">Standar kerja</span>
            <h2 className="section-title">
              Setiap pasang melewati alur yang sama
            </h2>

            <p className="lead">
              Setiap proses tercatat sehingga order dapat ditelusuri
              dari penerimaan sampai serah terima.
            </p>

            <div className="steps">
              <div className="step">
                <h3>Pencatatan kondisi</h3>
                <p>
                  Merek, warna, noda, dan kondisi awal sepatu
                  dicatat ketika diterima.
                </p>
              </div>

              <div className="step">
                <h3>Treatment sesuai bahan</h3>
                <p>
                  Bahan pembersih dan metode perawatan
                  disesuaikan dengan material sepatu.
                </p>
              </div>

              <div className="step">
                <h3>Quality control</h3>
                <p>
                  Setiap sepatu diperiksa kembali sebelum
                  dinyatakan siap.
                </p>
              </div>

              <div className="step">
                <h3>Serah terima</h3>
                <p>
                  Sepatu dikemas dan diserahkan dengan
                  bukti penerimaan.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section>
          <div className="wrap">
            <span className="eyebrow">Nilai kami</span>
            <h2 className="section-title">
              Yang kami pegang setiap hari
            </h2>

            <div className="values">
              <div className="value">
                <div className="big">Teliti</div>
                <p className="muted small">
                  Detail kecil seperti tali, insole, dan jahitan
                  ikut diperhatikan.
                </p>
              </div>

              <div className="value">
                <div className="big">Jujur</div>
                <p className="muted small">
                  Harga jelas dan kondisi sepatu disampaikan apa adanya.
                </p>
              </div>

              <div className="value">
                <div className="big">Cepat</div>
                <p className="muted small">
                  Estimasi waktu tercantum dan dapat dipantau online.
                </p>
              </div>

              <div className="value">
                <div className="big">Tanggung jawab</div>
                <p className="muted small">
                  Tersedia mekanisme komplain dan penyelesaian masalah.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section style={{ background: '#fff', borderBlock: '1px solid var(--line)' }}>
          <div className="wrap">
            <span className="eyebrow">Tim</span>
            <h2 className="section-title">Struktur tim operasional</h2>

            <div className="team">
              <div className="member">
                <div className="avatar">🧾</div>
                <h3 style={{ fontSize: 17 }}>Front office</h3>
                <p className="muted small">
                  Menerima order, mencatat kondisi sepatu,
                  kasir, dan layanan pelanggan.
                </p>
              </div>

              <div className="member">
                <div className="avatar">🧽</div>
                <h3 style={{ fontSize: 17 }}>Teknisi &amp; back office</h3>
                <p className="muted small">
                  Mengerjakan treatment, quality control,
                  dan mengelola stok bahan.
                </p>
              </div>

              <div className="member">
                <div className="avatar">🛵</div>
                <h3 style={{ fontSize: 17 }}>Kurir</h3>
                <p className="muted small">
                  Menjemput dan mengantar sepatu sesuai jadwal.
                </p>
              </div>

              <div className="member">
                <div className="avatar">⭐</div>
                <h3 style={{ fontSize: 17 }}>Pemilik</h3>
                <p className="muted small">
                  Mengawasi kualitas, menangani komplain,
                  dan mengembangkan usaha.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section>
          <div className="wrap two-col">
            <div>
              <span className="eyebrow">Lokasi &amp; kontak</span>
              <h2 className="section-title">
                Mampir atau hubungi kami
              </h2>

              <div className="info-list" style={{ marginTop: 24 }}>
                <div>
                  <div>📍</div>
                  <div>
                    <strong>Alamat</strong>
                    <br />
                    <span className="muted">
                      {info.address || 'Alamat belum diatur'}
                    </span>
                    <br />

                    {info.maps_url && (
                      <a
                        href={info.maps_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="small"
                      >
                        Buka di Google Maps →
                      </a>
                    )}
                  </div>
                </div>

                <div>
                  <div>🕒</div>
                  <div>
                    <strong>Jam operasional</strong>
                    <br />
                    <span className="muted">
                      {info.open_hours || '-'}
                    </span>
                  </div>
                </div>

                <div>
                  <div>💬</div>
                  <div>
                    <strong>WhatsApp &amp; email</strong>
                    <br />
                    {phone && (
                      <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                        {info.phone}
                      </a>
                    )}
                    <br />
                    {info.email && (
                      <a href={`mailto:${info.email}`}>
                        {info.email}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="card card-pad">
              <h3>Kirim pesan</h3>
              <p className="muted small">
                Untuk kerja sama, pertanyaan, atau penawaran.
                Untuk komplain order, gunakan halaman lacak.
              </p>

              <form onSubmit={handleContact}>
                <div className="field-row">
                  <div className="field">
                    <label>Nama</label>
                    <input name="name" required maxLength={80} />
                  </div>

                  <div className="field">
                    <label>Nomor HP</label>
                    <input name="phone" inputMode="tel" maxLength={20} />
                  </div>
                </div>

                <div className="field">
                  <label>Pesan</label>
                  <textarea
                    name="message"
                    required
                    maxLength={1500}
                  />
                </div>

                {error && (
                  <p role="alert" style={{ color: '#c0392b' }}>
                    {error}
                  </p>
                )}

                {message && (
                  <p role="status" style={{ color: 'green' }}>
                    {message}
                  </p>
                )}

                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={sending}
                >
                  {sending ? 'Mengirim...' : 'Kirim pesan'}
                </button>
              </form>
            </div>
          </div>
        </section>
      </main>

      <footer id="site-foot">
        <div className="wrap">
          <div className="copy">
            © {new Date().getFullYear()} {info.business_name || 'Sepatu Kinclong'}
            . Semua hak dilindungi.
          </div>
        </div>
      </footer>
    </>
  )
}