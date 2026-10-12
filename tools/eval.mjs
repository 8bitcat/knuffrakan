// Kör ett uttryck i spelet efter N sekunder: node tools/eval.mjs "<query>" <sek> "<js-uttryck>"
import { createRequire } from 'module';
const require = createRequire('D:/Qisy/QISYFrontend/QISYFrontend-1/package.json');
const { chromium } = require('playwright');
const [,, query = '', secs = '5', expr = '1'] = process.argv;
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`http://localhost:${process.env.PORT || 8810}/${query}`);
await page.waitForFunction(() => window.ready === true, null, { timeout: 90000 });
await page.waitForTimeout(+secs * 1000);
console.log(await page.evaluate(expr));
if (errors.length) console.log('FEL:', errors.slice(0, 10).join('\n'));
await browser.close();
