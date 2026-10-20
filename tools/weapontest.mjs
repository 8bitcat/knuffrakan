// Vapnen ett i taget: ge spelaren vapnet, ställ upp ett mål, tryck F på riktigt, mät skadan + bilder
// node tools/weapontest.mjs [vapen,vapen,...]
import { createRequire } from 'module';
const require = createRequire('D:/Qisy/QISYFrontend/QISYFrontend-1/package.json');
const { chromium } = require('playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
await page.addInitScript(() => localStorage.setItem('knuff_bana', 'snoberget'));
await page.goto(`${process.env.BASE || 'http://localhost:8810'}/?auto`);
await page.waitForFunction(() => window.ready === true && window.__game?.me && window.__game.race.phase === 'race', null, { timeout: 90000 });
await page.evaluate(() => { const g = window.__game; g.race.toLobby(); });
await page.waitForTimeout(500);
const which = (process.argv[2] || 'kulspruta,kanon,raket,harpun,olja,minor,chock').split(',');
// mål: (framåt m, sidled m, fart) relativt spelaren, spelarens fart, hur länge F hålls
const SET = {
  kulspruta: { b: [30, 0, 0], me: 0, hold: 2000, wait: 300 },
  kanon: { b: [30, 0, 0], me: 0, hold: 2000, wait: 300 },
  raket: { b: [45, 3, 0], me: 0, hold: 120, wait: 1400 },
  harpun: { b: [40, 0, 8], me: 0, hold: 120, wait: 2000 },
  olja: { b: [-40, 0, 22], me: 24, hold: 120, wait: 2600, drop: true },
  minor: { b: [-40, 0, 22], me: 24, hold: 120, wait: 2600, drop: true },
  chock: { b: [0, 6, 0], me: 0, hold: 120, wait: 900 },
  flamma: { b: [9, 0, 0], me: 0, hold: 2500, wait: 600 },
  laser: { b: [50, 0, 0], me: 0, hold: 120, wait: 500 },
  frys: { b: [40, 0, 8], me: 0, hold: 120, wait: 700 },
  krymp: { b: [40, 0, 0], me: 0, hold: 120, wait: 700 },
  bowling: { b: [45, 0, 0], me: 10, hold: 120, wait: 2600 },
  lim: { b: [-40, 0, 22], me: 24, hold: 120, wait: 2600, drop: true },
  tornado: { b: [60, 0, 0], me: 10, hold: 120, wait: 2600 },
  fyrverkeri: { b: [35, 0, 0], me: 0, hold: 120, wait: 1500 },
  skold: { b: [0, 4, 0], me: 0, hold: 120, wait: 600 },
  kanonkula: { b: [40, 0, 0], me: 12, hold: 120, wait: 2500 },
};
for (const id of which) {
  const S = SET[id];
  await page.evaluate(([id, S]) => {
    const g = window.__game, me = g.me, T = g.track, s0 = 1140;
    const B = g.cars.find(c => c !== me && c.brain !== undefined && c.name !== me.name && !c.isPlayer && c.spec.kind === 'stock') || g.cars.find(c => c !== me);
    window.__B = B;
    for (const c of g.cars) if (c !== me && c !== B) { c.hidden = true; }
    if (B.wrecked) g.unwreck(B);
    Object.assign(B, { hidden: false, brain: null, remote: {}, ghostT: 0, health: 100 });
    B.veh.hold = false; B.veh.disabled = false; B.veh.assist = false; B.veh.setGhost(false);
    B.remoteInput = { throttle: S.b[2] ? 0.6 : 0, brake: 0, steer: 0, handbrake: S.b[2] ? 0 : 1, loader: 0, fire: 0 };
    me.health = 100; me.ghostT = 0; me.veh.setGhost(false); me.weapon = null; me.rollT = 0;
    g.weapons.clearProj();
    g.placeCar(me, s0, 0, S.me); g.placeCar(B, s0 + S.b[0], S.b[1], S.b[2]);
    me.weapon = { id, ammo: { raket: 3, minor: 3, kulspruta: 60, kanon: 80, flamma: 45 }[id] || 1 };
    window.__s = { bpos: B.veh.pos.clone(), mev: me.veh.speed, ammo: me.weapon.ammo };
  }, [id, S]);
  await page.waitForTimeout(300);
  await page.keyboard.down('KeyF'); await page.waitForTimeout(S.hold); await page.keyboard.up('KeyF');
  if (S.drop) await page.evaluate(() => { const B = window.__B; B.remoteInput.throttle = 1; window.__minV = 1e9; window.__gooSeen = 0; const t = () => { if (B.gooT > 0) { window.__gooSeen = 1; window.__minV = Math.min(window.__minV, B.veh.speed); } if (window.__minV !== null) requestAnimationFrame(t); }; t(); });
  await page.waitForTimeout(Math.min(450, S.wait));
  await page.screenshot({ path: `tools/out/weapon-${id}.png` });
  await page.waitForTimeout(Math.max(0, S.wait - 450));
  const r = await page.evaluate((id) => {
    const g = window.__game, me = g.me, B = window.__B, s = window.__s;
    const st = (window.__minV ? 'minfart ' + Math.round(window.__minV * 3.6) + ' km/h ' : '') + ['frozenT', 'shrinkT', 'burnT', 'gooT'].filter(k => B[k] > 0).join(',') + (me.shieldT > 0 ? ' [jag: SKÖLD]' : '') + (me.ballT > 0 ? ' [jag: KULA]' : '');
    return `${id.padEnd(10)} ${B.oilT ? '[OLJAD] ' : ''}${st ? '[' + st + '] ' : ''}mål: skada ${(100 - B.health).toFixed(0)}${B.wrecked ? ' VRAK' : ''} · flyttad ${B.veh.pos.distanceTo(s.bpos).toFixed(1)} m · snurr ${B.veh.spinT > 0 ? 'ja' : 'nej'} | jag: ammo ${s.ammo}→${me.weapon?.ammo ?? 0}, fart ${(me.veh.speed * 3.6).toFixed(0)} km/h, projektiler kvar ${g.weapons.proj.length}`;
  }, id);
  console.log(r);
}
// lådorna: kör igenom en rad och få ett vapen
const box = await page.evaluate(async () => {
  const g = window.__game, me = g.me, b = g.weapons.boxes[2], wait = (ms) => new Promise(r => setTimeout(r, ms));
  me.weapon = null; me.rollT = 0;
  const p = g.track.project(b.pos.x, b.pos.z, -1, {});
  g.placeCar(me, g.track.wrapS(p.s - 25), p.lat, 25);
  await wait(2200);
  return `låda: ${g.weapons.boxes.length} st · fick ${me.weapon ? me.weapon.id + ' ×' + me.weapon.ammo : 'inget'} · lådan tillbaka om ${(b.until - g.simT).toFixed(1)} s`;
});
console.log(box);
console.log(errors.length ? errors.join('\n') : 'inga fel');
await browser.close();
