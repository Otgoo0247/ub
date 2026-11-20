/*
 * ann.js — үйл ажиллагааны зарлалыг харуулах (дашбоардын «Гишүүний мэдээлэл» цонх, гишүүний /me хуудас).
 * window.UBAnn = { load(force) → Promise<{items, storage}|null>, section(data, opts) → HTMLElement, invalidate() }
 */
(function () {
  'use strict';
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const MONTH = ['1-р сар', '2-р сар', '3-р сар', '4-р сар', '5-р сар', '6-р сар', '7-р сар', '8-р сар', '9-р сар', '10-р сар', '11-р сар', '12-р сар'];
  const SHOW = 3;          // эхэндээ харуулах тоо
  const LONG = 220;        // үүнээс урт агуулгыг хураана
  const NEW_DAYS = 3;      // «Шинэ» тэмдэг
  let cached = null, at = 0;

  function load(force) {
    if (!force && cached && Date.now() - at < 60000) return cached;
    at = Date.now();
    cached = fetch('/api/announcements', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((d) => { if (!d) cached = null; return d; });
    return cached;
  }
  const invalidate = () => { cached = null; };

  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  function card(a) {
    const past = a.date && a.date < today();
    const li = el('li', `ann-item${past ? ' is-past' : ''}`);
    const badge = el('div', 'ann-date');
    if (a.date) {
      const [, m, d] = a.date.split('-').map(Number);
      badge.append(el('b', null, String(d)), el('span', null, MONTH[m - 1]));
    } else {
      badge.classList.add('is-icon');
      badge.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1Zm12-3a5 5 0 0 1 0 8m3-11a9 9 0 0 1 0 14"/></svg>';
    }
    const main = el('div', 'ann-main');
    const tr = el('div', 'ann-titlerow');
    tr.append(el('h4', 'ann-title', a.title));
    if (past) tr.append(el('span', 'ann-tag is-past', 'Болж өнгөрсөн'));
    else if (a.t && Date.now() - Date.parse(a.t) < NEW_DAYS * 86400000) tr.append(el('span', 'ann-tag', 'Шинэ'));
    main.append(tr);
    const meta = [a.date, a.time, a.place].filter(Boolean);
    if (meta.length) main.append(el('p', 'ann-meta', meta.join(' · ')));
    const body = el('p', 'ann-body', a.body);
    main.append(body);
    if (a.body && a.body.length > LONG) {
      body.classList.add('is-clamped');
      const more = el('button', 'ann-more', 'Дэлгэрэнгүй'); more.type = 'button';
      more.addEventListener('click', () => { const c = body.classList.toggle('is-clamped'); more.textContent = c ? 'Дэлгэрэнгүй' : 'Хураах'; });
      main.append(more);
    }
    li.append(badge, main);
    return li;
  }

  /* opts: { cls: нэмэлт класс, heading: гарчиг, empty: хоосон үеийн текст (null бол хэсгийг нуух) } */
  function section(data, opts) {
    const o = opts || {};
    const items = (data && data.items) || [];
    const sec = el('section', `ann${o.cls ? ` ${o.cls}` : ''}`);
    const head = el('div', 'ann-head');
    head.append(el('h3', 'ann-h', o.heading || 'Үйл ажиллагааны зарлал'));
    if (items.length) head.append(el('span', 'ann-count', String(items.length)));
    sec.append(head);
    if (!data) { sec.append(el('p', 'ann-empty', 'Зарлалыг ачаалж чадсангүй.')); return sec; }
    if (!items.length) {
      if (o.empty === null) { sec.hidden = true; return sec; }
      sec.append(el('p', 'ann-empty', o.empty || 'Одоогоор зарлал алга.'));
      return sec;
    }
    const ul = el('ul', 'ann-list');
    items.forEach((a, i) => { const li = card(a); if (i >= SHOW) li.hidden = true; ul.append(li); });
    sec.append(ul);
    if (items.length > SHOW) {
      const all = el('button', 'ann-all', `Бүгдийг харах (${items.length})`); all.type = 'button';
      all.addEventListener('click', () => {
        const open = all.dataset.open !== '1';
        ul.querySelectorAll('.ann-item').forEach((li, i) => { li.hidden = !open && i >= SHOW; });
        all.dataset.open = open ? '1' : '0';
        all.textContent = open ? 'Цөөнийг харуулах' : `Бүгдийг харах (${items.length})`;
      });
      sec.append(all);
    }
    return sec;
  }

  window.UBAnn = { load, section, invalidate, card };
})();
