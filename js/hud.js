import { CONF } from './config.js?v=32';
import { GEAR } from './gear.js?v=32';
import { WEAPONS, WIDS } from './weapons.js?v=32';
import { TRACKS } from './track.js?v=32';
import { SPECIAL_KNAPP } from './vtypes.js?v=32';
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
    this.game = game;
    this.updateLobby(game);
    this.updateGP(game);
    if (!me) return;
    const racing = r.phase === 'race' || r.phase === 'results';
    this.el.placeN.textContent = racing ? me.place : '–';
    this.el.placeOf.textContent = '/' + (r.phase === 'lobby' ? game.cars.filter(c => !c.hidden).length : game.cars.length);
    const km = (x) => (x / 1000).toFixed(1).replace('.', ',');
    const laps = r.laps;
    const lapTxt = laps > 1 ? `VARV ${Math.min(laps, Math.max(1, me.lap + 1))}/${laps}` : `${km(Math.max(0, me.prog))} / ${km(r.dist)} km`;
    this.el.lap.textContent = racing ? (me.finished ? 'I MÅL' : lapTxt) : (r.phase === 'lobby' ? 'LOBBY' : r.phase === 'podium' ? 'PRISUTDELNING' : 'STARTGRID');
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
    this.updateWeapon(game);
    // E-knappen: traktorns skopa och specialförmågorna (pekskärm: knapp, dator: mätare över vapnet)
    const tk = this.tk ||= document.getElementById('tk'), sp = this.sp ||= document.getElementById('spslot');
    const lab = SPECIAL_KNAPP[me.veh.T?.id || me.spec?.kind || 'stock'] || '', tank = me.veh.T?.special ? Math.round((me.veh.tank ?? 1) * 100) : -1;
    const sk = lab + tank;
    if (sk !== this.spKey) {
      this.spKey = sk;
      if (tk) {
        tk.classList.toggle('hidden', !lab); tk.textContent = lab;
        tk.style.background = tank < 0 ? '' : `linear-gradient(to top, rgba(79,195,255,.6) ${tank}%, rgba(0,0,0,.3) ${tank}%)`;
      }
      if (sp) {
        sp.classList.toggle('hidden', tank < 0);
        if (tank >= 0) { sp.querySelector('.sn').textContent = lab; sp.querySelector('b').style.width = tank + '%'; sp.classList.toggle('full', tank >= 99); }
      }
    }
  }

  // glasskulan träffade: rutan kladdas ner en stund (tonar bort)
  splat() {
    const el = this.spl ||= document.getElementById('splat');
    if (!el) return;
    const cols = ['#ff9ec7', '#7a4a2b', '#fff3c4', '#ff5fa2', '#9fe3c0'];
    el.innerHTML = Array.from({ length: 7 }, (_, i) => `<i style="left:${4 + Math.random() * 72}%;top:${4 + Math.random() * 62}%;width:${16 + Math.random() * 22}vmin;height:${14 + Math.random() * 20}vmin;background:${cols[i % cols.length]};transform:rotate(${Math.round(Math.random() * 360)}deg)"></i>`).join('');
    el.style.transition = 'none'; el.style.opacity = '1'; el.classList.remove('hidden');
    clearTimeout(this.splT);
    this.splT = setTimeout(() => { el.style.transition = 'opacity 1.3s'; el.style.opacity = '0'; }, 1500);
  }

  // Vapnet man har (nere i mitten): ruletten snurrar när man kört genom en låda
  updateWeapon(game) {
    const el = this.ws ||= document.getElementById('wslot'), tw = this.tw ||= document.getElementById('tw');
    if (!el) return;
    const me = game.me, cli = game.mode === 'client';
    const code = cli ? (me.wcode || 0) : me.rollT > 0 ? -1 : me.weapon ? WIDS.indexOf(me.weapon.id) + 1 : 0;
    const ammo = cli ? me.wammo : me.weapon?.ammo;
    let key = 'none', ic = '', nm = '';
    // (tål konstiga värden: simuleringsverktygen kör utan klocka, en gäst kan få en kod från en annan version)
    if (code === -1) { const n = WIDS.length, id = WIDS[((Math.floor((game.time || 0) * 14) % n) + n) % n]; ic = WEAPONS[id].ikon; nm = '…'; key = 'roll' + id; }
    else if (code > 0 && WEAPONS[WIDS[code - 1]]) { const W = WEAPONS[WIDS[code - 1]]; ic = W.ikon; nm = W.namn + (ammo > 1 ? ' ×' + ammo : ''); key = ic + nm; }
    if (key === this.wKey) return;
    this.wKey = key;
    el.classList.toggle('hidden', code === 0); el.classList.toggle('roll', code === -1);
    el.querySelector('.wi').textContent = ic; el.querySelector('.wn').textContent = nm;
    if (tw) tw.classList.toggle('hidden', code <= 0);
  }

  // Lobbypanelen: rumskod, vilka som är med, redo, start
  updateLobby(game) {
    if (!this.el.lobby) return;
    const info = game.race.phase === 'lobby' ? game.lobbyInfo : null;
    this.el.lobby.classList.toggle('hidden', !info || !game.me);
    document.body.classList.toggle('inlobby', !!(info && game.me));        // minikartan skymde STARTA-knappen
    if (!info || !game.me) return;
    const myId = game.me.id, isHost = game.mode === 'host';
    const players = info.players || [];
    const mine = players.find(p => p.id === myId);
    const gp = info.gp;
    const key = JSON.stringify(players) + isHost + JSON.stringify(gp);
    if (key !== this.lobbyKey) {
      this.lobbyKey = key;
      this.el.lroom.textContent = info.pub ? 'ÖPPET RACE' : (gp ? '🏆 GRAND PRIX · RUM ' : 'RUM ') + info.room;
      // Grand Prix: värden väljer hur många banor (de slumpas när man startar)
      // eget rum: värden väljer vanligt race eller Grand Prix
      const mode = info.pub ? '' : `<div class="lmode"><button data-gpmode="0" class="${gp ? '' : 'on'}" ${isHost ? '' : 'disabled'}>🏁 RACE</button><button data-gpmode="1" class="${gp ? 'on' : ''}" ${isHost ? '' : 'disabled'}>🏆 GRAND PRIX</button></div>`;
      this.el.ltrack.innerHTML = mode + (gp
        ? `<div class="gpn">Antal banor (slumpad ordning)</div><div class="gprow">` + [[3, '3'], [5, '5'], [8, '8'], [0, 'ALLA ' + TRACKS.length]].map(([n, t]) =>
          `<button data-gpn="${n}" class="${gp.count === n ? 'on' : ''}" ${isHost ? '' : 'disabled'}>${t}</button>`).join('')
          + `</div><div class="gpn">Varv per bana</div><div class="gprow">` + [2, 3, 4, 5, 6].map(n =>
          `<button data-gpl="${n}" class="${(gp.laps || 2) === n ? 'on' : ''}" ${isHost ? '' : 'disabled'}>${n}</button>`).join('') + '</div>'
        : this.trackButtons(info.track, isHost, info.laps));
      this.el.lstart.textContent = gp ? 'STARTA GRAND PRIX' : 'STARTA RACE';
      this.el.lshare.textContent = info.pub ? 'Alla som trycker SPELA hamnar här' : `Kompisarna trycker GÅ MED I RUM och skriver ${info.room}`;
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
    else if (isHost) tt = n > 1 ? (gp ? 'Tryck STARTA GRAND PRIX när alla är här' : 'Tryck STARTA RACE när alla är här') : 'Väntar på kompisar… eller starta direkt';
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

  showResults(results, game = this.game) {
    this.lastRes = results;
    const gp = game?.gp;
    const inGP = gp?.on && gp.order?.length && gp.stage !== 'lobby';
    const rows = results.slice(0, inGP ? 10 : 20).map(r => `<tr class="${r.isPlayer ? 'me' : ''}"><td>${r.place}</td><td>${esc(r.name)}</td><td>${r.time != null ? fmt(r.time) : '—'}</td><td>${r.kos ? '💥'.repeat(Math.min(5, r.kos)) : ''}</td></tr>`).join('');
    let html = `<h2>RESULTAT${inGP ? ' — ' + esc(game.track.namn) : ''}</h2><table><tr><th>#</th><th>Förare</th><th>Tid</th><th>Utslagna</th></tr>${rows}</table>`;
    // Grand Prix-tabellen under racets resultat
    if (inGP) {
      const medal = ['🥇', '🥈', '🥉'];
      const t = (gp.table || []).map((r, i) => `<tr class="${game.me && r.id === game.me.id ? 'me' : ''}"><td class="pl">${medal[i] || i + 1}</td><td>${esc(r.name)}</td><td><b>${r.pts}</b> p</td><td>${r.last ? '+' + r.last : ''}</td></tr>`).join('');
      const next = gp.order[gp.idx + 1];
      const nx = next ? `Nästa: ${esc((TRACKS.find(x => x.id === next) || {}).namn || next)}` : '🏆 Sista banan klar — prisutdelning!';
      html += `<div class="gpt"><h3>GRAND PRIX · efter bana ${gp.idx + 1} av ${gp.order.length}</h3><table>${t}</table><div class="nx">${nx}</div></div>`;
    }
    this.el.results.innerHTML = html;
    this.el.results.classList.remove('hidden');
  }
  // Grand Prix-läget ändrades (poäng kom efter resultatet): rita om
  gpChanged(game) {
    this.game = game; this.lobbyKey = '';
    if (this.lastRes && !this.el.results.classList.contains('hidden')) this.showResults(this.lastRes, game);
  }
  // prisutdelningen: de tre bästa med pokaler + resten
  updateGP(game) {
    const fin = this.gpF ||= document.getElementById('gpfinal'), badge = this.gpB ||= document.getElementById('gpb');
    const gp = game.gp, ph = game.race.phase;
    if (badge) {
      const txt = gp?.on && gp.order?.length && (ph === 'grid' || ph === 'count' || ph === 'race') ? `🏆 GRAND PRIX · BANA ${gp.idx + 1}/${gp.order.length}` : '';
      if (badge.textContent !== txt) { badge.textContent = txt; badge.classList.toggle('hidden', !txt); }
    }
    if (!fin) return;
    if (ph === 'podium' && !this.el.results.classList.contains('hidden')) this.hideResults();
    const show = ph === 'podium' && gp?.table?.length;
    const key = show ? JSON.stringify(gp.table) : '';
    if (key === this.finKey) return;
    this.finKey = key;
    fin.classList.toggle('hidden', !show);
    if (!show) return;
    const medal = ['🥇', '🥈', '🥉'], T = gp.table;
    const pod = [1, 0, 2].filter(i => T[i]).map(i => `<div>${medal[i]} ${esc(T[i].name)}<span>${T[i].pts} poäng · ${T[i].wins} segrar</span></div>`).join('');
    const rest = T.slice(3).map((r, i) => `${i + 4}. ${esc(r.name)} ${r.pts} p`).join(' · ');
    fin.innerHTML = `<h2>🏆 ${esc(T[0].name)} VANN GRAND PRIX!</h2><div class="pod">${pod}</div>${rest ? `<div class="rest">${rest}</div>` : ''}`;
  }

  hideResultsGP() { this.lastRes = null; }
  hideResults() { this.el.results.classList.add('hidden'); this.lastRes = null; }
}

function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
