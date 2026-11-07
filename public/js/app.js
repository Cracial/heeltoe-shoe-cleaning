// Aplikasi staf — inti: router, layout per peran, dashboard, kasir (order baru), daftar & detail order, pembayaran, nota.
(function () {
  const { esc, rp, tgl, phoneLocal, wa, api, toast, modal, formData, withBusy, ORDER_BADGE, PAY_LABEL, DISPUTE_CAT } = window.SK;

  const I = {
    home: '<path d="M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    flow: '<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="10" rx="1"/><rect x="17" y="4" width="4" height="13" rx="1"/>',
    truck: '<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
    box: '<path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8"/>',
    tag: '<path d="M20 12l-8 8-9-9V3h8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    alert: '<path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17h.01"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6M16 4a3.5 3.5 0 010 7M22 20c0-3-2-5-5-5.5"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
    bike: '<circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6h2l3 11.5M5.5 17.5L9 10h7l-3.5 7.5M9 10L7.5 6H6"/>',
  };
  const icon = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${I[k]}</svg>`;

  const STATUS_LABEL = {
    BOOKED: 'Menunggu dijemput', RECEIVED: 'Diterima di toko', WASHING: 'Proses cuci', QC: 'Quality control',
    READY: 'Siap', DELIVERING: 'Sedang diantar', DELIVERED: 'Sudah diantar', PICKED_UP: 'Sudah diambil', CANCELLED: 'Dibatalkan',
  };
  const STATUS_ROLES = {
    RECEIVED: ['frontoffice'], WASHING: ['backoffice', 'frontoffice'], QC: ['backoffice', 'frontoffice'],
    READY: ['backoffice', 'frontoffice'], PICKED_UP: ['frontoffice'], CANCELLED: ['frontoffice'],
  };
  const ACTION_LABEL = (from, to) => ({
    RECEIVED: 'Terima di toko', WASHING: from === 'QC' ? 'Cuci ulang' : 'Mulai cuci', QC: 'Kirim ke QC',
    READY: 'Lolos QC — siap', PICKED_UP: 'Serahkan ke pelanggan', CANCELLED: 'Batalkan order',
  }[to] || to);

  const App = {
    me: null, info: null, views: {}, timers: [], icon, I, STATUS_LABEL, STATUS_ROLES, ACTION_LABEL,
    can(...roles) { return this.me && (this.me.role === 'admin' || roles.includes(this.me.role)); },
    register(name, def) { this.views[name] = def; },
    every(fn, ms) { const t = setInterval(fn, ms); this.timers.push(t); return t; },
    go(hash) { if (location.hash === hash) render(); else location.hash = hash; },
    refresh() { render(); },
  };
  window.App = App;

  const NAV = [
    ['dashboard', 'Dashboard', 'home', ['frontoffice', 'backoffice']],
    ['kasir', 'Order baru', 'plus', ['frontoffice']],
    ['orders', 'Semua order', 'list', ['frontoffice', 'backoffice']],
    ['produksi', 'Produksi', 'flow', ['frontoffice', 'backoffice']],
    ['dispatch', 'Delivery & dispatch', 'truck', ['frontoffice', 'backoffice']],
    ['kurir', 'Tugas saya', 'bike', ['kurir']],
    ['dispute', 'Dispute', 'alert', ['frontoffice', 'backoffice']],
    ['@', 'Back office'],
    ['inventori', 'Inventori (LIFO)', 'box', ['frontoffice', 'backoffice']],
    ['layanan', 'Layanan & resep', 'tag', ['backoffice']],
    ['laporan', 'Laporan', 'chart', ['backoffice']],
    ['pesan', 'Pesan website', 'mail', ['frontoffice', 'backoffice']],
    ['@', 'Admin', true],
    ['pengguna', 'Pengguna', 'users', []],
    ['pengaturan', 'Pengaturan', 'gear', []],
  ];
  const ROLE_NAME = { admin: 'Admin / pemilik', frontoffice: 'Front office', backoffice: 'Back office', kurir: 'Kurir' };
  App.ROLE_NAME = ROLE_NAME;

  function allowed(name) {
    const n = NAV.find((x) => x[0] === name);
    if (!n) return true;
    return App.can(...n[3]);
  }

  function renderSide(badges = {}) {
    const items = [];
    let pendingGroup = null;
    for (const n of NAV) {
      if (n[0] === '@') { pendingGroup = n; continue; }
      if (!App.can(...n[3])) continue;
      if (pendingGroup) { if (!pendingGroup[2] || App.me.role === 'admin') items.push(`<div class="group">${pendingGroup[1]}</div>`); pendingGroup = null; }
      items.push(`<a href="#/${n[0]}" data-nav="${n[0]}">${icon(n[2])}<span>${n[1]}</span>${badges[n[0]] ? `<span class="count">${badges[n[0]]}</span>` : ''}</a>`);
    }
    document.getElementById('side').innerHTML = `
      <a class="logo" href="/" target="_blank"><img src="/favicon.svg" alt=""><span>${esc((App.info && App.info.business_name) || 'Sepatu Kinclong')}</span></a>
      <nav>${items.join('')}</nav>
      <div class="me"><strong>${esc(App.me.name)}</strong>${ROLE_NAME[App.me.role]}
        <div class="row"><button class="btn btn-sm" id="pw-btn">Ganti password</button><button class="btn btn-sm" id="logout-btn">Keluar</button></div></div>`;
    document.getElementById('logout-btn').onclick = async () => { await api('/api/auth/logout', { method: 'POST' }); location.replace('/login'); };
    document.getElementById('pw-btn').onclick = changePassword;
    markActive();
  }
  function markActive() {
    const cur = (location.hash.split('/')[1] || '');
    document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === cur || (cur === 'order' && a.dataset.nav === 'orders')));
  }

  async function refreshBadges() {
    if (App.me.role === 'kurir') return;
    try {
      const d = await api('/api/dashboard');
      const b = {
        dispute: d.open_disputes || 0,
        dispatch: (d.deliveries.pending || 0) + (d.deliveries.failed || 0),
        pesan: d.unread_messages || 0,
        inventori: d.low_stock.length || 0,
      };
      document.querySelectorAll('[data-nav]').forEach((a) => {
        const k = a.dataset.nav;
        let c = a.querySelector('.count');
        if (b[k]) { if (!c) { c = document.createElement('span'); c.className = 'count'; a.appendChild(c); } c.textContent = b[k]; } else if (c) c.remove();
      });
    } catch { /* abaikan */ }
  }

  async function render() {
    App.timers.forEach(clearInterval);
    App.timers = [];
    const [, name = '', param] = location.hash.split('/');
    const def = App.me.role === 'kurir' ? 'kurir' : 'dashboard';
    const view = App.views[name] ? name : def;
    if (!App.views[name] || !allowed(view)) { if (location.hash !== '#/' + def) { location.replace('#/' + def); return; } }
    markActive();
    document.getElementById('side').classList.remove('open');
    document.getElementById('scrim').classList.remove('on');
    const host = document.getElementById('view');
    const root = document.createElement('div');
    host.replaceChildren(root);
    root.innerHTML = '<div class="empty"><span class="spinner"></span></div>';
    const v = App.views[view];
    document.getElementById('top-title').textContent = v.title;
    document.title = `${v.title} — ${(App.info && App.info.business_name) || 'Sepatu Kinclong'}`;
    try { await v.render(root, param && decodeURIComponent(param)); }
    catch (err) {
      if (err.status === 401) return location.replace('/login');
      root.innerHTML = `<div class="card card-pad empty">${esc(err.message)}</div>`;
    }
    window.scrollTo(0, 0);
  }

  function changePassword() {
    const m = modal({
      title: 'Ganti password',
      content: `<form class="modal-body"><div class="field"><label>Password lama</label><input name="old_password" type="password" required autocomplete="current-password"></div>
        <div class="field"><label>Password baru (min. 6 karakter)</label><input name="new_password" type="password" required minlength="6" autocomplete="new-password"></div>
        <button class="btn btn-primary btn-block">Simpan</button></form>`,
    });
    const f = m.el.querySelector('form');
    f.onsubmit = (e) => { e.preventDefault(); withBusy(f.querySelector('button'), async () => {
      try { const r = await api('/api/auth/password', { method: 'POST', body: formData(f) }); toast(r.message, 'ok'); m.close(); } catch (err) { toast(err.message, 'err'); }
    }); };
  }

  // ---------- Komponen ----------
  const statusBadge = (s) => `<span class="badge ${ORDER_BADGE[s] || ''}">${STATUS_LABEL[s] || s}</span>`;
  function payBadge(o) {
    const st = o.payment_status || (o.paid <= 0 ? 'UNPAID' : o.paid < o.total ? 'PARTIAL' : 'PAID');
    if (o.total === 0 && o.status === 'BOOKED') return '<span class="badge plain">Belum dihitung</span>';
    const [t, c] = PAY_LABEL[st];
    return `<span class="badge ${c}">${t}</span>`;
  }
  App.statusBadge = statusBadge;
  App.payBadge = payBadge;

  // ---------- Dashboard ----------
  App.register('dashboard', {
    title: 'Dashboard',
    async render(el) {
      const d = await api('/api/dashboard');
      const order = ['BOOKED', 'RECEIVED', 'WASHING', 'QC', 'READY', 'DELIVERING'];
      const active = order.reduce((s, k) => s + (d.status_counts[k] || 0), 0);
      el.innerHTML = `
        <div class="page-head"><h1>Halo, ${esc(App.me.name.split(' ')[0])} 👋</h1>
          <div class="actions">${App.can('frontoffice') ? '<a href="#/kasir" class="btn btn-primary">+ Order baru</a>' : ''}</div></div>
        <div class="kpis">
          <div class="kpi"><div class="label">Uang masuk hari ini</div><div class="value">${rp(d.money.received)}</div><div class="sub">Tunai ${rp(d.money.cash)} · QRIS ${rp(d.money.qris)}${d.money.refunds ? ` · refund ${rp(d.money.refunds)}` : ''}</div></div>
          <div class="kpi"><div class="label">Order masuk hari ini</div><div class="value">${d.orders_today}</div><div class="sub">${d.pairs_today} pasang</div></div>
          <div class="kpi"><div class="label">Order aktif</div><div class="value">${active}</div><div class="sub">${d.overdue.length} lewat estimasi</div></div>
          <a class="kpi ${d.open_disputes ? 'alert' : ''}" href="#/dispute" style="text-decoration:none;color:inherit"><div class="label">Dispute aktif</div><div class="value">${d.open_disputes}</div><div class="sub">${d.pending_qris} QRIS menunggu konfirmasi</div></a>
        </div>
        <div class="pipeline">${order.map((k) => `<a class="pipe" href="#/orders/${k}"><div class="n">${d.status_counts[k] || 0}</div><div class="t">${STATUS_LABEL[k]}</div></a>`).join('')}</div>
        <div class="grid g-main">
          <div class="card"><div class="card-head"><h3>Order terbaru</h3><a href="#/orders" class="small">Lihat semua</a></div>
            <div class="card-body">${d.recent.length ? d.recent.map((o) => `<div class="list-row"><a href="#/order/${o.id}"><strong class="mono">${esc(o.code)}</strong> <span class="muted">· ${esc(o.customer_name)}</span><div class="small muted">${tgl(o.created_at)}</div></a><div class="right">${statusBadge(o.status)}<div class="small" style="margin-top:4px">${rp(o.total)}</div></div></div>`).join('') : '<p class="empty">Belum ada order.</p>'}</div></div>
          <div class="grid">
            <div class="card"><div class="card-head"><h3>Pengiriman</h3><a href="#/dispatch" class="small">Dispatch</a></div>
              <div class="card-body"><div class="list-row"><span>Belum ada kurir</span><strong>${d.deliveries.pending || 0}</strong></div><div class="list-row"><span>Ditugaskan</span><strong>${d.deliveries.assigned || 0}</strong></div><div class="list-row"><span>Dalam perjalanan</span><strong>${d.deliveries.on_the_way || 0}</strong></div><div class="list-row"><span>Gagal (perlu jadwal ulang)</span><strong style="color:${d.deliveries.failed ? 'var(--danger)' : 'inherit'}">${d.deliveries.failed || 0}</strong></div></div></div>
            <div class="card"><div class="card-head"><h3>Lewat estimasi</h3></div><div class="card-body">${d.overdue.length ? d.overdue.map((o) => `<div class="list-row"><a href="#/order/${o.id}"><strong class="mono">${esc(o.code)}</strong><div class="small muted">${esc(o.customer_name)}</div></a><div class="right small"><span style="color:var(--danger)">${tgl(o.due_date, false)}</span><div>${STATUS_LABEL[o.status]}</div></div></div>`).join('') : '<p class="muted small" style="margin:0">Semua order sesuai jadwal 👍</p>'}</div></div>
            <div class="card"><div class="card-head"><h3>Stok menipis</h3><a href="#/inventori" class="small">Inventori</a></div><div class="card-body">${d.low_stock.length ? d.low_stock.map((i) => `<div class="list-row"><span>${esc(i.name)}</span><span class="badge b-danger">${i.stock} ${esc(i.unit)}</span></div>`).join('') : '<p class="muted small" style="margin:0">Stok aman.</p>'}</div></div>
          </div>
        </div>`;
    },
  });

  // ---------- Kasir / order baru ----------
  App.register('kasir', {
    title: 'Order baru',
    async render(el) {
      const services = (await api('/api/services')).filter((s) => s.active);
      const fee = (App.info && App.info.delivery_fee) || 0;
      const state = { items: [{ service_id: services[0] && services[0].id, shoe: '', qty: 1, condition_note: '' }], returnMethod: 'STORE' };
      el.innerHTML = `
        <div class="page-head"><h1>Order baru</h1></div>
        <form id="kasir" class="grid g-main" autocomplete="off">
          <div class="grid">
            <div class="card card-pad">
              <h3>Pelanggan</h3>
              <div class="field-row">
                <div class="field"><label>Nomor HP / WhatsApp</label><input name="phone" required inputmode="tel" placeholder="0812xxxxxxx"><div class="hint" id="cust-hint">Pelanggan lama otomatis terisi.</div></div>
                <div class="field"><label>Nama</label><input name="name" required maxlength="80"></div>
              </div>
              <div class="field"><label>Alamat</label><input name="address" maxlength="300" placeholder="Wajib bila diantar"></div>
            </div>
            <div class="card card-pad">
              <div style="display:flex;justify-content:space-between;align-items:center"><h3 style="margin:0">Sepatu &amp; layanan</h3><button type="button" class="btn btn-ghost btn-sm" id="add-item">+ Tambah pasang</button></div>
              <div id="items"></div>
            </div>
          </div>
          <div class="card card-pad" style="position:sticky;top:20px">
            <h3>Pengembalian</h3>
            <div class="seg" id="ret" style="margin-bottom:14px"><button type="button" data-v="STORE" class="on">Ambil di toko</button><button type="button" data-v="DELIVERY">Antar ke alamat</button></div>
            <div class="field-row">
              <div class="field"><label>Diskon (Rp)</label><input name="discount" type="number" min="0" step="1000" value="0"></div>
              <div class="field"><label>Ongkir (Rp)</label><input name="delivery_fee" type="number" min="0" step="1000" value="0"></div>
            </div>
            <div class="field"><label>Catatan</label><input name="notes" maxlength="500"></div>
            <div class="summary-box" id="summary"></div>
            <button class="btn btn-primary btn-lg btn-block" style="margin-top:14px" type="submit">Simpan order</button>
          </div>
        </form>`;
      const f = el.querySelector('#kasir');
      const box = el.querySelector('#items');
      const opt = (sel) => services.map((s) => `<option value="${s.id}" ${s.id === Number(sel) ? 'selected' : ''}>${esc(s.name)} — ${rp(s.price)}</option>`).join('');
      const drawItems = () => {
        box.innerHTML = state.items.map((it, i) => `<div class="item-row" data-i="${i}">
          <div class="field"><label>Layanan</label><select data-k="service_id">${opt(it.service_id)}</select></div>
          <div class="field"><label>Sepatu (merek/warna)</label><input data-k="shoe" value="${esc(it.shoe)}" placeholder="Nike AF1 putih"></div>
          <div class="field"><label>Pasang</label><input data-k="qty" type="number" min="1" max="50" value="${it.qty}"></div>
          <div class="field"><label>Kondisi awal</label><input data-k="condition_note" value="${esc(it.condition_note)}" placeholder="Noda, sol lepas…"></div>
          <button type="button" class="btn btn-ghost btn-sm rm" data-rm="${i}" aria-label="Hapus" ${state.items.length === 1 ? 'disabled' : ''}>✕</button></div>`).join('');
        drawSum();
      };
      const drawSum = () => {
        const sub = state.items.reduce((s, it) => s + (services.find((x) => x.id === Number(it.service_id))?.price || 0) * (Number(it.qty) || 0), 0);
        const disc = Number(f.discount.value) || 0;
        const ong = Number(f.delivery_fee.value) || 0;
        const pairs = state.items.reduce((s, it) => s + (Number(it.qty) || 0), 0);
        el.querySelector('#summary').innerHTML = `<div class="sum-row"><span>Subtotal (${pairs} pasang)</span><span>${rp(sub)}</span></div>
          ${disc ? `<div class="sum-row"><span>Diskon</span><span>−${rp(disc)}</span></div>` : ''}${ong ? `<div class="sum-row"><span>Ongkir</span><span>${rp(ong)}</span></div>` : ''}
          <div class="sum-row total"><span>Total</span><span>${rp(Math.max(0, sub - disc + ong))}</span></div>`;
      };
      box.addEventListener('input', (e) => {
        const row = e.target.closest('[data-i]');
        if (!row || !e.target.dataset.k) return;
        state.items[row.dataset.i][e.target.dataset.k] = e.target.value;
        drawSum();
      });
      box.addEventListener('click', (e) => {
        const rm = e.target.closest('[data-rm]');
        if (rm) { state.items.splice(Number(rm.dataset.rm), 1); drawItems(); }
      });
      el.querySelector('#add-item').onclick = () => {
        const last = state.items[state.items.length - 1];
        state.items.push({ service_id: last ? last.service_id : services[0].id, shoe: '', qty: 1, condition_note: '' });
        drawItems();
        box.querySelector('.item-row:last-child input[data-k=shoe]').focus();
      };
      el.querySelector('#ret').addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        state.returnMethod = b.dataset.v;
        el.querySelectorAll('#ret button').forEach((x) => x.classList.toggle('on', x === b));
        f.delivery_fee.value = state.returnMethod === 'DELIVERY' ? fee : 0;
        f.address.placeholder = state.returnMethod === 'DELIVERY' ? 'Alamat antar (wajib)' : 'Opsional';
        drawSum();
      });
      f.discount.oninput = drawSum;
      f.delivery_fee.oninput = drawSum;
      f.phone.addEventListener('change', async () => {
        const v = f.phone.value.replace(/\D/g, '');
        if (v.length < 9) return;
        try {
          const c = await api('/api/customers/by-phone/' + encodeURIComponent(v));
          const hint = el.querySelector('#cust-hint');
          if (c) {
            f.name.value = c.name; if (c.address) f.address.value = c.address;
            hint.innerHTML = `✓ Pelanggan lama · ${c.recent_orders.length ? 'order terakhir ' + c.recent_orders.map((o) => `<a href="#/order/${o.id}">${esc(o.code)}</a>`).slice(0, 2).join(', ') : 'belum ada order'}`;
          } else hint.textContent = 'Pelanggan baru.';
        } catch { /* abaikan */ }
      });
      f.onsubmit = (e) => {
        e.preventDefault();
        const d = formData(f);
        withBusy(f.querySelector('button[type=submit]'), async () => {
          try {
            const o = await api('/api/orders', {
              method: 'POST', body: {
                customer: { name: d.name, phone: d.phone, address: d.address },
                items: state.items.map((it) => ({ ...it, service_id: Number(it.service_id), qty: Number(it.qty) })),
                discount: d.discount || 0, delivery_fee: d.delivery_fee || 0, return_method: state.returnMethod,
                address: state.returnMethod === 'DELIVERY' ? d.address : null, notes: d.notes,
              },
            });
            toast(`Order ${o.code} tersimpan`, 'ok');
            App.go('#/order/' + o.id);
            setTimeout(() => openPay(o, () => App.refresh(), true), 300);
          } catch (err) { toast(err.message, 'err'); }
        });
      };
      drawItems();
    },
  });

  // ---------- Daftar order ----------
  App.register('orders', {
    title: 'Semua order',
    async render(el, status) {
      el.innerHTML = `<div class="page-head"><h1>Order</h1><div class="actions">${App.can('frontoffice') ? '<a href="#/kasir" class="btn btn-primary">+ Order baru</a>' : ''}</div></div>
        <div class="filters">
          <input type="search" id="q" placeholder="Cari kode, nama, atau nomor HP">
          <select id="st"><option value="">Semua status</option><option value="active">Semua yang aktif</option>${Object.entries(STATUS_LABEL).map(([k, v]) => `<option value="${k}" ${k === status ? 'selected' : ''}>${v}</option>`).join('')}</select>
          <input type="date" id="from" title="Dari tanggal"><input type="date" id="to" title="Sampai tanggal">
        </div>
        <div class="card"><div class="table-wrap" id="tbl"></div></div>`;
      const q = el.querySelector('#q'), st = el.querySelector('#st'), from = el.querySelector('#from'), to = el.querySelector('#to');
      let t;
      const load = async () => {
        const p = new URLSearchParams();
        if (q.value) p.set('q', q.value);
        if (st.value === 'active') p.set('active', '1'); else if (st.value) p.set('status', st.value);
        if (from.value) p.set('from', from.value);
        if (to.value) p.set('to', to.value);
        const rows = await api('/api/orders?' + p);
        el.querySelector('#tbl').innerHTML = rows.length ? `<table><thead><tr><th>Kode</th><th>Pelanggan</th><th>Item</th><th class="right">Total</th><th>Bayar</th><th>Status</th><th>Estimasi</th></tr></thead><tbody>
          ${rows.map((o) => `<tr class="clickable" data-id="${o.id}"><td><strong class="mono">${esc(o.code)}</strong>${o.source === 'WEB' ? ' <span class="badge b-sun plain">web</span>' : ''}<div class="small muted">${tgl(o.created_at)}</div></td>
            <td>${esc(o.customer_name)}<div class="small muted">${phoneLocal(o.customer_phone)}</div></td><td class="small">${esc(o.items_text || '—')}</td>
            <td class="right nowrap">${rp(o.total)}${o.outstanding > 0 && o.total > 0 ? `<div class="small" style="color:var(--danger)">sisa ${rp(o.outstanding)}</div>` : ''}</td>
            <td>${payBadge({ ...o, payment_status: o.paid <= 0 ? 'UNPAID' : o.outstanding > 0 ? 'PARTIAL' : 'PAID' })}</td><td>${statusBadge(o.status)}${o.return_method === 'DELIVERY' ? '<div class="small muted">antar</div>' : ''}</td><td class="small nowrap">${tgl(o.due_date, false)}</td></tr>`).join('')}
          </tbody></table>` : '<p class="empty">Tidak ada order yang cocok.</p>';
      };
      q.oninput = () => { clearTimeout(t); t = setTimeout(load, 250); };
      st.onchange = load; from.onchange = load; to.onchange = load;
      el.querySelector('#tbl').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) App.go('#/order/' + tr.dataset.id); });
      await load();
    },
  });

  // ---------- Detail order ----------
  App.register('order', {
    title: 'Detail order',
    async render(el, id) {
      const o = await api('/api/orders/' + Number(id));
      const editable = ['BOOKED', 'RECEIVED'].includes(o.status) && App.can('frontoffice');
      const canPay = o.outstanding > 0 && o.status !== 'CANCELLED' && o.items.length && App.can('frontoffice');
      const actions = o.next_statuses.filter((s) => STATUS_ROLES[s] && App.can(...STATUS_ROLES[s]));
      const pendingQris = o.payments.filter((p) => p.method === 'QRIS' && p.status === 'PENDING');
      const activeDel = o.deliveries.filter((d) => ['PENDING', 'ASSIGNED', 'ON_THE_WAY', 'FAILED'].includes(d.status));
      const waText = `Halo ${o.customer_name}, order ${o.code} di ${(App.info && App.info.business_name) || ''} saat ini: ${o.status_label}. Total ${rp(o.total)}${o.outstanding ? `, sisa tagihan ${rp(o.outstanding)}` : ' (lunas)'}. Lacak: ${o.track_url}`;
      el.innerHTML = `
        <div class="page-head">
          <div><a href="#/orders" class="small">← Semua order</a><h1 class="mono">${esc(o.code)}</h1><div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">${statusBadge(o.status)} ${payBadge(o)} ${o.source === 'WEB' ? '<span class="badge b-sun plain">Booking web</span>' : ''}</div></div>
          <div class="actions">
            ${actions.map((s) => `<button class="btn ${s === 'CANCELLED' ? 'btn-danger' : s === 'WASHING' && o.status === 'QC' ? 'btn-ghost' : 'btn-primary'}" data-status="${s}">${ACTION_LABEL(o.status, s)}</button>`).join('')}
            ${canPay ? '<button class="btn btn-sun" id="pay">Terima pembayaran</button>' : ''}
          </div>
        </div>
        ${pendingQris.length ? `<div class="alert-box info">Ada QRIS ${rp(pendingQris[0].amount)} menunggu pembayaran (ref <span class="mono">${esc(pendingQris[0].ref)}</span>). <button class="btn btn-sm btn-primary" data-qris="${pendingQris[0].id}">Buka QR</button></div>` : ''}
        ${o.status === 'BOOKED' && !o.items.length ? '<div class="alert-box warn">Booking dari website — item & harga diisi setelah sepatu dijemput/diterima.</div>' : ''}
        <div class="grid g-main">
          <div class="grid">
            <div class="card"><div class="card-head"><h3>Item</h3>${editable ? '<button class="btn btn-ghost btn-sm" id="edit">Ubah item</button>' : ''}</div>
              <div class="card-body">${o.items.length ? `<div class="table-wrap"><table><thead><tr><th>Layanan</th><th>Sepatu</th><th>Kondisi awal</th><th class="right">Subtotal</th></tr></thead><tbody>
                ${o.items.map((i) => `<tr><td>${i.qty}× ${esc(i.service_name)}<div class="small muted">@ ${rp(i.price)}</div></td><td>${esc(i.shoe || '—')}</td><td class="small">${esc(i.condition_note || '—')}</td><td class="right">${rp(i.qty * i.price)}</td></tr>`).join('')}
                </tbody></table></div>` : '<p class="muted">Belum ada item.</p>'}
                <div class="summary-box" style="margin-top:12px">
                  <div class="sum-row"><span>Subtotal</span><span>${rp(o.subtotal)}</span></div>
                  ${o.discount ? `<div class="sum-row"><span>Diskon</span><span>−${rp(o.discount)}</span></div>` : ''}
                  ${o.delivery_fee ? `<div class="sum-row"><span>Ongkir</span><span>${rp(o.delivery_fee)}</span></div>` : ''}
                  <div class="sum-row total"><span>Total</span><span>${rp(o.total)}</span></div>
                  <div class="sum-row"><span>Dibayar</span><span>${rp(o.paid)}</span></div>
                  ${o.refunded ? `<div class="sum-row"><span>Refund</span><span>${rp(o.refunded)}</span></div>` : ''}
                  <div class="sum-row"><strong>Sisa tagihan</strong><strong style="color:${o.outstanding ? 'var(--danger)' : 'var(--ok)'}">${rp(o.outstanding)}</strong></div>
                </div>
              </div></div>
            <div class="card"><div class="card-head"><h3>Pembayaran</h3></div><div class="card-body">
              ${o.payments.length ? `<div class="table-wrap"><table><thead><tr><th>Waktu</th><th>Metode</th><th class="right">Nominal</th><th>Status</th><th></th></tr></thead><tbody>
              ${o.payments.map((p) => `<tr><td class="small">${tgl(p.paid_at || p.created_at)}<div class="muted mono">${esc(p.ref)}</div></td><td>${p.method}${p.cash_received ? `<div class="small muted">terima ${rp(p.cash_received)}, kembali ${rp(p.change_amount)}</div>` : ''}${p.note ? `<div class="small muted">${esc(p.note)}</div>` : ''}</td>
                <td class="right nowrap">${rp(p.amount)}</td><td><span class="badge ${p.status === 'PAID' ? 'b-ok' : p.status === 'PENDING' ? 'b-warn' : ''}">${p.status}</span></td>
                <td class="right">${p.status === 'PENDING' && App.can('frontoffice') ? `<button class="btn btn-sm btn-ghost" data-qris="${p.id}">QR</button>` : ''}</td></tr>`).join('')}
              </tbody></table></div>` : '<p class="muted small" style="margin:0">Belum ada pembayaran.</p>'}</div></div>
            ${o.materials.length ? `<div class="card"><div class="card-head"><h3>Bahan terpakai (HPP LIFO)</h3><strong>${rp(o.material_cost)}</strong></div><div class="card-body">${o.materials.map((m) => `<div class="list-row"><span>${esc(m.name)}</span><span class="small">${m.qty} ${esc(m.unit)} · ${rp(m.cost)}</span></div>`).join('')}</div></div>` : ''}
            <div class="card"><div class="card-head"><h3>Riwayat</h3></div><div class="card-body"><ul class="timeline">${o.logs.slice().reverse().map((l) => `<li><strong>${STATUS_LABEL[l.status]}</strong> <span class="small muted">· ${tgl(l.created_at)} · ${esc(l.user_name)}</span>${l.note ? `<div class="small muted">${esc(l.note)}</div>` : ''}</li>`).join('')}</ul></div></div>
          </div>
          <div class="grid">
            <div class="card card-pad">
              <h3>Pelanggan</h3>
              <div style="font-weight:700">${esc(o.customer_name)}</div>
              <div class="muted">${phoneLocal(o.customer_phone)}</div>
              ${o.customer_address ? `<div class="small" style="margin-top:6px">${esc(o.customer_address)}</div>` : ''}
              <div class="small" style="margin-top:10px">Pengembalian: <strong>${o.return_method === 'DELIVERY' ? 'Diantar' : 'Ambil di toko'}</strong>${o.address && o.return_method === 'DELIVERY' ? `<br>${esc(o.address)}` : ''}</div>
              <div class="small">Estimasi selesai: <strong>${tgl(o.due_date, false)}</strong></div>
              ${o.notes ? `<div class="small" style="margin-top:6px">Catatan: ${esc(o.notes)}</div>` : ''}
              <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
                <a class="btn btn-sm btn-ghost" target="_blank" rel="noopener" href="${wa(o.customer_phone, waText)}">WhatsApp</a>
                <button class="btn btn-sm btn-ghost" id="print">Cetak nota</button>
              </div>
            </div>
            <div class="card"><div class="card-head"><h3>Jemput / antar</h3>${!['DELIVERED', 'PICKED_UP', 'CANCELLED'].includes(o.status) ? '<button class="btn btn-ghost btn-sm" id="new-del">+ Tugas</button>' : ''}</div><div class="card-body">
              ${o.deliveries.length ? o.deliveries.map((d) => `<div class="list-row"><div><strong>${d.type === 'PICKUP' ? 'Jemput' : 'Antar'}</strong> <span class="small muted">${d.courier_name ? '· ' + esc(d.courier_name) : ''}</span><div class="small muted">${esc(d.address)}${d.scheduled_at ? ' · ' + tgl(d.scheduled_at) : ''}</div>${d.proof_note ? `<div class="small">“${esc(d.proof_note)}”</div>` : ''}</div><span class="badge ${d.status === 'DONE' ? 'b-ok' : d.status === 'FAILED' ? 'b-danger' : d.status === 'CANCELLED' ? '' : 'b-info'}">${d.status}</span></div>`).join('') : '<p class="muted small" style="margin:0">Tidak ada.</p>'}
              ${activeDel.length ? '<a href="#/dispatch" class="small">Atur di dispatch →</a>' : ''}
            </div></div>
            <div class="card"><div class="card-head"><h3>Dispute</h3>${o.status !== 'CANCELLED' && !o.disputes.some((d) => ['OPEN', 'INVESTIGATING'].includes(d.status)) ? '<button class="btn btn-ghost btn-sm" id="new-dsp">+ Catat komplain</button>' : ''}</div><div class="card-body">
              ${o.disputes.length ? o.disputes.map((d) => `<div class="list-row"><a href="#/dispute/${d.id}"><strong class="mono">${esc(d.code)}</strong><div class="small muted">${DISPUTE_CAT[d.category]}</div></a><span class="badge ${SK.DISPUTE_STATUS[d.status][1]}">${SK.DISPUTE_STATUS[d.status][0]}</span></div>`).join('') : '<p class="muted small" style="margin:0">Tidak ada komplain.</p>'}
            </div></div>
            <div class="card card-pad center"><div class="qr-box" style="width:140px;padding:6px">${o.track_qr_svg}</div><div class="small muted" style="margin-top:6px">QR lacak order untuk pelanggan</div></div>
          </div>
        </div>`;

      el.querySelectorAll('[data-status]').forEach((b) => b.onclick = () => changeStatus(o, b.dataset.status, b));
      const pay = el.querySelector('#pay');
      if (pay) pay.onclick = () => openPay(o, () => App.refresh());
      el.querySelectorAll('[data-qris]').forEach((b) => b.onclick = async () => {
        const p = await api('/api/payments/' + b.dataset.qris);
        showQris(p, () => App.refresh());
      });
      el.querySelector('#print').onclick = () => printReceipt(o);
      const edit = el.querySelector('#edit');
      if (edit) edit.onclick = () => editItems(o);
      const nd = el.querySelector('#new-del');
      if (nd) nd.onclick = () => newDelivery(o);
      const ds = el.querySelector('#new-dsp');
      if (ds) ds.onclick = () => newDispute(o);
    },
  });

  async function changeStatus(o, to, btn) {
    const go = async (note) => {
      try {
        await api(`/api/orders/${o.id}/status`, { method: 'POST', body: { status: to, note } });
        toast(`Status: ${STATUS_LABEL[to]}`, 'ok');
        App.refresh();
      } catch (err) {
        if (err.data && err.data.shortages) {
          modal({ title: 'Stok bahan tidak cukup', content: `<div class="modal-body"><p>Order tidak bisa diproses karena bahan kurang:</p>${err.data.shortages.map((s) => `<div class="list-row"><span>${esc(s.name)}</span><span>butuh ${s.need} ${esc(s.unit)} · ada ${s.available}</span></div>`).join('')}<p class="small muted" style="margin-top:12px">Catat barang masuk di menu Inventori, lalu coba lagi.</p></div>` });
        } else toast(err.message, 'err');
      }
    };
    if (to === 'CANCELLED' || (to === 'WASHING' && o.status === 'QC')) {
      const m = modal({
        title: to === 'CANCELLED' ? 'Batalkan order?' : 'Cuci ulang',
        content: `<form class="modal-body"><div class="field"><label>${to === 'CANCELLED' ? 'Alasan pembatalan' : 'Catatan QC (bagian yang belum bersih)'}</label><textarea name="note" required maxlength="300"></textarea></div>
          ${to === 'CANCELLED' && o.paid > 0 ? `<div class="alert-box warn">Dana yang sudah dibayar (${rp(o.paid - o.refunded)}) akan otomatis dicatat sebagai refund.</div>` : ''}
          <button class="btn ${to === 'CANCELLED' ? 'btn-danger' : 'btn-primary'} btn-block">${to === 'CANCELLED' ? 'Ya, batalkan' : 'Kembalikan ke proses cuci'}</button></form>`,
      });
      const f = m.el.querySelector('form');
      f.onsubmit = (e) => { e.preventDefault(); m.close(); go(f.note.value); };
      return;
    }
    withBusy(btn, () => go());
  }

  // ---------- Pembayaran ----------
  function openPay(o, done, fromKasir = false) {
    if (!o.outstanding) return;
    const m = modal({
      title: `Pembayaran ${o.code}`,
      content: `<div class="modal-body">
        <div class="center" style="margin-bottom:14px"><div class="muted small">Sisa tagihan</div><div style="font-size:30px;font-weight:800">${rp(o.outstanding)}</div></div>
        <div class="seg" id="pm" style="display:flex;margin-bottom:16px"><button type="button" class="on" data-v="CASH" style="flex:1">Tunai</button><button type="button" data-v="QRIS" style="flex:1">QRIS</button></div>
        <form id="pf">
          <div class="field"><label>Nominal dibayar</label><input name="amount" type="number" min="1" max="${o.outstanding}" value="${o.outstanding}"><div class="hint">Isi kurang dari total untuk DP / bayar sebagian.</div></div>
          <div id="cash-part">
            <div class="field"><label>Uang diterima</label><input name="cash_received" type="number" min="1" value="${o.outstanding}"></div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin:-6px 0 12px">${[0, 20000, 50000, 100000, 200000].filter((v) => !v || v > o.outstanding).slice(0, 4).map((v) => `<button type="button" class="btn btn-sm btn-ghost" data-cash="${v}">${v ? rp(v) : 'Uang pas'}</button>`).join('')}</div>
            <div class="summary-box"><div class="sum-row total" style="border:0;margin:0;padding:0"><span>Kembalian</span><span id="chg">Rp 0</span></div></div>
          </div>
          <button class="btn btn-primary btn-lg btn-block" style="margin-top:14px" type="submit">Simpan pembayaran tunai</button>
          ${fromKasir ? '<button type="button" class="btn btn-ghost btn-block" style="margin-top:8px" data-close>Bayar nanti</button>' : ''}
        </form></div>`,
    });
    let method = 'CASH';
    const f = m.el.querySelector('#pf');
    const sub = f.querySelector('button[type=submit]');
    const calc = () => { m.el.querySelector('#chg').textContent = rp(Math.max(0, (Number(f.cash_received.value) || 0) - (Number(f.amount.value) || 0))); };
    f.amount.oninput = () => { if (Number(f.cash_received.value) < Number(f.amount.value)) f.cash_received.value = f.amount.value; calc(); };
    f.cash_received.oninput = calc;
    m.el.querySelectorAll('[data-cash]').forEach((b) => b.onclick = () => { f.cash_received.value = Number(b.dataset.cash) || f.amount.value; calc(); });
    m.el.querySelectorAll('[data-close]').forEach((b) => b.onclick = m.close);
    m.el.querySelector('#pm').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      method = b.dataset.v;
      m.el.querySelectorAll('#pm button').forEach((x) => x.classList.toggle('on', x === b));
      m.el.querySelector('#cash-part').classList.toggle('hidden', method !== 'CASH');
      sub.textContent = method === 'CASH' ? 'Simpan pembayaran tunai' : 'Tampilkan QRIS';
    });
    f.onsubmit = (e) => {
      e.preventDefault();
      withBusy(sub, async () => {
        try {
          const body = { method, amount: Number(f.amount.value) };
          if (method === 'CASH') body.cash_received = Number(f.cash_received.value);
          const r = await api(`/api/orders/${o.id}/payments`, { method: 'POST', body });
          m.close();
          if (method === 'CASH') {
            toast(`Pembayaran ${rp(r.payment.amount)} tersimpan${r.payment.change_amount ? ` · kembalian ${rp(r.payment.change_amount)}` : ''}`, 'ok');
            done && done();
          } else showQris(r.payment, done);
        } catch (err) { toast(err.message, 'err'); }
      });
    };
    calc();
  }

  function showQris(p, done) {
    let finished = false;
    const m = modal({
      title: 'Pembayaran QRIS',
      content: `<div class="modal-body center">
        <div class="qr-box">${p.qr_svg || '<p class="muted">QR tidak tersedia</p>'}</div>
        <div style="font-size:28px;font-weight:800;margin-top:12px">${rp(p.amount)}</div>
        <p class="small muted">Minta pelanggan scan dengan m-banking / e-wallet. Ref <span class="mono">${esc(p.ref)}</span></p>
        <p id="qs" class="small"><span class="spinner"></span> Menunggu pembayaran… <span id="qt" class="mono"></span></p>
        ${p.is_demo ? '<div class="alert-box warn" style="text-align:left">QRIS demo — ganti dengan QRIS statis asli di Pengaturan agar bisa menerima uang.</div>' : ''}
        <div class="alert-box info" style="text-align:left">Tanpa payment gateway, cek mutasi/notifikasi di aplikasi bank atau QRIS merchant Anda, lalu tekan <strong>Konfirmasi diterima</strong>. Jika memakai gateway, status berubah otomatis via webhook.</div>
      </div>
      <div class="modal-foot"><button class="btn btn-danger" id="qc">Batalkan QR</button><button class="btn btn-primary" id="qok">Konfirmasi diterima</button></div>`,
      onClose: () => { if (!finished) done && done(); },
    });
    const qt = m.el.querySelector('#qt');
    const tick = () => { const s = Math.max(0, Math.round((p.expires_at - Date.now()) / 1000)); qt.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; return s; };
    tick();
    let n = 0;
    const timer = setInterval(async () => {
      if (!document.body.contains(m.el)) return clearInterval(timer);
      const left = tick();
      if (++n % 4 !== 0 && left > 0) return;
      try {
        const s = await api('/api/payments/' + p.id);
        if (s.status === 'PAID') { clearInterval(timer); finished = true; toast('Pembayaran QRIS diterima ✓', 'ok'); m.close(); done && done(); }
        else if (s.status !== 'PENDING') { clearInterval(timer); m.el.querySelector('#qs').innerHTML = `<span class="badge b-danger">${s.status === 'EXPIRED' ? 'QR kedaluwarsa' : 'Dibatalkan'}</span>`; }
      } catch { /* abaikan */ }
    }, 1000);
    m.el.querySelector('#qok').onclick = (e) => withBusy(e.target, async () => {
      try { await api(`/api/payments/${p.id}/confirm`, { method: 'POST' }); clearInterval(timer); finished = true; toast('Pembayaran QRIS dikonfirmasi ✓', 'ok'); m.close(); done && done(); }
      catch (err) { toast(err.message, 'err'); }
    });
    m.el.querySelector('#qc').onclick = (e) => withBusy(e.target, async () => {
      try { await api(`/api/payments/${p.id}/cancel`, { method: 'POST' }); clearInterval(timer); m.close(); }
      catch (err) { toast(err.message, 'err'); }
    });
  }
  App.openPay = openPay;
  App.showQris = showQris;

  async function editItems(o) {
    const services = (await api('/api/services')).filter((s) => s.active || o.items.some((i) => i.service_id === s.id));
    const items = o.items.length ? o.items.map((i) => ({ service_id: i.service_id, shoe: i.shoe || '', qty: i.qty, condition_note: i.condition_note || '' }))
      : [{ service_id: services[0].id, shoe: '', qty: 1, condition_note: '' }];
    const m = modal({ title: `Ubah item ${o.code}`, wide: true, content: `<form class="modal-body"><div id="ei"></div><button type="button" class="btn btn-ghost btn-sm" id="ea" style="margin-top:8px">+ Tambah pasang</button>
      <div class="field-row" style="margin-top:14px"><div class="field"><label>Diskon</label><input name="discount" type="number" min="0" value="${o.discount}"></div><div class="field"><label>Ongkir</label><input name="delivery_fee" type="number" min="0" value="${o.delivery_fee}"></div>
      <div class="field"><label>Pengembalian</label><select name="return_method"><option value="STORE" ${o.return_method === 'STORE' ? 'selected' : ''}>Ambil di toko</option><option value="DELIVERY" ${o.return_method === 'DELIVERY' ? 'selected' : ''}>Antar</option></select></div></div>
      <div class="field"><label>Alamat antar</label><input name="address" value="${esc(o.address || o.customer_address || '')}"></div>
      <button class="btn btn-primary btn-block">Simpan perubahan</button></form>` });
    const box = m.el.querySelector('#ei');
    const draw = () => {
      box.innerHTML = items.map((it, i) => `<div class="item-row" data-i="${i}">
        <div class="field"><label>Layanan</label><select data-k="service_id">${services.map((s) => `<option value="${s.id}" ${s.id === Number(it.service_id) ? 'selected' : ''}>${esc(s.name)} — ${rp(s.price)}</option>`).join('')}</select></div>
        <div class="field"><label>Sepatu</label><input data-k="shoe" value="${esc(it.shoe)}"></div>
        <div class="field"><label>Pasang</label><input data-k="qty" type="number" min="1" value="${it.qty}"></div>
        <div class="field"><label>Kondisi awal</label><input data-k="condition_note" value="${esc(it.condition_note)}"></div>
        <button type="button" class="btn btn-ghost btn-sm rm" data-rm="${i}">✕</button></div>`).join('');
    };
    box.addEventListener('input', (e) => { const r = e.target.closest('[data-i]'); if (r && e.target.dataset.k) items[r.dataset.i][e.target.dataset.k] = e.target.value; });
    box.addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (b) { items.splice(Number(b.dataset.rm), 1); draw(); } });
    m.el.querySelector('#ea').onclick = () => { items.push({ service_id: services[0].id, shoe: '', qty: 1, condition_note: '' }); draw(); };
    const f = m.el.querySelector('form');
    f.onsubmit = (e) => { e.preventDefault(); const d = formData(f); withBusy(f.querySelector('button:last-child'), async () => {
      try {
        await api('/api/orders/' + o.id, { method: 'PUT', body: { ...d, discount: d.discount || 0, delivery_fee: d.delivery_fee || 0, items: items.map((i) => ({ ...i, service_id: Number(i.service_id), qty: Number(i.qty) })) } });
        m.close(); toast('Item diperbarui', 'ok'); App.refresh();
      } catch (err) { toast(err.message, 'err'); }
    }); };
    draw();
  }

  function newDelivery(o) {
    const m = modal({ title: 'Buat tugas kurir', content: `<form class="modal-body">
      <div class="field"><label>Jenis</label><select name="type"><option value="DROPOFF">Antar ke pelanggan</option><option value="PICKUP" ${o.status === 'BOOKED' ? 'selected' : ''}>Jemput dari pelanggan</option></select></div>
      <div class="field"><label>Alamat</label><input name="address" value="${esc(o.address || o.customer_address || '')}" required></div>
      <div class="field"><label>Jadwal</label><input name="scheduled_at" type="datetime-local"></div>
      <div class="field"><label>Catatan</label><input name="note"></div>
      <button class="btn btn-primary btn-block">Buat tugas</button></form>` });
    const f = m.el.querySelector('form');
    f.onsubmit = (e) => { e.preventDefault(); withBusy(f.querySelector('button'), async () => {
      try { await api(`/api/orders/${o.id}/deliveries`, { method: 'POST', body: formData(f) }); m.close(); toast('Tugas dibuat — tugaskan kurir di Dispatch', 'ok'); App.refresh(); }
      catch (err) { toast(err.message, 'err'); }
    }); };
  }

  function newDispute(o) {
    const m = modal({ title: 'Catat komplain pelanggan', content: `<form class="modal-body">
      <div class="field"><label>Kategori</label><select name="category">${Object.entries(DISPUTE_CAT).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
      <div class="field"><label>Deskripsi</label><textarea name="description" required></textarea></div>
      <button class="btn btn-primary btn-block">Simpan</button></form>` });
    const f = m.el.querySelector('form');
    f.onsubmit = (e) => { e.preventDefault(); withBusy(f.querySelector('button'), async () => {
      try { const r = await api('/api/disputes', { method: 'POST', body: { order_id: o.id, ...formData(f) } }); m.close(); App.go('#/dispute/' + r.id); }
      catch (err) { toast(err.message, 'err'); }
    }); };
  }

  function printReceipt(o) {
    const info = App.info || {};
    const area = document.getElementById('print-area');
    area.innerHTML = `<div class="receipt">
      <h2>${esc(info.business_name || 'Sepatu Kinclong')}</h2>
      <div class="c">${esc(info.address || '')}<br>WA ${esc(phoneLocal(info.phone))}</div><hr>
      <div class="r"><span>No</span><strong>${esc(o.code)}</strong></div>
      <div class="r"><span>Tanggal</span><span>${tgl(o.created_at)}</span></div>
      <div class="r"><span>Pelanggan</span><span>${esc(o.customer_name)}</span></div>
      <div class="r"><span>HP</span><span>${phoneLocal(o.customer_phone)}</span></div>
      <div class="r"><span>Estimasi</span><span>${tgl(o.due_date, false)}</span></div>
      <div class="r"><span>Kembali</span><span>${o.return_method === 'DELIVERY' ? 'Diantar' : 'Ambil di toko'}</span></div><hr>
      ${o.items.map((i) => `<div>${i.qty}x ${esc(i.service_name)}</div>${i.shoe ? `<div>  ${esc(i.shoe)}</div>` : ''}${i.condition_note ? `<div>  Kondisi: ${esc(i.condition_note)}</div>` : ''}<div class="r"><span>  @${rp(i.price)}</span><span>${rp(i.qty * i.price)}</span></div>`).join('')}<hr>
      <div class="r"><span>Subtotal</span><span>${rp(o.subtotal)}</span></div>
      ${o.discount ? `<div class="r"><span>Diskon</span><span>-${rp(o.discount)}</span></div>` : ''}
      ${o.delivery_fee ? `<div class="r"><span>Ongkir</span><span>${rp(o.delivery_fee)}</span></div>` : ''}
      <div class="r"><strong>TOTAL</strong><strong>${rp(o.total)}</strong></div>
      <div class="r"><span>Dibayar</span><span>${rp(o.paid)}</span></div>
      <div class="r"><strong>SISA</strong><strong>${rp(o.outstanding)}</strong></div><hr>
      <div class="c">Lacak status order:</div><div class="qr">${o.track_qr_svg}</div>
      <div class="c">${esc(o.track_url)}</div><hr>
      <div class="c">Komplain maks. 3 hari setelah sepatu diterima melalui halaman lacak. Terima kasih!</div></div>`;
    document.body.classList.add('printing');
    const after = () => { document.body.classList.remove('printing'); window.removeEventListener('afterprint', after); };
    window.addEventListener('afterprint', after);
    setTimeout(() => window.print(), 50);
  }

  // ---------- Start ----------
  async function start() {
    try { App.me = await api('/api/auth/me'); } catch { return location.replace('/login'); }
    try { App.info = await api('/api/public/info'); } catch { App.info = {}; }
    renderSide();
    document.getElementById('menu-btn').onclick = () => { document.getElementById('side').classList.add('open'); document.getElementById('scrim').classList.add('on'); };
    document.getElementById('scrim').onclick = () => { document.getElementById('side').classList.remove('open'); document.getElementById('scrim').classList.remove('on'); };
    window.addEventListener('hashchange', render);
    await render();
    refreshBadges();
    setInterval(refreshBadges, 30000);
  }
  window.addEventListener('load', start);
})();
