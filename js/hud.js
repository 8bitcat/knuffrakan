import { CONF } from './config.js?v=15';
import { GEAR } from './gear.js?v=15';
// HUD: placering, varv/tid, meddelanden, resultat, minikarta.
const $ = (id) => document.getElementById(id);
const fmt = (t) => { const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + s.toFixed(2).padStart(5, '0'); };

export class HUD {
  constructor() {
    this.el = {
      hud: $('hud'), place: $('place'), placeN: $('placeN'), placeOf: $('placeOf'), status: $('status'), lap: $('lap'),
      timer: $('timer'), flash: $('flash'), toasts: $('toasts'), results: $('results'), map: $('minimap'), health: $('healthbar'),
      boost: $('draft'), bonus: $('bonus'), saves: $('saves'), mates: $('mates'), flipm: $('flipm'), flipbar: $('flipbar'), fliptxt: $('fliptxt'),
      lobby: $('lobby'), ltrack: $('ltrack'), lroom: $('lroom'), lshare: $('lshare'), lplayers: $('lplayers'), ltimer: $('ltimer'), lready: $('lready'), lstart: $('lstart'),
    };
    this.mapCtx = this.el.map.getContext('2d');
    this.flashT = 0;
  }
  show(on) { this.el.hud.classList.toggle('hidden', !on); }

  toast(msg, kind = '') {
    const d = document.createElement('div');
    d.className = 'toast ' + kind;
    d.textContent = msg;
    this.el.toasts.prepend(d);
    while (this.el.toasts.children.length > 4) this.el.toasts.lastChild.remove();
    setTimeout(() => d.classList.add('out'), 2600);
    setTimeout(() => d.remove(), 3200);
  }
  flash(msg) {
    this.el.flash.textContent = msg;
    this.el.flash.classList.remove('pop'); void this.el.flash.offsetWidth; this.el.flash.classList.add('pop');
    this.flashT = 1.4;
  }

  update(dt, game) {
    const r = game.race, me = game.me;
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.el.flash.textContent = ''; }
    if (r.phase === 'count') {
      const n = Math.ceil(r.t - 0.6);
      const txt = n > 0 ? String(n) : '';
      if (this.el.flash.textContent !== txt && n > 0) { this.flash(txt); game.audio?.beep(false); }
    }
    this.el.status.textContent = r.statusText();
    this.updateLobby(game);
    if (!me) return;
    const racing = r.phase === 'race' || r.phase === 'results';
    this.el.placeN.textContent = racing ? me.place : '–';
    this.el.placeOf.textContent = '/' + (r.phase === 'lobby' ? game.cars.filter(c => !c.hidden).length : game.cars.length);
    const km = (x) => (x / 1000).toFixed(1).replace('.', ',');
    const laps = r.laps;
    const lapTxt = laps > 1 ? `VARV ${Math.min(laps, Math.max(1, me.lap + 1))}/${laps}` : `${km(Math.max(0, me.prog))} / ${km(r.dist)} km`;
    this.el.lap.textContent = racing ? (me.finished ? 'I MÅL' : lapTxt) : (r.phase === 'lobby' ? 'LOBBY' : 'STARTGRID');
    if (racing && laps > 1 && me.lap + 1 !== this.lastLap) {
      if (this.lastLap && me.lap + 1 > this.lastLap && me.lap + 1 <= laps) this.flash(me.lap + 1 === laps ? 'SISTA VARVET!' : `VARV ${me.lap + 1}`);
      this.lastLap = me.lap + 1;
    }
    if (!racing) this.lastLap = 0;
    this.el.timer.textContent = racing ? fmt(me.finished ? me.finishT : r.raceT) : '0:00.00';
    this.el.health.style.width = Math.max(0, me.health) + '%';
    this.el.health.style.background = me.health > 60 ? '#5bff7a' : me.health > 30 ? '#ffc23a' : '#ff3b3b';
    this.el.boost.classList.toggle('on', !!me.drafting && r.phase === 'race');
    // fartbonus: ju längre bak, desto högre toppfart
    const bonus = r.phase === 'race' && !me.finished ? Math.round(me.veh.vmax * 3.6 - CONF.BASE_KMH) : 0;
    const bt = bonus > 2 ? `+${bonus} km/h bakifrån` : (r.phase === 'race' && me.place === 1 ? 'LEDARE – långsammast' : '');
    if (this.el.bonus.textContent !== bt) this.el.bonus.textContent = bt;
    // räddningar (R) kvar
    if (this.el.saves) {
      const n = me.saves ?? CONF.SAVES;
      const st = r.phase === 'race' ? `R-RÄDDNINGAR <b class="${n ? '' : 'none'}">${'●'.repeat(n)}${'○'.repeat(Math.max(0, CONF.SAVES - n))}</b>` : '';
      if (this.savesKey !== st) { this.savesKey = st; this.el.saves.innerHTML = st; }
    }
    // R-mätaren: på taket alltid, efter luftfärd bara när man nyss försökt trycka R
    if (this.el.flipm) {
      const ft = me.flipT || 0, upside = me.rstate === 2, air = me.rstate === 1;
      const tried = game.time - (me.rTry ?? -9) < 2.5;
      const show = !me.wrecked && (r.phase === 'race' || r.phase === 'lobby') &&
        ((upside && ft > 0.15) || (tried && (air || me.lockT > 0)));
      this.el.flipm.classList.toggle('hidden', !show);
      if (show) {
        const k = upside ? Math.min(1, ft / CONF.FLIP_WAIT) : air ? 0 : 1 - (me.lockT || 0) / CONF.AIR_LOCK;
        this.el.flipbar.style.width = (k * 100).toFixed(0) + '%';
        const head = upside ? 'PÅ TAKET' : air ? 'I LUFTEN' : 'R LÅST EFTER HOPPET';
        const headEl = this.el.flipm.firstElementChild; if (headEl && headEl.textContent !== head) headEl.textContent = head;
        const txt = air ? 'I luften…' : k >= 1 ? 'Tryck R!' : 'Vänta…';
        if (this.el.fliptxt.textContent !== txt) { this.el.fliptxt.textContent = txt; this.el.fliptxt.classList.toggle('go', k >= 1); }
      }
    }
    this.updateMates(game, racing);
    const tk = this.tk ||= document.getElementById('tk');
    if (tk) { const on = me.spec?.kind === 'traktor'; if (tk.classList.contains('hidden') === on) tk.classList.toggle('hidden', !on); }
  }

  // Lobbypanelen: rumskod, vilka som är med, redo, start
  updateLobby(game) {
    if (!this.el.lobby) return;
    const info = game.race.phase === 'lobby' ? game.lobbyInfo : null;
    this.el.lobby.classList.toggle('hidden', !info || !game.me);
    if (!info || !game.me) return;
    const myId = game.me.id, isHost = game.mode === 'host';
    const players = info.players || [];
    const mine = players.find(p => p.id === myId);
    const key = JSON.stringify(players) + isHost;
    if (key !== this.lobbyKey) {
      this.lobbyKey = key;
      this.el.lroom.textContent = info.pub ? 'ÖPPET RACE' : 'RUM ' + info.room;
      this.el.ltrack.innerHTML = this.trackButtons(info.track, isHost, info.laps);
      this.el.lshare.textContent = info.pub ? 'Alla som trycker KÖR! hamnar här' : `Kompisar skriver ${info.room} och trycker EGET RUM`;
      this.el.lplayers.innerHTML = players.map(p => `<div class="lp${p.ready ? ' ready' : ''}${p.id === myId ? ' me' : ''}">
        <span class="chip" style="background:linear-gradient(135deg,${esc(p.c1)} 55%,${esc(p.c2)} 55%)">${esc(String(p.nr ?? ""))}</span>
        <span class="nm">${esc(p.name)}${p.host ? ' <span class="host">värd</span>' : ''}<span class="gear">${(p.gear || []).map(g => GEAR[g]?.ikon || '').join('')}</span></span>
        <span class="rd">${p.ready ? 'REDO ✓' : 'väntar…'}</span></div>`).join('');
      this.el.lready.classList.toggle('on', !!mine?.ready);
      this.el.lready.textContent = mine?.ready ? 'REDO ✓' : 'REDO';
      this.el.lstart.classList.toggle('hidden', !isHost);
    }
    const n = players.length;
    let tt;
    if (info.readyT != null) tt = `Alla är redo — start om ${Math.max(1, Math.ceil(info.readyT))}`;
    else if (info.pub && info.t > 0) tt = `Startar av sig själv om ${Math.ceil(info.t)} s`;
    else if (isHost) tt = n > 1 ? 'Tryck STARTA RACE när alla är här' : 'Väntar på kompisar… eller starta direkt';
    else tt = 'Väntar på att värden startar…';
    if (this.el.ltimer.textContent !== tt) this.el.ltimer.textContent = tt;
  }

  // Kompisarna (riktiga spelare) med placering och avstånd — uppe till höger
  updateMates(game, racing) {
    if (!this.el.mates) return;
    const me = game.me;
    const humans = game.cars.filter(c => game.isHuman(c) || c === me);
    let html = '';
    if (racing && humans.length > 1) {
      const rows = humans.slice().sort((a, b) => (a.place || 99) - (b.place || 99)).map(c => {
        const gap = c === me ? '' : (() => { const d = Math.round((c.prog || 0) - (me.prog || 0)); const km = Math.abs(d) >= 1000 ? (Math.abs(d) / 1000).toFixed(1).replace('.', ',') + ' km' : Math.abs(d) + ' m'; return (d >= 0 ? '+' : '−') + km; })();
        return `<div class="m${c === me ? ' me' : ''}"><span class="chip" style="background:${esc(c.spec?.colors?.[0] || '#888')}"></span><span>${esc(c.name)}</span><span class="g">${c.finished ? 'I MÅL' : gap}</span><span class="p">${c.place || '–'}</span></div>`;
      }).join('');
      html = `<div class="mh">KOMPISAR</div>${rows}`;
    }
    if (this.matesKey !== html) { this.matesKey = html; this.el.mates.innerHTML = html; }
  }

  // banval: värden får knappar, gästerna ser vilken bana det blir
  trackButtons(cur, canPick, laps) {
    const list = this.tracks || [];
    if (!canPick) { const t = list.find(x => x.id === cur); return t ? `<span class="tcur">BANA: <b>${esc(t.namn)}</b> · ${laps} varv</span>` : ''; }
    return list.map(t => `<button class="tbt${t.id === cur ? ' on' : ''}" data-track="${t.id}" title="${esc(t.besk)}">${esc(t.namn)}<i>${t.laps || 1} varv</i></button>`).join('');
  }

  drawMap(game) {
    const c = this.mapCtx, T = game.track, cv = this.el.map;
    const W = cv.width, H = cv.height;
    if (!this.mapBase) {
      const b = T.bounds, pad = 14;
      const sc = Math.min((W - pad * 2) / (b.maxX - b.minX), (H - pad * 2) / (b.maxZ - b.minZ));
      this.mapTf = (x, z) => [pad + (x - b.minX) * sc + ((W - pad * 2) - (b.maxX - b.minX) * sc) / 2, pad + (z - b.minZ) * sc + ((H - pad * 2) - (b.maxZ - b.minZ) * sc) / 2];
      const off = document.createElement('canvas'); off.width = W; off.height = H;
      const o = off.getContext('2d');
      o.strokeStyle = 'rgba(255,255,255,0.9)'; o.lineWidth = 5; o.lineJoin = 'round';
      o.beginPath();
      for (let i = 0; i <= T.N; i += 4) { const [x, y] = this.mapTf(T.px[i % T.N], T.pz[i % T.N]); i ? o.lineTo(x, y) : o.moveTo(x, y); }
      o.closePath(); o.stroke();
      const [sx, sy] = this.mapTf(T.px[0], T.pz[0]);
      o.fillStyle = '#111'; o.fillRect(sx - 2, sy - 7, 4, 14);
      this.mapBase = off;
    }
    c.clearRect(0, 0, W, H);
    c.drawImage(this.mapBase, 0, 0);
    for (const car of game.cars) {
      if (car.hidden) continue;
      const [x, y] = this.mapTf(car.veh.pos.x, car.veh.pos.z);
      c.fillStyle = car.isPlayer ? '#ffe23a' : (car.wrecked ? '#ff5b3b' : '#5b8cff');
      c.beginPath(); c.arc(x, y, car.isPlayer ? 5 : 3, 0, Math.PI * 2); c.fill();
      if (car.isPlayer) { c.strokeStyle = '#111'; c.lineWidth = 1.5; c.stroke(); }
    }
  }

  showResults(results) {
    const rows = results.slice(0, 20).map(r => `<tr class="${r.isPlayer ? 'me' : ''}"><td>${r.place}</td><td>${esc(r.name)}</td><td>${r.time != null ? fmt(r.time) : '—'}</td><td>${r.kos ? '💥'.repeat(Math.min(5, r.kos)) : ''}</td></tr>`).join('');
    this.el.results.innerHTML = `<h2>RESULTAT</h2><table><tr><th>#</th><th>Förare</th><th>Tid</th><th>Utslagna</th></tr>${rows}</table>`;
    this.el.results.classList.remove('hidden');
  }
  hideResults() { this.el.results.classList.add('hidden'); }
}

function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
