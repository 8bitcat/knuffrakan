// Spelet: fysikvärlden, bilarna, racet, effekterna och renderingen.
import * as THREE from 'three';
import { CONF, BOT_NAMES, TITLES } from './config.js?v=22';
import { buildTrack, trackDef, F_GAP, F_TUNNEL, F_LAVA } from './track.js?v=22';
import { themeOf } from './themes.js?v=22';
import { LAVA_IN } from './world.js?v=22';
import { buildWorld, gridSlots } from './world.js?v=22';
import { createScene, ChaseCam } from './scene.js?v=22';
import { makeCarView } from './vehicles3d.js?v=22';
import { typeOf } from './vtypes.js?v=22';
import { randomGear, cleanGear, mountOf, loaderPose } from './gear.js?v=22';
import { makeLivery, randomSpec } from './livery.js?v=22';
import { Vehicle, CP } from './vehicle.js?v=22';
import { BotBrain } from './ai.js?v=22';
import { Race } from './race.js?v=22';
import { FX, Trails } from './fx.js?v=22';
import { NameTag, SpeedPlate } from './tags.js?v=22';
import { RemoteVeh, carInfo } from './net.js?v=22';
import { Weapons } from './weapons.js?v=22';
import { newGP, shuffledTracks, award, Podium } from './gp.js?v=22';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion(), _f = {};
const TRACK_DEFAULT = 'hoppbacken';
const ord = (n) => n + ':' + (n === 1 || n === 2 ? 'a' : 'e');

export class Game {
  constructor(RAPIER, canvas, { hud, audio, input, track }) {
    this.RAPIER = RAPIER;
    this.hud = hud; this.audio = audio; this.input = input;
    const S = createScene(canvas);
    Object.assign(this, { renderer: S.renderer, scene: S.scene, camera: S.camera, sceneApi: S });
    this.cam = new ChaseCam(this.camera);
    this.world = new RAPIER.World({ x: 0, y: -CONF.GRAV, z: 0 });
    this.world.timestep = CONF.DT;
    this.setTrack(track || TRACK_DEFAULT);
    this.fx = new FX(this.scene);
    this.trails = new Trails(this.scene, { color: 0x5b8cff, width: 0.11, life: 7, alpha: 0.85, step: 3, maxPts: 240 });
    this.skids = new Trails(this.scene, { color: 0x140f18, width: 0.15, life: 22, alpha: 0.55, step: 1.2, maxPts: 160 });
    this.plate = new SpeedPlate(this.scene);
    this.cars = [];
    this.me = null;
    this.race = new Race(this);
    this.weapons = new Weapons(this);
    this.acc = 0; this.time = 0; this.simT = 0;
    this.nextId = 1;
    this.orbit = 0;
    this.mode = 'host';   // 'host' (även ensam) eller 'client'
    this.gp = null;       // Grand Prix-läget (värden äger det, gästerna får en kopia)
    this.net = null;
    this.myId = null;
  }

  // Bygg (om) banan: riv gamla världen (grafik + kolliders) och bygg den nya
  setTrack(id) {
    const def = trackDef(id);
    if (this.trackId === def.id) return false;
    const t0 = performance.now();
    if (this.worldGroup) {
      this.scene.remove(this.worldGroup);
      this.worldGroup.traverse((o) => {
        o.geometry?.dispose?.();
        for (const m of [].concat(o.material || [])) { m.map?.dispose?.(); m.dispose?.(); }
      });
    }
    if (this.world3d?.fixedBody) this.world.removeRigidBody(this.world3d.fixedBody);
    this.track = buildTrack(def);
    this.worldGroup = new THREE.Group();
    this.scene.add(this.worldGroup);
    this.world3d = buildWorld({ scene: this.worldGroup, track: this.track, RAPIER: this.RAPIER, world: this.world });
    this.sceneApi?.applyTheme?.(themeOf(def));
    // banans tyngdkraft (månen 0,45)
    this.world.gravity = { x: 0, y: -CONF.GRAV * (def.grav ?? 1), z: 0 };
    this.trackId = def.id;
    this.trails?.clear(); this.skids?.clear();
    for (const c of this.cars || []) { c.trk.i = 0; c.lap = 0; c.prevS = 0; }
    if (this.hud) this.hud.mapBase = null;
    this.weapons?.onTrack();
    console.log(`bana ${def.id}: ${(performance.now() - t0).toFixed(0)} ms`);
    return true;
  }

  addCar({ id, name, isPlayer, spec, remote = null }) {
    const view = makeCarView({ ...spec, driver: name });
    this.scene.add(view.group);
    const client = this.mode === 'client';
    const VT = typeOf(spec);
    let veh;
    if (client) veh = new RemoteVeh(VT);
    else {
      const f = this.track.sampleAt(0);
      veh = new Vehicle(this, new THREE.Vector3(f.x, f.y + 3, f.z), this.track.quatAt(0), VT);
    }
    if (id == null) id = this.nextId++;
    else this.nextId = Math.max(this.nextId, id + 1);
    const car = {
      id, name, isPlayer, spec, view, veh, remote,
      remoteInput: { throttle: 0, brake: 0, steer: 0, handbrake: 0, loader: 0, fire: 0 },
      tag: new NameTag(this.scene, name, id * 7.3 + name.length, isPlayer),
      brain: isPlayer || remote || client ? null : new BotBrain(mulberry(id * 97 + 3)),
      trk: { i: 0, s: 0, lat: 0, y: 0 }, lap: 0, prog: 0, prevS: 0, place: 0,
      finished: false, finishT: 0, finishPlace: 0,
      health: 100, wrecked: false, wreckT: 0, flipT: 0, airT: 0, lockT: 0, rstate: 0, offT: 0, ghostT: 0, hitCD: 0, comebackT: 0,
      p0: new THREE.Vector3(), p1: new THREE.Vector3(), q0: new THREE.Quaternion(), q1: new THREE.Quaternion(),
      emitAcc: 0, lastHitBy: null, raceStats: { kos: 0, hits: 0 },
    };
    if (car.brain && veh instanceof Vehicle) veh.assist = true;
    car.tag.baseLift = car.tag.lift; car.tag.lift += VT.tagUp;
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
    const kindChanged = typeOf(spec) !== car.veh.T;
    car.spec = spec;
    this.scene.remove(car.view.group);
    car.view.dispose();
    car.view = makeCarView({ ...spec, driver: car.name });
    this.scene.add(car.view.group);
    if (kindChanged) this.rebuildVehicle(car);
    car.tag.lift = car.tag.baseLift + typeOf(spec).tagUp;
  }
  // ny biltyp: ny fysikkropp på samma plats och i samma fart
  rebuildVehicle(car) {
    const VT = typeOf(car.spec), old = car.veh;
    if (this.mode === 'client') { car.veh = new RemoteVeh(VT); car.veh.pos.copy(old.pos); car.veh.quat.copy(old.quat); return; }
    const nv = new Vehicle(this, old.pos.clone().addScaledVector(old.up, VT.rayLen - old.T.rayLen + 0.1), old.quat.clone(), VT);
    nv.body.setLinvel(old.body.linvel(), true);
    Object.assign(nv, { hold: old.hold, disabled: old.disabled, assist: old.assist, vmax: old.vmax, powerMul: old.powerMul });
    old.destroy();
    car.veh = nv;
    if (car.ghostT > 0 || car.hidden) nv.setGhost(true);
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
  // R = tillbaka på banan. På banan bara 3 räddningar per race, utanför banan fritt.
  // I luften går det inte (och inte förrän AIR_LOCK s efter att bilen lämnade marken),
  // på taket måste man ligga FLIP_WAIT s först (mätaren).
  requestReset(car) {
    const ph = this.race.phase;
    if (!car || car.wrecked || (ph !== 'race' && ph !== 'lobby')) return;
    const v = car.veh, T = this.track;
    if (car.rstate === 1 || (v.grounded === 0 && v.up.y >= 0.3)) { this.notify(car, 'Inte i luften!', 'bad'); return; }
    if (v.up.y < 0.3) {
      if ((car.flipT || 0) < CONF.FLIP_WAIT) { this.notify(car, 'Vänta tills mätaren är full…', 'bad'); return; }
      this.respawn(car, 5, 'knapp'); return;
    }
    if (car.lockT > 0) { this.notify(car, 'Vänta tills mätaren är full…', 'bad'); return; }
    const off = Math.abs(car.trk.lat) > T.halfW + 1.2 || v.pos.y < car.trk.y - 3 || (car.trk.f & F_GAP);
    if (off || ph === 'lobby') { this.respawn(car, 5, 'knapp'); return; }
    if ((car.saves ?? CONF.SAVES) <= 0) { this.notify(car, 'Inga räddningar kvar det här racet!', 'bad'); return; }
    car.saves = (car.saves ?? CONF.SAVES) - 1;
    this.respawn(car, 5, 'knapp');
    this.notify(car, car.saves ? `Räddning använd — ${car.saves} kvar` : 'Sista räddningen använd!', car.saves ? '' : 'bad');
  }

  // ---------- Lobbyn ----------
  isHuman(car) { return !!(car.isPlayer || car.remote || car.human); }
  // ledig plats strax efter startlinjen
  placeInLobby(car) {
    const T = this.track;
    for (let s = 30; s < 400; s += 11) {
      for (const lat of [-7, 0, 7, -12, 12]) {
        const p = T.pointAt(s, lat, _v);
        if (this.cars.every(o => o === car || o.hidden || o.veh.pos.distanceTo(p) > 10)) {
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
  changeTrack(id) {
    if (this.mode !== 'host' || (this.race.phase !== 'lobby' && this.net)) return;
    if (!this.setTrack(id)) return;
    this.emit({ t: 'track', id: this.trackId });
    if (this.net) this.race.toLobby(); else this.race.toGrid(CONF.GRID_WAIT);
  }
  setReady(car, on) {
    if (!car || this.race.phase !== 'lobby') return;
    car.ready = !!on;
  }
  // det alla ser i lobbypanelen (värden räknar fram den och skickar till gästerna)
  lobbyState() {
    const r = this.race;
    return {
      room: this.room || '', pub: !!this.isPublic, t: r.t, readyT: r.readyT ?? null, track: this.trackId, laps: this.track.def.laps || 1,
      gp: this.gp ? { stage: this.gp.stage, count: this.gp.count } : null,
      players: this.cars.filter(c => this.isHuman(c)).map(c => ({
        id: c.id, name: c.name, ready: !!c.ready, host: c === this.me, nr: c.spec.number,
        c1: c.spec.colors?.[0] || '#888', c2: c.spec.colors?.[1] || '#444', gear: cleanGear(c.spec.gear, c.spec.kind),
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
    // Grand Prix: poäng till spelarna efter placering
    if (this.gp?.on && this.gp.stage === 'race' && this.mode === 'host') {
      award(this.gp, results, (c) => this.isHuman(c));
      this.gp.stage = 'standings';
      this.gpSend();
    }
    const res = results.map(r => ({ place: r.place, name: r.name, time: r.time, kos: r.kos, id: r.car.id }));
    this.showResults(res);
    this.emit({ t: 'results', res });
  }
  showResults(res) {
    const mine = res.map(r => ({ ...r, isPlayer: !!this.me && r.id === this.me.id }));
    this.hud?.showResults(mine, this);
    const me = mine.find(r => r.isPlayer);
    if (me) this.onLocalResult?.(me);
  }

  // ---------- Grand Prix (värden) ----------
  gpPublic() {
    const g = this.gp;
    return g ? { on: g.on, stage: g.stage, count: g.count, order: g.order, idx: g.idx, table: g.table, podium: g.podium } : null;
  }
  gpSend() { if (this.gp) this.emit({ t: 'gp', gp: this.gpPublic() }); this.hud?.gpChanged?.(this); }
  gpSetCount(n) { if (this.mode !== 'host' || !this.gp || this.gp.stage !== 'lobby') return; this.gp.count = n; this.gpSend(); }
  // start: banorna slumpas, alla spelare börjar på 0 poäng
  gpStart() {
    const gp = this.gp;
    gp.order = shuffledTracks(gp.count); gp.idx = -1; gp.podium = [];
    gp.table = this.cars.filter(c => this.isHuman(c)).map(c => ({ id: c.id, name: c.name, pts: 0, wins: 0, last: 0, c1: c.spec?.colors?.[0] || '#888' }));
    this.notifyAll(`🏆 GRAND PRIX! ${gp.order.length} banor i slumpad ordning`, 'good');
    this.gpNext();
  }
  // nästa bana — eller prispallen när alla är körda
  gpNext() {
    const gp = this.gp;
    if (gp.idx + 1 < gp.order.length) {
      gp.idx++; gp.stage = 'race';
      if (this.setTrack(gp.order[gp.idx])) this.emit({ t: 'track', id: this.trackId });
      this.gpSend();
      this.race.toGrid(CONF.GRID_WAIT);
      this.flashAll(`BANA ${gp.idx + 1} AV ${gp.order.length}: ${this.track.namn}`);
    } else {
      gp.stage = 'final';
      gp.podium = gp.table.slice(0, 3).map(r => r.id);
      this.gpSend();
      this.race.toPodium();
    }
  }
  gpDone() {
    this.gp.stage = 'lobby';
    this.gpSend();
    this.race.toLobby();
  }

  // ---------- Nätverk: gästen ----------
  becomeClient() {
    for (const c of this.cars.slice()) this.removeCar(c);
    this.mode = 'client';
    this.trails.clear(); this.skids.clear();
  }
  addCarFromInfo(info) {
    const c = this.addCar({ id: info.id, name: info.name, isPlayer: info.id === this.myId, spec: info.spec });
    c.human = !!info.human;
    return c;
  }
  clientWelcome(d) {
    for (const c of this.cars.slice()) this.removeCar(c);
    if (d.track) this.setTrack(d.track);
    this.gp = d.gp || null;
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
      const r = Math.random();
      spec.kind = r < 0.1 ? 'bus' : r < 0.2 ? 'bigfoot' : r < 0.27 ? 'formel' : r < 0.33 ? 'traktor' : r < 0.39 ? 'glass' : r < 0.43 ? 'rullstol' : r < 0.47 ? 'elrullstol' : r < 0.51 ? 'plan' : 'stock';
      if (spec.kind === 'bus' && Math.random() < 0.7) spec.colors = ['#ffc21a', '#16161a', '#ffffff'];
      spec.gear = randomGear(Math.random, spec.kind);
      this.addCar({ name, isPlayer: false, spec });
    }
  }

  // Ställ en bil på banan vid (s, lat)
  placeCar(car, s, lat, speed = 0, snap = true) {
    const T = this.track;
    const p = T.pointAt(s, lat, _v);
    const f = T.sampleAt(s, _f);
    const up = -car.veh.T.modelY + 0.07;
    p.x += f.ux * up; p.y += f.uy * up; p.z += f.uz * up;
    car.veh.resetTo(p, T.quatAt(s, _q), speed);
    T.project(p.x, p.z, T.idx(s), car.trk); // prevS lämnas — varvräkningen ser hoppet över linjen
    if (snap) { car.p0.copy(car.veh.pos); car.p1.copy(car.veh.pos); car.q0.copy(car.veh.quat); car.q1.copy(car.veh.quat); }
    this.trails.feed(car.id + 'L', p, _v2.set(0, 1, 0), false, this.time);
    this.trails.feed(car.id + 'R', p, _v2, false, this.time);
    this.emit({ t: 'respawn', id: car.id });
  }

  // Återuppstå på banan bakom där man var, i en ledig fil
  respawn(car, back = 30, why = "?") {
    const gp = this.track.project(car.veh.pos.x, car.veh.pos.z, -1, {});
    (this.respawnLog ||= []).push([Math.round(this.simT), car.name, why, Math.round(car.trk.s), Math.round(car.trk.lat), +(car.veh.pos.y - car.trk.y).toFixed(1), Math.round(car.veh.speed * 3.6), Math.round(gp.s), Math.round(gp.lat), +(car.veh.pos.y - gp.y).toFixed(1), car.lastWhy || '']);
    const T = this.track;
    const s = T.safeS(car.trk.s - back);
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
    car.flipT = 0; car.offT = 0; car.airT = 0; car.lockT = 0; car.wasAir = false; car.rstate = 0;
    if (racing) car.comebackT = 3;
  }

  wreck(car) {
    car.wrecked = true; car.wreckT = 2.4; car.veh.disabled = true; car.weapon = null; car.rollT = 0;
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
    this.crush(dt);
    this.jetBurn(dt);
    this.propSlash(dt);
    this.weapons.step(dt);
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
        if ((a.x - b.x) ** 2 + (a.z - b.z) ** 2 > 100 || Math.abs(a.y - b.y) > 2.4) continue;
        this.sidePress(A, B, dt, out);
        this.sidePress(B, A, dt, out);
        this.climb(A, B, dt, out);
        this.climb(B, A, dt, out);
        this.gearFront(A, B, dt, out);
        this.gearFront(B, A, dt, out);
      }
    }
    return out;
  }

  // Bigfooten möter en bil framifrån i fart: lyft fronten så den kör upp på den
  climb(A, B, dt, out) {
    const a = A.veh, b = B.veh;
    if (!a.T.bigWheels || b.T.bigWheels || A.wrecked) return;
    const rx = b.pos.x - a.pos.x, ry = b.pos.y - a.pos.y, rz = b.pos.z - a.pos.z;
    const lz = rx * a.fwd.x + ry * a.fwd.y + rz * a.fwd.z, lx = rx * a.right.x + ry * a.right.y + rz * a.right.z;
    const closing = (a.vel.x - b.vel.x) * a.fwd.x + (a.vel.z - b.vel.z) * a.fwd.z;
    const contact = a.T.half.z + b.T.half.z;
    // börja lyfta en bit innan (smällen sker på ett enda fysiksteg) och fortsätt så länge man gasar mot bilen
    if (lz < a.T.half.z * 0.5 || lz > contact + 1 + Math.max(0, closing) * 0.3 || Math.abs(lx) > a.T.half.x + b.T.half.x - 0.2) return;
    const pushing = closing > 2.5 || ((a.input.throttle || 0) > 0.5 && lz < contact + 0.8);
    if (!pushing || a.up.y < 0.6 || a.fwd.y > 0.3) return;     // nosen redan uppe: sluta lyfta (annars volt)
    const J = a.T.mass * (closing > 2.5 ? Math.min(20, 11 + closing * 0.35) : 12) * dt;
    const fp = a.T.wheels[0].z;   // framaxeln
    out.push({ veh: a, jx: a.up.x * J, jy: a.up.y * J, jz: a.up.z * J, px: a.pos.x + a.fwd.x * -fp, py: a.pos.y, pz: a.pos.z + a.fwd.z * -fp });
  }

  // Tillbehör fram: A kör in i B med nosen. Plogen knuffar undan B åt sidan, kilen lyfter
  // den närmaste änden så B åker upp och välter, murbräckan smäller till. (Plog/kil/murbräcka
  // finns också som riktiga kroppar fram — det här är extra knuff ovanpå.)
  gearFront(A, B, dt, out) {
    const a = A.veh, b = B.veh, G = a.T.gear || [], loader = !!a.T.loader;
    if ((!G.length && !loader) || A.wrecked || B.wrecked) return;
    const plow = G.includes('plog') || loader, wedge = G.includes('kil'), ram = G.includes('ram');
    if (!plow && !wedge && !ram) return;
    const M = mountOf(a.T);
    const rx = b.pos.x - a.pos.x, ry = b.pos.y - a.pos.y, rz = b.pos.z - a.pos.z;
    const lz = rx * a.fwd.x + ry * a.fwd.y + rz * a.fwd.z, lx = rx * a.right.x + ry * a.right.y + rz * a.right.z;
    // glipan mellan spetsen på tillbehöret och B:s närmaste kant
    const tip = M.fz + (loader ? M.loaderZ + 0.25 : plow ? M.plowL : wedge ? M.wedgeL : 1.0);
    const gap = lz - b.T.half.z - tip;
    if (lz < a.T.half.z * 0.5 || gap > 0.6 || Math.abs(lx) > a.T.half.x + b.T.half.x * 0.85 || a.up.y < 0.5) return;
    const closing = (a.vel.x - b.vel.x) * a.fwd.x + (a.vel.z - b.vel.z) * a.fwd.z;
    const touching = gap < 0.3, pushing = touching && (a.input.throttle || 0) > 0.4;
    const lifting = loader && (a.loader || 0) > 0.04 && gap < 0.55;
    if (closing < 2 && !pushing && !lifting) return;
    // lätta bilar rår inte på tunga: bussen plogar allt, stockcaren lyfter inte bussen
    const heavy = Math.min(1.4, Math.max(0.3, a.T.mass / b.T.mass));
    const k = heavy * Math.min(1.2, 0.5 + Math.max(0, closing) / 14);
    const m = b.T.mass;
    if (ram && touching && closing > 3 && !(B.ramCD > this.time)) {
      // murbräckan: en rejäl smäll + knuff framåt
      B.ramCD = this.time + 0.5;
      const dmg = Math.min(34, (closing - 1.5) * 2.8) / b.T.armor * (b.T.gear?.includes('pushbar') ? 0.5 : 1);
      B.health -= dmg; B.lastDmgT = this.simT;
      const J = m * Math.min(7, 1.5 + closing * 0.35) * heavy;
      out.push({ veh: b, jx: a.fwd.x * J, jy: m * 0.8 * heavy, jz: a.fwd.z * J, px: b.pos.x, py: b.pos.y - 0.2, pz: b.pos.z });
      b.spinT = Math.max(b.spinT, 0.8);
      const hp = _v2.set(a.pos.x + a.fwd.x * tip, a.pos.y, a.pos.z + a.fwd.z * tip);
      this.fx.tackle(hp, b.vel, _v3.set(a.fwd.x, 0, a.fwd.z), Math.min(2, closing / 6));
      if (A === this.me || B === this.me) this.audio?.crash(8 + closing, 1);
      if (!B.ramMsgT || this.time - B.ramMsgT > 2.5) {
        B.ramMsgT = this.time;
        this.notify(A, `🔨 Murbräckan smällde in i ${B.name}!`, 'good');
        this.notify(B, `🔨 ${A.name} rammade dig!`, 'bad');
      }
      if (B.health <= 0) this.wreck(B);
    }
    if (wedge) {
      // lyft B:s ände närmast kilen (lite åt den sida B sitter på, så den rullar över)
      const J = m * 15 * Math.min(1, heavy) * Math.min(1.2, 0.5 + Math.max(0, closing) / 14) * (closing > 2 ? 1 : 0.5) * dt, sd = Math.sign(lx) || 1;
      const px = b.pos.x - a.fwd.x * b.T.half.z * 0.7 - a.right.x * sd * 0.4, pz = b.pos.z - a.fwd.z * b.T.half.z * 0.7 - a.right.z * sd * 0.4;
      out.push({ veh: b, jx: a.fwd.x * J * 0.25, jy: J, jz: a.fwd.z * J * 0.25, px, py: b.pos.y, pz });
      // kilbilen trycks ner i nosen i stället för att själv välta
      out.push({ veh: a, jx: 0, jy: -J * 0.35, jz: 0, px: a.pos.x + a.fwd.x * a.T.half.z, py: a.pos.y, pz: a.pos.z + a.fwd.z * a.T.half.z });
      b.pressF = Math.min(b.pressF, 0.35); b.pressR = Math.min(b.pressR, 0.35);
      b.spinT = Math.max(b.spinT, 0.6);
    }
    if (lifting) {
      // skopan uppe: ta tag i B:s närmaste ände och lyft den mot skopans kant (B tappar greppet, kan välta)
      const s = (b.fwd.x * a.fwd.x + b.fwd.z * a.fwd.z) >= 0 ? -1 : 1, e = b.T.half.z * 0.75;
      const ex = b.pos.x + b.fwd.x * s * e, ey = b.pos.y + b.fwd.y * s * e, ez = b.pos.z + b.fwd.z * s * e;
      const lip = a.pos.y + loaderPose(a.T, a.loader).y + 0.35;
      // lyfter bara så fort skopan själv rör sig (annars skjuts bilen iväg i stället för att lyftas)
      const want = Math.min(1.2, Math.max(0, lip - ey + 0.3)), rising = b.vel.y < 1.2 + Math.max(0, a.loaderRate || 0) * 2.5;
      const J = rising ? m * (CONF.GRAV * 0.45 + 9 * want + 6 * Math.max(0, a.loaderRate || 0)) * Math.min(1, heavy ** 1.5 * 1.2) * dt : 0;
      if (J > 0) out.push({ veh: b, jx: a.fwd.x * J * 0.12, jy: J, jz: a.fwd.z * J * 0.12, px: ex, py: ey, pz: ez });
      // traktorn trycks ner i nosen i stället för att själv tippa
      const Ja = Math.min(J * 0.45, a.T.mass * 6 * dt);
      if (Ja > 0) out.push({ veh: a, jx: 0, jy: -Ja, jz: 0, px: a.pos.x + a.fwd.x * a.T.half.z, py: a.pos.y, pz: a.pos.z + a.fwd.z * a.T.half.z });
      b.pressF = Math.min(b.pressF, 0.3); b.pressR = Math.min(b.pressR, 0.2);
      b.spinT = Math.max(b.spinT, 0.8);
      B.lastHitBy = A; B.lastHitT = this.time;
      if (a.loader > 0.4 && (!B.liftMsgT || this.time - B.liftMsgT > 3)) {
        B.liftMsgT = this.time;
        this.notify(A, `🚜 Du lyfter ${B.name}!`, 'good');
        this.notify(B, `🚜 ${A.name} lyfter dig med skopan!`, 'bad');
      }
    }
    if (plow && !(loader && (a.loader || 0) > 0.3)) {
      // V-plogen: åt den sida B sitter på (mitt framför: slumpa en gång per kontakt)
      if (Math.abs(lx) > 0.25 || !B.plowSide || this.time - (B.plowT || 0) > 1) B.plowSide = Math.sign(lx) || (Math.random() < 0.5 ? -1 : 1);
      B.plowT = this.time;
      // knuffen tar i B:s närmaste ände: den vrids och glider undan (en ren sidoknuff äter däcken upp)
      const side = B.plowSide, J = m * 20 * k * (loader ? 0.75 : 1) * dt, near = b.T.half.z * 0.55;
      out.push({ veh: b, jx: a.right.x * side * J + a.fwd.x * J * 0.25, jy: J * 0.08, jz: a.right.z * side * J + a.fwd.z * J * 0.25,
        px: b.pos.x - a.fwd.x * near, py: b.pos.y + 0.1, pz: b.pos.z - a.fwd.z * near });
      b.pressF = Math.min(b.pressF, 0.5); b.pressR = Math.min(b.pressR, 0.3);
      b.spinT = Math.max(b.spinT, 0.7);
    }
    if (plow || wedge) {
      B.lastHitBy = A; B.lastHitT = this.time;
      if (closing > 3 && (!B.gearMsgT || this.time - B.gearMsgT > 3)) {
        B.gearMsgT = this.time;
        this.notify(A, `${wedge ? '📐 Du kilade' : loader ? '🚜 Du skopade undan' : '🚜 Du plogade'} ${B.name}!`, 'good');
        this.notify(B, `${A.name} ${wedge ? '📐 kilade' : loader ? '🚜 skopade undan' : '🚜 plogade'} dig!`, 'bad');
      }
    }
  }

  // Jetlågan bränner: den som är i lågan bakom en jetrullstol tar skada. Lågans längd är samma som
  // i bilden (vehicles3d2.js updFlame): 0,18 m på tomgång upp till 2,3 m på full gas.
  jetBurn(dt) {
    for (const A of this.cars) {
      const a = A.veh, T = a.T;
      if (!T.jetX || A.wrecked || A.hidden || A.ghostT > 0) continue;
      const thr = a.input.throttle || 0;
      if (thr < 0.1) continue;
      const len = 0.18 + 2.1 * thr, heat = Math.max(0, (thr - 0.4) / 0.6);   // bränner först över halv gas
      for (const B of this.cars) {
        if (B === A || B.wrecked || B.hidden || B.ghostT > 0) continue;
        const b = B.veh;
        const rx = b.pos.x - a.pos.x, ry = b.pos.y - a.pos.y, rz = b.pos.z - a.pos.z;
        const behind = -(rx * a.fwd.x + ry * a.fwd.y + rz * a.fwd.z), lx = rx * a.right.x + ry * a.right.y + rz * a.right.z;
        const ext = Math.max(b.T.half.z, b.T.half.x);                  // B kan stå snett
        if (Math.abs(ry) > 2 || behind - ext > T.jetZ + len || behind + ext < T.jetZ) continue;
        if (!T.jetX.some(jx => Math.abs(lx - jx) < b.T.half.x + 0.35)) continue;
        if (heat <= 0) continue;
        B.health -= 12 * heat * dt / b.T.armor;
        B.lastDmgT = this.simT; B.lastHitBy = A; B.lastHitT = this.time;
        if (Math.random() < dt * 12) this.fx.sparks(_v2.set(b.pos.x, b.pos.y + 0.3, b.pos.z), b.vel, 3, 2);
        if (!B.burnMsgT || this.time - B.burnMsgT > 3) {
          B.burnMsgT = this.time;
          this.notify(B, `🔥 Du kör i ${A.name}s jetlåga — akta!`, 'bad');
          this.notify(A, `🔥 ${B.name} grillas i din jetlåga!`, 'good');
        }
        if (B.health <= 0) this.wreck(B);
      }
    }
  }

  // Planets propeller skär i det som kommer framför nosen: skada så länge den är i skivan + en knuff
  // och gnistor vid första träffen. Propellern snurrar alltid (fortare med gas).
  propSlash(dt) {
    for (const A of this.cars) {
      const a = A.veh, P = a.T.prop;
      if (!P || A.wrecked || A.hidden || A.ghostT > 0) continue;
      const spin = 0.35 + 0.65 * (a.input.throttle || 0), hubY = a.T.modelY + P.y;
      for (const B of this.cars) {
        if (B === A || B.wrecked || B.hidden || B.ghostT > 0) continue;
        const b = B.veh;
        const rx = b.pos.x - a.pos.x, ry = b.pos.y - a.pos.y, rz = b.pos.z - a.pos.z;
        const ahead = rx * a.fwd.x + ry * a.fwd.y + rz * a.fwd.z, lx = rx * a.right.x + ry * a.right.y + rz * a.right.z;
        const ly = rx * a.up.x + ry * a.up.y + rz * a.up.z;
        const ext = Math.max(b.T.half.z, b.T.half.x);
        if (ahead - ext > P.z + 0.4 || ahead + ext < P.z - 0.3) continue;            // skivan ligger inte i B
        if (Math.abs(lx) > P.r + b.T.half.x * 0.6) continue;
        if (ly - b.T.half.y > hubY + P.r || ly + b.T.half.y + b.T.colY < hubY - P.r) continue;
        B.health -= 28 * spin * dt / b.T.armor;
        B.lastDmgT = this.simT; B.lastHitBy = A; B.lastHitT = this.time;
        if (!(B.chopCD > this.time)) {
          B.chopCD = this.time + 0.35;
          const m = b.T.mass, J = m * 1.6 * spin * Math.min(1.5, a.T.mass / m);
          const sd = Math.sign(lx || 1);
          b.applyJ(a.fwd.x * J + a.right.x * sd * J * 0.6, m * 0.6, a.fwd.z * J + a.right.z * sd * J * 0.6, b.pos.x, b.pos.y, b.pos.z);
          b.spinT = Math.max(b.spinT, 0.7);
          const hp = _v2.set(a.pos.x + a.fwd.x * P.z, a.pos.y + a.up.y * (hubY - 0.2), a.pos.z + a.fwd.z * P.z);
          this.fx.tackle(hp, b.vel, _v3.set(a.fwd.x, 0, a.fwd.z), 1.2);
          if (A === this.me || B === this.me) this.audio?.chop?.(1);
          if (!B.chopMsgT || this.time - B.chopMsgT > 3) {
            B.chopMsgT = this.time;
            this.notify(A, `🌀 Propellern skär i ${B.name}!`, 'good');
            this.notify(B, `🌀 ${A.name}s propeller skär i dig!`, 'bad');
          }
        }
        if (B.health <= 0) this.wreck(B);
      }
    }
  }

  // Bigfootens hjul står på en annan bil: den krossas (skada + trycks ner)
  crush(dt) {
    let map = null;
    for (const A of this.cars) {
      if (!A.veh.T?.bigWheels || A.wrecked || A.hidden) continue;
      for (const w of A.veh.wheels) {
        if (w.hitBody == null || w.hitBody < 0) continue;
        if (!map) { map = new Map(); for (const c of this.cars) map.set(c.veh.body?.handle, c); }
        const C = map.get(w.hitBody);
        if (!C || C === A || C.wrecked || C.ghostT > 0) continue;
        C.health -= 22 * dt / C.veh.T.armor;
        C.lastHitBy = A; C.lastHitT = this.time; C.lastDmgT = this.simT;
        const J = A.veh.T.mass * 3 * dt;
        C.veh.applyJ?.(0, -J, 0, C.veh.pos.x, C.veh.pos.y, C.veh.pos.z);
        if (Math.random() < dt * 30) (this.scrapes ||= []).push([w.hit.x, w.hit.y, w.hit.z, C.veh.vel.x, C.veh.vel.y, C.veh.vel.z, 0, 0]);
        if (!C.crushMsgT || this.time - C.crushMsgT > 3) {
          C.crushMsgT = this.time;
          this.notify(A, `🦶 Du kör över ${C.name}!`, 'good');
          this.notify(C, `🦶 ${A.name} kör över dig!`, 'bad');
        }
        if (C.health <= 0) this.wreck(C);
      }
    }
  }

  // B trycker på A:s sida?
  sidePress(A, B, dt, out) {
    const a = A.veh, b = B.veh;
    const rx = b.pos.x - a.pos.x, ry = b.pos.y - a.pos.y, rz = b.pos.z - a.pos.z;
    const lx = rx * a.right.x + ry * a.right.y + rz * a.right.z;     // B åt höger (+) om A
    const lz = rx * a.fwd.x + ry * a.fwd.y + rz * a.fwd.z;           // B framför (+) A
    const ax = Math.abs(lx);
    const wa = a.T.half.x, wb = b.T.half.x, la = a.T.half.z, lb = b.T.half.z, touch = wa + wb;
    if (ax < touch - 0.7 || ax > touch + 0.55 || Math.abs(lz) > la + lb) return;
    const side = Math.sign(lx);
    const zc = (Math.max(-la, lz - lb) + Math.min(la, lz + lb)) / 2; // var på A trycket sitter
    // B:s vilja: styr B mot A?
    const lxB = -(rx * b.right.x + ry * b.right.y + rz * b.right.z);
    const pushB = Math.max(0, (b.input.steer || 0) * Math.sign(lxB));
    // A håller emot: styr mot B
    const holdA = Math.max(0, (a.input.steer || 0) * side);
    const closing = -((b.vel.x - a.vel.x) * a.right.x + (b.vel.z - a.vel.z) * a.right.z) * side;
    const tight = 1 - Math.min(1, Math.max(0, (ax - touch - 0.04) / 0.5));
    if (tight <= 0.05) return;
    const rearW = Math.min(1, Math.max(0, (-zc - la * 0.08) / (la * 0.62)));
    const frontW = Math.min(1, Math.max(0, (zc - la * 0.08) / (la * 0.62)));
    const heavy = Math.sqrt(Math.min(2.6, Math.max(0.4, b.T.mass / a.T.mass)));   // tungt knuffar hårt
    // att luta sig in i knuffaren hjälper vid sidan — mot bakhjulen hjälper bara motstyrning (i girkontrollen)
    const holdEff = holdA * (1 - rearW);
    let press = Math.min(1, tight * Math.min(1, 0.25 + pushB * 0.85 + Math.max(0, closing) * 0.1) * (1 - 0.65 * holdEff) * heavy);
    if (a.assist) press *= 0.8;
    const armorA = a.T.gear?.includes('sidopansar'), barA = a.T.gear?.includes('pushbar');
    if (armorA) press *= 0.45;                                       // sidopansar: svår att flytta
    if (press > 0.03) {
      a.pressR = Math.min(a.pressR, 1 - 0.65 * press * (0.3 + 0.7 * rearW * (barA ? 0.35 : 1)));   // bakskydd: svår att PIT:a
      a.pressF = Math.min(a.pressF, 1 - 0.45 * press * (0.3 + 0.7 * frontW));
      a.pressHold = Math.max(a.pressHold, holdEff);
      if (press > 0.3) a.pressT = Math.max(a.pressT, 0.45);
      A.contactT = 0.2; A.contactWith = B; A.contactZ = zc; A.contactSide = side;
      if (press > 0.35) { A.lastHitBy = B; A.lastHitT = this.time; }
    }
    // B lutar sig in i A: kraft vid kontaktpunkten (lika stor åt andra hållet på B)
    if (pushB > 0.05 && tight > 0.3) {
      const J = 12000 * (b.T.mass / 1500) * pushB * tight * (1 - 0.5 * holdEff) * (armorA ? 0.5 : 1) * dt;
      const px = a.pos.x + a.fwd.x * zc + a.right.x * side * wa, py = a.pos.y + 0.05, pz = a.pos.z + a.fwd.z * zc + a.right.z * side * wa;
      const dx = -side * a.right.x, dz = -side * a.right.z;
      out.push({ veh: a, jx: dx * J, jy: 0, jz: dz * J, px, py, pz });
      out.push({ veh: b, jx: -dx * J, jy: 0, jz: -dz * J, px, py, pz });
    }
    // gnistor när plåten skrapar längs varandra
    const slide = Math.abs((b.vel.x - a.vel.x) * a.fwd.x + (b.vel.z - a.vel.z) * a.fwd.z);
    const grind = Math.abs(closing) > 1.5 || pushB > 0.3 || slide > 3;
    if (tight > 0.55 && grind && a.speed > 8 && Math.random() < dt * 40) {
      (this.scrapes ||= []).push([a.pos.x + a.fwd.x * zc + a.right.x * side * wa, a.pos.y + 0.05, a.pos.z + a.fwd.z * zc + a.right.z * side * wa, a.vel.x, a.vel.y, a.vel.z, -side * a.right.x, -side * a.right.z]);
    }
    if (tight > 0.55 && grind) A.grindT = 0.15;
    // fälgspikar på B: A rivs upp och tappar greppet när de nöter mot varandra
    if (b.T.gear?.includes('spikar') && tight > 0.4 && (grind || pushB > 0.1) && !A.wrecked && A.ghostT <= 0) {
      A.health -= 9 * tight * dt / a.T.armor / (armorA ? 1.6 : 1);
      A.lastDmgT = this.simT; A.lastHitBy = B; A.lastHitT = this.time;
      a.pressR = Math.min(a.pressR, armorA ? 0.85 : 0.7);
      if (Math.random() < dt * 25) (this.scrapes ||= []).push([a.pos.x + a.fwd.x * zc + a.right.x * side * wa, a.pos.y - 0.2, a.pos.z + a.fwd.z * zc + a.right.z * side * wa, a.vel.x, a.vel.y, a.vel.z, -side * a.right.x, -side * a.right.z]);
      if (!A.spikeMsgT || this.time - A.spikeMsgT > 4) {
        A.spikeMsgT = this.time;
        this.notify(B, `🌵 Spikarna river upp ${A.name}!`, 'good');
        this.notify(A, `🌵 ${B.name} har fälgspikar!`, 'bad');
      }
      if (A.health <= 0) this.wreck(A);
    }
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
      if (!other && vertical) {
        // landning efter hopp: gnistor + duns, ingen skada (bara riktigt brutala nedslag gör ont)
        if (im.dv > 9) {
          this.fx.sparks(_v2.set(car.veh.pos.x, car.veh.pos.y - 0.4, car.veh.pos.z), car.veh.vel, 10 + Math.floor(im.dv), 4);
          if (car === this.me) this.audio?.bump?.(Math.min(1, im.dv / 25));
        }
        if (im.dv < 32) continue;
      }
      if (car.ghostT > 0 || car.hidden) continue;
      const inv = _q.copy(car.veh.quat).invert();
      const dl = _v.set(im.dx, im.dy * 0.4, im.dz).normalize().applyQuaternion(inv); // knuffens riktning, lokalt
      let dmg = Math.min(CONF.DMG_MAX, (im.dv - CONF.DV_MIN + 1.2) * CONF.DMG_SCALE) * (other ? CONF.DMG_CAR : CONF.DMG_WALL);
      if (Math.abs(dl.z) > 0.65) dmg *= other ? 0.4 : 0.6; // knuff fram/bak = bumpdrafting, tål mer
      dmg /= car.veh.T.armor;                                // bussen tål mest
      if (other) dmg *= Math.min(1.8, Math.max(0.6, other.veh.T.mass / car.veh.T.mass) ** 0.5);
      dmg *= this.gearDamage(car, other, dl);
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
          const m = car.veh.T.mass, J = CONF.TACKLE_JUICE * car.veh.T.stab * Math.min(1.6, Math.max(0.5, other.veh.T.mass / car.veh.T.mass));
          const k = Math.min(1.2, (im.dv - 7) / 10) * J;
          const big = im.dv > 13;
          car.veh.body.applyImpulse({ x: im.dx * m * 0.3 * k, y: big ? m * Math.min(3.4, im.dv * 0.22) * k : m * 0.6 * k, z: im.dz * m * 0.3 * k }, true);
          const roll = big ? Math.sign(dl.x) * car.veh.T.inertia.z * (1.6 + Math.random() * 2.4) * k : 0;
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

  // Tillbehörens inverkan på en smäll: var sitter smällen på mig, och slog den andra med nosen?
  gearDamage(car, other, dl) {
    const v = car.veh, G = v.T.gear;
    let k = 1;
    if (!other) {
      // mot muren: framifrån tål tjurfångare/plog/kil/murbräcka mer
      if (G && dl.z > 0.65 && (G.includes('bullbar') || G.includes('ram') || G.includes('plog') || G.includes('kil'))) k *= 0.55;
      if (G && Math.abs(dl.x) > 0.55 && G.includes('sidopansar')) k *= 0.6;
      return k;
    }
    const o = other.veh;
    const rx = o.pos.x - v.pos.x, rz = o.pos.z - v.pos.z;
    const mz = rx * v.fwd.x + rz * v.fwd.z, mx = rx * v.right.x + rz * v.right.z;    // den andra sett från mig
    const wide = v.T.half.x + o.T.half.x;
    const myFront = mz > v.T.half.z * 0.55 && Math.abs(mx) < wide, myRear = mz < -v.T.half.z * 0.55 && Math.abs(mx) < wide;
    const oz = -(rx * o.fwd.x + rz * o.fwd.z), ox = -(rx * o.right.x + rz * o.right.z);   // jag sett från den andra
    const byFront = oz > o.T.half.z * 0.55 && Math.abs(ox) < wide;
    if (byFront && o.T.gear?.includes('ram')) k *= 3;            // murbräckan (stora smällar; knuffen sitter i gearFront)
    if (G) {
      if (myFront && G.includes('bullbar')) k *= 0.45;
      if (myFront && (G.includes('ram') || G.includes('plog') || G.includes('kil'))) k *= 0.6;
    }
    if (myFront && v.T.loader) k *= 0.6;
    if (G) {
      if (myRear && G.includes('pushbar')) k *= 0.5;
      if (Math.abs(dl.x) > 0.55 && G.includes('sidopansar')) k *= 0.55;
    }
    return k;
  }

  carState(car, dt) {
    const v = car.veh, T = this.track;
    if (car.hitCD > 0) car.hitCD -= dt;
    if (car.comebackT > 0) car.comebackT -= dt;
    if (car.hidden) return; // bot som väntar osynlig i lobbyn
    if (car.ghostT > 0) { car.ghostT -= dt; if (car.ghostT <= 0) v.setGhost(false); }
    // Väggvakt (i stället för CCD): har bilen ändå hamnat genom muren puttas den tillbaka
    // innanför och sidofarten studsar — men inte om den flyger högt över muren
    // mätt längs den doserade vägbanan (muren står vinkelrätt mot den — i en lutande kurva lutar den utåt)
    const gi = car.trk.i, ox = v.pos.x - T.px[gi], oy = v.pos.y - T.py[gi], oz = v.pos.z - T.pz[gi];
    const wallOut = Math.abs(ox * T.rx[gi] + oy * T.ry[gi] + oz * T.rz[gi]) - T.halfW;
    const inGap = !!(car.trk.f & F_GAP);
    const dyRoad = ox * T.ux[gi] + oy * T.uy[gi] + oz * T.uz[gi], inTunnel = !!(car.trk.f & F_TUNNEL);
    const nearRoad = dyRoad > -2.5 && dyRoad < (inTunnel ? 9.5 : 12 / Math.min(1, T.def.grav ?? 1));
    if (!car.wrecked && !inGap && wallOut > 0.9 && wallOut < 10 && nearRoad) {
      const sd = Math.sign(car.trk.lat), i = car.trk.i, rhx = -T.hz[i], rhz = T.hx[i];
      const lv = v.body.linvel(), vl = lv.x * rhx + lv.z * rhz;
      const back = wallOut + 1.6;
      const p = v.body.translation();
      v.body.setTranslation({ x: p.x - rhx * sd * back, y: p.y, z: p.z - rhz * sd * back }, true);
      this.wallGuardN = (this.wallGuardN || 0) + 1; this.guardLog?.push([Math.round(car.trk.s), +wallOut.toFixed(1), +dyRoad.toFixed(1), car.trk.f, Math.round(v.speed * 3.6)]);
      if (vl * sd > 0) v.body.setLinvel({ x: lv.x - rhx * vl * 1.3, y: lv.y, z: lv.z - rhz * vl * 1.3 }, true);
      v.readState();
      T.project(v.pos.x, v.pos.z, i, car.trk);
    }
    car.lastLat = car.trk.lat;
    // Mot kanten: hörnen räknas ut i sidled — skrapar man tappar man fart och det gnistrar
    if (!car.wrecked && !inGap && v.grounded >= 2) {
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
    // R-spärren: i luften går R inte, och låset gäller AIR_LOCK s från att bilen lämnade marken;
    // på taket räknas tiden bara när bilen faktiskt ligger mot marken (inte när den voltar i luften)
    const upside = v.up.y < 0.3;
    const lying = upside && v.nearGround();
    car.airT = v.grounded > 0 || lying ? 0 : (car.airT || 0) + dt;
    const air = car.airT > 0.5;   // gupp och små skutt räknas inte
    // låset räknas från första avfärden — en studs efter landningen startar inte om mätaren
    if (air && !car.wasAir && !(car.lockT > 0)) car.lockT = CONF.AIR_LOCK - car.airT;
    car.wasAir = air;
    if (car.lockT > 0) car.lockT = Math.max(0, car.lockT - dt);
    if (lying) car.flipT += dt; else if (!upside || car.airT > 0.7) car.flipT = 0;
    car.rstate = air ? 1 : upside ? 2 : 0;
    if (car.flipT > CONF.FLIP_AUTO && v.speed < 9) this.respawn(car, 10, 'flip');
    // lava längs kanterna: bränner den som kör i den
    if ((car.trk.f & F_LAVA) && Math.abs(car.trk.lat) > T.halfW - LAVA_IN && v.grounded > 0 && v.pos.y < car.trk.y + 2.5) {
      car.health -= 16 * dt / v.T.armor; car.lastDmgT = this.simT;
      if (Math.random() < dt * 20) this.fx.fire(v.pos, v.vel, 1.4);
      if (!car.lavaMsgT || this.time - car.lavaMsgT > 3) { car.lavaMsgT = this.time; this.notify(car, '🔥 Lava! Kör in mot mitten!', 'bad'); }
      if (car.health <= 0) { this.wreck(car); return; }
    }
    // utanför banan
    if (Math.abs(car.trk.lat) > T.halfW + 5 || v.pos.y < car.trk.y - 12) car.offT += dt; else car.offT = 0;
    if (v.pos.y < car.trk.y - 4 && (car.trk.f & F_GAP || T.flags[(car.trk.i + 4) % T.N] & F_GAP || T.flags[(car.trk.i - 4 + T.N) % T.N] & F_GAP)) car.offT += dt * 2.5;
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
      const VT = v.T || car.view.T;
      v.wheels.forEach((w, k) => car.view.setWheel(k, (w.grounded ? w.dist : VT.rayLen) - VT.wheelR, w.spin, w.front ? v.steer : 0));
      car.view.setLoader?.(v.loader || 0);
      if (car.view.setThrust) {
        // jetlågan: egen gas (värden ser alla) — gästen gissar på andras gas utifrån farten
        const thr = this.mode !== 'client' || car === this.me ? (v.input?.throttle || 0) : (v.speed < (v.vmax || 80) * 0.96 ? 1 : 0.5);
        car.view.setThrust(car.wrecked || car.hidden ? 0 : thr, this.time);
      }
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
        _v.set(0, VT.hood.y, VT.hood.z).applyQuaternion(v.quat).add(v.pos); // motorhuven
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
    this.weapons.frame(dt);
    this.world3d.update?.(dt, this.time, this.camera.position, this.fx, (p) => {
      const near = this.me ? Math.max(0, 1 - this.me.veh.pos.distanceTo(p) / 260) : 0.4;
      if (near > 0.05) this.audio?.blast?.(near * 0.8);
    });
    this.fx.update(dt);
    this.trails.update(this.time);
    this.skids.update(this.time);

    // Grand Prix: prispallen
    if (this.race.phase === 'podium' && this.gp?.podium && !this.podium) this.podium = new Podium(this);
    if (this.race.phase !== 'podium' && this.podium) { this.podium.dispose(); this.podium = null; }
    if (this.podium) this.podium.frame(dt, this.gp.podium || []);
    // kamera
    const me = this.me;
    if (this.podium) {
      this.podium.camera(this.camera, dt);
      this.plate.mesh.visible = false;
    } else if (this.showcase) {
      // garaget: kameran går runt den visade bilen
      this.orbit += dt * 0.35;
      const p = this.showcase.group.position;
      const oR = this.showcase.orbitR || 7.2;
      this.camera.position.set(p.x + Math.cos(this.orbit) * oR, p.y + 2.2 + (oR - 7.2) * 0.3, p.z + Math.sin(this.orbit) * oR);
      this.camera.lookAt(p.x, p.y + 0.2, p.z);
      this.plate.mesh.visible = false;
    } else if (me) {
      const g = me.view.group;
      this.cam.extra = me.veh.T.cam;
      this.cam.update(dt, g.position, me.veh.fwd, me.veh.vel, me.veh.speed * 3.6);
      // fart på vägen bakom bilen
      _v.copy(me.veh.fwd); _v.y = 0; _v.normalize();
      const back = me.veh.T.half.z + 1.3;
      const px = g.position.x - _v.x * back, pz = g.position.z - _v.z * back;
      const pr = T.project(px, pz, me.trk.i, {});
      const onRoad = Math.abs(pr.lat) < T.halfW;
      const gy = onRoad ? pr.y + 0.04 : this.world3d.terr.heightAt(px, pz) + 0.08;
      T.sampleAt(pr.s, _f);
      this.plate.set(me.veh.speed * 3.6);
      this.plate.place(_v2.set(px, gy, pz), new THREE.Vector3(_f.ux, _f.uy, _f.uz), me.veh.fwd, !me.wrecked && Math.abs(gy - (g.position.y + me.veh.T.modelY)) < 3);
    } else {
      // meny: kameran svävar runt startportalen
      this.orbit += dt * 0.08;
      const f = T.sampleAt(T.wrapS(-40), _f);
      this.camera.position.set(f.x + Math.cos(this.orbit) * 55, f.y + 16, f.z + Math.sin(this.orbit) * 55);
      this.camera.lookAt(f.x + 20, f.y + 4, f.z);
      this.plate.mesh.visible = false;
    }
    // inne i en tunnel: mörkare + eko
    const tk = me ? me.trk : null;
    const inTun = tk && (T.flags[tk.i] & F_TUNNEL) && Math.abs(tk.lat) < T.halfW + 2 && me.veh.pos.y < tk.y + 8 ? 1 : 0;
    this.tunnelK = (this.tunnelK || 0) + (inTun - (this.tunnelK || 0)) * Math.min(1, dt * 4);
    this.sceneApi.setTunnel?.(this.tunnelK);
    this.audio?.setTunnel?.(this.tunnelK);
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
