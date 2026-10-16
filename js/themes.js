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
};
export const themeOf = (def) => THEMES[def?.theme] || SNO;
