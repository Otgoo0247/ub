/* Сайтын тохиргоо (Upstash Redis hash ubcfg:v1): Facebook группын холбоос. */
const { storeConfigured, pipeline } = require('./store');

const CFG_KEY = 'ubcfg:v1';
const FB_HOSTS = new Set(['facebook.com', 'www.facebook.com', 'm.facebook.com', 'web.facebook.com', 'fb.com', 'www.fb.com', 'fb.me']);

/* Зөвхөн https://facebook.com/... (fb.com, fb.me) холбоосыг зөвшөөрнө; бусад бол null. */
function cleanFbUrl(raw) {
  let s = String(raw || '').trim();
  if (!s || s.length > 300) return null;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (!FB_HOSTS.has(u.hostname.toLowerCase()) || u.username || u.password) return null;
    u.protocol = 'https:';
    return u.toString();
  } catch (e) { return null; }
}

/* Хүний Facebook профайлын холбоос: facebook.com/нэр, profile.php?id=…, /share/… гэх мэт. Хоосон бол '' (заавал биш), буруу бол null */
function cleanFbProfile(raw) {
  if (raw == null || String(raw).trim() === '') return '';
  const s = cleanFbUrl(raw);
  if (!s) return null;
  const u = new URL(s);
  if (u.pathname === '/' || u.pathname === '') return null;
  const id = u.pathname === '/profile.php' ? u.searchParams.get('id') : null;
  if (u.pathname === '/profile.php' && !/^\d{5,25}$/.test(id || '')) return null;
  u.search = id ? `?id=${id}` : ''; u.hash = '';
  if (u.hostname === 'm.facebook.com' || u.hostname === 'web.facebook.com' || u.hostname === 'facebook.com') u.hostname = 'www.facebook.com';
  return u.toString().slice(0, 300);
}

async function readGroup() {
  if (!storeConfigured()) return { fbUrl: '', fbText: '' };
  const [vals] = await pipeline([['HMGET', CFG_KEY, 'fbUrl', 'fbText']]);
  const [fbUrl, fbText] = vals || [];
  return { fbUrl: cleanFbUrl(fbUrl) || '', fbText: fbText || '' };
}

module.exports = { CFG_KEY, cleanFbUrl, cleanFbProfile, readGroup };
