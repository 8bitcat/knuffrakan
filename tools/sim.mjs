// Simulera ett race utan rendering och mät dynamiken: node tools/sim.mjs [sekunder] [query]
import { createRequire } from 'module';
const require = createRequire('D:/Qisy/QISYFrontend/QISYFrontend-1/package.json');
const { chromium } = require('playwright');
const secs = +(process.argv[2] || 150), query = process.argv[3] || '?auto&bot';
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
await page.goto(`http://localhost:${process.env.PORT || 8810}/${query}`);
await page.waitForFunction(() => window.ready === true && window.__game?.me, null, { timeout: 90000 });
const out = await page.evaluate(async (secs) => {
  const g = window.__game;
  g.tick = () => {}; // stoppa den vanliga loopen
  g.race.toGrid(1);
  const DT = 1 / 60, samples = [];
  let wrecks = 0, finishT = null, t0 = performance.now();
  const ow = g.wreck.bind(g); g.wreck = (c) => { wrecks++; ow(c); };
  for (let k = 0; k < secs * 60; k++) {
    g.step(DT);
    if (g.race.phase === 'results' && finishT === null) finishT = g.race.raceT;
    if (k % 600 === 0 && g.race.order) {
      const o = g.race.order;
      const sp = o.map(c => c.veh.speed * 3.6);
      samples.push({ t: Math.round(g.race.raceT), phase: g.race.phase, lead: Math.round(o[0].prog), spread: Math.round(o[0].prog - o[o.length - 1].prog),
        mid: Math.round(o[0].prog - o[Math.floor(o.length / 2)].prog), maxKmh: Math.round(Math.max(...sp)), avgKmh: Math.round(sp.reduce((a, b) => a + b, 0) / sp.length), me: g.me.place });
    }
    if (k % 300 === 0) await new Promise(r => setTimeout(r, 0));
  }
  const by = {}; (g.respawnLog || []).forEach(l => by[l[2]] = (by[l[2]] || 0) + 1);
  return { wallS: ((performance.now() - t0) / 1000).toFixed(1), wrecks, respawns: by, finishT, results: (g.race.results || []).slice(0, 5).map(r => r.name + ' ' + (r.time ? r.time.toFixed(1) : '-')), samples };
}, secs);
console.log(JSON.stringify(out, null, 0).replace(/\{"t"/g, '\n {"t"'));
if (errors.length) console.log(errors.join('\n'));
await browser.close();
