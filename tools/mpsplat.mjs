// Online: värden kör glassbil och kastar glass på gästen — gästen ser kulan och får rutan nerkladdad; gästens elrullstol zappar
import { createRequire } from 'module';
const require = createRequire('D:/Qisy/QISYFrontend/QISYFrontend-1/package.json');
const { chromium } = require('playwright');
const room = 'G' + Math.floor(Math.random() * 90000 + 10000);
const base = process.env.BASE || 'http://localhost:8810/';
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11'] });
const errors = [];
const mk = async (tag, kind) => {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 560 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(tag + ' PAGEERROR ' + e.message));
  await p.addInitScript(([n, k]) => { localStorage.setItem('knuff_namn', n); localStorage.setItem('knuff_spec', JSON.stringify({ colors: ['#ff5fa2', '#2bb6f0', '#fff'], pattern: 'split', number: 7, sponsor: 'TURBOFIL', shape: 1, kind: k })); }, [tag, kind]);
  await p.goto(base);
  await p.waitForFunction(() => window.ready === true, null, { timeout: 90000 });
  await p.click('#roomopen'); await p.fill('#roomin', room); await p.click('#roomgo');
  await p.waitForFunction(() => window.__game?.me && window.__game.race.phase === 'lobby', null, { timeout: 60000 });
  return p;
};
const A = await mk('Anna', 'glass');
const B = await mk('Bertil', 'elrullstol');
await A.waitForTimeout(2500);
// i lobbyn: ställ Bertil 22 m framför Anna, båda stilla
await A.evaluate(() => { const g = window.__game, a = g.me, b = g.cars.find(c => c.name === 'Bertil'); const s = a.trk.s + 30;
  g.placeCar(a, s, 0, 0); g.placeCar(b, s + 22, 0, 0); });
await A.waitForTimeout(800);
await A.keyboard.down('KeyE'); await A.waitForTimeout(150);
let seen = 0;
for (let i = 0; i < 10; i++) { await B.waitForTimeout(80); seen = Math.max(seen, await B.evaluate(() => window.__game.weapons.pview.size)); }
await A.keyboard.up('KeyE');
await B.waitForTimeout(900);
const sp = await B.evaluate(() => { const el = document.getElementById('splat'); return `kladd ${el.classList.contains('hidden') ? 'dolt' : 'syns'} (opacitet ${el.style.opacity}, ${el.children.length} klickar)`; });
console.log('gästen såg projektiler:', seen, '| gästens ruta:', sp, '| Bertil hp hos värden:', await A.evaluate(() => Math.round(window.__game.cars.find(c => c.name === 'Bertil').health)));
await B.screenshot({ path: 'tools/out/mpsplat-B.png' });
// gästens elchock mot värden (ställ Anna bredvid)
await A.evaluate(() => { const g = window.__game, a = g.me, b = g.cars.find(c => c.name === 'Bertil'); g.placeCar(a, b.trk.s, 3, 0); a.health = 100; });
await A.waitForTimeout(600);
await B.keyboard.down('KeyE'); await B.waitForTimeout(300); await B.keyboard.up('KeyE');
await A.waitForTimeout(600);
console.log('elchock från gästen: Anna hp', await A.evaluate(() => Math.round(window.__game.me.health)), '| gästens laddning', await B.evaluate(() => (window.__game.me.veh.tank ?? -1).toFixed(2)));
console.log(errors.length ? errors.join('\n') : 'inga fel');
await browser.close();
