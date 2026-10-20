// Banorna: slingor genom snöbergen med backar, krön och doserade kurvor — och på HOPPBACKEN
// hopp med glipa, tunnlar genom berg, en dalbro och en bro där banan korsar sig själv.
// Allt (väg, murar, terräng, AI, placeringar) utgår från samma sampling var 4:e meter.
import * as THREE from 'three';
import { CONF } from './config.js?v=30';

// ---------- Banorna ----------
// SNÖBERGET: start/mål vid (0,0), körriktning +x.
const CTRL_SNO = [
  [0, 0], [600, 0], [1200, 10], [1700, 70], [2100, 260], [2260, 600], [2150, 950],
  [1850, 1150], [1400, 1200], [900, 1050], [400, 1150], [-100, 1300], [-700, 1250],
  [-1300, 1250], [-1900, 1150], [-2300, 900], [-2450, 500], [-2300, 150], [-1900, -30],
  [-1300, -60], [-650, 0],
];

// HOPPBACKEN: en åtta ritad med "sköldpadda" — två diagonaler som korsar varandra i rät vinkel
// och två öglor med radie 400 m (lika mjuka kurvor som Snöberget). Start på vänstra öglans raka.
function eightCtrl() {
  const R = 400, d = 410;
  const diag = 2 * d * Math.SQRT2, side = 2 * (d - R * Math.SQRT1_2);
  const cmds = [['S', side / 2], ['A', R, 135], ['S', diag], ['A', R, -135], ['S', side], ['A', R, -135], ['S', diag], ['A', R, 135], ['S', side / 2]];
  return turtleCtrl(cmds, -(d + R + R * Math.SQRT1_2), 0, -Math.PI / 2);     // söderut
}
// Sköldpaddan: ['S', längd] = rakt, ['A', radie, grader] = båge (+ = höger). Punkt var ~50:e meter.
function turtleCtrl(cmds, x = 0, z = 0, th = 0) {
  const pts = [];
  const STEP = 50;
  for (const [c, a1, a2] of cmds) {
    if (c === 'S') {
      const n = Math.max(1, Math.round(a1 / STEP));
      for (let k = 0; k < n; k++) { pts.push([x, z]); x += Math.cos(th) * a1 / n; z += Math.sin(th) * a1 / n; }
    } else {
      const ang = a2 * Math.PI / 180, n = Math.max(2, Math.round(Math.abs(ang) * a1 / STEP));
      for (let k = 0; k < n; k++) {
        pts.push([x, z]);
        const dth = ang / n;
        // korda längs bågen
        const chord = 2 * a1 * Math.sin(Math.abs(dth) / 2);
        x += Math.cos(th + dth / 2) * chord; z += Math.sin(th + dth / 2) * chord;
        th += dth;
      }
    }
  }
  return pts;
}

// VULKANBANAN: en lång njure runt vulkanen i mitten
const CTRL_VULKAN = [
  [0, 0], [700, 0], [1400, -50], [1900, -250], [2200, -650], [2150, -1150], [1800, -1500], [1250, -1650],
  [650, -1550], [150, -1700], [-450, -1850], [-1050, -1750], [-1500, -1400], [-1650, -900], [-1450, -450],
  [-900, -250], [-450, -80],
];

// ÖKENBANAN: långa raksträckor för hoppen, kanjonen i östra kurvan
const CTRL_OKEN = [
  [0, 0], [900, 0], [1800, 0], [2500, -100], [2900, -450], [2950, -950], [2600, -1300], [1900, -1450],
  [1100, -1500], [300, -1500], [-500, -1450], [-1200, -1250], [-1650, -850], [-1700, -400], [-1300, -100], [-700, 0],
];

// STADSBANAN: kvarter med en sicksack genom stadens mitt
const CTRL_STAD = [
  [0, 0], [600, 0], [1100, 0], [1400, 150], [1450, 500], [1400, 850], [1100, 1000], [700, 1000], [450, 850],
  [300, 600], [50, 500], [-300, 600], [-450, 850], [-700, 1000], [-1100, 1000], [-1400, 850], [-1450, 500],
  [-1400, 150], [-1100, 0], [-600, 0],
];

// ISBANAN: en doserad oval — långa raksträckor, två snabba lutande kurvor
const CTRL_IS = [
  [0, 0], [700, 0], [1300, 0], [1700, 150], [1850, 450], [1700, 750], [1300, 900], [700, 900], [0, 900],
  [-600, 900], [-1000, 750], [-1150, 450], [-1000, 150], [-600, 0],
];

// DJUNGELBANAN: slingrar genom regnskogen
const CTRL_DJUNGEL = [
  [0, 0], [600, 0], [1100, -100], [1400, -400], [1450, -850], [1200, -1250], [750, -1400], [300, -1250],
  [0, -950], [-300, -700], [-750, -750], [-1150, -1000], [-1550, -950], [-1800, -600], [-1700, -200], [-1300, 50], [-700, 80],
];
// MÅNBANAN: stor slinga med långa raksträckor — med halv tyngdkraft blir hoppen jättelånga
const CTRL_MANE = [
  [0, 0], [800, 0], [1600, 0], [2160, -160], [2400, -560], [2240, -1040], [1680, -1280], [880, -1360],
  [0, -1360], [-800, -1320], [-1440, -1120], [-1760, -720], [-1680, -280], [-1200, -40], [-640, 0],
];
// STRANDBANAN: en böna längs stranden — lång raka, midjan in mot lagunen
const CTRL_STRAND = [
  [0, 0], [700, 0], [1400, 0], [1950, -130], [2250, -480], [2150, -900], [1750, -1150], [1250, -1150], [850, -950],
  [450, -950], [50, -1200], [-450, -1350], [-950, -1250], [-1300, -950], [-1400, -500], [-1150, -130], [-600, 0],
];
// HÖSTSKOGEN: en trekant genom skogen med en lång hårnål i norr
const CTRL_HOST = [
  [0, 0], [600, 0], [1200, -40], [1650, -260], [1800, -650], [1600, -1000], [1200, -1150], [900, -1450], [850, -1850],
  [550, -2150], [100, -2150], [-200, -1850], [-250, -1400], [-500, -1050], [-900, -900], [-1150, -550], [-1000, -180], [-550, 0],
];
// SPÖKBANAN: en fladdermus — vågig vingkant i söder (S-kurvor)
const CTRL_SPOKE = [
  [0, 0], [600, 0], [1150, 80], [1500, 330], [1660, 700], [1560, 1000], [1270, 1110], [1000, 1170], [750, 1100], [500, 1030],
  [250, 1100], [0, 1170], [-250, 1100], [-500, 1030], [-750, 1100], [-1000, 1170], [-1300, 1100], [-1550, 950], [-1650, 600],
  [-1500, 250], [-1150, 60], [-600, 0],
];
// GODISBANAN: en klubba — pinnen är två raka, godiset en stor ring
const CTRL_GODIS = turtleCtrl([['S', 700], ['A', 540, 50], ['A', 650, -280], ['A', 540, 50], ['S', 1400], ['A', 225, -180], ['S', 700]]);
// NEONBANAN: kantig som ett gammalt dataspel — raka, skarpa 90°-kurvor och ett trappsteg
const CTRL_NEON = turtleCtrl([['S', 600], ['A', 260, 90], ['S', 700], ['A', 260, 90], ['S', 300], ['A', 260, -90], ['S', 300], ['A', 260, 90],
  ['S', 900], ['A', 260, 90], ['S', 1520], ['A', 260, 90], ['S', 1120]]);

export const TRACKS = [
  {
    id: 'snoberget', namn: 'SNÖBERGET', besk: 'Klassikern — 10,8 km med långa backar och krön', laps: 1,
    ctrl: CTRL_SNO, hills: [16, 7, 3],
    crests: [{ s: 0.085, h: 7, w: 55 }, { s: 0.50, h: 6, w: 50 }, { s: 0.60, h: 8, w: 60 }, { s: 0.91, h: 6.5, w: 55 }],
    features: [],
  },
  {
    id: 'hoppbacken', namn: 'HOPPBACKEN', besk: 'Hopp, tunnlar och broar — 3 varv, banan korsar sig själv', laps: 3,
    ctrl: eightCtrl(), hills: [8, 4, 2], crests: [], overpass: true,
    features: [
      { type: 'jump', at: 0.194 },
      { type: 'tunnel', at: 0.41, len: 360, namn: 'TROLLBERGET' },
      { type: 'valley', at: 0.50, len: 180, depth: 26, namn: 'ISÄLVSBRON' },
      { type: 'tunnel', at: 0.59, len: 220, namn: 'GROTTAN' },
      { type: 'jump', at: 0.694 },
    ],
  },
  {
    id: 'vulkan', namn: 'VULKANBANAN', besk: 'Lava längs kanterna, lavafloder under broarna, eldklot — 2 varv', laps: 2, theme: 'vulkan',
    ctrl: CTRL_VULKAN, hills: [12, 6, 3], crests: [{ s: 0.36, h: 6, w: 50 }],
    features: [
      { type: 'jump', at: 0.1 },
      { type: 'lava', at: 0.2, len: 420 },
      { type: 'valley', at: 0.3, len: 180, depth: 30, namn: 'LAVAFLODEN' },
      { type: 'lava', at: 0.43, len: 480 },
      { type: 'tunnel', at: 0.56, len: 380, namn: 'KRATERN' },
      { type: 'valley', at: 0.72, len: 160, depth: 28, namn: 'MAGMABRON' },
      { type: 'lava', at: 0.87, len: 380 },
    ],
  },
  {
    id: 'oken', namn: 'ÖKENBANAN', besk: 'Sanddyner, en kanjon och tre jättehopp över raviner — 2 varv', laps: 2, theme: 'oken',
    ctrl: CTRL_OKEN, hills: [10, 5, 2], crests: [{ s: 0.75, h: 7, w: 60 }],
    features: [
      { type: 'jump', at: 0.1 },
      { type: 'canyon', at: 0.31, len: 700, h: 46, namn: 'DJÄVULSKANJONEN' },
      { type: 'valley', at: 0.45, len: 170, depth: 24, namn: 'TORRA FLODEN' },
      { type: 'jump', at: 0.53 },
      { type: 'jump', at: 0.62 },
    ],
  },
  {
    id: 'stad', namn: 'STADSBANAN', besk: 'Natt i stan: höghus, neon, gatlyktor, en tunnel och hopp — 3 varv', laps: 3, theme: 'stad',
    ctrl: CTRL_STAD, hills: [4, 2, 1], crests: [],
    features: [
      { type: 'jump', at: 0.11 },
      { type: 'tunnel', at: 0.24, len: 320, namn: 'UNDER STAN' },
      { type: 'jump', at: 0.64 },
    ],
  },
  {
    id: 'is', namn: 'ISBANAN', besk: 'Hal is och doserade kurvor under norrskenet — 3 varv', laps: 3, theme: 'is',
    grip: 0.72, bank: { k: 150, max: 0.32 },
    ctrl: CTRL_IS, hills: [2, 1, 0.5], crests: [], features: [],
  },
  {
    id: 'djungel', namn: 'DJUNGELBANAN', besk: 'Regnskog, floder under broarna och tunneln genom templet — 2 varv', laps: 2, theme: 'djungel',
    ctrl: CTRL_DJUNGEL, hills: [14, 6, 3], crests: [{ s: 0.3, h: 6, w: 45 }, { s: 0.92, h: 5, w: 45 }],
    features: [
      { type: 'jump', at: 0.088 },
      { type: 'valley', at: 0.18, len: 170, depth: 26, namn: 'FLODEN' },
      { type: 'tunnel', at: 0.42, len: 300, namn: 'TEMPLET' },
      { type: 'valley', at: 0.74, len: 160, depth: 30, namn: 'VATTENFALLET' },
    ],
  },
  {
    id: 'mane', namn: 'MÅNBANAN', besk: 'Halv tyngdkraft, kratrar och jättehopp — jorden lyser på himlen — 2 varv', laps: 2, theme: 'mane',
    grav: 0.45, grip: 1.6,
    ctrl: CTRL_MANE, hills: [10, 6, 3], crests: [{ s: 0.25, h: 6, w: 50 }, { s: 0.48, h: 7, w: 55 }, { s: 0.82, h: 6, w: 50 }],
    features: [
      { type: 'jump', at: 0.1 },
      { type: 'jump', at: 0.36 },
      { type: 'valley', at: 0.55, len: 180, depth: 34, namn: 'STORA KRATERN' },
      { type: 'jump', at: 0.68 },
    ],
  },
  {
    id: 'strand', namn: 'STRANDBANAN', besk: 'Sol, palmer och parasoll — hopp och en bro över lagunen — 2 varv', laps: 2, theme: 'strand',
    ctrl: CTRL_STRAND, hills: [6, 3, 1.5], crests: [{ s: 0.3, h: 5, w: 50 }, { s: 0.66, h: 6, w: 55 }],
    features: [
      { type: 'jump', at: 0.11 },
      { type: 'jump', at: 0.6 },
      { type: 'valley', at: 0.82, len: 180, depth: 24, namn: 'LAGUNEN' },
    ],
  },
  {
    id: 'host', namn: 'HÖSTSKOGEN', besk: 'Röda och gula lövträd, en tunnel genom backen och en bro över bäcken — 2 varv', laps: 2, theme: 'host',
    ctrl: CTRL_HOST, hills: [12, 6, 3], crests: [{ s: 0.2, h: 6, w: 50 }, { s: 0.88, h: 6, w: 50 }],
    features: [
      { type: 'jump', at: 0.1 },
      { type: 'tunnel', at: 0.32, len: 300, namn: 'RÄVGRYTET' },
      { type: 'valley', at: 0.64, len: 170, depth: 26, namn: 'BÄCKEN' },
    ],
  },
  {
    id: 'spoke', namn: 'SPÖKBANAN', besk: 'Halloweennatt: pumpor, gravstenar och ett grönt slemträsk under bron — 2 varv', laps: 2, theme: 'spoke',
    ctrl: CTRL_SPOKE, hills: [10, 5, 2], crests: [{ s: 0.25, h: 6, w: 50 }],
    features: [
      { type: 'jump', at: 0.1 },
      { type: 'tunnel', at: 0.3, len: 280, namn: 'KRYPTAN' },
      { type: 'valley', at: 0.6, len: 180, depth: 28, namn: 'SLEMTRÄSKET' },
    ],
  },
  {
    id: 'godis', namn: 'GODISBANAN', besk: 'Klubbor, polkagrisar och muffins — chokladflod, gelétunnel och hopp — 2 varv', laps: 2, theme: 'godis',
    ctrl: CTRL_GODIS, hills: [8, 4, 2], crests: [{ s: 0.2, h: 6, w: 50 }, { s: 0.5, h: 5, w: 45 }],
    features: [
      { type: 'valley', at: 0.36, len: 180, depth: 26, namn: 'CHOKLADFLODEN' },
      { type: 'tunnel', at: 0.5, len: 280, namn: 'GELÉBERGET' },
      { type: 'jump', at: 0.68 },
    ],
  },
  {
    id: 'neon', namn: 'NEONBANAN', besk: '80-talsnatt: neonrutnät, solnedgång, tunnel och hopp — 3 varv', laps: 3, theme: 'neon',
    ctrl: CTRL_NEON, hills: [4, 2, 1], crests: [],
    features: [
      { type: 'jump', at: 0.9 },
      { type: 'tunnel', at: 0.17, len: 300, namn: 'DATORN' },
      { type: 'jump', at: 0.7 },
    ],
  },
];
export const trackDef = (id) => TRACKS.find(t => t.id === id) || TRACKS[0];

// Flaggor per sample
export const F_GAP = 1, F_BRIDGE = 2, F_TUNNEL = 4, F_RAMP = 8, F_LAND = 16, F_LAVA = 32, F_CANYON = 64;

const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// Hoppets höjdprofil (d = s − kanten). Landningen följer kastparabeln för en bil i 270 km/h,
// så snabbare bilar landar längre ner i backen — mjukt, som i en hoppbacke.
export const JUMP = { KICK: 60, LIP: 0.075, GAP: 16, V0: 75, LAND_SLOPE: -0.2, EASE: 70, REC: 340 };
function jumpProfile(d) {
  const { KICK, LIP, GAP, V0, LAND_SLOPE, EASE, REC } = JUMP, g = CONF.GRAV;
  const h0 = LIP * KICK / 2;                                   // kantens höjd
  const land = (x) => h0 + LIP * x - 0.5 * g * (x / V0) ** 2 - 0.5;
  const d1 = (LIP - LAND_SLOPE) * V0 * V0 / g;                  // där backen når max lutning
  const y1 = land(d1), d2 = d1 + EASE, y2 = y1 + LAND_SLOPE * EASE / 2;
  if (d < -KICK) return 0;
  if (d <= 0) return h0 * ((d + KICK) / KICK) ** 2;
  if (d < GAP) return h0 + (land(GAP) - h0) * (d / GAP);        // luft (ingen väg)
  if (d <= d1) return land(d);
  if (d <= d2) { const u = d - d1; return y1 + LAND_SLOPE * (u - u * u / (2 * EASE)); }
  if (d <= d2 + REC) return y2 * (1 + Math.cos(Math.PI * (d - d2) / REC)) / 2;
  return 0;
}
export const JUMP_LEN = (() => { const { LIP, V0, LAND_SLOPE, EASE, REC } = JUMP; return (LIP - LAND_SLOPE) * V0 * V0 / CONF.GRAV + EASE + REC; })();

export function buildTrack(def = TRACKS[0]) {
  const curve = new THREE.CatmullRomCurve3(def.ctrl.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
  curve.arcLengthDivisions = 14000;
  const L = curve.getLength();
  const N = Math.round(L / CONF.DS);
  const ds = L / N;
  const sp = curve.getSpacedPoints(N);

  const wrapS = (s) => ((s % L) + L) % L;
  const sdist = (a, b) => { let d = wrapS(a - b); if (d > L / 2) d -= L; return d; };
  const idx = (s) => Math.round(wrapS(s) / ds) % N;

  const A = () => new Float32Array(N);
  const px = A(), py = A(), pz = A(), hx = A(), hz = A();
  const fx = A(), fy = A(), fz = A(), rx = A(), ry = A(), rz = A(), ux = A(), uy = A(), uz = A();
  const kk = A(), bank = A(), slope = A();
  const flags = new Uint8Array(N);
  for (let i = 0; i < N; i++) { px[i] = sp[i].x; pz[i] = sp[i].z; }
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

  // ---------- Höjd ----------
  const [h1, h2, h3] = def.hills;
  const rawH = (s) => {
    const a = 2 * Math.PI * s / L;
    let h = h1 * Math.sin(3 * a + 0.5) + h2 * Math.sin(7 * a + 1.3) + h3 * Math.sin(13 * a + 2.1);
    for (const c of def.crests) { const d = sdist(s, c.s * L); h += c.h * Math.exp(-(d * d) / (2 * c.w * c.w)); }
    return h;
  };
  const H0 = rawH(0);
  // platt kring start/mål så griden ligger plant
  for (let i = 0; i < N; i++) py[i] = smoothstep(160, 520, Math.abs(sdist(i * ds, 0))) * (rawH(i * ds) - H0);

  // ---------- Var korsar banan sig själv? ----------
  let cross = null;
  if (def.overpass) {
    let best = Infinity;
    for (let i = 0; i < N; i += 2) {
      for (let j = i + 2; j < N; j += 2) {
        if (Math.abs(sdist(i * ds, j * ds)) < 400) continue;
        const d = (px[i] - px[j]) ** 2 + (pz[i] - pz[j]) ** 2;
        if (d < best) { best = d; cross = { a: i * ds, b: j * ds }; }
      }
    }
    if (cross && best > 30 * 30) cross = null;
  }

  // ---------- Placera delarna där det finns plats ----------
  const features = [];
  const reserved = [{ a: -480, b: 480 }];                       // starten
  if (cross) for (const c of [cross.a, cross.b]) reserved.push({ a: c - 150, b: c + 150 });
  const free = (a, b) => reserved.every(r => {
    // överlappar [a,b] någon reserverad bit? (med varvning)
    for (const off of [-L, 0, L]) if (a < r.b + off && b > r.a + off) return false;
    return true;
  });
  const maxK = (a, b) => { let m = 0; for (let s = a; s <= b; s += ds * 2) m = Math.max(m, Math.abs(ks[idx(s)])); return m; };
  // andra delar av banan (längre bort än `skip` längs banan) får inte ligga närmare än `r` m
  const roomAround = (s0, s1, r, skip) => {
    for (let s = s0; s <= s1; s += 20) {
      const i = idx(s);
      for (let j = 0; j < N; j += 3) {
        const sj = j * ds;
        if (sdist(sj, s0) > -skip && sdist(sj, s1) < skip) continue;
        if ((px[i] - px[j]) ** 2 + (pz[i] - pz[j]) ** 2 < r * r) return false;
      }
    }
    return true;
  };
  // dalen under en bro får inte skära genom någon annan del av banan
  const VALLEY_LEN = 500;
  const valleyClear = (c, len) => {
    const i = idx(c), tx = hx[i], tz = hz[i];
    for (let j = 0; j < N; j += 2) {
      if (Math.abs(sdist(j * ds, c)) < len / 2 + 160) continue;
      const dx = px[j] - px[i], dz = pz[j] - pz[i];
      const across = dx * tx + dz * tz, along = -dx * tz + dz * tx;
      if (Math.abs(across) < len / 2 + 70 && Math.abs(along) < VALLEY_LEN + 40) return false;
    }
    return true;
  };
  for (const f of def.features) {
    const want = f.at * L;
    let placed = null;
    for (let k = 0; k < 120 && !placed; k++) {
      const s = want + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 40;
      if (f.type === 'jump') {
        const a = s - JUMP.KICK - 140, b = s + 185;   // återhämtningen får gå in i annat
        if (free(a, b) && maxK(s - 110, s + 150) < 1 / 1100) placed = { type: 'jump', lip: wrapS(s), a, b };
      } else if (f.type === 'tunnel') {
        const s0 = s - f.len / 2, s1 = s + f.len / 2;
        if (free(s0 - 110, s1 + 110) && maxK(s0 - 60, s1 + 60) < 1 / 350 && roomAround(s0, s1, 200, 200)) placed = { ...f, s0: wrapS(s0), s1: wrapS(s1), a: s0 - 110, b: s1 + 110 };
      } else if (f.type === 'valley') {
        const s0 = s - f.len / 2, s1 = s + f.len / 2;
        if (free(s0 - 140, s1 + 140) && maxK(s0 - 80, s1 + 80) < 1 / 350 && valleyClear(s, f.len)) placed = { ...f, c: wrapS(s), s0: wrapS(s0), s1: wrapS(s1), a: s0 - 140, b: s1 + 140 };
      } else if (f.type === 'lava') {
        const s0 = s - f.len / 2, s1 = s + f.len / 2;
        if (free(s0 - 40, s1 + 40)) placed = { ...f, s0: wrapS(s0), s1: wrapS(s1), a: s0 - 40, b: s1 + 40 };
      } else if (f.type === 'canyon') {
        const s0 = s - f.len / 2, s1 = s + f.len / 2;
        // klippväggarna lyfter bara marken närmast kanjonens egen väg, så det räcker med lite luft till resten
        if (free(s0 - 80, s1 + 80) && maxK(s0, s1) < 1 / 260 && roomAround(s0, s1, 150, 200)) placed = { ...f, s0: wrapS(s0), s1: wrapS(s1), a: s0 - 80, b: s1 + 80 };
      }
    }
    if (!placed) { console.warn('kunde inte placera', f.type); continue; }
    reserved.push({ a: placed.a, b: placed.b });
    features.push(placed);
  }

  // hoppens höjd + glipan. Grundbacken planas först ut kring hoppet — annars kan landningen
  // hamna i en uppförsbacke och alla landar direkt efter glipan
  for (const f of features) {
    if (f.type !== 'jump') continue;
    const baseLip = py[idx(f.lip)];
    for (let i = 0; i < N; i++) {
      const d = sdist(i * ds, f.lip);
      if (d < -280 || d > JUMP_LEN + 160) continue;
      const w = smoothstep(-280, -110, d) * (1 - smoothstep(JUMP_LEN - 120, JUMP_LEN + 160, d));
      py[i] = py[i] * (1 - w) + baseLip * w;
    }
    for (let i = 0; i < N; i++) {
      const d = sdist(i * ds, f.lip);
      if (d < -JUMP.KICK - 2 || d > JUMP_LEN + 2) continue;
      py[i] += jumpProfile(d);
      if (d > 0 && d < JUMP.GAP) flags[i] |= F_GAP;
      if ((d > -24 && d <= 0) || (d >= JUMP.GAP && d < JUMP.GAP + 24)) flags[i] |= F_RAMP;
      if (d > -40 && d < 300) flags[i] |= F_LAND;   // fångstängsel: ingen flyger ut över kanten
    }
    f.unsafeA = f.lip - JUMP.KICK - 10; f.unsafeB = f.lip + JUMP.GAP + 4;
  }
  for (const f of features) {
    const s0 = f.s0, s1 = f.s1;
    if (f.type === 'tunnel' || f.type === 'valley' || f.type === 'lava' || f.type === 'canyon') {
      const bit = { tunnel: F_TUNNEL, valley: F_BRIDGE, lava: F_LAVA, canyon: F_CANYON }[f.type];
      for (let i = 0; i < N; i++) {
        const s = i * ds;
        if (sdist(s, s0) >= 0 && sdist(s, s1) <= 0) flags[i] |= bit;
      }
    }
  }
  // bron där banan korsar sig själv: den högre biten går över, den lägre sänks
  if (cross) {
    let up = cross.a, lo = cross.b;
    if (py[idx(lo)] > py[idx(up)]) [up, lo] = [lo, up];
    const need = Math.max(0, 11 - (py[idx(up)] - py[idx(lo)]));
    for (let i = 0; i < N; i++) {
      const s = i * ds, du = sdist(s, up), dl = sdist(s, lo);
      py[i] += need * 0.6 * Math.exp(-(du * du) / (2 * 120 * 120)) - need * 0.4 * Math.exp(-(dl * dl) / (2 * 100 * 100));
      if (Math.abs(du) < 70) flags[i] |= F_BRIDGE;
    }
    const iu = idx(up);
    features.push({ type: 'overpass', s0: wrapS(up - 70), s1: wrapS(up + 70), up, lo, x: px[iu], z: pz[iu] });
  }
  for (const f of features) if (f.type === 'valley') {
    const i = idx(f.c);
    Object.assign(f, { x: px[i], z: pz[i], tx: hx[i], tz: hz[i], floorY: py[i] - f.depth, lv: VALLEY_LEN });
  }

  // ---------- Ramar (riktning, höger, upp) med dosering ----------
  for (let i = 0; i < N; i++) {
    const a = (i - 1 + N) % N, b = (i + 1) % N;
    let tx = px[b] - px[a], ty = py[b] - py[a], tz = pz[b] - pz[a];
    const tl = Math.hypot(tx, ty, tz); tx /= tl; ty /= tl; tz /= tl;
    // R0 = F × Y,  U0 = R0 × F
    let r0x = -tz, r0z = tx; const rl = Math.hypot(r0x, r0z); r0x /= rl; r0z /= rl;
    const u0x = -r0z * ty, u0y = r0z * tx - r0x * tz, u0z = r0x * ty;
    const bk = (flags[i] & (F_GAP | F_RAMP)) ? 0 : clamp(-(def.bank?.k ?? CONF.BANK_K) * ks[i], -(def.bank?.max ?? CONF.BANK_MAX), def.bank?.max ?? CONF.BANK_MAX);
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
    out.f = flags[i];
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

  // Säker plats att återuppstå på: aldrig på hoppets ramp eller i glipan — då en bit före med ansats
  function safeS(s) {
    for (const f of features) {
      if (f.type !== 'jump') continue;
      if (sdist(s, f.unsafeA) >= 0 && sdist(s, f.unsafeB) <= 0) return wrapS(f.lip - 170);
    }
    return wrapS(s);
  }

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < N; i++) {
    minX = Math.min(minX, px[i]); maxX = Math.max(maxX, px[i]);
    minZ = Math.min(minZ, pz[i]); maxZ = Math.max(maxZ, pz[i]);
  }

  return {
    id: def.id, namn: def.namn, def,
    N, ds, L, px, py, pz, hx, hz, fx, fy, fz, rx, ry, rz, ux, uy, uz, k: kk, bank, slope, flags, features,
    bounds: { minX, maxX, minZ, maxZ },
    wrapS, sdist, idx, nearest, project, sampleAt, pointAt, quatAt, safeS,
    halfW: CONF.ROAD_W / 2 + CONF.SHOULDER,
  };
}
