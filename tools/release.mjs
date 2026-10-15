// Släpp: node tools/release.mjs 0.9.1
// Bumpar VERSION och PROTO (+1) i config.js, data-v i index.html, ?v=N i alla importer och version.json
// (som öppna flikar frågar efter för att veta att de ska ladda om). Kör från repots rot.
import fs from 'fs';

const ver = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(ver || '')) { console.error('Ange ny version, t.ex.: node tools/release.mjs 0.9.1'); process.exit(1); }
let cfg = fs.readFileSync('js/config.js', 'utf8');
const old = +cfg.match(/export const PROTO = (\d+);/)[1], nu = old + 1;
cfg = cfg.replace(/export const VERSION = '[^']*';/, `export const VERSION = '${ver}';`).replace(/export const PROTO = \d+;/, `export const PROTO = ${nu};`);
fs.writeFileSync('js/config.js', cfg);
const files = ['index.html', ...fs.readdirSync('js').filter(f => f.endsWith('.js')).map(f => 'js/' + f)];
let n = 0;
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  let t = s.replace(/\?v=\d+/g, () => { n++; return '?v=' + nu; });
  if (f === 'index.html') t = t.replace(/data-v="\d+"/, `data-v="${nu}"`);
  if (t !== s) fs.writeFileSync(f, t);
}
fs.writeFileSync('version.json', JSON.stringify({ version: ver, proto: nu }) + '\n');
console.log(`v${ver} · PROTO ${old} → ${nu} · ${n} importer · version.json skriven`);
