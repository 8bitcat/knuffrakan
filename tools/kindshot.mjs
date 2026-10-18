// Nya fordon i garaget: två vinklar var, specialförmågan igång (vattenstrålen, dragstrålen)
import { createRequire } from 'module';
const require = createRequire('D:/Qisy/QISYFrontend/QISYFrontend-1/package.json');
const { chromium } = require('playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
await page.goto(`${process.env.BASE || 'http://localhost:8810'}/`);
await page.waitForFunction(() => window.ready === true, null, { timeout: 90000 });
await page.click('#garagebtn');
for (const kind of (process.argv[2] || 'gokart,brandbil,stridsvagn,ufo').split(',')) {
  await page.click('[data-tab="look"]'); await page.click(`[data-kind="${kind}"]`);
  await page.waitForTimeout(400);
  const desc = await page.evaluate(() => document.getElementById('gdesc').textContent);
  console.log(kind, '→', desc);
  await page.evaluate(() => { document.getElementById('garage').style.visibility = 'hidden'; });
  for (const [k, off] of [0.6, 2.4].entries()) {
    await page.evaluate((o) => { const g = window.__game, s = g.showcase, q = s.group.quaternion;
      const fx = -2 * (q.x * q.z + q.w * q.y), fz = -(1 - 2 * (q.x * q.x + q.y * q.y));
      g.orbit = Math.atan2(fz, fx) + o; }, off);
    for (let i = 0; i < 6; i++) {
      await page.evaluate((i) => { const s = window.__game.showcase, t = performance.now() / 1000; s.setThrust?.(1, t); s.setLoader?.(i > 1 ? 1 : 0); s.setBeam?.(1, null); }, i);
      await page.waitForTimeout(60);
    }
    await page.screenshot({ path: `tools/out/kind-${kind}-${k}.png`, clip: { x: 300, y: 140, width: 800, height: 520 } });
  }
  await page.evaluate(() => { document.getElementById('garage').style.visibility = ''; });
}
console.log(errors.length ? errors.join('\n') : 'inga fel');
await browser.close();
