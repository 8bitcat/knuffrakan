// Tillbehörens utseende på bilarna. Mått och lägen ur MOUNT/frontParts i gear.js —
// samma som fysiken, så det man ser är det som knuffas.
import * as THREE from 'three';
import { cleanGear, frontParts, MOUNT } from './gear.js?v=32';
import { VTYPES } from './vtypes.js?v=32';

const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const tex = (c, rx = 1, ry = 1) => {
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); return t;
};

// delade material (skapas en gång)
let M = null;
function mats() {
  if (M) return M;
  // gul/svart varningsrand
  const hz = cv(256, 64), h = hz.getContext('2d');
  h.fillStyle = '#ffc21a'; h.fillRect(0, 0, 256, 64);
  h.fillStyle = '#17171b';
  for (let x = -64; x < 320; x += 64) { h.beginPath(); h.moveTo(x, 64); h.lineTo(x + 32, 64); h.lineTo(x + 64, 0); h.lineTo(x + 32, 0); h.fill(); }
  // nitad stålplåt
  const pl = cv(256, 128), p = pl.getContext('2d');
  p.fillStyle = '#4a4e57'; p.fillRect(0, 0, 256, 128);
  for (let k = 0; k < 220; k++) { p.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${0.03 + Math.random() * 0.05})`; p.fillRect(Math.random() * 256, Math.random() * 128, 30 + Math.random() * 60, 1); }
  p.strokeStyle = 'rgba(0,0,0,0.5)'; p.lineWidth = 3; p.strokeRect(2, 2, 252, 124);
  for (const y of [10, 118]) for (let x = 12; x < 256; x += 24) {
    p.fillStyle = '#2b2e35'; p.beginPath(); p.arc(x, y, 4.5, 0, Math.PI * 2); p.fill();
    p.fillStyle = '#8a8f9a'; p.beginPath(); p.arc(x - 1, y - 1, 2, 0, Math.PI * 2); p.fill();
  }
  M = {
    yellow: new THREE.MeshStandardMaterial({ color: 0xffb81c, roughness: 0.45, metalness: 0.25 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.95 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x40444c, roughness: 0.45, metalness: 0.75 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1d1f24, roughness: 0.55, metalness: 0.6, side: THREE.DoubleSide }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xdfe3ea, roughness: 0.18, metalness: 1 }),
    carbon: new THREE.MeshStandardMaterial({ color: 0x15161c, roughness: 0.3, metalness: 0.4 }),
    hazardTex: tex(hz),
    plateTex: tex(pl),
  };
  M.hazard = new THREE.MeshStandardMaterial({ map: M.hazardTex, roughness: 0.5, metalness: 0.2 });
  M.plate = new THREE.MeshStandardMaterial({ map: M.plateTex, roughness: 0.5, metalness: 0.6 });
  M.cage = new THREE.MeshStandardMaterial({ color: 0xe8242f, roughness: 0.35, metalness: 0.4 });
  return M;
}

// Lägg tillbehören på en bilvy (CarView/BusView/BigfootView). spec.kind + spec.gear.
export function addGear(view, spec) {
  const kind = MOUNT[spec?.kind] ? spec.kind : 'stock';
  const gear = cleanGear(spec?.gear, kind);
  if (!gear.length) return;
  const VT = VTYPES[kind], P = MOUNT[kind], m = mats();
  const grp = new THREE.Group();
  grp.position.y = VT.modelY;        // y = 0 är marken
  view.group.add(grp);
  const geos = [], extra = [];
  const mesh = (geo, mat, x, y, z) => { geos.push(geo); const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = true; grp.add(o); return o; };
  const box = (w, h, d, mat, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
  // rör mellan två punkter
  const tube = (r, a, b, mat) => {
    const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length();
    const o = mesh(new THREE.CylinderGeometry(r, r, len, 10), mat, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    return o;
  };
  const parts = frontParts({ ...VT, modelY: 0, gear });
  const big = { bus: 1.35, traktor: 1.3, glass: 1.15, brandbil: 1.3, stridsvagn: 1.35, gokart: 0.7, v2: 1.2, ambulans: 1.15, valt: 1.35 }[kind] || 1;

  // --- fram ---
  if (gear.includes('plog')) {
    for (const p of parts.filter(q => q.id === 'plog')) {
      const blade = box(p.hx * 2, p.hy * 2, p.hz * 2, m.yellow, p.x, p.y, p.z); blade.rotation.y = p.ry;
      const edge = box(p.hx * 2, 0.12, p.hz * 2 + 0.03, m.rubber, p.x, p.y - p.hy + 0.06, p.z); edge.rotation.y = p.ry;
      const top = box(p.hx * 2, 0.1, p.hz * 2 + 0.04, m.hazard, p.x, p.y + p.hy - 0.05, p.z); top.rotation.y = p.ry;
    }
    // stag in till bilen
    const y = (P.plow[0] + P.plow[1]) / 2;
    for (const s of [-1, 1]) tube(0.06 * big, [s * P.w * 0.5, y, -(P.fz + P.plowL * 0.45)], [s * P.w * 0.55, Math.max(y, P.bump - 0.1), -(P.fz - 0.2)], m.steel);
  }
  if (gear.includes('kil')) {
    const p = parts.find(q => q.id === 'kil');
    const [ht, hb] = P.wedge, zt = -(P.fz + P.wedgeL), zb = -(P.fz - 0.1), W = p.hx;
    // massiv kil (triangelprisma)
    const A0 = [-W, ht, zt], B0 = [-W, hb, zb], C0 = [-W, ht - 0.04, zb], A1 = [W, ht, zt], B1 = [W, hb, zb], C1 = [W, ht - 0.04, zb];
    const tri = [A0, A1, B1, A0, B1, B0, C0, B0, B1, C0, B1, C1, A0, C0, C1, A0, C1, A1, A0, B0, C0, A1, C1, B1].flat();
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(tri, 3)); g.computeVertexNormals();
    mesh(g, m.dark, 0, 0, 0);
    // varningsrandig ovansida
    const len = Math.hypot(zb - zt, hb - ht), th = Math.atan2(hb - ht, zb - zt);
    const top = mesh(new THREE.PlaneGeometry(W * 2, len), m.hazard, 0, (ht + hb) / 2 + Math.cos(th) * 0.012, (zt + zb) / 2 - Math.sin(th) * 0.012);
    top.rotation.x = -Math.PI / 2 - th;
    // tjockt stålskär längst fram
    box(W * 2, 0.06, 0.12, m.chrome, 0, ht + 0.03, zt + 0.06);
  }
  if (gear.includes('ram')) {
    const p = parts.find(q => q.id === 'ram');
    box(p.hx * 2, p.hy * 2, p.hz * 2, m.steel, 0, p.y, p.z);
    const tip = mesh(new THREE.ConeGeometry(p.hx * 1.45, 0.55, 4).rotateX(-Math.PI / 2).rotateZ(Math.PI / 4), m.chrome, 0, p.y, p.z - p.hz - 0.27);
    tip.castShadow = true;
    box(P.w * 1.7, 0.16 * big, 0.16 * big, m.steel, 0, p.y, -(P.fz + 0.06));
    for (const s of [-1, 1]) tube(0.05 * big, [s * P.w * 0.7, p.y, -(P.fz + 0.05)], [0, p.y, p.z - p.hz * 0.4], m.steel);
  }
  if (gear.includes('bullbar')) {
    const y0 = Math.max(0.18, P.bump - 0.2 * big), y1 = P.bump + 0.5 * big, z = -(P.fz + 0.18 * big), r = 0.055 * big;
    for (const sx of [-0.45, 0.45]) tube(r, [sx * P.w, y0, z], [sx * P.w, y1, z], m.chrome);
    tube(r, [-P.w * 0.45, y1, z], [P.w * 0.45, y1, z], m.chrome);
    tube(r, [-P.w * 0.85, P.bump, z + 0.05], [P.w * 0.85, P.bump, z + 0.05], m.chrome);
    for (const s of [-1, 1]) tube(r, [s * P.w * 0.45, y1, z], [s * P.w * 0.85, P.bump, z + 0.08], m.chrome);
  }

  // --- sidor ---
  if (gear.includes('sidopansar')) {
    const hgt = { bus: 0.75, traktor: 0.6, glass: 0.7, formel: 0.3, rullstol: 0.22, elrullstol: 0.26, gokart: 0.2, brandbil: 0.75, stridsvagn: 0.6, ufo: 0.3 }[kind] || 0.42;
    for (const s of [-1, 1]) {
      const pl = box(0.07, hgt, P.sideL, m.plate, s * (P.w + 0.05), P.sideY, 0.1);
      pl.material = m.plate;
      box(0.09, 0.07, P.sideL + 0.04, m.steel, s * (P.w + 0.06), P.sideY + hgt / 2, 0.1);
    }
  }
  if (gear.includes('spikar')) {
    const small = kind === 'stock' || kind === 'formel' || kind === 'rullstol' || kind === 'elrullstol' || kind === 'gokart';
    const cone = new THREE.ConeGeometry(small ? 0.07 : 0.1, small ? 0.42 : 0.55, 10);
    const hub = new THREE.CylinderGeometry(small ? 0.16 : 0.24, small ? 0.16 : 0.24, 0.06, 14);
    geos.push(cone, hub);
    // halva däckbredden per fordon (fram, bak)
    const tireHalf = { bigfoot: [0.47, 0.47], bus: [0.19, 0.39], formel: [0.16, 0.2], traktor: [0.16, 0.27], glass: [0.15, 0.15], rullstol: [0.04, 0.05], elrullstol: [0.05, 0.05], gokart: [0.09, 0.12], brandbil: [0.18, 0.18], stridsvagn: [0.32, 0.32] }[kind] || [0.16, 0.16];
    view.wheels?.forEach((w) => {
      const s = Math.sign(w.base.x) || 1;
      const off = tireHalf[w.base.front ? 0 : 1];
      const c = new THREE.Mesh(cone, m.chrome); c.rotation.z = -s * Math.PI / 2; c.position.set(s * (off + (small ? 0.22 : 0.28)), w.hubY || 0, 0);
      const hb = new THREE.Mesh(hub, m.steel); hb.rotation.z = Math.PI / 2; hb.position.set(s * (off + 0.03), w.hubY || 0, 0);
      w.holder.add(c, hb); extra.push([w.holder, c], [w.holder, hb]);
    });
  }

  // --- bak ---
  if (gear.includes('pushbar')) {
    const z = P.rear + 0.2 * big, y = P.bump, r = 0.06 * big;
    tube(r, [-P.w * 0.85, y, z], [P.w * 0.85, y, z], m.steel);
    tube(r, [-P.w * 0.6, y + 0.35 * big, z - 0.04], [P.w * 0.6, y + 0.35 * big, z - 0.04], m.steel);
    for (const s of [-1, 1]) {
      tube(r, [s * P.w * 0.6, y - 0.12, z], [s * P.w * 0.6, y + 0.35 * big, z - 0.04], m.steel);
      tube(r * 0.8, [s * P.w * 0.85, y, z], [s * P.w * 0.85, y, z - 0.35], m.steel);
    }
  }
  if (gear.includes('vinge')) {
    const W = P.w * 2.2, y = P.deck + (kind === 'bus' ? 0.45 : 0.5), z = P.rear - (kind === 'bus' ? 0.6 : 0.4);
    const wing = box(W, 0.07, 0.55 * big, m.carbon, 0, y, z); wing.rotation.x = 0.16;
    for (const s of [-1, 1]) {
      box(0.05, 0.32, 0.65 * big, m.carbon, s * W / 2, y + 0.05, z);
      box(0.06, y - P.deck + 0.05, 0.14, m.steel, s * W * 0.25, (y + P.deck) / 2, z + 0.05);
    }
  }

  // --- kaross ---
  if (gear.includes('pansar')) {
    const cabL = P.cab[1] - P.cab[0];
    box(P.w * (P.roofCage ? 1.9 : 1.45), 0.06, cabL * (P.roofCage ? 0.95 : 0.85), m.plate, 0, P.roof + 0.04, (P.cab[0] + P.cab[1]) / 2);
    if (kind === 'bus') {
      for (const s of [-1, 1]) for (const y of [2.12, 2.5]) box(0.05, 0.06, 7.6, m.steel, s * (P.w + 0.04), y, 0);
    } else {
      // huven + gallret framför vindrutan
      if (!P.noHood) { const hood = box(P.w * 1.3, 0.05, 1.05, m.plate, 0, P.belt + 0.02, P.cab[0] - 0.75); hood.rotation.x = -0.08; }
      const [y0, z0, y1, z1] = P.wind || [P.belt + 0.05, P.cab[0] - 0.1, P.roof - 0.05, P.cab[0] + 0.25];
      for (let k = -2; k <= 2; k++) tube(0.025 * big, [k * 0.28 * big, y0, z0 - 0.04], [k * 0.28 * big, y1, z1 - 0.04], m.steel);
    }
  }
  if (gear.includes('bur')) {
    const r = 0.05 * big;
    if (P.roofCage) {
      // takbur (buss, glassbil): räcken runt taket
      const y = P.roof + 0.3, [za, zb] = P.cab, step = (zb - za) / 4;
      for (const s of [-1, 1]) {
        tube(r, [s * P.w * 0.85, y, za], [s * P.w * 0.85, y, zb], m.cage);
        for (let z = za; z <= zb + 0.01; z += step) tube(r, [s * P.w * 0.85, P.roof, z], [s * P.w * 0.85, y, z], m.cage);
      }
      for (const z of [za, (za + zb) / 2, zb]) tube(r, [-P.w * 0.85, y, z], [P.w * 0.85, y, z], m.cage);
    } else {
      const x = P.w * 0.9, y = P.roof + 0.1, [z0, z1] = P.cab;
      for (const s of [-1, 1]) {
        tube(r, [s * x, P.belt, z0], [s * x * 0.92, y, z0 + 0.25], m.cage);
        tube(r, [s * x, P.belt, z1], [s * x * 0.92, y, z1 - 0.1], m.cage);
        tube(r, [s * x * 0.92, y, z0 + 0.25], [s * x * 0.92, y, z1 - 0.1], m.cage);
      }
      tube(r, [-x * 0.92, y, z0 + 0.25], [x * 0.92, y, z0 + 0.25], m.cage);
      tube(r, [-x * 0.92, y, z1 - 0.1], [x * 0.92, y, z1 - 0.1], m.cage);
      tube(r, [-x * 0.92, y, z0 + 0.25], [x * 0.92, y, z1 - 0.1], m.cage);
    }
  }

  const base = view.dispose.bind(view);
  view.dispose = () => {
    base();
    for (const g of geos) g.dispose();
    for (const [parent, o] of extra) parent.remove(o);
  };
}
