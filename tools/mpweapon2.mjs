// Nya vapen online: gästen fryser värden, får sköld, skickar en tornado och bränner med flamkastaren — syns hos båda
import { createRequire } from 'module';
const require = createRequire('D:/Qisy/QISYFrontend/QISYFrontend-1/package.json');
const { chromium } = require('playwright');
const room = 'W' + Math.floor(Math.random() * 90000 + 10000);
const base = process.env.BASE || 'http://localhost:8810/';
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11'] });
const errors = [];
const mk = async (tag) => {
  const p = await (await browser.newContext({ viewport: { width: 1000, height: 560 } })).newPage();
  p.on('pageerror', (e) => errors.push(tag + ' PAGEERROR ' + e.message));
  await p.addInitScript((n) => localStorage.setItem('knuff_namn', n), tag);
  await p.goto(base); await p.waitForFunction(() => window.ready === true, null, { timeout: 90000 });
  await p.click('#roomopen'); await p.fill('#roomin', room); await p.click('#roomgo');
  await p.waitForFunction(() => window.__game?.me && window.__game.race.phase === 'lobby', null, { timeout: 60000 });
  return p;
};
const A = await mk('Anna'), B = await mk('Bertil');
await A.waitForTimeout(2500);
const give = (id, gap) => A.evaluate(([id, gap]) => { const g = window.__game, a = g.me, b = g.cars.find(c => c.name === 'Bertil');
  g.placeCar(b, a.trk.s + 20, 0, 0); g.placeCar(a, a.trk.s + 20 + gap, 0, 0); b.weapon = { id, ammo: 3 }; b.fireCD = 0; }, [id, gap]);
const fire = async (ms = 200) => { await B.keyboard.down('KeyF'); await B.waitForTimeout(ms); await B.keyboard.up('KeyF'); };
await give('frys', 30); await B.waitForTimeout(500); await fire();
await B.waitForTimeout(400);
console.log('frys   | värden fryst:', await A.evaluate(() => window.__game.me.frozenT > 0), '| gästen ser isblock:', await B.evaluate(() => !!window.__game.cars.find(c => c.name === 'Anna').fxIce?.visible));
await give('skold', 30); await B.waitForTimeout(500); await fire();
await B.waitForTimeout(500);
console.log('sköld  | värden ser gästens sköld:', await A.evaluate(() => window.__game.cars.find(c => c.name === 'Bertil').shieldT > 0), '| gästen ser bubblan:', await B.evaluate(() => !!window.__game.me.fxShield?.visible));
await give('tornado', 60); await B.waitForTimeout(500); await fire();
let seen = 0; for (let i = 0; i < 15; i++) { await B.waitForTimeout(100); seen = Math.max(seen, await B.evaluate(() => [...window.__game.weapons.pview.values()].filter(v => v.type === 13).length)); }
console.log('tornado| gästen ser tornadon:', seen);
await give('flamma', 8); await B.waitForTimeout(500); await fire(1500);
console.log('flamma | värden brinner:', await A.evaluate(() => window.__game.me.burnT > 0 || window.__game.me.health < 100), '| värdens hälsa', await A.evaluate(() => Math.round(window.__game.me.health)));
console.log(errors.length ? errors.join('\n') : 'inga fel');
await browser.close();
