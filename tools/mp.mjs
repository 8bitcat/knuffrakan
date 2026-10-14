// Tvåspelartest: A blir värd, B går med som gäst. node tools/mp.mjs [rum]
import { createRequire } from 'module';
const require = createRequire('D:/Qisy/QISYFrontend/QISYFrontend-1/package.json');
const { chromium } = require('playwright');
const room = process.argv[2] || ('T' + Math.floor(Math.random() * 90000 + 10000));
const url = (process.env.BASE || `http://localhost:${process.env.PORT || 8810}/`) + `?auto&online&room=${room}`;
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11'] });
const mk = async (tag) => {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 560 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log(tag, 'PAGEERROR', e.message));
  p.on('console', (m) => { if (m.type() === 'error') console.log(tag, 'console.error', m.text()); });
  await p.addInitScript((n) => { localStorage.setItem('knuff_namn', n); }, tag);
  await p.goto(url);
  return p;
};
const state = (p) => p.evaluate(() => {
  const g = window.__game; if (!g) return null;
  return { mode: g.mode, net: g.net ? g.net.constructor.name : null, cars: g.cars.length, me: g.me ? { id: g.me.id, name: g.me.name, x: Math.round(g.me.veh.pos.x), kmh: Math.round(g.me.veh.speed * 3.6), place: g.me.place } : null,
    phase: g.race.phase, humans: g.cars.filter(c => c.remote || c.isPlayer).map(c => c.name), buf: g.net?.buf?.length };
});
const A = await mk('Anna');
await A.waitForFunction(() => window.__game?.net, null, { timeout: 60000 });
console.log('A:', JSON.stringify(await state(A)));
const B = await mk('Bertil');
await B.waitForFunction(() => window.__game?.net && window.__game.me, null, { timeout: 60000 }).catch(() => console.log('B fick ingen bil'));
await B.waitForTimeout(12000);
console.log('A:', JSON.stringify(await state(A)));
console.log('B:', JSON.stringify(await state(B)));
// B gasar
await B.keyboard.down('KeyW');
await B.waitForTimeout(8000);
console.log('B efter gas:', JSON.stringify(await state(B)));
const remoteOnA = await A.evaluate(() => { const c = window.__game.cars.find(c => c.remote); return c ? { name: c.name, kmh: Math.round(c.veh.speed * 3.6), x: Math.round(c.veh.pos.x) } : null; });
console.log('B sett från värden:', JSON.stringify(remoteOnA));
await A.screenshot({ path: 'tools/out/mp-A.png' });
await B.screenshot({ path: 'tools/out/mp-B.png' });
await browser.close();
