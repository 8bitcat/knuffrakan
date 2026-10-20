// Rummen: (1) kod med åäö, (2) GRAND PRIX utan kod, (3) en gäst med nyare version → värden uppdaterar och båda
// hamnar ihop igen, (4) strikt nät (UDP avstängt hos gästen) → tydligt besked i stället för ett eget tomt rum
import { createRequire } from 'module';
const require = createRequire('D:/Qisy/QISYFrontend/QISYFrontend-1/package.json');
const { chromium } = require('playwright');
const base = process.env.BASE || 'http://localhost:8810/';
const only = process.argv[2] || '1,2,3,4';
const mkBrowser = (extra = []) => chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', ...extra] });
const errors = [];
const page = async (browser, name) => {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 600 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(name + ' PAGEERROR ' + e.message));
  await p.addInitScript((n) => localStorage.setItem('knuff_namn', n), name);
  await p.goto(base);
  await p.waitForFunction(() => window.ready === true, null, { timeout: 90000 });
  return p;
};
const join = async (p, code) => { await p.click('#roomopen'); await p.fill('#roomin', code); await p.click('#roomgo'); };
const inLobby = (p) => p.waitForFunction(() => window.__game?.me && window.__game.race.phase === 'lobby', null, { timeout: 90000 });
const who = (p) => p.evaluate(() => { const g = window.__game; return `${g.mode || 'solo'} rum ${g.room} · människor: ${g.cars.filter(c => !c.brain).map(c => c.name).join(', ')}`; });

const B = await mkBrowser();
if (only.includes('1')) {
  const room = 'HÄST' + String.fromCharCode(65 + Math.floor(Math.random() * 26)) + Math.floor(Math.random() * 9);
  const a = await page(B, 'Henry'), b = await page(B, 'Kompis');
  await join(a, room); await inLobby(a); await join(b, room); await inLobby(b); await b.waitForTimeout(2500);
  console.log('1 åäö-kod', room, '| Henry:', await who(a), '| Kompis:', await who(b));
  await a.context().close(); await b.context().close();
}
if (only.includes('2')) {
  const a = await page(B, 'Henry');
  await a.click('#roomopen'); await a.fill('#roomin', 'hä st!7'); await a.waitForTimeout(200);
  const v = await a.evaluate(() => `kod «${document.getElementById('roomin').value}» · ${document.getElementById('roomhint').textContent}`);
  await a.fill('#roomin', 'ab'); await a.click('#roomgo'); await a.waitForTimeout(300);
  console.log('2 tecken:', v, '| för kort:', await a.evaluate(() => `${document.getElementById('roomhint').textContent} · i spelet: ${!!window.__game.me}`));
  await a.context().close();
}
if (only.includes('3')) {
  const room = 'VER' + Math.floor(Math.random() * 900 + 100);
  const a = await page(B, 'Henry');
  await join(a, room); await inLobby(a);
  // låtsas att nästa gäst har en nyare version (bara en gång — sidan laddas om)
  await a.evaluate(() => { const h = window.__game.net, o = h.onData.bind(h); let once = true; h.onData = (c, d) => { if (once && d?.t === 'hello') { once = false; d = { ...d, proto: d.proto + 1 }; } return o(c, d); }; });
  const b = await page(B, 'Kompis');
  await join(b, room);
  await a.waitForTimeout(25000);
  const ra = await who(a).catch(e => 'fel ' + e.message), rb = await who(b).catch(e => 'fel ' + e.message);
  console.log('3 versionsbyte | Henry:', ra, '| Kompis:', rb);
  await a.context().close(); await b.context().close();
}
if (only.includes('4')) {
  const room = 'NET' + Math.floor(Math.random() * 900 + 100);
  const a = await page(B, 'Henry');
  await join(a, room); await inLobby(a);
  const B2 = await mkBrowser();
  // strikt nät: gästens webbläsare hittar inga vägar till värden (alla ICE-kandidater kastas)
  const ctx2 = await B2.newContext({ viewport: { width: 1000, height: 600 } });
  await ctx2.addInitScript(() => { const R = window.RTCPeerConnection; window.RTCPeerConnection = function (...a) { const pc = new R(...a);
    pc.addIceCandidate = () => Promise.resolve();
    Object.defineProperty(pc, 'onicecandidate', { set(fn) { this._oc = fn; }, get() { return this._oc; } });
    const ae = pc.addEventListener.bind(pc); pc.addEventListener = (t, f, o) => (t === 'icecandidate' ? undefined : ae(t, f, o));
    setTimeout(() => {}, 0); return pc; }; window.RTCPeerConnection.prototype = R.prototype; });
  const b = await ctx2.newPage();
  b.on('pageerror', (e) => errors.push('Kompis PAGEERROR ' + e.message));
  await b.goto(base); await b.waitForFunction(() => window.ready === true, null, { timeout: 90000 });
  const t0 = Date.now();
  await join(b, room);
  await b.waitForFunction(() => window.__game?.me, null, { timeout: 90000 });
  console.log(`4 strikt nät (${Math.round((Date.now() - t0) / 1000)} s) | Kompis:`, await who(b), '| besked:', await b.evaluate(() => document.getElementById('netstatus').textContent), '| Henry:', await who(a));
  await B2.close();
}
console.log(errors.length ? errors.join('\n') : 'inga fel');
await B.close();
