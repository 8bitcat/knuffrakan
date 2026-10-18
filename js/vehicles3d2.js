// Formelbilen, traktorn och glassbilen. Samma gränssnitt som CarView/BusView:
// group, model, wheels[{holder, spin, base}], setWheel, rest, dent, uvNear, livery, resetDamage, dispose, T.
// Modellens y = 0 är marken, fronten åt -z.
import * as THREE from 'three';
import { VTYPES } from './vtypes.js?v=23';
import { LOADER } from './gear.js?v=23';

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
    // frontlastare: armar + skopa vrids runt en axel vid hytten (samma mått som fysiken, gear.js loaderPose)
    const PY = LOADER.pivotY, PZ = LOADER.pivotZ, zb = -(2.15 + 0.62) - PZ;
    const arm = this.loaderGrp = new THREE.Group();
    arm.position.set(0, PY, PZ);
    this.model.add(arm);
    const A = (x, y, z) => [x, y - PY, z];                       // markhöjd → armens ram
    for (const s of [-1, 1]) {
      this.tube(0.075, A(s * 0.66, PY, 0), A(s * 0.66, 1.25, -1.75), accent, arm);
      this.tube(0.075, A(s * 0.66, 1.25, -1.75), A(s * 1.0, 0.72, zb + 0.2), accent, arm);
    }
    this.box(2.36, 0.76, 0.06, accent, 0, 0.62 - PY, zb + 0.22, arm);
    this.box(2.36, 0.06, 0.5, accent, 0, 0.27 - PY, zb, arm);
    this.box(2.36, 0.06, 0.2, accent, 0, 0.99 - PY, zb + 0.13, arm);
    for (const s of [-1, 1]) this.box(0.06, 0.76, 0.5, accent, s * 1.18, 0.62 - PY, zb, arm);
    this.box(2.4, 0.05, 0.08, chrome, 0, 0.25 - PY, zb - 0.25, arm);
    for (let k = -2.5; k <= 2.5; k++) this.add(new THREE.ConeGeometry(0.05, 0.16, 6).rotateX(-Math.PI / 2), chrome, k * 0.4, 0.25 - PY, zb - 0.34, arm);
    // hydraulcylindrar: fast i chassit, andra änden följer armen
    this.hyd = [-1, 1].map(s => ({
      mesh: this.add(new THREE.CylinderGeometry(0.05, 0.05, 1, 10), chrome),
      base: new THREE.Vector3(s * 0.6, 0.85, -0.55), local: new THREE.Vector3(s * 0.72, 1.18 - PY, -1.85),
    }));
    this.setLoader(0);
    // nummer på huven
    const nr = cv(256, 128), ng = nr.getContext('2d');
    ng.fillStyle = lum(c0) > 0.55 ? '#111' : '#fff'; ng.font = 'italic 900 96px "Exo 2", sans-serif'; ng.textAlign = 'center'; ng.textBaseline = 'middle';
    ng.fillText(String(spec.number ?? ''), 128, 70);
    for (const s of [-1, 1]) this.decal(nr, 0.9, 0.45, s * 0.505, 1.2, -1.1, s > 0 ? '+x' : '-x');
  }
}

const _up = new THREE.Vector3(0, 1, 0), _p = new THREE.Vector3(), _d = new THREE.Vector3();
TraktorView.prototype.setLoader = function (k) {
  if (k === this.loaderK) return;
  this.loaderK = k;
  const g = this.loaderGrp;
  g.rotation.x = Math.max(0, Math.min(1, k)) * LOADER.maxAng;
  g.updateMatrix();
  for (const h of this.hyd) {
    _p.copy(h.local).applyMatrix4(g.matrix);                       // armens punkt i modellens ram
    _d.subVectors(_p, h.base);
    const len = _d.length();
    h.mesh.position.copy(h.base).addScaledVector(_d, 0.5);
    h.mesh.quaternion.setFromUnitVectors(_up, _d.normalize());
    h.mesh.scale.set(1, len, 1);
  }
};

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

// ---------------- Jetmotorer med efterbrännkammare (rullstolarna) ----------------
let FL = null;
function flameKit() {
  if (FL) return FL;
  const add = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const gc = cv(128, 128), g = gc.getContext('2d'), rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  rg.addColorStop(0, 'rgba(255,240,200,1)'); rg.addColorStop(0.35, 'rgba(255,150,40,0.55)'); rg.addColorStop(1, 'rgba(255,80,0,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
  // delas av alla — läggs aldrig i vyns städlistor
  FL = {
    outer: add(0xff6a12, 0.7), core: add(0xfff0b0, 0.9), blue: add(0x4f9dff, 0.65), diamond: add(0x9fd0ff, 0.45),
    glow: new THREE.SpriteMaterial({ map: mkTex(gc), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }),
    cone: new THREE.ConeGeometry(1, 1, 18, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5),   // bas vid z 0, spets bakåt
    dia: new THREE.SphereGeometry(1, 10, 8),
  };
  return FL;
}
const numCanvas = (nr, color) => {
  const c = cv(128, 128), g = c.getContext('2d');
  g.fillStyle = color; g.font = 'italic 900 96px "Exo 2", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(nr ?? ''), 64, 70);
  return c;
};

// jetmotor längs z (intaget fram, munstycket bak) — returnerar lågan som ska animeras
SimpleView.prototype.jet = function (x, y, z, r, L, paint, chrome, parent = this.model) {
  const K = flameKit();
  const steel = this.std({ color: 0x3a3d44, metalness: 0.8, roughness: 0.35, side: THREE.DoubleSide });
  const dark = this.std({ color: 0x0d0e12, roughness: 0.6, metalness: 0.4 });
  this.add(new THREE.CylinderGeometry(r * 0.92, r, L, 22).rotateX(Math.PI / 2), paint, x, y, z, parent);
  this.add(new THREE.TorusGeometry(r * 0.97, r * 0.12, 8, 22), chrome, x, y, z - L / 2, parent);
  const fan = this.add(new THREE.CircleGeometry(r * 0.9, 20), dark, x, y, z - L / 2 - 0.004, parent); fan.rotation.y = Math.PI;
  this.add(new THREE.ConeGeometry(r * 0.3, r * 0.65, 12).rotateX(-Math.PI / 2), chrome, x, y, z - L / 2 - r * 0.3, parent);
  this.add(new THREE.CylinderGeometry(r * 1.01, r * 1.01, L * 0.14, 22, 1, true).rotateX(Math.PI / 2), chrome, x, y, z - L * 0.18, parent);
  const nz = z + L / 2 + r * 0.45;
  this.add(new THREE.CylinderGeometry(r * 0.72, r * 0.9, r * 0.9, 18, 1, true).rotateX(Math.PI / 2), steel, x, y, nz, parent);
  const hot = new THREE.Mesh(new THREE.CircleGeometry(r * 0.68, 18), K.core); this.geos.push(hot.geometry);
  hot.position.set(x, y, nz + r * 0.44); parent.add(hot);
  const grp = new THREE.Group(); grp.position.set(x, y, nz + r * 0.45); parent.add(grp);
  const mk = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.renderOrder = 5; grp.add(m); return m; };
  const f = { r, outer: mk(K.cone, K.outer), core: mk(K.cone, K.core), blue: mk(K.cone, K.blue), dias: [0, 1, 2].map(() => mk(K.dia, K.diamond)) };
  f.glow = new THREE.Sprite(K.glow); f.glow.renderOrder = 6; grp.add(f.glow);
  updFlame(f, 0);
  return f;
};
// k = gas 0..1: liten blå låga på tomgång, lång orange låga med chockdiamanter på full gas.
// Längden (0,18 + 2,1·k m) är samma som skadezonen i game.js jetBurn.
function updFlame(f, k) {
  const fl = 0.85 + 0.3 * Math.random(), r = f.r;
  const len = (0.18 + 2.1 * k) * fl;
  f.outer.scale.set(r * (1.0 + 0.15 * Math.random()), r * (1.0 + 0.15 * Math.random()), len);
  f.core.scale.set(r * 0.58, r * 0.58, len * 0.55);
  f.blue.scale.set(r * 0.7, r * 0.7, 0.1 + 0.25 * k);
  f.dias.forEach((d, i) => { d.visible = k > 0.6; d.scale.set(r * 0.42, r * 0.42, r * 0.1); d.position.z = len * (0.2 + i * 0.19); });
  f.glow.scale.setScalar(r * (2.2 + 4.5 * k) * fl);
}

// sittande förare: höfterna vid (0, seatY, seatZ)
SimpleView.prototype.rider = function (seatY, seatZ, { footY, footZ, hands }) {
  const sp = this.spec, tones = ['#f1c7a5', '#e0ac69', '#c68642', '#8d5524'];
  const skin = this.std({ color: tones[(sp.number || 0) % 4], roughness: 0.6 });
  const jacket = this.phys({ color: sp.colors?.[1] || '#1e7bff', roughness: 0.5, clearcoat: 0.2 });
  const pants = this.std({ color: 0x23262e, roughness: 0.8 });
  const helmet = this.phys({ color: sp.colors?.[0] || '#ff3b3b', roughness: 0.25, clearcoat: 1 });
  const visor = this.phys({ color: 0x101820, roughness: 0.05, metalness: 0.6 });
  const shoe = this.std({ color: 0x15161a });
  const torso = this.add(new THREE.CapsuleGeometry(0.15, 0.3, 4, 10), jacket, 0, seatY + 0.33, seatZ + 0.05); torso.rotation.x = -0.12;
  this.add(new THREE.SphereGeometry(0.13, 16, 12), helmet, 0, seatY + 0.74, seatZ + 0.02);
  this.box(0.19, 0.07, 0.05, visor, 0, seatY + 0.74, seatZ - 0.1);
  for (const s of [-1, 1]) {
    const knee = [s * 0.1, seatY + 0.1, seatZ - 0.38];
    this.tube(0.07, [s * 0.1, seatY + 0.06, seatZ], knee, pants);
    this.tube(0.06, knee, [s * 0.1, footY + 0.05, footZ], pants);
    this.box(0.1, 0.07, 0.2, shoe, s * 0.1, footY + 0.02, footZ - 0.05);
    const sh = [s * 0.2, seatY + 0.5, seatZ + 0.04], h = hands[s < 0 ? 0 : 1];
    const el = [(sh[0] + h[0]) / 2 + s * 0.05, (sh[1] + h[1]) / 2 - 0.05, (sh[2] + h[2]) / 2 + 0.06];
    this.tube(0.05, sh, el, jacket); this.tube(0.045, el, h, jacket);
    this.add(new THREE.SphereGeometry(0.045, 10, 8), skin, h[0], h[1], h[2]);
  }
};

// ---------------- Jetrullstolen ----------------
export class RullstolView extends SimpleView {
  constructor(spec) {
    super(VTYPES.rullstol, spec);
    const c0 = spec.colors?.[0] || '#ff3b6b', c1 = spec.colors?.[1] || '#1e7bff';
    const chrome = this.std({ color: 0xdfe3ea, roughness: 0.18, metalness: 1 });
    const fabric = this.std({ color: c0, roughness: 0.8 });
    const black = this.std({ color: 0x141418, roughness: 0.7 });
    const paint = this.phys({ color: c1, roughness: 0.3, metalness: 0.3, clearcoat: 1 });
    for (const s of [-1, 1]) {
      const x = s * 0.25;
      this.tube(0.02, [x, 0.47, -0.25], [x, 0.47, 0.24], chrome);
      this.tube(0.02, [x, 0.42, 0.24], [x, 1.08, 0.3], chrome);
      this.tube(0.02, [x, 1.08, 0.3], [x, 1.1, 0.42], chrome);
      this.add(new THREE.CylinderGeometry(0.03, 0.03, 0.1, 10).rotateX(Math.PI / 2), black, x, 1.1, 0.44);
      this.tube(0.02, [x, 0.47, -0.22], [s * 0.2, 0.16, -0.52], chrome);
      this.tube(0.018, [s * 0.27, 0.7, -0.18], [s * 0.27, 0.7, 0.18], chrome);
      this.tube(0.018, [s * 0.27, 0.7, -0.15], [x, 0.47, -0.15], chrome);
      this.box(0.06, 0.04, 0.3, black, s * 0.27, 0.73, 0);
      this.tube(0.016, [s * 0.3, 0.36, -0.5], [s * 0.3, 0.12, -0.55], chrome);   // länkhjulens gaffel
      this.tube(0.02, [x, 0.47, -0.2], [s * 0.3, 0.36, -0.5], chrome);
    }
    this.tube(0.02, [-0.25, 0.47, 0.2], [0.25, 0.47, 0.2], chrome);
    this.box(0.44, 0.07, 0.44, fabric, 0, 0.52, -0.01);
    const back = this.box(0.46, 0.5, 0.05, fabric, 0, 0.8, 0.27); back.rotation.x = -0.1;
    this.box(0.4, 0.025, 0.17, black, 0, 0.15, -0.55);
    const tire = this.std({ color: 0x2a2b31, roughness: 0.85 }), hub = this.std({ color: 0x9aa0aa, metalness: 0.7, roughness: 0.3 });
    for (const w of this.T.wheels) {
      if (w.front) { this.wheel(w, 0.09, 0.05, [black, black, black], chrome, 0.5); continue; }
      const o = this.wheel(w, 0.3, 0.045, [tire, tire, tire], hub, 0.15);
      for (let k = 0; k < 6; k++) { const sp = this.box(0.008, 0.54, 0.008, chrome, 0, 0, 0, o.spin); sp.rotation.x = k * Math.PI / 6; }
      this.add(new THREE.TorusGeometry(0.27, 0.012, 6, 28).rotateY(Math.PI / 2), chrome, 0, 0, 0, o.spin);
      this.add(new THREE.TorusGeometry(0.255, 0.012, 6, 28).rotateY(Math.PI / 2), chrome, Math.sign(w.x) * 0.05, 0, 0, o.spin);
    }
    // jetmotorn bakom ryggstödet
    this.flames = [this.jet(0, 0.82, 0.62, 0.15, 0.62, paint, chrome)];
    for (const s of [-1, 1]) this.tube(0.02, [s * 0.25, 0.92, 0.31], [s * 0.1, 0.84, 0.5], chrome);
    const nc = numCanvas(spec.number, '#ffffff');
    for (const s of [-1, 1]) this.decal(nc, 0.2, 0.2, s * 0.155, 0.82, 0.66, s > 0 ? '+x' : '-x');
    this.rider(0.56, -0.02, { footY: 0.17, footZ: -0.5, hands: [[-0.45, 0.5, 0.1], [0.45, 0.5, 0.1]] });
  }
  setThrust(k) { for (const f of this.flames) updFlame(f, k); }
}

// ---------------- Jet-elrullstolen ----------------
export class ElrullstolView extends SimpleView {
  constructor(spec) {
    super(VTYPES.elrullstol, spec);
    const c0 = spec.colors?.[0] || '#2bd6e8', c1 = spec.colors?.[1] || '#16161a';
    const chrome = this.std({ color: 0xdfe3ea, roughness: 0.18, metalness: 1 });
    const dark = this.std({ color: 0x2a2c33, roughness: 0.55, metalness: 0.4 });
    const black = this.std({ color: 0x141418, roughness: 0.7 });
    const fabric = this.std({ color: c1, roughness: 0.8 });
    const paint = this.phys({ color: c0, roughness: 0.3, metalness: 0.3, clearcoat: 1 });
    // chassit (batterierna) med färgade sidokåpor och lampor
    this.box(0.6, 0.26, 1.0, dark, 0, 0.3, 0);
    for (const s of [-1, 1]) this.box(0.04, 0.18, 0.72, paint, s * 0.31, 0.33, 0);
    const led = this.std({ color: 0xfff6d0, emissive: 0xfff2c0, emissiveIntensity: 0.9 });
    const red = this.std({ color: 0xff2a2a, emissive: 0xff1010, emissiveIntensity: 0.7 });
    for (const s of [-1, 1]) { this.box(0.08, 0.04, 0.02, led, s * 0.22, 0.36, -0.51); this.box(0.08, 0.04, 0.02, red, s * 0.22, 0.36, 0.51); }
    // drivhjulen i mitten (bara utseende) + länkhjulen fram och bak (fysikens hjul)
    const tire = this.std({ color: 0x1a1b1f, roughness: 0.85 });
    this.mids = [-1, 1].map(s => {
      const g = new THREE.Group(); g.position.set(s * 0.36, 0.17, 0); this.model.add(g);
      this.add(new THREE.CylinderGeometry(0.17, 0.17, 0.08, 22).rotateZ(Math.PI / 2), tire, 0, 0, 0, g);
      this.add(new THREE.CylinderGeometry(0.1, 0.1, 0.085, 6).rotateZ(Math.PI / 2), paint, 0, 0, 0, g);
      return g;
    });
    for (const w of this.T.wheels) this.wheel(w, 0.08, 0.05, [black, black, black], chrome, 0.5);
    // sits, rygg, nackstöd, armstöd, joystick, benstöd
    this.box(0.12, 0.25, 0.12, dark, 0, 0.55, 0.05);
    this.box(0.5, 0.1, 0.48, fabric, 0, 0.7, -0.02);
    const back = this.box(0.5, 0.62, 0.09, fabric, 0, 1.05, 0.26); back.rotation.x = -0.08;
    this.box(0.3, 0.16, 0.09, fabric, 0, 1.45, 0.29);
    for (const s of [-1, 1]) {
      this.box(0.08, 0.06, 0.42, black, s * 0.29, 0.88, -0.02);
      this.box(0.03, 0.16, 0.03, chrome, s * 0.29, 0.79, 0.12);
      this.tube(0.02, [s * 0.18, 0.62, -0.25], [s * 0.16, 0.17, -0.6], chrome);
    }
    this.box(0.08, 0.06, 0.1, black, 0.29, 0.94, -0.18);
    this.tube(0.008, [0.29, 0.97, -0.19], [0.29, 1.03, -0.2], chrome);
    this.add(new THREE.SphereGeometry(0.028, 10, 8), paint, 0.29, 1.04, -0.2);
    this.box(0.42, 0.03, 0.2, black, 0, 0.14, -0.62);
    // två jetmotorer
    this.flames = [-1, 1].map(s => this.jet(s * 0.42, 0.98, 0.52, 0.13, 0.6, paint, chrome));
    for (const s of [-1, 1]) this.tube(0.022, [s * 0.25, 1.0, 0.27], [s * 0.36, 0.98, 0.4], chrome);
    // säkerhetsflaggan
    this.tube(0.008, [-0.24, 0.85, 0.33], [-0.3, 2.35, 0.48], this.std({ color: 0xe6e6e6 }));
    const fs = new THREE.Shape(); fs.moveTo(0, 0); fs.lineTo(0, -0.28); fs.lineTo(0.46, -0.14); fs.closePath();
    this.add(new THREE.ShapeGeometry(fs).rotateY(-Math.PI / 2), this.std({ color: 0xff7a00, side: THREE.DoubleSide, roughness: 0.7 }), -0.3, 2.33, 0.48);
    const nc = numCanvas(spec.number, '#ffffff');
    this.decal(nc, 0.3, 0.3, 0, 1.05, 0.31, '+z');
    this.rider(0.74, -0.02, { footY: 0.17, footZ: -0.6, hands: [[-0.29, 0.92, -0.12], [0.29, 1.0, -0.2]] });
  }
  setWheel(k, susLen, spin, steer) {
    super.setWheel(k, susLen, spin, steer);
    if (k === 2) for (const g of this.mids) g.rotation.x = -spin * (this.T.wheelR / 0.17);
  }
  setThrust(k) { for (const f of this.flames) updFlame(f, k); }
}

// ---------------- Propellerplanet ----------------
export class PlanView extends SimpleView {
  constructor(spec) {
    super(VTYPES.plan, spec);
    const c0 = spec.colors?.[0] || '#e8242f', c1 = spec.colors?.[1] || '#16161a';
    const white = this.phys({ color: 0xf4f4f2, roughness: 0.35, clearcoat: 0.8 });
    const paint = this.phys({ color: c0, roughness: 0.3, clearcoat: 0.9 });
    const paint2 = this.phys({ color: c1, roughness: 0.35, clearcoat: 0.7 });
    const glassM = this.std({ color: 0x1b2234, roughness: 0.1, metalness: 0.5 });
    const dark = this.std({ color: 0x24262c, roughness: 0.5, metalness: 0.5 });
    const chrome = this.std({ color: 0xdfe3ea, roughness: 0.18, metalness: 1 });
    const black = this.std({ color: 0x141418, roughness: 0.7 });
    // flygkroppen: sidoprofil, smalnar av mot stjärten
    const body = profile([[-2.55, 0.62], [-2.55, 1.32], [-1.55, 1.44], [-1.05, 1.72], [0.45, 1.72], [2.85, 1.47], [2.85, 1.22], [0.6, 0.5], [-1.6, 0.46]], 1.1, 0.06);
    const a = body.attributes.position;
    for (let i = 0; i < a.count; i++) { const z = a.getZ(i), t = clamp((z - 0.4) / 2.45, 0, 1); a.setX(i, a.getX(i) * (1 - 0.65 * t)); }
    body.computeVertexNormals();
    this.add(body, white);
    // rutor: vindrutan och sidorutorna
    const ws = this.box(0.98, 0.04, 0.6, glassM, 0, 1.585, -1.3); ws.rotation.x = -0.53;
    for (const s of [-1, 1]) this.box(0.03, 0.34, 1.35, glassM, s * 0.56, 1.46, -0.45);
    // ränder + registrering på sidorna
    const reg = 'SE-K' + String(spec.number ?? 0).padStart(2, '0');
    for (const s of [-1, 1]) {
      const c = cv(512, 144), g = c.getContext('2d');
      g.fillStyle = c0; g.fillRect(0, 50, 512, 20); g.fillStyle = c1; g.fillRect(0, 76, 512, 9);
      g.fillStyle = c1; g.font = 'italic 900 44px "Exo 2", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(reg, 256, 114);
      const d = this.decal(c, 1.9, 0.53, s * 0.552, 0.98, -0.5, s > 0 ? '+x' : '-x');
      d.renderOrder = 2;
    }
    // motorkåpan + spinnaren + propellern
    this.add(new THREE.CylinderGeometry(0.5, 0.55, 0.35, 20).rotateX(Math.PI / 2), paint, 0, 1.0, -2.68);
    this.add(new THREE.ConeGeometry(0.17, 0.32, 16).rotateX(-Math.PI / 2), paint2, 0, 1.1, -3.0);
    const prop = this.prop = new THREE.Group(); prop.position.set(0, 1.1, -2.95); this.model.add(prop);
    for (const s of [-1, 1]) { const bl = this.box(0.13, 0.78, 0.035, black, 0, s * 0.42, 0, prop); bl.rotation.y = s * 0.35; this.box(0.13, 0.08, 0.04, this.std({ color: 0xffd21f }), 0, s * 0.76, 0, prop); }
    const blurM = new THREE.MeshBasicMaterial({ color: 0x9aa0aa, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide });
    this.mats.push(blurM);
    this.blur = this.add(new THREE.CircleGeometry(0.8, 28), blurM, 0, 1.1, -2.96); this.blur.castShadow = false;
    this.propA = 0; this.lastT = 0;
    // högvingen med stöttor och färgade vingspetsar
    this.box(6.2, 0.1, 1.15, white, 0, 1.84, -0.55);
    for (const s of [-1, 1]) {
      this.box(0.4, 0.105, 1.16, paint, s * 2.92, 1.84, -0.55);
      this.box(2.0, 0.106, 0.14, paint, s * 1.6, 1.845, -0.95);
      this.tube(0.035, [s * 0.5, 0.72, -0.45], [s * 1.75, 1.79, -0.5], white);
    }
    // stjärten: höjdroder + fena
    this.box(2.4, 0.06, 0.7, white, 0, 1.36, 2.55);
    for (const s of [-1, 1]) this.box(0.35, 0.065, 0.7, paint, s * 1.05, 1.36, 2.55);
    const fin = new THREE.Shape(); fin.moveTo(2.0, 1.45); fin.lineTo(2.9, 1.45); fin.lineTo(2.95, 2.4); fin.lineTo(2.55, 2.4); fin.closePath();
    const fg = new THREE.ExtrudeGeometry(fin, { depth: 0.06, bevelEnabled: false }).rotateY(-Math.PI / 2).translate(0.03, 0, 0);
    this.add(fg, paint);
    // landningsställ: fjäderben + hjulkåpor på huvudhjulen, nosstället
    const tire = this.std({ color: 0x1a1b1f, roughness: 0.85 });
    for (const w of this.T.wheels) {
      if (w.front) {
        // nosstället: ett hjul i mitten (fysiken har två tätt ihop)
        if (w.x < 0) { this.wheels.push({ holder: new THREE.Group(), spin: new THREE.Group(), base: w, hubY: 0, spinK: 1 }); continue; }
        const o = this.wheel(w, 0.24, 0.12, [tire, tire, tire], chrome, 0.45);
        o.spin.position.x = -w.x;
        this.tube(0.03, [-w.x, 0.75, 0], [-w.x, 0, 0], chrome, o.holder);
        continue;
      }
      const o = this.wheel(w, 0.3, 0.16, [tire, tire, tire], chrome, 0.45);
      const pant = this.add(new THREE.SphereGeometry(1, 16, 12), paint, 0, 0.02, -0.05, o.holder); pant.scale.set(0.13, 0.26, 0.48);
      this.tube(0.04, [Math.sign(w.x) * 0.45, 0.68, w.z], [w.x * 0.95, 0.3, w.z], dark);
    }
    // nummer på fenan
    const nc = numCanvas(spec.number, '#ffffff');
    for (const s of [-1, 1]) this.decal(nc, 0.42, 0.42, s * 0.04, 1.95, 2.55, s > 0 ? '+x' : '-x');
  }
  // propellern: snurrar alltid, fortare med gas; på fart blir den en suddig skiva
  setThrust(k, time) {
    const dt = Math.min(0.1, Math.max(0, time - this.lastT)); this.lastT = time;
    this.propA += dt * (28 + 70 * k);
    this.prop.rotation.z = this.propA;
    this.blur.material.opacity = 0.12 + 0.3 * k;
  }
}

// osynliga hjul (fysikens hjul finns, men fordonet har larvband/svävar)
SimpleView.prototype.ghostWheels = function () {
  for (const w of this.T.wheels) this.wheels.push({ holder: new THREE.Group(), spin: new THREE.Group(), base: w, hubY: 0, spinK: 1 });
};
// rund mjuk prick (vattendroppar, strålens ringar)
let DROP = null;
function dropTex() {
  if (DROP) return DROP;
  const c = cv(64, 64), g = c.getContext('2d'), rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, 'rgba(240,250,255,1)'); rg.addColorStop(0.4, 'rgba(120,200,255,0.9)'); rg.addColorStop(1, 'rgba(60,150,255,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
  DROP = mkTex(c);
  return DROP;
}

// ---------------- Gokarten ----------------
export class GokartView extends SimpleView {
  constructor(spec) {
    super(VTYPES.gokart, spec);
    const c0 = spec.colors?.[0] || '#ffb21a', c1 = spec.colors?.[1] || '#16161a';
    const paint = this.phys({ color: c0, roughness: 0.3, clearcoat: 0.9 });
    const paint2 = this.phys({ color: c1, roughness: 0.35, clearcoat: 0.7 });
    const chrome = this.std({ color: 0xdfe3ea, roughness: 0.2, metalness: 1 });
    const steel = this.std({ color: 0x3a3d44, roughness: 0.4, metalness: 0.8 });
    const black = this.std({ color: 0x141418, roughness: 0.7 });
    // rörramen + golvplåten
    for (const s of [-1, 1]) {
      this.tube(0.022, [s * 0.36, 0.1, -0.82], [s * 0.36, 0.1, 0.78], chrome);
      this.tube(0.02, [s * 0.36, 0.1, -0.82], [s * 0.2, 0.12, -0.95], chrome);
    }
    for (const z of [-0.6, 0.0, 0.6]) this.tube(0.02, [-0.36, 0.1, z], [0.36, 0.1, z], chrome);
    this.box(0.68, 0.02, 1.4, steel, 0, 0.085, -0.05);
    this.tube(0.026, [-0.6, 0.06, -0.68], [0.6, 0.06, -0.68], steel);                      // framaxeln
    this.tube(0.03, [-0.66, 0.15, 0.62], [0.66, 0.15, 0.62], steel);                       // bakaxeln
    // nosen + sidokåporna (plast i bilens färger)
    this.add(profile([[-1.02, 0.06], [-1.02, 0.13], [-0.72, 0.22], [-0.5, 0.25], [-0.5, 0.06]], 0.78, 0.025), paint);
    for (const s of [-1, 1]) this.add(profile([[-0.42, 0.07], [-0.42, 0.25], [0.42, 0.27], [0.52, 0.07]], 0.2, 0.025), paint2, s * 0.5, 0, 0);
    // bakre stötfångaren
    this.tube(0.028, [-0.62, 0.16, 1.0], [0.62, 0.16, 1.0], chrome);
    for (const s of [-1, 1]) this.tube(0.024, [s * 0.62, 0.16, 1.0], [s * 0.36, 0.11, 0.72], chrome);
    // sätet, ratten
    this.box(0.4, 0.05, 0.38, black, 0, 0.17, 0.16);
    const back = this.box(0.42, 0.46, 0.06, black, 0, 0.42, 0.38); back.rotation.x = -0.28;
    this.tube(0.018, [0, 0.14, -0.58], [0, 0.45, -0.3], steel);
    const wheel = this.add(new THREE.TorusGeometry(0.13, 0.022, 8, 22), black, 0, 0.47, -0.28); wheel.rotation.x = -1.0;
    // motorn till höger bakom sätet + avgasröret
    this.box(0.24, 0.24, 0.28, steel, 0.42, 0.28, 0.55);
    this.add(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 12).rotateZ(Math.PI / 2), paint2, 0.58, 0.3, 0.55);
    this.tube(0.025, [0.42, 0.3, 0.7], [0.3, 0.42, 0.95], chrome);
    // däcken: smala fram, breda bak
    const tire = this.std({ color: 0x18181b, roughness: 0.9 }), rim = this.std({ color: c0, roughness: 0.3, metalness: 0.5 });
    for (const w of this.T.wheels) this.wheel(w, w.front ? 0.14 : 0.155, w.front ? 0.13 : 0.2, [tire, tire, tire], rim, 0.6);
    // nummerskylten på nosen
    const nc = numCanvas(spec.number, lum(c0) > 0.55 ? '#111' : '#fff');
    const nose = this.decal(nc, 0.24, 0.24, 0, 0.215, -0.72, '+z'); nose.rotation.set(-Math.PI / 2 + 0.35, 0, 0);
    this.rider(0.2, 0.16, { footY: 0.12, footZ: -0.66, hands: [[-0.11, 0.49, -0.26], [0.11, 0.49, -0.26]] });
  }
}

// ---------------- Brandbilen ----------------
export class BrandbilView extends SimpleView {
  constructor(spec) {
    super(VTYPES.brandbil, spec);
    const c0 = spec.colors?.[0] || '#d8141c', c1 = spec.colors?.[1] || '#ffd21f';
    const red = this.phys({ color: c0, roughness: 0.35, clearcoat: 0.8 });
    const dark = this.std({ color: 0x1b2234, roughness: 0.12, metalness: 0.4 });
    const chrome = this.std({ color: 0xdfe3ea, roughness: 0.2, metalness: 1 });
    const steel = this.std({ color: 0x9aa0aa, roughness: 0.35, metalness: 0.8 });
    const black = this.std({ color: 0x141418, roughness: 0.7 });
    // sidorna: luckor (rullgardiner), reflexrutor och RÄDDNINGSTJÄNST
    const side = () => {
      const c = cv(1024, 512), g = c.getContext('2d');
      g.fillStyle = c0; g.fillRect(0, 0, 1024, 512);
      for (let k = 0; k < 4; k++) {
        const x = 30 + k * 248;
        g.fillStyle = '#b8bdc6'; g.fillRect(x, 40, 220, 300);
        g.fillStyle = '#8a909a'; for (let y = 48; y < 336; y += 16) g.fillRect(x + 4, y, 212, 3);
        g.fillStyle = '#5a5f68'; g.fillRect(x + 90, 318, 40, 10);
      }
      // reflexband: rutor i två färger
      for (let x = 0; x < 1024; x += 64) { g.fillStyle = (x / 64) % 2 ? c1 : '#ffffff'; g.fillRect(x, 360, 64, 50); g.fillStyle = (x / 64) % 2 ? '#ffffff' : c1; g.fillRect(x, 410, 64, 50); }
      g.fillStyle = '#ffffff'; g.font = '900 54px Montserrat, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('RÄDDNINGSTJÄNST', 512, 488);
      return c;
    };
    const sideT = this.tex(side());
    const sideM = this.phys({ map: sideT, roughness: 0.4, clearcoat: 0.6 });
    // skåpet bak (y 0,55–2,9) + hytten fram
    this.box(2.4, 2.35, 5.45, [sideM, sideM, red, black, red, red], 0, 1.725, 0.875);
    this.box(2.36, 2.05, 1.72, red, 0, 1.575, -2.74);
    this.box(2.1, 0.3, 6.9, black, 0, 0.62, 0);                                       // chassit
    const ws = this.box(2.1, 0.86, 0.04, dark, 0, 2.08, -3.61); ws.rotation.x = 0.06;   // vindrutan
    for (const s of [-1, 1]) this.box(0.04, 0.72, 1.2, dark, s * 1.185, 2.1, -2.8);       // sidorutorna
    // reflexband runt hytten
    const band = cv(256, 64), bg = band.getContext('2d');
    for (let x = 0; x < 256; x += 32) { bg.fillStyle = (x / 32) % 2 ? c1 : '#ffffff'; bg.fillRect(x, 0, 32, 32); bg.fillStyle = (x / 32) % 2 ? '#ffffff' : c1; bg.fillRect(x, 32, 32, 32); }
    const bandM = this.std({ map: this.tex(band, 3, 1), roughness: 0.4 });
    this.box(2.38, 0.22, 1.74, bandM, 0, 1.12, -2.74);
    // grill, lampor, stötfångare
    const gr = cv(128, 64), gg = gr.getContext('2d');
    gg.fillStyle = '#16171b'; gg.fillRect(0, 0, 128, 64); gg.fillStyle = '#4a4d55'; for (let y = 6; y < 64; y += 10) gg.fillRect(6, y, 116, 4);
    this.decal(gr, 1.2, 0.5, 0, 0.98, -3.61, '-z');
    const lamp = this.std({ color: 0xfff6d0, emissive: 0xfff2c0, emissiveIntensity: 0.8 });
    for (const s of [-1, 1]) this.box(0.34, 0.2, 0.04, lamp, s * 0.85, 0.98, -3.61);
    this.box(2.44, 0.26, 0.16, chrome, 0, 0.58, -3.66);
    this.box(2.44, 0.26, 0.16, chrome, 0, 0.58, 3.62);
    // blåljusen: ramp på hyttaket + blixtljus i fronten (blinkar i setThrust)
    this.blueA = this.std({ color: 0x1a4dff, emissive: 0x2a6bff, emissiveIntensity: 2, roughness: 0.2, transparent: true, opacity: 0.92 });
    this.blueB = this.std({ color: 0x1a4dff, emissive: 0x2a6bff, emissiveIntensity: 0.1, roughness: 0.2, transparent: true, opacity: 0.92 });
    this.box(1.9, 0.08, 0.32, black, 0, 2.64, -3.3);
    for (const s of [-1, 1]) this.box(0.88, 0.16, 0.3, s < 0 ? this.blueA : this.blueB, s * 0.47, 2.76, -3.3);
    for (const s of [-1, 1]) this.box(0.16, 0.08, 0.04, s < 0 ? this.blueB : this.blueA, s * 0.42, 1.25, -3.62);
    for (const s of [-1, 1]) this.box(0.1, 0.22, 0.1, s < 0 ? this.blueA : this.blueB, s * 1.1, 2.75, 3.5);   // bak
    // stegen på taket (vilar på stöd) + vattenkanonen på hyttaket
    for (const s of [-1, 1]) this.tube(0.045, [s * 0.46, 3.1, -1.7], [s * 0.46, 3.1, 3.95], steel);
    for (let z = -1.6; z < 3.9; z += 0.34) this.tube(0.022, [-0.46, 3.1, z], [0.46, 3.1, z], steel);
    for (const z of [-1.4, 2.9]) { this.box(0.9, 0.18, 0.2, black, 0, 2.99, z); }
    this.add(new THREE.CylinderGeometry(0.5, 0.55, 0.16, 18), steel, 0, 2.98, 2.5);         // stegens vridkrans
    const N = this.T.nozzle;
    this.add(new THREE.CylinderGeometry(0.13, 0.16, 0.24, 14), steel, 0, 2.72, -2.45);
    this.tube(0.075, [0, 2.84, -2.45], [0, 3.02, -2.8], chrome);
    this.add(new THREE.CylinderGeometry(0.05, 0.085, 0.3, 12).rotateX(-Math.PI / 2 + 0.12), chrome, 0, N.y, N.z + 0.12);
    // slangvindan bak
    this.add(new THREE.CylinderGeometry(0.34, 0.34, 1.3, 16).rotateZ(Math.PI / 2), this.std({ color: 0xe8e2c8, roughness: 0.8 }), 0, 1.35, 3.72);
    // hjul
    const tread = this.std({ color: 0x18181b, roughness: 0.9 }), hub = this.std({ color: 0xe6e8ec, roughness: 0.3, metalness: 0.5 });
    for (const w of this.T.wheels) this.wheel(w, 0.5, 0.34, [tread, tread, tread], hub, 0.55);
    // nummer på dörren
    const nc = numCanvas(spec.number, '#ffffff');
    for (const s of [-1, 1]) this.decal(nc, 0.5, 0.5, s * 1.19, 1.5, -2.4, s > 0 ? '+x' : '-x');
    // vattenstrålen: en tät kärna nära munstycket + droppar i en båge (animeras i setLoader)
    const jet = this.jetGrp = new THREE.Group(); jet.position.set(0, N.y, N.z - 0.1); this.model.add(jet);
    const coreM = new THREE.MeshStandardMaterial({ color: 0x8fd0ff, emissive: 0x1a5a9a, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.8, depthWrite: false });
    this.mats.push(coreM); this.coreM = coreM;
    this.core = this.add(new THREE.CylinderGeometry(0.09, 0.32, 1, 12, 1, true).rotateX(Math.PI / 2).translate(0, 0, -0.5), coreM, 0, 0, 0, jet);
    this.core.castShadow = false;
    this.dropM = new THREE.SpriteMaterial({ map: dropTex(), transparent: true, depthWrite: false, opacity: 0.9 });
    this.mats.push(this.dropM);
    this.drops = Array.from({ length: 34 }, (_, i) => { const s = new THREE.Sprite(this.dropM); s.userData.u0 = i / 34; jet.add(s); return s; });
    this.jetK = -1; this.setLoader(0);
  }
  // k = 0..1 hur mycket kanonen sprutar
  setLoader(k) {
    const t = performance.now() / 1000;
    const on = k > 0.02;
    this.jetGrp.visible = on;
    if (!on) { this.jetK = 0; return; }
    const L = 16 * Math.min(1, k * 1.3);
    this.core.scale.set(1, 1, Math.min(6, L * 0.4));
    this.core.rotation.x = 0.3;                        // strålen går uppåt först (syns över hytten), dropparna faller sedan
    this.coreM.opacity = 0.8 * k;
    this.dropM.opacity = 0.95 * k;
    for (const s of this.drops) {
      const u = (s.userData.u0 + t * 1.7) % 1;
      s.position.set((Math.sin(u * 37 + s.userData.u0 * 9) * 0.4) * u, 1.6 * Math.sin(Math.PI * u * 0.9) - 2.5 * u * u, -L * u);
      s.scale.setScalar((0.5 + u * 1.9) * (0.7 + 0.3 * k));
    }
  }
  // blåljusen blinkar alltid (fort, växelvis)
  setThrust(k, time) {
    const a = Math.floor(time * 7) % 2 === 0;
    this.blueA.emissiveIntensity = a ? 2.2 : 0.08;
    this.blueB.emissiveIntensity = a ? 0.08 : 2.2;
  }
}

// ---------------- Stridsvagnen ----------------
export class StridsvagnView extends SimpleView {
  constructor(spec) {
    super(VTYPES.stridsvagn, spec);
    const c0 = spec.colors?.[0] || '#5a6b3a', c1 = spec.colors?.[1] || '#2f3a22';
    // kamouflage i bilens två färger
    const camo = cv(512, 512), cg = camo.getContext('2d');
    cg.fillStyle = c0; cg.fillRect(0, 0, 512, 512);
    const blob = (col, n, r) => { cg.fillStyle = col; for (let k = 0; k < n; k++) { cg.beginPath(); cg.ellipse(Math.random() * 512, Math.random() * 512, r * (0.5 + Math.random()), r * (0.3 + Math.random() * 0.5), Math.random() * 3, 0, Math.PI * 2); cg.fill(); } };
    blob(c1, 26, 60); blob('rgba(20,20,16,0.55)', 14, 40); blob('rgba(255,255,255,0.08)', 10, 50);
    const camoT = this.tex(camo, 1, 1); camoT.wrapS = camoT.wrapT = THREE.RepeatWrapping; camoT.repeat.set(0.35, 0.35);
    const paint = this.std({ map: camoT, roughness: 0.75, metalness: 0.15 });
    const dark = this.std({ color: 0x23251f, roughness: 0.6, metalness: 0.4 });
    const steel = this.std({ color: 0x3a3d44, roughness: 0.4, metalness: 0.8 });
    const black = this.std({ color: 0x121214, roughness: 0.8 });
    // larvbanden: länkar i en rullande textur + boggiehjul
    const tc = cv(64, 64), tg = tc.getContext('2d');
    tg.fillStyle = '#1c1d20'; tg.fillRect(0, 0, 64, 64); tg.fillStyle = '#3a3c42'; tg.fillRect(0, 0, 22, 64); tg.fillStyle = '#0e0e10'; tg.fillRect(40, 0, 6, 64);
    this.trackT = this.tex(tc, 1, 1); this.trackT.wrapS = this.trackT.wrapT = THREE.RepeatWrapping; this.trackT.repeat.set(2.5, 2.5);
    const trackM = this.std({ map: this.trackT, roughness: 0.9, metalness: 0.3 });
    const trackShape = [[-3.05, 0.48], [-2.72, 0.06], [2.72, 0.06], [3.05, 0.48], [2.85, 0.98], [-2.85, 0.98]];
    this.road = [];
    for (const s of [-1, 1]) {
      this.add(profile(trackShape, 0.6, 0.03), trackM, s * 1.2, 0, 0);
      for (let k = 0; k < 6; k++) {
        const g = new THREE.Group(); g.position.set(s * 1.52, 0.4, -2.3 + k * 0.92); this.model.add(g);
        this.add(new THREE.CylinderGeometry(0.34, 0.34, 0.08, 18).rotateZ(Math.PI / 2), dark, 0, 0, 0, g);
        this.add(new THREE.CylinderGeometry(0.12, 0.12, 0.1, 8).rotateZ(Math.PI / 2), steel, s * 0.01, 0, 0, g);
        this.road.push(g);
      }
      for (const z of [-2.75, 2.75]) {
        const g = new THREE.Group(); g.position.set(s * 1.52, 0.55, z); this.model.add(g);
        this.add(new THREE.CylinderGeometry(0.3, 0.3, 0.09, 10).rotateZ(Math.PI / 2), steel, 0, 0, 0, g);
        this.road.push(g);
      }
    }
    // skrovet: sluttande front, stänkskärmar över banden
    this.add(profile([[-3.15, 0.95], [-2.35, 1.5], [2.9, 1.5], [3.12, 1.12], [3.0, 0.62], [-2.7, 0.55]], 2.0, 0.05), paint);
    this.add(profile([[-3.12, 1.0], [-2.9, 1.08], [2.95, 1.08], [3.1, 1.0]], 3.1, 0.02), paint);
    for (const s of [-1, 1]) this.box(0.6, 0.3, 5.0, paint, s * 1.25, 1.2, 0.05);              // sidolådor över banden
    // tornet med kanonen (i en egen grupp så den kan rekylera)
    const tz = 0.25;
    this.add(new THREE.CylinderGeometry(1.0, 1.05, 0.12, 24), dark, 0, 1.55, tz);
    this.add(profile([[-1.2, 1.58], [-0.85, 2.2], [1.3, 2.2], [1.65, 1.9], [1.65, 1.58]], 2.0, 0.05), paint, 0, 0, tz);
    this.box(0.7, 0.55, 0.35, paint, 0, 1.93, tz - 1.4);                                       // manteln
    const gun = this.gunGrp = new THREE.Group(); gun.position.set(0, this.T.gun.y, tz - 1.5); this.model.add(gun);
    const gl = -(this.T.gun.z - (tz - 1.5));                                                  // pipans längd
    this.add(new THREE.CylinderGeometry(0.1, 0.12, gl, 14).rotateX(Math.PI / 2).translate(0, 0, -gl / 2), steel, 0, 0, 0, gun);
    this.add(new THREE.CylinderGeometry(0.17, 0.17, 0.62, 14).rotateX(Math.PI / 2), paint, 0, 0, -gl * 0.45, gun);   // rökutsugaren
    this.add(new THREE.CylinderGeometry(0.16, 0.16, 0.32, 12).rotateX(Math.PI / 2), dark, 0, 0, -gl + 0.16, gun);    // mynningsbromsen
    // luckor, kulspruta, antenn, lådor
    this.add(new THREE.CylinderGeometry(0.32, 0.34, 0.22, 16), paint, 0.55, 2.3, tz + 0.55);
    this.add(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 16), dark, 0.55, 2.42, tz + 0.55);
    this.tube(0.03, [0.55, 2.52, tz + 0.45], [0.55, 2.54, tz - 0.45], black);
    this.box(0.12, 0.14, 0.4, black, 0.55, 2.5, tz + 0.55);
    this.tube(0.012, [-0.7, 2.2, tz + 1.15], [-0.78, 3.9, tz + 1.35], black);
    this.box(1.6, 0.4, 0.5, paint, 0, 1.95, tz + 1.88);                                        // korgen bak på tornet
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) this.add(new THREE.CylinderGeometry(0.07, 0.07, 0.24, 8).rotateX(Math.PI / 2 - 0.5), dark, s * 1.0, 2.1 + k * 0.1, tz - 0.7 + k * 0.05);  // rökgranatkastare
    // strålkastare + nummer på tornet
    const lamp = this.std({ color: 0xfff6d0, emissive: 0xfff2c0, emissiveIntensity: 0.7 });
    for (const s of [-1, 1]) this.box(0.18, 0.12, 0.05, lamp, s * 0.75, 1.32, -2.75);
    const nc = numCanvas(spec.number, '#ffffff');
    for (const s of [-1, 1]) this.decal(nc, 0.55, 0.55, s * 1.07, 1.95, tz + 0.3, s > 0 ? '+x' : '-x');
    this.ghostWheels();
    this.gunK = -1; this.setLoader(0);
  }
  // rekylen: pipan rycks bakåt när den skjuter och glider fram igen
  setLoader(k) {
    if (k === this.gunK) return;
    this.gunK = k;
    this.gunGrp.position.z = 0.25 - 1.5 + 0.7 * k * k;
  }
  setWheel(k, susLen, spin, steer) {
    if (k !== 2) return;
    for (const g of this.road) g.rotation.x = -spin * (this.T.wheelR / 0.34);
    this.trackT.offset.x = (spin * this.T.wheelR * 2.5) % 1;
  }
}

// ---------------- UFO:t ----------------
export class UfoView extends SimpleView {
  constructor(spec) {
    super(VTYPES.ufo, spec);
    const c0 = spec.colors?.[0] || '#2bd6e8', c1 = spec.colors?.[1] || '#16161a';
    const metal = this.phys({ color: 0xc9ced8, roughness: 0.22, metalness: 0.9, clearcoat: 0.6 });
    const paint = this.phys({ color: c0, roughness: 0.25, metalness: 0.4, clearcoat: 1 });
    const dark = this.std({ color: lum(c1) > 0.5 ? 0x2a2c33 : c1, roughness: 0.4, metalness: 0.6 });
    const skin = this.std({ color: 0x7be36a, roughness: 0.55 });
    const eye = this.phys({ color: 0x050507, roughness: 0.05, clearcoat: 1 });
    // tefatet: svarvad profil (radie, höjd)
    const prof = [[0.001, 1.1], [0.85, 1.12], [1.5, 1.3], [1.72, 1.45], [1.56, 1.58], [0.98, 1.72], [0.001, 1.75]].map(([r, y]) => new THREE.Vector2(r, y));
    this.add(new THREE.LatheGeometry(prof, 44), metal);
    this.add(new THREE.TorusGeometry(1.66, 0.06, 8, 48).rotateX(Math.PI / 2), paint, 0, 1.45, 0);
    this.add(new THREE.TorusGeometry(1.08, 0.04, 8, 40).rotateX(Math.PI / 2), paint, 0, 1.68, 0);
    // ljusen runt kanten (snurrar)
    this.rim = new THREE.Group(); this.rim.position.y = 1.47; this.model.add(this.rim);
    const cols = [0xff3b6b, 0xffd21f, 0x5bff7a, 0x2bd6e8];
    this.rimM = cols.map(c => { const m = new THREE.MeshBasicMaterial({ color: c, toneMapped: false }); this.mats.push(m); return m; });
    for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; this.add(new THREE.SphereGeometry(0.075, 8, 6), this.rimM[k % 4], Math.cos(a) * 1.6, 0, Math.sin(a) * 1.6, this.rim); }
    // kupolen (glas) med utomjordingen
    const glass = this.phys({ color: 0xaee8ff, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.3, clearcoat: 1 });
    const dome = this.add(new THREE.SphereGeometry(0.74, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), glass, 0, 1.72, 0); dome.castShadow = false;
    this.add(new THREE.CapsuleGeometry(0.17, 0.2, 4, 10), skin, 0, 1.86, 0.08);
    const head = this.add(new THREE.SphereGeometry(0.22, 18, 14), skin, 0, 2.18, 0.02); head.scale.set(1, 1.15, 1);
    for (const s of [-1, 1]) {
      const e = this.add(new THREE.SphereGeometry(1, 12, 10), eye, s * 0.095, 2.2, -0.17); e.scale.set(0.075, 0.1, 0.04); e.rotation.z = s * 0.5;
      this.tube(0.012, [s * 0.08, 2.4, 0.02], [s * 0.16, 2.55, 0.05], skin);
      this.add(new THREE.SphereGeometry(0.035, 8, 6), this.rimM[s < 0 ? 0 : 1], s * 0.16, 2.56, 0.05);
      this.tube(0.04, [s * 0.15, 1.95, 0.0], [s * 0.18, 1.85, -0.28], skin);              // armarna mot spakarna
    }
    this.box(0.5, 0.1, 0.2, dark, 0, 1.8, -0.36);                                           // instrumentbrädan
    // undersidan: lysande ring + tre landningsbubblor
    const glowM = new THREE.MeshBasicMaterial({ color: 0x9fffb0, transparent: true, opacity: 0.85, toneMapped: false }); this.mats.push(glowM);
    const ring = this.add(new THREE.RingGeometry(0.5, 0.82, 32).rotateX(Math.PI / 2), glowM, 0, 1.105, 0); ring.castShadow = false;
    for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2 + 0.5; this.add(new THREE.SphereGeometry(0.16, 10, 8), dark, Math.cos(a) * 1.15, 1.18, Math.sin(a) * 1.15); }
    // nummer på ovansidan av kanten
    const nc = numCanvas(spec.number, lum(c0) > 0.55 ? '#111' : '#fff');
    const top = this.decal(nc, 0.5, 0.5, 0, 1.71, -1.2, '+z'); top.rotation.set(-Math.PI / 2 + 0.3, 0, 0);
    this.ghostWheels();
    // dragstrålen: en genomskinlig kon från magen mot målet + ringar som åker mot UFO:t
    const beamM = new THREE.MeshBasicMaterial({ color: 0x7dff9a, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    this.mats.push(beamM); this.beamM = beamM;
    this.beam = new THREE.Group(); this.group.add(this.beam);
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 1.6, 1, 24, 1, true).translate(0, -0.5, 0), beamM); this.geos.push(cone.geometry);
    cone.renderOrder = 5; this.beam.add(cone);
    this.ringM = new THREE.MeshBasicMaterial({ color: 0xc8ffd2, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.mats.push(this.ringM);
    const rg = new THREE.TorusGeometry(1, 0.04, 6, 28).rotateX(Math.PI / 2); this.geos.push(rg);
    this.rings = [0, 1, 2, 3].map(i => { const m = new THREE.Mesh(rg, this.ringM); m.userData.u0 = i / 4; m.renderOrder = 6; this.beam.add(m); return m; });
    this.beam.visible = false;
    this.lastT = 0;
  }
  // strålen: k = styrka, to = målet i fordonets ram (null = snett ned framför)
  setBeam(k, to) {
    const on = k > 0.03;
    this.beam.visible = on;
    if (!on) return;
    const from = _p.set(0, 1.1 + this.T.modelY, -0.5);
    const tgt = to || _d.set(0, this.T.modelY + 0.2, -6);
    const dir = _d2.subVectors(tgt, from), len = Math.max(0.5, dir.length());
    this.beam.position.copy(from);
    this.beam.quaternion.setFromUnitVectors(_dn, dir.normalize());
    this.beam.scale.set(1, len, 1);
    const t = performance.now() / 1000;
    this.beamM.opacity = (0.22 + 0.1 * Math.sin(t * 23)) * k;
    this.ringM.opacity = 0.55 * k;
    for (const r of this.rings) {
      const u = 1 - ((r.userData.u0 + t * 0.9) % 1);                 // rör sig mot UFO:t
      r.position.y = -u; const w = 0.45 + 1.15 * u; r.scale.set(w, 1 / len, w);
    }
  }
  // svävar: guppar lite, ljusen snurrar (fortare med gas)
  setThrust(k, time) {
    const dt = Math.min(0.1, Math.max(0, time - this.lastT)); this.lastT = time;
    this.model.position.y = this.T.modelY + Math.sin(time * 2.3) * 0.06;
    this.rim.rotation.y += dt * (1.2 + 3 * k);
    const blink = Math.floor(time * 4) % 4;
    this.rimM.forEach((m, i) => m.color.setHex([0xff3b6b, 0xffd21f, 0x5bff7a, 0x2bd6e8][(i + blink) % 4]));
  }
}
const _d2 = new THREE.Vector3(), _dn = new THREE.Vector3(0, -1, 0);
