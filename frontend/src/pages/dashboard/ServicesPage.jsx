
import { useCallback, useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'

import { api, formatRupiah } from '../../services/api'
import '../../styles/services.css'

function activeStatus(value) {
  return value === true || Number(value) === 1
}

function numberFormat(value) {
  return Number(value || 0).toLocaleString('id-ID')
}

function createEmptyForm() {
  return {
    code: '',
    name: '',
    description: '',
    price: '',
    duration_days: '3',
    sort: '0',
    active: true,
  }
}

export default function ServicesPage() {
  const { user, setNotice } = useOutletContext()

  const canEdit = ['admin', 'backoffice'].includes(user?.role)

  const [services, setServices] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')

  const [dialog, setDialog] = useState(null)
  const [form, setForm] = useState(createEmptyForm())
  const [materials, setMaterials] = useState([])
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const [serviceResult, itemResult] = await Promise.all([
        api('/api/services'),
        api('/api/items'),
      ])

      setServices(Array.isArray(serviceResult) ? serviceResult : [])
      setItems(Array.isArray(itemResult) ? itemResult : [])
    } catch (err) {
      setError(err.message || 'Gagal memuat layanan dan resep.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  function notify(message) {
    if (typeof setNotice === 'function') {
      setNotice(message)
    }
  }

  function openForm(service = null) {
    setFormError('')

    if (service) {
      setForm({
        code: service.code || '',
        name: service.name || '',
        description: service.description || '',
        price: String(service.price ?? ''),
        duration_days: String(service.duration_days ?? 0),
        sort: String(service.sort ?? 0),
        active: activeStatus(service.active),
      })

      setMaterials(
        (service.materials || []).map((material) => ({
          item_id: Number(material.item_id),
          qty: String(material.qty),
        }))
      )
    } else {
      setForm(createEmptyForm())
      setMaterials([])
    }

    setDialog({ service })
  }

  function closeForm() {
    if (saving) return

    setDialog(null)
    setFormError('')
    setMaterials([])
  }

  function updateForm(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  function addMaterial() {
    const usedIds = new Set(
      materials.map((material) => Number(material.item_id))
    )

    const availableItem =
      items.find(
        (item) =>
          activeStatus(item.active) &&
          !usedIds.has(Number(item.id))
      ) ||
      items.find(
        (item) => !usedIds.has(Number(item.id))
      )

    if (!availableItem) {
      setFormError('Semua bahan yang tersedia sudah digunakan dalam resep.')
      return
    }

    setFormError('')

    setMaterials((current) => [
      ...current,
      {
        item_id: Number(availableItem.id),
        qty: '1',
      },
    ])
  }

  function updateMaterial(index, field, value) {
    if (field === 'item_id') {
      const selectedId = Number(value)

      const duplicate = materials.some(
        (material, materialIndex) =>
          materialIndex !== index &&
          Number(material.item_id) === selectedId
      )

      if (duplicate) {
        setFormError('Bahan yang sama tidak boleh dimasukkan dua kali.')
        return
      }
    }

    setFormError('')

    setMaterials((current) =>
      current.map((material, materialIndex) =>
        materialIndex === index
          ? {
              ...material,
              [field]: value,
            }
          : material
      )
    )
  }

  function removeMaterial(index) {
    setMaterials((current) =>
      current.filter((_, materialIndex) => materialIndex !== index)
    )

    setFormError('')
  }

  async function submitForm(event) {
    event.preventDefault()

    const editing = Boolean(dialog?.service)
    const price = Number(form.price)
    const duration = Number(form.duration_days)
    const sort = Number(form.sort)

    if (!form.code.trim() || !form.name.trim()) {
      setFormError('Kode dan nama layanan wajib diisi.')
      return
    }

    if (!Number.isInteger(price) || price < 0) {
      setFormError('Harga layanan harus berupa bilangan bulat dan tidak boleh negatif.')
      return
    }

    if (!Number.isInteger(duration) || duration < 0 || duration > 60) {
      setFormError('Durasi harus berupa bilangan bulat antara 0 sampai 60 hari.')
      return
    }

    if (!Number.isInteger(sort) || sort < 0) {
      setFormError('Urutan harus berupa bilangan bulat dan tidak boleh negatif.')
      return
    }

    const seen = new Set()

    for (const material of materials) {
      const itemId = Number(material.item_id)
      const qty = Number(material.qty)

      if (!Number.isInteger(itemId) || itemId <= 0) {
        setFormError('Pilih bahan yang valid untuk setiap resep.')
        return
      }

      if (!Number.isInteger(qty) || qty < 1) {
        setFormError('Jumlah setiap bahan harus berupa bilangan bulat minimal 1.')
        return
      }

      if (seen.has(itemId)) {
        setFormError('Bahan yang sama tidak boleh dimasukkan dua kali.')
        return
      }

      seen.add(itemId)
    }

    const body = {
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      description: form.description.trim(),
      price,
      duration_days: duration,
      sort,
      active: Boolean(form.active),
      materials: materials.map((material) => ({
        item_id: Number(material.item_id),
        qty: Number(material.qty),
      })),
    }

    setSaving(true)
    setFormError('')

    try {
      await api(
        editing
          ? `/api/services/${dialog.service.id}`
          : '/api/services',
        {
          method: editing ? 'PUT' : 'POST',
          body,
        }
      )

      setDialog(null)
      setMaterials([])

      await loadData()

      notify(
        editing
          ? 'Layanan dan resep berhasil diperbarui.'
          : 'Layanan baru berhasil ditambahkan.'
      )
    } catch (err) {
      setFormError(err.message || 'Gagal menyimpan layanan.')
    } finally {
      setSaving(false)
    }
  }

  const activeCount = services.filter(
    (service) => activeStatus(service.active)
  ).length

  const visibleServices = services.filter((service) => {
    const keyword = search.trim().toLowerCase()

    const matchesSearch =
      !keyword ||
      String(service.code || '').toLowerCase().includes(keyword) ||
      String(service.name || '').toLowerCase().includes(keyword)

    const active = activeStatus(service.active)

    const matchesFilter =
      filter === 'all' ||
      (filter === 'active' && active) ||
      (filter === 'inactive' && !active)

    return matchesSearch && matchesFilter
  })

  return (
    <div className="services-page">
      <div className="page-head services-page-head">
        <div>
          <h1>Layanan &amp; resep bahan</h1>
          <p className="small muted">
            Kelola harga layanan, durasi, dan kebutuhan bahan untuk setiap pasang sepatu.
          </p>
        </div>

        {canEdit && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => openForm()}
          >
            + Layanan
          </button>
        )}
      </div>

      <div className="services-info">
        <strong>Resep bahan atau Bill of Materials (BOM)</strong>
        <p>
          Kebutuhan bahan dihitung per pasang. Saat order mulai dicuci,
          backend akan memotong stok secara otomatis menggunakan metode
          LIFO. Estimasi HPP memakai harga batch bahan terbaru.
        </p>
      </div>

      <div className="services-summary">
        <div className="card kpi">
          <div className="label">Total layanan</div>
          <div className="value">{services.length}</div>
          <div className="sub">Layanan terdaftar</div>
        </div>

        <div className="card kpi">
          <div className="label">Layanan aktif</div>
          <div className="value">{activeCount}</div>
          <div className="sub">Tersedia di website dan kasir</div>
        </div>

        <div className="card kpi">
          <div className="label">Bahan terdaftar</div>
          <div className="value">{items.length}</div>
          <div className="sub">Jenis bahan inventori</div>
        </div>
      </div>

      <div className="card services-list-card">
        <div className="services-toolbar">
          <div>
            <h3>Daftar layanan</h3>
            <p className="small muted">
              Pilih layanan untuk mengubah harga atau komposisi resep.
            </p>
          </div>

          <div className="services-filters">
            <input
              type="search"
              aria-label="Cari layanan"
              placeholder="Cari kode atau nama layanan..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />

            <select
              aria-label="Filter layanan"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            >
              <option value="all">Semua layanan</option>
              <option value="active">Layanan aktif</option>
              <option value="inactive">Layanan nonaktif</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="services-state">
            <span className="spinner" />
            <p>Memuat layanan dan resep...</p>
          </div>
        ) : error ? (
          <div className="services-state services-error" role="alert">
            <p>{error}</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={loadData}
            >
              Coba lagi
            </button>
          </div>
        ) : visibleServices.length === 0 ? (
          <div className="services-state">
            <h3>Tidak ada layanan ditemukan</h3>
            <p className="muted">
              Coba ubah kata pencarian atau filter layanan.
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="services-table">
              <thead>
                <tr>
                  <th>Layanan</th>
                  <th className="right">Harga / pasang</th>
                  <th>Durasi</th>
                  <th>Resep per pasang</th>
                  <th className="right">Estimasi HPP</th>
                  <th className="right">Margin</th>
                  <th>Status</th>
                  {canEdit && <th>Aksi</th>}
                </tr>
              </thead>

              <tbody>
                {visibleServices.map((service) => {
                  const active = activeStatus(service.active)
                  const marginPercentage = service.price
                    ? Math.round(
                        (service.est_margin / service.price) * 100
                      )
                    : 0

                  return (
                    <tr
                      key={service.id}
                      className={!active ? 'services-inactive-row' : ''}
                    >
                      <td>
                        <strong>{service.name}</strong>
                        <div className="small muted mono">
                          {service.code}
                        </div>
                        {service.description && (
                          <div className="small muted services-description">
                            {service.description}
                          </div>
                        )}
                      </td>

                      <td className="right nowrap">
                        {formatRupiah(service.price)}
                      </td>

                      <td className="nowrap">
                        {numberFormat(service.duration_days)} hari
                      </td>

                      <td>
                        {service.materials?.length ? (
                          <div className="services-recipe-list">
                            {service.materials.map((material) => (
                              <div key={material.item_id}>
                                {material.name}{' '}
                                <strong>{numberFormat(material.qty)}</strong>{' '}
                                {material.unit}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="small muted">Belum ada resep</span>
                        )}
                      </td>

                      <td className="right nowrap">
                        {formatRupiah(service.est_material_cost)}
                      </td>

                      <td className="right nowrap">
                        <strong>{formatRupiah(service.est_margin)}</strong>
                        <div className="small muted">
                          {marginPercentage}%
                        </div>
                      </td>

                      <td>
                        {active ? (
                          <span className="badge b-ok">Aktif</span>
                        ) : (
                          <span className="badge plain">Nonaktif</span>
                        )}
                      </td>

                      {canEdit && (
                        <td>
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            aria-label={`Ubah ${service.name}`}
                            onClick={() => openForm(service)}
                          >
                            Ubah
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && (
          <div className="services-list-footer">
            Menampilkan {visibleServices.length} dari {services.length} layanan.
          </div>
        )}
      </div>

      {dialog && (
        <div
          className="services-modal-backdrop"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !saving
            ) {
              closeForm()
            }
          }}
        >
          <section
            className="services-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="services-form-title"
          >
            <div className="services-modal-header">
              <div>
                <h2 id="services-form-title">
                  {dialog.service
                    ? `Ubah ${dialog.service.name}`
                    : 'Layanan baru'}
                </h2>

                <p className="small muted">
                  Harga dan resep dihitung untuk setiap pasang sepatu.
                </p>
              </div>

              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={closeForm}
                disabled={saving}
                aria-label="Tutup form"
              >
                ✕
              </button>
            </div>

            <form className="services-modal-body" onSubmit={submitForm}>
              <div className="services-form-grid">
                <label className="field">
                  <span>Kode layanan</span>
                  <input
                    name="code"
                    required
                    maxLength={10}
                    value={form.code}
                    onChange={(event) =>
                      updateForm('code', event.target.value)
                    }
                    placeholder="Contoh: DEEP"
                  />
                </label>

                <label className="field">
                  <span>Nama layanan</span>
                  <input
                    name="name"
                    required
                    maxLength={80}
                    value={form.name}
                    onChange={(event) =>
                      updateForm('name', event.target.value)
                    }
                    placeholder="Contoh: Deep Cleaning"
                  />
                </label>
              </div>

              <label className="field">
                <span>Deskripsi</span>
                <textarea
                  name="description"
                  maxLength={400}
                  rows={3}
                  value={form.description}
                  onChange={(event) =>
                    updateForm('description', event.target.value)
                  }
                  placeholder="Deskripsi layanan yang tampil di website."
                />
              </label>

              <div className="services-form-grid services-form-grid-three">
                <label className="field">
                  <span>Harga per pasang (Rp)</span>
                  <input
                    name="price"
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={form.price}
                    onChange={(event) =>
                      updateForm('price', event.target.value)
                    }
                  />
                </label>

                <label className="field">
                  <span>Durasi (hari)</span>
                  <input
                    name="duration_days"
                    type="number"
                    min="0"
                    max="60"
                    step="1"
                    required
                    value={form.duration_days}
                    onChange={(event) =>
                      updateForm('duration_days', event.target.value)
                    }
                  />
                </label>

                <label className="field">
                  <span>Urutan</span>
                  <input
                    name="sort"
                    type="number"
                    min="0"
                    step="1"
                    value={form.sort}
                    onChange={(event) =>
                      updateForm('sort', event.target.value)
                    }
                  />
                </label>
              </div>

              <label className="services-checkbox">
                <input
                  name="active"
                  type="checkbox"
                  checked={form.active}
                  onChange={(event) =>
                    updateForm('active', event.target.checked)
                  }
                />
                <span>
                  Aktif (ditampilkan di website dan kasir)
                </span>
              </label>

              <div className="services-recipe-editor">
                <div className="services-recipe-heading">
                  <div>
                    <h3>Resep bahan per pasang</h3>
                    <p className="small muted">
                      Masukkan kebutuhan bahan untuk satu pasang sepatu.
                    </p>
                  </div>

                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={addMaterial}
                    disabled={items.length === materials.length}
                  >
                    + Bahan
                  </button>
                </div>

                {materials.length === 0 ? (
                  <div className="services-no-recipe">
                    Belum ada bahan dalam resep.
                  </div>
                ) : (
                  <div className="services-material-rows">
                    {materials.map((material, index) => (
                      <div
                        className="services-material-row"
                        key={`${index}-${material.item_id}`}
                      >
                        <label className="field">
                          <span>Bahan {index + 1}</span>

                          <select
                            name="item_id"
                            aria-label={`Bahan resep ${index + 1}`}
                            value={material.item_id}
                            onChange={(event) =>
                              updateMaterial(
                                index,
                                'item_id',
                                event.target.value
                              )
                            }
                          >
                            {items.map((item) => (
                              <option
                                key={item.id}
                                value={item.id}
                                disabled={
                                  materials.some(
                                    (other, otherIndex) =>
                                      otherIndex !== index &&
                                      Number(other.item_id) === Number(item.id)
                                  )
                                }
                              >
                                {item.name} ({item.unit})
                                {!activeStatus(item.active)
                                  ? ' - nonaktif'
                                  : ''}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="field">
                          <span>Jumlah ({items.find(
                            (item) =>
                              Number(item.id) === Number(material.item_id)
                          )?.unit || 'unit'})</span>

                          <input
                            name="qty"
                            type="number"
                            min="1"
                            step="1"
                            aria-label={`Jumlah bahan ${index + 1}`}
                            value={material.qty}
                            onChange={(event) =>
                              updateMaterial(
                                index,
                                'qty',
                                event.target.value
                              )
                            }
                          />
                        </label>

                        <button
                          type="button"
                          className="btn btn-ghost btn-sm services-remove-material"
                          aria-label={`Hapus bahan ${index + 1}`}
                          onClick={() => removeMaterial(index)}
                        >
                          Hapus
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {items.length === 0 && (
                  <p className="small muted">
                    Belum ada barang inventori. Tambahkan barang terlebih dahulu
                    sebelum membuat resep.
                  </p>
                )}
              </div>

              {formError && (
                <div className="services-error" role="alert">
                  {formError}
                </div>
              )}

              <div className="services-form-actions">
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
                  {saving ? 'Menyimpan...' : 'Simpan layanan'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}
