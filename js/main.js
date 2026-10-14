// Uppstart: laddning, meny, garage, spelloop.
import * as THREE from 'three';
import { CONF, VERSION, PROTO, TITLES } from './config.js?v=6';
import { Game } from './game.js?v=6';
import { HUD } from './hud.js?v=6';
import { GameAudio } from './audio.js?v=6';
import { Input } from './input.js?v=6';
import { CarView, SHAPES } from './carmodel.js?v=6';
import { makeLivery, PALETTES, PATTERNS, SPONSORS, randomSpec } from './livery.js?v=6';
import { logoCanvas } from './world.js?v=6';
import { BotBrain } from './ai.js?v=6';
import { connectRoom, NetHost, NetClient } from './net.js?v=6';

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
  const game = new Game(RAPIER, $('game'), { hud, audio, input });
  window.__game = game;
  game.setupBots(CONF.BOTS);
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
  const startSolo = () => { if (busy) return; readName(); audio.start(); startLocal(); };
  // Online: gå med i rummet, finns ingen värd blir man värd
  const startOnline = async (room) => {
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
      startLocal();
      hud.toast(room === PUBLIC ? 'Du är först här — andra kan gå med i lobbyn' : `Rum ${room}: dela koden med dina kompisar!`, 'good');
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
    const sh = SHAPES[spec.shape % SHAPES.length];
    showcase = new CarView(sh, makeLivery({ ...spec, driver: name || ($('namein').value || '') }, sh));
    const f = game.track.sampleAt(30);
    showcase.group.position.set(f.x, f.y + 0.55, f.z);
    showcase.group.quaternion.copy(game.track.quatAt(30));
    showcase.wheels.forEach((w, k) => showcase.setWheel(k, 0.18, 0, 0));
    game.scene.add(showcase.group);
    game.showcase = showcase;
  };
  const buildGarage = () => {
    const g = $('garage');
    const pal = PALETTES.map((p, i) => `<button class="sw" data-p="${i}" style="background:linear-gradient(135deg,${p[0]} 50%,${p[1]} 50%)"></button>`).join('');
    g.querySelector('#gpal').innerHTML = pal;
    g.querySelector('#gpat').innerHTML = PATTERNS.map(p => `<button data-pat="${p}">${({ split: 'Delad', swoosh: 'Svep', stripes: 'Ränder', fade: 'Tona', flames: 'Flammor', shards: 'Skärvor', tech: 'Linjer', halves: 'Halvor' })[p]}</button>`).join('');
    g.querySelector('#gshape').innerHTML = SHAPES.map((s, i) => `<button data-sh="${i}">${s.namn}</button>`).join('');
    g.querySelector('#gspon').innerHTML = SPONSORS.map(s => `<option>${s}</option>`).join('');
    g.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.p) { const p = PALETTES[+b.dataset.p]; spec.colors = spec.colors[0] === p[0] && spec.colors[1] === p[1] ? [p[0], p[2], p[1]] : p.slice(); }
      if (b.dataset.pat) spec.pattern = b.dataset.pat;
      if (b.dataset.sh) spec.shape = +b.dataset.sh;
      if (b.id === 'gswap') spec.colors = [spec.colors[1], spec.colors[0], spec.colors[2]];
      if (b.id === 'grand') { const r = randomSpec(Math.floor(Math.random() * 1e6), ''); Object.assign(spec, { colors: r.colors, pattern: r.pattern, sponsor: r.sponsor, shape: r.shape }); syncInputs(); }
      if (b.id === 'gdone') { closeGarage(); return; }
      saveSpec(spec); renderShowcase();
    };
    bind('gnum', 'oninput', () => { const n = Math.max(0, Math.min(99, parseInt($('gnum').value, 10) || 0)); spec.number = n; saveSpec(spec); renderShowcase(); });
    bind('gspon', 'onchange', () => { spec.sponsor = $('gspon').value; saveSpec(spec); renderShowcase(); });
  };
  const syncInputs = () => { $('gnum').value = spec.number; $('gspon').value = spec.sponsor; };
  const openGarage = () => {
    $('garage').classList.remove('hidden');
    $('menu').classList.add('dim');
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
      game.setSpec(game.me, { ...spec });
      if (game.mode === 'client') game.net?.send({ t: 'spec', spec });
      else game.emit({ t: 'spec', id: game.me.id, spec });
    }
  }
  buildGarage();
  bind('garagebtn', 'onclick', openGarage);
  bind('sb-garage', 'onclick', () => {
    const ph = game.race.phase;
    if (ph === 'lobby' || ph === 'results' || ph === 'idle' || (ph === 'grid' && !game.net)) { $('menu').classList.remove('hidden'); openGarage(); }
    else hud.toast(game.net ? 'Garaget öppnar i lobbyn' : 'Garaget öppnar efter racet');
  });
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
  bind('lstart', 'onclick', () => { if (game.mode === 'host') game.race.startFromLobby(); });
  bind('sb-cam', 'onclick', () => game.cam.toggle());
  const muteBtn = $('sb-mute');
  const syncMute = () => { muteBtn.textContent = audio.muted ? 'LJUD AV' : 'LJUD PÅ'; };
  muteBtn.onclick = () => { audio.setMuted(!audio.muted); syncMute(); };
  syncMute();

  input.onPress = (code) => {
    if (!game.me) { if (code === 'Enter' && !$('menu').classList.contains('hidden') && $('garage').classList.contains('hidden')) start(); return; }
    if (code === 'KeyC') game.cam.toggle();
    if (code === 'KeyM') { audio.setMuted(!audio.muted); syncMute(); }
    if (code === 'KeyR') { if (game.mode === 'client') game.net?.send({ t: 'reset' }); else game.requestReset(game.me); }
    if (code === 'Enter' && $('garage').classList.contains('hidden')) toggleReady();
  };

  $('loading').classList.add('hidden');
  $('menu').classList.remove('hidden');

  // ---------- Loop ----------
  let last = performance.now(), mapT = 0, frames = 0, fpsN = 0, fpsT = 0;
  const loop = (now) => {
    const dt = (now - last) / 1000; last = now;
    input.update(Math.min(dt, 0.1));
    if (!$('garage').classList.contains('hidden')) { const st = input.state; st.throttle = 0; st.brake = 0; st.steer = 0; st.handbrake = 0; }
    game.tick(dt);
    hud.update(Math.min(dt, 0.1), game);
    mapT += dt;
    if (game.me && mapT > 0.1) { mapT = 0; hud.drawMap(game); }
    if (game.me) {
      const me = game.me, others = [];
      let pack = 0;
      for (const c of game.cars) {
        if (c === me || c.hidden) continue;
        const dx = me.veh.pos.x - c.veh.pos.x, dy = me.veh.pos.y - c.veh.pos.y, dz = me.veh.pos.z - c.veh.pos.z;
        const d = Math.hypot(dx, dy, dz) || 1;
        if (d < 45) pack++;
        if (d < 80) {
          // närmar sig bilen mig? (för dopplereffekten)
          const closing = ((c.veh.vel.x - me.veh.vel.x) * dx + (c.veh.vel.y - me.veh.vel.y) * dy + (c.veh.vel.z - me.veh.vel.z) * dz) / d;
          others.push({ v: c.veh.speed, throttle: c.veh.input.throttle || 1, dist: d, pan: _pan(game.camera, c.veh.pos), closing });
        }
      }
      others.sort((a, b) => a.dist - b.dist);
      const scrape = (me.veh.up.y < 0.35 && me.veh.speed > 5) || me.scrapeT > 0 || me.grindT > 0;
      audio.update({ v: me.veh.speed, throttle: me.veh.input.throttle, on: !me.wrecked, slip: me.veh.wheels[2].slip + me.veh.wheels[3].slip, drift: me.veh.drift || 0 },
        others, me.veh.speed, scrape, pack, Math.min(dt, 0.1));
    }
    frames++;
    if (frames === 30) window.ready = true;
    fpsN++; fpsT += dt;
    if (fpsT > 1) { window.__fps = Math.round(fpsN / fpsT); fpsN = 0; fpsT = 0; }
    requestAnimationFrame(loop);
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
