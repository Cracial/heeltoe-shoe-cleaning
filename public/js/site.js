// Situs publik: navigasi & footer bersama, info usaha dari API, daftar layanan, form booking & kontak.
(function () {
  const { esc, rp, api, toast, formData, withBusy, phoneLocal } = window.SK;
  const page = document.body.dataset.page;

  const navLinks = [
    ['/#layanan', 'Layanan', 'home-l'], ['/#cara-kerja', 'Cara kerja', 'home-c'], ['/profil', 'Profil', 'profil'],
    ['/lacak', 'Lacak order', 'lacak'],
  ];
  const nav = document.getElementById('site-nav');
  if (nav) {
    nav.className = 'nav';
    nav.innerHTML = `<div class="wrap nav-in">
      <a class="logo" href="/"><img src="/favicon.svg" alt=""><span data-info="business_name">Sepatu Kinclong</span></a>
      <button class="menu-btn" aria-label="Menu" aria-expanded="false"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
      <nav class="nav-links">
        ${navLinks.map(([h, t, k]) => `<a href="${h}" class="${k === page ? 'active' : ''}">${t}</a>`).join('')}
        <a href="/login" style="color:var(--muted)">Staf</a>
        <a href="/#booking" class="btn btn-primary btn-sm">Jemput sekarang</a>
      </nav></div>`;
    const btn = nav.querySelector('.menu-btn');
    const links = nav.querySelector('.nav-links');
    btn.addEventListener('click', () => { links.classList.toggle('open'); btn.setAttribute('aria-expanded', links.classList.contains('open')); });
    links.addEventListener('click', (e) => { if (e.target.tagName === 'A') links.classList.remove('open'); });
    const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  const foot = document.getElementById('site-foot');
  if (foot) {
    foot.innerHTML = `<div class="wrap">
      <div class="foot-grid">
        <div>
          <a class="logo" href="/" style="margin-bottom:12px"><img src="/favicon.svg" alt=""><span data-info="business_name">Sepatu Kinclong</span></a>
          <p data-info="tagline" style="max-width:360px"></p>
          <p class="small"><span data-info="address"></span></p>
        </div>
        <div><h4>Menu</h4><a href="/#layanan">Layanan &amp; harga</a><a href="/#booking">Booking jemput</a><a href="/lacak">Lacak order</a><a href="/lacak#komplain">Ajukan komplain</a><a href="/profil">Profil perusahaan</a></div>
        <div><h4>Kontak</h4><a data-info-wa href="#">WhatsApp</a><a data-info-mail href="#"></a><a data-info-ig href="#" target="_blank" rel="noopener"></a><span class="small" data-info="open_hours"></span></div>
      </div>
      <div class="copy"><span>© ${new Date().getFullYear()} <span data-info="business_name">Sepatu Kinclong</span>. Semua hak dilindungi.</span><a href="/login">Masuk staf</a></div>
    </div>`;
  }

  // Isi data usaha
  api('/api/public/info').then((info) => {
    window.SK.info = info;
    document.querySelectorAll('[data-info]').forEach((el) => {
      const k = el.dataset.info;
      if (k === 'delivery_fee_text') el.textContent = rp(info.delivery_fee);
      else if (info[k] !== undefined && info[k] !== '') el.textContent = info[k];
    });
    document.querySelectorAll('[data-info-wa]').forEach((a) => {
      a.href = `https://wa.me/${info.phone}`;
      if (!a.textContent || a.textContent === 'WhatsApp') a.textContent = 'WhatsApp ' + phoneLocal(info.phone);
      a.target = '_blank'; a.rel = 'noopener';
    });
    document.querySelectorAll('[data-info-mail]').forEach((a) => { a.href = 'mailto:' + info.email; a.textContent = info.email; });
    document.querySelectorAll('[data-info-ig]').forEach((a) => {
      if (!info.instagram) return a.remove();
      a.href = 'https://instagram.com/' + info.instagram; a.textContent = '@' + info.instagram;
    });
    document.querySelectorAll('[data-info-maps]').forEach((a) => { a.href = info.maps_url; });
    const mission = document.getElementById('mission');
    if (mission) mission.innerHTML = info.mission.map((m) => `<li>${esc(m)}</li>`).join('');
    document.dispatchEvent(new CustomEvent('sk:info', { detail: info }));
  }).catch(() => {});

  // Layanan
  const svcBox = document.getElementById('services');
  const svcSelect = document.getElementById('b-service');
  if (svcBox || svcSelect) {
    api('/api/public/services').then((list) => {
      if (svcBox) {
        svcBox.innerHTML = list.map((s) => `<article class="svc">
          <div class="meta"><span class="badge b-brand plain">${s.duration_days <= 1 ? 'Selesai 1 hari' : `± ${s.duration_days} hari`}</span></div>
          <h3>${esc(s.name)}</h3><p>${esc(s.description || '')}</p>
          <div class="price">${rp(s.price)} <small>/ pasang</small></div></article>`).join('');
      }
      if (svcSelect) svcSelect.insertAdjacentHTML('beforeend', list.map((s) => `<option value="${s.id}">${esc(s.name)} — ${rp(s.price)}</option>`).join(''));
    }).catch(() => { if (svcBox) svcBox.innerHTML = '<p class="empty">Gagal memuat layanan.</p>'; });
  }

  // Booking
  const bform = document.getElementById('booking-form');
  if (bform) {
    const sch = document.getElementById('b-schedule');
    const tomorrow = new Date(Date.now() + 864e5);
    tomorrow.setHours(10, 0, 0, 0);
    const local = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
    sch.value = local(tomorrow);
    sch.min = local(new Date());
    bform.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = formData(bform);
      if (!data.name || !data.phone || !data.address) return toast('Nama, nomor WhatsApp, dan alamat wajib diisi', 'err');
      await withBusy(bform.querySelector('button[type=submit]'), async () => {
        try {
          const r = await api('/api/public/booking', { method: 'POST', body: data });
          document.getElementById('booking-card').innerHTML = `<div class="success-box">
            <h3>Booking diterima 🎉</h3><p class="muted">${esc(r.message)}</p>
            <div>Kode order Anda</div><div class="code mono">${esc(r.code)}</div>
            <p class="small muted">Simpan kode ini untuk melacak status order.</p>
            <a class="btn btn-primary" href="/lacak?kode=${encodeURIComponent(r.code)}&hp=${encodeURIComponent(data.phone)}">Lacak order</a></div>`;
        } catch (err) { toast(err.message, 'err'); }
      });
    });
  }

  // Form kontak (halaman profil)
  const cform = document.getElementById('contact-form');
  if (cform) {
    cform.addEventListener('submit', async (e) => {
      e.preventDefault();
      await withBusy(cform.querySelector('button[type=submit]'), async () => {
        try {
          const r = await api('/api/public/contact', { method: 'POST', body: formData(cform) });
          cform.reset();
          toast(r.message, 'ok');
        } catch (err) { toast(err.message, 'err'); }
      });
    });
  }
})();
