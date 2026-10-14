// Skärmdumpar vid banans delar: bilen (AI-körd) ställs en bit före varje del.
// node tools/features.mjs [bana]
import { createRequire } from 'module';
const require = createRequire('D:/Qisy/QISYFrontend/QISYFrontend-1/package.json');
const { chromium } = require('playwright');
const track = process.argv[2] || 'hoppbacken';
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[konsol]', m.text()); });
await page.addInitScript((t) => localStorage.setItem('knuff_bana', t), track);
await page.goto(`http://localhost:${process.env.PORT || 8810}/?auto&bot`);
await page.waitForFunction(() => window.ready === true && window.__game?.race.phase === 'race', null, { timeout: 90000 });
const feats = await page.evaluate(() => window.__game.track.features.map(f => ({ type: f.type, s: f.lip ?? f.s0, namn: f.namn })));
console.log('delar:', JSON.stringify(feats));
const shots = [];
for (const [k, f] of feats.entries()) {
  const plan = f.type === 'jump' ? [[-260, 3.0], [-260, 3.6], [-260, 4.2]] : f.type === 'tunnel' ? [[-180, 1.6], [-180, 3.2]] : [[-200, 1.8], [-200, 3.2]];
  for (const [back, wait] of plan) {
    await page.evaluate(([s, back]) => {
      const g = window.__game, me = g.me;
      g.placeCar(me, g.track.wrapS(s + back), 0, 80); me.ghostT = 0; me.veh.setGhost(false); me.health = 100;
      g.cam.inited = false;
    }, [f.s, back]);
    await page.waitForTimeout(wait * 1000);
    const info = await page.evaluate(() => { const me = window.__game.me; return { kmh: Math.round(me.veh.speed * 3.6), y: +me.veh.pos.y.toFixed(1), roadY: +me.trk.y.toFixed(1), lat: +me.trk.lat.toFixed(1), grounded: me.veh.grounded, hp: Math.round(me.health) }; });
    const out = `tools/out/feat-${k}-${f.type}-${wait}.png`;
    await page.screenshot({ path: out });
    console.log(out, JSON.stringify(info));
  }
}
await browser.close();
