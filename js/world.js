// Världen: vägbana, murar (rosa betong + blå kurvväggar med stängsel), snöterräng,
// granar, berg i diset, startportal, kurvskyltar. Grafik alltid — kolliders bara när
// det finns en fysikvärld (värden).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONF } from './config.js?v=16';
import { F_GAP, F_BRIDGE, F_TUNNEL, F_RAMP, F_LAND, JUMP } from './track.js?v=16';

const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const h2 = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
const hash1 = (n) => h2(n, n * 0.37 + 11.3);
function vnoise(x, z) {
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = h2(i, j), b = h2(i + 1, j), c = h2(i, j + 1), d = h2(i + 1, j + 1);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}
function fbm(x, z, oct = 4) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let k = 0; k < oct; k++) { s += a * vnoise(x * f, z * f); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}

export const GROUP_WORLD = (0x0002 << 16) | 0xffff;

function canvasTex(w, h, draw, srgb = true) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// ---------- Vägen ----------
// Band mellan två sidoavstånd längs hela slingan (u tvärs, v längs)
function stripGeo(T, latA, latB, yOff, vScale, from = 0, to = T.N) {
  const n = to - from + 1;
  const pos = new Float32Array(n * 2 * 3), uv = new Float32Array(n * 2 * 2), idx = [];
  for (let k = 0; k < n; k++) {
    const i = (from + k) % T.N;
    for (let sd = 0; sd < 2; sd++) {
      const l = sd ? latB : latA, o = k * 2 + sd;
      pos[o * 3] = T.px[i] + T.rx[i] * l + T.ux[i] * yOff;
      pos[o * 3 + 1] = T.py[i] + T.ry[i] * l + T.uy[i] * yOff;
      pos[o * 3 + 2] = T.pz[i] + T.rz[i] * l + T.uz[i] * yOff;
      uv[o * 2] = sd; uv[o * 2 + 1] = (from + k) * T.ds / vScale;
    }
    if (k < n - 1) { const a = k * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, b, c, b, d, c); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Sammanhängande bitar [från, till] där segmentet k→k+1 är ok (glipor i hoppen bryter vägen)
function segRuns(T, okSeg) {
  const N = T.N, runs = [];
  let start = -1;
  for (let k = 0; k < N; k++) if (!okSeg(k)) { start = k; break; }
  if (start < 0) return [[0, N]];
  let a = -1;
  for (let n = 1; n <= N; n++) {
    const k = (start + n) % N;
    if (okSeg(k)) { if (a < 0) a = start + n; } else if (a >= 0) { runs.push([a, start + n]); a = -1; }
  }
  if (a >= 0) runs.push([a, start + N]);
  return runs;
}
const noGap = (T) => (k) => !(T.flags[k % T.N] & F_GAP) && !(T.flags[(k + 1) % T.N] & F_GAP);

// Profil med absoluta sidoavstånd [lat, h] längs en lista sample-index (tunnlar, brodäck)
function extrudeAbs(T, list, profile, uScale, closed = false) {
  const P = profile.length, M = list.length;
  const pos = new Float32Array(M * P * 3), uv = new Float32Array(M * P * 2), idx = [];
  let acc = 0; const vAcc = [0];
  for (let p = 1; p < P; p++) { acc += Math.hypot(profile[p][0] - profile[p - 1][0], profile[p][1] - profile[p - 1][1]); vAcc.push(acc); }
  for (let m = 0; m < M; m++) {
    const i = list[m] % T.N;
    for (let p = 0; p < P; p++) {
      const [lat, h] = profile[p], o = m * P + p;
      pos[o * 3] = T.px[i] + T.rx[i] * lat + T.ux[i] * h;
      pos[o * 3 + 1] = T.py[i] + T.ry[i] * lat + T.uy[i] * h;
      pos[o * 3 + 2] = T.pz[i] + T.rz[i] * lat + T.uz[i] * h;
      uv[o * 2] = m * T.ds / uScale; uv[o * 2 + 1] = vAcc[p] / (closed ? acc : 4);
    }
    if (m < M - 1) for (let p = 0; p < P - 1; p++) {
      const a = m * P + p, b = a + 1, c = a + P, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// index-lista för en s-sträcka (med marginal i sample)
function idxRange(T, s0, s1, pad = 0) {
  const a = Math.round(T.wrapS(s0) / T.ds) - pad;
  let b = Math.round(T.wrapS(s1) / T.ds) + pad;
  if (b < a) b += T.N;
  const out = [];
  for (let k = a; k <= b; k++) out.push(((k % T.N) + T.N) % T.N);
  return out;
}

function asphaltTex() {
  return canvasTex(512, 512, (c, w, h) => {
    const img = c.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = (Math.random() - 0.5) * 16 + fbm(x / 40, y / 40, 3) * 7;
      const o = (y * w + x) * 4;
      img.data[o] = 60 + n; img.data[o + 1] = 47 + n; img.data[o + 2] = 66 + n; img.data[o + 3] = 255;
    }
    c.putImageData(img, 0, 0);
  });
}

function buildRoad(ctx) {
  const { scene, track: T } = ctx;
  const HW = T.halfW, W2 = CONF.ROAD_W / 2;
  const tex = asphaltTex();
  tex.wrapS = THREE.ClampToEdgeWrapping; tex.wrapT = THREE.RepeatWrapping;
  const runs = segRuns(T, noGap(T));
  const roadMat = new THREE.MeshLambertMaterial({ map: tex });
  const roadGeos = runs.map(([a, b]) => stripGeo(T, -HW, HW, 0, HW * 2, a, b));
  for (const g of roadGeos) {
    const road = new THREE.Mesh(g, roadMat);
    road.receiveShadow = true;
    scene.add(road);
  }

  // Kantlinjer
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xf4eef2, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  for (const sgn of [-1, 1]) {
    const a = sgn * (W2 - 0.18), b = sgn * (W2 - 0.52);
    for (const [ra, rb] of runs) scene.add(new THREE.Mesh(stripGeo(T, Math.min(a, b), Math.max(a, b), 0.015, 10, ra, rb), lineMat));
  }

  // Start-/mållinje (rutig) tvärs banan
  const checker = canvasTex(256, 32, (c) => {
    for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) { c.fillStyle = (x + y) % 2 ? '#f2f2f2' : '#141414'; c.fillRect(x * 16, y * 16, 16, 16); }
  });
  const sl = new THREE.Mesh(planeOnRoad(T, -1.6, 1.6, -W2, W2, 0.025), new THREE.MeshLambertMaterial({ map: checker, polygonOffset: true, polygonOffsetFactor: -3 }));
  scene.add(sl);

  // Startrutor bakom linjen
  const slotMat = new THREE.MeshBasicMaterial({ color: 0xf4eef2, polygonOffset: true, polygonOffsetFactor: -2 });
  const slotGeos = [];
  for (const g of gridSlots(T)) {
    slotGeos.push(planeOnRoad(T, g.s + 2.6, g.s + 2.9, g.lat - 2.2, g.lat + 2.2, 0.02));
    for (const e of [-2.2, 2.05]) slotGeos.push(planeOnRoad(T, g.s - 2.6, g.s + 2.9, g.lat + e, g.lat + e + 0.15, 0.02));
  }
  scene.add(new THREE.Mesh(mergeGeometries(slotGeos), slotMat));

  // Fysik: vägbanan som trianglar
  if (ctx.world) {
    for (const g of roadGeos) {
      const p = g.attributes.position.array, ix = g.index.array;
      const cd = ctx.RAPIER.ColliderDesc.trimesh(new Float32Array(p), new Uint32Array(ix))
        .setFriction(0.6).setRestitution(0.1).setCollisionGroups(GROUP_WORLD);
      ctx.world.createCollider(cd, ctx.fixedBody);
    }
  }
}

// Liten rektangel på vägbanan mellan s0..s1 och lat0..lat1
function planeOnRoad(T, s0, s1, l0, l1, yOff) {
  const pts = [];
  const f = {};
  for (const [s, l] of [[s0, l0], [s0, l1], [s1, l0], [s1, l1]]) {
    T.sampleAt(s, f);
    pts.push(f.x + f.rx * l + f.ux * yOff, f.y + f.ry * l + f.uy * yOff, f.z + f.rz * l + f.uz * yOff);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), 2));
  g.setIndex([0, 1, 2, 1, 3, 2]);
  g.computeVertexNormals();
  return g;
}

// Startrutorna: 4 i bredd, rader bakåt från linjen
export function gridSlots(T, count = 24) {
  const out = [];
  const lanes = [-10.5, -3.5, 3.5, 10.5];
  for (let k = 0; k < count; k++) {
    const row = Math.floor(k / 4), col = k % 4;
    out.push({ s: T.wrapS(-12 - row * 10 - (col % 2) * 3), lat: lanes[col] });
  }
  return out;
}

// ---------- Murar ----------
const CONCRETE = [[0, 0], [0.08, 0.28], [0.24, 0.86], [0.3, 1.1], [0.62, 1.1], [0.68, 0.86], [0.84, 0.28], [0.92, 0]];
const SAFER = [[0, -0.05], [0, 1.95], [0.45, 1.95], [0.45, -0.05]];

function extrude(T, list, side, profile, base, uScale) {
  const P = profile.length, M = list.length;
  const pos = new Float32Array(M * P * 3), uv = new Float32Array(M * P * 2), idx = [];
  const hMax = Math.max(...profile.map(p => p[1]));
  for (let m = 0; m < M; m++) {
    const i = list[m];
    for (let p = 0; p < P; p++) {
      const lat = side * (base + profile[p][0]), h = profile[p][1], o = m * P + p;
      pos[o * 3] = T.px[i] + T.rx[i] * lat + T.ux[i] * h;
      pos[o * 3 + 1] = T.py[i] + T.ry[i] * lat + T.uy[i] * h;
      pos[o * 3 + 2] = T.pz[i] + T.rz[i] * lat + T.uz[i] * h;
      uv[o * 2] = m * T.ds / uScale; uv[o * 2 + 1] = h / hMax;
    }
    if (m < M - 1) for (let p = 0; p < P - 1; p++) {
      const a = m * P + p, b = a + 1, c = a + P, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function chevronTex() {
  const t = canvasTex(256, 128, (c, w, h) => {
    c.fillStyle = '#123b86'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#0d2c66'; c.fillRect(0, 0, w, 10); c.fillRect(0, h - 14, w, 14);
    c.fillStyle = '#f4f6ff';
    for (let x = 0; x < w; x += 64) {
      c.beginPath();
      c.moveTo(x + 14, 26); c.lineTo(x + 30, 26); c.lineTo(x + 50, 64); c.lineTo(x + 30, 102); c.lineTo(x + 14, 102); c.lineTo(x + 34, 64);
      c.closePath(); c.fill();
    }
  });
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function fenceTex() {
  const t = canvasTex(128, 128, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.strokeStyle = 'rgba(70,74,88,0.95)'; c.lineWidth = 2.2;
    for (let k = -h; k < w + h; k += 16) {
      c.beginPath(); c.moveTo(k, 0); c.lineTo(k + h, h); c.stroke();
      c.beginPath(); c.moveTo(k + h, 0); c.lineTo(k, h); c.stroke();
    }
    c.fillStyle = 'rgba(60,64,78,1)'; c.fillRect(0, 0, w, 5);
  });
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

// räcke på broar: låg betongkant + två blå stålbalkar på stolpar
const BRIDGE_CURB = [[0, -0.05], [0, 0.55], [0.4, 0.55], [0.4, -0.05]];
function buildBarriers(ctx) {
  const { scene, track: T } = ctx;
  const N = T.N, base = T.halfW;
  const concMat = new THREE.MeshLambertMaterial({ color: 0xe2c3c8, flatShading: true, side: THREE.DoubleSide });
  const saferMat = new THREE.MeshLambertMaterial({ map: chevronTex(), side: THREE.DoubleSide });
  const fenceMat = new THREE.MeshLambertMaterial({ map: fenceTex(), transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, depthWrite: false });
  const railMat = new THREE.MeshLambertMaterial({ color: 0x2c5fd6, side: THREE.DoubleSide });
  const postGeo = new THREE.CylinderGeometry(0.07, 0.07, 3.2, 5);
  const posts = [], railPosts = [];
  // typ per sample: -1 ingen mur (glipa), 0 betong, 1 blå kurvvägg, 2 broräcke, 3 betong + högt fångstängsel (hopp)
  const types = { '-1': new Int8Array(N), '1': new Int8Array(N) };

  for (const side of [-1, 1]) {
    const raw = new Uint8Array(N);
    for (let i = 0; i < N; i++) raw[i] = side * T.k[i] < -1 / 1300 ? 1 : 0;
    const typ = types[side];
    for (let i = 0; i < N; i++) {
      const f = T.flags[i];
      if (f & F_GAP) { typ[i] = -1; continue; }
      if (f & F_BRIDGE) { typ[i] = 2; continue; }
      if (f & F_LAND) { typ[i] = 3; continue; }
      let v = 0;
      if (!(f & F_TUNNEL)) for (let o = -12; o <= 12 && !v; o += 3) v = raw[(i + o + N) % N];
      typ[i] = v;
    }
    let start = 0;
    while (start < N && typ[start] === typ[(start - 1 + N) % N]) start++;
    if (start >= N) start = 0;
    let run = [start];
    const flush = () => {
      if (run.length < 2) return;
      const t = typ[run[0]];
      if (t < 0) return;
      if (t === 2) {
        const m = new THREE.Mesh(extrude(T, run, side, BRIDGE_CURB, base, 6), concMat);
        m.castShadow = true; scene.add(m);
        for (const h of [0.82, 1.18, 3.45]) scene.add(new THREE.Mesh(extrude(T, run, side, [[0.08, h - 0.09], [0.08, h + 0.09], [0.3, h + 0.09], [0.3, h - 0.09], [0.08, h - 0.09]], base, 6), railMat));
        // högt stängsel: på en bro får ingen flyga över kanten
        scene.add(new THREE.Mesh(extrude(T, run, side, [[0.2, 1.3], [0.2, 3.4]], base, 4.5), fenceMat));
        for (let k = 0; k < run.length; k++) railPosts.push([run[k], side, 3.4]);
        return;
      }
      if (t === 3) {
        const m = new THREE.Mesh(extrude(T, run, side, CONCRETE, base, 6), concMat);
        m.castShadow = true; scene.add(m);
        scene.add(new THREE.Mesh(extrude(T, run, side, [[0.45, 1.0], [0.45, 7.0]], base, 4.5), fenceMat));
        scene.add(new THREE.Mesh(extrude(T, run, side, [[0.4, 6.9], [0.4, 7.2], [0.55, 7.2], [0.55, 6.9], [0.4, 6.9]], base, 6), railMat));
        for (let k = 0; k < run.length; k += 2) railPosts.push([run[k], side, 7.2]);
        return;
      }
      const g = extrude(T, run, side, t ? SAFER : CONCRETE, base, t ? 4.2 : 6);
      const m = new THREE.Mesh(g, t ? saferMat : concMat);
      m.castShadow = true; m.receiveShadow = true;
      scene.add(m);
      if (t) {
        scene.add(new THREE.Mesh(extrude(T, run, side, [[0.25, 1.95], [0.25, 4.9]], base, 4.5), fenceMat));
        for (let k = 0; k < run.length; k += 3) posts.push([run[k], side]);
      }
    };
    for (let n = 1; n <= N; n++) {
      const j = (start + n) % N;
      if (typ[j] !== typ[run[0]]) { run.push(j); flush(); run = [j]; } else run.push(j);
      if (n === N) flush();
    }
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  // stängselstolpar
  const postInst = new THREE.InstancedMesh(postGeo, new THREE.MeshLambertMaterial({ color: 0x51566a }), Math.max(1, posts.length));
  postInst.count = posts.length;
  posts.forEach(([i, side], k) => {
    const lat = side * (base + 0.3);
    v.set(T.px[i] + T.rx[i] * lat, T.py[i] + T.ry[i] * lat + 3.4, T.pz[i] + T.rz[i] * lat);
    m4.compose(v, q, one);
    postInst.setMatrixAt(k, m4);
  });
  scene.add(postInst);
  // räckesstolpar på broarna
  if (railPosts.length) {
    const rp = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 1, 0.16), railMat, railPosts.length);
    const sc = new THREE.Vector3();
    railPosts.forEach(([i, side, h], k) => {
      const lat = side * (base + 0.3);
      v.set(T.px[i] + T.rx[i] * lat, T.py[i] + T.ry[i] * lat + h / 2, T.pz[i] + T.rz[i] * lat);
      m4.compose(v, q, sc.set(1, h, 1));
      rp.setMatrixAt(k, m4);
    });
    scene.add(rp);
  }

  // Fysik: lådor var 8:e meter, orienterade efter banan (inga i glipan)
  if (ctx.world) {
    const R = new THREE.Vector3(), U = new THREE.Vector3(), B = new THREE.Vector3(), M = new THREE.Matrix4(), Q = new THREE.Quaternion();
    for (let i = 0; i < N; i += 2) {
      for (const side of [-1, 1]) {
        const t = types[side][i];
        if (t < 0) continue;
        // fysiken är högre än betongen (osynlig vägg ovanför) — annars glider en bil som lyft lite rakt över;
        // det blå stängslet i kurvorna är solitt ända upp, och i tunnlarna går väggen upp till taket
        const h = (T.flags[i] & F_TUNNEL) ? 9.5 : t === 1 ? 5.0 : t === 2 ? 3.8 : t === 3 ? 7.4 : 4.0, th = 0.8;
        const lat = side * (base + th);
        R.set(T.rx[i], T.ry[i], T.rz[i]); U.set(T.ux[i], T.uy[i], T.uz[i]); B.set(-T.fx[i], -T.fy[i], -T.fz[i]);
        M.makeBasis(R, U, B); Q.setFromRotationMatrix(M);
        const cx = T.px[i] + R.x * lat + U.x * h / 2, cy = T.py[i] + R.y * lat + U.y * h / 2, cz = T.pz[i] + R.z * lat + U.z * h / 2;
        const cd = ctx.RAPIER.ColliderDesc.cuboid(th, h / 2, T.ds + 0.35)
          .setTranslation(cx, cy, cz).setRotation({ x: Q.x, y: Q.y, z: Q.z, w: Q.w })
          .setFriction(0.04).setRestitution(0.45).setCollisionGroups(GROUP_WORLD);
        ctx.world.createCollider(cd, ctx.fixedBody);
      }
    }
  }
  return types;
}

// ---------- Terräng ----------
function natural(x, z, D) {
  let h = 10 * fbm(x * 0.0012 + 3.1, z * 0.0012 - 1.7, 4) + 3 * fbm(x * 0.006, z * 0.006, 2);
  const m = Math.max(0, D - 150);
  h += m * 0.15 * (0.75 + 0.5 * fbm(x * 0.0021 + 9.1, z * 0.0021 + 2.3, 3)) + (m * 0.01) ** 2 * 2.2;
  return h;
}

function buildTerrain(ctx) {
  const { scene, track: T } = ctx;
  const { minX, maxX, minZ, maxZ } = T.bounds;
  const MARGIN = 1100, CELL = 10;
  const x0 = minX - MARGIN, z0 = minZ - MARGIN;
  const nx = Math.ceil((maxX - minX + 2 * MARGIN) / CELL) + 1;
  const nz = Math.ceil((maxZ - minZ + 2 * MARGIN) / CELL) + 1;
  const NV = nx * nz;
  const H = new Float32Array(NV), Dist = new Float32Array(NV);
  const N = T.N, px = T.px, pz = T.pz;

  // Grovt rutnät med global närmaste-sökning, sedan lokal förfining per punkt
  const CN = 4;
  const cnx = Math.ceil(nx / CN) + 1, cnz = Math.ceil(nz / CN) + 1;
  const cIdx = new Int32Array(cnx * cnz);
  for (let b = 0; b < cnz; b++) for (let a = 0; a < cnx; a++) {
    const x = x0 + a * CN * CELL, z = z0 + b * CN * CELL;
    let best = 0, bd = Infinity;
    for (let i = 0; i < N; i += 4) { const d = (px[i] - x) ** 2 + (pz[i] - z) ** 2; if (d < bd) { bd = d; best = i; } }
    cIdx[b * cnx + a] = best;
  }
  const HWb = T.halfW, FL = T.flags;
  const VM = new Float32Array(NV);            // dal-mask (inga träd på isen)
  const hole = new Uint8Array(NV);            // tunnelns hål i berget
  const feats = T.features;
  // sample som inte är bro, nära broarna — marken under en bro följer dem i stället
  const nb = [];
  const bridges = feats.filter(f => f.type === 'valley' || f.type === 'overpass');
  for (let j = 0; j < N; j++) {
    if (FL[j] & F_BRIDGE) continue;
    if (bridges.some(f => (px[j] - f.x) ** 2 + (pz[j] - f.z) ** 2 < 800 * 800)) nb.push(j);
  }
  // vägens höjd vid (x,z) från sample i — även lutningen LÄNGS vägen (annars sticker marken
  // upp genom vägen där den lutar, t.ex. i slutet av en bro eller i hoppens landning)
  const roadAt = (i, x, z) => {
    const dx = x - px[i], dz = z - pz[i];
    const lat = dx * (-T.hz[i]) + dz * T.hx[i];
    const along = Math.max(-40, Math.min(40, dx * T.hx[i] + dz * T.hz[i]));
    const latC = Math.max(-HWb - 1, Math.min(HWb + 1, lat));
    const g = T.fy[i] / Math.max(0.5, Math.hypot(T.fx[i], T.fz[i]));
    return { lat, al: Math.abs(lat), y: T.py[i] + latC * T.slope[i] + along * g };
  };
  for (let iz = 0; iz < nz; iz++) {
    const b = Math.floor(iz / CN);
    for (let ix = 0; ix < nx; ix++) {
      const a = Math.floor(ix / CN);
      const x = x0 + ix * CELL, z = z0 + iz * CELL;
      let best = 0, bd = Infinity;
      for (const ci of [cIdx[b * cnx + a], cIdx[b * cnx + a + 1], cIdx[(b + 1) * cnx + a], cIdx[(b + 1) * cnx + a + 1]]) {
        for (let o = -16; o <= 16; o++) {
          const i = (ci + o + N) % N;
          const d = (px[i] - x) ** 2 + (pz[i] - z) ** 2;
          if (d < bd) { bd = d; best = i; }
        }
      }
      const iA = best, fA = FL[iA], dA = Math.sqrt(bd);
      // marken under en bro: närmaste väg som INTE är bro
      let iB = iA, dB = dA;
      if (fA & F_BRIDGE) {
        let bb = Infinity;
        for (const j of nb) { const d = (px[j] - x) ** 2 + (pz[j] - z) ** 2; if (d < bb) { bb = d; iB = j; } }
        dB = Math.sqrt(bb);
      }
      const rB = roadAt(iB, x, z);
      let y;
      if (rB.al < HWb + 3.5 && dB < HWb + 6) y = rB.y - 0.6;
      else {
        const t = smoothstep(HWb + 4, HWb + 170, dB);
        const bankUp = Math.min(1.4, Math.max(0, (dB - HWb - 3.5) * 0.1));
        y = (rB.y - 0.4 + bankUp) * (1 - t) + natural(x, z, dB) * t;
      }
      const o = iz * nx + ix;
      const rA = fA ? roadAt(iA, x, z) : rB;
      // under ett brodäck: marken alltid under däcket
      if (fA & F_BRIDGE && rA.al < HWb + 10) y = Math.min(y, rA.y - 2.8 - Math.max(0, rA.al - HWb) * 0.3);
      const sA = iA * T.ds;
      for (const f of feats) {
        if (f.type === 'valley') {
          // dal med platt botten tvärs under bron
          const dx = x - f.x, dz = z - f.z;
          const across = dx * f.tx + dz * f.tz, along = -dx * f.tz + dz * f.tx, W = f.len / 2;
          const m = (1 - smoothstep(W * 0.35, W, Math.abs(across))) * (1 - smoothstep(f.lv * 0.75, f.lv, Math.abs(along)));
          if (m > 0) { y += (Math.min(y, f.floorY) - y) * m; VM[o] = Math.max(VM[o], m); }
        } else if (f.type === 'jump') {
          // ravin under glipan (ramperna på var sida svävar på betongfundament)
          const d = T.sdist(sA, f.lip);
          if (d > -30 && d < JUMP.GAP + 30) {
            const cm = (1 - smoothstep(HWb + 3, HWb + 16, rA.al)) * (1 - smoothstep(JUMP.GAP / 2 + 14, JUMP.GAP / 2 + 26, Math.abs(d - JUMP.GAP / 2)));
            if (cm > 0) y += (Math.min(y, rA.y - 16) - y) * cm;
          }
        } else if (f.type === 'tunnel') {
          const in0 = T.sdist(sA, f.s0), in1 = T.sdist(f.s1, sA);
          if (fA & F_TUNNEL) {
            // berget över tunneln, hål där vägen går
            const u = Math.max(0, Math.min(in0, in1));
            const Hm = Math.min(52, 15 + u * 0.45) + Math.max(0, rA.al - HWb) * 0.3;
            const wt = 1 - smoothstep(110, 240, rA.al);
            y = Math.max(y, y * (1 - wt) + (rA.y + Hm) * wt);
            if (rA.al < HWb + 1.9) hole[o] = 1;
          } else {
            // skärning i berget fram till tunnelmynningen
            const dp = in0 < 0 && in0 > -110 ? -in0 : (in1 < 0 && in1 > -110 ? -in1 : -1);
            if (dp >= 0 && rA.al > HWb + 2.5) {
              const fade = 1 - dp / 110;
              y = Math.max(y, rA.y + Math.min(40, (rA.al - HWb - 2.5) * 1.1) * fade);
            }
          }
        }
      }
      H[o] = y; Dist[o] = dA;
    }
  }

  const pos = new Float32Array(NV * 3);
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
    const o = iz * nx + ix;
    pos[o * 3] = x0 + ix * CELL; pos[o * 3 + 1] = H[o]; pos[o * 3 + 2] = z0 + iz * CELL;
  }
  const idxAll = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let k = 0;
  for (let iz = 0; iz < nz - 1; iz++) for (let ix = 0; ix < nx - 1; ix++) {
    const a = iz * nx + ix, b = a + 1, c = a + nx, d = c + 1;
    if (hole[a] || hole[b] || hole[c] || hole[d]) continue;     // tunnelns hål
    idxAll[k++] = a; idxAll[k++] = c; idxAll[k++] = b;
    idxAll[k++] = b; idxAll[k++] = c; idxAll[k++] = d;
  }
  const idx = idxAll.slice(0, k);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  // Färg: snö, lite rosa sten i branterna
  const nor = g.attributes.normal.array;
  const col = new Float32Array(NV * 3);
  const snow = new THREE.Color(0xf7eef3), snow2 = new THREE.Color(0xeedde6), rock = new THREE.Color(0xb39aa6), c = new THREE.Color();
  for (let o = 0; o < NV; o++) {
    const ny = nor[o * 3 + 1];
    const x = pos[o * 3], z = pos[o * 3 + 2];
    c.copy(snow).lerp(snow2, 0.5 + 0.5 * fbm(x * 0.01, z * 0.01, 2));
    c.lerp(rock, smoothstep(0.86, 0.62, ny));
    col[o * 3] = c.r; col[o * 3 + 1] = c.g; col[o * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  mesh.receiveShadow = true;
  scene.add(mesh);

  if (ctx.world) {
    const cd = ctx.RAPIER.ColliderDesc.trimesh(pos, idx).setFriction(0.5).setRestitution(0.05).setCollisionGroups(GROUP_WORLD);
    ctx.world.createCollider(cd, ctx.fixedBody);
  }

  const heightAt = (x, z) => {
    const fx = (x - x0) / CELL, fz = (z - z0) / CELL;
    const ix = Math.max(0, Math.min(nx - 2, Math.floor(fx))), iz = Math.max(0, Math.min(nz - 2, Math.floor(fz)));
    const tx = Math.min(1, Math.max(0, fx - ix)), tz = Math.min(1, Math.max(0, fz - iz));
    const a = H[iz * nx + ix], b = H[iz * nx + ix + 1], cc = H[(iz + 1) * nx + ix], d = H[(iz + 1) * nx + ix + 1];
    // samma triangulering som meshen
    if (tx + tz <= 1) return a + (b - a) * tx + (cc - a) * tz;
    return d + (cc - d) * (1 - tx) + (b - d) * (1 - tz);
  };
  const distAt = (x, z) => {
    const ix = Math.max(0, Math.min(nx - 1, Math.round((x - x0) / CELL))), iz = Math.max(0, Math.min(nz - 1, Math.round((z - z0) / CELL)));
    return Dist[iz * nx + ix];
  };
  const valleyAt = (x, z) => {
    const ix = Math.max(0, Math.min(nx - 1, Math.round((x - x0) / CELL))), iz = Math.max(0, Math.min(nz - 1, Math.round((z - z0) / CELL)));
    return VM[iz * nx + ix];
  };
  return { heightAt, distAt, valleyAt, x0, z0, x1: x0 + (nx - 1) * CELL, z1: z0 + (nz - 1) * CELL };
}

// ---------- Granar ----------
function pineGeo(snowy) {
  const parts = [];
  const colored = (geo, hex) => {
    const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
    geo.deleteAttribute('uv');
    return geo;
  };
  parts.push(colored(new THREE.CylinderGeometry(0.32, 0.55, 7, 6).translate(0, 3.5, 0), 0x3a2622));
  const green = 0x2b4532, snow = snowy ? 0xf2dce6 : 0x33553d;
  for (let t = 0; t < 4; t++) {
    const r = 3.3 - t * 0.72, h = 3.3 - t * 0.35, y = 3.2 + t * 2.15;
    parts.push(colored(new THREE.ConeGeometry(r, h, 7, 1).translate(0, y + h / 2, 0), green));
    parts.push(colored(new THREE.ConeGeometry(r * 0.9, h * 0.84, 7, 1).translate(0, y + h * 0.58, 0), snow));
  }
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  return g;
}

function buildTrees(ctx, terr) {
  const { scene, track: T } = ctx;
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const geos = [pineGeo(true), pineGeo(false)];
  const CH = 600; // chunkstorlek för culling
  const chunks = new Map();
  const HWb = T.halfW;
  let seed = 1;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const W = terr.x1 - terr.x0, D = terr.z1 - terr.z0;
  let placed = 0;
  for (let n = 0; n < 60000 && placed < 5200; n++) {
    const x = terr.x0 + rnd() * W, z = terr.z0 + rnd() * D;
    const dist = terr.distAt(x, z);
    if (dist < HWb + 9) continue;
    if (terr.valleyAt(x, z) > 0.05) continue;
    if (dist > 1000) continue;
    // tätare nära vägen, glesare längre bort, i dungar
    const dens = fbm(x * 0.006 + 4.4, z * 0.006 - 2.2, 3) * 0.6 + 0.35 - Math.min(0.5, dist / 1600);
    if (rnd() > dens + (dist < 60 ? 0.35 : 0)) continue;
    // inte på startplattan
    if (Math.hypot(x, z) < 140 && dist < 60) continue;
    const y = terr.heightAt(x, z);
    const type = rnd() < 0.62 ? 0 : 1;
    const key = Math.floor(x / CH) + '|' + Math.floor(z / CH) + '|' + type;
    if (!chunks.has(key)) chunks.set(key, { type, list: [], cx: (Math.floor(x / CH) + 0.5) * CH, cz: (Math.floor(z / CH) + 0.5) * CH });
    chunks.get(key).list.push([x, y - 0.3, z, 0.85 + rnd() * 0.9, rnd() * 6.28]);
    placed++;
  }
  const out = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  for (const ch of chunks.values()) {
    const inst = new THREE.InstancedMesh(geos[ch.type], mat, ch.list.length);
    ch.list.forEach(([x, y, z, sc, r], k) => {
      q.setFromAxisAngle(UP, r);
      m4.compose(v.set(x, y, z), q, s.set(sc, sc * (0.9 + (r % 1) * 0.35), sc));
      inst.setMatrixAt(k, m4);
    });
    inst.computeBoundingSphere();
    inst.castShadow = true;
    scene.add(inst);
    out.push({ mesh: inst, cx: ch.cx, cz: ch.cz });
  }
  return out;
}

// Röda lövträd vid starten (som i förlagan)
function buildRedTrees(ctx, terr) {
  const parts = [];
  const blob = (r, x, y, z) => new THREE.IcosahedronGeometry(r, 0).translate(x, y, z);
  const trunk = new THREE.CylinderGeometry(0.4, 0.6, 6, 6).translate(0, 3, 0);
  const crown = mergeGeometries([blob(3.4, 0, 8, 0), blob(2.6, 2.4, 7, 1), blob(2.5, -2.2, 7.4, -1), blob(2.2, 0.5, 10, -1.5)]);
  const tm = new THREE.MeshLambertMaterial({ color: 0x4a2a24, flatShading: true });
  const cm = new THREE.MeshLambertMaterial({ color: 0xb8283a, flatShading: true });
  const T = ctx.track;
  const spots = [[-140, -38], [-90, -42], [-200, 40], [-60, 44], [60, -45], [150, -40], [120, 46], [-250, -45]];
  for (const [s, lat] of spots) {
    const f = T.sampleAt(T.wrapS(s));
    const x = f.x + f.rx * lat, z = f.z + f.rz * lat, y = terr.heightAt(x, z);
    const g = new THREE.Group();
    g.add(new THREE.Mesh(trunk, tm), new THREE.Mesh(crown, cm));
    g.position.set(x, y - 0.2, z);
    g.rotation.y = s;
    g.scale.setScalar(1.1);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    ctx.scene.add(g);
  }
  parts.length = 0;
}

// ---------- Berg i diset ----------
function buildMountains(ctx, terr) {
  const cx = (terr.x0 + terr.x1) / 2, cz = (terr.z0 + terr.z1) / 2;
  const R0 = Math.max(terr.x1 - terr.x0, terr.z1 - terr.z0) * 0.55;
  const geos = [];
  const snowC = new THREE.Color(0xf6e8ef), rockC = new THREE.Color(0xc2a7b3), lowC = new THREE.Color(0xd9c4cd);
  for (let k = 0; k < 44; k++) {
    const a = (k / 44) * Math.PI * 2 + hash1(k) * 0.12;
    const r = R0 + 300 + hash1(k + 50) * 1800;
    const height = 380 + hash1(k + 90) * 650, rad = 800 + hash1(k + 130) * 900;
    const g = new THREE.ConeGeometry(rad, height, 9, 4).toNonIndexed();
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y < height / 2 - 1) {
        const jx = p.getX(i), jz = p.getZ(i);
        const n = vnoise(jx * 0.004 + k * 3.1, jz * 0.004 + y * 0.003) * 0.22;
        p.setX(i, jx * (1 + n)); p.setZ(i, jz * (1 + n));
        p.setY(i, y + n * height * 0.25);
      }
    }
    const col = new Float32Array(p.count * 3), c = new THREE.Color();
    for (let i = 0; i < p.count; i += 3) {
      const ym = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
      const t = (ym + height / 2) / height;
      c.copy(t > 0.55 + hash1(i + k) * 0.12 ? snowC : (t < 0.2 ? lowC : rockC));
      for (let j = 0; j < 3; j++) { col[(i + j) * 3] = c.r; col[(i + j) * 3 + 1] = c.g; col[(i + j) * 3 + 2] = c.b; }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.deleteAttribute('uv');
    g.translate(cx + Math.cos(a) * r * 1.25, height / 2 - 60, cz + Math.sin(a) * r);
    geos.push(g);
  }
  const g = mergeGeometries(geos);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  m.frustumCulled = false;
  ctx.scene.add(m);
}

// ---------- Startportal ----------
function trussTex() {
  const t = canvasTex(64, 256, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.strokeStyle = '#16171d'; c.lineWidth = 7;
    c.strokeRect(3, -4, w - 6, h + 8);
    c.lineWidth = 4;
    for (let y = 0; y < h; y += 64) { c.beginPath(); c.moveTo(4, y); c.lineTo(w - 4, y + 32); c.lineTo(4, y + 64); c.stroke(); c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function logoCanvas(w = 1024, h = 300) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d');
  c.clearRect(0, 0, w, h);
  c.textAlign = 'center';
  c.lineJoin = 'round';
  // KNUFF — vitt på svart
  c.font = `italic 900 ${h * 0.36}px "Exo 2", system-ui, sans-serif`;
  const tw = c.measureText('KNUFF').width;
  c.fillStyle = '#05060a';
  c.beginPath(); c.moveTo(w / 2 - tw / 2 - 40, h * 0.04); c.lineTo(w / 2 + tw / 2 + 50, h * 0.04); c.lineTo(w / 2 + tw / 2 + 30, h * 0.42); c.lineTo(w / 2 - tw / 2 - 60, h * 0.42); c.closePath(); c.fill();
  c.fillStyle = '#ffffff';
  c.fillText('KNUFF', w / 2, h * 0.37);
  // RAKAN — blå gradient med svart kant
  c.font = `italic 900 ${h * 0.56}px "Exo 2", system-ui, sans-serif`;
  const g = c.createLinearGradient(0, h * 0.45, 0, h * 0.95);
  g.addColorStop(0, '#9fd8ff'); g.addColorStop(0.45, '#1e7bff'); g.addColorStop(1, '#0a2f9e');
  c.lineWidth = h * 0.06; c.strokeStyle = '#05060a';
  c.strokeText('RAKAN', w / 2, h * 0.92);
  c.lineWidth = h * 0.015; c.strokeStyle = '#d8f0ff';
  c.fillStyle = g;
  c.fillText('RAKAN', w / 2, h * 0.92);
  c.strokeText('RAKAN', w / 2, h * 0.92);
  return cv;
}

function buildGantry(ctx) {
  const { scene, track: T } = ctx;
  const f = T.sampleAt(0);
  const grp = new THREE.Group();
  const M = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(f.rx, f.ry, f.rz), new THREE.Vector3(f.ux, f.uy, f.uz), new THREE.Vector3(-f.fx, -f.fy, -f.fz));
  grp.quaternion.setFromRotationMatrix(M);
  grp.position.set(f.x, f.y, f.z);
  scene.add(grp);

  const span = T.halfW + 3;
  const tt = trussTex();
  const towerMat = new THREE.MeshLambertMaterial({ map: tt, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
  for (const sx of [-span, span]) {
    const tex = tt.clone(); tex.needsUpdate = true; tex.repeat.set(1, 3);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(1.6, 13, 1.6), new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide }));
    tower.position.set(sx, 6.5, 0);
    grp.add(tower);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.6, 2.4), new THREE.MeshLambertMaterial({ color: 0x24252c }));
    foot.position.set(sx, 0.3, 0);
    grp.add(foot);
  }
  const beamTex = tt.clone(); beamTex.needsUpdate = true; beamTex.rotation = Math.PI / 2; beamTex.repeat.set(1, 12);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(span * 2 + 1.6, 1.4, 1.4), new THREE.MeshLambertMaterial({ map: beamTex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide }));
  beam.position.set(0, 11.6, 0);
  grp.add(beam);
  // rutiga banderoller under balken
  const chk = canvasTex(512, 64, (c) => {
    for (let x = 0; x < 64; x++) for (let y = 0; y < 8; y++) { c.fillStyle = (x + y) % 2 ? '#ececf0' : '#26262c'; c.fillRect(x * 8, y * 8, 8, 8); }
  });
  for (const sx of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(span - 6, 3.2), new THREE.MeshLambertMaterial({ map: chk, side: THREE.DoubleSide }));
    b.position.set(sx * (span / 2 + 3), 9.6, 0.1);
    grp.add(b);
  }
  // loggan
  const logo = new THREE.CanvasTexture(logoCanvas());
  logo.colorSpace = THREE.SRGBColorSpace;
  // loggan läsbar från båda hållen (två plan rygg mot rygg)
  const lm = new THREE.MeshBasicMaterial({ map: logo, transparent: true, toneMapped: false, fog: false });
  for (const back of [false, true]) {
    const lg = new THREE.Mesh(new THREE.PlaneGeometry(20, 5.9), lm);
    lg.position.set(0, 12.6, back ? -0.8 : 0.8);
    if (back) lg.rotation.y = Math.PI;
    grp.add(lg);
  }
  // startljus
  const lights = [];
  for (let k = 0; k < 5; k++) {
    const mm = new THREE.MeshBasicMaterial({ color: 0x330808, toneMapped: false });
    const l = new THREE.Mesh(new THREE.CircleGeometry(0.5, 16), mm);
    l.position.set((k - 2) * 1.3, 10.3, 0.75); // lokal +z = mot bilarna bakom linjen
    grp.add(l);
    lights.push(mm);
  }
  // stolparna är fysiska
  if (ctx.world) {
    for (const sx of [-span, span]) {
      const p = new THREE.Vector3(sx, 6.5, 0).applyMatrix4(new THREE.Matrix4().compose(grp.position, grp.quaternion, new THREE.Vector3(1, 1, 1)));
      ctx.world.createCollider(ctx.RAPIER.ColliderDesc.cuboid(0.8, 6.5, 0.8).setTranslation(p.x, p.y, p.z)
        .setRotation({ x: grp.quaternion.x, y: grp.quaternion.y, z: grp.quaternion.z, w: grp.quaternion.w }).setCollisionGroups(GROUP_WORLD), ctx.fixedBody);
    }
  }
  return {
    setLights(n, green) {
      lights.forEach((m, k) => m.color.setHex(green ? 0x2bff5a : (k < n ? 0xff2a1a : 0x330808)));
    },
  };
}

// Storbildsskärm vid starten
function buildScreen(ctx, terr) {
  const T = ctx.track;
  const f = T.sampleAt(T.wrapS(-70));
  const lat = -(T.halfW + 14);
  const x = f.x + f.rx * lat, z = f.z + f.rz * lat, y = terr.heightAt(x, z);
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const grp = new THREE.Group();
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(14, 7), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  scr.position.y = 9;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(14.8, 7.8, 0.5), new THREE.MeshLambertMaterial({ color: 0x1b1c22 }));
  frame.position.set(0, 9, -0.3);
  const leg = new THREE.Mesh(new THREE.BoxGeometry(0.6, 6, 0.6), new THREE.MeshLambertMaterial({ color: 0x1b1c22 }));
  leg.position.set(0, 2.5, -0.4);
  grp.add(scr, frame, leg);
  grp.position.set(x, y, z);
  grp.lookAt(f.x - f.fx * 60, y + 9, f.z - f.fz * 60);
  ctx.scene.add(grp);
  let last = '';
  return {
    set(l1, l2) {
      const key = l1 + '|' + l2;
      if (key === last) return; last = key;
      const c = cv.getContext('2d');
      c.fillStyle = '#0c0d14'; c.fillRect(0, 0, 512, 256);
      c.textAlign = 'center';
      c.fillStyle = '#ffffff'; c.font = '600 34px Montserrat, sans-serif'; c.fillText(l1, 256, 100);
      c.fillStyle = '#7fd2ff'; c.font = 'italic 900 64px "Exo 2", sans-serif'; c.fillText(l2, 256, 180);
      tex.needsUpdate = true;
    },
  };
}

// Neongrön pil vid starten
function buildArrow(ctx, terr) {
  const T = ctx.track;
  const f = T.sampleAt(T.wrapS(-30));
  const lat = T.halfW + 9;
  const x = f.x + f.rx * lat, z = f.z + f.rz * lat, y = terr.heightAt(x, z);
  const sh = new THREE.Shape();
  sh.moveTo(0, 0); sh.lineTo(3, 2.6); sh.lineTo(3, 1.2); sh.lineTo(7, 1.2); sh.lineTo(7, -1.2); sh.lineTo(3, -1.2); sh.lineTo(3, -2.6); sh.closePath();
  const m = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshBasicMaterial({ color: 0x9dff3a, toneMapped: false, side: THREE.DoubleSide }));
  const grp = new THREE.Group();
  m.position.set(-3.5, 7, 0);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7, 0.5), new THREE.MeshLambertMaterial({ color: 0x2c4a2c }));
  post.position.y = 3.5;
  grp.add(m, post);
  grp.position.set(x, y, z);
  grp.lookAt(f.x - f.fx * 50, y, f.z - f.fz * 50);
  ctx.scene.add(grp);
}

// Kurvskyltar (orange med svart pil) på ytterkanten
function buildSigns(ctx, terr) {
  const { scene, track: T } = ctx;
  const mk = (dir) => canvasTex(128, 96, (c) => {
    c.fillStyle = '#1a1a1a'; c.fillRect(0, 0, 128, 96);
    c.fillStyle = '#ff9a1c'; c.fillRect(5, 5, 118, 86);
    c.fillStyle = '#111';
    c.save(); if (dir > 0) { c.translate(128, 0); c.scale(-1, 1); }
    c.beginPath(); c.moveTo(30, 48); c.lineTo(78, 12); c.lineTo(100, 12); c.lineTo(58, 48); c.lineTo(100, 84); c.lineTo(78, 84); c.closePath(); c.fill();
    c.restore();
  });
  const spots = [[], []]; // [vänsterpil, högerpil]
  let last = -999;
  for (let i = 0; i < T.N; i += 2) {
    const k = T.k[i];
    if (Math.abs(k) < 1 / 900) continue;
    if (T.flags[i] & (F_GAP | F_RAMP | F_TUNNEL | F_BRIDGE)) continue;
    if (i * T.ds - last < 70) continue;
    last = i * T.ds;
    // vänstersväng (k<0) → skylten på höger sida med pil åt vänster
    const side = k < 0 ? 1 : -1;
    spots[k < 0 ? 0 : 1].push([i, side]);
  }
  const boardGeo = new THREE.PlaneGeometry(2.2, 1.65);
  const postGeo = new THREE.BoxGeometry(0.14, 4, 0.14);
  const postMat = new THREE.MeshLambertMaterial({ color: 0x3a3b44 });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), B = new THREE.Matrix4();
  const posts = [];
  [0, 1].forEach((d) => {
    const inst = new THREE.InstancedMesh(boardGeo, new THREE.MeshLambertMaterial({ map: mk(d) }), spots[d].length);
    spots[d].forEach(([i, side], n) => {
      const lat = side * (T.halfW + 3.2);
      const x = T.px[i] + T.rx[i] * lat, z = T.pz[i] + T.rz[i] * lat;
      const y = Math.max(terr.heightAt(x, z), T.py[i]) + 2.9;
      B.makeBasis(v.set(T.hx[i] * 0 - T.hz[i], 0, T.hx[i]), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-T.hx[i], 0, -T.hz[i]));
      q.setFromRotationMatrix(B);
      m4.compose(new THREE.Vector3(x, y, z), q, one);
      inst.setMatrixAt(n, m4);
      posts.push([x, y - 1.9, z]);
    });
    scene.add(inst);
  });
  const pi = new THREE.InstancedMesh(postGeo, postMat, posts.length);
  posts.forEach(([x, y, z], n) => { m4.compose(v.set(x, y, z), q.identity(), one); pi.setMatrixAt(n, m4); });
  scene.add(pi);
}

// ---------- Tunnlar, broar, dalen och hoppen ----------
function panelTex(base, line, w = 256, h = 256) {
  const t = canvasTex(w, h, (c) => {
    c.fillStyle = base; c.fillRect(0, 0, w, h);
    for (let k = 0; k < 900; k++) { c.fillStyle = k % 2 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'; c.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
    c.strokeStyle = line; c.lineWidth = 3;
    for (let x = 0; x <= w; x += 64) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
    for (let y = 0; y <= h; y += 128) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function hazardTex() {
  const t = canvasTex(256, 64, (c, w, h) => {
    c.fillStyle = '#ffc21a'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#16161a';
    for (let x = -h; x < w + h; x += 48) { c.beginPath(); c.moveTo(x, h); c.lineTo(x + 24, h); c.lineTo(x + 24 + h, 0); c.lineTo(x + h, 0); c.closePath(); c.fill(); }
  });
  t.wrapS = THREE.RepeatWrapping;
  return t;
}
function signTex(l1, l2, bg = '#ff9a1c') {
  return canvasTex(256, 128, (c, w, h) => {
    c.fillStyle = '#16161a'; c.fillRect(0, 0, w, h);
    c.fillStyle = bg; c.fillRect(6, 6, w - 12, h - 12);
    c.fillStyle = '#16161a'; c.textAlign = 'center';
    const fit = (txt, font, size, maxW) => { c.font = font.replace('#', size); const m = c.measureText(txt).width; if (m > maxW) c.font = font.replace('#', Math.floor(size * maxW / m)); };
    fit(l1, 'italic 900 #px "Exo 2", sans-serif', 56, w - 28); c.fillText(l1, w / 2, 66);
    fit(l2, '800 #px Montserrat, sans-serif', 26, w - 28); c.fillText(l2, w / 2, 106);
  });
}
// högerhänt ram vid s: x = höger, y = upp, z = BAKÅT (−körriktningen) → matris
function frameAt(T, s, out = new THREE.Matrix4()) {
  const f = T.sampleAt(s);
  const R = new THREE.Vector3(f.rx, f.ry, f.rz).normalize(), U = new THREE.Vector3(f.ux, f.uy, f.uz).normalize(), B = new THREE.Vector3(-f.fx, -f.fy, -f.fz).normalize();
  out.makeBasis(R, U, B).setPosition(f.x, f.y, f.z);
  return out;
}
function boardAt(ctx, s, lat, tex, w = 3.2, h = 1.6, up = 3.2) {
  const T = ctx.track, f = T.sampleAt(s);
  const x = f.x + f.rx * lat, z = f.z + f.rz * lat, y = Math.max(ctx.terr.heightAt(x, z), f.y);
  const g = new THREE.Group();
  const board = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
  board.position.y = up;
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, up, 0.16), new THREE.MeshLambertMaterial({ color: 0x3a3b44 }));
  post.position.y = up / 2;
  g.add(board, post);
  g.position.set(x, y, z);
  g.lookAt(x - f.fx * 10, y, z - f.fz * 10);   // mot de som kommer körande
  ctx.scene.add(g);
}

function buildTunnels(ctx) {
  const { scene, track: T } = ctx;
  const W = T.halfW + 1.4;
  const prof = [[-W, -0.4], [-W, 5.6], [-W * 0.86, 7.6], [-W * 0.55, 8.9], [0, 9.4], [W * 0.55, 8.9], [W * 0.86, 7.6], [W, 5.6], [W, -0.4]];
  const wallMat = new THREE.MeshLambertMaterial({ map: panelTex('#b9a8b0', 'rgba(60,40,60,0.35)'), side: THREE.DoubleSide });
  const ledMat = new THREE.MeshBasicMaterial({ color: 0x4f8cff, side: THREE.DoubleSide, toneMapped: false });
  const portalMat = new THREE.MeshLambertMaterial({ map: panelTex('#a8939c', 'rgba(40,30,40,0.4)') });
  const lampGeo = new THREE.BoxGeometry(0.6, 0.14, 2.4);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff1c8, toneMapped: false });
  const lamps = [];
  for (const f of T.features) {
    if (f.type !== 'tunnel') continue;
    const list = idxRange(T, f.s0, f.s1, 1);
    const tube = new THREE.Mesh(extrudeAbs(T, list, prof, 8, true), wallMat);
    tube.castShadow = true; tube.receiveShadow = true;
    scene.add(tube);
    for (const sd of [-1, 1]) scene.add(new THREE.Mesh(extrudeAbs(T, list, [[sd * (W - 0.03), 1.2], [sd * (W - 0.03), 1.5]], 4), ledMat));
    for (let k = 1; k < list.length - 1; k += 3) for (const sd of [-0.45, 0.45]) lamps.push([list[k], sd * W]);
    // tak med fysik (ingen flyger upp i berget)
    if (ctx.world) {
      const Rv = new THREE.Vector3(), Uv = new THREE.Vector3(), Bv = new THREE.Vector3(), Mx = new THREE.Matrix4(), Qt = new THREE.Quaternion();
      for (let k = 0; k < list.length; k += 2) {
        const i = list[k];
        Rv.set(T.rx[i], T.ry[i], T.rz[i]); Uv.set(T.ux[i], T.uy[i], T.uz[i]); Bv.set(-T.fx[i], -T.fy[i], -T.fz[i]);
        Mx.makeBasis(Rv, Uv, Bv); Qt.setFromRotationMatrix(Mx);
        const c = new THREE.Vector3(T.px[i], T.py[i], T.pz[i]).addScaledVector(Uv, 9.6);
        ctx.world.createCollider(ctx.RAPIER.ColliderDesc.cuboid(W, 0.4, T.ds + 0.4).setTranslation(c.x, c.y, c.z)
          .setRotation({ x: Qt.x, y: Qt.y, z: Qt.z, w: Qt.w }).setFriction(0.1).setCollisionGroups(GROUP_WORLD), ctx.fixedBody);
      }
    }
    // mynningar: betongvägg med valvöppning
    const Wo = W + 16, top = 26;
    const sh = new THREE.Shape();
    sh.moveTo(-Wo, -3); sh.lineTo(-W, -3);
    for (const [lx, h] of prof) sh.lineTo(lx, Math.max(-3, h));
    sh.lineTo(W, -3); sh.lineTo(Wo, -3); sh.lineTo(Wo, top); sh.lineTo(-Wo, top); sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 3, bevelEnabled: false });
    const sign = signTex(f.namn || 'TUNNEL', 'TUNNEL', '#ffd23a');
    for (const [sp, dir] of [[f.s0, -1], [f.s1, 1]]) {
      const M = frameAt(T, sp);
      const portal = new THREE.Mesh(geo, portalMat);
      portal.applyMatrix4(M);
      // ExtrudeGeometry går längs +z (= bakåt): vid ingången ligger väggen före tunneln, vid utgången efter
      if (dir > 0) portal.translateZ(-3);
      portal.castShadow = true;
      scene.add(portal);
      const board = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.5), new THREE.MeshBasicMaterial({ map: sign, toneMapped: false }));
      board.applyMatrix4(M);
      board.translateY(12.5);
      board.translateZ(dir < 0 ? 3.05 : -3.05);
      if (dir > 0) board.rotateY(Math.PI);
      scene.add(board);
    }
  }
  if (lamps.length) {
    const inst = new THREE.InstancedMesh(lampGeo, lampMat, lamps.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), B = new THREE.Matrix4();
    lamps.forEach(([i, lat], k) => {
      B.makeBasis(new THREE.Vector3(T.rx[i], T.ry[i], T.rz[i]), new THREE.Vector3(T.ux[i], T.uy[i], T.uz[i]), new THREE.Vector3(T.fx[i], T.fy[i], T.fz[i]));
      q.setFromRotationMatrix(B);
      v.set(T.px[i] + T.rx[i] * lat + T.ux[i] * 8.9, T.py[i] + T.ry[i] * lat + T.uy[i] * 8.9, T.pz[i] + T.rz[i] * lat + T.uz[i] * 8.9);
      inst.setMatrixAt(k, m4.compose(v, q, one));
    });
    scene.add(inst);
  }
}

function buildBridges(ctx) {
  const { scene, track: T, terr } = ctx;
  const W = T.halfW + 1.3;
  const deckMat = new THREE.MeshLambertMaterial({ map: panelTex('#cdb9c1', 'rgba(60,40,60,0.25)'), side: THREE.DoubleSide });
  const blueMat = new THREE.MeshLambertMaterial({ color: 0x2c5fd6, side: THREE.DoubleSide });
  const pillarMat = new THREE.MeshLambertMaterial({ color: 0xc4b0b8, flatShading: true });
  const pillars = [];
  for (const f of T.features) {
    if (f.type !== 'valley' && f.type !== 'overpass') continue;
    const list = idxRange(T, f.s0, f.s1, 3);
    const deck = new THREE.Mesh(extrudeAbs(T, list, [[-W, -0.06], [-W, -1.9], [W, -1.9], [W, -0.06]], 6), deckMat);
    deck.castShadow = true; deck.receiveShadow = true;
    scene.add(deck);
    for (const sd of [-1, 1]) scene.add(new THREE.Mesh(extrudeAbs(T, list, [[sd * (W + 0.04), -0.3], [sd * (W + 0.04), -1.1]], 6), blueMat));
    const loHint = f.type === 'overpass' ? T.idx(f.lo) : -1;
    for (let k = 4; k < list.length - 4; k += 8) {
      const i = list[k];
      for (const lat of [-(T.halfW - 4), T.halfW - 4]) {
        const x = T.px[i] + T.rx[i] * lat, z = T.pz[i] + T.rz[i] * lat;
        const top = T.py[i] + T.ry[i] * lat - 1.9, ground = terr.heightAt(x, z) - 1;
        if (top - ground < 2.5) continue;
        if (loHint >= 0) { const pr = T.project(x, z, loHint); if (Math.abs(pr.lat) < T.halfW + 3.5 && Math.abs(pr.y - top) < 30) continue; }
        pillars.push([x, ground, z, top - ground, Math.atan2(T.hx[i], T.hz[i])]);
      }
    }
  }
  if (!pillars.length) return;
  const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(2.2, 1, 3.2), pillarMat, pillars.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  pillars.forEach(([x, y0, z, h, yaw], k) => {
    q.setFromAxisAngle(Y, yaw);
    inst.setMatrixAt(k, m4.compose(v.set(x, y0 + h / 2, z), q, sc.set(1, h, 1)));
    if (ctx.world) {
      ctx.world.createCollider(ctx.RAPIER.ColliderDesc.cuboid(1.1, h / 2, 1.6).setTranslation(x, y0 + h / 2, z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }).setCollisionGroups(GROUP_WORLD), ctx.fixedBody);
    }
  });
  inst.castShadow = true;
  scene.add(inst);
}

function buildValleys(ctx) {
  const { scene, track: T } = ctx;
  for (const f of T.features) {
    if (f.type !== 'valley') continue;
    const tex = canvasTex(512, 128, (c, w, h) => {
      c.fillStyle = '#cfeaf6'; c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 2;
      for (let k = 0; k < 40; k++) { c.beginPath(); let x = Math.random() * w, y = Math.random() * h; c.moveTo(x, y); for (let n = 0; n < 4; n++) { x += (Math.random() - 0.3) * 40; y += (Math.random() - 0.5) * 20; c.lineTo(x, y); } c.stroke(); }
      c.fillStyle = 'rgba(120,170,210,0.25)'; c.fillRect(0, h * 0.35, w, h * 0.3);
    });
    tex.wrapS = THREE.RepeatWrapping; tex.repeat.set(4, 1);
    const len = f.lv * 1.5;
    const ice = new THREE.Mesh(new THREE.PlaneGeometry(len, 46).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: tex, emissive: 0x1a2a3a }));
    const ax = -f.tz, az = f.tx;                        // dalens riktning
    ice.rotation.y = Math.atan2(-az, ax);
    ice.position.set(f.x, f.floorY + 0.35, f.z);
    ice.receiveShadow = true;
    scene.add(ice);
    boardAt(ctx, f.s0 - 120, T.halfW + 4, signTex(f.namn || 'BRON', 'HÅLL I DIG!', '#7fd2ff'));
  }
}

function buildJumps(ctx) {
  const { scene, track: T } = ctx;
  const W = T.halfW + 1.0, G = JUMP.GAP;
  const blockMat = new THREE.MeshLambertMaterial({ map: panelTex('#c3aeb7', 'rgba(60,40,60,0.3)'), side: THREE.DoubleSide });
  const hz = hazardTex();
  hz.repeat.set(8, 1);
  const capTex = canvasTex(256, 256, (c, w) => {
    c.fillStyle = '#b9a4ad'; c.fillRect(0, 0, w, w);
    c.fillStyle = '#ffc21a'; c.fillRect(0, 0, w, 30);
    c.fillStyle = '#16161a';
    for (let x = -30; x < w + 30; x += 32) { c.beginPath(); c.moveTo(x, 30); c.lineTo(x + 16, 30); c.lineTo(x + 46, 0); c.lineTo(x + 30, 0); c.closePath(); c.fill(); }
  });
  for (const f of T.features) {
    if (f.type !== 'jump') continue;
    // betongfundament under ramperna på var sida om ravinen
    const kick = idxRange(T, f.lip - 24, f.lip - 1.5).filter(i => !(T.flags[i] & F_GAP));
    const land = idxRange(T, f.lip + G + 1.5, f.lip + G + 24).filter(i => !(T.flags[i] & F_GAP));
    for (const list of [kick, land]) {
      const m = new THREE.Mesh(extrudeAbs(T, list, [[-W, -0.06], [-W, -16], [W, -16], [W, -0.06]], 6), blockMat);
      m.castShadow = true; m.receiveShadow = true;
      scene.add(m);
    }
    // gavlar mot ravinen (gul-svart kant)
    for (const [sp, face] of [[kick[kick.length - 1] * T.ds, 1], [land[0] * T.ds, -1]]) {
      const cap = new THREE.Mesh(new THREE.PlaneGeometry(2 * W, 16), new THREE.MeshLambertMaterial({ map: capTex, side: THREE.DoubleSide }));
      cap.applyMatrix4(frameAt(T, sp));
      cap.translateY(-8);
      if (face > 0) cap.rotateY(Math.PI);
      scene.add(cap);
    }
    // varningsränder på vägen vid kanten
    scene.add(new THREE.Mesh(planeOnRoad(T, f.lip - 5, f.lip - 1.5, -T.halfW, T.halfW, 0.03),
      new THREE.MeshLambertMaterial({ map: hz, polygonOffset: true, polygonOffsetFactor: -3 })));
    for (const sd of [-1, 1]) {
      boardAt(ctx, f.lip - 200, sd * (T.halfW + 4), signTex('HOPP!', 'GASA — STANNA INTE'));
      boardAt(ctx, f.lip - 90, sd * (T.halfW + 4), signTex('HOPP!', 'FULL GAS!'));
    }
    // fysik: landningsfundamentets front — den som inte kommer över smäller in i den
    if (ctx.world) {
      const M = frameAt(T, f.lip + G + 10);
      const p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
      M.decompose(p, q, sc);
      p.addScaledVector(new THREE.Vector3(0, 1, 0).applyQuaternion(q), -8.1);
      ctx.world.createCollider(ctx.RAPIER.ColliderDesc.cuboid(W, 8, 8.5).setTranslation(p.x, p.y, p.z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }).setCollisionGroups(GROUP_WORLD), ctx.fixedBody);
    }
  }
}

// ---------- Huvudbygget ----------
export function buildWorld(ctx) {
  if (ctx.world) ctx.fixedBody = ctx.world.createRigidBody(ctx.RAPIER.RigidBodyDesc.fixed());
  const t0 = performance.now();
  buildRoad(ctx);
  const barrierTypes = buildBarriers(ctx);
  const terr = buildTerrain(ctx);
  ctx.terr = terr;
  const t1 = performance.now();
  buildTunnels(ctx);
  buildBridges(ctx);
  buildValleys(ctx);
  buildJumps(ctx);
  const trees = buildTrees(ctx, terr);
  buildRedTrees(ctx, terr);
  buildMountains(ctx, terr);
  const gantry = buildGantry(ctx);
  const screen = buildScreen(ctx, terr);
  buildArrow(ctx, terr);
  buildSigns(ctx, terr);
  console.log(`värld: terräng ${(t1 - t0).toFixed(0)} ms, totalt ${(performance.now() - t0).toFixed(0)} ms`);
  return {
    terr, gantry, screen, barrierTypes, fixedBody: ctx.fixedBody,
    // göm träd långt bort (fog döljer dem ändå)
    cull(cam, range = 2300) {
      for (const t of trees) {
        const d = Math.hypot(t.cx - cam.x, t.cz - cam.z);
        t.mesh.visible = d < range;
      }
    },
  };
}
