// Ett race där bottarna kör alla fordon (2 av varje) och använder E — räkna träffar per förmåga + fel + farten per typ
import { spawnSync } from 'child_process';
const bana = process.env.BANA || 'hoppbacken', secs = +(process.env.SECS || 70);
const js = `(async () => { const g = window.__game, wait = ms => new Promise(r => setTimeout(r, ms));
 const K = ['v2', 'polis', 'ambulans', 'valt', 'spokbil', 'heli', 'stock', 'formel', 'bus', 'heli', 'ambulans', 'gokart', 'ufo'];
 const bots = g.cars.filter(c => c.brain && c !== g.me); bots.forEach((c, i) => g.setSpec(c, { ...c.spec, kind: K[i % K.length], gear: [] }));
 while (g.race.phase !== 'race') await wait(200);
 const hits = {}; const on = g.notify.bind(g); g.notify = (c, t, k) => { if (k === 'bad') { const w = String(t).trim().split(' ')[0]; hits[w] = (hits[w] || 0) + 1; } on(c, t, k); };
 const fired = {}; const of = g.specialFire.bind(g); g.specialFire = (A, SP) => { fired[SP] = (fired[SP] || 0) + 1; of(A, SP); };
 const st = {}; const t0 = performance.now(); while (performance.now() - t0 < ${secs * 1000}) { await wait(300);
   for (const c of bots) { const k = c.spec.kind; st[k] ||= { n: 0, f: 0, on: 0 }; if (c.wrecked) continue; st[k].n++; st[k].f += c.veh.speed * 3.6; if ((c.veh.loader || 0) > 0.3) st[k].on++; } }
 const fart = Object.fromEntries(Object.entries(st).map(([k, s]) => [k, Math.round(s.f / Math.max(1, s.n)) + (s.on ? '/' + Math.round(100 * s.on / s.n) + '%' : '')]));
 return JSON.stringify({ avfyrat: fired, traffarPaAndra: hits, fartOchAndelIgang: fart, wrecks: g.cars.filter(c => c.wrecked).length }); })()`;
const r = spawnSync('node', ['tools/eval.mjs', `?auto&bot&bana=${bana}&nogear`, '2', js], { encoding: 'utf8', timeout: (secs + 150) * 1000 });
console.log((r.stdout || '').trim().split('\n').slice(-3).join('\n'), r.stderr ? r.stderr.slice(-600) : '');
