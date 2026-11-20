/* Үйл ажиллагааны зарлалын сан (Upstash Redis hash ubann:v1) — announcements.js, attendance.js хуваалцана. */
const { pipeline, open } = require('./store');

const ANN_KEY = 'ubann:v1';

async function listAnnouncements() {
  const [flat] = await pipeline([['HGETALL', ANN_KEY]]);
  const out = [];
  for (let i = 0; i + 1 < (flat || []).length; i += 2) { const a = open(flat[i + 1]); if (a) out.push({ ...a, id: flat[i] }); }
  return out.sort((a, b) => String(b.t).localeCompare(String(a.t))); // шинэ нь эхэнд
}

/* Улаанбаатарын өнөөдрийн огноо (UTC+8, зуны цаг байхгүй) */
const todayUB = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);

module.exports = { ANN_KEY, listAnnouncements, todayUB };
