// Skärmdumpar av banhändelserna (tåg vid övergången, bommar, klaffbro med båt): node tools/eventshot.mjs <bana> [namn-prefix]
// Kameran står still; tiden sätts genom värdens klocka (simT) så att tåget/båten är där vi vill.
import { createRequire } from 'module';
const require = createRequire('D:/Qisy/QISYFrontend/QISYFrontend-1/package.json');
const { chromium } = require('playwright');
const bana = process.argv[2] || 'snoberget', pre = process.argv[3] || 'ev';
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript((b) => localStorage.setItem('knuff_bana', b), bana);
await page.goto(`http://localhost:${process.env.PORT || 8810}/?auto&bot&nogear`);
await page.waitForFunction(() => window.__game?.race.phase === 'race', null, { timeout: 90000 });
await page.evaluate(() => { const g = window.__game; g.cam.update = () => {}; g.treeRange = 4000; });
// cam: [s-förskjutning, lat, höjd] relativt händelsen, look: [s, lat, höjd]; tid: funktion av zonen
const shot = async (name, which, camF, lookF, tf) => {
  const info = await page.evaluate(([which, camF, lookF, tf]) => {
    const g = window.__game, E = g.events, T = g.track;
    const [kind, idx] = which; const z = (kind === 'rail' ? E.rails : kind === 'ras' ? E.slides : E.klaffs)[idx];
    if (!z) return null;
    // tid: tau i cykeln (en bit fram så att vi inte backar)
    const n = Math.floor((g.simT + z.phi) / z.P) + 2;
    g.simT = n * z.P - z.phi + new Function('z', 'return ' + tf)(z);
    const s0 = kind === 'rail' ? z.f.c : kind === 'ras' ? z.s : z.sM;
    const ev = (x) => typeof x === 'string' ? new Function('z', 'return ' + x)(z) : x;
    const P = (a) => { const f = T.sampleAt(s0 + ev(a[0])); return [f.x + f.rx * ev(a[1]), f.y + ev(a[2]), f.z + f.rz * ev(a[1])]; };
    const c = P(camF), l = P(lookF);
    g.__shotCam = [c, l];
    g.camera.position.set(...c); g.camera.lookAt(...l);
    return E.state();
  }, [which, camF, lookF, tf]);
  await page.evaluate(() => { const g = window.__game; const [c, l] = g.__shotCam; g.camera.position.set(...c); g.camera.lookAt(...l); });
  await page.waitForTimeout(700);
  await page.evaluate(() => { const g = window.__game; const [c, l] = g.__shotCam; g.camera.position.set(...c); g.camera.lookAt(...l); });
  await page.waitForTimeout(100);
  await page.screenshot({ path: `tools/out/${pre}-${bana}-${name}.png` });
  console.log(name, JSON.stringify(info));
};
// egna bilder: node tools/eventshot.mjs <bana> <prefix> '[["namn","klaff",[ds,lat,h],[ds,lat,h],"z.tMid"], …]'
if (process.argv[4]) {
  for (const [name, kind, c, l, tf] of JSON.parse(process.argv[4])) await shot(name, [kind, 0], c, l, tf);
  if (errors.length) console.log('FEL: ' + errors.slice(0, 10).join(' | '));
  await browser.close(); process.exit(0);
}
const hasRail = await page.evaluate(() => window.__game.events.rails.length);
const hasKlaff = await page.evaluate(() => window.__game.events.klaffs.length);
if (hasRail) {
  // tåget på väg in: bommarna nere, ljusen blinkar (från vägen före stopplinjen)
  await shot('tag-kommer', ['rail', 0], [-45, -6, 3.2], [0, 6, 3], 'z.tC - 2.2');
  await shot('tag-passerar', ['rail', 0], [-34, 5, 2.4], [0, -4, 3], 'z.tC + 0.9');
  await shot('tag-sida', ['rail', 0], [-70, -60, 22], [0, 0, 2], 'z.tC + 0.4');
  await shot('bommar-uppe', ['rail', 0], [-40, 0, 4], [0, 0, 2], 'z.tC - 14');
  await shot('tunnel', ['rail', 0], [-25, -25, 30], [0, -400, 5], 'z.tC - 9');
}
if (hasKlaff) {
  await shot('bro-stangd', ['klaff', 0], [-60, 70, 10], [0, 0, -4], 'z.tO0 - 10');
  await shot('bro-oppnar', ['klaff', 0], [-55, 0, 3.2], [0, 0, 4], 'z.tO0 + 1.6');
  await shot('bro-oppen-bat', ['klaff', 0], [-50, 2, 3.4], [0, 0, 6], 'z.tMid - 0.4');
  await shot('bro-sida-bat', ['klaff', 0], [-140, 150, 18], [0, 0, -2], 'z.tMid');
  await shot('bat-brygga', ['klaff', 0], [-80, 200, 30], [0, 0, -8], 'z.tO0 - 12');
}
if (errors.length) console.log('FEL:\n' + errors.slice(0, 10).join('\n'));
await browser.close();
