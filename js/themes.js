// Banornas teman: himmel, dis, ljus, mark, väg, murar, berg, växtlighet och luften.
// Snöberget är grundtemat — de andra skriver bara över det som skiljer.
const SNO = {
  sky: { hor: 0xf7d9e4, mid: 0xf1b4cd, top: 0xe18fbd, cloud: 0xfff4f8, shade: 0x8796b4, stars: 0, aurora: 0, clouds: 1 },
  fog: 0.00042,
  hemi: [0xffe9f2, 0xc9a9bb, 1.0], sun: [0xfff0ee, 1.45], envGround: 0xf0e2ea,
  ground: [0xf7eef3, 0xeedde6, 0xb39aa6], crack: null,         // mark: bas, bas 2, sten i branterna (+ lavasprickor)
  asphalt: [60, 47, 66], line: 0xf4eef2,
  conc: 0xe2c3c8, safer: 0x2c5fd6, post: 0x51566a,
  mtn: [0xf6e8ef, 0xc2a7b3, 0xd9c4cd], mtnShape: 'cone',         // berg: topp, sten, fot
  flora: 'pine', redTrees: true,
  valley: 'ice', air: null,
};

export const THEMES = {
  sno: SNO,
  // Vulkanbanan: mörkröd himmel full av rök, svart basalt med glödande sprickor, lava i dalarna
  vulkan: {
    ...SNO,
    sky: { hor: 0x8a3420, mid: 0x4a1a20, top: 0x170a12, cloud: 0x3a2a2a, shade: 0x120a0c, stars: 0, aurora: 0, clouds: 1 },
    fog: 0.00062,
    hemi: [0xffa070, 0x301410, 0.85], sun: [0xffb070, 1.15], envGround: 0x2a1410,
    ground: [0x2c2426, 0x3a2e2c, 0x1e1719], crack: 0xff5a14,
    asphalt: [44, 36, 40], line: 0xffd2a8,
    conc: 0x5e4c4e, safer: 0xd8481c, post: 0x2a2224,
    mtn: [0xff6a1e, 0x2e2426, 0x3c2c2a], mtnShape: 'volcano',
    flora: 'dead', redTrees: false, valley: 'lava', air: 'ash',
  },
  // Ökenbanan: solnedgång, sand och röda klippor, kaktusar, platåberg
  oken: {
    ...SNO,
    sky: { hor: 0xffc68a, mid: 0xf29a5c, top: 0x7a5fb0, cloud: 0xffe2c2, shade: 0xc27a6a, stars: 0, aurora: 0, clouds: 0.6 },
    fog: 0.00034,
    hemi: [0xffe0b8, 0xc28a5a, 1.0], sun: [0xffc890, 1.5], envGround: 0xe8b878,
    ground: [0xe8b878, 0xd9a564, 0xb8623e], crack: null,
    asphalt: [72, 62, 60], line: 0xfff2dc,
    conc: 0xe0c09a, safer: 0xd26a2a, post: 0x6a4a3a,
    mtn: [0xd8784a, 0xb85a36, 0xe0a070], mtnShape: 'mesa',
    flora: 'cactus', redTrees: false, valley: 'sand', air: 'dust',
  },
  // Stadsbanan: natt, stjärnor, höghus med tända fönster, neonskyltar och gatlyktor
  stad: {
    ...SNO,
    sky: { hor: 0x2c3360, mid: 0x141a3c, top: 0x04060e, cloud: 0x262c4c, shade: 0x0a0c18, stars: 1, aurora: 0, clouds: 0.35 },
    fog: 0.00055,
    hemi: [0x8a98d8, 0x1c1c2c, 0.62], sun: [0xaabcff, 0.6], envGround: 0x1a1c26,
    ground: [0x3a3d48, 0x44474f, 0x2e3038], crack: null,
    asphalt: [36, 36, 42], line: 0xffffff,
    conc: 0x8a8e9a, safer: 0x2bd6e8, post: 0x2a2c33,
    mtn: [0x1a1e30, 0x22263a, 0x161a28], mtnShape: 'skyline',
    flora: 'city', redTrees: false, valley: 'ice', air: null,
  },
  // Isbanan: norrsken, blåvit is, iskristaller och isblock
  is: {
    ...SNO,
    sky: { hor: 0x2a4a6a, mid: 0x14243e, top: 0x060a18, cloud: 0x3a5a7a, shade: 0x101828, stars: 0.7, aurora: 1, clouds: 0.3 },
    fog: 0.0004,
    hemi: [0xb8e8ff, 0x3a5a7a, 0.9], sun: [0xd8f0ff, 1.05], envGround: 0xcfe8f8,
    ground: [0xe8f6ff, 0xcfe8f8, 0x8ab8d8], crack: null,
    asphalt: [150, 188, 214], line: 0xff3a5a,
    conc: 0xd8eef8, safer: 0x2b6ad6, post: 0x5a7a9a,
    mtn: [0xf4fbff, 0x8ab0cc, 0xc8e0f0], mtnShape: 'cone',
    flora: 'ice', redTrees: false, valley: 'ice', air: 'snow',
  },
  // Djungelbanan: fuktig grönblå himmel, gröna berg, palmer och lövträd, floder under broarna
  djungel: {
    ...SNO,
    sky: { hor: 0xd8f0d8, mid: 0x9fd8d0, top: 0x4aa0c8, cloud: 0xffffff, shade: 0x8aa8a0, stars: 0, aurora: 0, clouds: 1 },
    fog: 0.0006,
    hemi: [0xe8ffe0, 0x4a6a3a, 1.0], sun: [0xfff4d8, 1.35], envGround: 0x5a8a4a,
    ground: [0x4f8f3a, 0x3f7a30, 0x6a5a40], crack: null,
    asphalt: [74, 60, 50], line: 0xfff6d8,
    conc: 0x8f9a78, safer: 0x2a9a4a, post: 0x4a3a2a,
    mtn: [0x5aa04a, 0x3f6a38, 0x3a7a3a], mtnShape: 'cone',
    flora: 'jungle', redTrees: false, valley: 'water', air: null,
  },
  // Månbanan: svart himmel full av stjärnor, jorden på himlen, grått stoft och kratrar
  mane: {
    ...SNO,
    sky: { hor: 0x07080e, mid: 0x030409, top: 0x000000, cloud: 0x101018, shade: 0x000000, stars: 1, aurora: 0, clouds: 0 },
    fog: 0.00012,
    hemi: [0x9aa8c8, 0x2a2a30, 0.6], sun: [0xffffff, 1.9], envGround: 0x6a6a70,
    ground: [0x8e8e94, 0x7a7a80, 0x55555c], crack: null,
    asphalt: [52, 52, 58], line: 0xffd21f,
    conc: 0xc8c8cc, safer: 0xff7a1a, post: 0x55555c,
    mtn: [0xb0b0b6, 0x6a6a70, 0x8a8a90], mtnShape: 'cone',
    flora: 'moon', redTrees: false, valley: 'dust', air: null, earth: true,
  },
  // Strandbanan: klarblå himmel, vit sand, turkost hav runt ön, palmer och parasoll
  strand: {
    ...SNO,
    sky: { hor: 0xd4f0ff, mid: 0x8ccff6, top: 0x3a8ee6, cloud: 0xffffff, shade: 0xa8c4e0, stars: 0, aurora: 0, clouds: 0.9 },
    fog: 0.0003,
    hemi: [0xfffbea, 0xd8c08a, 1.05], sun: [0xfff6e2, 1.5], envGround: 0x7ad8e0,
    ground: [0xf6e2b0, 0xeed49a, 0xc8a46a], crack: null, patch: 0xb4c878,
    asphalt: [76, 72, 74], line: 0xffffff,
    conc: 0xf4efe6, safer: 0x18b4c8, post: 0x5a6a78,
    mtn: [0x4f9a44, 0x3f7f3a, 0xf0dca8], mtnShape: 'cone', mtnH: 0.32,
    flora: 'beach', redTrees: false, valley: 'water', air: null, sea: true,
    panel: ['#efe6d8', '#e2d6c2', '#f2ead8'], rail: 0x18b4c8, led: 0x2bd6e8,     // tunnel, mynning, brodäck
  },
  // Höstskogen: varm låg sol, lätt dis, röda och gula lövträd, löv på marken
  host: {
    ...SNO,
    sky: { hor: 0xf6dcbc, mid: 0xe6c8a8, top: 0x6a9ad6, cloud: 0xfff4e6, shade: 0xa8928e, stars: 0, aurora: 0, clouds: 0.8 },
    fog: 0.00046,
    hemi: [0xfff0d8, 0x7a5a36, 1.0], sun: [0xffd49a, 1.45], envGround: 0xb86a2a,
    ground: [0x7e8a3a, 0x9c8c3e, 0x6e5a44], crack: null, patch: 0xc4621e,
    asphalt: [64, 58, 58], line: 0xfff2dc,
    conc: 0xd8c8b4, safer: 0xd8601c, post: 0x4a3a2e,
    mtn: [0xe8a63a, 0xb0562a, 0x7a6a3a], mtnShape: 'cone', mtnH: 0.55,
    flora: 'autumn', redTrees: false, valley: 'water', air: 'leaves',
    panel: ['#b8a894', '#a89884', '#c8b8a2'], rail: 0xd8601c, led: 0xffb04a,
  },
  // Spökbanan: halloweennatt, lila dimma, stor måne, döda träd, gravstenar och lysande pumpor
  spoke: {
    ...SNO,
    sky: { hor: 0x3c2458, mid: 0x1c1036, top: 0x06030e, cloud: 0x2e1e44, shade: 0x0a0614, stars: 1, aurora: 0, clouds: 0.4 },
    fog: 0.0007,
    hemi: [0xc0a8f4, 0x302238, 0.95], sun: [0xd8d0ff, 0.85], envGround: 0x2c2238,
    ground: [0x4a4260, 0x564a6a, 0x342e44], crack: null, patch: 0x34483e,
    asphalt: [52, 46, 62], line: 0xff8a1a,
    conc: 0x7a6a88, safer: 0xff7a1a, post: 0x2a2230,
    mtn: [0x2e2242, 0x221a32, 0x281e38], mtnShape: 'cone', mtnH: 0.6,
    flora: 'spooky', redTrees: false, valley: 'slime', air: 'wisps', moon: true,
    panel: ['#5e5070', '#4e4260', '#6a5c7c'], rail: 0xff7a1a, led: 0xff8a1a,
  },
  // Godisbanan: rosa och mintgrön himmel, sockerglasyr, gelébergen, klubbor och polkagrisar
  godis: {
    ...SNO,
    sky: { hor: 0xffe2f0, mid: 0xffa8d4, top: 0x6ed4e6, cloud: 0xfff6fb, shade: 0xe8a2d0, stars: 0, aurora: 0, clouds: 1 },
    fog: 0.0003,
    hemi: [0xfff0fa, 0xe8b4d4, 1.05], sun: [0xfff4f8, 1.4], envGround: 0xffd6ea,
    ground: [0xffc4de, 0xffe4f0, 0xf08ab8], crack: null, patch: 0xa8f0d2, bands: [0xff9ccc, 0xa8f0d2, 0xfff09a, 0xd4b8ff, 0xffffff],
    asphalt: [96, 60, 50], line: 0xffffff,
    conc: 0xfff4f8, safer: 0xff4a8e, post: 0xd84a8a,
    mtn: [0xff8ac8, 0x9ae8d0, 0xffe27a], mtnShape: 'gumdrop',
    flora: 'candy', redTrees: false, valley: 'choklad', air: 'sprinkles',
    panel: ['#ffe2ee', '#ffd0e4', '#fff0f6'], rail: 0xff4a8e, led: 0xff6ab0,
  },
  // Neonbanan: 80-talsnatt, randig solnedgång, lysande rutnät, neonpyramider
  neon: {
    ...SNO,
    sky: { hor: 0xd8408e, mid: 0x5a1a7a, top: 0x0a0420, cloud: 0x3a1450, shade: 0x12061e, stars: 1, aurora: 0, clouds: 0 },
    fog: 0.00042,
    hemi: [0xc890ff, 0x2a1040, 0.75], sun: [0xffa0d8, 0.8], envGround: 0x1a0c2e,
    ground: [0x1c0f30, 0x221238, 0x140a24], crack: null, grid: true,
    asphalt: [30, 22, 44], line: 0x2bf0ff,
    conc: 0x2e1c48, safer: 0xff2bd6, post: 0x1a1028,
    mtn: [0x2a1446, 0x1e0e36, 0x160a28], mtnShape: 'wire', mtnH: 0.45,
    flora: 'neon', redTrees: false, valley: 'ice', air: null, synthSun: true, edgeGlow: 0xff2bd6,
    panel: ['#2a1c40', '#22163a', '#302048'], rail: 0xff2bd6, led: 0x2bf0ff,
  },
};
export const themeOf = (def) => THEMES[def?.theme] || SNO;
