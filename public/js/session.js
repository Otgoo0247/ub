/* Нэвтэрсэн хэрэглэгчийн нэрийг харуулж, «Гарах» товчийг ажиллуулна. */
(function () {
  'use strict';
  const nameEl = document.getElementById('ub-user');
  fetch('/api/auth', { credentials: 'same-origin' }).then((r) => r.json()).then((s) => {
    if (!s.authenticated) { window.location.assign('/login'); return; }
    if (nameEl) nameEl.textContent = s.user;
  }).catch(() => {});
  const out = document.getElementById('ub-logout');
  if (out) out.addEventListener('click', async () => {
    out.disabled = true;
    try {
      await fetch('/api/auth', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) });
    } finally { window.location.assign('/login'); }
  });
})();
