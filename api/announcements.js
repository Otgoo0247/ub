/*
 * /api/announcements — үйл ажиллагааны зарлал.
 *   GET                                   → {items:[…]} (дашбоардын админ ЭСВЭЛ «Гишүүнээр нэвтрэх» сешнтэй хүн)
 *   POST {action:'create', title, body, date?, time?, place?}   — зөвхөн админ
 *   POST {action:'update', id, title, body, date?, time?, place?} — зөвхөн админ
 *   POST {action:'delete', id}                                   — зөвхөн админ
 * Хадгалалт: Upstash Redis-ийн нэг hash (ubann:v1), зарлал бүр MEMBERS_KEY-ээр шифрлэгдэнэ.
 */
const crypto = require('crypto');
const { sessionUser, send, readJson } = require('./_lib/session');
const { memberCode } = require('./_lib/membersession');
const { storeConfigured, pipeline, seal, open } = require('./_lib/store');
const { listAnnouncements } = require('./_lib/ann');

const KEY = 'ubann:v1';
const MAX_ITEMS = 100;
const LIM = { title: 120, body: 2000, place: 120 };

const clean = (v, n) => String(v == null ? '' : v).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, n);
const okDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) ? v : '');
const okTime = (v) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : '');
const okId = (v) => (/^[a-f0-9]{16}$/.test(String(v || '')) ? String(v) : '');

function fields(b) {
  const f = { title: clean(b.title, LIM.title), body: clean(b.body, LIM.body), place: clean(b.place, LIM.place),
    date: okDate(String(b.date || '')), time: okTime(String(b.time || '')) };
  if (!f.title) return { error: 'title_required' };
  if (!f.body) return { error: 'body_required' };
  return { f };
}

const all = listAnnouncements;

/* Өөр сайтаас илгээсэн хүсэлтийг хаана (күүки SameSite=Lax ч нэмэлт хамгаалалт). */
function sameOrigin(req) {
  const o = req.headers.origin;
  if (!o) return true;
  try { return new URL(o).host === req.headers.host; } catch (e) { return false; }
}

module.exports = async function handler(req, res) {
  const admin = sessionUser(req);
  if (req.method === 'GET') {
    if (!admin && !memberCode(req)) return send(res, 401, { error: 'login_required' });
    if (!storeConfigured()) return send(res, 200, { items: [], storage: false });
    try {
      const items = (await all()).map(({ id, title, body, date, time, place, t, u }) => ({ id, title, body, date, time, place, t, u: u || null }));
      return send(res, 200, { items, storage: true });
    } catch (e) { return send(res, 502, { error: 'store_error' }); }
  }
  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return send(res, 405, { error: 'method' }); }
  if (!admin) return send(res, 401, { error: 'login_required' });
  if (!sameOrigin(req)) return send(res, 403, { error: 'origin' });
  if (!/application\/json/i.test(req.headers['content-type'] || '')) return send(res, 415, { error: 'json_only' });
  if (!storeConfigured()) return send(res, 503, { error: 'storage_not_configured' });

  const b = await readJson(req, 16384);
  try {
    if (b.action === 'delete') {
      const id = okId(b.id); if (!id) return send(res, 400, { error: 'id' });
      await pipeline([['HDEL', KEY, id]]);
      return send(res, 200, { ok: true });
    }
    if (b.action === 'create' || b.action === 'update') {
      const { f, error } = fields(b);
      if (error) return send(res, 400, { error });
      let id, t;
      if (b.action === 'update') {
        id = okId(b.id); if (!id) return send(res, 400, { error: 'id' });
        const [raw] = await pipeline([['HGET', KEY, id]]);
        const prev = raw ? open(raw) : null;
        if (!prev) return send(res, 404, { error: 'not_found' });
        t = prev.t;
      } else {
        const [n] = await pipeline([['HLEN', KEY]]);
        if (Number(n) >= MAX_ITEMS) return send(res, 409, { error: 'too_many' });
        id = crypto.randomBytes(8).toString('hex'); t = new Date().toISOString();
      }
      const rec = { ...f, t, u: b.action === 'update' ? new Date().toISOString() : null, by: admin };
      await pipeline([['HSET', KEY, id, seal(rec)]]);
      return send(res, 200, { ok: true, id });
    }
    return send(res, 400, { error: 'action' });
  } catch (e) {
    return send(res, 502, { error: 'store_error' });
  }
};
