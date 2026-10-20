// Online: gästerna kör brandbil / stridsvagn / UFO och håller E i lobbyn — värden räknar förmågan, gästen ser
// sitt eget läge + tank (ur ögonblicksbilden), stridsvagnens granat syns hos alla. Rätt fordon hos alla.
import { createRequire } from 'module';
const require = createRequire('D:/Qisy/QISYFrontend/QISYFrontend-1/package.json');
const { chromium } = require('playwright');
const room = 'S' + Math.floor(Math.random() * 90000 + 10000);
const base = process.env.BASE || 'http://localhost:8810/';
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11'] });
const errors = [];
const mk = async (tag, kind) => {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 560 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(tag + ' PAGEERROR ' + e.message));
  await p.addInitScript(([n, k]) => { localStorage.setItem('knuff_namn', n); localStorage.setItem('knuff_spec', JSON.stringify({ colors: ['#d8141c', '#ffd21f', '#fff'], pattern: 'split', number: 7, sponsor: 'TURBOFIL', shape: 1, kind: k })); }, [tag, kind]);
  await p.goto(base);
  await p.waitForFunction(() => window.ready === true, null, { timeout: 90000 });
  await p.click('#roomopen'); await p.fill('#roomin', room); await p.click('#roomgo');
  await p.waitForFunction(() => window.__game?.me && window.__game.race.phase === 'lobby', null, { timeout: 60000 });
  return p;
};
const A = await mk('Anna', 'gokart');
const G = { brandbil: await mk('Bertil', 'brandbil'), stridsvagn: await mk('Cissi', 'stridsvagn'), ufo: await mk('Dante', 'ufo') };
await A.waitForTimeout(3000);
const names = { brandbil: 'Bertil', stridsvagn: 'Cissi', ufo: 'Dante' };
console.log('fordon hos värden:', await A.evaluate(() => window.__game.cars.filter(c => !c.brain).map(c => c.name + '=' + c.veh.T.id + '/' + c.view.constructor.name).join(' ')));
console.log('fordon hos Bertil:', await G.brandbil.evaluate(() => window.__game.cars.filter(c => !c.brain || c.isPlayer).map(c => c.name + '=' + c.veh.T.id + '/' + c.view.constructor.name).join(' ')));
for (const [kind, P] of Object.entries(G)) {
  await P.keyboard.down('ArrowUp'); await P.keyboard.down('KeyE'); await P.waitForTimeout(1300);
  const host = await A.evaluate((n) => { const c = window.__game.cars.find(x => x.name === n); return `läge ${(c.veh.loader || 0).toFixed(2)} tank ${(c.veh.tank ?? -1).toFixed(2)} granater ${window.__game.weapons.proj.filter(p => p.type === 5).length}`; }, names[kind]);
  const guest = await P.evaluate(() => { const g = window.__game, me = g.me; return `läge ${(me.veh.loader || 0).toFixed(2)} tank ${(me.veh.tank ?? -1).toFixed(2)} knapp ${document.getElementById('tk').textContent} mätare ${document.getElementById('spslot').classList.contains('hidden') ? 'dold' : document.querySelector('#spslot b').style.width}`; });
  console.log(kind, '| värden:', host, '| gästen:', guest);
  await P.screenshot({ path: `tools/out/mpspecial-${kind}.png` });
  await P.keyboard.up('KeyE'); await P.keyboard.up('ArrowUp');
}
console.log(errors.length ? errors.join('\n') : 'inga fel');
await browser.close();
