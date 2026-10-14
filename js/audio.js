// Ljud: riktiga CC0-inspelningar (se audio/CREDITS.txt).
// Egen motor = tre varvnivåer ur samma racermotor (inifrån bilen), tonade efter varvtal;
// packet = ett riktigt NASCAR-fält; krockar i lager (plåt + klang + glas), gnissel när plåt slipar.
// Faller tillbaka på syntes om filerna inte går att ladda.
const FILES = {
  race_lo: 'race_lo', race_mid: 'race_mid', race_hi: 'race_hi', pack: 'pack',
  rev: 'rev', scrape: 'metal_scrape', boom: 'explosion', screech: 'tire_screech', wind: 'wind',
  hit1: 'hit1', hit2: 'hit2', hit3: 'hit3', hit4: 'hit4', ring: 'ring', wreck: 'wreck',
  grind1: 'grind1', grind2: 'grind2', grind3: 'grind3',
  heavy1: 'crash_heavy_1', heavy2: 'crash_heavy_2', heavy3: 'crash_heavy_3',
  light1: 'crash_light_1', light2: 'crash_light_2', light3: 'crash_light_3',
};
const LOOPS = new Set(['race_lo', 'race_mid', 'race_hi', 'pack', 'scrape', 'screech', 'wind']);
// grundtonen (Hz) i varje motorloop — uppmätt
const LAYER_F0 = { race_lo: 129, race_mid: 201, race_hi: 250 };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Sömlös loop: klipp bort kodarens tystnad i ändarna och korsblanda slutet in i början
function makeLoop(ctx, buf, trim = 0.05, fade = 0.15) {
  const sr = buf.sampleRate, t0 = Math.floor(trim * sr);
  const n = buf.length - 2 * t0, f = Math.min(Math.floor(fade * sr), Math.floor(n / 3)), len = n - f;
  const out = ctx.createBuffer(buf.numberOfChannels, len, sr);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const src = buf.getChannelData(ch), dst = out.getChannelData(ch);
    for (let i = 0; i < len; i++) dst[i] = src[t0 + i];
    for (let i = 0; i < f; i++) {
      const a = (i / f) * Math.PI / 2;
      dst[i] = src[t0 + i] * Math.sin(a) + src[t0 + len + i] * Math.cos(a);
    }
  }
  return out;
}

// Fyrväxlad racerlåda: i racefart ligger man högt i varv (6 400 i 300 km/h, 8 500 i 400 km/h)
const GEARS = [24, 44, 66, 120]; // m/s vid 9 300 rpm
function rpmFor(state, v, throttle) {
  let g = state.gear || 0;
  while (g < 3 && v > GEARS[g] * 0.97) g++;
  while (g > 0 && v < GEARS[g - 1] * 0.8) g--;
  state.gear = g;
  return clamp(9300 * v / GEARS[g], 3000, 9600) + throttle * 300;
}

// Motorröst: tre varvnivåer tonade efter varvtal (varje loop tonhöjdas högst ~±30 %)
class RaceVoice {
  constructor(ctx, out, B, detune = 0) {
    this.ctx = ctx; this.rpm = 3500; this.st = {}; this.detune = detune;
    this.layers = ['race_lo', 'race_mid', 'race_hi'].map((k) => {
      const s = ctx.createBufferSource(); s.buffer = B[k]; s.loop = true;
      const g = ctx.createGain(); g.gain.value = 0;
      s.connect(g); s.start(0, Math.random() * B[k].duration);
      return { s, g, f0: LAYER_F0[k] };
    });
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.Q.value = 0.6;
    this.g = ctx.createGain(); this.g.gain.value = 0;
    this.pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    for (const L of this.layers) L.g.connect(this.lp);
    this.lp.connect(this.g);
    if (this.pan) { this.g.connect(this.pan); this.pan.connect(out); } else this.g.connect(out);
  }
  set(v, throttle, vol, pan = 0, doppler = 1) {
    const t = this.ctx.currentTime;
    this.rpm += (rpmFor(this.st, v, throttle) - this.rpm) * 0.3;
    const f = this.rpm / 30 * doppler * (1 + this.detune);
    let sum = 0;
    const w = this.layers.map(L => { const d = Math.log(f / L.f0) / 0.22; const x = Math.exp(-d * d); sum += x; return x; });
    this.layers.forEach((L, k) => {
      L.s.playbackRate.setTargetAtTime(clamp(f / L.f0, 0.6, 1.6), t, 0.03);
      L.g.gain.setTargetAtTime(Math.sqrt(w[k] / (sum || 1)), t, 0.05);
    });
    this.lp.frequency.setTargetAtTime(Math.min(1400 + throttle * 9000, this.ctx.sampleRate * 0.45), t, 0.06);
    this.g.gain.setTargetAtTime(vol * (0.55 + 0.45 * throttle), t, 0.05);
    if (this.pan) this.pan.pan.setTargetAtTime(clamp(pan, -1, 1), t, 0.05);
  }
}

// Reserv: syntetisk motor
class SynthVoice {
  constructor(ctx, out) {
    this.ctx = ctx; this.st = {};
    this.o1 = ctx.createOscillator(); this.o1.type = 'sawtooth';
    this.o2 = ctx.createOscillator(); this.o2.type = 'square';
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass';
    this.g = ctx.createGain(); this.g.gain.value = 0;
    const m = ctx.createGain(); m.gain.value = 0.3;
    this.o1.connect(m); this.o2.connect(m); m.connect(this.lp); this.lp.connect(this.g); this.g.connect(out);
    this.o1.start(); this.o2.start(); this.rpm = 3200;
  }
  set(v, throttle, vol) {
    const t = this.ctx.currentTime;
    this.rpm += (rpmFor(this.st, v, throttle) - this.rpm) * 0.35;
    const f = this.rpm / 60 * 2;
    this.o1.frequency.setTargetAtTime(f, t, 0.03); this.o2.frequency.setTargetAtTime(f / 2, t, 0.03);
    this.lp.frequency.setTargetAtTime(Math.min(500 + throttle * 1800, this.ctx.sampleRate * 0.45), t, 0.05);
    this.g.gain.setTargetAtTime(vol * 0.5 * (0.4 + 0.6 * throttle), t, 0.05);
  }
}

export class GameAudio {
  constructor() {
    this.ctx = null; this.buf = {}; this.grindAcc = 0;
    try { this.muted = localStorage.getItem('knuff_mute') === '1'; } catch { this.muted = false; }
  }

  async start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.75;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12; comp.ratio.value = 4; comp.attack.value = 0.004;
    this.master.connect(comp); comp.connect(ctx.destination);
    // eko i tunnlarna
    this.echo = ctx.createDelay(1); this.echo.delayTime.value = 0.085;
    const fb = ctx.createGain(); fb.gain.value = 0.42;
    this.echoWet = ctx.createGain(); this.echoWet.gain.value = 0;
    this.master.connect(this.echo); this.echo.connect(fb); fb.connect(this.echo);
    this.echo.connect(this.echoWet); this.echoWet.connect(comp);
    document.addEventListener('visibilitychange', () => { if (document.hidden) ctx.suspend(); else ctx.resume(); });
    this.voices = [new SynthVoice(ctx, this.master), new SynthVoice(ctx, this.master), new SynthVoice(ctx, this.master)];
    try {
      await Promise.all(Object.entries(FILES).map(async ([k, f]) => {
        const r = await fetch('audio/' + f + '.mp3');
        if (!r.ok) throw new Error(f);
        const b = await ctx.decodeAudioData(await r.arrayBuffer());
        this.buf[k] = LOOPS.has(k) ? makeLoop(ctx, b) : b;
      }));
      this.setupSamples();
    } catch (e) { console.warn('Inspelningarna kunde inte laddas — syntes används', e); }
  }

  setupSamples() {
    const ctx = this.ctx, B = this.buf;
    for (const v of this.voices) v.g.gain.value = 0;
    this.voices = [new RaceVoice(ctx, this.master, B, 0), new RaceVoice(ctx, this.master, B, 0.04), new RaceVoice(ctx, this.master, B, -0.05)];
    const loop = (buf) => {
      const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
      const g = ctx.createGain(); g.gain.value = 0;
      s.connect(g); g.connect(this.master); s.start(0, Math.random() * buf.duration);
      return { s, g };
    };
    this.windL = loop(B.wind);
    this.scrL = loop(B.scrape);
    this.screechL = loop(B.screech);
    this.packL = loop(B.pack);
    this.samples = true;
  }

  setTunnel(k) {
    if (!this.echoWet) return;
    this.echoWet.gain.setTargetAtTime(k * 0.6, this.ctx.currentTime, 0.1);
  }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem('knuff_mute', m ? '1' : '0'); } catch { /* privat läge */ }
    if (this.master) this.master.gain.value = m ? 0 : 0.75;
  }

  // me = { v, throttle, on, slip, drift }, others = [{ v, throttle, dist, pan, closing }], pack = bilar nära
  update(me, others, wind, scrape, pack = 0, dt = 1 / 60) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.voices[0].detune !== undefined) this.voices[0].detune = me.detune || 0;
    this.voices[0].set(me.v, me.throttle, me.on ? 0.6 : 0, 0, 1);
    for (let k = 0; k < 2; k++) {
      const o = others[k];
      if (o) {
        const dop = clamp(343 / (343 - clamp(o.closing || 0, -60, 60)), 0.85, 1.2);
        this.voices[k + 1].set(o.v, o.throttle, 0.42 * Math.max(0, 1 - o.dist / 80) ** 1.4, o.pan, dop);
      } else this.voices[k + 1].set(0, 0, 0);
    }
    if (!this.samples) return;
    this.windL.g.gain.setTargetAtTime(clamp((wind - 20) / 90, 0, 1) * 0.3, t, 0.15);
    this.windL.s.playbackRate.setTargetAtTime(0.8 + clamp(wind / 120, 0, 1) * 0.5, t, 0.2);
    // packets vrål: ett riktigt NASCAR-fält, starkare ju fler bilar runt omkring
    this.packL.g.gain.setTargetAtTime(clamp(pack / 7, 0, 1) * 0.42, t, 0.3);
    this.packL.s.playbackRate.setTargetAtTime(0.85 + clamp(me.v / 100, 0, 1) * 0.25, t, 0.3);
    // skrap: loop + täta gnissel när plåt slipar
    this.scrL.g.gain.setTargetAtTime(scrape && me.v > 4 ? 0.32 : 0, t, 0.04);
    this.scrL.s.playbackRate.setTargetAtTime(0.8 + clamp(me.v / 90, 0, 1) * 0.5, t, 0.1);
    if (scrape && me.v > 4) {
      this.grindAcc += dt * (6 + me.v / 12);
      while (this.grindAcc > 1) { this.grindAcc -= 1; this.play(pick([this.buf.grind1, this.buf.grind2, this.buf.grind3]), 0.3 + Math.random() * 0.2, 0.85 + Math.random() * 0.35); }
    } else this.grindAcc = 0;
    const sk = clamp((me.slip || 0) * 0.5 + (me.drift || 0) * 0.6, 0, 1) * (me.v > 8 ? 1 : 0);
    this.screechL.g.gain.setTargetAtTime(sk * 0.3, t, 0.06);
  }

  play(buf, vol, rate = 1, delay = 0) {
    if (!this.ctx || !buf) return;
    const s = this.ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
    const g = this.ctx.createGain(); g.gain.value = vol;
    s.connect(g); g.connect(this.master); s.start(this.ctx.currentTime + delay);
  }

  // Smäll: lager efter styrka — plåtsmäll, plus klang och tung krasch vid stora tacklingar
  crash(strength, near = 1) {
    const v = Math.min(1, strength / 20) * near;
    if (v < 0.04 || !this.ctx) return;
    if (!this.samples) { this.noise(0.3, 1200, 0.5 * v); return; }
    const B = this.buf, r = () => 0.9 + Math.random() * 0.2;
    this.play(pick([B.hit1, B.hit2, B.hit3, B.hit4]), 0.75 * v, r());
    if (strength > 10) this.play(B.ring, 0.45 * v, r(), 0.02);
    if (strength > 15) this.play(pick([B.heavy1, B.heavy2, B.heavy3]), 0.7 * v, r());
    else if (strength > 8) this.play(pick([B.light1, B.light2, B.light3]), 0.4 * v, r());
  }
  // första kontakten sida mot sida
  bump(k = 0.6) {
    if (!this.samples) return;
    this.play(pick([this.buf.hit2, this.buf.hit1]), 0.55 * k, 0.85 + Math.random() * 0.2);
    this.play(pick([this.buf.grind1, this.buf.grind3]), 0.35 * k, 1);
  }
  boom(near = 1) {
    if (this.samples) {
      this.play(this.buf.wreck, 0.8 * near, 0.95);
      this.play(this.buf.boom, 0.85 * near, 0.9 + Math.random() * 0.15, 0.08);
    } else this.noise(1.2, 300, 0.8 * near);
  }
  rev() { if (this.samples) this.play(this.buf.rev, 0.5); }
  noise(dur, f0, vol) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime, n = Math.floor(ctx.sampleRate * dur);
    const b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = ctx.createBufferSource(); s.buffer = b;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = f0;
    const g = ctx.createGain(); g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t);
  }
  beep(hi) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = hi ? 1180 : 590;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.1, t); g.gain.exponentialRampToValueAtTime(0.001, t + (hi ? 0.6 : 0.25));
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.7);
    if (hi) this.rev();
  }
}
