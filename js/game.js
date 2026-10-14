// Spelet: fysikvärlden, bilarna, racet, effekterna och renderingen.
import * as THREE from 'three';
import { CONF, BOT_NAMES, TITLES } from './config.js?v=4';
import { buildTrack } from './track.js?v=4';
import { buildWorld, gridSlots } from './world.js?v=4';
import { createScene, ChaseCam } from './scene.js?v=4';
import { CarView, SHAPES, MODEL_Y } from './carmodel.js?v=4';
import { makeLivery, randomSpec } from './livery.js?v=4';
import { Vehicle, CP } from './vehicle.js?v=4';
import { BotBrain } from './ai.js?v=4';
import { Race } from './race.js?v=4';
import { FX, Trails } from './fx.js?v=4';
import { NameTag, SpeedPlate } from './tags.js?v=4';
import { RemoteVeh, carInfo } from './net.js?v=4';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion(), _f = {};
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
    this.orbit = 0;
    this.mode = 'host';   // 'host' (även ensam) eller 'client'
    this.net = null;
    this.myId = null;
  }

  addCar({ id, name, isPlayer, spec, remote = null }) {
    const sh = SHAPES[spec.shape % SHAPES.length];
    const livery = makeLivery(spec, sh);
    const view = new CarView(sh, livery);
    this.scene.add(view.group);
    const client = this.mode === 'client';
    let veh;
    if (client) veh = new RemoteVeh();
    else {
      const f = this.track.sampleAt(0);
      veh = new Vehicle(this, new THREE.Vector3(f.x, f.y + 3, f.z), this.track.quatAt(0));
    }
    if (id == null) id = this.nextId++;
    else this.nextId = Math.max(this.nextId, id + 1);
    const car = {
      id, name, isPlayer, spec, view, veh, remote,
      remoteInput: { throttle: 0, brake: 0, steer: 0, handbrake: 0 },
      tag: new NameTag(this.scene, name, id * 7.3 + name.length, isPlayer),
      brain: isPlayer || remote || client ? null : new BotBrain(mulberry(id * 97 + 3)),
      trk: { i: 0, s: 0, lat: 0, y: 0 }, lap: 0, prog: 0, prevS: 0, place: 0,
      finished: false, finishT: 0, finishPlace: 0,
      health: 100, wrecked: false, wreckT: 0, flipT: 0, offT: 0, ghostT: 0, hitCD: 0, comebackT: 0,
      p0: new THREE.Vector3(), p1: new THREE.Vector3(), q0: new THREE.Quaternion(), q1: new THREE.Quaternion(),
      emitAcc: 0, lastHitBy: null, raceStats: { kos: 0, hits: 0 },
    };
    if (car.brain && veh instanceof Vehicle) veh.assist = true;
    this.cars.push(car);
    if (isPlayer) this.me = car;
    return car;
  }

  removeCar(car) {
    this.cars = this.cars.filter(c => c !== car);
    car.veh.destroy?.();
    this.scene.remove(car.view.group);
    car.view.dispose();
    car.tag.dispose(this.scene);
    for (const k of ['L', 'R']) { this.trails.remove(car.id + k); this.skids.remove(car.id + 's' + k); }
    if (this.me === car) this.me = null;
  }

  carById(id) { return this.cars.find(c => c.id === id); }

  setSpec(car, spec) {
    if (!car || !spec) return;
    car.spec = spec;
    const sh = SHAPES[spec.shape % SHAPES.length];
    this.scene.remove(car.view.group);
    car.view.dispose();
    car.view = new CarView(sh, makeLivery({ ...spec, driver: car.name }, sh));
    this.scene.add(car.view.group);
  }

  // ---------- Nätverk: värden ----------
  emit(msg) { this.net?.broadcast?.(msg); }
  notify(car, m, k = '') {
    if (!car) return;
    if (car === this.me) this.hud?.toast(m, k);
    else if (car.remote) this.net?.sendTo(car, { t: 'toast', m, k });
  }
  notifyAll(m, k = '') { this.hud?.toast(m, k); this.emit({ t: 'toast', m, k }); }
  flashAll(m) { this.hud?.flash(m); this.audio?.beep(true); this.emit({ t: 'flash', m, beep: true }); }

  addRemotePlayer(name, spec, conn) {
    // en bot får lämna plats
    if (this.cars.length >= CONF.BOTS + 1) {
      const bots = this.cars.filter(c => c.brain && !c.isPlayer);
      if (bots.length) {
        const b = bots.reduce((a, c) => (c.place > a.place ? c : a), bots[0]);
        this.removeCar(b);
        this.emit({ t: 'remove', id: b.id });
      }
    }
    const car = this.addCar({ name, isPlayer: false, spec: { ...spec, driver: name }, remote: conn });
    this.placeLate(car);
    return car;
  }
  removeRemotePlayer(car) {
    this.removeCar(car);
    if (this.cars.length < CONF.BOTS + 1) {
      const n = this.cars.length;
      this.setupBots(1);
      const b = this.cars[n];
      this.placeLate(b);
      this.emit({ t: 'add', car: carInfo(b) });
    }
  }
  // Ny bil mitt i allt: ställ den bakom fältet (i racet) eller på griden
  placeLate(car) {
    const r = this.race, T = this.track;
    if (r.phase === 'lobby') {
      if (this.isHuman(car)) this.placeInLobby(car);
      else this.parkBot(car, gridSlots(T, Math.max(24, this.cars.length))[this.cars.indexOf(car)]);
      return;
    }
    if (r.phase === 'grid' || r.phase === 'count' || r.phase === 'idle') { r.toGrid(Math.max(3, r.phase === 'grid' ? r.t : 3)); return; }
    const others = (r.order || this.cars).filter(c => c !== car && !c.finished);
    const last = others.length ? others[others.length - 1] : null;
    const prog = last ? last.prog - 30 : 0;
    const lap = Math.floor(prog / T.L), s = T.wrapS(prog - lap * T.L);
    this.placeCar(car, s, (Math.random() - 0.5) * 16, 50);
    car.lap = lap; car.prevS = car.trk.s; car.prog = prog;
    car.ghostT = 2.5; car.veh.setGhost?.(true);
    car.finished = false;
  }
  requestReset(car) {
    if (!car || car.wrecked || (this.race.phase !== 'race' && this.race.phase !== 'lobby')) return;
    this.respawn(car, 5, 'knapp');
  }

  // ---------- Lobbyn ----------
  isHuman(car) { return !!(car.isPlayer || car.remote); }
  // ledig plats strax efter startlinjen
  placeInLobby(car) {
    const T = this.track;
    for (let s = 30; s < 400; s += 11) {
      for (const lat of [-7, 0, 7, -12, 12]) {
        const p = T.pointAt(s, lat, _v);
        if (this.cars.every(o => o === car || o.hidden || o.veh.pos.distanceTo(p) > 7)) {
          this.placeCar(car, s, lat, 0);
          car.lap = 0; car.prevS = car.trk.s; car.prog = car.trk.s;
          car.ghostT = 1.2; car.veh.setGhost?.(true);
          return;
        }
      }
    }
    this.placeCar(car, 30, 0, 0);
  }
  // bot väntar osynlig på sin startruta (krockar inte med någon)
  parkBot(car, slot) {
    if (!slot) slot = { s: this.track.wrapS(-12), lat: 0 };
    this.placeCar(car, slot.s, slot.lat, 0);
    car.veh.hold = true; car.hidden = true; car.ghostT = 0; car.veh.setGhost?.(true);
  }
  setReady(car, on) {
    if (!car || this.race.phase !== 'lobby') return;
    car.ready = !!on;
  }
  // det alla ser i lobbypanelen (värden räknar fram den och skickar till gästerna)
  lobbyState() {
    const r = this.race;
    return {
      room: this.room || '', pub: !!this.isPublic, t: r.t, readyT: r.readyT ?? null,
      players: this.cars.filter(c => this.isHuman(c)).map(c => ({
        id: c.id, name: c.name, ready: !!c.ready, host: c === this.me, nr: c.spec.number,
        c1: c.spec.colors?.[0] || '#888', c2: c.spec.colors?.[1] || '#444',
      })),
    };
  }

  // Racets händelser (anropas av Race)
  onFinish(car) {
    const m = `MÅL! ${ord(car.finishPlace)}`;
    if (car === this.me) { this.hud?.flash(m); this.audio?.beep(true); }
    else if (car.remote) this.net?.sendTo(car, { t: 'flash', m, beep: true });
    this.emit({ t: 'finish', id: car.id, place: car.finishPlace, time: car.finishT });
  }
  onWinner(car) { this.notifyAll(`🏁 ${car.name} vann!`); }
  onRaceEnd(results) {
    const res = results.map(r => ({ place: r.place, name: r.name, time: r.time, kos: r.kos, id: r.car.id }));
    this.showResults(res);
    this.emit({ t: 'results', res });
  }
  showResults(res) {
    const mine = res.map(r => ({ ...r, isPlayer: !!this.me && r.id === this.me.id }));
    this.hud?.showResults(mine);
    const me = mine.find(r => r.isPlayer);
    if (me) this.onLocalResult?.(me);
  }

  // ---------- Nätverk: gästen ----------
  becomeClient() {
    for (const c of this.cars.slice()) this.removeCar(c);
    this.mode = 'client';
    this.trails.clear(); this.skids.clear();
  }
  addCarFromInfo(info) {
    return this.addCar({ id: info.id, name: info.name, isPlayer: info.id === this.myId, spec: info.spec });
  }
  clientWelcome(d) {
    for (const c of this.cars.slice()) this.removeCar(c);
    this.myId = d.you;
    for (const info of d.cars) this.addCarFromInfo(info);
    this.me = this.carById(this.myId);
    this.race.lastWinner = d.winner || '';
  }
  clientHit(d) {
    const car = this.carById(d.id); if (!car) return;
    car.view.dent(d.cp[0], d.cp[1], d.cp[2], d.dl[0], d.dl[1], d.dl[2], d.amt);
    car.view.livery.scratch(d.u, d.v, d.dmg);
    this.fx.sparks(_v2.set(d.sp[0], d.sp[1], d.sp[2]), car.veh.vel, 6 + Math.floor(d.dmg / 3), 5);
    if (car === this.me || d.by === this.myId) this.audio?.crash(d.dv, 1);
    else if (this.me) { const near = Math.max(0, 1 - this.me.veh.pos.distanceTo(car.veh.pos) / 90); if (near > 0.05) this.audio?.crash(d.dv, near * 0.6); }
  }
  clientWreck(d) {
    const car = this.carById(d.id); if (!car) return;
    this.fx.explosion(car.veh.pos, car.veh.vel);
    const near = this.me ? Math.max(0, 1 - this.me.veh.pos.distanceTo(car.veh.pos) / 140) : 1;
    this.audio?.boom(car === this.me ? 1 : near);
  }
  clientGrid() {
    for (const c of this.cars) { c.view.resetDamage(); c.finishT = 0; }
    this.trails.clear(); this.skids.clear();
    this.hud?.hideResults();
  }
  clientLobby() {
    for (const c of this.cars) { c.view.resetDamage(); c.finishT = 0; }
    this.hud?.hideResults();
    this.myReady = false;
  }
  clientFinish(d) { const c = this.carById(d.id); if (c) { c.finishT = d.time; c.finishPlace = d.place; } }
  clientResults(d) { this.showResults(d.res); }
  clientLights() {
    const r = this.race, gt = this.world3d.gantry;
    if (r.phase === 'count') gt.setLights(Math.min(5, Math.max(0, Math.floor((CONF.COUNTDOWN + 0.6 - r.t) / (CONF.COUNTDOWN / 5)) + 1)), false);
    else if (r.phase === 'race') gt.setLights(5, true);
    else gt.setLights(0, false);
  }

  setupBots(n) {
    const used = new Set();
    for (let k = 0; k < n; k++) {
      let name;
      do { name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)]; } while (used.has(name) && used.size < BOT_NAMES.length);
      used.add(name);
      const spec = randomSpec(1000 + k * 17 + Math.floor(Math.random() * 1e5), name);
      spec.title = TITLES[Math.floor(Math.random() * TITLES.length)];
      this.addCar({ name, isPlayer: false, spec });
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
    this.emit({ t: 'respawn', id: car.id });
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
    const by = car.lastHitBy && this.time - car.lastHitT < 4 && this.cars.includes(car.lastHitBy) ? car.lastHitBy : null;
    if (by) { by.raceStats.kos++; }
    this.notify(car, by ? `💥 ${by.name} knuffade ut dig!` : '💥 Du kraschade!', 'bad');
    if (by) this.notify(by, `💥 Du knuffade ut ${car.name}!`, 'good');
    if (by && by !== this.me && car !== this.me && near > 0.3) this.hud?.toast(`${by.name} knuffade ut ${car.name}`);
    this.emit({ t: 'wreck', id: car.id });
  }

  unwreck(car) {
    car.wrecked = false; car.veh.disabled = false; car.health = 100;
    car.view.resetDamage();
    this.emit({ t: 'unwreck', id: car.id });
  }

  // ---------- Fast fysiksteg ----------
  step(dt) {
    this.simT += dt;
    const inp = this.input.state;
    for (const car of this.cars) {
      if (car.brain) car.brain.update(dt, car, this);
      else Object.assign(car.veh.input, car.remote ? car.remoteInput : inp);
    }
    const pushes = this.contacts(dt);
    for (const car of this.cars) car.veh.preStep(dt);
    // knuffarnas krafter läggs på efter preStep (räknas som egna impulser, inte smällar)
    for (const p of pushes) p.veh.applyJ(p.jx, p.jy, p.jz, p.px, p.py, p.pz);
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

  // Sida-mot-sida-kontakt: den som styr in i en annan bil knuffar undan den.
  // Trycket på bakhjulsområdet får bakvagnen att släppa → spinn (PIT). Den som blir
  // knuffad kan hålla emot genom att styra tillbaka in i knuffaren.
  contacts(dt) {
    const cars = this.cars, out = [];
    for (const c of cars) { c.veh.pressF = 1; c.veh.pressR = 1; c.veh.pressHold = 0; if (c.contactT > 0) c.contactT -= dt; }
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const A = cars[i], B = cars[j];
        if (A.wrecked || B.wrecked || A.ghostT > 0 || B.ghostT > 0 || A.hidden || B.hidden) continue;
        const a = A.veh.pos, b = B.veh.pos;
        if ((a.x - b.x) ** 2 + (a.z - b.z) ** 2 > 36 || Math.abs(a.y - b.y) > 1.6) continue;
        this.sidePress(A, B, dt, out);
        this.sidePress(B, A, dt, out);
      }
    }
    return out;
  }

  // B trycker på A:s sida?
  sidePress(A, B, dt, out) {
    const a = A.veh, b = B.veh;
    const rx = b.pos.x - a.pos.x, ry = b.pos.y - a.pos.y, rz = b.pos.z - a.pos.z;
    const lx = rx * a.right.x + ry * a.right.y + rz * a.right.z;     // B åt höger (+) om A
    const lz = rx * a.fwd.x + ry * a.fwd.y + rz * a.fwd.z;           // B framför (+) A
    const ax = Math.abs(lx);
    if (ax < 1.25 || ax > 2.5 || Math.abs(lz) > 4.9) return;
    const side = Math.sign(lx);
    const zc = (Math.max(-2.45, lz - 2.45) + Math.min(2.45, lz + 2.45)) / 2; // var på A trycket sitter
    // B:s vilja: styr B mot A?
    const lxB = -(rx * b.right.x + ry * b.right.y + rz * b.right.z);
    const pushB = Math.max(0, (b.input.steer || 0) * Math.sign(lxB));
    // A håller emot: styr mot B
    const holdA = Math.max(0, (a.input.steer || 0) * side);
    const closing = -((b.vel.x - a.vel.x) * a.right.x + (b.vel.z - a.vel.z) * a.right.z) * side;
    const tight = 1 - Math.min(1, Math.max(0, (ax - 1.98) / 0.5));
    if (tight <= 0.05) return;
    const rearW = Math.min(1, Math.max(0, (-zc - 0.2) / 1.5));
    const frontW = Math.min(1, Math.max(0, (zc - 0.2) / 1.5));
    // att luta sig in i knuffaren hjälper vid sidan — mot bakhjulen hjälper bara motstyrning (i girkontrollen)
    const holdEff = holdA * (1 - rearW);
    let press = tight * Math.min(1, 0.25 + pushB * 0.85 + Math.max(0, closing) * 0.1) * (1 - 0.65 * holdEff);
    if (a.assist) press *= 0.8;
    if (press > 0.03) {
      a.pressR = Math.min(a.pressR, 1 - 0.65 * press * (0.3 + 0.7 * rearW));
      a.pressF = Math.min(a.pressF, 1 - 0.45 * press * (0.3 + 0.7 * frontW));
      a.pressHold = Math.max(a.pressHold, holdEff);
      if (press > 0.3) a.pressT = Math.max(a.pressT, 0.45);
      A.contactT = 0.2; A.contactWith = B; A.contactZ = zc; A.contactSide = side;
      if (press > 0.35) { A.lastHitBy = B; A.lastHitT = this.time; }
    }
    // B lutar sig in i A: kraft vid kontaktpunkten (lika stor åt andra hållet på B)
    if (pushB > 0.05 && tight > 0.3) {
      const J = 12000 * pushB * tight * (1 - 0.5 * holdEff) * dt;
      const px = a.pos.x + a.fwd.x * zc + a.right.x * side * 0.95, py = a.pos.y + 0.05, pz = a.pos.z + a.fwd.z * zc + a.right.z * side * 0.95;
      const dx = -side * a.right.x, dz = -side * a.right.z;
      out.push({ veh: a, jx: dx * J, jy: 0, jz: dz * J, px, py, pz });
      out.push({ veh: b, jx: -dx * J, jy: 0, jz: -dz * J, px, py, pz });
    }
    // gnistor när plåten skrapar längs varandra
    const slide = Math.abs((b.vel.x - a.vel.x) * a.fwd.x + (b.vel.z - a.vel.z) * a.fwd.z);
    const grind = Math.abs(closing) > 1.5 || pushB > 0.3 || slide > 3;
    if (tight > 0.55 && grind && a.speed > 8 && Math.random() < dt * 40) {
      (this.scrapes ||= []).push([a.pos.x + a.fwd.x * zc + a.right.x * side * 0.98, a.pos.y + 0.05, a.pos.z + a.fwd.z * zc + a.right.z * side * 0.98, a.vel.x, a.vel.y, a.vel.z, -side * a.right.x, -side * a.right.z]);
    }
    if (tight > 0.55 && grind) A.grindT = 0.15;
  }

  handleImpacts() {
    for (const car of this.cars) {
      const im = car.veh.impact;
      if (car.hitCD > 0 || !im || car.wrecked) continue;
      let other = null, od = 6.4;
      for (const o of this.cars) {
        if (o === car || o.ghostT > 0 || o.hidden) continue;
        const d = car.veh.pos.distanceTo(o.veh.pos);
        if (d < od) { od = d; other = o; }
      }
      const vertical = Math.abs(im.dy) > im.horiz * 1.4;
      if (!other && vertical && im.dv < 15) continue; // landning
      if (car.ghostT > 0 || car.hidden) continue;
      const inv = _q.copy(car.veh.quat).invert();
      const dl = _v.set(im.dx, im.dy * 0.4, im.dz).normalize().applyQuaternion(inv); // knuffens riktning, lokalt
      let dmg = Math.min(CONF.DMG_MAX, (im.dv - CONF.DV_MIN + 1.2) * CONF.DMG_SCALE) * (other ? CONF.DMG_CAR : CONF.DMG_WALL);
      if (Math.abs(dl.z) > 0.65) dmg *= other ? 0.4 : 0.6; // knuff fram/bak = bumpdrafting, tål mer
      car.health -= dmg;
      car.hitCD = 0.2;
      car.lastDmgT = this.simT;
      if (this.dmgLog) this.dmgLog.push([other ? 'bil' : 'vägg', Math.round(im.dv), Math.round(dmg), Math.abs(dl.x) > 0.55 ? 'sida' : Math.abs(dl.z) > 0.65 ? 'fram/bak' : 'snett', Math.round(im.horiz), Math.round(Math.abs(im.dy))]);
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
          const yaw = 0;
          const f = car.veh.fwd, u = car.veh.up;
          car.veh.body.applyTorqueImpulse({ x: -f.x * roll + u.x * yaw, y: -f.y * roll + u.y * yaw, z: -f.z * roll + u.z * yaw }, true);
          car.veh.spinT = 1.2;
          if (im.dv > 10) this.notify(other, `Tackling! ${car.name} snurrar`, 'good');
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
      if (other) this.fx.tackle(_v2, car.veh.vel, _v3.set(-im.dx, 0, -im.dz).normalize(), im.dv / 12);
      else this.fx.sparks(_v2, car.veh.vel, 8 + Math.floor(dmg / 2), 6);
      if (this.net) {
        const r3 = (x) => Math.round(x * 1000) / 1000;
        this.emit({ t: 'hit', id: car.id, by: other ? other.id : 0, cp: [r3(cp.x), r3(cp.y), r3(cp.z)], dl: [r3(dl.x), r3(dl.y), r3(dl.z)],
          amt: r3(dmg * 0.012), u: r3(u), v: r3(vv), dmg: Math.round(dmg), dv: Math.round(im.dv), sp: [r3(_v2.x), r3(_v2.y), r3(_v2.z)] });
      }
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
    if (car.hidden) return; // bot som väntar osynlig i lobbyn
    if (car.ghostT > 0) { car.ghostT -= dt; if (car.ghostT <= 0) v.setGhost(false); }
    // Mot kanten: hörnen räknas ut i sidled — skrapar man tappar man fart och det gnistrar
    if (!car.wrecked && v.grounded >= 2) {
      const i = car.trk.i, rhx = -T.hz[i], rhz = T.hx[i];
      const rr = v.right.x * rhx + v.right.z * rhz, fr = v.fwd.x * rhx + v.fwd.z * rhz;
      const reach = Math.abs(rr) * 0.98 + Math.abs(fr) * 2.45;
      const gap = T.halfW - (Math.abs(car.trk.lat) + reach);
      if (gap < 0.12) {
        v.wallT = 0.3;
        const lv = v.body.linvel(), k = 1 - 0.3 * dt;
        v.body.setLinvel({ x: lv.x * k, y: lv.y, z: lv.z * k }, true);
        car.scrapeT = 0.15;
        if (v.speed > 6 && Math.random() < dt * 40) {
          const sd = Math.sign(car.trk.lat);
          (this.scrapes ||= []).push([v.pos.x + rhx * sd * reach, v.pos.y, v.pos.z + rhz * sd * reach, lv.x, lv.y, lv.z, -rhx * sd, -rhz * sd]);
        }
      }
    }
    if (car.scrapeT > 0) car.scrapeT -= dt;
    if (car.grindT > 0) car.grindT -= dt;
    // första kontakten sida mot sida: en plåtsmäll (även utan stor Δv)
    const inContact = car.contactT > 0.1;
    if (inContact && !car.wasContact && car.contactWith && (car === this.me || car.contactWith === this.me)) this.audio?.bump?.(Math.min(1, 0.4 + v.speed / 120));
    car.wasContact = inContact;
    // klarar man sig från smällar en stund lagas bilen sakta
    if (!car.wrecked && car.health < 100 && this.simT - (car.lastDmgT || 0) > 4) car.health = Math.min(100, car.health + 2.5 * dt);
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
      g.visible = !car.hidden && !(car.ghostT > 0 && Math.floor(this.time * 10) % 2 === 0);
      // namnskylt
      const ph = this.race.phase;
      const line2 = ph === 'race' || ph === 'results' ? `${ord(car.place)} plats`
        : ph === 'lobby' ? (car.ready ? 'REDO ✓' : 'väntar…') : (car.spec.title || 'Redo');
      const ring = car.place === 1 ? 'gold' : car.place === 2 ? 'silver' : car.place === 3 ? 'bronze' : 'green';
      car.tag.set(line2, this.race.phase === 'race' ? ring : 'green');
      car.tag.place(g.position.x, g.position.y + car.tag.lift, g.position.z, !car.hidden && (!car.wrecked || car.wreckT > 1.2));
      // andras skyltar krymper nära kameran så de aldrig skymmer vägen
      if (car !== this.me) {
        const d = this.camera.position.distanceTo(g.position);
        const k = Math.max(0.3, Math.min(1, (d - 4) / 22));
        car.tag.sprite.scale.set(3.5 * k, 0.875 * k, 1);
        car.tag.sprite.material.opacity = Math.min(1, (d - 3) / 6);
      }
      // spår och sladdmärken (bakhjulen)
      for (const k of [2, 3]) {
        const w = v.wheels[k];
        const on = w.grounded && v.speed > 6 && !car.wrecked && !car.hidden && car.trk && Math.abs(car.trk.lat) < T.halfW + 0.5;
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
    this.screenT = (this.screenT || 0) + dt;
    if (this.screenT > 0.5) {
      this.screenT = 0;
      const r = this.race, sc = this.world3d.screen;
      if (r.phase === 'lobby') sc.set('LOBBY · RUM', this.isPublic ? 'ALLA' : (this.room || ''));
      else if (r.phase === 'grid' || r.phase === 'count') sc.set('NÄSTA START', r.phase === 'count' ? 'NU!' : '0:' + String(Math.max(0, Math.ceil(r.t + CONF.COUNTDOWN))).padStart(2, '0'));
      else if (r.phase === 'race') sc.set('LEDER JUST NU', (r.order && r.order[0]?.name) || '');
      else if (r.phase === 'results') sc.set('VINNARE', r.lastWinner || (r.order && r.order[0]?.name) || '');
    }
    // gästen: gnistor ur ögonblicksbildernas skrapflaggor
    if (this.mode === 'client') {
      for (const car of this.cars) {
        if (!(car.scrapeT > 0 || car.grindT > 0) || car.veh.speed < 6 || Math.random() > dt * 40) continue;
        const v = car.veh;
        let sd = Math.sign(car.trk.lat) || 1;
        if (car.grindT > 0) {
          let best = null, bd = 49;
          for (const o of this.cars) { if (o === car) continue; const d = o.veh.pos.distanceToSquared(v.pos); if (d < bd) { bd = d; best = o; } }
          if (best) sd = Math.sign((best.veh.pos.x - v.pos.x) * v.right.x + (best.veh.pos.z - v.pos.z) * v.right.z) || 1;
          (this.scrapes ||= []).push([v.pos.x + v.right.x * sd * 0.98, v.pos.y, v.pos.z + v.right.z * sd * 0.98, v.vel.x, v.vel.y, v.vel.z, -v.right.x * sd, -v.right.z * sd]);
        } else {
          const i = car.trk.i, rhx = -T.hz[i], rhz = T.hx[i];
          (this.scrapes ||= []).push([v.pos.x + rhx * sd * 1.1, v.pos.y, v.pos.z + rhz * sd * 1.1, v.vel.x, v.vel.y, v.vel.z, -rhx * sd, -rhz * sd]);
        }
      }
    }
    if (this.scrapes) {
      for (const [x, y, z, vx, vy, vz, dx, dz] of this.scrapes) this.fx.scrape(_v.set(x, y, z), _v2.set(vx, vy, vz), _v3.set(dx || 0, 0, dz || 0));
      this.scrapes.length = 0;
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
    this.world3d.cull(this.camera.position, this.treeRange || 2300);
    if (!this.noRender) this.renderer.render(this.scene, this.camera);
  }

  // Huvudloop: fast fysik + interpolerad rendering
  tick(dt) {
    dt = Math.min(dt, 0.1);
    if (this.mode === 'client') {
      if (this.me) Object.assign(this.me.veh.input, this.input.state);
      this.net?.update(dt);
      this.frame(dt, 1);
      return;
    }
    this.acc += dt;
    let n = 0;
    while (this.acc >= CONF.DT && n < 4) { this.step(CONF.DT); this.acc -= CONF.DT; n++; }
    if (n === 4) this.acc = 0;
    this.lobbyInfo = this.race.phase === 'lobby' ? this.lobbyState() : null;
    this.net?.update(dt);
    this.frame(dt, this.acc / CONF.DT);
  }
}

function mulberry(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
