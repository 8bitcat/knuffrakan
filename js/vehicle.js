// Bilfysik på en Rapier-kropp: fjädrande hjul via strålar, däckgrepp som impulser
// (i tyngdpunktshöjd så bilen inte välter av att svänga), motor med dynamisk toppfart
// (packracing) och smäll-detektering via hastighetsändring (Δv).
import * as THREE from 'three';
import { CONF } from './config.js?v=28';
import { VTYPES, SPECIALS } from './vtypes.js?v=28';
import { frontParts, loaderPose } from './gear.js?v=28';

export const GROUP_CAR = (0x0001 << 16) | 0xffff;
export const GROUP_GHOST = (0x0001 << 16) | 0x0002;   // krockar bara med världen
export const GROUP_GEAR = (0x0004 << 16) | 0x0001;    // plog/kil/murbräcka: bara mot andra bilar (inte väg och murar)
const GEAR_GHOST = (0x0004 << 16) | 0x0000;

// standardbilen (stockcar) — övriga typer i vtypes.js
export const CP = VTYPES.stock;

const _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
const _R = new THREE.Vector3(), _U = new THREE.Vector3(), _F = new THREE.Vector3();
const _a = new THREE.Vector3(), _c = new THREE.Vector3(), _n = new THREE.Vector3(), _wf = new THREE.Vector3(), _ws = new THREE.Vector3();
const _pv = new THREE.Vector3(), _r = new THREE.Vector3(), _j = new THREE.Vector3(), _t = new THREE.Vector3();
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
// största styrvinkel vid en viss fart (delas med AI:n)
export const steerMaxAt = (v, T = CP) => T.steerMax / (1 + Math.abs(v) / 20);

export class Vehicle {
  constructor(sim, pos, quat, type = CP) {
    const { RAPIER, world } = sim;
    this.sim = sim;
    const T = this.T = type;
    // OBS: CCD avstängt — kostade 17 av 18 ms per fysiksteg; väggvakten i game.js räcker
    const bd = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y, pos.z).setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w })
      .setCcdEnabled(false).setLinearDamping(0.02).setAngularDamping(0.4).setCanSleep(false);
    this.body = world.createRigidBody(bd);
    const cd = RAPIER.ColliderDesc.cuboid(T.half.x, T.half.y, T.half.z)
      .setTranslation(0, T.colY, 0)
      .setMassProperties(T.mass, { x: 0, y: 0, z: 0 }, T.inertia, { x: 0, y: 0, z: 0, w: 1 })
      .setFriction(0.22).setRestitution(0.28).setCollisionGroups(GROUP_CAR);
    this.collider = world.createCollider(cd, this.body);
    this.colliders = [this.collider];
    // bigfootens jättedäck är egna kroppsdelar: andra bilar studsar mot dem
    if (T.bigWheels) {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
      for (const w of T.wheels) {
        const wd = RAPIER.ColliderDesc.cylinder(0.42, T.wheelR - 0.05).setDensity(0)
          .setTranslation(w.x, T.modelY + T.wheelR + 0.12, w.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
          .setFriction(0.5).setRestitution(0.35).setCollisionGroups(GROUP_CAR);
        this.colliders.push(world.createCollider(wd, this.body));
      }
    }
    // tillbehör fram: riktiga kroppsdelar (utan egen massa)
    for (const p of frontParts(T)) {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(p.rx, p.ry, 0));
      const gd = RAPIER.ColliderDesc.cuboid(p.hx, p.hy, p.hz).setDensity(0)
        .setTranslation(p.x, p.y, p.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        .setFriction(p.fr).setRestitution(p.wall ? 0 : 0.15).setCollisionGroups(p.wall ? GROUP_GHOST : GROUP_GEAR);
      const c = world.createCollider(gd, this.body);
      c.isGear = !p.wall; c.wallOnly = !!p.wall;
      this.colliders.push(c);
      if (p.id === 'skopa') this.loaderCol = c;
    }
    this.loader = 0; this.loaderRate = 0;    // frontlastaren: 0 nere … 1 uppe (specialförmågorna: hur mycket de är igång)
    this.slipT = 0; this.slipK = 1;          // halt underlag: tid kvar och greppets faktor
    this.ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
    this.wheels = T.wheels.map(w => ({
      x: w.x, z: w.z, front: w.front, comp: 0, prevComp: 0, grounded: false, load: 0,
      dist: T.rayLen, spin: 0, hit: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0), slip: 0,
    }));
    this.input = { throttle: 0, brake: 0, steer: 0, handbrake: 0, loader: 0, fire: 0, side: 0 };
    this.steer = 0;
    this.vmax = CONF.BASE_KMH / 3.6;
    this.powerMul = 1;
    this.disabled = false;   // vrak / väntar på start
    this.hold = false;       // står på griden
    this.spinT = 0;          // efter en tackling: låt bilen snurra fritt
    this.assist = false;     // bottar: stabil bil som inte driftar av sig själv
    this.drift = 0;          // 0..1 hur mycket bilen driftar just nu
    this.beta = 0;           // driftvinkel: hastighetens riktning mot nosen (+ = glider åt höger)
    this.pressF = 1; this.pressR = 1; // sidogrepp när en annan bil trycker på (sätts av spelet varje steg)
    this.pressT = 0; this.pressHold = 0;
    this.antiSpin = T.gear?.includes('pushbar') ? 1 : 0;   // bakskydd: håller emot spinn efter knuffar
    this.wallT = 0;          // skrapar mot kanten: väggen får vrida bilen parallellt
    // läs-värden
    this.pos = new THREE.Vector3(); this.quat = new THREE.Quaternion();
    this.vel = new THREE.Vector3(); this.angv = new THREE.Vector3();
    this.fwd = new THREE.Vector3(0, 0, -1); this.up = new THREE.Vector3(0, 1, 0); this.right = new THREE.Vector3(1, 0, 0);
    this.speed = 0; this.vLong = 0; this.grounded = 0;
    this.vBefore = new THREE.Vector3(); this.J = new THREE.Vector3();
    this.impact = null;
    this.readState();
  }

  // ligger karossen mot marken (taket/sidan)? stråle rakt ned från lådans mitt
  nearGround(extra = 0.9) {
    const T = this.T;
    _a.set(0, T.colY, 0).applyQuaternion(this.quat).add(this.pos);
    this.ray.origin = { x: _a.x, y: _a.y, z: _a.z };
    this.ray.dir = { x: 0, y: -1, z: 0 };
    return !!this.sim.world.castRay(this.ray, Math.max(T.half.x, T.half.y) + extra, true, undefined, undefined, undefined, this.body);
  }

  readState() {
    const b = this.body, t = b.translation(), r = b.rotation(), lv = b.linvel(), av = b.angvel();
    this.pos.set(t.x, t.y, t.z); this.quat.set(r.x, r.y, r.z, r.w);
    this.vel.set(lv.x, lv.y, lv.z); this.angv.set(av.x, av.y, av.z);
    this.right.set(1, 0, 0).applyQuaternion(this.quat);
    this.up.set(0, 1, 0).applyQuaternion(this.quat);
    this.fwd.set(0, 0, -1).applyQuaternion(this.quat);
    this.speed = this.vel.length();
    this.vLong = this.vel.dot(this.fwd);
  }

  applyJ(jx, jy, jz, px, py, pz) {
    this.body.applyImpulseAtPoint({ x: jx, y: jy, z: jz }, { x: px, y: py, z: pz }, true);
    this.J.x += jx; this.J.y += jy; this.J.z += jz;
  }

  steerMaxAt(v) { return steerMaxAt(v, this.T); }

  preStep(dt) {
    const T = this.T;
    this.readState();
    this.vBefore.copy(this.vel);
    this.J.set(0, 0, 0);
    if (this.spinT > 0) this.spinT -= dt;
    const inp = this.input, pos = this.pos, up = this.up, fwd = this.fwd, right = this.right;
    const world = this.sim.world;
    const off = this.disabled;
    const throttle = off ? 0 : inp.throttle, brake = off ? 0.15 : (this.hold ? 1 : inp.brake);
    const hand = off ? 0 : inp.handbrake;
    // frontlastaren: uppåt medan knappen hålls, snabbt ner när den släpps
    if (this.loaderCol) {
      const want = !off && inp.loader ? 1 : 0, prev = this.loader;
      this.loader = want > prev ? Math.min(1, prev + 0.95 * dt) : Math.max(0, prev - 2.4 * dt);
      this.loaderRate = (this.loader - prev) / dt;
      if (this.loader !== prev) {
        const p = loaderPose(T, this.loader), h = p.rx / 2;
        this.loaderCol.setTranslationWrtParent({ x: 0, y: p.y, z: p.z });
        this.loaderCol.setRotationWrtParent({ x: Math.sin(h), y: 0, z: 0, w: Math.cos(h) });
      }
    }
    // Specialförmågorna på E. this.loader = hur mycket den är igång (0..1, skickas till alla och syns),
    // this.tank = vatten/energi kvar (0..1) — kanonen: laddningen inför nästa skott
    if (T.special) {
      const S = SPECIALS[T.special], held = !off && !this.hold && inp.loader;
      if (S.cd) {
        // tryck: avfyras (wantShot → game.specialFire), läget hoppar till 1 och klingar av (rekyl/blixt syns hos alla)
        this.gunCD = Math.max(0, (this.gunCD || 0) - dt);
        this.loader = Math.max(0, this.loader - dt * 1.7);
        if (held && this.gunCD <= 0 && (!S.ground || this.grounded >= 2)) { this.gunCD = S.cd; this.loader = 1; this.wantShot = true; }
        this.tank = 1 - this.gunCD / S.cd;
      } else {
        // håll: tanken töms medan man håller, fylls på långsamt
        if (this.tank == null) this.tank = 1;
        const on = held && this.tank > 0.02 && (this.loader > 0.05 || this.tank > 0.15);
        this.tank = on ? Math.max(0, this.tank - dt / S.hold) : Math.min(1, this.tank + dt / (S.hold * (S.refill || 2.2)));
        this.loader += clamp((on ? 1 : 0) - this.loader, -dt * 5, dt * 6);
      }
      // nitro: en extra knuff framåt som får gå förbi toppfarten (upp till 30 %)
      if (T.special === 'nitro' && this.loader > 0.05) {
        const x = Math.max(0, this.vLong) / (this.vmax * 1.3), J = T.mass * 13 * this.loader * clamp(1 - x * x * x, 0, 1) * dt;
        if (J > 0) this.applyJ(this.fwd.x * J, this.fwd.y * J, this.fwd.z * J, this.pos.x, this.pos.y, this.pos.z);
      }
    }
    // halt underlag (olja, vatten, dragstråle): greppet sänks några steg framåt
    if (this.slipT > 0) { this.slipT -= dt; this.pressF = Math.min(this.pressF, this.slipK); this.pressR = Math.min(this.pressR, this.slipK * 0.85); }

    const sp = Math.abs(this.vLong);
    const vf = this.vel.dot(fwd), vr = this.vel.dot(right);
    this.beta = this.speed > 6 ? Math.atan2(vr, Math.max(0.5, Math.abs(vf))) : 0;
    if (this.pressT > 0) this.pressT -= dt;
    if (this.wallT > 0) this.wallT -= dt;
    const inSteer = off ? 0 : inp.steer;
    let dmax = steerMaxAt(sp, T);
    // motstyrning: styr man åt glidriktningen får man större utslag och kan fånga sladden
    if (Math.sign(inSteer) === Math.sign(this.beta) && Math.abs(this.beta) > 0.08) dmax = Math.max(dmax, Math.min(0.45, Math.abs(this.beta) + 0.1));
    this.steer += clamp(inSteer * dmax - this.steer, -dt * 3.5, dt * 3.5);

    // Motor: kraften avtar mot den (rörliga) toppfarten
    let drive = 0;
    if (!this.hold) {
      if (throttle > 0.02) {
        const x = Math.max(0, this.vLong) / this.vmax;
        // tunga fordon: seg start (accelK), full kraft först uppe i fart — samma toppfart
        const lowK = T.accelK + (1 - T.accelK) * smooth(0.45, 0.9, x);
        drive = throttle * T.driveMax * this.powerMul * lowK * clamp(1 - x * x * x, -0.7, 1);
      } else if (brake > 0.05 && this.vLong < 1.5) {
        drive = -brake * T.driveMax * 0.45 * (this.vLong > -16 ? 1 : 0); // back
      }
    }
    // jetmotor: trycker kroppen rakt framåt (även i luften, lite svagare) — samma toppfartsspärr som motorn
    this.thrust = 0;
    if (T.jet && !this.hold && throttle > 0.02) {
      const ab = T.special === 'efterbrann' ? this.loader : 0;           // efterbrännkammaren: mer tryck, högre toppfart
      const x = Math.max(0, this.vLong) / (this.vmax * (1 + 0.2 * ab));
      this.thrust = throttle * clamp(1 - x * x * x, -0.7, 1);
      const J = T.mass * T.jet * (1 + 1.0 * ab) * this.powerMul * this.thrust * (this.grounded === 0 ? 0.55 : 1) * dt;
      this.applyJ(fwd.x * J, fwd.y * J, fwd.z * J, pos.x, pos.y, pos.z);
    }

    let grounded = 0;
    const gripK = this.sim.track?.def?.grip ?? 1;          // banans grepp (isbanan < 1)
    for (const w of this.wheels) {
      _a.set(w.x, 0, w.z).applyQuaternion(this.quat).add(pos);
      this.ray.origin = { x: _a.x, y: _a.y, z: _a.z };
      this.ray.dir = { x: -up.x, y: -up.y, z: -up.z };
      const hit = world.castRayAndGetNormal(this.ray, T.rayLen, true, undefined, undefined, undefined, this.body);
      w.hitBody = -1;
      if (!hit) {
        w.grounded = false; w.comp = 0; w.prevComp = 0; w.load = 0; w.dist = T.rayLen; w.slip = 0;
        w.spin += (this.vLong / T.wheelR) * dt * 0.98;
        continue;
      }
      const toi = hit.toi ?? hit.timeOfImpact;
      const hb = hit.collider?.parent?.();
      if (hb && !hb.isFixed()) w.hitBody = hb.handle;   // står på en annan bil (bigfooten kör över)
      grounded++;
      w.grounded = true;
      w.dist = toi;
      w.comp = T.rayLen - toi;
      _c.copy(_a).addScaledVector(up, -toi);
      w.hit.copy(_c);
      _n.set(hit.normal.x, hit.normal.y, hit.normal.z);
      w.normal.copy(_n);
      const compVel = clamp((w.comp - w.prevComp) / dt, -12, 12);
      w.prevComp = w.comp;
      let Fs = T.susK * w.comp + T.susC * compVel;
      if (w.comp > T.bump) Fs += (w.comp - T.bump) * 350000 * T.mass / 1500;
      Fs = clamp(Fs, 0, T.fsMax);
      w.load = Fs;
      this.applyJ(up.x * Fs * dt, up.y * Fs * dt, up.z * Fs * dt, _c.x, _c.y, _c.z);

      // däckets riktningar i kontaktplanet
      _wf.copy(fwd);
      if (w.front) _wf.applyAxisAngle(up, -this.steer);
      _wf.addScaledVector(_n, -_wf.dot(_n)).normalize();
      _ws.crossVectors(_wf, _n).normalize();
      _r.copy(_c).sub(pos);
      _pv.copy(this.vel).add(_t.crossVectors(this.angv, _r));
      const vL = _pv.dot(_wf), vS = _pv.dot(_ws);

      const grip = T.muLat * gripK * (w.front
        ? this.pressF
        : T.rearGrip * this.pressR * (1 - 0.55 * this.drift) * (hand > 0.5 ? 0.42 : 1));
      const maxJ = grip * Fs * dt;
      let jS = clamp(-vS * T.mass * 0.25, -maxJ, maxJ);

      let F = 0;
      if (!w.front) F += drive * 0.5;
      if (brake > 0.05 && this.vLong > 1) F -= T.brake * brake * 0.25 * Math.sign(vL);
      if (this.hold) F -= vL * T.mass * 0.25 / dt * 0.5;
      if (hand > 0.5 && !w.front) F -= Math.sign(vL) * T.muLong * Fs * 0.8;
      F -= vL * 4 * T.mass / 1500; // rullmotstånd
      const maxL = T.muLong * gripK * Fs;
      let jL = clamp(F, -maxL, maxL) * dt;
      // friktionscirkel
      const tot = Math.hypot(jS, jL), lim = Math.max(maxJ, maxL * dt);
      if (tot > lim) { jS *= lim / tot; jL *= lim / tot; }
      w.slip = Math.abs(vS) > 4 || (hand > 0.5 && !w.front && sp > 6) ? Math.min(1, Math.abs(vS) / 12 + 0.3) : 0;

      // längsled i tyngdpunktshöjd (ingen nickning), sidled lite under (lätt krängning)
      const lx = _c.x + up.x * T.longH, ly = _c.y + up.y * T.longH, lz = _c.z + up.z * T.longH;
      this.applyJ(_wf.x * jL, _wf.y * jL, _wf.z * jL, lx, ly, lz);
      const sx = _c.x + up.x * T.sideH, sy = _c.y + up.y * T.sideH, sz = _c.z + up.z * T.sideH;
      this.applyJ(_ws.x * jS, _ws.y * jS, _ws.z * jS, sx, sy, sz);
      w.spin += (vL / T.wheelR) * dt;
    }
    this.grounded = grounded;

    // Självrätning (arkad): vanliga sidokontakter i packet ska inte välta bilen.
    // Efter en riktig tackling (spinT) får den snurra och volta fritt.
    if (this.spinT <= 0 && up.y > 0.15) {
      const near = grounded > 0 ? 1 : T.glide ? 0.8 : 0.35;      // planet: vingarna håller det plant i luften
      // vridning som för bilens upp-vektor mot världens upp
      const tx = -up.z, tz = up.x; // axel = up × Y → vrider upp-vektorn mot lodrätt
      const tilt = Math.hypot(up.x, up.z);
      const kR = T.rightK * near;
      const av = this.angv;
      // dämpa rull/nick men inte gir
      const yawRate = av.dot(up);
      const rx = av.x - up.x * yawRate, ry = av.y - up.y * yawRate, rz = av.z - up.z * yawRate;
      const damp = 1 - Math.min(1, 4.5 * near * dt);
      const cur = this.body.angvel();
      this.body.setAngvel({
        x: cur.x - rx * (1 - damp) + tx * kR * dt * (tilt > 0.05 ? 1 : 0),
        y: cur.y - ry * (1 - damp),
        z: cur.z - rz * (1 - damp) + tz * kR * dt * (tilt > 0.05 ? 1 : 0),
      }, true);
    }

    // Glidflyg (planet): i luften bär vingarna — det sjunker långsamt i stället för att falla och
    // farten vrids efter nosen. Lyfter aldrig uppåt, så det går inte att flyga över murarna.
    this.gliding = false;
    // glid först efter en riktig luftfärd (inte på varje krön — då flöt planet iväg och var svårt att styra)
    this.airTime = grounded === 0 ? (this.airTime || 0) + dt : 0;
    if (T.glide && grounded === 0 && this.airTime > 0.35 && !off && this.spinT <= 0 && up.y > 0.4) {
      const lv = this.body.linvel(), hs = Math.hypot(lv.x, lv.z);
      // vingarna bär bara nära marken (inom 7 m) — annars seglar planet iväg över murarna där vägen lutar nedför
      this.ray.origin = { x: pos.x, y: pos.y, z: pos.z }; this.ray.dir = { x: 0, y: -1, z: 0 };
      const low = !!world.castRay(this.ray, 7, true, undefined, undefined, undefined, this.body);
      if (hs > 12 && lv.y < 0 && low) {
        this.gliding = true;
        const sink = -1.8 - 4 * (1 - Math.min(1, hs / 45));           // långsamt plan sjunker fortare
        const a = clamp((sink - lv.y) * 5, 0, CONF.GRAV * 1.4);
        if (a > 0) this.applyJ(0, T.mass * a * dt, 0, pos.x, pos.y, pos.z);
      }
      // roder: ratten vrider planet runt lodlinjen
      const cur = this.body.angvel(), want = -inSteer * 0.6;
      this.body.setAngvel({ x: cur.x, y: cur.y + (want - cur.y) * Math.min(1, 3 * dt), z: cur.z }, true);
      // fenan: farten vrids mot nosens riktning
      const fl = Math.hypot(fwd.x, fwd.z), v2 = this.body.linvel();
      if (fl > 0.3 && hs > 5) {
        const ang = Math.atan2(fwd.x * v2.z - fwd.z * v2.x, fwd.x * v2.x + fwd.z * v2.z);
        const th = -Math.sign(ang) * Math.min(Math.abs(ang), 1.4 * dt), c = Math.cos(th), s = Math.sin(th);
        const nx = v2.x * c - v2.z * s, nz = v2.x * s + v2.z * c;
        this.J.x += (nx - v2.x) * T.mass; this.J.z += (nz - v2.z) * T.mass;
        this.body.setLinvel({ x: nx, y: v2.y, z: nz }, true);
      }
    }

    if (grounded >= 2) {
      // marktryck
      const df = T.downforce * this.speed * this.speed * dt;
      this.applyJ(-up.x * df, -up.y * df, -up.z * df, pos.x, pos.y, pos.z);
      // Girkontroll (arkad): bilen vrider sig så mycket ratten säger — släpper man ratten
      // rätar den upp sig (ingen "fortsätter svänga" med gasen i botten).
      if (!off) {
        const yaw = this.angv.dot(up);
        // önskad gir: hjulvinkeln, men aldrig mer än däcken klarar (~30 m/s² i sidled) —
        // annars vrids nosen runt fortare än bilen kan svänga och den snurrar
        const v = Math.max(1, Math.abs(this.vLong));
        const dm = steerMaxAt(sp, T);
        const wMax = Math.min(v * Math.tan(dm) / T.wb, 30 * gripK / v);
        const kin = -Math.sign(this.vLong || 1) * clamp(this.steer / dm, -1.6, 1.6) * wMax;   // höger = negativ gir
        // drift: hårt rattutslag i hög fart med gas (eller handbroms) → bakvagnen släpper
        const wantDrift = !this.assist && (hand > 0.5 ? sp > 12 : (Math.abs(inSteer) > 0.45 && sp > 30 && throttle > 0.3));
        this.drift += ((wantDrift ? 1 : 0) - this.drift) * Math.min(1, (wantDrift ? 3.5 : 4) * dt);
        let target = kin * (1 + 1.2 * this.drift);
        let gain = 7 - 4.5 * this.drift;
        // knuffad/tacklad: lös gir så bilen kan spinna — men den som motstyr tar tillbaka kontrollen
        const hold = Math.max(0, inSteer * Math.sign(yaw)); // motstyrning mot snurret
        if (this.spinT > 0 || this.pressT > 0) {
          gain = (this.assist ? 0.6 : 0.45) + 4.5 * Math.max(hold, this.pressHold, this.antiSpin);
          target = kin;
        } else if (Math.abs(this.beta) > 0.6) gain = Math.max(gain, 5); // max ~35° drift
        // mot kanten: låt väggen vrida bilen längs med sig (annars plöjer den rakt in)
        if (this.wallT > 0) gain = Math.min(gain, 0.8);
        const corr = (target - yaw) * Math.min(1, gain * dt);
        const av = this.body.angvel();
        this.body.setAngvel({ x: av.x + up.x * corr, y: av.y + up.y * corr, z: av.z + up.z * corr }, true);
        // Drifthjälp (arkad): i en drift vrids farten mot nosen — man driftar runt kurvan
        // i stället för att plöja rakt in i väggen. Lite fart går förlorad.
        // Räddning: motstyr man i ett spinn/en för vid drift vrids farten tillbaka mot nosen snabbare
        const save = (this.spinT > 0 || Math.abs(this.beta) > 0.8) && Math.abs(this.beta) < 1.6
          && Math.sign(inSteer) === Math.sign(this.beta) && Math.abs(inSteer) > 0.3 ? Math.abs(inSteer) : 0;
        if ((this.drift > 0.05 || save > 0) && Math.abs(this.beta) > 0.02 && sp > 15 && this.wallT <= 0 && (this.spinT <= 0 || save > 0)) {
          const th = Math.sign(this.beta) * Math.min(Math.abs(this.beta), (0.55 * this.drift + 1.3 * save) * dt);
          const lv = this.body.linvel();
          const c = Math.cos(th), sn = Math.sin(th), keep = 1 - 0.12 * this.drift * dt;
          const nx = (lv.x * c + lv.z * sn) * keep, nz = (-lv.x * sn + lv.z * c) * keep;
          this.J.x += (nx - lv.x) * T.mass; this.J.z += (nz - lv.z) * T.mass;
          this.body.setLinvel({ x: nx, y: lv.y, z: nz }, true);
        }
      }
    } else this.drift = Math.max(0, this.drift - dt * 2);
  }

  // Efter world.step(): räkna ut Δv som inte kom från våra egna impulser/gravitationen
  postStep(dt) {
    const lv = this.body.linvel();
    const m = this.T.mass;
    const dx = lv.x - this.vBefore.x - this.J.x / m;
    const dy = lv.y - this.vBefore.y - this.J.y / m + CONF.GRAV * (this.sim.track?.def?.grav ?? 1) * dt;
    const dz = lv.z - this.vBefore.z - this.J.z / m;
    const dv = Math.hypot(dx, dy, dz);
    this.impact = dv > CONF.DV_MIN ? { dv, dx, dy, dz, horiz: Math.hypot(dx, dz) } : null;
    // fartspärr
    const s = Math.hypot(lv.x, lv.y, lv.z);
    if (s > 150) this.body.setLinvel({ x: lv.x * 150 / s, y: lv.y * 150 / s, z: lv.z * 150 / s }, true);
    this.readState();
  }

  resetTo(pos, quat, speed = 0) {
    const b = this.body;
    b.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true);
    b.setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w }, true);
    _F.set(0, 0, -1).applyQuaternion(quat);
    b.setLinvel({ x: _F.x * speed, y: _F.y * speed, z: _F.z * speed }, true);
    b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    for (const w of this.wheels) { w.prevComp = 0; w.comp = 0; }
    this.steer = 0;
    this.spinT = 0; this.drift = 0; this.pressT = 0;
    this.readState();
  }

  // halt underlag en stund: t sekunder med greppet k (det halaste vinner)
  slip(t, k) { this.slipK = this.slipT > 0 ? Math.min(this.slipK, k) : k; this.slipT = Math.max(this.slipT, t); }
  setGhost(on) { for (const c of this.colliders) if (!c.wallOnly) c.setCollisionGroups(c.isGear ? (on ? GEAR_GHOST : GROUP_GEAR) : on ? GROUP_GHOST : GROUP_CAR); }

  destroy() { this.sim.world.removeRigidBody(this.body); }
}
