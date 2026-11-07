
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../services/api'

function dashboardPath(user) {
  return user.role === 'kurir'
    ? '/app/kurir'
    : '/app/dashboard'
}

export default function LoginPage() {
  const navigate = useNavigate()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let active = true

    api('/api/auth/me')
      .then((user) => {
        if (active) {
          navigate(dashboardPath(user), { replace: true })
        }
      })
      .catch(() => {
        // Belum memiliki sesi login.
      })

    return () => {
      active = false
    }
  }, [navigate])

  async function handleSubmit(event) {
    event.preventDefault()

    setError('')
    setLoading(true)

    try {
      const user = await api('/api/auth/login', {
        method: 'POST',
        body: {
          username,
          password,
        },
      })

      navigate(dashboardPath(user), {
        replace: true,
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <Link
          to="/"
          className="logo"
          style={{ marginBottom: 22 }}
        >
          <img src="/favicon.svg" width="34" height="34" alt="" />
          <span>Sepatu Kinclong</span>
        </Link>

        <h1 style={{ fontSize: 22 }}>
          Masuk ke aplikasi staf
        </h1>

        <p className="muted small">
          Front office, back office, kurir, dan pemilik.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Username</label>

            <input
              name="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              autoComplete="username"
              autoCapitalize="none"
            />
          </div>

          <div className="field">
            <label>Password</label>

            <input
              name="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p role="alert" style={{ color: '#c0392b' }}>
              {error}
            </p>
          )}

          <button
            className="btn btn-primary btn-lg btn-block"
            type="submit"
            disabled={loading}
          >
            {loading ? 'Memproses...' : 'Masuk'}
          </button>
        </form>
      </div>
    </div>
  )
}
