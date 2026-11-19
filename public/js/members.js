/*
 * members.js — газрын зургийн хажууд гишүүдийн нэрсийг харуулна (зөвхөн Vercel хувилбар).
 * Юу ч сонгоогүй бол хотын бүх гишүүд, дүүрэг сонгоход дүүргийнх, хороо сонгоход хорооных.
 * Нэрс /api/members-ээс ирнэ; сайтад нэвтэрсэн хүнд л өгөгдөл буцаана.
 * Нэр дээр дарахад дэлгэрэнгүй цонх нээгдэж, гишүүний урилгын код, холбоос (/invite?c=КОД) гарна.
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
        const td = el('td', c || null, j === 1 ? null : String(v));
        if (j === 1) { const b = el('button', 'ub-name-btn', String(v)); b.type = 'button'; b.title = 'Дэлгэрэнгүй, урилгын код'; b.addEventListener('click', () => openMember(m)); td.append(b); }
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

  /* ---------- Гишүүний дэлгэрэнгүй цонх ---------- */
  const title = (w) => w.charAt(0).toLocaleUpperCase('mn') + w.slice(1).toLocaleLowerCase('mn');
  function shortName(full) {
    const p = String(full).split(/\s+/).filter(Boolean);
    return p.length < 2 ? title(p[0] || '') : `${p[0].charAt(0).toLocaleUpperCase('mn')}. ${p.slice(1).map(title).join(' ')}`;
  }
  const inviteUrl = (code) => `${location.origin}/invite?c=${encodeURIComponent(code)}`;
  const inviteText = (m) => `Сайн байна уу! ${shortName(m.n)} таныг гишүүнээр элсэхийг урьж байна. Урилгын код: ${m.i}. Холбоос: ${inviteUrl(m.i)}`;
  let dlg = null;

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
    document.body.append(dlg);
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
    if (!m.i) { inv.append(el('p', 'ub-note', 'Урилгын код үүсээгүй байна. Өгөгдлийг шинэчилнэ үү.')); }
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
      const share = el('div', 'ub-mdlg-share');
      const msg = inviteText(m);
      if (navigator.share) {
        const sb = el('button', 'ub-mdlg-btn', 'Илгээх…'); sb.type = 'button';
        sb.addEventListener('click', () => navigator.share({ title: 'Урилга', text: msg.replace(/ Холбоос: .*$/, ''), url: inviteUrl(m.i) }).catch(() => {}));
        share.append(sb);
      }
      const sms = el('a', 'ub-mdlg-btn', 'SMS-ээр'); sms.href = `sms:?&body=${encodeURIComponent(msg)}`;
      const mail = el('a', 'ub-mdlg-btn', 'И-мэйлээр'); mail.href = `mailto:?subject=${encodeURIComponent('Урилга')}&body=${encodeURIComponent(msg)}`;
      const mb = el('button', 'ub-mdlg-btn', 'Мессеж хуулах'); mb.type = 'button'; mb.addEventListener('click', () => copy(msg, mb));
      share.append(sms, mail, mb);
      const cnt = el('p', 'ub-mdlg-count'); cnt.hidden = true;
      inv.append(codeRow, linkRow, share, cnt, el('p', 'ub-mdlg-hint', 'Холбоосыг нээсэн хүн овог нэр, утас, хаягаа бөглөж бүртгүүлнэ. Түүнд зөвхөн урьсан гишүүний товч нэр, дүүрэг харагдана.'));
      fetch('/api/registrations?counts=1', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).then((j) => {
        if (!j || !j.counts) return;
        const n = j.counts[m.i.replace('-', '')] || 0;
        cnt.replaceChildren(document.createTextNode('Энэ урилгаар бүртгүүлсэн: '), el('b', null, `${n} хүн`)); cnt.hidden = false;
      }).catch(() => {});
    }
    d.replaceChildren(head, dl, inv);
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
