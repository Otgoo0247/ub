/*
 * admin.js — админ хуудас (/admin).
 *   «Урьсан хүмүүс»: гишүүдийн (болон бүртгүүлэгчдийн) урилгаар бүртгүүлсэн бүх хүн — жагсаалт, урьсан хүнээр бүлэглэсэн харагдац,
 *                    шүүлт, хайлт, урилгын мод, Excel татах. Өгөгдөл: /api/registrations (зөвхөн админ сешн).
 *   «Үйл ажиллагааны зарлал»: announce.js (UBAnnAdmin.mount).
 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const norm = (c) => String(c || '').toUpperCase().replace(/[\s-]/g, '');
  const fmtCode = (c) => { const n = norm(c); return n.length === 10 ? `${n.slice(0, 5)}-${n.slice(5)}` : n; };
  const byMn = (a, b) => String(a).localeCompare(String(b), 'mn');
  const int = (v) => Number(v).toLocaleString('en-US');
  const day = (iso) => String(iso || '').slice(0, 10);
  const age = (dob) => { if (!dob) return null; const d = new Date(`${dob}T00:00:00`), n = new Date(); let a = n.getFullYear() - d.getFullYear(); if (n < new Date(n.getFullYear(), d.getMonth(), d.getDate())) a -= 1; return a; };
  const p2 = (n) => String(n).padStart(2, '0');
  const stamp = (iso) => { const d = new Date(iso); return Number.isNaN(+d) ? '' : `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`; };
  const place = (a) => (!a ? '' : a.type === 'city' ? `${a.district}, ${a.khoroo}` : a.type === 'aimag' ? `${a.aimag} аймаг, ${a.soum} сум` : '');
  const PAGE = 200;

  /* ---------- Табууд ---------- */
  const TABS = { people: ['tab-people', 'adm-people', 'urisan'], ann: ['tab-ann', 'adm-ann', 'zarlal'] };
  function show(name, push) {
    Object.entries(TABS).forEach(([k, [t, p]]) => { $(t).setAttribute('aria-selected', String(k === name)); $(p).hidden = k !== name; });
    if (name === 'ann' && window.UBAnnAdmin) { window.UBAnnAdmin.mount($('adm-ann-box')); }
    if (push) history.replaceState(null, '', `#${TABS[name][2]}`);
  }
  $('tab-people').addEventListener('click', () => show('people', true));
  $('tab-ann').addEventListener('click', () => show('ann', true));
  show(location.hash === '#zarlal' ? 'ann' : 'people', false);

  /* ---------- Урьсан хүмүүс ---------- */
  const st = { view: 'list', q: '', place: '', kind: '', limit: PAGE };
  let rows = null;

  function prepare(raw) {
    const byOwn = new Map(raw.filter((r) => r.own).map((r) => [norm(r.own), r]));
    const kids = new Map();
    raw.forEach((r) => { const k = norm(r.invite); kids.set(k, (kids.get(k) || 0) + 1); });
    return raw.map((r) => {
      const p = byOwn.get(norm(r.invite));
      const inv = r.inviter ? { kind: 'member', name: r.inviter, place: r.inviterPlace || '' }
        : p ? { kind: 'reg', name: `${p.last} ${p.first}`, place: place(p.addr) } : { kind: '', name: '', place: '' };
      const name = `${r.last} ${r.first}`;
      return { ...r, name, inv, invCode: norm(r.invite), age: age(r.dob), where: place(r.addr), invited: r.own ? kids.get(norm(r.own)) || 0 : 0,
        hay: [name, r.phone, inv.name, fmtCode(r.invite), norm(r.invite), r.own, norm(r.own)].join(' ').toLowerCase() };
    });
  }

  function filtered() {
    const q = st.q.trim().toLowerCase();
    return rows.filter((r) => (!q || r.hay.includes(q))
      && (!st.place || (st.place === 'aimag' ? r.addr && r.addr.type === 'aimag' : r.addr && r.addr.type === 'city' && r.addr.district === st.place))
      && (!st.kind || r.inv.kind === st.kind));
  }

  function kpis() {
    const weekAgo = Date.now() - 7 * 86400000;
    const memberCodes = new Set(rows.filter((r) => r.inv.kind === 'member').map((r) => r.invCode));
    const items = [
      ['Нийт бүртгүүлэгч', rows.length, 'хүн', true],
      ['Урьсан намын гишүүн', memberCodes.size, 'гишүүн'],
      ['Бүртгүүлэгчийн урьсан', rows.filter((r) => r.inv.kind === 'reg').length, 'хүн'],
      ['Сүүлийн 7 хоногт', rows.filter((r) => Date.parse(r.t) >= weekAgo).length, 'хүн'],
    ];
    $('adm-kpis').replaceChildren(...items.map(([l, v, u, brand]) => {
      const k = el('div', `adm-kpi${brand ? ' is-brand' : ''}`);
      k.append(el('span', 'adm-kpi-l', l), el('b', 'adm-kpi-v', int(v)), el('span', 'adm-kpi-u', u));
      return k;
    }));
  }

  function fillPlaces() {
    const s = $('adm-place');
    const ds = [...new Set(rows.filter((r) => r.addr && r.addr.type === 'city').map((r) => r.addr.district))].sort(byMn);
    const hasAimag = rows.some((r) => r.addr && r.addr.type === 'aimag');
    s.replaceChildren(new Option('Бүгд', ''), ...ds.map((d) => new Option(`${d} дүүрэг`, d)), ...(hasAimag ? [new Option('Орон нутаг (аймаг)', 'aimag')] : []));
    s.value = st.place;
  }

  function invCell(r) {
    const td = el('td', 'adm-inv');
    if (!r.inv.kind) { td.append(el('span', 'adm-muted', `— (${fmtCode(r.invite) || 'кодгүй'})`)); return td; }
    td.append(el('b', null, r.inv.name), el('span', `adm-badge${r.inv.kind === 'reg' ? ' is-reg' : ''}`, r.inv.kind === 'member' ? 'Гишүүн' : 'Бүртгүүлэгч'));
    if (r.inv.place) td.append(el('small', null, r.inv.place));
    return td;
  }

  function renderList(list) {
    const wrap = el('div', 'ub-tablewrap adm-wrap');
    const t = el('table', 'ub-table adm-table');
    const tr = el('tr');
    [['№', 'n'], ['Нэр'], ['Утас'], ['Хүйс'], ['Нас', 'n'], ['Оршин суугаа газар'], ['Урьсан хүн'], ['Өөрөө урьсан', 'n'], ['Бүртгүүлсэн']]
      .forEach(([h, c]) => { const th = el('th', c || null, h); th.scope = 'col'; tr.append(th); });
    const thead = el('thead'); thead.append(tr);
    const tb = el('tbody');
    list.slice(0, st.limit).forEach((r, i) => {
      const row = el('tr');
      const tel = el('a', null, r.phone); tel.href = `tel:${r.phone}`;
      const ph = el('td'); ph.append(tel);
      row.append(el('td', 'n', String(i + 1)), el('td', 'adm-name', r.name), ph, el('td', null, r.gender || '—'), el('td', 'n', r.age == null ? '—' : String(r.age)),
        el('td', null, r.where || '—'), invCell(r), el('td', r.invited ? 'n adm-has' : 'n', String(r.invited)), el('td', 'adm-date', stamp(r.t)));
      tb.append(row);
    });
    t.append(thead, tb); wrap.append(t);
    const out = [wrap];
    if (list.length > st.limit) {
      const more = el('button', 'ann-all', `Дахиад харуулах (${int(list.length - st.limit)} үлдсэн)`); more.type = 'button';
      more.addEventListener('click', () => { st.limit += PAGE; render(); });
      out.push(more);
    }
    return out;
  }

  /* Тухайн кодоос доош бүх үеийн урилгын мод (tree.js) */
  function treeOf(code) {
    const kids = new Map();
    rows.forEach((r) => { if (!kids.has(r.invCode)) kids.set(r.invCode, []); kids.get(r.invCode).push(r); });
    const seen = new Set([code]);
    const walk = (c, depth) => (kids.get(c) || []).filter((r) => !(r.own && seen.has(norm(r.own))) && depth < 60).map((r) => {
      const own = norm(r.own); if (own) seen.add(own);
      return { n: r.name, t: day(r.t), children: own ? walk(own, depth + 1) : [] };
    });
    return walk(code, 0);
  }

  function renderGroups(list) {
    const groups = new Map();
    list.forEach((r) => {
      if (!groups.has(r.invCode)) groups.set(r.invCode, { code: r.invCode, inv: r.inv, items: [] });
      groups.get(r.invCode).items.push(r);
    });
    const arr = [...groups.values()].sort((a, b) => b.items.length - a.items.length || byMn(a.inv.name || 'я', b.inv.name || 'я'));
    const box = el('div', 'adm-groups');
    arr.forEach((g, i) => {
      const d = el('details', 'adm-group');
      const s = el('summary');
      const who = el('span', 'adm-g-who');
      who.append(el('span', 'adm-g-rank', String(i + 1)), el('b', null, g.inv.name || `Тодорхойгүй (${fmtCode(g.code)})`));
      if (g.inv.kind) who.append(el('span', `adm-badge${g.inv.kind === 'reg' ? ' is-reg' : ''}`, g.inv.kind === 'member' ? 'Гишүүн' : 'Бүртгүүлэгч'));
      const meta = el('span', 'adm-g-meta', [g.inv.place, fmtCode(g.code)].filter(Boolean).join(' · '));
      const n = el('span', 'adm-g-n'); n.append(el('b', null, int(g.items.length)), document.createTextNode(' хүн'));
      const tb = el('button', 'ubt-open adm-g-tree', 'Урилгын мод'); tb.type = 'button';
      tb.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (!window.UBTree) { alert('Хуудсыг Ctrl+F5-аар шинэчилнэ үү.'); return; }
        window.UBTree.open({ name: g.inv.name || fmtCode(g.code), sub: 'Урилгаар бүртгүүлсэн хүмүүс, тэдний урьсан хүмүүс', children: treeOf(g.code) });
      });
      s.append(who, meta, n, tb);
      const ul = el('ul', 'adm-g-list');
      g.items.slice().sort((a, b) => String(b.t).localeCompare(String(a.t))).forEach((r) => {
        const li = el('li');
        const tel = el('a', null, r.phone); tel.href = `tel:${r.phone}`;
        li.append(el('b', null, r.name), tel, el('time', null, day(r.t)),
          el('span', 'adm-g-sub', [r.gender, r.age != null ? `${r.age} нас` : null, r.where, r.invited ? `өөрөө ${r.invited} хүн урьсан` : null].filter(Boolean).join(' · ')));
        ul.append(li);
      });
      d.append(s, ul);
      box.append(d);
    });
    return [box];
  }

  function render() {
    const list = filtered();
    const any = st.q || st.place || st.kind;
    $('adm-reset').hidden = !any;
    const inviters = new Set(list.map((r) => r.invCode)).size;
    $('adm-sum').textContent = `${int(list.length)} бүртгүүлэгч · ${int(inviters)} урьсан хүн${any ? ` (нийт ${int(rows.length)} бүртгүүлэгчээс)` : ''}`;
    $('adm-xl').disabled = !list.length;
    const body = $('adm-body');
    if (!list.length) { body.replaceChildren(el('p', 'adm-empty', rows.length ? 'Шүүлтэд тохирох хүн алга.' : 'Одоогоор урилгаар бүртгүүлсэн хүн алга.')); return; }
    body.replaceChildren(...(st.view === 'group' ? renderGroups(list) : renderList(list)));
  }

  function exportXlsx() {
    if (!window.UBXlsx) { alert('Excel үүсгэх файл ачаалагдаагүй байна. Хуудсыг Ctrl+F5-аар шинэчилнэ үү.'); return; }
    const list = filtered().slice().sort((a, b) => String(a.t).localeCompare(String(b.t)));
    const HEAD = ['№', 'Овог', 'Нэр', 'Төрсөн огноо', 'Нас', 'Хүйс', 'Утас', 'Хот/аймаг', 'Дүүрэг/сум', 'Хороо', 'Бүртгүүлсэн', 'Өөрийн урилгын код', 'Өөрөө урьсан', 'Урьсан хүн', 'Урьсан хүний төрөл', 'Урьсан хүний код', 'Урьсан хүний байршил'];
    const WIDTH = [5, 16, 16, 13, 6, 10, 12, 14, 16, 12, 17, 18, 12, 26, 14, 16, 26];
    const data = list.map((r, i) => {
      const a = r.addr || {};
      return [i + 1, r.last, r.first, r.dob || '', r.age, r.gender || '', r.phone,
        a.type === 'city' ? a.city || 'Улаанбаатар' : a.aimag ? `${a.aimag} аймаг` : '', a.type === 'city' ? a.district : a.soum ? `${a.soum} сум` : '', a.khoroo || '',
        stamp(r.t), r.own ? fmtCode(r.own) : '', r.invited, r.inv.name, r.inv.kind === 'member' ? 'Намын гишүүн' : r.inv.kind === 'reg' ? 'Бүртгүүлэгч' : '', fmtCode(r.invite), r.inv.place];
    });
    window.UBXlsx.download(`urisan_khumuus_${new Date().toISOString().slice(0, 10)}.xlsx`, 'Урьсан хүмүүс', HEAD, data, WIDTH);
  }

  document.querySelectorAll('.adm-bar [data-view]').forEach((b) => b.addEventListener('click', () => {
    st.view = b.dataset.view; st.limit = PAGE;
    document.querySelectorAll('.adm-bar [data-view]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    if (rows) render();
  }));
  let qt = 0;
  $('adm-q').addEventListener('input', (e) => { clearTimeout(qt); qt = setTimeout(() => { st.q = e.target.value; st.limit = PAGE; if (rows) render(); }, 120); });
  $('adm-place').addEventListener('change', (e) => { st.place = e.target.value; st.limit = PAGE; if (rows) render(); });
  $('adm-kind').addEventListener('change', (e) => { st.kind = e.target.value; st.limit = PAGE; if (rows) render(); });
  $('adm-reset').addEventListener('click', () => { st.q = st.place = st.kind = ''; $('adm-q').value = ''; $('adm-place').value = ''; $('adm-kind').value = ''; st.limit = PAGE; render(); });
  $('adm-xl').addEventListener('click', exportXlsx);

  fetch('/api/registrations', { credentials: 'same-origin' })
    .then(async (r) => ({ status: r.status, d: await r.json().catch(() => ({})) }))
    .then(({ status, d }) => {
      if (status === 401) { location.assign('/login?next=/admin'); return; }
      if (status === 503) { $('adm-sum').textContent = 'Бүртгэлийн сан (Upstash Redis) холбогдоогүй байна.'; return; }
      if (status !== 200) { $('adm-sum').textContent = 'Өгөгдлийг ачаалж чадсангүй. Хуудсыг дахин ачаална уу.'; return; }
      rows = prepare(d.rows || []);
      kpis(); fillPlaces(); render();
    })
    .catch(() => { $('adm-sum').textContent = 'Сервертэй холбогдож чадсангүй.'; });
})();
