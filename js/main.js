// Uppstart: laddning, meny, garage, spelloop.
import * as THREE from 'three';
import { CONF, VERSION, PROTO, TITLES } from './config.js?v=25';
import { Game } from './game.js?v=25';
import { HUD } from './hud.js?v=25';
import { GameAudio } from './audio.js?v=25';
import { Input } from './input.js?v=25';
import { SHAPES } from './carmodel.js?v=25';
import { makeCarView } from './vehicles3d.js?v=25';
import { VTYPES, KINDS, typeOf, SPECIALS } from './vtypes.js?v=25';
import { makeLivery, PALETTES, PATTERNS, SPONSORS, randomSpec } from './livery.js?v=25';
import { logoCanvas } from './world.js?v=25';
import { BotBrain } from './ai.js?v=25';
import { connectRoom, NetHost, NetClient } from './net.js?v=25';
import { TRACKS } from './track.js?v=25';
import { SOUND_OPTS } from './sounds.js?v=25';
import { newGP } from './gp.js?v=25';
import { GEAR, GEAR_IDS, SLOTS, BUDGET, cleanGear, gearCost, toggleGear, randomGear, blockedSlot } from './gear.js?v=25';

const PUBLIC = 'PUBLIK';

const $ = (id) => document.getElementById(id);
// knapp-koppling som aldrig kraschar om elementet saknas
const bind = (id, ev, fn) => { const el = $(id); if (el) el[ev] = fn; };

// Versionsvakt: GitHub Pages låter webbläsaren spara index.html i 10 min. Precis efter ett
// släpp kan en gammal sida (utan nya knappar) hämta ny kod → krasch. Märk det och ladda om
// sidan förbi cachen (högst två gånger per flik).
function staleHtml() {
  if (document.documentElement.dataset.v === String(PROTO)) { try { sessionStorage.removeItem('knuff_rl'); } catch { /* ok */ } return false; }
  let n = 0;
  try { n = +(sessionStorage.getItem('knuff_rl') || 0); sessionStorage.setItem('knuff_rl', String(n + 1)); } catch { /* ok */ }
  if (n >= 2) return false;
  const u = new URL(location.href);
  u.searchParams.set('_v', PROTO + '-' + Date.now().toString(36));
  location.replace(u.toString());
  return true;
}
// Uppdateringskoll: en flik som står öppen hämtar aldrig ny kod själv, och GitHub Pages låter
// webbläsaren spara sidan i 10 min. version.json hämtas förbi cachen; finns en nyare version
// laddas sidan om (i menyn direkt — i lobbyn/racet via en knapp, så ingen kastas ut mitt i).
async function newerVersion() {
  try {
    const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    return j && j.proto > PROTO ? j : null;
  } catch { return null; }
}
function reloadFresh() {
  let n = 0;
  try { n = +(sessionStorage.getItem('knuff_upd') || 0); sessionStorage.setItem('knuff_upd', String(n + 1)); } catch { /* ok */ }
  if (n >= 3) return false;                       // vill inte fastna i en omladdningsloop
  const u = new URL(location.href);
  u.searchParams.set('_v', 'u' + Date.now().toString(36));
  location.replace(u.toString());
  return true;
}
const params = new URLSearchParams(location.search);
const loadTxt = (t) => { $('loadtxt').textContent = t; };

function loadSpec() {
  try { const s = JSON.parse(localStorage.getItem('knuff_spec') || 'null'); if (s && s.colors) return s; } catch { /* trasig */ }
  const s = randomSpec(Math.floor(Math.random() * 1e6), '');
  s.number = 8;
  return s;
}
function saveSpec(s) { try { localStorage.setItem('knuff_spec', JSON.stringify(s)); } catch { /* privat läge */ } }

async function boot() {
  $('ver').textContent = 'v' + VERSION;
  // logga i menyn
  const lc = logoCanvas(900, 264);
  $('menulogo').replaceChildren(lc);
  loadTxt('Laddar typsnitt…');
  try {
    await Promise.race([
      Promise.all(['italic 900 40px "Exo 2"', '600 20px Montserrat', '400 20px Michroma'].map(f => document.fonts.load(f))),
      new Promise(r => setTimeout(r, 4000)),
    ]);
  } catch { /* kör vidare */ }
  $('menulogo').replaceChildren(logoCanvas(900, 264));
  loadTxt('Startar fysiken…');
  const RAPIER = (await import('@dimforge/rapier3d-compat')).default;
  await RAPIER.init();
  loadTxt('Bygger banan…');
  await new Promise(r => setTimeout(r, 30));

  const hud = new HUD();
  const audio = new GameAudio();
  const input = new Input();
  input.bindTouch(document);
  // vald bana (minns mellan besök)
  let trackChoice = 'hoppbacken';
  try { trackChoice = localStorage.getItem('knuff_bana') || trackChoice; } catch { /* ok */ }
  if (!TRACKS.some(t => t.id === trackChoice)) trackChoice = TRACKS[0].id;
  hud.tracks = TRACKS.map(t => ({ id: t.id, namn: t.namn, besk: t.besk, laps: t.laps }));
  const game = new Game(RAPIER, $('game'), { hud, audio, input, track: trackChoice });
  window.__game = game;
  game.setupBots(CONF.BOTS);
  if (params.has('nogear')) for (const c of game.cars) game.setSpec(c, { ...c.spec, gear: [] });   // test: bottar utan tillbehör
  game.race.toGrid(99999);

  let spec = loadSpec();
  let name = '';
  try { name = localStorage.getItem('knuff_namn') || ''; } catch { /* ok */ }
  $('namein').value = name;

  game.onLocalResult = (me) => {
    try {
      const st = JSON.parse(localStorage.getItem('knuff_stats') || '{"races":0,"wins":0,"podiums":0,"kos":0}');
      st.races++; if (me.place === 1) st.wins++; if (me.place <= 3) st.podiums++; st.kos += me.kos || 0;
      localStorage.setItem('knuff_stats', JSON.stringify(st));
    } catch { /* ok */ }
  };

  let busy = false, inGame = false;
  const enterGame = () => {
    inGame = true;
    closeGarage();
    $('menu').classList.add('hidden');
    hud.show(true);
    if ('ontouchstart' in window) $('touch').classList.remove('hidden');
    tractorTip();
  };
  const tractorTip = () => {
    const T = VTYPES[spec.kind || 'stock'], tip = spec.kind === 'traktor' ? '🚜 Håll E (eller SKOPA) för att lyfta skopan — kör upp bakom någon och lyft!' : SPECIALS[T?.special]?.tips;
    if (tip) hud.toast(tip, 'good');
  };
  const readName = () => {
    name = ($('namein').value || '').trim().slice(0, 16) || 'Spelare';
    try { localStorage.setItem('knuff_namn', name); } catch { /* ok */ }
    spec.driver = name;
    // titel efter hur många race man vunnit/kört
    let st = { races: 0, wins: 0 };
    try { st = JSON.parse(localStorage.getItem('knuff_stats') || '{}'); } catch { /* ok */ }
    const lvl = (st.wins || 0) >= 10 ? 4 : (st.wins || 0) >= 4 ? 3 : (st.races || 0) >= 10 ? 2 : (st.races || 0) >= 3 ? 1 : 0;
    spec.title = TITLES[lvl];
  };
  // Ensam (eller som värd): egen bil + bottar på griden
  const startLocal = () => {
    if (!game.me) game.addCar({ name, isPlayer: true, spec });
    if (params.has('bot')) game.me.brain = new BotBrain(Math.random); // testläge: AI kör spelarens bil
    // online: samlas i lobbyn först; ensam: racet börjar direkt
    if (game.net) game.race.toLobby();
    else game.race.toGrid(params.has('auto') ? 2 : CONF.GRID_WAIT);
    enterGame();
  };
  const startSolo = () => { if (busy) return; readName(); audio.start(); game.setTrack(trackChoice); startLocal(); };
  // Online: gå med i rummet, finns ingen värd blir man värd
  const startOnline = async (room, opts = {}) => {
    if (busy) return;
    busy = true;
    readName(); audio.start();
    $('netstatus').textContent = 'Ansluter…';
    let res = null;
    try { res = await connectRoom(room, (s) => { $('netstatus').textContent = s; }); } catch (e) { console.warn(e); }
    busy = false;
    $('netstatus').textContent = '';
    if (!res) { hud.toast('Kunde inte ansluta — du kör med bottar', 'bad'); startLocal(); return; }
    if (res.role === 'host') {
      game.net = new NetHost(game, res.peer);
      game.room = room; game.isPublic = room === PUBLIC;
      if (opts.gp) game.gp = newGP();
      game.setTrack(trackChoice);
      startLocal();
      hud.toast(room === PUBLIC ? 'Du är först här — andra kan gå med i lobbyn' : opts.gp ? `🏆 Grand Prix-rum ${room}: dela koden med dina kompisar!` : `Rum ${room}: dela koden med dina kompisar!`, 'good');
    } else {
      game.becomeClient();
      game.room = room; game.isPublic = room === PUBLIC;
      game.net = new NetClient(game, res.peer, res.conn, { name, spec });
      game.onHostLost = () => {
        hud.toast('Värden lämnade — letar nytt race…', 'bad');
        try { sessionStorage.setItem('knuff_auto', room); } catch { /* ok */ }
        setTimeout(() => location.reload(), 1500);
      };
      enterGame();
      hud.toast(room === PUBLIC ? 'Du gick med i ett öppet race!' : `Du är med i rum ${room}!`, 'good');
    }
  };
  bind('play', 'onclick', () => startOnline(PUBLIC));
  bind('solo', 'onclick', startSolo);
  // Grand Prix-rum: egen kod (eller en påhittad) — kompisarna går med med EGET RUM
  bind('gpbtn', 'onclick', () => {
    let code = ($('roomin').value || '').toUpperCase().replace(/[^A-ZÅÄÖ0-9]/g, '').slice(0, 6);
    if (code.length < 3) { const L = 'ABCDEFGHJKLMNPRSTUVWXYZ'; code = 'GP' + Array.from({ length: 3 }, () => L[Math.floor(Math.random() * L.length)]).join(''); $('roomin').value = code; }
    startOnline(code, { gp: true });
  });
  bind('roombtn', 'onclick', () => {
    const code = ($('roomin').value || '').toUpperCase().replace(/[^A-ZÅÄÖ0-9]/g, '').slice(0, 6);
    if (code.length < 3) { $('roomin').focus(); $('netstatus').textContent = 'Skriv en kod på minst 3 tecken'; return; }
    startOnline(code);
  });
  const start = () => startOnline(PUBLIC);

  // ---------- Garage ----------
  let showcase = null;
  const renderShowcase = () => {
    if (showcase) { game.scene.remove(showcase.group); showcase.dispose(); }
    showcase = makeCarView({ ...spec, driver: name || ($('namein').value || '') });
    const f = game.track.sampleAt(30);
    showcase.group.position.set(f.x, f.y - showcase.T.modelY, f.z);
    showcase.group.quaternion.copy(game.track.quatAt(30));
    showcase.rest();
    showcase.orbitR = 7.2 * Math.max(1, showcase.T.half.z / 2.42) * ({ bigfoot: 1.3, traktor: 1.25, glass: 1.1, rullstol: 0.55, elrullstol: 0.6, plan: 1.35, gokart: 0.6, brandbil: 1.05, stridsvagn: 1.15, ufo: 1.1 }[showcase.T.id] || 1);
    game.scene.add(showcase.group);
    game.showcase = showcase;
  };
  // tillbehör: en sak per plats inom budgeten
  let gtab = 'look';
  const setTab = (t) => {
    gtab = t;
    $('glook').classList.toggle('hidden', t !== 'look');
    $('ggear').classList.toggle('hidden', t !== 'gear');
    for (const b of document.querySelectorAll('.gtabs button')) b.classList.toggle('on', b.dataset.tab === t);
    $('grand').textContent = t === 'gear' ? '🎲 Slumpa grejer' : '🎲 Slumpa';
    if (t === 'gear') renderGear();
  };
  const renderGear = () => {
    const mine = cleanGear(spec.gear, spec.kind), used = gearCost(mine, spec.kind);
    $('gbudbar').style.width = (used / BUDGET * 100).toFixed(0) + '%';
    $('gbudtxt').textContent = `${BUDGET - used} kr kvar`;
    $('gslots').innerHTML = SLOTS.map(sl => {
      const cur = mine.find(x => GEAR[x].slot === sl.id);
      if (blockedSlot(spec.kind, sl.id)) return `<div class="gslot"><label>${sl.namn}</label><div class="gfull">${spec.kind === 'plan' ? '🌀 Propellern sitter redan här — den skär i allt framför planet' : '🚜 Frontlastaren sitter redan här — den knuffar undan allt framför traktorn'}</div></div>`;
      const btns = GEAR_IDS.filter(id => GEAR[id].slot === sl.id).map(id => {
        const it = GEAR[id], on = mine.includes(id), afford = on || used - (cur ? GEAR[cur].pris : 0) + it.pris <= BUDGET;
        return `<button data-gear="${id}" class="${on ? 'on' : ''}${afford ? '' : ' poor'}"><span class="gi">${it.ikon}</span>${it.namn}<em>${it.pris} kr</em></button>`;
      }).join('');
      return `<div class="gslot"><label>${sl.namn}</label><div class="opts">${btns}</div></div>`;
    }).join('');
  };
  const buildGarage = () => {
    const g = $('garage');
    const pal = PALETTES.map((p, i) => `<button class="sw" data-p="${i}" style="background:linear-gradient(135deg,${p[0]} 50%,${p[1]} 50%)"></button>`).join('');
    g.querySelector('#gpal').innerHTML = pal;
    g.querySelector('#gpat').innerHTML = PATTERNS.map(p => `<button data-pat="${p}">${({ split: 'Delad', swoosh: 'Svep', stripes: 'Ränder', fade: 'Tona', flames: 'Flammor', shards: 'Skärvor', tech: 'Linjer', halves: 'Halvor' })[p]}</button>`).join('');
    g.querySelector('#gkind').innerHTML = KINDS.map(k => `<button data-kind="${k}">${VTYPES[k].namn}</button>`).join('');
    g.querySelector('#gshape').innerHTML = SHAPES.map((s, i) => `<button data-sh="${i}">${s.namn}</button>`).join('');
    g.querySelector('#gspon').innerHTML = SPONSORS.map(s => `<option>${s}</option>`).join('');
    g.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.p) { const p = PALETTES[+b.dataset.p]; spec.colors = spec.colors[0] === p[0] && spec.colors[1] === p[1] ? [p[0], p[2], p[1]] : p.slice(); }
      if (b.dataset.pat) spec.pattern = b.dataset.pat;
      if (b.dataset.sh) spec.shape = +b.dataset.sh;
      if (b.dataset.kind) {
        spec.kind = b.dataset.kind;
        // skolbussen är gul från början (färgen går att byta)
        if (spec.kind === 'bus' && !spec.busColored) { spec.colors = ['#ffc21a', '#16161a', '#ffffff']; }
        if (spec.kind === 'brandbil' && !spec.fireColored) { spec.colors = ['#d8141c', '#ffd21f', '#ffffff']; }   // brandbilen är röd från början
        if (VTYPES[spec.kind]?.besk) $('gdesc').textContent = `${VTYPES[spec.kind].namn}: ${VTYPES[spec.kind].besk}`;
      }
      if (b.dataset.p && spec.kind === 'bus') spec.busColored = true;
      if (b.dataset.p && spec.kind === 'brandbil') spec.fireColored = true;
      if (b.id === 'gswap') spec.colors = [spec.colors[1], spec.colors[0], spec.colors[2]];
      if (b.dataset.tab) { setTab(b.dataset.tab); return; }
      if (b.dataset.gear) {
        const id = b.dataset.gear, it = GEAR[id], before = cleanGear(spec.gear, spec.kind), next = toggleGear(before, id, spec.kind);
        if (next.join() === before.join() && !before.includes(id)) { $('gdesc').textContent = `💸 ${it.namn} kostar ${it.pris} kr — du har inte råd. Ta bort något först!`; return; }
        spec.gear = next;
        $('gdesc').textContent = next.includes(id) ? `${it.ikon} ${it.namn}: ${it.besk}` : `${it.namn} borttagen.`;
        renderGear();
      }
      if (b.id === 'grand' && gtab === 'gear') { let r = []; while (!r.length) r = randomGear(Math.random, spec.kind); spec.gear = r; $('gdesc').textContent = r.map(id => GEAR[id].ikon + ' ' + GEAR[id].namn).join(' · '); renderGear(); }
      else if (b.id === 'grand') { const r = randomSpec(Math.floor(Math.random() * 1e6), ''); Object.assign(spec, { colors: r.colors, pattern: r.pattern, sponsor: r.sponsor, shape: r.shape }); syncInputs(); }
      if (b.id === 'gdone') { closeGarage(); return; }
      saveSpec(spec); renderShowcase();
    };
    bind('gnum', 'oninput', () => { const n = Math.max(0, Math.min(99, parseInt($('gnum').value, 10) || 0)); spec.number = n; saveSpec(spec); renderShowcase(); });
    bind('gspon', 'onchange', () => { spec.sponsor = $('gspon').value; saveSpec(spec); renderShowcase(); });
  };
  const syncInputs = () => { $('gnum').value = spec.number; $('gspon').value = spec.sponsor; };
  const openGarage = (tab = 'look') => {
    $('garage').classList.remove('hidden');
    $('menu').classList.add('dim');
    setTab(typeof tab === 'string' ? tab : 'look');
    syncInputs();
    renderShowcase();
  };
  function closeGarage() {
    $('garage').classList.add('hidden');
    $('menu').classList.remove('dim');
    if (inGame) $('menu').classList.add('hidden'); // tillbaka till spelet, inte startmenyn
    if (showcase) { game.scene.remove(showcase.group); showcase.dispose(); showcase = null; game.showcase = null; }
    // uppdatera spelarens bil om den finns
    if (game.me) {
      if (spec.kind === 'traktor' && game.me.spec?.kind !== 'traktor') tractorTip();
      game.setSpec(game.me, { ...spec });
      if (game.mode === 'client') game.net?.send({ t: 'spec', spec });
      else game.emit({ t: 'spec', id: game.me.id, spec });
    }
  }
  buildGarage();
  bind('garagebtn', 'onclick', () => openGarage('look'));
  bind('gearbtn', 'onclick', () => openGarage('gear'));
  const garageInGame = (tab) => {
    const ph = game.race.phase;
    if (ph === 'lobby' || ph === 'results' || ph === 'idle' || (ph === 'grid' && !game.net)) { $('menu').classList.remove('hidden'); openGarage(tab); }
    else hud.toast(game.net ? 'Garaget öppnar i lobbyn' : 'Garaget öppnar efter racet');
  };
  bind('sb-garage', 'onclick', () => garageInGame('look'));
  bind('lgear', 'onclick', () => garageInGame('gear'));
  // Lobbyn: redo / starta
  const toggleReady = () => {
    if (!game.me || game.race.phase !== 'lobby') return;
    const on = !game.me.ready;
    game.me.ready = on;
    if (game.mode === 'client') game.net?.send({ t: 'ready', on });
    else game.setReady(game.me, on);
    hud.lobbyKey = '';
  };
  bind('lready', 'onclick', toggleReady);
  // banval i menyn och i lobbyn (bara värden kan byta)
  const renderMenuTracks = () => { const el = $('mtrack'); if (el) el.innerHTML = hud.trackButtons(trackChoice, true, 1); };
  renderMenuTracks();
  const pickTrack = (e) => {
    const n = e.target.closest('[data-gpn]');
    if (n) { game.gpSetCount(+n.dataset.gpn); hud.lobbyKey = ''; return; }
    const b = e.target.closest('[data-track]');
    if (!b) return;
    trackChoice = b.dataset.track;
    try { localStorage.setItem('knuff_bana', trackChoice); } catch { /* ok */ }
    renderMenuTracks();
    if (game.me && game.mode === 'host') { hud.toast('Bygger banan…'); setTimeout(() => { game.changeTrack(trackChoice); hud.lobbyKey = ''; }, 30); }
  };
  bind('mtrack', 'onclick', pickTrack);
  bind('ltrack', 'onclick', pickTrack);
  bind('lstart', 'onclick', () => { if (game.mode === 'host') game.race.startFromLobby(); });
  bind('sb-cam', 'onclick', () => game.cam.toggle());
  // ---------- Ljudlabbet ----------
  const lab = { open: false, kind: 'stock', on: false, gas: false, auto: false, v: 25, scrW: false, scrC: false };
  const KIND_NAMN = Object.fromEntries(KINDS.map(k => [k, k === 'stock' ? 'NASCAR' : VTYPES[k].namn]));
  const optBtns = (cat, attr) => SOUND_OPTS[cat].map(o => `<button data-${attr}="${o.id}" class="${audio.choice[cat] === o.id ? 'on' : ''}">${o.namn}</button>`).join('');
  const renderLab = () => {
    $('lkind').innerHTML = Object.keys(KIND_NAMN).map(k => `<button data-lk="${k}" class="${lab.kind === k ? 'on' : ''}">${KIND_NAMN[k]}</button>`).join('');
    $('lmotor').innerHTML = optBtns(lab.kind, 'lm');
    $('lscrape').innerHTML = optBtns('scrape', 'ls');
    $('lcrash').innerHTML = optBtns('crash', 'lc');
    $('lplay').textContent = lab.on ? '■ STÄNG AV' : '▶ STARTA MOTORN';
    $('lplay').classList.toggle('on', lab.on);
  };
  const openLab = async () => {
    await audio.start();
    lab.open = true;
    $('ljudlabb').classList.remove('hidden');
    $('menu').classList.add('dim');
    renderLab();
    for (const cat of Object.keys(SOUND_OPTS)) audio.preload(cat);
  };
  const closeLab = () => {
    lab.open = false; lab.on = false; lab.gas = false; lab.scrW = lab.scrC = false;
    audio.preview?.(lab.kind, 0, 0, false); audio.scrape?.(0, 0, 0);
    $('ljudlabb').classList.add('hidden');
    $('menu').classList.remove('dim');
    if (inGame) $('menu').classList.add('hidden');
  };
  bind('labbtn', 'onclick', openLab);
  bind('ldone', 'onclick', closeLab);
  $('ljudlabb').onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.lk) lab.kind = b.dataset.lk;
    if (b.dataset.lm) await audio.setChoice(lab.kind, b.dataset.lm);
    if (b.dataset.ls) await audio.setChoice('scrape', b.dataset.ls);
    if (b.dataset.lc) { await audio.setChoice('crash', b.dataset.lc); audio.crash(16, 1); }
    if (b.id === 'lplay') lab.on = !lab.on;
    if (b.id === 'lauto') { lab.on = true; lab.auto = true; lab.v = 0; }
    if (b.id === 'lc1') audio.crash(8, 1);
    if (b.id === 'lc2') audio.crash(20, 1);
    if (b.id === 'lc3') audio.boom(1);
    renderLab();
  };
  const hold = (id, key) => {
    const el = $(id); if (!el) return;
    const on = (e) => { e.preventDefault(); lab[key] = true; el.classList.add('on'); };
    const off = () => { lab[key] = false; el.classList.remove('on'); };
    el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off); el.addEventListener('pointerleave', off); el.addEventListener('pointercancel', off);
  };
  hold('lgas', 'gas'); hold('lscrw', 'scrW'); hold('lscrc', 'scrC');
  bind('lfart', 'oninput', () => { lab.v = +$('lfart').value; lab.auto = false; });
  game.labTick = (dt) => {
    if (!lab.open) return;
    if (lab.auto) { lab.v = Math.min(110, lab.v + dt * ({ bus: 3.5, traktor: 3, bigfoot: 5, glass: 5.5, formel: 10, rullstol: 12, elrullstol: 10, plan: 7, gokart: 11, brandbil: 4, stridsvagn: 3, ufo: 8 }[lab.kind] || 8)); if (lab.v >= 110) lab.auto = false; $('lfart').value = Math.round(lab.v); }
    $('lfartv').textContent = Math.round(lab.v * 3.6) + ' km/h';
    audio.preview(lab.kind, lab.v, lab.gas || lab.auto ? 1 : 0.15, lab.on);
    audio.scrape(lab.scrW ? 1 : 0, lab.scrC ? 1 : 0, lab.scrW || lab.scrC ? Math.max(15, lab.v) : 0);
  };

  const muteBtn = $('sb-mute');
  const syncMute = () => { muteBtn.textContent = audio.muted ? 'LJUD AV' : 'LJUD PÅ'; };
  muteBtn.onclick = () => { audio.setMuted(!audio.muted); syncMute(); };
  syncMute();

  input.onPress = (code) => {
    if (!game.me) { if (code === 'Enter' && !$('menu').classList.contains('hidden') && $('garage').classList.contains('hidden')) start(); return; }
    if (code === 'KeyC') game.cam.toggle();
    if (code === 'KeyM') { audio.setMuted(!audio.muted); syncMute(); }
    if (code === 'KeyR') { game.me.rTry = game.time; if (game.mode === 'client') game.net?.send({ t: 'reset' }); else game.requestReset(game.me); }
    if (code === 'Enter' && $('garage').classList.contains('hidden')) toggleReady();
  };

  $('loading').classList.add('hidden');
  $('menu').classList.remove('hidden');

  // ---------- Loop ----------
  let last = performance.now(), mapT = 0, frames = 0, fpsN = 0, fpsT = 0;
  // Ett fel i en bildruta får aldrig frysa spelet: nästa ruta beställs först, felet rapporteras
  // (högst var 5:e s, som ett vanligt sidfel så testerna ser det) och spelet rullar vidare.
  let errT = -1e9;
  const loop = (now) => {
    requestAnimationFrame(loop);
    try { frame(now); } catch (e) {
      if (now - errT > 5000) { errT = now; setTimeout(() => { throw e; }); }
    }
  };
  const frame = (now) => {
    const dt = (now - last) / 1000; last = now;
    input.update(Math.min(dt, 0.1));
    if (!$('garage').classList.contains('hidden')) { const st = input.state; st.throttle = 0; st.brake = 0; st.steer = 0; st.handbrake = 0; }
    game.tick(dt);
    hud.update(Math.min(dt, 0.1), game);
    mapT += dt;
    if (game.me && mapT > 0.1) { mapT = 0; hud.drawMap(game); }
    if (game.me) {
      const me = game.me, others = [];
      let pack = 0, glassNear = me.spec?.kind === 'glass' && !me.wrecked ? 0.3 : 0, siren = 0, spray = 0, beam = 0;
      // brandbilens siren/vatten och UFO:ts stråle när de är igång — ju närmare, desto starkare
      const spk = (c, d) => {
        const k = c.veh.loader || 0, K = c.spec?.kind;
        if (c.wrecked || c.hidden) return;
        // brandbilen kör alltid med sirenen på (starkare när den sprutar)
        if (K === 'brandbil') { siren = Math.max(siren, Math.max(0, 1 - d / 160) ** 1.3 * (0.6 + 0.4 * k)); spray = Math.max(spray, Math.max(0, 1 - d / 60) * k); }
        else if (K === 'ufo' && k >= 0.05) beam = Math.max(beam, Math.max(0, 1 - d / 70) ** 1.3 * k);
      };
      spk(me, 0);
      for (const c of game.cars) {
        if (c === me || c.hidden) continue;
        const dx = me.veh.pos.x - c.veh.pos.x, dy = me.veh.pos.y - c.veh.pos.y, dz = me.veh.pos.z - c.veh.pos.z;
        const d = Math.hypot(dx, dy, dz) || 1;
        if (d < 45) pack++;
        // glassbilen spelar sin melodi — ju närmare, desto starkare
        if (c.spec?.kind === 'glass' && !c.wrecked && d < 110) glassNear = Math.max(glassNear, (1 - d / 110) ** 1.4);
        spk(c, d);
        if (d < 80) {
          // närmar sig bilen mig? (för dopplereffekten)
          const closing = ((c.veh.vel.x - me.veh.vel.x) * dx + (c.veh.vel.y - me.veh.vel.y) * dy + (c.veh.vel.z - me.veh.vel.z) * dz) / d;
          others.push({ kind: c.spec?.kind || 'stock', v: c.veh.speed, throttle: c.veh.input.throttle || 1, dist: d, pan: _pan(game.camera, c.veh.pos), closing });
        }
      }
      others.sort((a, b) => a.dist - b.dist);
      // skrap: mot vägg (kanten eller taket mot asfalten) eller mot en annan bil — med glidfarten
      const scrWall = (me.veh.up.y < 0.35 && me.veh.speed > 3) || me.scrapeT > 0;
      const scrCar = me.grindT > 0;
      let slide = me.veh.speed;
      if (scrCar && me.contactWith) { const o = me.contactWith.veh; slide = Math.hypot(me.veh.vel.x - o.vel.x, me.veh.vel.z - o.vel.z) + 4; }
      audio.update({ kind: me.spec?.kind || 'stock', v: me.veh.speed, throttle: me.veh.input.throttle, brake: me.veh.input.brake || 0, on: !me.wrecked,
        slip: me.veh.wheels[2].slip + me.veh.wheels[3].slip, drift: me.veh.drift || 0, scrWall, scrCar, slide, glassNear, siren, spray, beam },
        others, me.veh.speed, pack, Math.min(dt, 0.1));
    }
    game.labTick?.(Math.min(dt, 0.1));
    frames++;
    if (frames === 30) window.ready = true;
    fpsN++; fpsT += dt;
    if (fpsT > 1) { window.__fps = Math.round(fpsN / fpsT); fpsN = 0; fpsT = 0; }
  };
  requestAnimationFrame(loop);

  // Värden får inte stanna när fliken ligger i bakgrunden (rAF pausas) — en worker håller takten
  try {
    const wsrc = 'let id=null;onmessage=(e)=>{clearInterval(id);if(e.data)id=setInterval(()=>postMessage(0),33);}';
    const tw = new Worker(URL.createObjectURL(new Blob([wsrc], { type: 'text/javascript' })));
    let lastBg = performance.now();
    tw.onmessage = () => {
      const now = performance.now(), dt = (now - lastBg) / 1000; lastBg = now;
      if (document.hidden && game.net && game.mode === 'host') { game.noRender = true; game.tick(Math.min(dt, 0.1)); game.noRender = false; }
    };
    document.addEventListener('visibilitychange', () => { lastBg = performance.now(); tw.postMessage(document.hidden); });
  } catch { /* ingen worker */ }

  // Automatiskt lägre kvalitet om datorn inte hänger med
  let lowT = 0, lowered = false;
  setInterval(() => {
    if (lowered || document.hidden || !game.me) return;
    if ((window.__fps || 60) < 38) lowT++; else lowT = 0;
    if (lowT >= 4) {
      lowered = true;
      game.renderer.setPixelRatio(1);
      game.renderer.shadowMap.enabled = false;
      game.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
      game.treeRange = 1500;
      hud.toast('Grafiken sänktes för att flyta bättre');
    }
  }, 1000);
  // ny version ute? i menyn: ladda om direkt; i spelet: visa en knapp
  const updBtn = $('updbtn');
  if (updBtn) updBtn.onclick = () => { try { sessionStorage.removeItem('knuff_upd'); } catch { /* ok */ } reloadFresh(); };
  const pollUpdate = async () => {
    const nv = await newerVersion();
    if (!nv) { try { sessionStorage.removeItem('knuff_upd'); } catch { /* ok */ } return; }
    if (!inGame && !busy) { loadTxt('Ny version — laddar om…'); reloadFresh(); return; }
    if (updBtn && updBtn.classList.contains('hidden')) {
      updBtn.textContent = `🔄 NY VERSION v${nv.version} — TRYCK FÖR ATT UPPDATERA`;
      updBtn.classList.remove('hidden');
    }
  };
  if (!params.has('auto')) { pollUpdate(); setInterval(pollUpdate, 60000); }
  // automatisk start: tester (?auto), eller återanslutning efter att värden försvann
  let rejoin = null;
  try { rejoin = sessionStorage.getItem('knuff_auto'); sessionStorage.removeItem('knuff_auto'); } catch { /* ok */ }
  if (rejoin) setTimeout(() => startOnline(rejoin), 300);
  else if (params.has('auto')) setTimeout(() => (params.has('online') ? startOnline(params.get('room') || PUBLIC) : startSolo()), 300);
}

const _r = new THREE.Vector3(), _d = new THREE.Vector3();
function _pan(camera, p) {
  _r.setFromMatrixColumn(camera.matrixWorld, 0);
  _d.copy(p).sub(camera.position).normalize();
  return _r.dot(_d);
}

if (!staleHtml()) boot().catch((e) => {
  console.error(e);
  loadTxt('Något gick fel: ' + e.message + ' — ladda om sidan med Ctrl+Shift+R');
});
