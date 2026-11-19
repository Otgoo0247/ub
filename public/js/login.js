(function () {
  'use strict';
  const form = document.getElementById('lg-form');
  const user = document.getElementById('lg-user');
  const pass = document.getElementById('lg-pass');
  const btn = document.getElementById('lg-btn');
  const msg = document.getElementById('lg-msg');

  // Зөвхөн энэ сайтын дотоод хаяг руу буцаана (гадагш чиглүүлэлтээс сэргийлнэ).
  function nextUrl() {
    const n = new URLSearchParams(location.search).get('next') || '/';
    return /^\/(?![\/\\])/.test(n) && !n.startsWith('/login') ? n : '/';
  }

  fetch('/api/auth', { credentials: 'same-origin' }).then((r) => r.json()).then((s) => {
    if (s.authenticated) location.replace(nextUrl());
    else if (!s.configured) {
      const text = {
        AUTH_USERNAME_missing: 'AUTH_USERNAME хувьсагч олдсонгүй',
        AUTH_USERNAME_empty: 'AUTH_USERNAME хоосон байна',
        AUTH_PASSWORD_missing: 'AUTH_PASSWORD хувьсагч олдсонгүй',
        AUTH_PASSWORD_too_short: 'AUTH_PASSWORD 12 тэмдэгтээс богино байна',
      };
      const list = (s.problems || []).map((p) => text[p] || p);
      msg.textContent = `Сервер тохируулагдаагүй: ${list.join('; ') || 'AUTH_USERNAME, AUTH_PASSWORD'}. Vercel дээр засаад Redeploy хийнэ үү.`;
    }
  }).catch(() => {});

  /* ---------- Табууд: «Нэвтрэх» (админ, анхдагч) | «Гишүүнээр нэвтрэх» (урилгаар бүртгүүлсэн хүмүүс) ---------- */
  const tabs = { admin: [document.getElementById('tab-admin'), form], member: [document.getElementById('tab-member'), document.getElementById('lg-mform')] };
  function show(which, focus) {
    Object.entries(tabs).forEach(([k, [t, pane]]) => { const on = k === which; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; pane.hidden = !on; });
    try { localStorage.setItem('ub-login-tab', which); } catch (e) { /* */ }
    if (focus) (which === 'admin' ? user : document.getElementById('lg-code')).focus();
  }
  Object.entries(tabs).forEach(([k, [t]]) => t.addEventListener('click', () => show(k, true)));
  document.querySelector('.lg-tabs').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const next = tabs.admin[0].getAttribute('aria-selected') === 'true' ? 'member' : 'admin'; show(next, false); tabs[next][0].focus(); }
  });
  const qs = new URLSearchParams(location.search);
  let saved = null; try { saved = localStorage.getItem('ub-login-tab'); } catch (e) { /* */ }
  show(qs.get('as') === 'member' ? 'member' : qs.get('next') ? 'admin' : saved === 'member' ? 'member' : 'admin', true);

  /* ---------- Гишүүнээр нэвтрэх: урилгын код + утас → /me ---------- */
  const mform = document.getElementById('lg-mform'), code = document.getElementById('lg-code'), phone = document.getElementById('lg-phone');
  const mbtn = document.getElementById('lg-mbtn'), mmsg = document.getElementById('lg-mmsg');
  code.addEventListener('input', () => { const p = code.selectionStart; code.value = code.value.toUpperCase(); code.setSelectionRange(p, p); });
  fetch('/api/me', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : {})).then((d) => { if (d.authenticated && qs.get('as') !== 'member' && !qs.get('next')) location.replace('/me'); }).catch(() => {});
  mform.addEventListener('submit', async (e) => {
    e.preventDefault();
    const c = code.value.replace(/[\s-]/g, '');
    if (c.length !== 10) { mmsg.textContent = 'Урилгын код 10 тэмдэгт (жишээ нь 7KQ2M-X9D4P) байна.'; code.focus(); return; }
    if (!/^(\+?976)?[5-9]\d{7}$/.test(phone.value.replace(/[\s-]/g, ''))) { mmsg.textContent = 'Утасны дугаараа 8 оронтойгоор оруулна уу.'; phone.focus(); return; }
    mbtn.disabled = true; mmsg.textContent = '';
    try {
      const r = await fetch('/api/me', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'login', code: code.value, phone: phone.value }) });
      if (r.ok) { location.replace('/me'); return; }
      const d = await r.json().catch(() => ({}));
      mmsg.textContent = r.status === 401 ? 'Урилгын код эсвэл утасны дугаар таарахгүй байна.'
        : r.status === 429 ? 'Хэт олон оролдлого хийлээ. Нэг цагийн дараа дахин оролдоно уу.'
        : r.status === 503 ? 'Сервер тохируулагдаагүй байна.' : `Нэвтэрч чадсангүй (${d.error || r.status}).`;
    } catch (err) { mmsg.textContent = 'Сервертэй холбогдож чадсангүй.'; }
    mbtn.disabled = false;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!user.value.trim() || !pass.value) { msg.textContent = 'Нэвтрэх нэр, нууц үгээ оруулна уу.'; return; }
    btn.disabled = true; msg.textContent = '';
    try {
      const r = await fetch('/api/auth', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', username: user.value.trim(), password: pass.value }),
      });
      if (r.ok) { location.replace(nextUrl()); return; }
      const data = await r.json().catch(() => ({}));
      msg.textContent = data.error === 'wrong_credentials' ? 'Нэвтрэх нэр эсвэл нууц үг буруу байна.'
        : data.error === 'not_configured' ? 'Сервер тохируулагдаагүй байна (AUTH_USERNAME, AUTH_PASSWORD).' : 'Нэвтэрч чадсангүй. Дахин оролдоно уу.';
      pass.value = ''; pass.focus();
    } catch { msg.textContent = 'Сервертэй холбогдож чадсангүй.'; }
    btn.disabled = false;
  });
})();
