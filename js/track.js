// Banan: en lång slinga genom snöbergen med backar, krön och doserade kurvor.
// Allt (väg, murar, terräng, AI, placeringar) utgår från samma sampling var 4:e meter.
import * as THREE from 'three';
import { CONF } from './config.js?v=6';

// Kontrollpunkter (x, z). Start/mål vid (0,0), körriktning +x.
const CTRL = [
  [0, 0], [600, 0], [1200, 10], [1700, 70], [2100, 260], [2260, 600], [2150, 950],
  [1850, 1150], [1400, 1200], [900, 1050], [400, 1150], [-100, 1300], [-700, 1250],
  [-1300, 1250], [-1900, 1150], [-2300, 900], [-2450, 500], [-2300, 150], [-1900, -30],
  [-1300, -60], [-650, 0],
];
// Krön (andel av varvet): i full fart lättar bilarna
const CRESTS = [
  { s: 0.085, h: 7, w: 55 }, { s: 0.50, h: 6, w: 50 }, { s: 0.60, h: 8, w: 60 }, { s: 0.91, h: 6.5, w: 55 },
];

const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export function buildTrack() {
  const curve = new THREE.CatmullRomCurve3(CTRL.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
  curve.arcLengthDivisions = 12000;
  const L = curve.getLength();
  const N = Math.round(L / CONF.DS);
  const ds = L / N;
  const sp = curve.getSpacedPoints(N);

  const wrapS = (s) => ((s % L) + L) % L;
  const sdist = (a, b) => { let d = wrapS(a - b); if (d > L / 2) d -= L; return d; };
  const rawH = (s) => {
    const a = 2 * Math.PI * s / L;
    let h = 16 * Math.sin(3 * a + 0.5) + 7 * Math.sin(7 * a + 1.3) + 3 * Math.sin(13 * a + 2.1);
    for (const c of CRESTS) { const d = sdist(s, c.s * L); h += c.h * Math.exp(-(d * d) / (2 * c.w * c.w)); }
    return h;
  };
  const H0 = rawH(0);
  // platt kring start/mål så griden ligger plant
  const elev = (s) => smoothstep(160, 520, Math.abs(sdist(s, 0))) * (rawH(s) - H0);

  const A = () => new Float32Array(N);
  const px = A(), py = A(), pz = A(), hx = A(), hz = A();
  const fx = A(), fy = A(), fz = A(), rx = A(), ry = A(), rz = A(), ux = A(), uy = A(), uz = A();
  const kk = A(), bank = A(), slope = A();
  for (let i = 0; i < N; i++) { px[i] = sp[i].x; pz[i] = sp[i].z; py[i] = elev(i * ds); }
  for (let i = 0; i < N; i++) {
    const a = (i - 1 + N) % N, b = (i + 1) % N;
    const dx = px[b] - px[a], dz = pz[b] - pz[a], l = Math.hypot(dx, dz) || 1;
    hx[i] = dx / l; hz[i] = dz / l;
  }
  // krökning (positiv = högersväng). Höger horisontellt = (-hz, hx)
  const k0 = A();
  for (let i = 0; i < N; i++) {
    const a = (i - 1 + N) % N, b = (i + 1) % N;
    k0[i] = ((hx[b] - hx[a]) * (-hz[i]) + (hz[b] - hz[a]) * hx[i]) / (2 * ds);
  }
  const box = (src, r) => {
    const out = A(); let acc = 0;
    for (let o = -r; o <= r; o++) acc += src[(o + N) % N];
    for (let i = 0; i < N; i++) { out[i] = acc / (2 * r + 1); acc += src[(i + r + 1) % N] - src[(i - r + N) % N]; }
    return out;
  };
  const ks = box(box(k0, 10), 10);
  kk.set(ks);

  for (let i = 0; i < N; i++) {
    const a = (i - 1 + N) % N, b = (i + 1) % N;
    let tx = px[b] - px[a], ty = py[b] - py[a], tz = pz[b] - pz[a];
    const tl = Math.hypot(tx, ty, tz); tx /= tl; ty /= tl; tz /= tl;
    // R0 = F × Y,  U0 = R0 × F
    let r0x = -tz, r0z = tx; const rl = Math.hypot(r0x, r0z); r0x /= rl; r0z /= rl;
    const u0x = -r0z * ty, u0y = r0z * tx - r0x * tz, u0z = r0x * ty;
    const bk = clamp(-CONF.BANK_K * ks[i], -CONF.BANK_MAX, CONF.BANK_MAX);
    const c = Math.cos(bk), s = Math.sin(bk);
    fx[i] = tx; fy[i] = ty; fz[i] = tz;
    rx[i] = r0x * c + u0x * s; ry[i] = u0y * s; rz[i] = r0z * c + u0z * s;
    ux[i] = u0x * c - r0x * s; uy[i] = u0y * c; uz[i] = u0z * c - r0z * s;
    bank[i] = bk;
    slope[i] = ry[i] / Math.hypot(rx[i], rz[i]); // höjdändring per meter i sidled
  }

  // Närmaste sample: lokal sökning runt en ledtråd, annars global grov + förfining
  function nearest(x, z, hint = -1) {
    let best = -1, bd = Infinity, bo = 0;
    if (hint >= 0) {
      for (let o = -36; o <= 36; o++) {
        const i = (hint + o + N) % N;
        const d = (px[i] - x) ** 2 + (pz[i] - z) ** 2;
        if (d < bd) { bd = d; best = i; bo = o; }
      }
      if (Math.abs(bo) < 36) return best;
    }
    bd = Infinity;
    for (let i = 0; i < N; i += 6) {
      const d = (px[i] - x) ** 2 + (pz[i] - z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    const c = best;
    for (let o = -7; o <= 7; o++) {
      const i = (c + o + N) % N;
      const d = (px[i] - x) ** 2 + (pz[i] - z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  function project(x, z, hint = -1, out = {}) {
    const i = nearest(x, z, hint);
    const dx = x - px[i], dz = z - pz[i];
    const along = dx * hx[i] + dz * hz[i];
    out.i = i;
    out.s = wrapS(i * ds + along);
    out.lat = dx * (-hz[i]) + dz * hx[i];
    out.y = py[i] + Math.max(-20, Math.min(20, out.lat)) * slope[i] + along * fy[i];
    return out;
  }

  // Interpolerad punkt + ram vid båglängd s
  function sampleAt(s, out = {}) {
    s = wrapS(s);
    const f = s / ds, i0 = Math.floor(f) % N, i1 = (i0 + 1) % N, t = f - Math.floor(f);
    const L1 = (a) => a[i0] + (a[i1] - a[i0]) * t;
    out.i = i0; out.s = s;
    out.x = L1(px); out.y = L1(py); out.z = L1(pz);
    out.fx = L1(fx); out.fy = L1(fy); out.fz = L1(fz);
    out.rx = L1(rx); out.ry = L1(ry); out.rz = L1(rz);
    out.ux = L1(ux); out.uy = L1(uy); out.uz = L1(uz);
    out.k = L1(kk);
    return out;
  }

  // Punkt på vägbanan vid (s, lat)
  function pointAt(s, lat, out = new THREE.Vector3()) {
    const f = sampleAt(s, _f);
    return out.set(f.x + f.rx * lat, f.y + f.ry * lat, f.z + f.rz * lat);
  }
  // Kvaternion för en bil som står på banan och tittar framåt (lokal −z = framåt)
  function quatAt(s, out = new THREE.Quaternion()) {
    const f = sampleAt(s, _f);
    _m.makeBasis(_a.set(f.rx, f.ry, f.rz).normalize(), _b.set(f.ux, f.uy, f.uz).normalize(), _c.set(-f.fx, -f.fy, -f.fz).normalize());
    return out.setFromRotationMatrix(_m);
  }
  const _f = {}, _m = new THREE.Matrix4(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < N; i++) {
    minX = Math.min(minX, px[i]); maxX = Math.max(maxX, px[i]);
    minZ = Math.min(minZ, pz[i]); maxZ = Math.max(maxZ, pz[i]);
  }

  return {
    N, ds, L, px, py, pz, hx, hz, fx, fy, fz, rx, ry, rz, ux, uy, uz, k: kk, bank, slope,
    bounds: { minX, maxX, minZ, maxZ },
    wrapS, sdist, nearest, project, sampleAt, pointAt, quatAt,
    halfW: CONF.ROAD_W / 2 + CONF.SHOULDER,
  };
}
