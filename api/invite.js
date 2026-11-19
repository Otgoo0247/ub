/*
 * /api/invite?c=7KQ2M-X9D4P — урилгын холбоосын НИЙТЭД нээлттэй шалгалт (нэвтрэлт шаардахгүй).
 * Зөвхөн урьж буй гишүүний товч нэр (Х. Нэр) ба дүүргийг буцаана; нас, хороо, үүр, утас, регистр БУЦААХГҮЙ.
 * Код 50 бит санамсаргүй тул таах боломжгүй. INVITE_JOIN_URL (заавал биш) — «Бүртгүүлэх» товчны хаяг;
 * тохируулсан бол код ?ref=… параметрээр дамжина.
 */
const { send } = require('./_lib/session');
const { loadMembers } = require('./_lib/members');

const CROCK = /^[0-9A-HJKMNP-TV-Z]{10}$/;

function normalize(raw) {
  return String(raw || '').toUpperCase().replace(/[\s-]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0').replace(/U/g, 'V');
}
function shortName(full) {
  const parts = String(full).split(/\s+/).filter(Boolean);
  const title = (w) => w.charAt(0).toLocaleUpperCase('mn') + w.slice(1).toLocaleLowerCase('mn');
  if (parts.length < 2) return title(parts[0] || '');
  return `${parts[0].charAt(0).toLocaleUpperCase('mn')}. ${parts.slice(1).map(title).join(' ')}`;
}
function joinUrl(code) {
  const base = (process.env.INVITE_JOIN_URL || '').trim();
  if (!/^https:\/\//i.test(base)) return null;
  try { const u = new URL(base); u.searchParams.set('ref', code); return u.toString(); } catch (e) { return null; }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return send(res, 405, { error: 'method' }); }
  const c = normalize(new URL(req.url, 'http://x').searchParams.get('c'));
  if (!CROCK.test(c)) return send(res, 400, { error: 'format' });
  let data;
  try { data = loadMembers(); } catch (e) { return send(res, e.code === 'not_configured' ? 503 : 500, { error: e.code || 'data_unreadable' }); }
  const hit = data.byInvite.get(c);
  if (!hit) { await new Promise((r) => setTimeout(r, 400)); return send(res, 404, { error: 'not_found' }); }
  const code = `${c.slice(0, 5)}-${c.slice(5)}`;
  const meta = (data.meta || {})[hit.code] || {};
  return send(res, 200, { code, inviter: shortName(hit.m.n), district: meta.district || null, joinUrl: joinUrl(code) });
};
