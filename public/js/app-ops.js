// Aplikasi staf — operasional: produksi (kanban), delivery & dispatch, tugas kurir, dispute.
(function () {
  const { esc, rp, tgl, phoneLocal, wa, api, toast, modal, formData, withBusy, DISPUTE_CAT, DISPUTE_STATUS } = window.SK;
  const App = window.App;

  // ---------- Produksi ----------
  App.register('produksi', {
    title: 'Produksi',
    async render(el) {
      const rows = await api('/api/orders?active=1');
      const today = new Date().toISOString().slice(0, 10);
      const cols = [
        ['RECEIVED', 'Antrian', [['WASHING', 'Mulai cuci', 'btn-primary']]],
        ['WASHING', 'Dicuci', [['QC', 'Ke QC', 'btn-primary']]],
        ['QC', 'Quality control', [['READY', 'Lolos', 'btn-primary'], ['WASHING', 'Cuci ulang', 'btn-ghost']]],
        ['READY', 'Siap ambil / antar', []],
      ];
      const booked = rows.filter((o) => o.status === 'BOOKED');
      const delivering = rows.filter((o) => o.status === 'DELIVERING');
      const ticket = (o, acts) => `<div class="ticket ${o.due_date && o.due_date < today && ['RECEIVED', 'WASHING', 'QC'].includes(o.status) ? 'late' : ''}">
        <div class="top"><a class="code mono" href="#/order/${o.id}">${esc(o.code)}</a><span class="small muted">${o.pairs} psg</span></div>
        <div class="small"><strong>${esc(o.customer_name)}</strong></div>
        <div class="items">${esc(o.items_text || 'Item belum diisi')}</div>
        <div class="small muted" style="margin-bottom:8px">Estimasi ${tgl(o.due_date, false)}${o.return_method === 'DELIVERY' ? ' · antar' : ''}</div>
        <div class="acts">${acts.map(([s, t, c]) => `<button class="btn btn-sm ${c}" data-id="${o.id}" data-to="${s}">${t}</button>`).join('')}
          ${o.status === 'READY' ? (o.return_method === 'DELIVERY' ? '<a class="btn btn-sm btn-ghost" href="#/dispatch">Dispatch</a>' : `<a class="btn btn-sm btn-ghost" href="#/order/${o.id}">Serahkan</a>`) : ''}</div></div>`;
      el.innerHTML = `<div class="page-head"><h1>Produksi</h1><div class="actions"><span class="small muted">Klik tombol untuk memindahkan order. Bahan dipotong dari stok (LIFO) saat "Mulai cuci".</span></div></div>
        ${booked.length ? `<div class="alert-box warn">${booked.length} booking web menunggu dijemput: ${booked.map((o) => `<a href="#/order/${o.id}" class="mono">${esc(o.code)}</a>`).join(', ')}</div>` : ''}
        <div class="kanban">${cols.map(([st, title, acts]) => {
          const list = rows.filter((o) => o.status === st);
          return `<div class="col"><h3><span>${title}</span><span>${list.length}</span></h3>${list.map((o) => ticket(o, acts)).join('') || '<p class="small muted center">Kosong</p>'}</div>`;
        }).join('')}</div>
        ${delivering.length ? `<p class="small muted" style="margin-top:14px">Sedang diantar: ${delivering.map((o) => `<a href="#/order/${o.id}" class="mono">${esc(o.code)}</a>`).join(', ')}</p>` : ''}`;
      el.addEventListener('click', async (e) => {
        const b = e.target.closest('button[data-to]');
        if (!b) return;
        let note;
        if (b.dataset.to === 'WASHING' && b.textContent.includes('ulang')) {
          note = prompt('Catatan QC — bagian yang belum bersih:');
          if (note === null) return;
        }
        await withBusy(b, async () => {
          try {
            await api(`/api/orders/${b.dataset.id}/status`, { method: 'POST', body: { status: b.dataset.to, note } });
            toast(`Order dipindahkan ke ${App.STATUS_LABEL[b.dataset.to]}`, 'ok');
            App.refresh();
          } catch (err) { toast(err.message, 'err'); }
        });
      });
    },
  });

  // ---------- Dispatch ----------
  const DLABEL = { PENDING: ['Belum ada kurir', 'b-warn'], ASSIGNED: ['Ditugaskan', 'b-info'], ON_THE_WAY: ['Di jalan', 'b-brand'], DONE: ['Selesai', 'b-ok'], FAILED: ['Gagal', 'b-danger'], CANCELLED: ['Batal', ''] };
  const dBadge = (s) => `<span class="badge ${DLABEL[s][1]}">${DLABEL[s][0]}</span>`;
  const typeBadge = (t) => t === 'PICKUP' ? '<span class="badge b-sun plain">⬇ Jemput</span>' : '<span class="badge b-brand plain">⬆ Antar</span>';
  const maps = (addr) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;

  App.register('dispatch', {
    title: 'Delivery & dispatch',
    async render(el) {
      let scope = 'active';
      el.innerHTML = `<div class="page-head"><h1>Delivery &amp; dispatch</h1><div class="seg" id="sc"><button class="on" data-v="active">Aktif</button><button data-v="done">Riwayat</button></div></div>
        <div id="cour" class="kpis"></div><div class="card"><div class="table-wrap" id="dl"></div></div>`;
      const load = async () => {
        const [list, couriers] = await Promise.all([api('/api/deliveries?scope=' + scope), api('/api/couriers')]);
        el.querySelector('#cour').innerHTML = couriers.map((c) => `<div class="kpi"><div class="label">${esc(c.name)}</div><div class="value">${c.active_tasks}</div><div class="sub">tugas aktif · ${phoneLocal(c.phone) || '-'}</div></div>`).join('') || '<div class="alert-box warn">Belum ada akun kurir. Tambahkan di menu Pengguna.</div>';
        el.querySelector('#dl').innerHTML = list.length ? `<table><thead><tr><th>Jenis</th><th>Order / pelanggan</th><th>Alamat</th><th>Jadwal</th><th>Kurir</th><th>Status</th><th></th></tr></thead><tbody>
          ${list.map((d) => `<tr><td>${typeBadge(d.type)}</td>
            <td><a href="#/order/${d.order_id}" class="mono"><strong>${esc(d.order_code)}</strong></a><div class="small">${esc(d.customer_name)} · <a href="${wa(d.customer_phone, '')}" target="_blank" rel="noopener">${phoneLocal(d.customer_phone)}</a></div>${d.type === 'DROPOFF' && d.outstanding > 0 ? `<div class="small" style="color:var(--warn)">COD ${rp(d.outstanding)}</div>` : ''}</td>
            <td class="small" style="max-width:240px">${esc(d.address)}<div><a href="${maps(d.address)}" target="_blank" rel="noopener">Peta</a></div>${d.proof_note ? `<div class="muted">“${esc(d.proof_note)}”</div>` : ''}</td>
            <td class="small nowrap">${d.scheduled_at ? tgl(d.scheduled_at) : '<span class="muted">—</span>'}</td>
            <td class="small">${esc(d.courier_name || '—')}</td><td>${dBadge(d.status)}${d.type === 'DROPOFF' && d.order_status !== 'READY' && d.status === 'PENDING' ? `<div class="small muted">order: ${App.STATUS_LABEL[d.order_status]}</div>` : ''}</td>
            <td class="right nowrap">${scope === 'active' ? actions(d) : ''}</td></tr>`).join('')}</tbody></table>` : `<p class="empty">${scope === 'active' ? 'Tidak ada tugas aktif 🎉' : 'Belum ada riwayat.'}</p>`;
        el.querySelectorAll('[data-assign]').forEach((b) => b.onclick = () => assign(list.find((d) => d.id === Number(b.dataset.assign)), couriers, load));
        el.querySelectorAll('[data-dst]').forEach((b) => b.onclick = () => setStatus(list.find((d) => d.id === Number(b.dataset.id)), b.dataset.dst, load));
      };
      const actions = (d) => {
        const out = [];
        if (['PENDING', 'ASSIGNED', 'FAILED'].includes(d.status)) out.push(`<button class="btn btn-sm btn-primary" data-assign="${d.id}">${d.status === 'PENDING' ? 'Tugaskan' : 'Ganti kurir'}</button>`);
        if (d.status === 'ASSIGNED') out.push(`<button class="btn btn-sm btn-ghost" data-id="${d.id}" data-dst="ON_THE_WAY">Berangkat</button>`);
        if (d.status === 'ON_THE_WAY') out.push(`<button class="btn btn-sm btn-primary" data-id="${d.id}" data-dst="DONE">Selesai</button><button class="btn btn-sm btn-ghost" data-id="${d.id}" data-dst="FAILED">Gagal</button>`);
        if (['PENDING', 'ASSIGNED', 'FAILED'].includes(d.status)) out.push(`<button class="btn btn-sm btn-danger" data-id="${d.id}" data-dst="CANCELLED">Batal</button>`);
        return `<div style="display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap">${out.join('')}</div>`;
      };
      el.querySelector('#sc').addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        scope = b.dataset.v;
        el.querySelectorAll('#sc button').forEach((x) => x.classList.toggle('on', x === b));
        load();
      });
      await load();
      App.every(load, 30000);
    },
  });

  function assign(d, couriers, done) {
    if (d.type === 'DROPOFF' && d.order_status !== 'READY' && d.order_status !== 'DELIVERING') {
      toast(`Order masih "${App.STATUS_LABEL[d.order_status]}" — tugas antar bisa dijadwalkan, tapi pastikan sepatu sudah siap.`);
    }
    const local = (s) => s ? s.replace(' ', 'T').slice(0, 16) : '';
    const m = modal({ title: `${d.type === 'PICKUP' ? 'Jemput' : 'Antar'} ${d.order_code}`, content: `<form class="modal-body">
      <p class="small">${esc(d.customer_name)} · ${esc(d.address)}</p>
      <div class="field"><label>Kurir</label><select name="courier_id" required>${couriers.map((c) => `<option value="${c.id}" ${c.id === d.courier_id ? 'selected' : ''}>${esc(c.name)} — ${c.active_tasks} tugas aktif</option>`).join('')}</select></div>
      <div class="field"><label>Jadwal</label><input type="datetime-local" name="scheduled_at" value="${local(d.scheduled_at)}"></div>
      <button class="btn btn-primary btn-block">Tugaskan</button></form>` });
    const f = m.el.querySelector('form');
    f.onsubmit = (e) => { e.preventDefault(); const v = formData(f); withBusy(f.querySelector('button'), async () => {
      try { await api(`/api/deliveries/${d.id}/assign`, { method: 'POST', body: { courier_id: Number(v.courier_id), scheduled_at: v.scheduled_at || null } }); m.close(); toast('Kurir ditugaskan', 'ok'); done(); }
      catch (err) { toast(err.message, 'err'); }
    }); };
  }

  /** Ubah status tugas (dipakai dispatcher & kurir). */
  function setStatus(d, to, done) {
    const send = async (body, btn) => withBusy(btn, async () => {
      try { await api(`/api/deliveries/${d.id}/status`, { method: 'POST', body: { status: to, ...body } }); toast('Status tugas diperbarui', 'ok'); done(); return true; }
      catch (err) { toast(err.message, 'err'); return false; }
    });
    if (to === 'ON_THE_WAY') return send({});
    if (to === 'CANCELLED') { if (confirm('Batalkan tugas ini?')) send({}); return; }
    const cod = to === 'DONE' && d.type === 'DROPOFF' && d.outstanding > 0;
    const m = modal({ title: to === 'DONE' ? (d.type === 'PICKUP' ? 'Sepatu sudah dijemput' : 'Sepatu sudah diterima pelanggan') : 'Tugas gagal', content: `<form class="modal-body">
      ${cod ? `<div class="cod" style="margin:0 0 14px">Tagih tunai (COD): ${rp(d.outstanding)}</div><label class="check" style="margin-bottom:14px"><input type="checkbox" name="collect_cash" required> Uang ${rp(d.outstanding)} sudah saya terima</label>` : ''}
      <div class="field"><label>${to === 'DONE' ? 'Catatan / bukti (mis. diterima oleh siapa)' : 'Alasan gagal'}</label><input name="proof_note" ${to === 'FAILED' ? 'required' : ''} maxlength="300"></div>
      <button class="btn ${to === 'DONE' ? 'btn-primary' : 'btn-danger'} btn-block">${to === 'DONE' ? 'Konfirmasi selesai' : 'Tandai gagal'}</button></form>` });
    const f = m.el.querySelector('form');
    f.onsubmit = async (e) => { e.preventDefault(); const v = formData(f); if (await send({ proof_note: v.proof_note, collect_cash: v.collect_cash === true }, f.querySelector('button'))) m.close(); };
  }

  // ---------- Tugas kurir ----------
  App.register('kurir', {
    title: 'Tugas saya',
    async render(el) {
      const load = async () => {
        const list = await api('/api/my/deliveries');
        const active = list.filter((d) => ['ASSIGNED', 'ON_THE_WAY'].includes(d.status));
        const done = list.filter((d) => !['ASSIGNED', 'ON_THE_WAY'].includes(d.status));
        el.innerHTML = `<div class="page-head"><h1>Tugas saya</h1><button class="btn btn-ghost btn-sm" id="rf">Muat ulang</button></div>
          ${active.length ? active.map((d) => `<div class="task">
            <div style="display:flex;justify-content:space-between;gap:8px">${typeBadge(d.type)}${dBadge(d.status)}</div>
            <div class="addr">${esc(d.address)}</div>
            <div class="small">${esc(d.customer_name)} · <span class="mono">${esc(d.order_code)}</span>${d.pairs ? ` · ${d.pairs} pasang` : ''}</div>
            ${d.scheduled_at ? `<div class="small muted">Jadwal ${tgl(d.scheduled_at)}</div>` : ''}${d.note ? `<div class="small muted">Catatan: ${esc(d.note)}</div>` : ''}
            ${d.type === 'DROPOFF' && d.outstanding > 0 ? `<div class="cod">Tagih tunai: ${rp(d.outstanding)}</div>` : ''}
            <div class="acts">
              <a class="btn btn-ghost" href="${maps(d.address)}" target="_blank" rel="noopener">Peta</a>
              <a class="btn btn-ghost" href="tel:+${esc(d.customer_phone)}">Telepon</a>
              <a class="btn btn-ghost" href="${wa(d.customer_phone, `Halo ${d.customer_name}, saya kurir ${(App.info && App.info.business_name) || ''}, sedang menuju alamat Anda untuk ${d.type === 'PICKUP' ? 'menjemput' : 'mengantar'} sepatu (order ${d.order_code}).`)}" target="_blank" rel="noopener">WhatsApp</a>
            </div>
            <div class="acts">${d.status === 'ASSIGNED' ? `<button class="btn btn-primary btn-lg" data-id="${d.id}" data-dst="ON_THE_WAY">Berangkat</button>`
              : `<button class="btn btn-danger" data-id="${d.id}" data-dst="FAILED">Gagal</button><button class="btn btn-primary btn-lg" data-id="${d.id}" data-dst="DONE">Selesai</button>`}</div>
          </div>`).join('') : '<div class="card card-pad empty">Belum ada tugas. Istirahat dulu ☕</div>'}
          ${done.length ? `<h3 style="margin-top:24px">Selesai hari ini</h3>${done.map((d) => `<div class="list-row"><span>${typeBadge(d.type)} <span class="mono small">${esc(d.order_code)}</span> · ${esc(d.customer_name)}</span>${dBadge(d.status)}</div>`).join('')}` : ''}`;
        el.querySelector('#rf').onclick = load;
        el.querySelectorAll('[data-dst]').forEach((b) => b.onclick = () => setStatus(list.find((d) => d.id === Number(b.dataset.id)), b.dataset.dst, load));
      };
      await load();
      App.every(load, 60000);
    },
  });

  // ---------- Dispute ----------
  App.register('dispute', {
    title: 'Dispute',
    async render(el, id) {
      if (id) return disputeDetail(el, Number(id));
      el.innerHTML = `<div class="page-head"><h1>Dispute &amp; komplain</h1><select id="fs" style="width:auto"><option value="active">Aktif</option><option value="RESOLVED">Selesai</option><option value="REJECTED">Ditolak</option><option value="">Semua</option></select></div>
        <div class="card"><div class="table-wrap" id="tb"></div></div>`;
      const fs = el.querySelector('#fs');
      const load = async () => {
        const rows = await api('/api/disputes?status=' + fs.value);
        el.querySelector('#tb').innerHTML = rows.length ? `<table><thead><tr><th>Kode</th><th>Order / pelanggan</th><th>Kategori</th><th>Status</th><th>Pesan</th><th>Update</th></tr></thead><tbody>
          ${rows.map((d) => `<tr class="clickable" data-id="${d.id}"><td><strong class="mono">${esc(d.code)}</strong><div class="small muted">${d.source === 'CUSTOMER' ? 'dari pelanggan' : 'dicatat staf'}</div></td>
            <td><span class="mono">${esc(d.order_code)}</span><div class="small">${esc(d.customer_name)}</div></td><td>${esc(d.category_label)}</td>
            <td><span class="badge ${DISPUTE_STATUS[d.status][1]}">${DISPUTE_STATUS[d.status][0]}</span></td>
            <td class="small">${d.message_count} ${d.last_author === 'CUSTOMER' && ['OPEN', 'INVESTIGATING'].includes(d.status) ? '<span class="badge b-danger plain">perlu dibalas</span>' : ''}</td><td class="small nowrap">${tgl(d.updated_at)}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">Tidak ada dispute.</p>';
      };
      fs.onchange = load;
      el.querySelector('#tb').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) App.go('#/dispute/' + tr.dataset.id); });
      await load();
    },
  });

  async function disputeDetail(el, id) {
    const d = await api('/api/disputes/' + id);
    const o = d.order;
    const open = ['OPEN', 'INVESTIGATING'].includes(d.status);
    const refundable = o.paid - o.refunded;
    el.innerHTML = `<div class="page-head"><div><a href="#/dispute" class="small">← Semua dispute</a><h1 class="mono">${esc(d.code)}</h1>
        <div style="display:flex;gap:6px;margin-top:6px"><span class="badge ${DISPUTE_STATUS[d.status][1]}">${DISPUTE_STATUS[d.status][0]}</span><span class="badge plain">${esc(d.category_label)}</span></div></div></div>
      <div class="grid g-main">
        <div class="card"><div class="card-head"><h3>Percakapan</h3><a class="btn btn-sm btn-ghost" target="_blank" rel="noopener" href="${wa(d.customer_phone, `Halo ${d.customer_name}, terkait komplain ${d.code} untuk order ${d.order_code}: `)}">WhatsApp pelanggan</a></div><div class="card-body">
          <div class="thread">${d.messages.map((m) => `<div class="msg ${m.author_type}"><div class="who">${esc(m.author_name || '')} · ${tgl(m.created_at)}</div>${esc(m.message)}</div>`).join('')}</div>
          ${open ? `<form id="reply" style="display:grid;gap:8px"><textarea name="message" required placeholder="Balas pelanggan (terlihat di halaman lacak order)…"></textarea><button class="btn btn-primary">Kirim balasan</button></form>` : ''}
        </div></div>
        <div class="grid">
          <div class="card card-pad"><h3>Order terkait</h3>
            <a href="#/order/${o.id}" class="mono"><strong>${esc(o.code)}</strong></a> ${App.statusBadge(o.status)}
            <div class="small" style="margin-top:6px">${esc(o.customer_name)} · ${phoneLocal(o.customer_phone)}</div>
            <div class="small muted">${o.items.map((i) => `${i.qty}× ${esc(i.service_name)}${i.shoe ? ` (${esc(i.shoe)})` : ''}`).join(', ')}</div>
            ${o.items.some((i) => i.condition_note) ? `<div class="small" style="margin-top:6px"><strong>Kondisi awal:</strong> ${o.items.filter((i) => i.condition_note).map((i) => esc(i.condition_note)).join('; ')}</div>` : ''}
            <div class="summary-box" style="margin-top:12px"><div class="sum-row"><span>Total</span><span>${rp(o.total)}</span></div><div class="sum-row"><span>Dibayar</span><span>${rp(o.paid)}</span></div><div class="sum-row"><span>Sudah direfund</span><span>${rp(o.refunded)}</span></div></div>
          </div>
          ${open ? `<div class="card card-pad"><h3>Keputusan</h3>
            <form id="resolve">
              <div class="field"><label>Hasil</label><select name="status"><option value="RESOLVED">Selesaikan</option><option value="INVESTIGATING">Tandai sedang ditangani</option><option value="REJECTED">Tolak komplain</option></select></div>
              <div class="field" id="res-f"><label>Bentuk penyelesaian</label><select name="resolution"><option value="REWASH">Cuci ulang gratis</option><option value="REFUND">Refund (maks. ${rp(refundable)})</option><option value="COMPENSATION">Kompensasi / ganti rugi</option><option value="NONE">Tanpa tindakan (klarifikasi)</option></select></div>
              <div class="field hidden" id="amt-f"><label>Nominal (Rp)</label><input name="refund_amount" type="number" min="1"></div>
              <div class="field"><label>Catatan untuk pelanggan</label><textarea name="note" required></textarea></div>
              <button class="btn btn-primary btn-block">Simpan keputusan</button>
            </form></div>`
            : `<div class="card card-pad"><h3>Hasil</h3><p>${d.status === 'RESOLVED' ? { REWASH: 'Cuci ulang gratis', REFUND: 'Refund', COMPENSATION: 'Kompensasi', NONE: 'Tanpa tindakan' }[d.resolution] : 'Ditolak'}${d.refund_amount ? ` · ${rp(d.refund_amount)}` : ''}</p><p class="small muted">Ditutup ${tgl(d.resolved_at)} oleh ${esc(d.handler_name || '-')}</p></div>`}
        </div>
      </div>`;
    const reply = el.querySelector('#reply');
    if (reply) reply.onsubmit = (e) => { e.preventDefault(); withBusy(reply.querySelector('button'), async () => {
      try { await api(`/api/disputes/${id}/messages`, { method: 'POST', body: formData(reply) }); App.refresh(); } catch (err) { toast(err.message, 'err'); }
    }); };
    const rf = el.querySelector('#resolve');
    if (rf) {
      const sync = () => {
        el.querySelector('#res-f').classList.toggle('hidden', rf.status.value !== 'RESOLVED');
        el.querySelector('#amt-f').classList.toggle('hidden', !(rf.status.value === 'RESOLVED' && ['REFUND', 'COMPENSATION'].includes(rf.resolution.value)));
      };
      rf.status.onchange = sync; rf.resolution.onchange = sync; sync();
      rf.onsubmit = (e) => { e.preventDefault(); const v = formData(rf); withBusy(rf.querySelector('button'), async () => {
        try {
          await api(`/api/disputes/${id}/resolve`, { method: 'POST', body: { ...v, refund_amount: v.refund_amount || undefined } });
          toast('Keputusan tersimpan', 'ok'); App.refresh();
        } catch (err) { toast(err.message, 'err'); }
      }); };
    }
  }
})();
