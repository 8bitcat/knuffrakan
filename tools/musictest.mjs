// Musiken: Knuffrakan-låten, en egen MIDI-fil (genereras här: typ 1, tempobyte, löpande status, trummor),
// en ljudfil (mp3), att den egna filen sparas över omladdning och startar när man kör — och N slår av/på.
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire('D:/Qisy/QISYFrontend/QISYFrontend-1/package.json');
const { chromium } = require('playwright');
const base = process.env.BASE || 'http://localhost:8810/';
// --- en liten MIDI-fil ---
const vlq = (n) => { const b = [n & 0x7f]; while ((n >>= 7)) b.unshift((n & 0x7f) | 0x80); return b; };
const trk = (ev) => { const d = ev.flat(); return [0x4d, 0x54, 0x72, 0x6b, (d.length >> 24) & 255, (d.length >> 16) & 255, (d.length >> 8) & 255, d.length & 255, ...d]; };
const tempo = (us) => [0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255];
const t0 = trk([[...vlq(0), ...tempo(500000)], [...vlq(480 * 8), ...tempo(400000)], [...vlq(0), 0xff, 0x2f, 0]]);
const mel = [[...vlq(0), 0xc0, 81]];
const notes = [60, 64, 67, 72, 67, 64, 60, 62, 65, 69, 74, 69, 65, 62, 64, 67];
notes.forEach((n, i) => { mel.push([...vlq(i ? 0 : 0), ...(i ? [] : [0x90]), ...(i ? [0x90] : []), n, 100]); mel.push([...vlq(240), n, 0]); });   // löpande status: 'av' utan statusbyte
mel.push([...vlq(0), 0xff, 0x2f, 0]);
const dr = [];
for (let i = 0; i < 16; i++) { dr.push([...vlq(i ? 0 : 0), 0x99, i % 2 ? 38 : 36, 110], [...vlq(0), 0x99, 42, 80], [...vlq(240), 0x89, i % 2 ? 38 : 36, 0], [...vlq(0), 0x89, 42, 0]); }
dr.push([...vlq(0), 0xff, 0x2f, 0]);
const midi = Buffer.from([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, 3, 0x01, 0xe0, ...t0, ...trk(mel), ...trk(dr)]);
fs.mkdirSync('tools/out', { recursive: true });
fs.writeFileSync('tools/out/testlat.mid', midi);

const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1100, height: 680 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' || /musiken/.test(m.text())) errors.push('CONSOLE ' + m.text()); });
await page.goto(base);
await page.waitForFunction(() => window.ready === true, null, { timeout: 90000 });
const st = () => page.evaluate(() => { const m = window.__game.audio.music; return `val ${m.choice} spelar ${m.playing} röster ${m.voices} noter ${m.song?.notes.length ?? '-'} längd ${m.song ? m.song.dur.toFixed(1) + ' s' : (m.src ? 'ljudfil' : '-')} fil «${m.fileName}» volym ${m.out ? m.out.gain.value.toFixed(2) : '-'}`; });
await page.click('#musbtn'); await page.waitForTimeout(400);
await page.click('[data-mus="tema"]'); await page.waitForTimeout(1500);
console.log('Knuffrakan-låten:', await st());
await page.screenshot({ path: 'tools/out/musik-panel.png' });
await page.setInputFiles('#mfile', 'tools/out/testlat.mid'); await page.waitForTimeout(1500);
console.log('egen MIDI:      ', await st());
const firstNotes = await page.evaluate(() => window.__game.audio.music.song.notes.slice(0, 6).map(n => `${n.t.toFixed(2)}s k${n.ch} ${n.note} ${n.dur.toFixed(2)}`).join(' | '));
console.log('  första noterna:', firstNotes);
await page.setInputFiles('#mfile', 'audio/wind.mp3'); await page.waitForTimeout(1500);
console.log('egen mp3:       ', await st());
await page.setInputFiles('#mfile', 'tools/out/testlat.mid'); await page.waitForTimeout(800);
await page.click('#mdone');
// ladda om: valet + filen ska finnas kvar och starta när man kör
await page.reload();
await page.waitForFunction(() => window.ready === true, null, { timeout: 90000 });
console.log('efter omladdning (meny):', await st());
await page.evaluate(() => window.__solo());
await page.waitForFunction(() => window.__game.race.phase === 'race', null, { timeout: 60000 });
await page.waitForTimeout(1200);
console.log('i racet:        ', await st());
await page.keyboard.press('KeyN'); await page.waitForTimeout(400);
console.log('N (av):         ', await st());
await page.keyboard.press('KeyN'); await page.waitForTimeout(900);
console.log('N (på igen):    ', await st());
await page.keyboard.press('KeyM'); await page.waitForTimeout(300);
console.log('M (ljud av):    ', await st());
console.log(errors.length ? errors.join('\n') : 'inga fel');
await browser.close();
