// Varje fordonstyp kör ett varv med AI på Hoppbacken: fart, avåkningar, voltar, hopp.
import { createRequire } from 'module';
const require = createRequire('D:/Qisy/QISYFrontend/QISYFrontend-1/package.json');
const { chromium } = require('playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.addInitScript((k) => { localStorage.setItem('knuff_bana', 'hoppbacken'); if (k) window.__kinds = k.split(','); }, process.argv[2] || '');
await page.goto(`http://localhost:${process.env.PORT || 8810}/?auto`);
await page.waitForFunction(() => window.ready === true && window.__game?.me, null, { timeout: 90000 });
const res = await page.evaluate(async () => {
  const g = window.__game, T = g.track, DT = 1 / 60;
  g.tick = () => {}; g.race.toGrid(1e9);
  const A = g.me; const BB = g.cars.find(c => c.brain).brain.constructor;
  for (const [k, c] of g.cars.entries()) if (c !== A) g.parkBot(c, { s: T.wrapS(-40 - k * 6), lat: 0 });
  const out = [];
  for (const kind of (window.__kinds || ['stock', 'bus', 'bigfoot'])) {
    g.setSpec(A, { ...A.spec, kind });
    A.brain = new BB(Math.random); A.veh.hold = false; A.veh.assist = true;
    g.placeCar(A, 60, 0, 30); A.ghostT = 0; A.veh.setGhost(false); A.health = 100; A.wrecked = false;
    A.veh.vmax = 330 / 3.6; g.respawnLog = [];
    let vmax = 0, flips = 0, air = 0, lastUp = 1, s0 = 0, dist = 0, prevS = A.trk.s, minUp = 1;
    for (let k = 0; k < 60 * 75; k++) {
      g.step(DT);
      vmax = Math.max(vmax, A.veh.speed * 3.6);
      if (A.veh.up.y < 0.2 && lastUp >= 0.2) { flips++; (window.__flipLog ||= []).push({ kind, s: Math.round(A.trk.s), lat: +A.trk.lat.toFixed(1), kmh: Math.round(A.veh.speed * 3.6), f: T.flags[A.trk.i], k: +(T.k[A.trk.i] * 1000).toFixed(2), feat: (T.features.find(f => { const c = f.lip ?? f.s0; const d = T.sdist(A.trk.s, c); return d > -150 && d < 400; }) || {}).type, d: (() => { const f = T.features.find(f => { const c = f.lip ?? f.s0; const d = T.sdist(A.trk.s, c); return d > -150 && d < 400; }); return f ? Math.round(T.sdist(A.trk.s, f.lip ?? f.s0)) : null; })(), hist: (window.__hist || []).slice(-6) }); }
      (window.__hist ||= []).push([Math.round(A.trk.s), +A.trk.lat.toFixed(1), A.veh.grounded, +A.veh.up.y.toFixed(2), Math.round(A.veh.speed * 3.6), +A.veh.beta.toFixed(2)]); if (window.__hist.length > 40) window.__hist.shift();
      lastUp = A.veh.up.y; minUp = Math.min(minUp, A.veh.up.y);
      if (A.veh.grounded === 0) air++;
      let d = A.trk.s - prevS; if (d < -T.L / 2) d += T.L; if (d > T.L / 2) d -= T.L; dist += d; prevS = A.trk.s;
      if (k % 300 === 0) await new Promise(r => setTimeout(r, 0));
    }
    const by = {}; for (const r of g.respawnLog) if (r[1] === A.name) by[r[2]] = (by[r[2]] || 0) + 1;
    out.push({ kind, km: +(dist / 1000).toFixed(2), maxKmh: Math.round(vmax), snittKmh: Math.round(dist / 75 * 3.6), voltar: flips, minUpp: +minUp.toFixed(2), luftS: +(air / 60).toFixed(1), omstarter: by, hp: Math.round(A.health) });
  }
  return { out, flips: window.__flipLog || [] };
});
for (const r of res.out) console.log(JSON.stringify(r));
for (const f of res.flips) console.log('VOLT', JSON.stringify(f));
await browser.close();
