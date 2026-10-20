// Kostar banhändelserna? Ritanrop och bildtid vid tågövergången/klaffbron, med och utan händelserna synliga.
// node tools/eventperf.mjs [bana]
import { createRequire } from 'module';
const require = createRequire('D:/Qisy/QISYFrontend/QISYFrontend-1/package.json');
const { chromium } = require('playwright');
const bana = process.argv[2] || 'host';
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.addInitScript((b) => localStorage.setItem('knuff_bana', b), bana);
await page.goto(`http://localhost:${process.env.PORT || 8810}/?auto&bot&nogear`);
await page.waitForFunction(() => window.__game?.race.phase === 'race', null, { timeout: 90000 });
const res = await page.evaluate(async () => {
  const g = window.__game, E = g.events, T = g.track;
  g.cam.update = () => {};
  const out = {};
  const measure = async (frames = 90) => {
    let n = 0, calls = 0, tri = 0; const t0 = performance.now();
    await new Promise((res) => { const f = () => { calls += g.renderer.info.render.calls; tri += g.renderer.info.render.triangles; if (++n < frames) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    return { ms: +((performance.now() - t0) / frames).toFixed(1), calls: Math.round(calls / frames), tri: Math.round(tri / frames) };
  };
  const look = (s0, c, l) => { const P = (a) => { const f = T.sampleAt(s0 + a[0]); return [f.x + f.rx * a[1], f.y + a[2], f.z + f.rz * a[1]]; }; const [cc, ll] = [P(c), P(l)]; const fr = g.__fr || (g.__fr = g.frame.bind(g)); g.frame = (dt, al) => { fr(dt, al); g.camera.position.set(...cc); g.camera.lookAt(...ll); }; };
  for (const [kind, z] of [...E.rails.map(z => ['tåg', z]), ...E.klaffs.map(z => ['klaff', z])]) {
    const n = Math.floor((g.simT + z.phi) / z.P) + 1;
    g.simT = n * z.P - z.phi + (kind === 'tåg' ? z.tC : z.tMid) - 1;
    look(kind === 'tåg' ? z.f.c : z.sM, [-45, -8, 4], [0, 0, 3]);
    await new Promise(r => setTimeout(r, 300));
    const on = await measure();
    E.root.visible = false;
    const off = await measure();
    E.root.visible = true;
    out[kind] = { med: on, utan: off };
  }
  return out;
});
console.log(bana, JSON.stringify(res));
await browser.close();
