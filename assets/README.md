# assets/ — dove caricare le immagini

Le specifiche vengono da **"Visual - Character & Scenarios"** su Notion. Carica qui
i file già ritagliati: il gioco li pesca da queste cartelle, basta dichiararli in
`game/story.json`.

```
assets/
  bg/       fondali        bg_<scena>.webp           1170x2532 px, < 400 KB
            _originali/    i file come arrivano da Gemini, prima della conversione
  chars/    personaggi     chr_<nome>_<parte>_<stato>@3x.webp
  props/    oggetti        prop_<nome>@3x.webp
  avatar/   layer avatar   avt_<slot>_<opzione>@3x.webp
```

## Formato

* **iPhone portrait**, baseline 390 × 844 pt. Il gioco non gira in orizzontale.
* Fondali a schermo intero **1170 × 2532 px @3x**, WebP, sotto i 400 KB.
* Il **terzo inferiore** del fondale è coperto da dialogo e bottoni: niente
  dettagli importanti sotto il 75% dell'altezza.
* Personaggi: PNG/WebP con trasparenza, altezza utile 900–1400 px @3x.

## Personaggi: corpo e testa separati

Il corpo tiene la **posa**, la testa tiene l'**espressione**, e sono due file.
Il punto di ancoraggio del collo dev'essere identico su tutte le pose dello stesso
personaggio (nel gioco si dichiara una volta sola, in `cast.<nome>.neck`).

```
chr_susan_corpo_in_piedi@3x.webp     chr_susan_testa_ansia@3x.webp
chr_susan_corpo_spinta@3x.webp       chr_susan_testa_neutro@3x.webp
```

Set minimo per personaggio: **1–2 pose** + **4–5 espressioni**
(neutro, positivo, sorpreso, scettico, in ansia).

## Avatar del giocatore: 4 layer sullo stesso rig

`avt_testa_a@3x.webp`, `avt_top_a@3x.webp`, `avt_bottom_a@3x.webp`, `avt_scarpe_a@3x.webp`
(opzioni `a` `b` `c` `d`). 4 slot × 4 opzioni = 256 combinazioni: gli sprite non si
possono disegnare già assemblati. **Tutti i layer vanno registrati sullo stesso
scheletro** — è il vincolo di produzione più delicato del progetto.

## Cosa manca oggi

Il gioco referenzia già questi file: appena li carichi con questo nome, compaiono
in scena senza toccare il codice. Finché mancano, la scena gira senza personaggio.

| Personaggio | Pose | Espressioni |
|---|---|---|
| Lucas ✅ | sprite unico (prototipo) | — |
| Susan | in_piedi, spinta | neutro, ansia, sorpresa, scettica, positiva |
| Maurice | in_piedi | neutro, positivo, sorpreso |
| Martha | in_piedi | neutro, positivo |
| Veterano | seduto | neutro, compiaciuto, scettico |
| Premi | in_piedi, tada | neutro, positivo |
| Avatar | — | 16 layer (4 slot × 4 opzioni) |

`npm test` stampa l'elenco aggiornato di cosa manca ancora.

## Dopo aver caricato

```bash
python3 tools/optimize_assets.py --all     # resize + 64 colori, alpha intatto
npm test                                   # verifica riferimenti e completezza
npm run serve && npm run shots             # screenshot a misura iPhone
```
