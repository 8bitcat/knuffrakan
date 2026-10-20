// Var hamnar banhändelserna? Tågövergångar och klaffbroar per bana (utan rendering): node tools/eventplace.mjs
import { createRequire } from 'module';
const require = createRequire('D:/Qisy/QISYFrontend/QISYFrontend-1/package.json');
const { chromium } = require('playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage();
const warn = [];
page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') warn.push(m.text()); });
page.on('pageerror', (e) => warn.push('PAGEERROR ' + e.message));
await page.goto(`http://localhost:${process.env.PORT || 8810}/tools/blank.html`);
const out = await page.evaluate(async () => {
  const m = await import('/js/track.js?v=32');
  const res = [];
  for (const def of m.TRACKS) {
    const t0 = performance.now();
    const T = m.buildTrack(def);
    const ms = Math.round(performance.now() - t0);
    for (const f of T.features) {
      if (f.type === 'rail') {
        const i = T.idx(f.c);
        res.push({ bana: def.id, typ: 'tåg', s: Math.round(f.c), andel: +(f.c / T.L).toFixed(3), L1: f.L1, L2: f.L2, lutning: +T.fy[i].toFixed(3), krok: +(1 / Math.max(1e-6, Math.abs(T.k[i]))).toFixed(0), ms });
      }
      if (f.klaff) res.push({ bana: def.id, typ: 'klaff', namn: f.namn, s: Math.round(f.c), iA: f.klaff.iA, iB: f.klaff.iB, n: f.klaff.n, djup: f.depth, golv: +f.floorY.toFixed(1), ms });
    }
    const want = def.features.filter(f => f.type === 'rail' || f.klaff).length, got = T.features.filter(f => f.type === 'rail' || f.klaff).length;
    if (want !== got) res.push({ bana: def.id, FEL: `bara ${got} av ${want} placerade` });
  }
  return res;
});
for (const r of out) console.log(JSON.stringify(r));
if (warn.length) console.log('VARNINGAR:\n' + warn.join('\n'));
await browser.close();
