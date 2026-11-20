/*
 * Гишүүний сешн (/login — урилгын кодоор): ub_member = v1.<урилгын код>.<дуусах>.<HMAC-SHA256>
 * Түлхүүр: HMAC(MEMBERS_KEY, 'ubdash-member-session-v1'). Админы ub_session-оос тусдаа.
 * Гишүүн дашбоардын статистик, өөрийн хуудас (/me), зарлалыг харна; нэрсийн жагсаалт, бүртгэл, /admin-д хандахгүй.
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
function memberCode(req) {
  const k = key(); if (!k) return null;
  const [v, code, exp, m] = read(req).split('.');
  if (v !== 'v1' || !/^[0-9A-HJKMNP-TV-Z]{10}$/.test(code || '') || !/^\d+$/.test(exp || '') || Number(exp) < Date.now() / 1000 || !m) return null;
  const want = mac(k, `v1.${code}.${exp}`);
  return want.length === m.length && crypto.timingSafeEqual(Buffer.from(want), Buffer.from(m)) ? code : null;
}
function write(req, res, value, maxAge) {
  const secure = (req.headers['x-forwarded-proto'] || '').includes('https') ? '; Secure' : '';
  const prev = res.getHeader('Set-Cookie');
  const c = `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
  res.setHeader('Set-Cookie', prev ? [].concat(prev, c) : c);
}
function setMember(req, res, code) {
  const k = key(); if (!k) return;
  const exp = Math.floor(Date.now() / 1000) + DAYS * 86400;
  const payload = `v1.${code}.${exp}`;
  write(req, res, `${payload}.${mac(k, payload)}`, DAYS * 86400);
  require('./session').setRole(req, res, 'member', DAYS * 86400);
}
function clearMember(req, res) { write(req, res, '', 0); require('./session').setRole(req, res, '', 0); }

module.exports = { memberCode, setMember, clearMember };
