// Hopptest: flyglängd, landning och vad som händer om man kör för sakta. node tools/jump.mjs
import { createRequire } from 'module';
const require = createRequire('D:/Qisy/QISYFrontend/QISYFrontend-1/package.json');
const { chromium } = require('playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.addInitScript(() => localStorage.setItem('knuff_bana', 'hoppbacken'));
await page.goto(`http://localhost:${process.env.PORT || 8810}/?auto`);
await page.waitForFunction(() => window.ready === true && window.__game?.me, null, { timeout: 90000 });
const res = await page.evaluate(() => {
  const g = window.__game, T = g.track, DT = 1 / 60;
  g.tick = () => {}; g.race.toGrid(1e9);
  const A = g.me; A.brain = null; A.remote = {}; A.veh.hold = false;
  for (const c of g.cars) if (c !== A) g.placeCar(c, T.L / 2 + Math.random() * 100, 0, 0);
  const jumps = T.features.filter(f => f.type === 'jump');
  const out = [];
  for (const [ji, f] of jumps.entries()) for (const kmh of [330, 290, 230, 180, 140]) {
    const v = kmh / 3.6;
    A.health = 100; A.veh.vmax = v; A.veh.powerMul = 1;
    g.placeCar(A, f.lip - 130, 0, v); A.ghostT = 0; A.veh.setGhost(false); A.wrecked = false;
    A.remoteInput = { throttle: 1, brake: 0, steer: 0, handbrake: 0 };
    let take = null, land = null, maxH = 0, respawned = false, hp0 = A.health, s0 = A.trk.s;
    for (let k = 0; k < 60 * 6; k++) {
      g.step(DT);
      const d = T.sdist(A.trk.s, f.lip);
      if (!take && A.veh.grounded === 0 && d > -5) take = d;
      if (take !== null && !land) maxH = Math.max(maxH, A.veh.pos.y - A.trk.y);
      if (take !== null && !land && A.veh.grounded >= 2) land = { d: Math.round(d), kmh: Math.round(A.veh.speed * 3.6), upY: +A.veh.up.y.toFixed(2) };
      if (Math.abs(T.sdist(A.trk.s, s0)) > 2000 || (k > 10 && T.sdist(A.trk.s, f.lip) < -150)) { respawned = true; break; }
      if (land && d > land.d + 60) break;
    }
    out.push({ hopp: ji + 1, kmh, flygM: land ? land.d - Math.round(take) : null, landarVid: land?.d ?? null, maxHojd: +maxH.toFixed(1), landKmh: land?.kmh ?? null, rakt: land?.upY ?? null, skada: Math.round(hp0 - A.health), vrak: A.wrecked, omstart: respawned });
  }
  return out;
});
for (const r of res) console.log(JSON.stringify(r));
await browser.close();
