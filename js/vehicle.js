// Bilfysik på en Rapier-kropp: fjädrande hjul via strålar, däckgrepp som impulser
// (i tyngdpunktshöjd så bilen inte välter av att svänga), motor med dynamisk toppfart
// (packracing) och smäll-detektering via hastighetsändring (Δv).
import * as THREE from 'three';
import { CONF } from './config.js?v=5';
import { WHEEL_POS, WHEEL_R } from './carmodel.js?v=5';

export const GROUP_CAR = (0x0001 << 16) | 0xffff;
export const GROUP_GHOST = (0x0001 << 16) | 0x0002;   // krockar bara med världen

export const CP = {
  mass: 1500,
  half: { x: 0.97, y: 0.42, z: 2.42 },
  colY: 0.2,
  inertia: { x: 4500, y: 4300, z: 2100 },
  rayLen: 0.72,          // fästet → marken vid fullt utfjädrat hjul (fjäder + hjulradie)
  susK: 36000, susC: 4300,
  muLat: 1.95, muLong: 1.8, rearGrip: 0.93,
  driveMax: 16500, brake: 30000,
  steerMax: 0.5,
  downforce: 0.75,
};

const _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
const _R = new THREE.Vector3(), _U = new THREE.Vector3(), _F = new THREE.Vector3();
const _a = new THREE.Vector3(), _c = new THREE.Vector3(), _n = new THREE.Vector3(), _wf = new THREE.Vector3(), _ws = new THREE.Vector3();
const _pv = new THREE.Vector3(), _r = new THREE.Vector3(), _j = new THREE.Vector3(), _t = new THREE.Vector3();
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
// största styrvinkel vid en viss fart (delas med AI:n)
export const steerMaxAt = (v) => CP.steerMax / (1 + Math.abs(v) / 20);

export class Vehicle {
  constructor(sim, pos, quat) {
    const { RAPIER, world } = sim;
    this.sim = sim;
    const bd = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y, pos.z).setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w })
      .setCcdEnabled(true).setLinearDamping(0.02).setAngularDamping(0.4).setCanSleep(false);
    this.body = world.createRigidBody(bd);
    const cd = RAPIER.ColliderDesc.cuboid(CP.half.x, CP.half.y, CP.half.z)
      .setTranslation(0, CP.colY, 0)
      .setMassProperties(CP.mass, { x: 0, y: 0, z: 0 }, CP.inertia, { x: 0, y: 0, z: 0, w: 1 })
      .setFriction(0.22).setRestitution(0.28).setCollisionGroups(GROUP_CAR);
    this.collider = world.createCollider(cd, this.body);
    this.ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
    this.wheels = WHEEL_POS.map(w => ({
      x: w.x, z: w.z, front: w.front, comp: 0, prevComp: 0, grounded: false, load: 0,
      dist: CP.rayLen, spin: 0, hit: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0), slip: 0,
    }));
    this.input = { throttle: 0, brake: 0, steer: 0, handbrake: 0 };
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

  preStep(dt) {
    this.readState();
    this.vBefore.copy(this.vel);
    this.J.set(0, 0, 0);
    if (this.spinT > 0) this.spinT -= dt;
    const inp = this.input, pos = this.pos, up = this.up, fwd = this.fwd, right = this.right;
    const world = this.sim.world;
    const off = this.disabled;
    const throttle = off ? 0 : inp.throttle, brake = off ? 0.15 : (this.hold ? 1 : inp.brake);
    const hand = off ? 0 : inp.handbrake;

    const sp = Math.abs(this.vLong);
    const vf = this.vel.dot(fwd), vr = this.vel.dot(right);
    this.beta = this.speed > 6 ? Math.atan2(vr, Math.max(0.5, Math.abs(vf))) : 0;
    if (this.pressT > 0) this.pressT -= dt;
    if (this.wallT > 0) this.wallT -= dt;
    const inSteer = off ? 0 : inp.steer;
    let dmax = steerMaxAt(sp);
    // motstyrning: styr man åt glidriktningen får man större utslag och kan fånga sladden
    if (Math.sign(inSteer) === Math.sign(this.beta) && Math.abs(this.beta) > 0.08) dmax = Math.max(dmax, Math.min(0.45, Math.abs(this.beta) + 0.1));
    this.steer += clamp(inSteer * dmax - this.steer, -dt * 3.5, dt * 3.5);

    // Motor: kraften avtar mot den (rörliga) toppfarten
    let drive = 0;
    if (!this.hold) {
      if (throttle > 0.02) {
        const x = Math.max(0, this.vLong) / this.vmax;
        drive = throttle * CP.driveMax * this.powerMul * clamp(1 - x * x * x, -0.7, 1);
      } else if (brake > 0.05 && this.vLong < 1.5) {
        drive = -brake * CP.driveMax * 0.45 * (this.vLong > -16 ? 1 : 0); // back
      }
    }

    let grounded = 0;
    for (const w of this.wheels) {
      _a.set(w.x, 0, w.z).applyQuaternion(this.quat).add(pos);
      this.ray.origin = { x: _a.x, y: _a.y, z: _a.z };
      this.ray.dir = { x: -up.x, y: -up.y, z: -up.z };
      const hit = world.castRayAndGetNormal(this.ray, CP.rayLen, true, undefined, undefined, undefined, this.body);
      if (!hit) {
        w.grounded = false; w.comp = 0; w.prevComp = 0; w.load = 0; w.dist = CP.rayLen; w.slip = 0;
        w.spin += (this.vLong / WHEEL_R) * dt * 0.98;
        continue;
      }
      const toi = hit.toi ?? hit.timeOfImpact;
      grounded++;
      w.grounded = true;
      w.dist = toi;
      w.comp = CP.rayLen - toi;
      _c.copy(_a).addScaledVector(up, -toi);
      w.hit.copy(_c);
      _n.set(hit.normal.x, hit.normal.y, hit.normal.z);
      w.normal.copy(_n);
      const compVel = clamp((w.comp - w.prevComp) / dt, -12, 12);
      w.prevComp = w.comp;
      let Fs = CP.susK * w.comp + CP.susC * compVel;
      if (w.comp > 0.3) Fs += (w.comp - 0.3) * 350000;
      Fs = clamp(Fs, 0, 140000);
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

      const grip = CP.muLat * (w.front
        ? this.pressF
        : CP.rearGrip * this.pressR * (1 - 0.55 * this.drift) * (hand > 0.5 ? 0.42 : 1));
      const maxJ = grip * Fs * dt;
      let jS = clamp(-vS * CP.mass * 0.25, -maxJ, maxJ);

      let F = 0;
      if (!w.front) F += drive * 0.5;
      if (brake > 0.05 && this.vLong > 1) F -= CP.brake * brake * 0.25 * Math.sign(vL);
      if (this.hold) F -= vL * CP.mass * 0.25 / dt * 0.5;
      if (hand > 0.5 && !w.front) F -= Math.sign(vL) * CP.muLong * Fs * 0.8;
      F -= vL * 4; // rullmotstånd
      const maxL = CP.muLong * Fs;
      let jL = clamp(F, -maxL, maxL) * dt;
      // friktionscirkel
      const tot = Math.hypot(jS, jL), lim = Math.max(maxJ, maxL * dt);
      if (tot > lim) { jS *= lim / tot; jL *= lim / tot; }
      w.slip = Math.abs(vS) > 4 || (hand > 0.5 && !w.front && sp > 6) ? Math.min(1, Math.abs(vS) / 12 + 0.3) : 0;

      // längsled i tyngdpunktshöjd (ingen nickning), sidled lite under (lätt krängning)
      const lx = _c.x + up.x * 0.55, ly = _c.y + up.y * 0.55, lz = _c.z + up.z * 0.55;
      this.applyJ(_wf.x * jL, _wf.y * jL, _wf.z * jL, lx, ly, lz);
      const sx = _c.x + up.x * 0.45, sy = _c.y + up.y * 0.45, sz = _c.z + up.z * 0.45;
      this.applyJ(_ws.x * jS, _ws.y * jS, _ws.z * jS, sx, sy, sz);
      w.spin += (vL / WHEEL_R) * dt;
    }
    this.grounded = grounded;

    // Självrätning (arkad): vanliga sidokontakter i packet ska inte välta bilen.
    // Efter en riktig tackling (spinT) får den snurra och volta fritt.
    if (this.spinT <= 0 && up.y > 0.15) {
      const near = grounded > 0 ? 1 : 0.35;
      // vridning som för bilens upp-vektor mot världens upp
      const tx = -up.z, tz = up.x; // axel = up × Y → vrider upp-vektorn mot lodrätt
      const tilt = Math.hypot(up.x, up.z);
      const kR = 3.2 * near;
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

    if (grounded >= 2) {
      // marktryck
      const df = CP.downforce * this.speed * this.speed * dt;
      this.applyJ(-up.x * df, -up.y * df, -up.z * df, pos.x, pos.y, pos.z);
      // Girkontroll (arkad): bilen vrider sig så mycket ratten säger — släpper man ratten
      // rätar den upp sig (ingen "fortsätter svänga" med gasen i botten).
      if (!off) {
        const yaw = this.angv.dot(up);
        // önskad gir: hjulvinkeln, men aldrig mer än däcken klarar (~30 m/s² i sidled) —
        // annars vrids nosen runt fortare än bilen kan svänga och den snurrar
        const v = Math.max(1, Math.abs(this.vLong));
        const dm = steerMaxAt(sp);
        const wMax = Math.min(v * Math.tan(dm) / 2.94, 30 / v);
        const kin = -Math.sign(this.vLong || 1) * clamp(this.steer / dm, -1.6, 1.6) * wMax;   // höger = negativ gir
        // drift: hårt rattutslag i hög fart med gas (eller handbroms) → bakvagnen släpper
        const wantDrift = !this.assist && (hand > 0.5 ? sp > 12 : (Math.abs(inSteer) > 0.45 && sp > 30 && throttle > 0.3));
        this.drift += ((wantDrift ? 1 : 0) - this.drift) * Math.min(1, (wantDrift ? 3.5 : 4) * dt);
        let target = kin * (1 + 1.2 * this.drift);
        let gain = 7 - 4.5 * this.drift;
        // knuffad/tacklad: lös gir så bilen kan spinna — men den som motstyr tar tillbaka kontrollen
        const hold = Math.max(0, inSteer * Math.sign(yaw)); // motstyrning mot snurret
        if (this.spinT > 0 || this.pressT > 0) {
          gain = (this.assist ? 0.6 : 0.45) + 4.5 * Math.max(hold, this.pressHold);
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
          this.J.x += (nx - lv.x) * CP.mass; this.J.z += (nz - lv.z) * CP.mass;
          this.body.setLinvel({ x: nx, y: lv.y, z: nz }, true);
        }
      }
    } else this.drift = Math.max(0, this.drift - dt * 2);
  }

  // Efter world.step(): räkna ut Δv som inte kom från våra egna impulser/gravitationen
  postStep(dt) {
    const lv = this.body.linvel();
    const m = CP.mass;
    const dx = lv.x - this.vBefore.x - this.J.x / m;
    const dy = lv.y - this.vBefore.y - this.J.y / m + CONF.GRAV * dt;
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

  setGhost(on) { this.collider.setCollisionGroups(on ? GROUP_GHOST : GROUP_CAR); }

  destroy() { this.sim.world.removeRigidBody(this.body); }
}
