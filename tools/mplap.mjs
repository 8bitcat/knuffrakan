// Varvräknaren hos gästen: värden flyttar fram gästens varv — gästens HUD ska visa samma varv som värden ser
import { createRequire } from 'module';
const require = createRequire('D:/Qisy/QISYFrontend/QISYFrontend-1/package.json');
const { chromium } = require('playwright');
const room = 'V' + Math.floor(Math.random() * 90000 + 10000);
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
await A.waitForTimeout(2000);
await A.click('#lstart');
await A.waitForFunction(() => window.__game.race.phase === 'race', null, { timeout: 60000 });
await B.waitForTimeout(2500);
const lapTxt = (p) => p.evaluate(() => document.getElementById('lap').textContent);
console.log('start  | värden:', await lapTxt(A), '| gästen:', await lapTxt(B));
await A.evaluate(() => { const g = window.__game, b = g.cars.find(c => c.name === 'Bertil'); b.lap += 2; });
await B.waitForTimeout(1200);
console.log('+1 varv | värden ser Bertil på varv', await A.evaluate(() => window.__game.cars.find(c => c.name === 'Bertil').lap + 1), '| gästens skärm:', await lapTxt(B), '| blinkade:', await B.evaluate(() => document.getElementById('flash')?.textContent || ''));
console.log(errors.length ? errors.join('\n') : 'inga fel');
await browser.close();
