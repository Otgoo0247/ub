/* role.js — хуудас зурагдахаас өмнө (defer-гүй) ub_role күүкийг уншиж <html data-role>-г тохируулна.
 * Зөвхөн интерфейсийн нуух/харуулах зориулалттай; эрхийг сервер шалгадаг. Эцсийн утгыг session.js /api/auth-аас тогтооно. */
(function () {
  try {
    const m = document.cookie.match(/(?:^|;\s*)ub_role=(admin|member)\b/);
    if (m) document.documentElement.dataset.role = m[1];
  } catch (e) { /* */ }
})();
