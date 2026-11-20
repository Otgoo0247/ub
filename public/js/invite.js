/*
 * invite.js — /invite?c=КОД нийтийн хуудас.
 * 1) Кодыг /api/invite-ээр шалгаж урьсан гишүүний товч нэрийг харуулна.
 * 2) Бүртгэлийн маягт: овог, нэр, төрсөн огноо, хүйс, утас, хаяг (Улаанбаатар → дүүрэг, хороо | аймаг → сум) → POST /api/register.
 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const raw = new URLSearchParams(location.search).get('c') || '';
  const lead = $('iv-lead');
  const fail = (t) => { lead.textContent = t; lead.classList.add('iv-bad'); };
  const opt = (v, t) => Object.assign(document.createElement('option'), { value: v, textContent: t == null ? v : t });
  const fill = (sel, list, ph) => { sel.replaceChildren(opt('', ph), ...list.map((v) => opt(v))); };
  let code = '';

  if (!raw) { fail('Холбоос дутуу байна: урилгын код олдсонгүй. Урьсан хүнээсээ холбоосыг дахин авна уу.'); return; }

  Promise.all([
    fetch(`/api/invite?c=${encodeURIComponent(raw)}`, { credentials: 'omit' }).then(async (r) => ({ status: r.status, d: await r.json().catch(() => ({})) })),
    fetch('/js/invite-address.json', { credentials: 'omit' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]).then(([{ status, d }, addr]) => {
    if (status !== 200) { fail(status === 404 || status === 400 ? 'Энэ урилгын код хүчингүй байна. Урьсан хүнээсээ холбоосыг дахин шалгуулна уу.' : 'Урилгыг одоогоор шалгаж чадсангүй. Түр хүлээгээд дахин оролдоно уу.'); return; }
    code = d.code;
    lead.replaceChildren(Object.assign(document.createElement('b'), { textContent: d.inviter }),
      document.createTextNode(d.district ? ` (${d.district} дүүрэг) таныг гишүүнээр элсэхийг урьж байна.` : ' таныг гишүүнээр элсэхийг урьж байна.'));
    $('iv-code').textContent = d.code; $('iv-codeline').hidden = false;
    if (!d.registration || !addr) { $('iv-done').hidden = false; $('iv-done').querySelector('h2').textContent = 'Бүртгэл түр хаалттай'; $('iv-done-t').textContent = 'Онлайн бүртгэл одоогоор нээгдээгүй байна. Урьсан хүндээ урилгын кодоо хэлж бүртгүүлнэ үү.'; $('iv-done').querySelector('.iv-check').hidden = true; return; }
    setupForm(addr);
  }).catch(() => fail('Сервертэй холбогдож чадсангүй.'));

  function setupForm(addr) {
    const form = $('iv-form'), dist = $('iv-district'), kh = $('iv-khoroo'), aim = $('iv-aimagsel'), soum = $('iv-soum');
    fill(dist, Object.keys(addr.city.districts), 'Сонгох…');
    fill(aim, Object.keys(addr.aimags), 'Сонгох…');
    dist.addEventListener('change', () => { kh.disabled = !dist.value; fill(kh, addr.city.districts[dist.value] || [], dist.value ? 'Сонгох…' : 'Эхлээд дүүрэг'); });
    aim.addEventListener('change', () => { soum.disabled = !aim.value; fill(soum, addr.aimags[aim.value] || [], aim.value ? 'Сонгох…' : 'Эхлээд аймаг'); });
    const atype = () => form.querySelector('input[name=atype]:checked').value;
    form.querySelectorAll('input[name=atype]').forEach((r) => r.addEventListener('change', () => {
      const city = atype() === 'city';
      $('iv-city').hidden = !city; $('iv-aimag').hidden = city;
      dist.required = city; kh.required = city; aim.required = !city; soum.required = !city;
    }));
    $('iv-phone').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/[^\d+ ]/g, ''); });
    form.addEventListener('input', (e) => { e.target.removeAttribute('aria-invalid'); const g = e.target.closest('[aria-invalid]'); if (g) g.removeAttribute('aria-invalid'); if (!form.querySelector('[aria-invalid]')) $('iv-msg').textContent = ''; });
    form.addEventListener('change', (e) => { e.target.removeAttribute('aria-invalid'); const g = e.target.closest('[aria-invalid]'); if (g) g.removeAttribute('aria-invalid'); if (!form.querySelector('[aria-invalid]')) $('iv-msg').textContent = ''; });
    const today = new Date(); const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    $('iv-dob').max = iso(today);
    form.hidden = false;

    const LABEL = { last: 'овог', first: 'нэр', dob: 'төрсөн он, сар, өдөр', gender: 'хүйс', phone: 'утасны дугаар (8 оронтой)', addr: 'хаяг', consent: 'зөвшөөрөл', fb: 'Facebook хаяг (facebook.com/… хэлбэртэй)' };
    const FIELD = { last: 'iv-last', first: 'iv-first', dob: 'iv-dob', gender: 'iv-gender', phone: 'iv-phone', consent: 'iv-consent', fb: 'iv-fb' };
    const gender = () => { const g = form.querySelector('input[name=gender]:checked'); return g ? g.value : ''; };
    const msg = $('iv-msg'), btn = $('iv-btn');
    function mark(fields) {
      form.querySelectorAll('[aria-invalid]').forEach((e) => e.removeAttribute('aria-invalid'));
      fields.forEach((f) => {
        const ids = f === 'addr' ? (atype() === 'city' ? ['iv-district', 'iv-khoroo'] : ['iv-aimagsel', 'iv-soum']) : [FIELD[f]];
        ids.forEach((id) => { const e = $(id); if (e && (f !== 'addr' || !e.value)) e.setAttribute('aria-invalid', 'true'); });
      });
      const first = form.querySelector('[aria-invalid]'); if (first) first.focus();
    }
    function check() {
      const bad = [];
      const name = /^[\p{L}][\p{L}\s.'’-]{0,39}$/u;
      if (!name.test($('iv-last').value.trim())) bad.push('last');
      if (!name.test($('iv-first').value.trim())) bad.push('first');
      const dob = $('iv-dob').value;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || dob < '1920-01-01' || dob > $('iv-dob').max) bad.push('dob');
      if (!gender()) bad.push('gender');
      if (!/^(\+?976)?[5-9]\d{7}$/.test($('iv-phone').value.replace(/\s/g, ''))) bad.push('phone');
      if (atype() === 'city' ? !(dist.value && kh.value) : !(aim.value && soum.value)) bad.push('addr');
      const fbv = $('iv-fb').value.trim();
      if (fbv && !/^(https?:\/\/)?([a-z]+\.)?(facebook\.com|fb\.com|fb\.me)\/\S+/i.test(fbv)) bad.push('fb');
      if (!$('iv-consent').checked) bad.push('consent');
      return bad;
    }
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const bad = check();
      if (bad.length) { msg.textContent = `Дараахыг шалгана уу: ${bad.map((f) => LABEL[f]).join(', ')}.`; mark(bad); return; }
      mark([]); msg.textContent = ''; btn.disabled = true; btn.firstChild.textContent = 'Илгээж байна… ';
      const body = {
        c: code, last: $('iv-last').value.trim(), first: $('iv-first').value.trim(), dob: $('iv-dob').value, gender: gender(), phone: $('iv-phone').value, fb: $('iv-fb').value.trim(), consent: true, website: $('iv-website').value,
        addr: atype() === 'city' ? { type: 'city', district: dist.value, khoroo: kh.value } : { type: 'aimag', aimag: aim.value, soum: soum.value },
      };
      fetch('/api/register', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(async (r) => ({ status: r.status, d: await r.json().catch(() => ({})) }))
        .then(({ status, d }) => {
          if (status === 201 || status === 200) {
            form.hidden = true; $('iv-done').hidden = false;
            $('iv-done-t').textContent = d.code ? `Таны урилгын код: ${d.code}. Өөрийн хуудас руу шилжиж байна…` : 'Баярлалаа!';
            if (d.code) setTimeout(() => location.assign('/me?welcome=1'), 1500);
            return;
          }
          const t = {
            409: 'Энэ утасны дугаараар аль хэдийн бүртгүүлсэн байна.',
            429: d.error === 'invite_full' ? 'Энэ урилгын кодоор бүртгэх дээд хязгаарт хүрсэн байна.' : 'Хэт олон оролдлого хийлээ. Түр хүлээгээд дахин оролдоно уу.',
            503: 'Онлайн бүртгэл одоогоор нээгдээгүй байна.',
          }[status];
          if (status === 400 && d.fields) { msg.textContent = `Дараахыг шалгана уу: ${d.fields.map((f) => LABEL[f] || f).join(', ')}.`; mark(d.fields); }
          else msg.textContent = t || 'Бүртгэлийг хадгалж чадсангүй. Дахин оролдоно уу.';
        })
        .catch(() => { msg.textContent = 'Сервертэй холбогдож чадсангүй.'; })
        .finally(() => { btn.disabled = false; btn.firstChild.textContent = 'Бүртгүүлэх '; });
    });
  }
})();
