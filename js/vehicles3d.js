// Utseendet för skolbussen och bigfooten (stockcaren finns i carmodel.js).
// Samma gränssnitt som CarView: group, setWheel, dent, uvNear, livery, resetDamage, dispose, rest.
import * as THREE from 'three';
import { CarView, SHAPES } from './carmodel.js?v=9';
import { makeLivery } from './livery.js?v=9';
import { VTYPES, typeOf } from './vtypes.js?v=9';

const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const tex = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return ((n >> 16) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) / 255; };

// repor på en canvas (för bussens sidor)
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

// ---------------- Skolbussen ----------------
export class BusView {
  constructor(spec) {
    const T = this.T = VTYPES.bus;
    this.spec = spec;
    this.group = new THREE.Group();
    this.model = new THREE.Group();
    this.model.position.y = T.modelY;          // modellens y = 0 är marken
    this.group.add(this.model);
    const base = spec.colors?.[0] || '#ffc21a', dark = '#16161a';
    const ink = lum(base) > 0.55 ? '#16161a' : '#ffffff';
    const L = 9.0, W = 2.5, H = 2.45, Y0 = 0.5;
    this.canvases = [];
    // sidorna: fönsterrad, svarta lister, SKOLBUSS, nummer
    const side = (mirror) => {
      const c = cv(1024, 280), g = c.getContext('2d');
      g.fillStyle = base; g.fillRect(0, 0, 1024, 280);
      g.fillStyle = dark;
      for (const y of [150, 205, 252]) g.fillRect(0, y, 1024, 9);
      // fönster: förarens vid fronten, sedan nio passagerarfönster
      const winTop = 22, winH = 88;
      const frontIsRight = !mirror;
      for (let k = 0; k < 9; k++) {
        const x = 70 + k * 92;
        g.fillStyle = '#1b2234'; g.fillRect(frontIsRight ? x : 1024 - x - 80, winTop, 80, winH);
        g.fillStyle = 'rgba(160,200,255,0.25)'; g.fillRect(frontIsRight ? x + 6 : 1024 - x - 74, winTop + 6, 24, winH - 30);
      }
      g.fillStyle = '#1b2234'; g.fillRect(frontIsRight ? 920 : 24, winTop, 80, winH + 90);   // dörren/förarfönstret
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = ink; g.font = 'italic 900 50px "Exo 2", sans-serif';
      g.fillText('SKOLBUSS', 470, 178);
      g.font = '800 22px Montserrat, sans-serif'; g.fillText('KNUFFRAKANS SKOLA', 470, 230);
      g.font = 'italic 900 56px "Exo 2", sans-serif'; g.fillText(String(spec.number ?? ''), frontIsRight ? 120 : 904, 180);
      this.canvases.push(c);
      return c;
    };
    const front = () => {
      const c = cv(256, 256), g = c.getContext('2d');
      g.fillStyle = base; g.fillRect(0, 0, 256, 256);
      g.fillStyle = '#ffb000'; g.fillRect(30, 6, 196, 26);
      g.fillStyle = dark; g.font = '900 20px Montserrat, sans-serif'; g.textAlign = 'center'; g.fillText('SKOLA', 128, 26);
      g.fillStyle = '#1b2234'; g.fillRect(14, 40, 228, 96);
      g.fillStyle = 'rgba(160,200,255,0.22)'; g.fillRect(24, 48, 90, 50);
      g.fillStyle = dark; g.fillRect(14, 168, 228, 60);
      g.fillStyle = '#fff7d0'; g.fillRect(22, 176, 44, 28); g.fillRect(190, 176, 44, 28);
      g.fillStyle = '#2a2b31'; for (let x = 82; x < 176; x += 14) g.fillRect(x, 174, 8, 46);
      return c;
    };
    const back = () => {
      const c = cv(256, 256), g = c.getContext('2d');
      g.fillStyle = base; g.fillRect(0, 0, 256, 256);
      g.fillStyle = dark; g.fillRect(78, 30, 100, 190);
      g.fillStyle = '#1b2234'; g.fillRect(90, 40, 76, 70); g.fillRect(20, 40, 46, 60); g.fillRect(190, 40, 46, 60);
      g.fillStyle = '#ff2433'; g.fillRect(16, 150, 36, 46); g.fillRect(204, 150, 36, 46);
      g.fillStyle = ink; g.font = 'italic 900 40px "Exo 2", sans-serif'; g.textAlign = 'center'; g.fillText(String(spec.number ?? ''), 128, 160);
      g.fillStyle = dark; g.fillRect(0, 228, 256, 28);
      return c;
    };
    const roof = () => {
      const c = cv(256, 1024), g = c.getContext('2d');
      g.fillStyle = base; g.fillRect(0, 0, 256, 1024);
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(90, 320, 76, 90); g.fillRect(90, 640, 76, 90);
      g.save(); g.translate(128, 512); g.rotate(-Math.PI / 2);
      g.fillStyle = ink; g.font = 'italic 900 150px "Exo 2", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(spec.number ?? ''), 0, 0); g.restore();
      return c;
    };
    const sR = side(false), sL = side(true), fr = front(), bk = back(), rf = roof();
    this.texs = [tex(sR), tex(sL), tex(rf), null, tex(bk), tex(fr)];
    const mk = (t, c = 0xffffff) => new THREE.MeshPhysicalMaterial({ map: t, color: c, roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.25 });
    const mats = [mk(this.texs[0]), mk(this.texs[1]), mk(this.texs[2]), new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.9 }), mk(this.texs[4]), mk(this.texs[5])];
    this.mats = mats;
    const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, L), mats);
    body.position.y = Y0 + H / 2;
    body.castShadow = true;
    this.model.add(body);
    this.body = body;
    const blk = new THREE.MeshStandardMaterial({ color: 0x141418, roughness: 0.7 });
    // stötfångare, speglar, takljus, stoppskylt
    for (const z of [-L / 2 - 0.08, L / 2 + 0.08]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(W + 0.1, 0.32, 0.22), blk);
      b.position.set(0, Y0 + 0.2, z); this.model.add(b);
    }
    for (const sx of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.06), blk);
      arm.position.set(sx * (W / 2 + 0.22), Y0 + 1.6, -L / 2 + 0.35); this.model.add(arm);
      const mir = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.3), blk);
      mir.position.set(sx * (W / 2 + 0.45), Y0 + 1.55, -L / 2 + 0.35); this.model.add(mir);
    }
    const amber = new THREE.MeshBasicMaterial({ color: 0xffa21a, toneMapped: false }), red = new THREE.MeshBasicMaterial({ color: 0xff2a2a, toneMapped: false });
    for (const [z, m] of [[-L / 2 + 0.05, amber], [L / 2 - 0.05, red]]) for (const sx of [-0.75, -0.45, 0.45, 0.75]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.12), Math.abs(sx) > 0.6 ? red : m);
      l.position.set(sx, Y0 + H - 0.12, z); this.model.add(l);
    }
    const stop = cv(128, 128), sg = stop.getContext('2d');
    sg.fillStyle = '#d61f2b'; sg.beginPath();
    for (let k = 0; k < 8; k++) { const a = Math.PI / 8 + k * Math.PI / 4; sg.lineTo(64 + Math.cos(a) * 60, 64 + Math.sin(a) * 60); }
    sg.fill(); sg.strokeStyle = '#fff'; sg.lineWidth = 5; sg.stroke();
    sg.fillStyle = '#fff'; sg.font = '900 30px Montserrat, sans-serif'; sg.textAlign = 'center'; sg.textBaseline = 'middle'; sg.fillText('STOPP', 64, 66);
    const stopTex = tex(stop);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), new THREE.MeshBasicMaterial({ map: stopTex, side: THREE.DoubleSide }));
    sign.position.set(-W / 2 - 0.36, Y0 + 1.2, -L / 2 + 1.6); sign.rotation.y = Math.PI / 2;
    this.model.add(sign);
    this.texs.push(stopTex);
    // hjul (tvillinghjul bak)
    const tg = new THREE.CylinderGeometry(T.wheelR, T.wheelR, 0.34, 20).rotateZ(Math.PI / 2);
    const tm = [new THREE.MeshStandardMaterial({ color: 0x111113, roughness: 0.9 }), new THREE.MeshStandardMaterial({ color: 0x2a2b31, roughness: 0.6 }), new THREE.MeshStandardMaterial({ color: 0x2a2b31, roughness: 0.6 })];
    const hub = new THREE.MeshStandardMaterial({ color: 0xd8d8de, metalness: 0.6, roughness: 0.35 });
    this.wheels = T.wheels.map((w) => {
      const holder = new THREE.Group(), spin = new THREE.Group();
      const twins = w.front ? [0] : [-0.19, 0.19];
      for (const dx of twins) {
        const t = new THREE.Mesh(tg, tm); t.position.x = dx * Math.sign(w.x); t.castShadow = true; spin.add(t);
      }
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.36, 12).rotateZ(Math.PI / 2), hub);
      cap.position.x = Math.sign(w.x) * (w.front ? 0.02 : 0.2); spin.add(cap);
      holder.add(spin);
      holder.position.set(w.x, T.wheelR, w.z);
      this.model.add(holder);
      return { holder, spin, base: w };
    });
    this.livery = {
      tex: this.texs[0],
      scratch: (u, v, amount) => { const c = Math.random() < 0.5 ? sR : sL; scratchCanvas(c, amount); this.texs[c === sR ? 0 : 1].needsUpdate = true; },
      restore: () => {},
      dispose: () => {},
    };
  }
  setWheel(k, susLen, spin, steer) {
    const w = this.wheels[k];
    w.holder.position.y = -susLen - this.T.modelY;
    w.spin.rotation.x = -spin;
    w.holder.rotation.y = w.base.front ? -steer : 0;
  }
  rest() { this.wheels.forEach((w, k) => this.setWheel(k, this.T.rayLen - 0.18 - this.T.wheelR, 0, 0)); }
  dent() { return false; }
  uvNear() { return [0.5, 0.5]; }
  resetDamage() {}
  dispose() {
    for (const t of this.texs) t?.dispose();
    for (const m of this.mats) m.dispose();
    this.body.geometry.dispose();
  }
}

// ---------------- Bigfooten ----------------
let treadMat = null;
function bigTireMats() {
  if (treadMat) return treadMat;
  const c = cv(128, 512), g = c.getContext('2d');
  g.fillStyle = '#121214'; g.fillRect(0, 0, 128, 512);
  g.fillStyle = '#26262b';
  for (let y = 0; y < 512; y += 32) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(56, y + 14); g.lineTo(56, y + 24); g.lineTo(0, y + 10); g.fill();
    g.beginPath(); g.moveTo(128, y + 16); g.lineTo(72, y + 30); g.lineTo(72, y + 40); g.lineTo(128, y + 26); g.fill();
  }
  const tt = tex(c); tt.wrapS = tt.wrapT = THREE.RepeatWrapping;
  const sw = cv(256, 256), s = sw.getContext('2d');
  s.fillStyle = '#141416'; s.fillRect(0, 0, 256, 256);
  s.strokeStyle = '#2c2c32'; s.lineWidth = 6;
  for (let r = 70; r < 126; r += 14) { s.beginPath(); s.arc(128, 128, r, 0, Math.PI * 2); s.stroke(); }
  s.fillStyle = '#ffd21f'; s.font = '900 20px Montserrat, sans-serif'; s.textAlign = 'center';
  const txt = 'BIGFOOT  •  KNUFFYEAR  •  ';
  for (let k = 0; k < txt.length; k++) { const a = k / txt.length * Math.PI * 2; s.save(); s.translate(128 + Math.cos(a) * 112, 128 + Math.sin(a) * 112); s.rotate(a + Math.PI / 2); s.fillText(txt[k], 0, 0); s.restore(); }
  const st = tex(sw);
  treadMat = [new THREE.MeshStandardMaterial({ map: tt, roughness: 0.95 }), new THREE.MeshStandardMaterial({ map: st, roughness: 0.8 }), new THREE.MeshStandardMaterial({ map: st, roughness: 0.8 })];
  return treadMat;
}

export class BigfootView extends CarView {
  constructor(sh, livery, spec) {
    super(sh, livery);
    const T = this.T = VTYPES.bigfoot;
    // karossen högt upp på chassit
    this.model.position.y = T.modelY + 1.18;
    for (const w of this.wheels) w.holder.visible = false;
    const blk = new THREE.MeshStandardMaterial({ color: 0x1a1a1f, roughness: 0.6, metalness: 0.3 });
    const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(spec?.colors?.[1] || '#ffd21f'), roughness: 0.4, metalness: 0.5 });
    // ram + störtbåge + stötfångarrör
    const frameY = T.modelY + 1.15;
    for (const sx of [-0.55, 0.55]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.26, 4.6), blk);
      r.position.set(sx, frameY, 0); r.castShadow = true; this.group.add(r);
    }
    for (const z of [-2.55, 2.55]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.2, 8).rotateZ(Math.PI / 2), accent);
      b.position.set(0, frameY + 0.1, z); this.group.add(b);
    }
    const tg = new THREE.CylinderGeometry(T.wheelR, T.wheelR, 0.9, 24).rotateZ(Math.PI / 2);
    const mats = bigTireMats();
    this.shocks = [];
    this.wheels = T.wheels.map((w) => {
      const holder = new THREE.Group(), spin = new THREE.Group();
      const t = new THREE.Mesh(tg, mats); t.castShadow = true; spin.add(t);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.94, 12).rotateZ(Math.PI / 2), accent);
      spin.add(rim);
      holder.add(spin);
      holder.position.set(w.x, -1.0, w.z);
      this.group.add(holder);
      // stötdämpare från hjulnavet upp till ramen
      const shock = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1, 8), accent);
      this.group.add(shock);
      this.shocks.push({ mesh: shock, x: w.x * 0.62, z: w.z, top: frameY + 0.25 });
      return { holder, spin, base: w };
    });
  }
  setWheel(k, susLen, spin, steer) {
    const w = this.wheels[k];
    w.holder.position.y = -susLen;
    w.spin.rotation.x = -spin;
    w.holder.rotation.y = w.base.front ? -steer : 0;
    const s = this.shocks[k], y0 = -susLen, h = Math.max(0.2, s.top - y0);
    s.mesh.position.set(s.x, y0 + h / 2, s.z);
    s.mesh.scale.y = h;
  }
  rest() { this.wheels.forEach((w, k) => this.setWheel(k, this.T.rayLen - 0.2 - this.T.wheelR, 0, 0)); }
}

// Rätt utseende för en bils spec
export function makeCarView(spec) {
  const T = typeOf(spec);
  const sh = SHAPES[(spec.shape || 0) % SHAPES.length];
  let view;
  if (T.id === 'bus') view = new BusView(spec);
  else if (T.id === 'bigfoot') view = new BigfootView(sh, makeLivery(spec, sh), spec);
  else { view = new CarView(sh, makeLivery(spec, sh)); view.T = VTYPES.stock; view.rest = () => view.wheels.forEach((w, k) => view.setWheel(k, 0.18, 0, 0)); }
  return view;
}
