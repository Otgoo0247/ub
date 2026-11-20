/*
 * irts.js — гишүүний ирц бүртгэл (/irts): үйл ажиллагаа сонгох → байршил (GPS) → камераар зураг → илгээх.
 * Зураг дээр огноо, цаг, нэрийг шууд бичнэ. Бүртгэл зөвхөн админд харагдана (/admin → «Ирц»).
 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const p2 = (n) => String(n).padStart(2, '0');
  const hm = (iso) => { const d = new Date(iso); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; };
  const stampText = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
  const WARN_ACC = 150; // м — үүнээс муу нарийвчлалд анхааруулна
  const st = { event: null, loc: null, photo: null, shotAt: null, stream: null, user: '', data: null };
  const status = $('ir-status');

  /* ---------- Эхлэл ---------- */
  fetch('/api/auth', { credentials: 'same-origin' }).then((r) => r.json()).then((s) => {
    if (!s.member && !s.admin) { location.replace('/login?next=/irts'); return; }
    if (!s.member) {
      status.replaceChildren(document.createTextNode('Ирцийг гишүүд өөрийн кодоор нэвтэрч бүртгүүлнэ. Ирцийн бүртгэлийг '), Object.assign(el('a', null, 'админ хэсгийн «Ирц» табаас'), { href: '/admin#irts' }), document.createTextNode(' харна.'));
      return;
    }
    st.user = s.member.user || '';
    $('ir-who').textContent = st.user;
    load();
  }).catch(() => { status.textContent = 'Сервертэй холбогдож чадсангүй.'; });

  function load() {
    fetch('/api/attendance?mine=1', { credentials: 'same-origin' }).then(async (r) => ({ status: r.status, d: await r.json().catch(() => ({})) })).then(({ status: code, d }) => {
      if (code === 401) { location.replace('/login?next=/irts'); return; }
      if (code === 503) { status.textContent = 'Ирцийн сан (Upstash Redis) холбогдоогүй байна. Админд хандана уу.'; return; }
      if (code !== 200) { status.textContent = 'Мэдээллийг ачаалж чадсангүй. Дахин оролдоно уу.'; return; }
      st.data = d;
      status.hidden = true;
      $('ir-main').hidden = false;
      $('ir-today').textContent = `Өнөөдөр: ${d.today}`;
      renderEvents();
      autoLocate();
      check();
    }).catch(() => { status.textContent = 'Сервертэй холбогдож чадсангүй.'; });
  }

  /* ---------- 1. Үйл ажиллагаа ---------- */
  function renderEvents() {
    const box = $('ir-events'); box.replaceChildren();
    const { events, done } = st.data;
    st.event = null;
    events.forEach((e) => {
      const lab = el('label', 'ir-ev');
      const r = el('input'); r.type = 'radio'; r.name = 'ev'; r.value = e.id;
      const tx = el('span');
      tx.append(el('b', null, e.title), el('small', null, e.general ? 'Өдөрт нэг удаа бүртгүүлнэ' : [e.time, e.place].filter(Boolean).join(' · ') || 'Өнөөдрийн үйл ажиллагаа'));
      lab.append(r, tx);
      if (done[e.id]) { r.disabled = true; lab.classList.add('is-done'); lab.append(el('span', 'ir-tag', `✓ ${hm(done[e.id])}`)); }
      else if (!st.event) { r.checked = true; st.event = e.id; }
      r.addEventListener('change', () => { st.event = r.value; check(); });
      box.append(lab);
    });
    if (!events.length) box.append(el('p', 'ir-hint', 'Үйл ажиллагааны жагсаалт ачаалагдсангүй. Хуудсыг шинэчилнэ үү.'));
    else if (!st.event) box.append(el('p', 'ir-hint', 'Өнөөдрийн бүх үйл ажиллагаанд ирцээ бүртгүүлсэн байна.'));
    else if (events.length === 1) box.append(el('p', 'ir-hint', 'Өнөөдрийн огноотой үйл ажиллагааны зарлал алга тул «Ерөнхий ирц» бүртгэнэ.'));
  }

  /* ---------- 2. Байршил ---------- */
  /* Байршил: эрх шалгах → GPS (өндөр нарийвчлал) → бүтэлгүйтвэл сүлжээний байршил → 30 сек турш нарийвчлалыг сайжруулна */
  const UA = navigator.userAgent;
  const mobile = /Android|iPhone|iPad|iPod/i.test(UA);
  const inApp = /FBAN|FBAV|FB_IAB|Instagram|Messenger|Line\/|KAKAOTALK|Viber|Telegram|wv\)/i.test(UA);
  const ERR = { 1: 'PERMISSION_DENIED', 2: 'POSITION_UNAVAILABLE', 3: 'TIMEOUT' };
  let watchId = null, watchStop = null;
  function showLoc(pos) {
    const box = $('ir-loc'), btn = $('ir-locbtn');
    const { latitude: lat, longitude: lng, accuracy: acc } = pos.coords;
    if (st.loc && st.loc.acc <= Math.round(acc)) return; // илүү нарийвчлалтайг л авна
    st.loc = { lat, lng, acc: Math.round(acc), at: new Date(pos.timestamp || Date.now()) };
    const info = el('p', `ir-locinfo${acc > WARN_ACC ? ' is-warn' : ''}`,
      `±${Math.round(acc)} м нарийвчлалтай · ${hm(st.loc.at.toISOString())}${acc > WARN_ACC ? ' — нарийвчлал муу байна. Гадаа эсвэл цонхны дэргэд «Дахин тогтоох» дарна уу.' : ''}`);
    box.replaceChildren(window.UBMiniMap ? window.UBMiniMap(lat, lng, acc, { w: Math.min(560, box.clientWidth || 320), h: 170 }) : el('span'), info);
    btn.disabled = false; btn.textContent = 'Дахин тогтоох';
    check();
  }
  function locFail(text, code) {
    const box = $('ir-loc'), btn = $('ir-locbtn');
    st.loc = null;
    const nodes = [el('p', 'ir-locinfo is-warn', text)];
    if (inApp) {
      const cp = el('button', 'me-btn', 'Холбоосыг хуулах'); cp.type = 'button';
      cp.addEventListener('click', () => { try { navigator.clipboard.writeText(location.href).then(() => { cp.textContent = 'Хуулагдлаа ✓'; }); } catch (e) { /* */ } });
      nodes.push(cp);
    }
    nodes.push(el('small', 'ir-diag', `Тех. мэдээлэл: ${code || '—'} · ${mobile ? 'утас' : 'компьютер'}${inApp ? ' · апп доторх хөтөч' : ''}`));
    box.replaceChildren(...nodes);
    btn.disabled = false; btn.textContent = 'Байршил тогтоох';
    check();
  }
  const denyText = () => (inApp
    ? 'Facebook, Messenger зэрэг апп доторх хөтөч байршил өгдөггүй. Баруун дээд буланд байрлах ⋯ цэсээр «Chrome/Safari-д нээх»-ийг сонгох эсвэл холбоосыг хуулж Chrome/Safari-д нээнэ үү.'
    : mobile
      ? 'Байршлын эрх хаалттай байна. 1) Утасны Тохиргоо → Байршил (Location) асаалттай эсэх; 2) Chrome: хаягийн мөрний 🔒/⋮ → Сайтын тохиргоо → Байршил → Зөвшөөрөх; Safari (iPhone): Тохиргоо → Нууцлал → Байршлын үйлчилгээ → Safari → «Ашиглах үед». Дараа нь хуудсыг шинэчилнэ үү.'
      : 'Байршлын эрх хаалттай байна. Хаягийн мөрний зүүн талын 🔒 тэмдэг → «Байршил» → «Зөвшөөрөх» болгоод хуудсыг шинэчилнэ үү. Windows: Тохиргоо → Нууцлал → Байршил асаалттай байх ёстой. Утсаараа бүртгүүлэхийг зөвлөж байна.');
  async function locate() {
    const btn = $('ir-locbtn');
    if (!window.isSecureContext) { locFail('Байршлыг зөвхөн https:// хаягаар тогтооно.', 'insecure'); return; }
    if (!('geolocation' in navigator)) { locFail('Энэ хөтөч байршил тогтоох боломжгүй. Chrome эсвэл Safari ашиглана уу.', 'no_api'); return; }
    try { if (document.featurePolicy && !document.featurePolicy.allowsFeature('geolocation')) { locFail('Сайтын тохиргоо байршлыг хориглож байна (Permissions-Policy). Админ vercel.json-ийг шинэчилж дахин байршуулна уу.', 'policy_blocked'); return; } } catch (e) { /* */ }
    try {
      const perm = navigator.permissions && await navigator.permissions.query({ name: 'geolocation' });
      if (perm && perm.state === 'denied') { locFail(denyText(), 'denied_before'); return; }
    } catch (e) { /* Safari хуучин хувилбарт байхгүй */ }
    btn.disabled = true; btn.textContent = 'Байршил тогтоож байна… (20 сек хүртэл)';
    if (watchId != null) { navigator.geolocation.clearWatch(watchId); watchId = null; clearTimeout(watchStop); }
    st.loc = null;
    const get = (opt) => new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, opt));
    let pos = null;
    try { pos = await get({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }); }
    catch (e1) {
      if (e1.code === 1) { locFail(denyText(), ERR[1]); return; }
      try { pos = await get({ enableHighAccuracy: false, timeout: 20000, maximumAge: 120000 }); } // GPS барьж чадахгүй бол сүлжээгээр
      catch (e2) {
        locFail(e2.code === 1 ? denyText() : e2.code === 3 ? 'Байршил тогтоох хугацаа дууслаа. Гадаа эсвэл цонхны дэргэд очоод «Байршил тогтоох» дарна уу.'
          : 'Байршлыг тогтоож чадсангүй. Утасны байршил (GPS) асаалттай, интернэт холбогдсон эсэхийг шалгана уу.', `${ERR[e2.code] || e2.code}: ${e2.message || ''}`.slice(0, 120));
        return;
      }
    }
    showLoc(pos);
    // 30 секундын турш илүү нарийвчлалтай байршил ирвэл шинэчилнэ
    watchId = navigator.geolocation.watchPosition(showLoc, () => {}, { enableHighAccuracy: true, maximumAge: 0 });
    watchStop = setTimeout(() => { navigator.geolocation.clearWatch(watchId); watchId = null; }, 30000);
  }
  /* Эрх аль хэдийн өгсөн бол шууд тогтооно; эс бөгөөс товч дарахад асууна (хөтөч автомат асуултыг хориглож болдог) */
  async function autoLocate() {
    try {
      const perm = navigator.permissions && await navigator.permissions.query({ name: 'geolocation' });
      if (perm && perm.state === 'granted') { locate(); return; }
      if (perm && perm.state === 'denied') { locFail(denyText(), 'denied_before'); return; }
    } catch (e) { /* */ }
    if (inApp) { locFail(denyText(), 'in_app'); return; }
    $('ir-loc').replaceChildren(el('p', 'ir-locinfo', '«Байршил тогтоох» товчийг дарж, хөтөч асуухад «Зөвшөөрөх» (Allow) сонгоно уу.'));
  }
  $('ir-locbtn').addEventListener('click', locate);

  /* ---------- 3. Зураг ---------- */
  const video = $('ir-video'), shot = $('ir-shot'), ph = $('ir-camph');
  function stopCam() { if (st.stream) { st.stream.getTracks().forEach((t) => t.stop()); st.stream = null; } video.hidden = true; }
  function useFileFallback(reason) {
    $('ir-camopen').hidden = true; $('ir-filelbl').hidden = false;
    ph.textContent = reason || 'Доорх товчоор камераа нээж зургаа авна уу.';
  }
  async function openCam() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { useFileFallback(); return; }
    try {
      st.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 1280 } }, audio: false });
      video.srcObject = st.stream; video.hidden = false; shot.hidden = true; ph.hidden = true;
      await video.play().catch(() => {});
      $('ir-camopen').hidden = true; $('ir-snap').hidden = false; $('ir-retake').hidden = true;
    } catch (e) {
      stopCam();
      useFileFallback(e && e.name === 'NotAllowedError' ? 'Камерын эрх өгөөгүй байна. Доорх товчоор утасныхаа камераар зураг авч болно.' : 'Камер нээгдсэнгүй. Доорх товчоор утасныхаа камераар зураг авна уу.');
    }
  }
  /* Эх зургийг 3:4 хэлбэрээр тайрч, 600×800 болгон, доор нь огноо, цаг, нэр бичнэ */
  function compose(src, sw, sh) {
    const W = 600, H = 800, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const r = Math.max(W / sw, H / sh), dw = sw * r, dh = sh * r;
    g.drawImage(src, (W - dw) / 2, (H - dh) / 2, dw, dh);
    const now = new Date();
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, H - 56, W, 56);
    g.fillStyle = '#fff'; g.font = '600 22px system-ui, -apple-system, Segoe UI, sans-serif'; g.textBaseline = 'middle';
    g.fillText(`${stampText(now)} · ${st.user}`.slice(0, 48), 16, H - 28);
    let q = 0.78, url = c.toDataURL('image/jpeg', q);
    while (url.length > 440000 && q > 0.4) { q -= 0.08; url = c.toDataURL('image/jpeg', q); } // ≈ 330 КБ-аас бага
    st.photo = url; st.shotAt = now.toISOString();
    shot.src = url; shot.hidden = false; ph.hidden = true;
    check();
  }
  function snap() {
    if (!video.videoWidth) return;
    compose(video, video.videoWidth, video.videoHeight);
    stopCam();
    $('ir-snap').hidden = true; $('ir-retake').hidden = false;
  }
  $('ir-camopen').addEventListener('click', openCam);
  $('ir-snap').addEventListener('click', snap);
  $('ir-retake').addEventListener('click', () => { st.photo = null; shot.hidden = true; check(); openCam(); });
  $('ir-file').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0]; e.target.value = '';
    if (!f) return;
    if (!/^image\//.test(f.type)) { msg('Зөвхөн зураг сонгоно уу.'); return; }
    if (f.lastModified && Date.now() - f.lastModified > 10 * 60000) { msg('Яг одоо камераар авсан зураг байх ёстой. Хуучин зураг ашиглах боломжгүй.'); return; }
    const fr = new FileReader();
    fr.onload = () => { const img = new Image(); img.onload = () => { compose(img, img.naturalWidth, img.naturalHeight); msg(''); }; img.onerror = () => msg('Зургийг уншиж чадсангүй.'); img.src = fr.result; };
    fr.readAsDataURL(f);
  });

  /* ---------- Илгээх ---------- */
  function msg(t) { $('ir-msg').textContent = t || ''; }
  function check() {
    $('ir-s1').classList.toggle('is-ok', !!st.event);
    $('ir-s2').classList.toggle('is-ok', !!st.loc);
    $('ir-s3').classList.toggle('is-ok', !!st.photo);
    $('ir-submit').disabled = !(st.event && st.loc && st.photo);
  }
  $('ir-submit').addEventListener('click', async () => {
    const btn = $('ir-submit'); btn.disabled = true; btn.textContent = 'Илгээж байна…'; msg('');
    try {
      const r = await fetch('/api/attendance', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'checkin', event: st.event, lat: st.loc.lat, lng: st.loc.lng, acc: st.loc.acc, photo: st.photo, shotAt: st.shotAt }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        $('ir-main').hidden = true; $('ir-done').hidden = false;
        $('ir-done-sub').textContent = `${d.event} · ${hm(d.t)}. Таны ирцийг байршил, зургийн хамт хүлээн авлаа.`;
        st.data.done[st.event] = d.t; window.scrollTo(0, 0);
        btn.textContent = 'Ирц бүртгүүлэх';
        return;
      }
      msg(r.status === 409 ? 'Та энэ үйл ажиллагаанд ирцээ аль хэдийн бүртгүүлсэн байна.'
        : r.status === 401 ? 'Нэвтрэлт дууссан. Дахин нэвтэрнэ үү.'
        : d.error === 'photo_invalid' ? 'Зураг буруу байна. Дахин авна уу.'
        : d.error === 'event' ? 'Энэ үйл ажиллагааны бүртгэл хаагдсан байна. Хуудсыг шинэчилнэ үү.'
        : 'Илгээж чадсангүй. Дахин оролдоно уу.');
      if (r.status === 409) { st.data.done[st.event] = d.at || new Date().toISOString(); renderEvents(); }
    } catch (e) { msg('Сервертэй холбогдож чадсангүй. Интернэтээ шалгаад дахин оролдоно уу.'); }
    btn.textContent = 'Ирц бүртгүүлэх'; check();
  });
  $('ir-again').addEventListener('click', () => {
    $('ir-done').hidden = true; $('ir-main').hidden = false;
    st.photo = null; shot.hidden = true; ph.hidden = false; ph.textContent = 'Камер нээгдээгүй байна';
    $('ir-camopen').hidden = !$('ir-filelbl').hidden; $('ir-retake').hidden = true;
    renderEvents(); autoLocate(); check();
  });
})();
