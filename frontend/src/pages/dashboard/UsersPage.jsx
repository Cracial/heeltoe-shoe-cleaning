import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'

import { api } from '../../services/api'
import '../../styles/users.css'

const ROLE_LABELS = {
  admin: 'Admin / pemilik',
  frontoffice: 'Front office',
  backoffice: 'Back office',
  kurir: 'Kurir',
}

const PERMISSION_ROWS = [
  ['Order baru, kasir, pembayaran', 'âœ“', 'â€”', 'â€”'],
  ['Ubah status produksi', 'âœ“', 'âœ“', 'â€”'],
  ['Delivery & dispatch', 'âœ“', 'âœ“', 'Tugas sendiri'],
  ['Dispute', 'âœ“', 'âœ“', 'â€”'],
  ['Inventori', 'Lihat', 'âœ“', 'â€”'],
  ['Layanan & resep, laporan', 'â€”', 'âœ“', 'â€”'],
  ['Pengguna & pengaturan', 'â€”', 'â€”', 'â€”'],
]

function isActive(value) {
  return value === true || Number(value) === 1
}

function createEmptyForm() {
  return {
    name: '',
    username: '',
    role: 'frontoffice',
    phone: '',
    password: '',
    active: true,
  }
}

function formatDate(value) {
  if (!value) return 'â€”'

  const date = new Date(String(value).replace(' ', 'T'))

  if (Number.isNaN(date.getTime())) return String(value)

  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export default function UsersPage() {
  const { user, setNotice } = useOutletContext()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(createEmptyForm())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const isEditingSelf = Number(editingId) === Number(user?.id)

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const result = await api('/api/users')
      setUsers(Array.isArray(result) ? result : [])
    } catch (err) {
      setError(err.message || 'Gagal memuat daftar pengguna.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  const filteredUsers = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('id-ID')

    return users.filter((item) => {
      const matchesSearch = !keyword || [
        item.name,
        item.username,
        item.phone,
      ].some((value) => String(value || '').toLocaleLowerCase('id-ID').includes(keyword))

      const active = isActive(item.active)
      const matchesFilter =
        filter === 'all' ||
        (filter === 'active' && active) ||
        (filter === 'inactive' && !active)

      return matchesSearch && matchesFilter
    })
  }, [users, search, filter])

  const activeCount = users.filter((item) => isActive(item.active)).length
  const inactiveCount = users.length - activeCount

  function notify(message) {
    if (typeof setNotice === 'function') setNotice(message)
  }

  function openCreateForm() {
    setEditingId(null)
    setForm(createEmptyForm())
    setFormError('')
    setFormOpen(true)
  }

  function openEditForm(item) {
    setEditingId(item.id)
    setForm({
      name: item.name || '',
      username: item.username || '',
      role: item.role || 'frontoffice',
      phone: item.phone || '',
      password: '',
      active: isActive(item.active),
    })
    setFormError('')
    setFormOpen(true)
  }

  function closeForm() {
    if (saving) return
    setFormOpen(false)
    setEditingId(null)
    setForm(createEmptyForm())
    setFormError('')
  }

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function saveUser(event) {
    event.preventDefault()
    setFormError('')

    const name = form.name.trim()
    const username = form.username.trim()
    const password = form.password

    if (!name) {
      setFormError('Nama pengguna wajib diisi.')
      return
    }

    if (!editingId && !/^[a-zA-Z0-9_.]{3,40}$/.test(username)) {
      setFormError('Username harus 3â€“40 karakter dan hanya berisi huruf, angka, titik, atau garis bawah.')
      return
    }

    if (!editingId && password.length < 6) {
      setFormError('Password minimal 6 karakter.')
      return
    }

    if (editingId && password && password.length < 6) {
      setFormError('Password baru minimal 6 karakter atau kosongkan jika tidak ingin mengubahnya.')
      return
    }

    const payload = {
      name,
      role: isEditingSelf ? 'admin' : form.role,
      phone: form.phone.trim(),
      active: isEditingSelf ? true : Boolean(form.active),
    }

    if (!editingId) {
      payload.username = username
      payload.password = password
    } else if (password) {
      payload.password = password
    }

    setSaving(true)

    try {
      if (editingId) {
        await api(`/api/users/${editingId}`, {
          method: 'PUT',
          body: payload,
        })
        notify('Data pengguna berhasil diperbarui.')
      } else {
        await api('/api/users', {
          method: 'POST',
          body: payload,
        })
        notify('Pengguna baru berhasil ditambahkan.')
      }

      setFormOpen(false)
      setEditingId(null)
      setForm(createEmptyForm())
      await loadUsers()
    } catch (err) {
      setFormError(err.message || 'Gagal menyimpan pengguna.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="users-page">
      <div className="page-head">
        <div>
          <h1>Pengguna &amp; peran</h1>
          <p className="muted small">Kelola akun staf dan hak akses sistem.</p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={openCreateForm}
        >
          + Pengguna
        </button>
      </div>

      <div className="users-summary">
        <div className="users-summary-card">
          <span>Total pengguna</span>
          <strong>{users.length}</strong>
        </div>
        <div className="users-summary-card">
          <span>Aktif</span>
          <strong>{activeCount}</strong>
        </div>
        <div className="users-summary-card">
          <span>Nonaktif</span>
          <strong>{inactiveCount}</strong>
        </div>
      </div>

      {formOpen && (
        <section className="card users-editor" aria-label="Form pengguna">
          <div className="card-head">
            <h3>{editingId ? 'Ubah pengguna' : 'Pengguna baru'}</h3>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={closeForm}
              disabled={saving}
            >
              Tutup
            </button>
          </div>

          <form className="users-form" onSubmit={saveUser}>
            <div className="users-form-grid">
              <div className="field">
                <label htmlFor="user-name">Nama</label>
                <input
                  id="user-name"
                  name="name"
                  required
                  maxLength={80}
                  value={form.name}
                  onChange={(event) => updateForm('name', event.target.value)}
                />
              </div>

              {!editingId && (
                <div className="field">
                  <label htmlFor="user-username">Username</label>
                  <input
                    id="user-username"
                    name="username"
                    required
                    minLength={3}
                    maxLength={40}
                    autoCapitalize="none"
                    autoComplete="off"
                    pattern="[a-zA-Z0-9_.]+"
                    value={form.username}
                    onChange={(event) => updateForm('username', event.target.value)}
                  />
                </div>
              )}

              <div className="field">
                <label htmlFor="user-role">Peran</label>
                <select
                  id="user-role"
                  name="role"
                  value={form.role}
                  disabled={isEditingSelf}
                  onChange={(event) => updateForm('role', event.target.value)}
                >
                  {Object.entries(ROLE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="user-phone">Nomor HP</label>
                <input
                  id="user-phone"
                  name="phone"
                  type="tel"
                  maxLength={20}
                  value={form.phone}
                  onChange={(event) => updateForm('phone', event.target.value)}
                />
              </div>

              <div className="field users-password-field">
                <label htmlFor="user-password">
                  {editingId ? 'Password baru (opsional)' : 'Password'}
                </label>
                <input
                  id="user-password"
                  name="password"
                  type="password"
                  required={!editingId}
                  minLength={6}
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(event) => updateForm('password', event.target.value)}
                  placeholder={editingId ? 'Kosongkan jika tidak diubah' : 'Minimal 6 karakter'}
                />
              </div>
            </div>

            {editingId && (
              <label className="users-active-toggle">
                <input
                  id="user-active"
                  name="active"
                  type="checkbox"
                  checked={isEditingSelf ? true : form.active}
                  disabled={isEditingSelf}
                  onChange={(event) => updateForm('active', event.target.checked)}
                />
                <span>Akun aktif</span>
              </label>
            )}

            {isEditingSelf && (
              <p className="users-own-account-note">
                Peran dan status akun admin yang sedang digunakan tidak dapat diubah dari sini.
              </p>
            )}

            {formError && (
              <div className="alert-box danger" role="alert">{formError}</div>
            )}

            <div className="users-form-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={closeForm}
                disabled={saving}
              >
                Batal
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={saving}
              >
                {saving ? 'Menyimpan...' : 'Simpan pengguna'}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="card users-list-card">
        <div className="card-head users-list-head">
          <h3>Daftar pengguna</h3>
          <span className="small muted">{filteredUsers.length} dari {users.length} akun</span>
        </div>

        <div className="users-toolbar">
          <input
            type="search"
            aria-label="Cari pengguna"
            placeholder="Cari nama, username, atau nomor HP..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            aria-label="Filter status pengguna"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="all">Semua status</option>
            <option value="active">Aktif</option>
            <option value="inactive">Nonaktif</option>
          </select>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={loadUsers}
            disabled={loading}
          >
            Muat ulang
          </button>
        </div>

        {loading ? (
          <div className="users-state muted" role="status">Memuat daftar pengguna...</div>
        ) : error ? (
          <div className="users-state">
            <div className="alert-box danger" role="alert">{error}</div>
            <button type="button" className="btn btn-primary btn-sm" onClick={loadUsers}>
              Coba lagi
            </button>
          </div>
        ) : (
          <div className="table-wrap users-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nama</th>
                  <th>Username</th>
                  <th>Peran</th>
                  <th>HP</th>
                  <th>Status</th>
                  <th>Dibuat</th>
                  <th className="right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length ? filteredUsers.map((item) => (
                  <tr key={item.id} data-user-id={item.id}>
                    <td><strong>{item.name}</strong></td>
                    <td className="mono">{item.username}</td>
                    <td>{ROLE_LABELS[item.role] || item.role}</td>
                    <td>{item.phone || 'â€”'}</td>
                    <td>
                      {isActive(item.active)
                        ? <span className="badge b-ok">Aktif</span>
                        : <span className="badge">Nonaktif</span>}
                    </td>
                    <td className="small muted">{formatDate(item.created_at)}</td>
                    <td className="right">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => openEditForm(item)}
                      >
                        Ubah
                      </button>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={7} className="users-empty muted">
                      {users.length ? 'Tidak ada pengguna yang sesuai dengan pencarian.' : 'Belum ada pengguna.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card users-permissions-card">
        <div className="card-head">
          <h3>Hak akses per peran</h3>
        </div>
        <div className="card-body">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fitur</th>
                  <th className="center">Front office</th>
                  <th className="center">Back office</th>
                  <th className="center">Kurir</th>
                </tr>
              </thead>
              <tbody>
                {PERMISSION_ROWS.map((row) => (
                  <tr key={row[0]}>
                    {row.map((value, index) => (
                      <td key={`${row[0]}-${index}`} className={index ? 'center' : ''}>
                        {value}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted users-permissions-note">
            Admin/pemilik dapat mengakses semua fitur.
          </p>
        </div>
      </section>
    </div>
  )
}