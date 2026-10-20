// Tillbehör: köps inför racet för en liten budget. Ett per plats (fram, sidor, bak, kaross).
// Fysiken: plog/kil/murbräcka är riktiga kroppsdelar fram (krockar bara med bilar) + knuffar i game.js;
// övriga ändrar fordonets värden (withGear) eller skadan i smällarna.
export const BUDGET = 100;

export const SLOTS = [
  { id: 'front', namn: 'Fram' },
  { id: 'side', namn: 'Sidor' },
  { id: 'rear', namn: 'Bak' },
  { id: 'body', namn: 'Kaross' },
];

export const GEAR = {
  plog: { slot: 'front', namn: 'Snöplog', ikon: '🚜', pris: 40, besk: 'V-plog fram: bilar du kör in i knuffas undan åt sidan och sladdar' },
  kil: { slot: 'front', namn: 'Kil', ikon: '📐', pris: 35, besk: 'Låg ramp fram: bilar du kör in i åker upp på kilen och välter' },
  ram: { slot: 'front', namn: 'Murbräcka', ikon: '🔨', pris: 30, besk: 'Stålspets fram: dina smällar framifrån gör tre gånger så ont' },
  bullbar: { slot: 'front', namn: 'Tjurfångare', ikon: '🐂', pris: 15, besk: 'Rörbåge fram: du tål smällar framifrån mycket bättre' },
  sidopansar: { slot: 'side', namn: 'Sidopansar', ikon: '🛡️', pris: 25, besk: 'Tjocka sidoplåtar: svårare att knuffa, spinna och skada dig från sidan' },
  spikar: { slot: 'side', namn: 'Fälgspikar', ikon: '🌵', pris: 20, besk: 'Spikar på hjulen: den du nöter mot tar skada och tappar greppet' },
  pushbar: { slot: 'rear', namn: 'Bakskydd', ikon: '🧱', pris: 15, besk: 'Stålbåge bak: svårt att PIT-spinna dig, tål smällar bakifrån' },
  vinge: { slot: 'rear', namn: 'Stor vinge', ikon: '🪽', pris: 20, besk: 'Mer grepp i fart: lättare att rädda en sladd' },
  pansar: { slot: 'body', namn: 'Pansarplåt', ikon: '⛓️', pris: 30, besk: 'Tål 35 % mer — men tyngre och lite segare' },
  bur: { slot: 'body', namn: 'Störtbur', ikon: '🏗️', pris: 15, besk: 'Vänder dig tillbaka på hjulen mycket snabbare' },
};
export const GEAR_IDS = Object.keys(GEAR);

// platser som fordonet redan har fyllt (traktorns frontlastare sitter fram)
export const blockedSlot = (kind, slot) => (kind === 'traktor' || kind === 'plan' || kind === 'ufo' || kind === 'heli') && slot === 'front';

// giltig lista: kända saker, en per plats, inom budget (i den ordning de valdes)
export function cleanGear(list, kind) {
  const out = [], slots = new Set();
  let cost = 0;
  for (const id of Array.isArray(list) ? list : []) {
    const g = GEAR[id];
    if (!g || slots.has(g.slot) || blockedSlot(kind, g.slot) || cost + g.pris > BUDGET) continue;
    out.push(id); slots.add(g.slot); cost += g.pris;
  }
  return out;
}
export const gearCost = (list, kind) => cleanGear(list, kind).reduce((s, id) => s + GEAR[id].pris, 0);

// välj/avvälj en sak: byter ut det som satt på samma plats
export function toggleGear(list, id, kind) {
  const cur = cleanGear(list, kind);
  if (cur.includes(id)) return cur.filter(x => x !== id);
  const g = GEAR[id];
  if (blockedSlot(kind, g.slot)) return cur;
  const next = cur.filter(x => GEAR[x].slot !== g.slot);
  if (gearCost(next) + g.pris > BUDGET) return cur;   // har inte råd
  return [...next, id];
}

// bottar: en del kör helt utan, en del köper lite, en del fyller varje plats
export function randomGear(rand = Math.random, kind) {
  const r = rand();
  const shuffled = (arr) => arr.map(x => [rand(), x]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  if (r < 0.28) return [];
  const want = r < 0.62 ? 1 + Math.floor(rand() * 2) : 4;          // 1–2 saker, eller fullt utrustad
  let out = [];
  const order = shuffled(SLOTS.map(s => s.id).filter(sl => !blockedSlot(kind, sl)));
  const cheapest = (slot) => Math.min(...GEAR_IDS.filter(id => GEAR[id].slot === slot).map(id => GEAR[id].pris));
  order.forEach((slot, k) => {
    if (out.length >= want) return;
    // fullt utrustad: spara alltid råd till det billigaste på platserna som är kvar
    const reserve = want === 4 ? order.slice(k + 1).reduce((s, sl) => s + cheapest(sl), 0) : 0;
    for (const id of shuffled(GEAR_IDS.filter(id => GEAR[id].slot === slot))) {
      if (gearCost([...out, id]) + reserve <= BUDGET) { out = [...out, id]; break; }
    }
  });
  return cleanGear(out, kind);
}

// Fordonets värden med tillbehören (samma objekt för samma kombination → jämförbart med ===)
const cache = new Map();
export function withGear(T, list) {
  const gear = cleanGear(list, T.id);
  if (!gear.length) return T;
  const key = T.id + ':' + gear.slice().sort().join(',');
  if (cache.has(key)) return cache.get(key);
  const D = { ...T, gear };
  if (gear.includes('pansar')) {
    const k = 1.15;
    D.mass = T.mass * k;
    D.inertia = { x: T.inertia.x * k, y: T.inertia.y * k, z: T.inertia.z * k };
    D.susK = T.susK * k; D.susC = T.susC * k; D.fsMax = T.fsMax * k;
    D.driveMax = T.driveMax * 1.1;      // tyngre ⇒ lite segare
    D.brake = T.brake * k;
    D.armor = T.armor * 1.35;
  }
  if (gear.includes('bur')) D.rightK = T.rightK * 1.6;
  if (gear.includes('vinge')) { D.rearGrip = Math.min(1, T.rearGrip + 0.035); D.downforce = T.downforce * 1.35; }
  if (gear.includes('sidopansar')) D.stab = T.stab * 0.65;
  cache.set(key, D);
  return D;
}
export const hasGear = (car, id) => !!car?.veh?.T?.gear?.includes(id);

// Fästpunkter per fordon (meter över marken / från mitten; fronten åt -z)
export const MOUNT = {
  stock: { fz: 2.45, w: 0.97, bump: 0.42, roof: 1.2, rear: 2.45, deck: 0.86, sideY: 0.48, sideL: 1.9, cab: [-0.55, 0.95], belt: 0.78,
    plow: [0.1, 0.85], plowL: 0.95, wedge: [0.1, 0.6], wedgeL: 1.35 },
  bus: { fz: 4.6, w: 1.25, bump: 0.6, roof: 2.95, rear: 4.6, deck: 2.95, sideY: 0.95, sideL: 3.8, cab: [-3.6, 3.6], belt: 1.6,
    plow: [0.15, 1.15], plowL: 1.15, wedge: [0.14, 0.78], wedgeL: 1.6 },
  bigfoot: { fz: 2.6, w: 1.0, bump: 1.3, roof: 2.38, rear: 2.6, deck: 2.04, sideY: 1.62, sideL: 1.9, cab: [-0.55, 0.95], belt: 1.96,
    plow: [0.4, 1.5], plowL: 1.05, wedge: [0.14, 1.25], wedgeL: 1.75 },
  formel: { fz: 2.5, w: 0.92, bump: 0.3, roof: 0.95, rear: 2.15, deck: 1.02, sideY: 0.36, sideL: 1.5, cab: [-0.8, 0.2], belt: 0.55,
    plow: [0.07, 0.7], plowL: 0.9, wedge: [0.07, 0.46], wedgeL: 1.3 },
  traktor: { fz: 2.15, w: 1.05, bump: 0.75, roof: 2.72, rear: 2.05, deck: 2.72, sideY: 1.05, sideL: 1.3, cab: [-0.1, 1.5], belt: 1.5,
    plow: [0.12, 1.0], plowL: 1.0, wedge: [0.12, 0.7], wedgeL: 1.4, loaderZ: 0.62 },
  glass: { fz: 2.95, w: 1.1, bump: 0.55, roof: 3.02, rear: 2.95, deck: 3.02, sideY: 0.92, sideL: 3.8, cab: [-1.6, 2.7], belt: 1.4,
    plow: [0.12, 1.05], plowL: 1.05, wedge: [0.12, 0.72], wedgeL: 1.5, wind: [1.32, -3.0, 2.42, -2.62], roofCage: true, noHood: true },
};
MOUNT.rullstol = { fz: 0.8, w: 0.5, bump: 0.25, roof: 1.32, rear: 1.0, deck: 1.12, sideY: 0.38, sideL: 0.6, cab: [-0.3, 0.3], belt: 0.62,
  plow: [0.05, 0.55], plowL: 0.6, wedge: [0.05, 0.38], wedgeL: 0.9 };
MOUNT.elrullstol = { fz: 0.9, w: 0.6, bump: 0.3, roof: 1.55, rear: 1.0, deck: 1.3, sideY: 0.36, sideL: 0.9, cab: [-0.35, 0.35], belt: 0.8,
  plow: [0.05, 0.6], plowL: 0.7, wedge: [0.05, 0.4], wedgeL: 1.0 };
MOUNT.plan = { fz: 2.95, w: 0.6, bump: 0.6, roof: 1.72, rear: 2.9, deck: 1.6, sideY: 0.85, sideL: 2.0, cab: [-1.4, 0.2], belt: 1.25,
  plow: [0.1, 0.9], plowL: 0.9, wedge: [0.1, 0.6], wedgeL: 1.3 };
MOUNT.gokart = { fz: 1.05, w: 0.68, bump: 0.2, roof: 1.08, rear: 1.02, deck: 0.5, sideY: 0.2, sideL: 1.2, cab: [-0.2, 0.45], belt: 0.36,
  plow: [0.04, 0.42], plowL: 0.55, wedge: [0.04, 0.28], wedgeL: 0.8, noHood: true, wind: [0.4, -0.9, 0.72, -0.78] };
MOUNT.brandbil = { fz: 3.65, w: 1.2, bump: 0.6, roof: 3.0, rear: 3.6, deck: 3.0, sideY: 0.95, sideL: 5.0, cab: [-3.3, 3.3], belt: 1.5,
  plow: [0.15, 1.1], plowL: 1.1, wedge: [0.14, 0.78], wedgeL: 1.6, roofCage: true, noHood: true, wind: [1.55, -3.66, 2.6, -3.6] };
MOUNT.stridsvagn = { fz: 3.15, w: 1.5, bump: 0.7, roof: 2.3, rear: 3.1, deck: 1.5, sideY: 0.8, sideL: 4.4, cab: [-0.8, 1.4], belt: 1.45,
  plow: [0.1, 1.05], plowL: 0.9, wedge: [0.1, 0.72], wedgeL: 1.4, roofCage: true, noHood: true, wind: [1.5, -1.0, 2.2, -0.96] };
MOUNT.ufo = { fz: 1.7, w: 1.4, bump: 1.35, roof: 2.4, rear: 1.7, deck: 1.75, sideY: 1.45, sideL: 1.6, cab: [-0.55, 0.55], belt: 1.75,
  plow: [1.05, 1.6], plowL: 0.7, wedge: [1.05, 1.4], wedgeL: 0.9, roofCage: true, noHood: true, wind: [1.8, -0.72, 2.25, -0.45] };
MOUNT.v2 = { fz: 3.35, w: 1.15, bump: 0.62, roof: 2.55, rear: 3.3, deck: 1.45, sideY: 0.9, sideL: 4.0, cab: [-3.2, -1.7], belt: 1.4,
  plow: [0.14, 1.05], plowL: 1.05, wedge: [0.12, 0.72], wedgeL: 1.5, roofCage: true, noHood: true, wind: [1.5, -3.28, 2.3, -3.2] };
MOUNT.polis = { fz: 2.47, w: 0.98, bump: 0.45, roof: 1.45, rear: 2.47, deck: 1.3, sideY: 0.5, sideL: 2.0, cab: [-0.6, 1.9], belt: 0.9,
  plow: [0.1, 0.85], plowL: 0.95, wedge: [0.1, 0.6], wedgeL: 1.35 };
MOUNT.ambulans = { fz: 2.95, w: 1.1, bump: 0.55, roof: 2.8, rear: 2.95, deck: 2.8, sideY: 0.92, sideL: 3.8, cab: [-1.6, 2.7], belt: 1.4,
  plow: [0.12, 1.05], plowL: 1.05, wedge: [0.12, 0.72], wedgeL: 1.5, roofCage: true, noHood: true, wind: [1.35, -2.95, 2.3, -2.6] };
MOUNT.valt = { fz: 2.65, w: 1.25, bump: 0.8, roof: 3.0, rear: 2.6, deck: 2.0, sideY: 1.0, sideL: 2.6, cab: [0.3, 2.4], belt: 1.6,
  plow: [0.12, 1.1], plowL: 0.9, wedge: [0.12, 0.75], wedgeL: 1.3, roofCage: true, noHood: true, wind: [1.6, 0.25, 2.8, 0.3] };
MOUNT.spokbil = { fz: 2.77, w: 0.98, bump: 0.45, roof: 1.6, rear: 2.77, deck: 1.45, sideY: 0.55, sideL: 2.2, cab: [-0.8, 2.4], belt: 0.95,
  plow: [0.1, 0.85], plowL: 0.95, wedge: [0.1, 0.6], wedgeL: 1.35 };
MOUNT.heli = { fz: 2.0, w: 0.95, bump: 0.7, roof: 2.15, rear: 1.9, deck: 1.6, sideY: 0.95, sideL: 1.8, cab: [-1.4, 0.6], belt: 1.1,
  plow: [0.4, 1.0], plowL: 0.7, wedge: [0.4, 0.8], wedgeL: 0.9, roofCage: true, noHood: true, wind: [1.0, -1.9, 1.8, -1.6] };
MOUNT.bus.roofCage = true;
export const mountOf = (T) => MOUNT[T.id] || MOUNT.stock;

// Fysikdelarna fram i kroppens ram (y = T.modelY + höjd över marken). Samma mått används till utseendet.
export function frontParts(T) {
  const M = mountOf(T), g = T.gear || [], y0 = T.modelY, out = [];
  if (g.includes('plog')) {
    // V-plog: två blad som möts i en spets framför bilen
    const [h0, h1] = M.plow, zt = -(M.fz + M.plowL), zs = -(M.fz + 0.12), xs = M.w + 0.04;
    const len = Math.hypot(xs, zs - zt), ang = Math.atan2(zs - zt, xs);
    for (const s of [-1, 1]) out.push({ id: 'plog', hx: len / 2 + 0.04, hy: (h1 - h0) / 2, hz: 0.05, x: s * xs / 2, y: y0 + (h0 + h1) / 2, z: (zt + zs) / 2, rx: 0, ry: -s * ang, fr: 0.05 });
  }
  if (g.includes('kil')) {
    // ramp: spetsen nere vid marken, högst vid stötfångaren
    const [ht, hb] = M.wedge, L = M.wedgeL + 0.1, th = Math.atan2(hb - ht, L);
    out.push({ id: 'kil', hx: M.w * 0.96, hy: 0.05, hz: Math.hypot(L, hb - ht) / 2, x: 0, y: y0 + (ht + hb) / 2, z: -(M.fz + M.wedgeL - L / 2), rx: -th, ry: 0, fr: 0.1 });
  }
  if (g.includes('ram')) out.push({ id: 'ram', hx: 0.16, hy: 0.16, hz: 0.55, x: 0, y: y0 + M.bump, z: -(M.fz + 0.45), rx: 0, ry: 0, fr: 0.3 });
  // traktorns frontlastare: skopan längst fram (0,24–1,0 m över marken när den är nere)
  if (T.loader) { const p = loaderPose(T, 0); out.push({ id: 'skopa', hx: 1.18, hy: 0.38, hz: 0.24, x: 0, y: p.y, z: p.z, rx: p.rx, ry: 0, fr: 0.15 }); }
  // planets högvinge: bara mot andra bilar (stockcars kör under, höga fordon slår i)
  // solid: krockar som karossen — även med murarna, så vingspetsarna aldrig går igenom muren
  if (T.wing) {
    // vingen känner bara murarna (i tyngdpunktens höjd): muren knuffar planet i sidled utan att välta det och
    // vingspetsarna hamnar aldrig utanför banan. Mot bilar går vingen över/under — annars lyfte den sig på
    // grannarnas tak och planet voltade.
    out.push({ id: 'vingvakt', hx: 3.1, hy: 0.3, hz: 0.58, x: 0, y: 0, z: -0.55, rx: 0, ry: 0, fr: 0.02, wall: true });
  }
  return out;
}

// Frontlastaren: armarna vrider sig runt en axel vid hytten. k = 0 (nere) … 1 (uppe).
// Ger skopans mitt i kroppens ram (y inkl. T.modelY) och lutningen runt x.
export const LOADER = { pivotY: 1.62, pivotZ: 0.15, maxAng: 0.6 };
export function loaderPose(T, k) {
  const M = mountOf(T), th = Math.max(0, Math.min(1, k)) * LOADER.maxAng;
  const ry = 0.62 - LOADER.pivotY, rz = -(M.fz + M.loaderZ) - LOADER.pivotZ;
  const c = Math.cos(th), s = Math.sin(th);
  return { y: T.modelY + LOADER.pivotY + ry * c - rz * s, z: LOADER.pivotZ + ry * s + rz * c, rx: th };
}
