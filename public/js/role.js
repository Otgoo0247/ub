/* role.js — хуудас зурагдахаас өмнө (defer-гүй) <html data-role>-г таамаглана (товч нуух/харуулах, анивчихаас сэргийлнэ).
 * ub_ra = админы сешн, ub_rm = гишүүний сешн (хоёулаа байж болно). Дашбоард: ?as=admin бол админ, эс бөгөөс гишүүн давуу.
 * Эцсийн утгыг session.js /api/auth-аас тогтооно; эрхийг сервер шалгадаг. */
(function () {
  try {
    const has = (n) => new RegExp(`(?:^|;\\s*)${n}=1\\b`).test(document.cookie);
    const wantAdmin = document.documentElement.dataset.need === 'admin' || /[?&]as=admin\b/.test(location.search);
    const role = wantAdmin && has('ub_ra') ? 'admin' : has('ub_rm') ? 'member' : has('ub_ra') ? 'admin' : '';
    if (role) document.documentElement.dataset.role = role;
  } catch (e) { /* */ }
})();
