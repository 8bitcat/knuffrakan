// UFO:ts dragstråle: spelarens UFO ställs bakom en bot, håller E — skärmdumpar + hur högt boten lyfts
import { createRequire } from 'module';
const require = createRequire('D:/Qisy/QISYFrontend/QISYFrontend-1/package.json');
const { chromium } = require('playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
await page.addInitScript(() => localStorage.setItem('knuff_bana', 'hoppbacken'));
await page.goto(`http://localhost:${process.env.PORT || 8810}/?auto&nogear`);
await page.waitForFunction(() => window.ready === true && window.__game?.me, null, { timeout: 90000 });
const kind = process.argv[2] || 'ufo', victim = process.argv[3] || 'stock';
await page.evaluate(([k, vk]) => { const g = window.__game; g.setSpec(g.me, { ...g.me.spec, kind: k, gear: [] }); const b = g.cars.find(c => c.brain); g.setSpec(b, { ...b.spec, kind: vk, gear: [] }); }, [kind, victim]);
await page.waitForFunction(() => window.__game.race.phase === 'race' && window.__game.race.raceT > 4.5, null, { timeout: 60000 });
// ställ boten 8 m framför mig på raksträckan
await page.evaluate(() => { const g = window.__game, me = g.me, b = g.cars.find(c => c.brain); const s = me.trk.s;
  g.placeCar(me, s + 40, 0, 25); g.placeCar(b, s + 48, 0, 22); b.brain.lane = 0; });
await page.keyboard.down('ArrowUp'); await page.keyboard.down('KeyE');
const log = [];
for (let i = 0; i < 8; i++) {
  await page.waitForTimeout(350);
  log.push(await page.evaluate(() => { const g = window.__game, b = g.cars.find(c => c.brain), me = g.me;
    return `k ${(me.veh.loader || 0).toFixed(2)} tank ${(me.veh.tank ?? 1).toFixed(2)} | ${b.spec.kind} över vägen ${(b.veh.pos.y - b.trk.y).toFixed(1)} m, hjul ${b.veh.grounded}, avst ${me.veh.pos.distanceTo(b.veh.pos).toFixed(1)} hp ${Math.round(b.health)} sladd ${Math.round((b.veh.beta || 0) * 57)}° lat ${b.trk.lat.toFixed(1)} snurr ${b.veh.angv.y.toFixed(1)}`; }));
  if (i === 2 || i === 5) await page.screenshot({ path: `tools/out/beam-${kind}-${victim}-${i}.png` });
}
await page.keyboard.up('KeyE');
await page.waitForTimeout(1500);
log.push('släppt: ' + await page.evaluate(() => { const g = window.__game, b = g.cars.find(c => c.brain); return `över vägen ${(b.veh.pos.y - b.trk.y).toFixed(1)} m, hjul ${b.veh.grounded}, hp ${Math.round(b.health)}`; }));
console.log(log.join('\n'));
console.log(errors.length ? errors.join('\n') : 'inga fel');
await browser.close();
