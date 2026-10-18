// Specialförmågorna i ett riktigt race: spelarens bil (styrd av en bot) är X — skärmdump när förmågan är igång
import { createRequire } from 'module';
const require = createRequire('D:/Qisy/QISYFrontend/QISYFrontend-1/package.json');
const { chromium } = require('playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const errors = [];
for (const kind of (process.argv[2] || 'brandbil,stridsvagn,ufo,gokart').split(',')) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
  page.on('pageerror', (e) => errors.push(kind + ' PAGEERROR ' + e.message));
  await page.addInitScript((k) => { localStorage.setItem('knuff_bana', 'hoppbacken'); const s = JSON.parse(localStorage.getItem('knuff_spec') || '{}'); }, kind);
  await page.goto(`http://localhost:${process.env.PORT || 8810}/?auto&bot&nogear`);
  await page.waitForFunction(() => window.ready === true && window.__game?.me, null, { timeout: 90000 });
  await page.evaluate((k) => { const g = window.__game; g.setSpec(g.me, { ...g.me.spec, kind: k, gear: [] }); }, kind);
  await page.waitForFunction(() => window.__game.race.phase === 'race', null, { timeout: 60000 });
  let shots = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 45000 && shots < 2) {
    const k = await page.evaluate(() => window.__game.me.veh.loader || 0);
    if (kind === 'gokart' ? Date.now() - t0 > 8000 + shots * 6000 : k > 0.6) {
      if (kind === 'stridsvagn') await page.waitForTimeout(90);
      await page.screenshot({ path: `tools/out/special-${kind}-${shots}.png` });
      shots++;
      await page.waitForTimeout(2500);
    } else await page.waitForTimeout(40);
  }
  console.log(kind, 'bilder:', shots, await page.evaluate(() => { const g = window.__game; return `hp ${Math.round(g.me.health)} plats ${g.me.place}`; }));
  await page.close();
}
console.log(errors.length ? errors.join('\n') : 'inga fel');
await browser.close();
