// Ljud via WebAudio-syntes: V8-motorer (egen + två närmaste), vind, smällar, explosioner, pip.
class EngineVoice {
  constructor(ctx, out) {
    this.ctx = ctx;
    this.o1 = ctx.createOscillator(); this.o1.type = 'sawtooth';
    this.o2 = ctx.createOscillator(); this.o2.type = 'sawtooth'; this.o2.detune.value = 14;
    this.o3 = ctx.createOscillator(); this.o3.type = 'square';
    const sh = ctx.createWaveShaper();
    const curve = new Float32Array(512);
    for (let i = 0; i < 512; i++) { const x = i / 256 - 1; curve[i] = Math.tanh(x * 2.6); }
    sh.curve = curve;
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.Q.value = 2.5;
    this.g = ctx.createGain(); this.g.gain.value = 0;
    this.pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const mix = ctx.createGain(); mix.gain.value = 0.35;
    this.o1.connect(mix); this.o2.connect(mix);
    const sub = ctx.createGain(); sub.gain.value = 0.25; this.o3.connect(sub); sub.connect(mix);
    mix.connect(sh); sh.connect(this.lp); this.lp.connect(this.g);
    if (this.pan) { this.g.connect(this.pan); this.pan.connect(out); } else this.g.connect(out);
    for (const o of [this.o1, this.o2, this.o3]) o.start();
    this.rpm = 3000;
  }
  set(v, throttle, vol, pan = 0) {
    const t = this.ctx.currentTime;
    // fyrväxlad låda
    const G = [[0, 28], [26, 52], [50, 78], [76, 125]];
    let rpm = 3200;
    for (const [a, b] of G) { if (v >= a && v < b) { rpm = 3200 + (v - a) / (b - a) * 6400; break; } }
    if (v >= 125) rpm = 9600;
    rpm += throttle * 400;
    this.rpm += (rpm - this.rpm) * 0.3;
    const f = this.rpm / 60 * 2;
    this.o1.frequency.setTargetAtTime(f, t, 0.03);
    this.o2.frequency.setTargetAtTime(f * 1.003, t, 0.03);
    this.o3.frequency.setTargetAtTime(f / 2, t, 0.03);
    this.lp.frequency.setTargetAtTime(500 + throttle * 1800 + this.rpm * 0.15, t, 0.05);
    this.g.gain.setTargetAtTime(vol * (0.35 + throttle * 0.65), t, 0.05);
    if (this.pan) this.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), t, 0.05);
  }
}

export class GameAudio {
  constructor() {
    this.ctx = null;
    try { this.muted = localStorage.getItem('knuff_mute') === '1'; } catch { this.muted = false; }
  }
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.55;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp); comp.connect(ctx.destination);
    this.voices = [new EngineVoice(ctx, this.master), new EngineVoice(ctx, this.master), new EngineVoice(ctx, this.master)];
    // brus för vind/smällar
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
    this.windF = ctx.createBiquadFilter(); this.windF.type = 'bandpass'; this.windF.frequency.value = 700; this.windF.Q.value = 0.6;
    this.windG = ctx.createGain(); this.windG.gain.value = 0;
    src.connect(this.windF); this.windF.connect(this.windG); this.windG.connect(this.master);
    src.start();
    const src2 = ctx.createBufferSource(); src2.buffer = this.noise; src2.loop = true;
    this.scrF = ctx.createBiquadFilter(); this.scrF.type = 'highpass'; this.scrF.frequency.value = 2500;
    this.scrG = ctx.createGain(); this.scrG.gain.value = 0;
    src2.connect(this.scrF); this.scrF.connect(this.scrG); this.scrG.connect(this.master);
    src2.start();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) ctx.suspend(); else ctx.resume();
    });
  }
  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem('knuff_mute', m ? '1' : '0'); } catch { /* privat läge */ }
    if (this.master) this.master.gain.value = m ? 0 : 0.55;
  }
  // me = { v, throttle }, others = [{ v, throttle, dist, pan }]
  update(me, others, wind, scrape) {
    if (!this.ctx) return;
    this.voices[0].set(me.v, me.throttle, me.on ? 0.42 : 0);
    for (let k = 0; k < 2; k++) {
      const o = others[k];
      if (o) this.voices[k + 1].set(o.v, o.throttle, 0.3 * Math.max(0, 1 - o.dist / 70), o.pan);
      else this.voices[k + 1].set(0, 0, 0);
    }
    const t = this.ctx.currentTime;
    this.windG.gain.setTargetAtTime(Math.min(0.22, wind * 0.0025), t, 0.1);
    this.windF.frequency.setTargetAtTime(400 + wind * 5, t, 0.1);
    this.scrG.gain.setTargetAtTime(scrape ? 0.18 : 0, t, 0.05);
  }
  burst(dur, f0, q, vol, type = 'bandpass') {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = f0; f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  thud(f0, dur, vol) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.35, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  crash(strength, near = 1) {
    const v = Math.min(1, strength / 25) * near;
    if (v < 0.04) return;
    this.burst(0.25 + v * 0.3, 900 + Math.random() * 900, 0.8, 0.5 * v);
    this.burst(0.12, 3500, 1.5, 0.25 * v);
    this.thud(110, 0.25, 0.6 * v);
  }
  boom(near = 1) {
    this.burst(1.4, 300, 0.5, 0.9 * near, 'lowpass');
    this.thud(70, 0.8, 0.9 * near);
    this.burst(0.5, 2000, 0.7, 0.3 * near);
  }
  beep(hi) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = hi ? 1180 : 590;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + (hi ? 0.6 : 0.25));
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.7);
  }
}
