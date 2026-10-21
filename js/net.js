// Nätverk via PeerJS, värd-auktoritativt: värden kör all fysik, gästerna skickar
// knapptryck (30 Hz) och får ögonblicksbilder (20 Hz) + händelser (smällar, vrak, resultat).
import * as THREE from 'three';
import { PROTO } from './config.js?v=34';
import { Weapons } from './weapons.js?v=34';
import { VTYPES } from './vtypes.js?v=34';

// Rummets id hos PeerJS. Versionen ingår INTE (då hamnade en kompis med en äldre flik i ett eget rum utan
// att någon märkte det) — i stället jämförs versionen i 'hello' och den äldre laddar om sig själv.
const PREFIX = 'knuffrakan-rum-';
// rumskoden → id: bara A–Z/0–9 (PeerJS godtar inte åäö — "HÄST" gick inte att skapa alls): Å/Ä → A, Ö → O
export const roomKey = (room) => String(room || '').toUpperCase().replace(/[ÅÄ]/g, 'A').replace(/Ö/g, 'O').replace(/[^A-Z0-9]/g, '') || 'RUM';
// Relästation (TURN) för nät där två enheter inte når varandra direkt (skolans wifi, gästnät, många mobilnät).
// PeerJS egna TURN-servrar finns inte längre — en fungerande läggs här (kräver ett gratiskonto).
const TURN = [];
const PEER_OPTS = { config: { iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }, ...TURN] } };
const ROW = 28;     // flyttal per bil i en ögonblicksbild
const HEAD = 6;     // [tid, fas, t, raceT, closeT, antal]
const PHASES = ['idle', 'grid', 'count', 'race', 'results', 'lobby', 'podium'];

function loadPeer() {
  if (window.Peer) return Promise.resolve(window.Peer);
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.2/dist/peerjs.min.js';
    s.onload = () => res(window.Peer); s.onerror = () => rej(new Error('PeerJS kunde inte laddas'));
    document.head.appendChild(s);
  });
}

const wait = (ms) => new Promise(r => setTimeout(r, ms));

// Gå med: { role: 'client', peer, conn } eller { fail }: 'nohost' (inget rum), 'blocked' (rummet finns men
// nätet stoppar kopplingen till värden), 'noserver' (kommer inte åt PeerJS-servern alls)
function tryJoin(Peer, hostId, timeout = 7000) {
  return new Promise((resolve) => {
    const peer = new Peer(PEER_OPTS);
    let done = false, opened = false;
    const fin = (v) => { if (done) return; done = true; if (!v.role) peer.destroy(); resolve(v); };
    peer.on('open', () => {
      opened = true;
      const conn = peer.connect(hostId, { serialization: 'binary', reliable: true });
      conn.on('open', () => fin({ role: 'client', peer, conn }));
      conn.on('error', () => fin({ fail: 'blocked' }));
    });
    // peer-unavailable kommer inom någon sekund om ingen värd finns; tystnad = värden finns men går inte att nå
    peer.on('error', (e) => fin({ fail: e.type === 'peer-unavailable' ? 'nohost' : opened || e.type === 'webrtc' ? 'blocked' : 'noserver' }));
    setTimeout(() => fin({ fail: opened ? 'blocked' : 'noserver' }), timeout);
  });
}

function tryHost(Peer, hostId) {
  return new Promise((resolve) => {
    const peer = new Peer(hostId, PEER_OPTS);
    let done = false;
    const fin = (v) => { if (done) return; done = true; if (!v.role) peer.destroy(); resolve(v); };
    peer.on('open', () => fin({ role: 'host', peer }));
    peer.on('error', (e) => fin({ fail: e.type === 'unavailable-id' ? 'taken' : 'noserver' }));
    setTimeout(() => fin({ fail: 'noserver' }), 8000);
  });
}

// Gå med i rummet — finns ingen värd blir man själv värd
// Ut: { role: 'host' | 'client', … } eller { fail: 'blocked' | 'noserver' | 'nohost' }
export async function connectRoom(room, onStatus) {
  const Peer = await loadPeer();
  const hostId = PREFIX + roomKey(room);
  let fail = 'nohost';
  for (let attempt = 0; attempt < 3; attempt++) {
    onStatus?.(attempt && fail === 'blocked' ? 'Rummet finns — försöker koppla upp igen…' : 'Letar efter rummet…');
    const c = await tryJoin(Peer, hostId, attempt === 0 ? 8000 : 10000);
    if (c.role) return c;
    fail = c.fail;
    if (fail === 'noserver') break;
    if (fail === 'blocked') continue;             // värden finns — bli inte värd för ett eget, tomt rum
    onStatus?.('Startar rummet…');
    const h = await tryHost(Peer, hostId);
    if (h.role) return h;
    if (h.fail === 'noserver') { fail = 'noserver'; break; }
    await wait(400 + Math.random() * 800); // någon annan hann bli värd — försök gå med igen
  }
  return { fail };
}

export function carInfo(car) {
  return { id: car.id, name: car.name, spec: car.spec, human: !!car.isPlayer || !!car.remote };
}

// ---------------- Värden ----------------
export class NetHost {
  constructor(game, peer) {
    this.game = game; this.peer = peer;
    this.clients = new Map(); // conn → car
    this.snapT = 0;
    peer.on('connection', (conn) => this.onConn(conn));
    peer.on('disconnected', () => { try { peer.reconnect(); } catch { /* ok */ } });
  }
  onConn(conn) {
    conn.on('data', (d) => this.onData(conn, d));
    conn.on('close', () => this.drop(conn));
    conn.on('error', () => this.drop(conn));
  }
  onData(conn, d) {
    const g = this.game;
    if (!d || typeof d !== 'object') return;
    if (d.t === 'hello') {
      // olika versioner: den äldre laddar om sig själv (gästen direkt; värden när den inte är mitt i ett race)
      if (d.proto !== PROTO) { conn.send({ t: 'old', proto: PROTO }); if (d.proto > PROTO) g.onNewerGuest?.(); return; }
      if (this.clients.has(conn)) return;
      const car = g.addRemotePlayer(String(d.name || 'Gäst').slice(0, 16), d.spec, conn);
      this.clients.set(conn, car);
      conn.send({ t: 'welcome', you: car.id, track: g.trackId, cars: g.cars.map(carInfo), winner: g.race.lastWinner, gp: g.gpPublic?.() });
      this.broadcast({ t: 'add', car: carInfo(car) }, conn);
      g.notifyAll(`👋 ${car.name} är med!`);
      return;
    }
    const car = this.clients.get(conn);
    if (!car) return;
    if (d.t === 'in') {
      const r = car.remoteInput;
      r.throttle = +d.a || 0; r.brake = +d.b || 0; r.steer = Math.max(-1, Math.min(1, +d.s || 0)); r.handbrake = +d.h || 0; r.loader = +d.k || 0; r.fire = +d.w || 0;
    } else if (d.t === 'reset') g.requestReset(car);
    else if (d.t === 'ready') { g.setReady(car, d.on); this.lobbyT = 1; }
    else if (d.t === 'spec' && d.spec) { g.setSpec(car, d.spec); this.broadcast({ t: 'spec', id: car.id, spec: d.spec }, conn); }
  }
  drop(conn) {
    const car = this.clients.get(conn);
    if (!car) return;
    this.clients.delete(conn);
    this.game.removeRemotePlayer(car);
    this.broadcast({ t: 'remove', id: car.id });
    this.game.notifyAll(`${car.name} lämnade`);
  }
  broadcast(msg, except) {
    for (const c of this.clients.keys()) if (c !== except && c.open) { try { c.send(msg); } catch { /* ok */ } }
  }
  sendTo(car, msg) {
    for (const [c, k] of this.clients) if (k === car && c.open) { try { c.send(msg); } catch { /* ok */ } }
  }
  update(dt) {
    if (!this.clients.size) return;
    // lobbypanelen till gästerna två gånger i sekunden (direkt när någon trycker REDO)
    if (this.game.race.phase === 'lobby') {
      this.lobbyT = (this.lobbyT || 0) + dt;
      if (this.lobbyT > 0.5) { this.lobbyT = 0; this.broadcast({ t: 'lobbystate', info: this.game.lobbyState() }); }
    }
    this.snapT += dt;
    if (this.snapT < 0.05) return;
    this.snapT = 0;
    const g = this.game, r = g.race, cars = g.cars;
    const pk = g.weapons ? g.weapons.pack() : new Float32Array([0]);
    const a = new Float32Array(HEAD + cars.length * ROW + pk.length);
    a.set(pk, HEAD + cars.length * ROW);
    a[0] = g.simT; a[1] = PHASES.indexOf(r.phase); a[2] = r.t; a[3] = r.raceT; a[4] = r.closeT; a[5] = cars.length;
    cars.forEach((c, k) => {
      const v = c.veh, o = HEAD + k * ROW;
      a[o] = c.id;
      a[o + 1] = v.pos.x; a[o + 2] = v.pos.y; a[o + 3] = v.pos.z;
      a[o + 4] = v.quat.x; a[o + 5] = v.quat.y; a[o + 6] = v.quat.z; a[o + 7] = v.quat.w;
      a[o + 8] = v.vel.x; a[o + 9] = v.vel.y; a[o + 10] = v.vel.z;
      a[o + 11] = v.steer;
      for (let w = 0; w < 4; w++) a[o + 12 + w] = v.wheels[w].grounded ? v.wheels[w].dist : -1;
      a[o + 16] = c.health;
      let f = 0;
      if (c.wrecked) f |= 1; if (c.ghostT > 0) f |= 2; if (c.drafting) f |= 4; if (c.finished) f |= 8;
      if (v.wheels[2].slip > 0.35) f |= 16; if (v.wheels[3].slip > 0.35) f |= 32; if (v.hold) f |= 64;
      if (c.scrapeT > 0) f |= 128; if (c.grindT > 0) f |= 256; if (c.hidden) f |= 512; if (c.firing) f |= 1024;
      if (c.flatT > 0) f |= 2048; if (c.spookT > 0) f |= 4096; if (c.punctT > 0) f |= 8192;
      if (c.frozenT > 0) f |= 16384; if (c.shrinkT > 0) f |= 32768; if (c.shieldT > 0) f |= 65536; if (c.ballT > 0) f |= 131072; if (c.burnT > 0) f |= 262144;
      a[o + 17] = f;
      a[o + 18] = c.place;
      a[o + 19] = c.prog;
      a[o + 20] = v.vmax;
      a[o + 21] = c.saves ?? 3;
      a[o + 22] = c.lockT || 0; a[o + 23] = c.flipT || 0; a[o + 24] = c.rstate || 0; a[o + 25] = (v.loader || 0) + (v.T.special ? Math.round(Math.min(1, Math.max(0, v.tank ?? 1)) * 100) * 2 : 0);   // läge 0..1 + tank·200
      a[o + 26] = Weapons.code(c); a[o + 27] = c.weapon?.ammo || 0;
    });
    this.broadcast({ t: 's', b: a.buffer });
  }
}

// Bil hos gästen: samma läsfält som Vehicle, men styrd av ögonblicksbilder
export class RemoteVeh {
  constructor(T = VTYPES.stock) {
    this.T = T;
    this.pos = new THREE.Vector3(); this.quat = new THREE.Quaternion(); this.vel = new THREE.Vector3();
    this.fwd = new THREE.Vector3(0, 0, -1); this.up = new THREE.Vector3(0, 1, 0); this.right = new THREE.Vector3(1, 0, 0);
    this.speed = 0; this.vLong = 0; this.steer = 0; this.hold = false; this.vmax = 80; this.disabled = false;
    this.input = { throttle: 0, brake: 0, steer: 0, handbrake: 0 };
    this.wheels = T.wheels.map(w => ({ x: w.x, z: w.z, front: w.front, grounded: true, dist: T.rayLen * 0.8, spin: 0, slip: 0,
      hit: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0) }));
    this._q = new THREE.Quaternion(); this._a = new THREE.Vector3();
  }
  set(ra, rb, al, dt) {
    const L = (i) => ra[i] + (rb[i] - ra[i]) * al;
    this.pos.set(L(1), L(2), L(3));
    this.quat.set(ra[4], ra[5], ra[6], ra[7]);
    this._q.set(rb[4], rb[5], rb[6], rb[7]);
    this.quat.slerp(this._q, al);
    this.vel.set(L(8), L(9), L(10));
    this.steer = L(11);
    this.fwd.set(0, 0, -1).applyQuaternion(this.quat);
    this.up.set(0, 1, 0).applyQuaternion(this.quat);
    this.right.set(1, 0, 0).applyQuaternion(this.quat);
    this.speed = this.vel.length();
    this.vLong = this.vel.dot(this.fwd);
    const f = rb[17];
    this.hold = !!(f & 64);
    this.wheels.forEach((w, k) => {
      const d = rb[12 + k];
      w.grounded = d >= 0;
      w.dist = d >= 0 ? (ra[12 + k] >= 0 ? L(12 + k) : d) : this.T.rayLen;
      w.slip = k === 2 ? ((f & 16) ? 0.6 : 0) : k === 3 ? ((f & 32) ? 0.6 : 0) : 0;
      this._a.set(w.x, 0, w.z).applyQuaternion(this.quat).add(this.pos);
      w.hit.copy(this._a).addScaledVector(this.up, -w.dist);
      w.normal.copy(this.up);
      w.spin += (this.vLong / this.T.wheelR) * dt;
    });
  }
}

// ---------------- Gästen ----------------
export class NetClient {
  constructor(game, peer, conn, hello) {
    this.game = game; this.peer = peer; this.conn = conn;
    this.buf = []; this.off = null; this.inT = 0;
    this.snapNext = new Set();
    this.lost = false;
    conn.on('data', (d) => this.onData(d));
    conn.on('close', () => this.onLost());
    conn.on('error', () => this.onLost());
    peer.on('error', (e) => { if (e.type === 'peer-unavailable' || e.type === 'network') this.onLost(); });
    conn.send({ t: 'hello', proto: PROTO, ...hello });
  }
  onLost() {
    if (this.lost) return;
    this.lost = true;
    this.game.onHostLost?.();
  }
  onData(d) {
    const g = this.game;
    if (!d || typeof d !== 'object') return;
    switch (d.t) {
      case 's': this.onSnap(new Float32Array(d.b)); break;
      case 'welcome': g.clientWelcome(d); break;
      case 'add': if (!g.carById(d.car.id)) g.addCarFromInfo(d.car); break;
      case 'remove': { const c = g.carById(d.id); if (c) g.removeCar(c); break; }
      case 'spec': g.setSpec(g.carById(d.id), d.spec); break;
      case 'hit': g.clientHit(d); break;
      case 'wreck': g.clientWreck(d); break;
      case 'unwreck': { const c = g.carById(d.id); if (c) c.view.resetDamage(); break; }
      case 'respawn': this.snapNext.add(d.id); break;
      case 'grid': g.clientGrid(); break;
      case 'lobby': g.clientLobby(); break;
      case 'track': g.setTrack(d.id); g.hud?.toast('Ny bana: ' + (g.track.namn || d.id)); break;
      case 'lobbystate':
        g.lobbyInfo = d.info;
        for (const p of d.info.players || []) { const c = g.carById(p.id); if (c) c.ready = p.ready; }
        break;
      case 'toast': g.hud?.toast(d.m, d.k); break;
      case 'flash': g.hud?.flash(d.m); if (d.beep) g.audio?.beep(true); break;
      case 'finish': g.clientFinish(d); break;
      case 'results': g.clientResults(d); break;
      case 'old': if (g.onVersionMismatch) g.onVersionMismatch(d.proto || 0); else g.hud?.toast('Någon kör en annan version — ladda om sidan', 'bad'); break;
      case 'wb': case 'wx': case 'wsh': case 'wgl': case 'wbn': case 'wsk': case 'wv2': case 'wbm': case 'wfw': case 'wbs': g.weapons?.onEvent(d); break;
      case 'splat': g.hud?.splat?.(); break;
      case 'gp': g.gp = d.gp; g.hud?.gpChanged?.(g); break;
    }
  }
  onSnap(a) {
    const now = performance.now();
    const st = a[0] * 1000;
    const est = now - st;
    if (this.off === null || est < this.off) this.off = est; else this.off += (est - this.off) * 0.01;
    const rows = new Map();
    const n = a[5];
    for (let k = 0; k < n; k++) { const o = HEAD + k * ROW; rows.set(a[o], a.subarray(o, o + ROW)); }
    if (a.length > HEAD + n * ROW) this.proj = { at: now, list: Weapons.unpack(a, HEAD + n * ROW) };
    this.buf.push({ t: st + this.off, head: a, rows });
    if (this.buf.length > 30) this.buf.shift();
  }
  // varje bildruta: skicka knapptryck, interpolera bilarna
  update(dt) {
    const g = this.game;
    this.inT += dt;
    if (this.inT > 1 / 30 && this.conn.open) {
      this.inT = 0;
      const s = g.input.state;
      this.conn.send({ t: 'in', a: +s.throttle.toFixed(2), b: +s.brake.toFixed(2), s: +s.steer.toFixed(3), h: s.handbrake, k: s.loader ? 1 : 0, w: s.fire ? 1 : 0 });
    }
    if (this.buf.length < 1) return;
    const rt = performance.now() - 110;
    let a = this.buf[0], b = this.buf[0];
    for (let i = 0; i < this.buf.length - 1; i++) {
      if (this.buf[i].t <= rt && this.buf[i + 1].t >= rt) { a = this.buf[i]; b = this.buf[i + 1]; break; }
      if (this.buf[i + 1].t < rt) { a = b = this.buf[i + 1]; }
    }
    const al = b.t > a.t ? Math.min(1, Math.max(0, (rt - a.t) / (b.t - a.t))) : 0;
    // racets läge
    const h = b.head, r = g.race;
    r.phase = PHASES[h[1]] || 'idle'; r.t = h[2]; r.raceT = h[3] + (r.phase === 'race' ? 0 : 0); r.closeT = h[4];
    g.clientLights();
    for (const car of g.cars) {
      const rb = b.rows.get(car.id); if (!rb) continue;
      let ra = a.rows.get(car.id) || rb;
      if (this.snapNext.has(car.id) || Math.hypot(rb[1] - ra[1], rb[3] - ra[3]) > 40) { ra = rb; this.snapNext.delete(car.id); }
      car.veh.set(ra, rb, ra === rb ? 1 : al, dt);
      car.p0.copy(car.veh.pos); car.p1.copy(car.veh.pos); car.q0.copy(car.veh.quat); car.q1.copy(car.veh.quat);
      car.health = rb[16];
      const f = rb[17];
      car.wrecked = !!(f & 1); car.ghostT = (f & 2) ? 1 : 0; car.drafting = !!(f & 4); car.finished = !!(f & 8);
      car.scrapeT = (f & 128) ? 0.15 : 0; car.grindT = (f & 256) ? 0.15 : 0; car.hidden = !!(f & 512);
      car.flatT = (f & 2048) ? 0.3 : 0; car.spookT = (f & 4096) ? 0.3 : 0; car.punctT = (f & 8192) ? 0.3 : 0;
      car.frozenT = (f & 16384) ? 0.3 : 0; car.shrinkT = (f & 32768) ? 0.3 : 0; car.shieldT = (f & 65536) ? 0.3 : 0; car.ballT = (f & 131072) ? 0.3 : 0; car.burnT = (f & 262144) ? 0.3 : 0;
      car.place = rb[18]; car.prog = rb[19]; car.lap = Math.floor(rb[19] / g.track.L);   // varvet ur framsteget (bara värden räknar varv) car.veh.vmax = rb[20]; car.saves = rb[21];
      car.lockT = rb[22]; car.flipT = rb[23]; car.rstate = rb[24]; { const x = rb[25], hi = Math.floor(x / 2); car.veh.loader = x - hi * 2; car.veh.tank = hi / 100; }
      car.wcode = rb[26]; car.wammo = rb[27]; car.firing = !!(f & 1024);
      car.trk.s = car.trk.s || 0;
      g.track.project(car.veh.pos.x, car.veh.pos.z, g.track.idx(((rb[19] % g.track.L) + g.track.L) % g.track.L), car.trk);
    }
    r.order = g.cars.slice().sort((x, y) => x.place - y.place);
  }
  send(msg) { if (this.conn.open) this.conn.send(msg); }
}
