/*
 * /api/members?khoroo=BGD_01 — сонгосон хорооны гишүүдийн нэрс (зөвхөн нэвтэрсэн хэрэглэгчид).
 * Нэвтрэлтийг middleware.js ба api/_lib/session.js хариуцна; энд дахин шалгана (давхар хамгаалалт).
 * MEMBERS_KEY — private/members.enc-ийг тайлах 64 тэмдэгт hex түлхүүр (tools/members.key).
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { sessionUser, send } = require('./_lib/session');

const MAGIC = Buffer.from('UBM1');
const CODE_RE = /^[A-Z]{2,4}_\d{1,3}$/;
let cache = null;

function loadMembers() {
  if (cache) return cache;
  const hex = (process.env.MEMBERS_KEY || '').trim();
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw Object.assign(new Error('no key'), { code: 'not_configured' });
  const buf = fs.readFileSync(path.join(process.cwd(), 'private', 'members.enc'));
  if (!buf.subarray(0, 4).equals(MAGIC)) throw new Error('bad file');
  const iv = buf.subarray(4, 16), body = buf.subarray(16, buf.length - 16), tag = buf.subarray(buf.length - 16);
  const d = crypto.createDecipheriv('aes-256-gcm', Buffer.from(hex, 'hex'), iv);
  d.setAAD(MAGIC); d.setAuthTag(tag);
  cache = JSON.parse(zlib.gunzipSync(Buffer.concat([d.update(body), d.final()])).toString('utf8'));
  return cache;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return send(res, 405, { error: 'method' }); }
  if (!sessionUser(req)) return send(res, 401, { error: 'login_required' });
  const code = new URL(req.url, 'http://x').searchParams.get('khoroo') || '';
  if (!CODE_RE.test(code)) return send(res, 400, { error: 'khoroo' });
  let data;
  try { data = loadMembers(); } catch (e) { return send(res, e.code === 'not_configured' ? 503 : 500, { error: e.code || 'data_unreadable' }); }
  return send(res, 200, { khoroo: code, generated: data.generated, members: data.khoroo[code] || [] });
};
