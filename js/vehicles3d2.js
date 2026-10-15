// Formelbilen, traktorn och glassbilen. Samma gränssnitt som CarView/BusView:
// group, model, wheels[{holder, spin, base}], setWheel, rest, dent, uvNear, livery, resetDamage, dispose, T.
// Modellens y = 0 är marken, fronten åt -z.
import * as THREE from 'three';
import { VTYPES } from './vtypes.js?v=13';

const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const mkTex = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
const lum = (hex) => { const n = parseInt(String(hex).slice(1), 16) || 0; return ((n >> 16) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) / 255; };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

function scratchCanvas(c, amount) {
  const g = c.getContext('2d');
  const x0 = Math.random() * c.width, y0 = c.height * (0.2 + Math.random() * 0.7);
  for (let k = 0; k < Math.min(14, 3 + amount / 4); k++) {
    const r = 20 + Math.random() * 60, a = (Math.random() - 0.5) * 0.6;
    g.strokeStyle = Math.random() < 0.5 ? 'rgba(235,235,240,0.55)' : 'rgba(25,22,28,0.45)';
    g.lineWidth = 1 + Math.random() * 3;
    const ox = x0 + (Math.random() - 0.5) * 60, oy = y0 + (Math.random() - 0.5) * 40;
    g.beginPath(); g.moveTo(ox - Math.cos(a) * r, oy - Math.sin(a) * r); g.lineTo(ox + Math.cos(a) * r, oy + Math.sin(a) * r); g.stroke();
  }
}

// däckets sida: svart med en färgad ring
function sideTex(ring) {
  const c = cv(128, 128), g = c.getContext('2d');
  g.fillStyle = '#141416'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = ring; g.lineWidth = 5; g.beginPath(); g.arc(64, 64, 50, 0, Math.PI * 2); g.stroke();
  return c;
}
// traktordäck: grova pilmönster
function lugTex() {
  const c = cv(128, 512), g = c.getContext('2d');
  g.fillStyle = '#151517'; g.fillRect(0, 0, 128, 512);
  g.fillStyle = '#2a2a2f';
  for (let y = 0; y < 512; y += 42) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(64, y + 22); g.lineTo(64, y + 36); g.lineTo(0, y + 14); g.fill();
    g.beginPath(); g.moveTo(128, y); g.lineTo(64, y + 22); g.lineTo(64, y + 36); g.lineTo(128, y + 14); g.fill();
  }
  return c;
}

class SimpleView {
  constructor(T, spec) {
    this.T = T; this.spec = spec || {};
    this.group = new THREE.Group();
    this.model = new THREE.Group();
    this.model.position.y = T.modelY;
    this.group.add(this.model);
    this.geos = []; this.mats = []; this.texs = []; this.wheels = [];
    this.livery = { tex: null, scratch: () => {}, restore: () => {}, dispose: () => {} };
  }
  std(o) { const m = new THREE.MeshStandardMaterial(o); this.mats.push(m); return m; }
  phys(o) { const m = new THREE.MeshPhysicalMaterial(o); this.mats.push(m); return m; }
  tex(c, rx = 1, ry = 1) { const t = mkTex(c); if (rx !== 1 || ry !== 1) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); } this.texs.push(t); return t; }
  add(geo, mat, x = 0, y = 0, z = 0, parent = this.model) {
    this.geos.push(geo);
    const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o;
  }
  box(w, h, d, mat, x, y, z, parent) { return this.add(new THREE.BoxGeometry(w, h, d), mat, x, y, z, parent); }
  tube(r, a, b, mat, parent) {
    const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length();
    const o = this.add(new THREE.CylinderGeometry(r, r, len, 10), mat, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, parent);
    o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    return o;
  }
  // platt dekal (canvas) mot +x / -x / +z / -z
  decal(canvas, w, h, x, y, z, face) {
    const m = new THREE.MeshStandardMaterial({ map: this.tex(canvas), transparent: true, roughness: 0.5 });
    this.mats.push(m);
    const o = this.add(new THREE.PlaneGeometry(w, h), m, x, y, z);
    o.castShadow = false;
    o.rotation.y = { '+x': Math.PI / 2, '-x': -Math.PI / 2, '+z': 0, '-z': Math.PI }[face];
    return o;
  }
  // hjul: R = synlig radie (fysiken har en gemensam), hubY = navets höjd mot fysikhjulets mitt
  wheel(w, R, width, tireMats, rimMat, rimR = 0.6) {
    const holder = new THREE.Group(), spin = new THREE.Group();
    this.add(new THREE.CylinderGeometry(R, R, width, 24).rotateZ(Math.PI / 2), tireMats, 0, 0, 0, spin);
    this.add(new THREE.CylinderGeometry(R * rimR, R * rimR, width + 0.02, 14).rotateZ(Math.PI / 2), rimMat, 0, 0, 0, spin);
    const hubY = R - this.T.wheelR;
    spin.position.y = hubY;
    holder.add(spin);
    holder.position.set(w.x, this.T.wheelR, w.z);
    this.model.add(holder);
    const o = { holder, spin, base: w, hubY, spinK: this.T.wheelR / R };
    this.wheels.push(o);
    return o;
  }
  setWheel(k, susLen, spin, steer) {
    const w = this.wheels[k];
    w.holder.position.y = -susLen - this.T.modelY;
    w.spin.rotation.x = -spin * w.spinK;
    w.holder.rotation.y = w.base.front ? -steer : 0;
  }
  rest() { this.wheels.forEach((w, k) => this.setWheel(k, -this.T.modelY - this.T.wheelR, 0, 0)); }
  dent() { return false; }
  uvNear() { return [0.5, 0.5]; }
  resetDamage() {}
  dispose() { for (const g of this.geos) g.dispose(); for (const m of this.mats) m.dispose(); for (const t of this.texs) t.dispose(); }
}

// sidoprofil (z, y) → extruderad kropp, bredd längs x, centrerad
function profile(pts, width, bevel = 0.035) {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) s.lineTo(p[0], p[1]);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: width - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, steps: 1 });
  g.rotateY(-Math.PI / 2).translate((width - bevel * 2) / 2, 0, 0);
  return g;
}

// ---------------- Formelbilen ----------------
export class FormelView extends SimpleView {
  constructor(spec) {
    super(VTYPES.formel, spec);
    const c0 = spec.colors?.[0] || '#e8242f', c1 = spec.colors?.[1] || '#16161a', c2 = spec.colors?.[2] || '#ffffff';
    const paint = this.phys({ color: c0, roughness: 0.32, metalness: 0.15, clearcoat: 0.9, clearcoatRoughness: 0.12 });
    const paint2 = this.phys({ color: c1, roughness: 0.35, metalness: 0.2, clearcoat: 0.8 });
    const carbon = this.std({ color: 0x141418, roughness: 0.35, metalness: 0.5 });
    const black = this.std({ color: 0x0b0b0d, roughness: 0.7 });
    // kaross: nos → cockpit → luftintag → motorkåpa
    const tub = profile([[-2.42, 0.17], [-2.42, 0.29], [-1.2, 0.5], [-0.82, 0.6], [0.05, 0.62], [0.16, 0.97], [0.55, 0.98], [1.75, 0.56], [2.05, 0.46], [2.05, 0.15]], 0.58);
    // smalare nos
    const a = tub.attributes.position;
    for (let i = 0; i < a.count; i++) { const z = a.getZ(i), t = clamp((z + 0.9) / (-2.42 + 0.9), 0, 1); a.setX(i, a.getX(i) * (1 - 0.5 * t)); }
    tub.computeVertexNormals();
    this.add(tub, paint);
    // sidolådor
    for (const s of [-1, 1]) {
      const pod = this.add(profile([[-0.48, 0.15], [-0.48, 0.47], [0.85, 0.42], [1.5, 0.22], [1.5, 0.15]], 0.42), paint, s * 0.5, 0, 0);
      pod.castShadow = true;
      this.box(0.36, 0.22, 0.04, black, s * 0.5, 0.34, -0.5);                     // luftintag
    }
    this.box(1.45, 0.05, 3.7, carbon, 0, 0.11, 0.1);                               // golvplanka
    // cockpit, förare, halo
    const hole = this.add(new THREE.CircleGeometry(0.5, 20), black, 0, 0.625, -0.38); hole.scale.set(0.42, 0.85, 1); hole.rotation.x = -Math.PI / 2;
    this.add(new THREE.SphereGeometry(0.155, 16, 12), this.phys({ color: c2, roughness: 0.25, clearcoat: 1 }), 0, 0.72, -0.28);
    this.box(0.2, 0.06, 0.05, black, 0, 0.74, -0.42);
    const halo = this.add(new THREE.TorusGeometry(0.3, 0.032, 8, 24, Math.PI).rotateX(-Math.PI / 2), carbon, 0, 0.82, -0.2);
    halo.castShadow = true;
    this.tube(0.035, [0, 0.6, -0.62], [0, 0.82, -0.5], carbon);
    for (const s of [-1, 1]) this.tube(0.03, [s * 0.3, 0.82, -0.2], [s * 0.27, 0.62, 0.02], carbon);
    this.box(0.18, 0.14, 0.04, black, 0, 0.88, 0.15);                              // luftintag ovanför föraren
    // vingar
    this.box(1.9, 0.035, 0.42, paint2, 0, 0.12, -2.25);
    const flap = this.box(1.75, 0.03, 0.22, paint2, 0, 0.2, -2.12); flap.rotation.x = -0.3;
    for (const s of [-1, 1]) this.box(0.03, 0.22, 0.5, paint, s * 0.95, 0.18, -2.22);
    const rw = this.box(1.1, 0.04, 0.38, paint2, 0, 0.92, 2.0); rw.rotation.x = 0.15;
    const rf = this.box(1.1, 0.03, 0.2, paint2, 0, 1.03, 2.1); rf.rotation.x = 0.45;
    for (const s of [-1, 1]) this.box(0.03, 0.44, 0.58, paint, s * 0.56, 0.86, 2.02);
    this.box(0.05, 0.4, 0.08, carbon, 0, 0.66, 1.95);
    // hjul + upphängning
    const ring = this.tex(sideTex(c2 === '#ffffff' ? '#ffd21f' : c2));
    const tread = this.std({ color: 0x18181b, roughness: 0.9 }), side = this.std({ map: ring, roughness: 0.85 });
    const rim = this.std({ color: 0x2a2b31, roughness: 0.4, metalness: 0.7 });
    for (const w of this.T.wheels) {
      this.wheel(w, w.front ? 0.31 : 0.34, w.front ? 0.3 : 0.4, [tread, side, side], rim, 0.62);
      const s = Math.sign(w.x), hy = w.front ? 0.31 : 0.34;
      for (const y of [0.2, 0.42]) this.tube(0.022, [s * 0.28, y, w.z + (y > 0.3 ? 0.08 : -0.08)], [s * (Math.abs(w.x) - 0.12), hy, w.z], carbon);
    }
    // nummer och sponsor
    const nr = String(spec.number ?? '');
    const numC = cv(256, 256), ng = numC.getContext('2d');
    ng.fillStyle = 'rgba(0,0,0,0)'; ng.clearRect(0, 0, 256, 256);
    ng.fillStyle = lum(c0) > 0.55 ? '#111' : '#fff'; ng.font = 'italic 900 170px "Exo 2", sans-serif'; ng.textAlign = 'center'; ng.textBaseline = 'middle';
    ng.fillText(nr, 128, 136);
    for (const s of [-1, 1]) this.decal(numC, 0.42, 0.42, s * 0.3, 0.78, 0.36, s > 0 ? '+x' : '-x');
    const nose = this.decal(numC, 0.3, 0.3, 0, 0.44, -1.45, '+z'); nose.rotation.set(-Math.PI / 2 + 0.17, 0, 0);
    const spC = cv(512, 128), sg = spC.getContext('2d');
    sg.fillStyle = lum(c0) > 0.55 ? '#111' : '#fff'; sg.font = 'italic 900 78px "Exo 2", sans-serif'; sg.textAlign = 'center'; sg.textBaseline = 'middle';
    sg.fillText(String(spec.sponsor || 'KNUFFRAKAN').slice(0, 12), 256, 66);
    for (const s of [-1, 1]) this.decal(spC, 1.05, 0.26, s * 0.715, 0.32, 0.45, s > 0 ? '+x' : '-x');
  }
}

// ---------------- Traktorn ----------------
export class TraktorView extends SimpleView {
  constructor(spec) {
    super(VTYPES.traktor, spec);
    const c0 = spec.colors?.[0] || '#2f8f3a', c1 = spec.colors?.[1] || '#ffd21f';
    const paint = this.phys({ color: c0, roughness: 0.4, metalness: 0.1, clearcoat: 0.5 });
    const accent = this.phys({ color: c1, roughness: 0.4, metalness: 0.15, clearcoat: 0.4 });
    const dark = this.std({ color: 0x1b1c20, roughness: 0.6, metalness: 0.4 });
    const chrome = this.std({ color: 0xd9dde4, roughness: 0.2, metalness: 1 });
    const glass = this.phys({ color: 0x9fc7ff, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.32 });
    // chassi, motorhuv, grill, lampor
    this.box(0.9, 0.45, 3.4, dark, 0, 0.78, -0.35);
    this.box(1.0, 0.72, 2.0, paint, 0, 1.15, -1.15);
    this.box(0.92, 0.06, 2.02, paint, 0, 1.53, -1.15);
    const gr = cv(128, 128), gg = gr.getContext('2d');
    gg.fillStyle = '#16171b'; gg.fillRect(0, 0, 128, 128);
    gg.fillStyle = '#3a3c44'; for (let y = 10; y < 128; y += 14) gg.fillRect(8, y, 112, 6);
    this.decal(gr, 0.86, 0.6, 0, 1.14, -2.16, '-z');
    const lamp = this.std({ color: 0xfff6d0, emissive: 0xfff2c0, emissiveIntensity: 0.8 });
    for (const s of [-1, 1]) this.box(0.16, 0.1, 0.05, lamp, s * 0.36, 1.38, -2.17);
    this.box(1.6, 0.12, 0.16, dark, 0, 0.5, -1.45);                                   // framaxel
    // hytt
    this.box(1.5, 0.12, 1.65, dark, 0, 1.47, 0.7);
    for (const x of [-0.72, 0.72]) for (const z of [-0.05, 1.45]) this.box(0.07, 1.16, 0.07, dark, x, 2.08, z);
    this.box(1.42, 1.08, 1.45, glass, 0, 2.08, 0.7).castShadow = false;
    this.box(1.65, 0.1, 1.75, paint, 0, 2.7, 0.7);
    this.add(new THREE.TorusGeometry(0.17, 0.025, 6, 16).rotateX(-1.1), dark, 0, 1.85, 0.2);
    this.box(0.5, 0.5, 0.45, dark, 0, 1.75, 1.05);                                     // stol
    // avgasrör
    this.tube(0.06, [0.36, 1.52, -0.95], [0.36, 2.6, -0.95], dark);
    this.add(new THREE.CylinderGeometry(0.085, 0.07, 0.12, 10), chrome, 0.36, 2.64, -0.95);
    // stänkskärmar över bakhjulen
    const fender = this.std({ color: c0, roughness: 0.45, side: THREE.DoubleSide });
    for (const s of [-1, 1]) this.add(new THREE.CylinderGeometry(0.98, 0.98, 0.58, 22, 1, true, 0, Math.PI).rotateZ(Math.PI / 2), fender, s * 1.0, 0.85, 1.2);
    // hjul
    const lugs = this.tex(lugTex(), 1, 1);
    const tread = this.std({ map: lugs, roughness: 0.95 }), side = this.std({ color: 0x141416, roughness: 0.85 });
    for (const w of this.T.wheels) this.wheel(w, w.front ? 0.5 : 0.85, w.front ? 0.3 : 0.52, [tread, side, side], accent, w.front ? 0.58 : 0.55);
    // frontlastare: armar, hydraulik och skopa (skopan finns också i fysiken, gear.js)
    const zb = -(2.15 + 0.62);
    for (const s of [-1, 1]) {
      this.tube(0.075, [s * 0.66, 1.62, 0.15], [s * 0.66, 1.25, -1.6], accent);
      this.tube(0.075, [s * 0.66, 1.25, -1.6], [s * 1.0, 0.72, zb + 0.2], accent);
      this.tube(0.05, [s * 0.6, 0.85, -0.55], [s * 0.72, 1.18, -1.7], chrome);
    }
    this.box(2.36, 0.76, 0.06, accent, 0, 0.62, zb + 0.22);
    this.box(2.36, 0.06, 0.5, accent, 0, 0.27, zb);
    this.box(2.36, 0.06, 0.2, accent, 0, 0.99, zb + 0.13);
    for (const s of [-1, 1]) this.box(0.06, 0.76, 0.5, accent, s * 1.18, 0.62, zb);
    this.box(2.4, 0.05, 0.08, chrome, 0, 0.25, zb - 0.25);
    for (let k = -2.5; k <= 2.5; k++) this.add(new THREE.ConeGeometry(0.05, 0.16, 6).rotateX(-Math.PI / 2), chrome, k * 0.4, 0.25, zb - 0.34);
    // nummer på huven
    const nr = cv(256, 128), ng = nr.getContext('2d');
    ng.fillStyle = lum(c0) > 0.55 ? '#111' : '#fff'; ng.font = 'italic 900 96px "Exo 2", sans-serif'; ng.textAlign = 'center'; ng.textBaseline = 'middle';
    ng.fillText(String(spec.number ?? ''), 128, 70);
    for (const s of [-1, 1]) this.decal(nr, 0.9, 0.45, s * 0.505, 1.2, -1.1, s > 0 ? '+x' : '-x');
  }
}

// ---------------- Glassbilen ----------------
export class GlassView extends SimpleView {
  constructor(spec) {
    super(VTYPES.glass, spec);
    const c0 = spec.colors?.[0] || '#ff5fa2', c1 = spec.colors?.[1] || '#2bb6f0';
    const ink = lum(c0) > 0.7 ? '#3a1d2e' : c0;
    const white = this.phys({ color: 0xfdfbf6, roughness: 0.4, clearcoat: 0.6 });
    const dark = this.std({ color: 0x1b2234, roughness: 0.15, metalness: 0.3 });
    const chrome = this.std({ color: 0xdfe3ea, roughness: 0.2, metalness: 1 });
    const blk = this.std({ color: 0x141418, roughness: 0.7 });
    // sidorna: ränder, GLASS, glassbilder, nummer
    this.sides = [];
    const side = (mirror) => {
      const c = cv(1024, 512), g = c.getContext('2d');
      g.fillStyle = '#fdfbf6'; g.fillRect(0, 0, 1024, 512);
      g.fillStyle = c0; g.fillRect(0, 430, 1024, 50); g.fillRect(0, 0, 1024, 26);
      g.fillStyle = c1; g.fillRect(0, 410, 1024, 16);
      // våglinje
      g.fillStyle = c0; g.beginPath(); g.moveTo(0, 400);
      for (let x = 0; x <= 1024; x += 64) g.quadraticCurveTo(x + 32, 370, x + 64, 400);
      g.lineTo(1024, 430); g.lineTo(0, 430); g.fill();
      // höger sida: luckan sitter bakåt (vänster i bilden) → texten framåt; vänster sida: glassbilder fram
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = ink; g.font = 'italic 900 150px "Exo 2", sans-serif';
      const tx = mirror ? 640 : 730;
      g.fillText('GLASS', tx, 140);
      g.font = '800 34px Montserrat, sans-serif'; g.fillStyle = c1; g.fillText('KNUFFRAKANS GLASSBIL', tx, 236);
      // glassar
      const cone = (x, y, col, col2) => {
        g.fillStyle = '#d9a05b'; g.beginPath(); g.moveTo(x - 30, y); g.lineTo(x + 30, y); g.lineTo(x, y + 90); g.fill();
        g.strokeStyle = '#b07b3c'; g.lineWidth = 3; for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(x + k * 12 - 10, y); g.lineTo(x + k * 6, y + 60); g.stroke(); }
        g.fillStyle = col; g.beginPath(); g.arc(x, y - 14, 34, 0, Math.PI * 2); g.fill();
        g.fillStyle = col2; g.beginPath(); g.arc(x + 4, y - 52, 26, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#e8243a'; g.beginPath(); g.arc(x + 6, y - 82, 9, 0, Math.PI * 2); g.fill();
      };
      if (mirror) {
        const cx = 190;
        cone(cx - 70, 300, '#ff9ec7', '#fff3c4'); cone(cx + 50, 290, '#7a4a2b', '#9fe3c0');
        // pinnglass
        g.fillStyle = '#e9c48a'; g.fillRect(cx - 12, 150, 14, 50);
        g.fillStyle = c1; g.beginPath(); g.roundRect?.(cx - 36, 50, 62, 110, 26); g.fill();
      }
      g.font = 'italic 900 80px "Exo 2", sans-serif'; g.fillStyle = ink; g.fillText(String(spec.number ?? ''), mirror ? 940 : 70, 340);
      this.sides.push(c);
      return c;
    };
    const sR = side(false), sL = side(true);
    const tR = this.tex(sR), tL = this.tex(sL);
    const back = cv(256, 256), bg = back.getContext('2d');
    bg.fillStyle = '#fdfbf6'; bg.fillRect(0, 0, 256, 256);
    bg.fillStyle = c0; bg.fillRect(0, 205, 256, 51);
    bg.fillStyle = dark.color.getStyle(); bg.fillRect(40, 30, 176, 90);
    bg.fillStyle = '#ffd21f'; bg.fillRect(54, 140, 148, 48); bg.fillStyle = '#16161a'; bg.font = '900 30px Montserrat, sans-serif'; bg.textAlign = 'center'; bg.fillText('SAKTA – BARN', 128, 174);
    bg.font = 'italic 900 40px "Exo 2", sans-serif'; bg.fillStyle = '#fff'; bg.fillText(String(spec.number ?? ''), 128, 242);
    const mk = (t) => this.phys({ map: t, roughness: 0.4, clearcoat: 0.6 });
    // lastlådan (0,45–3,0 m) + hytten fram (lägre)
    this.cargo = this.box(2.22, 2.55, 4.55, [mk(tR), mk(tL), white, blk, mk(this.tex(back)), white], 0, 1.73, 0.62);
    this.box(2.18, 0.95, 1.32, white, 0, 0.92, -2.3);
    this.box(2.18, 1.0, 0.98, white, 0, 1.9, -2.13);
    this.box(2.2, 0.12, 1.32, this.phys({ color: c0, roughness: 0.4, clearcoat: 0.6 }), 0, 0.5, -2.3);
    const ws = this.box(2.0, 0.8, 0.04, dark, 0, 1.92, -2.63); ws.rotation.x = 0.12;      // vindruta
    for (const s of [-1, 1]) this.box(0.04, 0.6, 0.75, dark, s * 1.1, 1.95, -2.15);        // sidorutor
    const lamp = this.std({ color: 0xfff6d0, emissive: 0xfff2c0, emissiveIntensity: 0.8 });
    for (const s of [-1, 1]) this.box(0.3, 0.16, 0.04, lamp, s * 0.75, 1.05, -2.97);
    this.box(2.25, 0.18, 0.14, chrome, 0, 0.52, -3.0);
    this.box(2.25, 0.18, 0.14, chrome, 0, 0.52, 2.95);
    // försäljningsluckan (höger sida) med randig markis
    const wz = 1.55;
    this.box(0.04, 0.75, 1.6, dark, 1.12, 1.95, wz);
    this.box(0.18, 0.05, 1.7, chrome, 1.2, 1.55, wz);
    const aw = cv(256, 64), ag = aw.getContext('2d');
    for (let k = 0; k < 8; k++) { ag.fillStyle = k % 2 ? '#ffffff' : c0; ag.fillRect(k * 32, 0, 32, 64); }
    const awn = this.add(new THREE.PlaneGeometry(1.8, 0.6), this.std({ map: this.tex(aw), side: THREE.DoubleSide, roughness: 0.6 }), 1.32, 2.5, wz);
    awn.rotation.set(0, Math.PI / 2, 0); awn.rotateX(-0.95);
    // jätteglassen på taket + högtalare
    const waf = cv(128, 128), wg = waf.getContext('2d');
    wg.fillStyle = '#d9a05b'; wg.fillRect(0, 0, 128, 128);
    wg.strokeStyle = '#a8732f'; wg.lineWidth = 5;
    for (let k = -128; k < 256; k += 26) { wg.beginPath(); wg.moveTo(k, 0); wg.lineTo(k + 128, 128); wg.stroke(); wg.beginPath(); wg.moveTo(k, 128); wg.lineTo(k + 128, 0); wg.stroke(); }
    this.add(new THREE.ConeGeometry(0.46, 1.15, 18).rotateX(Math.PI), this.std({ map: this.tex(waf, 2, 1), roughness: 0.8 }), 0, 3.58, 0.7);
    this.add(new THREE.SphereGeometry(0.46, 18, 14), this.phys({ color: 0xff9ec7, roughness: 0.6, clearcoat: 0.3 }), 0, 4.2, 0.7);
    this.add(new THREE.SphereGeometry(0.38, 18, 14), this.phys({ color: 0x7a4a2b, roughness: 0.6, clearcoat: 0.3 }), 0.06, 4.68, 0.68);
    this.add(new THREE.SphereGeometry(0.3, 16, 12), this.phys({ color: 0xfff3c4, roughness: 0.6, clearcoat: 0.3 }), -0.04, 5.05, 0.7);
    this.add(new THREE.SphereGeometry(0.12, 12, 10), this.phys({ color: 0xe8243a, roughness: 0.3, clearcoat: 1 }), 0, 5.38, 0.7);
    this.tube(0.03, [0, 5.42, 0.7], [0.08, 5.6, 0.74], this.std({ color: 0x2f7a2f }));
    this.add(new THREE.ConeGeometry(0.22, 0.32, 14, 1, true).rotateX(Math.PI / 2), this.std({ color: 0xdfe3ea, metalness: 0.8, roughness: 0.3, side: THREE.DoubleSide }), 0, 3.15, -1.2);
    // hjul
    const tread = this.std({ color: 0x18181b, roughness: 0.9 });
    const hub = this.std({ color: 0xf4f4f6, roughness: 0.3, metalness: 0.4 });
    for (const w of this.T.wheels) this.wheel(w, 0.42, 0.28, [tread, tread, tread], hub, 0.55);
    this.livery = {
      tex: tR,
      scratch: (u, v, amount) => { const c = Math.random() < 0.5 ? sR : sL; scratchCanvas(c, amount); (c === sR ? tR : tL).needsUpdate = true; },
      restore: () => {}, dispose: () => {},
    };
  }
}
