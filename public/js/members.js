/*
 * members.js — газрын зургийн хажууд гишүүдийн нэрсийг харуулна (зөвхөн Vercel хувилбар).
 * Юу ч сонгоогүй бол хотын бүх гишүүд, дүүрэг сонгоход дүүргийнх, хороо сонгоход хорооных.
 * Нэрс /api/members-ээс ирнэ; сайтад нэвтэрсэн хүнд л өгөгдөл буцаана.
 * «Бүртгэл», «Намын гишүүд» цонхны нэрийн ард «Дэлгэрэнгүй» товч: гишүүний мэдээлэл, урилгын код, холбоос бүхий цонх.
 * Газрын зургийн хажуугийн жагсаалтад зөвхөн нэр.
 * «Бүртгэл» товч: бүх гишүүдийн жагсаалтыг (шүүлт, хайлттай) тусдаа цонхонд нээнэ.
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
      cells.forEach(([v, c, full], j) => {
        const td = el('td', j === 1 ? 'ub-name-plain' : c || null, String(v)); // газрын зургийн хажуу: зөвхөн нэр
        if (full && SHORT[full]) td.title = full; row.append(td);
      });
      return row;
    }));
    if (!list.length) {
      const r = el('tr');
      const td = el('td', 'ub-names-empty', q ? 'Хайлтад тохирох гишүүн алга.' : 'Энэ хүрээнд бүртгэлтэй гишүүн алга.');
      td.colSpan = 9; r.append(td); tb.append(r);
    }
  }

  /* «Урилгын мод» товч: гишүүн → бүртгүүлэгчид → тэдний урьсан хүмүүс … (tree.js) */
  const normCode = (c) => String(c || '').toUpperCase().replace(/[\s-]/g, '');
  function treeButton(m) {
    const b = el('button', 'ubt-open'); b.type = 'button';
    b.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M2 8h3c3 0 3-5 6-5h3M5 8c3 0 3 5 6 5h3M5 8h9"/></svg>';
    b.append(document.createTextNode('Урилгын мод'));
    b.addEventListener('click', () => {
      if (!window.UBTree) return;
      b.disabled = true;
      fetch('/api/registrations', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).then((j) => {
        const rows = (j && j.rows) || [], kids = new Map();
        rows.forEach((r) => { if (!r.own) return; const k = normCode(r.invite); if (!kids.has(k)) kids.set(k, []); kids.get(k).push(r); });
        const seen = new Set([normCode(m.i)]);
        const walk = (code, depth) => (kids.get(code) || []).filter((r) => !seen.has(normCode(r.own)) && depth < 60).map((r) => {
          const own = normCode(r.own); seen.add(own);
          return { n: `${r.last} ${r.first}`, t: String(r.t || '').slice(0, 10), children: walk(own, depth + 1) };
        });
        // Хуучин (өөрийн кодгүй) бүртгэлүүдийг эхний үед нэмнэ
        const direct = walk(normCode(m.i), 0);
        rows.filter((r) => !r.own && normCode(r.invite) === normCode(m.i)).forEach((r) => direct.push({ n: `${r.last} ${r.first}`, t: String(r.t || '').slice(0, 10), children: [] }));
        window.UBTree.open({ name: m.n, sub: [m.dist && `${m.dist} дүүрэг`, m.kh, m.u].filter(Boolean).join(' · '), children: direct });
      }).finally(() => { b.disabled = false; });
    });
    return b;
  }

  /* Нэр + «Дэлгэрэнгүй» товч (нэрийн ард) */
  function nameCell(td, m) {
    td.classList.add('ub-namecell');
    const b = el('button', 'ub-more-btn', 'Дэлгэрэнгүй'); b.type = 'button';
    b.setAttribute('aria-label', `${m.n} — дэлгэрэнгүй мэдээлэл, урилгын код`);
    b.addEventListener('click', () => openMember(m));
    td.append(el('span', 'ub-name-txt', m.n), b);
  }

  /* /api/members-ийг хүрээгээр нь нэг удаа татаж санана */
  const inflight = new Map();
  function fetchScope(key, q) {
    if (cache.has(key)) return Promise.resolve({ status: 200, data: cache.get(key) });
    if (inflight.has(key)) return inflight.get(key);
    const pr = fetch(API + q, { credentials: 'same-origin' }).then(async (r) => ({ status: r.status, data: await r.json().catch(() => ({})) }))
      .then((x) => { if (x.status === 200) cache.set(key, x.data); return x; })
      .finally(() => inflight.delete(key));
    inflight.set(key, pr);
    return pr;
  }

  /* ---------- Гишүүний дэлгэрэнгүй цонх ---------- */
  const title = (w) => w.charAt(0).toLocaleUpperCase('mn') + w.slice(1).toLocaleLowerCase('mn');
  function shortName(full) {
    const p = String(full).split(/\s+/).filter(Boolean);
    return p.length < 2 ? title(p[0] || '') : `${p[0].charAt(0).toLocaleUpperCase('mn')}. ${p.slice(1).map(title).join(' ')}`;
  }
  const inviteUrl = (code) => `${location.origin}/invite?c=${encodeURIComponent(code)}`;
  let dlg = null, annSeq = 0;

  function copy(text, btn) {
    const label = btn.textContent;
    const done = () => { btn.textContent = 'Хуулагдлаа ✓'; btn.classList.add('is-done'); setTimeout(() => { btn.textContent = label; btn.classList.remove('is-done'); }, 1600); };
    if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(text).then(done, () => fallback()); } else fallback();
    function fallback() {
      const t = el('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;opacity:0';
      dlg.append(t); t.select(); try { document.execCommand('copy'); done(); } catch (e) { /* хуулж чадсангүй */ } t.remove();
    }
  }

  function dialog() {
    if (dlg) return dlg;
    dlg = el('dialog', 'ub-mdlg'); dlg.setAttribute('aria-labelledby', 'ub-mdlg-t');
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    (document.getElementById('ub') || document.body).append(dlg);
    return dlg;
  }

  function openMember(m) {
    const d = dialog();
    const head = el('header', 'ub-mdlg-head');
    const h = el('h2', 'ub-mdlg-t', m.n); h.id = 'ub-mdlg-t';
    const close = el('button', 'ub-mdlg-x', '×'); close.type = 'button'; close.setAttribute('aria-label', 'Хаах'); close.addEventListener('click', () => d.close());
    const hw = el('div'); hw.append(el('p', 'ub-mdlg-eyebrow', 'Гишүүний мэдээлэл'), h, el('p', 'ub-mdlg-sub', [m.dist && `${m.dist} дүүрэг`, m.kh, m.u].filter(Boolean).join(' · ')));
    head.append(hw, close);

    const dl = el('dl', 'ub-mdlg-dl');
    const item = (k, v) => { const w = el('div'); w.append(el('dt', null, k), el('dd', null, v == null || v === '' ? '—' : String(v))); dl.append(w); };
    item('Нас', m.a); item('Хүйс', m.g); item('Төлөв', m.s); item('Үүр', m.u);
    item('Хөдөлгөөн', m.m); item('Хөдөлгөөний огноо', m.d);
    const ank = el('div', 'ub-mdlg-ank'); ank.append(el('dt', null, 'Анкет бөглөлт'));
    const dd = el('dd'); const bar = el('span', 'ub-mdlg-bar'); const fill = el('i'); fill.style.width = `${Math.max(0, Math.min(100, m.k || 0))}%`; bar.append(fill);
    dd.append(bar, el('b', null, m.k == null ? '—' : `${m.k}%`)); ank.append(dd); dl.append(ank);

    const inv = el('section', 'ub-mdlg-inv');
    inv.append(el('h3', null, 'Урилгын код'));
    let reg = null;
    if (!m.i) { inv.append(el('p', 'ub-note', 'Урилгын код олдсонгүй: GitHub дээрх private/members.enc файлыг шинэ хувилбараар сольж Redeploy хийнэ үү.')); }
    else {
      const codeRow = el('div', 'ub-mdlg-coderow');
      const code = el('output', 'ub-mdlg-code', m.i);
      const cb = el('button', 'ub-mdlg-btn', 'Код хуулах'); cb.type = 'button'; cb.addEventListener('click', () => copy(m.i, cb));
      codeRow.append(code, cb);
      const linkRow = el('div', 'ub-mdlg-linkrow');
      const link = el('input', 'ub-mdlg-link'); link.type = 'text'; link.readOnly = true; link.value = inviteUrl(m.i); link.setAttribute('aria-label', 'Урилгын холбоос');
      link.addEventListener('focus', () => link.select());
      const lb = el('button', 'ub-mdlg-btn is-brand', 'Холбоос хуулах'); lb.type = 'button'; lb.addEventListener('click', () => copy(inviteUrl(m.i), lb));
      linkRow.append(link, lb);
      reg = el('div', 'ub-mdlg-reg'); reg.hidden = true;
      inv.append(codeRow, linkRow);
      d.dataset.member = m.i;
      fetch(`/api/registrations?invite=${encodeURIComponent(m.i)}`, { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).then((j) => {
        if (!j || d.dataset.member !== m.i) return; // өөр гишүүний цонх нээгдсэн бол хаяна
        const hr = el('div', 'ubt-headrow'); hr.append(el('h3', null, `Энэ урилгаар бүртгүүлсэн: ${j.total} хүн`), treeButton(m)); reg.append(hr);
        if (j.total) {
          const ul = el('ul', 'ub-mdlg-reglist');
          j.rows.forEach((r) => {
            const li = el('li');
            const a = r.addr || {};
            const tel = el('a', null, r.phone); tel.href = `tel:${r.phone}`;
            const age = r.dob ? Math.floor((Date.now() - new Date(`${r.dob}T00:00:00`)) / 31557600000) : null;
            const place = a.type === 'city' ? `${a.district}, ${a.khoroo}` : a.type === 'aimag' ? `${a.aimag}, ${a.soum} сум` : '';
            const nb = el('b', null, `${r.last} ${r.first}`);
            if (/^https:\/\/(www\.)?(facebook\.com|fb\.com|fb\.me)\//.test(r.fb || '')) { const fa = el('a', 'adm-fb', 'f'); fa.href = r.fb; fa.target = '_blank'; fa.rel = 'noopener noreferrer'; fa.title = `Facebook: ${r.fb}`; nb.append(fa); }
            li.append(nb, tel, el('time', null, String(r.t || '').slice(0, 10)),
              el('span', 'ub-mdlg-regmeta', [r.gender, r.dob ? `${r.dob} (${age} нас)` : null, place].filter(Boolean).join(' · ') || '—'));
            ul.append(li);
          });
          reg.append(ul);
        } else reg.append(el('p', 'ub-mdlg-hint', 'Одоогоор бүртгүүлсэн хүн алга.'));
        reg.hidden = false;
      }).catch(() => {});
    }
    // Үйл ажиллагааны зарлал — «Анкет бөглөлт»-ийн доор (ann.js)
    const ann = el('div', 'ub-mdlg-annslot');
    const annTok = String(++annSeq); d.dataset.ann = annTok;
    if (window.UBAnn) {
      window.UBAnn.load().then((data) => {
        if (d.dataset.ann !== annTok) return;
        ann.replaceWith(window.UBAnn.section(data, { cls: 'in-dlg', empty: 'Одоогоор зарлал алга.' }));
      });
    }
    d.replaceChildren(head, dl, ann, inv, ...(reg ? [reg] : []));
    if (!d.open) d.showModal();
    close.focus();
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

  /* ---------- «Бүртгэл»: бүх гишүүдийн жагсаалт ---------- */
  let elx = null;
  const elxState = { district: '', khoroo: '', q: '' };
  const byMn = (a, b) => a.localeCompare(b, 'mn');

  function electionPanel() {
    if (elx) return elx;
    elx = el('dialog', 'ub-elx'); elx.setAttribute('aria-labelledby', 'ub-elx-t');
    const head = el('header', 'ub-elx-head');
    const hw = el('div');
    const t = el('h2', 'ub-elx-t', 'Бүртгэл'); t.id = 'ub-elx-t';
    hw.append(el('p', 'ub-mdlg-eyebrow', 'Гишүүдийн жагсаалт'), t, el('p', 'ub-mdlg-sub ub-elx-sub', 'Ачаалж байна…'));
    const x = el('button', 'ub-mdlg-x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Хаах'); x.addEventListener('click', () => elx.close());
    head.append(hw, x);
    const bar = el('div', 'ub-elx-bar');
    const field = (label, ctrl) => { const l = el('label', 'ub-field'); l.append(el('span', null, label), ctrl); return l; };
    const dSel = el('select', 'dash-select ub-elx-d'), kSel = el('select', 'dash-select ub-elx-k'), q = el('input', 'ub-names-q ub-elx-q');
    q.type = 'search'; q.placeholder = 'Нэрээр хайх'; q.setAttribute('aria-label', 'Гишүүний нэрээр хайх');
    const reset = el('button', 'ub-reset ub-elx-reset', 'Бүгдийг харуулах'); reset.type = 'button';
    bar.append(field('Дүүрэг', dSel), field('Хороо', kSel), field('Хайх', q), reset);
    const body = el('div', 'ub-elx-body');
    elx.append(head, bar, body);
    elx.addEventListener('click', (e) => { if (e.target === elx) elx.close(); });
    dSel.addEventListener('change', () => { elxState.district = dSel.value; elxState.khoroo = ''; renderElection(); });
    kSel.addEventListener('change', () => { elxState.khoroo = kSel.value; renderElection(); });
    q.addEventListener('input', () => { elxState.q = q.value; renderElection(true); });
    reset.addEventListener('click', () => { elxState.district = ''; elxState.khoroo = ''; elxState.q = ''; q.value = ''; renderElection(); });
    (document.getElementById('ub') || document.body).append(elx);
    return elx;
  }

  let elxData = null, elxCounts = null;
  function renderElection(keepFocus) {
    const p = elx, all = elxData.members;
    const dSel = p.querySelector('.ub-elx-d'), kSel = p.querySelector('.ub-elx-k');
    const dists = [...new Set(all.map((m) => m.dist))].sort(byMn);
    dSel.replaceChildren(new Option('Бүх дүүрэг', ''), ...dists.map((d) => new Option(d, d)));
    dSel.value = elxState.district;
    const khs = elxState.district ? [...new Map(all.filter((m) => m.dist === elxState.district).map((m) => [m.kh, m.kno])).entries()].sort((a, b) => a[1] - b[1]) : [];
    kSel.replaceChildren(new Option(elxState.district ? 'Бүх хороо' : 'Эхлээд дүүрэг', ''), ...khs.map(([k]) => new Option(k, k)));
    kSel.disabled = !elxState.district; kSel.value = elxState.khoroo;
    const qq = elxState.q.trim().toLowerCase();
    const list = all.filter((m) => (!elxState.district || m.dist === elxState.district) && (!elxState.khoroo || m.kh === elxState.khoroo) && (!qq || m.n.toLowerCase().includes(qq)));
    const scope = elxState.khoroo ? `${elxState.district}, ${elxState.khoroo}` : elxState.district ? `${elxState.district} дүүрэг` : 'Улаанбаатар хот, бүх гишүүд';
    p.querySelector('.ub-elx-sub').textContent = `${scope} · ${int(list.length)} гишүүн${list.length !== all.length ? ` (нийт ${int(all.length)})` : ''} · ${elxData.generated}-ны нэгтгэл`;
    p.querySelector('.ub-elx-reset').hidden = !(elxState.district || elxState.q);
    const body = p.querySelector('.ub-elx-body');
    if (!list.length) { body.replaceChildren(note(qq ? 'Хайлтад тохирох гишүүн алга.' : 'Энэ хүрээнд бүртгэлтэй гишүүн алга.')); return; }
    const wrap = el('div', 'ub-tablewrap ub-elx-wrap');
    const t = el('table', 'ub-table ub-names-table ub-elx-table');
    const tr = el('tr');
    const cols = [['№', 'n'], ['Нэр'], ['Дүүрэг'], ['Хороо'], ['Үүр'], ['Нас', 'n'], ['Хүйс'], ['Анкет', 'n']];
    if (elxCounts) cols.push(['Урьсан', 'n']);
    cols.forEach(([h, c]) => { const th = el('th', c || null, h); th.scope = 'col'; tr.append(th); });
    const thead = el('thead'); thead.append(tr);
    const tb = el('tbody');
    list.forEach((m, i) => {
      const row = el('tr');
      row.append(el('td', 'n', String(i + 1)));
      const nc = el('td'); nameCell(nc, m); row.append(nc);
      row.append(el('td', null, m.dist), el('td', null, m.kh), el('td', null, m.u || '—'), el('td', 'n', m.a == null ? '—' : String(m.a)), el('td', null, m.g), el('td', 'n', m.k == null ? '—' : `${m.k}%`));
      if (elxCounts) { const n = elxCounts[(m.i || '').replace('-', '')] || 0; row.append(el('td', n ? 'n ub-elx-has' : 'n', String(n))); }
      tb.append(row);
    });
    t.append(thead, tb); wrap.append(t); body.replaceChildren(wrap);
    if (keepFocus) p.querySelector('.ub-elx-q').focus();
  }

  function openElection() {
    const p = electionPanel();
    if (!p.open) p.showModal();
    const body = p.querySelector('.ub-elx-body');
    if (!elxData) body.replaceChildren(note('Ачаалж байна…'));
    Promise.all([
      fetchScope('city', ''),
      fetch('/api/registrations?counts=1', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([{ status, data }, counts]) => {
      if (status === 401) { window.location.assign(`/login?next=${encodeURIComponent(location.pathname + location.search)}`); return; }
      if (status !== 200) { body.replaceChildren(note(status === 503 ? 'Нэрсийн хэсэг тохируулагдаагүй байна: Vercel дээр MEMBERS_KEY-г тохируулна уу.' : 'Нэрсийг ачаалж чадсангүй.')); return; }
      elxData = data; elxCounts = counts && counts.counts ? counts.counts : null;
      renderElection();
    });
  }
  document.querySelectorAll('#ub-election').forEach((b) => b.addEventListener('click', openElection));
  // party.js («Намын гишүүд») хуваалцан ашиглана
  window.UBMembers = { fetchScope, openMember, nameCell, note, int };

  dash.draw('member-list', {
    mount() { return {}; },
    update(box) {
      const s = scopeOf();
      if (cache.has(s.key)) { table(box, cache.get(s.key), s.level); return; }
      const my = ++token;
      box.replaceChildren(note('Ачаалж байна…'));
      fetchScope(s.key, s.q).then(({ status, data }) => {
        if (my !== token) return;
        if (status === 200) table(box, data, s.level);
        else if (status === 401) box.replaceChildren(note('Нэрсийн жагсаалт зөвхөн админд харагдана.'));
        else if (status === 503) box.replaceChildren(note('Нэрсийн хэсэг тохируулагдаагүй байна: Vercel дээр MEMBERS_KEY-г тохируулна уу.'));
        else box.replaceChildren(note('Нэрсийг ачаалж чадсангүй.'));
      }).catch(() => { if (my === token) box.replaceChildren(note('Сервертэй холбогдож чадсангүй.')); });
    },
  });
})();
