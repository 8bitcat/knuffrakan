// Banhändelserna: tidtabeller, tåget träffar en parkerad bil och en bil som kör in i sidan, bilar som kör
// ut på den öppna klaffbron plaskar i och kommer tillbaka före bron, halvöppen klaff = hopp, bottarnas stopp.
// node tools/eventtest.mjs [bana ...]   (standard: snoberget oken host strand djungel) — oken har även stenraset
import { createRequire } from 'module';
const require = createRequire('D:/Qisy/QISYFrontend/QISYFrontend-1/package.json');
const { chromium } = require('playwright');
const banor = process.argv.slice(2).length ? process.argv.slice(2) : ['snoberget', 'oken', 'host', 'strand', 'djungel'];
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11'] });
let fail = 0;
const ok = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) fail++; };
for (const bana of banor) {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  await page.addInitScript((b) => localStorage.setItem('knuff_bana', b), bana);
  await page.goto(`http://localhost:${process.env.PORT || 8810}/?auto&nogear`);
  await page.waitForFunction(() => window.ready === true && window.__game?.me, null, { timeout: 90000 });
  console.log(`\n== ${bana} ==`);
  const r = await page.evaluate(() => {
    const g = window.__game, T = g.track, E = g.events, DT = 1 / 60, out = { rail: [], klaff: [] };
    g.tick = () => {}; g.race.toGrid(1e9);
    const A = g.me; A.brain = null; A.remote = {}; A.veh.hold = false;
    const park = () => { for (const [k, c] of g.cars.entries()) if (c !== A) g.parkBot(c, { s: T.wrapS(-40 - k * 6), lat: 0 }); };
    park();
    // håll filen (enkel styrning mot vägens mitt + riktning)
    const drive = (thr = 1) => { const i = A.trk.i, v = A.veh; const e = v.fwd.x * -T.hz[i] + v.fwd.z * T.hx[i]; A.remoteInput = { throttle: thr, brake: 0, steer: Math.max(-1, Math.min(1, -A.trk.lat * 0.06 - e * 2.5)), handbrake: 0 }; };
    const reset = (s, lat, v) => { g.placeCar(A, s, lat, v); A.ghostT = 0; A.veh.setGhost(false); A.health = 100; A.wrecked = false; A.veh.disabled = false; A.veh.spinT = 0; };
    // hoppa i klockan till tau i nästa cykel
    const jump = (z, tau) => { const n = Math.floor((g.simT + z.phi) / z.P) + 1; g.simT = n * z.P - z.phi + tau; };
    for (const z of E.rails) {
      const R = { s: Math.round(z.f.c), L1: z.L1, L2: z.L2, P: z.P, v: +z.v.toFixed(1), LT: +z.LT.toFixed(1) };
      // tidtabellen över två cykler: hur länge farligt / tåget synligt
      let dang = 0, vis = 0; const t0 = g.simT;
      for (let t = 0; t < 2 * z.P; t += 0.05) { if (E.blocked(z, t0 + t)) dang += 0.05; const s = E.trainAt(z, t0 + t); if (s.q > -(s.dir > 0 ? z.L1 : z.L2) && s.q - z.LT < (s.dir > 0 ? z.L2 : z.L1)) vis += 0.05; }
      R.farligt_s_per_cykel = +(dang / 2).toFixed(1); R.synligt_s_per_cykel = +(vis / 2).toFixed(1);
      // 1) parkerad bil mitt på övergången
      jump(z, z.tH0 - 3);
      reset(z.f.c, 0, 0); A.remoteInput = { throttle: 0, brake: 1, steer: 0, handbrake: 1 };
      E.log.length = 0;
      let maxV = 0, maxY = 0; const y0 = A.veh.pos.y, h0 = A.health;
      for (let k = 0; k < 60 * 7; k++) { g.step(DT); maxV = Math.max(maxV, A.veh.speed); maxY = Math.max(maxY, A.veh.pos.y - y0); }
      R.parkerad = { trafs: E.log.map(l => l.typ).join(','), skada: Math.round(h0 - A.health), vrak: A.wrecked, maxFart: Math.round(maxV), maxHojd: +maxY.toFixed(1) };
      // 2) bil i 60 m/s rakt in i sidan på tåget (vagnarna passerar)
      jump(z, z.tC + (z.hw + 20) / z.v);
      g.simT -= 1.0;   // starta 60 m före (1 s vid 60 m/s)
      reset(z.f.c - 60, 4, 60); A.remoteInput = { throttle: 1, brake: 0, steer: 0, handbrake: 0 };
      E.log.length = 0;
      let passed = false;
      for (let k = 0; k < 60 * 3; k++) { drive(); g.step(DT); if (T.sdist(A.trk.s, z.f.c) > 4 && E.log.length === 0) passed = true; }
      const after = T.sdist(A.trk.s, z.f.c);
      R.in_i_sidan = { trafs: E.log.map(l => l.typ).join(','), slutS: Math.round(after), genom: passed };
      // väggen finns kvar (osynlig) i öppningen där rälsen går: knuffa bilar snett in i den
      jump(z, z.tC + 20);
      let ut = 0;
      for (const [ds, sd, vl, vy] of [[0, 1, 30, 0], [-1, -1, 45, 4], [1.5, 1, 25, 10], [0.5, -1, 60, 2]]) {
        reset(z.f.c + ds - 4, sd * 8, 20); A.remoteInput = { throttle: 1, brake: 0, steer: 0, handbrake: 0 };
        const f = T.sampleAt(z.f.c), lv = A.veh.body.linvel();
        A.veh.body.setLinvel({ x: lv.x + f.rx * sd * vl, y: lv.y + vy, z: lv.z + f.rz * sd * vl }, true);
        let mx = 0; for (let k = 0; k < 120; k++) { g.step(DT); mx = Math.max(mx, Math.abs(A.trk.lat) - T.halfW); }
        if (mx > 1.5) ut++;
      }
      R.vaggUt = ut;
      // 3) stopAhead: bil 200 m före när tåget kommer om 3 s
      jump(z, z.tH0 - 2.5);
      reset(z.f.c - 200, 0, 70);
      R.stopAhead_fara = Math.round(E.stopAhead(A));
      jump(z, z.tH1 + 6);
      reset(z.f.c - 200, 0, 70);
      R.stopAhead_fritt = E.stopAhead(A);
      out.rail.push(R);
    }
    out.ras = [];
    for (const z of E.slides) {
      // bilar parkerade på olika ställen i raset: hur många träffas av en sten?
      let traff = 0, skada = 0; const tests = 6;
      for (let k = 0; k < tests; k++) {
        jump(z, z.tRel - 1);
        reset(z.s + (k - 2.5) * 5, (k % 3 - 1) * 6, 0); A.remoteInput = { throttle: 0, brake: 1, steer: 0, handbrake: 1 };
        E.log.length = 0; const h0 = A.health;
        for (let i = 0; i < 60 * 7; i++) g.step(DT);
        if (E.log.some(l => l.typ === 'sten')) traff++;
        skada += h0 - A.health;
      }
      let dang = 0; const t0 = g.simT;
      for (let t = 0; t < 2 * z.P; t += 0.05) if (E.blocked(z, t0 + t)) dang += 0.05;
      jump(z, z.tRel - 1); reset(z.s - 200, 0, 70); const capF = +E.speedCap(A).toFixed(1);
      jump(z, z.tRel + 12); reset(z.s - 200, 0, 70); const capL = E.speedCap(A);
      out.ras.push({ s: Math.round(z.s), P: z.P, traffade: traff + '/' + tests, skada: Math.round(skada), farligt_s_per_cykel: +(dang / 2).toFixed(1), speedCap_fara: capF, speedCap_fritt: capL });
    }
    for (const z of E.klaffs) {
      const K = { s: Math.round(z.sM), P: z.P, vatten: +z.waterY.toFixed(1), farligt_s_per_cykel: 0 };
      let dang = 0; const t0 = g.simT;
      for (let t = 0; t < 2 * z.P; t += 0.05) if (E.blocked(z, t0 + t)) dang += 0.05;
      K.farligt_s_per_cykel = +(dang / 2).toFixed(1);
      // vinkelprofil
      K.vinklar = [z.tO0 - 1, z.tO0 + 1.3, z.tO1, z.tMid, z.tC0 + 1.3, z.tC1 + 1].map(tau => Math.round(E.bridgeAt(z, tau - z.phi + z.P * 4).ang * 180 / Math.PI));
      // 1) helt öppen bro: klaffen är en vägg — bilen kommer inte över, smäller
      jump(z, z.tO1 + 0.2);
      reset(z.sA - 80, 0, 60);
      E.log.length = 0;
      let maxDs = -1e9;
      for (let k = 0; k < 60 * 4; k++) { drive(); g.step(DT); maxDs = Math.max(maxDs, T.sdist(A.trk.s, z.sB)); }
      K.oppen = { langst: Math.round(maxDs), halsa: Math.round(A.health), slutS: Math.round(T.sdist(A.trk.s, z.sA)) };
      // 2) bil ramlar ner i glipan när bron är öppen → plask → tillbaka före bron
      jump(z, z.tO1 + 0.5);
      reset(z.sM, 0, 0); A.veh.body.setTranslation({ x: A.veh.pos.x, y: A.veh.pos.y + 1, z: A.veh.pos.z }, true);
      E.log.length = 0; const nResp = (g.respawnLog || []).length;
      let minY = 1e9;
      for (let k = 0; k < 60 * 4; k++) { A.remoteInput = { throttle: 0, brake: 1, steer: 0, handbrake: 0 }; g.step(DT); minY = Math.min(minY, A.veh.pos.y); }
      K.glipan = { logg: E.log.map(l => l.typ).join(','), respawns: (g.respawnLog || []).slice(nResp).map(l => l[2]).join(','), lagst: +(minY - z.waterY).toFixed(1), slutS: Math.round(T.sdist(A.trk.s, z.sA)), fart: Math.round(A.veh.speed) };
      // 3) halvöppen klaff (ca 20°) = hoppbacke
      let tau20 = z.tO0; while (E.bridgeAt(z, tau20 - z.phi + z.P * 4).ang < 20 * Math.PI / 180) tau20 += 0.02;
      jump(z, tau20 - 90 / 70);
      reset(z.sA - 90, 0, 70);
      E.log.length = 0;
      let maxUp = -9, air = 0, angAt = null;
      for (let k = 0; k < 60 * 6; k++) {
        drive(); g.step(DT);
        if (angAt === null && T.sdist(A.trk.s, z.sA) > 0) angAt = Math.round(E.bridgeAt(z, g.simT).ang * 180 / Math.PI);
        maxUp = Math.max(maxUp, A.veh.pos.y - A.trk.y); if (A.veh.grounded === 0) air += DT;
      }
      K.halvoppen = { vinkelVidKlaffen: angAt, maxOverVag: +maxUp.toFixed(1), luft_s: +air.toFixed(1), logg: E.log.map(l => l.typ).join(','), slutS: Math.round(T.sdist(A.trk.s, z.sB)), vrak: A.wrecked };
      // 3) stängd bro: bil kör rakt över utan att märka något
      jump(z, z.tC1 + 8);
      reset(z.sA - 80, 0, 60);
      E.log.length = 0;
      let maxDy = 0;
      for (let k = 0; k < 60 * 3; k++) { drive(); g.step(DT); if (Math.abs(T.sdist(A.trk.s, z.sM)) < 25) maxDy = Math.max(maxDy, Math.abs(A.veh.pos.y - A.trk.y - 0.5)); }
      K.stangd = { logg: E.log.map(l => l.typ).join(','), slutS: Math.round(T.sdist(A.trk.s, z.sB)), maxAvvikelse: +maxDy.toFixed(2), fart: Math.round(A.veh.speed * 3.6) };
      // räckena på klaffarna håller kvar bilarna (stängd bro)
      let ut = 0;
      for (const [ds, sd, vl, vy] of [[-8, 1, 30, 0], [-4, -1, 45, 4], [6, 1, 25, 10], [10, -1, 60, 2]]) {
        reset(z.sM + ds - 4, sd * 8, 20); A.remoteInput = { throttle: 1, brake: 0, steer: 0, handbrake: 0 };
        const f = T.sampleAt(z.sM), lv = A.veh.body.linvel();
        A.veh.body.setLinvel({ x: lv.x + f.rx * sd * vl, y: lv.y + vy, z: lv.z + f.rz * sd * vl }, true);
        let mx = 0; for (let k = 0; k < 120; k++) { g.step(DT); mx = Math.max(mx, Math.abs(A.trk.lat) - T.halfW); }
        if (mx > 1.5) ut++;
      }
      K.vaggUt = ut;
      // 4) stopAhead
      jump(z, z.tO0 - 2); reset(z.sA - 200, 0, 70); K.stopAhead_fara = Math.round(E.stopAhead(A));
      jump(z, z.tC1 + 10); reset(z.sA - 200, 0, 70); K.stopAhead_fritt = E.stopAhead(A);
      out.klaff.push(K);
    }
    return out;
  });
  for (const R of r.rail) {
    console.log(' tåg', JSON.stringify(R));
    ok(R.parkerad.trafs.includes('tåg-nos') && R.parkerad.skada >= 30, `parkerad bil påkörd (${R.parkerad.trafs}, skada ${R.parkerad.skada}, ${R.parkerad.maxFart} m/s, ${R.parkerad.maxHojd} m upp)`);
    ok(R.in_i_sidan.trafs.includes('tåg-sida') && !R.in_i_sidan.genom, `bil in i tågets sida studsar (${R.in_i_sidan.trafs}, slut ${R.in_i_sidan.slutS} m från rälsen)`);
    ok(R.stopAhead_fara > 150 && R.stopAhead_fritt === -1, `stopAhead ${R.stopAhead_fara} / ${R.stopAhead_fritt}`);
    ok(R.vaggUt === 0, `muren håller i öppningen vid rälsen (${R.vaggUt} av 4 ute)`);
  }
  for (const S of r.ras) {
    console.log(' ras', JSON.stringify(S));
    ok(+S.traffade.split('/')[0] >= 2, `stenarna träffar parkerade bilar (${S.traffade}, skada ${S.skada})`);
    ok(S.speedCap_fara >= 0 && S.speedCap_fara < 60 && S.speedCap_fritt === -1, `speedCap ${S.speedCap_fara} m/s när raset kommer / ${S.speedCap_fritt} när det är fritt`);
  }
  for (const K of r.klaff) {
    console.log(' klaff', JSON.stringify(K));
    ok(K.vinklar[0] === 0 && K.vinklar[2] >= 70 && K.vinklar[3] >= 70 && K.vinklar[5] === 0, `klaffarnas vinkel ${K.vinklar.join('/')}`);
    ok(K.oppen.langst < 0 && K.oppen.halsa < 95, `öppen bro = vägg: kom inte över (${K.oppen.langst} m), hälsa ${K.oppen.halsa}`);
    ok(K.glipan.logg.includes('plask') && K.glipan.respawns.includes('klaff') && K.glipan.slutS < -40 && K.glipan.fart < 8, `ner i glipan: ${K.glipan.logg} → ${K.glipan.respawns}, tillbaka ${K.glipan.slutS} m före klaffen, ${K.glipan.fart} m/s`);
    ok(K.halvoppen.maxOverVag > 3 && K.halvoppen.maxOverVag < 40 && K.halvoppen.slutS > 0, `halvöppen klaff (${K.halvoppen.vinkelVidKlaffen}°) = hopp ${K.halvoppen.maxOverVag} m, ${K.halvoppen.luft_s} s i luften, landade ${K.halvoppen.slutS} m efter bron`);
    ok(!K.stangd.logg && K.stangd.slutS > 0 && K.stangd.maxAvvikelse < 1.2, `stängd bro: rakt över (${K.stangd.fart} km/h, avvikelse ${K.stangd.maxAvvikelse} m)`);
    ok(K.stopAhead_fara > 150 && K.stopAhead_fritt === -1, `stopAhead ${K.stopAhead_fara} / ${K.stopAhead_fritt}`);
    ok(K.vaggUt === 0, `räckena på klaffarna håller (${K.vaggUt} av 4 ute)`);
  }
  if (errors.length) { console.log(errors.join('\n')); fail++; }
  await page.close();
}
console.log(fail ? `\n${fail} FEL` : '\nALLT GRÖNT');
await browser.close();
process.exit(fail ? 1 : 0);
