// Aplikasi staf — back office & admin: inventori LIFO, layanan & resep, laporan, pesan, pengguna, pengaturan.
(function () {
  const { esc, rp, tgl, phoneLocal, wa, api, toast, modal, formData, withBusy } = window.SK;
  const App = window.App;
  const num = (n, d = 0) => Number(n || 0).toLocaleString('id-ID', { maximumFractionDigits: d });

  // ---------- Inventori ----------
  App.register('inventori', {
    title: 'Inventori (LIFO)',
    async render(el) {
      const canEdit = App.can('backoffice');
      const items = await api('/api/items');
      const total = items.reduce((s, i) => s + i.stock_value, 0);
      const low = items.filter((i) => i.active && i.stock <= i.min_stock);
      el.innerHTML = `<div class="page-head"><h1>Inventori bahan</h1><div class="actions">${canEdit ? '<button class="btn btn-primary" id="add">+ Barang baru</button>' : ''}</div></div>
        <div class="alert-box info">Metode <strong>LIFO</strong> (Last In, First Out): saat order mulai dicuci, bahan diambil dari batch pembelian <em>terbaru</em> lebih dulu, sehingga HPP mengikuti harga beli terakhir. Sisa stok dinilai dengan harga batch lama.</div>
        <div class="kpis">
          <div class="kpi"><div class="label">Nilai persediaan</div><div class="value">${rp(total)}</div><div class="sub">${items.length} jenis barang</div></div>
          <div class="kpi ${low.length ? 'alert' : ''}"><div class="label">Stok menipis</div><div class="value">${low.length}</div><div class="sub">${low.map((i) => esc(i.name)).slice(0, 2).join(', ') || 'semua aman'}</div></div>
        </div>
        <div class="card"><div class="table-wrap"><table><thead><tr><th>SKU</th><th>Barang</th><th class="right">Stok</th><th class="right">Min.</th><th class="right">Harga terakhir</th><th class="right">Nilai stok</th><th></th></tr></thead><tbody>
        ${items.map((i) => `<tr class="clickable" data-id="${i.id}" style="${i.active ? '' : 'opacity:.5'}"><td class="mono small">${esc(i.sku)}</td><td><strong>${esc(i.name)}</strong>${!i.active ? ' <span class="badge plain">nonaktif</span>' : ''}</td>
          <td class="right nowrap">${i.stock <= i.min_stock && i.active ? `<span class="badge b-danger">${num(i.stock)} ${esc(i.unit)}</span>` : `${num(i.stock)} ${esc(i.unit)}`}</td><td class="right small">${num(i.min_stock)}</td>
          <td class="right small nowrap">${i.last_cost != null ? `${rp(i.last_cost)}/${esc(i.unit)}` : '—'}</td><td class="right nowrap">${rp(i.stock_value)}</td>
          <td class="right nowrap">${canEdit ? `<button class="btn btn-sm btn-primary" data-in="${i.id}">+ Masuk</button>` : ''}</td></tr>`).join('')}
        </tbody></table></div></div>`;
      el.querySelector('tbody').addEventListener('click', (e) => {
        const bin = e.target.closest('[data-in]');
        if (bin) return stockIn(items.find((i) => i.id === Number(bin.dataset.in)));
        const tr = e.target.closest('tr[data-id]');
        if (tr) itemDetail(Number(tr.dataset.id));
      });
      const add = el.querySelector('#add');
      if (add) add.onclick = () => itemForm();
    },
  });

  function stockIn(item, after) {
    const m = modal({ title: `Barang masuk: ${item.name}`, content: `<form class="modal-body">
      <div class="field-row"><div class="field"><label>Jumlah (${esc(item.unit)})</label><input name="qty" type="number" min="1" required></div>
      <div class="field"><label>Total harga beli (Rp)</label><input name="total_cost" type="number" min="0" required></div></div>
      <div class="hint" id="per" style="margin:-6px 0 12px">Harga per ${esc(item.unit)}: —</div>
      <div class="field"><label>Supplier</label><input name="supplier" maxlength="100"></div>
      <div class="field"><label>Catatan</label><input name="note" maxlength="200" placeholder="No. faktur, dll"></div>
      <button class="btn btn-primary btn-block">Simpan sebagai batch baru</button></form>` });
    const f = m.el.querySelector('form');
    const per = () => { const q = Number(f.qty.value), t = Number(f.total_cost.value); m.el.querySelector('#per').textContent = `Harga per ${item.unit}: ${q && t ? rp(t / q) + (t / q < 100 ? ` (${(t / q).toFixed(2)})` : '') : '—'}`; };
    f.qty.oninput = per; f.total_cost.oninput = per;
    f.onsubmit = (e) => { e.preventDefault(); withBusy(f.querySelector('button'), async () => {
      try { await api(`/api/items/${item.id}/stock-in`, { method: 'POST', body: formData(f) }); m.close(); toast('Stok masuk tercatat', 'ok'); after ? after() : App.refresh(); }
      catch (err) { toast(err.message, 'err'); }
    }); };
  }

  function itemForm(item) {
    const m = modal({ title: item ? 'Ubah barang' : 'Barang baru', content: `<form class="modal-body">
      <div class="field-row"><div class="field"><label>SKU</label><input name="sku" required maxlength="30" value="${esc(item ? item.sku : '')}"></div>
      <div class="field"><label>Satuan terkecil</label><input name="unit" required maxlength="10" value="${esc(item ? item.unit : 'ml')}" placeholder="ml / gr / pcs"></div></div>
      <div class="field"><label>Nama barang</label><input name="name" required maxlength="100" value="${esc(item ? item.name : '')}"></div>
      <div class="field"><label>Stok minimum (peringatan)</label><input name="min_stock" type="number" min="0" value="${item ? item.min_stock : 0}"></div>
      ${item ? `<label class="check" style="margin-bottom:14px"><input type="checkbox" name="active" ${item.active ? 'checked' : ''}> Aktif</label>` : `
      <div class="field-row"><div class="field"><label>Stok awal (opsional)</label><input name="initial_qty" type="number" min="0"></div><div class="field"><label>Harga per satuan</label><input name="initial_cost" type="number" min="0" step="any"></div></div>`}
      <button class="btn btn-primary btn-block">Simpan</button></form>` });
    const f = m.el.querySelector('form');
    f.onsubmit = (e) => { e.preventDefault(); const v = formData(f); if (!item) v.active = true; withBusy(f.querySelector('button'), async () => {
      try { await api(item ? `/api/items/${item.id}` : '/api/items', { method: item ? 'PUT' : 'POST', body: v }); m.close(); toast('Tersimpan', 'ok'); App.refresh(); }
      catch (err) { toast(err.message, 'err'); }
    }); };
  }

  async function itemDetail(id) {
    const it = await api('/api/items/' + id);
    const canEdit = App.can('backoffice');
    const MT = { IN: ['Masuk', 'b-ok'], OUT: ['Keluar', 'b-info'], ADJ_IN: ['Opname +', 'b-sun'], ADJ_OUT: ['Opname −', 'b-danger'] };
    const m = modal({ title: it.name, wide: true, content: `<div class="modal-body">
      <div class="kpis" style="grid-template-columns:repeat(3,1fr)"><div class="kpi"><div class="label">Stok</div><div class="value">${num(it.stock)} ${esc(it.unit)}</div></div><div class="kpi"><div class="label">Nilai</div><div class="value">${rp(it.stock_value)}</div></div><div class="kpi"><div class="label">Dipakai di</div><div class="value">${it.used_by.length}</div><div class="sub">${it.used_by.map((s) => esc(s.name)).join(', ') || '—'}</div></div></div>
      ${canEdit ? `<div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap"><button class="btn btn-primary btn-sm" id="i-in">+ Barang masuk</button><button class="btn btn-ghost btn-sm" id="i-adj">Stok opname / penyesuaian</button><button class="btn btn-ghost btn-sm" id="i-edit">Ubah data</button></div>` : ''}
      <h4>Lapisan stok (urutan pemakaian LIFO)</h4>
      ${it.layers.length ? `<div class="table-wrap"><table><thead><tr><th>#</th><th>Tanggal masuk</th><th class="right">Sisa / masuk</th><th class="right">Harga</th><th>Supplier</th></tr></thead><tbody>
        ${it.layers.map((l, i) => `<tr class="${i === 0 ? 'layer-first' : ''}"><td>${i === 0 ? '<span class="badge b-brand">dipakai berikutnya</span>' : i + 1}</td><td class="small">${tgl(l.received_at)}</td><td class="right">${num(l.qty_remaining)} / ${num(l.qty_in)}</td><td class="right nowrap">${rp(l.unit_cost)}</td><td class="small">${esc(l.supplier || '—')}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted">Stok kosong.</p>'}
      <h4 style="margin-top:18px">Kartu stok</h4>
      <div class="table-wrap" style="max-height:320px;overflow-y:auto"><table><thead><tr><th>Waktu</th><th>Jenis</th><th class="right">Qty</th><th class="right">Harga</th><th>Keterangan</th></tr></thead><tbody>
        ${it.moves.map((mv) => `<tr><td class="small nowrap">${tgl(mv.created_at)}</td><td><span class="badge ${MT[mv.type][1]}">${MT[mv.type][0]}</span></td><td class="right">${mv.type.endsWith('OUT') ? '−' : '+'}${num(mv.qty)}</td><td class="right small nowrap">${rp(mv.unit_cost)} <span class="muted">· batch #${mv.batch_id}</span></td>
          <td class="small">${mv.order_code ? `<a href="#/order/${mv.ref_id}" data-close>${esc(mv.order_code)}</a>` : esc(mv.note || '')}${mv.user_name ? `<span class="muted"> · ${esc(mv.user_name)}</span>` : ''}</td></tr>`).join('')}
      </tbody></table></div></div>` });
    m.el.querySelectorAll('a[data-close]').forEach((a) => a.addEventListener('click', m.close));
    if (canEdit) {
      m.el.querySelector('#i-in').onclick = () => { m.close(); stockIn(it, () => itemDetail(id)); };
      m.el.querySelector('#i-edit').onclick = () => { m.close(); itemForm(it); };
      m.el.querySelector('#i-adj').onclick = () => {
        m.close();
        const a = modal({ title: `Penyesuaian stok: ${it.name}`, content: `<form class="modal-body">
          <p class="small muted">Stok di sistem: <strong>${num(it.stock)} ${esc(it.unit)}</strong>. Isi stok hasil hitung fisik — selisihnya dicatat otomatis (pengurangan memakai LIFO).</p>
          <div class="field"><label>Stok fisik (${esc(it.unit)})</label><input name="physical" type="number" min="0" required></div>
          <div class="hint" id="diff" style="margin:-6px 0 12px"></div>
          <div class="field"><label>Alasan</label><input name="note" required maxlength="200" placeholder="Stok opname bulanan, tumpah, rusak…"></div>
          <button class="btn btn-primary btn-block">Simpan penyesuaian</button></form>` });
        const f = a.el.querySelector('form');
        f.physical.oninput = () => { const d = Number(f.physical.value) - it.stock; a.el.querySelector('#diff').textContent = f.physical.value === '' ? '' : d === 0 ? 'Tidak ada selisih' : `Selisih ${d > 0 ? '+' : ''}${num(d)} ${it.unit}`; };
        f.onsubmit = (e) => { e.preventDefault(); const qty = Number(f.physical.value) - it.stock; if (!qty) return toast('Tidak ada selisih'); withBusy(f.querySelector('button'), async () => {
          try { await api(`/api/items/${id}/adjust`, { method: 'POST', body: { qty, note: f.note.value } }); a.close(); toast('Stok disesuaikan', 'ok'); App.refresh(); }
          catch (err) { toast(err.message, 'err'); }
        }); };
      };
    }
  }

  // ---------- Layanan & resep ----------
  App.register('layanan', {
    title: 'Layanan & resep',
    async render(el) {
      const [services, items] = await Promise.all([api('/api/services'), api('/api/items')]);
      el.innerHTML = `<div class="page-head"><h1>Layanan &amp; resep bahan</h1><button class="btn btn-primary" id="add">+ Layanan</button></div>
        <p class="muted small">Resep (BOM) menentukan bahan yang dipotong otomatis dari stok per pasang saat order mulai dicuci. Estimasi HPP memakai harga batch terbaru (LIFO).</p>
        <div class="card"><div class="table-wrap"><table><thead><tr><th>Layanan</th><th class="right">Harga</th><th>Durasi</th><th>Resep per pasang</th><th class="right">Est. HPP</th><th class="right">Margin</th></tr></thead><tbody>
        ${services.map((s) => `<tr class="clickable" data-id="${s.id}" style="${s.active ? '' : 'opacity:.5'}"><td><strong>${esc(s.name)}</strong> <span class="mono small muted">${esc(s.code)}</span>${s.active ? '' : ' <span class="badge plain">nonaktif</span>'}<div class="small muted">${esc(s.description || '')}</div></td>
          <td class="right nowrap">${rp(s.price)}</td><td class="nowrap">${s.duration_days} hari</td><td class="small">${s.materials.map((m) => `${esc(m.name)} ${m.qty} ${esc(m.unit)}`).join('<br>') || '<span class="muted">—</span>'}</td>
          <td class="right nowrap">${rp(s.est_material_cost)}</td><td class="right nowrap">${rp(s.est_margin)}<div class="small muted">${s.price ? Math.round(s.est_margin / s.price * 100) : 0}%</div></td></tr>`).join('')}
        </tbody></table></div></div>`;
      el.querySelector('#add').onclick = () => serviceForm(null, items);
      el.querySelector('tbody').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) serviceForm(services.find((s) => s.id === Number(tr.dataset.id)), items); });
    },
  });

  function serviceForm(s, items) {
    const mats = s ? s.materials.map((m) => ({ item_id: m.item_id, qty: m.qty })) : [];
    const m = modal({ title: s ? `Ubah ${s.name}` : 'Layanan baru', wide: true, content: `<form class="modal-body">
      <div class="field-row"><div class="field"><label>Kode</label><input name="code" required maxlength="10" value="${esc(s ? s.code : '')}"></div><div class="field"><label>Nama</label><input name="name" required value="${esc(s ? s.name : '')}"></div></div>
      <div class="field"><label>Deskripsi (tampil di website)</label><input name="description" maxlength="400" value="${esc(s ? s.description || '' : '')}"></div>
      <div class="field-row"><div class="field"><label>Harga / pasang</label><input name="price" type="number" min="0" required value="${s ? s.price : ''}"></div><div class="field"><label>Durasi (hari)</label><input name="duration_days" type="number" min="0" required value="${s ? s.duration_days : 3}"></div><div class="field"><label>Urutan</label><input name="sort" type="number" min="0" value="${s ? s.sort : 0}"></div></div>
      <label class="check" style="margin-bottom:14px"><input type="checkbox" name="active" ${!s || s.active ? 'checked' : ''}> Aktif (tampil di website & kasir)</label>
      <h4>Resep bahan per pasang</h4><div id="mats"></div><button type="button" class="btn btn-ghost btn-sm" id="am">+ Bahan</button>
      <button class="btn btn-primary btn-block" style="margin-top:16px" type="submit">Simpan</button></form>` });
    const box = m.el.querySelector('#mats');
    const draw = () => {
      box.innerHTML = mats.map((x, i) => `<div style="display:grid;grid-template-columns:1fr 110px 40px;gap:8px;margin-bottom:8px" data-i="${i}">
        <select data-k="item_id">${items.map((it) => `<option value="${it.id}" ${it.id === Number(x.item_id) ? 'selected' : ''}>${esc(it.name)} (${esc(it.unit)})</option>`).join('')}</select>
        <input data-k="qty" type="number" min="1" value="${x.qty}"><button type="button" class="btn btn-ghost btn-sm" data-rm="${i}">✕</button></div>`).join('') || '<p class="small muted">Belum ada bahan.</p>';
    };
    box.addEventListener('input', (e) => { const r = e.target.closest('[data-i]'); if (r && e.target.dataset.k) mats[r.dataset.i][e.target.dataset.k] = Number(e.target.value); });
    box.addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (b) { mats.splice(Number(b.dataset.rm), 1); draw(); } });
    m.el.querySelector('#am').onclick = () => { mats.push({ item_id: items[0].id, qty: 10 }); draw(); };
    const f = m.el.querySelector('form');
    f.onsubmit = (e) => { e.preventDefault(); withBusy(f.querySelector('button[type=submit]'), async () => {
      try { await api(s ? `/api/services/${s.id}` : '/api/services', { method: s ? 'PUT' : 'POST', body: { ...formData(f), materials: mats } }); m.close(); toast('Layanan tersimpan', 'ok'); App.refresh(); }
      catch (err) { toast(err.message, 'err'); }
    }); };
    draw();
  }

  // ---------- Laporan ----------
  App.register('laporan', {
    title: 'Laporan',
    async render(el) {
      const iso = (d) => d.toISOString().slice(0, 10);
      const to = new Date(); const from = new Date(Date.now() - 29 * 864e5);
      el.innerHTML = `<div class="page-head"><h1>Laporan</h1><div class="filters" style="margin:0"><input type="date" id="f" value="${iso(from)}"><input type="date" id="t" value="${iso(to)}"><button class="btn btn-ghost" id="csv">Unduh CSV</button></div></div><div id="rep"><div class="empty"><span class="spinner"></span></div></div>`;
      let data;
      const load = async () => {
        data = await api(`/api/reports/summary?from=${el.querySelector('#f').value}&to=${el.querySelector('#t').value}`);
        const r = data;
        const max = Math.max(1, ...r.daily.map((d) => d.net_received));
        const margin = r.sales ? Math.round(r.gross_profit / (r.sales - r.delivery_fees || 1) * 100) : 0;
        el.querySelector('#rep').innerHTML = `
          <div class="kpis">
            <div class="kpi"><div class="label">Penjualan (nilai order)</div><div class="value">${rp(r.sales)}</div><div class="sub">${r.orders} order · diskon ${rp(r.discounts)}</div></div>
            <div class="kpi"><div class="label">Uang masuk bersih</div><div class="value">${rp(r.net_received)}</div><div class="sub">Tunai ${rp(r.cash)} · QRIS ${rp(r.qris)} · refund ${rp(r.refunds)}</div></div>
            <div class="kpi"><div class="label">HPP bahan (LIFO)</div><div class="value">${rp(r.material_cost)}</div><div class="sub">Selisih opname ${rp(r.adjustment_loss)}</div></div>
            <div class="kpi"><div class="label">Laba kotor jasa</div><div class="value">${rp(r.gross_profit)}</div><div class="sub">margin ${margin}% (di luar ongkir)</div></div>
            <div class="kpi"><div class="label">Nilai persediaan</div><div class="value">${rp(r.inventory_value)}</div><div class="sub">Pembelian periode ini ${rp(r.purchases)}</div></div>
          </div>
          <div class="card" style="margin-bottom:16px"><div class="card-head"><h3>Uang masuk bersih per hari</h3></div><div class="card-body">
            <div class="bars">${r.daily.map((d) => `<div class="bar" style="height:${Math.round(d.net_received / max * 100)}%" title="${tgl(d.day, false)}: ${rp(d.net_received)} · ${d.orders} order"></div>`).join('')}</div>
            <div class="bars-x"><span>${tgl(r.from, false)}</span><span>${tgl(r.to, false)}</span></div></div></div>
          <div class="grid g2">
            <div class="card"><div class="card-head"><h3>Per layanan</h3></div><div class="card-body"><div class="table-wrap"><table><thead><tr><th>Layanan</th><th class="right">Pasang</th><th class="right">Omzet</th></tr></thead><tbody>
              ${r.by_service.map((s) => `<tr><td>${esc(s.name)}</td><td class="right">${s.pairs}</td><td class="right">${rp(s.revenue)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">Tidak ada data</td></tr>'}</tbody></table></div></div></div>
            <div class="card"><div class="card-head"><h3>Harian</h3></div><div class="card-body"><div class="table-wrap" style="max-height:340px;overflow-y:auto"><table><thead><tr><th>Tanggal</th><th class="right">Order</th><th class="right">Uang masuk</th><th class="right">HPP</th></tr></thead><tbody>
              ${r.daily.slice().reverse().map((d) => `<tr><td class="nowrap">${tgl(d.day, false)}</td><td class="right">${d.orders}</td><td class="right">${rp(d.net_received)}</td><td class="right">${rp(d.hpp)}</td></tr>`).join('')}</tbody></table></div></div></div>
          </div>`;
      };
      el.querySelector('#f').onchange = load; el.querySelector('#t').onchange = load;
      el.querySelector('#csv').onclick = () => {
        if (!data) return;
        const rows = [['tanggal', 'order', 'uang_masuk_bersih', 'hpp_bahan'], ...data.daily.map((d) => [d.day, d.orders, d.net_received, d.hpp])];
        const blob = new Blob(['﻿' + rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `laporan-${data.from}_${data.to}.csv`; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      };
      await load();
    },
  });

  // ---------- Pesan website ----------
  App.register('pesan', {
    title: 'Pesan website',
    async render(el) {
      const rows = await api('/api/contacts');
      el.innerHTML = `<div class="page-head"><h1>Pesan dari website</h1></div><div class="card"><div class="card-body">
        ${rows.length ? rows.map((r) => `<div class="list-row" style="${r.handled ? 'opacity:.55' : ''}"><div><strong>${esc(r.name)}</strong> <span class="small muted">· ${tgl(r.created_at)}${r.phone ? ' · ' + esc(r.phone) : ''}</span><div style="white-space:pre-wrap">${esc(r.message)}</div></div>
          <div style="display:flex;gap:6px">${r.phone ? `<a class="btn btn-sm btn-ghost" target="_blank" rel="noopener" href="${wa(r.phone.replace(/^0/, '62'), `Halo ${r.name}, terima kasih sudah menghubungi kami. `)}">Balas WA</a>` : ''}${r.handled ? '' : `<button class="btn btn-sm btn-primary" data-h="${r.id}">Selesai</button>`}</div></div>`).join('') : '<p class="empty">Belum ada pesan.</p>'}
      </div></div>`;
      el.querySelectorAll('[data-h]').forEach((b) => b.onclick = async () => { await api(`/api/contacts/${b.dataset.h}/handled`, { method: 'POST' }); App.refresh(); });
    },
  });

  // ---------- Pengguna ----------
  App.register('pengguna', {
    title: 'Pengguna',
    async render(el) {
      const users = await api('/api/users');
      el.innerHTML = `<div class="page-head"><h1>Pengguna &amp; peran</h1><button class="btn btn-primary" id="add">+ Pengguna</button></div>
        <div class="card"><div class="table-wrap"><table><thead><tr><th>Nama</th><th>Username</th><th>Peran</th><th>HP</th><th>Status</th></tr></thead><tbody>
        ${users.map((u) => `<tr class="clickable" data-id="${u.id}"><td><strong>${esc(u.name)}</strong></td><td class="mono">${esc(u.username)}</td><td>${App.ROLE_NAME[u.role]}</td><td>${phoneLocal(u.phone) || '—'}</td><td>${u.active ? '<span class="badge b-ok">Aktif</span>' : '<span class="badge">Nonaktif</span>'}</td></tr>`).join('')}
        </tbody></table></div></div>
        <div class="card card-pad" style="margin-top:16px"><h3>Hak akses per peran</h3><div class="table-wrap"><table><thead><tr><th>Fitur</th><th>Front office</th><th>Back office</th><th>Kurir</th></tr></thead><tbody>
          ${[['Order baru, kasir, pembayaran', '✓', '—', '—'], ['Ubah status produksi', '✓', '✓', '—'], ['Delivery & dispatch', '✓', '✓', 'tugas sendiri'], ['Dispute', '✓', '✓', '—'], ['Inventori', 'lihat', '✓', '—'], ['Layanan & resep, laporan', '—', '✓', '—'], ['Pengguna & pengaturan', '—', '—', '—']].map((r) => `<tr>${r.map((c, i) => `<td class="${i ? 'center' : ''}">${c}</td>`).join('')}</tr>`).join('')}
        </tbody></table></div><p class="small muted" style="margin:10px 0 0">Admin/pemilik dapat mengakses semua fitur.</p></div>`;
      el.querySelector('#add').onclick = () => userForm();
      el.querySelector('tbody').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) userForm(users.find((u) => u.id === Number(tr.dataset.id))); });
    },
  });

  function userForm(u) {
    const m = modal({ title: u ? `Ubah ${u.name}` : 'Pengguna baru', content: `<form class="modal-body">
      <div class="field"><label>Nama</label><input name="name" required value="${esc(u ? u.name : '')}"></div>
      ${u ? '' : '<div class="field"><label>Username</label><input name="username" required minlength="3" autocapitalize="none"></div>'}
      <div class="field-row"><div class="field"><label>Peran</label><select name="role">${Object.entries(App.ROLE_NAME).map(([k, v]) => `<option value="${k}" ${u && u.role === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="field"><label>Nomor HP</label><input name="phone" value="${esc(u ? phoneLocal(u.phone) : '')}"></div></div>
      <div class="field"><label>${u ? 'Password baru (kosongkan bila tidak diubah)' : 'Password (min. 6)'}</label><input name="password" type="password" ${u ? '' : 'required'} minlength="6" autocomplete="new-password"></div>
      ${u ? `<label class="check" style="margin-bottom:14px"><input type="checkbox" name="active" ${u.active ? 'checked' : ''}> Aktif</label>` : ''}
      <button class="btn btn-primary btn-block">Simpan</button></form>` });
    const f = m.el.querySelector('form');
    f.onsubmit = (e) => { e.preventDefault(); const v = formData(f); if (!v.password) delete v.password; withBusy(f.querySelector('button'), async () => {
      try { await api(u ? `/api/users/${u.id}` : '/api/users', { method: u ? 'PUT' : 'POST', body: v }); m.close(); toast('Tersimpan', 'ok'); App.refresh(); }
      catch (err) { toast(err.message, 'err'); }
    }); };
  }

  // ---------- Pengaturan ----------
  App.register('pengaturan', {
    title: 'Pengaturan',
    async render(el) {
      const s = await api('/api/settings');
      const qi = s.qris_info || {};
      const demo = /DEMO/.test(s.qris_static);
      const fld = (k, label, type = 'input', extra = '') => `<div class="field"><label>${label}</label>${type === 'textarea' ? `<textarea name="${k}" ${extra}>${esc(s[k])}</textarea>` : `<input name="${k}" value="${esc(s[k])}" ${extra}>`}</div>`;
      el.innerHTML = `<div class="page-head"><h1>Pengaturan</h1></div>
        <form id="sf" class="grid g2">
          <div class="card card-pad"><h3>Profil usaha (tampil di website)</h3>
            ${fld('business_name', 'Nama usaha')}${fld('tagline', 'Tagline')}${fld('about', 'Tentang kami', 'textarea')}${fld('vision', 'Visi')}
            ${fld('mission', 'Misi (pisahkan dengan tanda |)', 'textarea')}${fld('address', 'Alamat')}
            <div class="field-row">${fld('phone', 'WhatsApp')}${fld('email', 'Email')}</div>
            <div class="field-row">${fld('instagram', 'Instagram (tanpa @)')}${fld('open_hours', 'Jam operasional')}</div>
            ${fld('maps_url', 'Link Google Maps')}
          </div>
          <div class="grid">
            <div class="card card-pad"><h3>Pembayaran QRIS</h3>
              ${demo ? '<div class="alert-box warn">Masih memakai QRIS <strong>demo</strong>. Tempel payload QRIS statis usaha Anda agar pelanggan bisa membayar sungguhan.</div>' : ''}
              ${qi.error ? `<div class="alert-box danger">${esc(qi.error)}</div>` : `<div class="small" style="margin-bottom:10px">Merchant terbaca: <strong>${esc(qi.merchant || '-')}</strong> · ${esc(qi.city || '')}</div>`}
              ${fld('qris_static', 'Payload QRIS statis', 'textarea', 'class="mono" style="font-size:12px;min-height:110px"')}
              <p class="small muted">Cara mendapatkan: scan stiker QRIS toko Anda dengan aplikasi pembaca QR biasa, lalu salin teks yang dimulai dengan <span class="mono">000201…</span>. Sistem mengubahnya menjadi QRIS dinamis berisi nominal tagihan.</p>
            </div>
            <div class="card card-pad"><h3>Operasional</h3>
              <div class="field-row">${fld('delivery_fee', 'Ongkir default (Rp)', 'input', 'type="number" min="0"')}${fld('public_url', 'Alamat website publik')}</div>
              <p class="small muted">Alamat website dipakai untuk link & QR lacak di nota, mis. https://sepatukinclong.id</p>
            </div>
            <div class="card card-pad"><h3>Webhook payment gateway</h3>
              <p class="small muted">Opsional — bila memakai payment gateway, arahkan notifikasinya ke endpoint di bawah agar status QRIS lunas otomatis.</p>
              <code class="block">POST ${esc((s.public_url || location.origin).replace(/\/$/, ''))}/api/payments/webhook
Header: X-Webhook-Secret: ${esc(s.webhook_secret)}
Body: {"ref":"QR…","status":"PAID","amount":55000}</code>
              <label class="check" style="margin-top:10px"><input type="checkbox" name="regenerate_webhook_secret"> Buat secret baru saat menyimpan</label>
            </div>
            <button class="btn btn-primary btn-lg" type="submit">Simpan pengaturan</button>
          </div>
        </form>`;
      const f = el.querySelector('#sf');
      f.onsubmit = (e) => { e.preventDefault(); withBusy(f.querySelector('button[type=submit]'), async () => {
        try { await api('/api/settings', { method: 'PUT', body: formData(f) }); toast('Pengaturan tersimpan', 'ok'); App.info = await api('/api/public/info'); App.refresh(); }
        catch (err) { toast(err.message, 'err'); }
      }); };
    },
  });
})();
