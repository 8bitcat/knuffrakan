// Grand Prix: flera race i slumpad banordning, poäng per race (som F1), pokaler till de tre bästa.
// Värden äger läget (game.gp) och skickar det till gästerna ({ t: 'gp' }); prispallen byggs hos alla.
import * as THREE from 'three';
import { TRACKS } from './track.js?v=23';

export const GP_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];   // plats 11+ = 1 poäng
export const ptsFor = (place) => GP_POINTS[place - 1] ?? 1;
// Grand Prix-race är kortare: ungefär halva antalet varv (minst ett)
export const gpLaps = (def) => Math.max(1, Math.round((def.laps || 1) * 0.5));

export function newGP() {
  return { on: true, stage: 'lobby', count: 5, order: [], idx: -1, table: [], podium: [], last: null };
}
export function shuffledTracks(n) {
  const ids = TRACKS.map(t => t.id);
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  return ids.slice(0, Math.min(ids.length, n || ids.length));
}
// poängen efter ett race: bara riktiga spelare samlar poäng (bottarna kör med men syns inte i tabellen)
export function award(gp, results, isHuman) {
  const got = [];
  for (const r of results) {
    if (!isHuman(r.car)) continue;
    const p = ptsFor(r.place);
    let row = gp.table.find(x => x.id === r.car.id);
    if (!row) { row = { id: r.car.id, name: r.car.name, pts: 0, wins: 0, c1: r.car.spec?.colors?.[0] || '#888' }; gp.table.push(row); }
    row.name = r.car.name; row.pts += p; row.last = p; row.lastPlace = r.place;
    if (r.place === 1) row.wins++;
    got.push(row.id);
  }
  // den som inte var med i racet (lämnat/kommit sent) får inget den gången
  for (const row of gp.table) if (!got.includes(row.id)) { row.last = 0; row.lastPlace = null; }
  gp.table.sort((a, b) => b.pts - a.pts || b.wins - a.wins || (a.lastPlace ?? 99) - (b.lastPlace ?? 99));
}

// ---------- Prispallen: tre block, bilarna överst, stora pokaler, konfetti och fyrverkeri ----------
const METAL = [0xffc72c, 0xdfe4ec, 0xc8783a];        // guld, silver, brons
function cupGeo() {
  const pts = [[0, 0], [1.0, 0], [1.0, 0.22], [0.62, 0.3], [0.26, 0.5], [0.18, 1.15], [0.34, 1.32], [0.82, 1.55], [1.05, 2.1], [1.12, 2.42], [1.04, 2.44], [0.96, 2.2], [0.75, 1.75], [0.3, 1.5]];
  const g = new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 40);
  g.computeVertexNormals();
  return g;
}
function plateTex(text, col) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#f4f2ee'; x.fillRect(0, 0, 256, 256);
  x.fillStyle = col; x.fillRect(0, 0, 256, 34); x.fillRect(0, 222, 256, 34);
  x.fillStyle = col; x.font = 'italic 900 170px "Exo 2", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, 128, 136);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export class Podium {
  constructor(game) {
    this.g = game;
    const T = game.track, s = T.wrapS(55);
    const f = T.sampleAt(s);
    this.center = new THREE.Vector3(f.x, f.y, f.z);
    this.fwd = new THREE.Vector3(f.hx ?? f.fx ?? 1, 0, f.hz ?? f.fz ?? 0).normalize();
    this.right = new THREE.Vector3(f.rx, 0, f.rz).normalize();
    this.grp = new THREE.Group();
    game.scene.add(this.grp);
    this.geos = []; this.mats = []; this.texs = [];
    this.spots = [];
    const H = [3.2, 2.2, 1.5], LAT = [0, -7.5, 7.5], COL = ['#d9a400', '#8a94a6', '#a8602a'];
    const cup = cupGeo(); this.geos.push(cup);
    const ids = game.gp?.podium || [];
    const handle = new THREE.TorusGeometry(0.5, 0.09, 10, 20, Math.PI); this.geos.push(handle);
    this.cups = [];
    for (let k = 0; k < 3; k++) {
      const h = H[k], lat = LAT[k], sc = [1.5, 1.25, 1.1][k];
      // blocket görs så djupt som fordonet kräver: bilen längst fram (nosen mot kameran), pokalen bakom med
      // fritt avstånd — bussen, brandbilen och stridsvagnens kanon får inte gå in i pokalen
      const T = game.carById?.(ids[k])?.veh?.T, G = T?.gear || [];
      const half = T?.half?.z ?? 2.42;
      const F = Math.max(half, T?.gun ? -T.gun.z : 0, T?.prop ? T.prop.z + 0.3 : 0, T?.nozzle ? -T.nozzle.z + 0.3 : 0, T?.loader ? half + 1.0 : 0)
        + (G.some(x => x === 'plog' || x === 'kil' || x === 'ram') ? 1.5 : G.includes('bullbar') ? 0.3 : 0);
      const Rr = half + (G.includes('pushbar') ? 0.4 : 0), tR = 1.55 * sc;
      const D = Math.max(9, F + Rr + 2 * tR + 1.0), sCar = -D / 2 + 0.5 + F, sCup = sCar + Rr + 0.35 + tR;
      const tex = plateTex(String(k + 1), COL[k]); this.texs.push(tex);
      const side = new THREE.MeshStandardMaterial({ color: 0xf4f2ee, roughness: 0.5, emissive: 0x2a2a30 }), front = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.35 });
      this.mats.push(side, front);
      const bg = new THREE.BoxGeometry(7, h, D); this.geos.push(bg);
      // framsidan (mot kameran när den står bakom startlinjen) får siffran
      const block = new THREE.Mesh(bg, [side, side, side, side, front, front]);
      const pos = this.center.clone().addScaledVector(this.right, lat);
      block.position.set(pos.x, pos.y + h / 2, pos.z);
      block.rotation.y = Math.atan2(this.fwd.x, this.fwd.z);
      block.castShadow = true; block.receiveShadow = true;
      this.grp.add(block);
      // pokalen: guld störst
      const metal = new THREE.MeshPhysicalMaterial({ color: METAL[k], metalness: 1, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.08 });
      this.mats.push(metal);
      const trophy = new THREE.Group();
      trophy.add(new THREE.Mesh(cup, metal));
      for (const sd of [-1, 1]) { const hd = new THREE.Mesh(handle, metal); hd.position.set(sd * 1.05, 1.9, 0); hd.rotation.z = sd * Math.PI / 2; trophy.add(hd); }
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.25, 0.5, 24), new THREE.MeshStandardMaterial({ color: 0x1b1c22, roughness: 0.4 }));
      this.geos.push(base.geometry); this.mats.push(base.material);
      base.position.y = -0.25; trophy.add(base);
      trophy.scale.setScalar(sc);
      trophy.traverse(o => { if (o.isMesh) o.castShadow = true; });
      trophy.position.set(pos.x, pos.y + h + 0.5 * sc, pos.z).addScaledVector(this.fwd, sCup);   // bakom bilen (sett från kameran)
      this.grp.add(trophy);
      this.cups.push(trophy);
      this.spots.push({ pos: new THREE.Vector3(pos.x, pos.y + h, pos.z).addScaledVector(this.fwd, sCar), lat });
    }
    // strålkastare på pallen (syns även på nattbanan)
    this.light = new THREE.PointLight(0xfff4e0, 2.6, 90, 1.1);
    this.light.position.copy(this.center).add(new THREE.Vector3(0, 16, 0)).addScaledVector(this.fwd, -10);
    this.grp.add(this.light);
    this.t = 0; this.fwT = 0; this.orbit = 0;
  }
  // varje bildruta: bilarna på blocken (synliga även om de är parkerade), kameran snurrar runt, fest
  frame(dt, ids) {
    const g = this.g;
    this.t += dt;
    ids.forEach((id, k) => {
      const car = g.carById(id); if (!car) return;
      const v = car.view.group, sp = this.spots[k];
      v.position.copy(sp.pos).addScaledVector(new THREE.Vector3(0, 1, 0), -(car.veh.T?.modelY ?? -0.55));
      v.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-this.fwd.x, -this.fwd.z) + Math.PI);
      v.visible = true;
      car.view.rest?.();
      car.tag.place(v.position.x, v.position.y + car.tag.lift, v.position.z, true);
    });
    for (const c of this.cups) c.rotation.y += dt * 0.6;
    // konfetti + fyrverkeri
    const fx = g.fx, C = this.center, r = (s) => (Math.random() * 2 - 1) * s;
    const cols = [0xff3b6b, 0xffd21f, 0x2bd6e8, 0x7aff6a, 0xb06aff].map(h => new THREE.Color(h));
    for (let k = 0; k < 6; k++) {
      const c = cols[Math.floor(Math.random() * cols.length)];
      fx.glow.spawn(C.x + r(14), C.y + 16 + Math.random() * 6, C.z + r(14), r(2), -2 - Math.random() * 2, r(2), 4, 0.35, 0.3, c, c, 1, 1.2, 0.6);
    }
    this.fwT -= dt;
    if (this.fwT <= 0) {
      this.fwT = 0.7 + Math.random() * 0.6;
      const p = new THREE.Vector3(C.x + r(30), C.y + 28 + Math.random() * 14, C.z + r(30));
      const c = cols[Math.floor(Math.random() * cols.length)];
      for (let k = 0; k < 70; k++) {
        const a = Math.random() * Math.PI * 2, b = Math.acos(2 * Math.random() - 1), s = 9 + Math.random() * 5;
        fx.glow.spawn(p.x, p.y, p.z, Math.sin(b) * Math.cos(a) * s, Math.cos(b) * s, Math.sin(b) * Math.sin(a) * s, 1.4 + Math.random() * 0.6, 0.6, 0.15, c, c, 1, 4, 1.2);
      }
      const near = 0.5;
      g.audio?.thump?.(55, 0.35, 0.35 * near);
      g.audio?.noise?.(0.25, 900, 0.18 * near, 0.05, 'highpass');
    }
  }
  // kameran: sakta runt prispallen
  camera(cam, dt) {
    this.orbit += dt * 0.22;
    const C = this.center, R = 24;
    const a = Math.atan2(this.fwd.x, this.fwd.z) + Math.PI + Math.sin(this.orbit) * 0.9;
    cam.position.set(C.x + Math.sin(a) * R, C.y + 7.5, C.z + Math.cos(a) * R);
    cam.lookAt(C.x, C.y + 3.5, C.z);
  }
  dispose() {
    this.g.scene.remove(this.grp);
    for (const x of this.geos) x.dispose();
    for (const m of this.mats) m.dispose();
    for (const t of this.texs) t.dispose();
  }
}
