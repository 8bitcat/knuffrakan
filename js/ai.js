// Bottarna: kör i full gas i sin fil, byter fil, väjer för långsammare bilar och
// tacklar ibland den som ligger bredvid.
import { steerMaxAt } from './vehicle.js?v=9';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export class BotBrain {
  constructor(rnd) {
    this.rnd = rnd;
    this.lane = (rnd() - 0.5) * 22;
    this.nextLane = 2 + rnd() * 6;
    this.aggr = rnd() < 0.4 ? 0.65 + rnd() * 0.35 : rnd() * 0.45;
    this.noise = 0.02 + rnd() * 0.05;
    this.tackleT = 0; this.tackleLat = 0;
    this.stuckT = 0; this.wob = rnd() * 10;
    this._f = {};
  }

  update(dt, car, game) {
    const v = car.veh, T = game.track, tk = car.trk, rnd = this.rnd;
    const inp = v.input;
    const sp = v.speed;
    this.wob += dt;

    this.nextLane -= dt;
    if (this.nextLane <= 0) {
      this.lane = clamp(this.lane + (rnd() - 0.5) * 16, -12, 12);
      this.nextLane = 3 + rnd() * 7;
    }
    // läget runt omkring
    let ahead = null, aheadD = 1e9, side = null, closing = 0;
    const blockL = [0, 0], blockR = [0, 0];
    for (const o of game.cars) {
      if (o === car || o.wrecked) continue;
      const ds = T.sdist(o.trk.s, tk.s), dl = o.trk.lat - tk.lat;
      const cl = v.vLong - o.veh.vLong;
      const range = 12 + Math.max(0, cl) * 2.4;
      if (ds > 0 && ds < range && Math.abs(dl) < 2.8 && cl > 2 && ds < aheadD) { ahead = o; aheadD = ds; closing = cl; }
      if (ds > -6 && ds < range) {
        if (dl < -1.5 && dl > -7) blockL[0] = 1;
        if (dl > 1.5 && dl < 7) blockR[0] = 1;
      }
      if (Math.abs(ds) < 6 && Math.abs(dl) > 1.6 && Math.abs(dl) < 6.5) side = o;
    }
    let lift = false;
    if (ahead && this.tackleT <= 0) {
      // väj åt det håll som är fritt, annars lätta på gasen
      let dir = ahead.trk.lat > tk.lat ? -1 : 1;
      if ((dir < 0 && (blockL[0] || tk.lat < -11)) || (dir > 0 && (blockR[0] || tk.lat > 11))) dir = -dir;
      const free = dir < 0 ? !blockL[0] && tk.lat > -11 : !blockR[0] && tk.lat < 11;
      this.lane = clamp(tk.lat + dir * 5, -12.5, 12.5);
      if (!free && aheadD < closing * 1.1) lift = true;
    }
    if (side && this.tackleT <= 0 && this.aggr > 0.55 && rnd() < dt * (side.isPlayer ? 0.9 : 0.22) * this.aggr) {
      this.tackleT = 0.55 + rnd() * 0.4;
      this.tackleLat = side.trk.lat;
      this.tackleTarget = side;
    }
    let laneT = this.lane;
    if (this.tackleT > 0) {
      this.tackleT -= dt;
      const tg = this.tackleTarget;
      if (tg && !tg.wrecked) laneT = tg.trk.lat + Math.sign(tg.trk.lat - tk.lat) * 1.2;
    }
    laneT = clamp(laneT, -13.2, 13.2);

    // styr mot en punkt framför (pure pursuit)
    const ld = 16 + sp * 0.55;
    const f = T.sampleAt(tk.s + ld, this._f);
    const tx = f.x + f.rx * laneT - v.pos.x, tz = f.z + f.rz * laneT - v.pos.z;
    let hx = v.fwd.x, hz = v.fwd.z; const hl = Math.hypot(hx, hz) || 1; hx /= hl; hz /= hl;
    const lat = -hz * tx + hx * tz, fwd = hx * tx + hz * tz;
    const alpha = Math.atan2(lat, fwd);
    const dist = Math.hypot(tx, tz);
    const delta = Math.atan(2 * 2.94 * Math.sin(alpha) / Math.max(8, dist));
    const dmax = steerMaxAt(v.vLong, v.T);
    let steer = delta / dmax + Math.sin(this.wob * 1.7) * this.noise;
    // motstyr om bilen glider
    if (Math.abs(v.beta) > 0.1) steer += Math.max(-0.7, Math.min(0.7, v.beta * 2));
    // knuffad från sidan: tuffa bottar lutar sig tillbaka in i knuffaren
    if (car.contactT > 0 && car.contactWith && this.aggr > 0.35) steer += car.contactSide * 0.55 * this.aggr;
    inp.steer = clamp(steer, -1, 1);

    // fart: bromsa i tid inför snäva kurvor (nödvändig retardation till kurvans fart)
    let need = 0;
    const span = Math.max(80, sp * 4);
    for (let d = 8; d < span; d += 12) {
      const k = Math.abs(T.sampleAt(tk.s + d, this._f).k);
      if (k < 1e-5) continue;
      const vs = Math.sqrt(1.9 * 14 / k);
      if (sp > vs) need = Math.max(need, (sp * sp - vs * vs) / (2 * d));
    }
    inp.throttle = 1; inp.brake = 0; inp.handbrake = 0;
    if (need > 2.5) inp.throttle = 0.2;
    if (need > 5) { inp.throttle = 0; inp.brake = Math.min(1, need / 14); }
    if (lift) inp.throttle = Math.min(inp.throttle, 0.5);
    if (Math.abs(alpha) > 1.6 && sp < 10) { inp.throttle = 0; inp.brake = 0.6; inp.steer = -inp.steer; }

    // fast? → be om omstart
    if (!v.hold && !car.wrecked && sp < 2.5) this.stuckT += dt; else this.stuckT = 0;
    if (this.stuckT > 3) { this.stuckT = 0; car.wantReset = true; }
  }
}
