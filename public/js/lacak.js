// Halaman lacak order: status, pembayaran QRIS mandiri, dan komplain (dispute) pelanggan.
(function () {
  const { esc, rp, tgl, api, toast, modal, formData, withBusy, ORDER_BADGE, PAY_LABEL, DISPUTE_CAT, DISPUTE_STATUS } = window.SK;
  const form = document.getElementById('track-form');
  const out = document.getElementById('result');
  let creds = null;
  let pollTimer = null;

  const STAGES = ['Diterima', 'Dicuci', 'QC', 'Siap', 'Selesai'];
  const STAGE_OF = { BOOKED: 0, RECEIVED: 1, WASHING: 2, QC: 3, READY: 4, DELIVERING: 4, DELIVERED: 5, PICKED_UP: 5, CANCELLED: 0 };

  const qs = new URLSearchParams(location.search);
  form.code.value = qs.get('kode') || '';
  form.phone.value = qs.get('hp') || sessionStorage.getItem('sk_phone') || '';
  if (location.hash === '#komplain' && !form.code.value) {
    out.innerHTML = `<div class="card card-pad">Untuk mengajukan komplain, lacak order Anda terlebih dahulu — tombol komplain ada di bawah detail order.</div>`;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = formData(form);
    if (!d.code || !d.phone) return toast('Isi kode order dan nomor HP', 'err');
    creds = { code: d.code.trim().toUpperCase(), phone: d.phone };
    sessionStorage.setItem('sk_phone', d.phone);
    await withBusy(form.querySelector('button'), load);
  });

  async function load() {
    try {
      const o = await api('/api/public/track', { method: 'POST', body: creds });
      render(o);
      history.replaceState(null, '', `/lacak?kode=${encodeURIComponent(o.code)}${location.hash}`);
    } catch (err) {
      out.innerHTML = `<div class="card card-pad empty">${esc(err.message)}</div>`;
    }
  }

  function render(o) {
    const stage = STAGE_OF[o.status];
    const [payText, payCls] = PAY_LABEL[o.payment_status];
    const canPay = o.outstanding > 0 && o.status !== 'CANCELLED' && o.items.length > 0;
    const activeDispute = o.disputes.find((d) => d.status === 'OPEN' || d.status === 'INVESTIGATING');
    const drop = o.deliveries.filter((d) => d.status !== 'CANCELLED').slice(-1)[0];

    out.innerHTML = `
    <div class="grid-2">
      <div style="display:grid;gap:20px">
        <div class="card card-pad">
          <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:start">
            <div><div class="muted small">Order</div><h2 class="mono" style="margin:0">${esc(o.code)}</h2><div class="muted small">a.n. ${esc(o.customer_name)} · dibuat ${tgl(o.created_at)}</div></div>
            <span class="badge ${ORDER_BADGE[o.status]}" style="font-size:13px;padding:6px 12px">${esc(o.status_label)}</span>
          </div>
          ${o.status === 'CANCELLED' ? '' : `
          <div class="progress">${STAGES.map((_, i) => `<div class="${i < stage ? 'on' : ''}"></div>`).join('')}</div>
          <div class="progress-labels">${STAGES.map((s, i) => `<span class="${i < stage ? 'on' : ''}">${s}</span>`).join('')}</div>`}
          ${o.due_date && !['DELIVERED', 'PICKED_UP', 'CANCELLED'].includes(o.status) ? `<p class="small" style="margin:14px 0 0">Estimasi selesai: <strong>${tgl(o.due_date, false)}</strong></p>` : ''}
          ${drop ? `<p class="small" style="margin:8px 0 0">${drop.type === 'PICKUP' ? 'Penjemputan' : 'Pengantaran'}: <strong>${esc(drop.label)}</strong>${drop.courier ? ` · kurir ${esc(drop.courier)}` : ''}${drop.scheduled_at ? ` · jadwal ${tgl(drop.scheduled_at)}` : ''}</p>` : ''}
        </div>

        <div class="card card-pad">
          <h3>Riwayat</h3>
          <ul class="timeline">${o.timeline.slice().reverse().map((t) => `<li><strong>${esc(t.label)}</strong> <span class="muted small">· ${tgl(t.at)}</span>${t.note ? `<div class="small muted">${esc(t.note)}</div>` : ''}</li>`).join('')}</ul>
        </div>

        <div class="card card-pad" id="komplain">
          <h3>Komplain</h3>
          ${o.disputes.length ? o.disputes.map((d) => disputeBlock(d)).join('<hr style="border:0;border-top:1px solid var(--line);margin:18px 0">') : '<p class="muted small">Belum ada komplain untuk order ini.</p>'}
          ${!activeDispute && o.status !== 'CANCELLED' ? `
          <details style="margin-top:12px" ${location.hash === '#komplain' && !o.disputes.length ? 'open' : ''}>
            <summary class="btn btn-ghost btn-sm">Ajukan komplain baru</summary>
            <form id="dispute-form" style="margin-top:14px">
              <div class="field"><label for="d-cat">Jenis masalah</label><select id="d-cat" name="category">${Object.entries(DISPUTE_CAT).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
              <div class="field"><label for="d-desc">Ceritakan masalahnya</label><textarea id="d-desc" name="description" required minlength="10" maxlength="1500" placeholder="Mis. masih ada noda di bagian samping kiri, sudah dicek saat diterima tanggal ..."></textarea></div>
              <button class="btn btn-primary" type="submit">Kirim komplain</button>
            </form>
          </details>` : ''}
        </div>
      </div>

      <div class="card card-pad" style="position:sticky;top:84px">
        <h3>Rincian &amp; pembayaran</h3>
        ${o.items.length ? o.items.map((i) => `<div class="sum-row"><span>${i.qty}× ${esc(i.service_name)}${i.shoe ? `<br><span class="muted small">${esc(i.shoe)}</span>` : ''}</span><span class="nowrap">${rp(i.price * i.qty)}</span></div>`).join('')
          : '<p class="muted small">Rincian layanan akan diisi setelah sepatu dicek di toko.</p>'}
        ${o.discount ? `<div class="sum-row"><span>Diskon</span><span>−${rp(o.discount)}</span></div>` : ''}
        ${o.delivery_fee ? `<div class="sum-row"><span>Ongkir</span><span>${rp(o.delivery_fee)}</span></div>` : ''}
        <div class="sum-row total"><span>Total</span><span>${rp(o.total)}</span></div>
        <div class="sum-row"><span>Sudah dibayar</span><span>${rp(o.paid)}</span></div>
        ${o.refunded ? `<div class="sum-row"><span>Dikembalikan</span><span>${rp(o.refunded)}</span></div>` : ''}
        <div class="sum-row"><span>Sisa tagihan</span><strong>${rp(o.outstanding)}</strong></div>
        <div style="margin:10px 0 16px"><span class="badge ${payCls}">${payText}</span></div>
        ${canPay ? `<button class="btn btn-primary btn-block" id="pay-qris">Bayar ${rp(o.outstanding)} via QRIS</button>
          <p class="small muted" style="margin-top:8px">Atau bayar tunai di toko / saat sepatu diantar.</p>` : ''}
      </div>
    </div>`;

    const payBtn = document.getElementById('pay-qris');
    if (payBtn) payBtn.addEventListener('click', () => withBusy(payBtn, payQris));
    if (o.pending_qris && !document.querySelector('.modal-backdrop') && sessionStorage.getItem('sk_qris_open') === o.pending_qris.ref) showQris(o.pending_qris);

    const dform = document.getElementById('dispute-form');
    if (dform) dform.addEventListener('submit', async (e) => {
      e.preventDefault();
      await withBusy(dform.querySelector('button'), async () => {
        try {
          const r = await api('/api/public/disputes', { method: 'POST', body: { ...creds, ...formData(dform) } });
          toast(r.message, 'ok');
          await load();
          document.getElementById('komplain').scrollIntoView({ behavior: 'smooth' });
        } catch (err) { toast(err.message, 'err'); }
      });
    });
    out.querySelectorAll('form[data-reply]').forEach((f) => f.addEventListener('submit', async (e) => {
      e.preventDefault();
      await withBusy(f.querySelector('button'), async () => {
        try {
          await api(`/api/public/disputes/${encodeURIComponent(f.dataset.reply)}/messages`, { method: 'POST', body: { order_code: creds.code, phone: creds.phone, message: f.message.value } });
          await load();
        } catch (err) { toast(err.message, 'err'); }
      });
    }));
    if (location.hash === '#komplain') document.getElementById('komplain').scrollIntoView();
  }

  function disputeBlock(d) {
    const [st, cls] = DISPUTE_STATUS[d.status];
    const open = d.status === 'OPEN' || d.status === 'INVESTIGATING';
    return `<div>
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><strong class="mono">${esc(d.code)}</strong><span class="badge ${cls}">${st}</span></div>
      <div class="small muted">${DISPUTE_CAT[d.category]} · ${tgl(d.created_at)}</div>
      <div class="thread">${d.messages.map((m) => `<div class="msg ${m.author_type}"><div class="who">${m.author_type === 'CUSTOMER' ? 'Anda' : esc(m.author_name || 'Tim kami')} · ${tgl(m.created_at)}</div>${esc(m.message)}</div>`).join('')}</div>
      ${open ? `<form data-reply="${esc(d.code)}" style="display:flex;gap:8px"><input name="message" required maxlength="1500" placeholder="Tulis balasan…"><button class="btn btn-primary" type="submit">Kirim</button></form>` : ''}
    </div>`;
  }

  async function payQris() {
    try {
      const p = await api('/api/public/pay-qris', { method: 'POST', body: creds });
      showQris(p);
    } catch (err) { toast(err.message, 'err'); }
  }

  function showQris(p) {
    sessionStorage.setItem('sk_qris_open', p.ref);
    const m = modal({
      title: 'Bayar dengan QRIS',
      content: `<div class="modal-body center">
        <div class="qr-box">${p.qr_svg}</div>
        <div style="font-size:26px;font-weight:800;margin-top:14px">${rp(p.amount)}</div>
        <p class="small muted">Scan dengan aplikasi m-banking atau e-wallet apa pun. Nominal sudah terisi otomatis.</p>
        <p class="small" id="qris-status"><span class="spinner"></span> Menunggu pembayaran… <span id="qris-timer" class="mono"></span></p>
        <p class="small muted">Ref: <span class="mono">${esc(p.ref)}</span></p>
        ${p.is_demo ? '<div class="demo-note">Mode demo: QRIS ini contoh dan tidak bisa menerima uang. Pemilik toko perlu memasang QRIS asli di pengaturan.</div>' : ''}
      </div>`,
      onClose: () => { clearInterval(pollTimer); sessionStorage.removeItem('sk_qris_open'); load(); },
    });
    const timer = m.el.querySelector('#qris-timer');
    const tick = () => {
      const s = Math.max(0, Math.round((p.expires_at - Date.now()) / 1000));
      timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      return s;
    };
    tick();
    clearInterval(pollTimer);
    let n = 0;
    pollTimer = setInterval(async () => {
      const left = tick();
      if (++n % 5 !== 0 && left > 0) return; // cek server tiap 5 detik
      try {
        const s = await api('/api/public/payment-status', { method: 'POST', body: { ...creds, ref: p.ref } });
        if (s.status === 'PAID') {
          m.el.querySelector('#qris-status').innerHTML = '<span class="badge b-ok">Pembayaran diterima — terima kasih!</span>';
          clearInterval(pollTimer);
          setTimeout(m.close, 1800);
        } else if (s.status !== 'PENDING' || left <= 0) {
          m.el.querySelector('#qris-status').innerHTML = '<span class="badge b-danger">QR kedaluwarsa. Tutup dan buat ulang.</span>';
          clearInterval(pollTimer);
        }
      } catch { /* coba lagi */ }
    }, 1000);
  }

  if (form.code.value && form.phone.value) form.requestSubmit();
})();
