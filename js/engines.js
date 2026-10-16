// Motorljud per fordon: varvnivåer ur riktiga inspelningar (CC0) tonade efter varvtal,
// en egen växellåda per typ och karaktärsljud ovanpå:
//   NASCAR   — skrikig V8 högt i varv, smällar ur avgasröret när man släpper gasen
//   Skolbuss — diesel lågt i varv, turbovisslan, tryckluftsbroms
//   Bigfoot  — djup V8 med kompressorvin och muller
// Vilken inspelning som används väljs i Ljudlabbet (SOUND_OPTS i sounds.js).
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Växellådor: v (m/s) där växeln når maxvarv
const BOX = {
  stock: { gears: [24, 44, 66, 120], rMin: 3000, rMax: 9400 },
  bus: { gears: [7, 13, 20, 29, 41, 120], rMin: 800, rMax: 2500 },
  bigfoot: { gears: [19, 36, 58, 120], rMin: 1600, rMax: 6800 },
  formel: { gears: [22, 38, 54, 70, 88, 120], rMin: 4500, rMax: 12500 },
  traktor: { gears: [6, 11, 17, 24, 33, 45, 120], rMin: 700, rMax: 2300 },
  glass: { gears: [11, 22, 38, 58, 120], rMin: 900, rMax: 5500 },
};
// grupper: tunga dieslar, stora V8:or, skrikiga racermotorer
const DIESEL = new Set(['bus', 'traktor']), BIG = new Set(['bigfoot', 'glass']), RACE = new Set(['stock', 'formel']);

export class EngineVoice {
  // kind: 'stock' | 'bus' | 'bigfoot', set: post ur SOUND_OPTS (lager + tonhöjdsområde)
  constructor(audio, kind, set, out) {
    const ctx = this.ctx = audio.ctx;
    this.audio = audio; this.kind = kind; this.box = BOX[kind] || BOX.stock;
    this.rpm = this.box.rMin; this.gear = 0; this.prevThr = 0; this.prevGear = 0; this.prevBrake = 0;
    this.out = ctx.createGain(); this.out.gain.value = 0;
    this.pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.Q.value = 0.7;
    this.duck = ctx.createGain(); this.duck.gain.value = 1;          // växling: kort dipp
    this.lp.connect(this.duck); this.duck.connect(this.out);
    if (this.pan) { this.out.connect(this.pan); this.pan.connect(out); } else this.out.connect(out);
    this.layers = [];
    this.setSet(set);
    // muller: sinus på halva tändfrekvensen (tyngd i bas för buss och bigfoot)
    if (!RACE.has(kind)) {
      this.sub = ctx.createOscillator(); this.sub.type = 'sine';
      this.subG = ctx.createGain(); this.subG.gain.value = 0;
      this.sub.connect(this.subG); this.subG.connect(this.duck); this.sub.start();
    }
    // bigfoot: kompressorvin
    if (kind === 'bigfoot') {
      this.whine = ctx.createOscillator(); this.whine.type = 'sawtooth';
      this.whF = ctx.createBiquadFilter(); this.whF.type = 'bandpass'; this.whF.Q.value = 6;
      this.whG = ctx.createGain(); this.whG.gain.value = 0;
      this.whine.connect(this.whF); this.whF.connect(this.whG); this.whG.connect(this.out); this.whine.start();
    }
    // buss: turbovisslan (filtrerat brus + ton)
    if (DIESEL.has(kind)) {
      this.turbo = ctx.createOscillator(); this.turbo.type = 'sine';
      this.tbG = ctx.createGain(); this.tbG.gain.value = 0;
      this.turbo.connect(this.tbG); this.tbG.connect(this.out); this.turbo.start();
    }
  }

  setSet(set) {
    const ctx = this.ctx, B = this.audio.buf;
    for (const L of this.layers) { try { L.s.stop(); } catch { /* ok */ } L.g.disconnect(); }
    this.layers = [];
    this.fMin = set.f?.[0] ?? 100; this.fMax = set.f?.[1] ?? 300;
    for (const [key, f0] of set.layers) {
      const buf = B[key];
      if (!buf) continue;
      const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
      const g = ctx.createGain(); g.gain.value = 0;
      s.connect(g); g.connect(this.lp); s.start(0, Math.random() * buf.duration);
      this.layers.push({ s, g, f0 });
    }
  }

  rpmFor(v, throttle) {
    const b = this.box, G = b.gears;
    let g = this.gear;
    while (g < G.length - 1 && v > G[g] * 0.97) g++;
    while (g > 0 && v < G[g - 1] * 0.78) g--;
    this.gear = g;
    const span = b.rMax - b.rMin;
    return clamp(b.rMin + (v / G[g]) * span * 1.05, b.rMin, b.rMax * 1.02) + throttle * span * 0.04;
  }

  // v m/s, throttle 0..1, vol 0..1, pan -1..1, dop = dopplerfaktor, brake 0..1
  set(v, throttle, vol, pan = 0, dop = 1, brake = 0) {
    const ctx = this.ctx, t = ctx.currentTime, b = this.box;
    this.rpm += (this.rpmFor(v, throttle) - this.rpm) * (DIESEL.has(this.kind) ? 0.12 : this.kind === 'formel' ? 0.4 : 0.3);
    const rn0 = clamp((this.rpm - b.rMin) / (b.rMax - b.rMin), 0, 1.05);
    const f = (this.fMin + rn0 * (this.fMax - this.fMin)) * dop;
    let sum = 0;
    const w = this.layers.map(L => { const d = Math.log(f / L.f0) / 0.24; const x = Math.exp(-d * d) + 1e-4; sum += x; return x; });
    this.lastF = f; this.lastW = w; this.lastSum = sum;
    this.layers.forEach((L, k) => {
      L.s.playbackRate.setTargetAtTime(clamp(f / L.f0, 0.5, 1.9), t, 0.03);
      L.g.gain.setTargetAtTime(Math.sqrt(w[k] / sum), t, 0.05);
    });
    const nyq = ctx.sampleRate * 0.45;
    const bright = DIESEL.has(this.kind) ? 900 + throttle * 2600 : BIG.has(this.kind) ? 1100 + throttle * 5200 : 1600 + throttle * 9000;
    this.lp.frequency.setTargetAtTime(Math.min(bright, nyq), t, 0.06);
    this.out.gain.setTargetAtTime(vol * (0.5 + 0.5 * throttle), t, 0.05);
    if (this.pan) this.pan.pan.setTargetAtTime(clamp(pan, -1, 1), t, 0.05);
    const rn = (this.rpm - b.rMin) / (b.rMax - b.rMin);
    if (this.sub) {
      this.sub.frequency.setTargetAtTime(Math.max(18, f * 0.5), t, 0.04);
      this.subG.gain.setTargetAtTime((DIESEL.has(this.kind) ? 0.22 : 0.16) * (0.4 + 0.6 * throttle), t, 0.08);
    }
    if (this.whine) {
      const wf = this.rpm / 60 * 9;
      this.whine.frequency.setTargetAtTime(wf, t, 0.03);
      this.whF.frequency.setTargetAtTime(Math.min(wf, nyq), t, 0.03);
      this.whG.gain.setTargetAtTime(0.05 * (0.3 + 0.7 * throttle) * (0.3 + rn), t, 0.06);
    }
    if (this.turbo) {
      this.turbo.frequency.setTargetAtTime(Math.min(1400 + this.rpm * 1.3, nyq), t, 0.08);
      this.tbG.gain.setTargetAtTime(vol > 0.05 ? 0.035 * throttle * (0.2 + rn) : 0, t, 0.15);
    }
    // händelser bara för den egna bilen (vol stor) — smällar, växlingar, broms
    if (vol > 0.3) {
      // växling uppåt under gas: kort dipp
      if (this.gear > this.prevGear && throttle > 0.5) {
        this.duck.gain.cancelScheduledValues(t);
        this.duck.gain.setValueAtTime(0.35, t); this.duck.gain.linearRampToValueAtTime(1, t + 0.12);
        if (RACE.has(this.kind) && Math.random() < 0.6) this.audio.pop(0.35);
      }
      // släpper gasen högt i varv: smällar ur avgasröret (NASCAR) / avblåsning (buss)
      if (this.prevThr > 0.7 && throttle < 0.2 && rn > 0.55) {
        if (RACE.has(this.kind) || this.kind === 'bigfoot') { const n = 2 + Math.floor(Math.random() * 3); for (let k = 0; k < n; k++) this.audio.pop(0.3 + Math.random() * 0.3, k * (0.06 + Math.random() * 0.09)); }
        if (DIESEL.has(this.kind)) this.audio.hiss(0.35, 0.4);
      }
      if (DIESEL.has(this.kind) && brake > 0.5 && this.prevBrake <= 0.5 && v > 4) this.audio.hiss(0.4, 0.55);
    }
    this.prevThr = throttle; this.prevGear = this.gear; this.prevBrake = brake;
  }

  // för tester: aktuell tonhöjd, uppspelningsfart och vikt per lager
  get dbg() {
    const f = this.lastF || 0;
    return { f: Math.round(f), r: this.layers.map(L => +(f / L.f0).toFixed(2)), w: (this.lastW || []).map(x => +(x / this.lastSum).toFixed(2)) };
  }

  stop() {
    this.out.gain.value = 0;
    for (const L of this.layers) { try { L.s.stop(); } catch { /* ok */ } }
    for (const o of [this.sub, this.whine, this.turbo]) { try { o?.stop(); } catch { /* ok */ } }
  }
}
export { pick };

// Jetmotor (syntes): turbinvin som stiger med varvet, vrål av luft, och efterbrännkammarens muller vid full gas.
// Varvet (n1) går upp långsamt som en riktig turbin. Samma gränssnitt som EngineVoice.
export class JetVoice {
  constructor(audio, kind, set, out) {
    const ctx = this.ctx = audio.ctx;
    this.audio = audio; this.kind = kind; this.n1 = 0.2; this.prevThr = 0;
    if (!audio.noiseBuf) {
      const b = audio.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    this.out = ctx.createGain(); this.out.gain.value = 0;
    this.pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (this.pan) { this.out.connect(this.pan); this.pan.connect(out); } else this.out.connect(out);
    const noise = (type, f, q) => {
      const s = ctx.createBufferSource(); s.buffer = audio.noiseBuf; s.loop = true;
      const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      s.connect(fl); fl.connect(g); g.connect(this.out); s.start(0, Math.random() * 2);
      return { s, f: fl, g };
    };
    this.roar = noise('bandpass', 600, 0.6);
    this.rumble = noise('lowpass', 150, 0.7);
    const osc = (type) => {
      const o = ctx.createOscillator(); o.type = type;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 5;
      const g = ctx.createGain(); g.gain.value = 0;
      o.connect(f); f.connect(g); g.connect(this.out); o.start();
      return { o, f, g };
    };
    this.whine = osc('sawtooth'); this.whine2 = osc('sine');
    this.setSet(set);
  }
  setSet(set) { this.pitch = set?.pitch || 1; this.twin = !!set?.twin; }
  set(v, throttle, vol, pan = 0, dop = 1) {
    const t = this.ctx.currentTime, nyq = this.ctx.sampleRate * 0.45;
    const target = 0.22 + 0.78 * throttle;
    this.n1 += (target - this.n1) * (target > this.n1 ? 0.03 : 0.045);
    const n = this.n1, sp = Math.min(1, v / 90);
    const wf = Math.min(nyq, (900 + 4300 * n) * this.pitch * dop);
    this.whine.o.frequency.setTargetAtTime(wf, t, 0.05); this.whine.f.frequency.setTargetAtTime(wf, t, 0.05);
    const wf2 = Math.min(nyq, wf * (this.twin ? 1.012 : 2.01));
    this.whine2.o.frequency.setTargetAtTime(wf2, t, 0.05); this.whine2.f.frequency.setTargetAtTime(wf2, t, 0.05);
    this.whine.g.gain.setTargetAtTime(0.05 + 0.07 * n, t, 0.08);
    this.whine2.g.gain.setTargetAtTime((this.twin ? 0.05 : 0.025) + 0.03 * n, t, 0.08);
    this.roar.f.frequency.setTargetAtTime((350 + 1500 * n + 500 * sp) * this.pitch, t, 0.08);
    this.roar.g.gain.setTargetAtTime(0.25 + 0.6 * n, t, 0.08);
    const burner = throttle > 0.7 ? 1 : 0;
    this.rumble.g.gain.setTargetAtTime((0.12 + 0.75 * burner) * n, t, 0.12);
    this.out.gain.setTargetAtTime(vol, t, 0.05);
    if (this.pan) this.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), t, 0.05);
    // efterbrännkammaren tänds: en duns (bara egna fordonet)
    if (vol > 0.3 && throttle > 0.8 && this.prevThr < 0.3) this.audio.noise(0.35, 240, 0.6 * vol);
    this.prevThr = throttle;
  }
  stop() {
    this.out.gain.value = 0;
    for (const x of [this.roar.s, this.rumble.s, this.whine.o, this.whine2.o]) { try { x.stop(); } catch { /* ok */ } }
  }
}
