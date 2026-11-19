/*
 * /api/members                 — хотын бүх гишүүд
 * /api/members?district=Баянгол — дүүргийн гишүүд
 * /api/members?khoroo=BGD_01    — хорооны гишүүд          (бүгд зөвхөн нэвтэрсэн хэрэглэгчид)
 * Нэвтрэлтийг middleware.js ба api/_lib/session.js хариуцна; энд дахин шалгана (давхар хамгаалалт).
 * MEMBERS_KEY — private/members.enc-ийг тайлах 64 тэмдэгт hex түлхүүр (tools/members.key).
 */
const { sessionUser, send } = require('./_lib/session');
const { loadMembers } = require('./_lib/members');

const CODE_RE = /^[A-Z]{2,4}_\d{1,3}$/;

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return send(res, 405, { error: 'method' }); }
  if (!sessionUser(req)) return send(res, 401, { error: 'login_required' });
  const q = new URL(req.url, 'http://x').searchParams;
  const code = q.get('khoroo') || '', district = q.get('district') || '';
  if (code && !CODE_RE.test(code)) return send(res, 400, { error: 'khoroo' });
  let data;
  try { data = loadMembers(); } catch (e) { return send(res, e.code === 'not_configured' ? 503 : 500, { error: e.code || 'data_unreadable' }); }
  const meta = data.meta || {};
  if (district && !Object.values(meta).some((m) => m.district === district)) return send(res, 400, { error: 'district' });
  const codes = code ? [code] : Object.keys(data.khoroo).filter((c) => !district || (meta[c] && meta[c].district === district));
  const rows = [];
  codes.forEach((c) => (data.khoroo[c] || []).forEach((m) => rows.push({ ...m, dist: meta[c] ? meta[c].district : '', kno: meta[c] ? meta[c].no : 0, kh: meta[c] ? meta[c].name : c })));
  rows.sort((a, b) => a.dist.localeCompare(b.dist, 'mn') || a.kno - b.kno || a.n.localeCompare(b.n, 'mn'));
  return send(res, 200, { scope: code ? 'khoroo' : district ? 'district' : 'city', khoroo: code || null, district: district || null, generated: data.generated, members: rows });
};
