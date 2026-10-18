// Hur ofta åker varje fordonstyp av banan (respawn 'off') — 2 bottar per typ, SECS sekunder, BANA=…
import { spawnSync } from 'child_process';
const bana = process.env.BANA || 'hoppbacken', secs = +(process.env.SECS || 60);
const KINDS = process.env.KINDS || 'ufo,plan,gokart,brandbil,stridsvagn,stock,formel,bus';
const js = `(async () => { const g = window.__game, wait = ms => new Promise(r => setTimeout(r, ms));
 const bots = g.cars.filter(c => c.brain && c !== g.me); const K = '${KINDS}'.split(',');
 bots.forEach((c, i) => g.setSpec(c, { ...c.spec, kind: K[i % K.length], gear: [] }));
 while (g.race.phase !== 'race') await wait(200);
 const off = {}, guard = {}; const or = g.respawn.bind(g); g.respawn = (c, s, why) => { if (why === 'off') off[c.spec.kind] = (off[c.spec.kind] || 0) + 1; return or(c, s, why); };
 const t0 = performance.now(); while (performance.now() - t0 < ${secs * 1000}) await wait(500);
 return JSON.stringify({ bana: '${bana}', avBanan: off, vakt: g.wallGuardN || 0 }); })()`;
const r = spawnSync('node', ['tools/eval.mjs', `?auto&bot&bana=${bana}&nogear`, '2', js], { encoding: 'utf8', timeout: (secs + 150) * 1000 });
console.log((r.stdout || '').trim().split('\n').slice(-2).join('\n'), r.stderr ? r.stderr.slice(-400) : '');
