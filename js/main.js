// Uppstart: laddning, meny, garage, spelloop.
import * as THREE from 'three';
import { CONF, VERSION } from './config.js?v=1';
import { Game } from './game.js?v=1';
import { HUD } from './hud.js?v=1';
import { GameAudio } from './audio.js?v=1';
import { Input } from './input.js?v=1';
import { CarView, SHAPES } from './carmodel.js?v=1';
import { makeLivery, PALETTES, PATTERNS, SPONSORS, randomSpec } from './livery.js?v=1';
import { logoCanvas } from './world.js?v=1';
import { BotBrain } from './ai.js?v=1';

const $ = (id) => document.getElementById(id);
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

  game.onRaceEnd = (res) => {
    hud.showResults(res);
    const me = res.find(r => r.isPlayer);
    if (me) {
      try {
        const st = JSON.parse(localStorage.getItem('knuff_stats') || '{"races":0,"wins":0,"podiums":0,"kos":0}');
        st.races++; if (me.place === 1) st.wins++; if (me.place <= 3) st.podiums++; st.kos += me.kos;
        localStorage.setItem('knuff_stats', JSON.stringify(st));
      } catch { /* ok */ }
    }
  };
  game.onFinish = (car) => {
    if (car === game.me) { hud.flash(`MÅL! ${car.finishPlace}:${car.finishPlace <= 2 ? 'a' : 'e'}`); audio.beep(true); }
  };
  game.onWinner = (car) => { if (car !== game.me) hud.toast(`🏁 ${car.name} vann!`); };

  const start = () => {
    name = ($('namein').value || '').trim().slice(0, 16) || 'Spelare';
    try { localStorage.setItem('knuff_namn', name); } catch { /* ok */ }
    audio.start();
    closeGarage();
    $('menu').classList.add('hidden');
    hud.show(true);
    spec.driver = name;
    if (!game.me) game.addCar({ name, isPlayer: true, spec });
    if (params.has('bot')) game.me.brain = new BotBrain(Math.random); // testläge: AI kör spelarens bil
    game.race.toGrid(params.has('auto') ? 2 : CONF.GRID_WAIT);
    if ('ontouchstart' in window) $('touch').classList.remove('hidden');
  };
  $('play').onclick = start;

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
    $('gnum').oninput = () => { const n = Math.max(0, Math.min(99, parseInt($('gnum').value, 10) || 0)); spec.number = n; saveSpec(spec); renderShowcase(); };
    $('gspon').onchange = () => { spec.sponsor = $('gspon').value; saveSpec(spec); renderShowcase(); };
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
    if (showcase) { game.scene.remove(showcase.group); showcase.dispose(); showcase = null; game.showcase = null; }
    // uppdatera spelarens bil om den finns
    if (game.me) {
      const me = game.me;
      spec.driver = me.name;
      const sh = SHAPES[spec.shape % SHAPES.length];
      game.scene.remove(me.view.group); me.view.dispose();
      me.view = new CarView(sh, makeLivery(spec, sh));
      me.spec = spec;
      game.scene.add(me.view.group);
    }
  }
  buildGarage();
  $('garagebtn').onclick = openGarage;
  $('sb-garage').onclick = () => { if (game.race.phase !== 'race') { $('menu').classList.remove('hidden'); openGarage(); } else hud.toast('Garaget öppnar efter racet'); };
  $('sb-cam').onclick = () => game.cam.toggle();
  const muteBtn = $('sb-mute');
  const syncMute = () => { muteBtn.textContent = audio.muted ? 'LJUD AV' : 'LJUD PÅ'; };
  muteBtn.onclick = () => { audio.setMuted(!audio.muted); syncMute(); };
  syncMute();

  input.onPress = (code) => {
    if (!game.me) { if (code === 'Enter') start(); return; }
    if (code === 'KeyC') game.cam.toggle();
    if (code === 'KeyM') { audio.setMuted(!audio.muted); syncMute(); }
    if (code === 'KeyR' && !game.me.wrecked && game.race.phase === 'race') game.respawn(game.me, 5);
  };

  $('loading').classList.add('hidden');
  $('menu').classList.remove('hidden');

  // ---------- Loop ----------
  let last = performance.now(), mapT = 0, frames = 0, fpsN = 0, fpsT = 0;
  const loop = (now) => {
    const dt = (now - last) / 1000; last = now;
    input.update(Math.min(dt, 0.1));
    game.tick(dt);
    hud.update(Math.min(dt, 0.1), game);
    mapT += dt;
    if (game.me && mapT > 0.1) { mapT = 0; hud.drawMap(game); }
    if (game.me) {
      const me = game.me, others = [];
      for (const c of game.cars) {
        if (c === me) continue;
        const d = c.veh.pos.distanceTo(me.veh.pos);
        if (d < 70) others.push({ v: c.veh.speed, throttle: c.veh.input.throttle, dist: d, pan: _pan(game.camera, c.veh.pos) });
      }
      others.sort((a, b) => a.dist - b.dist);
      audio.update({ v: me.veh.speed, throttle: me.veh.input.throttle, on: !me.wrecked }, others, me.veh.speed, me.veh.up.y < 0.35 && me.veh.speed > 5);
    }
    frames++;
    if (frames === 30) window.ready = true;
    fpsN++; fpsT += dt;
    if (fpsT > 1) { window.__fps = Math.round(fpsN / fpsT); fpsN = 0; fpsT = 0; }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  if (params.has('auto')) setTimeout(start, 300);
}

const _r = new THREE.Vector3(), _d = new THREE.Vector3();
function _pan(camera, p) {
  _r.setFromMatrixColumn(camera.matrixWorld, 0);
  _d.copy(p).sub(camera.position).normalize();
  return _r.dot(_d);
}

boot().catch((e) => {
  console.error(e);
  loadTxt('Något gick fel: ' + e.message);
});
