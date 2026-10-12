// Effekter: partiklar (eld, rök, gnistor, snö, explosioner) + ljusspår och sladdmärken på vägen.
import * as THREE from 'three';

const PVS = `
attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
varying float vAlpha; varying vec3 vColor;
uniform float uViewH;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSize * projectionMatrix[1][1] * uViewH * 0.5 / max(0.1, -mv.z), 0.0, 400.0);
  vAlpha = aAlpha; vColor = aColor;
}`;
const PFS = `
varying float vAlpha; varying vec3 vColor;
uniform float uSoft;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d) * 2.0;
  float a = smoothstep(1.0, uSoft, r) * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor, a);
  #include <colorspace_fragment>
}`;

class Particles {
  constructor(scene, max, additive) {
    this.max = max; this.n = 0;
    const A = (k) => new Float32Array(max * k);
    this.pos = A(3); this.vel = A(3); this.col = A(3); this.c0 = A(3); this.c1 = A(3);
    this.life = A(1); this.maxLife = A(1); this.s0 = A(1); this.s1 = A(1); this.size = A(1); this.alpha = A(1);
    this.a0 = A(1); this.grav = A(1); this.drag = A(1);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('aColor', this.aCol);
    g.setAttribute('aSize', this.aSize); g.setAttribute('aAlpha', this.aAlpha);
    g.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: PVS, fragmentShader: PFS, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uViewH: { value: window.innerHeight }, uSoft: { value: additive ? 0.0 : 0.25 } },
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 6 : 5;
    scene.add(this.points);
    this.geo = g;
  }
  spawn(x, y, z, vx, vy, vz, life, s0, s1, c0, c1, a0, grav = 0, drag = 0) {
    let i = this.n;
    if (i >= this.max) i = Math.floor(Math.random() * this.max); else this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.c0[i * 3] = c0.r; this.c0[i * 3 + 1] = c0.g; this.c0[i * 3 + 2] = c0.b;
    this.c1[i * 3] = c1.r; this.c1[i * 3 + 1] = c1.g; this.c1[i * 3 + 2] = c1.b;
    this.life[i] = 0; this.maxLife[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a0;
    this.grav[i] = grav; this.drag[i] = drag;
  }
  update(dt) {
    let i = 0;
    while (i < this.n) {
      this.life[i] += dt;
      if (this.life[i] >= this.maxLife[i]) {
        const j = --this.n;
        if (i !== j) {
          for (const arr of [this.pos, this.vel, this.c0, this.c1]) { arr[i * 3] = arr[j * 3]; arr[i * 3 + 1] = arr[j * 3 + 1]; arr[i * 3 + 2] = arr[j * 3 + 2]; }
          for (const arr of [this.life, this.maxLife, this.s0, this.s1, this.a0, this.grav, this.drag]) arr[i] = arr[j];
        }
        continue;
      }
      const t = this.life[i] / this.maxLife[i];
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= dr; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * dr - this.grav[i] * dt; this.vel[i * 3 + 2] *= dr;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      this.alpha[i] = this.a0[i] * (1 - t) * Math.min(1, this.life[i] * 20);
      for (let k = 0; k < 3; k++) this.col[i * 3 + k] = this.c0[i * 3 + k] + (this.c1[i * 3 + k] - this.c0[i * 3 + k]) * Math.min(1, t * 1.6);
      i++;
    }
    this.geo.setDrawRange(0, this.n);
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = this.aAlpha.needsUpdate = true;
    this.mat.uniforms.uViewH.value = window.innerHeight;
  }
}

const C = (hex) => new THREE.Color(hex);
const FIRE0 = C(0xfff2a0), FIRE1 = C(0xff4a10), SPARK0 = C(0xfff6c8), SPARK1 = C(0xff9a20);
const SMOKE0 = C(0x6a5d68), SMOKE1 = C(0xb9a9b5), DARK0 = C(0x2a2228), DARK1 = C(0x6e6068);
const SNOW0 = C(0xffffff), SNOW1 = C(0xf3e4ec), TIRE0 = C(0xe9dfe6), TIRE1 = C(0xcdbfca);
const rnd = (a) => (Math.random() - 0.5) * 2 * a;

export class FX {
  constructor(scene) {
    this.glow = new Particles(scene, 3000, true);
    this.puff = new Particles(scene, 3000, false);
  }
  update(dt) { this.glow.update(dt); this.puff.update(dt); }
  fire(p, v, k = 1) {
    this.glow.spawn(p.x + rnd(0.4), p.y + rnd(0.2), p.z + rnd(0.4), v.x * 0.6 + rnd(1), v.y * 0.6 + 2 + Math.random() * 2, v.z * 0.6 + rnd(1),
      0.45 + Math.random() * 0.35, 0.9 * k, 2.4 * k, FIRE0, FIRE1, 0.9, -1.5, 1.2);
  }
  smoke(p, v, dark = false, k = 1) {
    this.puff.spawn(p.x + rnd(0.3), p.y, p.z + rnd(0.3), v.x * 0.5 + rnd(1), v.y * 0.5 + 1.5 + Math.random(), v.z * 0.5 + rnd(1),
      1.4 + Math.random() * 1.2, 1.0 * k, 5 * k, dark ? DARK0 : SMOKE0, dark ? DARK1 : SMOKE1, dark ? 0.75 : 0.45, -0.6, 0.9);
  }
  tireSmoke(p, v) {
    this.puff.spawn(p.x + rnd(0.3), p.y + 0.2, p.z + rnd(0.3), v.x * 0.35 + rnd(1.5), 0.8 + Math.random(), v.z * 0.35 + rnd(1.5),
      1.1 + Math.random() * 0.8, 1.2, 4.5, TIRE0, TIRE1, 0.35, -0.3, 1.4);
  }
  sparks(p, v, n = 8, spread = 6) {
    for (let k = 0; k < n; k++) {
      this.glow.spawn(p.x, p.y, p.z, v.x * 0.7 + rnd(spread), v.y * 0.3 + Math.random() * spread * 0.7, v.z * 0.7 + rnd(spread),
        0.25 + Math.random() * 0.35, 0.22, 0.08, SPARK0, SPARK1, 1, 14, 0.6);
    }
  }
  snow(p, v, n = 3) {
    for (let k = 0; k < n; k++) {
      this.puff.spawn(p.x + rnd(0.5), p.y + 0.1, p.z + rnd(0.5), v.x * 0.4 + rnd(2), 2 + Math.random() * 3, v.z * 0.4 + rnd(2),
        0.7 + Math.random() * 0.5, 0.7, 2.6, SNOW0, SNOW1, 0.8, 6, 1.5);
    }
  }
  explosion(p, v) {
    for (let k = 0; k < 40; k++) {
      this.glow.spawn(p.x + rnd(1), p.y + rnd(0.6), p.z + rnd(1), v.x * 0.4 + rnd(9), v.y * 0.3 + Math.random() * 9, v.z * 0.4 + rnd(9),
        0.5 + Math.random() * 0.6, 2.2, 5.5, FIRE0, FIRE1, 1, -1, 2.5);
    }
    for (let k = 0; k < 26; k++) this.smoke(p, { x: v.x * 0.3 + rnd(6), y: 4, z: v.z * 0.3 + rnd(6) }, true, 1.8);
    this.sparks(p, v, 40, 14);
  }
}

// Spår på vägen (blå ljusspår, sladdmärken). Varje bil har två spår (bakhjulen).
export class Trails {
  constructor(scene, { color, width, life, alpha, step, maxPts }) {
    this.cfg = { width, life, alpha, step, maxPts };
    this.list = new Map(); // nyckel → { pts: [{x,y,z,nx,ny,nz,t,brk}] }
    this.capacity = 30000;
    const g = new THREE.BufferGeometry();
    this.posA = new Float32Array(this.capacity * 2 * 3);
    this.colA = new Float32Array(this.capacity * 2 * 4);
    this.idx = new Uint32Array(this.capacity * 6);
    this.aPos = new THREE.BufferAttribute(this.posA, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.colA, 4).setUsage(THREE.DynamicDrawUsage);
    this.aIdx = new THREE.BufferAttribute(this.idx, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('color', this.aCol); g.setIndex(this.aIdx);
    this.geo = g;
    this.col = new THREE.Color(color);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, toneMapped: false });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
  }
  // p = kontaktpunkt (THREE.Vector3), n = normal, on = rita (mark + villkor)
  feed(key, p, n, on, now) {
    let tr = this.list.get(key);
    if (!tr) { tr = { pts: [], lastOn: false }; this.list.set(key, tr); }
    if (!on) { tr.lastOn = false; return; }
    const pt = { x: p.x + n.x * 0.03, y: p.y + n.y * 0.03, z: p.z + n.z * 0.03, nx: n.x, ny: n.y, nz: n.z, t: now, brk: false };
    if (!tr.lastOn) {
      // nytt spår: fast startpunkt + en spets som följer hjulet
      tr.pts.push({ ...pt, brk: true }, pt);
      tr.lastOn = true;
      return;
    }
    const tip = tr.pts[tr.pts.length - 1], fixed = tr.pts[tr.pts.length - 2];
    Object.assign(tip, pt);
    if (!fixed || Math.hypot(tip.x - fixed.x, tip.y - fixed.y, tip.z - fixed.z) >= this.cfg.step) tr.pts.push({ ...pt });
    if (tr.pts.length > this.cfg.maxPts) tr.pts.shift();
  }
  remove(key) { this.list.delete(key); }
  clear() { this.list.clear(); }
  update(now) {
    const { width, life, alpha } = this.cfg;
    let v = 0, ii = 0;
    const P = this.posA, Cc = this.colA, I = this.idx, col = this.col;
    for (const tr of this.list.values()) {
      while (tr.pts.length && now - tr.pts[0].t > life) tr.pts.shift();
      const pts = tr.pts;
      for (let k = 0; k < pts.length; k++) {
        if (v >= this.capacity - 2) break;
        const p = pts[k];
        const q = pts[Math.min(pts.length - 1, k + 1)], o = pts[Math.max(0, k - 1)];
        let dx = q.x - o.x, dy = q.y - o.y, dz = q.z - o.z;
        const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
        // sidled = n × riktning
        let sx = p.ny * dz - p.nz * dy, sy = p.nz * dx - p.nx * dz, sz = p.nx * dy - p.ny * dx;
        const sl = Math.hypot(sx, sy, sz) || 1; sx *= width / sl; sy *= width / sl; sz *= width / sl;
        const a = Math.max(0, 1 - (now - p.t) / life);
        const al = alpha * a * a;
        P[v * 3] = p.x - sx; P[v * 3 + 1] = p.y - sy; P[v * 3 + 2] = p.z - sz;
        P[v * 3 + 3] = p.x + sx; P[v * 3 + 4] = p.y + sy; P[v * 3 + 5] = p.z + sz;
        for (let j = 0; j < 2; j++) { Cc[(v + j) * 4] = col.r; Cc[(v + j) * 4 + 1] = col.g; Cc[(v + j) * 4 + 2] = col.b; Cc[(v + j) * 4 + 3] = al; }
        if (k > 0 && !p.brk) {
          const a0 = v - 2, b0 = v - 1, c0 = v, d0 = v + 1;
          I[ii++] = a0; I[ii++] = b0; I[ii++] = c0; I[ii++] = b0; I[ii++] = d0; I[ii++] = c0;
        }
        v += 2;
      }
    }
    this.geo.setDrawRange(0, ii);
    // ladda bara upp den använda delen av buffertarna
    for (const [att, n] of [[this.aPos, v * 3], [this.aCol, v * 4], [this.aIdx, ii]]) {
      if (att.clearUpdateRanges) { att.clearUpdateRanges(); att.addUpdateRange(0, Math.max(1, n)); }
      att.needsUpdate = true;
    }
  }
}
