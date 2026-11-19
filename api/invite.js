/*
 * /api/invite?c=7KQ2M-X9D4P — урилгын холбоосын НИЙТЭД нээлттэй шалгалт (нэвтрэлт шаардахгүй).
 * Зөвхөн урьж буй гишүүний товч нэр (Х. Нэр) ба дүүргийг буцаана; нас, хороо, үүр, утас, регистр БУЦААХГҮЙ.
 * Код 50 бит санамсаргүй тул таах боломжгүй. registration: бүртгэлийн сан тохируулагдсан эсэх.
 */
const { send } = require('./_lib/session');
const { loadMembers, normalizeInvite, INVITE_RE, fmtInvite, shortName } = require('./_lib/members');
const { storeConfigured } = require('./_lib/store');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return send(res, 405, { error: 'method' }); }
  const c = normalizeInvite(new URL(req.url, 'http://x').searchParams.get('c'));
  if (!INVITE_RE.test(c)) return send(res, 400, { error: 'format' });
  let data;
  try { data = loadMembers(); } catch (e) { return send(res, e.code === 'not_configured' ? 503 : 500, { error: e.code || 'data_unreadable' }); }
  const hit = data.byInvite.get(c);
  if (!hit) { await new Promise((r) => setTimeout(r, 400)); return send(res, 404, { error: 'not_found' }); }
  const meta = (data.meta || {})[hit.code] || {};
  return send(res, 200, { code: fmtInvite(c), inviter: shortName(hit.m.n), district: meta.district || null, registration: storeConfigured() });
};
