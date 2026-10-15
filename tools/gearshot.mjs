// Tillbehören i garaget: varje fordon med olika uppsättningar, kameran från fyra håll
// node tools/gearshot.mjs [stock,bus,bigfoot] [A,B,C,D]
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
const SETS = { A: ['plog', 'sidopansar', 'pushbar', 'bur'], B: ['kil', 'spikar', 'vinge', 'bur'], C: ['ram', 'sidopansar', 'pushbar', 'pansar'], D: ['bullbar', 'spikar', 'vinge', 'pansar'] };
const kinds = (process.argv[2] || 'stock').split(','), sets = (process.argv[3] || 'A,B').split(',');
await page.click('#garagebtn');
for (const kind of kinds) {
  await page.click('[data-tab="look"]'); await page.click(`[data-kind="${kind}"]`);
  await page.click('[data-tab="gear"]');
  for (const set of sets) {
    for (let n = 0; n < 6 && await page.$('#gslots button.on'); n++) await page.click('#gslots button.on');   // listan ritas om efter varje klick
    for (const id of SETS[set]) await page.click(`[data-gear="${id}"]`);
    const on = await page.$$eval('#gslots button.on', bs => bs.map(b => b.dataset.gear).join(','));
    const kvar = await page.textContent('#gbudtxt');
    console.log(kind, set, '→', on, '|', kvar);
    await page.evaluate(() => { document.getElementById('garage').style.visibility = 'hidden'; window.__game.showcase.orbitR *= 0.8; });
    for (const [k, off] of [0.3, 1.5, Math.PI - 0.5].entries()) {
      // vinkel räknad från bilens nos (kameran går runt i världens koordinater)
      await page.evaluate((o) => { const g = window.__game, q = g.showcase.group.quaternion;
        const fx = -2 * (q.x * q.z + q.w * q.y), fz = -(1 - 2 * (q.x * q.x + q.y * q.y));
        g.orbit = Math.atan2(fz, fx) + o; }, off);
      await page.waitForTimeout(400);
      await page.screenshot({ path: `tools/out/gear-${kind}-${set}-${k}.png`, clip: { x: 250, y: 150, width: 900, height: 560 } });
    }
    await page.evaluate(() => { document.getElementById('garage').style.visibility = ''; });
  }
}
await page.screenshot({ path: 'tools/out/gear-panel.png' });
console.log(errors.length ? errors.join('\n') : 'inga fel');
await browser.close();
