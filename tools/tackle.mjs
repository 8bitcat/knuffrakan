// Skärmdumpar mitt i en tackling (gnistor): B styr in i spelarens bil i 250 km/h
import { createRequire } from 'module';
const require = createRequire('D:/Qisy/QISYFrontend/QISYFrontend-1/package.json');
const { chromium } = require('playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(`http://localhost:${process.env.PORT || 8810}/?auto`);
await page.waitForFunction(() => window.ready === true && window.__game?.me, null, { timeout: 90000 });
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const g = window.__game, T = g.track;
  g.race.toGrid(1e9);
  const A = g.me, B = g.cars.find(c => c !== A);
  for (const c of [A, B]) { c.brain = null; c.remote = {}; c.veh.hold = false; c.ghostT = 0; c.veh.setGhost(false); }
  g.placeCar(A, 300, 2, 68); g.placeCar(B, 300 - 1.2, 2 - 2.15, 68.5);
  A.remoteInput = { throttle: 1, brake: 0, steer: 0, handbrake: 0 };
  B.remoteInput = { throttle: 1, brake: 0, steer: 1, handbrake: 0 };
});
for (const ms of [350, 700, 1100]) {
  await page.waitForTimeout(ms === 350 ? 350 : 350);
  await page.screenshot({ path: `tools/out/tackle-${ms}.png` });
}
await browser.close();
