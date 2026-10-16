// Tangentbord, handkontroll och pekskärm → { throttle, brake, steer, handbrake, loader }
export class Input {
  constructor() {
    this.keys = new Set();
    this.state = { throttle: 0, brake: 0, steer: 0, handbrake: 0, loader: 0 };
    this.touch = { left: false, right: false, gas: false, brake: false, loader: false };
    this.onPress = null;
    addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      if (!this.keys.has(e.code)) this.onPress?.(e.code);
      this.keys.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    this._padBtn = {};
  }

  bindTouch(root) {
    const map = { tl: 'left', tr: 'right', tg: 'gas', tb: 'brake', tk: 'loader' };
    for (const [id, key] of Object.entries(map)) {
      const el = root.querySelector('#' + id);
      if (!el) continue;
      const on = (e) => { e.preventDefault(); this.touch[key] = true; el.classList.add('on'); };
      const off = (e) => { e.preventDefault(); this.touch[key] = false; el.classList.remove('on'); };
      el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off); el.addEventListener('pointerleave', off);
    }
  }

  update(dt) {
    const k = this.keys, t = this.touch;
    let thr = (k.has('KeyW') || k.has('ArrowUp') || t.gas) ? 1 : 0;
    let brk = (k.has('KeyS') || k.has('ArrowDown') || t.brake) ? 1 : 0;
    let st = ((k.has('KeyD') || k.has('ArrowRight') || t.right) ? 1 : 0) - ((k.has('KeyA') || k.has('ArrowLeft') || t.left) ? 1 : 0);
    let hb = k.has('Space') ? 1 : 0;
    let ld = (k.has('KeyE') || t.loader) ? 1 : 0;      // traktorns skopa
    // handkontroll
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let analog = null;
    for (const p of pads) {
      if (!p) continue;
      const rt = p.buttons[7]?.value || 0, lt = p.buttons[6]?.value || 0;
      const ax = Math.abs(p.axes[0]) > 0.12 ? p.axes[0] : 0;
      if (rt > 0.05) thr = Math.max(thr, rt);
      if (lt > 0.05) brk = Math.max(brk, lt);
      if (ax) analog = ax;
      if (p.buttons[0]?.pressed) hb = 1;
      if (p.buttons[5]?.pressed || p.buttons[2]?.pressed) ld = 1;
      const y = p.buttons[3]?.pressed, b = p.buttons[1]?.pressed;
      if (y && !this._padBtn.y) this.onPress?.('KeyR');
      if (b && !this._padBtn.b) this.onPress?.('KeyC');
      this._padBtn.y = y; this._padBtn.b = b;
    }
    const s = this.state;
    s.throttle = thr; s.brake = brk; s.handbrake = hb; s.loader = ld;
    if (analog !== null) s.steer = analog;
    else {
      // mjuk styrning för knappar
      const rate = st === 0 ? 7 : (Math.sign(st) !== Math.sign(s.steer) ? 9 : 3.2);
      s.steer += Math.max(-rate * dt, Math.min(rate * dt, st - s.steer));
    }
    return s;
  }
}
