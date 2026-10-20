// De fem nya förmågorna, en i taget under kontrollerade former (spelarens bil styrs av en lugn bot)
import { spawnSync } from 'child_process';
const T = {
  polis: `g.weapons.spikes(me); g.placeCar(b, me.trk.s - 40, me.trk.lat, 28); b.brain.lane = me.trk.lat;
    await wait(3500); return 'offret punktering: ' + (b.punctT > 0) + ' (punctT ' + (b.punctT || 0).toFixed(1) + '), fart ' + Math.round(b.veh.speed * 3.6) + ' km/h, skada ' + Math.round(100 - b.health);`,
  ambulans: `g.specialFire(me, 'patienter'); await wait(300); const n = g.weapons.proj.filter(p => p.type === 10 && p.owner === me).length;
    me.health = 50; me.lastDmgT = g.simT - 5; await wait(2000); return 'bårar ute: ' + n + ', självläkning 50 → ' + Math.round(me.health);`,
  heli: `let h = 0; const ob = me.brain; me.brain = { update: (dt, c) => { Object.assign(c.veh.input, { throttle: 1, brake: 0, steer: 0, loader: 1 }); } }; const t0 = performance.now(); while (performance.now() - t0 < 3500) { await wait(100); h = Math.max(h, me.veh.pos.y - me.trk.y); }
    me.brain = ob; return 'helikoptern flög högst ' + h.toFixed(1) + ' m över vägen, tank ' + (me.veh.tank ?? 1).toFixed(2);`,
  valt: `g.placeCar(b, me.trk.s + 6.5, me.trk.lat, 4); b.brain.lane = me.trk.lat; me.veh.body.setLinvel({ x: me.veh.fwd.x * 9, y: 0, z: me.veh.fwd.z * 9 }, true);
    g.specialFire(me, 'platta'); let flat = 0; for (let i = 0; i < 30; i++) { await wait(100); if (b.flatT > 0) flat = 1; }
    return 'offret plattat: ' + !!flat + ', skada ' + Math.round(100 - b.health) + ', bildens höjd ' + b.view.group.scale.y.toFixed(2);`,
  spokbil: `g.placeCar(b, me.trk.s + 9, me.trk.lat, 4); b.brain.lane = me.trk.lat; me.veh.body.setLinvel({ x: me.veh.fwd.x * 22, y: 0, z: me.veh.fwd.z * 22 }, true);
    const s0 = me.trk.s; g.specialFire(me, 'spoke'); let maxAv = 0; for (let i = 0; i < 25; i++) { await wait(80); maxAv = Math.max(maxAv, Math.abs(b.veh.angv.y)); }
    return 'jag förbi offret: ' + (g.track.sdist(me.trk.s, b.trk.s) > 0) + ', offret skrämt (snurr ' + maxAv.toFixed(1) + '), min skada ' + Math.round(100 - me.health) + ', offrets skada ' + Math.round(100 - b.health);`,
  v2: `g.placeCar(b, me.trk.s + 60, me.trk.lat, 6); b.brain.lane = me.trk.lat; g.specialFire(me, 'v2'); let h = 0; for (let i = 0; i < 40; i++) { await wait(100); h = Math.max(h, b.veh.pos.y - b.trk.y); }
    const r1 = 'offret: skada ' + Math.round(100 - b.health) + ', högst ' + h.toFixed(1) + ' m';
    // sprängs V2-bilen med laddad raket smäller den
    me.veh.tank = 1; const n0 = g.cars.filter(c => c !== me).map(c => c.health); g.placeCar(b, me.trk.s + 4, me.trk.lat + 3, 0); await wait(100);
    me.health = 0; g.wreck(me); await wait(200);
    return r1 + ' | V2-bilen sprängdes: grannen skada ' + Math.round(100 - b.health) + ' (tank efteråt ' + me.veh.tank + ')';`,
};
for (const kind of (process.argv[2] || Object.keys(T).join(',')).split(',')) {
  const js = `(async () => { const g = window.__game, me = g.me, wait = ms => new Promise(r => setTimeout(r, ms));
    g.setSpec(me, { ...me.spec, kind: '${kind}', gear: [] }); me.brain.aggr = 0;
    while (!(g.race.phase === 'race' && g.race.raceT > 4.5)) await wait(200);
    const b = g.cars.find(c => c.brain && c !== me); g.setSpec(b, { ...b.spec, kind: 'stock', gear: [] }); b.brain.aggr = 0; b.health = 100; me.health = 100;
    g.placeCar(me, me.trk.s + 80, 0, 20); me.brain.lane = 0; await wait(500);
    ${T[kind]} })()`;
  const r = spawnSync('node', ['tools/eval.mjs', '?auto&bot&nogear&bana=hoppbacken', '1', js], { encoding: 'utf8', timeout: 150000 });
  console.log(kind.padEnd(9), (r.stdout || '').trim().split('\n').slice(-2).join(' | '), r.stderr ? r.stderr.slice(-300) : '');
}
