// Racet: (lobby →) startgrid → nedräkning → race (ett varv) → resultat → lobby/ny grid.
// Online samlas man i lobbyn (kör runt fritt) tills värden startar eller alla är redo.
// Packracing: toppfarten styrs av placeringen (sist går fortast) + suget bakom bilar.
import { CONF } from './config.js?v=7';
import { gridSlots } from './world.js?v=7';

export class Race {
  constructor(game) {
    this.g = game;
    this.phase = 'idle';
    this.t = 0;
    this.raceT = 0;
    this.closeT = -1;
    this.results = [];
    this.finishCount = 0;
    this.lastWinner = '';
    this.num = 0;
  }

  get laps() { return this.g.track.def.laps || CONF.LAPS; }
  get dist() { return this.laps * this.g.track.L; }
  // online (värd eller gäst) = lobby mellan racen; ensam = racen rullar på
  get lobbyMode() { return !!this.g.net; }

  // Lobbyn: spelarna samlas vid starten och kör fritt, bottarna parkeras osynliga på griden
  toLobby() {
    const g = this.g, T = g.track;
    this.phase = 'lobby'; this.closeT = -1; this.finishCount = 0; this.raceT = 0; this.readyT = null;
    this.t = g.isPublic ? CONF.LOBBY_AUTOSTART : -1;
    this.results = [];
    g.hud?.hideResults();
    const slots = gridSlots(T, Math.max(24, g.cars.length));
    let k = 0;
    for (const car of g.cars) {
      car.finished = false; car.finishT = 0; car.finishPlace = 0; car.ready = false;
      if (car.wrecked) g.unwreck(car);
      car.health = 100; car.view.resetDamage();
      if (g.isHuman(car)) { car.hidden = false; car.veh.hold = false; car.veh.vmax = CONF.BASE_KMH * 0.85 / 3.6; car.veh.powerMul = 1; g.placeInLobby(car); }
      else g.parkBot(car, slots[k++]);
    }
    g.world3d.gantry.setLights(0, false);
    g.emit?.({ t: 'lobby' });
  }

  startFromLobby() {
    if (this.phase !== 'lobby') return;
    this.toGrid(3);
  }

  toGrid(wait = CONF.GRID_WAIT) {
    const g = this.g, T = g.track;
    this.phase = 'grid'; this.t = wait; this.closeT = -1; this.finishCount = 0; this.raceT = 0;
    this.results = [];
    g.hud?.hideResults();
    for (const car of g.cars) { car.hidden = false; car.ghostT = 0; car.veh.setGhost?.(false); car.ready = false; }
    // spelare längre bak i fältet, bottar slumpas fram
    const slots = gridSlots(T, Math.max(24, g.cars.length));
    const humans = g.cars.filter(c => g.isHuman(c)), bots = g.cars.filter(c => !g.isHuman(c));
    for (let i = bots.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bots[i], bots[j]] = [bots[j], bots[i]]; }
    const order = bots.slice();
    humans.forEach((h, k) => order.splice(Math.min(order.length, Math.max(0, g.cars.length - 7) + k * 2), 0, h));
    order.forEach((car, k) => {
      const sl = slots[k];
      g.placeCar(car, sl.s, sl.lat, 0, true);
      car.lap = -1; car.prog = sl.s - T.L; car.prevS = sl.s;
      car.finished = false; car.finishT = 0; car.finishPlace = 0;
      car.veh.hold = true;
      if (car.wrecked) g.unwreck(car);
      car.health = 100; car.view.resetDamage();
      car.raceStats = { kos: 0, hits: 0 };
    });
    g.world3d.gantry.setLights(0, false);
    this.num++;
    g.emit?.({ t: 'grid' });
  }

  update(dt) {
    const g = this.g, T = g.track, cars = g.cars;
    // framsteg för alla
    for (const car of cars) {
      const s = car.trk.s, ps = car.prevS ?? s;
      if (ps > T.L * 0.75 && s < T.L * 0.25) car.lap++;
      else if (ps < T.L * 0.25 && s > T.L * 0.75) car.lap--;
      car.prevS = s;
      car.prog = car.lap * T.L + s;
    }
    // placeringar
    const order = cars.slice().sort((a, b) => {
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      if (a.finished && b.finished) return a.finishPlace - b.finishPlace;
      return b.prog - a.prog;
    });
    order.forEach((c, i) => { c.place = i + 1; });
    this.order = order;

    if (this.phase === 'lobby') {
      // alla (minst två) redo → start om 3 s; publika rummet startar även på tid
      const humans = cars.filter(c => g.isHuman(c));
      const allReady = humans.length >= 2 && humans.every(c => c.ready);
      if (allReady) {
        this.readyT = (this.readyT ?? 3) - dt;
        if (this.readyT <= 0) { this.startFromLobby(); return; }
      } else this.readyT = null;
      if (this.t > 0) { this.t -= dt; if (this.t <= 0) { this.startFromLobby(); return; } }
    } else if (this.phase === 'grid') {
      this.t -= dt;
      if (this.t <= 0) { this.phase = 'count'; this.t = CONF.COUNTDOWN + 0.6; }
    } else if (this.phase === 'count') {
      this.t -= dt;
      const n = Math.min(5, Math.max(0, Math.floor((CONF.COUNTDOWN + 0.6 - this.t) / (CONF.COUNTDOWN / 5)) + 1));
      g.world3d.gantry.setLights(n, false);
      if (this.t <= 0) {
        this.phase = 'race'; this.raceT = 0;
        for (const c of cars) c.veh.hold = false;
        g.world3d.gantry.setLights(5, true);
        g.flashAll('KÖR!');
      }
    } else if (this.phase === 'race') {
      this.raceT += dt;
      const leader = order.find(c => !c.finished);
      const lead = order[0];
      for (let i = 0; i < order.length; i++) {
        const c = order[i];
        if (c.finished) { c.veh.vmax = CONF.BASE_KMH * 0.75 / 3.6; continue; }
        const rank = i;
        // ikappkörning: räknas mot bilen närmast framför — långt efter = mycket fortare,
        // men bonusen försvinner när man når fram (annars rammar man packet i 400 km/h)
        const ahead = i > 0 ? order[i - 1] : null;
        const gapAhead = ahead && !ahead.finished ? Math.max(0, ahead.prog - c.prog) : 0;
        let kmh = CONF.BASE_KMH + Math.min(rank, CONF.STEP_CAP) * CONF.STEP_KMH + Math.min(CONF.GAP_KMH, Math.max(0, gapAhead - 80) * 0.25);
        // suget: bil strax framför i samma fil
        c.drafting = false;
        for (const o of cars) {
          if (o === c || o.wrecked) continue;
          const d = o.prog - c.prog;
          if (d > 4 && d < 42 && Math.abs(o.trk.lat - c.trk.lat) < 2.4) { kmh += CONF.DRAFT_KMH; c.drafting = true; break; }
        }
        c.veh.vmax = kmh / 3.6;
        c.veh.powerMul = 1 + Math.min(rank, CONF.STEP_CAP) * 0.03;
        if (c.prog >= this.dist) {
          c.finished = true; c.finishT = this.raceT; c.finishPlace = ++this.finishCount;
          if (this.finishCount === 1) { this.closeT = CONF.CLOSE_AFTER_WIN; this.lastWinner = c.name; g.onWinner?.(c); }
          g.onFinish?.(c);
        }
      }
      if (this.closeT > 0) this.closeT -= dt;
      const allDone = cars.every(c => c.finished);
      if ((this.closeT !== -1 && this.closeT <= 0) || allDone || this.raceT > 400) this.end();
    } else if (this.phase === 'results') {
      this.t -= dt;
      if (this.t <= 0) { if (this.lobbyMode) this.toLobby(); else this.toGrid(); }
    }
  }

  end() {
    this.phase = 'results'; this.t = CONF.RESULTS_T;
    this.results = this.order.map((c, i) => ({ place: i + 1, name: c.name, time: c.finished ? c.finishT : null, isPlayer: c.isPlayer, kos: c.raceStats?.kos || 0, car: c }));
    this.g.onRaceEnd?.(this.results);
    for (const c of this.g.cars) c.veh.vmax = CONF.BASE_KMH * 0.7 / 3.6;
  }

  statusText() {
    const p = this.phase;
    if (p === 'lobby') return 'LOBBY — kör runt och värm upp';
    if (p === 'results' && this.lobbyMode) return 'Tillbaka till lobbyn om ' + Math.ceil(this.t);
    if (p === 'grid') return 'Start om ' + Math.ceil(this.t + CONF.COUNTDOWN);
    if (p === 'count') return 'Gör dig redo…';
    if (p === 'race') return this.closeT > 0 ? 'Racet stänger om ' + Math.ceil(this.closeT) : '';
    if (p === 'results') return 'Nästa race om ' + Math.ceil(this.t + CONF.GRID_WAIT);
    return '';
  }
}
