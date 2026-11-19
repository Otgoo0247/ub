/*
 * Урилгын кодоор хүнийг олно: эхлээд Excel-ийн гишүүд (members.enc), дараа нь урилгаар бүртгүүлэгчид (Upstash).
 * Буцаах: { kind: 'member', m, khoroo, meta } | { kind: 'registrant', r } | null
 */
const { loadMembers } = require('./members');
const { registrantByCode } = require('./store');

async function findByCode(c) {
  const data = loadMembers();
  const hit = data.byInvite.get(c);
  if (hit) return { kind: 'member', m: hit.m, khoroo: hit.code, meta: (data.meta || {})[hit.code] || {} };
  const r = await registrantByCode(c).catch(() => null);
  return r ? { kind: 'registrant', r } : null;
}
const fullName = (p) => (p.kind === 'member' ? p.m.n : `${p.r.last} ${p.r.first}`);
const districtOf = (p) => (p.kind === 'member' ? p.meta.district || null
  : p.r.addr && p.r.addr.type === 'city' ? p.r.addr.district : p.r.addr ? `${p.r.addr.aimag} аймаг` : null);

module.exports = { findByCode, fullName, districtOf };
