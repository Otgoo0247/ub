/*
 * registrations.js — «Урилгаар бүртгүүлсэн хүмүүс» хүснэгт (зөвхөн нэвтэрсэн хэрэглэгчид).
 * /api/registrations-ээс авна. Дүүрэг/хороо сонгоход бүртгүүлэгчийн хаягаар шүүнэ. CSV татах боломжтой.
 */
(function () {
  'use strict';
  const box = document.getElementById('ub-reg-box');
  if (!box || !window.dash) return;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const note = (t) => el('p', 'ub-note', t);
  let data = null, query = '';

  const addrText = (a) => (!a ? '—' : a.type === 'city' ? `${a.city || 'Улаанбаатар'}, ${a.district}, ${a.khoroo}` : `${a.aimag} аймаг, ${a.soum} сум`);
  const when = (iso) => { const d = new Date(iso); return Number.isNaN(+d) ? '—' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const khName = (code) => { const s = dash.data('khoroo'); const r = (s && s.status === 'ok' ? s.data : []).find((x) => x.code === code); return r ? r.khoroo : null; };

  function scoped() {
    const p = dash.params(), kh = p.khoroo ? khName(p.khoroo) : null;
    const q = query.trim().toLowerCase();
    return data.rows.filter((r) => {
      if (p.district && !(r.addr && r.addr.type === 'city' && r.addr.district === p.district)) return false;
      if (kh && r.addr.khoroo !== kh) return false;
      if (q && !`${r.last} ${r.first} ${r.phone} ${r.inviter || ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }

  function csv(rows) {
    const esc = (v) => { const s = String(v == null ? '' : v); return /[",\n;]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"` : s; };
    const head = ['Огноо', 'Овог', 'Нэр', 'Утас', 'Хаягийн төрөл', 'Хот/аймаг', 'Дүүрэг/сум', 'Хороо', 'Урилгын код', 'Урьсан гишүүн', 'Урьсан гишүүний хороо'];
    const lines = rows.map((r) => [when(r.t), r.last, r.first, r.phone, r.addr.type === 'city' ? 'Хот' : 'Аймаг',
      r.addr.type === 'city' ? r.addr.city : r.addr.aimag, r.addr.type === 'city' ? r.addr.district : r.addr.soum, r.addr.khoroo || '', r.invite, r.inviter || '', r.inviterPlace || ''].map(esc).join(','));
    const blob = new Blob(['﻿' + [head.join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = el('a'); a.href = URL.createObjectURL(blob); a.download = `urilgaar-burtguulsen-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function render() {
    if (!data) return;
    const rows = scoped();
    const head = el('div', 'ub-names-head');
    const p = dash.params();
    const scope = p.khoroo ? `${p.district}, ${khName(p.khoroo) || ''}` : p.district ? `${p.district} дүүрэг` : 'Бүх хаяг';
    head.append(el('span', 'ub-names-count', `${scope}: ${rows.length.toLocaleString('en-US')} / нийт ${data.total.toLocaleString('en-US')}`));
    const tools = el('div', 'ub-reg-tools');
    const s = el('input', 'ub-names-q'); s.type = 'search'; s.placeholder = 'Нэр, утас, урьсан гишүүн'; s.value = query; s.setAttribute('aria-label', 'Бүртгүүлэгч хайх');
    s.addEventListener('input', () => { query = s.value; const pos = s.selectionStart; render(); const n = box.querySelector('.ub-names-q'); n.focus(); n.setSelectionRange(pos, pos); });
    const dl = el('button', 'ub-btn-ghost ub-reg-csv', 'CSV татах'); dl.type = 'button'; dl.disabled = !rows.length; dl.addEventListener('click', () => csv(rows));
    tools.append(s, dl); head.append(tools);
    if (!rows.length) { box.replaceChildren(head, note(data.total ? 'Энэ хүрээнд бүртгүүлсэн хүн алга.' : 'Одоогоор урилгаар бүртгүүлсэн хүн алга. Гишүүний нэр дээр дарж урилгын холбоосыг илгээнэ үү.')); return; }
    const wrap = el('div', 'ub-tablewrap ub-reg-wrap');
    const t = el('table', 'ub-table ub-reg-table');
    const tr = el('tr'); ['Огноо', 'Овог нэр', 'Утас', 'Хаяг', 'Урьсан гишүүн'].forEach((x) => { const th = el('th', null, x); th.scope = 'col'; tr.append(th); });
    const thead = el('thead'); thead.append(tr);
    const tb = el('tbody');
    rows.forEach((r) => {
      const row = el('tr');
      row.append(el('td', 'ub-reg-when', when(r.t)), el('td', 'ub-reg-name', `${r.last} ${r.first}`));
      const ph = el('td'); const a = el('a', null, r.phone); a.href = `tel:${r.phone}`; ph.append(a); row.append(ph);
      row.append(el('td', null, addrText(r.addr)));
      const inv = el('td'); inv.append(el('span', null, r.inviter || '—'), el('small', 'ub-reg-code', r.invite)); row.append(inv);
      tb.append(row);
    });
    t.append(thead, tb); wrap.append(t); box.replaceChildren(head, wrap);
  }

  fetch('/api/registrations', { credentials: 'same-origin' })
    .then(async (r) => ({ status: r.status, d: await r.json().catch(() => ({})) }))
    .then(({ status, d }) => {
      if (status === 200) { data = d; render(); dash.onData(render); return; }
      if (status === 401) return;
      box.replaceChildren(note(status === 503
        ? 'Бүртгэлийн сан холбогдоогүй байна: Vercel → Storage → Upstash for Redis-ийг энэ төсөлд холбоод Redeploy хийнэ үү (README «Урилгаар бүртгүүлэх»).'
        : 'Бүртгэлийг ачаалж чадсангүй.'));
    })
    .catch(() => box.replaceChildren(note('Сервертэй холбогдож чадсангүй.')));
})();
