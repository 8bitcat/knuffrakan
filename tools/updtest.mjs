// Uppdateringskollen: låtsas att en nyare version.json finns — menyn ska ladda om sig, i spelet ska knappen visas
import { createRequire } from 'module';
const require = createRequire('D:/Qisy/QISYFrontend/QISYFrontend-1/package.json');
const { chromium } = require('playwright');
const base = process.env.BASE || 'http://localhost:8810/';
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11'] });
const errors = [];
// 1) i menyn: ny version → laddar om med ?_v=
{
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  let fake = false;
  await page.route('**/version.json*', (r) => fake ? r.fulfill({ contentType: 'application/json', body: '{"version":"9.9.9","proto":999}' }) : r.continue());
  await page.goto(base);
  await page.waitForFunction(() => window.ready === true, null, { timeout: 90000 });
  const url0 = page.url();
  fake = true;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  // vänta på nästa koll (var 60:e s) — snabbare: ladda om sidan så kollen körs vid start
  await page.reload();
  await page.waitForURL(/_v=u/, { timeout: 30000 }).catch(() => {});
  console.log('meny: före', url0.replace(base, '/'), '→ efter', page.url().replace(base, '/'));
  await page.close();
}
// 2) i spelet: knappen visas, ingen omladdning
{
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  let fake = false;
  await page.route('**/version.json*', (r) => fake ? r.fulfill({ contentType: 'application/json', body: '{"version":"9.9.9","proto":999}' }) : r.continue());
  await page.goto(base);
  await page.waitForFunction(() => window.ready === true, null, { timeout: 90000 });
  await page.click('#solo');
  await page.waitForTimeout(1500);
  fake = true;
  await page.clock?.fastForward?.(61000).catch?.(() => {});
  await page.waitForFunction(() => !document.getElementById('updbtn').classList.contains('hidden'), null, { timeout: 70000 }).catch(() => {});
  const vis = await page.evaluate(() => ({ synlig: !document.getElementById('updbtn').classList.contains('hidden'), text: document.getElementById('updbtn').textContent, url: location.search }));
  console.log('i spelet:', JSON.stringify(vis));
  await page.screenshot({ path: 'tools/out/updbtn.png' });
  await page.close();
}
console.log(errors.length ? errors.join('\n') : 'inga fel');
await browser.close();
