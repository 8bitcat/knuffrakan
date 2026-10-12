// Skärmdumpar av garaget (närbild på bilen) för olika lack/kaross
import { createRequire } from 'module';
const require = createRequire('D:/Qisy/QISYFrontend/QISYFrontend-1/package.json');
const { chromium } = require('playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
await page.goto(`http://localhost:${process.env.PORT || 8810}/`);
await page.waitForFunction(() => window.ready === true, null, { timeout: 90000 });
await page.click('#garagebtn');
const steps = (process.argv[2] || '0').split(',');
for (const [k, s] of steps.entries()) {
  if (s.startsWith('sh')) await page.click(`[data-sh="${s.slice(2)}"]`);
  if (s.startsWith('p')) await page.click(`[data-p="${s.slice(1)}"]`);
  if (s.startsWith('pat')) await page.click(`[data-pat="${s.slice(3)}"]`);
  await page.waitForTimeout(+(process.argv[3] || 1500));
  await page.screenshot({ path: `tools/out/garage-${k}.png` });
}
if (errors.length) console.log(errors.join('\n'));
await browser.close();
