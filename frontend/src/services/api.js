
export async function api(path, { method = 'GET', body } = {}) {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined
      ? { 'Content-Type': 'application/json' }
      : {},
    body: body !== undefined
      ? JSON.stringify(body)
      : undefined,
  })

  let data = null

  try {
    data = await response.json()
  } catch {
    // Respons bukan JSON
  }

  if (!response.ok) {
    const error = new Error(
      data?.error || `Permintaan gagal (${response.status})`
    )

    error.status = response.status
    error.data = data

    throw error
  }

  return data
}

export function formatRupiah(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0)
}