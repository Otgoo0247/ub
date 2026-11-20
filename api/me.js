/*
 * /api/me — гишүүний нэвтрэлт (/login — нэвтрэх нэр + нууц үг) ба өөрийн хуудас (/me).
 * Намын гишүүдийн нэвтрэх эрхийг админ /admin → «Нэвтрэх эрх»-өөс үүсгэнэ (api/_lib/creds.js).
 * АНХААР: бүртгүүлэгчийн урилгын код түүний урилгын холбоосонд ил явдаг тул холбоос авсан хүн түүний хуудсыг нээж чадна.
 *   POST {action:'login', username, password} → НАМЫН ГИШҮҮН: ub_member күүки (7 хоног) — дашбоардын статистик, /me, ирц, зарлал
 *   POST {action:'login', code}               → УРИЛГААР БҮРТГҮҮЛЭГЧ өөрийн урилгын кодоор: зөвхөн өөрийн хуудас (/me)
 *   POST {action:'logout'}                    → зөвхөн гишүүний сешнийг хаана (админых хэвээр)
 *   GET  → {authenticated:false} эсвэл өөрийн мэдээлэл, нэвтрэх эрх, өөрийн урилгаар бүртгүүлсэн хүмүүс
 * IP тутамд цагт 20, нэг нэвтрэх нэрд цагт 10 оролдлого; буруу бол 1.2 сек хүлээлгэнэ.
 */
const crypto = require('crypto');
const { send, readJson } = require('./_lib/session');
const { normalizeInvite, INVITE_RE, fmtInvite, shortName, phoneOf, loadMembers } = require('./_lib/members');
const { storeConfigured, pipeline, open, KEYS } = require('./_lib/store');
const { findByCode, fullName } = require('./_lib/people');
const { memberCode, setMember, clearMember } = require('./_lib/membersession');
const { readGroup } = require('./_lib/settings');
const { verify, ensureCred, normUser } = require('./_lib/creds');
const givenOf = (p) => (p.kind === 'member' ? String(p.m.n).trim().split(/\s+/).pop() : p.r.first);

const PER_IP_HOUR = 20;
const ipOf = (req) => String(req.headers['x-real-ip'] || (req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket?.remoteAddress || '').trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const eq = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

async function login(req, res) {
  const b = await readJson(req);
  const u = normUser(b.username);
  if (!storeConfigured()) return send(res, 503, { error: 'storage_not_configured' });
  try {
    const hour = Math.floor(Date.now() / 3600000);
    const who = b.code != null ? `c:${normalizeInvite(b.code).slice(0, 12)}` : `u:${u.slice(0, 20)}`;
    const k = `${KEYS.login}${hour}:${ipOf(req)}`, ku = `${KEYS.login}${hour}:${who}`;
    const [n, , nu] = await pipeline([['INCR', k], ['EXPIRE', k, '3600'], ['INCR', ku], ['EXPIRE', ku, '3600']]);
    if (n > PER_IP_HOUR || nu > 10) return send(res, 429, { error: 'rate_limited' });
  } catch (e) { /* сан түр алдаатай бол хязгааргүйгээр үргэлжилнэ */ }
  let c = null, p = null;
  if (b.code != null) {
    // Урилгаар бүртгүүлэгч — өөрийн урилгын кодоор
    const cc = normalizeInvite(b.code);
    if (INVITE_RE.test(cc)) { const x = await findByCode(cc).catch(() => null); if (x && x.kind === 'registrant') { c = cc; p = x; } }
  } else {
    c = await verify(u, b.password).catch(() => null);
    p = c ? await findByCode(c).catch(() => null) : null;
  }
  if (!p) { await sleep(1200); return send(res, 401, { error: 'wrong_credentials' }); }
  setMember(req, res, c, p.kind);
  return send(res, 200, { ok: true, kind: p.kind });
}

const age = (dob) => { if (!dob) return null; const d = new Date(`${dob}T00:00:00Z`), n = new Date(); let a = n.getUTCFullYear() - d.getUTCFullYear(); if (n.getUTCMonth() < d.getUTCMonth() || (n.getUTCMonth() === d.getUTCMonth() && n.getUTCDate() < d.getUTCDate())) a -= 1; return a; };

/* Урилгын мод: өөрийн кодоос доош бүх үе. Шууд бус хүмүүсийн зөвхөн нэр, бүртгүүлсэн огноо (утас, хаяг БИШ). */
function buildTree(rows, rootCode) {
  const kids = new Map();
  rows.forEach((r) => { if (!r.own) return; const k = normalizeInvite(r.invite); if (!kids.has(k)) kids.set(k, []); kids.get(k).push(r); });
  const seen = new Set([rootCode]);
  const walk = (code, depth) => (kids.get(code) || []).filter((r) => !seen.has(normalizeInvite(r.own)) && depth < 60).map((r) => {
    const own = normalizeInvite(r.own); seen.add(own);
    return { n: `${r.last} ${r.first}`, t: String(r.t || '').slice(0, 10), children: walk(own, depth + 1) };
  });
  return walk(rootCode, 0);
}

async function me(req, res) {
  const c = memberCode(req);
  if (!c) return send(res, 200, { authenticated: false });
  const p = await findByCode(c);
  if (!p) { clearMember(req, res); return send(res, 200, { authenticated: false }); }
  let profile;
  if (p.kind === 'member') {
    const m = p.m;
    profile = { kind: 'member', name: m.n, district: p.meta.district || null, khoroo: p.meta.name || null, cell: m.u || null, age: m.a == null ? null : m.a,
      gender: m.g || null, status: m.s || null, movement: m.m || null, movementDate: m.d || null, anket: m.k == null ? null : m.k };
  } else {
    const r = p.r;
    const inv = r.invite ? await findByCode(normalizeInvite(r.invite)).catch(() => null) : null;
    profile = { kind: 'registrant', name: `${r.last} ${r.first}`, dob: r.dob || null, age: age(r.dob), gender: r.gender || null,
      phone: r.phone, addr: r.addr, registered: r.t, invitedBy: inv ? shortName(fullName(inv)) : null };
  }
  let invitees = [], tree = [], storage = storeConfigured();
  if (storage) {
    try {
      const [raw, flat] = await pipeline([['LRANGE', KEYS.list, '0', '-1'], ['HGETALL', KEYS.by]]);
      const counts = {}; for (let i = 0; i + 1 < (flat || []).length; i += 2) counts[flat[i]] = Number(flat[i + 1]);
      const all = (raw || []).map(open).filter(Boolean);
      tree = buildTree(all, c);
      invitees = all.filter((r) => normalizeInvite(r.invite) === c).reverse()
        .map((r) => ({ t: r.t, last: r.last, first: r.first, dob: r.dob || null, age: age(r.dob), gender: r.gender || null, phone: r.phone, addr: r.addr,
          invited: r.own ? counts[normalizeInvite(r.own)] || 0 : 0 }));
    } catch (e) { storage = false; }
  }
  // Өөрийн нэвтрэх эрх (байхгүй бол одоо үүсгэнэ)
  let cred = null;
  if (p.kind === 'member') { try { const x = await ensureCred(c, givenOf(p)); if (x) cred = { username: x.u, password: x.pw }; } catch (e) { /* */ } }
  // Facebook групп — урилгаар бүртгүүлэгчдийн хуудсанд
  let group = null;
  if (p.kind === 'registrant') { try { const g = await readGroup(); if (g.fbUrl) group = g; } catch (e) { /* */ } }
  return send(res, 200, { authenticated: true, code: fmtInvite(c), profile, invitees, tree, storage, group, cred });
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
