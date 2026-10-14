# KNUFFRAKAN

**Spela:** https://8bitcat.github.io/knuffrakan/

Packracing i 300 km/h genom rosa snöberg — i stil med Roblox-spelet *Backstretch Battles*.
Ju längre bak du ligger, desto fortare går du: fältet klumpar ihop sig och man knuffas,
tacklas, snurrar, voltar och brinner.

- **Banan**: ~10,8 km slinga med backar, krön (bilarna lättar) och doserade kurvor.
- **Bilarna**: stockcars byggda i koden med egen reklamlack (mönster, nummer, sponsorer).
  Plåten bucklas där man träffas, lacken får repor.
- **Packracing**: toppfarten styrs av placeringen + suget bakom bilar.
- **Garage**: välj kaross, färger, mönster, nummer och sponsor.
- **Lobby** (online): man samlas vid starten och kör runt fritt, trycker REDO; värden startar (eller alla redo → start om 3 s,
  publika rummet startar själv efter 30 s). Efter racet tillbaka till lobbyn.

## Köra lokalt

    node tools/serve.mjs 8810     # → http://localhost:8810/

Inga byggsteg: three.js 0.160, Rapier 0.12 via CDN (importmap).

## Styrning

W/↑ gas · S/↓ broms/back · A D/← → styr · Mellanslag handbroms · R tillbaka på banan · C kamera · M ljud.
Handkontroll: RT/LT gas/broms, vänster spak styr, A handbroms, Y omstart, B kamera.

## Släppa en ny version

Bumpa `VERSION` + `PROTO` i `js/config.js` och `?v=N` i alla imports (`sed -i 's/?v=GAMMAL/?v=NY/g' js/*.js index.html`),
commit, `git push` — GitHub Pages bygger om på någon minut. Utan ny `?v=` kan gamla och nya filer blandas i webbläsarens cache.

## Test

    node tools/shot.mjs "?auto&bot" namn 5,15,30    # skärmdumpar under ett race (AI kör din bil)
    node tools/sim.mjs 150                           # simulera ett race utan rendering, mät dynamiken
    node tools/garage.mjs "0,sh1"                    # närbild i garaget
    BASE=https://8bitcat.github.io/knuffrakan/ node tools/mp.mjs   # tvåspelartest mot den riktiga sidan
    node tools/lobby.mjs                             # lobbyn: gå med, redo, start, tillbaka till lobbyn

`?auto` startar direkt, `?bot` låter AI:n köra spelarens bil.
