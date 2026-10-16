// Jetrullstolarna i garaget: tre vinklar, lågan på tomgång och full gas
import { createRequire } from 'module';
const require = createRequire('D:/Qisy/QISYFrontend/QISYFrontend-1/package.json');
const { chromium } = require('playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
await page.goto(`${process.env.BASE || 'http://localhost:8810'}/`);
await page.waitForFunction(() => window.ready === true, null, { timeout: 90000 });
await page.click('#garagebtn');
for (const kind of (process.argv[2] || 'rullstol,elrullstol').split(',')) {
  await page.click('[data-tab="look"]'); await page.click(`[data-kind="${kind}"]`);
  await page.waitForTimeout(400);
  await page.evaluate(() => { document.getElementById('garage').style.visibility = 'hidden'; });
  for (const [k, [off, thr]] of [[0.5, 0], [1.5, 1], [Math.PI - 0.45, 1]].entries()) {
    await page.evaluate(([o, t]) => { const g = window.__game, s = g.showcase, q = s.group.quaternion;
      const fx = -2 * (q.x * q.z + q.w * q.y), fz = -(1 - 2 * (q.x * q.x + q.y * q.y));
      g.orbit = Math.atan2(fz, fx) + o; s.setThrust?.(t); }, [off, thr]);
    await page.waitForTimeout(350);
    await page.evaluate((t) => window.__game.showcase.setThrust?.(t), thr);
    await page.screenshot({ path: `tools/out/chair-${kind}-${k}.png`, clip: { x: 350, y: 180, width: 700, height: 460 } });
  }
  await page.evaluate(() => { document.getElementById('garage').style.visibility = ''; });
}
console.log(errors.length ? errors.join('\n') : 'inga fel');
await browser.close();
