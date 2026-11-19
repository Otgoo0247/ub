/* private/members.enc-ийг MEMBERS_KEY-ээр тайлж санах ойд хадгална (api/members.js, api/invite.js хуваалцана). */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const MAGIC = Buffer.from('UBM1');
let cache = null;

function loadMembers() {
  if (cache) return cache;
  const hex = (process.env.MEMBERS_KEY || '').trim();
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw Object.assign(new Error('no key'), { code: 'not_configured' });
  const buf = fs.readFileSync(path.join(process.cwd(), 'private', 'members.enc'));
  if (!buf.subarray(0, 4).equals(MAGIC)) throw new Error('bad file');
  const iv = buf.subarray(4, 16), body = buf.subarray(16, buf.length - 16), tag = buf.subarray(buf.length - 16);
  const d = crypto.createDecipheriv('aes-256-gcm', Buffer.from(hex, 'hex'), iv);
  d.setAAD(MAGIC); d.setAuthTag(tag);
  const data = JSON.parse(zlib.gunzipSync(Buffer.concat([d.update(body), d.final()])).toString('utf8'));
  data.byInvite = new Map();
  Object.entries(data.khoroo).forEach(([code, list]) => list.forEach((m) => { if (m.i) data.byInvite.set(m.i.replace('-', ''), { m, code }); }));
  cache = data;
  return cache;
}

module.exports = { loadMembers };
