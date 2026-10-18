// Planet mot muren: 4 planbottar + 4 vanliga i 60 s — skada per minut (vägg/bil), vingspetsar genom muren, vurpor
import { spawnSync } from 'child_process';
const bana = process.env.BANA || 'hoppbacken', secs = +(process.env.SECS || 60);
const js = `(async () => { const g = window.__game, wait = ms => new Promise(r => setTimeout(r, ms));
 const bots = g.cars.filter(c => c.brain && c !== g.me); const P = bots.slice(0, 4), S = bots.slice(4, 8);
 P.forEach(c => g.setSpec(c, { ...c.spec, kind: 'plan', gear: [] })); S.forEach(c => g.setSpec(c, { ...c.spec, kind: 'stock', gear: [] }));
 while (g.race.phase !== 'race') await wait(200);
 const dm = { plan: { vägg: 0, bil: 0 }, stock: { vägg: 0, bil: 0 } }; let tips = 0, n = 0, flips = 0, wr = 0;
 const oh = g.handleImpacts.bind(g); g.handleImpacts = () => { const pre = [...P, ...S].map(c => c.health); oh(); [...P, ...S].forEach((c, i) => { const d = pre[i] - c.health; if (d > 0) { const k = i < 4 ? 'plan' : 'stock'; dm[k][c.lastHitBy && g.time - c.lastHitT < 0.05 ? 'bil' : 'vägg'] += d; } }); };
 const T = g.track, up = new Map();
 const t0 = performance.now(); while (performance.now() - t0 < ${secs * 1000}) { await wait(100);
   for (const c of P) { if (c.wrecked) continue; n++; const v = c.veh, i = c.trk.i, rhx = -T.hz[i], rhz = T.hx[i];
     const rr = v.right.x * rhx + v.right.z * rhz; if (Math.abs(c.trk.lat) + Math.abs(rr) * 3.1 > T.halfW + 0.4 && !(c.trk.f & 1)) tips++;
     const u = v.up.y < 0.2; if (u && !up.get(c)) flips++; up.set(c, u); } }
 const r = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v * 60 / ${secs} / 4)]));
 return JSON.stringify({ skadaPerBilOchMin: { plan: r(dm.plan), stock: r(dm.stock) }, vingspetsIMuren: tips + ' av ' + n, vurpor: flips, kvarPlan: P.filter(c => !c.wrecked).length + '/4', varvPlan: P.map(c => c.lap ?? c.trk.lapS ?? '').join(',') }); })()`;
const r = spawnSync('node', ['tools/eval.mjs', `?auto&bot&bana=${bana}&nogear`, '2', js], { encoding: 'utf8', timeout: (secs + 120) * 1000 });
console.log((r.stdout || '').trim().split('\n').pop(), r.stderr ? r.stderr.slice(-300) : '');
