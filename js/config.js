// KNUFFRAKAN — global konfiguration.
// PROTO bumpas vid varje släpp (nätkompatibilitet + cache-brytning).
export const VERSION = '0.25.3';
export const PROTO = 32;

export const CONF = {
  DT: 1 / 60,
  GRAV: 14,             // lite tyngre än jorden — bilarna känns snärtigare

  // Banan
  DS: 4,                // samplingsavstånd längs banan (m)
  ROAD_W: 30,           // bredd mellan kantlinjerna
  SHOULDER: 1.2,        // asfalt utanför kantlinjen fram till muren
  BANK_K: 55,           // dosering per krökning
  BANK_MAX: 0.14,       // max ~8°

  // Race
  LAPS: 1,
  BOTS: 19,             // + spelaren = 20 bilar
  GRID_WAIT: 8,         // s på startgriden före nedräkning
  COUNTDOWN: 3,
  CLOSE_AFTER_WIN: 25,  // racet stänger efter ettan
  RESULTS_T: 9,
  SAVES: 3,             // R-räddningar per race när man står på banan
  FLIP_WAIT: 3.0,       // på taket: så länge man måste ligga innan R går
  AIR_LOCK: 3.0,        // R låst så här länge räknat från att bilen lämnade marken
  FLIP_AUTO: 5.0,       // på taket: automatisk omstart
  LOBBY_AUTOSTART: 30,  // publika rummet: racet startar av sig självt efter 30 s i lobbyn

  // Packracing: ju längre bak, desto högre toppfart — fältet klumpar ihop sig
  BASE_KMH: 305,        // ledarens toppfart
  STEP_KMH: 6,          // + per placering bakåt: långsammast längst fram, snabbast längst bak
  STEP_CAP: 14,         // (stegen mellan grannar är liten ⇒ knuffar, inte 100 km/h-krockar)
  GAP_KMH: 70,          // extra om man tappat långt (efter krasch) — börjar efter 250 m
  DRAFT_KMH: 26,        // suget bakom en bil

  // Smällar (Δv-detektering)
  DV_MIN: 6.5,
  DMG_SCALE: 2.2,
  DMG_MAX: 42,
  DMG_CAR: 1.1,
  DMG_WALL: 0.75,
  TACKLE_JUICE: 1.0,    // extra knuff vid sidotackling
};

export const BOT_NAMES = [
  'Bosse', 'Yngve', 'Siv', 'Kjell', 'Maud', 'Örjan', 'Gittan', 'Roffe', 'Berit', 'Sune',
  'Doris', 'Ragnar', 'Lasse', 'Majken', 'Pelle', 'Svea', 'Totte', 'Inga', 'Bengan', 'Agda',
  'Stig', 'Lotta', 'Janne', 'Elsa',
];

export const TITLES = ['Nybörjare', 'Knuffare', 'Plåtkrossare', 'Packledare', 'Oförstörbar'];
