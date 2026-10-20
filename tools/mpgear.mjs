// Tillbehör online: gästens val i lobbyn når värden (fysik) och alla andra (utseende); bottarnas syns hos gästen
import { createRequire } from 'module';
const require = createRequire('D:/Qisy/QISYFrontend/QISYFrontend-1/package.json');
const { chromium } = require('playwright');
const room = 'G' + Math.floor(Math.random() * 90000 + 10000);
const base = process.env.BASE || `http://localhost:${process.env.PORT || 8810}/`;
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11'] });
const mk = async (tag, gear) => {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 700 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log(tag, 'PAGEERROR', e.message));
  await p.addInitScript(([n, g]) => { localStorage.setItem('knuff_namn', n); localStorage.setItem('knuff_spec', JSON.stringify({ colors: ['#ff4fa3', '#ffffff', '#2bd6e8'], pattern: 'split', number: 7, sponsor: 'TURBOFIL', shape: 1, kind: 'stock', gear: g })); }, [tag, gear]);
  await p.goto(base);
  await p.waitForFunction(() => window.ready === true, null, { timeout: 90000 });
  await p.click('#roomopen'); await p.fill('#roomin', room); await p.click('#roomgo');
  await p.waitForFunction(() => window.__game?.me && window.__game.race.phase === 'lobby', null, { timeout: 60000 });
  return p;
};
const A = await mk('Anna', ['plog', 'bur']);
const B = await mk('Bertil', []);
await A.waitForTimeout(3000);
const gearOf = (p, who) => p.evaluate((w) => { const c = window.__game.cars.find(x => x.name === w); return c ? `${(c.veh.T.gear || []).join('+') || 'inget'} (kroppar ${c.veh.colliders?.length ?? '-'})` : 'saknas'; }, who);
console.log('värden ser Anna:', await gearOf(A, 'Anna'), '| Bertil:', await gearOf(A, 'Bertil'));
console.log('Bertil ser Anna:', await gearOf(B, 'Anna'));
// Bertil köper kil + spikar i lobbyn
await B.click('#lgear'); await B.waitForTimeout(500);
await B.click('[data-gear="kil"]'); await B.click('[data-gear="spikar"]');
console.log('Bertils budget:', await B.textContent('#gbudtxt'));
await B.click('#gdone'); await B.waitForTimeout(2500);
console.log('efter köp, värden ser Bertil:', await gearOf(A, 'Bertil'));
console.log('lobbylistan hos Anna:', await A.evaluate(() => [...document.querySelectorAll('#lplayers .lp')].map(e => e.textContent.replace(/\s+/g, ' ').trim()).join(' | ')));
const bots = await B.evaluate(() => window.__game.cars.filter(c => !['Anna', 'Bertil'].includes(c.name)).map(c => (c.spec.gear || []).length));
console.log('bottar hos gästen (antal saker):', JSON.stringify(bots));
await A.screenshot({ path: 'tools/out/mpgear-A.png' });
await browser.close();
