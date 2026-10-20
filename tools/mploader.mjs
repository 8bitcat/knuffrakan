// Online: gästen med traktor håller E — värden lyfter skopan i fysiken, alla ser den uppe; släpp → ner
import { createRequire } from 'module';
const require = createRequire('D:/Qisy/QISYFrontend/QISYFrontend-1/package.json');
const { chromium } = require('playwright');
const room = 'L' + Math.floor(Math.random() * 90000 + 10000);
const base = process.env.BASE || 'http://localhost:8810/';
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11'] });
const mk = async (tag, kind) => {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 560 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log(tag, 'PAGEERROR', e.message));
  await p.addInitScript(([n, k]) => { localStorage.setItem('knuff_namn', n); localStorage.setItem('knuff_spec', JSON.stringify({ colors: ['#2f8f3a', '#ffd21f', '#fff'], pattern: 'split', number: 7, sponsor: 'TURBOFIL', shape: 1, kind: k })); }, [tag, kind]);
  await p.goto(base);
  await p.waitForFunction(() => window.ready === true, null, { timeout: 90000 });
  await p.click('#roomopen'); await p.fill('#roomin', room); await p.click('#roomgo');
  await p.waitForFunction(() => window.__game?.me && window.__game.race.phase === 'lobby', null, { timeout: 60000 });
  return p;
};
const A = await mk('Anna', 'stock');
const B = await mk('Bertil', 'traktor');
await A.waitForTimeout(2500);
const read = async () => ({
  vard: await A.evaluate(() => { const c = window.__game.cars.find(x => x.name === 'Bertil'); return +(c.veh.loader || 0).toFixed(2) + ' (bild ' + +(c.view.loaderK || 0).toFixed(2) + ')'; }),
  gast: await B.evaluate(() => +(window.__game.me.view.loaderK || 0).toFixed(2)),
});
console.log('före:', JSON.stringify(await read()));
await B.keyboard.down('KeyE'); await B.waitForTimeout(1600);
console.log('håller E:', JSON.stringify(await read()));
await B.screenshot({ path: 'tools/out/mploader-B.png' });
await B.keyboard.up('KeyE'); await B.waitForTimeout(1000);
console.log('släppt:', JSON.stringify(await read()));
await browser.close();
