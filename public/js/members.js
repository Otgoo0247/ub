/*
 * members.js — «Сонгосон хүрээ» самбарт хорооны гишүүдийн нэрсийг харуулна (зөвхөн Vercel хувилбар).
 * Нэрс /api/members-ээс ирнэ; сайтад нэвтэрсэн хүнд л өгөгдөл буцаана.
 */
(function () {
  'use strict';
  const API = '/api/members';
  const cache = new Map();
  let token = 0;

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const note = (text) => el('p', 'ub-note ub-names-note', text);

  async function api(method, body, query) {
    const r = await fetch(API + (query || ''), {
      method, credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = {};
    try { data = await r.json(); } catch { /* хоосон хариу */ }
    return { status: r.status, data };
  }

  function table(box, code, res) {
    const head = el('div', 'ub-names-head');
    head.append(el('span', 'ub-names-count', `${res.members.length} гишүүн · ${res.generated}-ны нэгтгэл`));
    if (!res.members.length) { box.replaceChildren(head, note('Энэ хороонд бүртгэлтэй гишүүн алга.')); return; }
    const wrap = el('div', 'ub-tablewrap ub-names-wrap');
    const t = el('table', 'ub-table ub-names-table');
    const tr = el('tr');
    ['№', 'Нэр', 'Нас', 'Хүйс', 'Үүр', 'Хөдөлгөөн', 'Анкет'].forEach((h, i) => { const th = el('th', i === 0 || i === 2 || i === 6 ? 'n' : null, h); th.scope = 'col'; tr.append(th); });
    const thead = el('thead'); thead.append(tr);
    const tb = el('tbody');
    res.members.forEach((m, i) => {
      const row = el('tr');
      [[i + 1, 'n'], [m.n], [m.a == null ? '—' : m.a, 'n'], [m.g], [m.u || '—'], [m.d ? `${m.m} (${m.d})` : m.m], [m.k == null ? '—' : `${m.k}%`, 'n']]
        .forEach(([v, c]) => row.append(el('td', c || null, String(v))));
      tb.append(row);
    });
    t.append(thead, tb); wrap.append(t);
    box.replaceChildren(head, wrap);
  }

  dash.draw('member-list', {
    mount(box) { return {}; },
    update(box) {
      const p = dash.params();
      const code = p.khoroo || '';
      if (!code) { box.replaceChildren(note(p.district ? 'Хороо сонгоход тухайн хорооны гишүүдийн нэрс энд гарна.' : 'Дүүрэг, дараа нь хороо сонгоход гишүүдийн нэрс энд гарна.')); return; }
      if (cache.has(code)) { table(box, code, cache.get(code)); return; }
      const my = ++token;
      box.replaceChildren(note('Ачаалж байна…'));
      api('GET', null, `?khoroo=${encodeURIComponent(code)}`).then(({ status, data }) => {
        if (my !== token) return;
        if (status === 200) { cache.set(code, data); table(box, code, data); }
        else if (status === 401) window.location.assign(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
        else if (status === 503) box.replaceChildren(note('Нэрсийн хэсэг тохируулагдаагүй байна: Vercel дээр MEMBERS_KEY-г тохируулна уу.'));
        else box.replaceChildren(note('Нэрсийг ачаалж чадсангүй.'));
      }).catch(() => { if (my === token) box.replaceChildren(note('Сервертэй холбогдож чадсангүй.')); });
    },
  });
})();
