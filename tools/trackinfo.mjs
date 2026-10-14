// Skriver ut banornas längd, korsning och var delarna hamnade: node tools/trackinfo.mjs
import { createRequire } from 'module';
const require = createRequire('D:/Qisy/QISYFrontend/QISYFrontend-1/package.json');
const { chromium } = require('playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage();
page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') console.log('[konsol]', m.text()); });
await page.goto(`http://localhost:${process.env.PORT || 8810}/tools/blank.html`);
const out = await page.evaluate(async () => {
  const { TRACKS, buildTrack, F_GAP, F_BRIDGE, F_TUNNEL } = await import('/js/track.js?v=6');
  return TRACKS.map(def => {
    const t0 = performance.now(); const T = buildTrack(def); const ms = performance.now() - t0;
    let kmax = 0; for (let i = 0; i < T.N; i++) kmax = Math.max(kmax, Math.abs(T.k[i]));
    let ymin = 1e9, ymax = -1e9, smax = 0; for (let i = 0; i < T.N; i++) { ymin = Math.min(ymin, T.py[i]); ymax = Math.max(ymax, T.py[i]); }
    for (let i = 0; i < T.N; i++) { if (T.flags[i] & F_GAP) continue; const j = (i + 1) % T.N; if (T.flags[j] & F_GAP) continue; smax = Math.max(smax, Math.abs(T.py[j] - T.py[i]) / T.ds); }
    return { id: def.id, L: Math.round(T.L), N: T.N, minR: Math.round(1 / kmax), hojd: [Math.round(ymin), Math.round(ymax)], maxLutning: +smax.toFixed(3), ms: Math.round(ms),
      delar: T.features.map(f => ({ typ: f.type, s: Math.round(f.lip ?? f.c ?? f.s0), andel: +(((f.lip ?? f.c ?? f.s0) / T.L)).toFixed(2), ...(f.type === 'overpass' ? { hojdskillnad: +(T.py[T.idx(f.up)] - T.py[T.idx(f.lo)]).toFixed(1) } : {}) })) };
  });
});
for (const t of out) console.log(JSON.stringify(t));
await browser.close();
