/*
 * dash-runtime.js — дашбоардын жижиг гүйцэтгэх орчин.
 *
 * app.js нь Claude дээрх "Data" дашбоардын `dash` API-аар бичигдсэн. Энэ файл тэр
 * API-ийн хэрэгтэй хэсгийг (data, calc, draw, onData, params, setParams…) статик
 * сайтад зориулж хэрэгжүүлнэ: өгөгдлийг data/ хавтаснаас татаж, шүүлтүүрийг URL-д
 * хадгална. Ингэснээр app.js-ийг өөрчлөхгүйгээр хоёр орчинд ажиллуулж болно.
 */
(function () {
  'use strict';

  /* ---------- Тохиргоо ---------- */
  const SOURCES = {
    khoroo: { url: 'data/khoroo.csv', format: 'csv' },
    boundaries: { url: 'data/boundaries.json', format: 'json' },
    members_scope: { url: 'data/members_scope.csv', format: 'csv' },
    members_monthly: { url: 'data/members_monthly.csv', format: 'csv' },
    universities: { url: 'data/universities.csv', format: 'csv' },
  };
  const DEFAULTS = { district: '', khoroo: '', metric: 'pop', level: 'khoroo', base: 'none', uni: '1' };
  const ALLOWED = {
    metric: ['pop', 'vote18', 'age18_25', 'members', 'mem_rate', 'gerpct'],
    level: ['khoroo', 'district'],
    base: ['carto', 'osm', 'sat', 'none'],
    uni: ['1', '0'],
  };

  /* ---------- Төлөв ---------- */
  const state = {};                 // эх өгөгдөл: id -> {status, data, columns, message}
  const calcs = {};                 // тооцоолол: id -> {inputs, fn}
  const memo = new Map();           // тооцооллын үр дүн, epoch бүрт шинэчлэгдэнэ
  const draws = new Map();          // зураглал: нэр -> fn эсвэл {mount, update, unmount}
  const dataCbs = [];
  const mounted = new WeakMap();
  const widths = new WeakMap();
  let epoch = 0, started = false, queued = false;
  let params = readParams();

  /* ---------- URL дахь шүүлтүүр ---------- */
  function clean(key, value) {
    if (value == null) return DEFAULTS[key] ?? '';
    const v = String(value).slice(0, 64);
    if (ALLOWED[key] && !ALLOWED[key].includes(v)) return DEFAULTS[key];
    return v;
  }
  function readParams() {
    const q = new URLSearchParams(location.search);
    const p = { ...DEFAULTS };
    Object.keys(DEFAULTS).forEach((k) => { if (q.has(k)) p[k] = clean(k, q.get(k)); });
    return p;
  }
  function writeParams() {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== '' && v !== DEFAULTS[k]) q.set(k, v); });
    const s = q.toString();
    history.replaceState(null, '', (s ? `?${s}` : location.pathname) + location.hash);
  }

  /* ---------- Өгөгдөл ---------- */
  // d3.csvParse нь `new Function` ашигладаг тул хатуу CSP-д хориглогдоно; мөрөөр задлаад объект болгоно.
  function parseCsv(text) {
    const [head = [], ...body] = d3.csvParseRows(text.replace(/^﻿/, ''));
    const rows = body.filter((r) => r.length > 1 || r[0]).map((r) => {
      const o = {};
      head.forEach((h, i) => { o[h] = r[i] === undefined || r[i] === '' ? null : r[i]; });
      return o;
    });
    rows.columns = head;
    return rows;
  }

  function load() {
    Object.entries(SOURCES).forEach(([id, src]) => {
      state[id] = { status: 'loading', data: [] };
      fetch(src.url)
        .then((r) => {
          if (!r.ok) throw new Error(`${src.url}: HTTP ${r.status}`);
          return src.format === 'csv' ? r.text() : r.json();
        })
        .then((body) => {
          const rows = src.format === 'csv' ? parseCsv(body) : (Array.isArray(body) ? body : body.rows || []);
          state[id] = { status: 'ok', data: rows, columns: rows.columns || Object.keys(rows[0] || {}) };
          schedule();
        })
        .catch((err) => {
          console.error(err);
          state[id] = { status: 'error', data: [], message: String((err && err.message) || err) };
          schedule();
        });
    });
  }

  function data(id) {
    if (state[id]) return state[id];
    const c = calcs[id];
    if (!c) return { status: 'missing', data: [], message: `Тодорхойгүй эх сурвалж: ${id}` };
    const hit = memo.get(id);
    if (hit && hit.epoch === epoch) return hit.value;
    const inputs = c.inputs.map(data);
    const bad = inputs.find((d) => d.status !== 'ok');
    let value;
    if (bad) value = { status: bad.status, data: null, message: bad.message };
    else {
      try {
        const out = c.fn(...inputs.map((d) => d.data));
        value = { status: 'ok', data: out, columns: Array.isArray(out) && out[0] ? Object.keys(out[0]) : [] };
      } catch (err) {
        console.error(`calc "${id}"`, err);
        value = { status: 'error', data: null, message: String(err) };
      }
    }
    memo.set(id, { epoch, value });
    return value;
  }

  /* ---------- Зураглал ---------- */
  function drawOne(el, f) {
    try {
      if (typeof f === 'function') f(el);
      else {
        let m = mounted.get(el);
        if (!m) { el.replaceChildren(); m = { made: f.mount ? f.mount(el) : undefined }; mounted.set(el, m); }
        if (f.update) f.update(el, m.made);
      }
    } catch (err) {
      console.error(`draw "${el.dataset.draw}"`, err);
    }
    if (!widths.has(el)) { widths.set(el, Math.round(el.getBoundingClientRect().width)); resize.observe(el); }
  }
  function runDraw(name) {
    const f = draws.get(name);
    if (!f) return;
    document.querySelectorAll('[data-draw]').forEach((el) => {
      if (el.dataset.draw === name && !el.closest('[hidden]')) drawOne(el, f);
    });
  }

  // Элементийн өргөн өөрчлөгдвөл зөвхөн тэр зураглалыг дахин зурна.
  let pending = new Set(), frame = 0;
  const resize = new ResizeObserver((entries) => {
    entries.forEach((e) => {
      const w = Math.round(e.contentRect.width);
      if (widths.get(e.target) !== w) { widths.set(e.target, w); pending.add(e.target); }
    });
    if (pending.size && !frame) frame = requestAnimationFrame(() => {
      const els = pending; pending = new Set(); frame = 0;
      els.forEach((el) => { const f = draws.get(el.dataset.draw); if (f && el.isConnected) drawOne(el, f); });
    });
  });

  function render() {
    epoch += 1;
    dataCbs.forEach((fn) => { try { fn(); } catch (err) { console.error(err); } });
    draws.forEach((f, name) => runDraw(name));
    showStatus();
  }
  function schedule() {
    if (!started || queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; render(); });
  }

  function showStatus() {
    const all = Object.values(state);
    const failed = all.find((s) => s.status === 'error');
    const loading = all.some((s) => s.status === 'loading');
    const root = document.getElementById('dash-root');
    if (root) root.dataset.dashState = failed ? 'error' : loading ? 'loading' : 'ok';
    document.querySelectorAll('#dash-status').forEach((el) => {
      el.hidden = !failed && !loading;
      el.textContent = failed ? `Өгөгдөл ачаалж чадсангүй (${failed.message}). Хуудсыг дахин ачаална уу.` : 'Өгөгдөл ачаалж байна…';
      el.classList.toggle('is-error', !!failed);
    });
  }

  /* ---------- Нийтийн API ---------- */
  window.dash = {
    colors: ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)'],
    data,
    calc(id, def) { calcs[id] = def; },
    loader() {},
    onData(fn) { dataCbs.push(fn); if (started) fn(); },
    draw(name, fn) {
      if (fn === undefined) { runDraw(name); return; }
      draws.set(name, fn);
    },
    params: () => ({ ...params }),
    setParams(next) {
      let changed = false;
      Object.entries(next || {}).forEach(([k, v]) => {
        const nv = clean(k, v);
        if (params[k] !== nv) { params[k] = nv; changed = true; }
      });
      if (changed) { writeParams(); schedule(); }
    },
    resetParams() { params = { ...DEFAULTS }; writeParams(); schedule(); },
    refresh() {},
    setLink() {},
  };

  load();
  document.addEventListener('DOMContentLoaded', () => { started = true; render(); });
})();
