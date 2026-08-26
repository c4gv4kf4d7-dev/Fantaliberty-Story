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
manutenzione.html       vecchia pagina "sito in manutenzione" (conservata)
```

## Sviluppo

```bash
npm run serve      # http://localhost:8080  (serve un web server: story.json via fetch)
npm install        # solo per i test
npm test           # smoke test del flusso: input -> variabili -> scene
npm run build      # dist/nexus_game.html, singolo file offline
```

`index.html?fast=1` disattiva l'effetto macchina da scrivere (comodo per provare il flusso).

## Scrivere una scena

Tutto lo script vive in `game/story.json`. Ogni scena e' una lista di `steps`:

| step | esempio | effetto |
|---|---|---|
| `say` | `{"t":"say","who":"Lucas","text":"Ciao {NOME}!"}` | battuta + typewriter, avanza al tap |
| `choice` | `{"t":"choice","var":"genere","text":"...","options":[{"label":"Maschile","value":"m"}]}` | bottoni; salva in `var`; `goto` opzionale per opzione |
| `input` | `{"t":"input","var":"nome","max":14,"text":"Come ti chiami?"}` | campo di testo sanitizzato |
| `show` / `hide` | `{"t":"show","char":"lucas_happy","pop":true}` | entra/esce il personaggio |
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
