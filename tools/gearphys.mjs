// Tillbehörens fysik: iscensatta krockar mellan två bilar på en raksträcka, med och utan tillbehör.
// Mäter offret (B): högsta höjd, lägsta up.y (välter?), gir, sidoförflyttning, skada — och angriparens (A) skada.
import { createRequire } from 'module';
const require = createRequire('D:/Qisy/QISYFrontend/QISYFrontend-1/package.json');
const { chromium } = require('playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
await page.goto(`http://localhost:${process.env.PORT || 8810}/?auto&bana=snoberget`);
await page.waitForFunction(() => window.ready === true && window.__game?.me, null, { timeout: 90000 });
await page.waitForTimeout(1500);
const only = process.argv[2] || '';
const res = await page.evaluate(async (only) => {
  const g = window.__game, wait = (ms) => new Promise(r => setTimeout(r, ms));
  g.race.toGrid(1e9);
  const A = g.me, B = g.cars.find(c => c !== A);
  // hitta en rak bit: minst krökning över 200 m
  const T = g.track; let s0 = 600, best = 1e9;
  for (let s = 400; s < T.L - 400; s += 20) {
    const a = T.sampleAt(s), b = T.sampleAt(s + 200);
    const c = Math.abs(Math.atan2(a.fx ?? 0, a.fz ?? 1) - Math.atan2(b.fx ?? 0, b.fz ?? 1));
    const dir = (p, q) => Math.atan2(q.x - p.x, q.z - p.z);
    const k = Math.abs(dir(a, T.sampleAt(s + 100)) - dir(T.sampleAt(s + 100), b));
    if (k + c * 0 < best && Math.abs(a.y - b.y) < 6) { best = k; s0 = s; }
  }
  const yawOf = (v) => Math.atan2(v.fwd.x, v.fwd.z);
  const dang = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return Math.abs(d); };
  const run = async (c) => {
    for (const [car, kind, gear] of [[A, c.ak || 'stock', c.ag || []], [B, c.bk || 'stock', c.bg || []]]) {
      if (car.wrecked) g.unwreck(car);
      g.setSpec(car, { ...car.spec, kind, gear });
      car.brain = null; car.remote = {}; car.veh.hold = false; car.veh.disabled = false; car.veh.assist = false;
      car.ghostT = 0; car.veh.setGhost(false); car.health = 100; car.hitCD = 0;
    }
    const sA = s0 + (c.az ?? -9), sB = s0;
    g.placeCar(A, sA, c.alat ?? 0, c.av ?? 34); g.placeCar(B, sB, c.blat ?? 0, c.bv ?? 26);
    A.remoteInput = { throttle: 1, brake: 0, steer: c.asteer || 0, handbrake: 0 };
    B.remoteInput = { throttle: c.bthr ?? 0.5, brake: 0, steer: 0, handbrake: 0 };
    await wait(50);
    const lat0 = B.trk.lat, yaw0 = yawOf(B.veh);
    let maxH = 0, minUp = 1, maxYaw = 0, maxLat = 0, aMinUp = 1;
    const t0 = performance.now();
    while (performance.now() - t0 < (c.ms || 2200)) {
      await wait(16);
      maxH = Math.max(maxH, B.veh.pos.y - B.trk.y);
      minUp = Math.min(minUp, B.veh.up.y); aMinUp = Math.min(aMinUp, A.veh.up.y);
      maxYaw = Math.max(maxYaw, dang(yawOf(B.veh), yaw0));
      maxLat = Math.max(maxLat, Math.abs(B.trk.lat - lat0));
      if (c.steerStop && performance.now() - t0 > c.steerStop) A.remoteInput.steer = 0;
    }
    return `${c.namn.padEnd(34)} B: höjd ${maxH.toFixed(1)} m · minUp ${minUp.toFixed(2)}${minUp < 0.3 ? ' VÄLT' : ''} · gir ${(maxYaw * 57.3).toFixed(0)}° · sidled ${maxLat.toFixed(1)} m · skada ${(100 - B.health).toFixed(0)}${B.wrecked ? ' VRAK' : ''} | A: skada ${(100 - A.health).toFixed(0)}${aMinUp < 0.3 ? ' A VÄLTE' : ''}`;
  };
  const cases = [
    // bakifrån, rakt in (A 34 m/s mot B 26 m/s)
    { namn: 'bakifrån: inget', ag: [] },
    { namn: 'bakifrån: plog', ag: ['plog'] },
    { namn: 'bakifrån: kil', ag: ['kil'] },
    { namn: 'bakifrån: murbräcka', ag: ['ram'] },
    { namn: 'bakifrån: tjurfångare', ag: ['bullbar'] },
    { namn: 'bakifrån: kil, B = buss', ag: ['kil'], bk: 'bus' },
    { namn: 'bakifrån: buss+plog mot stockcar', ak: 'bus', ag: ['plog'], az: -12 },
    { namn: 'bakifrån: bigfoot+kil', ak: 'bigfoot', ag: ['kil'] },
    { namn: 'bakifrån: murbräcka, B pansar', ag: ['ram'], bg: ['pansar'] },
    // PIT: nosen mot bakre hörnet
    { namn: 'PIT: inget', az: -3.6, alat: 2.0, av: 31, bv: 30, asteer: -0.7, steerStop: 450, ms: 1400 },
    { namn: 'PIT: B bakskydd', az: -3.6, alat: 2.0, av: 31, bv: 30, asteer: -0.7, steerStop: 450, ms: 1400, bg: ['pushbar'] },
    // från sidan: A styr in i B
    { namn: 'sida: inget', az: -0.5, alat: 2.3, av: 31, bv: 30, asteer: -1, steerStop: 900 },
    { namn: 'sida: B sidopansar', az: -0.5, alat: 2.3, av: 31, bv: 30, asteer: -1, steerStop: 900, bg: ['sidopansar'] },
    { namn: 'sida: A fälgspikar', az: -0.5, alat: 2.3, av: 31, bv: 30, asteer: -0.6, ag: ['spikar'], ms: 3000 },
  ].filter(c => !only || c.namn.includes(only));
  const out = [`raksträcka s0 = ${s0}`];
  for (const c of cases) out.push(await run(c));
  return out;
}, only);
console.log(res.join('\n'));
console.log(errors.length ? errors.join('\n') : 'inga fel');
await browser.close();
