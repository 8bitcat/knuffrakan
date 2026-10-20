// Vapen och vapenlådor. Kör igenom en låda → ett slumpat vapen (som i Mario Kart: ju längre bak,
// desto bättre). F skjuter. Värden räknar allt — träffar, skada, projektiler — och gästerna ritar
// efter ögonblicksbilderna: varje bil har vapen + "skjuter" i sin rad, projektilerna ligger sist i
// bilden, och lådor/explosioner/chockvågor kommer som händelser.
import * as THREE from 'three';
import { F_GAP, F_RAMP, F_LAND } from './track.js?v=29';

export const WEAPONS = {
  raket: { namn: 'Raketer', ikon: '🚀', ammo: 3 },
  olja: { namn: 'Oljefläck', ikon: '🛢️', ammo: 1 },
  minor: { namn: 'Minor', ikon: '💣', ammo: 3 },
  chock: { namn: 'Chockvåg', ikon: '💥', ammo: 1 },
  harpun: { namn: 'Harpun', ikon: '🪝', ammo: 1 },
  kulspruta: { namn: 'Kulspruta .50', ikon: '.50', ammo: 60, rate: 12, dmg: 1.3, spread: 0.012, kick: 0.15, gun: true },
  kanon: { namn: '20 mm automatkanon', ikon: '20mm', ammo: 80, rate: 20, dmg: 1.9, spread: 0.02, kick: 0.3, gun: true },
};
export const WIDS = Object.keys(WEAPONS);                 // kod i ögonblicksbilden = index + 1, -1 = ruletten snurrar
// vikt = a + b·p där p = 0 för ledaren och 1 för den sista
const LOOT = { olja: [3, -2], minor: [2.5, -1.5], chock: [1.5, 0], harpun: [1, 1], raket: [0.6, 2], kulspruta: [0.5, 1.8], kanon: [0.15, 1.6] };
const PT = { RAKET: 1, MINA: 2, OLJA: 3, KROK: 4, GRANAT: 5, GLASS: 6, BANAN: 7, V2: 8, SPIK: 9, BAR: 10 };
const V2_G = 14;                                          // V2-raketens bana (lobbas högt)
const GLASS_G = 14;                                       // glasskulans tyngdkraft (lobbas)
const PROW = 10;                                          // flyttal per projektil i ögonblicksbilden
const WORLD_ONLY = (0xffff << 16) | 0x0002;              // strålar som bara träffar banan (inte bilar)
const BOX_RESPAWN = 5;

const rnd = (s) => (Math.random() * 2 - 1) * s;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _h = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const _lo = new THREE.Vector3(), _ld = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const _up = new THREE.Vector3(0, 1, 0), _z = new THREE.Vector3(0, 0, 1);

// Stråle mot en bils låda (i bilens ram). Avstånd längs strålen, eller -1.
function rayBox(o, d, car, pad = 0.15) {
  const v = car.veh, T = v.T;
  _q.copy(v.quat).invert();
  _lo.copy(o).sub(v.pos).applyQuaternion(_q); _lo.y -= T.colY;
  _ld.copy(d).applyQuaternion(_q);
  let t0 = 0, t1 = 1e9;
  for (const ax of ['x', 'y', 'z']) {
    const h = T.half[ax] + pad, oo = _lo[ax], dd = _ld[ax];
    if (Math.abs(dd) < 1e-6) { if (Math.abs(oo) > h) return -1; continue; }
    let a = (-h - oo) / dd, b = (h - oo) / dd;
    if (a > b) { const t = a; a = b; b = t; }
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    if (t0 > t1) return -1;
  }
  return t0;
}

export class Weapons {
  constructor(game) {
    this.g = game;
    this.grp = new THREE.Group(); game.scene.add(this.grp);
    this.boxGrp = null; this.boxes = [];
    this.proj = []; this.nextP = 1;           // värden: projektilerna
    this.pview = new Map();                   // projektil-id → grafik (båda sidor)
    this.tracers = []; this.rings = [];
    this.ray = null;
    this.mats();
    this.onTrack();
  }

  // ---------- material och former (delas) ----------
  mats() {
    const add = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d'), gr = x.createLinearGradient(0, 0, 256, 256);
    ['#ff3b6b', '#ffb21a', '#5bff7a', '#2bd6e8', '#7a5bff'].forEach((col, i) => gr.addColorStop(i / 4, col));
    x.fillStyle = gr; x.fillRect(0, 0, 256, 256);
    x.fillStyle = 'rgba(255,255,255,0.25)'; x.fillRect(10, 10, 236, 236);
    x.strokeStyle = '#fff'; x.lineWidth = 12; x.strokeRect(14, 14, 228, 228);
    x.fillStyle = '#fff'; x.font = '900 190px "Exo 2", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.shadowColor = 'rgba(0,0,0,0.4)'; x.shadowBlur = 12; x.fillText('?', 128, 140);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    this.M = {
      box: new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.55, transparent: true, opacity: 0.88, roughness: 0.3 }),
      boxGeo: new THREE.BoxGeometry(1.25, 1.25, 1.25),
      mg: add(0xff5a2a, 0.95), can: add(0xffd23a, 0.95), flash: add(0xffe9a0, 0.9),
      tracerGeo: new THREE.BoxGeometry(0.13, 0.13, 1).translate(0, 0, -0.5),
      rocketBody: new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.4, metalness: 0.3 }),
      red: new THREE.MeshStandardMaterial({ color: 0xe8242f, roughness: 0.4 }),
      fireM: add(0xff8a2a, 0.9),
      mine: new THREE.MeshStandardMaterial({ color: 0x2a2c33, roughness: 0.5, metalness: 0.6 }),
      mineLight: new THREE.MeshBasicMaterial({ color: 0xff2020, toneMapped: false }),
      oil: new THREE.MeshStandardMaterial({ color: 0x030303, roughness: 0.12, metalness: 0.2, transparent: true, opacity: 0.95, polygonOffset: true, polygonOffsetFactor: -4 }),
      oilSheen: new THREE.MeshBasicMaterial({ color: 0x7a4bff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5 }),
      oilSheen2: new THREE.MeshBasicMaterial({ color: 0x2bd6a8, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5 }),
      oilRim: new THREE.MeshBasicMaterial({ color: 0x8a8f9a, transparent: true, opacity: 0.55, polygonOffset: true, polygonOffsetFactor: -4 }),
      steel: new THREE.MeshStandardMaterial({ color: 0x3a3d44, roughness: 0.35, metalness: 0.8 }),
      cable: new THREE.MeshStandardMaterial({ color: 0x9aa0aa, roughness: 0.4, metalness: 0.7 }),
      ring: add(0x9fd0ff, 0.7),
      gunDark: new THREE.MeshStandardMaterial({ color: 0x1e2026, roughness: 0.45, metalness: 0.7 }),
    };
  }

  // ---------- lådorna: rader tvärs över vägen, aldrig vid hopp ----------
  onTrack() {
    const g = this.g, T = g.track;
    if (this.boxGrp) this.grp.remove(this.boxGrp);
    this.boxGrp = new THREE.Group(); this.grp.add(this.boxGrp);
    this.boxes = [];
    const rows = Math.max(3, Math.round(T.L / 1100));
    const bad = (s) => { for (let d = -70; d <= 70; d += 8) { const f = T.flags[T.idx(T.wrapS(s + d))]; if (f & (F_GAP | F_RAMP | F_LAND)) return true; } return false; };
    for (let r = 0; r < rows; r++) {
      let s = T.wrapS(T.L * (r + 0.45) / rows);
      for (let k = 0; k < 40 && bad(s); k++) s = T.wrapS(s + 25);
      for (const lat of [-10, -5, 0, 5, 10]) {
        const p = T.pointAt(s, lat, new THREE.Vector3()); p.y += 1.25;
        const mesh = new THREE.Mesh(this.M.boxGeo, this.M.box);
        mesh.position.copy(p); mesh.rotation.set(0.5, Math.random() * 6, 0.3);
        this.boxGrp.add(mesh);
        this.boxes.push({ pos: p, until: 0, mesh, ph: Math.random() * 6 });
      }
    }
    this.clearProj();
  }
  clearProj() {
    this.proj = [];
    for (const v of this.pview.values()) this.grp.remove(v.obj);
    this.pview.clear();
  }
  // nytt race: inga vapen, alla lådor tillbaka
  reset() {
    for (const c of this.g.cars) { c.weapon = null; c.rollT = 0; c.fireCD = 0; }
    for (const b of this.boxes) b.until = 0;
    this.clearProj();
  }

  loot(car) {
    const g = this.g, n = Math.max(2, g.cars.filter(c => !c.hidden).length);
    const p = g.race.phase === 'race' ? clamp(((car.place || n) - 1) / (n - 1), 0, 1) : Math.random();
    let sum = 0; const w = WIDS.map(id => { const [a, b] = LOOT[id]; const x = Math.max(0.05, a + b * p); sum += x; return x; });
    let r = Math.random() * sum;
    for (let i = 0; i < WIDS.length; i++) { r -= w[i]; if (r <= 0) return WIDS[i]; }
    return WIDS[0];
  }

  muzzle(c, out) {
    const v = c.veh, T = v.T;
    return out.copy(v.pos).addScaledVector(v.up, T.colY + T.half.y + 0.28).addScaledVector(v.fwd, T.half.z * 0.3);
  }
  rayWorld(o, d, len) {
    const g = this.g;
    if (!this.ray) this.ray = new g.RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
    this.ray.origin = { x: o.x, y: o.y, z: o.z }; this.ray.dir = { x: d.x, y: d.y, z: d.z };
    const h = g.world.castRay(this.ray, len, true, undefined, WORLD_ONLY);
    return h ? (h.toi ?? h.timeOfImpact) : -1;
  }
  // första bilen framför i en kon (bottarnas sikte, raketernas målsökning, harpunen)
  target(c, cosMin, range, minD = 0, from = c.veh.pos, dir = c.veh.fwd) {
    let best = null, bd = range;
    for (const o of this.g.cars) {
      if (o === c || o.wrecked || o.hidden || o.ghostT > 0) continue;
      _a.copy(o.veh.pos).sub(from);
      const d = _a.length();
      if (d < minD || d > bd) continue;
      if (_a.dot(dir) / d < cosMin) continue;
      best = o; bd = d;
    }
    return best;
  }

  // ---------- värden: ett fysiksteg ----------
  step(dt) {
    const g = this.g, ph = g.race.phase, live = ph === 'race' || ph === 'lobby', now = g.simT;
    if (live) {
      for (const [i, b] of this.boxes.entries()) {
        if (b.until > now) continue;
        for (const c of g.cars) {
          if (c.wrecked || c.hidden || c.ghostT > 0 || c.weapon || c.rollT > 0) continue;
          const r = 1.6 + Math.max(c.veh.T.half.x, c.veh.T.half.z) * 0.6;
          if (c.veh.pos.distanceToSquared(b.pos) > r * r) continue;
          b.until = now + BOX_RESPAWN; g.emit({ t: 'wb', i, u: BOX_RESPAWN });
          c.rollT = 0.9; c.rollW = this.loot(c);
          if (c === g.me) g.audio?.pickup?.();
          break;
        }
      }
    }
    for (const c of g.cars) {
      if (c.rollT > 0) {
        c.rollT -= dt;
        if (c.rollT <= 0) {
          const W = WEAPONS[c.rollW];
          c.weapon = { id: c.rollW, ammo: W.ammo };
          if (g.isHuman(c)) g.notify(c, `${W.ikon} ${W.namn}${W.ammo > 1 ? ' ×' + W.ammo : ''} — tryck F!`, 'good');
        }
      }
      if (c.fireCD > 0) c.fireCD -= dt;
      if (c.wrecked) { c.weapon = null; c.rollT = 0; }
      if (c.brain && c.weapon) c.veh.input.fire = ph === 'race' && !c.hidden && this.botWants(c, dt) ? 1 : 0;
      c.firing = !!(live && c.weapon && WEAPONS[c.weapon.id].gun && c.veh.input.fire && !c.wrecked && !c.hidden);
      if (live && c.weapon && c.veh.input.fire && !c.wrecked && !c.hidden && !(c.fireCD > 0)) this.fire(c);   // OBS: undefined för nyss anslutna
    }
    for (const p of this.proj) this.stepProj(p, dt, now);
    if (this.proj.some(p => p.dead)) this.proj = this.proj.filter(p => !p.dead);
  }

  botWants(c, dt) {
    const id = c.weapon.id;
    c.holdT = (c.holdT || 0) + dt;
    if (id === 'kulspruta' || id === 'kanon') return !!this.target(c, 0.988, 80, 3);
    if (id === 'raket') return !!this.target(c, 0.92, 100, 6);
    if (id === 'harpun') return !!this.target(c, 0.94, 70, 12);
    if (id === 'olja' || id === 'minor') {
      for (const o of this.g.cars) {
        if (o === c || o.hidden || o.wrecked) continue;
        _a.copy(o.veh.pos).sub(c.veh.pos);
        const d = _a.length();
        if (d < 30 && d > 4 && _a.dot(c.veh.fwd) / d < -0.85) return true;
      }
      return c.holdT > 12;
    }
    if (id === 'chock') {
      let n = 0;
      for (const o of this.g.cars) if (o !== c && !o.hidden && !o.wrecked && o.veh.pos.distanceTo(c.veh.pos) < 9) n++;
      return n >= 2 || c.holdT > 15;
    }
    return false;
  }

  fire(c) {
    const w = c.weapon, W = WEAPONS[w.id];
    c.holdT = 0;
    switch (w.id) {
      case 'kulspruta': case 'kanon': this.shoot(c, w.id); c.fireCD = 1 / W.rate; break;
      case 'raket': this.spawn(c, PT.RAKET); c.fireCD = 0.45; break;
      case 'minor': this.spawn(c, PT.MINA); c.fireCD = 0.35; break;
      case 'olja': this.spawn(c, PT.OLJA); c.fireCD = 0.5; break;
      case 'harpun': this.spawn(c, PT.KROK); c.fireCD = 0.5; break;
      case 'chock': this.shock(c); c.fireCD = 0.5; break;
    }
    if (--w.ammo <= 0) c.weapon = null;
  }

  // skada + "vem gjorde det" + vrak
  hurt(B, A, dmg) {
    const g = this.g;
    B.health -= dmg / B.veh.T.armor;
    B.lastDmgT = g.simT; B.lastHitBy = A; B.lastHitT = g.time;
    if (B.health <= 0 && !B.wrecked) g.wreck(B);
  }

  // kulspruta / automatkanon: träff direkt längs strålen, spårljuset ritas efteråt
  shoot(c, id) {
    const g = this.g, v = c.veh, W = WEAPONS[id];
    const o = this.muzzle(c, _o);
    // sikte: pipan riktas mot mitten av närmaste bil i en smal kon framåt (annars rakt fram, lite nedåt)
    const tg = this.target(c, 0.975, 170, 2);
    if (tg) _d.copy(tg.veh.pos).addScaledVector(tg.veh.up, tg.veh.T.colY).addScaledVector(tg.veh.vel, 0.05).sub(o).normalize();
    else _d.copy(v.fwd).addScaledVector(v.up, -0.02).normalize();
    const d = _d;
    d.x += rnd(W.spread); d.y += rnd(W.spread) * 0.5; d.z += rnd(W.spread); d.normalize();
    let best = null, bt = 170;
    for (const o2 of g.cars) {
      if (o2 === c || o2.wrecked || o2.hidden || o2.ghostT > 0) continue;
      const t = rayBox(o, d, o2);
      if (t >= 0 && t < bt) { bt = t; best = o2; }
    }
    const tw = this.rayWorld(o, d, bt);
    if (tw >= 0 && tw < bt) { bt = tw; best = null; }
    if (best) {
      this.hurt(best, c, W.dmg);
      const J = best.veh.T.mass * W.kick;
      best.veh.applyJ?.(d.x * J, 0.2 * J, d.z * J, best.veh.pos.x, best.veh.pos.y, best.veh.pos.z);
      if (!c.gunMsgT || g.time - c.gunMsgT > 2.5) { c.gunMsgT = g.time; g.notify(c, `${W.ikon} Träff på ${best.name}!`, 'good'); }
      if (!best.gunHitMsgT || g.time - best.gunHitMsgT > 3) { best.gunHitMsgT = g.time; g.notify(best, `${W.ikon} ${c.name} skjuter på dig!`, 'bad'); }
    }
    this.tracer(o, d, bt, id === 'kanon', best || tw >= 0);
    this.gunSound(c, id);
  }
  gunSound(c, id) {
    const g = this.g;
    const near = c === g.me ? 1 : g.me ? Math.max(0, 1 - g.me.veh.pos.distanceTo(c.veh.pos) / 120) : 0.5;
    g.audio?.gun?.(id, near * (c === g.me ? 1 : 0.6));
  }

  // projektiler: raket, mina, olja, harpunkrok
  spawn(c, type) {
    const g = this.g, v = c.veh, T = v.T;
    const p = { id: this.nextP++, type, owner: c, pos: new THREE.Vector3(), vel: new THREE.Vector3(), born: g.simT, life: 3, a: 0, b: 0 };
    if (type === PT.RAKET || type === PT.KROK) {
      this.muzzle(c, p.pos).addScaledVector(v.fwd, 0.8);
      const sp = Math.max(0, v.vLong) + (type === PT.RAKET ? 70 : 120);
      p.vel.copy(v.fwd).multiplyScalar(Math.min(type === PT.RAKET ? 150 : 200, sp));
      p.life = type === PT.RAKET ? 3 : 0.9;
      if (type === PT.KROK) { p.target = this.target(c, 0.85, 85, 4); p.b = p.target ? p.target.id : 0; p.a = c.id; g.audio?.twang?.(c === g.me ? 1 : 0.5); }
      else g.audio?.launch?.(c === g.me ? 1 : 0.5);
    } else {
      // släpps bakom bilen, på marken
      p.pos.copy(v.pos).addScaledVector(v.fwd, -(T.half.z + (type === PT.OLJA ? 3 : 1.6)));
      _a.copy(p.pos).addScaledVector(_up, 2.5);
      const t = this.rayWorld(_a, _d.set(0, -1, 0), 8);
      p.pos.y = t >= 0 ? _a.y - t + 0.06 : v.pos.y + T.modelY + 0.06;
      p.life = type === PT.OLJA ? 18 : 45;
      p.r = type === PT.OLJA ? 3.4 : 0;
      p.a = type === PT.OLJA ? p.r : 0;
      if (type === PT.OLJA) g.audio?.splat?.(c === g.me ? 1 : 0.4);
    }
    this.proj.push(p);
  }

  // stridsvagnens kanon (E): en tung granat nästan rakt fram — siktar lite mot bilen i en smal kon
  cannon(c) {
    const g = this.g, v = c.veh, T = v.T, G = T.gun;
    const p = { id: this.nextP++, type: PT.GRANAT, owner: c, pos: new THREE.Vector3(), vel: new THREE.Vector3(), born: g.simT, life: 1.6, a: 0, b: 0 };
    p.pos.copy(v.pos).addScaledVector(v.up, T.modelY + G.y).addScaledVector(v.fwd, -G.z + 0.3);
    const sp = 170 + Math.max(0, v.vLong);
    const tg = this.target(c, 0.985, 160, 6);
    if (tg) _d.copy(tg.veh.pos).addScaledVector(tg.veh.up, tg.veh.T.colY).addScaledVector(tg.veh.vel, tg.veh.pos.distanceTo(p.pos) / sp).sub(p.pos).normalize();
    else _d.copy(v.fwd).addScaledVector(v.up, 0.015).normalize();
    p.vel.copy(_d).multiplyScalar(sp);
    // rekylen: stridsvagnen rycks bakåt
    const J = T.mass * 1.2;
    v.applyJ(-v.fwd.x * J, 0, -v.fwd.z * J, v.pos.x, v.pos.y + 0.5, v.pos.z);
    if (tg && (!c.cannonMsgT || g.time - c.cannonMsgT > 2)) { c.cannonMsgT = g.time; g.notify(tg, `💥 ${c.name}s stridsvagn skjuter på dig!`, 'bad'); }
    this.proj.push(p);
  }

  // glassbilen (E): en glasskula lobbas mot bilen framför — träffen kladdar ner rutan
  glass(c) {
    const g = this.g, v = c.veh, T = v.T;
    const p = { id: this.nextP++, type: PT.GLASS, owner: c, pos: new THREE.Vector3(), vel: new THREE.Vector3(), born: g.simT, life: 3, a: 0, b: 0 };
    p.pos.copy(v.pos).addScaledVector(v.up, T.modelY + 3.7).addScaledVector(v.fwd, 1.0);
    const hs = 42 + Math.max(0, v.vLong), tg = this.target(c, 0.94, 55, 5);
    if (tg) {
      _a.copy(tg.veh.pos).addScaledVector(tg.veh.up, tg.veh.T.colY + 0.3).sub(p.pos);
      const t0 = Math.hypot(_a.x, _a.z) / hs;
      _a.addScaledVector(tg.veh.vel, t0);                                    // sikta dit bilen är när kulan kommer
      const t = Math.max(0.15, Math.hypot(_a.x, _a.z) / hs);
      p.vel.set(_a.x / t, (_a.y + 0.5 * GLASS_G * t * t) / t, _a.z / t);
    } else { p.vel.copy(v.fwd).multiplyScalar(hs); p.vel.y += 5; }
    this.proj.push(p);
  }
  // V2-raketbilen (E): raketen skjuts upp i en hög båge mot bilen långt fram (eller 90 m rakt fram)
  v2(c) {
    const g = this.g, v = c.veh, T = v.T, G = T.rocket;
    const p = { id: this.nextP++, type: PT.V2, owner: c, pos: new THREE.Vector3(), vel: new THREE.Vector3(), born: g.simT, life: 7, a: 0, b: 0 };
    p.pos.copy(v.pos).addScaledVector(v.up, T.modelY + G.y).addScaledVector(v.fwd, -G.z);
    const tg = this.target(c, 0.9, 150, 22);
    _a.copy(tg ? tg.veh.pos : _b.copy(v.pos).addScaledVector(v.fwd, 90)).sub(p.pos);
    const hs = 50 + Math.max(0, v.vLong);
    if (tg) _a.addScaledVector(tg.veh.vel, Math.hypot(_a.x, _a.z) / hs);   // dit bilen är när raketen slår ner
    const t = Math.max(1.4, Math.hypot(_a.x, _a.z) / hs);
    p.vel.set(_a.x / t, (_a.y + 0.5 * V2_G * t * t) / t, _a.z / t);
    if (tg) { g.notify(tg, `🚀 ${c.name}s V2-raket är på väg mot dig!`, 'bad'); }
    this.proj.push(p);
  }
  // V2-smällen: alla inom R flyger iväg (uppåt och utåt), skadan avtar med avståndet. self = bilen som själv sprängdes
  v2Blast(pos, owner, direct, R = 20, self = null) {
    const g = this.g;
    for (const o of g.cars) {
      if (o === self || o.wrecked || o.hidden || o.ghostT > 0) continue;
      _a.copy(o.veh.pos).sub(pos);
      const d = _a.length();
      if (d > R) continue;
      const k = 1 - d / R, m = o.veh.T.mass;
      _a.y = 0; _a.normalize();
      o.veh.applyJ?.(_a.x * m * 22 * k, m * (8 + 10 * k), _a.z * m * 22 * k, o.veh.pos.x + (Math.random() - 0.5), o.veh.pos.y, o.veh.pos.z + (Math.random() - 0.5));
      o.veh.spinT = Math.max(o.veh.spinT || 0, 1.5);
      this.hurt(o, owner, 30 * k + (o === direct ? 12 : 0));
    }
    this.v2Fx(pos);
    if (owner && !self) g.notify(owner, '🚀 V2-raketen slog ner — alla flög!', 'good');
    g.emit({ t: 'wv2', p: [+pos.x.toFixed(2), +pos.y.toFixed(2), +pos.z.toFixed(2)] });
  }
  v2Fx(pos) {
    const g = this.g;
    g.fx.explosion(pos, _b.set(0, 0, 0));
    g.fx.explosion(_h.copy(pos).add(_b.set(0, 2, 0)), _b.set(0, 0, 0));
    this.boomFx(pos, 1.5);
    this.ringFx(pos);
  }
  // polisbilen (E): en spikmatta tvärs över vägen bakom bilen (högst 2 ute per polisbil)
  spikes(c) {
    const g = this.g, v = c.veh, T = v.T;
    const mine = this.proj.filter(p => p.type === PT.SPIK && p.owner === c && !p.dead);
    if (mine.length >= 2) mine[0].dead = true;
    const p = { id: this.nextP++, type: PT.SPIK, owner: c, pos: new THREE.Vector3(), vel: new THREE.Vector3(), born: g.simT, life: 30, a: Math.atan2(-v.fwd.x, -v.fwd.z), b: 0, hit: new Set() };
    p.pos.copy(v.pos).addScaledVector(v.fwd, -(T.half.z + 2.2));
    _a.copy(p.pos).addScaledVector(_up, 2.5);
    const t = this.rayWorld(_a, _d.set(0, -1, 0), 8);
    p.pos.y = t >= 0 ? _a.y - t + 0.04 : v.pos.y + T.modelY + 0.04;
    this.proj.push(p);
  }

  // ambulansen (E): tre patienter på rullbårar rullar ut genom bakdörrarna och glider kvar på vägen (högst 6 ute)
  patients(c) {
    const g = this.g, v = c.veh, T = v.T;
    const mine = this.proj.filter(p => p.type === PT.BAR && p.owner === c && !p.dead);
    for (let k = 0; k < mine.length - 3; k++) mine[k].dead = true;
    for (let k = 0; k < 3; k++) {
      const side = (k - 1) * 1.1;
      const p = { id: this.nextP++, type: PT.BAR, owner: c, pos: new THREE.Vector3(), vel: new THREE.Vector3(), born: g.simT, life: 20, a: Math.atan2(-v.fwd.x, -v.fwd.z) + (Math.random() - 0.5) * 0.8, b: 0, cd: new Map() };
      p.pos.copy(v.pos).addScaledVector(v.fwd, -(T.half.z + 1.2 + k * 0.6)).addScaledVector(v.right, side);
      // samma fart som ambulansen men lite bakåt och utåt — de bromsas sakta av vägen
      p.vel.copy(v.vel).multiplyScalar(0.55).addScaledVector(v.fwd, -4).addScaledVector(v.right, side * 2.5); p.vel.y = 0;
      this.ground(p);
      this.proj.push(p);
    }
    g.notify(c, '🚑 Patienterna rullar ut!', 'good');
  }
  ground(p) {
    _a.copy(p.pos); _a.y += 3;
    const t = this.rayWorld(_a, _d.set(0, -1, 0), 10);
    if (t >= 0) p.pos.y = _a.y - t;
  }

  // gokarten (E): ett bananskal bakom — den som kör på det snurrar (högst 3 ute per gokart)
  banana(c) {
    const g = this.g, v = c.veh, T = v.T;
    const mine = this.proj.filter(p => p.type === PT.BANAN && p.owner === c && !p.dead);
    if (mine.length >= 3) mine[0].dead = true;
    const p = { id: this.nextP++, type: PT.BANAN, owner: c, pos: new THREE.Vector3(), vel: new THREE.Vector3(), born: g.simT, life: 45, a: Math.random() * 6.28, b: 0 };
    p.pos.copy(v.pos).addScaledVector(v.fwd, -(T.half.z + 1.4));
    _a.copy(p.pos).addScaledVector(_up, 2.5);
    const t = this.rayWorld(_a, _d.set(0, -1, 0), 8);
    p.pos.y = t >= 0 ? _a.y - t + 0.05 : v.pos.y + T.modelY + 0.05;
    this.proj.push(p);
  }
  // glasskulan träffade: bilen bromsas, halkar, och spelarens ruta kladdas ner
  splat(B, owner, pos) {
    const g = this.g, v = B.veh, lv = v.body.linvel(), m = v.T.mass;
    v.applyJ(-lv.x * m * 0.2, 0, -lv.z * m * 0.2, v.pos.x, v.pos.y, v.pos.z);
    v.slip(1.2, 0.5);
    this.hurt(B, owner, 3);
    if (B === g.me) g.hud?.splat?.(); else if (B.remote) g.net?.sendTo(B, { t: 'splat' });
    g.notify(owner, `🍦 Glass på ${B.name}!`, 'good');
    g.notify(B, `🍦 ${owner.name} kastade glass på dig!`, 'bad');
    this.glassFx(pos);
    g.emit({ t: 'wgl', p: [+pos.x.toFixed(2), +pos.y.toFixed(2), +pos.z.toFixed(2)] });
  }
  glassFx(pos) {
    const g = this.g;
    g.fx.snow(pos, _b.set(0, 0, 0), 12);
    const near = g.me ? Math.max(0, 1 - g.me.veh.pos.distanceTo(pos) / 100) : 0.5;
    g.audio?.splat?.(near);
  }
  bananaFx(pos) {
    const g = this.g, near = g.me ? Math.max(0, 1 - g.me.veh.pos.distanceTo(pos) / 100) : 0.5;
    g.audio?.boing?.(near);
  }

  stepProj(p, dt, now) {
    const g = this.g;
    if (now - p.born > p.life) { p.dead = true; return; }
    if (p.dead) return;
    if (p.type === PT.GLASS) {
      p.vel.y -= GLASS_G * dt;
      const sp = p.vel.length(), dir = _d.copy(p.vel).divideScalar(sp || 1), step = sp * dt;
      let hitCar = null, ht = step + 0.3;
      for (const o of g.cars) {
        if (o === p.owner || o.wrecked || o.hidden || o.ghostT > 0) continue;
        const t = rayBox(p.pos, dir, o, 0.45);
        if (t >= 0 && t < ht) { ht = t; hitCar = o; }
      }
      const tw = this.rayWorld(p.pos, dir, Math.min(ht, step + 0.3));
      if (hitCar && !(tw >= 0 && tw < ht)) { p.pos.addScaledVector(dir, ht); this.splat(hitCar, p.owner, p.pos); p.dead = true; return; }
      if (tw >= 0) { p.pos.addScaledVector(dir, tw); this.glassFx(p.pos); g.emit({ t: 'wgl', p: [+p.pos.x.toFixed(2), +p.pos.y.toFixed(2), +p.pos.z.toFixed(2)] }); p.dead = true; return; }
      p.pos.addScaledVector(p.vel, dt);
      return;
    }
    if (p.type === PT.V2) {
      p.vel.y -= V2_G * dt;
      const sp = p.vel.length(), dir = _d.copy(p.vel).divideScalar(sp || 1), step = sp * dt;
      let hitCar = null, ht = step + 0.5;
      for (const o of g.cars) {
        if (o === p.owner || o.wrecked || o.hidden || o.ghostT > 0) continue;
        const t = rayBox(p.pos, dir, o, 0.6);
        if (t >= 0 && t < ht) { ht = t; hitCar = o; }
      }
      const tw = now - p.born > 0.3 ? this.rayWorld(p.pos, dir, Math.min(ht, step + 0.5)) : -1;
      if (hitCar || tw >= 0) {
        const wall = tw >= 0 && (!hitCar || tw < ht);
        p.pos.addScaledVector(dir, wall ? tw : ht);
        this.v2Blast(p.pos, p.owner, wall ? null : hitCar);
        p.dead = true; return;
      }
      p.pos.addScaledVector(p.vel, dt);
      if (now - p.born > p.life - dt) { this.v2Blast(p.pos, p.owner, null); p.dead = true; }
      return;
    }
    if (p.type === PT.SPIK) {
      const ca = Math.cos(p.a), sa = Math.sin(p.a);
      for (const o of g.cars) {
        if (o.wrecked || o.hidden || o.ghostT > 0 || p.hit.has(o) || o.veh.grounded === 0) continue;
        if (o === p.owner && now - p.born < 1.5) continue;
        const dx = o.veh.pos.x - p.pos.x, dz = o.veh.pos.z - p.pos.z, dy = o.veh.pos.y - p.pos.y;
        const along = dx * ca - dz * sa, across = -(dx * sa + dz * ca);       // längs mattan / tvärs (bilens färdriktning)
        if (Math.abs(along) > 2.9 + o.veh.T.half.x * 0.5 || Math.abs(across) > 0.6 + o.veh.T.half.z * 0.5 || Math.abs(dy) > 2.5) continue;
        p.hit.add(o);
        o.punctT = 4; o.veh.slip(0.6, 0.6);
        if (o !== p.owner) { this.hurt(o, p.owner, 4); g.notify(p.owner, `🚓 ${o.name} körde på spikmattan!`, 'good'); }
        g.notify(o, '🚓 Spikmatta! Punktering — du blir långsam en stund', 'bad');
        g.fx.sparks(o.veh.pos, o.veh.vel, 14, 5);
        if (o === g.me) g.audio?.crash?.(8, 1);
      }
      return;
    }
    if (p.type === PT.BAR) {
      // bårarna glider och bromsas, följer marken och knuffas runt av bilarna
      const sp = Math.hypot(p.vel.x, p.vel.z), dec = Math.min(sp, 7 * dt);
      if (sp > 0.01) { p.vel.x -= p.vel.x / sp * dec; p.vel.z -= p.vel.z / sp * dec; }
      p.pos.x += p.vel.x * dt; p.pos.z += p.vel.z * dt;
      if (!(p.gt > now)) { p.gt = now + 0.1; const y0 = p.pos.y; this.ground(p); p.gy = p.pos.y; p.pos.y = y0; }   // marken under (10 ggr/s)
      if (p.vel.y !== 0 || p.pos.y > p.gy + 0.05) { p.vel.y -= 14 * dt; p.pos.y += p.vel.y * dt; }
      if (p.pos.y < p.gy) { p.pos.y = p.gy; p.vel.y = 0; }
      if (sp > 0.5) p.a += (Math.random() - 0.5) * dt;
      for (const o of g.cars) {
        if (o.wrecked || o.hidden || o.ghostT > 0) continue;
        if (o === p.owner && now - p.born < 2) continue;
        if ((p.cd.get(o) || 0) > now) continue;
        const dx = o.veh.pos.x - p.pos.x, dz = o.veh.pos.z - p.pos.z, dy = o.veh.pos.y - p.pos.y, r = o.veh.T.half.x + 1.1;
        if (dx * dx + dz * dz > r * r || Math.abs(dy) > 3) continue;
        p.cd.set(o, now + 1.5);
        const v = o.veh, av = v.body.angvel(), lv = v.body.linvel(), m = v.T.mass;
        v.body.setAngvel({ x: av.x, y: av.y + (Math.random() < 0.5 ? -1 : 1) * (3.5 + Math.random() * 2), z: av.z }, true);
        v.applyJ(-lv.x * m * 0.18, 0, -lv.z * m * 0.18, v.pos.x, v.pos.y, v.pos.z);
        v.spinT = Math.max(v.spinT, 1.0); v.slip(0.8, 0.3);
        // båren flyger iväg (med patienten)
        p.vel.set(lv.x * 0.7 + (Math.random() - 0.5) * 8, 5 + Math.random() * 3, lv.z * 0.7 + (Math.random() - 0.5) * 8);
        if (o !== p.owner) { this.hurt(o, p.owner, 3); g.notify(p.owner, `🚑 ${o.name} körde på en patient!`, 'good'); }
        g.notify(o, '🚑 Akta patienten! Du snurrar', 'bad');
        this.bananaFx(p.pos);
      }
      return;
    }
    if (p.type === PT.BANAN) {
      for (const o of g.cars) {
        if (o.wrecked || o.hidden || o.ghostT > 0 || o.veh.grounded === 0) continue;
        if (o === p.owner && now - p.born < 1.5) continue;
        const dx = o.veh.pos.x - p.pos.x, dz = o.veh.pos.z - p.pos.z, dy = o.veh.pos.y - p.pos.y, r = o.veh.T.half.x + 0.8;
        if (dx * dx + dz * dz > r * r || Math.abs(dy) > 2.5) continue;
        const v = o.veh, av = v.body.angvel();
        v.body.setAngvel({ x: av.x, y: av.y + (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 2), z: av.z }, true);
        v.spinT = Math.max(v.spinT, 1.6); v.slip(1.2, 0.15);
        if (o !== p.owner) {
          this.hurt(o, p.owner, 3);
          g.notify(p.owner, `🍌 ${o.name} halkade på ditt bananskal!`, 'good');
        }
        g.notify(o, '🍌 Bananskal! Du snurrar!', 'bad');
        this.bananaFx(p.pos);
        g.emit({ t: 'wbn', p: [+p.pos.x.toFixed(2), +p.pos.y.toFixed(2), +p.pos.z.toFixed(2)] });
        p.dead = true; return;
      }
      return;
    }
    if (p.type === PT.GRANAT) {
      p.vel.y -= 5 * dt;
      const sp = p.vel.length(), dir = _d.copy(p.vel).divideScalar(sp || 1), step = sp * dt;
      let hitCar = null, ht = step + 0.4;
      for (const o of g.cars) {
        if (o === p.owner || o.wrecked || o.hidden || o.ghostT > 0) continue;
        const t = rayBox(p.pos, dir, o, 0.3);
        if (t >= 0 && t < ht) { ht = t; hitCar = o; }
      }
      const tw = this.rayWorld(p.pos, dir, Math.min(ht, step + 0.4));
      if (hitCar || tw >= 0) {
        const wall = tw >= 0 && (!hitCar || tw < ht);
        p.pos.addScaledVector(dir, wall ? tw : ht);
        this.explode(p.pos, p.owner, wall ? null : hitCar, 6.5, 19, 26);
        p.dead = true; return;
      }
      p.pos.addScaledVector(p.vel, dt);
      if (now - p.born > p.life - dt) { this.explode(p.pos, p.owner, null, 6.5, 16, 0); p.dead = true; }
      return;
    }
    if (p.type === PT.RAKET) {
      // målsökande: svänger mot närmaste bil framför
      const sp = p.vel.length(), dir = _d.copy(p.vel).divideScalar(sp || 1);
      const tg = this.target(p.owner, 0.82, 140, 2, p.pos, dir);
      if (tg) {
        _a.copy(tg.veh.pos).addScaledVector(tg.veh.up, tg.veh.T.colY).addScaledVector(tg.veh.vel, 0.08).sub(p.pos).normalize();
        const ang = Math.acos(clamp(dir.dot(_a), -1, 1)), turn = Math.min(1, 1.8 * dt / Math.max(1e-3, ang));
        dir.lerp(_a, turn).normalize();
        p.vel.copy(dir).multiplyScalar(sp);
      }
      const step = p.vel.length() * dt;
      let hitCar = null, ht = step + 0.4;
      for (const o of g.cars) {
        if (o === p.owner || o.wrecked || o.hidden || o.ghostT > 0) continue;
        const t = rayBox(p.pos, dir, o, 0.35);
        if (t >= 0 && t < ht) { ht = t; hitCar = o; }
      }
      const tw = this.rayWorld(p.pos, dir, Math.min(ht, step + 0.4));
      if (hitCar || tw >= 0) {
        p.pos.addScaledVector(dir, tw >= 0 && (!hitCar || tw < ht) ? tw : ht);
        this.explode(p.pos, p.owner, hitCar && !(tw >= 0 && tw < ht) ? hitCar : null, 7, 14, 18);
        p.dead = true; return;
      }
      p.pos.addScaledVector(p.vel, dt);
      if (now - p.born > p.life - dt) this.explode(p.pos, p.owner, null, 7, 14, 0);
      return;
    }
    if (p.type === PT.KROK) {
      const tg = p.target;
      if (p.attached) {
        const A = p.owner;
        if (!tg || tg.wrecked || tg.hidden || A.wrecked || now > p.until) { p.dead = true; return; }
        p.pos.copy(tg.veh.pos);
        _a.copy(tg.veh.pos).sub(A.veh.pos); const d = _a.length(); _a.divideScalar(d || 1);
        if (d > 110) { p.dead = true; return; }
        // repet drar: skytten framåt mot målet, målet bakåt mot skytten
        const acc = clamp((d - 4) * 2.4, 0, 36);
        const ma = A.veh.T.mass, mb = tg.veh.T.mass;
        A.veh.applyJ(_a.x * ma * acc * dt, 0, _a.z * ma * acc * dt, A.veh.pos.x, A.veh.pos.y, A.veh.pos.z);
        const kb = acc * 0.55 * Math.min(1.5, ma / mb);
        tg.veh.applyJ(-_a.x * mb * kb * dt, 0, -_a.z * mb * kb * dt, tg.veh.pos.x, tg.veh.pos.y, tg.veh.pos.z);
        tg.lastHitBy = A; tg.lastHitT = g.time;
        return;
      }
      if (tg && !tg.wrecked && !tg.hidden) {
        _a.copy(tg.veh.pos).sub(p.pos);
        const d = _a.length();
        if (d < 2.6) {
          p.attached = true; p.until = now + 2.6; p.life = 99;
          this.hurt(tg, p.owner, 4);
          g.notify(p.owner, `🪝 Harpunen sitter i ${tg.name} — du dras fram!`, 'good');
          g.notify(tg, `🪝 ${p.owner.name} harpunerade dig!`, 'bad');
          if (p.owner === g.me || tg === g.me) g.audio?.bump?.(0.8);
          return;
        }
        p.vel.copy(_a.normalize()).multiplyScalar(Math.max(200, p.vel.length()));
      }
      p.pos.addScaledVector(p.vel, dt);
      return;
    }
    // minor och olja ligger på marken
    if (p.type === PT.MINA) {
      p.a = now - p.born > 0.7 ? 1 : 0;                   // armerad?
      if (!p.a) return;
      for (const o of g.cars) {
        if (o.wrecked || o.hidden || o.ghostT > 0) continue;
        if (o === p.owner && now - p.born < 2) continue;
        const dx = o.veh.pos.x - p.pos.x, dz = o.veh.pos.z - p.pos.z, dy = o.veh.pos.y - p.pos.y;
        const r = o.veh.T.half.x + 1.3;
        if (dx * dx + dz * dz < r * r && Math.abs(dy) < 2.5) {
          this.explode(p.pos, p.owner, o, 4.5, 10, 16, true);
          p.dead = true; return;
        }
      }
      return;
    }
    if (p.type === PT.OLJA) {
      for (const o of g.cars) {
        if (o.wrecked || o.hidden || o.veh.grounded === 0) continue;
        const dx = o.veh.pos.x - p.pos.x, dz = o.veh.pos.z - p.pos.z, dy = o.veh.pos.y - p.pos.y;
        if (dx * dx + dz * dz > p.r * p.r || Math.abs(dy) > 2.5) continue;
        const v = o.veh;
        v.slip(0.12, 0.12);                                // (pressF nollställs varje steg — halkan bär över till nästa)
        v.spinT = Math.max(v.spinT, 0.6);
        if (!(o.oilT > now)) {
          o.oilT = now + 1.2;
          const av = v.body?.angvel?.();
          if (av) v.body.setAngvel({ x: av.x, y: av.y + (Math.random() < 0.5 ? -1 : 1) * (1.6 + Math.random()), z: av.z }, true);
          if (o !== p.owner) { o.lastHitBy = p.owner; o.lastHitT = g.time; }
          g.notify(o, '🛢️ Olja! Du tappar greppet!', 'bad');
          if (o !== p.owner && (!p.owner.oilMsgT || g.time - p.owner.oilMsgT > 3)) { p.owner.oilMsgT = g.time; g.notify(p.owner, `🛢️ ${o.name} körde i din olja!`, 'good'); }
        }
      }
    }
  }

  // explosion: träffad bil tar full skada, alla inom radien knuffas och skadas efter avståndet
  explode(pos, owner, direct, radius, push, dmg, lift = false) {
    const g = this.g;
    if (direct && dmg) {
      this.hurt(direct, owner, dmg);
      if (lift) {
        const v = direct.veh, m = v.T.mass;
        v.applyJ(rnd(m * 2), m * 9, rnd(m * 2), v.pos.x + rnd(1), v.pos.y, v.pos.z + rnd(1));
        v.spinT = Math.max(v.spinT, 1.2);
      }
      if (owner && owner !== direct) { g.notify(owner, `💥 Träff på ${direct.name}!`, 'good'); g.notify(direct, `💥 ${owner.name} träffade dig!`, 'bad'); }
    }
    for (const o of g.cars) {
      if (o.wrecked || o.hidden || o.ghostT > 0) continue;
      _a.copy(o.veh.pos).sub(pos);
      const d = _a.length();
      if (d > radius) continue;
      const k = 1 - d / radius, m = o.veh.T.mass;
      _a.divideScalar(d || 1);
      o.veh.applyJ?.(_a.x * m * push * k, m * push * 0.45 * k, _a.z * m * push * k, o.veh.pos.x, o.veh.pos.y, o.veh.pos.z);
      o.veh.spinT = Math.max(o.veh.spinT || 0, 0.6 * k);
      if (o !== direct && dmg) this.hurt(o, owner, dmg * 0.4 * k);
    }
    this.boomFx(pos, radius > 5 ? 1 : 0.7);
    g.emit({ t: 'wx', p: [+pos.x.toFixed(2), +pos.y.toFixed(2), +pos.z.toFixed(2)], k: radius > 5 ? 1 : 0.7 });
  }
  boomFx(pos, k) {
    const g = this.g;
    g.fx.explosion(pos, _b.set(0, 0, 0));
    const near = g.me ? Math.max(0, 1 - g.me.veh.pos.distanceTo(pos) / 160) : 0.6;
    g.audio?.blast?.(near * k);
  }

  // chockvåg runt bilen (vapnet; bigfootens landning använder den med egna mått)
  shock(c, R = 15, push = 16, up = 4, dmg = 7, msg = `💥 ${c.name}s chockvåg!`) {
    const g = this.g, pos = c.veh.pos;
    for (const o of g.cars) {
      if (o === c || o.wrecked || o.hidden || o.ghostT > 0) continue;
      _a.copy(o.veh.pos).sub(pos);
      const d = _a.length();
      if (d > R) continue;
      const k = 1 - d / R, m = o.veh.T.mass;
      _a.y = 0; _a.normalize();
      o.veh.applyJ(_a.x * m * push * k, m * up * k, _a.z * m * push * k, o.veh.pos.x, o.veh.pos.y, o.veh.pos.z);
      o.veh.spinT = Math.max(o.veh.spinT, 0.8);
      this.hurt(o, c, dmg * k);
      if (k > 0.3) g.notify(o, msg, 'bad');
    }
    this.ringFx(pos);
    g.emit({ t: 'wsh', p: [+pos.x.toFixed(2), +pos.y.toFixed(2), +pos.z.toFixed(2)] });
  }
  ringFx(pos) {
    const g = this.g;
    const m = new THREE.Mesh(new THREE.TorusGeometry(1, 0.18, 8, 40).rotateX(Math.PI / 2), this.M.ring.clone());
    m.position.copy(pos); this.grp.add(m);
    this.rings.push({ m, t: 0 });
    g.fx.sparks(pos, _b.set(0, 0, 0), 30, 18);
    const near = g.me ? Math.max(0, 1 - g.me.veh.pos.distanceTo(pos) / 150) : 0.6;
    g.audio?.shockwave?.(near);
  }

  // ---------- grafik (båda sidor) ----------
  tracer(o, d, dist, big, hit) {
    let t = this.tracers.find(x => !x.on);
    if (!t) {
      if (this.tracers.length > 220) return;
      t = { m: new THREE.Mesh(this.M.tracerGeo, this.M.mg), o: new THREE.Vector3(), d: new THREE.Vector3() };
      t.m.renderOrder = 4; this.grp.add(t.m); this.tracers.push(t);
    }
    t.on = true; t.m.visible = true; t.o.copy(o); t.d.copy(d); t.dist = dist; t.go = 0; t.big = big; t.hit = hit;
    t.m.material = big ? this.M.can : this.M.mg;
    t.m.scale.set(big ? 1.8 : 1, big ? 1.8 : 1, 1);
    t.m.quaternion.setFromUnitVectors(_z, d);                      // geometrin ligger bakom spetsen (lokalt −z)
  }

  // gästen: vapen och skott ur ögonblicksbilden, projektilerna ur listan
  frame(dt) {
    const g = this.g, now = g.time;
    // lådorna snurrar och guppar; tagna lådor krymper bort
    for (const b of this.boxes) {
      const on = (g.mode === 'client' ? b.cliUntil || 0 : b.until) <= (g.mode === 'client' ? now : g.simT);
      const s = b.mesh.scale.x + ((on ? 1 : 0.001) - b.mesh.scale.x) * Math.min(1, dt * 8);
      b.mesh.scale.setScalar(s); b.mesh.visible = s > 0.02;
      b.mesh.rotation.y += dt * 1.6; b.mesh.position.y = b.pos.y + Math.sin(now * 2.4 + b.ph) * 0.18;
    }
    // gästen ritar andras skott själv efter flaggan (skadan räknas hos värden)
    if (g.mode === 'client') {
      for (const c of g.cars) {
        const id = c.wcode > 0 ? WIDS[c.wcode - 1] : null;
        if (!c.firing || !id || !WEAPONS[id].gun || c.hidden) { c.cliAcc = 0; continue; }
        c.cliAcc = (c.cliAcc || 0) + dt * WEAPONS[id].rate;
        while (c.cliAcc >= 1) {
          c.cliAcc -= 1;
          const W = WEAPONS[id], o = this.muzzle(c, _o), tg = this.target(c, 0.975, 170, 2);
          if (tg) _d.copy(tg.veh.pos).addScaledVector(tg.veh.up, tg.veh.T.colY).sub(o).normalize();
          else _d.copy(c.veh.fwd).addScaledVector(c.veh.up, -0.02).normalize();
          const d = _d;
          d.x += rnd(W.spread); d.y += rnd(W.spread) * 0.5; d.z += rnd(W.spread); d.normalize();
          let bt = 170, hit = false;
          for (const o2 of g.cars) { if (o2 === c || o2.hidden) continue; const t = rayBox(o, d, o2); if (t >= 0 && t < bt) { bt = t; hit = true; } }
          const tw = this.rayWorld(o, d, bt);
          if (tw >= 0 && tw < bt) bt = tw;
          this.tracer(o, d, bt, id === 'kanon', hit || tw >= 0);
          this.gunSound(c, id);
        }
      }
    }
    // spårljusen
    for (const t of this.tracers) {
      if (!t.on) continue;
      const len = t.big ? 11 : 8;
      t.go += dt * 620;
      const head = Math.min(t.go, t.dist), tail = Math.max(0, head - len);
      t.m.position.copy(t.o).addScaledVector(t.d, head);
      t.m.scale.z = Math.max(0.1, head - tail);
      if (t.go >= t.dist) {
        t.on = false; t.m.visible = false;
        if (t.hit) {
          _a.copy(t.o).addScaledVector(t.d, t.dist);
          if (t.big) g.fx.tackle(_a, _b.set(0, 0, 0), _h.copy(t.d).negate(), 0.5);
          else g.fx.sparks(_a, _b.set(0, 0, 0), 4, 5);
        }
      }
    }
    // chockvågens ring
    for (const r of this.rings) { r.t += dt; const s = 1 + r.t * 30; r.m.scale.set(s, 1 + r.t * 6, s); r.m.material.opacity = Math.max(0, 0.7 - r.t * 1.4); }
    for (const r of this.rings.filter(r => r.t > 0.5)) { this.grp.remove(r.m); r.m.geometry.dispose(); r.m.material.dispose(); }
    this.rings = this.rings.filter(r => r.t <= 0.5);
    // projektilerna
    const list = g.mode === 'client' ? this.cliProj(now) : this.proj.map(p => ({ id: p.id, type: p.type, x: p.pos.x, y: p.pos.y, z: p.pos.z, vx: p.vel.x, vy: p.vel.y, vz: p.vel.z, a: p.a, b: p.b, owner: p.owner, attached: p.attached }));
    const seen = new Set();
    for (const p of list) {
      seen.add(p.id);
      let v = this.pview.get(p.id);
      if (!v) { v = this.makeProj(p); this.pview.set(p.id, v); this.grp.add(v.obj); }
      this.drawProj(v, p, dt, now);
    }
    for (const [id, v] of this.pview) if (!seen.has(id)) { this.grp.remove(v.obj); v.dispose?.(); this.pview.delete(id); }
    // vapnet syns på taket (kulspruta/kanon) och mynningsflamman när det skjuts
    for (const c of g.cars) this.gunMesh(c);
  }

  cliProj(now) {
    const P = this.g.net?.proj;
    if (!P) return [];
    const age = Math.min(0.25, (performance.now() - P.at) / 1000);
    return P.list.map(p => ({ ...p, x: p.x + p.vx * age, y: p.y + p.vy * age, z: p.z + p.vz * age }));
  }

  makeProj(p) {
    const M = this.M, obj = new THREE.Group();
    const v = { obj, type: p.type };
    if (p.type === PT.RAKET) {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.9, 10).rotateX(Math.PI / 2), M.rocketBody);
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.28, 10).rotateX(-Math.PI / 2), M.red); nose.position.z = -0.58;
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.7, 10, 1, true).rotateX(Math.PI / 2), M.fireM); flame.position.z = 0.8;
      obj.add(body, nose, flame);
      for (let k = 0; k < 4; k++) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.18, 0.2), M.red); f.position.set(Math.cos(k * Math.PI / 2) * 0.1, Math.sin(k * Math.PI / 2) * 0.1, 0.36); f.rotation.z = k * Math.PI / 2; obj.add(f); }
      v.flame = flame;
    } else if (p.type === PT.MINA) {
      obj.add(new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.14, 16), M.mine));
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), M.mineLight); l.position.y = 0.1; obj.add(l); v.light = l;
      for (let k = 0; k < 6; k++) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 6), M.steel); s.position.set(Math.cos(k) * 0.28, 0.1, Math.sin(k) * 0.28); obj.add(s); }
    } else if (p.type === PT.OLJA) {
      const r = p.a || 3.4;
      const blob = new THREE.Mesh(new THREE.CircleGeometry(r, 28).rotateX(-Math.PI / 2), M.oil);
      blob.scale.set(1, 1, 0.75 + Math.random() * 0.3);
      const sheen = new THREE.Mesh(new THREE.CircleGeometry(r * 0.55, 20).rotateX(-Math.PI / 2), M.oilSheen); sheen.position.set(r * 0.2, 0.01, -r * 0.1);
      const sheen2 = new THREE.Mesh(new THREE.CircleGeometry(r * 0.35, 18).rotateX(-Math.PI / 2), M.oilSheen2); sheen2.position.set(-r * 0.3, 0.012, r * 0.25);
      const rim = new THREE.Mesh(new THREE.RingGeometry(r * 0.94, r * 1.04, 32).rotateX(-Math.PI / 2), M.oilRim); rim.scale.copy(blob.scale);
      obj.add(blob, sheen, sheen2, rim); obj.rotation.y = Math.random() * 6;
    } else if (p.type === PT.GLASS) {
      M.gl ||= { waf: new THREE.MeshStandardMaterial({ color: 0xd9a05b, roughness: 0.8 }), pink: new THREE.MeshStandardMaterial({ color: 0xff9ec7, roughness: 0.6 }),
        choc: new THREE.MeshStandardMaterial({ color: 0x7a4a2b, roughness: 0.6 }), cone: new THREE.ConeGeometry(0.22, 0.6, 10).rotateX(Math.PI).translate(0, -0.3, 0), ball: new THREE.SphereGeometry(0.26, 12, 10) };
      const ball2 = new THREE.Mesh(M.gl.ball, M.gl.choc); ball2.position.y = 0.34; ball2.scale.setScalar(0.85);
      const ball1 = new THREE.Mesh(M.gl.ball, M.gl.pink); ball1.position.y = 0.06;
      obj.add(new THREE.Mesh(M.gl.cone, M.gl.waf), ball1, ball2);
      obj.scale.setScalar(1.4);
    } else if (p.type === PT.V2) {
      // V2-raketen: svartvit, fenor, stor låga
      if (!M.v2) {
        const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
        for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) { x.fillStyle = (i + j) % 2 ? '#141416' : '#f2f2ee'; x.fillRect(i * 32, j * 64, 32, 64); }
        const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
        M.v2 = { m: new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 }), body: new THREE.CylinderGeometry(0.42, 0.42, 3.8, 18).rotateX(Math.PI / 2),
          nose: new THREE.ConeGeometry(0.42, 1.4, 18).rotateX(-Math.PI / 2).translate(0, 0, -2.6), fin: new THREE.BoxGeometry(0.05, 0.85, 0.95),
          flame: new THREE.ConeGeometry(0.4, 3, 12, 1, true).rotateX(Math.PI / 2).translate(0, 0, 3.4) };
      }
      obj.add(new THREE.Mesh(M.v2.body, M.v2.m), new THREE.Mesh(M.v2.nose, M.v2.m));
      for (let k = 0; k < 4; k++) { const f = new THREE.Mesh(M.v2.fin, k % 2 ? M.mine : M.rocketBody); f.position.set(Math.sin(k * Math.PI / 2) * 0.55, Math.cos(k * Math.PI / 2) * 0.55, 1.6); f.rotation.z = -k * Math.PI / 2; obj.add(f); }
      const fl = new THREE.Mesh(M.v2.flame, M.fireM); fl.renderOrder = 4; obj.add(fl); v.flame = fl;
    } else if (p.type === PT.BAR) {
      // rullbår: madrass på en ram med fyra hjul, patienten sitter upp och viftar
      M.bar ||= { frame: new THREE.BoxGeometry(0.75, 0.06, 2.0), mat: new THREE.BoxGeometry(0.7, 0.14, 1.9), leg: new THREE.CylinderGeometry(0.025, 0.025, 0.6, 6), wheel: new THREE.CylinderGeometry(0.08, 0.08, 0.05, 10).rotateZ(Math.PI / 2),
        head: new THREE.SphereGeometry(0.15, 12, 10), body: new THREE.CapsuleGeometry(0.16, 0.35, 4, 10), arm: new THREE.CapsuleGeometry(0.05, 0.4, 4, 8),
        white: new THREE.MeshStandardMaterial({ color: 0xf4f6f8, roughness: 0.6 }), blanket: new THREE.MeshStandardMaterial({ color: 0x7fc4ff, roughness: 0.7 }),
        gown: new THREE.MeshStandardMaterial({ color: 0xa8e0d0, roughness: 0.7 }), skin: new THREE.MeshStandardMaterial({ color: 0xf1c7a5, roughness: 0.6 }) };
      const B = M.bar, add = (geo, mat, x, y, z) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = true; obj.add(o); return o; };
      add(B.frame, M.steel, 0, 0.62, 0); add(B.mat, B.white, 0, 0.72, 0);
      add(B.mat, B.blanket, 0, 0.78, 0.35).scale.set(1.02, 0.8, 0.6);
      for (const x of [-0.3, 0.3]) for (const z of [-0.85, 0.85]) { add(B.leg, M.steel, x, 0.32, z); add(B.wheel, M.mine, x, 0.08, z); }
      const torso = add(B.body, B.gown, 0, 1.05, -0.55); torso.rotation.x = -0.25;
      add(B.head, B.skin, 0, 1.45, -0.62);
      v.arms = [-1, 1].map(s => { const a = add(B.arm, B.gown, s * 0.25, 1.25, -0.55); a.rotation.z = s * 2.4; return a; });
      obj.rotation.y = p.a || 0;
    } else if (p.type === PT.SPIK) {
      M.spik ||= { base: new THREE.BoxGeometry(5.6, 0.06, 0.5), spike: new THREE.ConeGeometry(0.05, 0.2, 5) };
      obj.add(new THREE.Mesh(M.spik.base, M.mine));
      for (let i = 0; i < 18; i++) for (const z of [-0.14, 0.14]) { const s = new THREE.Mesh(M.spik.spike, M.steel); s.position.set(-2.6 + i * 0.306 + (z > 0 ? 0.15 : 0), 0.13, z); obj.add(s); }
      obj.rotation.y = p.a || 0;
    } else if (p.type === PT.BANAN) {
      M.ban ||= { peel: new THREE.MeshStandardMaterial({ color: 0xffd93a, roughness: 0.5, emissive: 0x3a2a00 }), tip: new THREE.MeshStandardMaterial({ color: 0x5a3a1a, roughness: 0.7 }),
        geo: new THREE.SphereGeometry(1, 10, 8), stem: new THREE.CylinderGeometry(0.035, 0.05, 0.16, 6) };
      for (let k = 0; k < 4; k++) {
        const a = k / 4 * Math.PI * 2, leaf = new THREE.Mesh(M.ban.geo, M.ban.peel);
        leaf.scale.set(0.09, 0.045, 0.3); leaf.position.set(Math.cos(a) * 0.26, 0.05, Math.sin(a) * 0.26); leaf.rotation.y = Math.PI / 2 - a;
        obj.add(leaf);
      }
      const top = new THREE.Mesh(M.ban.geo, M.ban.peel); top.scale.set(0.12, 0.13, 0.12); top.position.y = 0.12; obj.add(top);
      const stem = new THREE.Mesh(M.ban.stem, M.ban.tip); stem.position.y = 0.3; obj.add(stem);
      obj.scale.setScalar(1.7); obj.rotation.y = p.a || 0;
    } else if (p.type === PT.GRANAT) {
      M.shell ||= [new THREE.CylinderGeometry(0.11, 0.11, 0.55, 10).rotateX(Math.PI / 2), new THREE.ConeGeometry(0.11, 0.26, 10).rotateX(-Math.PI / 2).translate(0, 0, -0.4),
        new THREE.CylinderGeometry(0.05, 0.17, 2.6, 8, 1, true).rotateX(Math.PI / 2).translate(0, 0, 1.55)];
      obj.add(new THREE.Mesh(M.shell[0], M.gunDark), new THREE.Mesh(M.shell[1], M.steel));
      const tr = new THREE.Mesh(M.shell[2], M.can); tr.renderOrder = 4; obj.add(tr);
    } else if (p.type === PT.KROK) {
      obj.add(new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.45, 8).rotateX(-Math.PI / 2), M.steel));
      v.cable = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 6), M.cable);
      this.grp.add(v.cable);
      v.dispose = () => { this.grp.remove(v.cable); };
    }
    return v;
  }
  drawProj(v, p, dt, now) {
    const g = this.g;
    v.obj.position.set(p.x, p.y, p.z);
    if (v.type === PT.GRANAT && Math.random() < 0.5) g.fx.smoke(_a.set(p.x, p.y, p.z), _b.set(0, 0, 0), false, 0.4);
    if (v.type === PT.V2) { v.flame.scale.set(1, 1, 0.7 + Math.random() * 0.6); g.fx.smoke(_a.set(p.x, p.y, p.z), _b.set(0, 0, 0), false, 1.4); g.fx.fire(_a.set(p.x, p.y, p.z), _b.set(p.vx * 0.2, 0, p.vz * 0.2), 0.8); }
    if (v.type === PT.RAKET || v.type === PT.KROK || v.type === PT.GRANAT || v.type === PT.V2) {
      const sp = Math.hypot(p.vx, p.vy, p.vz);
      if (sp > 1) v.obj.quaternion.setFromUnitVectors(_a.set(0, 0, -1), _b.set(p.vx / sp, p.vy / sp, p.vz / sp));
    }
    if (v.type === PT.RAKET) {
      v.flame.scale.set(1, 1, 0.7 + Math.random() * 0.6);
      if (Math.random() < 0.8) g.fx.smoke(_a.set(p.x, p.y, p.z), _b.set(0, 0, 0), false, 0.45);
      g.fx.fire(_a.set(p.x, p.y, p.z), _b.set(p.vx * 0.2, 0, p.vz * 0.2), 0.4);
    }
    if (v.type === PT.MINA) v.light.visible = p.a ? Math.floor(now * 4) % 2 === 0 : true;
    if (v.type === PT.GLASS) { v.obj.rotation.x += dt * 9; v.obj.rotation.z += dt * 4; }
    if (v.type === PT.BAR) { v.obj.rotation.y = p.a || 0; v.arms.forEach((a, i) => { a.rotation.z = (i ? 1 : -1) * (2.2 + Math.sin(now * 9 + i * 2) * 0.6); }); }
    if (v.type === PT.KROK) {
      // repet från skyttens mynning till kroken
      const A = p.owner || g.carById(p.a);
      if (A && !A.hidden) {
        this.muzzle(A, _a); _b.set(p.x, p.y, p.z);
        const d = _h.copy(_b).sub(_a), len = d.length();
        v.cable.visible = len > 0.3;
        v.cable.position.copy(_a).addScaledVector(d, 0.5);
        v.cable.scale.set(1, len, 1);
        v.cable.quaternion.setFromUnitVectors(_up, d.normalize());
      } else v.cable.visible = false;
    }
  }

  // kulspruta/kanon på taket när man har den — byggs om om bilens utseende byts
  gunMesh(c) {
    const id = this.g.mode === 'client' ? (c.wcode > 0 ? WIDS[c.wcode - 1] : null) : c.weapon?.id;
    const want = id && WEAPONS[id].gun && !c.hidden ? id : null;
    if (c.gun && (c.gun.id !== want || c.gun.parent !== c.view.group)) { c.gun.parent?.remove(c.gun.obj); c.gun = null; }
    if (!want) return;
    if (!c.gun) {
      const M = this.M, T = c.veh.T, obj = new THREE.Group(), big = want === 'kanon';
      obj.add(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.2, 0.6), M.gunDark));
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(big ? 0.07 : 0.045, big ? 0.07 : 0.045, big ? 1.4 : 1.1, 10).rotateX(Math.PI / 2), M.steel);
      barrel.position.z = big ? -0.85 : -0.7; obj.add(barrel);
      if (big) { const brake = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.2, 10).rotateX(Math.PI / 2), M.gunDark); brake.position.z = -1.55; obj.add(brake); }
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.25), M.gunDark); box.position.set(0.22, -0.02, 0.05); obj.add(box);
      const flash = new THREE.Mesh(new THREE.ConeGeometry(big ? 0.22 : 0.15, big ? 0.7 : 0.5, 8, 1, true).rotateX(-Math.PI / 2), M.flash);
      flash.position.z = big ? -1.95 : -1.5; obj.add(flash);
      obj.position.set(0, T.colY + T.half.y + 0.16, -T.half.z * 0.05);
      c.view.group.add(obj);
      c.gun = { id: want, obj, flash, parent: c.view.group };
    }
    c.gun.flash.visible = !!c.firing && Math.random() < 0.7;
    if (c.gun.flash.visible) c.gun.flash.scale.setScalar(0.7 + Math.random() * 0.6);
  }

  // ---------- nätet ----------
  // värden: projektilerna sist i ögonblicksbilden
  pack() {
    const out = new Float32Array(1 + this.proj.length * PROW);
    out[0] = this.proj.length;
    this.proj.forEach((p, k) => {
      const o = 1 + k * PROW;
      out.set([p.id, p.type, p.pos.x, p.pos.y, p.pos.z, p.vel.x, p.vel.y, p.vel.z, p.a, p.attached ? p.target?.id || 0 : p.b], o);
      if (p.type === PT.KROK) out[o + 8] = p.owner.id;
    });
    return out;
  }
  static unpack(a, start) {
    const n = a[start] | 0, list = [];
    for (let k = 0; k < n; k++) {
      const o = start + 1 + k * PROW;
      list.push({ id: a[o], type: a[o + 1], x: a[o + 2], y: a[o + 3], z: a[o + 4], vx: a[o + 5], vy: a[o + 6], vz: a[o + 7], a: a[o + 8], b: a[o + 9] });
    }
    return list;
  }
  // gästen: händelser från värden
  onEvent(d) {
    const g = this.g;
    if (d.t === 'wb') { const b = this.boxes[d.i]; if (b) b.cliUntil = g.time + d.u; }
    else if (d.t === 'wx') this.boomFx(_o.set(d.p[0], d.p[1], d.p[2]), d.k || 1);
    else if (d.t === 'wsh') this.ringFx(_o.set(d.p[0], d.p[1], d.p[2]));
    else if (d.t === 'wgl') this.glassFx(_o.set(d.p[0], d.p[1], d.p[2]));
    else if (d.t === 'wbn') this.bananaFx(_o.set(d.p[0], d.p[1], d.p[2]));
    else if (d.t === 'wv2') this.v2Fx(_o.set(d.p[0], d.p[1], d.p[2]));
    else if (d.t === 'wsk') g.fx.tackle(_o.set(d.p[0], d.p[1], d.p[2]), _b.set(0, 0, 0), _h.set(d.d[0], 0, d.d[1]), 1.4);
  }
  // kod för ögonblicksbilden: 0 inget, -1 ruletten, annars index+1
  static code(c) { return c.rollT > 0 ? -1 : c.weapon ? WIDS.indexOf(c.weapon.id) + 1 : 0; }
}
