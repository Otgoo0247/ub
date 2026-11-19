/*
 * Урилгаар бүртгүүлэгчдийн сан — Upstash Redis (Vercel Marketplace → Upstash for Redis).
 * Холболтын хувьсагчийг Vercel өөрөө нэмнэ: KV_REST_API_URL + KV_REST_API_TOKEN
 * (эсвэл UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN). npm сан шаардлагагүй — REST API.
 *
 * Бүртгэл бүрийг MEMBERS_KEY-ээс гаргасан түлхүүрээр AES-256-GCM шифрлэж хадгална:
 * Upstash-ийн удирдлагын самбарт нэр, утас ил харагдахгүй.
 */
const crypto = require('crypto');

const env = (a, b) => (process.env[a] || process.env[b] || '').trim();
const url = () => env('KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL').replace(/\/+$/, '');
const token = () => env('KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_TOKEN');
const storeConfigured = () => (/^https:\/\//.test(url()) || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url())) && !!token() && /^[0-9a-fA-F]{64}$/.test((process.env.MEMBERS_KEY || '').trim());

const KEYS = { list: 'ubreg:v1:list', phone: 'ubreg:v1:phone:', by: 'ubreg:v1:by', rate: 'ubreg:v1:rl:', code: 'ubreg:v1:code:', login: 'ubreg:v1:rlm:' };

function subKey(label) {
  return crypto.createHmac('sha256', Buffer.from((process.env.MEMBERS_KEY || '').trim(), 'hex')).update(label).digest();
}
function seal(obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', subKey('ubdash-registration-v1'), iv);
  const body = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return `r1.${Buffer.concat([iv, body, c.getAuthTag()]).toString('base64')}`;
}
function open(s) {
  if (typeof s !== 'string' || !s.startsWith('r1.')) return null;
  try {
    const b = Buffer.from(s.slice(3), 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', subKey('ubdash-registration-v1'), b.subarray(0, 12));
    d.setAuthTag(b.subarray(b.length - 16));
    return JSON.parse(Buffer.concat([d.update(b.subarray(12, b.length - 16)), d.final()]).toString('utf8'));
  } catch (e) { return null; }
}
/* Утасны дугаарыг шифрийн hash болгож давхардлыг шалгана (дугаар өөрөө түлхүүрт харагдахгүй). */
const phoneKey = (phone) => KEYS.phone + crypto.createHmac('sha256', subKey('ubdash-phone-v1')).update(phone).digest('hex').slice(0, 32);

async function pipeline(cmds) {
  const r = await fetch(`${url()}/pipeline`, {
    method: 'POST', headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cmds),
  });
  if (!r.ok) throw Object.assign(new Error(`store ${r.status}`), { code: 'store_error' });
  const out = await r.json();
  out.forEach((x) => { if (x && x.error) throw Object.assign(new Error(x.error), { code: 'store_error' }); });
  return out.map((x) => x.result);
}

/* Бүртгүүлэгчийн өөрийн урилгын кодоор бичлэгийг авна (код: жигдэлсэн 10 тэмдэгт). */
async function registrantByCode(c) {
  if (!storeConfigured()) return null;
  const [raw] = await pipeline([['GET', KEYS.code + c]]);
  return raw ? open(raw) : null;
}
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function randomCode() {
  const b = crypto.randomBytes(10);
  let out = '';
  for (let i = 0; i < 10; i += 1) out += CROCKFORD[b[i] & 31];
  return out;
}

module.exports = { storeConfigured, pipeline, seal, open, phoneKey, KEYS, registrantByCode, randomCode };
