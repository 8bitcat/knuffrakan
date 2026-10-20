// Race med bottar på banor med banhändelser: hur ofta träffar tåget, hur många hoppar/plaskar vid klaffbron,
// kommer alla i mål? Med "krok" körs bottarna med stopp-kroken (game.events.stopAhead) som föreslås för ai.js.
// node tools/eventsim.mjs <bana> [sekunder] [krok]
import { createRequire } from 'module';
const require = createRequire('D:/Qisy/QISYFrontend/QISYFrontend-1/package.json');
const { chromium } = require('playwright');
const bana = process.argv[2] || 'host', secs = +(process.argv[3] || 200), hook = process.argv[4] === 'krok';
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
await page.addInitScript((b) => localStorage.setItem('knuff_bana', b), bana);
await page.goto(`http://localhost:${process.env.PORT || 8810}/?auto&bot`);
await page.waitForFunction(() => window.ready === true && window.__game?.me, null, { timeout: 90000 });
const out = await page.evaluate(async ([secs, hook]) => {
  const g = window.__game, E = g.events, DT = 1 / 60;
  g.tick = () => {};
  // föreslagen krok i ai.js (efter "if (lift) …"): sakta in så att bilen kommer fram när det är fritt
  const AIHOOK = (car) => {
    const inp = car.veh.input, sp = car.veh.speed;
    const cap = g.events?.speedCap?.(car) ?? -1;
    car.__cap = cap; car.__capHist = (car.__capHist || []).slice(-240); car.__capHist.push([Math.round(g.simT * 10) / 10, Math.round(cap), Math.round(sp), Math.round(car.trk.s)]);
    if (cap >= 0 && sp > cap) { inp.throttle = 0; inp.brake = Math.min(1, (sp - cap) / 10); car.brain.stuckT = 0; }
  };
  const wrap = () => { if (!hook) return; for (const c of g.cars) if (c.brain && !c.brain.__ev) { const b = c.brain, up = b.update.bind(b); b.update = (dt, car, game) => { up(dt, car, game); AIHOOK(car); }; b.__ev = true; } };
  g.race.toGrid(1);
  let wrecks = 0; const ow = g.wreck.bind(g); g.wreck = (c) => { wrecks++; ow(c); };
  E.log.length = 0;
  let stops = 0, finishT = null, t0 = performance.now(), maxWait = 0;
  const waitT = new Map();
  for (let k = 0; k < secs * 60; k++) {
    wrap();
    const nl = E.log.length;
    g.step(DT);
    for (const l of E.log.slice(nl)) if (l.typ.startsWith('tåg')) { const c = g.cars.find(x => x.name === l.bil); l.fore = (c?.__capHist || []).filter((x, i, a) => i % 30 === 0 || i === a.length - 1).slice(-8); l.brain = !!c?.brain; }
    if (g.race.phase === 'results' && finishT === null) finishT = g.race.raceT;
    // bottar som står still vid en stopplinje
    if (k % 30 === 0) for (const c of g.cars) {
      if (c.hidden) continue;
      const st = E.stopAhead(c);
      if (st >= 0 && st < 30 && c.veh.speed < 3) { stops++; waitT.set(c, (waitT.get(c) || 0) + 0.5); maxWait = Math.max(maxWait, waitT.get(c)); } else waitT.set(c, 0);
    }
    if (k % 300 === 0) await new Promise(r => setTimeout(r, 0));
  }
  const by = {}; for (const l of E.log) by[l.typ] = (by[l.typ] || 0) + 1;
  const hits = E.log.filter(l => l.typ.startsWith('tåg'));
  const resp = {}; (g.respawnLog || []).forEach(l => resp[l[2]] = (resp[l[2]] || 0) + 1);
  const o = g.race.order || g.cars;
  return { traffar: hits, handelser: by, respawns: resp, vrak: wrecks, stillastaende: stops, langstaVantan_s: maxWait, malTid: finishT, varv: o[0] ? o[0].lap : null, ledare: o[0]?.name, sist: Math.round(o[o.length - 1]?.prog || 0), ms: Math.round(performance.now() - t0) };
}, [secs, hook]);
console.log(bana, hook ? '(med krok)' : '(utan krok)', JSON.stringify(out));
if (errors.length) console.log(errors.join('\n'));
await browser.close();
