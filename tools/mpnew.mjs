// Online med de nya fordonen: gästens spökläge syns hos värden, värdens tillplattning syns hos gästen,
// V2-raketen och spikmattan syns hos gästen
import { createRequire } from 'module';
const require = createRequire('D:/Qisy/QISYFrontend/QISYFrontend-1/package.json');
const { chromium } = require('playwright');
const room = 'N' + Math.floor(Math.random() * 90000 + 10000);
const base = process.env.BASE || 'http://localhost:8810/';
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11'] });
const errors = [];
const mk = async (tag, kind) => {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 560 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(tag + ' PAGEERROR ' + e.message));
  await p.addInitScript(([n, k]) => { localStorage.setItem('knuff_namn', n); localStorage.setItem('knuff_spec', JSON.stringify({ colors: ['#5a6b3a', '#2f3a22', '#fff'], pattern: 'split', number: 7, sponsor: 'TURBOFIL', shape: 1, kind: k })); }, [tag, kind]);
  await p.goto(base);
  await p.waitForFunction(() => window.ready === true, null, { timeout: 90000 });
  await p.click('#roomopen'); await p.fill('#roomin', room); await p.click('#roomgo');
  await p.waitForFunction(() => window.__game?.me && window.__game.race.phase === 'lobby', null, { timeout: 60000 });
  return p;
};
const A = await mk('Anna', 'v2');
const B = await mk('Bertil', 'spokbil');
await A.waitForTimeout(2500);
await B.keyboard.down('KeyE'); await B.waitForTimeout(500); await B.keyboard.up('KeyE');
console.log('spöke | värden ser:', await A.evaluate(() => { const b = window.__game.cars.find(c => c.name === 'Bertil'); return `spookT ${(b.spookT || 0).toFixed(1)} genomskinlig ${!!b.view.spookOn} spöke ${b.ghostT > 0}`; }),
  '| gästen själv:', await B.evaluate(() => `genomskinlig ${!!window.__game.me.view.spookOn}`));
await A.evaluate(() => { const b = window.__game.cars.find(c => c.name === 'Bertil'); b.flatT = 5; });
await B.waitForTimeout(1200);
console.log('platt | gästens bil i bild:', await B.evaluate(() => window.__game.me.view.group.scale.y.toFixed(2)));
// V2 mot gästen + spikmatta (byt värdens bil till polis efteråt)
await A.evaluate(() => { const g = window.__game, a = g.me, b = g.cars.find(c => c.name === 'Bertil'); g.placeCar(a, a.trk.s + 20, 0, 0); g.placeCar(b, a.trk.s + 70, 0, 0); });
await A.waitForTimeout(3500);
await A.keyboard.down('KeyE'); await A.waitForTimeout(300); await A.keyboard.up('KeyE');
let seen = 0; for (let i = 0; i < 25; i++) { await B.waitForTimeout(100); seen = Math.max(seen, await B.evaluate(() => [...window.__game.weapons.pview.values()].filter(v => v.type === 8).length)); }
await B.waitForTimeout(1500);
console.log('V2 | gästen såg raketen:', seen, '| Bertils hälsa hos värden:', await A.evaluate(() => Math.round(window.__game.cars.find(c => c.name === 'Bertil').health)));
console.log(errors.length ? errors.join('\n') : 'inga fel');
await browser.close();
