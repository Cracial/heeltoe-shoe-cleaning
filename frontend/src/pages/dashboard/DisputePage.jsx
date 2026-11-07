
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { api } from '../../services/api'
import '../../styles/dispute.css'

const STATUS = {
  OPEN: { label: 'Terbuka', className: 'b-danger' },
  INVESTIGATING: { label: 'Sedang ditangani', className: 'b-sun' },
  RESOLVED: { label: 'Selesai', className: 'b-ok' },
  REJECTED: { label: 'Ditolak', className: 'b-info' },
}

export default function DisputePage() {
  const [disputes, setDisputes] = useState([])
  const [filter, setFilter] = useState('active')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadDisputes = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const result = await api(
        `/api/disputes?status=${encodeURIComponent(filter)}`
      )

      setDisputes(Array.isArray(result) ? result : [])
    } catch (err) {
      setError(err.message || 'Gagal memuat daftar dispute.')
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    loadDisputes()
  }, [loadDisputes])

  const activeCount = disputes.filter((dispute) =>
    ['OPEN', 'INVESTIGATING'].includes(dispute.status)
  ).length

  return (
    <div className="dispute-page">
      <div className="page-head dispute-page-head">
        <div>
          <h1>Dispute &amp; komplain</h1>
          <p className="small muted">
            Kelola keluhan pelanggan, percakapan, dan keputusan penyelesaian.
          </p>
        </div>

        <button
          type="button"
          className="btn btn-ghost"
          onClick={loadDisputes}
          disabled={loading}
        >
          {loading ? 'Memuat...' : 'Muat ulang'}
        </button>
      </div>

      <div className="dispute-summary">
        <div className="card kpi">
          <div className="label">
            {filter === 'active' ? 'Dispute aktif' : 'Dispute ditampilkan'}
          </div>
          <div className="value">{disputes.length}</div>
          <div className="sub">
            {filter === 'active'
              ? 'Komplain yang belum ditutup'
              : 'Sesuai filter yang dipilih'}
          </div>
        </div>

        <div className="card kpi">
          <div className="label">Perlu ditangani</div>
          <div className="value">
            {filter === 'active'
              ? disputes.filter(
                  (dispute) => dispute.last_author === 'CUSTOMER'
                ).length
              : activeCount}
          </div>
          <div className="sub">
            {filter === 'active'
              ? 'Pesan terakhir berasal dari pelanggan'
              : 'Komplain yang masih aktif'}
          </div>
        </div>
      </div>

      <div className="card dispute-list-card">
        <div className="dispute-toolbar">
          <div>
            <h3>Daftar komplain</h3>
            <p className="small muted">
              Pilih komplain untuk melihat percakapan dan memberikan keputusan.
            </p>
          </div>

          <label className="dispute-filter">
            <span>Filter status</span>
            <select
              aria-label="Filter status dispute"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            >
              <option value="active">Aktif</option>
              <option value="RESOLVED">Selesai</option>
              <option value="REJECTED">Ditolak</option>
              <option value="">Semua</option>
            </select>
          </label>
        </div>

        {loading ? (
          <div className="dispute-state">
            <span className="spinner" />
            <p>Memuat daftar komplain...</p>
          </div>
        ) : error ? (
          <div className="dispute-state dispute-error" role="alert">
            <p>{error}</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={loadDisputes}
            >
              Coba lagi
            </button>
          </div>
        ) : disputes.length === 0 ? (
          <div className="dispute-state">
            <h3>Tidak ada dispute</h3>
            <p className="muted">
              Belum ada komplain pada kategori status ini.
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="dispute-table">
              <thead>
                <tr>
                  <th>Kode</th>
                  <th>Order / pelanggan</th>
                  <th>Kategori</th>
                  <th>Status</th>
                  <th>Pesan</th>
                  <th>Pembaruan terakhir</th>
                  <th>Aksi</th>
                </tr>
              </thead>

              <tbody>
                {disputes.map((dispute) => {
                  const status = STATUS[dispute.status] || {
                    label: dispute.status,
                    className: 'plain',
                  }

                  const needsReply =
                    ['OPEN', 'INVESTIGATING'].includes(dispute.status) &&
                    dispute.last_author === 'CUSTOMER'

                  return (
                    <tr key={dispute.id}>
                      <td>
                        <strong className="mono">
                          {dispute.code}
                        </strong>
                        <div className="small muted">
                          {dispute.source === 'CUSTOMER'
                            ? 'Dari pelanggan'
                            : 'Dicatat staf'}
                        </div>
                      </td>

                      <td>
                        <strong className="mono">
                          {dispute.order_code}
                        </strong>
                        <div className="small">
                          {dispute.customer_name}
                        </div>
                      </td>

                      <td>{dispute.category_label || dispute.category}</td>

                      <td>
                        <span className={`badge ${status.className}`}>
                          {status.label}
                        </span>
                      </td>

                      <td>
                        <span className="small">
                          {dispute.message_count || 0} pesan
                        </span>

                        {needsReply && (
                          <div>
                            <span className="badge b-danger plain">
                              Perlu dibalas
                            </span>
                          </div>
                        )}
                      </td>

                      <td className="small nowrap">
                        {dispute.updated_at
                          ? new Date(
                              String(dispute.updated_at).replace(' ', 'T')
                            ).toLocaleString('id-ID')
                          : '-'}
                      </td>

                      <td>
                        <Link
                          className="btn btn-sm btn-ghost"
                          to={`/app/dispute/${dispute.id}`}
                          aria-label={`Lihat dispute ${dispute.code}`}
                        >
                          Detail
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && (
          <div className="dispute-list-footer">
            Menampilkan {disputes.length} dispute.
          </div>
        )}
      </div>
    </div>
  )
}
