import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../../services/api'
import '../../styles/messages.css'

// SEPatu-KINCLONG-MESSAGES-PAGE
function isHandled(message) {
  return message.handled === true || Number(message.handled) === 1
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

function whatsappUrl(phone, name) {
  const digits = String(phone || '').replace(/\D/g, '')
  if (!digits) return ''

  const normalized = digits.startsWith('0')
    ? `62${digits.slice(1)}`
    : digits.startsWith('62')
      ? digits
      : `62${digits}`

  const message = `Halo ${name}, terima kasih sudah menghubungi kami. `
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`
}

export default function MessagesPage() {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingId, setSavingId] = useState(null)
  const [filter, setFilter] = useState('all')

  const loadMessages = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const result = await api('/api/contacts')
      setMessages(Array.isArray(result) ? result : [])
    } catch (err) {
      setError(err.message || 'Gagal memuat pesan website.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadMessages()
  }, [loadMessages])

  const pendingCount = useMemo(
    () => messages.filter((message) => !isHandled(message)).length,
    [messages]
  )

  const handledCount = messages.length - pendingCount

  const filteredMessages = useMemo(() => {
    if (filter === 'pending') {
      return messages.filter((message) => !isHandled(message))
    }

    if (filter === 'handled') {
      return messages.filter(isHandled)
    }

    return messages
  }, [filter, messages])

  async function markHandled(id) {
    setSavingId(id)
    setError('')

    try {
      await api(`/api/contacts/${id}/handled`, { method: 'POST' })
      setMessages((current) => current.map((message) => (
        Number(message.id) === Number(id)
          ? { ...message, handled: 1 }
          : message
      )))
    } catch (err) {
      setError(err.message || 'Gagal memperbarui status pesan.')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="messages-page">
      <div className="page-head">
        <div>
          <h1>Pesan dari website</h1>
          <p className="muted small">
            Baca pertanyaan dan pesan yang dikirim pengunjung melalui halaman website.
          </p>
        </div>

        <button
          type="button"
          className="btn btn-ghost"
          onClick={loadMessages}
          disabled={loading}
        >
          {loading ? 'Memuat...' : 'Muat ulang'}
        </button>
      </div>

      <div className="messages-summary">
        <div className="messages-stat">
          <span>Total pesan</span>
          <strong>{messages.length}</strong>
        </div>

        <div className="messages-stat pending">
          <span>Belum ditangani</span>
          <strong>{pendingCount}</strong>
        </div>

        <div className="messages-stat handled">
          <span>Selesai</span>
          <strong>{handledCount}</strong>
        </div>
      </div>

      {error && (
        <div className="alert-box danger" role="alert">
          {error}
        </div>
      )}

      <section className="card">
        <div className="messages-toolbar">
          <div className="messages-filters" aria-label="Filter pesan">
            <button
              type="button"
              className={`btn btn-sm ${filter === 'all' ? 'btn-primary' : 'btn-ghost'}`}
              aria-pressed={filter === 'all'}
              onClick={() => setFilter('all')}
            >
              Semua ({messages.length})
            </button>

            <button
              type="button"
              className={`btn btn-sm ${filter === 'pending' ? 'btn-primary' : 'btn-ghost'}`}
              aria-pressed={filter === 'pending'}
              onClick={() => setFilter('pending')}
            >
              Belum ditangani ({pendingCount})
            </button>

            <button
              type="button"
              className={`btn btn-sm ${filter === 'handled' ? 'btn-primary' : 'btn-ghost'}`}
              aria-pressed={filter === 'handled'}
              onClick={() => setFilter('handled')}
            >
              Selesai ({handledCount})
            </button>
          </div>

          <span className="small muted">Maksimal 100 pesan terbaru</span>
        </div>

        <div className="card-body">
          {loading ? (
            <div className="messages-state" role="status">
              <span className="spinner" />
              <span>Memuat pesan...</span>
            </div>
          ) : filteredMessages.length ? (
            <div className="contact-message-list">
              {filteredMessages.map((message) => {
                const handled = isHandled(message)
                const waLink = whatsappUrl(message.phone, message.name)

                return (
                  <article
                    className={`contact-message-card ${handled ? 'is-handled' : ''}`}
                    data-contact-id={message.id}
                    key={message.id}
                  >
                    <div className="contact-message-content">
                      <div className="contact-message-heading">
                        <h3>{message.name}</h3>
                        <span className={`contact-message-status ${handled ? 'handled' : 'pending'}`}>
                          {handled ? 'Selesai' : 'Belum ditangani'}
                        </span>
                      </div>

                      <div className="contact-message-meta">
                        <span>{formatDate(message.created_at)}</span>
                        {message.phone && <span>{message.phone}</span>}
                      </div>

                      <p className="contact-message-text">{message.message}</p>
                    </div>

                    <div className="contact-message-actions">
                      {waLink && (
                        <a
                          className="btn btn-sm btn-ghost"
                          href={waLink}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Balas WA
                        </a>
                      )}

                      {!handled && (
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          disabled={savingId === message.id}
                          onClick={() => markHandled(message.id)}
                        >
                          {savingId === message.id ? 'Menyimpan...' : 'Tandai selesai'}
                        </button>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <div className="messages-state empty">
              {messages.length === 0
                ? 'Belum ada pesan dari website.'
                : 'Tidak ada pesan untuk filter ini.'}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}