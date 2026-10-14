// Återskapar cache-blandningen: gammal index.html (i cachen) + ny kod från servern.
// Spelet ska märka det, ladda om sig förbi cachen och starta utan fel.
import { createRequire } from 'module';
import fs from 'node:fs';
const require = createRequire('D:/Qisy/QISYFrontend/QISYFrontend-1/package.json');
const { chromium } = require('playwright');
const base = process.env.BASE || `http://localhost:${process.env.PORT || 8810}/`;
const oldHtml = fs.readFileSync('tools/out/old-index.html', 'utf8');
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 560 } });
const errors = [], navs = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('framenavigated', (f) => { if (f === page.mainFrame()) navs.push(f.url()); });
let served = 0;
await page.route((url) => url.pathname.endsWith('/knuffrakan/') || url.pathname === '/', (route) => {
  if (new URL(route.request().url()).searchParams.has('_v')) return route.continue();
  served++;
  route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: oldHtml });
});
await page.goto(base);
await page.waitForFunction(() => window.ready === true, null, { timeout: 90000 }).catch(() => {});
const st = await page.evaluate(() => ({ ready: !!window.ready, dataV: document.documentElement.dataset.v, lobbyEl: !!document.getElementById('lready'), load: document.getElementById('loadtxt')?.textContent, menu: !document.getElementById('menu')?.classList.contains('hidden') }));
console.log('gammal sida serverad:', served, 'gång(er)');
console.log('navigeringar:', navs.map(u => u.replace(base, '/')).join('  →  '));
console.log('läge:', JSON.stringify(st));
console.log('fel:', errors.length ? errors.join(' | ') : 'inga');
await browser.close();
