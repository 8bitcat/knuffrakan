// Ljud: riktiga CC0-inspelningar (se audio/CREDITS.txt), valbara i Ljudlabbet.
// Motorer per fordonstyp (engines.js), packets vrål, skrap som följer glidfarten,
// krockar i lager, däckskrik, vind, eko i tunnlar. Syntes som reserv.
import { EngineVoice, JetVoice } from './engines.js?v=34';
import { SOUND_OPTS, DEFAULT_CHOICE, BASE_FILES, LOOP_FILES } from './sounds.js?v=34';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const KINDS = ['stock', 'bus', 'bigfoot', 'formel', 'traktor', 'glass', 'rullstol', 'elrullstol', 'plan', 'gokart', 'brandbil', 'stridsvagn', 'ufo', 'v2', 'polis', 'ambulans', 'valt', 'spokbil', 'heli'];
// Glassbilens melodi: egen (inte någon glassbilsfirmas), speldosa i C-dur. [midi, åttondelar], 0 = paus
const JINGLE = [
  [76, 1], [79, 1], [84, 1], [79, 1], [81, 1], [79, 1], [76, 2],
  [74, 1], [76, 1], [77, 1], [74, 1], [79, 3], [0, 1],
  [76, 1], [79, 1], [84, 1], [79, 1], [81, 1], [84, 1], [83, 2],
  [81, 1], [79, 1], [77, 1], [74, 1], [72, 3], [0, 3],
];

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
    this.comp = comp;                                               // musiken går hit (förbi tunnelekot)
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
    if (!P[slot]) { const o = this.opt(kind); P[slot] = o.jet ? new JetVoice(this, kind, o, this.master) : new EngineVoice(this, kind, o, this.master); }
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
    this.music?.applyVol?.();
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
    this.jingle(me.glassNear || 0);
    this.specialLoops(me.siren || 0, me.spray || 0, me.beam || 0, me.rotor || 0);
  }

  // brandbilens siren + vattenbrus och UFO:ts dragstråle — styrka 0..1 (efter avstånd)
  specialLoops(siren, spray, beam, rotor = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    if (!this.sl) {
      if (siren + spray + beam + rotor < 0.01) return;
      const mk = () => { const g = ctx.createGain(); g.gain.value = 0; g.connect(this.master); return g; };
      // sirenen: två toner (ba-bo) — två lite ostämda sågtänder genom lågpass, med lätt vibrato
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 588;
      const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 588; o2.detune.value = 9;
      const vib = ctx.createOscillator(); vib.frequency.value = 5.5; const vg = ctx.createGain(); vg.gain.value = 6;
      vib.connect(vg); vg.connect(o.frequency); vg.connect(o2.frequency);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
      const o2g = ctx.createGain(); o2g.gain.value = 0.5;
      const sg = mk(); o.connect(lp); o2.connect(o2g); o2g.connect(lp); lp.connect(sg); o.start(); o2.start(); vib.start();
      this.slO2 = o2;
      // vattnet: brus genom bandpass
      const n = Math.floor(ctx.sampleRate * 2), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      const ns = ctx.createBufferSource(); ns.buffer = b; ns.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2300; bp.Q.value = 0.5;
      const wg = mk(); ns.connect(bp); bp.connect(wg); ns.start();
      // strålen: två toner som vobblar (rymdljud)
      const b1 = ctx.createOscillator(); b1.type = 'sine'; b1.frequency.value = 150;
      const b2 = ctx.createOscillator(); b2.type = 'triangle'; b2.frequency.value = 302;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 7; const lg = ctx.createGain(); lg.gain.value = 45;
      lfo.connect(lg); lg.connect(b1.frequency); lg.connect(b2.frequency);
      const bg = mk(), b2g = ctx.createGain(); b2g.gain.value = 0.35;
      b1.connect(bg); b2.connect(b2g); b2g.connect(bg); b1.start(); b2.start(); lfo.start();
      // rotorn: dovt brus som slår (en fyrkantsvåg styr volymen ~7 gånger i sekunden)
      const rs = ctx.createBufferSource(); rs.buffer = b; rs.loop = true;
      const rl = ctx.createBiquadFilter(); rl.type = 'lowpass'; rl.frequency.value = 320;
      const rg = ctx.createGain(); rg.gain.value = 0;
      const chopG = ctx.createGain(); chopG.gain.value = 0.5;
      const lfo2 = ctx.createOscillator(); lfo2.type = 'square'; lfo2.frequency.value = 7; const l2 = ctx.createGain(); l2.gain.value = 0.5;
      lfo2.connect(l2); l2.connect(chopG.gain);
      const rOut = mk();
      rs.connect(rl); rl.connect(chopG); chopG.connect(rOut); rs.start(); lfo2.start();
      this.sl = { o, sg, wg, bg, rOut };
    }
    const S = this.sl;
    const f = Math.floor(t * 1.6) % 2 ? 588 : 784;
    S.o.frequency.setTargetAtTime(f, t, 0.015); this.slO2?.frequency.setTargetAtTime(f, t, 0.015);
    S.sg.gain.setTargetAtTime(siren * 0.085, t, 0.15);
    S.wg.gain.setTargetAtTime(spray * 0.26, t, 0.1);
    S.bg.gain.setTargetAtTime(beam * 0.15, t, 0.1);
    S.rOut?.gain.setTargetAtTime(rotor * 0.9, t, 0.1);
  }

  // Glassbilen i närheten: melodin på speldosa, level 0..1 (schemaläggs en bit i förväg)
  jingle(level) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    if (!this.jg) { this.jg = ctx.createGain(); this.jg.gain.value = 0; this.jg.connect(this.master); this.jNext = 0; this.jIdx = 0; }
    this.jg.gain.setTargetAtTime(level * 0.34, t, 0.25);
    if (level < 0.02) { if (t > this.jNext + 1) this.jIdx = 0; return; }   // tyst en stund: börja om från början
    if (this.jNext < t) this.jNext = t + 0.05;
    while (this.jNext < t + 0.35) {
      const [midi, n] = JINGLE[this.jIdx % JINGLE.length];
      if (midi) this.bell(midi, this.jNext);
      this.jNext += n * 0.2;
      this.jIdx++;
    }
  }
  bell(midi, at) {
    const ctx = this.ctx, f = 440 * 2 ** ((midi - 69) / 12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(0.5, at + 0.006); g.gain.exponentialRampToValueAtTime(0.001, at + 0.7);
    for (const [mul, vol, type] of [[1, 1, 'triangle'], [2, 0.32, 'sine'], [3.01, 0.1, 'sine'], [4.2, 0.05, 'sine']]) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f * mul;
      const og = ctx.createGain(); og.gain.value = vol;
      o.connect(og); og.connect(g); o.start(at); o.stop(at + 0.75);
    }
    g.connect(this.jg);
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
  // ---- vapen (syntes) ----
  thump(f, dur, vol, delay = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(f * 2.2, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f * 0.5), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  pickup() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    [660, 880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'square'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.06); g.gain.exponentialRampToValueAtTime(0.08, t + i * 0.06 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.06 + 0.12);
      o.connect(g); g.connect(this.master); o.start(t + i * 0.06); o.stop(t + i * 0.06 + 0.15);
    });
  }
  gun(kind, near = 1) {
    if (!this.ctx || near < 0.03) return;
    if (kind === 'kanon') { this.noise(0.14, 700, 0.6 * near); this.thump(70, 0.14, 0.45 * near); this.noise(0.05, 3500, 0.25 * near, 0, 'highpass'); }
    else { this.noise(0.08, 1600, 0.5 * near); this.thump(110, 0.08, 0.3 * near); this.noise(0.03, 5000, 0.2 * near, 0, 'highpass'); }
  }
  // skolbussens tuta: ett tretonsackord
  horn(near = 1) {
    if (!this.ctx || near < 0.03) return;
    const ctx = this.ctx, t = ctx.currentTime, g = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1500;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3 * near, t + 0.03);
    g.gain.setValueAtTime(0.3 * near, t + 0.8); g.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
    lp.connect(g); g.connect(this.master);
    for (const f of [233, 294, 349]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(lp); o.start(t); o.stop(t + 1.05); }
  }
  // elchock: sprakande högt brus + surrande såg
  zap(near = 1) {
    if (!this.ctx || near < 0.03) return;
    const ctx = this.ctx, t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(70, t); o.frequency.linearRampToValueAtTime(160, t + 0.35);
    g.gain.setValueAtTime(0.22 * near, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.5);
    this.noise(0.4, 5000, 0.4 * near, 0, 'highpass');
    for (let i = 0; i < 6; i++) this.noise(0.03, 2800, 0.4 * near, Math.random() * 0.35, 'highpass');
  }
  // sus: nitro, efterbrännkammare, tackling, planet som lyfter
  whoosh(near = 1) { if (!this.ctx || near < 0.03) return; this.noise(0.55, 900, 0.5 * near, 0, 'bandpass'); this.noise(0.3, 3200, 0.22 * near, 0.04, 'highpass'); }
  // plopp: glasskulan kastas, bananskalet släpps (f = tonhöjd)
  plopp(near = 1, f = 520) {
    if (!this.ctx || near < 0.03) return;
    const ctx = this.ctx, t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.4, t + 0.14);
    g.gain.setValueAtTime(0.35 * near, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.2);
  }
  // boing: någon halkade på bananskalet
  boing(near = 1) {
    if (!this.ctx || near < 0.03) return;
    const ctx = this.ctx, t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(520, t + 0.12); o.frequency.exponentialRampToValueAtTime(140, t + 0.5);
    lfo.frequency.value = 18; lg.gain.value = 40; lfo.connect(lg); lg.connect(o.frequency);
    g.gain.setValueAtTime(0.32 * near, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    o.connect(g); g.connect(this.master); o.start(t); lfo.start(t); o.stop(t + 0.6); lfo.stop(t + 0.6);
  }
  // miniguns röst: ylande pipor som varvar upp + ett ihållande, distat BRRRRT (45 smällar i sekunden) + mullrande bas.
  // level 0..1 (avstånd), spin 0..1 (piporna), firing 0/1. Anropas varje bildruta.
  minigun(level, spin, firing) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    if (!this.mg) {
      if (level < 0.01) return;
      const out = ctx.createGain(); out.gain.value = 0; out.connect(this.master);
      // ylandet (piporna)
      const wh = ctx.createOscillator(); wh.type = 'sawtooth'; wh.frequency.value = 120;
      const whF = ctx.createBiquadFilter(); whF.type = 'bandpass'; whF.frequency.value = 900; whF.Q.value = 2;
      const whG = ctx.createGain(); whG.gain.value = 0;
      wh.connect(whF); whF.connect(whG); whG.connect(out); wh.start();
      // BRRRRT: brus + såg som slås på/av 45 gånger i sekunden, genom en dist
      const n = ctx.sampleRate, buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      const ns = ctx.createBufferSource(); ns.buffer = buf; ns.loop = true;
      const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 1600; nf.Q.value = 0.7;
      const saw = ctx.createOscillator(); saw.type = 'sawtooth'; saw.frequency.value = 45;
      const sawF = ctx.createBiquadFilter(); sawF.type = 'lowpass'; sawF.frequency.value = 260;
      const am = ctx.createGain(); am.gain.value = 0.5;
      const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 45;
      const lfoG = ctx.createGain(); lfoG.gain.value = 0.5; lfo.connect(lfoG); lfoG.connect(am.gain);
      const sawG = ctx.createGain(); sawG.gain.value = 1.4;
      ns.connect(nf); nf.connect(am); saw.connect(sawF); sawF.connect(sawG); sawG.connect(am);
      const dist = ctx.createWaveShaper(); const curve = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 4); }
      dist.curve = curve;
      const brG = ctx.createGain(); brG.gain.value = 0;
      am.connect(dist); dist.connect(brG); brG.connect(out);
      // basdunket (tyngden i bröstet)
      const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = 45;
      const subG = ctx.createGain(); subG.gain.value = 0; sub.connect(subG); subG.connect(out);
      ns.start(); saw.start(); lfo.start(); sub.start();
      this.mg = { out, wh, whG, brG, subG };
    }
    const M = this.mg;
    M.out.gain.setTargetAtTime(level, t, 0.05);
    M.wh.frequency.setTargetAtTime(120 + 520 * spin, t, 0.05);
    M.whG.gain.setTargetAtTime(0.07 * spin, t, 0.05);
    M.brG.gain.setTargetAtTime(firing ? 0.32 : 0, t, firing ? 0.01 : 0.03);
    M.subG.gain.setTargetAtTime(firing ? 0.35 : 0, t, 0.02);
  }
  // strålarna: laser (fallande pip), frys (klirr), krymp (sjunkande pew)
  ray(k, near = 1) {
    if (!this.ctx || near < 0.03) return;
    const ctx = this.ctx, t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = k === 0 ? 'sawtooth' : 'sine';
    const [f0, f1, d] = k === 0 ? [1800, 200, 0.35] : k === 1 ? [2400, 1800, 0.4] : [900, 120, 0.5];
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + d);
    g.gain.setValueAtTime(0.18 * near, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + d + 0.05);
    if (k === 0) this.noise(0.25, 5000, 0.2 * near, 0, 'highpass');
  }
  freeze(near = 1) { if (!this.ctx || near < 0.03) return; [2093, 2637, 3136].forEach((f, i) => this.bellTone?.(f, i * 0.05, 0.12 * near)); this.noise(0.4, 7000, 0.15 * near, 0, 'highpass'); }
  shrink(near = 1) { this.ray(2, near); }
  shield(near = 1) {
    if (!this.ctx || near < 0.03) return;
    const ctx = this.ctx, t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(880, t + 0.35);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2 * near, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.55);
  }
  bellTone(f, delay, vol) {
    const ctx = this.ctx, t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.55);
  }
  // bowlingklotet fäller en bil: ett "klonk" + klapper
  strike(near = 1) { if (!this.ctx || near < 0.03) return; this.thump(90, 0.25, 0.6 * near); for (let i = 0; i < 4; i++) this.noise(0.05, 2500, 0.3 * near, 0.03 + i * 0.05, 'bandpass'); }
  // fyrverkeri: smäll + sprakande
  crackle(near = 1) { if (!this.ctx || near < 0.03) return; this.thump(60, 0.25, 0.4 * near); for (let i = 0; i < 8; i++) this.noise(0.03, 4000, 0.25 * near, 0.08 + Math.random() * 0.5, 'highpass'); }
  // bakdörrarna slås upp: ett gnissel
  creak(near = 1) {
    if (!this.ctx || near < 0.03) return;
    const ctx = this.ctx, t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(420, t); o.frequency.linearRampToValueAtTime(260, t + 0.35);
    f.type = 'bandpass'; f.frequency.value = 1200; f.Q.value = 6;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12 * near, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    o.connect(f); f.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.45);
  }
  // ambulansen lagar sig: en stigande klang
  heal(near = 1) {
    if (!this.ctx || near < 0.03) return;
    const ctx = this.ctx, t = ctx.currentTime;
    [523, 659, 784, 1047].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.08); g.gain.exponentialRampToValueAtTime(0.18 * near, t + i * 0.08 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.08 + 0.5);
      o.connect(g); g.connect(this.master); o.start(t + i * 0.08); o.stop(t + i * 0.08 + 0.55);
    });
  }
  // spökbilen: ett ihåligt "uuuuh" som glider
  ghost(near = 1) {
    if (!this.ctx || near < 0.03) return;
    const ctx = this.ctx, t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(260, t); o.frequency.linearRampToValueAtTime(420, t + 0.6); o.frequency.linearRampToValueAtTime(220, t + 1.4);
    lfo.frequency.value = 6; lg.gain.value = 14; lfo.connect(lg); lg.connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25 * near, t + 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    o.connect(g); g.connect(this.master); o.start(t); lfo.start(t); o.stop(t + 1.55); lfo.stop(t + 1.55);
  }
  // stridsvagnens kanon: ett djupt dån
  cannon(near = 1) {
    if (!this.ctx || near < 0.03) return;
    this.thump(42, 0.7, 0.95 * near); this.noise(0.55, 800, 0.75 * near); this.noise(0.07, 4200, 0.4 * near, 0, 'highpass');
    if (this.buf.explosion) this.play(this.buf.explosion, 0.45 * near, 1.35);
  }
  launch(near = 1) { if (!this.ctx) return; this.noise(0.6, 1400, 0.45 * near, 0, 'bandpass'); this.thump(90, 0.2, 0.3 * near); }
  blast(near = 1) {
    if (!this.ctx || near < 0.03) return;
    if (this.buf.explosion) this.play(this.buf.explosion, 0.75 * near, 0.95 + Math.random() * 0.15);
    else this.noise(0.9, 300, 0.7 * near);
    this.thump(45, 0.5, 0.6 * near);
  }
  shockwave(near = 1) { if (!this.ctx) return; this.thump(38, 0.7, 0.8 * near); this.noise(0.7, 260, 0.5 * near); }
  twang(near = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(700, t); o.frequency.exponentialRampToValueAtTime(160, t + 0.3);
    g.gain.setValueAtTime(0.3 * near, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.4);
  }
  splat(near = 1) { if (!this.ctx) return; this.noise(0.3, 420, 0.45 * near); }
  // propellern skär: några snabba hack
  chop(k = 1) {
    if (!this.ctx) return;
    for (let i = 0; i < 4; i++) this.noise(0.035, 2200, 0.5 * k * (1 - i * 0.18), i * 0.045, 'highpass');
    this.bump?.(0.5 * k);
  }
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
    this.jingle(on && kind === 'glass' ? 0.6 : 0);
    this.specialLoops(on && (kind === 'brandbil' || kind === 'polis' || kind === 'ambulans') ? 0.7 : 0, 0, 0);   // sirenerna
  }
}
