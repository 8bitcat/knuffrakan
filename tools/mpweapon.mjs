// Vapen online: gästen får raketer + kulspruta och skjuter på värden — värden räknar skadan,
// gästen ser sin vapenruta, projektilerna, spårljusen och lådorna
import { createRequire } from 'module';
const require = createRequire('D:/Qisy/QISYFrontend/QISYFrontend-1/package.json');
const { chromium } = require('playwright');
const room = 'W' + Math.floor(Math.random() * 90000 + 10000);
const base = process.env.BASE || 'http://localhost:8810/';
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11'] });
const mk = async (tag) => {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 620 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log(tag, 'PAGEERROR', e.message));
  await p.addInitScript((n) => { localStorage.setItem('knuff_namn', n); localStorage.setItem('knuff_bana', 'snoberget'); }, tag);
  await p.goto(base);
  await p.waitForFunction(() => window.ready === true, null, { timeout: 90000 });
  await p.fill('#roomin', room); await p.click('#roombtn');
  await p.waitForFunction(() => window.__game?.me && window.__game.race.phase === 'lobby', null, { timeout: 60000 });
  return p;
};
const A = await mk('Anna');
const B = await mk('Bertil');
await A.waitForTimeout(2500);
const setup = (id, ammo) => A.evaluate(([id, ammo]) => {
  const g = window.__game, me = g.me, b = g.cars.find(c => c.name === 'Bertil');
  me.health = 100; b.health = 100;
  g.placeCar(b, 1140, 0, 0); g.placeCar(me, 1170, 0, 0);
  me.remoteInput = undefined;
  b.weapon = { id, ammo };
}, [id, ammo]);
const hudB = () => B.evaluate(() => document.getElementById('wslot').textContent.replace(/\s+/g, ' ').trim() + (document.getElementById('wslot').classList.contains('hidden') ? ' (dold)' : ''));
await setup('raket', 3);
await B.waitForTimeout(600);
console.log('gästens vapenruta:', await hudB());
await B.keyboard.down('KeyF'); await B.waitForTimeout(150); await B.keyboard.up('KeyF');
let seenProj = 0;
for (let k = 0; k < 10; k++) { await B.waitForTimeout(80); seenProj = Math.max(seenProj, await B.evaluate(() => window.__game.weapons.pview.size)); }
await B.waitForTimeout(900);
console.log('raket: gästen såg projektiler', seenProj, '| Anna skada', await A.evaluate(() => (100 - window.__game.me.health).toFixed(0)), '| gästens ruta', await hudB());
await setup('kulspruta', 60);
await B.waitForTimeout(600);
await B.keyboard.down('KeyF');
let tracers = 0;
for (let k = 0; k < 12; k++) { await B.waitForTimeout(100); tracers = Math.max(tracers, await B.evaluate(() => window.__game.weapons.tracers.filter(t => t.on).length)); }
await B.screenshot({ path: 'tools/out/mpweapon-B.png' });
await B.keyboard.up('KeyF');
await B.waitForTimeout(500);
console.log('kulspruta: spårljus hos gästen', tracers, '| Anna skada', await A.evaluate(() => (100 - window.__game.me.health).toFixed(0)), '| ammo kvar', await A.evaluate(() => window.__game.cars.find(c => c.name === 'Bertil').weapon?.ammo ?? 0));
console.log('lådor hos gästen:', await B.evaluate(() => window.__game.weapons.boxes.length));
await browser.close();
