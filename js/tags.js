// Namnskyltar över bilarna (namn + placering + liten avatar) och farten målad på vägen.
import * as THREE from 'three';

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
  c.closePath();
}

const SKIN = ['#f3d2b8', '#e2b08c', '#c68a5e', '#8d5a3b', '#5c3a26', '#f7e0cf'];
const HAIR = ['#ff7ab8', '#2a1c14', '#e8c35a', '#8a3b1c', '#111111', '#7fd2ff', '#d9d9d9', '#b04aff'];

function drawAvatar(c, cx, cy, r, seed) {
  const pick = (arr, k) => arr[Math.floor(((Math.sin(seed * 91.7 + k * 13.3) * 43758.5) % 1 + 1) % 1 * arr.length)];
  c.save();
  c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.clip();
  c.fillStyle = '#c9d6e8'; c.fillRect(cx - r, cy - r, r * 2, r * 2);
  const skin = pick(SKIN, 1), hair = pick(HAIR, 2);
  // kropp
  c.fillStyle = pick(['#1b1d26', '#ffffff', '#2a5bd7', '#d72a3a', '#2ab35a'], 3);
  c.beginPath(); c.ellipse(cx, cy + r * 0.95, r * 0.62, r * 0.5, 0, 0, Math.PI * 2); c.fill();
  // huvud
  c.fillStyle = skin; c.beginPath(); c.arc(cx, cy - r * 0.05, r * 0.38, 0, Math.PI * 2); c.fill();
  // hår
  c.fillStyle = hair;
  c.beginPath(); c.arc(cx, cy - r * 0.12, r * 0.42, Math.PI * 1.05, Math.PI * 1.95); c.lineTo(cx + r * 0.42, cy + r * 0.05); c.lineTo(cx + r * 0.3, cy - r * 0.12); c.lineTo(cx - r * 0.3, cy - r * 0.12); c.lineTo(cx - r * 0.42, cy + r * 0.05); c.closePath(); c.fill();
  // ögon + mun
  c.fillStyle = '#1a1a1a';
  c.beginPath(); c.arc(cx - r * 0.13, cy, r * 0.045, 0, Math.PI * 2); c.arc(cx + r * 0.13, cy, r * 0.045, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#1a1a1a'; c.lineWidth = r * 0.04;
  c.beginPath(); c.arc(cx, cy + r * 0.08, r * 0.12, 0.2 * Math.PI, 0.8 * Math.PI); c.stroke();
  c.restore();
}

export class NameTag {
  constructor(scene, name, seed, big = false) {
    this.cv = document.createElement('canvas'); this.cv.width = 512; this.cv.height = 128;
    this.tex = new THREE.CanvasTexture(this.cv); this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mat = new THREE.SpriteMaterial({ map: this.tex, depthTest: false, depthWrite: false, transparent: true, fog: false, toneMapped: false });
    this.sprite = new THREE.Sprite(this.mat);
    this.sprite.center.set(0.62, 0.5);
    const k = big ? 1.15 : 1;
    this.sprite.scale.set(4.6 * k, 1.15 * k, 1);
    this.sprite.renderOrder = 20;
    scene.add(this.sprite);
    this.name = name; this.seed = seed; this.key = '';
  }
  set(line2, ring) {
    const key = line2 + '|' + ring;
    if (key === this.key) return;
    this.key = key;
    const c = this.cv.getContext('2d');
    c.clearRect(0, 0, 512, 128);
    const g = c.createLinearGradient(40, 0, 430, 0);
    g.addColorStop(0, 'rgba(14,12,26,0)'); g.addColorStop(1, 'rgba(14,12,26,0.62)');
    c.fillStyle = g; roundRect(c, 40, 22, 400, 84, 42); c.fill();
    const lg = c.createLinearGradient(80, 0, 440, 0);
    const rc = ring === 'gold' ? ['rgba(255,214,48,0)', '#ffd630'] : ring === 'silver' ? ['rgba(220,226,240,0)', '#dfe6f4'] : ring === 'bronze' ? ['rgba(230,140,70,0)', '#e88c46'] : ['rgba(80,230,90,0)', '#c4ff3a'];
    lg.addColorStop(0, rc[0]); lg.addColorStop(1, rc[1]);
    c.fillStyle = lg; c.fillRect(80, 20, 360, 4); c.fillRect(80, 104, 360, 4);
    // avatar med ring
    drawAvatar(c, 446, 64, 46, this.seed);
    c.lineWidth = 7; c.strokeStyle = rc[1];
    c.beginPath(); c.arc(446, 64, 48, 0, Math.PI * 2); c.stroke();
    c.textAlign = 'right'; c.textBaseline = 'alphabetic';
    c.fillStyle = '#ffffff'; c.font = '600 42px Montserrat, sans-serif';
    c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 4;
    let nm = this.name;
    while (c.measureText(nm).width > 330 && nm.length > 3) nm = nm.slice(0, -1);
    c.fillText(nm, 386, 62);
    c.fillStyle = '#5fd4ff'; c.font = '600 30px Montserrat, sans-serif';
    c.fillText(line2, 386, 98);
    c.shadowBlur = 0;
    this.tex.needsUpdate = true;
  }
  place(x, y, z, visible = true) { this.sprite.position.set(x, y, z); this.sprite.visible = visible; }
  dispose(scene) { scene.remove(this.sprite); this.tex.dispose(); this.mat.dispose(); }
}

// Farten i stora siffror på vägen bakom spelarens bil
export class SpeedPlate {
  constructor(scene) {
    this.cv = document.createElement('canvas'); this.cv.width = 512; this.cv.height = 176;
    this.tex = new THREE.CanvasTexture(this.cv); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 8;
    const geo = new THREE.PlaneGeometry(3.6, 1.24).rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, toneMapped: false,
      polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }));
    this.mesh.renderOrder = 3;
    scene.add(this.mesh);
    this.val = -1;
    this.m = new THREE.Matrix4(); this.r = new THREE.Vector3(); this.u = new THREE.Vector3(); this.f = new THREE.Vector3();
  }
  color(k) {
    const lerp = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
    const Y = [255, 228, 58], O = [255, 160, 26], R = [255, 44, 44];
    let c;
    if (k < 250) c = Y; else if (k < 330) c = lerp(Y, O, (k - 250) / 80); else c = lerp(O, R, Math.min(1, (k - 330) / 70));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }
  set(kmh) {
    const v = Math.max(0, Math.round(kmh));
    if (v === this.val) return;
    this.val = v;
    const c = this.cv.getContext('2d');
    c.clearRect(0, 0, 512, 176);
    c.fillStyle = 'rgba(24,18,30,0.3)'; roundRect(c, 40, 8, 432, 160, 48); c.fill();
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = '400 108px Michroma, "Exo 2", sans-serif';
    c.fillStyle = this.color(v);
    c.fillText(String(v), 256, 82);
    c.fillStyle = 'rgba(255,255,255,0.85)'; c.fillRect(110, 146, 292, 4);
    this.tex.needsUpdate = true;
  }
  // ground = punkt på marken, up = markens normal, fwd = bilens riktning
  place(ground, up, fwd, visible) {
    this.mesh.visible = visible;
    if (!visible) return;
    this.u.copy(up).normalize();
    this.f.copy(fwd).addScaledVector(this.u, -fwd.dot(this.u)).normalize();
    this.r.crossVectors(this.f, this.u).normalize();
    this.m.makeBasis(this.r, this.u, this.f.negate());
    this.mesh.quaternion.setFromRotationMatrix(this.m);
    this.mesh.position.copy(ground);
  }
}
