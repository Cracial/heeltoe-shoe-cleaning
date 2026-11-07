import { Link, useLocation } from 'react-router-dom'

export default function DashboardPlaceholder({ title }) {
  const location = useLocation()

  return (
    <div>
      <div className="page-head">
        <h1>{title}</h1>
      </div>

      <div className="card card-pad">
        <div style={{ fontSize: 35, marginBottom: 12 }}>
          🚧
        </div>

        <h2>Halaman sedang dimigrasikan</h2>

        <p className="muted">
          Modul ini akan dipindahkan dari sistem JavaScript lama
          ke React. Backend dan database tetap menggunakan sistem lama.
        </p>

        <p className="small muted">
          Alamat halaman: {location.pathname}
        </p>

        <Link to="/app/dashboard" className="btn btn-primary">
          Kembali ke dashboard
        </Link>
      </div>
    </div>
  )
}