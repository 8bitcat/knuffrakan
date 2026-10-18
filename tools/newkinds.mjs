// De fyra nya fordonen i ett race: 2 av varje som bottar (de använder E), 60 s — skada givet/taget,
// specialförmågornas träffar, volter, fel. BANA=… för annan bana.
import { spawnSync } from 'child_process';
const bana = process.env.BANA || 'hoppbacken', secs = +(process.env.SECS || 60);
const js = `(async () => { const g = window.__game, wait = ms => new Promise(r => setTimeout(r, ms));
 const bots = g.cars.filter(c => c.brain && c !== g.me); const K = ['gokart', 'brandbil', 'stridsvagn', 'ufo'];
 bots.forEach((c, i) => g.setSpec(c, { ...c.spec, kind: i < 8 ? K[i % 4] : 'stock', gear: [] }));
 while (g.race.phase !== 'race') await wait(200);
 const st = {}; for (const k of [...K, 'stock']) st[k] = { n: 0, fart: 0, spec: 0, vrak: 0, prog: 0 };
 const ow = g.wreck.bind(g); g.wreck = (c) => { if (!c.wrecked) st[c.spec.kind].vrak++; ow(c); };
 let shells = 0; const oc = g.weapons.cannon.bind(g.weapons); g.weapons.cannon = (c) => { shells++; oc(c); };
 const hit = {}; const on = g.notify.bind(g); g.notify = (c, t, k) => { const m = t.match(/^(💦|🛸|💥)/); if (m && k === 'bad') hit[m[1]] = (hit[m[1]] || 0) + 1; on(c, t, k); };
 const t0 = performance.now(); while (performance.now() - t0 < ${secs * 1000}) { await wait(250);
   for (const c of bots) { const s = st[c.spec.kind]; if (c.wrecked) continue; s.n++; s.fart += c.veh.speed * 3.6; if ((c.veh.loader || 0) > 0.3) s.spec++; } }
 for (const c of bots) st[c.spec.kind].prog += c.prog / bots.filter(b => b.spec.kind === c.spec.kind).length;
 const out = {}; for (const [k, s] of Object.entries(st)) out[k] = { snittfart: Math.round(s.fart / Math.max(1, s.n)), specialAndel: +(s.spec / Math.max(1, s.n)).toFixed(2), vrak: s.vrak, framsteg: Math.round(s.prog) };
 return JSON.stringify({ out, granater: shells, traffar: hit, vakt: g.wallGuardN || 0 }); })()`;
const r = spawnSync('node', ['tools/eval.mjs', `?auto&bot&bana=${bana}&nogear`, '2', js], { encoding: 'utf8', timeout: (secs + 150) * 1000 });
console.log((r.stdout || '').trim().split('\n').slice(-3).join('\n'), r.stderr ? r.stderr.slice(-600) : '');
