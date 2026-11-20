/*
 * login.js — хоёр нэвтрэх хуудас:
 *   /login        (body[data-login=member]) — гишүүн өөрийн кодоор (POST /api/me) → дашбоард (/)
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
      if (s.role === 'admin') location.replace(nextUrl());
      else if (!s.configured) {
        const text = {
          AUTH_USERNAME_missing: 'AUTH_USERNAME хувьсагч олдсонгүй', AUTH_USERNAME_empty: 'AUTH_USERNAME хоосон байна',
          AUTH_PASSWORD_missing: 'AUTH_PASSWORD хувьсагч олдсонгүй', AUTH_PASSWORD_too_short: 'AUTH_PASSWORD 12 тэмдэгтээс богино байна',
        };
        const list = (s.problems || []).map((p) => text[p] || p);
        document.getElementById('lg-msg').textContent = `Сервер тохируулагдаагүй: ${list.join('; ') || 'AUTH_USERNAME, AUTH_PASSWORD'}. Vercel дээр засаад Redeploy хийнэ үү.`;
      }
    } else if (s.authenticated) location.replace(nextUrl());
  }).catch(() => {});

  /* ---------- Гишүүн: нууц код (урилгын код) ---------- */
  if (mode === 'member') {
    const form = document.getElementById('lg-mform'), code = document.getElementById('lg-code');
    const btn = document.getElementById('lg-mbtn'), msg = document.getElementById('lg-mmsg');
    code.focus();
    code.addEventListener('input', () => { const p = code.selectionStart; code.value = code.value.toUpperCase(); code.setSelectionRange(p, p); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const c = code.value.replace(/[\s-]/g, '');
      if (c.length !== 10) { msg.textContent = 'Код 10 тэмдэгт (жишээ нь 7KQ2M-X9D4P) байна.'; code.focus(); return; }
      btn.disabled = true; msg.textContent = '';
      try {
        const r = await post('/api/me', { action: 'login', code: code.value });
        if (r.ok) { location.replace(nextUrl()); return; }
        const d = await r.json().catch(() => ({}));
        msg.textContent = r.status === 401 ? 'Код буруу байна. Дахин шалгаад оруулна уу.'
          : r.status === 429 ? 'Хэт олон оролдлого хийлээ. Нэг цагийн дараа дахин оролдоно уу.'
          : r.status === 503 ? 'Сервер тохируулагдаагүй байна.' : `Нэвтэрч чадсангүй (${d.error || r.status}).`;
      } catch (err) { msg.textContent = 'Сервертэй холбогдож чадсангүй.'; }
      btn.disabled = false;
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
