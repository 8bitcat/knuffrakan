// Världen: vägbana, murar (rosa betong + blå kurvväggar med stängsel), snöterräng,
// granar, berg i diset, startportal, kurvskyltar. Grafik alltid — kolliders bara när
// det finns en fysikvärld (värden).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONF } from './config.js?v=32';
import { F_GAP, F_BRIDGE, F_TUNNEL, F_RAMP, F_LAND, F_LAVA, JUMP } from './track.js?v=32';
import { themeOf } from './themes.js?v=32';

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

function asphaltTex([r0, g0, b0] = [60, 47, 66]) {
  return canvasTex(512, 512, (c, w, h) => {
    const img = c.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = (Math.random() - 0.5) * 16 + fbm(x / 40, y / 40, 3) * 7;
      const o = (y * w + x) * 4;
      img.data[o] = r0 + n; img.data[o + 1] = g0 + n; img.data[o + 2] = b0 + n; img.data[o + 3] = 255;
    }
    c.putImageData(img, 0, 0);
  });
}

function buildRoad(ctx) {
  const { scene, track: T } = ctx;
  const HW = T.halfW, W2 = CONF.ROAD_W / 2;
  const tex = asphaltTex(ctx.theme.asphalt);
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
  const lineMat = new THREE.MeshBasicMaterial({ color: ctx.theme.line, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
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

function chevronTex(hex = 0x2c5fd6) {
  const base = new THREE.Color(hex).multiplyScalar(0.62).getStyle(), dark = new THREE.Color(hex).multiplyScalar(0.45).getStyle();
  const t = canvasTex(256, 128, (c, w, h) => {
    c.fillStyle = base; c.fillRect(0, 0, w, h);
    c.fillStyle = dark; c.fillRect(0, 0, w, 10); c.fillRect(0, h - 14, w, 14);
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
  const TH = ctx.theme;
  const concMat = new THREE.MeshLambertMaterial({ color: TH.conc, flatShading: true, side: THREE.DoubleSide });
  const saferMat = new THREE.MeshLambertMaterial({ map: chevronTex(TH.safer), side: THREE.DoubleSide });
  const fenceMat = new THREE.MeshLambertMaterial({ map: fenceTex(), transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, depthWrite: false });
  const railMat = new THREE.MeshLambertMaterial({ color: TH.safer, side: THREE.DoubleSide });
  const postGeo = new THREE.CylinderGeometry(0.07, 0.07, 3.2, 5);
  const posts = [], railPosts = [];
  // neonbanan: lysande list på murarna (insidan + ovanpå)
  const glowMat = TH.edgeGlow ? new THREE.MeshBasicMaterial({ color: TH.edgeGlow, toneMapped: false, side: THREE.DoubleSide }) : null;
  const glowStrip = (run, side, t) => {
    if (!glowMat) return;
    const profs = t === 1 ? [[[-0.04, 1.5], [-0.04, 1.8]]] : [[[0.144, 0.62], [0.188, 0.78]], [[0.3, 1.115], [0.62, 1.115]]];
    for (const p of profs) scene.add(new THREE.Mesh(extrude(T, run, side, p, base, 6), glowMat));
  };
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
        glowStrip(run, side, 0);
        scene.add(new THREE.Mesh(extrude(T, run, side, [[0.45, 1.0], [0.45, 7.0]], base, 4.5), fenceMat));
        scene.add(new THREE.Mesh(extrude(T, run, side, [[0.4, 6.9], [0.4, 7.2], [0.55, 7.2], [0.55, 6.9], [0.4, 6.9]], base, 6), railMat));
        for (let k = 0; k < run.length; k += 2) railPosts.push([run[k], side, 7.2]);
        return;
      }
      const g = extrude(T, run, side, t ? SAFER : CONCRETE, base, t ? 4.2 : 6);
      const m = new THREE.Mesh(g, t ? saferMat : concMat);
      m.castShadow = true; m.receiveShadow = true;
      scene.add(m);
      glowStrip(run, side, t);
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
  const postInst = new THREE.InstancedMesh(postGeo, new THREE.MeshLambertMaterial({ color: TH.post }), Math.max(1, posts.length));
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
        // låg tyngdkraft (månen): bilarna flyger högre av smällarna → högre osynlig vägg
        const lowG = Math.max(1, 1 + (1 / (T.def.grav ?? 1) - 1) * 0.6);
        const h = (T.flags[i] & F_TUNNEL) ? 9.5 : (t === 1 ? 5.0 : t === 2 ? 3.8 : t === 3 ? 7.4 : 4.0) * lowG, th = 0.8;
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
  const HWb = T.halfW, FL = T.flags, TH = ctx.theme;
  // havsytan (stranden) / neonslätten: en bit under banans lägsta punkt — vägen hamnar aldrig under
  let lowY = null;
  if (TH.sea || TH.grid) { lowY = Infinity; for (let i = 0; i < N; i++) lowY = Math.min(lowY, T.py[i]); lowY -= 3; }
  const seaY = TH.sea ? lowY : null;
  ctx.seaY = seaY; ctx.floorY = lowY;
  // marken långt från vägen: stad = nästan platt, öken = sanddyner, strand = ön sluttar ner i havet,
  // neon = platt slätt med rutnät, annars berg och dalar
  const nat = TH.flora === 'city' ? (x, z) => 2.5 * fbm(x * 0.004, z * 0.004, 2)
    : TH.flora === 'cactus' ? (x, z, D) => natural(x, z, D) * 0.7 + 7 * Math.abs(Math.sin(x * 0.011 + z * 0.004 + fbm(x * 0.002, z * 0.002, 2) * 3)) * Math.min(1, D / 200)
      : TH.sea ? (x, z, D) => seaY - 6 + (20 * (0.55 + 0.6 * fbm(x * 0.0016 + 2.3, z * 0.0016 - 5.1, 3)) + 2.5 * fbm(x * 0.007, z * 0.007, 2)) * (1 - smoothstep(160, 720, D))
        : TH.grid ? (x, z, D) => { const w = smoothstep(650, 1050, D); return 1.5 * fbm(x * 0.003, z * 0.003, 2) * (1 - w) + lowY * w; }
          : natural;
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
        y = (rB.y - 0.4 + bankUp) * (1 - t) + nat(x, z, dB) * t;
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
        } else if (f.type === 'canyon') {
          // kanjon: lodräta klippväggar på båda sidor (öppet uppåt)
          const in0 = T.sdist(sA, f.s0), in1 = T.sdist(f.s1, sA);
          // väggens fot en hel terrängruta (10 m) utanför muren — annars lutar triangeln in över vägen
          if (in0 > -60 && in1 > -60 && rA.al > HWb + 9) {
            const fade = smoothstep(-60, 40, Math.min(in0, in1));
            const wall = Math.min(f.h || 42, (rA.al - HWb - 9) * 2.2) * (1 - smoothstep(90, 260, rA.al) * 0.5);
            y = Math.max(y, y * (1 - fade) + (rA.y + wall) * fade);
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
  const snow = new THREE.Color(TH.ground[0]), snow2 = new THREE.Color(TH.ground[1]), rock = new THREE.Color(TH.ground[2]), c = new THREE.Color();
  const crack = TH.crack ? new THREE.Color(TH.crack) : null;
  const patch = TH.patch ? new THREE.Color(TH.patch) : null;
  const bands = TH.bands ? TH.bands.map(h => new THREE.Color(h)) : null;
  const wet = new THREE.Color(0xd2b47c), foam = new THREE.Color(0xf4fbff), shallow = new THREE.Color(0x5ccbc4), deep = new THREE.Color(0x2a8ca6);
  for (let o = 0; o < NV; o++) {
    const ny = nor[o * 3 + 1];
    const x = pos[o * 3], z = pos[o * 3 + 2];
    c.copy(snow).lerp(snow2, 0.5 + 0.5 * fbm(x * 0.01, z * 0.01, 2));
    // fläckar: grönt gräs bland löven, mintglasyr bland den rosa
    if (patch && Dist[o] > HWb + 3) c.lerp(patch, smoothstep(0.12, 0.42, fbm(x * 0.0045 + 7.3, z * 0.0045 - 3.1, 3)) * 0.75);
    c.lerp(rock, smoothstep(0.86, 0.62, ny));
    // godiskullar: randiga i höjdled som en tårta (bara en bit från vägen)
    if (bands && Dist[o] > HWb + 50) c.lerp(bands[Math.floor((pos[o * 3 + 1] + 1400) / 34) % bands.length], smoothstep(HWb + 50, HWb + 200, Dist[o]) * 0.8);
    if (crack && Dist[o] > HWb + 8) c.lerp(crack, smoothstep(0.032, 0.0, Math.abs(fbm(x * 0.012 + 5, z * 0.012 - 2, 3))) * 0.9);
    if (seaY !== null) {
      // våt sand och skum i strandkanten, turkost grunt vatten, djupare blått längre ut
      const y = pos[o * 3 + 1];
      c.lerp(wet, smoothstep(seaY + 1.6, seaY + 0.2, y));
      c.lerp(foam, Math.max(0, 1 - Math.abs(y - seaY + 0.15) / 0.55) * 0.7);
      c.lerp(shallow, smoothstep(seaY - 0.4, seaY - 2.5, y)).lerp(deep, smoothstep(seaY - 2.5, seaY - 8, y));
    }
    col[o * 3] = c.r; col[o * 3 + 1] = c.g; col[o * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const tmat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  if (TH.grid) {
    // neonrutnät: lysande linjer var 24:e meter (världskoordinater → samma rutor som slätten utanför)
    const uv = new Float32Array(NV * 2);
    for (let o = 0; o < NV; o++) { uv[o * 2] = pos[o * 3] / 24; uv[o * 2 + 1] = pos[o * 3 + 2] / 24; }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    Object.assign(tmat, { emissive: new THREE.Color(0xffffff), emissiveMap: (ctx.gridTex ||= gridTex()) });
  }
  const mesh = new THREE.Mesh(g, tmat);
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
  const [snowC, rockC, lowC] = (ctx.theme?.mtn || [0xf6e8ef, 0xc2a7b3, 0xd9c4cd]).map(h => new THREE.Color(h));
  const hs = ctx.theme?.mtnH ?? 1;                                 // lägre kullar (höst, öar i havet)
  for (let k = 0; k < 44; k++) {
    const a = (k / 44) * Math.PI * 2 + hash1(k) * 0.12;
    const r = R0 + 300 + hash1(k + 50) * 1800;
    const height = (380 + hash1(k + 90) * 650) * hs, rad = 800 + hash1(k + 130) * 900;
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
    // öar: sandranden (fotens färg) hamnar precis vid vattenytan
    const base = ctx.seaY != null ? ctx.seaY - height * 0.17 : -60;
    g.translate(cx + Math.cos(a) * r * 1.25, height / 2 + base, cz + Math.sin(a) * r);
    geos.push(g);
  }
  const g = mergeGeometries(geos);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  m.frustumCulled = false;
  ctx.scene.add(m);
  return m;
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
  const PN = ctx.theme.panel;                     // temats egna betongfärger (annars rosa)
  const wallMat = new THREE.MeshLambertMaterial({ map: panelTex(PN?.[0] || '#b9a8b0', 'rgba(60,40,60,0.35)'), side: THREE.DoubleSide });
  const ledMat = new THREE.MeshBasicMaterial({ color: ctx.theme.led ?? 0x4f8cff, side: THREE.DoubleSide, toneMapped: false });
  const portalMat = new THREE.MeshLambertMaterial({ map: panelTex(PN?.[1] || '#a8939c', 'rgba(40,30,40,0.4)') });
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
  const PN = ctx.theme.panel;
  const deckMat = new THREE.MeshLambertMaterial({ map: panelTex(PN?.[2] || '#cdb9c1', 'rgba(60,40,60,0.25)'), side: THREE.DoubleSide });
  const blueMat = new THREE.MeshLambertMaterial({ color: ctx.theme.rail ?? 0x2c5fd6, side: THREE.DoubleSide });
  const pillarMat = new THREE.MeshLambertMaterial({ color: PN ? new THREE.Color(PN[1]) : 0xc4b0b8, flatShading: true });
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
    const kind = ctx.theme.valley;
    if (kind === 'slime' || kind === 'choklad') {
      // slemträsket (lyser grönt) och chokladfloden: rinnande golv under bron
      const slime = kind === 'slime';
      const tex = slime ? (ctx.slimeTex ||= slimeTex()) : (ctx.chocoTex ||= chocoTex());
      tex.repeat.set(slime ? 8 : 9, 1.2);
      const mat = slime ? new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }) : new THREE.MeshLambertMaterial({ map: tex, emissive: 0x1a0a06 });
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(f.lv * 1.5, 46).rotateX(-Math.PI / 2), mat);
      floor.rotation.y = Math.atan2(-f.tx, -f.tz);
      floor.position.set(f.x, f.floorY + 0.35, f.z);
      scene.add(floor);
      if (slime) (ctx.slimeSpots ||= []).push({ x: f.x, y: f.floorY + 0.5, z: f.z, ax: -f.tz, az: f.tx, lv: f.lv });
      boardAt(ctx, f.s0 - 120, T.halfW + 4, signTex(f.namn || 'BRON', slime ? 'SLEM UNDER!' : 'GOTT UNDER!', slime ? '#7aff4a' : '#ff8ac8'));
      continue;
    }
    if (kind !== 'ice') {
      const len = f.lv * 1.5, tex = kind === 'lava' ? (ctx.lavaTex ||= lavaTex()) : kind === 'water' ? (ctx.waterTex ||= waterTex()) : kind === 'dust' ? dustBedTex() : sandBedTex();
      tex.repeat.set(kind === 'lava' || kind === 'water' ? 10 : 6, kind === 'lava' || kind === 'water' ? 1.2 : 1);
      const mat = kind === 'lava' ? new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })
        : kind === 'water' ? new THREE.MeshLambertMaterial({ map: tex, emissive: 0x0a3050, transparent: true, opacity: 0.92 }) : new THREE.MeshLambertMaterial({ map: tex });
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(len, 46).rotateX(-Math.PI / 2), mat);
      floor.rotation.y = Math.atan2(-f.tx, -f.tz);
      floor.position.set(f.x, f.floorY + 0.35, f.z);
      // stranden: lagunen är havet självt när dalen går under havsytan
      if (!(ctx.seaY != null && f.floorY < ctx.seaY - 1)) scene.add(floor);
      boardAt(ctx, f.s0 - 120, T.halfW + 4, signTex(f.namn || 'BRON', kind === 'lava' ? 'LAVA UNDER!' : 'HÅLL I DIG!', kind === 'lava' ? '#ff6a1e' : kind === 'water' ? '#4fc3ff' : '#ffb21a'));
      continue;
    }
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
  const blockMat = new THREE.MeshLambertMaterial({ map: panelTex(ctx.theme.panel?.[2] || '#c3aeb7', 'rgba(60,40,60,0.3)'), side: THREE.DoubleSide });
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
  ctx.theme = themeOf(ctx.track.def);
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
  const trees = buildFlora(ctx, terr);
  if (ctx.theme.redTrees) buildRedTrees(ctx, terr);
  buildMountainsThemed(ctx, terr);
  const lava = buildLava(ctx);
  const air = makeAir(ctx);
  const earth = ctx.theme.earth ? earthMesh() : null;
  if (earth) ctx.scene.add(earth);
  // himlakroppar som följer kameran: spökmånen och neonbanans randiga solnedgång
  const moon = ctx.theme.moon ? bigMoon() : null;
  if (moon) ctx.scene.add(moon);
  const sunset = ctx.theme.synthSun ? synthSun() : null;
  if (sunset) ctx.scene.add(sunset);
  if (ctx.theme.sea || ctx.theme.grid) buildFloor(ctx, terr);
  const gantry = buildGantry(ctx);
  const screen = buildScreen(ctx, terr);
  buildArrow(ctx, terr);
  buildSigns(ctx, terr);
  console.log(`värld: terräng ${(t1 - t0).toFixed(0)} ms, totalt ${(performance.now() - t0).toFixed(0)} ms`);
  return {
    terr, gantry, screen, barrierTypes, fixedBody: ctx.fixedBody, theme: ctx.theme,
    // rörligt: lava som flyter, rökpelare, luften (aska/damm/snö), eldklot
    update(dt, time, cam, fx, onBoom) {
      if (lava) lava.offset.y -= dt * 0.08;
      if (ctx.lavaTex && ctx.lavaTex !== lava) ctx.lavaTex.offset.x += dt * 0.03;
      if (ctx.waterTex) ctx.waterTex.offset.x += dt * 0.12;
      if (ctx.slimeTex) { ctx.slimeTex.offset.x += dt * 0.025; ctx.slimeTex.offset.y += dt * 0.01; }
      if (ctx.chocoTex) ctx.chocoTex.offset.x += dt * 0.07;
      if (ctx.seaTex) { ctx.seaTex.offset.x += dt * 0.006; ctx.seaTex.offset.y += dt * 0.004; }
      if (ctx.pumpkinMat) ctx.pumpkinMat.color.setScalar(0.88 + 0.12 * Math.sin(time * 9) * Math.sin(time * 5.3 + 1));   // pumporna fladdrar
      if (earth && cam) earth.position.set(cam.x - 2600, cam.y + 2300, cam.z - 4200);
      if (moon && cam) moon.position.set(cam.x - 3000, cam.y + 1350, cam.z - 4300);
      if (sunset && cam) sunset.position.set(cam.x + 6200, cam.y + 640, cam.z - 1500);
      for (const p of ctx.plumes || []) { p.s.position.y = p.base.y + 60 + ((time * 14 + p.k * 90) % 540); p.s.material.opacity = 0.85 * (1 - ((time * 14 + p.k * 90) % 540) / 540); }
      air(dt, time, cam, fx, onBoom);
    },
    // göm träd långt bort (fog döljer dem ändå)
    cull(cam, range = 2300) {
      for (const t of trees) {
        const d = Math.hypot(t.cx - cam.x, t.cz - cam.z);
        t.mesh.visible = d < range;
      }
    },
  };
}

// ============================================================================================
// ---------- Teman: växtlighet, berg, dalar, lava, stad och luften (themes.js) ----------
// ============================================================================================
function colorGeo(geo, hex) {
  const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  if (geo.attributes.uv) geo.deleteAttribute('uv');
  if (geo.index) return geo.toNonIndexed();
  return geo;
}
const mergeColored = (parts) => { const g = mergeGeometries(parts.map(p => p.index ? p.toNonIndexed() : p)); g.computeVertexNormals(); return g; };

// brända träd + basaltblock (vulkanen)
function deadTreeGeo() {
  const parts = [colorGeo(new THREE.CylinderGeometry(0.22, 0.5, 8, 6).translate(0, 4, 0), 0x1a1214)];
  for (const [a, y, l] of [[0.6, 4.5, 2.6], [-0.8, 5.6, 2.2], [2.2, 6.4, 1.8], [-2.4, 3.6, 2.0]]) {
    const b = new THREE.CylinderGeometry(0.06, 0.16, l, 5).translate(0, l / 2, 0).rotateZ(0.9 * Math.sign(a)).rotateY(a);
    parts.push(colorGeo(b.translate(0, y, 0), 0x241a1a));
  }
  parts.push(colorGeo(new THREE.ConeGeometry(0.22, 0.8, 6).translate(0, 8.4, 0), 0xff5a14));   // glöd i toppen
  return mergeColored(parts);
}
function rockGeo(hex, flat = 0.6) {
  return mergeColored([colorGeo(new THREE.DodecahedronGeometry(1.6, 0).scale(1, flat, 1.2).translate(0, 0.5, 0), hex)]);
}
// kaktusar, buskar (öknen)
function cactusGeo() {
  const G = 0x3f7a3a, parts = [colorGeo(new THREE.CylinderGeometry(0.45, 0.55, 7.5, 8).translate(0, 3.75, 0), G),
    colorGeo(new THREE.SphereGeometry(0.45, 8, 6).translate(0, 7.5, 0), G)];
  for (const [s, y0, h] of [[1, 2.6, 2.6], [-1, 3.6, 2.0]]) {
    parts.push(colorGeo(new THREE.CylinderGeometry(0.3, 0.3, 1.0, 7).rotateZ(Math.PI / 2).translate(s * 0.75, y0, 0), G));
    parts.push(colorGeo(new THREE.CylinderGeometry(0.3, 0.32, h, 7).translate(s * 1.25, y0 + h / 2, 0), G));
    parts.push(colorGeo(new THREE.SphereGeometry(0.3, 7, 5).translate(s * 1.25, y0 + h, 0), G));
  }
  return mergeColored(parts);
}
function shrubGeo() { return mergeColored([colorGeo(new THREE.IcosahedronGeometry(1.2, 0).scale(1, 0.6, 1).translate(0, 0.5, 0), 0x8a7a4a), colorGeo(new THREE.IcosahedronGeometry(0.8, 0).scale(1, 0.6, 1).translate(0.8, 0.4, 0.3), 0x6e6236)]); }
function barrelGeo() { return mergeColored([colorGeo(new THREE.SphereGeometry(0.9, 9, 7).scale(1, 1.2, 1).translate(0, 0.9, 0), 0x4a8a44), colorGeo(new THREE.ConeGeometry(0.25, 0.4, 6).translate(0, 2.1, 0), 0xff5a8a)]); }
// iskristaller och isblock
function iceGeo() {
  const parts = [];
  for (const [x, z, h, t] of [[0, 0, 7, 0], [1.4, 0.6, 4.5, 0.3], [-1.2, 0.8, 5.2, -0.35], [0.3, -1.3, 3.6, 0.25]]) {
    parts.push(colorGeo(new THREE.OctahedronGeometry(1, 0).scale(0.9, h / 2, 0.9).rotateZ(t).translate(x, h / 2 - 0.3, z), 0xbfe8ff));
  }
  return mergeColored(parts);
}
function iceBlockGeo() { return mergeColored([colorGeo(new THREE.BoxGeometry(4, 2.6, 3.2).rotateY(0.4).translate(0, 1.1, 0), 0xa8dcf6), colorGeo(new THREE.BoxGeometry(2.4, 1.8, 2.2).rotateY(-0.3).translate(2.6, 2.9, 0.4), 0xc8ecff)]); }

// utspridning som granarna (dungar, glesare längre bort), valfria former med vikter
// opt: seed (annan utspridning), maxD (bara nära vägen), minY (inte under havsytan), CH (bitstorlek)
function scatter(ctx, terr, geos, weights, maxN, mat, minD = 9, opt = {}) {
  const { scene, track: T } = ctx;
  const CH = opt.CH || 600, chunks = new Map(), HWb = T.halfW, maxD = opt.maxD ?? 1000;
  let seed = opt.seed || 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const W = terr.x1 - terr.x0, D = terr.z1 - terr.z0, wsum = weights.reduce((a, b) => a + b, 0);
  let placed = 0;
  for (let n = 0; n < maxN * 12 && placed < maxN; n++) {
    const x = terr.x0 + rnd() * W, z = terr.z0 + rnd() * D;
    const dist = terr.distAt(x, z);
    if (dist < HWb + minD || dist > maxD || terr.valleyAt(x, z) > 0.05) continue;
    const dens = fbm(x * 0.006 + 4.4, z * 0.006 - 2.2, 3) * 0.6 + 0.35 - Math.min(0.5, dist / 1600);
    if (rnd() > dens + (dist < 60 ? 0.35 : 0)) continue;
    if (Math.hypot(x, z) < 140 && dist < 60) continue;
    if (opt.minY != null && terr.heightAt(x, z) < opt.minY) continue;
    let r = rnd() * wsum, type = 0;
    while (type < weights.length - 1 && r > weights[type]) { r -= weights[type]; type++; }
    const key = Math.floor(x / CH) + '|' + Math.floor(z / CH) + '|' + type;
    if (!chunks.has(key)) chunks.set(key, { type, list: [], cx: (Math.floor(x / CH) + 0.5) * CH, cz: (Math.floor(z / CH) + 0.5) * CH });
    chunks.get(key).list.push([x, terr.heightAt(x, z) - 0.3, z, 0.8 + rnd() * 0.9, rnd() * 6.28]);
    placed++;
  }
  const out = [], m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  for (const ch of chunks.values()) {
    const inst = new THREE.InstancedMesh(geos[ch.type], Array.isArray(mat) ? mat[ch.type] : mat, ch.list.length);
    ch.list.forEach(([x, y, z, sc, r], k) => { q.setFromAxisAngle(UP, r); m4.compose(v.set(x, y, z), q, s.set(sc, sc * (0.9 + (r % 1) * 0.35), sc)); inst.setMatrixAt(k, m4); });
    inst.computeBoundingSphere(); inst.castShadow = true;
    scene.add(inst);
    out.push({ mesh: inst, cx: ch.cx, cz: ch.cz });
  }
  return out;
}

function buildFlora(ctx, terr) {
  const fl = ctx.theme.flora;
  if (fl === 'pine') return buildTrees(ctx, terr);
  if (fl === 'city') return buildCity(ctx, terr);
  const lam = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  if (fl === 'dead') return scatter(ctx, terr, [deadTreeGeo(), rockGeo(0x221a1c), rockGeo(0x3a2826, 0.9)], [0.45, 0.35, 0.2], 2600, lam);
  if (fl === 'cactus') return scatter(ctx, terr, [cactusGeo(), shrubGeo(), rockGeo(0xb8623e, 0.8), barrelGeo()], [0.3, 0.35, 0.2, 0.15], 3200, lam);
  if (fl === 'jungle') return scatter(ctx, terr, [palmGeo(), broadleafGeo(), jungleBushGeo()], [0.3, 0.4, 0.3], 4600, lam);
  if (fl === 'moon') { moonBase(ctx, terr); return scatter(ctx, terr, [craterGeo(), rockGeo(0x7a7a80, 0.8), rockGeo(0x9a9aa0, 0.5)], [0.4, 0.35, 0.25], 1800, lam, 14); }
  if (fl === 'ice') {
    const ice = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: 0x16344a, transparent: true, opacity: 0.9 });
    return scatter(ctx, terr, [iceGeo(), iceBlockGeo(), pineGeo(true)], [0.35, 0.25, 0.4], 3600, [ice, ice, lam]);
  }
  if (fl === 'beach') return buildBeach(ctx, terr, lam);
  if (fl === 'autumn') return buildAutumn(ctx, terr, lam);
  if (fl === 'spooky') return buildSpooky(ctx, terr, lam);
  if (fl === 'candy') return buildCandy(ctx, terr, lam);
  if (fl === 'neon') return buildNeon(ctx, terr);
  return [];
}

// ---------- Staden: höghus med tända fönster, neonskyltar, gatlyktor ----------
function windowTex(lit) {
  return canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = lit ? '#000' : '#1b1e2a'; c.fillRect(0, 0, w, h);
    if (!lit) { c.fillStyle = '#232738'; for (let x = 0; x < w; x += 64) c.fillRect(x, 0, 6, h); }
    const cols = ['#ffd98a', '#fff4d8', '#9fe8ff', '#ffb36a'];
    for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) {
      const on = Math.random() < 0.42;
      c.fillStyle = on ? cols[Math.floor(Math.random() * 4)] : (lit ? '#000' : '#0d0f17');
      c.fillRect(x * 64 + 14, y * 32 + 8, 40, 18);
    }
  });
}
let CITY = null;
function cityMats() {
  if (CITY) return CITY;
  const map = windowTex(false), em = windowTex(true);
  for (const t of [map, em]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  const facade = new THREE.MeshLambertMaterial({ map, emissive: 0xffffff, emissiveMap: em, emissiveIntensity: 0.95 });
  const roof = new THREE.MeshLambertMaterial({ color: 0x15171f });
  CITY = { facade, roof, arr: [facade, facade, roof, roof, facade, facade] };
  return CITY;
}
// låda med fönster i rätt skala (en ruta = 4 m bred, 3,2 m hög)
function buildingGeo(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
  const uv = g.attributes.uv, n = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const ax = Math.abs(n.getX(i)) > 0.5 ? d : w;
    uv.setXY(i, uv.getX(i) * ax / 16, uv.getY(i) * h / 25.6);
  }
  return g;
}
function neonTex(word, col) {
  return canvasTex(512, 160, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.font = 'italic 900 112px "Exo 2", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.shadowColor = col; c.shadowBlur = 28; c.fillStyle = col;
    for (let k = 0; k < 3; k++) c.fillText(word, w / 2, h / 2 + 6);
    c.shadowBlur = 0; c.fillStyle = '#ffffff'; c.globalAlpha = 0.85; c.fillText(word, w / 2, h / 2 + 6);
  });
}
function glowSpriteTex(rgb) {
  return canvasTex(64, 64, (c) => {
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, `rgba(${rgb},1)`); g.addColorStop(0.3, `rgba(${rgb},0.5)`); g.addColorStop(1, `rgba(${rgb},0)`);
    c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  });
}
function buildCity(ctx, terr) {
  const { scene, track: T } = ctx, M = cityMats(), HWb = T.halfW;
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const W = terr.x1 - terr.x0, D = terr.z1 - terr.z0;
  const occ = new Set(), CELL = 34;
  const geos = [];
  const signs = [];
  for (let n = 0; n < 40000 && geos.length < 900; n++) {
    const x = terr.x0 + rnd() * W, z = terr.z0 + rnd() * D;
    const dist = terr.distAt(x, z);
    if (dist < HWb + 24 || dist > 900 || terr.valleyAt(x, z) > 0.05) continue;
    if (Math.hypot(x, z) < 160 && dist < 80) continue;
    const key = Math.floor(x / CELL) + '|' + Math.floor(z / CELL);
    if (occ.has(key)) continue;
    occ.add(key);
    const far = Math.min(1, dist / 600);
    const w = 14 + rnd() * 14, d = 14 + rnd() * 14, h = 12 + rnd() * (30 + far * 70) + (rnd() < 0.12 ? 60 : 0);
    const g = buildingGeo(w, h, d).rotateY(rnd() * 0.3 - 0.15).translate(x, terr.heightAt(x, z) - 0.5, z);
    geos.push({ g, x, z });
    if (dist < 140 && rnd() < 0.35) signs.push({ x, z, y: terr.heightAt(x, z) + Math.min(h - 4, 10 + rnd() * 14), w, d });
  }
  // slå ihop i bitar (för culling)
  const CH = 600, chunks = new Map();
  for (const b of geos) {
    const k = Math.floor(b.x / CH) + '|' + Math.floor(b.z / CH);
    if (!chunks.has(k)) chunks.set(k, { list: [], cx: (Math.floor(b.x / CH) + 0.5) * CH, cz: (Math.floor(b.z / CH) + 0.5) * CH });
    chunks.get(k).list.push(b.g);
  }
  const out = [];
  for (const ch of chunks.values()) {
    const m = new THREE.Mesh(mergeGeometries(ch.list), M.facade);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    out.push({ mesh: m, cx: ch.cx, cz: ch.cz });
  }
  // neonskyltar mot vägen
  const words = [['KNUFF', '#ff3bd6'], ['PIZZA', '#ffd21f'], ['BIO', '#2bd6e8'], ['HOTELL', '#ff5a5a'], ['SUSHI', '#7aff6a'], ['GYM', '#b06aff'],
    ['TURBO', '#ff8a2a'], ['KAFÉ', '#ffe28a'], ['GLASS', '#ff9ec7'], ['ARKAD', '#5bff9a'], ['DISCO', '#ff3b6b'], ['NATTÖPPET', '#6ab8ff']];
  const texCache = new Map();
  signs.forEach((s, k) => {
    const [word, col] = words[k % words.length];
    if (!texCache.has(word)) texCache.set(word, new THREE.MeshBasicMaterial({ map: neonTex(word, col), transparent: true, toneMapped: false, side: THREE.DoubleSide, depthWrite: false }));
    const p = T.project(s.x, s.z, -1, {});
    const f = T.sampleAt(p.s);
    const toRoad = Math.atan2(f.x - s.x, f.z - s.z);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(13, 4), texCache.get(word));
    sign.position.set(s.x + Math.sin(toRoad) * (Math.max(s.w, s.d) / 2 + 0.4), s.y, s.z + Math.cos(toRoad) * (Math.max(s.w, s.d) / 2 + 0.4));
    sign.rotation.y = toRoad;
    scene.add(sign);
  });
  roadLamps(ctx);
  return out;
}

// gatlyktor längs vägen (stolpe + arm + lampa, och ett sken i ett enda punktmoln)
function roadLamps(ctx, { every = 42, rgb = '255,225,170', head: headC = 0xfff1c8, post: postC = 0x2a2c33, size = 9 } = {}) {
  const { scene, track: T } = ctx, HWb = T.halfW;
  const lamps = [];
  for (let s = 20; s < T.L; s += every) {
    const i = T.idx(s);
    if (T.flags[i] & (F_GAP | F_TUNNEL | F_BRIDGE)) continue;      // (inga lyktor som hänger i luften vid broarna)
    for (const sd of [-1, 1]) lamps.push([i, sd]);
  }
  const post = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.2, 9, 6).translate(0, 4.5, 0), new THREE.MeshLambertMaterial({ color: postC }), lamps.length);
  const head = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.25, 2.2), new THREE.MeshBasicMaterial({ color: headC, toneMapped: false }), lamps.length);
  const gpos = new Float32Array(lamps.length * 3);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  lamps.forEach(([i, sd], k) => {
    const lat = sd * (HWb + 2.2);
    const x = T.px[i] + T.rx[i] * lat, z = T.pz[i] + T.rz[i] * lat, y = T.py[i] + T.ry[i] * lat;
    m4.compose(v.set(x, y, z), q, one); post.setMatrixAt(k, m4);
    const hx = T.px[i] + T.rx[i] * (lat - sd * 2.2), hz = T.pz[i] + T.rz[i] * (lat - sd * 2.2);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(T.hx[i], T.hz[i]));
    m4.compose(v.set(hx, y + 8.9, hz), q, one); head.setMatrixAt(k, m4); q.identity();
    gpos.set([hx, y + 8.6, hz], k * 3);
  });
  scene.add(post, head);
  const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.BufferAttribute(gpos, 3));
  const glow = new THREE.Points(gg, new THREE.PointsMaterial({ map: glowSpriteTex(rgb), size, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  glow.frustumCulled = false;
  scene.add(glow);
}

// ---------- Berg: vulkaner, platåberg och stadssiluett ----------
function buildMountainsThemed(ctx, terr) {
  const th = ctx.theme;
  if (th.mtnShape === 'cone') return buildMountains(ctx, terr);
  if (th.mtnShape === 'wire') {
    // neonberg: mörka toppar med lysande kanter (ingen dimma på linjerna — de ska synas långt)
    const m = buildMountains(ctx, terr);
    const lines = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 20), new THREE.LineBasicMaterial({ color: 0x2bf0ff, fog: false, transparent: true, opacity: 0.75 }));
    lines.frustumCulled = false;
    ctx.scene.add(lines);
    return [];
  }
  const cx = (terr.x0 + terr.x1) / 2, cz = (terr.z0 + terr.z1) / 2;
  const R0 = Math.max(terr.x1 - terr.x0, terr.z1 - terr.z0) * 0.55;
  const [topC, rockC, lowC] = th.mtn.map(h => new THREE.Color(h));
  const geos = [], tops = [];
  if (th.mtnShape === 'gumdrop') {
    // gelébergen: runda kupoler i godisfärger, några med vit glasyr på toppen
    const pal = [0xff8ac8, 0x8ee8c8, 0xffe27a, 0xc8a0ff, 0xffb070, 0x8ad0ff, 0xff6a8a].map(h => new THREE.Color(h)), white = new THREE.Color(0xfff6fb), c = new THREE.Color();
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * Math.PI * 2 + hash1(k) * 0.1, r = R0 + 300 + hash1(k + 50) * 1800;
      const height = 260 + hash1(k + 90) * 560, rad = 650 + hash1(k + 130) * 800;
      const g = new THREE.SphereGeometry(rad, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, height / rad, 1).toNonIndexed();
      const p = g.attributes.position, col = new Float32Array(p.count * 3), base = pal[k % pal.length], frost = k % 3 === 0;
      for (let i = 0; i < p.count; i += 3) {
        const t = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3 / height;
        c.copy(frost && t > 0.78 ? white : base).multiplyScalar(0.94 + hash1(i + k * 7) * 0.1);   // sockerkorn
        for (let j = 0; j < 3; j++) { col[(i + j) * 3] = c.r; col[(i + j) * 3 + 1] = c.g; col[(i + j) * 3 + 2] = c.b; }
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.deleteAttribute('uv');
      g.translate(cx + Math.cos(a) * r * 1.25, -40, cz + Math.sin(a) * r);
      geos.push(g);
    }
    const g = mergeGeometries(geos);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    m.frustumCulled = false;
    ctx.scene.add(m);
    return [];
  }
  if (th.mtnShape === 'skyline') {
    const M = cityMats(), list = [];
    for (let k = 0; k < 160; k++) {
      const a = (k / 160) * Math.PI * 2 + hash1(k) * 0.03, r = R0 + 200 + hash1(k + 50) * 1300;
      const w = 50 + hash1(k + 7) * 110, h = 120 + hash1(k + 90) * 330;
      list.push(buildingGeo(w, h, w * (0.7 + hash1(k + 3) * 0.6)).translate(cx + Math.cos(a) * r * 1.2, -40, cz + Math.sin(a) * r));
    }
    const m = new THREE.Mesh(mergeGeometries(list), M.facade);
    m.frustumCulled = false;
    ctx.scene.add(m);
    return [];
  }
  const N = th.mtnShape === 'mesa' ? 34 : 30;
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2 + hash1(k) * 0.12, r = R0 + 300 + hash1(k + 50) * 1800;
    let g, height, rad;
    if (th.mtnShape === 'mesa') {
      height = 160 + hash1(k + 90) * 260; rad = 500 + hash1(k + 130) * 700;
      g = new THREE.CylinderGeometry(rad * (0.62 + hash1(k + 5) * 0.15), rad, height, 10, 6).toNonIndexed();
    } else {
      height = 420 + hash1(k + 90) * 700; rad = 700 + hash1(k + 130) * 800;
      g = new THREE.CylinderGeometry(rad * 0.1, rad, height, 11, 5, true).toNonIndexed();
    }
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y < height / 2 - 1) {
        const jx = p.getX(i), jz = p.getZ(i), n = vnoise(jx * 0.004 + k * 3.1, jz * 0.004 + y * 0.003) * 0.18;
        p.setX(i, jx * (1 + n)); p.setZ(i, jz * (1 + n));
      }
    }
    const col = new Float32Array(p.count * 3), c = new THREE.Color();
    for (let i = 0; i < p.count; i += 3) {
      const ym = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3, t = (ym + height / 2) / height;
      if (th.mtnShape === 'mesa') c.copy(t > 0.97 ? lowC : (Math.floor(t * 9) % 2 ? rockC : topC));
      else c.copy(t > 0.86 ? topC : (t < 0.2 ? lowC : rockC)).lerp(topC, t > 0.7 && hash1(i + k) > 0.8 ? 0.6 : 0);  // lavaströmmar nerför sidan
      for (let j = 0; j < 3; j++) { col[(i + j) * 3] = c.r; col[(i + j) * 3 + 1] = c.g; col[(i + j) * 3 + 2] = c.b; }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.deleteAttribute('uv');
    const X = cx + Math.cos(a) * r * 1.25, Z = cz + Math.sin(a) * r;
    g.translate(X, height / 2 - 60, Z);
    geos.push(g);
    if (th.mtnShape === 'volcano') tops.push({ x: X, y: height - 60, z: Z, r: rad * 0.1, big: height > 800 });
  }
  const g = mergeGeometries(geos);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
  m.frustumCulled = false;
  ctx.scene.add(m);
  // vulkanerna: glöd i kratern + rökpelare
  if (th.mtnShape === 'volcano') {
    const glowM = new THREE.SpriteMaterial({ map: glowSpriteTex('255,110,30'), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
    const smokeT = canvasTex(128, 128, (c) => { const gr = c.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(40,30,32,0.9)'); gr.addColorStop(1, 'rgba(40,30,32,0)'); c.fillStyle = gr; c.fillRect(0, 0, 128, 128); });
    const smokeM = new THREE.SpriteMaterial({ map: smokeT, transparent: true, depthWrite: false });
    ctx.plumes = [];
    for (const t of tops) {
      const s = new THREE.Sprite(glowM); s.position.set(t.x, t.y + 20, t.z); s.scale.setScalar(t.r * 3.2); ctx.scene.add(s);
      if (!t.big) continue;
      for (let k = 0; k < 6; k++) {
        const p = new THREE.Sprite(smokeM.clone()); p.position.set(t.x, t.y + 60 + k * 90, t.z); p.scale.setScalar(160 + k * 70);
        ctx.scene.add(p); ctx.plumes.push({ s: p, base: t, k });
      }
    }
    ctx.volcanoTops = tops;
  }
  return [];
}

// ---------- Dalarnas botten: is, lava eller sand ----------
function lavaTex() {
  const t = canvasTex(256, 256, (c, w, h) => {
    const img = c.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = fbm(x / 28, y / 28, 4), m = Math.abs(fbm(x / 14 + 7, y / 14 - 3, 3));
      const hot = Math.max(0, 1 - m * 4.2);
      const o = (y * w + x) * 4;
      img.data[o] = 120 + 120 * hot + n * 30; img.data[o + 1] = 20 + 150 * hot * hot + n * 15; img.data[o + 2] = 6 + 60 * hot * hot * hot; img.data[o + 3] = 255;
    }
    c.putImageData(img, 0, 0);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function sandBedTex() {
  const t = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#d9a868'; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(150,100,60,0.35)'; c.lineWidth = 3;
    for (let y = 0; y < h; y += 12) { c.beginPath(); for (let x = 0; x <= w; x += 8) c.lineTo(x, y + Math.sin(x * 0.05 + y) * 4); c.stroke(); }
    c.strokeStyle = 'rgba(110,70,40,0.5)'; c.lineWidth = 2;
    for (let k = 0; k < 30; k++) { c.beginPath(); let x = Math.random() * w, y = Math.random() * h; c.moveTo(x, y); for (let n = 0; n < 4; n++) { x += (Math.random() - 0.5) * 40; y += (Math.random() - 0.5) * 30; c.lineTo(x, y); } c.stroke(); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ---------- Lava längs kanterna (F_LAVA): glödande remsor innanför murarna — bränner den som kör i ----------
export const LAVA_IN = 3.6;          // hur långt in från muren lavan går
function buildLava(ctx) {
  const { scene, track: T } = ctx;
  const tex = lavaTex();
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const runs = segRuns(T, (k) => !!(T.flags[k % T.N] & F_LAVA) && !!(T.flags[(k + 1) % T.N] & F_LAVA));
  const HW = T.halfW;
  let n = 0;
  for (const [a, b] of runs) {
    if (!(T.flags[a % T.N] & F_LAVA)) continue;
    for (const sd of [-1, 1]) {
      const g = stripGeo(T, sd < 0 ? -HW : HW - LAVA_IN, sd < 0 ? -HW + LAVA_IN : HW, 0.05, 14, a, b);
      scene.add(new THREE.Mesh(g, mat)); n++;
    }
    const sMid = ((a + b) / 2) * T.ds;
    for (const sd of [-1, 1]) boardAt(ctx, sMid - (b - a) * T.ds / 2 - 90, sd * (T.halfW + 4), signTex('LAVA!', 'HÅLL MITTEN', '#ff6a1e'));
  }
  return n ? tex : null;
}

// ---------- Luften: aska + glöd, ökendamm eller snö kring kameran; eldklot över vulkanbanan ----------
const AIR = {
  ash0: new THREE.Color(0xffb050), ash1: new THREE.Color(0xff3a10), dark0: new THREE.Color(0x2a2224), dark1: new THREE.Color(0x4a3e40),
  dust0: new THREE.Color(0xf0d0a0), dust1: new THREE.Color(0xd8b080), snow0: new THREE.Color(0xffffff), snow1: new THREE.Color(0xdff2ff),
  leaf: [0xe8761e, 0xc8321e, 0xf4c22a, 0xb8501a].map(h => new THREE.Color(h)),
  spr: [0xff4a8e, 0x4ad8ff, 0xffe24a, 0x7aff8a, 0xffffff, 0xb07aff].map(h => new THREE.Color(h)),
  wisp0: new THREE.Color(0x8aff9a), wisp1: new THREE.Color(0xb06aff), slime0: new THREE.Color(0xc8ff6a), slime1: new THREE.Color(0x3aff4a),
};
function makeAir(ctx) {
  const th = ctx.theme, T = ctx.track, terr = ctx.terr;
  const balls = [];
  let fbT = 2;
  const ballM = new THREE.MeshBasicMaterial({ color: 0xffa040, toneMapped: false });
  const ballG = new THREE.SphereGeometry(1.6, 10, 8);
  const glowM = th.mtnShape === 'volcano' ? new THREE.SpriteMaterial({ map: glowSpriteTex('255,140,40'), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }) : null;
  return (dt, time, cam, fx, onBoom) => {
    if (!fx || !cam) return;
    const r = (s) => (Math.random() * 2 - 1) * s;
    if (th.air === 'ash') {
      for (let k = 0; k < 3; k++) fx.glow.spawn(cam.x + r(45), cam.y - 4 + Math.random() * 12, cam.z + r(45), r(0.6), 0.6 + Math.random(), r(0.6), 3 + Math.random() * 2, 0.18, 0.05, AIR.ash0, AIR.ash1, 1, -0.2, 0.2);
      if (Math.random() < 0.6) fx.puff.spawn(cam.x + r(40), cam.y + 8 + Math.random() * 8, cam.z + r(40), r(1), -0.8, r(1), 5, 0.25, 0.2, AIR.dark0, AIR.dark1, 0.7, 0.4, 0.3);
    } else if (th.air === 'dust') {
      for (let k = 0; k < 2; k++) fx.puff.spawn(cam.x + r(50), cam.y - 3 + Math.random() * 6, cam.z + r(50), 3 + r(1), r(0.3), 1 + r(1), 4, 0.6, 3.5, AIR.dust0, AIR.dust1, 0.22, 0, 0.1);
    } else if (th.air === 'snow') {
      for (let k = 0; k < 4; k++) fx.puff.spawn(cam.x + r(45), cam.y + 6 + Math.random() * 14, cam.z + r(45), r(0.8), -2.5, r(0.8), 6, 0.22, 0.2, AIR.snow0, AIR.snow1, 0.9, 0.2, 0.1);
    } else if (th.air === 'leaves') {
      // höstlöv som singlar ner
      for (let k = 0; k < 2; k++) { const c = AIR.leaf[Math.floor(Math.random() * AIR.leaf.length)]; fx.puff.spawn(cam.x + r(45), cam.y + 5 + Math.random() * 14, cam.z + r(45), r(1.6), -1.4, r(1.6), 6, 0.34, 0.3, c, c, 0.95, 0.15, 0.25); }
    } else if (th.air === 'sprinkles') {
      // strössel i luften
      for (let k = 0; k < 2; k++) { const c = AIR.spr[Math.floor(Math.random() * AIR.spr.length)]; fx.puff.spawn(cam.x + r(45), cam.y + 5 + Math.random() * 14, cam.z + r(45), r(0.8), -2.2, r(0.8), 5, 0.22, 0.2, c, c, 0.95, 0.2, 0.1); }
    } else if (th.air === 'wisps') {
      // irrbloss: gröna och lila sken som stiger långsamt
      if (Math.random() < 0.5) fx.glow.spawn(cam.x + r(60), cam.y - 3 + Math.random() * 8, cam.z + r(60), r(0.5), 0.6, r(0.5), 3.5, 0.5, 1.1, AIR.wisp0, AIR.wisp1, 0.55, -0.1, 0.1);
    }
    // bubblor i slemträsket när man är i närheten
    for (const sp of ctx.slimeSpots || []) {
      if ((sp.x - cam.x) ** 2 + (sp.z - cam.z) ** 2 > 700 * 700) continue;
      for (let k = 0; k < 2; k++) {
        const u = r(sp.lv * 0.7), w = r(16);
        fx.glow.spawn(sp.x + sp.ax * u + sp.az * w, sp.y, sp.z + sp.az * u - sp.ax * w, 0, 1.5 + Math.random() * 2, 0, 1.4, 1.2, 2.6, AIR.slime0, AIR.slime1, 0.7, 0, 0.3);
      }
    }
    // eldklot: kastas från rökhimlen och slår ner en bit från vägen (bara syns och hörs)
    if (glowM) {
      fbT -= dt;
      if (fbT <= 0) {
        fbT = 2.2 + Math.random() * 2.5;
        for (let tries = 0; tries < 8; tries++) {
          const a = Math.random() * Math.PI * 2, d = 70 + Math.random() * 220;
          const tx = cam.x + Math.cos(a) * d, tz = cam.z + Math.sin(a) * d;
          if (terr.distAt(tx, tz) < T.halfW + 22) continue;
          const ty = terr.heightAt(tx, tz), fl = 3.4 + Math.random() * 1.2;
          const sx = tx + r(400), sz = tz + r(400), sy = ty + 260 + Math.random() * 120;
          const g = 9.8, vx = (tx - sx) / fl, vz = (tz - sz) / fl, vy = (ty - sy) / fl + 0.5 * g * fl;
          const m = new THREE.Mesh(ballG, ballM), s = new THREE.Sprite(glowM);
          s.scale.setScalar(14); m.add(s); m.position.set(sx, sy, sz);
          ctx.scene.add(m);
          balls.push({ m, vx, vy, vz, g });
          break;
        }
      }
      for (const b of balls) {
        b.vy -= b.g * dt;
        b.m.position.x += b.vx * dt; b.m.position.y += b.vy * dt; b.m.position.z += b.vz * dt;
        fx.fire(b.m.position, { x: 0, y: 0, z: 0 }, 2.2);
        if (Math.random() < 0.7) fx.smoke(b.m.position, { x: 0, y: 0, z: 0 }, true, 1.4);
        if (b.m.position.y < terr.heightAt(b.m.position.x, b.m.position.z)) {
          b.dead = true; ctx.scene.remove(b.m);
          fx.explosion(b.m.position, { x: 0, y: 0, z: 0 });
          onBoom?.(b.m.position);
        }
      }
      for (let i = balls.length - 1; i >= 0; i--) if (balls[i].dead) balls.splice(i, 1);
    }
  };
}

// ---------- Djungeln: palmer, lövträd, buskar med blommor ----------
function palmGeo() {
  const parts = [];
  let x = 0, y = 0, lean = 0;
  for (let k = 0; k < 6; k++) {                       // böjd stam
    const h = 1.6, seg = new THREE.CylinderGeometry(0.28 - k * 0.02, 0.32 - k * 0.02, h, 7).translate(0, h / 2, 0).rotateZ(-lean).translate(x, y, 0);
    parts.push(colorGeo(seg, k % 2 ? 0x8a6a42 : 0x7a5a36));
    x += Math.sin(lean) * h; y += Math.cos(lean) * h; lean += 0.07;
  }
  for (let k = 0; k < 8; k++) {                       // blad som hänger
    const a = (k / 8) * Math.PI * 2;
    const leaf = new THREE.BoxGeometry(0.9, 0.06, 4.2).translate(0, 0, 2.1).rotateX(0.55).rotateY(a).translate(x, y + 0.2, 0);
    parts.push(colorGeo(leaf, k % 2 ? 0x3f9a3a : 0x2f8a34));
  }
  parts.push(colorGeo(new THREE.SphereGeometry(0.45, 7, 5).translate(x, y - 0.1, 0), 0x6a4a22));   // kokosnötter
  return mergeColored(parts);
}
function broadleafGeo() {
  const parts = [colorGeo(new THREE.CylinderGeometry(0.5, 0.8, 9, 7).translate(0, 4.5, 0), 0x5a4030)];
  for (const [x, y, z, r, c] of [[0, 10, 0, 4.2, 0x2f6a2a], [2.6, 8.6, 1, 3, 0x3f8a34], [-2.4, 9, -1.2, 3.2, 0x356f2c], [0.6, 12, -0.8, 2.8, 0x4a9a3a]]) {
    parts.push(colorGeo(new THREE.IcosahedronGeometry(r, 0).scale(1, 0.7, 1).translate(x, y, z), c));
  }
  return mergeColored(parts);
}
function jungleBushGeo() {
  const parts = [];
  for (const [x, z, r] of [[0, 0, 1.4], [1.2, 0.5, 1], [-1, 0.6, 1.1], [0.3, -1.1, 0.9]]) parts.push(colorGeo(new THREE.IcosahedronGeometry(r, 0).scale(1, 0.75, 1).translate(x, r * 0.6, z), 0x3aa040));
  for (const [x, y, z, c] of [[0.5, 1.5, 0.6, 0xff3b6b], [-0.6, 1.3, 0.3, 0xffd21f], [0.1, 1.6, -0.7, 0xff7a1a]]) parts.push(colorGeo(new THREE.SphereGeometry(0.22, 6, 4).translate(x, y, z), c));
  return mergeColored(parts);
}
// ---------- Månen: kratrar, stenblock och en månbas vid starten ----------
function craterGeo() {
  return mergeColored([
    colorGeo(new THREE.TorusGeometry(6, 1.3, 6, 18).rotateX(Math.PI / 2).scale(1, 0.35, 1).translate(0, 0.1, 0), 0xa2a2a8),
    colorGeo(new THREE.CircleGeometry(5.6, 18).rotateX(-Math.PI / 2).translate(0, -0.05, 0), 0x5e5e64),
  ]);
}
function moonBase(ctx, terr) {
  const T = ctx.track, s = T.wrapS(120), f = T.sampleAt(s);
  const white = new THREE.MeshStandardMaterial({ color: 0xeeeef2, roughness: 0.4, metalness: 0.2 });
  const panel = new THREE.MeshStandardMaterial({ color: 0x1a3a8a, roughness: 0.25, metalness: 0.6, emissive: 0x06102a });
  const lamp = new THREE.MeshBasicMaterial({ color: 0x9fe8ff, toneMapped: false });
  for (const sd of [-1, 1]) {
    const lat = sd * (T.halfW + 60);
    const cx = f.x + f.rx * lat, cz = f.z + f.rz * lat, cy = terr.heightAt(cx, cz);
    for (const [dx, dz, r] of [[0, 0, 9], [16, 6, 6], [-14, 8, 5.5]]) {
      const d = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), white);
      d.position.set(cx + dx, cy - 0.3, cz + dz); d.castShadow = true; ctx.scene.add(d);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.98, 0.18, 6, 24).rotateX(Math.PI / 2), lamp);
      ring.position.set(cx + dx, cy + 0.6, cz + dz); ctx.scene.add(ring);
    }
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 22, 6), white); mast.position.set(cx - 4, cy + 11, cz - 12); ctx.scene.add(mast);
    const dish = new THREE.Mesh(new THREE.SphereGeometry(3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3), white); dish.position.set(cx - 4, cy + 22, cz - 12); dish.rotation.x = -1; ctx.scene.add(dish);
    for (let k = 0; k < 4; k++) { const p = new THREE.Mesh(new THREE.BoxGeometry(6, 0.15, 3.2), panel); p.position.set(cx + 22 + k * 7, cy + 2.2, cz - 10); p.rotation.x = -0.5; ctx.scene.add(p); }
  }
}
// jorden på månhimlen (följer kameran — oändligt långt bort)
function earthMesh() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#1e5fb8'; g.fillRect(0, 0, 512, 256);
  for (let k = 0; k < 26; k++) { g.fillStyle = k % 3 ? '#3f8a3a' : '#8a7a4a'; g.beginPath(); g.ellipse(Math.random() * 512, 40 + Math.random() * 176, 20 + Math.random() * 60, 10 + Math.random() * 30, Math.random() * 3, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = 'rgba(255,255,255,0.75)'; for (let k = 0; k < 40; k++) { g.beginPath(); g.ellipse(Math.random() * 512, Math.random() * 256, 20 + Math.random() * 50, 4 + Math.random() * 8, 0, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 512, 14); g.fillRect(0, 242, 512, 14);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.SphereGeometry(420, 32, 16), new THREE.MeshLambertMaterial({ map: t, emissive: 0x0a1a30, fog: false }));
  m.frustumCulled = false;
  return m;
}
function waterTex() {
  const t = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#2a7ab8'; c.fillRect(0, 0, w, h);
    for (let k = 0; k < 90; k++) { c.strokeStyle = `rgba(${Math.random() < 0.5 ? '180,230,255' : '20,80,140'},0.45)`; c.lineWidth = 2; c.beginPath(); const x = Math.random() * w, y = Math.random() * h; c.moveTo(x, y); c.quadraticCurveTo(x + 14, y - 6, x + 28, y); c.stroke(); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function dustBedTex() {
  const t = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#6a6a70'; c.fillRect(0, 0, w, h);
    for (let k = 0; k < 60; k++) { c.fillStyle = `rgba(${Math.random() < 0.5 ? '40,40,46' : '150,150,156'},0.4)`; c.beginPath(); c.arc(Math.random() * w, Math.random() * h, 2 + Math.random() * 12, 0, Math.PI * 2); c.fill(); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ============================================================================================
// ---------- Nya teman: strand, höstskog, spöknatt, godisland och neonnatt ----------
// ============================================================================================
// färg per triangel efter mittpunkten (ränder, sektorer, prickar)
function colorBy(geo, fn) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g.attributes.uv) g.deleteAttribute('uv');
  const p = g.attributes.position, a = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i += 3) {
    c.set(fn((p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3, (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3, i / 3));
    for (let j = 0; j < 3; j++) { a[(i + j) * 3] = c.r; a[(i + j) * 3 + 1] = c.g; a[(i + j) * 3 + 2] = c.b; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
const sector = (x, z, n) => Math.floor((Math.atan2(z, x) / (Math.PI * 2) + 1) * n) % n;
// stav mellan två punkter
function barGeo(a, b, r, hex, seg = 4) {
  const A = new THREE.Vector3(...a), d = new THREE.Vector3(...b).sub(A), len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg).translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  return colorGeo(g.translate(A.x, A.y, A.z), hex);
}
function recolor(geo, hex) {
  const c = new THREE.Color(hex), a = geo.attributes.color;
  for (let i = 0; i < a.count; i++) a.setXYZ(i, c.r, c.g, c.b);
  return geo;
}
// en sak vid banan (s, sida) på marken, vänd mot vägen
function placeProp(ctx, s, lat, obj, rot = 0) {
  const T = ctx.track, f = T.sampleAt(T.wrapS(s));
  const x = f.x + f.rx * lat, z = f.z + f.rz * lat;
  obj.position.set(x, ctx.terr.heightAt(x, z) - 0.2, z);
  obj.rotation.y = Math.atan2(-Math.sign(lat) * f.rx, -Math.sign(lat) * f.rz) + rot;
  obj.traverse(o => { if (o.isMesh) o.castShadow = true; });
  ctx.scene.add(obj);
  return obj;
}
const lamMesh = (geo) => new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
const glowMesh = (geo) => new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
// hav/slätt utanför terrängen (havet runt stranden, neonrutnätet ut till horisonten)
function buildFloor(ctx, terr) {
  const cx = (terr.x0 + terr.x1) / 2, cz = (terr.z0 + terr.z1) / 2, S = 40000;
  const g = new THREE.PlaneGeometry(S, S).rotateX(-Math.PI / 2).translate(cx, 0, cz);
  let mat;
  if (ctx.theme.sea) {
    const tex = ctx.seaTex = seaTex();
    tex.repeat.set(S / 90, S / 90);
    mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, opacity: 0.8, emissive: 0x0c4c5c });
  } else {
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 24, p.getZ(i) / 24);
    mat = new THREE.MeshLambertMaterial({ color: ctx.theme.ground[0], emissive: 0xffffff, emissiveMap: (ctx.gridTex ||= gridTex()) });
  }
  const m = new THREE.Mesh(g, mat);
  m.position.y = ctx.floorY;
  m.receiveShadow = true; m.frustumCulled = false;
  ctx.scene.add(m);
}
// rita med omslag (sömlösa rutor)
function wrapDraw(c, w, h, x, y, draw) { for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) draw(x + dx, y + dy); }
function seaTex() {
  const t = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#29b2c6'; c.fillRect(0, 0, w, h);
    for (let k = 0; k < 160; k++) {
      c.strokeStyle = `rgba(${Math.random() < 0.6 ? '225,255,255' : '18,110,150'},0.5)`; c.lineWidth = 2;
      wrapDraw(c, w, h, Math.random() * w, Math.random() * h, (x, y) => { c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 10, y - 5, x + 20, y); c.stroke(); });
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function gridTex() {
  const t = canvasTex(128, 128, (c, w, h) => {
    c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,43,214,0.3)'; c.fillRect(0, 0, w, 8); c.fillRect(0, 0, 8, h);   // skenet runt linjen
    c.fillStyle = '#ff2bd6'; c.fillRect(0, 2, w, 4); c.fillRect(2, 0, 4, h);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function slimeTex() {
  const t = canvasTex(256, 256, (c, w, h) => {
    const img = c.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = fbm(x / 22, y / 22, 4), m = Math.abs(fbm(x / 11 + 3, y / 11 - 7, 3)), hot = Math.max(0, 1 - m * 3.5);
      const o = (y * w + x) * 4;
      img.data[o] = 40 + 120 * hot + n * 20; img.data[o + 1] = 150 + 100 * hot + n * 30; img.data[o + 2] = 24 + 70 * hot * hot; img.data[o + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    c.strokeStyle = 'rgba(225,255,170,0.75)'; c.lineWidth = 2;
    for (let k = 0; k < 40; k++) { c.beginPath(); c.arc(Math.random() * w, Math.random() * h, 2 + Math.random() * 6, 0, Math.PI * 2); c.stroke(); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function chocoTex() {
  const t = canvasTex(256, 256, (c, w, h) => {
    const img = c.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = fbm(x / 30, y / 16, 4), sw = Math.sin(x * 0.049 + n * 7), cream = Math.max(0, sw - 0.82) * 4;
      const o = (y * w + x) * 4;
      img.data[o] = 92 + 26 * sw + 120 * cream; img.data[o + 1] = 50 + 16 * sw + 110 * cream; img.data[o + 2] = 30 + 10 * sw + 90 * cream; img.data[o + 3] = 255;
    }
    c.putImageData(img, 0, 0);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ---------- Stranden: palmer, parasoll, badbollar, sandslott, surfbrädor, livräddartorn ----------
function umbrellaGeo(cA, cB) {
  return mergeColored([
    colorGeo(new THREE.CylinderGeometry(0.08, 0.08, 4.4, 5).translate(0, 2.2, 0), 0xf4f4f4),
    colorBy(new THREE.ConeGeometry(2.8, 1.0, 12, 1).translate(0, 4.3, 0), (x, y, z) => sector(x, z, 12) % 2 ? cA : cB),
    colorGeo(new THREE.SphereGeometry(0.14, 5, 4).translate(0, 4.85, 0), cA),
  ]).rotateZ(0.12);
}
function beachBallGeo() {
  const cols = [0xff3b3b, 0xffffff, 0x2b7bff, 0xffd21f, 0xffffff, 0x2bc84a];
  return mergeColored([colorBy(new THREE.SphereGeometry(1.4, 12, 8).translate(0, 1.4, 0), (x, y, z) => Math.abs(y - 1.4) > 1.25 ? 0xffffff : cols[sector(x, z, 6)])]);
}
function sandcastleGeo() {
  const S = 0xe8c888, D = 0xd4ac68, parts = [colorGeo(new THREE.BoxGeometry(3.4, 1.4, 3.4).translate(0, 0.7, 0), S)];
  for (const [x, z] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) {
    parts.push(colorGeo(new THREE.CylinderGeometry(0.6, 0.7, 2.2, 8).translate(x, 1.1, z), S), colorGeo(new THREE.ConeGeometry(0.75, 0.9, 8).translate(x, 2.65, z), D));
  }
  parts.push(colorGeo(new THREE.CylinderGeometry(0.9, 1.0, 3.0, 8).translate(0, 1.5, 0), S), colorGeo(new THREE.ConeGeometry(1.05, 1.3, 8).translate(0, 3.65, 0), D));
  parts.push(colorGeo(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 4).translate(0, 4.8, 0), 0x6a4a2a), colorGeo(new THREE.BoxGeometry(0.8, 0.45, 0.05).translate(0.4, 5.2, 0), 0xff3b3b));
  return mergeColored(parts);
}
function surfboardGeo(c, s) {
  return mergeColored([
    colorBy(new THREE.CylinderGeometry(0.42, 0.42, 3.2, 10, 1).scale(1, 1, 0.2).translate(0, 1.6, 0), (x) => Math.abs(x) < 0.12 ? s : c),
    colorGeo(new THREE.SphereGeometry(0.42, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.6, 0.2).translate(0, 3.2, 0), c),
  ]).rotateZ(0.15);
}
function lifeguardGeo() {
  const W = 0xffffff, R = 0xe8282e, parts = [];
  for (const [x, z] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) parts.push(barGeo([x, 0, z], [x * 0.7, 4.2, z * 0.7], 0.14, W, 6));
  parts.push(colorGeo(new THREE.BoxGeometry(3.6, 0.3, 3.6).translate(0, 4.3, 0), 0xd8b880));
  parts.push(colorBy(new THREE.BoxGeometry(2.6, 2.2, 2.6, 1, 4, 1).translate(0, 5.55, 0), (x, y) => Math.floor((y - 4.45) * 1.8) % 2 ? W : R));
  parts.push(colorGeo(new THREE.ConeGeometry(2.4, 1.2, 4).rotateY(Math.PI / 4).translate(0, 7.25, 0), R));
  parts.push(barGeo([0, 7.8, 0], [0, 10.5, 0], 0.06, W), colorGeo(new THREE.BoxGeometry(1.2, 0.7, 0.05).translate(0.6, 10.1, 0), R));
  for (let k = 0; k < 6; k++) parts.push(colorGeo(new THREE.BoxGeometry(1.0, 0.1, 0.25).translate(0, 0.6 + k * 0.62, 2.0 - k * 0.12), W));   // stege
  return mergeColored(parts);
}
function hutGeo(c) {
  return mergeColored([
    colorBy(new THREE.BoxGeometry(3.6, 3.2, 3.6, 6, 1, 6).translate(0, 1.6, 0), (x, y, z) => Math.floor((x + z + 10) * 1.2) % 2 ? c : 0xffffff),
    colorGeo(new THREE.ConeGeometry(3.3, 1.8, 4).rotateY(Math.PI / 4).translate(0, 4.1, 0), c),
    colorGeo(new THREE.BoxGeometry(1.2, 2.0, 0.1).translate(0, 1.0, 1.82), 0x3a2a2a),
  ]);
}
function buildBeach(ctx, terr, lam) {
  const land = ctx.seaY + 1.2;
  const out = scatter(ctx, terr, [palmGeo(), jungleBushGeo(), rockGeo(0xa89a88, 0.7)], [0.58, 0.24, 0.18], 2800, lam, 9, { minY: land, CH: 800 });
  out.push(...scatter(ctx, terr, [umbrellaGeo(0xff4a5a, 0xffffff), umbrellaGeo(0x2bb4ff, 0xffe45a), beachBallGeo(), sandcastleGeo(), surfboardGeo(0xff8a2a, 0xffffff), surfboardGeo(0x2bc8d8, 0xffe45a)],
    [0.22, 0.2, 0.16, 0.14, 0.14, 0.14], 650, lam, 6, { seed: 19, maxD: 170, minY: land, CH: 900 }));
  // vid starten: livräddartorn, badhytter, parasoll och badbollar
  const HW = ctx.track.halfW;
  placeProp(ctx, -95, -(HW + 24), lamMesh(lifeguardGeo()));
  [0xff5a8a, 0x2bb4ff, 0xffc21a, 0x3ac86a].forEach((c, k) => placeProp(ctx, 10 + k * 12, HW + 22, lamMesh(hutGeo(c))));
  for (const [s, lat, g] of [[-40, -(HW + 12), umbrellaGeo(0xff4a5a, 0xffffff)], [-25, -(HW + 15), umbrellaGeo(0x2bb4ff, 0xffe45a)], [-60, -(HW + 14), beachBallGeo()], [75, HW + 13, umbrellaGeo(0xffc21a, 0xffffff)], [90, HW + 12, sandcastleGeo()]]) placeProp(ctx, s, lat, lamMesh(g));
  return out;
}

// ---------- Höstskogen: röda, orange och gula lövträd, björkar, granar, flugsvampar, en röd stuga ----------
function leafTreeGeo(pal, birch = false) {
  const parts = [];
  if (birch) {
    parts.push(colorBy(new THREE.CylinderGeometry(0.3, 0.42, 9, 6, 8).translate(0, 4.5, 0), (x, y, z, k) => (Math.floor(y * 1.4) % 3 === 0 && hash1(k) > 0.3) ? 0x2a2626 : 0xf2efe8));
    for (const [x, y, z, r] of [[0, 9.6, 0, 2.4], [1.2, 8, 0.6, 1.9], [-1.1, 8.4, -0.5, 1.9], [0.2, 11.2, 0.3, 1.6]]) parts.push(colorGeo(new THREE.IcosahedronGeometry(r, 0).scale(1, 1.25, 1).translate(x, y, z), pal[parts.length % pal.length]));
  } else {
    const B = 0x5a3a26;
    parts.push(colorGeo(new THREE.CylinderGeometry(0.45, 0.75, 7.5, 7).translate(0, 3.75, 0), B));
    parts.push(barGeo([0, 5, 0], [2, 7.6, 0.6], 0.2, B, 5), barGeo([0, 5.5, 0], [-1.8, 7.9, -0.8], 0.2, B, 5));
    for (const [x, y, z, r] of [[0, 9.6, 0, 3.6], [2.4, 8.4, 0.9, 2.7], [-2.3, 8.8, -1.0, 2.8], [0.6, 11.4, -0.7, 2.5], [-0.6, 8.2, 2.0, 2.4]]) parts.push(colorGeo(new THREE.IcosahedronGeometry(r, 0).scale(1, 0.8, 1).translate(x, y, z), pal[parts.length % pal.length]));
  }
  return mergeColored(parts);
}
function autumnBushGeo() {
  const parts = [];
  for (const [x, z, r, c] of [[0, 0, 1.4, 0xc8321e], [1.2, 0.5, 1.0, 0xe8761e], [-1.0, 0.6, 1.1, 0xa8281e], [0.3, -1.1, 0.9, 0xf0a02a]]) parts.push(colorGeo(new THREE.IcosahedronGeometry(r, 0).scale(1, 0.75, 1).translate(x, r * 0.6, z), c));
  return mergeColored(parts);
}
function mushroomGeo() {
  const parts = [colorGeo(new THREE.CylinderGeometry(0.35, 0.45, 1.6, 8).translate(0, 0.8, 0), 0xf6f0e4),
    colorGeo(new THREE.SphereGeometry(1.3, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.65, 1).translate(0, 1.5, 0), 0xe0201e)];
  for (let k = 0; k < 7; k++) {
    const a = k * 2.4, rr = k ? 0.85 : 0;
    parts.push(colorGeo(new THREE.SphereGeometry(0.17, 5, 4).scale(1, 0.5, 1).translate(Math.cos(a) * rr, 1.5 + Math.sqrt(1 - (rr / 1.3) ** 2) * 0.845, Math.sin(a) * rr), 0xffffff));
  }
  return mergeColored(parts);
}
function stugaGeo() {
  const R = 0xa8261e, W = 0xf4f0e8, parts = [colorGeo(new THREE.BoxGeometry(9, 4.2, 6.5).translate(0, 2.1, 0), R)];
  for (const [x, z] of [[-4.5, -3.25], [4.5, -3.25], [-4.5, 3.25], [4.5, 3.25]]) parts.push(colorGeo(new THREE.BoxGeometry(0.4, 4.3, 0.4).translate(x, 2.15, z), W));
  parts.push(colorGeo(new THREE.CylinderGeometry(4.3, 4.3, 9.8, 3).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2).scale(1, 0.62, 1).translate(0, 5.5, 0), 0x2e2a2c));
  for (const x of [-2.6, 2.6]) { parts.push(colorGeo(new THREE.BoxGeometry(1.5, 1.4, 0.2).translate(x, 2.5, 3.3), W), colorGeo(new THREE.BoxGeometry(1.1, 1.0, 0.25).translate(x, 2.5, 3.3), 0x2a3a4a)); }
  parts.push(colorGeo(new THREE.BoxGeometry(1.3, 2.4, 0.2).translate(0, 1.2, 3.3), W), colorGeo(new THREE.BoxGeometry(0.9, 2.1, 0.25).translate(0, 1.1, 3.3), 0x2a6a3a));
  parts.push(colorGeo(new THREE.BoxGeometry(0.9, 2.4, 0.9).translate(2.6, 7.2, -1), 0x8a3a2a));
  return mergeColored(parts);
}
function buildAutumn(ctx, terr, lam) {
  const ORANGE = [0xe8761e, 0xf0902a, 0xd8601a, 0xf4a83a], RED = [0xc8281e, 0xe0402a, 0xa81e1e, 0xd85a2a], YEL = [0xf4c22a, 0xffd84a, 0xe0a81e, 0xf0b830];
  const out = scatter(ctx, terr, [leafTreeGeo(ORANGE), leafTreeGeo(RED), leafTreeGeo(YEL, true), pineGeo(false), autumnBushGeo(), mushroomGeo()],
    [0.27, 0.21, 0.2, 0.13, 0.12, 0.07], 6200, lam, 9, { CH: 800 });
  const HW = ctx.track.halfW;
  placeProp(ctx, -90, -(HW + 30), lamMesh(stugaGeo()));
  for (const [s, lat] of [[-60, -(HW + 13)], [-45, -(HW + 16)], [40, HW + 14], [60, HW + 18]]) placeProp(ctx, s, lat, lamMesh(mushroomGeo()), s);
  placeProp(ctx, 20, HW + 26, lamMesh(leafTreeGeo(RED)));
  return out;
}

// ---------- Spökbanan: krokiga döda träd, gravstenar, kors, spöken och lysande pumpor ----------
function spookyTreeGeo() {
  const C = 0x2a2232, parts = [];
  let x = 0, y = 0, lean = 0;
  for (let k = 0; k < 5; k++) {                      // krokig stam
    const h = 2, r0 = 0.62 - k * 0.1;
    parts.push(colorGeo(new THREE.CylinderGeometry(r0 - 0.1, r0, h, 6).translate(0, h / 2, 0).rotateZ(lean).translate(x, y, 0), C));
    x -= Math.sin(lean) * h; y += Math.cos(lean) * h; lean += k % 2 ? -0.42 : 0.34;
  }
  for (const [a, y0, l, up] of [[0.4, 4.2, 3.4, 0.5], [2.7, 5.6, 3.0, 0.7], [4.5, 7.0, 2.6, 0.45], [1.6, 8.4, 2.2, 0.9]]) {
    const p0 = [0, y0, 0], p1 = [Math.cos(a) * l, y0 + up * l, Math.sin(a) * l];
    const p2 = [p1[0] + Math.cos(a + 0.9) * l * 0.5, p1[1] - 0.3, p1[2] + Math.sin(a + 0.9) * l * 0.5];
    const p3 = [p1[0] + Math.cos(a - 0.7) * l * 0.4, p1[1] + 0.8, p1[2] + Math.sin(a - 0.7) * l * 0.4];
    parts.push(barGeo(p0, p1, 0.16, C, 5), barGeo(p1, p2, 0.08, C), barGeo(p1, p3, 0.08, C));
  }
  return mergeColored(parts);
}
function graveGeo() {
  const S = 0x8e8a9c;
  return mergeColored([
    colorGeo(new THREE.BoxGeometry(1.8, 0.3, 1.0).translate(0, 0.15, 0), 0x5a5664),
    colorGeo(new THREE.BoxGeometry(1.4, 1.6, 0.35).translate(0, 1.1, 0), S),
    colorGeo(new THREE.CylinderGeometry(0.7, 0.7, 0.35, 10, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2).translate(0, 1.9, 0), S),
    colorGeo(new THREE.BoxGeometry(0.8, 0.12, 0.05).translate(0, 1.6, 0.19), 0x55515f),
    colorGeo(new THREE.BoxGeometry(0.6, 0.12, 0.05).translate(0, 1.3, 0.19), 0x55515f),
  ]).rotateZ(0.07).rotateX(-0.05);
}
function crossGeo() {
  const S = 0x9a96a8;
  return mergeColored([colorGeo(new THREE.BoxGeometry(0.35, 3.0, 0.35).translate(0, 1.5, 0), S), colorGeo(new THREE.BoxGeometry(1.6, 0.35, 0.35).translate(0, 2.2, 0), S)]).rotateZ(-0.1);
}
// pumplykta (olyst material: hela pumpan "lyser") med ansikte åt två håll
function pumpkinGeo() {
  const parts = [colorBy(new THREE.SphereGeometry(1, 12, 8).scale(1.25, 0.95, 1.25).translate(0, 0.9, 0), (x, y, z) => sector(x, z, 12) % 2 ? 0xff7a12 : 0xe0560a)];
  const F = 0xfff06a;
  for (const sd of [1, -1]) {
    for (const ex of [-0.42, 0.42]) parts.push(colorGeo(new THREE.BoxGeometry(0.3, 0.3, 0.14).rotateZ(Math.PI / 4).translate(ex, 1.15, sd * 1.17), F));
    parts.push(colorGeo(new THREE.BoxGeometry(0.95, 0.2, 0.14).translate(0, 0.62, sd * 1.15), F));
    for (const ex of [-0.48, 0.48]) parts.push(colorGeo(new THREE.BoxGeometry(0.18, 0.22, 0.14).translate(ex, 0.75, sd * 1.13), F));
  }
  parts.push(colorGeo(new THREE.CylinderGeometry(0.1, 0.15, 0.45, 5).rotateZ(0.2).translate(0.05, 1.95, 0), 0x3a5a1a));
  return mergeColored(parts);
}
function ghostGeo() {
  const W = 0xf4f2ff, parts = [
    colorGeo(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.1, 1).translate(0, 1.6, 0), W),
    colorBy(new THREE.CylinderGeometry(1, 1.3, 1.6, 10, 1, true).translate(0, 0.8, 0), (x, y, z) => W),
  ];
  for (const ex of [-0.35, 0.35]) parts.push(colorGeo(new THREE.SphereGeometry(0.17, 6, 4).scale(1, 1.4, 0.6).translate(ex, 2.0, 0.92), 0x141018));
  parts.push(colorGeo(new THREE.SphereGeometry(0.2, 6, 4).scale(1, 1.3, 0.6).translate(0, 1.45, 0.98), 0x141018));
  return mergeColored(parts).translate(0, 3.5, 0);     // svävar
}
function deadBushGeo() {
  const C = 0x3a2a44, parts = [];
  for (let k = 0; k < 7; k++) { const a = k * 0.9; parts.push(barGeo([0, 0, 0], [Math.cos(a) * 1.6, 1.4 + (k % 3) * 0.5, Math.sin(a) * 1.6], 0.07, C)); }
  return mergeColored(parts);
}
function hauntedGeo() {
  const B = 0x3a2e48, D = 0x1e1626, parts = [colorGeo(new THREE.BoxGeometry(10, 8, 7).translate(0, 4, 0), B)];
  parts.push(colorGeo(new THREE.ConeGeometry(7.4, 5, 4).rotateY(Math.PI / 4).scale(1, 1, 0.75).translate(0, 10.5, 0).rotateZ(0.06), D));
  parts.push(colorGeo(new THREE.CylinderGeometry(2.2, 2.4, 14, 8).translate(5.5, 7, 2.5), B), colorGeo(new THREE.ConeGeometry(3, 6, 8).translate(5.5, 17, 2.5).rotateZ(-0.04), D));
  parts.push(colorGeo(new THREE.BoxGeometry(1.0, 3.5, 1.0).translate(-3, 12, -1), D));
  parts.push(colorGeo(new THREE.BoxGeometry(2.2, 3.4, 0.3).translate(-1.5, 1.7, 3.55), 0x140e18));
  return mergeColored(parts);
}
function hauntedWindowsGeo() {
  const Y = 0xffd84a, parts = [];
  for (const z of [3.55, -3.55]) for (const [x, y] of [[-3.2, 5.6], [0.8, 5.6], [3.2, 2.4], [1.6, 2.4]]) parts.push(colorGeo(new THREE.BoxGeometry(1.4, 1.6, 0.2).translate(x, y, z), Y));
  parts.push(colorGeo(new THREE.BoxGeometry(1.0, 1.4, 0.2).translate(5.5, 11, 4.75), 0xa8ff6a));
  return mergeColored(parts);
}
// pumpor längs vägkanten (vända mot vägen) med ett orange sken
function roadPumpkins(ctx, mat) {
  const { scene, track: T, terr } = ctx, HW = T.halfW, list = [];
  let n = 0;
  for (let s = 35; s < T.L - 20; s += 95) {
    const i = T.idx(s);
    if (T.flags[i] & (F_GAP | F_TUNNEL | F_BRIDGE | F_LAND | F_RAMP)) continue;
    const sd = n++ % 2 ? 1 : -1, lat = sd * (HW + 4.5);
    const x = T.px[i] + T.rx[i] * lat, z = T.pz[i] + T.rz[i] * lat;
    list.push([x, terr.heightAt(x, z) - 0.15, z, Math.atan2(-sd * T.rx[i], -sd * T.rz[i])]);
  }
  const inst = new THREE.InstancedMesh(pumpkinGeo(), mat, list.length);
  const gpos = new Float32Array(list.length * 3), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(0.9, 0.9, 0.9), UP = new THREE.Vector3(0, 1, 0);
  list.forEach(([x, y, z, yaw], k) => { inst.setMatrixAt(k, m4.compose(v.set(x, y, z), q.setFromAxisAngle(UP, yaw), sc)); gpos.set([x, y + 1, z], k * 3); });
  scene.add(inst);
  const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.BufferAttribute(gpos, 3));
  const glow = new THREE.Points(gg, new THREE.PointsMaterial({ map: glowSpriteTex('255,140,40'), size: 8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  glow.frustumCulled = false;
  scene.add(glow);
}
function buildSpooky(ctx, terr, lam) {
  const pm = ctx.pumpkinMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const ghostM = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: 0x4a4a6a, transparent: true, opacity: 0.85 });
  const out = scatter(ctx, terr, [spookyTreeGeo(), graveGeo(), crossGeo(), pumpkinGeo(), rockGeo(0x4a4458, 0.8), ghostGeo(), deadBushGeo()],
    [0.3, 0.2, 0.08, 0.12, 0.12, 0.05, 0.13], 3400, [lam, lam, lam, pm, lam, ghostM, lam], 9, { CH: 800 });
  roadLamps(ctx, { every: 60, rgb: '255,170,90', head: 0xffc070, post: 0x1e1824, size: 11 });
  roadPumpkins(ctx, pm);
  const HW = ctx.track.halfW, house = new THREE.Group();
  house.add(lamMesh(hauntedGeo()), glowMesh(hauntedWindowsGeo()));
  placeProp(ctx, -95, -(HW + 34), house).scale.setScalar(1.4);
  for (const [s, lat, g] of [[-40, HW + 12, graveGeo()], [-28, HW + 14, crossGeo()], [-55, HW + 16, graveGeo()], [30, -(HW + 13), graveGeo()], [55, HW + 20, spookyTreeGeo()]]) placeProp(ctx, s, lat, lamMesh(g), s * 0.05);
  return out;
}

// ---------- Godisbanan: klubbor, polkagrisar, muffins, munkar, gelégodis, sockervaddsträd, pepparkakshus ----------
function lollipopGeo(cA, cB) {
  const swirl = (x, y) => (Math.floor((Math.atan2(y, x) / (Math.PI * 2) + 1) * 4 + Math.hypot(x, y) * 1.1) % 2) ? cA : cB;
  const parts = [colorGeo(new THREE.CylinderGeometry(0.16, 0.16, 6.4, 6).translate(0, 3.2, 0), 0xffffff)];
  for (const sd of [1, -1]) { const g = colorBy(new THREE.RingGeometry(0.02, 2.2, 18, 4), swirl); if (sd < 0) g.rotateY(Math.PI); parts.push(g.translate(0, 8.4, sd * 0.25)); }
  parts.push(colorGeo(new THREE.CylinderGeometry(2.2, 2.2, 0.5, 18, 1, true).rotateX(Math.PI / 2).translate(0, 8.4, 0), cA));
  return mergeColored(parts);
}
function caneGeo() {
  const R = 0xff2a3a, W = 0xffffff, H = 8, r = 1.3;
  const shaft = colorBy(new THREE.CylinderGeometry(0.42, 0.42, H, 8, 16).translate(0, H / 2, 0), (x, y, z) => Math.floor(y * 1.6 + Math.atan2(z, x) * 0.5 + 20) % 2 ? R : W);
  const hook = colorBy(new THREE.TorusGeometry(r, 0.42, 6, 12, Math.PI).translate(r, H, 0), (x, y) => Math.floor(Math.atan2(y - H, x - r) * 3.2 + 20) % 2 ? R : W);
  const tip = colorBy(new THREE.CylinderGeometry(0.42, 0.42, 1.2, 8, 2).translate(2 * r, H - 0.6, 0), (x, y) => Math.floor(y * 1.6 + 20) % 2 ? R : W);
  return mergeColored([shaft, hook, tip]);
}
function cupcakeGeo(frost) {
  const parts = [colorBy(new THREE.CylinderGeometry(1.6, 1.2, 1.6, 14).translate(0, 0.8, 0), (x, y, z) => y > 1.55 ? frost : (sector(x, z, 14) % 2 ? 0xff9ac8 : 0xffd2e6))];
  parts.push(colorGeo(new THREE.SphereGeometry(1.8, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.7, 1).translate(0, 1.6, 0), frost));
  parts.push(colorGeo(new THREE.SphereGeometry(1.25, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.8, 1).translate(0, 2.4, 0), frost));
  parts.push(colorGeo(new THREE.ConeGeometry(0.75, 1.0, 12).translate(0, 3.6, 0), frost));
  parts.push(colorGeo(new THREE.SphereGeometry(0.45, 8, 6).translate(0, 4.3, 0), 0xe0102a));        // körsbär
  const spr = [0xff4a8e, 0x4ad8ff, 0xffe24a, 0x7aff8a, 0xb07aff];
  for (let k = 0; k < 10; k++) {
    const a = k * 2.39, rr = 0.6 + (k % 4) * 0.28, y = 1.6 + 0.7 * Math.sqrt(1.8 * 1.8 - rr * rr);
    parts.push(colorGeo(new THREE.BoxGeometry(0.3, 0.08, 0.08).rotateY(a * 3).translate(Math.cos(a) * rr, y, Math.sin(a) * rr), spr[k % spr.length]));
  }
  return mergeColored(parts);
}
function donutGeo(frost) {
  const spr = [0xffffff, 0x4ad8ff, 0xffe24a, 0x7aff8a];
  return mergeColored([colorBy(new THREE.TorusGeometry(1.8, 0.9, 8, 18).translate(0, 2.7, 0), (x, y, z, k) => Math.abs(z) > 0.35 ? (hash1(k * 1.7) > 0.86 ? spr[k % 4] : frost) : 0xd8a058)]);
}
function gumdropsGeo() {
  const parts = [];
  for (const [x, z, r, c] of [[0, 0, 1.3, 0xff4a6a], [2.0, 0.6, 1.0, 0x4ad86a], [-1.6, 1.0, 1.1, 0xffc83a], [0.6, -1.8, 0.9, 0xb06aff]]) {
    parts.push(colorGeo(new THREE.SphereGeometry(r, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.3, 1).translate(x, 0, z), c));
  }
  return mergeColored(parts);
}
function candyTreeGeo() {
  const parts = [colorBy(new THREE.CylinderGeometry(0.3, 0.4, 6, 8, 6).translate(0, 3, 0), (x, y) => Math.floor(y * 1.5) % 2 ? 0xffffff : 0x7ad8ff)];
  for (const [x, y, z, r, c] of [[0, 7.6, 0, 2.6, 0xffa6d6], [1.8, 6.8, 0.6, 1.8, 0xffc4e4], [-1.7, 7.0, -0.6, 1.9, 0xb8e4ff], [0.3, 9.2, -0.4, 1.7, 0xffb8dc]]) {
    parts.push(colorGeo(new THREE.IcosahedronGeometry(r, 1).translate(x, y, z), c));
  }
  return mergeColored(parts);
}
function gingerGeo() {
  const G = 0xb8743a, I = 0xffffff, parts = [colorGeo(new THREE.BoxGeometry(9, 5, 7).translate(0, 2.5, 0), G)];
  parts.push(colorGeo(new THREE.CylinderGeometry(5.2, 5.2, 9.6, 3).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2).scale(1, 0.7, 1).translate(0, 6.6, 0), 0xff8ac8));
  for (const z of [-4.45, 4.45]) parts.push(colorBy(new THREE.BoxGeometry(9.8, 0.35, 0.35, 12, 1, 1).translate(0, 4.85, z), (x) => Math.floor(x * 1.3 + 20) % 2 ? I : 0xff4a8e));   // glasyrkanter
  for (const x of [-2.6, 2.6]) parts.push(colorGeo(new THREE.BoxGeometry(1.6, 1.6, 0.2).translate(x, 3, 3.55), I), colorGeo(new THREE.BoxGeometry(1.2, 1.2, 0.25).translate(x, 3, 3.55), 0xffe27a));
  parts.push(colorGeo(new THREE.BoxGeometry(1.6, 2.8, 0.25).translate(0, 1.4, 3.55), 0x7a3a1a));
  for (let k = 0; k < 7; k++) parts.push(colorGeo(new THREE.SphereGeometry(0.28, 6, 4).translate(-3.9 + k * 1.3, 0.5, 3.6), [0xff4a6a, 0x4ad86a, 0xffc83a, 0x4ad8ff][k % 4]));
  return mergeColored(parts);
}
function buildCandy(ctx, terr, lam) {
  const out = scatter(ctx, terr, [lollipopGeo(0xff3b8a, 0xffffff), lollipopGeo(0x3ac8ff, 0xfff27a), caneGeo(), cupcakeGeo(0xffb6d8), donutGeo(0xff6ab0), gumdropsGeo(), candyTreeGeo()],
    [0.15, 0.13, 0.17, 0.13, 0.1, 0.14, 0.18], 3200, lam, 9);
  const HW = ctx.track.halfW;
  placeProp(ctx, -90, -(HW + 30), lamMesh(gingerGeo()));
  for (const [s, lat, g, sc] of [[-35, -(HW + 12), lollipopGeo(0xff3b8a, 0xffffff), 1.6], [-35, HW + 12, lollipopGeo(0x3ac8ff, 0xfff27a), 1.6], [40, HW + 16, cupcakeGeo(0xb8f0ff), 1.8], [60, -(HW + 15), caneGeo(), 1.5], [-70, HW + 18, donutGeo(0xff8ac8), 1.6]]) {
    placeProp(ctx, s, lat, lamMesh(g)).scale.setScalar(sc);
  }
  return out;
}

// ---------- Neonbanan: pyramider med lysande kanter, pelare, trianglar, palmsiluetter, valv över vägen ----------
function neonPyramidGeo(edge) {
  const r = 12, h = 15, parts = [colorGeo(new THREE.ConeGeometry(r, h, 4, 1).translate(0, h / 2, 0), 0x150a26)];
  const cs = [0, 1, 2, 3].map(k => [r * Math.sin(k * Math.PI / 2), 0.05, r * Math.cos(k * Math.PI / 2)]);
  for (let k = 0; k < 4; k++) parts.push(barGeo(cs[k], [0, h, 0], 0.25, edge), barGeo(cs[k], cs[(k + 1) % 4], 0.25, edge));
  return mergeColored(parts);
}
function neonPillarGeo() {
  const parts = [colorGeo(new THREE.BoxGeometry(2.2, 20, 2.2).translate(0, 10, 0), 0x150a26)];
  for (const y of [4, 8, 12, 16]) parts.push(colorGeo(new THREE.BoxGeometry(2.5, 0.3, 2.5).translate(0, y, 0), 0x2bf0ff));
  parts.push(colorGeo(new THREE.BoxGeometry(2.8, 0.6, 2.8).translate(0, 20.2, 0), 0xff2bd6));
  return mergeColored(parts);
}
function neonTriGeo(c) {
  const s = 16, h = s * 0.866, a = [-s / 2, 0.5, 0], b = [s / 2, 0.5, 0], t = [0, h + 0.5, 0];
  return mergeColored([barGeo(a, b, 0.35, c), barGeo(b, t, 0.35, c), barGeo(t, a, 0.35, c)]);
}
// valv över vägen med neonrör, var 520:e meter (inte vid hopp, broar och tunnlar)
function buildNeonArches(ctx) {
  const { scene, track: T } = ctx, W = T.halfW + 2.6, H = 15, geos = [], cols = [0x2bf0ff, 0xff2bd6], D = 0x150a26;
  let n = 0;
  for (let s = 300; s < T.L - 250; s += 520) {
    const i = T.idx(s);
    let bad = false;
    for (let o = -14; o <= 14 && !bad; o++) bad = !!(T.flags[(i + o + T.N) % T.N] & (F_GAP | F_RAMP | F_LAND | F_TUNNEL | F_BRIDGE));
    if (bad) continue;
    const col = cols[n % 2], col2 = cols[++n % 2], parts = [];
    // yttre ram i en färg, inre rör i den andra
    for (const sx of [-1, 1]) parts.push(colorGeo(new THREE.BoxGeometry(0.9, H + 5, 0.9).translate(sx * W, (H - 5) / 2, 0), col), colorGeo(new THREE.BoxGeometry(0.5, H - 1.4, 0.5).translate(sx * (W - 1.6), (H - 1.4) / 2, 0), col2));
    parts.push(colorGeo(new THREE.BoxGeometry(2 * W + 0.9, 0.9, 0.9).translate(0, H, 0), col), colorGeo(new THREE.BoxGeometry(2 * W - 2.7, 0.5, 0.5).translate(0, H - 1.6, 0), col2));
    parts.push(colorGeo(new THREE.BoxGeometry(2 * W + 2.5, 2.6, 0.5).translate(0, H + 1.9, 0), D));      // mörk skylt ovanpå
    const g = mergeColored(parts);
    g.applyMatrix4(frameAt(T, s));
    geos.push(g);
  }
  if (geos.length) scene.add(glowMesh(mergeGeometries(geos)));
}
function buildNeon(ctx, terr) {
  const basic = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const out = scatter(ctx, terr, [recolor(palmGeo(), 0x12061e), neonPillarGeo(), neonTriGeo(0xff2bd6), neonTriGeo(0x2bf0ff)], [0.5, 0.2, 0.15, 0.15], 1500, basic, 10, { CH: 800 });
  out.push(...scatter(ctx, terr, [neonPyramidGeo(0x2bf0ff), neonPyramidGeo(0xff2bd6)], [0.5, 0.5], 260, basic, 45, { seed: 23, CH: 800 }));
  buildNeonArches(ctx);
  // skyltar vid starten
  const HW = ctx.track.halfW;
  for (const [s, lat, word, col] of [[-80, -(HW + 18), 'KNUFF', '#ff2bd6'], [-20, HW + 18, 'TURBO', '#2bf0ff']]) {
    const grp = new THREE.Group();
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(22, 7), new THREE.MeshBasicMaterial({ map: neonTex(word, col), transparent: true, toneMapped: false, side: THREE.DoubleSide, depthWrite: false }));
    sign.position.y = 11;
    grp.add(sign, glowMesh(mergeColored([colorGeo(new THREE.BoxGeometry(0.6, 8, 0.6).translate(-7, 4, -0.4), 0x150a26), colorGeo(new THREE.BoxGeometry(0.6, 8, 0.6).translate(7, 4, -0.4), 0x150a26)])));
    placeProp(ctx, s, lat, grp);
  }
  for (const [s, lat] of [[-50, -(HW + 12)], [-110, HW + 14], [30, -(HW + 15)], [70, HW + 12]]) placeProp(ctx, s, lat, glowMesh(recolor(palmGeo(), 0x12061e))).scale.setScalar(1.5);
  return out;
}

// ---------- Himlakroppar: spökmånen och den randiga 80-talssolen (följer kameran) ----------
function bigMoon() {
  const tex = canvasTex(256, 256, (c, w, h) => {
    const g = c.createRadialGradient(w * 0.42, h * 0.4, 8, w / 2, h / 2, w / 2);
    g.addColorStop(0, '#fffdf0'); g.addColorStop(1, '#ecdcae');
    c.fillStyle = g; c.beginPath(); c.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(190,170,120,0.45)';
    for (const [x, y, r] of [[90, 80, 22], [160, 120, 16], [110, 170, 26], [180, 70, 10], [70, 140, 12], [150, 190, 9]]) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
  });
  const grp = new THREE.Group();
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSpriteTex('255,236,190'), fog: false, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 }));
  glow.scale.setScalar(2600); glow.renderOrder = -3;
  const disc = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, fog: false, toneMapped: false, depthWrite: false }));
  disc.scale.setScalar(820); disc.renderOrder = -2;
  grp.add(glow, disc);
  return grp;
}
function synthSun() {
  const tex = canvasTex(512, 512, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#fff47a'); g.addColorStop(0.42, '#ffa23a'); g.addColorStop(0.75, '#ff4a8a'); g.addColorStop(1, '#d81a9a');
    c.fillStyle = g; c.beginPath(); c.arc(w / 2, h / 2, w / 2 - 4, 0, Math.PI * 2); c.fill();
    // ränderna som blir tjockare nedåt
    c.globalCompositeOperation = 'destination-out';
    for (let k = 0; k < 8; k++) c.fillRect(0, h * (0.3 + k * 0.064), w, 3 + k * 2.6);
  });
  const grp = new THREE.Group();
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSpriteTex('255,90,170'), fog: false, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.7 }));
  glow.scale.setScalar(5200); glow.renderOrder = -3;
  const disc = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, fog: false, toneMapped: false, depthWrite: false }));
  disc.scale.setScalar(2300); disc.renderOrder = -2;
  grp.add(glow, disc);
  return grp;
}
