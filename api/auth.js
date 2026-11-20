/*
 * /api/auth — АДМИН нэвтрэх (/admin-login), гарах, сешн шалгах.
 *   GET  /api/auth                                   → { configured, authenticated, role: 'admin'|'member'|null, user }
 *        (гишүүн /login дээр урилгын кодоор /api/me-ээр нэвтэрнэ; энд зөвхөн түүний сешнийг таньж нэрийг буцаана)
 *   POST /api/auth {action:"login", username, password} → 12 цагийн HttpOnly күүки
 *   POST /api/auth {action:"logout"}                 → админ, гишүүний аль алиных нь күүкиг устгана
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
    const body = { configured: !!cfg, authenticated: !!user, role: user ? 'admin' : null, user: user || null };
    if (!cfg) body.problems = problems();
    if (!user) {
      const c = memberCode(req);
      if (c) {
        const p = await findByCode(c).catch(() => null);
        if (p) Object.assign(body, { authenticated: true, role: 'member', user: shortName(fullName(p)), kind: p.kind });
        else clearMember(req, res);
      }
    }
    return send(res, 200, body);
  }
  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return send(res, 405, { error: 'method' }); }
  if (!(req.headers['content-type'] || '').includes('application/json')) return send(res, 415, { error: 'json' });
  const body = await readJson(req);
  if (body.action === 'logout') { clearSession(req, res); clearMember(req, res); return send(res, 200, { authenticated: false }); }
  if (body.action !== 'login') return send(res, 400, { error: 'action' });
  if (!cfg) return send(res, 503, { error: 'not_configured' });
  // Хоёуланг нь үргэлж шалгана (аль нь буруу болохыг цаг хугацаагаар ялгуулахгүй)
  const okUser = sameText(String(body.username || '').trim(), cfg.user);
  const okPass = sameText(body.password || '', cfg.password);
  if (!(okUser && okPass)) { await wait(1200); return send(res, 401, { error: 'wrong_credentials' }); }
  setSession(req, res, cfg);
  return send(res, 200, { authenticated: true, user: cfg.user });
};
