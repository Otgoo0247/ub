/*
 * tree.js — «Урилгын мод»: гишүүн → түүний урилгаар бүртгүүлсэн хүмүүс → тэдний урьсан хүмүүс …
 * Зүүнээс баруун тийш үе үеэрээ урсах салаа (Sankey маягийн): салааны зузаан = тэр хүнээс доош хэдэн хүн байгаа,
 * өнгө = үе (1-р үе улаан, 2-р үе цэнхэр, 3-р үе ногоон, 4-р үе шар, 5+ саарал). d3 v7 шаардана.
 * window.UBTree.open({ name, sub, children: [{ n, t, children: [...] }], offset? })
 *   offset: 1 — нийт мод (админ): 1-р түвшин нь урьсан гишүүд (үе тоологдохгүй), 2-р түвшнээс 1-р үе эхэлнэ.
 */
(function () {
  'use strict';
  if (!window.d3) return;
  const d3 = window.d3;
  const GEN = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)'];
  const genColor = (depth) => GEN[depth - 1] || 'var(--ubt-gen5, #8A8F98)';
  const fmt = (v) => Number(v).toLocaleString('en-US');
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  let dlg = null;

  function shell() {
    if (dlg) return dlg;
    dlg = el('dialog', 'ubt'); dlg.setAttribute('aria-labelledby', 'ubt-t');
    const head = el('header', 'ubt-head');
    const hw = el('div');
    const t = el('h2', 'ubt-t'); t.id = 'ubt-t';
    hw.append(el('p', 'ubt-eyebrow', 'Урилгын мод'), t, el('p', 'ubt-sub'));
    const x = el('button', 'ubt-x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Хаах'); x.addEventListener('click', () => dlg.close());
    head.append(hw, x);
    const stats = el('div', 'ubt-stats');
    const legend = el('div', 'ubt-legend');
    const stage = el('div', 'ubt-stage');
    const zoom = el('div', 'ubt-zoom');
    [['+', 'Томруулах', 1.3], ['−', 'Жижигрүүлэх', 1 / 1.3], ['⤢', 'Бүтнээр харах', 0]].forEach(([s, l, k]) => {
      const b = el('button', null, s); b.type = 'button'; b.title = l; b.setAttribute('aria-label', l); b.dataset.k = k; zoom.append(b);
    });
    stage.append(zoom);
    dlg.append(head, stats, legend, stage);
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    (document.getElementById('ub') || document.body).append(dlg);
    return dlg;
  }

  function open(data) {
    const p = shell();
    p.querySelector('.ubt-t').textContent = data.name;
    p.querySelector('.ubt-sub').textContent = data.sub || '';
    if (!p.open) p.showModal();
    draw(p, data);
  }

  function draw(p, data) {
    const root = d3.hierarchy({ n: data.name, children: data.children || [] });
    root.each((d) => { d.size = d.descendants().length - 1; }); // тэр хүнээс доош хэдэн хүн
    root.sort((a, b) => b.size - a.size || String(a.data.t || '').localeCompare(String(b.data.t || '')));
    const off = data.offset || 0;
    const gc = (depth) => (depth <= off ? 'var(--ubt-member, #3A3F48)' : genColor(depth - off));
    const total = root.size, direct = (root.children || []).length, gens = Math.max(0, root.height - off);
    const people = off ? total - direct : total;

    const stats = p.querySelector('.ubt-stats');
    stats.replaceChildren();
    (off ? [['Урьсан гишүүн', direct], ['Нийт бүртгүүлэгч', people], ['Үе', gens]] : [['Шууд урьсан', direct], ['Нийт доор нь', total], ['Үе', gens]]).forEach(([l, v]) => {
      const d = el('div', 'ubt-stat'); d.append(el('span', null, l), el('b', null, fmt(v))); stats.append(d);
    });
    const legend = p.querySelector('.ubt-legend');
    legend.replaceChildren();
    for (let g = 1; g <= Math.min(Math.max(gens, 1), 5); g += 1) {
      const k = el('span', 'ubt-key'); const i = el('i'); i.style.background = genColor(g);
      k.append(i, document.createTextNode(g === 5 && gens > 5 ? '5+ үе' : `${g}-р үе`)); legend.append(k);
    }
    if (off) { const k = el('span', 'ubt-key'); const i = el('i'); i.style.background = 'var(--ubt-member, #3A3F48)'; k.append(i, document.createTextNode('Урьсан гишүүн')); legend.prepend(k); }
    legend.hidden = !total;

    const stage = p.querySelector('.ubt-stage');
    stage.querySelectorAll('svg, .ubt-empty, .ubt-tip').forEach((n) => n.remove());
    p.querySelector('.ubt-zoom').hidden = !total;
    if (!total) {
      stage.append(el('p', 'ubt-empty', 'Одоогоор энэ урилгаар бүртгүүлсэн хүн алга. Урилгын холбоосоор бүртгүүлсэн хүмүүс энд мод хэлбэрээр харагдана.'));
      return;
    }

    /* ---- Байрлал: үе бүр нэг багана, мөр бүр нэг хүн ---- */
    const COL = 250, ROW = 46;
    d3.tree().nodeSize([ROW, COL]).separation((a, b) => (a.parent === b.parent ? 1 : 1.25))(root);
    const w = d3.scaleSqrt().domain([1, Math.max(1, total + 1)]).range([3, Math.min(26, 6 + total * 0.6)]);
    root.each((d) => { d.w = d.depth === 0 ? w(total + 1) : w(d.size + 1); });

    // Эцгээс гарах салаануудыг Sankey шиг давхарлан эхлүүлнэ
    root.each((d) => {
      if (!d.children) return;
      const sum = d3.sum(d.children, (c) => c.w);
      let y = d.x - sum / 2;
      d.children.forEach((c) => { c.sy = y + c.w / 2; y += c.w; });
      d.band = sum;
    });

    const svg = d3.select(stage).append('svg').attr('class', 'ubt-svg').attr('role', 'img')
      .attr('aria-label', `${data.name}: ${direct} хүн шууд, нийт ${total} хүн ${gens} үеэр бүртгүүлсэн урилгын мод`);
    const g = svg.append('g');
    const tip = d3.select(stage).append('div').attr('class', 'ubt-tip').attr('hidden', true);

    const link = (s, t) => { const mx = (s[0] + t[0]) / 2; return `M${s[0]},${s[1]} C${mx},${s[1]} ${mx},${t[1]} ${t[0]},${t[1]}`; };
    const BAR = 10; // зангилааны баганы өргөн
    g.append('g').attr('class', 'ubt-links').selectAll('path').data(root.descendants().filter((d) => d.parent)).join('path')
      .attr('d', (d) => link([d.parent.y + BAR, d.sy], [d.y, d.x]))
      .attr('stroke', (d) => gc(d.depth)).attr('stroke-width', (d) => d.w);

    const node = g.append('g').attr('class', 'ubt-nodes').selectAll('g').data(root.descendants()).join('g')
      .attr('class', (d) => `ubt-node${d.depth === 0 ? ' is-root' : ''}`).attr('transform', (d) => `translate(${d.y},${d.x})`);
    node.append('rect').attr('class', 'ubt-bar')
      .attr('x', 0).attr('width', BAR).attr('rx', 3)
      .attr('y', (d) => -Math.max(d.w, d.band || 0, 8) / 2).attr('height', (d) => Math.max(d.w, d.band || 0, 8))
      .attr('fill', (d) => (d.depth === 0 ? 'var(--color-fg)' : gc(d.depth)));
    // Тоо (доор нь хэдэн хүн) + нэр
    // Навч: нэр баруун талд. Доороо хүнтэй: тоо + нэр зүүн дээд талд (гарах салаанд дарагдахгүй)
    const half = (d) => Math.max(d.w, d.band || 0, 8) / 2;
    node.filter((d) => d.depth > 0 && !d.children).append('text').attr('class', 'ubt-name')
      .attr('x', BAR + 8).attr('y', 4).text((d) => d.data.n);
    const inner = node.filter((d) => d.depth > 0 && d.children);
    inner.append('text').attr('class', 'ubt-name').attr('text-anchor', 'end').attr('x', -6).attr('y', (d) => -half(d) - 6).text((d) => d.data.n);
    inner.append('text').attr('class', 'ubt-num').attr('text-anchor', 'end').attr('x', -6).attr('y', (d) => -half(d) - 22).text((d) => fmt(d.size));
    const rl = node.filter((d) => d.depth === 0);
    rl.append('text').attr('class', 'ubt-rootnum').attr('x', -10).attr('y', 4).attr('text-anchor', 'end').text(fmt(people));
    rl.append('text').attr('class', 'ubt-rootname').attr('x', -10).attr('y', 24).attr('text-anchor', 'end').text(data.name);

    node.on('pointermove', (e, d) => {
      const t = tip.node(); t.replaceChildren(el('b', null, d.depth === 0 ? data.name : d.data.n));
      const rows = d.depth === 0 ? (off ? [['Урьсан гишүүн', fmt(direct)], ['Нийт бүртгүүлэгч', fmt(people)]] : [['Шууд урьсан', fmt(direct)], ['Нийт доор нь', fmt(total)]])
        : d.depth <= off ? [['Төрөл', d.data.k || 'Урьсан хүн'], ['Шууд урьсан', fmt((d.children || []).length)], ['Нийт доор нь', fmt(d.size)]]
        : [['Үе', `${d.depth - off}-р үе`], ['Бүртгүүлсэн', d.data.t || '—'], ['Шууд урьсан', fmt((d.children || []).length)], ['Нийт доор нь', fmt(d.size)]];
      rows.forEach(([a, b]) => { const r = el('div'); r.append(el('span', null, a), el('span', null, b)); t.append(r); });
      t.hidden = false;
      const [x, y] = d3.pointer(e, stage); const W = stage.clientWidth;
      t.style.left = `${Math.min(x + 14, W - t.offsetWidth - 8)}px`; t.style.top = `${Math.max(8, y - t.offsetHeight - 10)}px`;
    }).on('pointerleave', () => tip.attr('hidden', true));

    /* ---- Томруулах, чирэх, бүтнээр харах ---- */
    const zb = d3.zoom().scaleExtent([0.15, 3]).on('zoom', (e) => g.attr('transform', e.transform));
    svg.call(zb).on('dblclick.zoom', null);
    const fit = (animate) => {
      const b = g.node().getBBox(), W = stage.clientWidth, H = stage.clientHeight, pad = 32;
      const k = Math.min(1.4, (W - 2 * pad) / b.width, (H - 2 * pad) / b.height);
      const tr = d3.zoomIdentity.translate((W - b.width * k) / 2 - b.x * k, (H - b.height * k) / 2 - b.y * k).scale(k);
      (animate ? svg.transition().duration(350) : svg).call(zb.transform, tr);
    };
    p.querySelectorAll('.ubt-zoom button').forEach((b) => {
      b.onclick = () => { const k = +b.dataset.k; if (!k) fit(true); else svg.transition().duration(250).call(zb.scaleBy, k); };
    });
    requestAnimationFrame(() => fit(false));
  }

  window.UBTree = { open };
})();
