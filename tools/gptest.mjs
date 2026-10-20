// Grand Prix online: värden skapar GP-rum, gästen går med, 3 banor, racen avslutas snabbt,
// poäng + banbyten hos båda, prispallen och tillbaka till lobbyn
import { createRequire } from 'module';
const require = createRequire('D:/Qisy/QISYFrontend/QISYFrontend-1/package.json');
const { chromium } = require('playwright');
const room = 'GP' + Math.floor(Math.random() * 9000 + 1000);
const base = process.env.BASE || 'http://localhost:8810/';
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11'] });
const errors = [];
const mk = async (tag) => {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 640 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(tag + ' PAGEERROR ' + e.message));
  await p.addInitScript((n) => localStorage.setItem('knuff_namn', n), tag);
  await p.goto(base);
  await p.waitForFunction(() => window.ready === true, null, { timeout: 90000 });
  await p.click('#roomopen'); await p.fill('#roomin', room); await p.click('#roomgo');
  await p.waitForFunction(() => window.__game?.me && window.__game.race.phase === 'lobby', null, { timeout: 60000 });
  return p;
};
const A = await mk('Anna');
const B = await mk('Bertil');
await A.waitForTimeout(2000);
await A.click('[data-gpmode="1"]');           // Grand Prix väljs i lobbyn
await A.waitForTimeout(600);
await A.click('[data-gpn="3"]');
await B.waitForTimeout(1500);
console.log('lobby hos gästen:', await B.evaluate(() => document.getElementById('lroom').textContent + ' | ' + [...document.querySelectorAll('#ltrack button')].map(b => b.textContent + (b.classList.contains('on') ? '*' : '')).join(',') + ' | ' + document.getElementById('lstart').textContent));
await A.click('#lstart');
const st = (p) => p.evaluate(() => { const g = window.__game; return { fas: g.race.phase, bana: g.trackId, gp: g.gp && { stage: g.gp.stage, idx: g.gp.idx, order: g.gp.order, table: (g.gp.table || []).map(r => r.name + ':' + r.pts) }, varv: g.race.laps }; });
for (let race = 0; race < 3; race++) {
  await A.waitForFunction(() => window.__game.race.phase === 'race', null, { timeout: 60000 });
  await A.waitForTimeout(3000);
  // Bertil först i mål, Anna efter (avsluta racet direkt)
  await A.evaluate((race) => { const g = window.__game, r = g.race; const a = g.me, b = g.cars.find(c => c.name === 'Bertil');
    const [w, s2] = race === 1 ? [a, b] : [b, a];
    Object.assign(w, { finished: true, finishPlace: 1, finishT: 60 }); Object.assign(s2, { finished: true, finishPlace: 2, finishT: 61 }); r.finishCount = 2;
    r.update(0); r.end(); }, race);
  await B.waitForTimeout(1500);
  const a = await st(A), b = await st(B);
  console.log(`race ${race + 1}: värd ${a.bana} ${JSON.stringify(a.gp.table)} (varv ${a.varv}) | gäst ${b.bana} ${JSON.stringify(b.gp?.table)} | gästens tabell: ${await B.evaluate(() => document.querySelector('#results .gpt h3')?.textContent || '-')}`);
  if (race === 0) await B.screenshot({ path: 'tools/out/gp-results-B.png' });
}
await A.waitForFunction(() => window.__game.race.phase === 'podium', null, { timeout: 60000 });
await B.waitForTimeout(3500);
console.log('prispall: värd', JSON.stringify(await st(A)), '| gäst ser pallen', await B.evaluate(() => !!window.__game.podium + ' · ' + document.getElementById('gpfinal').textContent.slice(0, 80)));
await B.screenshot({ path: 'tools/out/gp-podium-B.png' });
await A.screenshot({ path: 'tools/out/gp-podium-A.png' });
await A.waitForFunction(() => window.__game.race.phase === 'lobby', null, { timeout: 60000 });
console.log('efteråt:', JSON.stringify(await st(A)));
console.log(errors.length ? errors.join('\n') : 'inga fel');
await browser.close();
