/*
 * admin.js — админ хуудас (/admin).
 *   «Урьсан хүмүүс»: гишүүдийн (болон бүртгүүлэгчдийн) урилгаар бүртгүүлсэн бүх хүн — жагсаалт, урьсан хүнээр бүлэглэсэн харагдац,
 *                    шүүлт, хайлт, урилгын мод, Excel татах. Өгөгдөл: /api/registrations (зөвхөн админ сешн).
 *                    «Нийт урилгын мод»: бүх гишүүний урилгыг нэг модонд (tree.js, offset: 1).
 *   «Үйл ажиллагааны зарлал»: announce.js (UBAnnAdmin.mount).
 *   «Ирц»: гишүүдийн ирц — зураг, байршил (жижиг газрын зураг), цаг; шүүх, устгах, Excel (/api/attendance).
 *   «Нэвтрэх эрх»: гишүүдийн нэвтрэх нэр, санамсаргүй нууц үг — үүсгэх, шинэчлэх, Excel (/api/credentials).
 *   «Тохиргоо»: Facebook группын холбоос (/api/settings) — урилгаар бүртгүүлэгчдийн /me хуудсанд харагдана.
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
  const TABS = { people: ['tab-people', 'adm-people', 'urisan'], ann: ['tab-ann', 'adm-ann', 'zarlal'], cfg: ['tab-cfg', 'adm-cfg', 'tokhirgoo'], att: ['tab-att', 'adm-att', 'irts'], cred: ['tab-cred', 'adm-cred', 'erh'] };
  function show(name, push) {
    Object.entries(TABS).forEach(([k, [t, p]]) => { $(t).setAttribute('aria-selected', String(k === name)); $(p).hidden = k !== name; });
    if (name === 'ann' && window.UBAnnAdmin) { window.UBAnnAdmin.mount($('adm-ann-box')); }
    if (name === 'cfg') loadCfg();
    if (name === 'att') loadAtt();
    if (name === 'cred') loadCred();
    if (push) history.replaceState(null, '', `#${TABS[name][2]}`);
  }
  $('tab-people').addEventListener('click', () => show('people', true));
  $('tab-ann').addEventListener('click', () => show('ann', true));
  $('tab-cfg').addEventListener('click', () => show('cfg', true));
  $('tab-att').addEventListener('click', () => show('att', true));
  $('tab-cred').addEventListener('click', () => show('cred', true));
  const startTab = Object.keys(TABS).find((k) => `#${TABS[k][2]}` === location.hash) || 'people';

  /* ---------- Тохиргоо: Facebook групп ---------- */
  let cfgLoaded = false;
  function fbPreview() {
    const url = $('adm-fb-url').value.trim(), text = $('adm-fb-text').value.trim();
    const box = $('adm-fb-preview');
    if (!url) { box.replaceChildren(el('p', 'adm-note', 'Холбоос оруулаагүй тул гишүүдэд энэ хэсэг харагдахгүй.')); return; }
    const sec = el('section', 'me-fb');
    const ic = el('span', 'me-fb-ic'); ic.setAttribute('aria-hidden', 'true');
    ic.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 21v-7.5h2.5l.4-3h-2.9V8.6c0-.9.3-1.5 1.5-1.5h1.5V4.4c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2.4H8.1v3h2.5V21h2.9Z"/></svg>';
    const tx = el('div', 'me-fb-tx'); tx.append(el('b', null, 'Манай Facebook групп'), el('p', null, text || 'Группт нэгдэж, үйл ажиллагааны мэдээллээ цаг алдалгүй аваарай.'));
    const a = el('a', 'me-fb-btn', 'Группт нэгдэх ↗'); a.href = /^https?:\/\//i.test(url) ? url : `https://${url}`; a.target = '_blank'; a.rel = 'noopener noreferrer';
    sec.append(ic, tx, a); box.replaceChildren(sec);
  }
  function fbMsg(t, kind) { const m = $('adm-fb-msg'); m.textContent = t || ''; m.className = `ann-msg${kind ? ` is-${kind}` : ''}`; }
  function loadCfg() {
    if (cfgLoaded) return;
    cfgLoaded = true;
    fetch('/api/settings', { credentials: 'same-origin' }).then(async (r) => ({ status: r.status, d: await r.json().catch(() => ({})) })).then(({ status, d }) => {
      if (status === 503) { fbMsg('Хадгалах сан (Upstash Redis) холбогдоогүй байна.', 'err'); return; }
      if (status !== 200) { fbMsg('Тохиргоог ачаалж чадсангүй.', 'err'); cfgLoaded = false; return; }
      $('adm-fb-url').value = d.fbUrl || ''; $('adm-fb-text').value = d.fbText || ''; fbPreview();
    }).catch(() => { cfgLoaded = false; fbMsg('Сервертэй холбогдож чадсангүй.', 'err'); });
  }
  $('adm-fb-url').addEventListener('input', fbPreview);
  $('adm-fb-text').addEventListener('input', fbPreview);
  $('adm-fb-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('adm-fb-save'); btn.disabled = true; fbMsg('');
    try {
      const r = await fetch('/api/settings', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'set', fbUrl: $('adm-fb-url').value, fbText: $('adm-fb-text').value }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { $('adm-fb-url').value = d.fbUrl; $('adm-fb-text').value = d.fbText; fbPreview(); fbMsg(d.fbUrl ? 'Хадгалагдлаа ✓' : 'Холбоосыг устгалаа.', 'ok'); }
      else fbMsg(d.error === 'bad_url' ? 'Зөвхөн facebook.com (fb.com, fb.me) холбоос оруулна уу.' : d.error === 'storage_not_configured' ? 'Хадгалах сан (Upstash Redis) холбогдоогүй байна.' : 'Хадгалж чадсангүй.', 'err');
    } catch (err) { fbMsg('Сервертэй холбогдож чадсангүй.', 'err'); }
    btn.disabled = false;
  });
  /* ---------- Ирц ---------- */
  const att = { items: null, ev: '', date: '', q: '', loading: false };
  const ubDay = (iso) => new Date(Date.parse(iso) + 8 * 3600000).toISOString().slice(0, 10); // Улаанбаатарын огноо
  const hm = (iso) => { const d = new Date(iso); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; };
  const osm = (r) => `https://www.openstreetmap.org/?mlat=${r.lat.toFixed(6)}&mlon=${r.lng.toFixed(6)}#map=18/${r.lat.toFixed(6)}/${r.lng.toFixed(6)}`;
  let lightbox = null;
  function showPhoto(r) {
    if (!lightbox) {
      lightbox = el('dialog', 'att-lb');
      lightbox.addEventListener('click', () => lightbox.close());
      document.getElementById('ub').append(lightbox);
    }
    const img = el('img'); img.src = `/api/attendance?photo=${r.id}`; img.alt = `${r.name} — ирцийн зураг`;
    lightbox.replaceChildren(img, el('p', null, `${r.name} · ${r.eventTitle} · ${stamp(r.t)}`));
    lightbox.showModal();
  }
  function loadAtt(force) {
    if (att.loading || (att.items && !force)) return;
    att.loading = true; $('att-sum').textContent = 'Ачаалж байна…';
    fetch('/api/attendance', { credentials: 'same-origin' }).then(async (r) => ({ status: r.status, d: await r.json().catch(() => ({})) })).then(({ status, d }) => {
      att.loading = false;
      if (status === 401) { location.assign('/admin-login?next=/admin%23irts'); return; }
      if (status === 503) { $('att-sum').textContent = 'Ирцийн сан (Upstash Redis) холбогдоогүй байна.'; return; }
      if (status !== 200) { $('att-sum').textContent = 'Ирцийг ачаалж чадсангүй.'; return; }
      att.items = d.items || [];
      const evs = new Map(); att.items.forEach((r) => { const k = r.event === 'general' ? `general|${r.date}` : r.event; if (!evs.has(k)) evs.set(k, `${r.date} · ${r.eventTitle}`); });
      const sel = $('att-ev');
      sel.replaceChildren(new Option('Бүх үйл ажиллагаа', ''), ...[...evs.entries()].sort((a, b) => b[1].localeCompare(a[1])).map(([k, v]) => new Option(v, k)));
      sel.value = evs.has(att.ev) ? att.ev : (att.ev = '');
      attKpis(); renderAtt();
    }).catch(() => { att.loading = false; $('att-sum').textContent = 'Сервертэй холбогдож чадсангүй.'; });
  }
  function attFiltered() {
    const q = att.q.trim().toLowerCase();
    return att.items.filter((r) => (!att.ev || (r.event === 'general' ? `general|${r.date}` : r.event) === att.ev)
      && (!att.date || r.date === att.date) && (!q || `${r.name} ${r.code} ${r.place}`.toLowerCase().includes(q)));
  }
  function attKpis() {
    const today = ubDay(new Date().toISOString());
    const its = att.items;
    const items = [['Өнөөдөр', its.filter((r) => r.date === today).length, 'ирц', true], ['Нийт ирц', its.length, 'бүртгэл'],
      ['Оролцсон гишүүн', new Set(its.map((r) => r.code)).size, 'хүн'], ['Үйл ажиллагаа', new Set(its.map((r) => (r.event === 'general' ? `g${r.date}` : r.event))).size, 'удаа']];
    $('att-kpis').replaceChildren(...items.map(([l, v, u, brand]) => { const k = el('div', `adm-kpi${brand ? ' is-brand' : ''}`); k.append(el('span', 'adm-kpi-l', l), el('b', 'adm-kpi-v', int(v)), el('span', 'adm-kpi-u', u)); return k; }));
  }
  function attCard(r) {
    const c = el('article', 'att-card');
    const ph = el('button', 'att-photo'); ph.type = 'button'; ph.title = 'Томоор харах';
    const img = el('img'); img.loading = 'lazy'; img.src = `/api/attendance?photo=${r.id}`; img.alt = `${r.name} — ирцийн зураг`;
    ph.append(img); ph.addEventListener('click', () => showPhoto(r));
    const body = el('div', 'att-body');
    const nm = el('div', 'att-name'); nm.append(el('b', null, r.name), el('span', `adm-badge${r.kind === 'registrant' ? ' is-reg' : ''}`, r.kind === 'member' ? 'Гишүүн' : 'Бүртгүүлэгч'));
    body.append(nm, el('p', 'att-meta', [r.place, r.code].filter(Boolean).join(' · ')));
    const ev = el('p', 'att-ev'); ev.append(el('b', null, r.eventTitle), document.createTextNode(` · ${r.date} ${hm(r.t)}`)); body.append(ev);
    if (window.UBMiniMap) body.append(window.UBMiniMap(r.lat, r.lng, r.acc, { w: 340, h: 120 }));
    const loc = el('p', `att-loc${r.acc > 150 ? ' is-warn' : ''}`);
    const a = el('a', null, 'Газрын зураг ↗'); a.href = osm(r); a.target = '_blank'; a.rel = 'noopener noreferrer';
    loc.append(document.createTextNode(`±${int(Math.round(r.acc || 0))} м · `), a); body.append(loc);
    if (r.shot && Math.abs(Date.parse(r.t) - Date.parse(r.shot)) > 15 * 60000) body.append(el('p', 'att-flag', `⚠ Зураг ${stamp(r.shot)}-д авсан`));
    const del = el('button', 'att-del', 'Устгах'); del.type = 'button';
    del.addEventListener('click', async () => {
      if (!del.classList.contains('is-confirm')) { del.classList.add('is-confirm'); del.textContent = 'Устгах уу?'; setTimeout(() => { del.classList.remove('is-confirm'); del.textContent = 'Устгах'; }, 3000); return; }
      del.disabled = true;
      const res = await fetch('/api/attendance', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', id: r.id }) }).catch(() => null);
      if (res && res.ok) { att.items = att.items.filter((x) => x.id !== r.id); attKpis(); renderAtt(); } else { del.disabled = false; del.textContent = 'Алдаа — дахин'; }
    });
    body.append(del);
    c.append(ph, body);
    return c;
  }
  function renderAtt() {
    const list = attFiltered();
    const any = att.ev || att.date || att.q;
    $('att-reset').hidden = !any;
    $('att-xl').disabled = !list.length;
    $('att-sum').textContent = `${int(list.length)} ирц${any ? ` (нийт ${int(att.items.length)})` : ''} · зураг дээр дарж томоор харна`;
    const grid = $('att-grid');
    if (!list.length) { grid.replaceChildren(el('p', 'adm-empty', att.items.length ? 'Шүүлтэд тохирох ирц алга.' : 'Одоогоор ирц бүртгэгдээгүй байна. Гишүүд дашбоардын «Ирц бүртгүүлэх» товчоор бүртгүүлнэ.')); return; }
    grid.replaceChildren(...list.map(attCard));
  }
  function exportAtt() {
    if (!window.UBXlsx) { alert('Хуудсыг Ctrl+F5-аар шинэчилнэ үү.'); return; }
    const list = attFiltered().slice().sort((a, b) => String(a.t).localeCompare(String(b.t)));
    const HEAD = ['№', 'Огноо', 'Цаг', 'Үйл ажиллагаа', 'Нэр', 'Төрөл', 'Код', 'Хороо/хаяг', 'Өргөрөг', 'Уртраг', 'Нарийвчлал (м)', 'Газрын зураг', 'Зураг авсан'];
    const WIDTH = [5, 12, 8, 30, 26, 12, 14, 26, 11, 11, 12, 40, 17];
    const rows = list.map((r, i) => [i + 1, r.date, hm(r.t), r.eventTitle, r.name, r.kind === 'member' ? 'Намын гишүүн' : 'Бүртгүүлэгч', r.code, r.place, r.lat, r.lng, Math.round(r.acc || 0), osm(r), r.shot ? stamp(r.shot) : '']);
    window.UBXlsx.download(`irts_${new Date().toISOString().slice(0, 10)}.xlsx`, 'Ирц', HEAD, rows, WIDTH);
  }
  $('att-ev').addEventListener('change', (e) => { att.ev = e.target.value; renderAtt(); });
  $('att-date').addEventListener('change', (e) => { att.date = e.target.value; renderAtt(); });
  $('att-q').addEventListener('input', (e) => { att.q = e.target.value; renderAtt(); });
  $('att-reset').addEventListener('click', () => { att.ev = att.date = att.q = ''; $('att-ev').value = ''; $('att-date').value = ''; $('att-q').value = ''; renderAtt(); });
  $('att-refresh').addEventListener('click', () => loadAtt(true));
  $('att-xl').addEventListener('click', exportAtt);

  /* ---------- Нэвтрэх эрх ---------- */
  const cr = { items: null, q: '', kind: '', has: '', show: false, loading: false, limit: PAGE };
  function credFetch(force) {
    if (cr.loading || (cr.items && !force)) return Promise.resolve();
    cr.loading = true; $('cred-sum').textContent = 'Ачаалж байна…';
    return fetch('/api/credentials', { credentials: 'same-origin' }).then(async (r) => ({ status: r.status, d: await r.json().catch(() => ({})) })).then(({ status, d }) => {
      cr.loading = false;
      if (status === 401) { location.assign('/admin-login?next=/admin%23erh'); return; }
      if (status === 503) { $('cred-sum').textContent = d.error === 'not_configured' ? 'MEMBERS_KEY тохируулагдаагүй байна.' : 'Хадгалах сан (Upstash Redis) холбогдоогүй байна.'; return; }
      if (status !== 200) { $('cred-sum').textContent = 'Ачаалж чадсангүй.'; return; }
      cr.items = d.items || []; credKpis(); renderCred();
    }).catch(() => { cr.loading = false; $('cred-sum').textContent = 'Сервертэй холбогдож чадсангүй.'; });
  }
  const loadCred = () => credFetch(false);
  function credKpis() {
    const its = cr.items, has = its.filter((x) => x.username).length;
    const items = [['Нийт хүн', its.length, 'хүн'], ['Эрхтэй', has, 'хүн', true], ['Эрхгүй', its.length - has, 'хүн'], ['Намын гишүүн', its.filter((x) => x.kind === 'member').length, 'хүн']];
    $('cred-kpis').replaceChildren(...items.map(([l, v, u, brand]) => { const k = el('div', `adm-kpi${brand ? ' is-brand' : ''}`); k.append(el('span', 'adm-kpi-l', l), el('b', 'adm-kpi-v', int(v)), el('span', 'adm-kpi-u', u)); return k; }));
    const missing = its.length - has;
    $('cred-gen').disabled = !missing; $('cred-gen').textContent = missing ? `Эрхгүй бүх хүнд үүсгэх (${int(missing)})` : 'Бүх хүн эрхтэй';
  }
  function credFiltered() {
    const q = cr.q.trim().toLowerCase();
    return cr.items.filter((x) => (!cr.kind || x.kind === cr.kind) && (!cr.has || (cr.has === 'yes') === !!x.username)
      && (!q || `${x.name} ${x.username} ${x.place} ${x.code}`.toLowerCase().includes(q)));
  }
  function copyBtn(text) {
    const b = el('button', 'cred-copy', 'Хуулах'); b.type = 'button';
    b.addEventListener('click', () => { const done = () => { b.textContent = '✓'; setTimeout(() => { b.textContent = 'Хуулах'; }, 1200); };
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, () => {}); });
    return b;
  }
  async function credPost(body) {
    const r = await fetch('/api/credentials', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || String(r.status));
    return d;
  }
  function renderCred() {
    const list = credFiltered();
    $('cred-xl').disabled = !list.some((x) => x.username);
    $('cred-sum').textContent = `${int(list.length)} хүн${list.length !== cr.items.length ? ` (нийт ${int(cr.items.length)})` : ''}`;
    const body = $('cred-body');
    if (!list.length) { body.replaceChildren(el('p', 'adm-empty', 'Шүүлтэд тохирох хүн алга.')); return; }
    const wrap = el('div', 'ub-tablewrap adm-wrap');
    const t = el('table', 'ub-table adm-table cred-table');
    const tr = el('tr');
    [['№', 'n'], ['Нэр'], ['Төрөл'], ['Хороо / хаяг'], ['Нэвтрэх нэр'], ['Нууц үг'], ['Үүсгэсэн'], ['']].forEach(([h, c]) => { const th = el('th', c || null, h); th.scope = 'col'; tr.append(th); });
    const thead = el('thead'); thead.append(tr);
    const tb = el('tbody');
    list.slice(0, cr.limit).forEach((x, i) => {
      const row = el('tr');
      const kind = el('td'); kind.append(el('span', `adm-badge${x.kind === 'registrant' ? ' is-reg' : ''}`, x.kind === 'member' ? 'Гишүүн' : 'Бүртгүүлэгч'));
      const u = el('td', 'cred-u'), pw = el('td', 'cred-pw'), act = el('td', 'cred-act');
      if (x.username) {
        u.append(el('code', null, x.username), copyBtn(x.username));
        pw.append(el('code', null, cr.show ? x.password : '••••••••'), copyBtn(x.password));
        const rb = el('button', 'cred-btn', 'Нууц үг шинэчлэх'); rb.type = 'button';
        rb.addEventListener('click', async () => {
          if (!rb.classList.contains('is-confirm')) { rb.classList.add('is-confirm'); rb.textContent = 'Шинэчлэх үү?'; setTimeout(() => { rb.classList.remove('is-confirm'); rb.textContent = 'Нууц үг шинэчлэх'; }, 3000); return; }
          rb.disabled = true;
          try { const d = await credPost({ action: 'reset', code: x.code }); x.password = d.password; x.t = new Date().toISOString(); renderCred(); }
          catch (e) { rb.disabled = false; rb.textContent = 'Алдаа — дахин'; }
        });
        act.append(rb);
      } else {
        u.append(el('span', 'adm-muted', '—')); pw.append(el('span', 'adm-muted', '—'));
        const gb = el('button', 'cred-btn is-brand', 'Эрх үүсгэх'); gb.type = 'button';
        gb.addEventListener('click', async () => { gb.disabled = true; try { await credPost({ action: 'generate', codes: [x.code] }); cr.items = null; await credFetch(true); } catch (e) { gb.disabled = false; gb.textContent = 'Алдаа — дахин'; } });
        act.append(gb);
      }
      row.append(el('td', 'n', String(i + 1)), el('td', 'adm-name', x.name), kind, el('td', null, x.place || '—'), u, pw, el('td', 'adm-date', x.t ? stamp(x.t) : '—'), act);
      tb.append(row);
    });
    t.append(thead, tb); wrap.append(t);
    const out = [wrap];
    if (list.length > cr.limit) { const more = el('button', 'ann-all', `Дахиад харуулах (${int(list.length - cr.limit)} үлдсэн)`); more.type = 'button'; more.addEventListener('click', () => { cr.limit += PAGE; renderCred(); }); out.push(more); }
    body.replaceChildren(...out);
  }
  $('cred-q').addEventListener('input', (e) => { cr.q = e.target.value; cr.limit = PAGE; if (cr.items) renderCred(); });
  $('cred-kind').addEventListener('change', (e) => { cr.kind = e.target.value; cr.limit = PAGE; if (cr.items) renderCred(); });
  $('cred-has').addEventListener('change', (e) => { cr.has = e.target.value; cr.limit = PAGE; if (cr.items) renderCred(); });
  $('cred-show').addEventListener('click', (e) => { cr.show = !cr.show; e.currentTarget.setAttribute('aria-pressed', String(cr.show)); e.currentTarget.textContent = cr.show ? '🙈 Нууц үг нуух' : '👁 Нууц үг харуулах'; if (cr.items) renderCred(); });
  $('cred-gen').addEventListener('click', async (e) => {
    const b = e.currentTarget;
    if (!b.classList.contains('is-confirm')) { b.classList.add('is-confirm'); b.textContent = 'Үүсгэх үү? Дахин дарна уу'; setTimeout(() => { b.classList.remove('is-confirm'); credKpis(); }, 3500); return; }
    b.classList.remove('is-confirm'); b.disabled = true; b.textContent = 'Үүсгэж байна…';
    try { const d = await credPost({ action: 'generate' }); cr.items = null; await credFetch(true); $('cred-sum').textContent += ` · ${int(d.made)} хүнд шинээр эрх үүслээ`; }
    catch (err) { b.disabled = false; b.textContent = 'Алдаа — дахин оролдох'; }
  });
  $('cred-xl').addEventListener('click', () => {
    if (!window.UBXlsx) { alert('Хуудсыг Ctrl+F5-аар шинэчилнэ үү.'); return; }
    const list = credFiltered().filter((x) => x.username);
    const HEAD = ['№', 'Нэр', 'Төрөл', 'Хороо / хаяг', 'Нэвтрэх нэр', 'Нууц үг', 'Нэвтрэх хаяг', 'Үүсгэсэн'];
    const WIDTH = [5, 28, 13, 26, 18, 12, 32, 17];
    const url = `${location.origin}/login`;
    window.UBXlsx.download(`nevtrekh_erkh_${new Date().toISOString().slice(0, 10)}.xlsx`, 'Нэвтрэх эрх', HEAD,
      list.map((x, i) => [i + 1, x.name, x.kind === 'member' ? 'Намын гишүүн' : 'Бүртгүүлэгч', x.place, x.username, x.password, url, x.t ? stamp(x.t) : '']), WIDTH);
  });

  show(startTab, false);

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

  /* Нийт урилгын мод: үндэс = урьсан намын гишүүд (эсвэл системд олдоогүй код); бүртгүүлэгчийн урьсан хүмүүс тэдний доор */
  function openAllTree() {
    if (!window.UBTree) { alert('Хуудсыг Ctrl+F5-аар шинэчилнэ үү.'); return; }
    const roots = new Map();
    rows.forEach((r) => { if (r.inv.kind !== 'reg' && !roots.has(r.invCode)) roots.set(r.invCode, r.inv); });
    const children = [...roots.entries()].map(([code, inv]) => ({ n: inv.name || `Тодорхойгүй (${fmtCode(code)})`, k: inv.kind === 'member' ? 'Намын гишүүн' : 'Тодорхойгүй код', children: treeOf(code) }));
    window.UBTree.open({ name: 'Бүх гишүүд', sub: `Намын гишүүдийн урилгаар бүртгүүлсэн бүх хүн, тэдний урьсан хүмүүс · ${int(rows.length)} бүртгүүлэгч`, children, offset: 1 });
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
  $('adm-alltree').addEventListener('click', openAllTree);

  fetch('/api/registrations', { credentials: 'same-origin' })
    .then(async (r) => ({ status: r.status, d: await r.json().catch(() => ({})) }))
    .then(({ status, d }) => {
      if (status === 401) { location.assign('/login?next=/admin'); return; }
      if (status === 503) { $('adm-sum').textContent = 'Бүртгэлийн сан (Upstash Redis) холбогдоогүй байна.'; return; }
      if (status !== 200) { $('adm-sum').textContent = 'Өгөгдлийг ачаалж чадсангүй. Хуудсыг дахин ачаална уу.'; return; }
      rows = prepare(d.rows || []);
      kpis(); fillPlaces(); render();
      $('adm-alltree').disabled = !rows.length;
    })
    .catch(() => { $('adm-sum').textContent = 'Сервертэй холбогдож чадсангүй.'; });
})();
