/*
 * Нэвтрэлтийн сешн (Node функцуудад). middleware.js яг ижил аргаар шалгадаг тул хоёуланг нь хамт өөрчилнө.
 * Күүки: ub_session = v1.<нэр base64url>.<дуусах хугацаа>.<HMAC-SHA256>
 * Түлхүүр: SHA-256("ubdash-session-v1|AUTH_USERNAME|AUTH_PASSWORD|MEMBERS_KEY") — нууц үг солиход бүх сешн хүчингүй.
 */
const crypto = require('crypto');

const COOKIE = 'ub_session';
const HOURS = 12;

// Тохиргооны дутагдлыг утгыг нь ил гаргахгүйгээр нэрлэнэ (нэвтрэх хуудсанд тайлбар харуулахад).
function problems() {
  const out = [];
  if (!('AUTH_USERNAME' in process.env)) out.push('AUTH_USERNAME_missing');
  else if (!process.env.AUTH_USERNAME.trim()) out.push('AUTH_USERNAME_empty');
  if (!('AUTH_PASSWORD' in process.env)) out.push('AUTH_PASSWORD_missing');
  else if (process.env.AUTH_PASSWORD.length < 12) out.push('AUTH_PASSWORD_too_short');
  return out;
}
function config() {
  const user = (process.env.AUTH_USERNAME || '').trim();
  const password = process.env.AUTH_PASSWORD || '';
  if (!user || password.length < 12) return null;
  const key = crypto.createHash('sha256').update(`ubdash-session-v1|${user}|${password}|${process.env.MEMBERS_KEY || ''}`).digest();
  return { user, password, key };
}
const mac = (key, payload) => crypto.createHmac('sha256', key).update(payload).digest('base64url');

function sameText(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}
function readCookie(req) {
  const part = (req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
  return part ? decodeURIComponent(part.slice(COOKIE.length + 1)) : '';
}
function sessionUser(req, cfg = config()) {
  if (!cfg) return null;
  const [v, u, exp, m] = readCookie(req).split('.');
  if (v !== 'v1' || !u || !/^\d+$/.test(exp || '') || Number(exp) < Date.now() / 1000 || !m) return null;
  return sameText(m, mac(cfg.key, `v1.${u}.${exp}`)) ? Buffer.from(u, 'base64url').toString('utf8') : null;
}
function setSession(req, res, cfg) {
  const exp = Math.floor(Date.now() / 1000) + HOURS * 3600;
  const payload = `v1.${Buffer.from(cfg.user).toString('base64url')}.${exp}`;
  writeCookie(req, res, `${payload}.${mac(cfg.key, payload)}`, HOURS * 3600);
}
function clearSession(req, res) { writeCookie(req, res, '', 0); }
function writeCookie(req, res, value, maxAge) {
  const secure = (req.headers['x-forwarded-proto'] || '').includes('https') ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`);
}
function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.end(body === undefined ? '' : JSON.stringify(body));
}
async function readJson(req, max = 4096) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > max) return {}; chunks.push(c); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return {}; }
}

module.exports = { config, problems, sessionUser, setSession, clearSession, sameText, send, readJson };
