/*
 * Гишүүдийн нэвтрэх эрх (нэвтрэх нэр + санамсаргүй нууц үг) — Upstash Redis.
 *   ubcred:v1:user  hash  нэвтрэх нэр → урилгын код (10 тэмдэгт)
 *   ubcred:v1:code  hash  урилгын код → шифрлэсэн { u, pw, t }
 * Нууц үгийг MEMBERS_KEY-ээр шифрлэж хадгалдаг тул админ дахин харж, гишүүдэд тарааж болно.
 */
const crypto = require('crypto');
const { pipeline, seal, open } = require('./store');

const K = { user: 'ubcred:v1:user', code: 'ubcred:v1:code' };
const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', ө: 'u', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ү: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'y', ь: 'i', э: 'e', ю: 'yu', я: 'ya' };
const PW_ABC = 'abcdefghjkmnpqrstuvwxyz23456789'; // андуурагдах 0/o, 1/l/i-гүй
const USER_RE = /^[a-z]{1,14}\d{3}$/;

const translit = (s) => String(s || '').toLowerCase().split('').map((ch) => (ch in TR ? TR[ch] : /[a-z]/.test(ch) ? ch : '')).join('');
/* Нэрнээс: «Амарзаяа» → amarzayaa + 3 оронтой санамсаргүй тоо (amarzayaa482) */
function makeUsername(given) {
  const base = translit(given).slice(0, 14) || 'gishuun';
  return `${base}${crypto.randomInt(100, 1000)}`;
}
function randomPassword(n = 8) {
  let s = '';
  for (let i = 0; i < n; i += 1) s += PW_ABC[crypto.randomInt(PW_ABC.length)];
  return s;
}
const normUser = (u) => String(u || '').trim().toLowerCase();
const eq = (a, b) => { const x = crypto.createHash('sha256').update(String(a)).digest(), y = crypto.createHash('sha256').update(String(b)).digest(); return crypto.timingSafeEqual(x, y); };

async function getCred(code) {
  const [raw] = await pipeline([['HGET', K.code, code]]);
  return raw ? open(raw) : null;
}
async function allCreds() {
  const [flat] = await pipeline([['HGETALL', K.code]]);
  const out = new Map();
  for (let i = 0; i + 1 < (flat || []).length; i += 2) { const o = open(flat[i + 1]); if (o) out.set(flat[i], o); }
  return out;
}

/* Олон хүнд нэг дор эрх үүсгэнэ: people = [{ code, given }]. Аль хэдийн эрхтэйг алгасна. Буцаах: үүсгэсэн тоо */
async function ensureMany(people) {
  if (!people.length) return 0;
  const [existing, flatUsers] = await pipeline([['HKEYS', K.code], ['HKEYS', K.user]]);
  const have = new Set(existing || []), taken = new Set(flatUsers || []);
  let todo = people.filter((p) => !have.has(p.code));
  let made = 0;
  for (let round = 0; round < 4 && todo.length; round += 1) {
    const plan = todo.map((p) => {
      let u = makeUsername(p.given);
      for (let i = 0; i < 20 && taken.has(u); i += 1) u = makeUsername(p.given);
      taken.add(u);
      return { ...p, u, pw: randomPassword() };
    });
    const res = await pipeline(plan.map((p) => ['HSETNX', K.user, p.u, p.code]));
    const ok = plan.filter((p, i) => Number(res[i]) === 1);
    const t = new Date().toISOString();
    if (ok.length) await pipeline(ok.map((p) => ['HSETNX', K.code, p.code, seal({ u: p.u, pw: p.pw, t })]));
    made += ok.length;
    todo = plan.filter((p, i) => Number(res[i]) !== 1);
  }
  return made;
}
async function ensureCred(code, given) {
  const have = await getCred(code);
  if (have) return have;
  await ensureMany([{ code, given }]);
  return getCred(code);
}
/* Нууц үгийг шинэчилнэ (нэвтрэх нэр хэвээр) */
async function resetPassword(code, given) {
  const have = await getCred(code);
  if (!have) return ensureCred(code, given);
  const rec = { u: have.u, pw: randomPassword(), t: new Date().toISOString() };
  await pipeline([['HSET', K.code, code, seal(rec)]]);
  return rec;
}
/* Нэвтрэх: нэр + нууц үг → урилгын код эсвэл null */
async function verify(username, password) {
  const u = normUser(username);
  if (!USER_RE.test(u) || typeof password !== 'string' || !password) return null;
  const [code] = await pipeline([['HGET', K.user, u]]);
  if (!code) { eq(password, 'x'); return null; }
  const c = await getCred(code);
  return c && c.u === u && eq(String(password).trim(), c.pw) ? code : null;
}

module.exports = { getCred, allCreds, ensureMany, ensureCred, resetPassword, verify, normUser };
