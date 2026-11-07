
import { useEffect, useState } from 'react'
import {
  Link,
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
} from 'react-router-dom'

import { api } from '../services/api'

const ROLE_NAME = {
  admin: 'Admin / pemilik',
  frontoffice: 'Front office',
  backoffice: 'Back office',
  kurir: 'Kurir',
}

const NAV_GROUPS = [
  {
    label: null,
    items: [
      { path: 'dashboard', label: 'Dashboard', icon: '⌂', roles: ['frontoffice', 'backoffice'] },
      { path: 'kasir', label: 'Order baru', icon: '+', roles: ['frontoffice'] },
      { path: 'orders', label: 'Semua order', icon: '☷', roles: ['frontoffice', 'backoffice'] },
      { path: 'produksi', label: 'Produksi', icon: '▥', roles: ['frontoffice', 'backoffice'] },
      { path: 'dispatch', label: 'Delivery & dispatch', icon: '🚚', roles: ['frontoffice', 'backoffice'] },
      { path: 'kurir', label: 'Tugas saya', icon: '🛵', roles: ['kurir'] },
      { path: 'dispute', label: 'Dispute', icon: '⚠', roles: ['frontoffice', 'backoffice'] },
    ],
  },
  {
    label: 'Back office',
    items: [
      { path: 'inventori', label: 'Inventori (LIFO)', icon: '▣', roles: ['frontoffice', 'backoffice'] },
      { path: 'layanan', label: 'Layanan & resep', icon: '◇', roles: ['backoffice'] },
      { path: 'laporan', label: 'Laporan', icon: '▤', roles: ['backoffice'] },
      { path: 'pesan', label: 'Pesan website', icon: '✉', roles: ['frontoffice', 'backoffice'] },
    ],
  },
  {
    label: 'Admin',
    adminOnly: true,
    items: [
      { path: 'pengguna', label: 'Pengguna', icon: '♙', roles: [] },
      { path: 'pengaturan', label: 'Pengaturan', icon: '⚙', roles: [] },
    ],
  },
]

const PAGE_ACCESS = Object.fromEntries(
  NAV_GROUPS.flatMap((group) =>
    group.items.map((item) => [item.path, item.roles])
  )
)

PAGE_ACCESS.order = ['frontoffice', 'backoffice']

PAGE_ACCESS['dispute'] = ['frontoffice', 'backoffice']

const PAGE_TITLES = {
  dashboard: 'Dashboard',
  kasir: 'Order baru',
  orders: 'Semua order',
  order: 'Detail order',
  produksi: 'Produksi',
  dispatch: 'Delivery & dispatch',
  kurir: 'Tugas saya',
  dispute: 'Dispute',
  inventori: 'Inventori (LIFO)',
  layanan: 'Layanan & resep',
  laporan: 'Laporan',
  pesan: 'Pesan website',
  pengguna: 'Pengguna',
  pengaturan: 'Pengaturan',
}

function canAccess(user, roles = []) {
  return user?.role === 'admin' || roles.includes(user?.role)
}

function Sidebar({
  user,
  info,
  badges,
  currentPath,
  mobileOpen,
  onClose,
  onLogout,
  onPassword,
}) {
  return (
    <aside className={`side ${mobileOpen ? 'open' : ''}`}>
      <Link to="/" target="_blank" className="logo">
        <img src="/favicon.svg" alt="" />
        <span>{info?.business_name || 'Sepatu Kinclong'}</span>
      </Link>

      <nav>
        {NAV_GROUPS.map((group, index) => {
          const visibleItems = group.items.filter(
            (item) =>
              (!group.adminOnly || user.role === 'admin') &&
              canAccess(user, item.roles)
          )

          if (!visibleItems.length) return null

          return (
            <div key={group.label || index}>
              {group.label && (
                <div className="group">{group.label}</div>
              )}

              {visibleItems.map((item) => {
                const active =
                  currentPath === item.path ||
                  (item.path === 'orders' && currentPath === 'order')

                return (
                  <Link
                    key={item.path}
                    to={`/app/${item.path}`}
                    data-nav={item.path}
                    className={active ? 'active' : ''}
                    onClick={onClose}
                  >
                    <span className="nav-icon" aria-hidden="true">
                      {item.icon}
                    </span>

                    <span>{item.label}</span>

                    {badges[item.path] > 0 && (
                      <span className="count">
                        {badges[item.path]}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          )
        })}
      </nav>

      <div className="me">
        <strong>{user.name}</strong>
        <div>{ROLE_NAME[user.role] || user.role}</div>

        <div className="row">
          <button
            className="btn btn-sm"
            onClick={onPassword}
            type="button"
          >
            Ganti password
          </button>

          <button
            className="btn btn-sm"
            onClick={onLogout}
            type="button"
          >
            Keluar
          </button>
        </div>
      </div>
    </aside>
  )
}

export default function DashboardLayout() {
  const navigate = useNavigate()
  const location = useLocation()

  const [user, setUser] = useState(null)
  const [info, setInfo] = useState({})
  const [badges, setBadges] = useState({})
  const [loading, setLoading] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)

  const [showPassword, setShowPassword] = useState(false)
  const [passwordForm, setPasswordForm] = useState({
    old_password: '',
    new_password: '',
  })

  const [passwordError, setPasswordError] = useState('')
  const [notice, setNotice] = useState('')

  const currentPath = location.pathname.split('/')[2] || ''

  const defaultPath =
    user?.role === 'kurir'
      ? '/app/kurir'
      : '/app/dashboard'

  useEffect(() => {
    document.body.classList.add('app')

    return () => {
      document.body.classList.remove('app')
    }
  }, [])

  // Periksa sesi login staf.
  useEffect(() => {
    let active = true

    async function initialize() {
      try {
        const currentUser = await api('/api/auth/me')

        if (!active) return

        setUser(currentUser)

        try {
          const businessInfo = await api('/api/public/info')

          if (active) setInfo(businessInfo)
        } catch {
          // Dashboard tetap bisa dibuka jika info usaha gagal dimuat.
        }
      } catch {
        if (active) {
          navigate('/login', { replace: true })
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    initialize()

    return () => {
      active = false
    }
  }, [navigate])

  // Badge notifikasi sidebar.
  useEffect(() => {
    if (!user || user.role === 'kurir') return

    let active = true

    async function refreshBadges() {
      try {
        const data = await api('/api/dashboard')

        if (!active) return

        setBadges({
          dispute: data.open_disputes || 0,
          dispatch:
            (data.deliveries?.pending || 0) +
            (data.deliveries?.failed || 0),
          pesan: data.unread_messages || 0,
          inventori: data.low_stock?.length || 0,
        })
      } catch {
        // Abaikan kegagalan pembaruan badge.
      }
    }

    refreshBadges()

    const timer = setInterval(refreshBadges, 30000)

    return () => {
      active = false
      clearInterval(timer)
    }
  }, [user])

  // Atur judul tab browser.
  useEffect(() => {
    if (user) {
      document.title = `${PAGE_TITLES[currentPath] || 'Dashboard'} — ${
        info.business_name || 'Sepatu Kinclong'
      }`
    }
  }, [user, info, currentPath])

  async function handleLogout() {
    try {
      await api('/api/auth/logout', {
        method: 'POST',
      })

      navigate('/login', { replace: true })
    } catch (err) {
      setNotice(err.message)
    }
  }

  function openPasswordModal() {
    setPasswordError('')
    setPasswordForm({
      old_password: '',
      new_password: '',
    })
    setShowPassword(true)
  }

  async function handlePasswordChange(event) {
    event.preventDefault()
    setPasswordError('')

    try {
      const result = await api('/api/auth/password', {
        method: 'POST',
        body: passwordForm,
      })

      setShowPassword(false)
      setPasswordForm({
        old_password: '',
        new_password: '',
      })

      setNotice(result.message || 'Password berhasil diubah.')

    } catch (err) {
      setPasswordError(err.message)
    }
  }

  function closeMobileMenu() {
    setMobileOpen(false)
  }

  if (loading) {
    return (
      <div className="empty" style={{ padding: 80 }}>
        <span className="spinner" />
        <p>Memeriksa sesi staf...</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (!currentPath) {
    return <Navigate to={defaultPath} replace />
  }

  const requiredRoles = PAGE_ACCESS[currentPath]

  if (
    requiredRoles === undefined ||
    !canAccess(user, requiredRoles)
  ) {
    return <Navigate to={defaultPath} replace />
  }

  return (
    <div className="shell">
      <Sidebar
        user={user}
        info={info}
        badges={badges}
        currentPath={currentPath}
        mobileOpen={mobileOpen}
        onClose={closeMobileMenu}
        onLogout={handleLogout}
        onPassword={openPasswordModal}
      />

      <div
        className={`scrim ${mobileOpen ? 'on' : ''}`}
        onClick={closeMobileMenu}
      />

      <div className="main">
        <div className="topbar no-print">
          <button
            id="menu-btn"
            type="button"
            aria-label="Buka menu"
            onClick={() => setMobileOpen(true)}
          >
            ☰
          </button>

          <strong>
            {PAGE_TITLES[currentPath] || 'Sepatu Kinclong'}
          </strong>

          {notice && (
            <span className="small muted" role="status">
              {notice}
            </span>
          )}
        </div>

        <div className="content" id="view">
          <Outlet
            context={{
              user,
              info,
              badges,
              setNotice,
            }}
          />
        </div>
      </div>

      {showPassword && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setShowPassword(false)
            }
          }}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="password-title"
          >
            <div className="modal-head">
              <h3 id="password-title">Ganti password</h3>

              <button
                type="button"
                className="x-btn"
                onClick={() => setShowPassword(false)}
                aria-label="Tutup"
              >
                ×
              </button>
            </div>

            <div className="modal-content">
              <form
                className="modal-body"
                onSubmit={handlePasswordChange}
              >
                <div className="field">
                  <label>Password lama</label>
                  <input
                    type="password"
                    autoComplete="current-password"
                    required
                    value={passwordForm.old_password}
                    onChange={(event) =>
                      setPasswordForm((previous) => ({
                        ...previous,
                        old_password: event.target.value,
                      }))
                    }
                  />
                </div>

                <div className="field">
                  <label>Password baru (minimal 6 karakter)</label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={6}
                    value={passwordForm.new_password}
                    onChange={(event) =>
                      setPasswordForm((previous) => ({
                        ...previous,
                        new_password: event.target.value,
                      }))
                    }
                  />
                </div>

                {passwordError && (
                  <p role="alert" style={{ color: 'var(--danger)' }}>
                    {passwordError}
                  </p>
                )}

                <button
                  className="btn btn-primary btn-block"
                  type="submit"
                >
                  Simpan password
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
