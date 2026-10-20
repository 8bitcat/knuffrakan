// Lobbytest: A skapar rum, B går med, båda i lobbyn, B redo, A startar, racet går, tillbaka till lobbyn.
// node tools/lobby.mjs   (BASE=https://8bitcat.github.io/knuffrakan/ för riktiga sidan)
import { createRequire } from 'module';
const require = createRequire('D:/Qisy/QISYFrontend/QISYFrontend-1/package.json');
const { chromium } = require('playwright');
const room = 'L' + Math.floor(Math.random() * 90000 + 10000);
const base = process.env.BASE || `http://localhost:${process.env.PORT || 8810}/`;
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11'] });
const mk = async (tag) => {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 680 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log(tag, 'PAGEERROR', e.message));
  await p.addInitScript((n) => { localStorage.setItem('knuff_namn', n); }, tag);
  await p.goto(base);
  await p.waitForFunction(() => window.ready === true, null, { timeout: 90000 });
  await p.click('#roomopen'); await p.fill('#roomin', room);
  await p.click('#roomgo');
  await p.waitForFunction(() => window.__game?.me && window.__game.race.phase !== 'idle', null, { timeout: 60000 });
  return p;
};
const st = (p) => p.evaluate(() => {
  const g = window.__game, li = g.lobbyInfo;
  return { mode: g.mode, phase: g.race.phase, panel: !document.getElementById('lobby').classList.contains('hidden'),
    timer: document.getElementById('ltimer').textContent, players: li ? li.players.map(x => x.name + (x.ready ? '✓' : '')) : null,
    hiddenBots: g.cars.filter(c => c.hidden).length, cars: g.cars.length, kmh: Math.round(g.me.veh.speed * 3.6),
    startBtn: !document.getElementById('lstart').classList.contains('hidden') };
});
const A = await mk('Anna');
const B = await mk('Bertil');
await B.waitForTimeout(3000);
console.log('A i lobbyn:', JSON.stringify(await st(A)));
console.log('B i lobbyn:', JSON.stringify(await st(B)));
// B kör runt i lobbyn
await B.keyboard.down('KeyW'); await B.waitForTimeout(3000); await B.keyboard.up('KeyW');
console.log('B kör fritt:', JSON.stringify(await st(B)));
await B.screenshot({ path: 'tools/out/lobby-B.png' });
await A.screenshot({ path: 'tools/out/lobby-A.png' });
// B trycker REDO
await B.click('#lready'); await A.waitForTimeout(1500);
console.log('efter B redo, A ser:', JSON.stringify((await st(A)).players), '| B ser:', JSON.stringify((await st(B)).players));
// A startar
await A.click('#lstart'); await A.waitForTimeout(2000);
console.log('A efter start:', JSON.stringify(await st(A)));
console.log('B efter start:', JSON.stringify(await st(B)));
await A.waitForTimeout(6000);
console.log('race? A:', (await st(A)).phase, 'B:', (await st(B)).phase);
await B.screenshot({ path: 'tools/out/lobby-race-B.png' });
// avsluta racet direkt hos värden → resultat → lobby
await A.evaluate(() => { const r = window.__game.race; r.end(); r.t = 2; });
await A.waitForTimeout(4000);
console.log('efter racet A:', JSON.stringify(await st(A)));
console.log('efter racet B:', JSON.stringify(await st(B)));
// alla redo → automatisk start
await A.click('#lready'); await B.click('#lready'); await A.waitForTimeout(5500);
console.log('alla redo → A:', (await st(A)).phase, 'B:', (await st(B)).phase);
await browser.close();
