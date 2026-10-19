// Fordonstyper: stockcar, skolbuss, bigfoot … gokart, brandbil, stridsvagn och UFO.
// Allt fysikaliskt per typ: mått, vikt, hjul, fjädring, grepp, styrning — plus kamera och tålighet.
// Kroppens origo = tyngdpunkten. modelY = markens höjd i kroppens ram när bilen står still.
import { withGear } from './gear.js?v=26';

export const VTYPES = {
  stock: {
    id: 'stock', namn: 'Stockcar', besk: 'Allroundbilen: lagom tung, lagom snabb och lagom tålig. Tryck E + styr åt sidan: bilen kastar sig in i den bredvid (sidotackling)',
    mass: 1500, half: { x: 0.97, y: 0.42, z: 2.42 }, colY: 0.2, inertia: { x: 4500, y: 4300, z: 2100 },
    rayLen: 0.72, susK: 36000, susC: 4300, bump: 0.3, fsMax: 140000,
    muLat: 1.95, muLong: 1.8, rearGrip: 0.93, driveMax: 16500, accelK: 1, brake: 30000, steerMax: 0.5, wb: 2.94, downforce: 0.75,
    wheelR: 0.37, wheels: [
      { x: -0.84, z: -1.47, front: true }, { x: 0.84, z: -1.47, front: true },
      { x: -0.84, z: 1.47, front: false }, { x: 0.84, z: 1.47, front: false },
    ],
    modelY: -0.55, sideH: 0.45, longH: 0.55, armor: 1, stab: 1, rightK: 3.2, tagUp: 0, cam: { d: 0, h: 0 }, hood: { y: 0.45, z: -1.9 },
    detune: 0, special: 'tackla',
  },
  bus: {
    id: 'bus', namn: 'Skolbuss', besk: 'Knuffar undan nästan allt — men seg i starten och i kurvorna. Tryck E: tutan blåser undan bilarna framför',
    mass: 4000, half: { x: 1.25, y: 1.25, z: 4.5 }, colY: 0.875, inertia: { x: 32000, y: 30000, z: 14000 },
    rayLen: 1.05, susK: 80000, susC: 9500, bump: 0.45, fsMax: 380000,
    muLat: 1.6, muLong: 1.5, rearGrip: 0.97, driveMax: 16500 * 4000 / 1500 * 1.12, accelK: 0.4, brake: 64000, steerMax: 0.4, wb: 5.2, downforce: 2.0,
    wheelR: 0.52, wheels: [
      { x: -1.06, z: -2.9, front: true }, { x: 1.06, z: -2.9, front: true },
      { x: -1.02, z: 2.3, front: false }, { x: 1.02, z: 2.3, front: false },
    ],
    modelY: -0.875, sideH: 0.75, longH: 0.875, armor: 2.1, stab: 0.25, rightK: 7, tagUp: 1.7, cam: { d: 5, h: 1.8 }, hood: { y: 0.6, z: -4.3 },
    detune: -0.28, special: 'tuta',
  },
  bigfoot: {
    id: 'bigfoot', namn: 'Bigfoot', besk: 'Jättehjulen kör upp på andra bilar och krossar dem. Tryck E: monsterhopp — landa nära andra så flyger de',
    mass: 2600, half: { x: 1.0, y: 0.7, z: 2.3 }, colY: 0.34, inertia: { x: 9000, y: 8500, z: 5200 },
    rayLen: 1.9, susK: 47000, susC: 5200, bump: 0.75, fsMax: 300000,
    muLat: 1.85, muLong: 1.75, rearGrip: 0.95, driveMax: 16500 * 2600 / 1500, accelK: 0.55, brake: 52000, steerMax: 0.5, wb: 3.1, downforce: 1.3,
    wheelR: 0.95, wheels: [
      { x: -1.3, z: -1.55, front: true }, { x: 1.3, z: -1.55, front: true },
      { x: -1.3, z: 1.55, front: false }, { x: 1.3, z: 1.55, front: false },
    ],
    modelY: -1.71, sideH: 1.45, longH: 1.71, armor: 1.4, stab: 0.5, rightK: 6, tagUp: 1.5, cam: { d: 2.5, h: 1.6 }, hood: { y: 0.5, z: -1.9 },
    detune: -0.12, bigWheels: true, special: 'hopp',
  },
  // lätt, låg och snabb i starten — men slängs runt av tacklingar och går sönder fort
  formel: {
    id: 'formel', namn: 'Formelbil', besk: 'Lätt och snabb med massor av grepp — men tål lite och slängs runt. Håll E: nitro!',
    mass: 750, half: { x: 0.92, y: 0.3, z: 2.4 }, colY: 0.08, inertia: { x: 2100, y: 2100, z: 950 },
    rayLen: 0.53, susK: 30000, susC: 3000, bump: 0.2, fsMax: 90000,
    muLat: 2.3, muLong: 2.1, rearGrip: 0.95, driveMax: 16500 * 750 / 1500 * 1.05, accelK: 1.4, brake: 19000, steerMax: 0.52, wb: 2.95, downforce: 1.6,
    wheelR: 0.34, wheels: [
      { x: -0.82, z: -1.55, front: true }, { x: 0.82, z: -1.55, front: true },
      { x: -0.8, z: 1.4, front: false }, { x: 0.8, z: 1.4, front: false },
    ],
    modelY: -0.42, sideH: 0.3, longH: 0.42, armor: 0.6, stab: 1.4, rightK: 3.5, tagUp: -0.15, cam: { d: -0.3, h: -0.15 }, hood: { y: 0.55, z: 0.1 },
    detune: 0.18, special: 'nitro',
  },
  // tung och seg, nästan omöjlig att flytta — frontlastaren knuffar undan allt framför
  traktor: {
    id: 'traktor', namn: 'Traktor', besk: 'Seg men nästan omöjlig att flytta. Håll E: skopan lyfter bilen framför dig',
    mass: 3800, half: { x: 1.22, y: 0.95, z: 2.2 }, colY: 0.3, inertia: { x: 10900, y: 9800, z: 9600 },
    rayLen: 1.3, susK: 90000, susC: 9000, bump: 0.5, fsMax: 380000,
    muLat: 1.75, muLong: 1.7, rearGrip: 0.97, driveMax: 16500 * 3800 / 1500 * 1.1, accelK: 0.3, brake: 62000, steerMax: 0.48, wb: 2.65, downforce: 1.5,
    wheelR: 0.85, wheels: [
      { x: -0.92, z: -1.45, front: true }, { x: 0.92, z: -1.45, front: true },
      { x: -1.0, z: 1.2, front: false }, { x: 1.0, z: 1.2, front: false },
    ],
    modelY: -1.15, sideH: 0.85, longH: 1.15, armor: 2.2, stab: 0.2, rightK: 7, tagUp: 1.5, cam: { d: 2.5, h: 1.6 }, hood: { y: 1.55, z: 0.1 },
    detune: -0.3, loader: true,
  },
  // hög och vinglig: välter lätt men är en stor vägg att tackla med (och spelar glassmelodi)
  glass: {
    id: 'glass', namn: 'Glassbil', besk: 'Hög och vinglig och spelar glassmelodi. Tryck E: kasta glass på bilen framför — det kladdar ner rutan',
    mass: 2600, half: { x: 1.1, y: 1.3, z: 2.9 }, colY: 0.75, inertia: { x: 12700, y: 10500, z: 7500 },
    rayLen: 1.15, susK: 60000, susC: 6500, bump: 0.4, fsMax: 260000,
    muLat: 1.7, muLong: 1.6, rearGrip: 0.95, driveMax: 16500 * 2600 / 1500, accelK: 0.6, brake: 50000, steerMax: 0.46, wb: 3.5, downforce: 1.2,
    wheelR: 0.42, wheels: [
      { x: -0.95, z: -1.75, front: true }, { x: 0.95, z: -1.75, front: true },
      { x: -0.95, z: 1.75, front: false }, { x: 0.95, z: 1.75, front: false },
    ],
    modelY: -1.0, sideH: 0.8, longH: 1.0, armor: 1.3, stab: 1.15, rightK: 5, tagUp: 1.4, cam: { d: 3, h: 1.4 }, hood: { y: 1.45, z: -2.2 },
    detune: -0.1, special: 'glass',
  },
  // Jetrullstolen: liten och lätt, en jetmotor bakom ryggstödet (jet = dragkraft i m/s², knuffar kroppen —
  // även i luften). Snabbast från start, men skör och slängs runt av allt.
  rullstol: {
    id: 'rullstol', namn: 'Jetrullstol', besk: 'Jetmotor! Snabbast från start men skör. Lågan bränner den bakom. Håll E: efterbrännkammaren — fortare och jättelång låga',
    mass: 500, half: { x: 0.5, y: 0.5, z: 0.75 }, colY: 0.1, inertia: { x: 600, y: 500, z: 450 },
    rayLen: 0.68, susK: 14000, susC: 1500, bump: 0.2, fsMax: 60000,
    muLat: 2.0, muLong: 1.9, rearGrip: 0.95, driveMax: 2000, accelK: 1, brake: 9000, steerMax: 0.2, wb: 0.8, downforce: 0.9,
    wheelR: 0.3, wheels: [
      { x: -0.3, z: -0.55, front: true }, { x: 0.3, z: -0.55, front: true },
      { x: -0.4, z: 0.25, front: false }, { x: 0.4, z: 0.25, front: false },
    ],
    modelY: -0.55, sideH: 0.42, longH: 0.55, armor: 0.7, stab: 1.6, rightK: 4, tagUp: -0.6, cam: { d: -1.6, h: -0.6 }, hood: { y: 0.9, z: 0.0 },
    detune: 0.3, jet: 15, jetZ: 1.07, jetX: [0], special: 'efterbrann',          // munstyckets z och x i kroppens ram (lågan bakåt)
  },
  // Jet-elrullstolen: tyngre, två jetmotorer, stadigare
  elrullstol: {
    id: 'elrullstol', namn: 'Jet-elrullstol', besk: 'Två jetmotorer och stadigare än jetrullstolen. Lågorna bränner bakom. Tryck E: elchock på alla som är nära',
    mass: 900, half: { x: 0.6, y: 0.62, z: 0.85 }, colY: 0.09, inertia: { x: 900, y: 800, z: 850 },
    rayLen: 0.78, susK: 24000, susC: 2600, bump: 0.2, fsMax: 100000,
    muLat: 1.9, muLong: 1.8, rearGrip: 0.95, driveMax: 3600, accelK: 1, brake: 16000, steerMax: 0.24, wb: 1.0, downforce: 1.0,
    wheelR: 0.17, wheels: [
      { x: -0.28, z: -0.5, front: true }, { x: 0.28, z: -0.5, front: true },
      { x: -0.28, z: 0.5, front: false }, { x: 0.28, z: 0.5, front: false },
    ],
    modelY: -0.65, sideH: 0.5, longH: 0.65, armor: 1.2, stab: 1.0, rightK: 4.5, tagUp: -0.4, cam: { d: -1.2, h: -0.4 }, hood: { y: 1.1, z: -0.1 },
    detune: 0.1, jet: 12, jetZ: 0.95, jetX: [-0.42, 0.42], special: 'elchock',
  },
  // Propellerplanet: kör på hjulen, glidflyger i luften (sjunker långsamt, styrs med rodret) och propellern
  // skär i det som kommer framför nosen. Vingarna sitter högt: stockcars kör under, höga fordon slår i.
  plan: {
    id: 'plan', namn: 'Propellerplan', besk: 'Glidflyger efter hoppen. Propellern skär i allt framför nosen. Tryck E: planet lyfter och flyger över bilarna',
    mass: 1100, half: { x: 0.6, y: 0.65, z: 2.6 }, colY: 0.1, inertia: { x: 3900, y: 4000, z: 2200 },
    rayLen: 1.03, susK: 30000, susC: 3200, bump: 0.3, fsMax: 110000,
    muLat: 1.95, muLong: 1.8, rearGrip: 0.95, driveMax: 3300, accelK: 1, brake: 22000, steerMax: 0.36, wb: 2.05, downforce: 0.9,
    wheelR: 0.3, wheels: [
      { x: -0.5, z: -1.7, front: true }, { x: 0.5, z: -1.7, front: true },
      { x: -1.1, z: 0.35, front: false }, { x: 1.1, z: 0.35, front: false },
    ],
    modelY: -0.9, sideH: 0.6, longH: 0.9, armor: 1.0, stab: 0.9, rightK: 5.5, tagUp: 0.7, cam: { d: 3, h: 1.0 }, hood: { y: 1.45, z: -1.0 },
    detune: 0, jet: 11, glide: true, wing: true, special: 'lyft',
    prop: { z: 2.95, y: 1.1, r: 0.8 },     // propellerns skiva: avstånd framför mitten, navets höjd över marken, radie
  },
  // Gokarten: pytteliten, låg och lättstyrd — men knuffas undan av alla och tål nästan ingenting
  gokart: {
    id: 'gokart', namn: 'Gokart', besk: 'Pytteliten och lättstyrd — men alla knuffar undan den och den tål nästan ingenting. Tryck E: släpp ett bananskal bakom dig',
    mass: 380, half: { x: 0.68, y: 0.32, z: 1.0 }, colY: 0.05, inertia: { x: 520, y: 540, z: 330 },
    rayLen: 0.44, susK: 14000, susC: 1400, bump: 0.15, fsMax: 42000,
    muLat: 2.25, muLong: 2.0, rearGrip: 0.95, driveMax: 4700, accelK: 1.3, brake: 9000, steerMax: 0.56, wb: 1.35, downforce: 0.8,
    wheelR: 0.14, wheels: [
      { x: -0.58, z: -0.68, front: true }, { x: 0.58, z: -0.68, front: true },
      { x: -0.6, z: 0.62, front: false }, { x: 0.6, z: 0.62, front: false },
    ],
    modelY: -0.32, sideH: 0.26, longH: 0.32, armor: 0.55, stab: 1.5, rightK: 4, tagUp: -0.6, cam: { d: -1.4, h: -0.5 }, hood: { y: 0.62, z: 0.15 },
    detune: 0.25, special: 'banan',
  },
  // Brandbilen: tung och lång. E = vattenkanonen på taket sprutar undan bilarna framför (tanken räcker 6 s)
  brandbil: {
    id: 'brandbil', namn: 'Brandbil', besk: 'Tung, lång och med blåljus. Håll E: vattenkanonen sprutar undan bilarna framför dig (tanken räcker 6 sekunder)',
    mass: 3400, half: { x: 1.2, y: 1.3, z: 3.6 }, colY: 0.8, inertia: { x: 24000, y: 20000, z: 10600 },
    rayLen: 1.18, susK: 78000, susC: 8500, bump: 0.42, fsMax: 340000,
    muLat: 1.65, muLong: 1.6, rearGrip: 0.96, driveMax: 16500 * 3400 / 1500 * 1.08, accelK: 0.5, brake: 62000, steerMax: 0.42, wb: 4.4, downforce: 1.8,
    wheelR: 0.5, wheels: [
      { x: -1.02, z: -2.35, front: true }, { x: 1.02, z: -2.35, front: true },
      { x: -1.02, z: 2.05, front: false }, { x: 1.02, z: 2.05, front: false },
    ],
    modelY: -1.05, sideH: 0.8, longH: 1.05, armor: 1.8, stab: 0.4, rightK: 6.5, tagUp: 1.6, cam: { d: 4.2, h: 1.7 }, hood: { y: 1.0, z: -2.9 },
    detune: -0.2, special: 'vatten', nozzle: { y: 3.05, z: -3.0 },     // munstycket: höjd över marken, z i modellen
  },
  // Stridsvagnen: tyngst och tåligast, segast i starten. E = kanonen skjuter en granat (laddar om på 4 s)
  stridsvagn: {
    id: 'stridsvagn', namn: 'Stridsvagn', besk: 'Tyngst och tåligast av alla men seg i starten. Tryck E: kanonen skjuter en granat (laddar om på 4 sekunder)',
    mass: 5200, half: { x: 1.5, y: 0.7, z: 3.1 }, colY: 0.3, inertia: { x: 26000, y: 30000, z: 11000 },
    rayLen: 1.05, susK: 112000, susC: 13000, bump: 0.4, fsMax: 520000,
    muLat: 1.9, muLong: 1.9, rearGrip: 0.98, driveMax: 16500 * 5200 / 1500 * 1.1, accelK: 0.28, brake: 95000, steerMax: 0.5, wb: 3.4, downforce: 2.2,
    wheelR: 0.42, wheels: [
      { x: -1.15, z: -1.7, front: true }, { x: 1.15, z: -1.7, front: true },
      { x: -1.15, z: 1.7, front: false }, { x: 1.15, z: 1.7, front: false },
    ],
    modelY: -0.9, sideH: 0.6, longH: 0.9, armor: 2.8, stab: 0.15, rightK: 8, tagUp: 1.3, cam: { d: 3.5, h: 1.4 }, hood: { y: 1.15, z: -0.6 },
    detune: -0.35, special: 'kanon', gun: { y: 1.95, z: -5.25 },        // mynningen: höjd över marken, z i modellen
  },
  // UFO:t: svävar på osynliga strålar och glider långt i luften. E = dragstrålen lyfter bilen framför (räcker 4 s)
  ufo: {
    id: 'ufo', namn: 'UFO', besk: 'Svävar över banan och glider långt i luften. Håll E: dragstrålen lyfter upp bilen framför dig (räcker 4 sekunder)',
    mass: 1300, half: { x: 1.65, y: 0.45, z: 1.65 }, colY: 0.15, inertia: { x: 3400, y: 4200, z: 3400 },
    rayLen: 1.75, susK: 20000, susC: 2600, bump: 0.3, fsMax: 130000,
    muLat: 1.75, muLong: 1.7, rearGrip: 0.97, driveMax: 13000, accelK: 1.1, brake: 22000, steerMax: 0.48, wb: 2.0, downforce: 0.9,
    wheelR: 0.2, wheels: [
      { x: -1.0, z: -1.0, front: true }, { x: 1.0, z: -1.0, front: true },
      { x: -1.0, z: 1.0, front: false }, { x: 1.0, z: 1.0, front: false },
    ],
    modelY: -1.45, sideH: 1.2, longH: 1.45, armor: 1.1, stab: 0.8, rightK: 7, tagUp: 0.6, cam: { d: 1.8, h: 1.0 }, hood: { y: 0.75, z: -0.9 },
    detune: 0, special: 'strale', glide: true, hover: true,
  },
};
export const KINDS = ['stock', 'bus', 'bigfoot', 'formel', 'traktor', 'glass', 'rullstol', 'elrullstol', 'plan', 'gokart', 'brandbil', 'stridsvagn', 'ufo'];
// Specialförmågorna på E. hold = håll in (sekunder per full tank, refill = gånger längre att fylla),
// cd = tryck (sekunder att ladda om), ground = bara med hjulen på marken. knapp = E-knappens namn, tips = när racet börjar.
export const SPECIALS = {
  vatten: { knapp: 'VATTEN', hold: 6, tips: '🚒 Håll E (eller VATTEN): vattenkanonen sprutar undan bilarna framför dig!' },
  strale: { knapp: 'STRÅLE', hold: 4, tips: '🛸 Håll E (eller STRÅLE): dragstrålen lyfter upp bilen framför dig!' },
  nitro: { knapp: 'NITRO', hold: 2.5, refill: 4, tips: '🔥 Håll E (eller NITRO): nitro — formelbilen rusar iväg!' },
  efterbrann: { knapp: 'TURBO', hold: 2, refill: 4, tips: '🔥 Håll E (eller TURBO): efterbrännkammaren — fortare, och lågan bakom blir jättelång!' },
  kanon: { knapp: 'KANON', cd: 4, tips: '💥 Tryck E (eller KANON): kanonen skjuter en granat — den laddar om på 4 sekunder' },
  tackla: { knapp: 'TACKLA', cd: 3, tips: '💥 Tryck E (eller TACKLA) och styr åt sidan: bilen kastar sig in i den bredvid!' },
  tuta: { knapp: 'TUTA', cd: 5, tips: '📯 Tryck E (eller TUTA): tutan blåser undan bilarna framför bussen!' },
  hopp: { knapp: 'HOPPA', cd: 5, ground: true, tips: '🦶 Tryck E (eller HOPPA): monsterhopp — landa nära andra så flyger de!' },
  lyft: { knapp: 'LYFT', cd: 7, ground: true, tips: '🛫 Tryck E (eller LYFT): planet lyfter och flyger över bilarna!' },
  glass: { knapp: 'GLASS', cd: 1.6, tips: '🍦 Tryck E (eller GLASS): kasta glass på bilen framför — det kladdar ner rutan!' },
  elchock: { knapp: 'BLIXT', cd: 6, tips: '⚡ Tryck E (eller BLIXT): elchock på alla som är nära!' },
  banan: { knapp: 'BANAN', cd: 3, tips: '🍌 Tryck E (eller BANAN): släpp ett bananskal bakom dig — den som kör på det snurrar!' },
};
// E-knappens namn per fordon (traktorns skopa + specialförmågorna)
export const SPECIAL_KNAPP = { traktor: 'SKOPA', ...Object.fromEntries(Object.entries(VTYPES).filter(([, t]) => t.special).map(([k, t]) => [k, SPECIALS[t.special].knapp])) };
// fordonets värden inklusive tillbehören (samma kombination ⇒ samma objekt)
export const typeOf = (spec) => withGear(VTYPES[spec?.kind] || VTYPES.stock, spec?.gear);
