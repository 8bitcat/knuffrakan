// Traktorns skopa: bilder nere/halvvägs/uppe + iscensatt lyft av bilen framför (håll knappen, släpp)
import { createRequire } from 'module';
const require = createRequire('D:/Qisy/QISYFrontend/QISYFrontend-1/package.json');
const { chromium } = require('playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
await page.addInitScript(() => localStorage.setItem('knuff_spec', JSON.stringify({ colors: ['#2f8f3a', '#ffd21f', '#ffffff'], pattern: 'split', number: 7, sponsor: 'TURBOFIL', shape: 1, kind: 'traktor' })));
await page.goto(`${process.env.BASE || 'http://localhost:8810'}/?auto&bana=snoberget`);
await page.waitForFunction(() => window.ready === true && window.__game?.me, null, { timeout: 90000 });
await page.waitForTimeout(1200);
// 1) utseendet i garaget
await page.click('#sb-garage').catch(() => {});
await page.evaluate(() => { const g = document.getElementById('garage'); if (g.classList.contains('hidden')) document.getElementById('garagebtn')?.click(); });
await page.waitForTimeout(600);
await page.evaluate(() => { document.getElementById('garage').style.visibility = 'hidden'; document.getElementById('menu').style.visibility = 'hidden'; });
for (const k of [0, 0.5, 1]) {
  await page.evaluate((k) => { const g = window.__game, s = g.showcase, q = s.group.quaternion;
    const fx = -2 * (q.x * q.z + q.w * q.y), fz = -(1 - 2 * (q.x * q.x + q.y * q.y));
    g.orbit = Math.atan2(fz, fx) + 1.25; s.setLoader(k); }, k);
  await page.waitForTimeout(350);
  await page.screenshot({ path: `tools/out/loader-${k}.png`, clip: { x: 300, y: 120, width: 800, height: 560 } });
}
await page.evaluate(() => { document.getElementById('garage').style.visibility = ''; document.getElementById('menu').style.visibility = ''; document.getElementById('gdone').click(); });
// 2) fysiken
const res = await page.evaluate(async () => {
  const g = window.__game, wait = (ms) => new Promise(r => setTimeout(r, ms));
  g.race.toGrid(1e9);
  const A = g.me, B = g.cars.find(c => c !== A);
  const s0 = 1140, out = [];
  const run = async (namn, bkind, av, bv, gapS) => {
    for (const [car, kind] of [[A, 'traktor'], [B, bkind]]) {
      if (car.wrecked) g.unwreck(car);
      g.setSpec(car, { ...car.spec, kind, gear: [] });
      car.brain = null; car.remote = {}; car.veh.hold = false; car.veh.disabled = false; car.veh.assist = false; car.ghostT = 0; car.veh.setGhost(false); car.health = 100;
    }
    g.placeCar(A, s0 - gapS, 0, av); g.placeCar(B, s0, 0, bv);
    A.remoteInput = { throttle: 0.7, brake: 0, steer: 0, handbrake: 0, loader: 0 };
    B.remoteInput = { throttle: bv > 0 ? 0.4 : 0, brake: bv > 0 ? 0 : 0.3, steer: 0, handbrake: 0, loader: 0 };
    const t0 = performance.now(); let maxEnd = 0, minUpB = 1, minUpA = 1, maxLoader = 0, colY = -9, colY0 = null;
    while (performance.now() - t0 < 4200) {
      await wait(16);
      const t = performance.now() - t0;
      A.remoteInput.loader = t > 600 && t < 2800 ? 1 : 0;
      const b = B.veh, sgn = (b.fwd.x * A.veh.fwd.x + b.fwd.z * A.veh.fwd.z) >= 0 ? -1 : 1;
      const endY = b.pos.y + b.fwd.y * sgn * b.T.half.z * 0.75 - B.trk.y;
      maxEnd = Math.max(maxEnd, endY); minUpB = Math.min(minUpB, b.up.y); minUpA = Math.min(minUpA, A.veh.up.y);
      maxLoader = Math.max(maxLoader, A.veh.loader);
      const c = A.veh.loaderCol.translation(); const h = c.y - A.trk.y; if (colY0 === null) colY0 = h; colY = Math.max(colY, h);
    }
    const after = A.veh.loader;
    out.push(`${namn.padEnd(26)} B närmaste ände max ${maxEnd.toFixed(2)} m · B minUp ${minUpB.toFixed(2)}${minUpB < 0.3 ? ' VÄLT' : ''} · traktor minUp ${minUpA.toFixed(2)}${minUpA < 0.3 ? ' TRAKTORN VÄLTE' : ''} · skopan ${colY0.toFixed(2)}→${colY.toFixed(2)} m (läge max ${maxLoader.toFixed(2)}, efter släpp ${after.toFixed(2)})`);
  };
  await run('stillastående stockcar', 'stock', 2, 0, 5.2);
  await run('i fart, stockcar', 'stock', 14, 12, 5.6);
  await run('i fart, formelbil', 'formel', 14, 12, 5.6);
  await run('i fart, skolbuss', 'bus', 14, 12, 7.6);
  return out;
});
console.log(res.join('\n'));
console.log(errors.length ? errors.join('\n') : 'inga fel');
await browser.close();
