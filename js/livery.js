// Reklamlack: tvåfärgsmönster, stora nummer, påhittade sponsorer, rutor och dekaler.
// Målas på en 1024×1024-canvas. Vänster sida = nedre halvan, höger = övre (vänd 180°),
// taket i mitten. u = längs bilen (0 = nosen), v = runt tvärsnittet.
import * as THREE from 'three';
import { V } from './carmodel.js?v=4';

export const SPONSORS = [
  'SKRUTTKOLA', 'TURBOFIL', 'KANELBULLEN', 'PLÅTIS', 'RAKETOST', 'SNÖKRUT', 'BRUMBRUM', 'KROCKCOLA',
  'GNISTA', 'BLIXTKORV', 'RYMDKOMPIS', 'NITROMJÖLK', 'ÄLGKRAFT', 'FJÄLLFART', 'GLASSKALAS', 'NORRSKEN',
  'TOMTEGAS', 'VROOMVATTEN', 'MUMSMACKA', 'KNÄCKEBOOST',
];
export const PATTERNS = ['split', 'swoosh', 'stripes', 'fade', 'flames', 'shards', 'tech', 'halves'];
export const PALETTES = [
  ['#27c93f', '#1f4fd8', '#ffffff'], ['#e8222e', '#ffffff', '#111111'], ['#101114', '#e8222e', '#ffffff'],
  ['#ff4fa3', '#ffffff', '#2bd6e8'], ['#ffd21f', '#101114', '#ffffff'], ['#ff7a1a', '#1d3ea8', '#ffffff'],
  ['#7a2ff0', '#a6ff2e', '#ffffff'], ['#f4f4f6', '#1f5bff', '#e8222e'], ['#0f3d2e', '#ffd21f', '#ffffff'],
  ['#2bd6e8', '#101114', '#ff4fa3'], ['#c41430', '#ffd21f', '#101114'], ['#1a1d33', '#ff7a1a', '#ffffff'],
  ['#9aa3b5', '#101114', '#ffd21f'], ['#ffffff', '#101114', '#27c93f'],
];

const SZ = 1024, HALF = 512;
const hy = (v) => (0.5 - v) * 2 * HALF;     // halv-canvas y för v (0..0.5)

function rng(seed) { let s = (seed * 9301 + 49297) % 233280 || 1; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }

// Själva mönstret på halv-canvasen (x = u·1024, y = hy(v))
function drawPattern(c, spec, sh) {
  const [base, a1, a2] = spec.colors;
  const X = (u) => u * SZ;
  c.fillStyle = base; c.fillRect(0, 0, SZ, HALF);
  const r = rng(spec.seed + 7);
  switch (spec.pattern) {
    case 'split': {
      c.fillStyle = a1;
      c.beginPath(); c.moveTo(X(0.42), HALF); c.lineTo(X(0.66), 0); c.lineTo(SZ, 0); c.lineTo(SZ, HALF); c.closePath(); c.fill();
      c.fillStyle = a2;
      c.beginPath(); c.moveTo(X(0.395), HALF); c.lineTo(X(0.635), 0); c.lineTo(X(0.655), 0); c.lineTo(X(0.415), HALF); c.closePath(); c.fill();
      break;
    }
    case 'swoosh': {
      c.fillStyle = a1;
      c.beginPath(); c.moveTo(0, hy(V[2])); c.bezierCurveTo(X(0.3), hy(V[1]), X(0.55), hy(V[5]), SZ, hy(V[6]));
      c.lineTo(SZ, HALF); c.lineTo(0, HALF); c.closePath(); c.fill();
      c.strokeStyle = a2; c.lineWidth = 14;
      c.beginPath(); c.moveTo(0, hy(V[2]) - 16); c.bezierCurveTo(X(0.3), hy(V[1]) - 16, X(0.55), hy(V[5]) - 16, SZ, hy(V[6]) - 16); c.stroke();
      break;
    }
    case 'stripes': {
      c.fillStyle = a1;
      c.fillRect(0, 0, SZ, 26); c.fillRect(0, 46, SZ, 26);
      c.fillRect(0, hy(V[4]) - 8, SZ, 22);
      c.fillStyle = a2; c.fillRect(0, hy(V[4]) + 16, SZ, 7);
      break;
    }
    case 'fade': {
      const g = c.createLinearGradient(X(0.25), 0, X(0.95), 0);
      g.addColorStop(0, base); g.addColorStop(1, a1);
      c.fillStyle = g; c.fillRect(0, 0, SZ, HALF);
      c.strokeStyle = a2; c.lineWidth = 5; c.globalAlpha = 0.85;
      for (let k = 0; k < 7; k++) { const y = hy(V[1]) - 20 - k * 22; c.beginPath(); c.moveTo(X(0.55 + k * 0.03), y); c.lineTo(SZ, y - 60); c.stroke(); }
      c.globalAlpha = 1;
      break;
    }
    case 'flames': {
      c.fillStyle = a1;
      for (let k = 0; k < 9; k++) {
        const y0 = hy(V[1]) - k * 50, len = 0.35 + r() * 0.3;
        c.beginPath(); c.moveTo(0, y0 - 30); c.quadraticCurveTo(X(len * 0.6), y0 - 60, X(len), y0 - 10 - r() * 40);
        c.quadraticCurveTo(X(len * 0.55), y0 + 4, 0, y0 + 26); c.closePath(); c.fill();
      }
      c.fillStyle = a2;
      for (let k = 0; k < 9; k++) {
        const y0 = hy(V[1]) - k * 50, len = 0.18 + r() * 0.15;
        c.beginPath(); c.moveTo(0, y0 - 14); c.quadraticCurveTo(X(len * 0.6), y0 - 30, X(len), y0 - 6);
        c.quadraticCurveTo(X(len * 0.5), y0 + 2, 0, y0 + 12); c.closePath(); c.fill();
      }
      break;
    }
    case 'shards': {
      for (let k = 0; k < 7; k++) {
        c.fillStyle = k % 3 === 2 ? a2 : a1;
        const x = X(0.3 + r() * 0.7), y = r() * HALF;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x + 120 + r() * 160, y - 80 - r() * 120); c.lineTo(x + 60 + r() * 100, y + 60 + r() * 90); c.closePath(); c.fill();
      }
      c.fillStyle = a1; c.fillRect(X(0.78), 0, SZ, HALF);
      break;
    }
    case 'tech': {
      c.fillStyle = a1; c.fillRect(X(0.55), 0, SZ, HALF);
      c.strokeStyle = a2; c.lineWidth = 4;
      for (let k = 0; k < 16; k++) { const x = X(0.4) + k * 22; c.beginPath(); c.moveTo(x, HALF); c.lineTo(x + 180, 0); c.stroke(); }
      c.strokeStyle = base; c.lineWidth = 3;
      for (let k = 0; k < 8; k++) { const x = X(0.7) + k * 30; c.beginPath(); c.moveTo(x, HALF); c.lineTo(x + 140, 0); c.stroke(); }
      break;
    }
    case 'halves': {
      c.fillStyle = a1; c.fillRect(0, hy(V[3]), SZ, HALF);
      c.fillStyle = a2; c.fillRect(0, hy(V[3]) - 10, SZ, 12);
      break;
    }
  }
  // Rutor (mörkt glas)
  const glass = (u0, u1, v0, v1, rr = 18) => {
    const x0 = X(u0), x1 = X(u1), y0 = hy(v1), y1 = hy(v0);
    const g = c.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, '#20263a'); g.addColorStop(1, '#0a0c14');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(x0 + rr, y0); c.lineTo(x1 - rr, y0); c.quadraticCurveTo(x1, y0, x1, y0 + rr);
    c.lineTo(x1, y1 - rr); c.quadraticCurveTo(x1, y1, x1 - rr, y1); c.lineTo(x0 + rr, y1); c.quadraticCurveTo(x0, y1, x0, y1 - rr);
    c.lineTo(x0, y0 + rr); c.quadraticCurveTo(x0, y0, x0 + rr, y0); c.fill();
  };
  const r0 = sh.roofT0, r1 = sh.roofT1;
  glass(r0 - 0.16, r0 - 0.012, V[6] + 0.008, 0.5, 6);               // vindruta
  glass(r0 - 0.02, r1 + 0.05, V[6] + 0.006, V[8] - 0.004, 24);       // sidoruta
  glass(r1 + 0.02, 0.86, V[7], 0.5, 6);                              // bakruta
  // vindrutans banderoll
  c.fillStyle = a1 === '#ffffff' || a1 === '#f4f4f6' ? '#101114' : a1;
  c.fillRect(X(r0 - 0.045), 0, X(0.03), hy(V[6]) - 4);
}

function fitText(c, txt, font, maxW) {
  c.font = font;
  const w = c.measureText(txt).width;
  return w > maxW ? maxW / w : 1;
}

export function makeLivery(spec, sh) {
  const cv = document.createElement('canvas'); cv.width = cv.height = SZ;
  const c = cv.getContext('2d');
  const half = document.createElement('canvas'); half.width = SZ; half.height = HALF;
  drawPattern(half.getContext('2d'), spec, sh);
  // nedre halvan = vänster sida, övre = spegelvänd höger sida
  c.drawImage(half, 0, HALF);
  c.save(); c.translate(0, HALF); c.scale(1, -1); c.drawImage(half, 0, 0); c.restore();

  const [base, a1, a2] = spec.colors;
  const numFill = spec.numColor || (base === '#ffffff' || base === '#f4f4f6' ? '#101114' : '#ffffff');
  const numStroke = spec.numStroke || a1;
  const X = (u) => u * SZ;
  const sideTop = hy(V[5]), sideBot = hy(V[1]);          // i halv-canvas
  const sideH = sideBot - sideTop;

  // Text på båda sidor: vänster normalt, höger roterad 180° (samma läge längs bilen)
  const sideText = (fn) => {
    c.save(); c.translate(0, HALF); fn((u) => u * SZ); c.restore();
    c.save(); c.translate(SZ, HALF); c.rotate(Math.PI); fn((u) => SZ - u * SZ); c.restore();
  };
  const outlined = (txt, x, y, font, fill, stroke, lw, sx = 1, sy = 1, maxW = 9999) => {
    c.save();
    c.translate(x, y);
    const f = fitText(c, txt, font, maxW);
    c.scale(sx * f, sy);
    c.font = font; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    if (stroke) { c.lineWidth = lw; c.strokeStyle = stroke; c.strokeText(txt, 0, 0); }
    c.fillStyle = fill; c.fillText(txt, 0, 0);
    c.restore();
  };
  const num = String(spec.number);
  const numFont = `italic 900 ${Math.round(sideH * 0.95)}px "Exo 2", sans-serif`;
  const sponsor = spec.sponsor;
  const spFont = spec.sponsorFont || `italic 900 ${Math.round(sideH * 0.42)}px "Exo 2", sans-serif`;

  sideText((mx) => {
    // dörrnummer
    outlined(num, mx(0.53), sideTop + sideH * 0.5, numFont, numFill, numStroke, 16, 1, 1.25, X(0.2));
    // sponsor bakom bakhjulet
    outlined(sponsor, mx(0.9), sideTop + sideH * 0.48, spFont, numFill, '#00000088', 6, 1, 1.15, X(0.16));
    // sponsor framför dörren
    outlined(sponsor, mx(0.33), sideTop + sideH * 0.55, `italic 800 ${Math.round(sideH * 0.3)}px "Exo 2", sans-serif`, numFill, null, 0, 1, 1.2, X(0.14));
    // kontingensdekaler nertill fram
    const r = rng(spec.seed);
    for (let k = 0; k < 5; k++) {
      const x = mx(0.07 + k * 0.035) - 15, y = sideBot - 30;
      c.fillStyle = ['#ffffff', '#ffd21f', '#e8222e', '#1f4fd8', '#101114'][Math.floor(r() * 5)];
      c.fillRect(x, y, 30, 18);
      c.fillStyle = '#00000099'; c.fillRect(x + 4, y + 6, 22, 5);
    }
    // förarnamn ovanför sidorutan
    c.font = '700 20px Montserrat, sans-serif'; c.textAlign = 'center';
    c.fillStyle = '#ffffff'; c.fillText(spec.driver || '', mx((sh.roofT0 + sh.roofT1) / 2), hy(V[6]) + 26);
  });

  // takets nummer (läses från vänster sida)
  const roofW = hy(V[8]) * 2;
  outlined(num, X((sh.roofT0 + sh.roofT1) / 2), HALF, `italic 900 ${Math.round(roofW * 0.82)}px "Exo 2", sans-serif`, numFill, numStroke, 14, 1.05, 1, X(sh.roofT1 - sh.roofT0) * 0.95);
  // huvsponsor (läses framifrån)
  c.save();
  c.translate(X(0.2), HALF);
  c.rotate(Math.PI / 2);
  const hoodW = hy(V[6]) * 2 * 0.9;
  const fit = fitText(c, sponsor, `italic 900 120px "Exo 2", sans-serif`, hoodW);
  c.scale(fit * 1.0, 0.7);
  c.font = `italic 900 120px "Exo 2", sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.lineWidth = 10; c.strokeStyle = '#00000066'; c.strokeText(sponsor, 0, 0);
  c.fillStyle = numFill; c.fillText(sponsor, 0, 0);
  c.restore();
  // vindrutebanderollens text
  c.save(); c.translate(X(sh.roofT0 - 0.03), HALF); c.rotate(Math.PI / 2);
  c.font = '900 22px Montserrat, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = '#ffffff'; c.fillText('KNUFFRAKAN', 0, 0);
  c.restore();

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;

  // Gavlar: fram (vänster halva) och bak (höger halva)
  const ecv = document.createElement('canvas'); ecv.width = 256; ecv.height = 128;
  const e = ecv.getContext('2d');
  e.fillStyle = base; e.fillRect(0, 0, 256, 128);
  // fram: grill + strålkastardekaler
  e.fillStyle = '#0d0e12';
  e.beginPath(); e.moveTo(28, 128); e.lineTo(100, 128); e.lineTo(92, 92); e.lineTo(36, 92); e.closePath(); e.fill();
  e.fillRect(0, 108, 128, 20);
  e.fillStyle = '#fffbe6';
  e.beginPath(); e.moveTo(8, 70); e.lineTo(34, 64); e.lineTo(30, 78); e.lineTo(6, 80); e.closePath(); e.fill();
  e.beginPath(); e.moveTo(120, 70); e.lineTo(94, 64); e.lineTo(98, 78); e.lineTo(122, 80); e.closePath(); e.fill();
  // bak: mörkt band + röda lyktor
  e.fillStyle = '#0d0e12'; e.fillRect(128, 52, 128, 30);
  e.fillStyle = '#ff2433'; e.fillRect(132, 58, 34, 14); e.fillRect(218, 58, 34, 14);
  e.fillStyle = numFill; e.font = 'italic 900 24px "Exo 2", sans-serif'; e.textAlign = 'center'; e.fillText(num, 192, 74);
  e.fillStyle = '#0d0e12'; e.fillRect(128, 108, 128, 20);
  const ends = new THREE.CanvasTexture(ecv);
  ends.colorSpace = THREE.SRGBColorSpace;

  const pristine = document.createElement('canvas'); pristine.width = pristine.height = SZ;
  pristine.getContext('2d').drawImage(cv, 0, 0);

  return {
    canvas: cv, tex, ends, spec,
    // Repor och sot vid (u, v)
    scratch(u, v, amount) {
      const x = u * SZ, y = (1 - v) * SZ;
      const n = Math.min(14, 3 + Math.floor(amount / 4));
      for (let k = 0; k < n; k++) {
        const r = 20 + Math.random() * 50 * Math.min(2, amount / 10);
        const a = (Math.random() - 0.5) * 0.6;
        c.strokeStyle = Math.random() < 0.5 ? 'rgba(235,235,240,0.55)' : 'rgba(25,22,28,0.45)';
        c.lineWidth = 1 + Math.random() * 3;
        const ox = x + (Math.random() - 0.5) * 60, oy = y + (Math.random() - 0.5) * 50;
        c.beginPath(); c.moveTo(ox - Math.cos(a) * r, oy - Math.sin(a) * r); c.lineTo(ox + Math.cos(a) * r, oy + Math.sin(a) * r); c.stroke();
      }
      const g = c.createRadialGradient(x, y, 2, x, y, 40 + amount * 2);
      g.addColorStop(0, 'rgba(20,16,20,0.35)'); g.addColorStop(1, 'rgba(20,16,20,0)');
      c.fillStyle = g; c.fillRect(x - 120, y - 120, 240, 240);
      tex.needsUpdate = true;
    },
    restore() { c.drawImage(pristine, 0, 0); tex.needsUpdate = true; },
    dispose() { tex.dispose(); ends.dispose(); },
  };
}

// Slumpad lack för en bot (deterministisk via seed)
export function randomSpec(seed, driver) {
  const r = rng(seed * 13 + 5);
  const pal = PALETTES[Math.floor(r() * PALETTES.length)];
  return {
    seed,
    colors: r() < 0.5 ? pal.slice() : [pal[0], pal[2], pal[1]],
    pattern: PATTERNS[Math.floor(r() * PATTERNS.length)],
    number: 1 + Math.floor(r() * 98),
    sponsor: SPONSORS[Math.floor(r() * SPONSORS.length)],
    shape: Math.floor(r() * 3),
    driver,
  };
}
