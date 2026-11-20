/* minimap.js — нэг цэгийн жижиг газрын зураг (CARTO суурь зураг, © OpenStreetMap). Нарийвчлалын тойрогтой.
 * window.UBMiniMap(lat, lng, acc, { w, h, z }) → HTMLElement */
(function () {
  'use strict';
  const T = 256;
  window.UBMiniMap = function (lat, lng, acc, o) {
    const w = (o && o.w) || 256, h = (o && o.h) || 150;
    let z = (o && o.z) || 16;
    const mpp = (zz) => 156543.03392 * Math.cos(lat * Math.PI / 180) / 2 ** zz; // метр/пиксель
    while (z > 11 && acc && acc / mpp(z) > h * 0.42) z -= 1; // тойрог багтахаар жижигрүүлнэ
    const n = 2 ** z, s = Math.sin(lat * Math.PI / 180);
    const px = (lng + 180) / 360 * n * T, py = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n * T;
    const left = px - w / 2, top = py - h / 2;
    const box = document.createElement('div'); box.className = 'umm'; box.style.width = `${w}px`; box.style.height = `${h}px`;
    for (let tx = Math.floor(left / T); tx <= Math.floor((left + w - 1) / T); tx += 1) {
      for (let ty = Math.floor(top / T); ty <= Math.floor((top + h - 1) / T); ty += 1) {
        const img = document.createElement('img'); img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; img.referrerPolicy = 'no-referrer'; img.onerror = () => { img.style.visibility = 'hidden'; };
        img.src = `https://${'abcd'[(tx + ty) & 3]}.basemaps.cartocdn.com/rastertiles/voyager/${z}/${((tx % n) + n) % n}/${ty}.png`;
        img.style.left = `calc(50% + ${tx * T - px}px)`; img.style.top = `calc(50% + ${ty * T - py}px)`; // төвөөс — хайрцаг жижгэрсэн ч зөв
        box.append(img);
      }
    }
    if (acc) { const r = Math.max(6, Math.min(acc / mpp(z), Math.max(w, h))); const c = document.createElement('i'); c.className = 'umm-acc'; c.style.width = c.style.height = `${2 * r}px`; box.append(c); }
    const pin = document.createElement('b'); pin.className = 'umm-pin'; box.append(pin);
    const at = document.createElement('small'); at.className = 'umm-attr'; at.textContent = '© OpenStreetMap, © CARTO'; box.append(at);
    return box;
  };
})();
