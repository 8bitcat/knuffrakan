// Fordonstyper: vanlig stockcar, skolbussen och bigfooten.
// Allt fysikaliskt per typ: mått, vikt, hjul, fjädring, grepp, styrning — plus kamera och tålighet.
// Kroppens origo = tyngdpunkten. modelY = markens höjd i kroppens ram när bilen står still.
import { withGear } from './gear.js?v=11';

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
};
export const KINDS = ['stock', 'bus', 'bigfoot'];
// fordonets värden inklusive tillbehören (samma kombination ⇒ samma objekt)
export const typeOf = (spec) => withGear(VTYPES[spec?.kind] || VTYPES.stock, spec?.gear);
