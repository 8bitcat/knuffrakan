// Prispallen med stora fordon: buss, stridsvagn (kanonen), brandbil — pokalerna får inte gå in i fordonen
import { createRequire } from 'module';
const require = createRequire('D:/Qisy/QISYFrontend/QISYFrontend-1/package.json');
const { chromium } = require('playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1300, height: 760 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
await page.addInitScript(() => localStorage.setItem('knuff_bana', 'djungel'));
await page.goto(`http://localhost:${process.env.PORT || 8810}/?auto&nogear`);
await page.waitForFunction(() => window.ready === true && window.__game?.me, null, { timeout: 90000 });
const kinds = (process.argv[2] || 'bus,stridsvagn,brandbil').split(',');
await page.evaluate((K) => { const g = window.__game; const bots = g.cars.filter(c => c.brain).slice(0, 3);
  bots.forEach((c, i) => g.setSpec(c, { ...c.spec, kind: K[i], gear: i === 1 ? ['plog', 'pushbar'] : [] }));
  g.gp = { stage: 'final', podium: bots.map(c => c.id), table: [], order: [], idx: 0 }; g.race.phase = 'podium'; g.race.t = 30; }, kinds);
for (const [i, w] of [1500, 4500, 8000].entries()) { await page.waitForTimeout(i ? w - [1500, 4500, 8000][i - 1] : w); await page.screenshot({ path: `tools/out/podium-${kinds.join('-')}-${i}.png` }); }
console.log(errors.length ? errors.join('\n') : 'inga fel');
await browser.close();
