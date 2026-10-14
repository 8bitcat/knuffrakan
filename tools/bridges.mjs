// Skärmdumpar av broarna: underifrån (nedre vägen) och över dalen
import { createRequire } from 'module';
const require = createRequire('D:/Qisy/QISYFrontend/QISYFrontend-1/package.json');
const { chromium } = require('playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.addInitScript(() => localStorage.setItem('knuff_bana', 'hoppbacken'));
await page.goto(`http://localhost:${process.env.PORT || 8810}/?auto&bot`);
await page.waitForFunction(() => window.ready === true && window.__game?.race.phase === 'race', null, { timeout: 90000 });
const shot = async (name, fn, arg) => { await page.evaluate(fn, arg); await page.waitForTimeout(250); await page.screenshot({ path: `tools/out/${name}.png` }); };
// fri kamera: stäng av jaktkameran
await page.evaluate(() => { const g = window.__game; g.cam.update = () => {}; });
const ovp = await page.evaluate(() => window.__game.track.features.find(f => f.type === 'overpass'));
await shot('bro-under', (o) => { const g = window.__game, T = g.track; const f = T.sampleAt(o.lo - 90); const c = g.camera; c.position.set(f.x + f.rx * 6, f.y + 3.5, f.z + f.rz * 6); const t = T.sampleAt(o.lo + 10); c.lookAt(t.x, t.y + 6, t.z); }, ovp);
await shot('bro-sida', (o) => { const g = window.__game, T = g.track; const f = T.sampleAt(o.up); const c = g.camera; c.position.set(f.x + f.rx * 140 - f.fx * 60, f.y + 10, f.z + f.rz * 140 - f.fz * 60); c.lookAt(f.x, f.y - 6, f.z); }, ovp);
const val = await page.evaluate(() => window.__game.track.features.find(f => f.type === 'valley'));
await shot('dal-sida', (v) => { const g = window.__game, T = g.track; const c = g.camera; c.position.set(v.x - v.tz * 230 + v.tx * 40, v.floorY + 22, v.z + v.tx * 230 + v.tz * 40); c.lookAt(v.x, v.floorY + 18, v.z); }, val);
const jmp = await page.evaluate(() => window.__game.track.features.find(f => f.type === 'jump'));
await shot('hopp-sida', (j) => { const g = window.__game, T = g.track; const f = T.sampleAt(j.lip + 8); const c = g.camera; c.position.set(f.x + f.rx * 70 - f.fx * 30, f.y + 6, f.z + f.rz * 70 - f.fz * 30); c.lookAt(f.x, f.y - 6, f.z); }, jmp);
await browser.close();
