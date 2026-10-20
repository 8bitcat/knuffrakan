// Händelser på banorna: TÅGÖVERGÅNGAR (bommar, blinkande ljus, klockan och ett tåg som dundrar förbi)
// och KLAFFBROAR som fälls upp när en båt ska under. Allt styrs av den gemensamma klockan game.clock(),
// så värd och gäster ser samma sak utan extra nätverkstrafik. Fysiken räknas bara hos värden/ensam i
// step(): tåget knuffar bilar det träffar, klaffarna är riktiga rörliga kroppar och den som kör ner i
// floden när bron är uppe plaskar i och kommer tillbaka före bron.
import * as THREE from 'three';
import { CONF } from './config.js?v=33';
import { GROUP_WORLD, canvasTex, signTex, panelTex, colorGeo, mergeColored, barGeo, planeOnRoad } from './world.js?v=33';

const DT = CONF.DT;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const mod = (a, n) => ((a % n) + n) % n;
const Y = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4(), _X = new THREE.Vector3(1, 0, 0);
const WHITE = new THREE.Color(0xffffff), FOAM = new THREE.Color(0xd8f2ff), WATER = new THREE.Color(0x9fd8f0);

// Tågen per tema: lok ('el' = modernt ellok, 'anga' = ånglok), färger och vagnar
const TRAINS = {
  sno: { loco: 'el', c1: 0xd8261c, c2: 0xf4f0ea, wagons: ['pass', 'pass', 'pass', 'pass'], wc: 0xc4c8d0, ws: 0xd8261c, roof: 0x7a7e86 },
  oken: { loco: 'anga', c1: 0x1c1a1e, c2: 0xc81e1e, wagons: ['tra', 'tra', 'tra', 'tra'] },
  stad: { loco: 'el', c1: 0xc8ccd6, c2: 0x1e5ad8, wagons: ['pass', 'pass', 'pass', 'pass', 'pass'], wc: 0xc8ccd6, ws: 0x1e5ad8, roof: 0x8a8e96, night: true, win: 0xffe2a0 },
  is: { loco: 'el', c1: 0x1e4ad0, c2: 0xffffff, plow: 0xffc21a, wagons: ['gods', 'gods', 'gods', 'gods', 'gods'] },
  host: { loco: 'el', c1: 0x2a7a3a, c2: 0xf0c020, wagons: ['timmer', 'timmer', 'timmer', 'timmer', 'timmer'] },
  neon: { loco: 'el', c1: 0x1a1024, c2: 0xff2bd6, wagons: ['pass', 'pass', 'pass', 'pass'], wc: 0x1a1024, ws: 0x2bf0ff, roof: 0x2a1c3a, night: true, win: 0x2bf0ff, neon: true },
};
// tåget: fart (m/s), ljusen tänds WARN s innan tåget når vägen, bommarna fälls GATE0→GATE1 s innan och fälls upp UP0→UP1 s efter
const TR = { V: 42, WARN: 8, GATE0: 6.5, GATE1: 4.5, UP0: 0.8, UP1: 3.3, PERIOD: 44, HORN: -300 };
// klaffbron: båten går mellan två bryggor (DOCK m från bron) och passerar under bron mitt i resan
const BOAT_K = 1.25;                                 // båtarna lite större än verkligheten (syns från vägen)
const BR = { PERIOD: 58, DOCK: 210, T0: 4, TTR: 32, ACC: 0.18, RAISE: 2.6, LOWER: 2.6, MAXA: 72 * Math.PI / 180, CLEAR: 38, WARN: 5, VYMAX: 12 };
// stenraset: stenar, förvarning (s), fallet (s), rullfart (m/s), storlek (m)
const RAS = { N: 5, WARN: 4, TF: 1.9, VR: [17, 24], R: [1.3, 2.3] };
const DUST0 = new THREE.Color(0xd8b07a), DUST1 = new THREE.Color(0xb88a5a);
const UP = Math.PI / 2 - 0.06;                      // bommens vinkel när den är uppe

// ---------- små geometrihjälpare (färg per hörn, allt slås ihop till få ritanrop) ----------
function paint(geo, fn) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g.attributes.uv) g.deleteAttribute('uv');
  const p = g.attributes.position, a = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i += 3) {
    c.set(fn((p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3, (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3));
    for (let j = 0; j < 3; j++) { a[(i + j) * 3] = c.r; a[(i + j) * 3 + 1] = c.g; a[(i + j) * 3 + 2] = c.b; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
function kit() {
  const lam = [], glow = [];
  return {
    lam, glow,
    box: (w, h, d, x, y, z, c, arr = lam) => arr.push(colorGeo(new THREE.BoxGeometry(w, h, d).translate(x, y, z), c)),
    cz: (r0, r1, len, x, y, z, c, seg = 10) => lam.push(colorGeo(new THREE.CylinderGeometry(r0, r1, len, seg).rotateX(Math.PI / 2).translate(x, y, z), c)),   // längs z
    cx: (r, w, x, y, z, c, seg = 12) => lam.push(colorGeo(new THREE.CylinderGeometry(r, r, w, seg).rotateZ(Math.PI / 2).translate(x, y, z), c)),               // hjul (axel längs x)
    cy: (r0, r1, h, x, y, z, c, seg = 10) => lam.push(colorGeo(new THREE.CylinderGeometry(r0, r1, h, seg).translate(x, y, z), c)),
    ball: (r, x, y, z, c, sy = 1) => lam.push(colorGeo(new THREE.SphereGeometry(r, 10, 7).scale(1, sy, 1).translate(x, y, z), c)),
    bar: (a, b, r, c) => lam.push(barGeo(a, b, r, c)),
    meshes(mat, gmat) {
      const out = [];
      if (lam.length) out.push(new THREE.Mesh(mergeColored(lam), mat));
      if (glow.length && gmat) out.push(new THREE.Mesh(mergeColored(glow), gmat));
      return out;
    },
  };
}
const lamMat = (o = {}) => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, ...o });
const glowMat = (o = {}) => new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, ...o });
// rund glödande prick (lamporna syns på långt håll)
function glowTex() {
  return canvasTex(64, 64, (c) => {
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  });
}
function glowPoints(pts, color, size) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts.flat()), 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ map: glowTex(), color, size, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  p.frustumCulled = false; p.visible = false;
  return p;
}
// lokala punkter → världen (efter att gruppen placerats)
const toWorld = (grp, list) => { grp.updateMatrixWorld(true); return list.map(p => new THREE.Vector3(...p).applyMatrix4(grp.matrixWorld).toArray()); };
// skrovet sett uppifrån (fören mot −z), extruderat uppåt från y0 till y1
function hullGeo(L, W, y0, y1, steps = 6) {
  const sh = new THREE.Shape();
  sh.moveTo(-W / 2, -L / 2); sh.lineTo(W / 2, -L / 2);
  sh.lineTo(W / 2, L * 0.18);
  sh.quadraticCurveTo(W * 0.42, L * 0.46, 0, L / 2);
  sh.quadraticCurveTo(-W * 0.42, L * 0.46, -W / 2, L * 0.18);
  sh.closePath();
  return new THREE.ExtrudeGeometry(sh, { depth: y1 - y0, bevelEnabled: false, steps, curveSegments: 6 }).rotateX(-Math.PI / 2).translate(0, y0, 0);
}
// sidoprofil [z, y] extruderad över bredden w (lokets nos, kofångare, snöplog)
function sideGeo(pts, w) {
  const sh = new THREE.Shape();
  sh.moveTo(pts[0][0], pts[0][1]);
  for (const [z, y] of pts.slice(1)) sh.lineTo(z, y);
  sh.closePath();
  return new THREE.ExtrudeGeometry(sh, { depth: w, bevelEnabled: false }).rotateY(-Math.PI / 2).translate(w / 2, 0, 0);
}

// ---------- Tåget: lok + vagnar. Lokalt: x = höger, y = upp (0 = rälsens överkant), z = bakåt (nosen vid z = 0) ----------
function trainKit(st) {
  const K = kit(), { box, cz, cx, cy, ball, bar } = K;
  const DARK = 0x26262c, STEEL = 0x5a5d66, GLASS = 0x1a2a44;
  const bogie = (zc) => { box(2.5, 0.7, 3.2, 0, 0.75, zc, DARK); for (const dz of [-0.95, 0.95]) for (const sx of [-1, 1]) cx(0.5, 0.22, sx * 1.15, 0.5, zc + dz, STEEL); };
  const stacks = [];
  let z = 0;
  if (st.loco === 'anga') {
    const L = 14.5;
    box(2.4, 0.6, L - 1, 0, 1.35, L / 2, DARK);
    K.lam.push(colorGeo(sideGeo([[-0.9, 0.2], [0.7, 0.2], [0.7, 1.55], [0.25, 1.55]], 2.8), st.c2));     // kofångaren
    cz(1.32, 1.32, 1.3, 0, 2.95, 1.25, 0x2e2e34, 14);                 // rökskåpet
    K.lam.push(colorGeo(new THREE.CircleGeometry(1.0, 14).rotateY(Math.PI).translate(0, 2.95, 0.58), 0x3a3a40));
    cz(1.2, 1.2, 8.4, 0, 2.95, 6.1, st.c1, 14);                       // pannan
    for (const zz of [2.6, 5.0, 7.4, 9.8]) cz(1.25, 1.25, 0.2, 0, 2.95, zz, 0xd8a838, 14);
    cy(0.68, 0.42, 2.1, 0, 5.0, 1.4, DARK);                             // skorstenen (vidgar sig uppåt)
    cy(0.74, 0.74, 0.25, 0, 6.05, 1.4, 0x3a3a40);
    ball(0.62, 0, 4.2, 5.2, 0xd8a838, 0.8);                             // ångdomen
    ball(0.5, 0, 4.15, 7.6, st.c2, 0.8);
    cy(0.22, 0.3, 0.5, 0, 4.5, 3.8, 0xd8a838);                          // klockan
    box(3.0, 3.3, 3.6, 0, 3.0, 12.4, st.c2);                            // hytten
    box(3.04, 0.9, 1.1, 0, 3.75, 11.9, 0x16161a);
    box(3.5, 0.25, 4.3, 0, 4.78, 12.4, st.c1);
    for (const sx of [-1, 1]) {
      for (const zz of [6.3, 8.3, 10.3]) cx(0.95, 0.2, sx * 1.3, 0.95, zz, st.c2, 16);
      for (const zz of [2.7, 3.9]) cx(0.5, 0.2, sx * 1.2, 0.5, zz, st.c2);
      box(0.08, 0.16, 4.2, sx * 1.42, 0.95, 8.3, 0xb8bcc4);
      cz(0.42, 0.42, 1.5, sx * 1.15, 1.45, 3.3, DARK);
    }
    box(0.7, 0.7, 0.6, 0, 4.55, 0.95, DARK);                            // lyktan
    box(0.46, 0.46, 0.06, 0, 4.55, 0.63, 0xfff0c0, K.glow);
    stacks.push([0, 6.4, 1.4]);
    // tendern
    const t0 = L + 0.8;
    box(2.6, 0.4, 6.6, 0, 1.2, t0 + 3.3, DARK); bogie(t0 + 1.6); bogie(t0 + 5.0);
    box(2.9, 2.4, 6.6, 0, 2.6, t0 + 3.3, st.c1);
    box(2.5, 0.5, 5.0, 0, 3.9, t0 + 3.0, 0x141416);
    box(2.95, 0.22, 6.65, 0, 3.75, t0 + 3.3, st.c2);
    z = t0 + 6.6 + 1.2;
  } else {
    const L = 17;
    box(3.0, 0.45, L - 0.4, 0, 1.2, L / 2, DARK);
    bogie(3.6); bogie(L - 3.6);
    box(3.2, 3.0, L - 2.6, 0, 2.95, 2.6 + (L - 2.6) / 2, st.c1);
    // nosen med sluttande vindruta
    K.lam.push(paint(sideGeo([[0, 1.45], [0.15, 2.7], [1.3, 4.1], [2.7, 4.45], [2.7, 1.45]], 3.2), (x, y, zz) => (y > 2.75 && zz < 1.25 && Math.abs(x) < 1.45) ? GLASS : st.c1));
    box(3.24, 0.34, L - 0.4, 0, 2.15, L / 2 + 0.15, st.c2, st.neon ? K.glow : K.lam);                  // rand
    if (st.neon) box(3.24, 0.12, L - 3, 0, 4.3, L / 2 + 1.2, 0x2bf0ff, K.glow);
    for (const sx of [-1, 1]) box(0.06, 0.9, 1.1, sx * 1.62, 3.45, 2.05, GLASS);
    box(2.4, 0.3, L - 5, 0, 4.6, L / 2 + 1, STEEL);
    // strömavtagaren
    bar([-0.9, 4.75, 7.0], [0, 5.9, 7.8], 0.06, DARK); bar([0.9, 4.75, 7.0], [0, 5.9, 7.8], 0.06, DARK);
    bar([0, 5.9, 7.8], [0, 6.6, 7.0], 0.06, DARK); box(1.8, 0.08, 0.2, 0, 6.65, 7.0, DARK);
    for (const sx of [-1, 1]) {
      box(0.45, 0.3, 0.12, sx * 1.0, 1.95, -0.03, 0xfff4d0, K.glow);      // strålkastare
      box(0.3, 0.3, 0.5, sx * 1.05, 1.45, -0.2, DARK);                   // buffertar
    }
    if (st.plow) K.lam.push(colorGeo(sideGeo([[-1.1, 0.15], [0.4, 0.15], [0.4, 1.3]], 3.3), st.plow));   // snöplog
    z = L + 1.2;
  }
  const WL = 16.6, LOGS = [0x8a5a32, 0x9a6a3a, 0x7a4a28], BOXC = [0xd8402a, 0x2a6ad8, 0x2a9a4a, 0xf0b020, 0xe8762a, 0x8a4ad8];
  st.wagons.forEach((kind, k) => {
    const z0 = z, zc = z0 + WL / 2;
    box(2.9, 0.4, WL, 0, 1.2, zc, DARK); bogie(z0 + 2.6); bogie(z0 + WL - 2.6);
    box(0.4, 0.4, 1.4, 0, 1.3, z0 - 0.6, DARK);                          // kopplet
    if (kind === 'pass' || kind === 'tra') {
      const tra = kind === 'tra';
      const body = tra ? 0x7a4a2a : st.wc, roof = tra ? 0x8a2a1e : st.roof;
      box(3.1, 2.9, WL - (tra ? 2.4 : 0), 0, 2.85, zc, body);
      box(3.14, 0.3, WL - (tra ? 2.4 : 0), 0, 2.05, zc, tra ? 0xd8a838 : st.ws, st.neon ? K.glow : K.lam);
      box(tra ? 3.6 : 2.7, 0.35, WL - 0.3, 0, 4.45, zc, roof);
      if (!tra) box(2.2, 0.25, WL - 1.2, 0, 4.7, zc, roof);
      for (let w = (tra ? 2.4 : 1.6); w < WL - (tra ? 2.2 : 1.2); w += 1.75) box(3.16, 0.85, 1.1, 0, 3.25, z0 + w, st.night ? st.win : GLASS, st.night ? K.glow : K.lam);
      if (tra) {
        for (const e of [0.6, WL - 0.6]) { box(2.9, 0.12, 1.2, 0, 1.45, z0 + e, 0x5a3a20); for (const sx of [-1.4, 1.4]) bar([sx, 1.5, z0 + e], [sx, 2.6, z0 + e], 0.05, 0x2a2a2e); }
      } else box(2.3, 2.4, 1.3, 0, 2.8, z0 - 0.6, 0x2a2a2e);              // bälgen mellan vagnarna
    } else if (kind === 'timmer') {
      for (let s = 0.4; s < WL; s += 3.9) for (const sx of [-1, 1]) box(0.16, 2.6, 0.16, sx * 1.4, 2.6, z0 + s, 0x3a3a40);
      let n = 0;
      for (const [row, y] of [[4, 1.75], [3, 2.4], [2, 3.05]]) for (let i = 0; i < row; i++) cz(0.34, 0.34, WL - 1, (i - (row - 1) / 2) * 0.68, y, zc, LOGS[n++ % 3], 7);
    } else {
      const c = BOXC[(k * 5 + 1) % BOXC.length];
      box(2.9, 2.8, WL - 1, 0, 2.85, zc, c);
      for (let s = 1; s < WL - 1; s += 1.2) box(2.96, 2.6, 0.12, 0, 2.85, z0 + s, new THREE.Color(c).multiplyScalar(0.8).getHex());
    }
    z = z0 + WL + 1.4;
  });
  return { K, LT: z - 1.4, stacks };
}

// ---------- Båtarna. Lokalt: x = styrbord, y = upp (0 = vattenytan), z = bakåt (fören mot −z) ----------
function boatKit(kind) {
  const K = kit(), { box, cz, cx, cy, bar } = K;
  const stacks = [];
  let wheel = null, L = 30;
  if (kind === 'pirat') {
    L = 30;
    K.lam.push(paint(hullGeo(L, 9, -1.6, 3.0), (x, y) => y > 2.98 ? 0xb8874a : y > 2.3 ? 0xd8a838 : y < 0 ? 0x2a180c : 0x6a3a1a));
    box(8.6, 3.0, 7, 0, 4.5, 11.2, 0x5a3218); box(8.9, 0.3, 7.3, 0, 6.1, 11.2, 0xd8a838);    // akterkastellet
    for (const x of [-2.6, 0, 2.6]) box(1.1, 1.0, 0.1, x, 4.8, 14.75, 0xffd27a, K.glow);
    box(7, 1.6, 5, 0, 3.8, -9.5, 0x5a3218);
    bar([0, 3.4, -14.5], [0, 7.5, -21], 0.22, 0x4a2a12);                                    // bogsprötet
    for (const [zm, h, sc] of [[-4, 19, 1], [5, 16, 0.85]]) {
      cy(0.3, 0.45, h, 0, 3 + h / 2, zm, 0x4a2a12);
      for (const [y, w] of [[8.5, 9.4], [14, 8.2]]) box(w * sc, 0.25, 0.25, 0, y * sc + 1, zm, 0x4a2a12);
      box(8.6 * sc, 5.0 * sc, 0.15, 0, 6.2 * sc + 4.5, zm + 0.35, 0xf2ead8);                // seglen
      box(7.4 * sc, 4.2 * sc, 0.15, 0, 11.6 * sc + 3.6, zm + 0.35, 0xf2ead8);
    }
    cy(1.1, 0.9, 0.9, 0, 18.5, -4, 0x4a2a12);                                               // mastkorgen
    box(0.08, 2.0, 3.0, 0, 21.0, -5.6, 0x16161a);                                           // sjörövarflaggan
    for (const sx of [-1, 1]) {
      box(0.06, 0.55, 0.55, sx * 0.05, 21.3, -5.6, 0xf4f4f4);
      box(0.06, 0.12, 1.4, sx * 0.05, 20.6, -5.6, 0xf4f4f4);
      for (const z of [-6, -1, 4]) cx(0.28, 1.4, sx * 4.4, 2.0, z, 0x16161a);              // kanoner
    }
  } else if (kind === 'angbat') {
    L = 28;
    K.lam.push(paint(hullGeo(L, 7.4, -1.4, 2.6), (x, y) => y > 2.58 ? 0xc8a070 : y > 2.0 ? 0x16161a : y < 0.2 ? 0x8a1e1e : 0xf6f2ea));
    box(5.6, 2.6, 15, 0, 3.9, 1.5, 0xf6f2ea); box(5.66, 0.8, 13, 0, 4.1, 1.5, 0x203040);
    box(6.2, 0.25, 16, 0, 5.3, 1.5, 0x8a5a32);
    box(3.6, 2.2, 3.4, 0, 6.5, -4.5, 0xf6f2ea); box(3.66, 0.8, 3.0, 0, 6.8, -4.5, 0x203040); box(4.0, 0.25, 3.8, 0, 7.7, -4.5, 0x8a5a32);
    cy(0.85, 0.95, 9.2, 0, 10.0, 1.2, 0x16161a); cy(0.98, 0.98, 1.3, 0, 12.4, 1.2, 0xf0c020);   // skorstenen
    cy(0.15, 0.2, 13, 0, 9.1, -10, 0xd8c8a0);                                               // masten i fören
    bar([0, 2.6, 13.6], [0, 6.2, 13.6], 0.06, 0xd8c8a0);                                    // flaggstången
    box(0.06, 1.2, 1.9, 0, 5.6, 14.6, 0x1a5aa8); box(0.08, 0.26, 1.9, 0, 5.6, 14.6, 0xf2c81e); box(0.08, 1.2, 0.3, 0, 5.6, 14.2, 0xf2c81e);
    for (const sx of [-1, 1]) cz(0.55, 0.55, 3.4, sx * 2.6, 5.8, 6.5, 0xff7a1a, 8);           // livbåtar
    stacks.push([0, 14.9, 1.2]);
  } else {
    L = 30;                                                                                   // hjulångaren
    K.lam.push(paint(hullGeo(L, 10, -1.2, 1.8), (x, y) => y > 1.78 ? 0xc8a070 : y < 0.2 ? 0xa8261e : 0xf6f2ea));
    box(9.4, 2.6, 24, 0, 3.1, -0.5, 0xf6f2ea); box(9.46, 0.9, 22, 0, 3.3, -0.5, 0x2a3a50); box(9.7, 0.18, 24.2, 0, 4.4, -0.5, 0xd8261c);
    box(8.2, 2.4, 18, 0, 5.6, 0.5, 0xf6f2ea); box(8.26, 0.8, 16, 0, 5.8, 0.5, 0x2a3a50); box(8.8, 0.3, 19, 0, 6.95, 0.5, 0xd8261c);
    box(4, 2.2, 4, 0, 8.2, -5, 0xf6f2ea); box(4.06, 0.8, 3.6, 0, 8.4, -5, 0x2a3a50); box(4.6, 0.3, 4.6, 0, 9.45, -5, 0xd8a838);
    for (const sx of [-1, 1]) { cy(0.7, 0.8, 11, sx * 2.2, 12.3, -7.5, 0x16161a); cy(1.15, 0.72, 1.0, sx * 2.2, 18.2, -7.5, 0xd8a838); stacks.push([sx * 2.2, 18.8, -7.5]); }
    box(9.2, 0.3, 4.8, 0, 6.0, 17.3, 0xd8261c);                                             // hjulhuset
    for (const sx of [-1, 1]) box(0.3, 5.6, 0.4, sx * 4.4, 3.2, 15.4, 0x8a1e1e);
    // skovelhjulet snurrar (egen del)
    const W = kit();
    for (const sx of [-1, 1]) W.lam.push(colorGeo(new THREE.TorusGeometry(3.2, 0.16, 5, 18).rotateY(Math.PI / 2).translate(sx * 3.6, 0, 0), 0xd8261c));
    for (let k = 0; k < 10; k++) W.lam.push(colorGeo(new THREE.BoxGeometry(7.6, 0.22, 1.5).translate(0, 2.5, 0).rotateX(k / 10 * Math.PI * 2), 0xa8261e));
    W.cx(0.3, 8, 0, 0, 0, 0x3a3a40);
    wheel = W;
  }
  return { K, L, stacks, wheel };
}

// ---------- ljud (egen syntes genom spelets ljudkedja; tyst innan ljudet startats) ----------
class Sfx {
  constructor(g) { this.g = g; this.noise = null; }
  get ctx() { const c = this.g.audio?.ctx; return c && c.state === 'running' && this.g.audio.master ? c : null; }
  near(p, R) { const c = this.g.camera?.position; if (!c) return 0; const d = c.distanceTo(p); return d > R ? 0 : (1 - d / R) ** 1.6; }
  env(ctx, at, vol, a, dur) { const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), at + a); g.gain.exponentialRampToValueAtTime(0.0001, at + dur); g.connect(this.g.audio.master); return g; }
  // ding (bomklockan)
  ding(vol, f = 1480) {
    const ctx = this.ctx; if (!ctx || vol < 0.01) return;
    const t = ctx.currentTime, g = this.env(ctx, t, vol, 0.004, 0.5);
    for (const [m, v] of [[1, 1], [2.76, 0.35], [5.4, 0.12]]) { const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'sine'; o.frequency.value = f * m; og.gain.value = v; o.connect(og); og.connect(g); o.start(t); o.stop(t + 0.55); }
  }
  // tut: några sågtandstoner genom ett lågpassfilter
  horn(vol, freqs, dur, lp = 1600) {
    const ctx = this.ctx; if (!ctx || vol < 0.01) return;
    const t = ctx.currentTime, g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.08); g.gain.setValueAtTime(vol, t + dur - 0.15); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp;
    f.connect(g); g.connect(this.g.audio.master);
    for (const fr of freqs) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr; o.detune.value = (Math.random() - 0.5) * 8; o.connect(f); o.start(t); o.stop(t + dur + 0.05); }
  }
  buf(ctx) {
    if (this.noise) return this.noise;
    const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = b.getChannelData(0);
    let last = 0; for (let i = 0; i < d.length; i++) { last = last * 0.6 + (Math.random() * 2 - 1) * 0.4; d[i] = last; }
    return (this.noise = b);
  }
  burst(vol, dur, freq) {
    const ctx = this.ctx; if (!ctx || vol < 0.01) return;
    const t = ctx.currentTime, s = ctx.createBufferSource(); s.buffer = this.buf(ctx);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = this.env(ctx, t, vol, 0.01, dur);
    s.connect(f); f.connect(g); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  // mullret från tåget och bromotorn: en loop vars styrka sätts varje bildruta
  loop(key, freq, level) {
    const ctx = this.ctx; if (!ctx) return;
    let L = this[key];
    if (!L) {
      if (level < 0.01) return;
      const s = ctx.createBufferSource(); s.buffer = this.buf(ctx); s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
      const g = ctx.createGain(); g.gain.value = 0;
      s.connect(f); f.connect(g); g.connect(this.g.audio.master); s.start();
      L = this[key] = { g };
    }
    L.g.gain.setTargetAtTime(level, ctx.currentTime, 0.15);
  }
}

// ============================================================================================
export class TrackEvents {
  constructor(game) {
    this.g = game;
    this.sfx = new Sfx(game);
    this.rails = []; this.klaffs = []; this.slides = []; this.zones = []; this.bodies = [];
    this.log = [];
    if (game.track) this.onTrack();
  }

  // ---------- ny bana: bygg tågövergångar och klaffbroar ----------
  onTrack() {
    const g = this.g, T = g.track;
    for (const b of this.bodies) { try { g.world.removeRigidBody(b); } catch { /* redan borta */ } }
    this.bodies = []; this.rails = []; this.klaffs = []; this.slides = []; this.zones = [];
    this.trackId = g.trackId;
    if (!T || !g.worldGroup || !g.world3d) return;
    this.ctx = g.world3d.ctx || { theme: g.world3d.theme, terr: g.world3d.terr };
    this.root = new THREE.Group(); g.worldGroup.add(this.root);
    if (g.renderer) g.renderer.localClippingEnabled = true;       // tåget klipps i tunnelmynningarna
    const style = TRAINS[T.def.theme || 'sno'] || TRAINS.sno;
    for (const f of T.features) {
      if (f.type === 'rail') this.rails.push(this.buildRail(f, style));
      if (f.klaff) this.klaffs.push(this.buildKlaff(f));
      if (f.type === 'canyon' && f.ras) for (const [k, u] of [[0, 0.33], [1, 0.67]]) this.slides.push(this.buildSlide(f, k, f.s0 + (f.s1 - f.s0 + (f.s1 < f.s0 ? T.L : 0)) * u));
    }
    this.zones = [...this.rails, ...this.klaffs, ...this.slides];
  }

  // vägens ram vid (s, lat, h): position (+ kvaternion med x = höger, y = upp, z = bakåt)
  roadPose(s, lat, h, pos, quat) {
    const f = this.g.track.sampleAt(s);
    pos.set(f.x + f.rx * lat + f.ux * h, f.y + f.ry * lat + f.uy * h, f.z + f.rz * lat + f.uz * h);
    if (quat) { _m.makeBasis(_v.set(f.rx, f.ry, f.rz).normalize(), _v2.set(f.ux, f.uy, f.uz).normalize(), _v3.set(-f.fx, -f.fy, -f.fz).normalize()); quat.setFromRotationMatrix(_m); }
    return pos;
  }
  // skylt på stolpe vid vägkanten, vänd mot de som kommer körande, med två blinkande lampor ovanpå
  signPost(s, lat, tex, lampMat) {
    const f = this.g.track.sampleAt(s), terr = this.ctx.terr;
    const x = f.x + f.rx * lat, z = f.z + f.rz * lat, y = Math.max(terr ? terr.heightAt(x, z) : f.y, f.y);
    const grp = new THREE.Group();
    const board = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.1), new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
    board.position.y = 3.6;
    const P = kit();
    P.box(0.18, 5.6, 0.18, 0, 1.8, -0.1, 0x3a3b44);
    for (const sx of [-1.4, 1.4]) P.box(0.95, 0.95, 0.1, sx, 5.05, -0.06, 0x16161a);
    grp.add(board, ...P.meshes(lamMat()));
    for (const sx of [-1.4, 1.4]) { const l = new THREE.Mesh(new THREE.CircleGeometry(0.34, 14), lampMat); l.position.set(sx, 5.05, 0.01); grp.add(l); }
    grp.position.set(x, y, z);
    grp.lookAt(x - f.fx * 10, y, z - f.fz * 10);
    this.root.add(grp);
    return toWorld(grp, [[-1.4, 5.05, 0.2], [1.4, 5.05, 0.2]]);
  }

  // ---------- bom (halvbom) vid vägkanten: stolpe + röd-vit arm som fälls ner över halva vägen ----------
  gateArm(s, side, faceBack, foot = -1.0) {
    const T = this.g.track, hw = T.halfW, f = T.sampleAt(s);
    const grp = new THREE.Group();
    this.roadPose(s, side * (hw + 2.4), 0, grp.position);
    const xin = new THREE.Vector3(-f.rx * side, 0, -f.rz * side).normalize();      // in mot vägens mitt
    grp.quaternion.setFromRotationMatrix(_m.makeBasis(xin, Y, new THREE.Vector3().crossVectors(xin, Y)));
    const P = kit();
    P.box(0.42, 1.5 - foot, 0.42, 0, (1.5 + foot) / 2, 0, 0xf0f0f0); P.box(0.44, 0.3, 0.44, 0, 0.5, 0, 0xd8261c); P.box(0.44, 0.3, 0.44, 0, 1.1, 0, 0xd8261c);
    P.box(0.9, 0.9, 0.7, 0, 1.55, 0, 0x3a3b44);                                   // motorlådan
    grp.add(...P.meshes(lamMat()));
    const A = kit(), len = hw + 2.4 - 0.5;
    for (let k = 0, x = 0.6; x < len; k++, x += 1.2) { const w = Math.min(1.2, len - x); A.box(w, 0.3, 0.2, x + w / 2, 0, 0, k % 2 ? 0xf4f4f4 : 0xd8261c); }
    A.box(1.6, 0.5, 0.3, -0.9, 0, 0, 0x3a3b44);                                    // motvikten
    const arm = new THREE.Group(); arm.position.set(0, 1.55, faceBack ? -0.45 : 0.45);
    arm.add(...A.meshes(lamMat()));
    grp.add(arm);
    this.root.add(grp);
    arm.rotation.z = UP;
    return arm;
  }

  // ---------- TÅGÖVERGÅNGEN ----------
  buildRail(f, st) {
    const g = this.g, T = g.track, hw = T.halfW, R = this.root, theme = this.ctx.theme || {};
    const C = new THREE.Vector3(f.x, f.y, f.z), A = new THREE.Vector3(f.ax, 0, f.az).normalize(), B = new THREE.Vector3(f.bx, 0, f.bz).normalize();
    // rälsens ram: x = längs rälsen (A), y = upp, z = A × upp
    const M = new THREE.Matrix4().makeBasis(A, Y, new THREE.Vector3().crossVectors(A, Y)).setPosition(C);
    const L1 = f.L1, L2 = f.L2, Lmax = Math.max(L1, L2);
    // banvallen: grus med syllar (struktur) + två räler
    const ballTex = canvasTex(64, 256, (c, w, h) => {
      c.fillStyle = '#7a7068'; c.fillRect(0, 0, w, h);
      for (let k = 0; k < 2200; k++) { const v = 90 + Math.random() * 70; c.fillStyle = `rgb(${v},${v - 8},${v - 16})`; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      for (let k = 0; k < 4; k++) { c.fillStyle = theme.flora === 'cactus' ? '#6a4a30' : '#5a5650'; c.fillRect(4, k * 64 + 22, w - 8, 20); c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(4, k * 64 + 40, w - 8, 3); }
    });
    ballTex.wrapT = THREE.RepeatWrapping;
    const S = kit(), e0 = hw + 1.4, pos = [], uv = [], idx = [];
    for (const [u0, u1] of [[-L1 - 45, -e0], [e0, L2 + 45]]) {
      const o = pos.length / 3;
      pos.push(u0, -0.1, 2.2, u1, -0.1, 2.2, u0, -0.1, -2.2, u1, -0.1, -2.2);
      uv.push(0, u0 / 2.4, 0, u1 / 2.4, 1, u0 / 2.4, 1, u1 / 2.4);
      idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
      S.box(u1 - u0, 0.75, 5.4, (u0 + u1) / 2, -0.54, 0, 0x6a625a);
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3)); bg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
    bg.setIndex(idx); bg.computeVertexNormals();
    const bed = new THREE.Mesh(bg, new THREE.MeshLambertMaterial({ map: ballTex }));
    bed.applyMatrix4(M); bed.receiveShadow = true; R.add(bed);
    for (const zr of [-0.75, 0.75]) { S.box(L1 + L2 + 90, 0.2, 0.14, (L2 - L1) / 2, -0.01, zr, 0x8a8e96); S.box(L1 + L2 + 90, 0.05, 0.08, (L2 - L1) / 2, 0.1, zr, 0xc8ccd4); }
    for (const m of S.meshes(lamMat())) { m.applyMatrix4(M); m.receiveShadow = true; R.add(m); }
    // tunnelmynningar i kullarna där rälsen tar slut (svart inuti)
    const portalMat = new THREE.MeshLambertMaterial({ map: panelTex(theme.panel?.[1] || '#a8939c', 'rgba(40,30,40,0.4)') });
    const sh = new THREE.Shape(); sh.moveTo(-24, -4); sh.lineTo(24, -4); sh.lineTo(24, 20); sh.lineTo(-24, 20); sh.closePath();
    const hole = new THREE.Path(); hole.moveTo(-3.4, -3); hole.lineTo(3.4, -3); hole.lineTo(3.4, 4.6); hole.absarc(0, 4.6, 3.4, 0, Math.PI, false); hole.closePath();
    sh.holes.push(hole);
    const facade = new THREE.ExtrudeGeometry(sh, { depth: 3, bevelEnabled: false }).rotateY(Math.PI / 2);   // djupet längs +x (rälsen)
    const dark = new THREE.MeshBasicMaterial({ color: 0x050506, side: THREE.BackSide });
    for (const [u, sd] of [[L2, 1], [-L1, -1]]) {
      const pm = new THREE.Mesh(facade, portalMat);
      pm.position.set(u - 1.5, 0, 0); pm.applyMatrix4(M); pm.castShadow = true; R.add(pm);
      const inner = new THREE.Mesh(new THREE.BoxGeometry(46, 9.2, 7.6), dark);
      inner.position.set(u + sd * 23, 3.9, 0); inner.applyMatrix4(M); R.add(inner);
    }
    // på vägen: plank mellan rälerna + stopplinje före bommarna
    const panel = canvasTex(256, 64, (c, w, h) => {
      c.fillStyle = '#3a3638'; c.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 32) { c.fillStyle = x % 64 ? '#5a5658' : '#545052'; c.fillRect(x + 1, 2, 30, h - 4); }
    });
    panel.wrapS = THREE.RepeatWrapping; panel.repeat.set(8, 1);
    R.add(new THREE.Mesh(planeOnRoad(T, f.c - 2.3, f.c + 2.3, -hw, hw, 0.028), new THREE.MeshLambertMaterial({ map: panel, polygonOffset: true, polygonOffsetFactor: -3 })));
    R.add(new THREE.Mesh(planeOnRoad(T, f.c - 13.6, f.c - 12.9, -15, 15, 0.024), new THREE.MeshBasicMaterial({ color: 0xf4f4f4, polygonOffset: true, polygonOffsetFactor: -3 })));
    // bommar: två före och två efter rälsen
    const arms = [];
    for (const [s, back] of [[f.c - 9, false], [f.c + 9, true]]) for (const sd of [-1, 1]) arms.push(this.gateArm(s, sd, back));
    // ljussignaler på båda sidor: kryssmärke + två röda lampor som blinkar om vartannat + klocka
    const lampA = new THREE.MeshBasicMaterial({ color: 0x3a0a0a, toneMapped: false }), lampB = lampA.clone();
    const glA = [], glB = [];
    for (const sd of [-1, 1]) {
      const grp = new THREE.Group();
      this.roadPose(f.c - 5.5, sd * (hw + 3.3), 0, grp.position);
      grp.lookAt(grp.position.x - B.x * 10, grp.position.y, grp.position.z - B.z * 10);
      const P = kit();
      P.cy(0.1, 0.12, 6.2, 0, 2.1, -0.15, 0x8a8e96);
      P.box(1.9, 0.75, 0.12, 0, 3.15, -0.05, 0x16161a);
      for (const r of [0.63, -0.63]) {
        for (const [w, h, y, c] of [[2.4, 0.42, 0, 0xf4f4f4], [2.5, 0.1, 0.17, 0xd8261c], [2.5, 0.1, -0.17, 0xd8261c]]) P.lam.push(colorGeo(new THREE.BoxGeometry(w, h, 0.06).translate(0, y, 0).rotateZ(r).translate(0, 4.75, r > 0 ? 0.02 : 0.05), c));
      }
      P.cy(0.24, 0.3, 0.32, 0, 3.75, -0.1, 0x2a2a2e);                     // klockan
      grp.add(...P.meshes(lamMat()));
      for (const [sx, mat] of [[-0.55, lampA], [0.55, lampB]]) { const l = new THREE.Mesh(new THREE.CircleGeometry(0.27, 16), mat); l.position.set(sx, 3.15, 0.02); grp.add(l); }
      R.add(grp);
      const w = toWorld(grp, [[-0.55, 3.15, 0.25], [0.55, 3.15, 0.25]]);
      glA.push(w[0]); glB.push(w[1]);
    }
    const gA = glowPoints(glA, 0xff2a1a, 7), gB = glowPoints(glB, 0xff2a1a, 7);
    R.add(gA, gB);
    // förvarning en bit före: skylt med två gula lampor
    const warnMat = new THREE.MeshBasicMaterial({ color: 0x3a2a08, toneMapped: false });
    const wp = [];
    for (const sd of [-1, 1]) wp.push(...this.signPost(f.c - 270, sd * (hw + 4.5), signTex('TÅGÖVERGÅNG', 'SE UPP FÖR TÅGET!', '#ffd23a'), warnMat));
    const warnGlow = glowPoints(wp, 0xffb21a, 6); R.add(warnGlow);
    // tåget (klipps i tunnelmynningarna)
    const clip = [new THREE.Plane(A.clone(), -A.dot(C) + L1 - 1.2), new THREE.Plane(A.clone().negate(), A.dot(C) + L2 - 1.2)];
    const tk = trainKit(st);
    const tmat = lamMat({ clippingPlanes: clip, clipShadows: true }), tglow = glowMat({ clippingPlanes: clip });
    const train = new THREE.Group();
    for (const m of tk.K.meshes(tmat, tglow)) { m.castShadow = m.material === tmat; train.add(m); }
    train.visible = false;
    R.add(train);
    // tidtabellen (ren funktion av klockan): tåget hinner alltid in i tunneln innan nästa kommer
    const v = Math.max(TR.V, (2 * Lmax + tk.LT + 90) / (TR.PERIOD - 3));
    const P = Math.max(TR.PERIOD, (2 * Lmax + tk.LT + 90) / v + 3);
    const tC = (Lmax + 45) / v, tH0 = tC - (hw + 4) / v, tH1 = tC + (hw + 4 + tk.LT) / v;
    return {
      kind: 'rail', f, C, A, B, L1, L2, v, P, phi: mod(f.c * 0.37, P), LT: tk.LT, tC, tH0, tH1, hw,
      h0: tH0 - 0.7, h1: tH1 + 0.5, stopS: f.c - 13, pass: 22,
      train, stacks: tk.stacks, steam: st.loco === 'anga', arms, lampA, lampB, gA, gB, warnMat, warnGlow,
      hit: new Map(), hornN: -1, bellT: 0, down: 0, lights: false,
    };
  }

  // tågets läge vid tiden t: cykel, riktning (±A), nosens läge q längs färdriktningen (0 = mitt på vägen)
  trainAt(z, t) {
    const x = t + z.phi, n = Math.floor(x / z.P), tau = x - n * z.P;
    return { n, tau, dir: n % 2 ? -1 : 1, q: z.v * (tau - z.tC) };
  }

  // ---------- KLAFFBRON ----------
  buildKlaff(f) {
    const g = this.g, T = g.track, hw = T.halfW, R = this.root, K = f.klaff, ctx = this.ctx, theme = ctx.theme || {};
    const sM = K.sA + K.n * T.ds / 2;
    const HA = T.pointAt(K.sA, 0), HB = T.pointAt(K.sB, 0), Mid = T.pointAt(sM, 0);
    // vattenytan: havet (stranden) eller flodens yta i dalen
    const waterY = ctx.seaY != null && f.floorY < ctx.seaY - 1 ? ctx.seaY : f.floorY + 0.35;
    // klaffarna: gångjärn vid HA och HB, spetsarna möts mitt över floden
    const leaves = [];
    for (const [H, sH] of [[HA, K.sA], [HB, K.sB]]) {
      const Dt = Mid.clone().sub(H), len = Dt.length(); Dt.normalize();
      const fr = T.sampleAt(sH), up = new THREE.Vector3(fr.ux, fr.uy, fr.uz);
      const zl = Dt.clone().negate(), yl = up.addScaledVector(zl, -up.dot(zl)).normalize(), xl = new THREE.Vector3().crossVectors(yl, zl);
      const q0 = new THREE.Quaternion().setFromRotationMatrix(_m.makeBasis(xl, yl, zl));
      const grp = this.leafMesh(len, hw, theme);
      grp.position.copy(H); grp.quaternion.copy(q0); R.add(grp);
      const L = { H: H.clone(), q0, len, grp, body: null };
      // riktig rörlig kropp: däck + räcken
      if (g.world && g.RAPIER) {
        const RA = g.RAPIER;
        const body = g.world.createRigidBody(RA.RigidBodyDesc.kinematicPositionBased().setTranslation(H.x, H.y, H.z).setRotation({ x: q0.x, y: q0.y, z: q0.z, w: q0.w }));
        g.world.createCollider(RA.ColliderDesc.cuboid(hw + 1.0, 0.7, len / 2).setTranslation(0, -0.7, -len / 2).setFriction(0.6).setRestitution(0.1).setCollisionGroups(GROUP_WORLD), body);
        for (const sd of [-1, 1]) g.world.createCollider(RA.ColliderDesc.cuboid(0.8, 2.2, len / 2).setTranslation(sd * (hw + 0.8), 2.15, -len / 2).setFriction(0.04).setRestitution(0.45).setCollisionGroups(GROUP_WORLD), body);
        L.body = body; this.bodies.push(body);
      }
      leaves.push(L);
    }
    // pelarna vid gångjärnen (betong ner i vattnet)
    const pierMat = new THREE.MeshLambertMaterial({ map: panelTex(theme.panel?.[1] || '#b4a2aa', 'rgba(50,40,50,0.35)') });
    for (const [sH, dir] of [[K.sA, -1], [K.sB, 1]]) {
      const pos = new THREE.Vector3(), q = new THREE.Quaternion();
      this.roadPose(sH + dir * 5, 0, 0, pos, q);
      const hgt = pos.y - 1.9 - (waterY - 3);
      const pier = new THREE.Mesh(new THREE.BoxGeometry(2 * hw + 14, hgt, 10.5), pierMat);
      pier.quaternion.copy(q); pier.position.copy(pos).addScaledVector(_v.set(0, 1, 0).applyQuaternion(q), -1.9 - hgt / 2);
      pier.castShadow = true; pier.receiveShadow = true; R.add(pier);
    }
    // manöverhuset på pelaren
    {
      const H = kit();
      H.box(5, 6.1, 5, 0, 3.05, 0, 0xf2ead8); H.box(5.06, 1.3, 5.06, 0, 4.6, 0, 0x2a3a50); H.box(5.6, 0.4, 5.6, 0, 6.3, 0, 0xa8261e);
      H.lam.push(colorGeo(new THREE.ConeGeometry(4.2, 2.4, 4).rotateY(Math.PI / 4).translate(0, 7.7, 0), 0xa8261e));
      const hs = new THREE.Group(), q = new THREE.Quaternion();
      for (const m of H.meshes(lamMat())) { m.castShadow = true; hs.add(m); }
      this.roadPose(K.sA - 5, hw + 4.6, -1.9, hs.position, q); hs.quaternion.copy(q);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.25), new THREE.MeshBasicMaterial({ map: signTex('KLAFFBRON', f.namn || '', '#ffd23a'), toneMapped: false }));
      sign.position.set(-2.56, 3.2, 0); sign.rotation.y = -Math.PI / 2; hs.add(sign);
      R.add(hs);
    }
    // bommar på pelarna, stopplinje, portal med trafikljus, skylt med gula lampor långt före
    const arms = [];
    for (const [s, back] of [[K.sA - 5, false], [K.sB + 5, true]]) for (const sd of [-1, 1]) arms.push(this.gateArm(s, sd, back, -2.2));
    R.add(new THREE.Mesh(planeOnRoad(T, K.sA - 16.7, K.sA - 16, -15, 15, 0.024), new THREE.MeshBasicMaterial({ color: 0xf4f4f4, polygonOffset: true, polygonOffsetFactor: -3 })));
    const red = new THREE.MeshBasicMaterial({ color: 0x3a0a0a, toneMapped: false }), yel = new THREE.MeshBasicMaterial({ color: 0x3a2a08, toneMapped: false }), grn = new THREE.MeshBasicMaterial({ color: 0x0a3a14, toneMapped: false });
    const gR = [], gY = [], gG = [];
    {
      const grp = new THREE.Group(), q = new THREE.Quaternion();
      this.roadPose(K.sA - 30, 0, 0, grp.position, q); grp.quaternion.copy(q);
      const P = kit(), span = hw + 0.9;
      for (const sx of [-span, span]) P.box(0.5, 11.5, 0.5, sx, 3.75, 0, 0x3a3b44);
      P.box(2 * span + 0.5, 0.6, 0.6, 0, 9.3, 0, 0x3a3b44);
      for (const sx of [-8, 8]) P.box(1.0, 2.9, 0.5, sx, 7.4, 0.1, 0x16161a);
      grp.add(...P.meshes(lamMat()));
      const board = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.2), new THREE.MeshBasicMaterial({ map: signTex('KLAFFBRON', 'STANNA VID RÖTT!', '#ffd23a'), toneMapped: false }));
      board.position.set(0, 7.6, 0.36); grp.add(board);
      const pts = [];
      for (const sx of [-8, 8]) for (const [y, mat, list] of [[8.35, red, gR], [7.4, yel, gY], [6.45, grn, gG]]) {
        const l = new THREE.Mesh(new THREE.CircleGeometry(0.36, 16), mat); l.position.set(sx, y, 0.38); grp.add(l);
        pts.push([list, [sx, y, 0.6]]);
      }
      R.add(grp);
      const w = toWorld(grp, pts.map(p => p[1]));
      pts.forEach(([list], k) => list.push(w[k]));
    }
    const glR = glowPoints(gR, 0xff2a1a, 10), glY = glowPoints(gY, 0xffb21a, 10), glG = glowPoints(gG, 0x2bff5a, 8);
    R.add(glR, glY, glG);
    const warnMat = new THREE.MeshBasicMaterial({ color: 0x3a2a08, toneMapped: false });
    const wp = [];
    for (const sd of [-1, 1]) wp.push(...this.signPost(K.sA - 290, sd * (hw + 4.5), signTex('KLAFFBRO', 'BÅTEN KAN KOMMA!', '#4fc3ff'), warnMat));
    const warnGlow = glowPoints(wp, 0xffb21a, 6); R.add(warnGlow);
    // båten och bryggorna: floden går tvärs vägen (längs dalen) genom mitten mellan klaffarna
    const Rv = new THREE.Vector3(-f.tz, 0, f.tx).normalize(), Bv = new THREE.Vector3(f.tx, 0, f.tz).normalize(), O = new THREE.Vector3(Mid.x, waterY, Mid.z);
    const bk = boatKit(f.klaff.boat || 'angbat');
    const boat = new THREE.Group();
    boat.scale.setScalar(BOAT_K);
    for (const m of bk.K.meshes(lamMat(), glowMat())) { m.castShadow = true; boat.add(m); }
    let wheel = null;
    if (bk.wheel) { wheel = new THREE.Group(); wheel.add(...bk.wheel.meshes(lamMat())); wheel.position.set(0, 2.6, 17.4); boat.add(wheel); }
    R.add(boat);
    for (const sd of [-1, 1]) {
      const grp = new THREE.Group(); grp.position.copy(O).addScaledVector(Rv, sd * BR.DOCK);
      grp.quaternion.setFromRotationMatrix(_m.makeBasis(Bv, Y, new THREE.Vector3().crossVectors(Bv, Y)));
      const D = kit();
      D.box(17, 0.5, 5, 17.5, 1.2, 0, 0x8a6a42);
      for (let x = 10; x <= 25; x += 5) for (const zz of [-2.2, 2.2]) D.cy(0.25, 0.25, 4, x, -0.6, zz, 0x5a4028, 6);
      D.box(1.2, 1.2, 1.2, 12, 1.95, 1.6, 0xd8a838);
      grp.add(...D.meshes(lamMat()));
      R.add(grp);
    }
    // tidtabellen
    const D = BR.DOCK, vC = 2 * D / (BR.TTR * (1 - BR.ACC)), hold = 2 * BR.CLEAR / vC;
    const tMid = BR.T0 + BR.TTR / 2, tO0 = tMid - hold / 2 - BR.RAISE, tO1 = tMid - hold / 2, tC0 = tMid + hold / 2, tC1 = tC0 + BR.LOWER;
    const P = f.klaff.period || BR.PERIOD;
    return {
      kind: 'klaff', f, K, hw, leaves, waterY, O, Rv, Bv, boat, wheel, stacks: bk.stacks.map(p => p.map(c => c * BOAT_K)), boatL: bk.L * BOAT_K,
      P, phi: mod(f.c * 0.53 + 17, P), D, vC, hold, tMid, tO0, tO1, tC0, tC1,
      h0: tO0 - 0.7, h1: tC1 + 0.4, stopS: K.sA - 16, pass: T.ds * K.n + 26, sA: K.sA, sB: K.sB, sM,
      arms, red, yel, grn, glR, glY, glG, warnMat, warnGlow,
      wet: new Set(), hornN: -1, bellT: 0, angPrev: 0, down: 0, lights: false, ang: 0,
    };
  }

  // en klaff: asfalt ovanpå (kantlinjer, varningsränder vid spetsen), stålkropp under, räcken på sidorna
  leafMesh(len, hw, theme) {
    const grp = new THREE.Group();
    const top = canvasTex(256, 128, (c, w, h) => {
      const [r0, g0, b0] = theme.asphalt || [60, 47, 66];
      c.fillStyle = `rgb(${r0},${g0},${b0})`; c.fillRect(0, 0, w, h);
      for (let k = 0; k < 2500; k++) { const n = (Math.random() - 0.5) * 22; c.fillStyle = `rgb(${r0 + n},${g0 + n},${b0 + n})`; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      const px = (lat) => (lat + hw) / (2 * hw) * w;
      c.fillStyle = '#' + new THREE.Color(theme.line ?? 0xf4eef2).getHexString();
      for (const sd of [-1, 1]) { const a = px(sd * 14.82), b = px(sd * 14.48); c.fillRect(Math.min(a, b), 0, Math.abs(a - b) + 1, h); }
      // varningsränder vid spetsen (överkanten av bilden) och en stålskarv vid gångjärnet (nederkanten)
      c.fillStyle = '#ffc21a'; c.fillRect(0, 0, w, 10);
      c.fillStyle = '#16161a';
      for (let x = -10; x < w + 10; x += 20) { c.beginPath(); c.moveTo(x, 10); c.lineTo(x + 8, 10); c.lineTo(x + 18, 0); c.lineTo(x + 10, 0); c.closePath(); c.fill(); }
      c.fillStyle = '#8a8e96'; c.fillRect(0, h - 5, w, 5);
    });
    const tg = new THREE.PlaneGeometry(2 * hw, len).rotateX(-Math.PI / 2).translate(0, 0, -len / 2);
    const topMesh = new THREE.Mesh(tg, new THREE.MeshLambertMaterial({ map: top }));
    topMesh.receiveShadow = true; grp.add(topMesh);
    const S = kit(), rail = theme.rail ?? 0x2c5fd6, conc = theme.conc ?? 0xe2c3c8;
    S.box(2 * hw + 2.6, 1.6, len, 0, -0.85, -len / 2, 0x5a5e68);                        // stålkroppen
    for (let z = -len + 1; z < 0; z += 3) S.box(2 * hw + 2.7, 0.25, 0.3, 0, -1.6, z, 0x40444c);
    S.box(2 * hw + 2.7, 0.35, 0.4, 0, -0.2, -len + 0.2, 0xffc21a);                     // spetsens kant
    for (const sd of [-1, 1]) {
      const x = sd * (hw + 0.2);
      S.box(0.4, 0.6, len, x + sd * 0.2, 0.25, -len / 2, conc);
      for (const h of [0.82, 1.18, 3.45]) S.box(0.22, 0.18, len, x + sd * 0.19, h, -len / 2, rail);
      for (let z = -len + 0.8; z < 0; z += 2) S.box(0.16, 3.4, 0.16, x + sd * 0.3, 1.7, z, rail);
    }
    for (const m of S.meshes(lamMat())) { m.castShadow = true; grp.add(m); }
    return grp;
  }

  // klaffbrons läge vid tiden t: båtens läge a längs floden (0 = under bron), fart och klaffarnas vinkel
  bridgeAt(z, t) {
    const x = t + z.phi, n = Math.floor(x / z.P), tau = x - n * z.P, dir = n % 2 ? -1 : 1;
    const u = clamp((tau - BR.T0) / BR.TTR, 0, 1), f = BR.ACC, vm = 1 / (1 - f);
    const s = u < f ? vm * u * u / (2 * f) : u > 1 - f ? 1 - vm * (1 - u) ** 2 / (2 * f) : vm * (f / 2 + (u - f));
    const vel = (u <= 0 || u >= 1) ? 0 : (u < f ? vm * u / f : u > 1 - f ? vm * (1 - u) / f : vm) * 2 * z.D / BR.TTR;
    const ang = BR.MAXA * (smooth(z.tO0, z.tO1, tau) - smooth(z.tC0, z.tC1, tau));
    return { n, tau, dir, a: dir * z.D * (2 * s - 1), vel, ang };
  }

  // överlappar [ta, tb] tiden då övergången/bron är farlig? Svarar med när den faran är över (annars 0).
  danger(z, ta, tb) {
    for (let n = Math.floor((ta + z.phi) / z.P) - 1; n <= Math.floor((tb + z.phi) / z.P); n++) {
      const a = n * z.P - z.phi + z.h0, b = n * z.P - z.phi + z.h1;
      if (a < tb && b > ta) return b;
    }
    return 0;
  }

  // Bottarna: högsta fart (m/s) som gör att bilen kommer fram till stopplinjen först när tåget har kört förbi
  // / klaffbron har fällts ner igen — eller −1 om vägen är fri. Kroken i ai.js (efter "if (lift) …"):
  //   const cap = game.events?.speedCap?.(car) ?? -1;
  //   if (cap >= 0 && sp > cap) { inp.throttle = 0; inp.brake = Math.min(1, (sp - cap) / 10); this.stuckT = 0; }
  speedCap(car) {
    if (!this.zones.length || !car?.trk) return -1;
    const T = this.g.track, t = this.g.clock(), sp = Math.max(5, car.veh.speed);
    let cap = -1;
    for (const z of this.zones) {
      const d = T.sdist(z.stopS, car.trk.s);
      if (d < -0.5 || d > 450) continue;
      const end = this.danger(z, t + d / sp, t + (d + z.pass) / sp);
      if (!end) continue;
      const c = Math.max(0, d - 1.5) / Math.max(0.1, end - t + 0.4);
      cap = cap < 0 ? c : Math.min(cap, c);
    }
    return cap;
  }
  // avstånd (m) till stopplinjen om bilen skulle komma fram när det är farligt, annars −1
  stopAhead(car) {
    if (!this.zones.length || !car?.trk) return -1;
    const T = this.g.track, t = this.g.clock(), sp = Math.max(5, car.veh.speed);
    let best = -1;
    for (const z of this.zones) {
      const d = T.sdist(z.stopS, car.trk.s);
      if (d < -0.5 || d > 450) continue;
      if (this.danger(z, t + d / sp, t + (d + z.pass) / sp)) best = best < 0 ? d : Math.min(best, d);
    }
    return best;
  }
  // är övergången/bron farlig just nu?
  blocked(z, t = this.g.clock()) { return this.danger(z, t, t + 0.01); }

  // ---------- fysiken (värden/ensam) ----------
  step(dt) {
    const g = this.g;
    if (g.trackId !== this.trackId) this.onTrack();
    if (!this.zones.length) return;
    const t = g.clock();
    for (const z of this.klaffs) {
      // klaffarna: nästa fysiksteg ska ha vinkeln för t + dt
      const ang = this.bridgeAt(z, t + dt).ang;
      for (const L of z.leaves) {
        if (!L.body) continue;
        _q.copy(L.q0).multiply(_q2.setFromAxisAngle(_X, ang));
        L.body.setNextKinematicTranslation({ x: L.H.x, y: L.H.y, z: L.H.z });
        L.body.setNextKinematicRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w });
      }
      this.waterCheck(z, dt, t);
      // en halvöppen klaff är en hoppbacke — men ingen katapult: farten uppåt begränsas
      if (ang > 0.02 || this.bridgeAt(z, t - 3).ang > 0.02) for (const car of g.cars) {
        if (car.hidden || car.wrecked) continue;
        const d = g.track.sdist(car.trk.s, z.sA);
        if (d < -25 || d > z.sB - z.sA + 80) continue;
        const lv = car.veh.body.linvel();
        if (lv.y > BR.VYMAX) car.veh.body.setLinvel({ x: lv.x, y: lv.y + (BR.VYMAX - lv.y) * Math.min(1, dt * 12), z: lv.z }, true);
        // (logg: vem körde på en uppfälld klaff — hopp eller smäll)
        if (ang > 0.08 && d > -2 && d < 3 && Math.abs(car.trk.lat) < z.hw && (car.evKlaffT || -9) < t - 5) {
          car.evKlaffT = t;
          this.log.push({ t: +t.toFixed(2), typ: ang > 0.8 ? 'klaff-smäll' : 'klaff-hopp', bil: car.name, grad: Math.round(ang * 57.3), v: Math.round(car.veh.speed) });
        }
      }
    }
    for (const z of this.rails) this.trainHits(z, t);
    for (const z of this.slides) this.rockHits(z, t);
  }

  // tåget träffar bilar på rälsen
  trainHits(z, t) {
    const g = this.g, st = this.trainAt(z, t);
    const Lin = st.dir > 0 ? z.L1 : z.L2, Lout = st.dir > 0 ? z.L2 : z.L1;
    if (st.q < -Lin || st.q - z.LT > Lout) return;               // tåget är i tunneln
    const dA = _v3.copy(z.A).multiplyScalar(st.dir);           // färdriktningen
    for (const car of g.cars) {
      if (car.hidden || car.wrecked || car.ghostT > 0) continue;
      if ((z.hit.get(car) || -1) > t) continue;
      const v = car.veh, p = v.pos;
      const dx = p.x - z.C.x, dz = p.z - z.C.z, h = p.y - z.C.y;
      if (h < -2.5 || h > 6.5) continue;
      const u = dx * z.A.x + dz * z.A.z, w = dx * z.B.x + dz * z.B.z, qc = u * st.dir;
      const rq = v.T.half.x + 0.4, rw = v.T.half.z * 0.75 + 0.3;
      if (Math.abs(w) > 1.75 + rw || qc > st.q + rq || qc < st.q - z.LT - rq) continue;
      // från vilket håll kom bilen? (förra fysikstegets läge)
      const w0 = (car.p0.x - z.C.x) * z.B.x + (car.p0.z - z.C.z) * z.B.z;
      const lv = v.body.linvel(), vb = lv.x * z.B.x + lv.z * z.B.z;
      let side = Math.abs(w0) > 0.4 ? Math.sign(w0) : (Math.abs(vb) > 1 ? Math.sign(vb) : 1);
      const nose = qc > st.q - 4.5;
      let nvx, nvy, nvz, dmg;
      if (nose) {
        // loket kör på bilen: den slungas med tåget, åt sidan och upp — och snurrar
        if (Math.abs(w0) < 0.4) side = Math.abs(vb) > 1 ? Math.sign(vb) : 1;
        nvx = dA.x * z.v * 0.55 + z.B.x * side * 13; nvz = dA.z * z.v * 0.55 + z.B.z * side * 13; nvy = 9;
        dmg = 38;
      } else {
        // bilen körde in i tågets sida: studsar tillbaka och dras med en bit
        const into = Math.abs(vb), wt = side * (1.75 + rw + 0.25);
        v.body.setTranslation({ x: p.x + z.B.x * (wt - w), y: p.y + 0.15, z: p.z + z.B.z * (wt - w) }, true);
        nvx = z.B.x * side * (3 + into * 0.25) + dA.x * z.v * 0.6; nvz = z.B.z * side * (3 + into * 0.25) + dA.z * z.v * 0.6; nvy = 4 + into * 0.05;
        dmg = clamp(16 + into * 0.3, 16, 40);
      }
      const old = new THREE.Vector3(lv.x, lv.y, lv.z);
      v.body.setLinvel({ x: nvx, y: nvy, z: nvz }, true);
      v.body.setAngvel({ x: (Math.random() - 0.5) * 5, y: side * (4 + Math.random() * 4), z: (Math.random() - 0.5) * 5 }, true);
      v.spinT = Math.max(v.spinT || 0, 2.2);
      v.readState();
      z.hit.set(car, t + 1.3);
      car.health -= dmg / (v.T.armor || 1);
      car.lastDmgT = g.simT; car.lastHitBy = null;
      this.impactFx(car, old, new THREE.Vector3(nvx, nvy, nvz), dmg);
      g.notify(car, '🚂 TÅGET! Du blev påkörd av tåget!', 'bad');
      this.log.push({ t: +t.toFixed(2), typ: nose ? 'tåg-nos' : 'tåg-sida', bil: car.name, dmg: Math.round(dmg), v: Math.round(old.length()), w: +w0.toFixed(1), q: Math.round(qc - st.q) });
      if (car.health <= 0) g.wreck(car);
    }
  }

  // buckla + gnistor + smäll — och samma sak hos gästerna via den vanliga 'hit'-händelsen
  impactFx(car, vOld, vNew, dmg) {
    const g = this.g, v = car.veh;
    const dW = vNew.clone().sub(vOld), dv = dW.length(); if (dv < 0.1) return;
    dW.divideScalar(dv);
    const dl = dW.clone().applyQuaternion(_q.copy(v.quat).invert());
    const cp = { x: clamp(-dl.x * 2.2, -0.98, 0.98), y: 0.15 + Math.max(-0.2, -dl.y) * 0.4, z: clamp(-dl.z * 3.4, -2.45, 2.45) };
    car.view.dent?.(cp.x, cp.y, cp.z, dl.x, dl.y, dl.z, dmg * 0.012);
    const [u, vv] = car.view.uvNear?.(cp.x, cp.y, cp.z) || [0.5, 0.5];
    car.view.livery?.scratch?.(u, vv, dmg);
    const sp = new THREE.Vector3(cp.x, cp.y, cp.z).applyQuaternion(v.quat).add(v.pos);
    g.fx.tackle(sp, v.vel, dW.clone().negate(), 2.5);
    g.fx.sparks(sp, v.vel, 30, 10);
    const near = g.me ? (car === g.me ? 1 : Math.max(0, 1 - g.me.veh.pos.distanceTo(v.pos) / 120)) : 0.8;
    g.audio?.crash?.(28, near);
    if (g.net) {
      const r3 = (x) => Math.round(x * 1000) / 1000;
      g.emit({ t: 'hit', id: car.id, by: 0, cp: [r3(cp.x), r3(cp.y), r3(cp.z)], dl: [r3(dl.x), r3(dl.y), r3(dl.z)], amt: r3(dmg * 0.012), u: r3(u), v: r3(vv), dmg: Math.round(dmg), dv: 28, sp: [r3(sp.x), r3(sp.y), r3(sp.z)] });
    }
  }

  // bilar som åkt ner i floden när klaffarna var uppe: plask, sedan tillbaka en bit före bron
  waterCheck(z, dt, t) {
    const g = this.g, T = g.track;
    for (const car of g.cars) {
      if (car.hidden || car.wrecked) { z.wet.delete(car); continue; }
      const v = car.veh;
      if (z.wet.has(car) && v.pos.y > car.trk.y - 2) { z.wet.delete(car); car.evFall = 0; continue; }   // redan tillbaka på vägen
      const wet = z.wet.has(car);
      // floden under bron (åt båda hållen längs dalen)
      const inZone = Math.abs(T.sdist(car.trk.s, z.sM)) < 34 && Math.abs(car.trk.lat) < 70;
      if (!wet && (!inZone || v.pos.y > car.trk.y - 3.2)) { car.evFall = 0; continue; }
      car.evFall = (car.evFall || 0) + dt;
      if (v.pos.y < z.waterY + 1.2) {
        // i vattnet: bromsas upp och sjunker lite
        const lv = v.body.linvel(), k = Math.max(0, 1 - 4 * dt);
        v.body.setLinvel({ x: lv.x * k, y: Math.min(lv.y, 0) * k - 0.6, z: lv.z * k }, true);
        if (!wet) {
          z.wet.add(car); car.evWetT = 0;
          this.splash(v.pos);
          g.notify(car, '🌊 PLASK! Du åkte i vattnet under klaffbron!', 'bad');
          this.log.push({ t: +t.toFixed(2), typ: 'plask', bil: car.name });
        }
      }
      if (z.wet.has(car)) car.evWetT += dt;
      if ((z.wet.has(car) && car.evWetT > 0.9) || car.evFall > 3) {
        z.wet.delete(car); car.evFall = 0;
        g.respawn(car, Math.max(20, T.sdist(car.trk.s, z.sA - 70)), 'klaff');
        // är bron fortfarande farlig får bilen stå still och vänta i stället för att rusa ner igen
        if (this.danger(z, t, t + 6)) { v.body.setLinvel({ x: v.fwd.x * 3, y: 0, z: v.fwd.z * 3 }, true); v.readState(); }
      }
    }
  }

  splash(p) {
    const fx = this.g.fx;
    for (let n = 0; n < 50; n++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 6;
      fx.puff.spawn(p.x + Math.cos(a) * r * 0.3, p.y + 0.3, p.z + Math.sin(a) * r * 0.3, Math.cos(a) * r, 6 + Math.random() * 10, Math.sin(a) * r, 0.9 + Math.random() * 0.6, 1.2, 3.5, WHITE, WATER, 0.85, 14, 0.8);
    }
    this.sfx.burst(0.7 * this.sfx.near(p, 260), 0.8, 700);
  }

  // ---------- bilden (alla datorer) ----------
  frame(dt) {
    const g = this.g;
    if (g.trackId !== this.trackId) this.onTrack();
    if (!this.zones.length) return;
    // samma tid som bilarna ritas i: gästen ligger 110 ms efter (interpolationen), värden upp till ett fysiksteg
    const t = g.mode === 'client' ? g.clock() - 0.11 : g.clock() - DT + (g.acc || 0);
    let rumble = 0, motor = 0;
    for (const z of this.rails) rumble = Math.max(rumble, this.frameRail(z, t, dt));
    for (const z of this.klaffs) motor = Math.max(motor, this.frameKlaff(z, t, dt));
    for (const z of this.slides) rumble = Math.max(rumble, this.frameSlide(z, t, dt));
    this.sfx.loop('rumbleL', 220, rumble);
    this.sfx.loop('motorL', 140, motor);
  }

  setLamp(mat, on, onHex, offHex) { mat.color.setHex(on ? onHex : offHex); }

  frameRail(z, t, dt) {
    const g = this.g, st = this.trainAt(z, t), tau = st.tau;
    const lights = tau > z.tH0 - TR.WARN && tau < z.tH1 + 1.2;
    const blink = Math.floor(t * 2.6) % 2 === 0;
    this.setLamp(z.lampA, lights && blink, 0xff2a1a, 0x3a0a0a); this.setLamp(z.lampB, lights && !blink, 0xff2a1a, 0x3a0a0a);
    z.gA.visible = lights && blink; z.gB.visible = lights && !blink;
    const warn = lights && Math.floor(t * 2) % 2 === 0;
    this.setLamp(z.warnMat, warn, 0xffb21a, 0x3a2a08); z.warnGlow.visible = warn;
    const down = smooth(z.tH0 - TR.GATE0, z.tH0 - TR.GATE1, tau) * (1 - smooth(z.tH1 + TR.UP0, z.tH1 + TR.UP1, tau));
    for (const a of z.arms) a.rotation.z = UP * (1 - down);
    z.down = down; z.lights = lights;
    // tåget
    const Lin = st.dir > 0 ? z.L1 : z.L2, Lout = st.dir > 0 ? z.L2 : z.L1;
    const vis = st.q > -Lin - 2 && st.q - z.LT < Lout + 2;
    z.train.visible = vis;
    const cam = g.camera.position;
    let rumble = 0;
    if (vis) {
      const dA = _v3.copy(z.A).multiplyScalar(st.dir);
      z.train.position.copy(z.C).addScaledVector(dA, st.q);
      z.train.quaternion.setFromRotationMatrix(_m.makeBasis(_v.copy(dA).cross(Y), Y, _v2.copy(dA).negate()));
      // ångloket ryker (inte inne i tunneln)
      if (z.steam && cam.distanceTo(z.train.position) < 900) {
        for (const [x, y, zz] of z.stacks) {
          if (Math.random() > dt * 40) continue;
          _v.set(x, y, zz).applyQuaternion(z.train.quaternion).add(z.train.position);
          const u = (_v.x - z.C.x) * z.A.x + (_v.z - z.C.z) * z.A.z;
          if (u > z.L2 - 2 || u < -z.L1 + 2) continue;
          g.fx.smoke(_v, _v2.set(dA.x * z.v * 0.3, 3, dA.z * z.v * 0.3), true, 1.6);
        }
      }
      // mullret: närmaste punkt på tåget
      const qc = st.dir * ((cam.x - z.C.x) * z.A.x + (cam.z - z.C.z) * z.A.z), qq = clamp(qc, Math.max(st.q - z.LT, -Lin), Math.min(st.q, Lout));
      rumble = 0.5 * this.sfx.near(_v.copy(z.C).addScaledVector(dA, qq), 380);
    }
    // klockan när ljusen blinkar, tutan när tåget närmar sig
    if (lights) { z.bellT -= dt; if (z.bellT <= 0) { z.bellT = 0.38; this.sfx.ding(0.32 * this.sfx.near(z.C, 320)); } } else z.bellT = 0;
    if (st.q > TR.HORN && st.q < TR.HORN + 60 && z.hornN !== st.n) {
      z.hornN = st.n;
      this.sfx.horn(0.26 * this.sfx.near(_v.copy(z.C).addScaledVector(z.A, st.dir * st.q), 1100), z.steam ? [392, 494, 587] : [277, 349, 415], 1.3, z.steam ? 2200 : 1500);
    }
    return rumble;
  }

  frameKlaff(z, t, dt) {
    const g = this.g, st = this.bridgeAt(z, t), tau = st.tau;
    // klaffarna (bilden — hos värden följer kropparna samma vinkel)
    for (const L of z.leaves) L.grp.quaternion.copy(L.q0).multiply(_q2.setFromAxisAngle(_X, st.ang));
    const moving = Math.abs(st.ang - z.angPrev) > 1e-4; z.angPrev = st.ang; z.ang = st.ang;
    // trafikljus: gult, sedan rött medan bron är uppe, grönt annars
    const redOn = tau > z.tO0 - BR.WARN && tau < z.tC1 + 1;
    const yelOn = tau > z.tO0 - BR.WARN - 1.6 && tau <= z.tO0 - BR.WARN;
    this.setLamp(z.red, redOn, 0xff2a1a, 0x3a0a0a); this.setLamp(z.yel, yelOn, 0xffb21a, 0x3a2a08); this.setLamp(z.grn, !redOn && !yelOn, 0x2bff5a, 0x0a3a14);
    z.glR.visible = redOn; z.glY.visible = yelOn; z.glG.visible = !redOn && !yelOn;
    const warn = (redOn || yelOn) && Math.floor(t * 2.2) % 2 === 0;
    this.setLamp(z.warnMat, warn, 0xffb21a, 0x3a2a08); z.warnGlow.visible = warn;
    const down = smooth(z.tO0 - 4.5, z.tO0 - 2.5, tau) * (1 - smooth(z.tC1 + 0.6, z.tC1 + 3.0, tau));
    for (const a of z.arms) a.rotation.z = UP * (1 - down);
    z.down = down; z.lights = redOn;
    // båten: går längs floden, guppar, vänder vid bryggan medan den väntar på nästa tur
    const turn = smooth(BR.T0 + BR.TTR + 5, BR.T0 + BR.TTR + 14, tau);
    const yaw = Math.atan2(-z.Rv.x * st.dir, -z.Rv.z * st.dir) + Math.PI * turn;
    z.boat.position.copy(z.O).addScaledVector(z.Rv, st.a); z.boat.position.y = z.waterY + Math.sin(t * 1.3) * 0.18;
    z.boat.rotation.set(Math.sin(t * 0.9) * 0.02, yaw, Math.sin(t * 1.1 + 1) * 0.025, 'YXZ');
    if (z.wheel) z.wheel.rotation.x -= dt * (0.3 + st.vel * 0.25);
    const cam = g.camera.position;
    if (cam.distanceTo(z.boat.position) < 1100) {
      for (const [x, y, zz] of z.stacks) {
        if (Math.random() > dt * (st.vel > 1 ? 26 : 8)) continue;
        _v.set(x, y, zz).applyEuler(z.boat.rotation).add(z.boat.position);
        g.fx.smoke(_v, _v2.set(-z.Rv.x * st.dir * st.vel * 0.5, 2.5, -z.Rv.z * st.dir * st.vel * 0.5), true, 1.4);
      }
      // svallvågor vid fören och efter aktern
      if (st.vel > 2 && Math.random() < dt * 30) {
        const side = Math.random() < 0.5 ? -1 : 1;
        _v.copy(z.boat.position).addScaledVector(z.Rv, st.dir * z.boatL * (Math.random() < 0.5 ? 0.45 : -0.5)).addScaledVector(z.Bv, side * 4);
        g.fx.puff.spawn(_v.x, z.waterY + 0.2, _v.z, z.Bv.x * side * 3, 0.8, z.Bv.z * side * 3, 1.6, 1.5, 5, WHITE, FOAM, 0.7, 0, 0.8);
      }
    }
    // ljud: klockan vid bommarna, båtens tuta när den närmar sig bron
    if (redOn && tau < z.tC1) { z.bellT -= dt; if (z.bellT <= 0) { z.bellT = 0.55; this.sfx.ding(0.26 * this.sfx.near(z.leaves[0].H, 340), 1180); } } else z.bellT = 0;
    if (tau > z.tMid - 9 && tau < z.tMid - 6 && z.hornN !== st.n) { z.hornN = st.n; this.sfx.horn(0.3 * this.sfx.near(z.boat.position, 900), [98, 147], 2.2, 600); }
    // plask hos gästerna (värden plaskar i step): en bil som faller ner i vattnet
    if (g.mode === 'client') for (const car of g.cars) {
      if (car.hidden) continue;
      const p = car.view.group.position;
      const below = p.y < z.waterY + 1.0 && Math.abs(g.track.sdist(car.trk.s, z.sM)) < (z.sB - z.sA) / 2 + 9 && Math.abs(car.trk.lat) < z.hw + 6;
      if (below && !car.evSplashed) { car.evSplashed = true; this.splash(p); }
      else if (!below && car.evSplashed && p.y > z.waterY + 4) car.evSplashed = false;
    }
    return moving ? 0.35 * this.sfx.near(z.leaves[0].H, 300) : 0;
  }

  // ---------- STENRAS i kanjonen: stenar rasar ner från klippväggen och rullar tvärs över vägen ----------
  buildSlide(f, k, s) {
    const g = this.g, T = g.track, hw = T.halfW, R = this.root, theme = this.ctx.theme || {};
    s = T.wrapS(s);
    const c0 = new THREE.Color(theme.mtn?.[1] ?? 0xb85a36), c1 = c0.clone().lerp(new THREE.Color(0xf0d0a0), 0.35);
    const geo = paint(new THREE.DodecahedronGeometry(1, 0).scale(1, 0.85, 1.1), (x, y) => (y > 0.25 ? c1 : c0).getHex());
    geo.computeVertexNormals();
    const mesh = new THREE.InstancedMesh(geo, lamMat(), RAS.N);
    mesh.visible = false; mesh.castShadow = true; mesh.frustumCulled = false;
    R.add(mesh);
    const warnMat = new THREE.MeshBasicMaterial({ color: 0x3a2a08, toneMapped: false });
    const wp = [];
    for (const sd of [-1, 1]) wp.push(...this.signPost(s - 260, sd * (hw + 4.5), signTex('STENRAS!', 'HÅLL UTKIK UPPÅT!', '#ff9a1c'), warnMat));
    const warnGlow = glowPoints(wp, 0xffb21a, 6); R.add(warnGlow);
    const P = k ? 37 : 29, tRel = RAS.WARN + 1;
    return {
      kind: 'ras', f, s, side: k % 2 ? -1 : 1, hw, mesh, P, phi: mod(s * 0.29 + k * 11, P), tRel, warnMat, warnGlow,
      h0: tRel + RAS.TF - 0.5, h1: tRel + 0.9 + RAS.TF + (2 * hw - 3.5) / RAS.VR[0] + 0.4, stopS: s - 26, pass: 58,
      hit: new Map(), thud: new Set(), warn: false, active: 0,
    };
  }
  // sten j i raset nummer n, tau s in i cykeln: läge längs vägen (ds, lat, höjd), rullvinkel, fas — eller null
  rock(z, n, j, tau) {
    const H = (a) => { const v = Math.sin(n * 127.1 + j * 311.7 + z.s * 0.0137 + a * 17.3) * 43758.5453; return v - Math.floor(v); };
    const r = RAS.R[0] + (RAS.R[1] - RAS.R[0]) * H(1), delay = H(2) * 0.9, vr = RAS.VR[0] + (RAS.VR[1] - RAS.VR[0]) * H(3);
    const ds = (H(4) - 0.5) * 28, hw = z.hw, sd = z.side;
    const lat0 = sd * (hw + 20 + H(5) * 8), h0 = 24 + H(6) * 10, latL = sd * (hw - 2), latR = -sd * (hw - 1.5);
    const tr = tau - z.tRel - delay;
    if (tr < 0) return null;
    const Tr = Math.abs(latR - latL) / vr, d0 = Math.abs(lat0 - latL), base = H(7) * 6.28;
    if (tr < RAS.TF) { const u = tr / RAS.TF; return { ds, r, lat: lat0 + (latL - lat0) * u, h: h0 + (r - h0) * u * u, roll: base + d0 * u / r, ph: 1, vl: -sd * vr, k: 1 }; }
    const u = (tr - RAS.TF) / Tr;
    if (u < 1) return { ds, r, lat: latL + (latR - latL) * u, h: r * 0.85 + 2.6 * Math.abs(Math.sin(Math.PI * 2 * u)) * (1 - u), roll: base + (d0 + Math.abs(latR - latL) * u) / r, ph: 2, vl: -sd * vr, k: 1 };
    const e = (tr - RAS.TF - Tr) / 0.6;                         // smäller i muren på andra sidan och går sönder
    if (e < 1) return { ds, r, lat: latR, h: r * 0.85, roll: base + (d0 + Math.abs(latR - latL)) / r, ph: 3, vl: 0, k: 1 - e };
    return null;
  }
  slideAt(z, t) { const x = t + z.phi, n = Math.floor(x / z.P); return { n, tau: x - n * z.P }; }

  // stenarna knuffar bilar de träffar (värden)
  rockHits(z, t) {
    const g = this.g, T = g.track, { n, tau } = this.slideAt(z, t);
    if (tau < z.tRel || tau > z.tRel + 7) return;
    for (let j = 0; j < RAS.N; j++) {
      const r = this.rock(z, n, j, tau);
      if (!r || r.ph === 3 || r.h > 7) continue;
      const P = T.pointAt(z.s + r.ds, r.lat, new THREE.Vector3()); P.y += r.h;
      for (const car of g.cars) {
        if (car.hidden || car.wrecked || car.ghostT > 0) continue;
        const key = car.id * 16 + j;
        if ((z.hit.get(key) || -1) > t) continue;
        const v = car.veh, cr = Math.max(v.T.half.x, v.T.half.z) * 0.75 + 0.3;
        if (v.pos.distanceToSquared(P) > (r.r + cr) ** 2) continue;
        const f = T.sampleAt(z.s + r.ds), sg = Math.sign(r.vl) || -z.side, lv = v.body.linvel();
        const old = new THREE.Vector3(lv.x, lv.y, lv.z);
        const nv = new THREE.Vector3(lv.x * 0.45 + f.rx * sg * Math.abs(r.vl) * 0.9, 7, lv.z * 0.45 + f.rz * sg * Math.abs(r.vl) * 0.9);
        v.body.setLinvel({ x: nv.x, y: nv.y, z: nv.z }, true);
        v.body.setAngvel({ x: (Math.random() - 0.5) * 6, y: (Math.random() - 0.5) * 8, z: (Math.random() - 0.5) * 6 }, true);
        v.spinT = Math.max(v.spinT || 0, 1.8);
        v.readState();
        z.hit.set(key, t + 1.5);
        const dmg = 24;
        car.health -= dmg / (v.T.armor || 1);
        car.lastDmgT = g.simT; car.lastHitBy = null;
        this.impactFx(car, old, nv, dmg);
        g.notify(car, '🪨 STENRAS! En sten träffade dig!', 'bad');
        this.log.push({ t: +t.toFixed(2), typ: 'sten', bil: car.name, dmg, v: Math.round(old.length()) });
        if (car.health <= 0) g.wreck(car);
      }
    }
  }

  frameSlide(z, t, dt) {
    const g = this.g, T = g.track, { n, tau } = this.slideAt(z, t), hw = z.hw;
    const warn = tau > z.tRel - RAS.WARN && tau < z.tRel + 6;
    const on = warn && Math.floor(t * 2.4) % 2 === 0;
    this.setLamp(z.warnMat, on, 0xffb21a, 0x3a2a08); z.warnGlow.visible = on;
    z.warn = warn;
    // förvarning: grus och damm trillar från klippkanten
    if (tau > z.tRel - RAS.WARN && tau < z.tRel + 1.5 && Math.random() < dt * 22) {
      const P = T.pointAt(z.s + (Math.random() - 0.5) * 34, z.side * (hw + 21 + Math.random() * 6), _v); P.y += 24 + Math.random() * 8;
      const f = T.sampleAt(z.s);
      g.fx.puff.spawn(P.x, P.y, P.z, -f.rx * z.side * 3, -3, -f.rz * z.side * 3, 1.4 + Math.random(), 1.5, 6, DUST0, DUST1, 0.55, 8, 0.6);
    }
    let act = 0;
    const pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    for (let j = 0; j < RAS.N; j++) {
      const r = warn ? this.rock(z, n, j, tau) : null;
      if (!r) { z.mesh.setMatrixAt(j, _m.makeScale(0, 0, 0)); continue; }
      act++;
      T.pointAt(z.s + r.ds, r.lat, pos); pos.y += r.h;
      T.quatAt(z.s + r.ds, q).multiply(_q2.setFromAxisAngle(_v3.set(0, 0, 1), -Math.sign(r.vl || 1) * r.roll)).multiply(_q.setFromAxisAngle(_X, j * 1.7));
      z.mesh.setMatrixAt(j, _m.compose(pos, q, sc.setScalar(r.r * r.k)));
      if (r.ph === 1 && Math.random() < dt * 20) g.fx.puff.spawn(pos.x, pos.y, pos.z, 0, 1, 0, 1.2, 2, 5, DUST0, DUST1, 0.5, -0.5, 0.8);
      const key = n * 16 + j;
      if (r.ph >= 2 && !z.thud.has(key)) {
        // dunsen när stenen slår ner i vägen
        z.thud.add(key); if (z.thud.size > 64) z.thud.clear();
        for (let k = 0; k < 14; k++) g.fx.puff.spawn(pos.x, pos.y - r.r * 0.6, pos.z, (Math.random() - 0.5) * 9, 2 + Math.random() * 4, (Math.random() - 0.5) * 9, 1.0 + Math.random() * 0.8, 2, 7, DUST0, DUST1, 0.7, 4, 1.2);
        this.sfx.burst(0.55 * this.sfx.near(pos, 320), 0.45, 160);
      }
      if (r.ph === 3 && Math.random() < dt * 30) g.fx.puff.spawn(pos.x, pos.y, pos.z, (Math.random() - 0.5) * 6, 3, (Math.random() - 0.5) * 6, 1.1, 2.5, 7, DUST0, DUST1, 0.7, 2, 1);
    }
    z.mesh.instanceMatrix.needsUpdate = true;
    z.mesh.visible = act > 0; z.active = act;
    return warn ? (tau > z.tRel ? 0.45 : 0.22) * this.sfx.near(T.pointAt(z.s, 0, _v), 360) : 0;
  }

  // läget just nu (tester och felsökning)
  state() {
    const t = this.g.clock();
    return {
      rails: this.rails.map(z => { const s = this.trainAt(z, t); return { s: Math.round(z.f.c), P: z.P, v: +z.v.toFixed(1), tau: +s.tau.toFixed(2), q: Math.round(s.q), dir: s.dir, lights: z.lights, down: +z.down.toFixed(2), train: z.train.visible, blocked: !!this.blocked(z, t) }; }),
      ras: this.slides.map(z => { const s = this.slideAt(z, t); return { s: Math.round(z.s), P: z.P, tau: +s.tau.toFixed(2), varning: z.warn, stenar: z.active, blocked: !!this.blocked(z, t) }; }),
      klaffs: this.klaffs.map(z => { const s = this.bridgeAt(z, t); return { s: Math.round(z.sM), P: z.P, tau: +s.tau.toFixed(2), a: Math.round(s.a), deg: Math.round(s.ang * 180 / Math.PI), lights: z.lights, down: +z.down.toFixed(2), blocked: !!this.blocked(z, t), water: +z.waterY.toFixed(1) }; }),
    };
  }
}
