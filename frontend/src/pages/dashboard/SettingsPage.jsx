import { useCallback, useEffect, useState } from 'react'
import { api } from '../../services/api'
import '../../styles/settings.css'

const EMPTY_SETTINGS = {
  business_name: '',
  tagline: '',
  about: '',
  vision: '',
  mission: '',
  address: '',
  phone: '',
  email: '',
  instagram: '',
  open_hours: '',
  maps_url: '',
  delivery_fee: '0',
  public_url: '',
  qris_static: '',
}

const SETTING_KEYS = Object.keys(EMPTY_SETTINGS)

function normalizeSettings(data) {
  return Object.fromEntries(
    SETTING_KEYS.map((key) => [key, String(data?.[key] ?? EMPTY_SETTINGS[key])])
  )
}

function SettingsField({
  name,
  label,
  value,
  onChange,
  type = 'text',
  hint = '',
  rows,
  className = '',
  min,
  inputMode,
}) {
  const id = `setting-${name}`

  return (
    <div className={`settings-field ${className}`.trim()}>
      <label htmlFor={id}>{label}</label>
      {rows ? (
        <textarea
          id={id}
          name={name}
          rows={rows}
          value={value}
          onChange={(event) => onChange(name, event.target.value)}
        />
      ) : (
        <input
          id={id}
          name={name}
          type={type}
          min={min}
          inputMode={inputMode}
          value={value}
          onChange={(event) => onChange(name, event.target.value)}
        />
      )}
      {hint && <small className="muted">{hint}</small>}
    </div>
  )
}

export default function SettingsPage() {
  const [settings, setSettings] = useState(EMPTY_SETTINGS)
  const [qrisInfo, setQrisInfo] = useState(null)
  const [webhookSecret, setWebhookSecret] = useState('')
  const [regenerateSecret, setRegenerateSecret] = useState(false)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const loadSettings = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const result = await api('/api/settings')
      setSettings(normalizeSettings(result))
      setQrisInfo(result.qris_info || null)
      setWebhookSecret(String(result.webhook_secret || ''))
    } catch (err) {
      setError(err.message || 'Gagal memuat pengaturan usaha.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  function updateSetting(name, value) {
    setSettings((current) => ({
      ...current,
      [name]: value,
    }))
    setSuccess('')
  }

  async function saveSettings(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')

    const payload = {
      ...settings,
      delivery_fee: String(settings.delivery_fee || '0'),
      regenerate_webhook_secret: regenerateSecret,
    }

    try {
      await api('/api/settings', {
        method: 'PUT',
        body: payload,
      })

      setRegenerateSecret(false)
      setSuccess('Pengaturan usaha berhasil disimpan.')

      // Muat ulang hasil validasi QRIS dan secret terbaru dari backend.
      try {
        const refreshed = await api('/api/settings')
        setSettings(normalizeSettings(refreshed))
        setQrisInfo(refreshed.qris_info || null)
        setWebhookSecret(String(refreshed.webhook_secret || ''))
      } catch (refreshError) {
        setError(
          `Pengaturan sudah tersimpan, tetapi data terbaru gagal dimuat: ${refreshError.message}`
        )
      }
    } catch (err) {
      setError(err.message || 'Gagal menyimpan pengaturan usaha.')
    } finally {
      setSaving(false)
    }
  }

  const isDemoQris = /DEMO/i.test(settings.qris_static)
  const publicBase = (settings.public_url.trim() || window.location.origin)
    .replace(/\/$/, '')
  const webhookUrl = `${publicBase}/api/payments/webhook`

  if (loading) {
    return (
      <div className="settings-page">
        <div className="page-head">
          <h1>Pengaturan usaha</h1>
        </div>
        <div className="card card-pad">
          <p className="muted">Memuat pengaturan usaha...</p>
        </div>
      </div>
    )
  }

  if (error && !settings.business_name && !settings.qris_static) {
    return (
      <div className="settings-page">
        <div className="page-head">
          <h1>Pengaturan usaha</h1>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={loadSettings}
          >
            Coba lagi
          </button>
        </div>
        <div className="alert-box danger" role="alert">{error}</div>
      </div>
    )
  }

  return (
    <div className="settings-page">
      <div className="page-head">
        <div>
          <h1>Pengaturan usaha</h1>
          <p className="muted small">
            Kelola informasi yang ditampilkan pada website dan konfigurasi pembayaran.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={loadSettings}
          disabled={saving}
        >
          Muat ulang
        </button>
      </div>

      {error && <div className="alert-box danger" role="alert">{error}</div>}
      {success && <div className="alert-box info" role="status">{success}</div>}

      <form className="settings-form" onSubmit={saveSettings}>
        <section className="card card-pad settings-panel">
          <div className="settings-panel-heading">
            <h2>Profil usaha</h2>
            <p className="muted small">Informasi utama yang tampil di website publik.</p>
          </div>

          <SettingsField
            name="business_name"
            label="Nama usaha"
            value={settings.business_name}
            onChange={updateSetting}
          />
          <SettingsField
            name="tagline"
            label="Tagline"
            value={settings.tagline}
            onChange={updateSetting}
          />
          <SettingsField
            name="about"
            label="Tentang kami"
            value={settings.about}
            onChange={updateSetting}
            rows={4}
          />
          <SettingsField
            name="vision"
            label="Visi"
            value={settings.vision}
            onChange={updateSetting}
          />
          <SettingsField
            name="mission"
            label="Misi"
            value={settings.mission}
            onChange={updateSetting}
            rows={3}
            hint="Pisahkan setiap poin misi dengan tanda |."
          />
          <SettingsField
            name="address"
            label="Alamat"
            value={settings.address}
            onChange={updateSetting}
            rows={2}
          />

          <div className="settings-fields-two">
            <SettingsField
              name="phone"
              label="WhatsApp"
              value={settings.phone}
              onChange={updateSetting}
              inputMode="tel"
            />
            <SettingsField
              name="email"
              label="Email"
              value={settings.email}
              onChange={updateSetting}
              type="text"
              inputMode="email"
            />
            <SettingsField
              name="instagram"
              label="Instagram"
              value={settings.instagram}
              onChange={updateSetting}
              hint="Masukkan username tanpa tanda @."
            />
            <SettingsField
              name="open_hours"
              label="Jam operasional"
              value={settings.open_hours}
              onChange={updateSetting}
            />
          </div>

          <SettingsField
            name="maps_url"
            label="Link Google Maps"
            value={settings.maps_url}
            onChange={updateSetting}
            type="text"
          />
        </section>

        <div className="settings-side-column">
          <section className="card card-pad settings-panel">
            <div className="settings-panel-heading">
              <h2>Pembayaran QRIS</h2>
              <p className="muted small">Konfigurasi QRIS statis untuk pembayaran pelanggan.</p>
            </div>

            {isDemoQris && (
              <div className="alert-box warn">
                Masih memakai QRIS <strong>demo</strong>. Masukkan payload QRIS statis usaha agar pelanggan dapat melakukan pembayaran sungguhan.
              </div>
            )}

            {qrisInfo?.error ? (
              <div className="alert-box danger" role="alert">{qrisInfo.error}</div>
            ) : (
              <div className="settings-qris-info">
                <span>Merchant terbaca</span>
                <strong>{qrisInfo?.merchant || '-'}</strong>
                {qrisInfo?.city && <span>Â· {qrisInfo.city}</span>}
              </div>
            )}

            <SettingsField
              name="qris_static"
              label="Payload QRIS statis"
              value={settings.qris_static}
              onChange={updateSetting}
              rows={5}
              className="settings-qris-payload"
              hint="Gunakan payload QRIS statis dari merchant, bukan QRIS dinamis yang sudah memiliki nominal."
            />
            <p className="muted small settings-help">
              Untuk mendapatkannya, scan stiker QRIS toko menggunakan aplikasi pembaca QR, lalu salin payload yang dimulai dengan 000201.
              Sistem akan menyesuaikan nominal tagihan saat pelanggan membayar.
            </p>
          </section>

          <section className="card card-pad settings-panel">
            <div className="settings-panel-heading">
              <h2>Operasional</h2>
              <p className="muted small">Pengaturan pengiriman dan alamat website publik.</p>
            </div>

            <SettingsField
              name="delivery_fee"
              label="Ongkir default (Rp)"
              value={settings.delivery_fee}
              onChange={updateSetting}
              type="number"
              min="0"
              inputMode="numeric"
            />
            <SettingsField
              name="public_url"
              label="Alamat website publik"
              value={settings.public_url}
              onChange={updateSetting}
              type="text"
              hint="Digunakan untuk tautan dan QR lacak pada nota."
            />
          </section>

          <section className="card card-pad settings-panel">
            <div className="settings-panel-heading">
              <h2>Webhook payment gateway</h2>
              <p className="muted small">
                Opsional. Arahkan notifikasi payment gateway ke endpoint berikut agar status QRIS lunas otomatis.
              </p>
            </div>

            <div className="settings-webhook-code">
              <strong>Endpoint</strong>
              <code>{`POST ${webhookUrl}`}</code>
              <strong>Header</strong>
              <code data-testid="webhook-secret">{`X-Webhook-Secret: ${webhookSecret || '(belum tersedia)'}`}</code>
              <strong>Body</strong>
              <code>{'{"ref":"QR...","status":"PAID","amount":55000}'}</code>
            </div>

            <label className="check settings-regenerate-check">
              <input
                type="checkbox"
                name="regenerate_webhook_secret"
                checked={regenerateSecret}
                onChange={(event) => setRegenerateSecret(event.target.checked)}
              />
              Buat secret baru saat menyimpan
            </label>
            <p className="muted small">
              Secret lama akan tidak berlaku setelah secret baru dibuat. Perbarui konfigurasi payment gateway setelah menggantinya.
            </p>
          </section>
        </div>

        <div className="settings-submit-row">
          <button
            type="submit"
            className="btn btn-primary btn-lg"
            disabled={saving}
          >
            {saving ? 'Menyimpan...' : 'Simpan pengaturan'}
          </button>
        </div>
      </form>
    </div>
  )
}