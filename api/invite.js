/*
 * /api/invite?c=7KQ2M-X9D4P — урилгын холбоосын НИЙТЭД нээлттэй шалгалт (нэвтрэлт шаардахгүй).
 * Зөвхөн урьж буй хүний товч нэр (Х. Нэр) ба дүүрэг/аймгийг буцаана; бусад мэдээлэл БУЦААХГҮЙ.
 * Код нь Excel-ийн гишүүнийх эсвэл урилгаар бүртгүүлсэн хүний өөрийн код байж болно.
 */
const { send } = require('./_lib/session');
const { normalizeInvite, INVITE_RE, fmtInvite, shortName } = require('./_lib/members');
const { storeConfigured } = require('./_lib/store');
const { findByCode, fullName, districtOf } = require('./_lib/people');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return send(res, 405, { error: 'method' }); }
  const c = normalizeInvite(new URL(req.url, 'http://x').searchParams.get('c'));
  if (!INVITE_RE.test(c)) return send(res, 400, { error: 'format' });
  let p;
  try { p = await findByCode(c); } catch (e) { return send(res, e.code === 'not_configured' ? 503 : 500, { error: e.code || 'data_unreadable' }); }
  if (!p) { await new Promise((r) => setTimeout(r, 400)); return send(res, 404, { error: 'not_found' }); }
  return send(res, 200, { code: fmtInvite(c), inviter: shortName(fullName(p)), district: districtOf(p), registration: storeConfigured() });
};
