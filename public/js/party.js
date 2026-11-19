/*
 * party.js — «Намын гишүүд» цонх: 350 гишүүн, тус бүрийн урилгын кодоор бүртгүүлсэн хүмүүсийн тоо,
 * гишүүн тус бүрийн бүртгүүлэгчдийг болон бүгдийг Excel (.xlsx)-ээр татах. Зөвхөн админд (дашбоард нэвтрэлттэй).
 */
(function () {
  'use strict';
  const btn = document.getElementById('ub-party');
  if (!btn) return;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  /* members.js-ийн туслахууд; хөтчийн хуучин кэшээс болж байхгүй бол өөрийн орлуулгаар ажиллана */
  const ownCache = {};
  const FALLBACK = {
    note: (t) => el('p', 'ub-note', t),
    int: (v) => Number(v).toLocaleString('en-US'),
    nameCell: (td, m) => { td.append(el('span', 'ub-name-txt', m.n)); },
    fetchScope: (key, q) => ownCache[key] ? Promise.resolve(ownCache[key])
      : fetch(`/api/members${q}`, { credentials: 'same-origin' }).then(async (r) => { const x = { status: r.status, data: await r.json().catch(() => ({})) }; if (r.ok) ownCache[key] = x; return x; }),
  };
  const M = new Proxy({}, { get: (_, k) => (window.UBMembers && window.UBMembers[k]) || FALLBACK[k] });
  const X = { download: (...a) => {
    if (!window.UBXlsx) { alert('Excel үүсгэх файл (js/xlsx-lite.js) ачаалагдаагүй байна. Хуудсыг Ctrl+F5-аар шинэчилнэ үү.'); return; }
    window.UBXlsx.download(...a);
  } };
  const norm = (c) => String(c || '').toUpperCase().replace(/[\s-]/g, '');
  const byMn = (a, b) => a.localeCompare(b, 'mn');
  const age = (dob) => { if (!dob) return null; const d = new Date(`${dob}T00:00:00`), n = new Date(); let a = n.getFullYear() - d.getFullYear(); if (n < new Date(n.getFullYear(), d.getMonth(), d.getDate())) a -= 1; return a; };
  const stamp = (iso) => { const d = new Date(iso); return Number.isNaN(+d) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const today = () => new Date().toISOString().slice(0, 10);
  const safe = (s) => String(s).replace(/[\\/:*?"<>|\s]+/g, '_');

  let dlg = null, members = null, regs = null, regsError = null;
  const st = { district: '', khoroo: '', q: '', only: false };

  const HEAD = ['№', 'Овог', 'Нэр', 'Төрсөн огноо', 'Нас', 'Хүйс', 'Утас', 'Хот/аймаг', 'Дүүрэг/сум', 'Хороо', 'Бүртгүүлсэн', 'Өөрийн урилгын код', 'Урьсан хүн', 'Урьсан хүний код', 'Урьсан хүний хороо'];
  const WIDTH = [5, 16, 16, 13, 6, 10, 12, 14, 16, 12, 17, 18, 26, 16, 24];
  function inviterOf(r) {
    if (r.inviter) return [r.inviter, r.inviterPlace || ''];
    const p = regs.find((x) => norm(x.own) === norm(r.invite)); // урилгаар бүртгүүлсэн хүн урьсан бол
    return p ? [`${p.last} ${p.first} (бүртгүүлэгч)`, ''] : ['', ''];
  }
  function rowsFor(list) {
    return list.map((r, i) => {
      const a = r.addr || {}, [inv, invPlace] = inviterOf(r);
      return [i + 1, r.last, r.first, r.dob || '', age(r.dob), r.gender || '', r.phone,
        a.type === 'city' ? a.city || 'Улаанбаатар' : a.aimag ? `${a.aimag} аймаг` : '', a.type === 'city' ? a.district : a.soum ? `${a.soum} сум` : '', a.khoroo || '',
        stamp(r.t), r.own || '', inv, r.invite || '', invPlace];
    });
  }
  const regsOf = (m) => (regs || []).filter((r) => norm(r.invite) === norm(m.i)).sort((a, b) => String(a.t).localeCompare(String(b.t)));
  function exportMember(m) {
    const list = regsOf(m);
    X.download(`urilga_${safe(m.n)}_${today()}.xlsx`, m.n, HEAD, rowsFor(list), WIDTH);
  }
  function exportAll() {
    const list = (regs || []).slice().sort((a, b) => String(a.t).localeCompare(String(b.t)));
    X.download(`urilgaar_burtguulsen_buh_${today()}.xlsx`, 'Бүх бүртгүүлэгч', HEAD, rowsFor(list), WIDTH);
  }

  function panel() {
    if (dlg) return dlg;
    dlg = el('dialog', 'ub-elx ub-pm'); dlg.setAttribute('aria-labelledby', 'ub-pm-t');
    const head = el('header', 'ub-elx-head'), hw = el('div');
    const t = el('h2', 'ub-elx-t', 'Намын гишүүд'); t.id = 'ub-pm-t';
    hw.append(el('p', 'ub-mdlg-eyebrow', 'Урилгаар бүртгүүлсэн хүмүүс'), t, el('p', 'ub-mdlg-sub ub-pm-sub', 'Ачаалж байна…'));
    const x = el('button', 'ub-mdlg-x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Хаах'); x.addEventListener('click', () => dlg.close());
    head.append(hw, x);
    const bar = el('div', 'ub-elx-bar');
    const field = (label, ctrl) => { const l = el('label', 'ub-field'); l.append(el('span', null, label), ctrl); return l; };
    const d = el('select', 'dash-select ub-pm-d'), k = el('select', 'dash-select ub-pm-k'), q = el('input', 'ub-names-q ub-pm-q');
    q.type = 'search'; q.placeholder = 'Нэрээр хайх'; q.setAttribute('aria-label', 'Гишүүний нэрээр хайх');
    const only = el('label', 'ub-pm-only'); const cb = el('input'); cb.type = 'checkbox'; only.append(cb, document.createTextNode('Зөвхөн бүртгүүлсэн хүнтэй'));
    const all = el('button', 'ub-xl-btn is-big ub-pm-all', 'Бүгдийг Excel-ээр'); all.type = 'button'; all.addEventListener('click', exportAll);
    bar.append(field('Дүүрэг', d), field('Хороо', k), field('Хайх', q), only, all);
    dlg.append(head, bar, el('div', 'ub-elx-body'));
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    d.addEventListener('change', () => { st.district = d.value; st.khoroo = ''; render(); });
    k.addEventListener('change', () => { st.khoroo = k.value; render(); });
    q.addEventListener('input', () => { st.q = q.value; render(true); });
    cb.addEventListener('change', () => { st.only = cb.checked; render(); });
    (document.getElementById('ub') || document.body).append(dlg);
    return dlg;
  }

  function render(keepFocus) {
    const p = dlg, all = members.members;
    const counts = new Map(); (regs || []).forEach((r) => { const c = norm(r.invite); counts.set(c, (counts.get(c) || 0) + 1); });
    const cnt = (m) => counts.get(norm(m.i)) || 0;
    const d = p.querySelector('.ub-pm-d'), k = p.querySelector('.ub-pm-k');
    d.replaceChildren(new Option('Бүх дүүрэг', ''), ...[...new Set(all.map((m) => m.dist))].sort(byMn).map((x) => new Option(x, x))); d.value = st.district;
    const khs = st.district ? [...new Map(all.filter((m) => m.dist === st.district).map((m) => [m.kh, m.kno])).entries()].sort((a, b) => a[1] - b[1]) : [];
    k.replaceChildren(new Option(st.district ? 'Бүх хороо' : 'Эхлээд дүүрэг', ''), ...khs.map(([x]) => new Option(x, x))); k.disabled = !st.district; k.value = st.khoroo;
    const qq = st.q.trim().toLowerCase();
    const list = all.filter((m) => (!st.district || m.dist === st.district) && (!st.khoroo || m.kh === st.khoroo) && (!qq || m.n.toLowerCase().includes(qq)) && (!st.only || cnt(m) > 0))
      .map((m, i) => ({ m, i, c: cnt(m) })).sort((a, b) => b.c - a.c || a.i - b.i);
    const totalRegs = (regs || []).length, withRegs = all.filter((m) => cnt(m) > 0).length;
    p.querySelector('.ub-pm-sub').textContent = regsError ? regsError
      : `${M.int(all.length)} гишүүн · ${M.int(withRegs)} гишүүн хүн урьсан · нийт ${M.int(totalRegs)} бүртгүүлэгч`;
    p.querySelector('.ub-pm-all').disabled = !totalRegs;
    const body = p.querySelector('.ub-elx-body');
    if (!list.length) { body.replaceChildren(M.note(st.only ? 'Энэ хүрээнд хүн урьсан гишүүн алга.' : 'Хайлтад тохирох гишүүн алга.')); return; }
    const wrap = el('div', 'ub-tablewrap ub-elx-wrap'), t = el('table', 'ub-table ub-names-table ub-elx-table');
    const tr = el('tr');
    [['№', 'n'], ['Нэр'], ['Дүүрэг'], ['Хороо'], ['Үүр'], ['Бүртгүүлсэн', 'n'], ['Excel']].forEach(([h, c]) => { const th = el('th', c || null, h); th.scope = 'col'; tr.append(th); });
    const thead = el('thead'); thead.append(tr);
    const tb = el('tbody');
    list.forEach(({ m, c }, i) => {
      const row = el('tr');
      row.append(el('td', 'n', String(i + 1)));
      const nc = el('td'); M.nameCell(nc, m); row.append(nc);
      row.append(el('td', null, m.dist), el('td', null, m.kh), el('td', null, m.u || '—'), el('td', c ? 'n ub-elx-has' : 'n', String(c)));
      const xc = el('td'); const b = el('button', 'ub-xl-btn', 'Excel'); b.type = 'button'; b.disabled = !c;
      b.setAttribute('aria-label', `${m.n} — урилгаар бүртгүүлсэн ${c} хүнийг Excel-ээр татах`); b.addEventListener('click', () => exportMember(m)); xc.append(b); row.append(xc);
      tb.append(row);
    });
    t.append(thead, tb); wrap.append(t); body.replaceChildren(wrap);
    if (keepFocus) p.querySelector('.ub-pm-q').focus();
  }

  btn.addEventListener('click', () => {
    let p;
    try { p = panel(); } catch (err) { console.error(err); alert('«Намын гишүүд» цонхыг нээж чадсангүй. Хуудсыг Ctrl+F5-аар шинэчилнэ үү.'); return; }
    if (!p.open) p.showModal();
    if (!members) p.querySelector('.ub-elx-body').replaceChildren(M.note('Ачаалж байна…'));
    Promise.all([
      M.fetchScope('city', ''),
      fetch('/api/registrations', { credentials: 'same-origin' }).then(async (r) => ({ status: r.status, d: await r.json().catch(() => ({})) })).catch(() => ({ status: 0, d: {} })),
    ]).then(([mem, rg]) => {
      if (mem.status === 401 || rg.status === 401) { location.assign(`/login?next=${encodeURIComponent(location.pathname + location.search)}`); return; }
      if (mem.status !== 200) { p.querySelector('.ub-elx-body').replaceChildren(M.note('Гишүүдийн жагсаалтыг ачаалж чадсангүй.')); return; }
      members = mem.data;
      if (rg.status === 200) { regs = rg.d.rows || []; regsError = null; }
      else { regs = []; regsError = rg.status === 503 ? 'Бүртгэлийн сан холбогдоогүй байна (Vercel → Storage → Upstash for Redis).' : 'Бүртгүүлэгчдийг ачаалж чадсангүй.'; }
      try { render(); } catch (err) { console.error(err); p.querySelector('.ub-elx-body').replaceChildren(M.note(`Жагсаалтыг харуулж чадсангүй: ${err.message}. Хуудсыг Ctrl+F5-аар шинэчилнэ үү.`)); }
    }).catch((err) => { console.error(err); p.querySelector('.ub-elx-body').replaceChildren(M.note('Сервертэй холбогдож чадсангүй.')); });
  });
})();
