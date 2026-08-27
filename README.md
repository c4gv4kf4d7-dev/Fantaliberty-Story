# FantaLiberty — Nexus (visual novel)

Visual novel / onboarding gamificato. **Sito statico puro**: HTML5 + CSS3 + JS vanilla,
nessun framework, nessun build step obbligatorio, nessun backend. Gira su GitHub Pages
(`fantaliberty.com`) e, nella versione compilata, anche offline da `file://`.

## Struttura

```
index.html              il gioco (shell + bootstrap)
game/
  engine.css            stile pixel-art + animazioni (@keyframes, non transition)
  engine.js             motore VN data-driven (state machine, ~350 righe)
  story.json            SCRIPT DEL GIOCO: scene, battute, scelte, asset  <- si edita qui
assets/
  bg/                   sfondi
  chars/                sprite personaggi (un file per espressione)
  props/                oggetti di scena (es. il terminale Mac)
tools/
  optimize_assets.py    resize + quantizzazione colore (Pillow)
  build_single_file.py  compila tutto in dist/nexus_game.html (asset inline base64)
tests/smoke.mjs         smoke test headless con jsdom
archivio/wwdc26/        edizione precedente (classifica, previsioni, pagina di manutenzione)
```

## Sviluppo

```bash
npm run bump       # alza ?v= sugli asset: obbligatorio prima di pubblicare
npm run serve      # http://localhost:8080  (serve un web server: story.json via fetch)
npm install        # solo per i test
npm test           # smoke test del flusso: input -> variabili -> scene
npm run build      # dist/nexus_game.html, singolo file offline
```

Parametri utili in sviluppo:

* `?fast=1` — niente typewriter, si scorre il flusso in fretta
* `?scene=lobby` — parte direttamente da una scena (ignora il salvataggio)
* `?reset=1` — cancella il salvataggio

## Pubblicare una modifica

I browser tengono in cache `engine.css`, `engine.js` e `story.json` anche dopo un
ricaricamento: senza accorgimenti una modifica pubblicata puo' non vedersi per ore.
Per questo index.html li carica con una query di versione (`engine.js?v=12`).

**Prima di ogni push:** `npm run bump` (alza il numero) e poi commit.
Nota: `index.html` non puo' avere una query di versione (e' lui il punto di
partenza), quindi resta in cache su GitHub Pages per una decina di minuti. Per
vedere subito una modifica appena pubblicata basta aprire il sito con una query
qualsiasi mai usata prima, per esempio `fantaliberty.com/?prova2`. Dopo il push
GitHub Pages impiega uno o due minuti; lo stato del deploy si vede nella tab
Actions del repo, workflow "pages build and deployment". Se resta *queued* a lungo
il sito continua a servire la versione precedente: non e' cache del browser, e'
il deploy che non e' ancora passato.

## Se il gioco resta nero

La pagina parte nera per l'intro, quindi un errore all'avvio si vedrebbe come uno
schermo nero muto. Tre reti di sicurezza:

* **motore e pagina devono avere la stessa versione** (`VN.engine` in engine.js e
  `ENGINE_ATTESO` in index.html). Se il browser mescola una pagina nuova con un
  motore vecchio preso dalla cache, il gioco si ricarica una volta sola con un
  indirizzo che la cache non puo' servire. Alza `VN.engine` **e** `ENGINE_ATTESO`
  insieme quando cambi il contratto (step nuovi, id nuovi nell'HTML)
* **paracadute a 8 secondi**: se non e' partito niente si esce dal nero e compare
  "Riparti da capo", che cancella il salvataggio e ricarica pulito
* **salvataggi di versioni precedenti** dello script vengono scartati invece che
  ripristinati (`meta.version` in story.json fa da chiave)

## Salvataggio

La partita si salva da sola in `localStorage` (chiave `fl_nexus_save_v1`) a ogni
battuta/scelta, a partire dalla prima risposta del giocatore. Chi riapre la pagina
trova "Riprendi / Ricomincia da capo": riprendendo, il motore rigioca in silenzio
solo gli step visivi della scena (sfondo, sprite, terminale) e riparte dalla battuta
esatta in cui si era interrotto. A storia finita il salvataggio viene cancellato.

## Scrivere una scena

Tutto lo script vive in `game/story.json`. Ogni scena e' una lista di `steps`:

| step | esempio | effetto |
|---|---|---|
| `say` | `{"t":"say","who":"Lucas","text":"Ciao {NOME}!"}` | battuta + typewriter, avanza al tap |
| `choice` | `{"t":"choice","var":"genere","text":"...","options":[{"label":"Maschile","value":"m"}]}` | bottoni; salva in `var`; `goto` opzionale per opzione |
| `input` | `{"t":"input","var":"nome","max":14,"text":"Come ti chiami?"}` | campo di testo sanitizzato |
| `show` / `hide` | `{"t":"show","who":"susan","body":"in_piedi","head":"ansia"}` | entra/esce il personaggio |
| `react` | `{"t":"react","level":"expr","head":"positiva"}` | reazione a 3 livelli (micro/expr/pose) |
| `avatar` | `{"t":"avatar","text":"Te ne faccio vedere quattro."}` | carosello dei 4 avatar |
| `logo` | `{"t":"logo","img":"ui/logo_studio.png"}` | sigla che si accende come un neon |
| `boot` | `{"t":"boot","ms":2200,"cursore":1600}` | barra LOADING, poi cursore sul nero |
| `title` | `{"t":"title","lines":[…]}` | cartello nero a righe |
| `prop` | `{"t":"prop","id":"mac_terminal","show":true}` | mostra/nasconde l'oggetto di scena |
| `bg` | `{"t":"bg","id":"sjt_stage","fx":"zoom"}` | cambia sfondo / effetto |
| `fx` | `{"t":"fx","name":"flash"}` | `flash`, `blur`, `unblur` |
| `wait` | `{"t":"wait","ms":600}` | pausa |
| `set` | `{"t":"set","var":"__ok","value":"OK"}` | scrive una variabile |
| `goto` / `end` | `{"t":"goto","scene":"benvenuto"}` | salta di scena / fine |

Interpolazione nei testi:

* `{nome}` valore variabile, `{NOME}` in maiuscolo
* `{g:Benvenuto|Benvenuta|Ti do il benvenuto}` variante per genere (`m|f|x`)
* `{label:anni}` etichetta dell'opzione scelta per quella variabile

La scena puo' definire `terminal`: le righe mostrate sullo schermo del Mac, che si
compilano da sole man mano che le variabili vengono impostate.

## Formato e layout

Il gioco e' pensato per **iPhone in verticale** (390x844 pt): il fondale occupa
tutto lo schermo, il terzo inferiore e' area dialogo. Su schermi larghi (Safari sul
Mac) non si stira a tutto schermo: disegna una cornice con le proporzioni di un
iPhone al centro della pagina.

Personaggi: **corpo (posa) + testa (espressione) come file separati**, ancorati al
collo dichiarato in `cast.<nome>.neck`. Avatar del giocatore: **4 avatar interi
gia' pronti**, scorribili in un carosello.

Reazioni dopo ogni input, tre livelli:
`{"t":"react","level":"micro"}` (nessun asset nuovo),
`{"t":"react","level":"expr","head":"sorpresa"}` (cambia la testa),
`{"t":"react","level":"pose","body":"spinta","head":"ansia"}` (momenti chiave).
Una scelta puo' portarsi dietro la sua reazione con `"react": {...}`.
**Regola inderogabile**: le reazioni seguono il *tono* della risposta, mai il
contenuto del pronostico, altrimenti il gioco suggerisce le risposte.

## Stato dello script

Atto 1 (arrivo → registrazione → benvenuto) e' completo e corrisponde al database
"Full Script / Onboarding Scene" su Notion. Atti 2-4 sono **segnaposto**: struttura,
personaggi e sezioni sono quelli decisi nella pagina "Cast Personaggi", i testi sono
marcati `[BOZZA]` e vanno riscritti.

## Aggiungere asset

1. Metti il PNG in `assets/chars/` (o `bg/`, `props/`).
2. `python3 tools/optimize_assets.py assets/chars/nuovo.png` — resize + 64 colori
   FASTOCTREE con alpha preservato: su pixel art e' impercettibile e taglia il peso 10-20x.
3. Dichiaralo in `story.json` sotto `assets.chars` e usalo negli step.
4. `npm test` verifica che ogni asset referenziato esista davvero.

Regola pratica: tenere il totale degli asset sotto ~1 MB, altrimenti la build
single-file diventa ingestibile su mobile.

---
© FantaLiberty. Progetto indipendente, non affiliato ad Apple Inc.
