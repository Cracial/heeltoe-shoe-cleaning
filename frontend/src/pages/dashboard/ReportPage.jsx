import { useCallback, useEffect, useState } from 'react'

import { api, formatRupiah } from '../../services/api'
import '../../styles/report.css'

function toInputDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function getDefaultDateRange() {
  const to = new Date()
  const from = new Date(to)
  from.setDate(from.getDate() - 29)

  return {
    from: toInputDate(from),
    to: toInputDate(to),
  }
}

function formatReportDate(value) {
  if (!value) return '-'

  const [year, month, day] = String(value)
    .slice(0, 10)
    .split('-')
    .map(Number)

  const date = new Date(year, month - 1, day)

  if (Number.isNaN(date.getTime())) return String(value)

  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function csvCell(value) {
  const text = String(value ?? '')

  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`
  }

  return text
}

function downloadReportCsv(report) {
  if (!report || !Array.isArray(report.daily)) return

  const rows = [
    ['tanggal', 'order', 'uang_masuk_bersih', 'hpp_bahan'],
    ...report.daily.map((item) => [
      item.day,
      item.orders,
      item.net_received,
      item.hpp,
    ]),
  ]

  const csv = `\uFEFF${rows
    .map((row) => row.map(csvCell).join(','))
    .join('\r\n')}`

  const blob = new Blob([csv], {
    type: 'text/csv;charset=utf-8;',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = `laporan-${report.from}_${report.to}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()

  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function ReportPage() {
  const [filters, setFilters] = useState(() => getDefaultDateRange())
  const [range, setRange] = useState(() => getDefaultDateRange())
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadReport = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const params = new URLSearchParams({
        from: range.from,
        to: range.to,
      })
      const result = await api(`/api/reports/summary?${params.toString()}`)
      setReport(result)
    } catch (err) {
      setError(err.message || 'Gagal memuat laporan usaha.')
    } finally {
      setLoading(false)
    }
  }, [range])

  useEffect(() => {
    loadReport()
  }, [loadReport])

  function applyFilters(event) {
    event.preventDefault()

    if (!filters.from || !filters.to) {
      setError('Tanggal mulai dan tanggal akhir wajib diisi.')
      return
    }

    if (filters.from > filters.to) {
      setError('Tanggal mulai tidak boleh melebihi tanggal akhir.')
      return
    }

    setError('')
    setRange({ ...filters })
  }

  const daily = Array.isArray(report?.daily) ? report.daily : []
  const services = Array.isArray(report?.by_service) ? report.by_service : []
  const maxReceived = Math.max(
    1,
    ...daily.map((item) => Number(item.net_received) || 0)
  )
  const sales = Number(report?.sales) || 0
  const deliveryFees = Number(report?.delivery_fees) || 0
  const grossProfit = Number(report?.gross_profit) || 0
  const margin = sales
    ? Math.round((grossProfit / (sales - deliveryFees || 1)) * 100)
    : 0

  return (
    <div className="report-page">
      <div className="page-head report-page-header">
        <div className="report-page-title">
          <h1>Laporan usaha</h1>
          <p className="muted">
            Ringkasan penjualan, pembayaran, biaya bahan, dan kinerja layanan.
          </p>
        </div>

        <form className="report-filter-form" onSubmit={applyFilters}>
          <label className="report-filter-field" htmlFor="report-from">
            <span>Dari tanggal</span>
            <input
              id="report-from"
              name="from"
              type="date"
              value={filters.from}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  from: event.target.value,
                }))
              }
            />
          </label>

          <label className="report-filter-field" htmlFor="report-to">
            <span>Sampai tanggal</span>
            <input
              id="report-to"
              name="to"
              type="date"
              value={filters.to}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  to: event.target.value,
                }))
              }
            />
          </label>

          <div className="report-filter-actions">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
            >
              Terapkan filter
            </button>

            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => downloadReportCsv(report)}
              disabled={!report || loading}
            >
              Unduh CSV
            </button>
          </div>
        </form>
      </div>

      {loading && (
        <div className="alert-box info report-state" role="status">
          Memuat data laporan...
        </div>
      )}

      {error && (
        <div className="alert-box danger report-state" role="alert">
          <span>{error}</span>
          {report && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={loadReport}
            >
              Muat ulang
            </button>
          )}
        </div>
      )}

      {!loading && !error && !report && (
        <div className="card card-pad report-state">
          <p className="muted">Data laporan belum tersedia.</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={loadReport}
          >
            Coba lagi
          </button>
        </div>
      )}

      {report && !error && (
        <>
          <div className="kpis report-kpis">
            <div className="kpi report-kpi">
              <div className="label">Penjualan (nilai order)</div>
              <div className="value">{formatRupiah(report.sales)}</div>
              <div className="sub">
                {Number(report.orders || 0).toLocaleString('id-ID')} order Â· diskon{' '}
                {formatRupiah(report.discounts)}
              </div>
            </div>

            <div className="kpi report-kpi">
              <div className="label">Uang masuk bersih</div>
              <div className="value">{formatRupiah(report.net_received)}</div>
              <div className="sub">
                Tunai {formatRupiah(report.cash)} Â· QRIS{' '}
                {formatRupiah(report.qris)} Â· refund {formatRupiah(report.refunds)}
              </div>
            </div>

            <div className="kpi report-kpi">
              <div className="label">HPP bahan (LIFO)</div>
              <div className="value">{formatRupiah(report.material_cost)}</div>
              <div className="sub">
                Selisih opname {formatRupiah(report.adjustment_loss)}
              </div>
            </div>

            <div className="kpi report-kpi">
              <div className="label">Laba kotor jasa</div>
              <div className="value">{formatRupiah(report.gross_profit)}</div>
              <div className="sub">
                Margin {margin}% (di luar ongkir)
              </div>
            </div>

            <div className="kpi report-kpi">
              <div className="label">Nilai persediaan</div>
              <div className="value">{formatRupiah(report.inventory_value)}</div>
              <div className="sub">
                Pembelian periode ini {formatRupiah(report.purchases)}
              </div>
            </div>
          </div>

          <section className="card report-chart-card">
            <div className="card-head">
              <h3>Uang masuk bersih per hari</h3>
              <span className="small muted">
                {formatReportDate(report.from)} â€“ {formatReportDate(report.to)}
              </span>
            </div>

            <div className="card-body">
              {daily.length ? (
                <>
                  <div className="report-chart-scroll">
                    <div
                      className="report-bars"
                      role="img"
                      aria-label="Grafik uang masuk bersih per hari"
                    >
                      {daily.map((item) => {
                        const amount = Number(item.net_received) || 0
                        const height = Math.max(
                          2,
                          Math.round((Math.max(0, amount) / maxReceived) * 100)
                        )

                        return (
                          <div
                            className="report-bar"
                            key={item.day}
                            style={{ height: `${height}%` }}
                            title={`${formatReportDate(item.day)}: ${formatRupiah(amount)} Â· ${item.orders} order`}
                            aria-label={`${formatReportDate(item.day)}: ${formatRupiah(amount)}, ${item.orders} order`}
                          />
                        )
                      })}
                    </div>
                  </div>

                  <div className="bars-x report-chart-labels">
                    <span>{formatReportDate(report.from)}</span>
                    <span>{formatReportDate(report.to)}</span>
                  </div>
                </>
              ) : (
                <p className="muted small">Tidak ada data harian pada periode ini.</p>
              )}
            </div>
          </section>

          <div className="report-tables">
            <section className="card">
              <div className="card-head">
                <h3>Per layanan</h3>
              </div>
              <div className="card-body">
                <div className="table-wrap">
                  <table className="report-table">
                    <thead>
                      <tr>
                        <th>Layanan</th>
                        <th className="right">Pasang</th>
                        <th className="right">Omzet</th>
                      </tr>
                    </thead>
                    <tbody>
                      {services.length ? (
                        services.map((service) => (
                          <tr key={service.name}>
                            <td>{service.name}</td>
                            <td className="right">
                              {Number(service.pairs || 0).toLocaleString('id-ID')}
                            </td>
                            <td className="right">
                              {formatRupiah(service.revenue)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={3} className="muted">
                            Tidak ada data
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            <section className="card">
              <div className="card-head">
                <h3>Harian</h3>
              </div>
              <div className="card-body">
                <div className="table-wrap report-daily-table-wrap">
                  <table className="report-table">
                    <thead>
                      <tr>
                        <th>Tanggal</th>
                        <th className="right">Order</th>
                        <th className="right">Uang masuk</th>
                        <th className="right">HPP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {daily.length ? (
                        daily.slice().reverse().map((item) => (
                          <tr key={item.day}>
                            <td className="nowrap">
                              {formatReportDate(item.day)}
                            </td>
                            <td className="right">
                              {Number(item.orders || 0).toLocaleString('id-ID')}
                            </td>
                            <td className="right">
                              {formatRupiah(item.net_received)}
                            </td>
                            <td className="right">
                              {formatRupiah(item.hpp)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="muted">
                            Tidak ada data
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  )
}