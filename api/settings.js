/*
 * /api/settings — сайтын тохиргоо (зөвхөн админ). Одоогоор: Facebook группын холбоос.
 *   GET                                        → { fbUrl, fbText }
 *   POST {action:'set', fbUrl, fbText}         — хадгална (fbUrl хоосон бол устгана)
 * Гишүүдэд /api/me-ээр (урилгаар бүртгүүлэгчдийн /me хуудсанд) хүрнэ.
 */
const { sessionUser, send, readJson } = require('./_lib/session');
const { storeConfigured, pipeline } = require('./_lib/store');
const { CFG_KEY, readGroup, cleanFbUrl } = require('./_lib/settings');

module.exports = async function handler(req, res) {
  if (!sessionUser(req)) return send(res, 401, { error: 'login_required' });
  if (!storeConfigured()) return send(res, 503, { error: 'storage_not_configured' });
  try {
    if (req.method === 'GET') return send(res, 200, await readGroup());
    if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return send(res, 405, { error: 'method' }); }
    const o = req.headers.origin;
    if (o) { try { if (new URL(o).host !== req.headers.host) return send(res, 403, { error: 'origin' }); } catch (e) { return send(res, 403, { error: 'origin' }); } }
    if (!/application\/json/i.test(req.headers['content-type'] || '')) return send(res, 415, { error: 'json_only' });
    const b = await readJson(req);
    if (b.action !== 'set') return send(res, 400, { error: 'action' });
    const raw = String(b.fbUrl || '').trim();
    const text = String(b.fbText || '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, 200);
    if (!raw) { await pipeline([['HDEL', CFG_KEY, 'fbUrl', 'fbText']]); return send(res, 200, { ok: true, fbUrl: '', fbText: '' }); }
    const url = cleanFbUrl(raw);
    if (!url) return send(res, 400, { error: 'bad_url' });
    await pipeline([['HSET', CFG_KEY, 'fbUrl', url, 'fbText', text]]);
    return send(res, 200, { ok: true, fbUrl: url, fbText: text });
  } catch (e) { return send(res, 502, { error: 'store_error' }); }
};
