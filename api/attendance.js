/*
 * /api/attendance — гишүүдийн ирц (камерын зургаар баталгаажуулна). Бүртгэлийг ЗӨВХӨН АДМИН харна.
 *
 * Гишүүн (ub_member сешн):
 *   GET  ?mine=1                     → { today, events:[{id,title,time,place}], done:{eventKey: iso} }
 *        Үйл ажиллагаа = өнөөдрийн огноотой (эсвэл огноогүй, өнөөдөр нийтэлсэн) зарлалууд + «Ерөнхий ирц» (өдөрт нэг).
 *   POST {action:'checkin', event, photo:'data:image/jpeg;base64,…', shotAt}  (lat, lng, acc — заавал биш)
 *        Нэг үйл ажиллагаанд нэг л удаа. Цагийг СЕРВЕР тэмдэглэнэ.
 * Админ (ub_session):
 *   GET                              → { items:[…] } (зураггүй)
 *   GET  ?photo=<id>                 → image/jpeg
 *   POST {action:'delete', id}
 *
 * Хадгалалт (Upstash Redis, бүгд MEMBERS_KEY-ээр шифрлэгдэнэ):
 *   ubatt:v1:meta (hash id → бичлэг), ubatt:v1:ph:<id> (зураг), ubatt:v1:done:<eventKey>:<код> (давхардал)
 */
const crypto = require('crypto');
const { sessionUser, send, readJson } = require('./_lib/session');
const { memberCode } = require('./_lib/membersession');
const { storeConfigured, pipeline, seal, open } = require('./_lib/store');
const { findByCode, fullName } = require('./_lib/people');
const { fmtInvite } = require('./_lib/members');
const { listAnnouncements, todayUB } = require('./_lib/ann');

const K = { meta: 'ubatt:v1:meta', ph: 'ubatt:v1:ph:', done: 'ubatt:v1:done:' };
const MAX_PHOTO = 350 * 1024; // тайлсан JPEG-ийн дээд хэмжээ
const okId = (v) => (/^[a-f0-9]{16}$/.test(String(v || '')) ? String(v) : '');
const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };

function sameOrigin(req) {
  const o = req.headers.origin;
  if (!o) return true;
  try { return new URL(o).host === req.headers.host; } catch (e) { return false; }
}

function placeOf(p) {
  if (p.kind === 'member') return [p.meta.district, p.meta.name].filter(Boolean).join(', ');
  const a = p.r.addr || {};
  return a.type === 'city' ? `${a.district}, ${a.khoroo}` : a.type === 'aimag' ? `${a.aimag} аймаг, ${a.soum} сум` : '';
}

/* Өнөөдрийн үйл ажиллагаанууд: тухайн өдрийн огноотой зарлал + ерөнхий ирц */
async function todaysEvents() {
  const today = todayUB();
  // Өнөөдрийн огноотой зарлал, эсвэл огноогүй ч өнөөдөр нийтэлсэн зарлал
  const anns = (await listAnnouncements()).filter((a) => a.date === today || (!a.date && a.t && new Date(Date.parse(a.t) + 8 * 3600000).toISOString().slice(0, 10) === today))
    .sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
  return { today, events: [...anns.map((a) => ({ id: a.id, key: `a:${a.id}`, title: a.title, time: a.time || '', place: a.place || '' })),
    { id: 'general', key: `g:${today}`, title: 'Ерөнхий ирц', time: '', place: '', general: true }] };
}

async function mine(req, res, c) {
  const { today, events } = await todaysEvents();
  const got = await pipeline(events.map((e) => ['GET', `${K.done}${e.key}:${c}`]));
  const done = {};
  events.forEach((e, i) => { if (got[i]) done[e.id] = got[i]; });
  return send(res, 200, { today, events: events.map(({ key, ...e }) => e), done });
}

async function checkin(req, res, c) {
  const b = await readJson(req, 600 * 1024);
  const lat = num(b.lat, -90, 90), lng = num(b.lng, -180, 180), acc = num(b.acc, 0, 100000);
  const hasLoc = lat != null && lng != null; // байршил заавал биш (хуучин хувилбартай нийцүүлж хадгална)
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(b.photo || ''));
  if (!m) return send(res, 400, { error: 'photo_required' });
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length < 2000 || buf.length > MAX_PHOTO || buf[0] !== 0xFF || buf[1] !== 0xD8) return send(res, 400, { error: 'photo_invalid' });

  const { today, events } = await todaysEvents();
  const ev = events.find((e) => e.id === String(b.event || ''));
  if (!ev) return send(res, 400, { error: 'event' });
  const p = await findByCode(c).catch(() => null);
  if (!p) return send(res, 401, { error: 'login_required' });

  const id = crypto.randomBytes(8).toString('hex');
  const doneKey = `${K.done}${ev.key}:${c}`;
  const t = new Date().toISOString();
  // Давхардлыг атомаар хаана (SET NX); ерөнхий ирц 3 хоногийн дараа түлхүүр устна
  const [ok] = await pipeline([ev.general ? ['SET', doneKey, t, 'NX', 'EX', String(3 * 86400)] : ['SET', doneKey, t, 'NX']]);
  if (ok !== 'OK') return send(res, 409, { error: 'already', at: (await pipeline([['GET', doneKey]]))[0] });

  const shot = typeof b.shotAt === 'string' && !Number.isNaN(Date.parse(b.shotAt)) ? new Date(b.shotAt).toISOString() : null;
  const rec = { t, shot, lat: hasLoc ? lat : null, lng: hasLoc ? lng : null, acc: hasLoc ? acc : null, code: fmtInvite(c), name: fullName(p), kind: p.kind, place: placeOf(p),
    event: ev.id, eventTitle: ev.title, eventTime: ev.time, eventPlace: ev.place, date: today, doneKey, size: buf.length,
    ua: String(req.headers['user-agent'] || '').slice(0, 160) };
  try {
    await pipeline([['SET', K.ph + id, seal({ b64: m[1] })], ['HSET', K.meta, id, seal(rec)]]);
  } catch (e) {
    await pipeline([['DEL', doneKey]]).catch(() => {});
    throw e;
  }
  return send(res, 200, { ok: true, id, t, event: ev.title });
}

async function adminList(req, res) {
  const [flat] = await pipeline([['HGETALL', K.meta]]);
  const items = [];
  for (let i = 0; i + 1 < (flat || []).length; i += 2) {
    const r = open(flat[i + 1]);
    if (r) { const { doneKey, ...rest } = r; items.push({ id: flat[i], ...rest }); }
  }
  items.sort((a, b) => String(b.t).localeCompare(String(a.t)));
  return send(res, 200, { items });
}

async function adminPhoto(req, res, id) {
  const [raw] = await pipeline([['GET', K.ph + id]]);
  const o = raw ? open(raw) : null;
  if (!o || !o.b64) return send(res, 404, { error: 'not_found' });
  const buf = Buffer.from(o.b64, 'base64');
  res.statusCode = 200;
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Content-Length', String(buf.length));
  res.setHeader('Cache-Control', 'private, max-age=600');
  res.setHeader('X-Robots-Tag', 'noindex');
  return res.end(buf);
}

async function adminDelete(req, res) {
  const b = await readJson(req);
  const id = okId(b.id); if (!id) return send(res, 400, { error: 'id' });
  const [raw] = await pipeline([['HGET', K.meta, id]]);
  const r = raw ? open(raw) : null;
  const cmds = [['HDEL', K.meta, id], ['DEL', K.ph + id]];
  if (r && r.doneKey) cmds.push(['DEL', r.doneKey]); // устгавал гишүүн дахин бүртгүүлж болно
  await pipeline(cmds);
  return send(res, 200, { ok: true });
}

module.exports = async function handler(req, res) {
  // Админ, гишүүний сешн зэрэг байж болно: ирц бүртгэх нь ГИШҮҮНИЙ сешнээр, бүртгэл харах/устгах нь АДМИНЫ сешнээр
  const admin = sessionUser(req);
  const c = memberCode(req);
  if (!admin && !c) return send(res, 401, { error: 'login_required' });
  if (!storeConfigured()) return send(res, 503, { error: 'storage_not_configured' });
  const q = new URL(req.url, 'http://x').searchParams;
  try {
    if (req.method === 'GET') {
      if (q.get('mine') === '1') return c ? mine(req, res, c) : send(res, 401, { error: 'member_login_required' });
      if (!admin) return send(res, 403, { error: 'admin_only' });
      if (q.get('photo')) { const id = okId(q.get('photo')); return id ? adminPhoto(req, res, id) : send(res, 400, { error: 'id' }); }
      return adminList(req, res);
    }
    if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return send(res, 405, { error: 'method' }); }
    if (!sameOrigin(req)) return send(res, 403, { error: 'origin' });
    if (!/application\/json/i.test(req.headers['content-type'] || '')) return send(res, 415, { error: 'json_only' });
    const peek = await readJson(req, 600 * 1024); req.body = peek;
    if (peek.action === 'checkin') return c ? checkin(req, res, c) : send(res, 401, { error: 'member_login_required' });
    if (peek.action === 'delete') return admin ? adminDelete(req, res) : send(res, 403, { error: 'admin_only' });
    return send(res, 400, { error: 'action' });
  } catch (e) {
    return send(res, 502, { error: 'store_error' });
  }
};
