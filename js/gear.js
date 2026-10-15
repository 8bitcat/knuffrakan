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

// giltig lista: kända saker, en per plats, inom budget (i den ordning de valdes)
export function cleanGear(list) {
  const out = [], slots = new Set();
  let cost = 0;
  for (const id of Array.isArray(list) ? list : []) {
    const g = GEAR[id];
    if (!g || slots.has(g.slot) || cost + g.pris > BUDGET) continue;
    out.push(id); slots.add(g.slot); cost += g.pris;
  }
  return out;
}
export const gearCost = (list) => cleanGear(list).reduce((s, id) => s + GEAR[id].pris, 0);

// välj/avvälj en sak: byter ut det som satt på samma plats
export function toggleGear(list, id) {
  const cur = cleanGear(list);
  if (cur.includes(id)) return cur.filter(x => x !== id);
  const g = GEAR[id];
  const next = cur.filter(x => GEAR[x].slot !== g.slot);
  if (gearCost(next) + g.pris > BUDGET) return cur;   // har inte råd
  return [...next, id];
}

// bottar: en del kör helt utan, en del köper lite, en del fyller varje plats
export function randomGear(rand = Math.random) {
  const r = rand();
  const shuffled = (arr) => arr.map(x => [rand(), x]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  if (r < 0.28) return [];
  const want = r < 0.62 ? 1 + Math.floor(rand() * 2) : 4;          // 1–2 saker, eller fullt utrustad
  let out = [];
  const order = shuffled(SLOTS.map(s => s.id));
  const cheapest = (slot) => Math.min(...GEAR_IDS.filter(id => GEAR[id].slot === slot).map(id => GEAR[id].pris));
  order.forEach((slot, k) => {
    if (out.length >= want) return;
    // fullt utrustad: spara alltid råd till det billigaste på platserna som är kvar
    const reserve = want === 4 ? order.slice(k + 1).reduce((s, sl) => s + cheapest(sl), 0) : 0;
    for (const id of shuffled(GEAR_IDS.filter(id => GEAR[id].slot === slot))) {
      if (gearCost([...out, id]) + reserve <= BUDGET) { out = [...out, id]; break; }
    }
  });
  return cleanGear(out);
}

// Fordonets värden med tillbehören (samma objekt för samma kombination → jämförbart med ===)
const cache = new Map();
export function withGear(T, list) {
  const gear = cleanGear(list);
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
};
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
  return out;
}
