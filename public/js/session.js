/* session.js — энэ хуудсанд аль эрхээр (админ эсвэл гишүүн) харахыг тогтоож, нэрийг харуулна, «Гарах» товчийг ажиллуулна.
 * Админ, гишүүний сешн тус тусдаа, зэрэг байж болно:
 *   • body[data-require="admin"] (/admin) — заавал админ, эс бөгөөс /admin-login
 *   • дашбоард — ?as=admin ба админ сешнтэй бол админ; эс бөгөөс гишүүний сешнтэй бол гишүүн; эс бөгөөс админ; аль нь ч үгүй бол /login
 * <html data-role> — [data-admin] зөвхөн админд, [data-member] зөвхөн гишүүнд харагдана (ub.css).
 * «Гарах» зөвхөн тухайн эрхийн сешнийг хаана. */
(function () {
  'use strict';
  const nameEl = document.getElementById('ub-user');
  const needAdmin = document.body.dataset.require === 'admin';
  const wantAdmin = new URLSearchParams(location.search).get('as') === 'admin';
  const back = encodeURIComponent(location.pathname + location.search);
  let role = null;
  fetch('/api/auth', { credentials: 'same-origin' }).then((r) => r.json()).then((s) => {
    role = needAdmin ? (s.admin ? 'admin' : null) : (wantAdmin && s.admin) ? 'admin' : s.member ? 'member' : s.admin ? 'admin' : null;
    if (!role) { location.assign(`${needAdmin || wantAdmin ? '/admin-login' : '/login'}?next=${back}`); return; }
    document.documentElement.dataset.role = role;
    if (nameEl) nameEl.textContent = role === 'admin' ? s.admin.user : s.member.user;
    // Админаар дашбоард үзэхэд дотоод холбоосууд админ харагдацаа хадгална
    if (role === 'admin' && !needAdmin && !wantAdmin) history.replaceState(null, '', `${location.pathname}?as=admin${location.hash}`);
    document.dispatchEvent(new CustomEvent('ub:role', { detail: { role, session: s } }));
  }).catch(() => {});
  const out = document.getElementById('ub-logout');
  if (out) out.addEventListener('click', async () => {
    out.disabled = true;
    const r = role || document.documentElement.dataset.role || (needAdmin ? 'admin' : 'member');
    try {
      await fetch('/api/auth', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout', scope: r }) });
    } finally { window.location.assign(r === 'admin' ? '/admin-login' : '/login'); }
  });
})();
