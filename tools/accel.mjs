// Acceleration per fordonstyp på en raksträcka: tid till 100/200/300 km/h. node tools/accel.mjs
import { createRequire } from 'module';
const require = createRequire('D:/Qisy/QISYFrontend/QISYFrontend-1/package.json');
const { chromium } = require('playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.addInitScript(() => localStorage.setItem('knuff_bana', 'snoberget'));
await page.goto(`http://localhost:${process.env.PORT || 8810}/?auto`);
await page.waitForFunction(() => window.ready === true && window.__game?.me, null, { timeout: 90000 });
const res = await page.evaluate(() => {
  const g = window.__game, T = g.track, DT = 1 / 60;
  g.tick = () => {}; g.race.toGrid(1e9);
  const A = g.me;
  for (const [k, c] of g.cars.entries()) if (c !== A) g.parkBot(c, { s: T.wrapS(-40 - k * 6), lat: 0 });
  const out = [];
  for (const kind of ['stock', 'bigfoot', 'bus']) {
    g.setSpec(A, { ...A.spec, kind });
    A.brain = null; A.remote = {}; A.veh.hold = false; A.veh.vmax = 330 / 3.6; A.veh.powerMul = 1;
    g.placeCar(A, 100, 0, 0); A.ghostT = 0; A.veh.setGhost(false);
    A.remoteInput = { throttle: 1, brake: 0, steer: 0, handbrake: 0 };
    const t = {}; let k = 0;
    for (; k < 60 * 40; k++) { g.step(DT); const v = A.veh.speed * 3.6; for (const m of [100, 200, 300]) if (!t[m] && v >= m) t[m] = +(k / 60).toFixed(1); if (t[300]) break; }
    out.push({ kind, till100: t[100] ?? '-', till200: t[200] ?? '-', till300: t[300] ?? '-', fartEfter: Math.round(A.veh.speed * 3.6), sek: +(k / 60).toFixed(0) });
  }
  return out;
});
for (const r of res) console.log(JSON.stringify(r));
await browser.close();
