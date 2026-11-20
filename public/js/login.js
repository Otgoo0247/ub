/*
 * login.js — хоёр нэвтрэх хуудас:
 *   /login        (body[data-login=member]) — табууд: «Намын гишүүн» (нэвтрэх нэр + нууц үг) → дашбоард (/);
 *                                             «Урилгаар бүртгүүлсэн» (өөрийн урилгын код) → зөвхөн өөрийн хуудас (/me)
 * Админ, гишүүний сешн тус тусдаа тул нэг хөтөч дээр зэрэг нэвтэрч болно.
 *   /admin-login  (body[data-login=admin])  — админ нэр, нууц үгээр (POST /api/auth) → /admin
 */
(function () {
  'use strict';
  const mode = document.body.dataset.login;
  const qs = new URLSearchParams(location.search);
  const DEFAULT = mode === 'admin' ? '/admin' : '/';

  // Зөвхөн энэ сайтын дотоод хаяг руу буцаана (гадагш чиглүүлэлтээс сэргийлнэ).
  function nextUrl() {
    const n = qs.get('next') || DEFAULT;
    return /^\/(?![\/\\])/.test(n) && !/^\/(admin-)?login/.test(n) ? n : DEFAULT;
  }
  const post = (url, body) => fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  /* Аль хэдийн нэвтэрсэн бол шууд үргэлжлүүлнэ */
  fetch('/api/auth', { credentials: 'same-origin' }).then((r) => r.json()).then((s) => {
    if (mode === 'admin') {
      if (s.admin) location.replace(nextUrl());
      else if (!s.configured) {
        const text = {
          AUTH_USERNAME_missing: 'AUTH_USERNAME хувьсагч олдсонгүй', AUTH_USERNAME_empty: 'AUTH_USERNAME хоосон байна',
          AUTH_PASSWORD_missing: 'AUTH_PASSWORD хувьсагч олдсонгүй', AUTH_PASSWORD_too_short: 'AUTH_PASSWORD 12 тэмдэгтээс богино байна',
        };
        const list = (s.problems || []).map((p) => text[p] || p);
        document.getElementById('lg-msg').textContent = `Сервер тохируулагдаагүй: ${list.join('; ') || 'AUTH_USERNAME, AUTH_PASSWORD'}. Vercel дээр засаад Redeploy хийнэ үү.`;
      }
    } else if (s.member) location.replace(s.member.kind === 'registrant' ? '/me' : nextUrl());
  }).catch(() => {});

  /* ---------- Гишүүн: нэвтрэх нэр + нууц үг ---------- */
  if (mode === 'member') {
    const form = document.getElementById('lg-mform'), user = document.getElementById('lg-muser'), pass = document.getElementById('lg-mpass');
    const btn = document.getElementById('lg-mbtn'), msg = document.getElementById('lg-mmsg');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!user.value.trim() || !pass.value) { msg.textContent = 'Нэвтрэх нэр, нууц үгээ оруулна уу.'; return; }
      btn.disabled = true; msg.textContent = '';
      try {
        const r = await post('/api/me', { action: 'login', username: user.value.trim(), password: pass.value.trim() });
        if (r.ok) { const d0 = await r.json().catch(() => ({})); location.replace(d0.kind === 'registrant' ? '/me' : nextUrl()); return; }
        const d = await r.json().catch(() => ({}));
        msg.textContent = r.status === 401 ? 'Нэвтрэх нэр эсвэл нууц үг буруу байна.'
          : r.status === 429 ? 'Хэт олон оролдлого хийлээ. Нэг цагийн дараа дахин оролдоно уу.'
          : r.status === 503 ? 'Сервер тохируулагдаагүй байна.' : `Нэвтэрч чадсангүй (${d.error || r.status}).`;
        pass.value = ''; pass.focus();
      } catch (err) { msg.textContent = 'Сервертэй холбогдож чадсангүй.'; }
      btn.disabled = false;
    });

    /* Табууд */
    const tabs = { member: [document.getElementById('tab-member'), form, user], code: [document.getElementById('tab-code'), document.getElementById('lg-cform'), document.getElementById('lg-code')] };
    const show = (which, focus) => {
      Object.entries(tabs).forEach(([k, [t, pane]]) => { const on = k === which; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; pane.hidden = !on; });
      try { localStorage.setItem('ub-login-tab', which); } catch (e) { /* */ }
      if (focus) tabs[which][2].focus();
    };
    Object.entries(tabs).forEach(([k, [t]]) => t.addEventListener('click', () => show(k, true)));
    let saved = null; try { saved = localStorage.getItem('ub-login-tab'); } catch (e) { /* */ }
    show(qs.get('as') === 'code' || saved === 'code' ? 'code' : 'member', true);

    /* Урилгаар бүртгүүлэгч: өөрийн урилгын код → /me */
    const cform = document.getElementById('lg-cform'), code = document.getElementById('lg-code');
    const cbtn = document.getElementById('lg-cbtn'), cmsg = document.getElementById('lg-cmsg');
    code.addEventListener('input', () => { const p = code.selectionStart; code.value = code.value.toUpperCase(); code.setSelectionRange(p, p); });
    cform.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (code.value.replace(/[\s-]/g, '').length !== 10) { cmsg.textContent = 'Урилгын код 10 тэмдэгт (жишээ нь 7KQ2M-X9D4P) байна.'; code.focus(); return; }
      cbtn.disabled = true; cmsg.textContent = '';
      try {
        const r = await post('/api/me', { action: 'login', code: code.value });
        if (r.ok) { location.replace('/me'); return; }
        const d = await r.json().catch(() => ({}));
        cmsg.textContent = r.status === 401 ? 'Урилгын код буруу байна. Намын гишүүн бол «Намын гишүүн» табаар нэвтэрнэ үү.'
          : r.status === 429 ? 'Хэт олон оролдлого хийлээ. Нэг цагийн дараа дахин оролдоно уу.'
          : r.status === 503 ? 'Сервер тохируулагдаагүй байна.' : `Нэвтэрч чадсангүй (${d.error || r.status}).`;
      } catch (err) { cmsg.textContent = 'Сервертэй холбогдож чадсангүй.'; }
      cbtn.disabled = false;
    });
    return;
  }

  /* ---------- Админ: нэр, нууц үг ---------- */
  const form = document.getElementById('lg-form'), user = document.getElementById('lg-user'), pass = document.getElementById('lg-pass');
  const btn = document.getElementById('lg-btn'), msg = document.getElementById('lg-msg');
  user.focus();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!user.value.trim() || !pass.value) { msg.textContent = 'Нэвтрэх нэр, нууц үгээ оруулна уу.'; return; }
    btn.disabled = true; msg.textContent = '';
    try {
      const r = await post('/api/auth', { action: 'login', username: user.value.trim(), password: pass.value });
      if (r.ok) { location.replace(nextUrl()); return; }
      const data = await r.json().catch(() => ({}));
      msg.textContent = data.error === 'wrong_credentials' ? 'Нэвтрэх нэр эсвэл нууц үг буруу байна.'
        : data.error === 'not_configured' ? 'Сервер тохируулагдаагүй байна (AUTH_USERNAME, AUTH_PASSWORD).' : 'Нэвтэрч чадсангүй. Дахин оролдоно уу.';
      pass.value = ''; pass.focus();
    } catch { msg.textContent = 'Сервертэй холбогдож чадсангүй.'; }
    btn.disabled = false;
  });
})();
