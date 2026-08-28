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
  avatar/   avatar giocatore  avt_a.png … avt_d.png
  ui/       grafica di sistema logo_studio.png (la sigla 8Bit Studios)
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

## Avatar del giocatore: 4 avatar già pronti

Niente più composizione a layer. Servono **4 personaggi interi**, uno per file:

```
assets/avatar/avt_a.png   avt_b.png   avt_c.png   avt_d.png
```

Il giocatore li scorre uno a uno con le frecce e Lucas commenta ognuno; la
conferma compare solo dopo che li ha visti tutti e quattro. Le battute stanno in
`game/story.json` sotto `avatar.options[].say`.

Al momento in repo ci sono **4 sagome segnaposto** colorate: sostituiscile con gli
avatar veri tenendo gli stessi nomi. Figura intera, trasparenza, stessa altezza e
stesso appoggio a terra per tutti e quattro (altrimenti "saltano" scorrendo).

## Cosa manca oggi

Il gioco referenzia già questi file: appena li carichi con questo nome, compaiono
in scena senza toccare il codice. Finché mancano, la scena gira senza personaggio.

| Personaggio | Pose | Espressioni |
|---|---|---|
| Lucas ✅ | sprite unico (prototipo) | — |
| Susan | in_piedi, spinta | neutro, ansia, sorpresa, scettica, positiva |
| Maurice | in_piedi | neutro, positivo, sorpreso |
| Veterano | seduto | neutro, compiaciuto, scettico |
| Premi | in_piedi, tada | neutro, positivo |
| Avatar giocatore | 4 file interi (`avt_a..d.png`) | segnaposto in repo |

`npm test` stampa l'elenco aggiornato di cosa manca ancora.

## La sigla dello studio

`assets/ui/logo_studio.png` — l'insegna "8Bit Studios" che si accende all'avvio.
PNG con **sfondo trasparente**, largo 800–1200 px. Il gioco lo fa lampeggiare e
pulsare da solo: il file dev'essere l'insegna **spenta/neutra**, senza aloni verdi
gia' disegnati addosso, altrimenti si sommano al bagliore aggiunto dal motore.

Finche' il file non c'e', l'insegna viene disegnata in CSS con lo stesso aspetto.

## Attenzione: sfondo trasparente

Gemini consegna spesso i PNG con **sfondo bianco opaco**: nel gioco diventa un
rettangolo bianco attorno al personaggio. Se capita non serve rifare l'immagine,
lo sfondo si toglie in automatico (flood fill dai bordi + erosione di 1px per
l'alone chiaro) — basta dirmelo, oppure:

```bash
python3 tools/rimuovi_sfondo.py assets/props/prop_mac_terminale.png
```

## Puntini e trattini bianchi negli sprite

Gli sprite generati arrivano quasi sempre con piccoli residui quasi bianchi:
puntini isolati, trattini lungo i contorni interni, avanzi di sfondo attaccati
alla figura. A schermo pieno si notano.

```bash
python3 tools/pulisci_bordi.py assets/chars/chr_susan_corpo_in_piedi.png
```

Fa tre cose:

1. cancella le **isole staccate** dalla figura (puntini rimasti attorno al soggetto)
2. toglie l'**alone di scontorno**: il pixel piu' esterno molto piu' chiaro di
   quello che ha subito dentro e' sfondo rimasto attaccato. Si vede **solo sui
   fondali scuri**, per questo sfugge a occhio finche' non e' in gioco
3. **ricopre** le macchie chiare interne col colore che hanno intorno (non le
   rende trasparenti, altrimenti si aprirebbero buchi nel disegno)

Denti, bianco degli occhi e riflessi vengono risparmiati.

Controlla sempre lo sprite **su fondo scuro** prima di dire che e' pulito: su
fondo chiaro un alone bianco e' invisibile.

## Dopo aver caricato

```bash
python3 tools/optimize_assets.py --all     # resize + 64 colori, alpha intatto
npm test                                   # verifica riferimenti e completezza
npm run serve && npm run shots             # screenshot a misura iPhone
```
