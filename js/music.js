// Musik att köra till: den inbyggda Knuffrakan-låten (egenskriven, se tema()) eller spelarens EGEN spellista —
// MIDI (spelas av en liten 80-talssynt här nedan) och ljudfiler (mp3/ogg/wav/m4a/webm), efter varandra. Egna
// filer spelas bara hos den som lagt in dem och sparas i webbläsaren (IndexedDB) — de laddas aldrig upp eller skickas.

const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { /* privat läge */ } return null; };

// Spelets egna låtar (Carls mp3:or, omkodade till 96 kbps) — strömmas när de spelas, laddas aldrig i förväg
export const SPELETS = [
  { name: 'Disco Funk', url: 'audio/musik/discofunk.mp3' },
  { name: 'Music', url: 'audio/musik/music.mp3' },
  { name: 'Untitled', url: 'audio/musik/untitled.mp3' },
];

// ---------- egen fil i webbläsaren (IndexedDB; databasen heter som spelet — 8bitcat delar ursprung) ----------
const idb = () => new Promise((res, rej) => {
  const r = indexedDB.open('knuffrakan', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('musik');
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
async function idbPut(key, val) {
  try { const db = await idb(); await new Promise((res, rej) => { const tx = db.transaction('musik', 'readwrite'); tx.objectStore('musik').put(val, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); } catch { /* sparas inte — spelas ändå */ }
}
async function idbGet(key) {
  try { const db = await idb(); return await new Promise((res, rej) => { const q = db.transaction('musik').objectStore('musik').get(key); q.onsuccess = () => res(q.result || null); q.onerror = () => rej(q.error); }); } catch { return null; }
}

// filnamnet utan ändelse, nedladdarens prefix och #-taggar ("AudioTranscriberAI_#DiscoFunk #.mp3" → "DiscoFunk")
const niceName = (n) => n.replace(/\.[a-z0-9]+$/i, '').replace(/^audiotranscriberai_/i, '').replace(/#/g, '').replace(/[_\s]+/g, ' ').trim() || n;

// går ljudfilen att spela här? (laddar bara in början)
function canPlay(data, type) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(new Blob([data], { type: type || 'audio/mpeg' })), el = new Audio();
    const done = (ok) => { clearTimeout(tm); el.removeAttribute('src'); el.load(); URL.revokeObjectURL(url); ok ? res() : rej(new Error('kan inte spelas')); };
    const tm = setTimeout(() => done(false), 10000);
    el.preload = 'metadata';
    el.onloadedmetadata = () => done(el.duration > 0);
    el.onerror = () => done(false);
    el.src = url;
  });
}

// ---------- MIDI-filen → noter i sekunder ----------
// Typ 0 och 1, tempobyten, löpande status. Ut: { notes: [{ t, dur, ch, note, vel, prog }], dur }.
export function parseMidi(buf) {
  const d = new DataView(buf);
  let p = 0;
  const str = (n) => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(d.getUint8(p + i)); p += n; return s; };
  const u32 = () => { const v = d.getUint32(p); p += 4; return v; }, u16 = () => { const v = d.getUint16(p); p += 2; return v; };
  if (d.byteLength < 14 || str(4) !== 'MThd') throw new Error('inte en MIDI-fil');
  const hlen = u32(); u16(); const ntr = u16(), div = u16();
  if (div & 0x8000) throw new Error('MIDI-filen använder SMPTE-tid (stöds inte)');
  p = 8 + hlen;
  const raw = [];
  for (let t = 0; t < ntr && p + 8 <= d.byteLength; t++) {
    const id = str(4), len = u32(), end = Math.min(d.byteLength, p + len);
    if (id !== 'MTrk') { p = end; continue; }
    let tick = 0, run = 0;
    const vlq = () => { let v = 0, b; do { b = d.getUint8(p++); v = (v << 7) | (b & 0x7f); } while (b & 0x80 && p < end); return v; };
    while (p < end) {
      tick += vlq();
      let st = d.getUint8(p);
      if (st < 0x80) { if (!run) break; st = run; } else { p++; run = st < 0xf0 ? st : 0; }
      const hi = st & 0xf0, ch = st & 0x0f;
      if (st === 0xff) {
        const type = d.getUint8(p++), l = vlq();
        if (type === 0x51 && l === 3) raw.push({ tick, k: 'tempo', us: (d.getUint8(p) << 16) | (d.getUint8(p + 1) << 8) | d.getUint8(p + 2), o: raw.length });
        p += l;
        if (type === 0x2f) break;
      } else if (st === 0xf0 || st === 0xf7) p += vlq();
      else if (hi === 0x90 || hi === 0x80) { const n = d.getUint8(p++), v = d.getUint8(p++); raw.push({ tick, k: hi === 0x90 && v > 0 ? 'on' : 'off', ch, n, v, o: raw.length }); }
      else if (hi === 0xb0) { const c = d.getUint8(p++), v = d.getUint8(p++); if (c === 7 || c === 11) raw.push({ tick, k: 'cc', ch, c, v, o: raw.length }); }
      else if (hi === 0xc0) raw.push({ tick, k: 'prog', ch, v: d.getUint8(p++), o: raw.length });
      else if (hi === 0xd0) p += 1;
      else p += 2;                                               // 0xa0 / 0xe0
    }
    p = end;
  }
  const pri = { tempo: 0, prog: 1, cc: 1, off: 2, on: 3 };
  raw.sort((a, b) => a.tick - b.tick || pri[a.k] - pri[b.k] || a.o - b.o);
  let us = 500000, last = 0, sec = 0;
  const prog = new Array(16).fill(0), vol = new Array(16).fill(100), expr = new Array(16).fill(127), open = new Map(), notes = [];
  for (const e of raw) {
    sec += (e.tick - last) * us / div / 1e6; last = e.tick;
    if (e.k === 'tempo') us = e.us;
    else if (e.k === 'prog') prog[e.ch] = e.v;
    else if (e.k === 'cc') { if (e.c === 7) vol[e.ch] = e.v; else expr[e.ch] = e.v; }
    else if (e.k === 'on') {
      const nt = { t: sec, dur: 0.25, ch: e.ch, note: e.n, vel: (e.v / 127) * (vol[e.ch] / 127) * (expr[e.ch] / 127), prog: prog[e.ch] };
      notes.push(nt);
      const key = e.ch * 128 + e.n;
      if (!open.has(key)) open.set(key, []);
      open.get(key).push(nt);
    } else { const nt = open.get(e.ch * 128 + e.n)?.shift(); if (nt) nt.dur = Math.max(0.03, sec - nt.t); }
  }
  if (!notes.length) throw new Error('MIDI-filen har inga noter');
  // lång tystnad i början bort; längden avrundas uppåt till helt taktslag (så slingan går jämnt)
  const t0 = notes[0].t > 1.5 ? notes[0].t : 0;
  for (const n of notes) n.t -= t0;
  const endT = Math.max(...notes.map(n => n.t + (n.ch === 9 ? 0.1 : n.dur))), beat = us / 1e6;
  return { notes, dur: Math.max(1, Math.ceil(endT / beat - 0.01) * beat) };
}

// ---------- Knuffrakan-låten: egen synthpop i e-moll, 126 bpm, 16 takter som går runt ----------
function tema() {
  const e = 60 / 126 / 2, bar = e * 8, notes = [];
  const N = (b, s, len, note, ch, prog, vel) => notes.push({ t: b * bar + s * e, dur: len * e * 0.9, ch, note, vel, prog });
  const ACK = ['Em', 'C', 'G', 'D', 'Em', 'C', 'G', 'D', 'Am', 'C', 'Em', 'D', 'Am', 'C', 'Em', 'D'];
  const ROT = { Em: 40, C: 36, G: 43, D: 38, Am: 45 }, MATTA = { Em: [64, 67, 71], C: [60, 64, 67], G: [62, 67, 71], D: [62, 66, 69], Am: [60, 64, 69] };
  // melodin: [steg (åttondel), längd, ton] per takt
  const MEL = [
    [[0, 2, 71], [2, 1, 74], [3, 1, 76], [4, 2, 74], [6, 2, 71]],
    [[0, 1, 72], [1, 1, 71], [2, 2, 67], [4, 1, 69], [5, 1, 71], [6, 2, 72]],
    [[0, 2, 74], [2, 1, 79], [3, 1, 78], [4, 2, 76], [6, 1, 74], [7, 1, 71]],
    [[0, 3, 74], [3, 1, 69], [4, 4, 66]],
    [[0, 1, 76], [1, 1, 76], [2, 1, 79], [3, 1, 76], [4, 2, 74], [6, 2, 71]],
    [[0, 2, 72], [2, 1, 74], [3, 1, 76], [4, 2, 79], [6, 2, 76]],
    [[0, 1, 74], [1, 1, 71], [2, 2, 67], [4, 1, 71], [5, 1, 74], [6, 2, 79]],
    [[0, 4, 78], [4, 2, 74], [6, 2, 69]],
    [[0, 3, 81], [3, 1, 79], [4, 2, 76], [6, 2, 72]],
    [[0, 2, 79], [2, 2, 76], [4, 1, 72], [5, 1, 74], [6, 2, 76]],
    [[0, 3, 79], [3, 1, 78], [4, 2, 76], [6, 2, 71]],
    [[0, 2, 74], [2, 2, 78], [4, 4, 81]],
    [[0, 1, 81], [1, 1, 79], [2, 1, 76], [3, 1, 79], [4, 2, 81], [6, 2, 84]],
    [[0, 2, 83], [2, 2, 79], [4, 2, 76], [6, 2, 72]],
    [[0, 2, 76], [2, 1, 79], [3, 1, 83], [4, 4, 79]],
    [[0, 2, 78], [2, 2, 74], [4, 2, 69], [6, 2, 66]],
  ];
  ACK.forEach((c, b) => {
    const r = ROT[c];
    [0, 0, 12, 0, 0, 12, 0, 7].forEach((iv, s) => N(b, s, 1, r + iv, 1, 38, 0.8));      // bas
    for (const n of MATTA[c]) N(b, 0, 8, n, 2, 89, 0.3);                                 // matta
    for (let s = 0; s < 8; s++) N(b, s, 1, 42, 9, 0, s % 2 ? 0.4 : 0.6);                  // hihat
    N(b, 0, 1, 36, 9, 0, 1); N(b, 4, 1, 36, 9, 0, 1); N(b, 5, 1, 36, 9, 0, b % 2 ? 0.7 : 0);
    N(b, 2, 1, 38, 9, 0, 0.9); N(b, 6, 1, 38, 9, 0, 0.9);
    if (b % 4 === 3) { N(b, 7, 1, 38, 9, 0, 0.6); N(b, 7, 1, 46, 9, 0, 0.5); }           // virvel in i nästa
    if (b % 8 === 0) N(b, 0, 1, 49, 9, 0, 0.7);                                           // cymbal
    for (const [s, l, n] of MEL[b]) N(b, s, l, n, 0, 81, 0.7);                             // melodin
  });
  notes.sort((a, b) => a.t - b.t);
  return { notes: notes.filter(n => n.vel > 0), dur: ACK.length * bar };
}

// ---------- synten ----------
const KLANG = (p) => p < 8 ? 'piano' : p < 16 ? 'bell' : p < 24 ? 'organ' : p < 32 ? 'guitar' : p < 40 ? 'bass' : p < 56 ? 'pad'
  : p < 64 ? 'brass' : p < 80 ? 'reed' : p < 88 ? 'lead' : p < 96 ? 'pad' : 'lead';
// w = vågformer, m = frekvensfaktor, g = styrka, a/d/s/r = attack/decay/sustain/release, f = filter
const K = {
  piano: { w: ['triangle', 'sine'], m: [1, 2], g: [1, 0.3], a: 0.003, d: 0.5, s: 0.25, r: 0.25, f: 4500 },
  bell: { w: ['sine', 'sine'], m: [1, 3.01], g: [1, 0.25], a: 0.002, d: 0.9, s: 0, r: 0.6, f: 8000 },
  organ: { w: ['square', 'sine'], m: [1, 2], g: [0.45, 0.4], a: 0.01, d: 0.1, s: 0.9, r: 0.08, f: 2600 },
  guitar: { w: ['sawtooth'], m: [1], g: [0.8], a: 0.003, d: 0.35, s: 0.3, r: 0.15, f: 2400 },
  bass: { w: ['sawtooth', 'square'], m: [1, 0.5], g: [0.8, 0.5], a: 0.003, d: 0.18, s: 0.55, r: 0.06, f: 900 },
  pad: { w: ['sawtooth', 'sawtooth'], m: [1, 1.006], g: [0.45, 0.45], a: 0.18, d: 0.5, s: 0.75, r: 0.45, f: 1800 },
  brass: { w: ['sawtooth'], m: [1], g: [0.8], a: 0.03, d: 0.25, s: 0.75, r: 0.1, f: 2600 },
  reed: { w: ['square', 'triangle'], m: [1, 1], g: [0.4, 0.5], a: 0.03, d: 0.2, s: 0.8, r: 0.1, f: 2200 },
  lead: { w: ['sawtooth', 'square'], m: [1, 1.004], g: [0.55, 0.35], a: 0.004, d: 0.2, s: 0.7, r: 0.08, f: 3200 },
};

export class Music {
  constructor(audio) {
    this.audio = audio;
    this.choice = ls('knuff_musik') || 'spel';           // 'av' | 'spel' (spelets låtar) | 'tema' | 'egen'
    this.sIdx = +(ls('knuff_musiks') || 0);
    this.vol = Math.min(1, Math.max(0, +(ls('knuff_musikvol') ?? 0.6)));
    this.idx = +(ls('knuff_musikidx') || 0);
    this.list = null; this.song = null; this.src = null; this.timer = null; this.voices = 0;
    this.onTrack = null;                                    // (namn) när en ny egen låt börjar
    this.last = this.choice === 'av' ? 'tema' : this.choice;
  }
  ensure() {
    const a = this.audio, ctx = a.ctx;
    if (!ctx) return false;
    if (!this.out) {
      this.out = ctx.createGain(); this.out.gain.value = 0;
      this.out.connect(a.comp || ctx.destination);         // förbi tunnelekot
      const n = ctx.sampleRate * 2, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      this.noiseB = b;
    }
    this.applyVol();
    return true;
  }
  applyVol() { if (this.out) this.out.gain.setTargetAtTime(this.audio.muted ? 0 : this.vol * 0.9, this.audio.ctx.currentTime, 0.05); }
  setVol(v) { this.vol = Math.min(1, Math.max(0, v)); ls('knuff_musikvol', String(this.vol)); this.applyVol(); }
  get playing() { return !!(this.song || this.src); }
  get fileName() { if (this.choice === 'spel') return SPELETS[this.sIdx % SPELETS.length].name; const L = this.list; return L?.length ? L[this.idx % L.length].name : ''; }
  // spellistan (gamla versionen sparade en enda fil under 'fil')
  async getList() {
    if (!this.list) {
      this.list = (await idbGet('filer')) || [];
      if (!this.list.length) { const old = await idbGet('fil'); if (old) this.list = [old]; }
    }
    return this.list;
  }
  async saveList() { await idbPut('filer', this.list); ls('knuff_musikidx', String(this.idx)); }

  async set(choice) {
    this.choice = choice; ls('knuff_musik', choice);
    if (choice !== 'av') this.last = choice;
    return this.play();
  }
  toggle() { return this.set(this.choice === 'av' ? this.last || 'tema' : 'av'); }
  // spela det som är valt (efter att ljudet startats av ett klick)
  async play() {
    this.stop();
    if (this.choice === 'av' || !this.ensure()) return true;
    if (this.choice === 'tema') { this.startSong(tema()); return true; }
    const tok = (this.tok = (this.tok || 0) + 1);            // ett nyare play() tar över
    if (this.choice === 'spel') {
      this.sIdx %= SPELETS.length;
      const t = SPELETS[this.sIdx];
      try { await this.playUrl(t.url, false, tok, () => { this.sIdx = (this.sIdx + 1) % SPELETS.length; ls('knuff_musiks', String(this.sIdx)); this.play(); }); }
      catch (e) { console.warn('musiken', e); return false; }
      if (this.src) this.onTrack?.(t.name);
      return true;
    }
    const L = await this.getList();
    if (!L.length) return false;                            // inga egna låtar än
    if (this.choice !== 'egen' || this.playing || tok !== this.tok) return true;
    this.idx %= L.length;
    const f = L[this.idx], one = L.length === 1;
    try {
      if (f.midi) this.startSong(parseMidi(f.data), one ? null : () => this.next());
      else {
        const url = URL.createObjectURL(new Blob([f.data], { type: f.type || 'audio/mpeg' }));
        await this.playUrl(url, one, tok, () => this.next(), true);
        if (!this.src) return true;
      }
      this.onTrack?.(f.name);
      return true;
    } catch (e) { console.warn('musiken', e); return false; }
  }
  // ljudfilen strömmas genom ett ljudelement (en avkodad låt på 5 min vore ~100 MB i minnet)
  async playUrl(url, loop, tok, onEnd, blob = false) {
    const el = new Audio(); el.src = url; el.loop = loop; el.preload = 'auto';
    const node = this.audio.ctx.createMediaElementSource(el);
    node.connect(this.out);
    const h = this.src = { el, stop: () => { el.onended = null; el.pause(); node.disconnect(); el.removeAttribute('src'); el.load(); if (blob) URL.revokeObjectURL(url); } };
    el.onended = () => { if (this.src === h) { h.stop(); this.src = null; onEnd(); } };
    try { await el.play(); } catch (e) { if (this.src === h) { h.stop(); this.src = null; } throw e; }
    if (this.src !== h || tok !== this.tok) { if (this.src === h) { h.stop(); this.src = null; } }
  }
  async playSpel(i) { this.sIdx = i; ls('knuff_musiks', String(i)); this.choice = 'spel'; ls('knuff_musik', 'spel'); this.last = 'spel'; return this.play(); }
  // nästa låt i spellistan (runt)
  async next() { const L = await this.getList(); if (!L.length) return; this.idx = (this.idx + 1) % L.length; ls('knuff_musikidx', String(this.idx)); this.play(); }
  async playIndex(i) { this.idx = i; ls('knuff_musikidx', String(i)); this.choice = 'egen'; ls('knuff_musik', 'egen'); this.last = 'egen'; return this.play(); }
  async removeAt(i) {
    const L = await this.getList();
    const cur = this.choice === 'egen' && i === this.idx % Math.max(1, L.length);
    L.splice(i, 1);
    if (this.idx > i || this.idx >= L.length) this.idx = Math.max(0, this.idx - 1);
    await this.saveList();
    if (cur) this.play();
  }
  autoplay() { if (this.choice !== 'av' && !this.playing) this.play(); }
  // nya egna filer läggs sist i spellistan (de som inte går att läsa hoppas över) och den första börjar spela
  async addFiles(files) {
    const L = await this.getList(), bad = [];
    let first = -1;
    for (const file of files) {
      try {
        const data = await file.arrayBuffer(), head = String.fromCharCode(...new Uint8Array(data.slice(0, 4)));
        const midi = head === 'MThd' || /\.midi?$/i.test(file.name);
        if (midi) parseMidi(data);                          // kastar om den inte går att läsa
        else await canPlay(data, file.type);
        if (first < 0) first = L.length;
        L.push({ name: niceName(file.name), midi, data, type: midi ? '' : file.type || 'audio/mpeg' });
      } catch (e) { console.warn('musiken', file.name, e); bad.push(file.name); }
    }
    if (first >= 0) { await this.saveList(); this.stop(); await this.playIndex(first); }
    return { added: first < 0 ? 0 : L.length - first, bad };
  }
  stop() {
    clearInterval(this.timer); this.timer = null; this.song = null;
    if (this.src) { try { this.src.stop(); } catch { /* redan stoppad */ } this.src = null; }
  }

  // ---- slingan: noterna schemaläggs en kort bit framåt i ljudets egen klocka ----
  startSong(song, onEnd = null) {
    const ctx = this.audio.ctx;
    this.song = song; this.onEnd = onEnd; this.i = 0; this.t0 = ctx.currentTime + 0.15;
    this.timer = setInterval(() => this.pump(), 50);
    this.pump();
  }
  pump() {
    const ctx = this.audio.ctx, S = this.song;
    if (!ctx || !S) return;
    const now = ctx.currentTime, until = now + 0.3;
    if (this.i < S.notes.length && this.t0 + S.notes[this.i].t < now - 1) this.t0 = now + 0.05 - S.notes[this.i].t;   // låg efter (fliken i bakgrunden): hoppa fram
    for (let guard = 0; guard < 5000; guard++) {
      if (this.i >= S.notes.length) {
        if (this.onEnd) { if (now > this.t0 + S.dur) { const cb = this.onEnd; this.stop(); cb(); } return; }   // spellistan: nästa låt
        this.t0 += S.dur; this.i = 0;
      }
      const n = S.notes[this.i], at = this.t0 + n.t;
      if (at > until) break;
      if (at >= now - 0.05) { if (n.ch === 9) this.drum(n.note, at, n.vel); else this.note(n, at); }
      this.i++;
    }
  }
  note(n, at) {
    if (this.voices > 40) return;
    const ctx = this.audio.ctx, P = K[KLANG(n.prog)], f = 440 * 2 ** ((n.note - 69) / 12);
    const g = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = Math.min(P.f, 18000); lp.Q.value = 0.8;
    lp.connect(g); g.connect(this.out);
    const pk = 0.2 * n.vel, end = at + Math.max(n.dur, P.a + 0.02), stop = end + P.r * 3 + 0.05;
    g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(pk, at + P.a);
    g.gain.setTargetAtTime(pk * P.s, at + P.a, P.d / 3);
    g.gain.setTargetAtTime(0, end, P.r / 3);
    this.voices++;
    P.w.forEach((w, i) => {
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = w; o.frequency.value = f * P.m[i]; og.gain.value = P.g[i];
      o.connect(og); og.connect(lp); o.start(at); o.stop(stop);
      if (i === 0) o.onended = () => { this.voices--; g.disconnect(); };
    });
  }
  noise(at, dur, type, freq, vol, q = 0.8) {
    const ctx = this.audio.ctx, s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = this.noiseB; fl.type = type; fl.frequency.value = freq; fl.Q.value = q;
    g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    s.connect(fl); fl.connect(g); g.connect(this.out);
    s.start(at, Math.random() * 1.5); s.stop(at + dur + 0.02);
  }
  tone(at, type, f0, f1, dur, vol) {
    const ctx = this.audio.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + dur);
    g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    o.connect(g); g.connect(this.out); o.start(at); o.stop(at + dur + 0.02);
  }
  // trummorna (kanal 10 i General MIDI)
  drum(n, at, vel) {
    const v = 0.5 * vel;
    if (n === 35 || n === 36) this.tone(at, 'sine', 150, 42, 0.3, v * 1.4);
    else if (n === 38 || n === 40) { this.noise(at, 0.16, 'bandpass', 1800, v * 0.9, 0.7); this.tone(at, 'triangle', 190, 150, 0.1, v * 0.5); }
    else if (n === 37) this.noise(at, 0.04, 'highpass', 2000, v * 0.6);
    else if (n === 39) for (let k = 0; k < 3; k++) this.noise(at + k * 0.012, 0.08, 'bandpass', 1200, v * 0.7);
    else if (n === 42 || n === 44) this.noise(at, 0.05, 'highpass', 7500, v * 0.45);
    else if (n === 46) this.noise(at, 0.28, 'highpass', 7000, v * 0.4);
    else if (n >= 41 && n <= 50 && n !== 49) { const f = 75 + (n - 41) * 16; this.tone(at, 'sine', f, f * 0.6, 0.25, v); }
    else if (n === 49 || n === 52 || n === 55 || n === 57) this.noise(at, 1.2, 'highpass', 5000, v * 0.4);
    else if (n === 51 || n === 53 || n === 59) this.noise(at, 0.45, 'highpass', 8000, v * 0.3);
    else if (n === 54) this.noise(at, 0.12, 'highpass', 6000, v * 0.4);
    else if (n === 56) { this.tone(at, 'square', 545, 540, 0.22, v * 0.25); this.tone(at, 'square', 815, 810, 0.22, v * 0.2); }
    else this.noise(at, 0.06, 'bandpass', 3000, v * 0.4);
  }
}
