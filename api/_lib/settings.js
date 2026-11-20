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

async function readGroup() {
  if (!storeConfigured()) return { fbUrl: '', fbText: '' };
  const [vals] = await pipeline([['HMGET', CFG_KEY, 'fbUrl', 'fbText']]);
  const [fbUrl, fbText] = vals || [];
  return { fbUrl: cleanFbUrl(fbUrl) || '', fbText: fbText || '' };
}

module.exports = { CFG_KEY, cleanFbUrl, readGroup };
