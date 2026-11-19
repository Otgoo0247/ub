(function () {
  'use strict';
  const int = d3.format(',.0f'), dec1 = d3.format(',.1f'), dec2 = d3.format('.2f');
  const safe = (f) => (v) => (v == null || Number.isNaN(v) ? '—' : f(v));
  const FMT = {
    int: safe(int), pct: safe(dec1), dec1: safe(dec1), dec2: safe(dec2),
    area: safe((v) => (v >= 100 ? int(v) : v >= 10 ? dec1(v) : dec2(v))), text: (v) => (v == null ? '—' : String(v)),
  };
  const METRICS = {
    dens: { label: 'Хүн амын нягтрал', unit: 'хүн/км²', fmt: int },
    pop: { label: 'Хүн амын тоо', unit: 'хүн', fmt: int },
    hh: { label: 'Өрхийн тоо', unit: 'өрх', fmt: int },
    hhsize: { label: 'Өрхийн дундаж хэмжээ', unit: 'хүн/өрх', fmt: dec2 },
    members: { label: 'Гишүүдийн тоо', unit: 'гишүүн', fmt: int },
    mem_rate: { label: '10 000 хүнд ногдох гишүүн', unit: 'гишүүн / 10 000 хүн', fmt: dec1 },
    gerpct: { label: 'Гэр хорооллын хүн амын хувь (хилийн файл)', unit: '%', fmt: dec1 },
  };
  const OUTER = new Set(['Налайх', 'Багануур', 'Багахангай']);

  /* Суурь зураг: tile-ийг уншигчийн хөтөч ачаална. Зөвхөн window.UB_CONFIG.basemap идэвхтэй,
     хил Web Mercator (EPSG:3857) проекцтой үед ажиллана. */
  const OSM_ATTR = ['© ', ['OpenStreetMap', 'https://www.openstreetmap.org/copyright'], ' хувь нэмэр оруулагчид'];
  const BASEMAPS = {
    carto: {
      label: 'Цайвар (CARTO)', maxZoom: 20, retina: true, opacity: 0.72,
      url: (z, x, y, dark, r) => `https://${'abcd'[(x + y) % 4]}.basemaps.cartocdn.com/${dark ? 'dark_all' : 'light_all'}/${z}/${x}/${y}${r ? '@2x' : ''}.png`,
      attr: [...OSM_ATTR, ' · © ', ['CARTO', 'https://carto.com/attributions']],
    },
    osm: {
      label: 'OpenStreetMap', maxZoom: 19, opacity: 0.6,
      url: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
      attr: OSM_ATTR,
    },
    sat: {
      label: 'Хиймэл дагуул (Esri)', maxZoom: 19, opacity: 0.55,
      url: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
      attr: ['Зураг © ', ['Esri', 'https://www.esri.com'], ', Maxar, Earthstar Geographics'],
    },
  };
  const WORLD = 40075016.68557849, HALF = WORLD / 2;
  const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
  function basemap() {
    const g = geo();
    if (!(window.UB_CONFIG && window.UB_CONFIG.basemap) || !g || g.crs !== 'EPSG:3857') return null;
    return BASEMAPS[P().base] || null;
  }
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const P = () => ({ district: '', khoroo: '', metric: 'dens', level: 'khoroo', base: 'none', uni: '1', ...dash.params() });
  const M = () => METRICS[P().metric] || METRICS.dens;
  const ok = (id) => { const d = dash.data(id); return d.status === 'ok' && d.data ? d.data : null; };

  /* ---------- Тооцоолол ---------- */
  dash.calc('khoroo_m', {
    title: 'Хорооны үзүүлэлтүүд',
    description: 'Нягтрал, өрхийн хэмжээ, 10 000 хүнд ногдох гишүүн, гэр хорооллын хувийг хороо бүрээр тооцно.',
    inputs: ['khoroo'],
    fn: (khoroo) => khoroo.map((r) => {
      const n = (k) => +r[k];
      return {
        code: r.code, district: r.district, khoroo: r.khoroo, khoroo_no: n('khoroo_no'),
        pop: n('pop'), hh: n('hh'), area_km2: n('area_km2'), members: n('members'), age18_25: n('age18_25'), vote18: n('vote18'),
        shp_pop: n('shp_pop'), shp_ger_pop: n('shp_ger_pop'),
        dens: n('pop') / n('area_km2'), hhsize: n('pop') / n('hh'),
        mem_rate: (1e4 * n('members')) / n('pop'), gerpct: (100 * n('shp_ger_pop')) / n('shp_pop'),
      };
    }),
  });

  dash.calc('district_m', {
    title: 'Дүүргийн үзүүлэлтүүд',
    description: 'Хорооны тоог дүүргээр нэмж, харьцааг нийлбэрээс нь дахин тооцно.',
    inputs: ['khoroo_m'],
    fn: (rows) => Array.from(d3.group(rows || [], (r) => r.district), ([district, list]) => {
      const s = (k) => d3.sum(list, (r) => r[k]);
      return {
        district, khoroo_n: list.length, pop: s('pop'), hh: s('hh'), area_km2: s('area_km2'), members: s('members'), age18_25: s('age18_25'), vote18: s('vote18'),
        dens: s('pop') / s('area_km2'), hhsize: s('pop') / s('hh'), mem_rate: (1e4 * s('members')) / s('pop'),
        gerpct: (100 * s('shp_ger_pop')) / s('shp_pop'), aptpct: 100 - (100 * s('shp_ger_pop')) / s('shp_pop'),
      };
    }),
  });

  dash.calc('summary', {
    title: 'Сонгосон хүрээний дүн',
    description: 'Сонгосон хот, дүүрэг эсвэл хорооны нийлбэр ба харьцаа.',
    inputs: ['khoroo_m'],
    fn: (rows) => {
      const { district = '', khoroo = '' } = dash.params();
      const picked = (rows || []).filter((r) => (!district || r.district === district) && (!khoroo || r.code === khoroo));
      if (!picked.length) return [];
      const s = (k) => d3.sum(picked, (r) => r[k]);
      const top = d3.greatest(picked, (r) => r.dens);
      const scope = khoroo ? `${picked[0].district} дүүрэг, ${picked[0].khoroo}` : district ? `${district} дүүрэг` : 'Улаанбаатар хот';
      return [{
        scope, khoroo_n: picked.length, pop: s('pop'), hh: s('hh'), area_km2: s('area_km2'), members: s('members'),
        age18_25: s('age18_25'), vote18: s('vote18'), y_pct: (100 * s('age18_25')) / s('pop'), vote_pct: (100 * s('vote18')) / s('pop'),
        dens: s('pop') / s('area_km2'), hhsize: s('pop') / s('hh'), mem_rate: (1e4 * s('members')) / s('pop'),
        khoroo_with_members: picked.filter((r) => r.members > 0).length,
        top_name: `${top.district} дүүргийн ${top.khoroo}`, top_dens: top.dens,
      }];
    },
  });

  dash.calc('mem_scope', {
    title: 'Гишүүдийн задаргаа, сонгосон хүрээнд',
    description: 'Сонгосон хороо, дүүрэг эсвэл хотын гишүүдийн хүйс, нас, хөдөлгөөн, анкетын задаргаа. Нууцалсан хүрээнд зөвхөн тоо.',
    inputs: ['members_scope', 'khoroo_m'],
    fn: (scopes, khoroos) => {
      const { district = '', khoroo = '' } = dash.params();
      const k = khoroo ? (khoroos || []).find((r) => r.code === khoroo) : null;
      const key = k ? k.code : district || 'Улаанбаатар';
      const label = k ? `${k.district} дүүрэг, ${k.khoroo}` : district ? `${district} дүүрэг` : 'Улаанбаатар хот';
      const r = (scopes || []).find((x) => x.scope === key);
      if (!r) return [{ scope: label, members: k ? k.members : 0, suppressed: 1 }];
      const n = (f) => (r[f] == null || r[f] === '' ? null : +r[f]);
      const members = n('members');
      return [{
        scope: label, members, suppressed: n('suppressed'),
        male: n('male'), female: n('female'),
        malepct: n('male') == null ? null : (100 * n('male')) / members, femalepct: n('female') == null ? null : (100 * n('female')) / members,
        age_u18: n('age_u18'), age_18_24: n('age_18_24'), age_25_34: n('age_25_34'), age_35_44: n('age_35_44'), age_45p: n('age_45p'), age_unknown: n('age_unknown'),
        mv_new: n('mv_new'), mv_base: n('mv_base'), mv_moved: n('mv_moved'), mv_other: n('mv_other'),
        anket_avg: n('anket_avg'), anket_full: n('anket_full'),
      }];
    },
  });

  /* ---------- Өнгөний ангилал ---------- */
  const CUSTOM = {
    dens: { br: [250, 1000, 5000, 10000, 20000, 35000] },
    gerpct: { br: [0.5, 20, 40, 60, 80, 99.5], labels: ['0', '0.5 – 20', '20 – 40', '40 – 60', '60 – 80', '80 – 99.5', '100'] },
    members: { br: [1, 2, 3, 5, 10], labels: ['0', '1', '2', '3 – 4', '5 – 9', '10+'] },
    mem_rate: { br: [0.001, 1, 2, 4, 8], labels: ['0', '0 – 1', '1 – 2', '2 – 4', '4 – 8', '8+'] },
  };
  function niceBreak(v, metric) {
    if (metric === 'pop') return Math.round(v / 100) * 100;
    if (metric === 'hh') return Math.round(v / 50) * 50;
    if (metric === 'dens') return Math.round(v / 10) * 10;
    if (metric === 'members') return Math.round(v);
    if (metric === 'hhsize') return Math.round(v * 100) / 100;
    return Math.round(v * 10) / 10;
  }
  function classes(metric, level, kRows, dRows) {
    const f = (METRICS[metric] || METRICS.dens).fmt;
    let br, labels;
    if (level === 'khoroo' && CUSTOM[metric]) ({ br, labels } = CUSTOM[metric]);
    else {
      const vals = (level === 'district' ? dRows : kRows).map((r) => r[metric]).sort(d3.ascending);
      const n = level === 'district' ? 5 : 7;
      br = Array.from(new Set(d3.range(1, n).map((i) => niceBreak(d3.quantileSorted(vals, i / n), metric)))).sort(d3.ascending);
    }
    const n = br.length + 1;
    if (!labels) labels = d3.range(n).map((i) => (i === 0 ? `< ${f(br[0])}` : i === n - 1 ? `≥ ${f(br[i - 1])}` : `${f(br[i - 1])} – ${f(br[i])}`));
    const color = (i) => `var(--ub-s${n === 1 ? 4 : 1 + Math.round((i * 6) / (n - 1))})`;
    const scale = d3.scaleThreshold().domain(br).range(d3.range(n));
    return { br, n, labels, color, of: (v) => color(scale(v)) };
  }

  /* ---------- Газрын зураг ---------- */
  let geoSrc = null, geoCache = null;
  function geo() {
    const rows = ok('boundaries');
    if (!rows) return null;
    if (geoSrc === rows) return geoCache;
    const parse = (r) => ({ id: r.id, lx: +r.lx, ly: +r.ly, geometry: JSON.parse(r.geometry), type: 'Feature', properties: {} });
    const k = rows.filter((r) => r.level === 'khoroo').map(parse);
    const d = rows.filter((r) => r.level === 'district').map(parse);
    const core = rows.filter((r) => r.level === 'core').map(parse)[0];
    const crs = (rows.find((r) => r.level === 'crs') || {}).id || 'EPSG:32648';
    geoSrc = rows;
    geoCache = { k, d, crs, core: core.geometry.coordinates, city: { type: 'FeatureCollection', features: d } };
    return geoCache;
  }
  const shared = { view: null, onView: null };

  function showTip(tip, host, event, title, lines) {
    const el = tip.node();
    el.replaceChildren();
    const b = document.createElement('b'); b.textContent = title; el.append(b);
    lines.forEach(([l, v]) => {
      const row = document.createElement('div');
      const a = document.createElement('span'); a.textContent = l;
      const c = document.createElement('span'); c.textContent = v;
      row.append(a, c); el.append(row);
    });
    el.hidden = false;
    const [x, y] = d3.pointer(event, host);
    const w = el.offsetWidth, h = el.offsetHeight, W = host.clientWidth;
    let left = x + 14; if (left + w > W - 4) left = Math.max(4, x - w - 14);
    let top = y - h - 10; if (top < 4) top = Math.min(y + 14, Math.max(4, host.clientHeight - h - 4));
    tip.style('left', `${left}px`).style('top', `${top}px`);
  }

  function mapDrawing(kind) {
    const detail = kind === 'detail';
    return {
      mount(el) {
        const host = d3.select(el);
        const svg = host.append('svg').attr('role', 'img');
        const root = svg.append('g');
        const st = {
          svg, root, host, gT: root.append('g').attr('class', 'ub-tiles'), gK: root.append('g'), gD: root.append('g'), gS: root.append('g'),
          gP: svg.append('g').attr('class', 'ub-pts'), gL: svg.append('g'), vp: detail ? null : svg.append('rect').attr('class', 'ub-vp'),
          tip: host.append('div').attr('class', 'ub-tip').attr('hidden', true),
          w: 0, h: 0, t: d3.zoomIdentity, scopeKey: null,
        };
        if (detail) {
          st.zoom = d3.zoom().scaleExtent([1, 260])
            .filter((e) => (e.type === 'wheel' ? e.ctrlKey || e.metaKey : e.type === 'touchstart' ? e.touches.length > 1 : !e.button))
            .on('zoom', (e) => { st.t = e.transform; root.attr('transform', st.t); paintTiles(st); placePoints(st); placeLabels(st); publishView(st); });
          svg.call(st.zoom).on('dblclick.zoom', null);
          const bind = (sel, fn) => document.querySelectorAll(sel).forEach((b) => { b.onclick = fn; });
          const dur = () => (reduced() ? 0 : 250);
          bind('#ub-zi', () => svg.transition().duration(dur()).call(st.zoom.scaleBy, 1.7));
          bind('#ub-zo', () => svg.transition().duration(dur()).call(st.zoom.scaleBy, 1 / 1.7));
          bind('#ub-z0', () => { st.scopeKey = null; dash.draw('map-detail'); });
        } else {
          shared.onView = () => paintViewport(st);
        }
        return st;
      },
      update(el, st) {
        const g = geo(), kRows = ok('khoroo_m'), dRows = ok('district_m');
        if (!g || !kRows || !dRows) return;
        const w = Math.max(240, el.clientWidth);
        const h = detail ? Math.round(Math.min(640, Math.max(380, w / 1.34))) : Math.round(w / 1.45);
        const sized = w !== st.w || h !== st.h;
        st.host.style('height', `${h + (el.offsetHeight - el.clientHeight || 0)}px`);
        st.svg.attr('viewBox', `0 0 ${w} ${h}`).attr('aria-label', detail
          ? 'Улаанбаатар хотын хороодын газрын зураг, сонгосон үзүүлэлтээр будсан'
          : 'Улаанбаатар хотын бүх нутгийн тойм зураг');
        if (sized) {
          st.w = w; st.h = h;
          const pad = detail ? 10 : 8;
          st.proj = d3.geoIdentity().reflectY(true).fitExtent([[pad, pad], [w - pad, h - pad]], g.city);
          st.path = d3.geoPath(st.proj);
          st.gK.selectAll('path').data(g.k, (d) => d.id).join('path').attr('class', 'ub-kpath').attr('d', st.path);
          st.gD.selectAll('path').data(g.d, (d) => d.id).join('path').attr('class', 'ub-dpath').attr('d', st.path);
          if (detail) st.zoom.extent([[0, 0], [w, h]]).translateExtent([[-w * 0.2, -h * 0.2], [w * 1.2, h * 1.2]]);
        }
        const p = P(), info = new Map(kRows.map((r) => [r.code, r])), dInfo = new Map(dRows.map((r) => [r.district, r]));
        const m = M(), metric = p.metric, byDistrict = p.level === 'district';
        const cl = classes(metric, p.level, kRows, dRows);
        const bm = basemap();
        st.bm = bm;
        st.host.classed('has-base', !!bm);
        st.gK.selectAll('path')
          .classed('nob', byDistrict)
          .style('fill', (d) => { const r = info.get(d.id); return cl.of(byDistrict ? dInfo.get(r.district)[metric] : r[metric]); })
          .style('opacity', (d) => (!p.district || info.get(d.id).district === p.district ? 1 : 0.28))
          .on('pointermove', (e, d) => {
            const r = info.get(d.id), s = byDistrict ? dInfo.get(r.district) : r;
            showTip(st.tip, el, e, byDistrict ? `${r.district} дүүрэг` : `${r.district} · ${r.khoroo}`, [
              [m.label, `${m.fmt(s[metric])} ${m.unit}`], ['Хүн ам', int(s.pop)], ['Өрх', int(s.hh)], ['Гишүүд', int(s.members)],
            ]);
          })
          .on('pointerleave', () => st.tip.attr('hidden', true))
          .on('click', (e, d) => {
            const r = info.get(d.id);
            if (byDistrict) dash.setParams({ district: p.district === r.district ? '' : r.district, khoroo: '' });
            else dash.setParams({ district: r.district, khoroo: p.khoroo === r.code ? '' : r.code });
          });
        const sel = p.khoroo ? g.k.filter((d) => d.id === p.khoroo) : p.district ? g.d.filter((d) => d.id === p.district) : [];
        st.gS.selectAll('path').data(sel, (d) => d.id).join('path').attr('class', 'ub-selpath').attr('d', st.path);

        const labels = g.d.filter((d) => detail || OUTER.has(d.id)).map((d) => ({ kind: 'd', id: d.id, text: d.id, base: st.proj([d.lx, d.ly]), w: 0, h: 0 }));
        if (detail) g.k.forEach((d) => {
          const b = st.path.bounds(d), r = info.get(d.id);
          labels.push({ kind: 'k', id: d.id, district: r.district, text: String(r.khoroo_no), base: st.proj([d.lx, d.ly]), w: b[1][0] - b[0][0], h: b[1][1] - b[0][1] });
        });
        st.labels = labels;
        st.gL.selectAll('text').data(labels, (d) => d.kind + d.id).join('text')
          .attr('class', (d) => (d.kind === 'k' ? 'ub-lab k' : 'ub-lab')).text((d) => d.text);
        st.p = p;
        if (detail) drawPoints(st, el);

        if (detail) {
          const key = `${p.district}|${p.khoroo}|${w}|${h}`;
          if (key !== st.scopeKey) {
            const first = st.scopeKey === null && !st.didFirst;
            st.scopeKey = key; st.didFirst = true;
            const t = scopeTransform(st, g, p, kRows);
            if (first || reduced()) st.svg.call(st.zoom.transform, t);
            else st.svg.transition().duration(450).call(st.zoom.transform, t);
          } else { paintTiles(st); placePoints(st); placeLabels(st); publishView(st); }
        } else { paintTiles(st); placeLabels(st); paintViewport(st); }
      },
    };
  }

  // Харагдаж буй хэсгийг хамрах tile-уудыг сонгож, хилтэй ижил координатад (EPSG:3857 → дэлгэц) байрлуулна.
  function paintTiles(st) {
    const bm = st.bm;
    if (!bm || !st.proj || !st.w) { st.gT.selectAll('image').remove(); return; }
    const t = st.t, s = st.proj.scale(), [tx, ty] = st.proj.translate();
    const z = Math.max(0, Math.min(bm.maxZoom, Math.round(Math.log2((WORLD * s * t.k) / 256))));
    const n = 2 ** z, size = WORLD / n;
    const [ax, ay] = t.invert([0, 0]), [bx, by] = t.invert([st.w, st.h]);
    const clamp = (v) => Math.max(0, Math.min(n - 1, v));
    const ix0 = clamp(Math.floor(((ax - tx) / s + HALF) / size)), ix1 = clamp(Math.floor(((bx - tx) / s + HALF) / size));
    const iy0 = clamp(Math.floor((HALF - (ty - ay) / s) / size)), iy1 = clamp(Math.floor((HALF - (ty - by) / s) / size));
    if ((ix1 - ix0 + 1) * (iy1 - iy0 + 1) > 160) return;
    const dark = darkQuery.matches, retina = bm.retina && (window.devicePixelRatio || 1) > 1.2;
    const tiles = [];
    for (let x = ix0; x <= ix1; x += 1) for (let y = iy0; y <= iy1; y += 1) {
      tiles.push({ key: `${P().base}/${dark ? 'd' : 'l'}/${z}/${x}/${y}`, url: bm.url(z, x, y, dark, retina),
        x: tx + s * (-HALF + x * size), y: ty - s * (HALF - y * size), w: s * size });
    }
    const pad = 0.5 / t.k;
    st.gT.selectAll('image').data(tiles, (d) => d.key)
      .join((enter) => enter.append('image').attr('preserveAspectRatio', 'none').attr('href', (d) => d.url)
        .on('error', function () { d3.select(this).attr('visibility', 'hidden'); }))
      .attr('x', (d) => d.x - pad).attr('y', (d) => d.y - pad).attr('width', (d) => d.w + 2 * pad).attr('height', (d) => d.w + 2 * pad);
  }

  function scopeTransform(st, g, p, kRows) {
    let pts;
    const px = (f) => st.path.bounds(f);
    if (p.khoroo && g.k.some((d) => d.id === p.khoroo)) {
      const b = px(g.k.find((d) => d.id === p.khoroo));
      const dx = b[1][0] - b[0][0], dy = b[1][1] - b[0][1];
      pts = [[b[0][0] - dx * 0.9, b[0][1] - dy * 0.9], [b[1][0] + dx * 0.9, b[1][1] + dy * 0.9]];
    } else if (p.district && kRows.some((r) => r.district === p.district)) {
      const rows = kRows.filter((r) => r.district === p.district), urban = rows.filter((r) => r.dens >= 500);
      const use = new Set((urban.length >= rows.length / 2 ? urban : rows).map((r) => r.code));
      const bs = g.k.filter((d) => use.has(d.id)).map(px);
      pts = [[d3.min(bs, (b) => b[0][0]), d3.min(bs, (b) => b[0][1])], [d3.max(bs, (b) => b[1][0]), d3.max(bs, (b) => b[1][1])]];
    } else {
      const a = st.proj(g.core[0]), b = st.proj(g.core[1]);
      pts = [[Math.min(a[0], b[0]), Math.min(a[1], b[1])], [Math.max(a[0], b[0]), Math.max(a[1], b[1])]];
    }
    const dx = Math.max(1, pts[1][0] - pts[0][0]), dy = Math.max(1, pts[1][1] - pts[0][1]);
    const k = Math.min(260, Math.max(1, 0.94 / Math.max(dx / st.w, dy / st.h)));
    return d3.zoomIdentity.translate(st.w / 2 - (k * (pts[0][0] + pts[1][0])) / 2, st.h / 2 - (k * (pts[0][1] + pts[1][1])) / 2).scale(k);
  }

  /* Их, дээд сургуулийн цэг: дэлгэц дээр тогтмол хэмжээтэй, хилтэй ижил проекцоор байрлана. */
  function drawPoints(st, el) {
    const rows = P().uni === '0' ? null : ok('universities');
    const p = P(), int0 = d3.format(',.0f');
    const data = (rows || []).map((r) => ({ ...r, px: st.proj([+r.x, +r.y]) }));
    const g = st.gP.selectAll('g.ub-pt').data(data, (d) => d.id).join((enter) => {
      const e = enter.append('g').attr('class', 'ub-pt');
      e.append('circle').attr('class', 'ub-pt-hit').attr('r', 11);
      e.append('circle').attr('class', 'ub-pt-dot').attr('r', 5.5);
      return e;
    });
    g.classed('is-unknown', (d) => d.known !== '1').classed('is-dim', (d) => !!p.district && d.district !== p.district)
      .on('pointermove', (e, d) => {
        const lines = [];
        if (d.known !== '1' && d.nearest) lines.push(['Ойрын сургууль', d.nearest]);
        lines.push(['Байршил', `${d.district}, ${d.khoroo}`]);
        if (d.street) lines.push(['Гудамж', d.street]);
        if (d.area_m2) lines.push(['Газрын талбай', `${int0(+d.area_m2)} м²`]);
        if (d.right) lines.push(['Газрын эрх', d.right]);
        if (d.known === '1') lines.push(['Нэрийн тохирол', `${d.confidence}${d.match_m ? ` (${d.match_m} м)` : ''}`]);
        showTip(st.tip, el, e, d.known === '1' ? d.name : 'Нэр тодорхойгүй сургалтын газар', lines);
      })
      .on('pointerleave', () => st.tip.attr('hidden', true))
      .on('click', (e, d) => { e.stopPropagation(); dash.setParams({ district: d.district, khoroo: d.khoroo_code }); });
    placePoints(st);
  }
  function placePoints(st) {
    const t = st.t;
    st.gP.selectAll('g.ub-pt').attr('transform', (d) => `translate(${t.applyX(d.px[0])},${t.applyY(d.px[1])})`);
  }

  function placeLabels(st) {
    if (!st.labels) return;
    const t = st.t, p = st.p || P(), placed = [];
    const hit = (a) => placed.some((b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0);
    const showK = (d) => (p.district ? d.district === p.district : t.k >= 26);
    st.gL.selectAll('text').sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'd' ? -1 : 1)).each(function (d) {
      const x = t.applyX(d.base[0]), y = t.applyY(d.base[1]);
      let vis = x > 0 && x < st.w && y > 0 && y < st.h;
      if (d.kind === 'd') vis = vis && !p.district;
      else vis = vis && p.level !== 'district' && showK(d) && d.w * t.k >= 20 && d.h * t.k >= 14;
      if (vis) {
        const hw = this.getComputedTextLength() / 2 + 3, box = { x0: x - hw, x1: x + hw, y0: y - 8, y1: y + 8 };
        if (hit(box)) vis = false; else placed.push(box);
      }
      d3.select(this).attr('display', vis ? null : 'none').attr('transform', `translate(${x},${y})`);
    });
  }
  function publishView(st) {
    const a = st.proj.invert(st.t.invert([0, 0])), b = st.proj.invert(st.t.invert([st.w, st.h]));
    shared.view = [a, b];
    if (shared.onView) shared.onView();
  }
  function paintViewport(st) {
    if (!shared.view || !st.proj) return;
    const a = st.proj(shared.view[0]), b = st.proj(shared.view[1]);
    const x0 = Math.max(1, Math.min(a[0], b[0])), y0 = Math.max(1, Math.min(a[1], b[1]));
    const x1 = Math.min(st.w - 1, Math.max(a[0], b[0])), y1 = Math.min(st.h - 1, Math.max(a[1], b[1]));
    st.vp.attr('x', x0).attr('y', y0).attr('width', Math.max(0, x1 - x0)).attr('height', Math.max(0, y1 - y0));
  }
  dash.draw('map-detail', mapDrawing('detail'));
  dash.draw('map-over', mapDrawing('over'));

  dash.draw('legend', (el) => {
    const kRows = ok('khoroo_m'), dRows = ok('district_m');
    el.replaceChildren();
    if (!kRows || !dRows) { el.textContent = '—'; return; }
    const p = P(), cl = classes(p.metric, p.level, kRows, dRows);
    d3.range(cl.n).forEach((i) => {
      const row = document.createElement('span'); row.className = 'ub-lg';
      const sw = document.createElement('i'); sw.style.background = cl.color(i);
      row.append(sw, document.createTextNode(cl.labels[i])); el.append(row);
    });
  });

  dash.draw('map-attr', (el) => {
    const bm = basemap();
    el.replaceChildren();
    if (!bm) return;
    bm.attr.forEach((part) => {
      if (typeof part === 'string') { el.append(document.createTextNode(part)); return; }
      const a = document.createElement('a'); a.textContent = part[0]; a.href = part[1]; a.target = '_blank'; a.rel = 'noopener';
      el.append(a);
    });
  });
  darkQuery.addEventListener('change', () => { dash.draw('map-detail'); dash.draw('map-over'); });

  /* ---------- Текст, шүүлтүүр ---------- */
  // data-source нь аль тооцооллоос уншихыг, data-k нь талбарыг, data-f нь форматыг заана.
  dash.draw('sum', (el) => {
    const row = (ok(el.dataset.source) || [])[0];
    el.textContent = row ? FMT[el.dataset.f](row[el.dataset.k]) : '—';
  });
  dash.draw('scope-name', (el) => { const row = (ok(el.dataset.source) || [])[0]; el.textContent = row ? row.scope : '—'; });
  dash.draw('metric-label', (el) => { el.textContent = M().label; });
  dash.draw('metric-unit', (el) => { el.textContent = M().unit; });
  dash.draw('top-scope', (el) => { const d = P().district; el.textContent = d ? `${d} дүүрэг` : 'Улаанбаатар хот'; });
  dash.draw('split', (el) => {
    const row = (ok(el.dataset.source) || [])[0];
    el.replaceChildren();
    if (!row || row[el.dataset.a] == null) return;
    const a = row[el.dataset.a], x = document.createElement('i'), y = document.createElement('i');
    x.style.width = `calc(${a}% - 1px)`; y.style.width = `calc(${100 - a}% - 1px)`;
    if (a <= 0) x.hidden = true; if (a >= 100) y.hidden = true;
    el.append(x, y);
  });

  dash.draw('sel-district', (sel) => {
    const rows = ok('district_m') || [];
    const names = rows.map((r) => r.district).sort((a, b) => a.localeCompare(b, 'mn'));
    sel.replaceChildren(new Option('Бүх дүүрэг', ''), ...names.map((n) => new Option(n, n)));
    sel.value = P().district;
    sel.onchange = () => dash.setParams({ district: sel.value, khoroo: '' });
  });
  dash.draw('sel-khoroo', (sel) => {
    const rows = ok('khoroo_m') || [], p = P();
    const list = rows.filter((r) => r.district === p.district).sort((a, b) => a.khoroo_no - b.khoroo_no);
    sel.replaceChildren(new Option(p.district ? 'Бүх хороо' : 'Эхлээд дүүрэг', ''), ...list.map((r) => new Option(r.khoroo, r.code)));
    sel.disabled = !p.district; sel.value = p.khoroo;
    sel.onchange = () => dash.setParams({ khoroo: sel.value });
  });

  /* ---------- Графикууд ---------- */
  function hbars(el, rows, opt) {
    el.replaceChildren();
    if (!rows.length) { el.textContent = '—'; return; }
    const W = Math.max(220, el.clientWidth), rowH = opt.rowH || 28, H = rows.length * rowH;
    const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('height', H)
      .attr('role', 'img').attr('aria-label', opt.aria);
    const tip = d3.select(el).append('div').attr('class', 'ub-tip').attr('hidden', true);
    const probe = svg.append('text').attr('class', 'ub-bar-l').attr('opacity', 0);
    const measure = (arr) => d3.max(arr, (s) => { probe.text(s); return probe.node().getComputedTextLength(); });
    const nameW = Math.min(W * 0.46, measure(rows.map(opt.name)) + 10), valW = measure(rows.map((r) => opt.fmt(r[opt.key]))) + 10;
    probe.remove();
    const x = d3.scaleLinear().domain([0, opt.max || d3.max(rows, (r) => r[opt.key]) || 1]).range([0, Math.max(30, W - nameW - valW)]);
    const sel = opt.sel || (() => false);
    const g = svg.selectAll('g').data(rows).join('g').attr('class', (r) => `ub-row${sel(r) ? ' sel' : ''}${opt.click ? '' : ' static'}`).attr('transform', (r, i) => `translate(0,${i * rowH})`);
    g.append('rect').attr('class', 'ub-rowhit').attr('width', W).attr('height', rowH).attr('rx', 3);
    g.append('text').attr('class', 'ub-bar-l').attr('y', rowH / 2).text(opt.name);
    const bh = Math.min(16, rowH - 10);
    g.append('path').attr('transform', `translate(${nameW},${rowH / 2 - bh / 2})`)
      .attr('d', (r) => {
        const w = r[opt.key] > 0 ? Math.max(2, x(r[opt.key])) : 0, c = Math.min(4, w);
        return w ? `M0,0H${w - c}Q${w},0 ${w},${c}V${bh - c}Q${w},${bh} ${w - c},${bh}H0Z` : '';
      })
      .style('fill', dash.colors[0]).style('opacity', (r) => (opt.anySel && !sel(r) ? 0.4 : 1));
    g.append('text').attr('class', 'ub-bar-v').attr('y', rowH / 2).attr('x', (r) => nameW + (r[opt.key] > 0 ? Math.max(2, x(r[opt.key])) : 0) + 6).text((r) => opt.fmt(r[opt.key]));
    g.on('pointermove', (e, r) => showTip(tip, el, e, opt.title(r), opt.lines(r))).on('pointerleave', () => tip.attr('hidden', true));
    if (opt.click) g.on('click', (e, r) => opt.click(r));
  }

  dash.draw('chart-district', (el) => {
    const rows = ok('district_m');
    if (!rows) { el.textContent = '—'; return; }
    const p = P(), m = M();
    hbars(el, [...rows].sort((a, b) => b[p.metric] - a[p.metric]), {
      key: p.metric, fmt: m.fmt, name: (r) => r.district, sel: (r) => r.district === p.district, anySel: !!p.district,
      aria: `${m.label}, дүүргээр эрэмбэлсэн`, title: (r) => `${r.district} дүүрэг`,
      lines: (r) => [[m.label, `${m.fmt(r[p.metric])} ${m.unit}`], ['Хүн ам', int(r.pop)], ['Гишүүд', int(r.members)], ['Хорооны тоо', int(r.khoroo_n)]],
      click: (r) => dash.setParams({ district: p.district === r.district ? '' : r.district, khoroo: '' }),
    });
  });
  dash.draw('chart-top', (el) => {
    const rows = ok('khoroo_m');
    if (!rows) { el.textContent = '—'; return; }
    const p = P(), m = M();
    const list = rows.filter((r) => !p.district || r.district === p.district).sort((a, b) => b[p.metric] - a[p.metric]).slice(0, 10);
    hbars(el, list, {
      key: p.metric, fmt: m.fmt, name: (r) => (p.district ? r.khoroo : `${r.district} ${r.khoroo_no}-р`), sel: (r) => r.code === p.khoroo, anySel: !!p.khoroo,
      aria: `${m.label}, эхний 10 хороо`, title: (r) => `${r.district} · ${r.khoroo}`,
      lines: (r) => [[m.label, `${m.fmt(r[p.metric])} ${m.unit}`], ['Хүн ам', int(r.pop)], ['Өрх', int(r.hh)], ['Гишүүд', int(r.members)]],
      click: (r) => dash.setParams({ district: r.district, khoroo: p.khoroo === r.code ? '' : r.code }),
    });
  });

  /* Гишүүдийн задаргаа */
  const AGE = [['age_u18', '18 хүртэл'], ['age_18_24', '18–24'], ['age_25_34', '25–34'], ['age_35_44', '35–44'], ['age_45p', '45+'], ['age_unknown', 'Тодорхойгүй']];
  const MOVE = [['mv_new', 'Шинэ'], ['mv_base', 'Үндсэн'], ['mv_moved', 'Шилжсэн'], ['mv_other', 'Бусад']];
  function memBars(el, defs, what) {
    const row = (ok('mem_scope') || [])[0];
    if (!row || row.suppressed) { el.replaceChildren(); return; }
    const rows = defs.map(([k, label]) => ({ label, v: row[k] }));
    hbars(el, rows, {
      key: 'v', fmt: int, name: (r) => r.label, rowH: 24, aria: `${row.scope}: гишүүд ${what}`,
      title: (r) => `${r.label}`, lines: (r) => [['Гишүүд', int(r.v)], ['Эзлэх хувь', `${dec1((100 * r.v) / row.members)}%`]],
    });
  }
  dash.draw('mem-age', (el) => memBars(el, AGE, 'насны бүлгээр'));
  const KH_LIMIT = 12;
  function districtKhoroos() {
    const rows = ok('khoroo_m'), p = P();
    return rows && p.district ? rows.filter((r) => r.district === p.district) : null;
  }
  dash.draw('mem-khoroos', (el) => {
    const all = districtKhoroos();
    if (!all) { el.replaceChildren(); return; }
    const p = P(), list = all.filter((r) => r.members > 0).sort((a, b) => b.members - a.members || a.khoroo_no - b.khoroo_no).slice(0, KH_LIMIT);
    hbars(el, list, {
      key: 'members', fmt: int, name: (r) => r.khoroo, rowH: 24, sel: (r) => r.code === p.khoroo,
      aria: `${p.district} дүүргийн хороодын гишүүдийн тоо`, title: (r) => `${r.district} · ${r.khoroo}`,
      lines: (r) => [['Гишүүд', int(r.members)], ['10 000 хүнд', dec1(r.mem_rate)], ['Хүн ам', int(r.pop)]],
      click: (r) => dash.setParams({ district: r.district, khoroo: r.code }),
    });
  });
  dash.draw('mem-khoroos-note', (el) => {
    const all = districtKhoroos();
    if (!all) { el.textContent = '—'; return; }
    const withM = all.filter((r) => r.members > 0).length, zero = all.length - withM;
    const parts = [];
    if (withM > KH_LIMIT) parts.push(`Гишүүнтэй ${int(withM)} хорооноос эхний ${KH_LIMIT}-ыг харуулав.`);
    if (zero) parts.push(`Гишүүнгүй ${int(zero)} хороо.`);
    parts.push('Хороо дээр дарж дэлгэрэнгүйг харна.');
    el.textContent = parts.join(' ');
  });
  dash.draw('mem-move', (el) => memBars(el, MOVE, 'хөдөлгөөний төрлөөр'));

  dash.draw('chart-monthly', (el) => {
    const rows = ok('members_monthly');
    el.replaceChildren();
    if (!rows || !rows.length) { el.textContent = '—'; return; }
    const data = rows.map((r) => ({ month: r.month, v: +r.new_members, date: d3.utcParse('%Y-%m')(r.month) }));
    const W = Math.max(260, el.clientWidth), H = W < 520 ? 220 : 300;
    const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('height', H).attr('role', 'img')
      .attr('aria-label', 'Сар бүр шинээр бүртгэгдсэн гишүүдийн тоо');
    const tip = d3.select(el).append('div').attr('class', 'ub-tip').attr('hidden', true);
    const y = d3.scaleLinear().domain([0, d3.max(data, (d) => d.v) || 1]).nice(4);
    const ticks = y.ticks(4);
    const probe = svg.append('text').attr('class', 'ub-axis-t');
    const left = d3.max(ticks, (t) => { probe.text(int(t)); return probe.node().getComputedTextLength(); }) + 8;
    probe.remove();
    const m = { t: 8, r: 4, b: 22, l: left };
    y.range([H - m.b, m.t]);
    const x = d3.scaleBand().domain(data.map((d) => d.month)).range([m.l, W - m.r]).paddingInner(0.2);
    svg.append('g').selectAll('line').data(ticks).join('line').attr('class', 'ub-grid')
      .attr('x1', m.l).attr('x2', W - m.r).attr('y1', (t) => y(t)).attr('y2', (t) => y(t));
    svg.append('g').selectAll('text').data(ticks).join('text').attr('class', 'ub-axis-t')
      .attr('x', m.l - 6).attr('y', (t) => y(t)).attr('text-anchor', 'end').attr('dominant-baseline', 'central').text((t) => int(t));
    const years = data.filter((d, i) => i === 0 || d.month.endsWith('-01'));
    const minGap = 34; let lastX = -Infinity;
    svg.append('g').selectAll('text').data(years.filter((d) => { const px = x(d.month); if (px - lastX < minGap) return false; lastX = px; return true; }))
      .join('text').attr('class', 'ub-axis-t').attr('x', (d) => x(d.month)).attr('y', H - 6).text((d) => d.month.slice(0, 4));
    const bw = x.bandwidth();
    svg.append('g').selectAll('path').data(data.filter((d) => d.v > 0)).join('path')
      .attr('transform', (d) => `translate(${x(d.month)},${y(d.v)})`)
      .attr('d', (d) => { const h = y(0) - y(d.v), c = Math.min(3, bw / 2, h); return `M0,${h}V${c}Q0,0 ${c},0H${bw - c}Q${bw},0 ${bw},${c}V${h}Z`; })
      .style('fill', dash.colors[0]);
    svg.append('line').attr('class', 'ub-base').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(0)).attr('y2', y(0));
    const fmtMonth = (d) => `${d.month.slice(0, 4)} оны ${+d.month.slice(5)}-р сар`;
    svg.append('g').selectAll('rect').data(data).join('rect').attr('class', 'ub-hit')
      .attr('x', (d) => x(d.month) - (x.step() - bw) / 2).attr('width', x.step()).attr('y', m.t).attr('height', H - m.t - m.b)
      .on('pointermove', (e, d) => showTip(tip, el, e, fmtMonth(d), [['Шинэ гишүүн', int(d.v)]]))
      .on('pointerleave', () => tip.attr('hidden', true));
  });

  dash.draw('chart-housing', (el) => {
    const rows = ok('district_m');
    el.replaceChildren();
    if (!rows) { el.textContent = '—'; return; }
    const p = P(), list = [...rows].sort((a, b) => b.gerpct - a.gerpct);
    const W = Math.max(260, el.clientWidth), rowH = 28, H = list.length * rowH;
    const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('height', H).attr('role', 'img')
      .attr('aria-label', 'Дүүрэг бүрийн хүн амын орон сууц ба гэр хорооллын хувь');
    const tip = d3.select(el).append('div').attr('class', 'ub-tip').attr('hidden', true);
    const probe = svg.append('text').attr('class', 'ub-bar-l').attr('opacity', 0);
    const nameW = d3.max(list, (r) => { probe.text(r.district); return probe.node().getComputedTextLength(); }) + 10;
    probe.text('100.0%'); const valW = probe.node().getComputedTextLength() + 8; probe.remove();
    const x = d3.scaleLinear().domain([0, 100]).range([0, Math.max(40, W - nameW - valW)]);
    const g = svg.selectAll('g').data(list).join('g').attr('class', (r) => `ub-row${r.district === p.district ? ' sel' : ''}`).attr('transform', (r, i) => `translate(0,${i * rowH})`);
    g.append('rect').attr('class', 'ub-rowhit').attr('width', W).attr('height', rowH).attr('rx', 3);
    g.append('text').attr('class', 'ub-bar-l').attr('y', rowH / 2).text((r) => r.district);
    g.append('rect').attr('x', nameW).attr('y', rowH / 2 - 8).attr('height', 16).attr('rx', 3).attr('width', (r) => Math.max(0, x(r.aptpct) - 1)).style('fill', dash.colors[0]);
    g.append('rect').attr('x', (r) => nameW + x(r.aptpct) + 1).attr('y', rowH / 2 - 8).attr('height', 16).attr('rx', 3).attr('width', (r) => Math.max(0, x(r.gerpct) - 1)).style('fill', dash.colors[1]);
    g.append('text').attr('class', 'ub-bar-v').attr('y', rowH / 2).attr('x', W).attr('text-anchor', 'end').text((r) => `${dec1(r.gerpct)}%`);
    g.on('pointermove', (e, r) => showTip(tip, el, e, `${r.district} дүүрэг`, [['Орон сууц', `${dec1(r.aptpct)}%`], ['Гэр хороолол', `${dec1(r.gerpct)}%`]]))
      .on('pointerleave', () => tip.attr('hidden', true))
      .on('click', (e, r) => dash.setParams({ district: p.district === r.district ? '' : r.district, khoroo: '' }));
  });

  /* ---------- Хүснэгт ---------- */
  const tbl = { key: 'pop', dir: -1, q: '' };
  function tableRows() {
    const rows = ok('khoroo_m') || [], p = P(), q = tbl.q.trim().toLowerCase();
    return rows.filter((r) => (!p.district || r.district === p.district) && (!q || `${r.district} ${r.khoroo}`.toLowerCase().includes(q)))
      .sort((a, b) => {
        const c = typeof a[tbl.key] === 'string' ? a[tbl.key].localeCompare(b[tbl.key], 'mn') : a[tbl.key] - b[tbl.key];
        return c * tbl.dir || a.district.localeCompare(b.district, 'mn') || a.khoroo_no - b.khoroo_no;
      });
  }
  dash.draw('table-count', (el) => { el.textContent = ok('khoroo_m') ? int(tableRows().length) : '—'; });
  dash.draw('table-body', (tb) => {
    const p = P();
    tb.replaceChildren(...tableRows().map((r) => {
      const tr = document.createElement('tr'); tr.dataset.key = r.code; if (r.code === p.khoroo) tr.className = 'sel';
      [[r.district], [r.khoroo], [int(r.pop), 1], [int(r.hh), 1], [FMT.area(r.area_km2), 1], [int(r.dens), 1], [dec2(r.hhsize), 1],
        [int(r.members), 1], [dec1(r.mem_rate), 1], [dec1(r.gerpct), 1]].forEach(([v, n]) => {
        const td = document.createElement('td'); td.textContent = v; if (n) td.className = 'n'; tr.append(td);
      });
      tr.onclick = () => dash.setParams({ district: r.district, khoroo: p.khoroo === r.code ? '' : r.code });
      return tr;
    }));
  });
  function paintSort() {
    document.querySelectorAll('#ub-table th[data-sort]').forEach((th) => {
      if (th.dataset.sort === tbl.key) th.setAttribute('aria-sort', tbl.dir > 0 ? 'ascending' : 'descending');
      else th.removeAttribute('aria-sort');
    });
  }
  document.querySelectorAll('#ub-table th[data-sort] button').forEach((b) => b.addEventListener('click', () => {
    const k = b.parentElement.dataset.sort;
    if (tbl.key === k) tbl.dir *= -1; else { tbl.key = k; tbl.dir = k === 'district' || k === 'khoroo_no' ? 1 : -1; }
    paintSort(); dash.draw('table-body');
  }));
  document.querySelectorAll('#ub-q').forEach((i) => i.addEventListener('input', () => { tbl.q = i.value; dash.draw('table-body'); dash.draw('table-count'); }));
  paintSort();

  /* ---------- Удирдлага ---------- */
  document.querySelectorAll('#ub-metric').forEach((s) => s.addEventListener('change', () => dash.setParams({ metric: s.value })));
  document.querySelectorAll('#ub-base').forEach((s) => s.addEventListener('change', () => dash.setParams({ base: s.value })));
  document.querySelectorAll('#ub-uni').forEach((c) => c.addEventListener('change', () => dash.setParams({ uni: c.checked ? '1' : '0' })));
  dash.draw('uni-count', (el) => { const rows = ok('universities'); el.textContent = rows ? String(rows.length) : '—'; });
  // Будгийн тод байдал: суурь зураг хэр харагдахыг хэрэглэгч өөрөө тохируулна (дахин зурах шаардлагагүй).
  document.querySelectorAll('#ub-op').forEach((r) => {
    const apply = () => document.querySelectorAll('.ub').forEach((u) => { u.style.setProperty('--ub-fill-op', String(r.value / 100)); });
    r.addEventListener('input', apply); apply();
  });
  document.querySelectorAll('.ub-seg-btn').forEach((b) => b.addEventListener('click', () => dash.setParams({ level: b.dataset.level })));
  document.querySelectorAll('#ub-reset').forEach((b) => b.addEventListener('click', () => dash.setParams({ district: '', khoroo: '' })));
  document.querySelectorAll('.ub').forEach((r) => { r.style.setProperty('--ub-accent', dash.colors[0]); r.style.setProperty('--ub-accent2', dash.colors[1]); });
  dash.onData(() => {
    const p = P();
    const ms = dash.data('mem_scope'), mrow = ms.status === 'ok' && ms.data ? ms.data[0] : null;
    const supp = !!(mrow && mrow.suppressed);
    document.querySelectorAll('#ub-metric').forEach((s) => { s.value = METRICS[p.metric] ? p.metric : 'dens'; });
    const g = dash.data('boundaries').status === 'ok' ? geo() : null;
    const canBase = !!(window.UB_CONFIG && window.UB_CONFIG.basemap && g && g.crs === 'EPSG:3857');
    document.querySelectorAll('.ub-field-base').forEach((f) => { f.hidden = !canBase; });
    document.querySelectorAll('#ub-base').forEach((s) => { s.value = BASEMAPS[p.base] ? p.base : 'none'; });
    document.querySelectorAll('#ub-uni').forEach((c) => { c.checked = p.uni !== '0'; });
    document.querySelectorAll('.ub-field-op').forEach((f) => { f.hidden = !canBase || !BASEMAPS[p.base]; });
    document.querySelectorAll('.ub-seg-btn').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.level === p.level)));
    document.querySelectorAll('#ub-reset').forEach((b) => { b.hidden = !(p.district || p.khoroo); });
    const zero = !!(mrow && mrow.members === 0);
    document.querySelectorAll('.ub-sel-none').forEach((s) => { s.hidden = !!(p.district || p.khoroo); });
    document.querySelectorAll('.ub-mem-zero').forEach((s) => { s.hidden = !zero; });
    document.querySelectorAll('.ub-mem-supp').forEach((s) => { s.hidden = !supp || zero; });
    document.querySelectorAll('.ub-mem-detail').forEach((s) => { s.hidden = !mrow || supp; });
    document.querySelectorAll('.ub-sel-kh').forEach((s) => { s.hidden = !(p.district && !p.khoroo); });
  });
})();
