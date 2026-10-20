// Varje fordons E-förmåga i ett riktigt race: spelaren kör fordonet, en bot (utan egen förmåga) ställs där
// förmågan ska träffa, E trycks — mät effekten på boten + spelarens egen bil, skärmdump strax efter.
import { createRequire } from 'module';
const require = createRequire('D:/Qisy/QISYFrontend/QISYFrontend-1/package.json');
const { chromium } = require('playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const errors = [];
// [fordon, offrets plats (s, lat, fart) relativt mig, tangenter, håll E (s)]
const CASES = {
  stock: [[0, 3.2, 25], ['ArrowUp', 'ArrowRight'], 0.15],
  bus: [[12, 0.5, 22], ['ArrowUp'], 0.15],
  bigfoot: [[0, 4.5, 20], ['ArrowUp'], 0.5],
  formel: [null, ['ArrowUp'], 2.6],
  glass: [[26, 0, 22], ['ArrowUp'], 0.3],
  rullstol: [null, ['ArrowUp'], 2.2],
  elrullstol: [[0, 2.6, 22], ['ArrowUp'], 0.15],
  plan: [[12, 0, 18], ['ArrowUp'], 0.5],
  gokart: [[-12, 0, 32], ['ArrowUp'], 0.15],
};
for (const kind of (process.argv[2] || Object.keys(CASES).join(',')).split(',')) {
  const [vp, keys, hold] = CASES[kind];
  const page = await browser.newPage({ viewport: { width: 1100, height: 640 } });
  page.on('pageerror', (e) => errors.push(kind + ' PAGEERROR ' + e.message));
  await page.addInitScript((k) => { localStorage.setItem('knuff_bana', 'hoppbacken'); localStorage.setItem('knuff_spec', JSON.stringify({ colors: ['#ff3b6b', '#2bd6e8', '#fff'], pattern: 'split', number: 9, sponsor: 'TURBOFIL', shape: 1, kind: k })); }, kind);
  await page.goto(`http://localhost:${process.env.PORT || 8810}/?nogear`);
  await page.waitForFunction(() => window.ready === true, null, { timeout: 90000 });
  await page.evaluate(() => window.__solo());
  await page.waitForFunction(() => window.__game.race.phase === 'race' && window.__game.race.raceT > 4.5, null, { timeout: 60000 });
  await page.evaluate((vp) => { const g = window.__game, me = g.me, s = me.trk.s + 60;
    g.placeCar(me, s, 0, 20);
    const b = g.cars.find(c => c.brain); g.setSpec(b, { ...b.spec, kind: 'stock', gear: [] }); b.brain.aggr = 0; window.__vic = b;
    if (vp) { g.placeCar(b, s + vp[0], vp[1], vp[2]); b.brain.lane = vp[1]; } else g.placeCar(b, s + 200, 8, 5);
    b.health = 100; me.health = 100;
    window.__m = { fired: 0, hp: 100, maxAng: 0, maxH: 0, v0: me.veh.speed * 3.6, vmax: 0, maxLat: 0, lat0: b.trk.lat, my0: me.veh.pos.y };
    const tick = () => { const m = window.__m; m.maxAng = Math.max(m.maxAng, Math.abs(b.veh.angv.y)); m.maxH = Math.max(m.maxH, me.veh.pos.y - me.trk.y); m.vmax = Math.max(m.vmax, me.veh.speed * 3.6);
      m.maxLat = Math.max(m.maxLat, Math.abs(b.trk.lat - m.lat0)); if ((me.veh.loader || 0) > 0.9 && !m.fired) m.fired = +(g.race.raceT).toFixed(2); if (me.veh.pos.y - me.trk.y > 4 && !m.high) m.high = `högt vid s=${Math.round(me.trk.s)} flaggor ${me.trk.f} up.y ${me.veh.up.y.toFixed(2)} fwd.y ${me.veh.fwd.y.toFixed(2)} grounded ${me.veh.grounded}`; if (!m.stop) requestAnimationFrame(tick); }; tick(); }, vp);
  for (const k of keys) await page.keyboard.down(k);
  await page.waitForTimeout(900);
  await page.keyboard.down('KeyE'); await page.waitForTimeout(hold * 1000); await page.keyboard.up('KeyE');
  await page.waitForTimeout(kind === 'glass' ? 450 : 200);
  await page.screenshot({ path: `tools/out/special2-${kind}.png` });
  await page.waitForTimeout(2600);
  for (const k of keys) await page.keyboard.up(k);
  const r = await page.evaluate(() => { const g = window.__game, m = window.__m, b = window.__vic, me = g.me; m.stop = true;
    return `offret: skada ${Math.round(100 - b.health)}, snurr max ${m.maxAng.toFixed(1)} rad/s, flyttat i sidled ${m.maxLat.toFixed(1)} m | jag: högst ${m.maxH.toFixed(1)} m över vägen, fart ${Math.round(m.v0)}→max ${Math.round(m.vmax)} km/h, laddning ${(me.veh.tank ?? 1).toFixed(2)}, hp ${Math.round(me.health)} | avfyrad ${m.fired} ${m.high || ''}`; });
  console.log(kind.padEnd(10), r);
  await page.close();
}
console.log(errors.length ? errors.join('\n') : 'inga fel');
await browser.close();
