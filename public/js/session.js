/* session.js — нэвтэрсэн хэрэглэгчийг (админ эсвэл гишүүн) тогтоож, нэрийг харуулна, «Гарах» товчийг ажиллуулна.
 * <html data-role="admin|member"> — [data-admin] элементүүд зөвхөн админд, [data-member] зөвхөн гишүүнд харагдана (ub.css).
 * body[data-require="admin"] бол админ биш хүнийг /admin-login руу шилжүүлнэ. */
(function () {
  'use strict';
  const nameEl = document.getElementById('ub-user');
  const needAdmin = document.body.dataset.require === 'admin';
  const back = encodeURIComponent(location.pathname + location.search);
  fetch('/api/auth', { credentials: 'same-origin' }).then((r) => r.json()).then((s) => {
    if (!s.authenticated || (needAdmin && s.role !== 'admin')) { location.assign(`${needAdmin ? '/admin-login' : '/login'}?next=${back}`); return; }
    document.documentElement.dataset.role = s.role;
    if (nameEl) nameEl.textContent = s.user;
    document.dispatchEvent(new CustomEvent('ub:role', { detail: s }));
  }).catch(() => {});
  const out = document.getElementById('ub-logout');
  if (out) out.addEventListener('click', async () => {
    out.disabled = true;
    const was = document.documentElement.dataset.role;
    try {
      await fetch('/api/auth', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) });
    } finally { window.location.assign(was === 'admin' || needAdmin ? '/admin-login' : '/login'); }
  });
})();
