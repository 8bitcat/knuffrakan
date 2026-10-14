// Ljudlabbet: öppna från menyn, byt fordon/motor/skrap/krock, kör motorn, håll gas och skrap — inga fel, ljudnoderna rör sig
import { createRequire } from 'module';
const require = createRequire('D:/Qisy/QISYFrontend/QISYFrontend-1/package.json');
const { chromium } = require('playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
await page.goto(`${process.env.BASE || `http://localhost:${process.env.PORT || 8810}`}/`);
await page.waitForFunction(() => window.ready === true, null, { timeout: 90000 });
await page.click('#labbtn');
await page.waitForTimeout(2500);
await page.screenshot({ path: 'tools/out/lab-0.png' });
const state = () => page.evaluate(() => {
  const a = window.__game.audio, v = a.voices?.lab || Object.values(a.pool || {}).flat?.().find?.(x => x) ;
  return { ctx: a.ctx?.state, choice: JSON.stringify(a.choice), fart: document.getElementById('lfartv').textContent };
});
const res = [];
await page.click('#lplay'); await page.waitForTimeout(600);
res.push(['motor på', await state()]);
for (const kind of ['stock', 'bus', 'bigfoot']) {
  await page.click(`[data-lk="${kind}"]`); await page.waitForTimeout(300);
  const ids = await page.$$eval('#lmotor button', bs => bs.map(b => b.dataset.lm));
  for (const id of ids) {
    await page.click(`[data-lm="${id}"]`);
    await page.click('#lauto');
    await page.waitForTimeout(1500);
    const box = await page.$('#lgas'); const bb = await box.boundingBox();
    await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down(); await page.waitForTimeout(700); await page.mouse.up();
    res.push([kind + id, await state()]);
  }
}
await page.screenshot({ path: 'tools/out/lab-1.png' });
for (const id of await page.$$eval('#lscrape button', bs => bs.map(b => b.dataset.ls))) {
  await page.click(`[data-ls="${id}"]`);
  for (const h of ['#lscrw', '#lscrc']) {
    const bb = await (await page.$(h)).boundingBox();
    await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down(); await page.waitForTimeout(500); await page.mouse.up();
  }
  res.push(['skrap ' + id, await state()]);
}
for (const id of await page.$$eval('#lcrash button', bs => bs.map(b => b.dataset.lc))) {
  await page.click(`[data-lc="${id}"]`); await page.click('#lc1'); await page.click('#lc2'); await page.click('#lc3'); await page.waitForTimeout(300);
  res.push(['krock ' + id, await state()]);
}
await page.screenshot({ path: 'tools/out/lab-2.png' });
await page.click('#ldone'); await page.waitForTimeout(300);
const closed = await page.evaluate(() => document.getElementById('ljudlabb').classList.contains('hidden') && !document.getElementById('menu').classList.contains('dim'));
for (const r of res) console.log(r[0].padEnd(12), JSON.stringify(r[1]));
console.log('stängd:', closed);
console.log(errors.length ? errors.join('\n') : 'inga fel');
await browser.close();
