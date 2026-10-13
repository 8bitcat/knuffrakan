// Ljud: riktiga V8-inspelningar (CC0, se audio/CREDITS.txt) som tonas mellan låga och
// höga varv efter växel/fart, däckskrik vid drift, skrap mot kanten, krockar, explosioner.
// Faller tillbaka på syntes om filerna inte går att ladda.
const FILES = {
  v8_idle: 'v8_idle', v8_high: 'v8_high', v8b_idle: 'v8b_idle', v8b_high: 'v8b_high',
  rev: 'rev', start: 'engine_start_v8', scrape: 'metal_scrape', boom: 'explosion', screech: 'tire_screech', wind: 'wind',
  heavy1: 'crash_heavy_1', heavy2: 'crash_heavy_2', heavy3: 'crash_heavy_3', heavy4: 'crash_heavy_4',
  light1: 'crash_light_1', light2: 'crash_light_2', light3: 'crash_light_3', light4: 'crash_light_4',
};
const LOOPS = new Set(['v8_idle', 'v8_high', 'v8b_idle', 'v8b_high', 'scrape', 'screech', 'wind']);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

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

// Varvtal ur fart: fyrväxlad låda, ~3200–9600 rpm
function rpmFor(v, throttle) {
  const G = [[0, 26], [24, 48], [46, 74], [72, 125]];
  let rpm = 9600;
  for (const [a, b] of G) { if (v >= a && v < b) { rpm = 3200 + (v - a) / (b - a) * 6400; break; } }
  return Math.min(9900, rpm + throttle * 350);
}

// Motorröst från två inspelningar (låga/höga varv)
class SampleVoice {
  constructor(ctx, out, lo, hi, rLo, rHi) {
    this.ctx = ctx; this.rLo = rLo; this.rHi = rHi; this.rpm = 3200;
    const mk = (buf) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, Math.random() * buf.duration); return s; };
    this.lo = mk(lo); this.hi = mk(hi);
    this.gLo = ctx.createGain(); this.gHi = ctx.createGain();
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 3000; this.lp.Q.value = 0.7;
    this.g = ctx.createGain(); this.g.gain.value = 0;
    this.pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    this.lo.connect(this.gLo); this.hi.connect(this.gHi);
    this.gLo.connect(this.lp); this.gHi.connect(this.lp); this.lp.connect(this.g);
    if (this.pan) { this.g.connect(this.pan); this.pan.connect(out); } else this.g.connect(out);
  }
  set(v, throttle, vol, pan = 0) {
    const t = this.ctx.currentTime;
    this.rpm += (rpmFor(v, throttle) - this.rpm) * 0.35;
    // "inspelningsvarv": 900–5200 — så långt kan loopen tonhöjdas utan att låta tecknad
    const s = 900 + (this.rpm - 3000) / 6900 * 4300;
    this.lo.playbackRate.setTargetAtTime(clamp(s / this.rLo, 0.5, 2.4), t, 0.03);
    this.hi.playbackRate.setTargetAtTime(clamp(s / this.rHi, 0.5, 1.95), t, 0.03);
    const x = clamp((s - 1300) / 1500, 0, 1) * Math.PI / 2;
    this.gLo.gain.setTargetAtTime(Math.cos(x), t, 0.05);
    this.gHi.gain.setTargetAtTime(Math.sin(x), t, 0.05);
    this.lp.frequency.setTargetAtTime(900 + throttle * 7000, t, 0.06);
    this.g.gain.setTargetAtTime(vol * (0.5 + 0.5 * throttle), t, 0.05);
    if (this.pan) this.pan.pan.setTargetAtTime(clamp(pan, -1, 1), t, 0.05);
  }
}

// Reserv: syntetisk motor
class SynthVoice {
  constructor(ctx, out) {
    this.ctx = ctx;
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
    this.rpm += (rpmFor(v, throttle) - this.rpm) * 0.35;
    const f = this.rpm / 60 * 2;
    this.o1.frequency.setTargetAtTime(f, t, 0.03); this.o2.frequency.setTargetAtTime(f / 2, t, 0.03);
    this.lp.frequency.setTargetAtTime(500 + throttle * 1800, t, 0.05);
    this.g.gain.setTargetAtTime(vol * 0.5 * (0.4 + 0.6 * throttle), t, 0.05);
  }
}

export class GameAudio {
  constructor() {
    this.ctx = null; this.buf = {};
    try { this.muted = localStorage.getItem('knuff_mute') === '1'; } catch { this.muted = false; }
  }

  async start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.7;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(ctx.destination);
    document.addEventListener('visibilitychange', () => { if (document.hidden) ctx.suspend(); else ctx.resume(); });
    // tills inspelningarna laddats: syntes
    this.voices = [new SynthVoice(ctx, this.master), new SynthVoice(ctx, this.master), new SynthVoice(ctx, this.master)];
    try {
      await Promise.all(Object.entries(FILES).map(async ([k, f]) => {
        const r = await fetch('audio/' + f + '.mp3');
        if (!r.ok) throw new Error(f);
        const b = await ctx.decodeAudioData(await r.arrayBuffer());
        this.buf[k] = LOOPS.has(k) ? makeLoop(ctx, b) : b;
      }));
      this.setupSamples();
    } catch (e) { console.warn('Motorljud kunde inte laddas — syntes används', e); }
  }

  setupSamples() {
    const ctx = this.ctx, B = this.buf;
    for (const v of this.voices) v.g.gain.value = 0;
    // egen bil: rå hot rod-V8; grannarna: muskelbils-V8 (lite annan klang)
    this.voices = [
      new SampleVoice(ctx, this.master, B.v8_idle, B.v8_high, 1030, 2900),
      new SampleVoice(ctx, this.master, B.v8b_idle, B.v8b_high, 810, 3000),
      new SampleVoice(ctx, this.master, B.v8b_idle, B.v8_high, 810, 2900),
    ];
    const loop = (buf) => {
      const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
      const g = ctx.createGain(); g.gain.value = 0;
      s.connect(g); g.connect(this.master); s.start(0, Math.random() * buf.duration);
      return { s, g };
    };
    this.windL = loop(B.wind);
    this.scrL = loop(B.scrape);
    this.screechL = loop(B.screech);
    this.samples = true;
  }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem('knuff_mute', m ? '1' : '0'); } catch { /* privat läge */ }
    if (this.master) this.master.gain.value = m ? 0 : 0.7;
  }

  // me = { v, throttle, on, slip, drift }, others = [{ v, throttle, dist, pan }]
  update(me, others, wind, scrape) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.voices[0].set(me.v, me.throttle, me.on ? 0.55 : 0, 0);
    for (let k = 0; k < 2; k++) {
      const o = others[k];
      if (o) this.voices[k + 1].set(o.v, o.throttle, 0.38 * Math.max(0, 1 - o.dist / 80) ** 1.5, o.pan);
      else this.voices[k + 1].set(0, 0, 0);
    }
    if (!this.samples) return;
    this.windL.g.gain.setTargetAtTime(clamp((wind - 20) / 90, 0, 1) * 0.35, t, 0.15);
    this.windL.s.playbackRate.setTargetAtTime(0.8 + clamp(wind / 120, 0, 1) * 0.5, t, 0.2);
    this.scrL.g.gain.setTargetAtTime(scrape && me.v > 4 ? 0.45 : 0, t, 0.04);
    this.scrL.s.playbackRate.setTargetAtTime(0.8 + clamp(me.v / 90, 0, 1) * 0.5, t, 0.1);
    const sk = clamp((me.slip || 0) * 0.5 + (me.drift || 0) * 0.6, 0, 1) * (me.v > 8 ? 1 : 0);
    this.screechL.g.gain.setTargetAtTime(sk * 0.32, t, 0.06);
  }

  play(buf, vol, rate = 1) {
    if (!this.ctx || !buf) return;
    const s = this.ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
    const g = this.ctx.createGain(); g.gain.value = vol;
    s.connect(g); g.connect(this.master); s.start();
  }

  crash(strength, near = 1) {
    const v = Math.min(1, strength / 22) * near;
    if (v < 0.04 || !this.ctx) return;
    const B = this.buf;
    if (this.samples) {
      const heavy = strength > 13;
      const pick = heavy ? [B.heavy1, B.heavy2, B.heavy3, B.heavy4] : [B.light1, B.light2, B.light3, B.light4];
      this.play(pick[Math.floor(Math.random() * pick.length)], (heavy ? 0.8 : 0.6) * v, 0.9 + Math.random() * 0.2);
      return;
    }
    this.noise(0.3, 1200, 0.5 * v);
  }
  boom(near = 1) {
    if (this.samples) this.play(this.buf.boom, 0.9 * near, 0.9 + Math.random() * 0.15);
    else this.noise(1.2, 300, 0.8 * near);
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
