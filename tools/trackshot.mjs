// Bilder från ett race (bottar kör spelaren): node tools/trackshot.mjs <bana> [sekunder,...]
import { createRequire } from 'module';
const require = createRequire('D:/Qisy/QISYFrontend/QISYFrontend-1/package.json');
const { chromium } = require('playwright');
const [,, bana = 'is', times = '8,22,38'] = process.argv;
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 680 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.addInitScript((b) => localStorage.setItem('knuff_bana', b), bana);
await page.goto(`${process.env.BASE || 'http://localhost:8810'}/?auto&bot`);
await page.waitForFunction(() => window.__game?.race.phase === 'race', null, { timeout: 90000 });
const t0 = Date.now();
for (const s of times.split(',').map(Number)) {
  await page.waitForTimeout(Math.max(0, s * 1000 - (Date.now() - t0)));
  await page.screenshot({ path: `tools/out/track-${bana}-${s}.png` });
  console.log(s, await page.evaluate(() => { const g = window.__game, me = g.me; return JSON.stringify({ kmh: Math.round(me.veh.speed * 3.6), drift: +(me.veh.drift || 0).toFixed(2), lat: +me.trk.lat.toFixed(1), fps: window.__fps }); }));
}
await browser.close();
