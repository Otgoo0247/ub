/*
 * Гишүүний сешн (/login): намын гишүүн — нэвтрэх нэр + нууц үг (api/_lib/creds.js); урилгаар бүртгүүлэгч — өөрийн урилгын код: ub_member = v1.<урилгын код>.<дуусах>.<HMAC-SHA256>
 * Түлхүүр: HMAC(MEMBERS_KEY, 'ubdash-member-session-v1'). Админы ub_session-оос тусдаа.
 * Намын гишүүн: дашбоардын статистик, /me, ирц, зарлал. Бүртгүүлэгч: ЗӨВХӨН өөрийн хуудас (/me).
 * middleware.js яг ижил аргаар шалгадаг тул хоёуланг нь хамт өөрчилнө.
 */
const crypto = require('crypto');

const COOKIE = 'ub_member';
const DAYS = 7;
function key() {
  const hex = (process.env.MEMBERS_KEY || '').trim();
  return /^[0-9a-fA-F]{64}$/.test(hex) ? crypto.createHmac('sha256', Buffer.from(hex, 'hex')).update('ubdash-member-session-v1').digest() : null;
}
const mac = (k, s) => crypto.createHmac('sha256', k).update(s).digest('base64url');
function read(req) {
  const part = (req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
  return part ? decodeURIComponent(part.slice(COOKIE.length + 1)) : '';
}
/* Күүки: v2.<код>.<төрөл m|r>.<дуусах>.<HMAC> — m = намын гишүүн, r = урилгаар бүртгүүлэгч (зөвхөн /me) */
function memberSession(req) {
  const k = key(); if (!k) return null;
  const [v, code, kind, exp, m] = read(req).split('.');
  if (v !== 'v2' || !/^[0-9A-HJKMNP-TV-Z]{10}$/.test(code || '') || !/^[mr]$/.test(kind || '') || !/^\d+$/.test(exp || '') || Number(exp) < Date.now() / 1000 || !m) return null;
  const want = mac(k, `v2.${code}.${kind}.${exp}`);
  return want.length === m.length && crypto.timingSafeEqual(Buffer.from(want), Buffer.from(m)) ? { code, kind: kind === 'm' ? 'member' : 'registrant' } : null;
}
const memberCode = (req) => { const s = memberSession(req); return s ? s.code : null; };
function write(req, res, value, maxAge) {
  const secure = (req.headers['x-forwarded-proto'] || '').includes('https') ? '; Secure' : '';
  const prev = res.getHeader('Set-Cookie');
  const c = `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
  res.setHeader('Set-Cookie', prev ? [].concat(prev, c) : c);
}
function setMember(req, res, code, kind) {
  const k = key(); if (!k) return;
  const exp = Math.floor(Date.now() / 1000) + DAYS * 86400;
  const payload = `v2.${code}.${kind === 'member' ? 'm' : 'r'}.${exp}`;
  write(req, res, `${payload}.${mac(k, payload)}`, DAYS * 86400);
  require('./session').setRole(req, res, 'member', DAYS * 86400);
}
function clearMember(req, res) { write(req, res, '', 0); require('./session').setRole(req, res, 'member', 0); }

module.exports = { memberCode, memberSession, setMember, clearMember };
