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
  user.focus();

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
