/*
 * /api/members — нууц үгээр хамгаалсан гишүүдийн нэрсийн API (Vercel Node.js функц).
 *
 *   GET  /api/members                → { authenticated, configured }
 *   POST /api/members {action:"login", password}  → нэвтэрч, 8 цагийн HttpOnly күүки тавина
 *   POST /api/members {action:"logout"}           → күүкиг устгана
 *   GET  /api/members?khoroo=BGD_01  → { khoroo, generated, members:[...] }  (зөвхөн нэвтэрсэн үед)
 *
 * Vercel-ийн Environment Variables:
 *   MEMBERS_KEY      — tools/members.key доторх 64 тэмдэгт hex түлхүүр (private/members.enc-ийг тайлна)
 *   MEMBERS_PASSWORD — нэвтрэх нууц үг, 12-оос доошгүй тэмдэгт
 * Нууц үгийг солиход бүх нэвтрэлт хүчингүй болно.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const COOKIE = 'ubm_session';
const SESSION_HOURS = 8;
const MAGIC = Buffer.from('UBM1');
const CODE_RE = /^[A-Z]{2,4}_\d{1,3}$/;

let cache = null;

function config() {
  const hex = (process.env.MEMBERS_KEY || '').trim();
  const password = process.env.MEMBERS_PASSWORD || '';
  if (!/^[0-9a-fA-F]{64}$/.test(hex) || password.length < 12) return null;
  const key = Buffer.from(hex, 'hex');
  const sessionKey = crypto.createHmac('sha256', key).update(`session:${password}`).digest();
  return { key, password, sessionKey };
}

function loadMembers(key) {
  if (cache) return cache;
  const buf = fs.readFileSync(path.join(process.cwd(), 'private', 'members.enc'));
  if (!buf.subarray(0, 4).equals(MAGIC)) throw new Error('bad file');
  const iv = buf.subarray(4, 16), body = buf.subarray(16, buf.length - 16), tag = buf.subarray(buf.length - 16);
  const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
  d.setAAD(MAGIC); d.setAuthTag(tag);
  cache = JSON.parse(zlib.gunzipSync(Buffer.concat([d.update(body), d.final()])).toString('utf8'));
  return cache;
}

function sign(cfg, exp) {
  return crypto.createHmac('sha256', cfg.sessionKey).update(`v1.${exp}`).digest('base64url');
}
function sameText(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest(), y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}
function readCookie(req) {
  const m = (req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
  return m ? decodeURIComponent(m.slice(COOKIE.length + 1)) : '';
}
function authed(req, cfg) {
  const [v, exp, mac] = readCookie(req).split('.');
  if (v !== 'v1' || !/^\d+$/.test(exp || '') || Number(exp) < Date.now() / 1000) return false;
  return sameText(mac || '', sign(cfg, exp));
}
function setCookie(req, res, value, maxAge) {
  const secure = (req.headers['x-forwarded-proto'] || '').includes('https') ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(value)}; Path=/api/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`);
}
function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.end(body === undefined ? '' : JSON.stringify(body));
}
async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > 4096) return {}; chunks.push(c); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return {}; }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = async function handler(req, res) {
  const cfg = config();
  const url = new URL(req.url, 'http://x');

  if (req.method === 'POST') {
    if (!(req.headers['content-type'] || '').includes('application/json')) return send(res, 415, { error: 'json' });
    const body = await readBody(req);
    if (body.action === 'logout') { setCookie(req, res, '', 0); return send(res, 200, { authenticated: false }); }
    if (body.action !== 'login') return send(res, 400, { error: 'action' });
    if (!cfg) return send(res, 503, { error: 'not_configured' });
    if (!sameText(body.password || '', cfg.password)) { await wait(1200); return send(res, 401, { error: 'wrong_password' }); }
    const exp = Math.floor(Date.now() / 1000) + SESSION_HOURS * 3600;
    setCookie(req, res, `v1.${exp}.${sign(cfg, exp)}`, SESSION_HOURS * 3600);
    return send(res, 200, { authenticated: true });
  }
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET, POST'); return send(res, 405, { error: 'method' }); }

  const code = url.searchParams.get('khoroo');
  if (!code) return send(res, 200, { configured: !!cfg, authenticated: !!cfg && authed(req, cfg) });
  if (!cfg) return send(res, 503, { error: 'not_configured' });
  if (!authed(req, cfg)) return send(res, 401, { error: 'login_required' });
  if (!CODE_RE.test(code)) return send(res, 400, { error: 'khoroo' });
  let data;
  try { data = loadMembers(cfg.key); } catch (e) { return send(res, 500, { error: 'data_unreadable' }); }
  return send(res, 200, { khoroo: code, generated: data.generated, members: data.khoroo[code] || [] });
};
