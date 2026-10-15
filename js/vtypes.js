// Fordonstyper: vanlig stockcar, skolbussen och bigfooten.
// Allt fysikaliskt per typ: mått, vikt, hjul, fjädring, grepp, styrning — plus kamera och tålighet.
// Kroppens origo = tyngdpunkten. modelY = markens höjd i kroppens ram när bilen står still.
import { withGear } from './gear.js?v=13';

export const VTYPES = {
  stock: {
    id: 'stock', namn: 'Stockcar',
    mass: 1500, half: { x: 0.97, y: 0.42, z: 2.42 }, colY: 0.2, inertia: { x: 4500, y: 4300, z: 2100 },
    rayLen: 0.72, susK: 36000, susC: 4300, bump: 0.3, fsMax: 140000,
    muLat: 1.95, muLong: 1.8, rearGrip: 0.93, driveMax: 16500, accelK: 1, brake: 30000, steerMax: 0.5, wb: 2.94, downforce: 0.75,
    wheelR: 0.37, wheels: [
      { x: -0.84, z: -1.47, front: true }, { x: 0.84, z: -1.47, front: true },
      { x: -0.84, z: 1.47, front: false }, { x: 0.84, z: 1.47, front: false },
    ],
    modelY: -0.55, sideH: 0.45, longH: 0.55, armor: 1, stab: 1, rightK: 3.2, tagUp: 0, cam: { d: 0, h: 0 }, hood: { y: 0.45, z: -1.9 },
    detune: 0,
  },
  bus: {
    id: 'bus', namn: 'Skolbuss',
    mass: 4000, half: { x: 1.25, y: 1.25, z: 4.5 }, colY: 0.875, inertia: { x: 32000, y: 30000, z: 14000 },
    rayLen: 1.05, susK: 80000, susC: 9500, bump: 0.45, fsMax: 380000,
    muLat: 1.6, muLong: 1.5, rearGrip: 0.97, driveMax: 16500 * 4000 / 1500 * 1.12, accelK: 0.4, brake: 64000, steerMax: 0.4, wb: 5.2, downforce: 2.0,
    wheelR: 0.52, wheels: [
      { x: -1.06, z: -2.9, front: true }, { x: 1.06, z: -2.9, front: true },
      { x: -1.02, z: 2.3, front: false }, { x: 1.02, z: 2.3, front: false },
    ],
    modelY: -0.875, sideH: 0.75, longH: 0.875, armor: 2.1, stab: 0.25, rightK: 7, tagUp: 1.7, cam: { d: 5, h: 1.8 }, hood: { y: 0.6, z: -4.3 },
    detune: -0.28,
  },
  bigfoot: {
    id: 'bigfoot', namn: 'Bigfoot',
    mass: 2600, half: { x: 1.0, y: 0.7, z: 2.3 }, colY: 0.34, inertia: { x: 9000, y: 8500, z: 5200 },
    rayLen: 1.9, susK: 47000, susC: 5200, bump: 0.75, fsMax: 300000,
    muLat: 1.85, muLong: 1.75, rearGrip: 0.95, driveMax: 16500 * 2600 / 1500, accelK: 0.55, brake: 52000, steerMax: 0.5, wb: 3.1, downforce: 1.3,
    wheelR: 0.95, wheels: [
      { x: -1.3, z: -1.55, front: true }, { x: 1.3, z: -1.55, front: true },
      { x: -1.3, z: 1.55, front: false }, { x: 1.3, z: 1.55, front: false },
    ],
    modelY: -1.71, sideH: 1.45, longH: 1.71, armor: 1.4, stab: 0.5, rightK: 6, tagUp: 1.5, cam: { d: 2.5, h: 1.6 }, hood: { y: 0.5, z: -1.9 },
    detune: -0.12, bigWheels: true,
  },
  // lätt, låg och snabb i starten — men slängs runt av tacklingar och går sönder fort
  formel: {
    id: 'formel', namn: 'Formelbil',
    mass: 750, half: { x: 0.92, y: 0.3, z: 2.4 }, colY: 0.08, inertia: { x: 2100, y: 2100, z: 950 },
    rayLen: 0.53, susK: 30000, susC: 3000, bump: 0.2, fsMax: 90000,
    muLat: 2.3, muLong: 2.1, rearGrip: 0.95, driveMax: 16500 * 750 / 1500 * 1.05, accelK: 1.4, brake: 19000, steerMax: 0.52, wb: 2.95, downforce: 1.6,
    wheelR: 0.34, wheels: [
      { x: -0.82, z: -1.55, front: true }, { x: 0.82, z: -1.55, front: true },
      { x: -0.8, z: 1.4, front: false }, { x: 0.8, z: 1.4, front: false },
    ],
    modelY: -0.42, sideH: 0.3, longH: 0.42, armor: 0.6, stab: 1.4, rightK: 3.5, tagUp: -0.15, cam: { d: -0.3, h: -0.15 }, hood: { y: 0.55, z: 0.1 },
    detune: 0.18,
  },
  // tung och seg, nästan omöjlig att flytta — frontlastaren knuffar undan allt framför
  traktor: {
    id: 'traktor', namn: 'Traktor',
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
    id: 'glass', namn: 'Glassbil',
    mass: 2600, half: { x: 1.1, y: 1.3, z: 2.9 }, colY: 0.75, inertia: { x: 12700, y: 10500, z: 7500 },
    rayLen: 1.15, susK: 60000, susC: 6500, bump: 0.4, fsMax: 260000,
    muLat: 1.7, muLong: 1.6, rearGrip: 0.95, driveMax: 16500 * 2600 / 1500, accelK: 0.6, brake: 50000, steerMax: 0.46, wb: 3.5, downforce: 1.2,
    wheelR: 0.42, wheels: [
      { x: -0.95, z: -1.75, front: true }, { x: 0.95, z: -1.75, front: true },
      { x: -0.95, z: 1.75, front: false }, { x: 0.95, z: 1.75, front: false },
    ],
    modelY: -1.0, sideH: 0.8, longH: 1.0, armor: 1.3, stab: 1.15, rightK: 5, tagUp: 1.4, cam: { d: 3, h: 1.4 }, hood: { y: 1.45, z: -2.2 },
    detune: -0.1,
  },
};
export const KINDS = ['stock', 'bus', 'bigfoot', 'formel', 'traktor', 'glass'];
// fordonets värden inklusive tillbehören (samma kombination ⇒ samma objekt)
export const typeOf = (spec) => withGear(VTYPES[spec?.kind] || VTYPES.stock, spec?.gear);
