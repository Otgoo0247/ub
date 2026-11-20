/*
 * Vercel Routing Middleware — бүх хүсэлтийг файл руу хүрэхээс өмнө шалгана.
 * Нэвтрээгүй хүн зөвхөн нэвтрэх хуудас, түүний CSS/фонтыг авна; бусад бүх зүйл (index, data/*.csv,
 * js, /api/members) нэвтрэлт шаардана. Тохиргоо дутуу бол хаалттай хэвээр үлдэнэ (fail closed).
 *
 * Environment Variables: AUTH_USERNAME, AUTH_PASSWORD (12+ тэмдэгт), MEMBERS_KEY (сешний түлхүүрт нэмэгдэнэ).
 * Сешний күүкиг api/_lib/session.js үүсгэдэг; энд яг ижил аргаар шалгана.
 */
export const config = { matcher: '/:path*', runtime: 'nodejs' };

const COOKIE = 'ub_session';
const PUBLIC = [/^\/login\/?$/, /^\/login\.html$/, /^\/api\/auth\/?$/, /^\/css\/(tokens|login)\.css$/, /^\/fonts\//, /^\/favicon\.svg$/, /^\/logo\.png$/, /^\/js\/login\.js$/,
  // Урилгын холбоос — нийтэд нээлттэй (зөвхөн урьсан гишүүний товч нэр, дүүрэг харагдана)
  /^\/invite\/?$/, /^\/invite\.html$/, /^\/api\/invite\/?$/, /^\/js\/invite\.js$/,
  /^\/api\/register\/?$/, /^\/js\/invite-address\.json$/,
  // Гишүүний өөрийн хуудас — /api/me өөрөө ub_member күүкиг шалгана; HTML/JS-д өгөгдөл байхгүй
  /^\/me\/?$/, /^\/me\.html$/, /^\/js\/me\.js$/, /^\/css\/me\.css$/, /^\/api\/me\/?$/,
  // Урилгын мод (/me-д): өгөгдөлгүй сан, загвар
  /^\/js\/tree\.js$/, /^\/js\/d3\.min\.js$/, /^\/css\/tree\.css$/];
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

export default async function middleware(request) {
  const url = new URL(request.url);
  if (PUBLIC.some((r) => r.test(url.pathname))) return next();
  if (await sessionUser(request)) return next();

  const wantsPage = request.method === 'GET' && (request.headers.get('accept') || '').includes('text/html');
  if (wantsPage) {
    const to = new URL('/login', url);
    const back = url.pathname + url.search;
    if (back !== '/') to.searchParams.set('next', back);
    return new Response(null, { status: 302, headers: { Location: to.pathname + to.search, 'Cache-Control': 'no-store' } });
  }
  return new Response(JSON.stringify({ error: 'login_required' }), {
    status: 401, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
