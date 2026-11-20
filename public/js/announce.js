/*
 * announce.js — дашбоардын «Зарлал» товч: үйл ажиллагааны зарлал оруулах, засах, устгах (зөвхөн админ).
 * Оруулсан зарлал «Гишүүний мэдээлэл» цонх болон гишүүний /me хуудсанд харагдана (ann.js).
 */
(function () {
  'use strict';
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const ERR = {
    title_required: 'Гарчиг оруулна уу.', body_required: 'Агуулга оруулна уу.', too_many: 'Зарлалын тоо 100-д хүрсэн. Хуучныг устгаад дахин оролдоно уу.',
    storage_not_configured: 'Хадгалах сан (Upstash Redis) холбогдоогүй байна.', login_required: 'Сешн дууссан. Дахин нэвтэрнэ үү.',
    not_found: 'Энэ зарлал устгагдсан байна.', store_error: 'Сантай холбогдоход алдаа гарлаа. Дахин оролдоно уу.',
  };
  let dlg = null, editing = null;
  const $ = (s) => dlg.querySelector(s);

  function field(label, ctrl, cls) { const l = el('label', `ann-f${cls ? ` ${cls}` : ''}`); l.append(el('span', null, label), ctrl); return l; }

  function build() {
    dlg = el('dialog', 'ann-admin'); dlg.setAttribute('aria-labelledby', 'ann-admin-t');
    const head = el('header', 'ub-mdlg-head');
    const hl = el('div', 'ub-pm-headl');
    const lg = el('img', 'ub-pm-logo'); lg.src = 'logo.png?v=20261120-1'; lg.alt = 'SDS лого'; lg.width = 52; lg.height = 52;
    const hw = el('div'); const t = el('h2', 'ub-mdlg-t', 'Үйл ажиллагааны зарлал'); t.id = 'ann-admin-t';
    hw.append(el('p', 'ub-mdlg-eyebrow', 'Гишүүдэд харагдана'), t, el('p', 'ub-mdlg-sub', 'Гишүүний мэдээллийн цонх болон гишүүний хуудсанд «Анкет бөглөлт»-ийн доор гарна.'));
    hl.append(lg, hw);
    const x = el('button', 'ub-mdlg-x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Хаах'); x.addEventListener('click', () => dlg.close());
    head.append(hl, x);

    const form = el('form', 'ann-form'); form.noValidate = true;
    const title = el('input'); title.name = 'title'; title.maxLength = 120; title.required = true; title.placeholder = 'Ж: Хорооны гишүүдийн ээлжит хурал';
    const date = el('input'); date.type = 'date'; date.name = 'date';
    const time = el('input'); time.type = 'time'; time.name = 'time';
    const place = el('input'); place.name = 'place'; place.maxLength = 120; place.placeholder = 'Ж: 3-р хорооны танхим';
    const body = el('textarea'); body.name = 'body'; body.maxLength = 2000; body.required = true; body.placeholder = 'Зарлалын агуулга…';
    const len = el('span', 'ann-len', '0 / 2000');
    body.addEventListener('input', () => { len.textContent = `${body.value.length} / 2000`; });
    const bodyField = field('Агуулга *', body, 'is-wide'); bodyField.append(len);
    const bar = el('div', 'ann-formbar');
    const msg = el('span', 'ann-msg'); msg.setAttribute('role', 'status');
    const reset = el('button', 'ub-mdlg-btn', 'Цэвэрлэх'); reset.type = 'button';
    const submit = el('button', 'ub-mdlg-btn is-brand', 'Нийтлэх'); submit.type = 'submit';
    bar.append(msg, reset, submit);
    form.append(field('Гарчиг *', title, 'is-wide'), field('Огноо', date), field('Цаг', time), field('Байршил', place, 'is-place'), bodyField, bar);
    reset.addEventListener('click', () => clearForm());
    form.addEventListener('submit', (e) => { e.preventDefault(); save(); });

    const list = el('div', 'ann-adminlist');
    dlg.append(head, form, list);
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    (document.getElementById('ub') || document.body).append(dlg);
  }

  function setMsg(text, kind) { const m = $('.ann-msg'); m.textContent = text || ''; m.className = `ann-msg${kind ? ` is-${kind}` : ''}`; }

  function clearForm(keepMsg) {
    editing = null;
    const f = $('.ann-form'); f.reset(); $('.ann-len').textContent = '0 / 2000';
    $('.ann-formbar .is-brand').textContent = 'Нийтлэх';
    $('.ann-formbar .ub-mdlg-btn:not(.is-brand)').textContent = 'Цэвэрлэх';
    dlg.querySelectorAll('.ann-item.is-editing').forEach((li) => li.classList.remove('is-editing'));
    if (!keepMsg) setMsg('');
  }

  function edit(a, li) {
    editing = a.id;
    const f = $('.ann-form');
    f.elements.title.value = a.title || ''; f.elements.date.value = a.date || ''; f.elements.time.value = a.time || ''; f.elements.place.value = a.place || ''; f.elements.body.value = a.body || '';
    $('.ann-len').textContent = `${f.elements.body.value.length} / 2000`;
    $('.ann-formbar .is-brand').textContent = 'Хадгалах';
    $('.ann-formbar .ub-mdlg-btn:not(.is-brand)').textContent = 'Засварыг цуцлах';
    dlg.querySelectorAll('.ann-item.is-editing').forEach((x) => x.classList.remove('is-editing'));
    li.classList.add('is-editing');
    setMsg('Засварлаж байна…');
    f.elements.title.focus(); dlg.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function post(payload) {
    const r = await fetch('/api/announcements', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(ERR[j.error] || 'Хадгалж чадсангүй.');
    return j;
  }

  async function save() {
    const f = $('.ann-form');
    const p = { action: editing ? 'update' : 'create', id: editing || undefined, title: f.elements.title.value.trim(), body: f.elements.body.value.trim(), date: f.elements.date.value, time: f.elements.time.value, place: f.elements.place.value.trim() };
    if (!p.title) { setMsg(ERR.title_required, 'err'); f.elements.title.focus(); return; }
    if (!p.body) { setMsg(ERR.body_required, 'err'); f.elements.body.focus(); return; }
    const btn = $('.ann-formbar .is-brand'); btn.disabled = true;
    try {
      await post(p);
      const was = editing; clearForm(true);
      setMsg(was ? 'Зарлал шинэчлэгдлээ ✓' : 'Зарлал нийтлэгдлээ ✓', 'ok');
      refresh();
    } catch (e) { setMsg(e.message, 'err'); } finally { btn.disabled = false; }
  }

  async function remove(a, btn) {
    if (!btn.classList.contains('is-confirm')) {
      btn.classList.add('is-confirm'); btn.textContent = 'Устгах уу?';
      setTimeout(() => { btn.classList.remove('is-confirm'); btn.textContent = 'Устгах'; }, 3000);
      return;
    }
    btn.disabled = true;
    try { await post({ action: 'delete', id: a.id }); if (editing === a.id) clearForm(true); setMsg('Зарлал устгагдлаа.', 'ok'); refresh(); } catch (e) { setMsg(e.message, 'err'); btn.disabled = false; }
  }

  async function refresh() {
    const box = $('.ann-adminlist');
    window.UBAnn.invalidate();
    const d = await window.UBAnn.load(true);
    const sec = window.UBAnn.section(d, { heading: 'Нийтэлсэн зарлал', empty: d && d.storage === false ? 'Хадгалах сан (Upstash Redis) холбогдоогүй тул зарлал хадгалагдахгүй.' : 'Одоогоор зарлал алга. Дээрх маягтаар эхний зарлалаа оруулна уу.' });
    // Админд бүгдийг нь харуулж, засах/устгах товч нэмнэ
    sec.querySelectorAll('.ann-item').forEach((li, i) => {
      li.hidden = false;
      const a = d.items[i];
      const ops = el('div', 'ann-ops');
      const eb = el('button', null, 'Засах'); eb.type = 'button'; eb.addEventListener('click', () => edit(a, li));
      const db = el('button', 'is-del', 'Устгах'); db.type = 'button'; db.addEventListener('click', () => remove(a, db));
      ops.append(eb, db); li.append(ops);
      if (editing === a.id) li.classList.add('is-editing');
      const body = li.querySelector('.ann-body'); if (body) body.classList.remove('is-clamped');
      const more = li.querySelector('.ann-more'); if (more) more.remove();
    });
    const all = sec.querySelector('.ann-all'); if (all) all.remove();
    sec.style.border = '0'; sec.style.padding = '0';
    box.replaceChildren(sec);
  }

  function openAdmin() {
    if (!window.UBAnn) { alert('Хуудсыг Ctrl+F5-аар шинэчилнэ үү.'); return; }
    if (!dlg) build();
    if (!dlg.open) dlg.showModal();
    refresh();
    $('.ann-form').elements.title.focus();
  }

  document.querySelectorAll('#ub-ann').forEach((b) => b.addEventListener('click', openAdmin));
})();
