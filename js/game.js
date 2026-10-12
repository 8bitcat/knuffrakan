// Spelet: fysikvärlden, bilarna, racet, effekterna och renderingen.
import * as THREE from 'three';
import { CONF, BOT_NAMES } from './config.js?v=1';
import { buildTrack } from './track.js?v=1';
import { buildWorld } from './world.js?v=1';
import { createScene, ChaseCam } from './scene.js?v=1';
import { CarView, SHAPES, MODEL_Y } from './carmodel.js?v=1';
import { makeLivery, randomSpec } from './livery.js?v=1';
import { Vehicle, CP } from './vehicle.js?v=1';
import { BotBrain } from './ai.js?v=1';
import { Race } from './race.js?v=1';
import { FX, Trails } from './fx.js?v=1';
import { NameTag, SpeedPlate } from './tags.js?v=1';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _f = {};
const ord = (n) => n + ':' + (n === 1 || n === 2 ? 'a' : 'e');

export class Game {
  constructor(RAPIER, canvas, { hud, audio, input }) {
    this.RAPIER = RAPIER;
    this.hud = hud; this.audio = audio; this.input = input;
    const S = createScene(canvas);
    Object.assign(this, { renderer: S.renderer, scene: S.scene, camera: S.camera, sceneApi: S });
    this.cam = new ChaseCam(this.camera);
    this.track = buildTrack();
    this.world = new RAPIER.World({ x: 0, y: -CONF.GRAV, z: 0 });
    this.world.timestep = CONF.DT;
    this.world3d = buildWorld({ scene: this.scene, track: this.track, RAPIER, world: this.world });
    this.fx = new FX(this.scene);
    this.trails = new Trails(this.scene, { color: 0x5b8cff, width: 0.11, life: 7, alpha: 0.85, step: 3, maxPts: 240 });
    this.skids = new Trails(this.scene, { color: 0x140f18, width: 0.15, life: 22, alpha: 0.55, step: 1.2, maxPts: 160 });
    this.plate = new SpeedPlate(this.scene);
    this.cars = [];
    this.me = null;
    this.race = new Race(this);
    this.acc = 0; this.time = 0; this.simT = 0;
    this.nextId = 1;
    this.dirtyTex = new Set();
    this.orbit = 0;
  }

  addCar({ name, isPlayer, spec }) {
    const sh = SHAPES[spec.shape % SHAPES.length];
    const livery = makeLivery(spec, sh);
    const view = new CarView(sh, livery);
    this.scene.add(view.group);
    const f = this.track.sampleAt(0);
    const veh = new Vehicle(this, new THREE.Vector3(f.x, f.y + 3, f.z), this.track.quatAt(0));
    const id = this.nextId++;
    const car = {
      id, name, isPlayer, spec, view, veh,
      tag: new NameTag(this.scene, name, id * 7.3 + name.length, isPlayer),
      brain: isPlayer ? null : new BotBrain(mulberry(id * 97 + 3)),
      trk: { i: 0, s: 0, lat: 0, y: 0 }, lap: 0, prog: 0, prevS: 0, place: 0,
      finished: false, finishT: 0, finishPlace: 0,
      health: 100, wrecked: false, wreckT: 0, flipT: 0, offT: 0, ghostT: 0, hitCD: 0, comebackT: 0,
      p0: new THREE.Vector3(), p1: new THREE.Vector3(), q0: new THREE.Quaternion(), q1: new THREE.Quaternion(),
      emitAcc: 0, lastHitBy: null, raceStats: { kos: 0, hits: 0 },
    };
    this.cars.push(car);
    if (isPlayer) this.me = car;
    return car;
  }

  removeCar(car) {
    this.cars = this.cars.filter(c => c !== car);
    car.veh.destroy();
    this.scene.remove(car.view.group);
    car.view.dispose();
    car.tag.dispose(this.scene);
    this.trails.remove(car.id + 'L'); this.trails.remove(car.id + 'R');
  }

  setupBots(n) {
    const used = new Set();
    for (let k = 0; k < n; k++) {
      let name;
      do { name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)]; } while (used.has(name) && used.size < BOT_NAMES.length);
      used.add(name);
      this.addCar({ name, isPlayer: false, spec: randomSpec(1000 + k * 17 + Math.floor(Math.random() * 1e5), name) });
    }
  }

  // Ställ en bil på banan vid (s, lat)
  placeCar(car, s, lat, speed = 0, snap = true) {
    const T = this.track;
    const p = T.pointAt(s, lat, _v);
    const f = T.sampleAt(s, _f);
    p.x += f.ux * 0.62; p.y += f.uy * 0.62; p.z += f.uz * 0.62;
    car.veh.resetTo(p, T.quatAt(s, _q), speed);
    T.project(p.x, p.z, -1, car.trk); // prevS lämnas — varvräkningen ser hoppet över linjen
    if (snap) { car.p0.copy(car.veh.pos); car.p1.copy(car.veh.pos); car.q0.copy(car.veh.quat); car.q1.copy(car.veh.quat); }
    this.trails.feed(car.id + 'L', p, _v2.set(0, 1, 0), false, this.time);
    this.trails.feed(car.id + 'R', p, _v2, false, this.time);
  }

  // Återuppstå på banan bakom där man var, i en ledig fil
  respawn(car, back = 30, why = "?") {
    (this.respawnLog ||= []).push([Math.round(this.simT), car.name, why, Math.round(car.trk.s), Math.round(car.trk.lat)]);
    const T = this.track;
    const s = T.wrapS(car.trk.s - back);
    let best = 0, bestScore = -1;
    for (const lat of [-10, -5, 0, 5, 10, -12.5, 12.5]) {
      const p = T.pointAt(s, lat, _v2);
      let dmin = 1e9;
      for (const o of this.cars) if (o !== car) dmin = Math.min(dmin, o.veh.pos.distanceTo(p));
      if (dmin > bestScore) { bestScore = dmin; best = lat; }
    }
    const racing = this.race.phase === 'race' && !car.finished;
    const packV = racing ? Math.min(75, car.veh.vmax * 0.7) : 0;
    this.placeCar(car, s, best, packV);
    car.ghostT = 2.2; car.veh.setGhost(true);
    car.flipT = 0; car.offT = 0;
    if (racing) car.comebackT = 3;
  }

  wreck(car) {
    car.wrecked = true; car.wreckT = 2.4; car.veh.disabled = true;
    this.fx.explosion(car.veh.pos, car.veh.vel);
    const near = this.me ? Math.max(0, 1 - this.me.veh.pos.distanceTo(car.veh.pos) / 140) : 1;
    this.audio?.boom(car === this.me ? 1 : near);
    const by = car.lastHitBy && this.time - car.lastHitT < 4 ? car.lastHitBy : null;
    if (by) { by.raceStats.kos++; }
    if (car === this.me) this.hud?.toast(by ? `💥 ${by.name} knuffade ut dig!` : '💥 Du kraschade!', 'bad');
    else if (by === this.me) this.hud?.toast(`💥 Du knuffade ut ${car.name}!`, 'good');
    else if (by && near > 0.3) this.hud?.toast(`${by.name} knuffade ut ${car.name}`);
  }

  unwreck(car) {
    car.wrecked = false; car.veh.disabled = false; car.health = 100;
    car.view.resetDamage();
  }

  // ---------- Fast fysiksteg ----------
  step(dt) {
    this.simT += dt;
    const inp = this.input.state;
    for (const car of this.cars) {
      if (car.brain) car.brain.update(dt, car, this);
      else Object.assign(car.veh.input, inp);
      car.veh.preStep(dt);
    }
    this.world.step();
    for (const car of this.cars) {
      car.veh.postStep(dt);
      car.p0.copy(car.p1); car.q0.copy(car.q1);
      car.p1.copy(car.veh.pos); car.q1.copy(car.veh.quat);
      this.track.project(car.veh.pos.x, car.veh.pos.z, car.trk.i, car.trk);
    }
    this.handleImpacts();
    this.race.update(dt);
    for (const car of this.cars) this.carState(car, dt);
  }

  handleImpacts() {
    for (const car of this.cars) {
      const im = car.veh.impact;
      if (car.hitCD > 0 || !im || car.wrecked) continue;
      let other = null, od = 6.4;
      for (const o of this.cars) {
        if (o === car || o.ghostT > 0) continue;
        const d = car.veh.pos.distanceTo(o.veh.pos);
        if (d < od) { od = d; other = o; }
      }
      const vertical = Math.abs(im.dy) > im.horiz * 1.4;
      if (!other && vertical && im.dv < 15) continue; // landning
      if (car.ghostT > 0) continue;
      const inv = _q.copy(car.veh.quat).invert();
      const dl = _v.set(im.dx, im.dy * 0.4, im.dz).normalize().applyQuaternion(inv); // knuffens riktning, lokalt
      let dmg = Math.min(CONF.DMG_MAX, (im.dv - CONF.DV_MIN + 1.2) * CONF.DMG_SCALE) * (other ? CONF.DMG_CAR : CONF.DMG_WALL);
      if (Math.abs(dl.z) > 0.65) dmg *= other ? 0.4 : 0.6; // knuff fram/bak = bumpdrafting, tål mer
      car.health -= dmg;
      car.hitCD = 0.2;
      car.raceStats.hits++;
      // tackling från sidan → extra knuff, lyft och snurr
      if (other) {
        car.lastHitBy = other; car.lastHitT = this.time;
        const sideHit = Math.abs(dl.x) > 0.55;
        if (sideHit && im.dv > 8) {
          // små knuffar = sladd, stora smällar = snurr och volt
          const m = CP.mass, J = CONF.TACKLE_JUICE;
          const k = Math.min(1.2, (im.dv - 7) / 10) * J;
          const big = im.dv > 13;
          car.veh.body.applyImpulse({ x: im.dx * m * 0.3 * k, y: big ? m * Math.min(3.4, im.dv * 0.22) * k : m * 0.6 * k, z: im.dz * m * 0.3 * k }, true);
          const roll = big ? Math.sign(dl.x) * CP.inertia.z * (1.6 + Math.random() * 2.4) * k : 0;
          const yaw = (Math.random() - 0.5) * CP.inertia.y * 2.6 * k;
          const f = car.veh.fwd, u = car.veh.up;
          car.veh.body.applyTorqueImpulse({ x: -f.x * roll + u.x * yaw, y: -f.y * roll + u.y * yaw, z: -f.z * roll + u.z * yaw }, true);
          car.veh.spinT = 1.8;
          if (other === this.me && im.dv > 10) this.hud?.toast(`Tackling! ${car.name} snurrar`, 'good');
        }
      }
      // bucklor + repor där det smällde
      const cp = { x: -dl.x * 1.0, y: 0.15 + Math.max(-0.2, -dl.y) * 0.4, z: -dl.z * 2.45 };
      cp.x = Math.max(-0.98, Math.min(0.98, cp.x * 2.2));
      cp.z = Math.max(-2.45, Math.min(2.45, cp.z * 1.4));
      car.view.dent(cp.x, cp.y, cp.z, dl.x, dl.y, dl.z, dmg * 0.012);
      const [u, vv] = car.view.uvNear(cp.x, cp.y, cp.z);
      car.view.livery.scratch(u, vv, dmg);
      // gnistor i världen
      _v2.set(cp.x, cp.y, cp.z).applyQuaternion(car.veh.quat).add(car.veh.pos);
      this.fx.sparks(_v2, car.veh.vel, 6 + Math.floor(dmg / 3), 5);
      const near = this.me ? Math.max(0, 1 - this.me.veh.pos.distanceTo(car.veh.pos) / 90) : 1;
      if (car === this.me || (other === this.me)) this.audio?.crash(im.dv, 1);
      else if (near > 0.05) this.audio?.crash(im.dv, near * 0.6);
      if (car.health <= 0) this.wreck(car);
    }
  }

  carState(car, dt) {
    const v = car.veh, T = this.track;
    if (car.hitCD > 0) car.hitCD -= dt;
    if (car.comebackT > 0) car.comebackT -= dt;
    if (car.ghostT > 0) { car.ghostT -= dt; if (car.ghostT <= 0) v.setGhost(false); }
    if (car.wrecked) {
      car.wreckT -= dt;
      if (car.wreckT <= 0) { this.unwreck(car); this.respawn(car, 40, 'wreck'); }
      return;
    }
    // uppochner
    if (v.up.y < 0.3) car.flipT += dt; else car.flipT = 0;
    if (car.flipT > 2.4 && v.speed < 9) this.respawn(car, 10, 'flip');
    // utanför banan
    if (Math.abs(car.trk.lat) > T.halfW + 5 || v.pos.y < car.trk.y - 12) car.offT += dt; else car.offT = 0;
    if (car.offT > 3.2 || v.pos.y < car.trk.y - 40) this.respawn(car, 15, 'off');
    if (car.wantReset) { car.wantReset = false; this.respawn(car, 12, 'stuck'); }
  }

  // ---------- Rendering ----------
  frame(dt, alpha) {
    this.time += dt;
    const T = this.track;
    for (const car of this.cars) {
      const g = car.view.group;
      g.position.lerpVectors(car.p0, car.p1, alpha);
      g.quaternion.slerpQuaternions(car.q0, car.q1, alpha);
      const v = car.veh;
      v.wheels.forEach((w, k) => car.view.setWheel(k, (w.grounded ? w.dist : CP.rayLen) - 0.37, w.spin, w.front ? v.steer : 0));
      // spöke efter omstart: blinka
      g.visible = !(car.ghostT > 0 && Math.floor(this.time * 10) % 2 === 0);
      // namnskylt
      const line2 = this.race.phase === 'race' || this.race.phase === 'results' ? `${ord(car.place)} plats` : (car.isPlayer ? 'Du' : 'Redo');
      const ring = car.place === 1 ? 'gold' : car.place === 2 ? 'silver' : car.place === 3 ? 'bronze' : 'green';
      car.tag.set(line2, this.race.phase === 'race' ? ring : 'green');
      car.tag.place(g.position.x, g.position.y + 2.5, g.position.z, !car.wrecked || car.wreckT > 1.2);
      // spår och sladdmärken (bakhjulen)
      for (const k of [2, 3]) {
        const w = v.wheels[k];
        const on = w.grounded && v.speed > 6 && !car.wrecked && car.trk && Math.abs(car.trk.lat) < T.halfW + 0.5;
        this.trails.feed(car.id + (k === 2 ? 'L' : 'R'), w.hit, w.normal, on, this.time);
        this.skids.feed(car.id + (k === 2 ? 'sL' : 'sR'), w.hit, w.normal, on && w.slip > 0.35, this.time);
      }
      // effekter
      car.emitAcc += dt;
      if (car.emitAcc > 1 / 30) {
        car.emitAcc = 0;
        const hp = car.health;
        _v.set(0, 0.45, -1.9).applyQuaternion(v.quat).add(v.pos); // motorhuven
        if (car.wrecked) { this.fx.fire(_v, v.vel, 1.6); this.fx.smoke(_v, v.vel, true, 1.4); }
        else if (hp < 30) { this.fx.fire(_v, v.vel, 0.9); this.fx.smoke(_v, v.vel, true); }
        else if (hp < 60) this.fx.smoke(_v, v.vel, Math.random() < 0.3);
        // gnistor när karossen skrapar
        if (v.up.y < 0.35 && v.speed > 5) {
          _v.set(0, v.up.y < 0 ? 0.7 : 0, 0).applyQuaternion(v.quat).add(v.pos);
          this.fx.sparks(_v, v.vel, 3, 4);
          if (Math.random() < 0.5) this.fx.fire(_v, v.vel, 0.5);
        }
        for (const w of v.wheels) {
          if (!w.grounded) continue;
          if (w.slip > 0.35 && v.speed > 4) this.fx.tireSmoke(w.hit, v.vel);
          if (Math.abs(car.trk.lat) > T.halfW + 0.8 && v.speed > 8 && Math.random() < 0.6) this.fx.snow(w.hit, v.vel, 1);
        }
      }
    }
    this.fx.update(dt);
    this.trails.update(this.time);
    this.skids.update(this.time);

    // kamera
    const me = this.me;
    if (this.showcase) {
      // garaget: kameran går runt den visade bilen
      this.orbit += dt * 0.35;
      const p = this.showcase.group.position;
      this.camera.position.set(p.x + Math.cos(this.orbit) * 7.2, p.y + 2.2, p.z + Math.sin(this.orbit) * 7.2);
      this.camera.lookAt(p.x, p.y + 0.2, p.z);
      this.plate.mesh.visible = false;
    } else if (me) {
      const g = me.view.group;
      this.cam.update(dt, g.position, me.veh.fwd, me.veh.vel, me.veh.speed * 3.6);
      // fart på vägen bakom bilen
      _v.copy(me.veh.fwd); _v.y = 0; _v.normalize();
      const px = g.position.x - _v.x * 3.7, pz = g.position.z - _v.z * 3.7;
      const pr = T.project(px, pz, me.trk.i, {});
      const onRoad = Math.abs(pr.lat) < T.halfW;
      const gy = onRoad ? pr.y + 0.04 : this.world3d.terr.heightAt(px, pz) + 0.08;
      T.sampleAt(pr.s, _f);
      this.plate.set(me.veh.speed * 3.6);
      this.plate.place(_v2.set(px, gy, pz), new THREE.Vector3(_f.ux, _f.uy, _f.uz), me.veh.fwd, !me.wrecked && Math.abs(gy - (g.position.y + MODEL_Y)) < 3);
    } else {
      // meny: kameran svävar runt startportalen
      this.orbit += dt * 0.08;
      const f = T.sampleAt(T.wrapS(-40), _f);
      this.camera.position.set(f.x + Math.cos(this.orbit) * 55, f.y + 16, f.z + Math.sin(this.orbit) * 55);
      this.camera.lookAt(f.x + 20, f.y + 4, f.z);
      this.plate.mesh.visible = false;
    }
    this.sceneApi.follow(me ? me.view.group.position : this.camera.position, this.time);
    this.world3d.cull(this.camera.position);
    this.renderer.render(this.scene, this.camera);
  }

  // Huvudloop: fast fysik + interpolerad rendering
  tick(dt) {
    dt = Math.min(dt, 0.1);
    this.acc += dt;
    let n = 0;
    while (this.acc >= CONF.DT && n < 4) { this.step(CONF.DT); this.acc -= CONF.DT; n++; }
    if (n === 4) this.acc = 0;
    this.frame(dt, this.acc / CONF.DT);
  }
}

function mulberry(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
