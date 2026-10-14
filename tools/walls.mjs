// Väggtest: bilar skjuts snett in i murar och tunnelväggar — ingen får hamna utanför. node tools/walls.mjs [bana]
import { createRequire } from 'module';
const require = createRequire('D:/Qisy/QISYFrontend/QISYFrontend-1/package.json');
const { chromium } = require('playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.addInitScript((b) => localStorage.setItem('knuff_bana', b), process.argv[2] || 'hoppbacken');
await page.goto(`http://localhost:${process.env.PORT || 8810}/?auto`);
await page.waitForFunction(() => window.ready === true && window.__game?.me, null, { timeout: 90000 });
const res = await page.evaluate(() => {
  const g = window.__game, T = g.track, DT = 1 / 60;
  g.tick = () => {}; g.race.toGrid(1e9);
  const A = g.me; A.brain = null; A.remote = {}; A.veh.hold = false;
  for (const [k, c] of g.cars.entries()) if (c !== A) g.parkBot(c, { s: T.wrapS(-40 - k * 6), lat: 0 });
  const tun = T.features.find(f => f.type === 'tunnel');
  const spots = [['raka', 900], ['kurva', 3000]];
  if (tun) spots.push(['tunnel', (tun.s0 + 40) % T.L]);
  const out = [];
  for (const [namn, s] of spots) for (const [side, vl, vy] of [[1, 15, 0], [1, 30, 4], [-1, 45, 6], [1, 25, 12], [-1, 60, 2]]) {
    g.placeCar(A, s, side * 8, 70); A.ghostT = 0; A.veh.setGhost(false); A.health = 1e9; A.wrecked = false; A.veh.disabled = false;
    A.remoteInput = { throttle: 1, brake: 0, steer: 0, handbrake: 0 };
    const f = T.sampleAt(s), lv = A.veh.body.linvel();
    A.veh.body.setLinvel({ x: lv.x + f.rx * side * vl, y: lv.y + vy, z: lv.z + f.rz * side * vl }, true);
    let maxLat = 0, maxUp = -9;
    for (let k = 0; k < 120; k++) { g.step(DT); maxLat = Math.max(maxLat, Math.abs(A.trk.lat)); maxUp = Math.max(maxUp, A.veh.pos.y - A.trk.y); }
    out.push({ var: namn, sida: vl + ' m/s' + (vy ? ' +upp ' + vy : ''), maxUtMot: +(maxLat - T.halfW).toFixed(1), slutUt: +(Math.abs(A.trk.lat) - T.halfW).toFixed(1), maxHojd: +maxUp.toFixed(1), utanfor: Math.abs(A.trk.lat) > T.halfW + 1.5 });
  }
  return out;
});
for (const r of res) console.log(JSON.stringify(r));
await browser.close();
