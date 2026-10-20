// V2-raketen i hög fart: spelarens V2-bil kör ~250 km/h och skjuter — raketen ska stiga och sedan rusa FÖRBI
// bilen framåt (utan mål → vägen långt fram; med mål → bilen framför). Loggar raketens läge längs banan mot bilens.
import { spawnSync } from 'child_process';
for (const withTarget of [false, true]) {
  const js = `(async () => { const g = window.__game, me = g.me, wait = ms => new Promise(r => setTimeout(r, ms));
    g.setSpec(me, { ...me.spec, kind: 'v2', gear: [] });
    while (!(g.race.phase === 'race' && g.race.raceT > 4.5)) await wait(200);
    for (const c of g.cars) if (c !== me && c.brain) { c.brain.aggr = 0; g.placeCar(c, me.trk.s - 400 - Math.random() * 200, (Math.random() - 0.5) * 20, 10); }
    me.brain = { update: (dt, c) => { Object.assign(c.veh.input, { throttle: 1, brake: 0, steer: -c.trk.lat * 0.05, loader: 0 }); } };
    me.veh.vmax = 75; g.placeCar(me, me.trk.s + 600, 0, 69); await wait(400);
    const b = g.cars.find(c => c.brain && c !== me);
    if (${withTarget}) { g.placeCar(b, me.trk.s + 90, 0, 60); b.brain.lane = 0; b.health = 100; }
    let blast = null; const ob = g.weapons.v2Blast.bind(g.weapons); g.weapons.v2Blast = (pos, ...r) => { const t = {}; g.track.project(pos.x, pos.z, me.trk.i, t); blast = 'smällen ' + Math.round(g.track.sdist(t.s, me.trk.s)) + ' m framför bilen'; return ob(pos, ...r); };
    const kmh = Math.round(me.veh.speed * 3.6); g.specialFire(me, 'v2');
    const log = []; for (let i = 0; i < 40 && !blast; i++) { await wait(100); const p = g.weapons.proj.find(q => q.type === 8); if (p && i % 3 === 0) { const t = {}; g.track.project(p.pos.x, p.pos.z, me.trk.i, t); log.push(Math.round(g.track.sdist(t.s, me.trk.s)) + '/' + Math.round(p.pos.y - me.veh.pos.y)); } }
    return '${withTarget ? 'med mål' : 'utan mål'}: ' + kmh + ' km/h · raketen före(+)/efter bilen m / höjd: ' + log.join(' ') + ' · ' + blast + (${withTarget} ? ' · målets skada ' + Math.round(100 - b.health) : ''); })()`;
  const r = spawnSync('node', ['tools/eval.mjs', '?auto&bot&nogear&bana=hoppbacken', '1', js], { encoding: 'utf8', timeout: 150000 });
  console.log((r.stdout || '').trim().split('\n').slice(-1).join(''), r.stderr ? r.stderr.slice(-300) : '');
}
