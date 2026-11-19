/* invite.js — /invite?c=КОД нийтийн хуудас: кодыг /api/invite-ээр шалгаж, урьсан гишүүний товч нэрийг харуулна. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const raw = new URLSearchParams(location.search).get('c') || location.pathname.split('/').filter(Boolean)[1] || '';
  const lead = $('iv-lead');
  const fail = (t) => { lead.textContent = t; lead.classList.add('iv-bad'); };
  if (!raw) { fail('Холбоос дутуу байна: урилгын код олдсонгүй. Урьсан хүнээсээ холбоосыг дахин авна уу.'); return; }
  fetch(`/api/invite?c=${encodeURIComponent(raw)}`, { credentials: 'omit' })
    .then(async (r) => ({ status: r.status, d: await r.json().catch(() => ({})) }))
    .then(({ status, d }) => {
      if (status !== 200) { fail(status === 404 || status === 400 ? 'Энэ урилгын код хүчингүй байна. Урьсан хүнээсээ холбоосыг дахин шалгуулна уу.' : 'Урилгыг одоогоор шалгаж чадсангүй. Түр хүлээгээд дахин оролдоно уу.'); return; }
      lead.replaceChildren(Object.assign(document.createElement('b'), { textContent: d.inviter }),
        document.createTextNode(d.district ? ` (${d.district} дүүрэг) таныг гишүүнээр элсэхийг урьж байна.` : ' таныг гишүүнээр элсэхийг урьж байна.'));
      $('iv-code').textContent = d.code;
      if (d.joinUrl) { const a = $('iv-join'); a.href = d.joinUrl; a.rel = 'noopener'; a.hidden = false; $('iv-note').textContent = 'Бүртгүүлэх хуудсанд урилгын код автоматаар дамжина.'; }
      $('iv-card').hidden = false;
      $('iv-copy').addEventListener('click', () => {
        const done = () => { $('iv-copy').textContent = 'Хуулагдлаа ✓'; setTimeout(() => { $('iv-copy').textContent = 'Кодыг хуулах'; }, 1800); };
        if (navigator.clipboard) navigator.clipboard.writeText(d.code).then(done, () => {}); 
      });
    })
    .catch(() => fail('Сервертэй холбогдож чадсангүй.'));
})();
