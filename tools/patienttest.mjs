// Ambulansens patienter: spelarens ambulans släpper bårarna, en bot kommer bakifrån — snurrar den? + bild + självläkning
import { spawnSync } from 'child_process';
const js = `(async () => { const g = window.__game, me = g.me, wait = ms => new Promise(r => setTimeout(r, ms));
  g.setSpec(me, { ...me.spec, kind: 'ambulans', gear: [] }); me.brain.aggr = 0;
  while (!(g.race.phase === 'race' && g.race.raceT > 4.5)) await wait(200);
  const b = g.cars.find(c => c.brain && c !== me); g.setSpec(b, { ...b.spec, kind: 'stock', gear: [] }); b.brain.aggr = 0;
  g.placeCar(me, me.trk.s + 80, 0, 18); me.brain.lane = 0; await wait(600);
  g.placeCar(b, me.trk.s - 35, 0, 30); b.brain.lane = 0; b.health = 100;
  g.specialFire(me, 'patienter'); await wait(200);
  const n = g.weapons.proj.filter(p => p.type === 10).length;
  let spin = 0; for (let i = 0; i < 30; i++) { await wait(100); spin = Math.max(spin, Math.abs(b.veh.angv.y)); }
  const flying = g.weapons.proj.filter(p => p.type === 10).map(p => p.pos.y.toFixed(1)).join(',');
  me.health = 50; me.lastDmgT = g.simT - 5; await wait(2000);
  return 'bårar ute: ' + n + ', offret snurr max ' + spin.toFixed(1) + ' rad/s, skada ' + Math.round(100 - b.health) + ' | bårarnas höjd ' + flying + ' | självläkning 50 → ' + Math.round(me.health); })()`;
const r = spawnSync('node', ['tools/eval.mjs', '?auto&bot&nogear&bana=hoppbacken', '1', js], { encoding: 'utf8', timeout: 150000 });
console.log((r.stdout || '').trim().split('\n').slice(-2).join(' | '), r.stderr ? r.stderr.slice(-300) : '');
