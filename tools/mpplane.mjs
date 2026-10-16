// Gäster med skolbuss och bigfoot: rätt fysik hos värden, rätt utseende hos alla
import { createRequire } from 'module';
const require = createRequire('D:/Qisy/QISYFrontend/QISYFrontend-1/package.json');
const { chromium } = require('playwright');
const room = 'K' + Math.floor(Math.random() * 90000 + 10000);
const base = process.env.BASE || `http://localhost:${process.env.PORT || 8810}/`;
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11'] });
const mk = async (tag, kind) => {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 560 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log(tag, 'PAGEERROR', e.message));
  await p.addInitScript(([n, k]) => { localStorage.setItem('knuff_namn', n); localStorage.setItem('knuff_spec', JSON.stringify({ colors: ['#ff4fa3', '#ffffff', '#2bd6e8'], pattern: 'split', number: 7, sponsor: 'TURBOFIL', shape: 1, kind: k })); }, [tag, kind]);
  await p.goto(base);
  await p.waitForFunction(() => window.ready === true, null, { timeout: 90000 });
  await p.fill('#roomin', room); await p.click('#roombtn');
  await p.waitForFunction(() => window.__game?.me && window.__game.race.phase !== 'idle', null, { timeout: 60000 });
  return p;
};
const A = await mk('Anna', 'plan');
const B = await mk('Bertil', 'plan');
const C = await mk('Cissi', 'glass');
await A.waitForTimeout(4000);
const host = await A.evaluate(() => window.__game.cars.filter(c => c.remote || c.isPlayer).map(c => ({ namn: c.name, fysik: c.veh.T.id, vy: c.view.T?.id, massa: c.veh.T.mass })));
console.log('värden ser:', JSON.stringify(host));
for (const [n, p] of [['Bertil', B], ['Cissi', C]]) {
  const v = await p.evaluate(() => window.__game.cars.filter(c => ['Anna', 'Bertil', 'Cissi'].includes(c.name)).map(c => c.name + ':' + (c.view.T?.id || '?') + '/' + c.veh.T?.id));
  console.log(n, 'ser:', JSON.stringify(v));
}
// Cissi byter till bigfoot i garaget
await C.click('#sb-garage'); await C.waitForTimeout(500); await C.click('[data-kind="bigfoot"]'); await C.waitForTimeout(400); await C.click('#gdone');
await A.waitForTimeout(2000);
console.log('efter byte, värden ser Cissi som:', await A.evaluate(() => { const c = window.__game.cars.find(c => c.name === 'Cissi'); return c.veh.T.id + ' / vy ' + c.view.T.id; }));
await B.keyboard.down('KeyW'); await B.waitForTimeout(3000);
console.log('Bertil kör:', await B.evaluate(() => Math.round(window.__game.me.veh.speed * 3.6) + ' km/h'));
await B.screenshot({ path: 'tools/out/mpplane-B.png' });
await browser.close();
