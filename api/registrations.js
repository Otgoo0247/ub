/*
 * GET /api/registrations — урилгаар бүртгүүлсэн хүмүүсийн жагсаалт (зөвхөн дашбоардад нэвтэрсэн хэрэглэгч).
 * ?counts=1 — зөвхөн урилгын код тутмын тоо.
 * ?invite=7KQ2M-X9D4P — тухайн гишүүний урилгаар бүртгүүлсэн хүмүүс (гишүүний цонхонд).
 */
const { sessionUser, send } = require('./_lib/session');
const { loadMembers, normalizeInvite } = require('./_lib/members');
const { storeConfigured, pipeline, open, KEYS } = require('./_lib/store');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return send(res, 405, { error: 'method' }); }
  if (!sessionUser(req)) return send(res, 401, { error: 'login_required' });
  if (!storeConfigured()) return send(res, 503, { error: 'storage_not_configured' });
  const q = new URL(req.url, 'http://x').searchParams;
  const countsOnly = q.get('counts') === '1';
  const only = q.get('invite') ? normalizeInvite(q.get('invite')) : '';
  try {
    if (countsOnly) {
      const [flat] = await pipeline([['HGETALL', KEYS.by]]);
      const counts = {};
      for (let i = 0; i + 1 < (flat || []).length; i += 2) counts[flat[i]] = Number(flat[i + 1]);
      return send(res, 200, { counts });
    }
    const [raw] = await pipeline([['LRANGE', KEYS.list, '0', '-1']]);
    let members = null;
    try { members = loadMembers(); } catch (e) { /* урьсан гишүүний нэргүйгээр буцаана */ }
    const rows = (raw || []).map(open).filter(Boolean).filter((r) => !only || normalizeInvite(r.invite) === only).map((r) => {
      const hit = members && members.byInvite.get(normalizeInvite(r.invite));
      const meta = hit && members.meta ? members.meta[hit.code] : null;
      return { ...r, inviter: hit ? hit.m.n : null, inviterPlace: meta ? `${meta.district}, ${meta.name}` : null };
    }).reverse();
    return send(res, 200, { total: rows.length, rows });
  } catch (e) {
    return send(res, 502, { error: 'store_error' });
  }
};
