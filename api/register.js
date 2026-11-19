/*
 * POST /api/register — урилгын холбоосоор орсон хүний бүртгэл (НИЙТЭД нээлттэй, урилгын код заавал).
 * Бие: { c, last, first, phone, addr: {type:'city', district, khoroo} | {type:'aimag', aimag, soum}, consent: true }
 * Хамгаалалт: хүчинтэй урилгын код, хаяг жагсаалтаас, утас 8 оронтой, нэг утсаар нэг удаа,
 * IP тутамд цагт 10 оролдлого, урилгын код тутамд 200 бүртгэл, далд «website» талбар (бот).
 */
const { send, readJson } = require('./_lib/session');
const { loadMembers, normalizeInvite, INVITE_RE, fmtInvite } = require('./_lib/members');
const { storeConfigured, pipeline, seal, phoneKey, KEYS } = require('./_lib/store');
const ADDR = require('./_lib/address.json');

const NAME_RE = /^[\p{L}][\p{L}\s.'’-]{0,39}$/u;
const PER_IP_HOUR = 10, PER_CODE = 200;

function clean(s) { return String(s == null ? '' : s).normalize('NFC').replace(/\s+/g, ' ').trim(); }
function phoneOf(raw) {
  let d = String(raw || '').replace(/[\s()-]/g, '');
  if (d.startsWith('+976')) d = d.slice(4); else if (d.startsWith('976') && d.length === 11) d = d.slice(3);
  return /^[5-9]\d{7}$/.test(d) ? d : null;
}
function addressOf(a) {
  if (!a || typeof a !== 'object') return null;
  if (a.type === 'city') {
    const list = ADDR.city.districts[a.district];
    return list && list.includes(a.khoroo) ? { type: 'city', city: ADDR.city.name, district: a.district, khoroo: a.khoroo } : null;
  }
  if (a.type === 'aimag') {
    const list = ADDR.aimags[a.aimag];
    return list && list.includes(a.soum) ? { type: 'aimag', aimag: a.aimag, soum: a.soum } : null;
  }
  return null;
}
const ipOf = (req) => String(req.headers['x-real-ip'] || (req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket?.remoteAddress || '').trim();

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(res, 405, { error: 'method' }); }
  if (!/application\/json/i.test(req.headers['content-type'] || '')) return send(res, 415, { error: 'json_only' });
  if (!storeConfigured()) return send(res, 503, { error: 'storage_not_configured' });
  const b = await readJson(req);
  if (b.website) return send(res, 200, { ok: true }); // бот — чимээгүй хаяна

  const c = normalizeInvite(b.c);
  let members;
  try { members = loadMembers(); } catch (e) { return send(res, 503, { error: 'not_configured' }); }
  const hit = INVITE_RE.test(c) && members.byInvite.get(c);
  if (!hit) return send(res, 400, { error: 'invite', field: 'c' });

  const last = clean(b.last), first = clean(b.first), phone = phoneOf(b.phone), addr = addressOf(b.addr);
  const bad = [];
  if (!NAME_RE.test(last)) bad.push('last');
  if (!NAME_RE.test(first)) bad.push('first');
  if (!phone) bad.push('phone');
  if (!addr) bad.push('addr');
  if (b.consent !== true) bad.push('consent');
  if (bad.length) return send(res, 400, { error: 'invalid', fields: bad });

  try {
    const hour = Math.floor(Date.now() / 3600000);
    const [ipCount, , codeCount] = await pipeline([
      ['INCR', `${KEYS.rate}${hour}:${ipOf(req)}`], ['EXPIRE', `${KEYS.rate}${hour}:${ipOf(req)}`, '3600'], ['HGET', KEYS.by, c],
    ]);
    if (ipCount > PER_IP_HOUR) return send(res, 429, { error: 'rate_limited' });
    if (Number(codeCount || 0) >= PER_CODE) return send(res, 429, { error: 'invite_full' });
    const [fresh] = await pipeline([['SET', phoneKey(phone), '1', 'NX']]);
    if (fresh !== 'OK') return send(res, 409, { error: 'duplicate_phone' });
    const rec = { t: new Date().toISOString(), invite: fmtInvite(c), last, first, phone, addr };
    try { await pipeline([['RPUSH', KEYS.list, seal(rec)], ['HINCRBY', KEYS.by, c, '1']]); }
    catch (e) { await pipeline([['DEL', phoneKey(phone)]]).catch(() => {}); throw e; }
    return send(res, 201, { ok: true });
  } catch (e) {
    return send(res, 502, { error: 'store_error' });
  }
};
