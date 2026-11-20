/*
 * Vercel Routing Middleware — бүх хүсэлтийг файл руу хүрэхээс өмнө шалгана.
 *   • Нийтэд нээлттэй (PUBLIC): нэвтрэх хуудсууд (/login — гишүүн, /admin-login — админ), урилга, /me, тэдгээрийн CSS/JS.
 *   • Зөвхөн админ (ADMIN_ONLY): /admin, нэрсийн /api/members, бүртгэлийн /api/registrations → /admin-login.
 *   • Бусад (дашбоард, data/*.csv, js): админ ЭСВЭЛ гишүүний (ub_member, урилгын кодоор) сешн → эс бөгөөс /login.
 * Тохиргоо дутуу бол хаалттай хэвээр үлдэнэ (fail closed).
 *
 * Environment Variables: AUTH_USERNAME, AUTH_PASSWORD (12+ тэмдэгт), MEMBERS_KEY.
 * Күүкиг api/_lib/session.js, api/_lib/membersession.js үүсгэдэг; энд яг ижил аргаар шалгана.
 */
export const config = { matcher: '/:path*', runtime: 'nodejs' };

const COOKIE = 'ub_session';
const PUBLIC = [/^\/login\/?$/, /^\/login\.html$/, /^\/admin-login\/?$/, /^\/admin-login\.html$/, /^\/api\/auth\/?$/, /^\/css\/(tokens|login)\.css$/, /^\/fonts\//, /^\/favicon\.svg$/, /^\/logo\.png$/, /^\/js\/login\.js$/,
  // Урилгын холбоос — нийтэд нээлттэй (зөвхөн урьсан гишүүний товч нэр, дүүрэг харагдана)
  /^\/invite\/?$/, /^\/invite\.html$/, /^\/api\/invite\/?$/, /^\/js\/invite\.js$/,
  /^\/api\/register\/?$/, /^\/js\/invite-address\.json$/,
  // Гишүүний өөрийн хуудас — /api/me өөрөө ub_member күүкиг шалгана; HTML/JS-д өгөгдөл байхгүй
  /^\/me\/?$/, /^\/me\.html$/, /^\/js\/me\.js$/, /^\/css\/me\.css$/, /^\/api\/me\/?$/,
  // Урилгын мод (/me-д): өгөгдөлгүй сан, загвар
  // Үйл ажиллагааны зарлал: GET — админ эсвэл гишүүний сешн, POST — зөвхөн админ (функц өөрөө шалгана)
  /^\/api\/announcements\/?$/, /^\/js\/ann\.js$/, /^\/css\/ann\.css$/,
  /^\/js\/tree\.js$/, /^\/js\/d3\.min\.js$/, /^\/css\/tree\.css$/];
const ADMIN_ONLY = [/^\/admin\/?$/, /^\/admin\.html$/, /^\/api\/settings\/?$/, /^\/api\/members\/?$/, /^\/api\/registrations\/?$/];
const MCOOKIE = 'ub_member';
const enc = new TextEncoder();

const next = () => new Response(null, { headers: { 'x-middleware-next': '1' } });

function b64url(buf) {
  let s = '';
  new Uint8Array(buf).forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function cookieValue(request) {
  const raw = request.headers.get('cookie') || '';
  const part = raw.split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
  return part ? decodeURIComponent(part.slice(COOKIE.length + 1)) : '';
}
async function sessionUser(request) {
  const user = (process.env.AUTH_USERNAME || '').trim();
  const pass = process.env.AUTH_PASSWORD || '';
  if (!user || pass.length < 12) return null;
  const [v, u, exp, mac] = cookieValue(request).split('.');
  if (v !== 'v1' || !u || !/^\d+$/.test(exp || '') || Number(exp) < Date.now() / 1000 || !mac) return null;
  const seed = await crypto.subtle.digest('SHA-256', enc.encode(`ubdash-session-v1|${user}|${pass}|${process.env.MEMBERS_KEY || ''}`));
  const key = await crypto.subtle.importKey('raw', seed, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const want = b64url(await crypto.subtle.sign('HMAC', key, enc.encode(`v1.${u}.${exp}`)));
  if (want.length !== mac.length) return null;
  let diff = 0;
  for (let i = 0; i < want.length; i += 1) diff |= want.charCodeAt(i) ^ mac.charCodeAt(i);
  return diff === 0 ? u : null;
}

/* Гишүүний сешн: ub_member = v1.<код>.<дуусах>.<HMAC(HMAC(MEMBERS_KEY,'ubdash-member-session-v1'), 'v1.код.дуусах')> */
async function memberOk(request) {
  const hex = (process.env.MEMBERS_KEY || '').trim();
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) return false;
  const raw = request.headers.get('cookie') || '';
  const part = raw.split(/;\s*/).find((c) => c.startsWith(`${MCOOKIE}=`));
  const [v, code, exp, mac] = (part ? decodeURIComponent(part.slice(MCOOKIE.length + 1)) : '').split('.');
  if (v !== 'v1' || !/^[0-9A-HJKMNP-TV-Z]{10}$/.test(code || '') || !/^\d+$/.test(exp || '') || Number(exp) < Date.now() / 1000 || !mac) return false;
  const bytes = new Uint8Array(hex.match(/../g).map((h) => parseInt(h, 16)));
  const k0 = await crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const seed = await crypto.subtle.sign('HMAC', k0, enc.encode('ubdash-member-session-v1'));
  const k1 = await crypto.subtle.importKey('raw', seed, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const want = b64url(await crypto.subtle.sign('HMAC', k1, enc.encode(`v1.${code}.${exp}`)));
  if (want.length !== mac.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i += 1) diff |= want.charCodeAt(i) ^ mac.charCodeAt(i);
  return diff === 0;
}

export default async function middleware(request) {
  const url = new URL(request.url);
  if (PUBLIC.some((r) => r.test(url.pathname))) return next();
  if (await sessionUser(request)) return next();
  const adminOnly = ADMIN_ONLY.some((r) => r.test(url.pathname));
  if (!adminOnly && await memberOk(request)) return next();

  const wantsPage = request.method === 'GET' && (request.headers.get('accept') || '').includes('text/html');
  if (wantsPage) {
    const to = new URL(adminOnly ? '/admin-login' : '/login', url);
    const back = url.pathname + url.search;
    if (back !== '/') to.searchParams.set('next', back);
    return new Response(null, { status: 302, headers: { Location: to.pathname + to.search, 'Cache-Control': 'no-store' } });
  }
  return new Response(JSON.stringify({ error: 'login_required' }), {
    status: 401, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
