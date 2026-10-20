// Online: ser gästen bommarna, tåget och klaffbron i takt med värden? (två webbläsare i samma rum)
// node tools/mpevents.mjs [bana]   (standard: host — har både tågövergång och klaffbro)
import { createRequire } from 'module';
const require = createRequire('D:/Qisy/QISYFrontend/QISYFrontend-1/package.json');
const { chromium } = require('playwright');
const bana = process.argv[2] || 'host';
const room = 'E' + Math.floor(Math.random() * 90000 + 10000);
const base = process.env.BASE || `http://localhost:${process.env.PORT || 8810}/`;
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const errors = [];
const mk = async (tag) => {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 620 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(tag + ' PAGEERROR ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(tag + ' ' + m.text()); });
  await p.addInitScript(([n, b]) => { localStorage.setItem('knuff_namn', n); localStorage.setItem('knuff_bana', b); }, [tag, bana]);
  await p.goto(base);
  await p.waitForFunction(() => window.ready === true, null, { timeout: 90000 });
  await p.click('#roomopen'); await p.fill('#roomin', room); await p.click('#roomgo');
  await p.waitForFunction(() => window.__game?.me && window.__game.race.phase === 'lobby', null, { timeout: 60000 });
  return p;
};
const A = await mk('Anna');
const B = await mk('Bertil');
await B.waitForTimeout(2500);
console.log('läge:', await A.evaluate(() => window.__game.mode + ' ' + window.__game.trackId), '|', await B.evaluate(() => window.__game.mode + ' ' + window.__game.trackId));
// samma ögonblick hos båda: klockan och händelsernas läge
const both = async () => {
  const f = () => { const g = window.__game, E = g.events, t = g.clock(); return { t, rails: E.rails.map(z => ({ q: E.trainAt(z, t).q, n: E.trainAt(z, t).n })), klaffs: E.klaffs.map(z => ({ ang: E.bridgeAt(z, t).ang * 57.3, a: E.bridgeAt(z, t).a })) }; };
  const [a, b] = await Promise.all([A.evaluate(f), B.evaluate(f)]);
  return { dt: +(b.t - a.t).toFixed(3), tåg: a.rails.map((r, i) => +(b.rails[i].q - r.q).toFixed(1)), klaff: a.klaffs.map((k, i) => +(b.klaffs[i].ang - k.ang).toFixed(1)), båt: a.klaffs.map((k, i) => +(b.klaffs[i].a - k.a).toFixed(1)) };
};
const diffs = [];
for (let k = 0; k < 5; k++) { diffs.push(await both()); await A.waitForTimeout(300); }
console.log('skillnad gäst − värd (klocka s, tågets nos m, klaffvinkel °, båt m):', JSON.stringify(diffs));
// värden hoppar fram i tiden: tåget 4,5 s från övergången
const camAt = (p, which, cam, look) => p.evaluate(([which, cam, look]) => {
  const g = window.__game, T = g.track, E = g.events; g.cam.update = () => {};
  const z = which === 'rail' ? E.rails[0] : E.klaffs[0], s0 = which === 'rail' ? z.f.c : z.sM;
  const P = (a) => { const f = T.sampleAt(s0 + a[0]); return [f.x + f.rx * a[1], f.y + a[2], f.z + f.rz * a[1]]; };
  g.__cam = [P(cam), P(look)];
  if (!g.__camHook) { g.__camHook = true; const fr = g.frame.bind(g); g.frame = (dt, al) => { fr(dt, al); const [c, l] = g.__cam; g.camera.position.set(...c); g.camera.lookAt(...l); if (!g.noRender) g.renderer.render(g.scene, g.camera); }; }
}, [which, cam, look]);
const hasRail = await A.evaluate(() => window.__game.events.rails.length > 0);
if (hasRail) {
  await A.evaluate(() => { const g = window.__game, z = g.events.rails[0]; const n = Math.floor((g.simT + z.phi) / z.P) + 1; g.simT = Math.max(g.simT, n * z.P - z.phi + z.tC - 4.6); });
  for (const p of [A, B]) await camAt(p, 'rail', [-40, -8, 3.5], [0, 4, 3]);
  await A.waitForTimeout(4600);
  await Promise.all([A.screenshot({ path: `tools/out/mp-${bana}-tag-vard.png` }), B.screenshot({ path: `tools/out/mp-${bana}-tag-gast.png` })]);
  const vis = await B.evaluate(() => { const z = window.__game.events.rails[0]; return { tåg: z.train.visible, bommar: +z.down.toFixed(2), ljus: z.lights }; });
  console.log('gästen vid övergången:', JSON.stringify(vis), JSON.stringify(await both()));
}
const hasKlaff = await A.evaluate(() => window.__game.events.klaffs.length > 0);
if (hasKlaff) {
  await A.evaluate(() => { const g = window.__game, z = g.events.klaffs[0]; const n = Math.floor((g.simT + z.phi) / z.P) + 1; g.simT = Math.max(g.simT, n * z.P - z.phi + z.tMid - 3.5); });
  for (const p of [A, B]) await camAt(p, 'klaff', [0, -130, -4], [0, 0, -2]);
  await A.waitForTimeout(3000);
  await Promise.all([A.screenshot({ path: `tools/out/mp-${bana}-bro-vard.png` }), B.screenshot({ path: `tools/out/mp-${bana}-bro-gast.png` })]);
  const vis = await B.evaluate(() => { const z = window.__game.events.klaffs[0]; return { vinkel: Math.round(z.ang * 57.3), bommar: +z.down.toFixed(2), rött: z.lights, båt: z.boat.position.toArray().map(Math.round) }; });
  console.log('gästen vid klaffbron:', JSON.stringify(vis), JSON.stringify(await both()));
}
// tåget träffar gästens bil: värden ställer Bertil på rälsen
if (hasRail) {
  await A.evaluate(() => { const g = window.__game, z = g.events.rails[0], b = g.cars.find(c => c.name === 'Bertil'); const n = Math.floor((g.simT + z.phi) / z.P) + 1; g.simT = Math.max(g.simT, n * z.P - z.phi + z.tH0 - 2); g.placeCar(b, z.f.c, 0, 0); b.ghostT = 0; b.veh.setGhost(false); });
  await A.waitForTimeout(4500);
  const hit = await A.evaluate(() => window.__game.events.log.filter(l => l.bil === 'Bertil').map(l => l.typ));
  const hp = await B.evaluate(() => Math.round(window.__game.me.health));
  console.log('tåget mot gästens bil: värden loggade', JSON.stringify(hit), '| gästens hälsa', hp);
}
console.log(errors.length ? 'FEL:\n' + errors.slice(0, 12).join('\n') : 'inga fel');
await browser.close();
