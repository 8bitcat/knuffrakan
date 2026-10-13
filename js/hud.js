import { CONF } from './config.js?v=2';
// HUD: placering, varv/tid, meddelanden, resultat, minikarta.
const $ = (id) => document.getElementById(id);
const fmt = (t) => { const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + s.toFixed(2).padStart(5, '0'); };

export class HUD {
  constructor() {
    this.el = {
      hud: $('hud'), place: $('place'), placeN: $('placeN'), placeOf: $('placeOf'), status: $('status'), lap: $('lap'),
      timer: $('timer'), flash: $('flash'), toasts: $('toasts'), results: $('results'), map: $('minimap'), health: $('healthbar'),
      boost: $('draft'), bonus: $('bonus'),
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
    if (!me) return;
    const racing = r.phase === 'race' || r.phase === 'results';
    this.el.placeN.textContent = racing ? me.place : '–';
    this.el.placeOf.textContent = '/' + game.cars.length;
    const km = (x) => (x / 1000).toFixed(1).replace('.', ',');
    this.el.lap.textContent = racing ? (me.finished ? 'I MÅL' : `${km(Math.max(0, me.prog))} / ${km(r.dist)} km`) : 'STARTGRID';
    this.el.timer.textContent = racing ? fmt(me.finished ? me.finishT : r.raceT) : '0:00.00';
    this.el.health.style.width = Math.max(0, me.health) + '%';
    this.el.health.style.background = me.health > 60 ? '#5bff7a' : me.health > 30 ? '#ffc23a' : '#ff3b3b';
    this.el.boost.classList.toggle('on', !!me.drafting && r.phase === 'race');
    // fartbonus: ju längre bak, desto högre toppfart
    const bonus = r.phase === 'race' && !me.finished ? Math.round(me.veh.vmax * 3.6 - CONF.BASE_KMH) : 0;
    const bt = bonus > 2 ? `+${bonus} km/h bakifrån` : (r.phase === 'race' && me.place === 1 ? 'LEDARE – långsammast' : '');
    if (this.el.bonus.textContent !== bt) this.el.bonus.textContent = bt;
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
