// Två spelare i race: kompislistan + räddningar + vältmätaren
import { createRequire } from 'module';
const require = createRequire('D:/Qisy/QISYFrontend/QISYFrontend-1/package.json');
const { chromium } = require('playwright');
const room = 'H' + Math.floor(Math.random() * 90000 + 10000);
const base = process.env.BASE || `http://localhost:${process.env.PORT || 8810}/`;
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11'] });
const mk = async (tag) => {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 800 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log(tag, 'PAGEERROR', e.message));
  await p.addInitScript((n) => localStorage.setItem('knuff_namn', n), tag);
  await p.goto(base);
  await p.waitForFunction(() => window.ready === true, null, { timeout: 90000 });
  await p.fill('#roomin', room); await p.click('#roombtn');
  await p.waitForFunction(() => window.__game?.me && window.__game.race.phase !== 'idle', null, { timeout: 60000 });
  return p;
};
const A = await mk('Anna'), B = await mk('Bertil');
await A.waitForTimeout(2500);
await A.click('#lstart');
await A.waitForFunction(() => window.__game.race.phase === 'race', null, { timeout: 30000 });
await B.keyboard.down('KeyW'); await A.keyboard.down('KeyW');
await A.waitForTimeout(9000);
await B.screenshot({ path: 'tools/out/hud-B.png' });
// Anna på taket
await A.evaluate(() => { const g = window.__game, v = g.me.veh; v.body.setRotation({ x: 0, y: 0, z: 1, w: 0 }, true); v.body.setTranslation({ x: v.pos.x, y: v.pos.y + 0.8, z: v.pos.z }, true); v.body.setLinvel({ x: 0, y: 0, z: 0 }, true); });
await A.waitForTimeout(900); await A.screenshot({ path: 'tools/out/hud-flip.png' });
console.log('Bertil ser:', await B.evaluate(() => document.getElementById('mates').innerText.replace(/\n/g, ' | ')), '| räddningar:', await B.evaluate(() => document.getElementById('saves').innerText));
await browser.close();
