/*
 * /api/auth — нэвтрэх, гарах, сешн шалгах.
 *   GET  /api/auth                                   → { configured, authenticated, user }
 *   POST /api/auth {action:"login", username, password} → 12 цагийн HttpOnly күүки
 *   POST /api/auth {action:"logout"}                 → күүкиг устгана
 */
const { config, problems, sessionUser, setSession, clearSession, sameText, send, readJson } = require('./_lib/session');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = async function handler(req, res) {
  const cfg = config();
  if (req.method === 'GET') {
    const user = sessionUser(req, cfg);
    const body = { configured: !!cfg, authenticated: !!user, user: user || null };
    if (!cfg) body.problems = problems();
    return send(res, 200, body);
  }
  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return send(res, 405, { error: 'method' }); }
  if (!(req.headers['content-type'] || '').includes('application/json')) return send(res, 415, { error: 'json' });
  const body = await readJson(req);
  if (body.action === 'logout') { clearSession(req, res); return send(res, 200, { authenticated: false }); }
  if (body.action !== 'login') return send(res, 400, { error: 'action' });
  if (!cfg) return send(res, 503, { error: 'not_configured' });
  // Хоёуланг нь үргэлж шалгана (аль нь буруу болохыг цаг хугацаагаар ялгуулахгүй)
  const okUser = sameText(String(body.username || '').trim(), cfg.user);
  const okPass = sameText(body.password || '', cfg.password);
  if (!(okUser && okPass)) { await wait(1200); return send(res, 401, { error: 'wrong_credentials' }); }
  setSession(req, res, cfg);
  return send(res, 200, { authenticated: true, user: cfg.user });
};
