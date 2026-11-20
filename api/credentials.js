/*
 * /api/credentials — гишүүдийн нэвтрэх эрх (зөвхөн админ).
 *   GET                                  → { items:[{ code, name, kind, place, username, password, t }] }
 *                                          Намын бүх гишүүн (members.enc); эрхгүй бол username хоосон
 *   POST {action:'generate'}             → эрхгүй бүх хүнд нэвтрэх нэр, санамсаргүй нууц үг үүсгэнэ
 *   POST {action:'generate', codes:[…]}  → зөвхөн заасан хүмүүст (эрхгүй бол)
 *   POST {action:'reset', code}          → нууц үгийг шинэчилнэ (нэвтрэх нэр хэвээр)
 */
const { sessionUser, send, readJson } = require('./_lib/session');
const { loadMembers, normalizeInvite, fmtInvite } = require('./_lib/members');
const { storeConfigured, pipeline, open, KEYS } = require('./_lib/store');
const { allCreds, ensureMany, resetPassword } = require('./_lib/creds');

const given = (full) => String(full || '').trim().split(/\s+/).pop();

/* Бүх хүн: намын гишүүд + бүртгүүлэгчид */
async function people() {
  const out = [];
  const data = loadMembers();
  const meta = data.meta || {};
  Object.entries(data.khoroo || {}).forEach(([k, list]) => (list || []).forEach((m) => {
    if (!m.i) return;
    const mk = meta[k] || {};
    out.push({ code: normalizeInvite(m.i), name: m.n, given: given(m.n), kind: 'member', place: [mk.district, mk.name].filter(Boolean).join(', ') });
  }));
  // Урилгаар бүртгүүлэгчид өөрийн урилгын кодоор нэвтэрдэг тул энд ороогүй
  return out;
}

module.exports = async function handler(req, res) {
  if (!sessionUser(req)) return send(res, 401, { error: 'login_required' });
  if (!storeConfigured()) return send(res, 503, { error: 'storage_not_configured' });
  try {
    let all;
    try { all = await people(); } catch (e) { if (e.code === 'not_configured') return send(res, 503, { error: 'not_configured' }); throw e; }
    if (req.method === 'GET') {
      const creds = await allCreds();
      const items = all.map((p) => { const c = creds.get(p.code); return { code: fmtInvite(p.code), name: p.name, kind: p.kind, place: p.place, username: c ? c.u : '', password: c ? c.pw : '', t: c ? c.t : null }; });
      return send(res, 200, { items });
    }
    if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return send(res, 405, { error: 'method' }); }
    const o = req.headers.origin;
    if (o) { try { if (new URL(o).host !== req.headers.host) return send(res, 403, { error: 'origin' }); } catch (e) { return send(res, 403, { error: 'origin' }); } }
    if (!/application\/json/i.test(req.headers['content-type'] || '')) return send(res, 415, { error: 'json_only' });
    const b = await readJson(req, 65536);
    if (b.action === 'generate') {
      const only = Array.isArray(b.codes) ? new Set(b.codes.map(normalizeInvite)) : null;
      const made = await ensureMany(all.filter((p) => !only || only.has(p.code)).map((p) => ({ code: p.code, given: p.given })));
      return send(res, 200, { ok: true, made });
    }
    if (b.action === 'reset') {
      const c = normalizeInvite(b.code);
      const p = all.find((x) => x.code === c);
      if (!p) return send(res, 404, { error: 'not_found' });
      const r = await resetPassword(c, p.given);
      return send(res, 200, { ok: true, username: r.u, password: r.pw });
    }
    return send(res, 400, { error: 'action' });
  } catch (e) {
    return send(res, 502, { error: 'store_error' });
  }
};
