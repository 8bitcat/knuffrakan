// Banhändelserna — det runt omkring: ljudet (klocka, tuta, mullret, plask) utan fel, inga vapenlådor på rälsen/bron,
// byte av bana många gånger (inga kvarglömda kroppar), omstart nära övergången hamnar före den.
// node tools/eventmisc.mjs
import { createRequire } from 'module';
const require = createRequire('D:/Qisy/QISYFrontend/QISYFrontend-1/package.json');
const { chromium } = require('playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript(() => localStorage.setItem('knuff_bana', 'host'));
await page.goto(`http://localhost:${process.env.PORT || 8810}/?auto&bot&nogear`);
await page.waitForFunction(() => window.__game?.race.phase === 'race', null, { timeout: 90000 });
let fail = 0;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };
// 1) ljudet: starta ljudet, ställ kameran vid övergången och låt tåget passera, sedan klaffbron
const snd = await page.evaluate(async () => {
  const g = window.__game, E = g.events, T = g.track;
  await g.audio.start();
  const st = g.audio.ctx?.state;
  // räkna anropen till ljudfunktionerna
  const cnt = { ding: 0, horn: 0, burst: 0 };
  for (const k of Object.keys(cnt)) { const f = E.sfx[k].bind(E.sfx); E.sfx[k] = (...a) => { if (E.sfx.ctx && a[0] >= 0.01) cnt[k]++; return f(...a); }; }
  g.cam.update = () => {};
  const at = (s0, lat) => { const f = T.sampleAt(s0); const c = [f.x + f.rx * lat, f.y + 4, f.z + f.rz * lat]; const fr = g.__fr || (g.__fr = g.frame.bind(g)); g.frame = (dt, al) => { fr(dt, al); g.camera.position.set(...c); g.camera.lookAt(f.x, f.y, f.z); }; };
  const z = E.rails[0];
  let n = Math.floor((g.simT + z.phi) / z.P) + 1; g.simT = n * z.P - z.phi + z.tC - 9;
  at(z.f.c - 30, -10);
  await new Promise(r => setTimeout(r, 9500));
  const rumble = E.sfx.rumbleL ? +E.sfx.rumbleL.g.gain.value.toFixed(3) : null;
  const k = E.klaffs[0];
  n = Math.floor((g.simT + k.phi) / k.P) + 1; g.simT = n * k.P - k.phi + k.tO0 - 6;
  at(k.sA - 40, 8);
  await new Promise(r => setTimeout(r, 7500));
  E.splash(k.leaves[0].H);
  return { st, cnt, rumble, motor: !!E.sfx.motorL };
});
console.log(' ljud', JSON.stringify(snd));
ok(snd.st === 'running' && snd.cnt.ding > 10 && snd.cnt.horn >= 1 && snd.cnt.burst >= 1 && snd.rumble !== null && snd.motor, `ljud: ${snd.cnt.ding} ding, ${snd.cnt.horn} tut, ${snd.cnt.burst} plask, mullret ${snd.rumble}, bromotor ${snd.motor}`);
// 2) vapenlådorna ligger inte vid rälsen eller klaffbron
const boxes = await page.evaluate(() => {
  const g = window.__game, T = g.track, E = g.events;
  let near = 0;
  for (const b of g.weapons.boxes) { const pr = T.project(b.pos.x, b.pos.z); for (const z of E.zones) { const c = z.kind === 'rail' ? z.f.c : z.sM; if (Math.abs(T.sdist(pr.s, c)) < 40) near++; } }
  return { boxes: g.weapons.boxes.length, near };
});
ok(boxes.near === 0, `inga vapenlådor vid händelserna (${boxes.boxes} lådor, ${boxes.near} nära)`);
// 3) omstart mitt på övergången/klaffen hamnar före den
const rs = await page.evaluate(() => {
  const g = window.__game, T = g.track, E = g.events;
  return { tag: Math.round(T.sdist(T.safeS(E.rails[0].f.c + 3), E.rails[0].f.c)), klaff: Math.round(T.sdist(T.safeS(E.klaffs[0].sM), E.klaffs[0].sA)) };
});
ok(rs.tag < -20 && rs.klaff < -40, `säker omstart: ${rs.tag} m före rälsen, ${rs.klaff} m före klaffen`);
// 4) byt bana många gånger: inga kvarglömda klaffkroppar, inga fel
const sw = await page.evaluate(async () => {
  const g = window.__game;
  const bodies0 = g.world.bodies.len();
  const seq = ['strand', 'djungel', 'snoberget', 'host', 'oken', 'host', 'neon', 'host'];
  const per = [];
  for (const id of seq) { g.setTrack(id); per.push(id + ':' + g.events.rails.length + 't/' + g.events.klaffs.length + 'k/' + g.events.bodies.length + 'b'); await new Promise(r => setTimeout(r, 200)); }
  return { bodies0, bodies1: g.world.bodies.len(), per };
});
console.log(' byten', JSON.stringify(sw));
ok(sw.bodies1 === sw.bodies0, `samma antal fysikkroppar efter 8 bytten (${sw.bodies0} → ${sw.bodies1})`);
ok(!errors.length, errors.length ? 'FEL: ' + errors.slice(0, 6).join(' | ') : 'inga fel i konsolen');
console.log(fail ? `${fail} FEL` : 'ALLT GRÖNT');
await browser.close();
process.exit(fail ? 1 : 0);
