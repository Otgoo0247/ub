/*
 * members.js — газрын зургийн хажууд гишүүдийн нэрсийг харуулна (зөвхөн Vercel хувилбар).
 * Юу ч сонгоогүй бол хотын бүх гишүүд, дүүрэг сонгоход дүүргийнх, хороо сонгоход хорооных.
 * Нэрс /api/members-ээс ирнэ; сайтад нэвтэрсэн хүнд л өгөгдөл буцаана.
 */
(function () {
  'use strict';
  const API = '/api/members';
  const cache = new Map();
  let token = 0;
  let query = '';
  // Нарийн баганад багтаахын тулд урт хөдөлгөөний нэрийг товчилно (бүтэн нэр нь title-д).
  const SHORT = { 'Намын хороо дотор үүр солигдсон': 'Үүр солигдсон', 'Намын баг/хороо солигдсон': 'Хороо солигдсон', 'Гишүүнчлэл сэргээсэн': 'Сэргээсэн', 'Шилжих хүсэлт илгээсэн': 'Шилжих хүсэлт' };

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const note = (text) => el('p', 'ub-note ub-names-note', text);
  const int = (v) => Number(v).toLocaleString('en-US');

  function scopeOf() {
    const p = dash.params();
    if (p.khoroo) return { key: `k:${p.khoroo}`, q: `?khoroo=${encodeURIComponent(p.khoroo)}`, level: 'khoroo' };
    if (p.district) return { key: `d:${p.district}`, q: `?district=${encodeURIComponent(p.district)}`, level: 'district' };
    return { key: 'city', q: '', level: 'city' };
  }

  function rowsFor(box, res, level) {
    const tb = box.querySelector('tbody');
    const q = query.trim().toLowerCase();
    const list = q ? res.members.filter((m) => m.n.toLowerCase().includes(q)) : res.members;
    const count = box.querySelector('.ub-names-count');
    if (count) count.textContent = q ? `${int(list.length)} / ${int(res.members.length)} гишүүн` : `${int(res.members.length)} гишүүн · ${res.generated}-ны нэгтгэл`;
    tb.replaceChildren(...list.map((m, i) => {
      const row = el('tr');
      const cells = [[i + 1, 'n'], [m.n]];
      if (level === 'city') cells.push([m.dist]);
      if (level !== 'khoroo') cells.push([m.kh.replace('-р хороо', '')]);
      cells.push([m.a == null ? '—' : m.a, 'n'], [m.g], [m.u || '—'], [m.d ? `${SHORT[m.m] || m.m} (${m.d})` : (SHORT[m.m] || m.m), null, m.m], [m.k == null ? '—' : `${m.k}%`, 'n']);
      cells.forEach(([v, c, full]) => { const td = el('td', c || null, String(v)); if (full && SHORT[full]) td.title = full; row.append(td); });
      return row;
    }));
    if (!list.length) {
      const r = el('tr');
      const td = el('td', 'ub-names-empty', q ? 'Хайлтад тохирох гишүүн алга.' : 'Энэ хүрээнд бүртгэлтэй гишүүн алга.');
      td.colSpan = 9; r.append(td); tb.append(r);
    }
  }

  function table(box, res, level) {
    const head = el('div', 'ub-names-head');
    head.append(el('span', 'ub-names-count'));
    const search = el('input', 'ub-names-q'); search.type = 'search'; search.placeholder = 'Нэрээр хайх'; search.value = query;
    search.setAttribute('aria-label', 'Гишүүний нэрээр хайх');
    search.addEventListener('input', () => { query = search.value; rowsFor(box, res, level); });
    head.append(search);
    const wrap = el('div', 'ub-tablewrap ub-names-wrap');
    const t = el('table', 'ub-table ub-names-table');
    const tr = el('tr');
    const cols = [['№', 'n'], ['Нэр']];
    if (level === 'city') cols.push(['Дүүрэг']);
    if (level !== 'khoroo') cols.push(['Хороо']);
    cols.push(['Нас', 'n'], ['Хүйс'], ['Үүр'], ['Хөдөлгөөн'], ['Анкет', 'n']);
    cols.forEach(([h, c]) => { const th = el('th', c || null, h); th.scope = 'col'; tr.append(th); });
    const thead = el('thead'); thead.append(tr);
    t.append(thead, el('tbody')); wrap.append(t);
    box.replaceChildren(head, wrap);
    rowsFor(box, res, level);
  }

  dash.draw('member-list', {
    mount() { return {}; },
    update(box) {
      const s = scopeOf();
      if (cache.has(s.key)) { table(box, cache.get(s.key), s.level); return; }
      const my = ++token;
      box.replaceChildren(note('Ачаалж байна…'));
      fetch(API + s.q, { credentials: 'same-origin' }).then(async (r) => ({ status: r.status, data: await r.json().catch(() => ({})) })).then(({ status, data }) => {
        if (my !== token) return;
        if (status === 200) { cache.set(s.key, data); table(box, data, s.level); }
        else if (status === 401) window.location.assign(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
        else if (status === 503) box.replaceChildren(note('Нэрсийн хэсэг тохируулагдаагүй байна: Vercel дээр MEMBERS_KEY-г тохируулна уу.'));
        else box.replaceChildren(note('Нэрсийг ачаалж чадсангүй.'));
      }).catch(() => { if (my === token) box.replaceChildren(note('Сервертэй холбогдож чадсангүй.')); });
    },
  });
})();
