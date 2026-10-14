// Simulera ett race utan rendering och mät dynamiken: node tools/sim.mjs [sekunder] [query]
import { createRequire } from 'module';
const require = createRequire('D:/Qisy/QISYFrontend/QISYFrontend-1/package.json');
const { chromium } = require('playwright');
const secs = +(process.argv[2] || 150), query = process.argv[3] || '?auto&bot', bana = process.argv[4] || 'hoppbacken';
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
await page.addInitScript((b) => localStorage.setItem('knuff_bana', b), bana);
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
await page.goto(`http://localhost:${process.env.PORT || 8810}/${query}`);
await page.waitForFunction(() => window.ready === true && window.__game?.me, null, { timeout: 90000 });
const out = await page.evaluate(async (secs) => {
  const g = window.__game;
  g.tick = () => {}; // stoppa den vanliga loopen
  g.race.toGrid(1);
  g.dmgLog = [];
  const DT = 1 / 60, samples = [];
  let wrecks = 0, finishT = null, t0 = performance.now();
  const ow = g.wreck.bind(g); g.wreck = (c) => { wrecks++; ow(c); };
  for (let k = 0; k < secs * 60; k++) {
    g.step(DT);
    if (g.race.phase === 'results' && finishT === null) finishT = g.race.raceT;
    if (k % 600 === 0 && g.race.order) {
      const o = g.race.order;
      const sp = o.map(c => c.veh.speed * 3.6);
      samples.push({ t: Math.round(g.race.raceT), phase: g.race.phase, lap: o[0].lap + 1, lead: Math.round(o[0].prog), spread: Math.round(o[0].prog - o[o.length - 1].prog),
        mid: Math.round(o[0].prog - o[Math.floor(o.length / 2)].prog), maxKmh: Math.round(Math.max(...sp)), avgKmh: Math.round(sp.reduce((a, b) => a + b, 0) / sp.length), me: g.me.place });
    }
    if (k % 300 === 0) await new Promise(r => setTimeout(r, 0));
  }
  const by = {}; (g.respawnLog || []).forEach(l => by[l[2]] = (by[l[2]] || 0) + 1);
  const dl = g.dmgLog; const agg = {}; for (const [ty, dv, dmg, dir] of dl) { const k = ty + '/' + dir; agg[k] ||= { n: 0, dmg: 0, big: 0 }; agg[k].n++; agg[k].dmg += dmg; if (dmg >= 20) agg[k].big++; }
  const T = g.track; const where = {};
  for (const [t, name, why, sOld, lat] of (g.respawnLog || [])) {
    if (why !== 'off') continue;
    let tag = 'annat';
    for (const f of T.features) { const c = f.lip ?? f.s0; const d = T.sdist(sOld, c); if (d > -250 && d < 450) { tag = f.type + '@' + Math.round(c) + (f.type === 'jump' ? ' d' + Math.round(d / 50) * 50 : ''); break; } }
    where[tag] = (where[tag] || 0) + 1;
  }
  const ovp = T.features.find(f => f.type === 'overpass');
  const offList = (g.respawnLog || []).filter(r => r[2] === 'off' && ovp && Math.abs(T.sdist(r[3], ovp.up)) < 500 || r[2] === 'off' && ovp && Math.abs(T.sdist(r[3], ovp.lo)) < 500).map(r => ({ s: r[3], lat: r[4], dy: r[5], kmh: r[6], globS: r[7], globLat: r[8], globDy: r[9] }));
  const allOff = (g.respawnLog || []).filter(r => r[2] === 'off').map(r => [r[3], r[4], r[5], r[6], T.flags[T.idx(r[3])]]);
  return { allOff, offNaraKorsning: offList, ovp: { up: Math.round(ovp?.up), lo: Math.round(ovp?.lo) }, offVar: where, wallGuard: g.wallGuardN || 0, dmgAgg: agg, dvHist: [6,8,10,13,16,20,30].map((lim, i, a) => (i ? a[i-1] : 0) + '-' + lim + ':' + dl.filter(d => d[1] >= (i ? a[i-1] : 0) && d[1] < lim).length).join(' '), wallS: ((performance.now() - t0) / 1000).toFixed(1), wrecks, respawns: by, finishT, results: (g.race.results || []).slice(0, 5).map(r => r.name + ' ' + (r.time ? r.time.toFixed(1) : '-')), samples };
}, secs);
console.log(JSON.stringify(out, null, 0).replace(/\{"t"/g, '\n {"t"'));
if (errors.length) console.log(errors.join('\n'));
await browser.close();
