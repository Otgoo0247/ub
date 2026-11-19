/*
 * /api/me — «Гишүүнээр нэвтрэх» (урилгын код + утасны дугаар) ба өөрийн хуудас (/me).
 * Зөвхөн УРИЛГААР ШИНЭЭР БҮРТГҮҮЛСЭН хүмүүс нэвтэрнэ; Excel-ийн 350 гишүүн энэ замаар нэвтрэхгүй.
 *   POST {action:'login', code, phone}  → ub_member күүки (7 хоног)
 *   POST {action:'logout'}
 *   GET  → {authenticated:false} эсвэл өөрийн мэдээлэл + өөрийн урилгаар бүртгүүлсэн хүмүүс
 * Урилгын код холбоосонд ил явдаг тул нэвтрэхэд утасны дугаарыг заавал тулгана (холбоос авсан хүн нэвтэрч чадахгүй).
 */
const crypto = require('crypto');
const { send, readJson } = require('./_lib/session');
const { normalizeInvite, INVITE_RE, fmtInvite, shortName, phoneOf, loadMembers } = require('./_lib/members');
const { storeConfigured, pipeline, open, KEYS } = require('./_lib/store');
const { findByCode, fullName } = require('./_lib/people');
const { memberCode, setMember, clearMember } = require('./_lib/membersession');

const PER_IP_HOUR = 20;
const ipOf = (req) => String(req.headers['x-real-ip'] || (req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket?.remoteAddress || '').trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const eq = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

async function login(req, res) {
  const b = await readJson(req);
  const c = normalizeInvite(b.code), phone = phoneOf(b.phone);
  if (storeConfigured()) {
    try {
      const k = `${KEYS.login}${Math.floor(Date.now() / 3600000)}:${ipOf(req)}`;
      const [n] = await pipeline([['INCR', k], ['EXPIRE', k, '3600']]);
      if (n > PER_IP_HOUR) return send(res, 429, { error: 'rate_limited' });
    } catch (e) { /* сан түр алдаатай бол хязгааргүйгээр үргэлжилнэ */ }
  }
  let p = null;
  if (INVITE_RE.test(c) && phone) p = await findByCode(c);
  const ok = p && p.kind === 'registrant' && eq(p.r.phone, phone);
  if (!ok) { await sleep(1200); return send(res, 401, { error: 'wrong_credentials' }); }
  setMember(req, res, c);
  return send(res, 200, { ok: true });
}

const age = (dob) => { if (!dob) return null; const d = new Date(`${dob}T00:00:00Z`), n = new Date(); let a = n.getUTCFullYear() - d.getUTCFullYear(); if (n.getUTCMonth() < d.getUTCMonth() || (n.getUTCMonth() === d.getUTCMonth() && n.getUTCDate() < d.getUTCDate())) a -= 1; return a; };

async function me(req, res) {
  const c = memberCode(req);
  if (!c) return send(res, 200, { authenticated: false });
  const p = await findByCode(c);
  if (!p || p.kind !== 'registrant') { clearMember(req, res); return send(res, 200, { authenticated: false }); }
  let profile;
  {
    const r = p.r;
    const inv = r.invite ? await findByCode(normalizeInvite(r.invite)).catch(() => null) : null;
    profile = { kind: 'registrant', name: `${r.last} ${r.first}`, dob: r.dob || null, age: age(r.dob), gender: r.gender || null,
      phone: r.phone, addr: r.addr, registered: r.t, invitedBy: inv ? shortName(fullName(inv)) : null };
  }
  let invitees = [], storage = storeConfigured();
  if (storage) {
    try {
      const [raw, flat] = await pipeline([['LRANGE', KEYS.list, '0', '-1'], ['HGETALL', KEYS.by]]);
      const counts = {}; for (let i = 0; i + 1 < (flat || []).length; i += 2) counts[flat[i]] = Number(flat[i + 1]);
      invitees = (raw || []).map(open).filter((r) => r && normalizeInvite(r.invite) === c).reverse()
        .map((r) => ({ t: r.t, last: r.last, first: r.first, dob: r.dob || null, age: age(r.dob), gender: r.gender || null, phone: r.phone, addr: r.addr,
          invited: r.own ? counts[normalizeInvite(r.own)] || 0 : 0 }));
    } catch (e) { storage = false; }
  }
  return send(res, 200, { authenticated: true, code: fmtInvite(c), profile, invitees, storage });
}

module.exports = async function handler(req, res) {
  try { loadMembers(); } catch (e) { return send(res, 503, { error: 'not_configured' }); }
  if (req.method === 'GET') return me(req, res);
  if (req.method === 'POST') {
    if (!/application\/json/i.test(req.headers['content-type'] || '')) return send(res, 415, { error: 'json_only' });
    const peek = await readJson(req); req.body = peek;
    if (peek.action === 'login') return login(req, res);
    if (peek.action === 'logout') { clearMember(req, res); return send(res, 200, { ok: true }); }
    return send(res, 400, { error: 'action' });
  }
  res.setHeader('Allow', 'GET, POST'); return send(res, 405, { error: 'method' });
};
