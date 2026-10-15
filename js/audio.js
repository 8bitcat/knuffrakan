// Ljud: riktiga CC0-inspelningar (se audio/CREDITS.txt), valbara i Ljudlabbet.
// Motorer per fordonstyp (engines.js), packets vrål, skrap som följer glidfarten,
// krockar i lager, däckskrik, vind, eko i tunnlar. Syntes som reserv.
import { EngineVoice } from './engines.js?v=11';
import { SOUND_OPTS, DEFAULT_CHOICE, BASE_FILES, LOOP_FILES } from './sounds.js?v=11';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const KINDS = ['stock', 'bus', 'bigfoot'];

// Sömlös loop: klipp bort kodarens tystnad i ändarna och korsblanda slutet in i början
function makeLoop(ctx, buf, trim = 0.05, fade = 0.2) {
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

export class GameAudio {
  constructor() {
    this.ctx = null; this.buf = {}; this.loading = new Map();
    try { this.muted = localStorage.getItem('knuff_mute') === '1'; } catch { this.muted = false; }
    this.choice = { ...DEFAULT_CHOICE };
    try { Object.assign(this.choice, JSON.parse(localStorage.getItem('knuff_ljud') || '{}')); } catch { /* ok */ }
    for (const k of Object.keys(this.choice)) if (!SOUND_OPTS[k]?.some(o => o.id === this.choice[k])) this.choice[k] = DEFAULT_CHOICE[k];
    this.pool = {}; this.vol = 0.75;
  }

  opt(cat, id = this.choice[cat]) { return SOUND_OPTS[cat].find(o => o.id === id) || SOUND_OPTS[cat][0]; }
  filesOf(o) {
    const f = [];
    if (o.layers) for (const [k] of o.layers) f.push(k);
    for (const key of ['wall', 'car', 'spark']) if (o[key]) f.push(o[key]);
    for (const key of ['light', 'heavy', 'wreck']) if (o[key]) f.push(...[].concat(o[key]));
    return f;
  }

  async load(name) {
    if (this.buf[name]) return this.buf[name];
    if (this.loading.has(name)) return this.loading.get(name);
    const p = (async () => {
      const r = await fetch('audio/' + name + '.mp3');
      if (!r.ok) throw new Error(name);
      const b = await this.ctx.decodeAudioData(await r.arrayBuffer());
      this.buf[name] = LOOP_FILES.has(name) || /_(lo|mid|hi|top|loop)\d*$/.test(name) || name.startsWith('scr_') ? makeLoop(this.ctx, b) : b;
      return this.buf[name];
    })();
    this.loading.set(name, p);
    return p;
  }

  async start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : this.vol;
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
    try {
      const need = new Set(BASE_FILES);
      for (const cat of Object.keys(this.choice)) for (const f of this.filesOf(this.opt(cat))) need.add(f);
      await Promise.all([...need].map(n => this.load(n).catch(e => console.warn('ljud saknas', n, e))));
      this.setupLoops();
    } catch (e) { console.warn('Inspelningarna kunde inte laddas', e); }
  }

  setupLoops() {
    const ctx = this.ctx, B = this.buf;
    const loop = (buf, out = this.master) => {
      if (!buf) return null;
      const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
      const g = ctx.createGain(); g.gain.value = 0;
      s.connect(g); g.connect(out); s.start(0, Math.random() * buf.duration);
      return { s, g };
    };
    this.windL = loop(B.wind);
    this.screechL = loop(B.tire_screech);
    this.packL = loop(B.pack);
    this.setScrape();
    this.ready = true;
  }

  // skrapljuden: två loopar (mot vägg / mot bil) + gnistfräs ovanpå
  setScrape() {
    const ctx = this.ctx, B = this.buf, o = this.opt('scrape');
    for (const L of [this.scrW, this.scrC, this.scrS]) if (L) { try { L.s.stop(); } catch { /* ok */ } }
    const mk = (name, hp) => {
      const buf = B[name]; if (!buf) return null;
      const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = hp ? 'highpass' : 'peaking';
      if (hp) f.frequency.value = 2500; else { f.frequency.value = 1800; f.gain.value = 2; }
      const g = ctx.createGain(); g.gain.value = 0;
      s.connect(f); f.connect(g); g.connect(this.master); s.start(0, Math.random() * buf.duration);
      return { s, g, f, rate: o.rate || 1 };
    };
    this.scrW = mk(o.wall); this.scrC = mk(o.car || o.wall); this.scrS = mk(o.spark || o.wall, true);
  }

  // motorröst för en typ och plats (0 = egen bil, 1–2 = grannar, 3 = Ljudlabbet)
  voice(kind, slot) {
    const P = this.pool[kind] ||= [];
    if (!P[slot]) P[slot] = new EngineVoice(this, kind, this.opt(kind), this.master);
    return P[slot];
  }

  async setChoice(cat, id) {
    this.choice[cat] = id;
    try { localStorage.setItem('knuff_ljud', JSON.stringify(this.choice)); } catch { /* ok */ }
    if (!this.ctx) return;
    await Promise.all(this.filesOf(this.opt(cat)).map(n => this.load(n).catch(() => {})));
    if (KINDS.includes(cat)) for (const v of this.pool[cat] || []) v?.setSet(this.opt(cat));
    if (cat === 'scrape') this.setScrape();
  }
  async preload(cat) {
    if (!this.ctx) return;
    await Promise.all(SOUND_OPTS[cat].flatMap(o => this.filesOf(o)).map(n => this.load(n).catch(() => {})));
  }

  setTunnel(k) {
    if (!this.echoWet) return;
    this.echoWet.gain.setTargetAtTime(k * 0.6, this.ctx.currentTime, 0.1);
  }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem('knuff_mute', m ? '1' : '0'); } catch { /* privat läge */ }
    if (this.master) this.master.gain.value = m ? 0 : this.vol;
  }

  // me = { kind, v, throttle, brake, on, slip, drift, scrWall, scrCar, slide },
  // others = [{ kind, v, throttle, dist, pan, closing }], pack = bilar nära
  update(me, others, wind, pack = 0, dt = 1 / 60) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    // motorer: egen bil i plats 0, de två närmaste i plats 1–2 — rätt motor för rätt fordon
    const used = new Set();
    const drive = (kind, slot, ...args) => { const v = this.voice(kind, slot); v.set(...args); used.add(v); };
    drive(me.kind || 'stock', 0, me.v, me.throttle, me.on ? 0.62 : 0, 0, 1, me.brake || 0);
    for (let k = 0; k < 2; k++) {
      const o = others[k];
      if (!o) continue;
      const dop = clamp(343 / (343 - clamp(o.closing || 0, -60, 60)), 0.85, 1.2);
      drive(o.kind || 'stock', k + 1, o.v, o.throttle, 0.42 * Math.max(0, 1 - o.dist / 80) ** 1.4, o.pan, dop, 0);
    }
    for (const kind of KINDS) for (const [slot, v] of (this.pool[kind] || []).entries()) if (v && slot < 3 && !used.has(v)) v.set(0, 0, 0);
    // vind, packet, däck
    if (this.windL) {
      this.windL.g.gain.setTargetAtTime(clamp((wind - 20) / 90, 0, 1) * 0.3, t, 0.15);
      this.windL.s.playbackRate.setTargetAtTime(0.8 + clamp(wind / 120, 0, 1) * 0.5, t, 0.2);
    }
    if (this.packL) {
      this.packL.g.gain.setTargetAtTime(clamp(pack / 7, 0, 1) * 0.4, t, 0.3);
      this.packL.s.playbackRate.setTargetAtTime(0.85 + clamp(me.v / 100, 0, 1) * 0.25, t, 0.3);
    }
    if (this.screechL) {
      const sk = clamp((me.slip || 0) * 0.5 + (me.drift || 0) * 0.6, 0, 1) * (me.v > 8 ? 1 : 0);
      this.screechL.g.gain.setTargetAtTime(sk * 0.28, t, 0.06);
    }
    this.scrape(me.scrWall ? 1 : 0, me.scrCar ? 1 : 0, me.slide ?? me.v);
  }

  // skrap: jämn slipning vars styrka och tonhöjd följer glidfarten (ingen kulspruta av korta ljud)
  scrape(wall, car, slide) {
    if (!this.scrW) return;
    const t = this.ctx.currentTime, sp = clamp(slide / 45, 0, 1);
    const rate = (L) => (L ? L.rate : 1) * (0.7 + sp * 0.6);
    const set = (L, on, vol) => {
      if (!L) return;
      L.g.gain.setTargetAtTime(on ? vol * (0.35 + 0.65 * sp) : 0, t, on ? 0.03 : 0.09);
      L.s.playbackRate.setTargetAtTime(rate(L), t, 0.08);
    };
    set(this.scrW, wall && slide > 2, 0.42);
    set(this.scrC, car && slide > 1, 0.45);
    set(this.scrS, (wall || car) && slide > 6, 0.22);
  }

  play(buf, vol, rate = 1, delay = 0) {
    if (!this.ctx || !buf) return;
    const s = this.ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
    const g = this.ctx.createGain(); g.gain.value = vol;
    s.connect(g); g.connect(this.master); s.start(this.ctx.currentTime + delay);
  }
  // avgassmäll
  pop(vol = 0.4, delay = 0) {
    if (!this.ctx) return;
    const B = this.buf, list = ['pop1', 'pop2', 'pop3'].map(k => B[k]).filter(Boolean);
    if (list.length) { this.play(pick(list), vol, 0.9 + Math.random() * 0.25, delay); return; }
    this.noise(0.09, 900, vol * 0.8, delay);
  }
  // tryckluft (bussens broms/avblåsning)
  hiss(vol = 0.4, dur = 0.5) {
    if (!this.ctx) return;
    if (this.buf.airbrake) { this.play(this.buf.airbrake, vol, 0.95 + Math.random() * 0.1); return; }
    this.noise(dur, 6000, vol * 0.5, 0, 'highpass');
  }

  // Smäll: lager efter styrka
  crash(strength, near = 1) {
    const v = Math.min(1, strength / 20) * near;
    if (v < 0.04 || !this.ctx) return;
    const B = this.buf, o = this.opt('crash'), r = () => 0.9 + Math.random() * 0.2;
    const L = [].concat(o.light).map(k => B[k]).filter(Boolean), H = [].concat(o.heavy).map(k => B[k]).filter(Boolean);
    if (!L.length) { this.noise(0.3, 1200, 0.5 * v); return; }
    this.play(pick(L), 0.8 * v, r());
    if (strength > 13 && H.length) this.play(pick(H), 0.75 * v, r(), 0.01);
  }
  // första kontakten sida mot sida
  bump(k = 0.6) {
    const B = this.buf, L = [].concat(this.opt('crash').light).map(n => B[n]).filter(Boolean);
    if (L.length) this.play(pick(L), 0.45 * k, 0.85 + Math.random() * 0.15);
  }
  boom(near = 1) {
    const B = this.buf, o = this.opt('crash');
    const W = [].concat(o.wreck || []).map(n => B[n]).filter(Boolean);
    if (W.length) this.play(pick(W), 0.8 * near, 0.95);
    if (B.explosion) this.play(B.explosion, 0.85 * near, 0.9 + Math.random() * 0.15, 0.08);
    else this.noise(1.2, 300, 0.8 * near);
  }
  rev() { if (this.buf.rev) this.play(this.buf.rev, 0.5); }
  noise(dur, f0, vol, delay = 0, type = 'lowpass') {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + delay, n = Math.floor(ctx.sampleRate * dur);
    const b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = ctx.createBufferSource(); s.buffer = b;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = Math.min(f0, ctx.sampleRate * 0.45);
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

  // Ljudlabbet: spela en motor (plats 3) utan att köra
  preview(kind, v, throttle, on) {
    if (!this.ready) return;
    for (const k of KINDS) { const p = this.pool[k]?.[3]; if (p && k !== kind) p.set(0, 0, 0); }
    this.voice(kind, 3).set(v, throttle, on ? 0.65 : 0, 0, 1, 0);
  }
}
