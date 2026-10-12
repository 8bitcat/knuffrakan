// Skärmdumpar under en körning: node tools/shot.mjs "<query>" <prefix> <tider-s,komma> [bredd] [höjd]
// Ex: node tools/shot.mjs "?auto&bot" race 3,12,25
import { createRequire } from 'module';
const require = createRequire('D:/Qisy/QISYFrontend/QISYFrontend-1/package.json');
const { chromium } = require('playwright');
const [,, query = '', prefix = 'shot', times = '3', w = '1400', h = '800'] = process.argv;
const PORT = process.env.PORT || '8810';
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); else if (process.env.LOG) console.log('[log]', m.text()); });
const t0 = Date.now();
await page.goto(`http://localhost:${PORT}/${query}`);
await page.waitForFunction(() => window.ready === true, null, { timeout: 90000 }).catch(() => console.log('ready-timeout'));
console.log('klar efter', ((Date.now() - t0) / 1000).toFixed(1), 's');
const tStart = Date.now();
for (const t of times.split(',').map(Number)) {
  const wait = t * 1000 - (Date.now() - tStart);
  if (wait > 0) await page.waitForTimeout(wait);
  const out = `tools/out/${prefix}-${t}.png`;
  await page.screenshot({ path: out });
  const info = await page.evaluate(() => {
    const g = window.__game; if (!g) return '';
    const me = g.me; const fps = 0;
    return JSON.stringify({ phase: g.race.phase, t: +g.race.t.toFixed(1), raceT: +g.race.raceT.toFixed(1), me: me ? { kmh: Math.round(me.veh.speed * 3.6), place: me.place, prog: Math.round(me.prog), hp: Math.round(me.health), lat: +me.trk.lat.toFixed(1) } : null,
      cars: g.cars.length, wrecked: g.cars.filter(c => c.wrecked).length, avgKmh: Math.round(g.cars.reduce((a, c) => a + c.veh.speed * 3.6, 0) / g.cars.length), fps: window.__fps, spread: g.race.order ? Math.round(g.race.order[0].prog - g.race.order[g.race.order.length-1].prog) : 0 });
  });
  console.log(t + 's', out, info);
}
if (errors.length) console.log('FEL/VARNINGAR:\n' + [...new Set(errors)].slice(0, 30).join('\n'));
await browser.close();
