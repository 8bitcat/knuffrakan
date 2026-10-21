// Brandbilens vatten: en stillastående stockcar D m framför, sprutas 1,2 s — hur långt åt sidan flyttas den?
import { spawnSync } from 'child_process';
const out = [];
for (const D of (process.argv[2] || '5,9,14').split(',').map(Number)) {
  const js = `(async () => { const g = window.__game, me = g.me, wait = ms => new Promise(r => setTimeout(r, ms));
    g.setSpec(me, { ...me.spec, kind: 'brandbil', gear: [] });
    while (!(g.race.phase === 'race' && g.race.raceT > 4.5)) await wait(200);
    const hold = (c) => ({ update: (dt, car) => { Object.assign(car.veh.input, { throttle: 0, brake: 0, handbrake: 1, steer: 0, loader: c ? 1 : 0, fire: 0 }); } });
    for (const c of g.cars) if (c !== me && c.brain) { c.brain.aggr = 0; g.placeCar(c, me.trk.s - 300 - Math.random() * 200, (Math.random() - 0.5) * 20, 0); }
    me.brain = hold(false); const s0 = 1140 - 400; g.placeCar(me, 1140, 0, 0);
    const b = g.cars.find(c => c.brain && c !== me); g.setSpec(b, { ...b.spec, kind: 'stock', gear: [] }); b.brain = hold(false);
    g.placeCar(b, s0 + 400 + 3.6 + 2.4 + ${D}, 0.4, 0); await wait(300); const lxm = (() => { const a = me.veh, rx = b.veh.pos.x - a.pos.x, rz = b.veh.pos.z - a.pos.z; return (rx * a.right.x + rz * a.right.z).toFixed(1); })(); b.health = 100; await wait(800);
    const lat0 = b.trk.lat, p0 = b.veh.pos.clone(); me.brain = hold(true); await wait(1200); me.brain = hold(false); await wait(600);
    return '${D} m (lx ' + lxm + '): åt sidan ' + Math.abs(b.trk.lat - lat0).toFixed(1) + ' m, totalt ' + b.veh.pos.distanceTo(p0).toFixed(1) + ' m, skada ' + Math.round(100 - b.health); })()`;
  const r = spawnSync('node', ['tools/eval.mjs', '?auto&bot&nogear&bana=snoberget', '1', js], { encoding: 'utf8', timeout: 150000 });
  out.push((r.stdout || '').trim().split('\n').slice(-1).join(''));
}
console.log(out.join(' | '));
