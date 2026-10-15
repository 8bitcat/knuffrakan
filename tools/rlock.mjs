// R-spärren: i luften nekas R, låset gäller 3 s från att bilen lämnade marken; på taket måste man ligga 3 s
import { createRequire } from 'module';
const require = createRequire('D:/Qisy/QISYFrontend/QISYFrontend-1/package.json');
const { chromium } = require('playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
await page.goto(`${process.env.BASE || 'http://localhost:8810'}/?auto&bana=${process.argv[2] || 'snoberget'}`);
await page.waitForFunction(() => window.ready === true, null, { timeout: 90000 });
await page.waitForFunction(() => window.__game.race.phase === 'race' && window.__game.race.raceT > 3, null, { timeout: 90000 });
const out = await page.evaluate(async () => {
  const g = window.__game, me = g.me, b = me.veh.body, log = [];
  const msgs = []; const orig = g.notify.bind(g); g.notify = (car, m, k) => { if (car === me) msgs.push(m); return orig(car, m, k); };
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const tryR = (label) => { const s0 = me.saves, p0 = me.veh.pos.clone(); msgs.length = 0; g.requestReset(me);
    const moved = me.veh.body.translation(); const ok = Math.hypot(moved.x - p0.x, moved.y - p0.y, moved.z - p0.z) > 3;
    log.push(`${label}: ${ok ? 'R GICK' : 'nekad'}${msgs[0] ? ' «' + msgs[0] + '»' : ''} (räddn ${s0}→${me.saves}, rstate ${me.rstate}, lockT ${me.lockT.toFixed(2)}, flipT ${me.flipT.toFixed(2)})`); return ok; };
  const place = (h, flip) => {
    const p = me.veh.pos, f = me.veh.fwd;
    const q = new me.veh.quat.constructor().copy(me.veh.quat);
    if (flip) { const r = new me.veh.quat.constructor().setFromAxisAngle({ x: f.x, y: f.y, z: f.z, isVector3: true }, Math.PI); q.premultiply(r); }
    b.setTranslation({ x: p.x, y: me.trk.y + h, z: p.z }, true); b.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    b.setLinvel({ x: 0, y: 0, z: 0 }, true); b.setAngvel({ x: 0, y: 0, z: 0 }, true);
  };
  me.saves = 3;
  // 1) högt upp i luften, rättvänd
  place(30, false); await wait(500);
  tryR('i luften 0,5 s');
  await wait(800); tryR('i luften 1,3 s');
  // vänta tills den landat
  for (let k = 0; k < 40 && me.rstate === 1; k++) await wait(100);
  log.push(`landade efter luftfärd, lockT ${me.lockT.toFixed(2)}`);
  tryR('direkt efter landning');
  await wait((me.lockT + 0.3) * 1000); tryR('3 s efter avfärd');
  // 2) på taket, mot marken
  await wait(2500);
  place(2.2, true); await wait(1500); tryR('på taket 1,5 s');
  await wait(1000); tryR('på taket 2,5 s');
  await wait(800); tryR('på taket 3,3 s');
  // 3) upp och ned högt upp i luften: taktiden får inte räknas
  await wait(2500);
  place(40, true); await wait(1800); tryR('upp och ned i luften 1,8 s');
  log.push(`flipT i luften ${me.flipT.toFixed(2)}, rstate ${me.rstate}`);
  return log;
});
console.log(out.join('\n'));
console.log(errors.length ? errors.join('\n') : 'inga fel');
await browser.close();
