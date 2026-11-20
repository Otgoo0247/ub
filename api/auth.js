/*
 * /api/auth — АДМИН нэвтрэх (/admin-login), гарах, сешн шалгах.
 *   GET  /api/auth                                   → { configured, authenticated, role: 'admin'|'member'|null, user }
 *        (гишүүн /login дээр урилгын кодоор /api/me-ээр нэвтэрнэ; энд зөвхөн түүний сешнийг таньж нэрийг буцаана)
 *   POST /api/auth {action:"login", username, password} → 12 цагийн HttpOnly күүки
 *   POST /api/auth {action:"logout", scope?:'admin'|'member'} → тухайн сешнийг (заагаагүй бол хоёуланг) хаана
 *   GET хариунд admin:{user}|null, member:{user,kind}|null — хоёр сешн зэрэг байж болно
 */
const { config, problems, sessionUser, setSession, clearSession, sameText, send, readJson } = require('./_lib/session');
const { memberCode, clearMember } = require('./_lib/membersession');
const { findByCode, fullName } = require('./_lib/people');
const { shortName } = require('./_lib/members');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = async function handler(req, res) {
  const cfg = config();
  if (req.method === 'GET') {
    const user = sessionUser(req, cfg);
    // Админ, гишүүний сешн тус тусдаа — зэрэг нэвтэрсэн байж болно
    const body = { configured: !!cfg, admin: user ? { user } : null, member: null };
    if (!cfg) body.problems = problems();
    const c = memberCode(req);
    if (c) {
      const p = await findByCode(c).catch(() => null);
      if (p) body.member = { user: shortName(fullName(p)), kind: p.kind };
      else clearMember(req, res);
    }
    // Хуучин талбарууд (анхдагч: админ)
    body.authenticated = !!(body.admin || body.member);
    body.role = body.admin ? 'admin' : body.member ? 'member' : null;
    body.user = body.admin ? body.admin.user : body.member ? body.member.user : null;
    return send(res, 200, body);
  }
  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return send(res, 405, { error: 'method' }); }
  if (!(req.headers['content-type'] || '').includes('application/json')) return send(res, 415, { error: 'json' });
  const body = await readJson(req);
  if (body.action === 'logout') {
    if (body.scope !== 'member') clearSession(req, res);   // 'admin' — зөвхөн админ
    if (body.scope !== 'admin') clearMember(req, res);     // 'member' — зөвхөн гишүүн; заагаагүй бол хоёулаа
    return send(res, 200, { ok: true });
  }
  if (body.action !== 'login') return send(res, 400, { error: 'action' });
  if (!cfg) return send(res, 503, { error: 'not_configured' });
  // Хоёуланг нь үргэлж шалгана (аль нь буруу болохыг цаг хугацаагаар ялгуулахгүй)
  const okUser = sameText(String(body.username || '').trim(), cfg.user);
  const okPass = sameText(body.password || '', cfg.password);
  if (!(okUser && okPass)) { await wait(1200); return send(res, 401, { error: 'wrong_credentials' }); }
  setSession(req, res, cfg);
  return send(res, 200, { authenticated: true, user: cfg.user });
};
