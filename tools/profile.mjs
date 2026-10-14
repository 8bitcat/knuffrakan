// Höjdprofil + var bilar lättar (krön): node tools/profile.mjs [bana] [kmh]
import { createRequire } from 'module';
const require = createRequire('D:/Qisy/QISYFrontend/QISYFrontend-1/package.json');
const { chromium } = require('playwright');
const [,, bana = 'hoppbacken', kmh = '360'] = process.argv;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage();
await page.goto(`http://localhost:${process.env.PORT || 8810}/tools/blank.html`);
const out = await page.evaluate(async ([bana, kmh]) => {
  const { buildTrack, trackDef, F_GAP } = await import('/js/track.js?v=7');
  const T = buildTrack(trackDef(bana));
  const v = kmh / 3.6, g = 14, lim = -g / (v * v), res = [];
  // krökning i höjdled över ±12 m (glipan räknas inte)
  for (let i = 0; i < T.N; i++) {
    const a = (i - 3 + T.N) % T.N, b = (i + 3) % T.N;
    if ((T.flags[a] | T.flags[i] | T.flags[b]) & F_GAP) continue;
    const c = (T.py[b] - 2 * T.py[i] + T.py[a]) / ((3 * T.ds) ** 2);
    if (c < lim) res.push([Math.round(i * T.ds), +(c / lim).toFixed(2)]);
  }
  // slå ihop närliggande
  const merged = [];
  for (const r of res) { const m = merged[merged.length - 1]; if (m && r[0] - m.to < 30) { m.to = r[0]; m.max = Math.max(m.max, r[1]); } else merged.push({ from: r[0], to: r[0], max: r[1] }); }
  return { feats: T.features.map(f => f.type + '@' + Math.round(f.lip ?? f.c ?? f.s0)), lyft: merged };
}, [bana, +kmh]);
console.log(JSON.stringify(out));
await browser.close();
