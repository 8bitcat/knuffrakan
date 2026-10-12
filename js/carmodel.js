// Stockcar-karossen: en "loft" av tvärsnitt längs bilen med egna UV:er, så att
// reklamlacken (livery) kan målas på en canvas. Plåten kan bucklas där den träffas.
import * as THREE from 'three';

export const CAR_L = 4.9;
export const MODEL_Y = -0.55;   // markplanet i kroppens ram (origo = tyngdpunkten)
export const WHEEL_R = 0.37;

// Tre karosser — samma fysik, olika profil
export const SHAPES = [
  { id: 'kamaro', namn: 'Kamaro', nose: 0.54, beltF: 0.86, beltR: 0.97, roofH: 1.29, roofT0: 0.49, roofT1: 0.69, cw: 0.72 },
  { id: 'mustek', namn: 'Mustek', nose: 0.57, beltF: 0.89, beltR: 0.99, roofH: 1.3, roofT0: 0.47, roofT1: 0.66, cw: 0.70 },
  { id: 'kamry', namn: 'Kamry', nose: 0.52, beltF: 0.84, beltR: 0.95, roofH: 1.28, roofT0: 0.50, roofT1: 0.72, cw: 0.74 },
];

const S = 64;      // stationer längs bilen
const KP = 11;     // punkter per halvt tvärsnitt
const PER = 2 * KP - 1; // 21: botten → vänster → tak → höger → botten
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerpKeys = (keys, t) => {
  if (t <= keys[0][0]) return keys[0][1];
  for (let k = 0; k < keys.length - 1; k++) {
    const [t0, v0] = keys[k], [t1, v1] = keys[k + 1];
    if (t <= t1) return v0 + (v1 - v0) * (t - t0) / (t1 - t0);
  }
  return keys[keys.length - 1][1];
};

export const AXLES = [0.2, 0.8]; // hjulens läge längs bilen (t)

function profile(sh) {
  const P = [];
  for (let s = 0; s < S; s++) {
    const t = s / (S - 1);
    const hw = 1.0 - 0.2 * Math.pow(1 - smooth(0, 0.13, t), 1.4) - 0.045 * smooth(0.9, 1, t);
    const belt = lerpKeys([[0, sh.nose], [0.03, sh.nose + 0.17], [0.08, sh.nose + 0.25], [0.34, sh.beltF], [0.86, sh.beltR], [0.97, sh.beltR + 0.01], [1, sh.beltR - 0.05]], t);
    const r0 = sh.roofT0, r1 = sh.roofT1;
    let roof = belt;
    if (t > r0 - 0.19 && t < 0.88) {
      roof = Math.max(belt, lerpKeys([[r0 - 0.19, sh.beltF], [r0 - 0.13, 0.98], [r0 - 0.07, 1.13], [r0, sh.roofH - 0.02], [(r0 + r1) / 2, sh.roofH], [r1, sh.roofH - 0.03], [r1 + 0.06, sh.roofH - 0.17], [0.85, sh.beltR + 0.07], [0.88, sh.beltR]], t));
    }
    let arch = 0;
    for (const ta of AXLES) {
      const d = (t - ta) / 0.094;
      if (Math.abs(d) < 1) arch = Math.max(arch, 0.52 * Math.sqrt(1 - d * d));
    }
    const yb = 0.25 + arch;
    P.push({ t, hw, belt, roof, yb, cw: sh.cw });
  }
  // jämna ut belt/roof lite
  for (let pass = 0; pass < 2; pass++) {
    for (const key of ['belt', 'roof']) {
      const v = P.map(p => p[key]);
      for (let s = 1; s < S - 1; s++) P[s][key] = (v[s - 1] + 2 * v[s] + v[s + 1]) / 4;
    }
  }
  for (const p of P) p.roof = Math.max(p.roof, p.belt);
  return P;
}

function sectionHalf(p) {
  const { hw, yb, belt, roof, cw } = p;
  const hg = Math.max(0.04, belt - yb);
  const pts = [
    [0, 0.25],
    [hw * 0.93, yb],
    [hw, yb + hg * 0.16],
    [hw, yb + hg * 0.52],
    [hw * 0.985, yb + hg * 0.86],
    [hw * 0.935, belt],
  ];
  const cf = smooth(0.0, 0.06, roof - belt);
  const hood = [[hw * 0.72, belt + 0.012], [hw * 0.52, belt + 0.02], [hw * 0.34, belt + 0.026], [hw * 0.17, belt + 0.03], [0, belt + 0.032]];
  const cwB = hw * 0.87;
  const cab = [[cwB, belt + 0.01], [cwB + (cw - cwB) * 0.55, belt + (roof - belt) * 0.55], [cw, roof - 0.03], [cw * 0.5, roof - 0.004], [0, roof]];
  for (let k = 0; k < 5; k++) pts.push([hood[k][0] + (cab[k][0] - hood[k][0]) * cf, hood[k][1] + (cab[k][1] - hood[k][1]) * cf]);
  return pts;
}

// v för varje punkt i halvsnittet (0 = botten mitt, 0.5 = taket mitt), från ett referenssnitt
export const V = (() => {
  const ref = sectionHalf({ hw: 1, yb: 0.25, belt: 0.88, roof: 1.25, cw: 0.70 });
  const w = [0.15, 1, 1, 1, 1, 1, 1, 1, 1, 1];
  const acc = [0];
  for (let k = 1; k < KP; k++) acc.push(acc[k - 1] + Math.hypot(ref[k][0] - ref[k - 1][0], ref[k][1] - ref[k - 1][1]) * w[k - 1]);
  return acc.map(a => a / acc[KP - 1] * 0.5);
})();

const geoCache = new Map();
export function shapeGeometry(sh) {
  if (geoCache.has(sh.id)) return geoCache.get(sh.id);
  const P = profile(sh);
  const pos = new Float32Array(S * PER * 3), uv = new Float32Array(S * PER * 2), idx = [];
  for (let s = 0; s < S; s++) {
    const half = sectionHalf(P[s]);
    const z = -CAR_L / 2 + P[s].t * CAR_L;
    for (let j = 0; j < PER; j++) {
      let x, y, v;
      if (j < KP) { x = -half[j][0]; y = half[j][1]; v = V[j]; }
      else { const k = PER - 1 - j; x = half[k][0]; y = half[k][1]; v = 1 - V[k]; }
      const o = s * PER + j;
      pos[o * 3] = x; pos[o * 3 + 1] = y; pos[o * 3 + 2] = z;
      uv[o * 2] = P[s].t; uv[o * 2 + 1] = v;
    }
    if (s < S - 1) for (let j = 0; j < PER - 1; j++) {
      const a = s * PER + j, b = a + 1, c = a + PER, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const body = new THREE.BufferGeometry();
  body.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  body.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  body.setIndex(idx);
  body.computeVertexNormals();

  // Fram- och bakgavel (fläktar) med egen textur: vänstra halvan fram, högra bak
  const capPos = [], capUv = [], capIdx = [];
  for (const [s, front] of [[0, true], [S - 1, false]]) {
    const base = capPos.length / 3;
    let cx = 0, cy = 0;
    const ring = [];
    for (let j = 0; j < PER - 1; j++) { const o = s * PER + j; ring.push([pos[o * 3], pos[o * 3 + 1], pos[o * 3 + 2]]); cy += pos[o * 3 + 1]; }
    cy /= ring.length;
    const zc = ring[0][2] + (front ? 0.004 : -0.004);
    capPos.push(cx, cy, zc);
    capUv.push(front ? 0.25 : 0.75, (cy - 0.2) / 0.85);
    for (const [x, y] of ring) {
      capPos.push(x, y, zc);
      capUv.push(front ? 0.25 - x * 0.25 : 0.75 + x * 0.25, (y - 0.2) / 0.85);
    }
    const n = ring.length;
    for (let j = 0; j < n; j++) {
      const a = base + 1 + j, b = base + 1 + (j + 1) % n;
      if (front) capIdx.push(base, a, b); else capIdx.push(base, b, a);
    }
  }
  const caps = new THREE.BufferGeometry();
  caps.setAttribute('position', new THREE.Float32BufferAttribute(capPos, 3));
  caps.setAttribute('uv', new THREE.Float32BufferAttribute(capUv, 2));
  caps.setIndex(capIdx);
  caps.computeVertexNormals();

  const out = { body, caps, P };
  geoCache.set(sh.id, out);
  return out;
}

// Däck med gul text på sidan
let tireMats = null;
function getTireMats() {
  if (tireMats) return tireMats;
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const c = cv.getContext('2d');
  c.fillStyle = '#121214'; c.fillRect(0, 0, 256, 256);
  c.fillStyle = '#1c1c20'; c.beginPath(); c.arc(128, 128, 84, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#0b0b0d'; c.beginPath(); c.arc(128, 128, 70, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#3a3b42';
  for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; c.beginPath(); c.arc(128 + Math.cos(a) * 30, 128 + Math.sin(a) * 30, 7, 0, Math.PI * 2); c.fill(); }
  c.fillStyle = '#5a5b62'; c.beginPath(); c.arc(128, 128, 12, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#ffd21f';
  c.font = '900 22px Montserrat, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  const txt = 'KNUFFYEAR  •  KNUFFYEAR  •  ';
  for (let k = 0; k < txt.length; k++) {
    const a = k / txt.length * Math.PI * 2;
    c.save(); c.translate(128 + Math.cos(a) * 104, 128 + Math.sin(a) * 104); c.rotate(a + Math.PI / 2); c.fillText(txt[k], 0, 0); c.restore();
  }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const side = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75 });
  const tread = new THREE.MeshStandardMaterial({ color: 0x111113, roughness: 0.92 });
  tireMats = [tread, side, side];
  return tireMats;
}
const tireGeo = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.3, 22, 1).rotateZ(Math.PI / 2);

export const WHEEL_POS = [
  { x: -0.84, z: -CAR_L / 2 + AXLES[0] * CAR_L, front: true },
  { x: 0.84, z: -CAR_L / 2 + AXLES[0] * CAR_L, front: true },
  { x: -0.84, z: -CAR_L / 2 + AXLES[1] * CAR_L, front: false },
  { x: 0.84, z: -CAR_L / 2 + AXLES[1] * CAR_L, front: false },
];

export class CarView {
  constructor(shape, livery) {
    this.shape = shape;
    this.livery = livery;
    this.group = new THREE.Group();
    this.model = new THREE.Group();
    this.model.position.y = MODEL_Y;
    this.group.add(this.model);
    const g = shapeGeometry(shape);
    this.geo = g.body.clone();
    this.orig = Float32Array.from(this.geo.attributes.position.array);
    this.dentAcc = new Float32Array(this.orig.length / 3);
    this.bodyMat = new THREE.MeshPhysicalMaterial({
      map: livery.tex, roughness: 0.38, metalness: 0.08, clearcoat: 0.9, clearcoatRoughness: 0.14, envMapIntensity: 0.9,
    });
    this.body = new THREE.Mesh(this.geo, this.bodyMat);
    this.body.castShadow = true;
    this.model.add(this.body);
    const caps = new THREE.Mesh(g.caps, new THREE.MeshPhysicalMaterial({ map: livery.ends, roughness: 0.4, clearcoat: 0.8 }));
    caps.castShadow = true;
    this.model.add(caps);

    // Spoiler + splitter
    const rear = g.P[S - 3];
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.22, 0.025),
      new THREE.MeshPhysicalMaterial({ color: 0x15161c, transparent: true, opacity: 0.82, roughness: 0.2, clearcoat: 1 }));
    spoiler.position.set(0, rear.belt + 0.11, CAR_L / 2 - 0.1);
    spoiler.rotation.x = -0.25;
    this.model.add(spoiler);
    const splitter = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.05, 0.3), new THREE.MeshStandardMaterial({ color: 0x0e0f12, roughness: 0.6 }));
    splitter.position.set(0, 0.27, -CAR_L / 2 + 0.12);
    this.model.add(splitter);

    // Hjul
    const mats = getTireMats();
    this.wheels = WHEEL_POS.map((w) => {
      const holder = new THREE.Group();
      const spin = new THREE.Group();
      const tire = new THREE.Mesh(tireGeo, mats);
      tire.castShadow = true;
      spin.add(tire);
      holder.add(spin);
      holder.position.set(w.x, WHEEL_R, w.z);
      this.model.add(holder);
      return { holder, spin, base: w };
    });
  }

  // susLen: avstånd från fästet (y=0 i kroppsramen) ner till hjulcentrum
  setWheel(k, susLen, spin, steer) {
    const w = this.wheels[k];
    w.holder.position.y = -susLen - MODEL_Y;
    w.spin.rotation.x = -spin;
    w.holder.rotation.y = w.base.front ? -steer : 0;
  }

  // Buckla plåten: punkt + riktning (in i bilen) i kroppens ram
  dent(px, py, pz, dx, dy, dz, amount) {
    const a = this.geo.attributes.position.array, o = this.orig;
    const ly = py - MODEL_Y;
    const R = 1.05;
    let hit = false;
    for (let i = 0, n = o.length / 3; i < n; i++) {
      const vx = a[i * 3], vy = a[i * 3 + 1], vz = a[i * 3 + 2];
      const d = Math.hypot(vx - px, vy - ly, vz - pz);
      if (d > R) continue;
      const f = (1 - d / R) ** 2 * amount;
      const room = 0.32 - this.dentAcc[i];
      if (room <= 0) continue;
      const m = Math.min(room, f);
      this.dentAcc[i] += m;
      a[i * 3] += dx * m; a[i * 3 + 1] += dy * m * 0.6; a[i * 3 + 2] += dz * m;
      hit = true;
    }
    if (hit) {
      this.geo.attributes.position.needsUpdate = true;
      this.geo.computeVertexNormals();
    }
    return hit;
  }

  // närmaste UV till en punkt i kroppens ram (för repor i lacken)
  uvNear(px, py, pz) {
    const a = this.geo.attributes.position.array, uv = this.geo.attributes.uv.array;
    const ly = py - MODEL_Y;
    let best = 0, bd = Infinity;
    for (let i = 0, n = a.length / 3; i < n; i++) {
      const d = (a[i * 3] - px) ** 2 + (a[i * 3 + 1] - ly) ** 2 + (a[i * 3 + 2] - pz) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return [uv[best * 2], uv[best * 2 + 1]];
  }

  resetDamage() {
    this.geo.attributes.position.array.set(this.orig);
    this.dentAcc.fill(0);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.livery.restore();
  }

  dispose() {
    this.geo.dispose();
    this.bodyMat.dispose();
    this.livery.dispose();
  }
}
