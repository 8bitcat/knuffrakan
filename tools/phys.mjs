// Fysiktester: drift, upprätning, PIT-spinn bakifrån (med/utan motstyrning), sidoknuff.
import { createRequire } from 'module';
const require = createRequire('D:/Qisy/QISYFrontend/QISYFrontend-1/package.json');
const { chromium } = require('playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.addInitScript((b) => localStorage.setItem('knuff_bana', b), process.argv[2] || 'snoberget');
await page.goto(`http://localhost:${process.env.PORT || 8810}/?auto`);
await page.waitForFunction(() => window.ready === true && window.__game?.me, null, { timeout: 90000 });
const res = await page.evaluate(() => {
  const g = window.__game, T = g.track, DT = 1 / 60;
  g.tick = () => {};
  g.race.toGrid(1e9);
  const [A, B] = [g.me, g.cars.find(c => c !== g.me)];
  for (const c of [A, B]) { c.brain = null; c.remote = {}; c.veh.hold = false; c.veh.assist = false; }
  const head = (c) => Math.atan2(c.veh.fwd.x, c.veh.fwd.z);
  const dang = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d * 180 / Math.PI; };
  const park = (c) => g.placeCar(c, T.L / 2, 0, 0);
  const run = (n, fn) => { for (let k = 0; k < n; k++) { fn?.(k); g.step(DT); } };
  const inp = (c, t, s) => { c.remoteInput.throttle = t; c.remoteInput.brake = 0; c.remoteInput.steer = s; c.remoteInput.handbrake = 0; };
  const out = {};

  // 1) Drift: full ratt 0,6 s i 300 km/h, släpp — hur stor glidvinkel, slutar den vrida sig?
  park(B); g.placeCar(A, 200, -8, 83); A.ghostT = 0; A.veh.setGhost(false);
  inp(A, 1, 0); run(20);
  const h0 = head(A); let betaMax = 0, driftMax = 0;
  inp(A, 1, 1); run(36, () => { betaMax = Math.max(betaMax, Math.abs(A.veh.beta)); driftMax = Math.max(driftMax, A.veh.drift); });
  const turned = dang(head(A), h0);
  inp(A, 1, 0); run(18); const yawRate03 = A.veh.angv.y; run(30);
  out.drift = { turnedDeg: Math.round(turned), betaMaxDeg: Math.round(betaMax * 57.3), driftMax: +driftMax.toFixed(2), yawEfter0_3s: +yawRate03.toFixed(2), yawEfter0_8s: +A.veh.angv.y.toFixed(2), kmh: Math.round(A.veh.speed * 3.6), hp: Math.round(A.health) };

  // 1b) Snävaste kurvan i 330 km/h med AI-förare på spelarbilen (ingen stabilisering): klarar den kurvan?
  let mi = 0, mk = 0; for (let i = 0; i < T.N; i++) if (Math.abs(T.k[i]) > mk) { mk = Math.abs(T.k[i]); mi = i; }
  const BB = g.cars.find(c => c.brain)?.brain.constructor;
  A.brain = new BB(Math.random); A.remote = null; A.veh.assist = false;
  g.placeCar(A, mi * T.ds - 500, 0, 92); A.ghostT = 0; A.veh.setGhost(false); A.health = 100; A.veh.vmax = 95;
  let worstLat = 0, bm2 = 0, hits = 0; const hp0 = A.health;
  const trace = [];
  run(60 * 9, (k) => { worstLat = Math.max(worstLat, Math.abs(A.trk.lat)); bm2 = Math.max(bm2, Math.abs(A.veh.beta));
    if (Math.abs(A.veh.beta) > 0.4 && trace.length < 12) trace.push([k, Math.round(A.veh.beta * 57), +A.trk.lat.toFixed(1), Math.round(A.veh.speed * 3.6), +A.veh.wallT.toFixed(2), +A.veh.drift.toFixed(2), +A.veh.input.steer.toFixed(2), A.veh.grounded]); });
  out.kurvSpar = trace;
  out.kurva = { radie: Math.round(1 / mk), maxLat: +worstLat.toFixed(1), kantVid: +T.halfW.toFixed(1), betaMaxDeg: Math.round(bm2 * 57.3), hpTapp: Math.round(hp0 - A.health), kmh: Math.round(A.veh.speed * 3.6) };
  A.brain = null; A.remote = {};

  // 2) Lugn sväng 200 km/h, halv ratt: ingen drift
  g.placeCar(A, 200, 0, 55); inp(A, 1, 0.45); let bm = 0; run(60, () => { bm = Math.max(bm, Math.abs(A.veh.beta)); });
  out.grip = { betaMaxDeg: Math.round(bm * 57.3), drift: +A.veh.drift.toFixed(2) };

  // 3) PIT: B:s nos mot A:s vänstra bakhörn, B styr in i A
  const pit = (hold) => {
    A.health = 100; B.health = 100;
    g.placeCar(A, 300, 1.0, 70); g.placeCar(B, 300 - 3.6, 1.0 - 2.05, 70.5);
    for (const c of [A, B]) { c.ghostT = 0; c.veh.setGhost(false); }
    const h0 = head(A);
    let maxD = 0;
    run(90, (k) => { inp(A, 1, hold ? 1 : 0); inp(B, 1, k < 60 ? 1 : 0); maxD = Math.max(maxD, Math.abs(dang(head(A), h0))); });
    return { maxHeadingDeg: Math.round(maxD), aKmh: Math.round(A.veh.speed * 3.6), aHp: Math.round(A.health), bHp: Math.round(B.health) };
  };
  out.pitPassiv = pit(false);
  out.pitMotstyr = pit(true);

  // 3b) Spinn efter tackling (3 rad/s gir i 250 km/h): kan man rädda det med motstyrning?
  const spin = (counter) => {
    A.health = 100; park(B);
    g.placeCar(A, 400, 0, 70); A.ghostT = 0; A.veh.setGhost(false);
    run(10, () => inp(A, 1, 0));
    const av = A.veh.body.angvel(); A.veh.body.setAngvel({ x: av.x, y: 3, z: av.z }, true); A.veh.spinT = 1.2;
    const h0 = head(A); let maxD = 0;
    run(150, () => { const yaw = A.veh.angv.y; inp(A, 1, counter ? Math.sign(A.veh.beta || yaw) : 0); maxD = Math.max(maxD, Math.abs(dang(head(A), h0))); });
    return { maxHeadingDeg: Math.round(maxD), slutDeg: Math.round(dang(head(A), h0)), kmh: Math.round(A.veh.speed * 3.6) };
  };
  out.spinPassiv = spin(false);
  out.spinMotstyr = spin(true);

  // 4) Sidoknuff: B bredvid A, styr in i A en sekund
  const shove = (hold) => {
    g.placeCar(A, 300, 3, 65); g.placeCar(B, 300, 3 - 2.1, 65);
    for (const c of [A, B]) { c.ghostT = 0; c.veh.setGhost(false); }
    const l0 = A.trk.lat;
    run(60, () => { inp(A, 1, hold ? -1 : 0); inp(B, 1, 1); });
    return { aFlyttadM: +(A.trk.lat - l0).toFixed(1), bLat: +B.trk.lat.toFixed(1) };
  };
  out.knuffPassiv = shove(false);
  out.knuffHallerEmot = shove(true);
  return out;
});
for (const [k, v] of Object.entries(res)) console.log(k.padEnd(16), JSON.stringify(v));
await browser.close();
