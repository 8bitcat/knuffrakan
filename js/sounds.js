// Ljudvalen i Ljudlabbet. Alla filer ligger i audio/ (mp3), källor i audio/CREDITS.txt (alla CC0).
// Motorer: layers = [fil, uppmätt grundton i Hz] — flera varvnivåer ur SAMMA inspelning;
// f = tonhöjdsområdet [lägsta, högsta] som varvtalet (tomgång → maxvarv) spelas upp i.
export const SOUND_OPTS = {
  stock: [
    { id: 'B', namn: 'NASCAR-V8', layers: [['nas_lo', 149.4], ['nas_mid', 176.3], ['nas_hi', 223.4], ['nas_top', 341.8]], f: [132, 440] },
    { id: 'A', namn: 'Racermotor (inifrån)', layers: [['race_lo', 129], ['race_mid', 201], ['race_hi', 250]], f: [112, 330] },
  ],
  bus: [
    { id: 'A', namn: 'Diesel (minibuss)', layers: [['bus_lo', 32.3], ['bus_mid', 40.4], ['bus_hi', 52.5]], f: [30, 88] },
    { id: 'B', namn: 'Diesel (stadsbuss)', layers: [['busb_loop', 40.4]], f: [32, 74] },
  ],
  bigfoot: [
    { id: 'A', namn: 'Hot rod-V8 (skrovlig)', layers: [['bf_lo', 45.8], ['bf_mid', 56.5], ['bf_hi', 90.2]], f: [44, 152] },
    { id: 'B', namn: 'V8 (Maserati)', layers: [['bfb_lo', 56.5], ['bfb_hi', 86.1]], f: [52, 142] },
  ],
  formel: [
    { id: 'A', namn: 'Racermotor (skrikig)', layers: [['race_lo', 129], ['race_mid', 201], ['race_hi', 250]], f: [170, 470] },
    { id: 'B', namn: 'V8 högt i varv', layers: [['nas_lo', 149.4], ['nas_mid', 176.3], ['nas_hi', 223.4], ['nas_top', 341.8]], f: [190, 640] },
  ],
  traktor: [
    { id: 'A', namn: 'Traktordiesel', layers: [['bus_lo', 32.3], ['bus_mid', 40.4], ['bus_hi', 52.5]], f: [24, 62] },
    { id: 'B', namn: 'Diesel (stadsbuss)', layers: [['busb_loop', 40.4]], f: [26, 66] },
  ],
  glass: [
    { id: 'A', namn: 'Skåpbil (V8)', layers: [['bfb_lo', 56.5], ['bfb_hi', 86.1]], f: [48, 120] },
    { id: 'B', namn: 'Diesel', layers: [['bus_lo', 32.3], ['bus_mid', 40.4], ['bus_hi', 52.5]], f: [32, 90] },
  ],
  scrape: [
    { id: 'A', namn: 'Betong + plåt', wall: 'scr_belly', car: 'scr_drum', spark: 'scr_spark' },
    { id: 'B', namn: 'Metallrör + kylare', wall: 'scr_pipe', car: 'scr_rad', spark: 'scr_spark' },
    { id: 'C', namn: 'Gamla', wall: 'metal_scrape', car: 'metal_scrape', spark: 'metal_scrape' },
  ],
  crash: [
    { id: 'B', namn: 'Tung plåt', light: ['kb_light1', 'kb_light2', 'kb_light3'], heavy: ['kb_heavy1', 'kb_heavy2', 'kb_heavy3'], wreck: ['wreck', 'kb_wreck2'] },
    { id: 'A', namn: 'Gamla', light: ['hit1', 'hit2', 'hit3', 'hit4'], heavy: ['crash_heavy_1', 'crash_heavy_2', 'crash_heavy_3'], wreck: ['wreck'] },
  ],
};
export const DEFAULT_CHOICE = { stock: 'B', bus: 'A', bigfoot: 'A', formel: 'A', traktor: 'A', glass: 'A', scrape: 'A', crash: 'B' };
// laddas alltid
export const BASE_FILES = ['wind', 'pack', 'tire_screech', 'explosion', 'rev', 'pop1', 'pop2', 'pop3', 'airbrake'];
export const LOOP_FILES = new Set(['wind', 'pack', 'tire_screech', 'metal_scrape']);
