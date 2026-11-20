/* me.js — гишүүний өөрийн хуудас: мэдээлэл, урилгын код/холбоос, өөрийн урилгаар бүртгүүлсэн хүмүүс (/api/me). */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const status = $('me-status');
  const inviteUrl = (code) => `${location.origin}/invite?c=${encodeURIComponent(code)}`;

  function copy(text, btn) {
    const label = btn.textContent;
    const done = () => { btn.textContent = 'Хуулагдлаа ✓'; btn.classList.add('is-done'); setTimeout(() => { btn.textContent = label; btn.classList.remove('is-done'); }, 1600); };
    const fallback = () => { const t = el('textarea'); t.value = text; t.style.cssText = 'position:fixed;opacity:0'; document.body.append(t); t.select(); try { document.execCommand('copy'); done(); } catch (e) { /* */ } t.remove(); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
  }
  const addrText = (a) => (!a ? '—' : a.type === 'city' ? `${a.city || 'Улаанбаатар'}, ${a.district}, ${a.khoroo}` : `${a.aimag} аймаг, ${a.soum} сум`);
  const day = (iso) => String(iso || '').slice(0, 10);

  fetch('/api/me', { credentials: 'same-origin' })
    .then(async (r) => ({ status: r.status, d: await r.json().catch(() => ({})) }))
    .then(({ status: st, d }) => {
      if (st === 401 || (st === 200 && !d.authenticated)) { location.replace('/login?as=member'); return; }
      if (st !== 200) { status.textContent = 'Мэдээллийг ачаалж чадсангүй. Түр хүлээгээд дахин оролдоно уу.'; return; }
      status.hidden = true;
      render(d);
    })
    .catch(() => { status.textContent = 'Сервертэй холбогдож чадсангүй.'; });

  function render(d) {
    const p = d.profile;
    if (new URLSearchParams(location.search).get('welcome') === '1') {
      const w = $('me-welcome'); w.hidden = false;
      w.replaceChildren(el('b', null, '✓ Бүртгэл амжилттай!'), document.createTextNode(' Танд өөрийн урилгын код олгогдлоо — доорх холбоосоор бусдыг урьж болно.'));
      history.replaceState(null, '', '/me');
    }
    $('me-name').textContent = p.name;
    const dl = $('me-dl');
    const item = (k, v) => { const w = el('div'); w.append(el('dt', null, k), el('dd', null, v == null || v === '' ? '—' : String(v))); dl.append(w); };
    if (p.kind === 'member') {
      $('me-sub').textContent = [p.district && `${p.district} дүүрэг`, p.khoroo, p.cell].filter(Boolean).join(' · ');
      item('Нас', p.age); item('Хүйс', p.gender); item('Төлөв', p.status); item('Үүр', p.cell);
      item('Хөдөлгөөн', p.movement); item('Хөдөлгөөний огноо', p.movementDate);
      const w = el('div', 'me-wide'); const dd = el('dd', 'me-bar-row'); const bar = el('span', 'me-bar'); const f = el('i'); f.style.width = `${Math.max(0, Math.min(100, p.anket || 0))}%`; bar.append(f);
      dd.append(bar, el('b', null, p.anket == null ? '—' : `${p.anket}%`)); w.append(el('dt', null, 'Анкет бөглөлт'), dd); dl.append(w);
    } else {
      $('me-sub').textContent = addrText(p.addr);
      item('Төрсөн огноо', p.dob ? `${p.dob} (${p.age} нас)` : null); item('Хүйс', p.gender);
      item('Утас', p.phone); item('Бүртгүүлсэн', day(p.registered));
      item('Хаяг', addrText(p.addr)); item('Урьсан', p.invitedBy);
    }
    // Үйл ажиллагааны зарлал — мэдээллийн доор (ann.js); зарлалгүй бол хэсэг харагдахгүй
    if (window.UBAnn) {
      const slot = el('div'); dl.after(slot);
      window.UBAnn.load().then((data) => { if (data) slot.replaceWith(window.UBAnn.section(data, { cls: 'in-card', empty: null })); });
    }
    $('me-profile').hidden = false;

    $('me-code').textContent = d.code;
    const link = inviteUrl(d.code);
    $('me-link').value = link;
    $('me-link').addEventListener('focus', (e) => e.target.select());
    $('me-copy-code').addEventListener('click', (e) => copy(d.code, e.currentTarget));
    $('me-copy-link').addEventListener('click', (e) => copy(link, e.currentTarget));
    $('me-invite').hidden = false;

    $('me-people-t').textContent = d.storage ? `Миний урилгаар бүртгүүлсэн: ${d.invitees.length} хүн` : 'Миний урилгаар бүртгүүлсэн';
    const tb = $('me-tree');
    if (d.storage && window.UBTree) {
      tb.hidden = false;
      tb.addEventListener('click', () => window.UBTree.open({ name: p.name, sub: 'Миний урилгаар бүртгүүлсэн хүмүүс, тэдний урьсан хүмүүс', children: d.tree || [] }));
    }
    const ul = $('me-list');
    if (!d.storage) ul.replaceWith(el('p', 'me-hint', 'Бүртгэлийн сан одоогоор холбогдоогүй байна.'));
    else if (!d.invitees.length) ul.replaceWith(el('p', 'me-hint', 'Одоогоор таны урилгаар бүртгүүлсэн хүн алга. Дээрх холбоосоо найз нөхөддөө илгээгээрэй.'));
    else d.invitees.forEach((r) => {
      const li = el('li');
      const tel = el('a', null, r.phone); tel.href = `tel:${r.phone}`;
      const meta = [r.gender, r.dob ? `${r.dob} (${r.age} нас)` : null, addrText(r.addr)].filter(Boolean).join(' · ');
      li.append(el('b', null, `${r.last} ${r.first}`), tel, el('time', null, day(r.t)), el('span', 'me-meta', meta + (r.invited ? ` · урьсан: ${r.invited}` : '')));
      ul.append(li);
    });
    $('me-people').hidden = false;

    const out = $('me-logout'); out.hidden = false;
    out.addEventListener('click', () => {
      fetch('/api/me', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{"action":"logout"}' })
        .finally(() => location.replace('/login?as=member'));
    });
  }
})();
