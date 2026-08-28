# FantaLiberty — Story (visual novel)

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
  domande.json          banca pronostici [S5]: 29 domande, 316 battute (una per stile)
  quiz.json             quiz di Peter [S8]: 44 domande, due pool per livello
  backend.json          dove spedire la schedina chiusa (url + chiave anon)
assets/
  bg/                   sfondi
  chars/                sprite personaggi (un file per espressione)
  props/                oggetti di scena (es. il terminale Mac)
tools/
  prepara_asset.py      PNG pesanti -> WebP in assets/, con pulizia inclusa
  taglia_sheet.py       un foglio con piu' pose -> un file per posa
  rimuovi_sfondo.py     scontorna: sfondo che tocca i bordi dell'immagine
  togli_scacchiera.py   toglie le toppe di quadretti chiuse DENTRO uno sprite
  togli_bianchi.py      toglie le toppe di bianco chiuse DENTRO uno sprite
  ammorbidisci_bordi.py sfuma i contorni a scaletta (alpha binaria)
  optimize_assets.py    resize + quantizzazione colore (Pillow)
  build_single_file.py  compila tutto in dist/nexus_game.html (asset inline base64)
docs/
  script-master.md      DOCUMENTO UNICO di riferimento: scene S0B-S8, formule
  manifest-asset.md     quale file grafico serve in quale scena
  indice-domande.md     indice degli id, rigenerato da `npm run indice`
  backend.sql           schema e policy della tabella runs, da incollare in Supabase
tests/smoke.mjs         smoke test headless con jsdom
archivio/wwdc26/        edizione precedente (classifica, previsioni, pagina di manutenzione)
```

## Sviluppo

```bash
npm run bump       # alza ?v= sugli asset: obbligatorio prima di pubblicare
npm run indice     # rigenera docs/indice-domande.md dalla banca domande
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
| `say` | `{"t":"say","who":"lucas","text":"Ciao {NOME}!"}` | battuta + typewriter, avanza al tap |
| `say` a bivio | `{"t":"say","by":"anni","text":{"0":"…","3":"…","*":"…"}}` | la battuta cambia col valore della variabile (`*` = ripiego) |
| `choice` | `{"t":"choice","var":"genere","text":"...","options":[{"label":"Maschile","value":"m"}]}` | bottoni; salva in `var`; `goto` opzionale per opzione |
| `input` | `{"t":"input","var":"nome","max":14,"text":"Come ti chiami?"}` | campo di testo sanitizzato |
| `list` | `{"t":"list","var":"device","gruppi":[{"nome":"iPhone 17","opzioni":[{"label":"iPhone 17","value":"17","classe":"md"}]}]}` | lista a tendina: per le scelte troppo lunghe da fare a bottoni. `classeCorpo` + `classe` mettono una classe sul `<body>` (e' cosi' che il modello di iPhone adatta il layout) |
| `badge` | `{"t":"badge","prop":"badge","nome":"{NOME}"}` | mostra il badge dell'accredito col nome del giocatore sopra; senza l'immagine disegna una cornice di ripiego |
| `show` / `hide` | `{"t":"show","who":"susan","body":"in_piedi","head":"ansia"}` | entra/esce il personaggio (a destra) |
| `io` | `{"t":"io","posa":"idle_palco"}` · `{"t":"io","hide":true}` | la figura del giocatore (a sinistra): lo sprite dello stile scelto in S3 |
| `react` | `{"t":"react","level":"expr","head":"positiva"}` | reazione a 3 livelli (micro/expr/pose) |
| `hub` | `{"t":"hub","start":"tenda","zones":[…]}` | esplorazione a zone: swipe orizzontale, frecce, pallini. Vedi sotto |
| `carosello` | `{"t":"carosello","var":"stile","da":"stili","posa":"idle_camerino","conferma":{…}}` | scelta a schede: figura, descrizione, perk, conferma. Vedi sotto |
| `griglia` | `{"t":"griglia","var":"categoria","da":"argomenti","goto":"argomento"}` | i macroargomenti del keynote: pannelli con stato. Vedi sotto |
| `domande` | `{"t":"domande","set":"core"}` · `{"t":"domande","set":"extra"}` | il giro dei pronostici della categoria corrente |
| `bivio` | `{"t":"bivio","text":"…","approfondisci":"…","passa":"…"}` | pesca 3 facoltative dal pool, oppure passa oltre |
| `intermezzo` | `{"t":"intermezzo","who":"martha"}` | la prossima scommessa di regia, in ordine |
| `recap` | `{"t":"recap","da":"argomenti","lock":{…},"goto":"finale"}` | il teleprompter di S6: tutte le risposte, modificabili, e il blocco |
| `countdown` | `{"t":"countdown","azioni":[{"label":"…","goto":"lobby"},{"label":"…","card":true}]}` | l'ultima schermata: quanto manca al keynote vero, e la card da salvare |
| `logo` | `{"t":"logo","img":"ui/logo_studio.png"}` | sigla che si accende come un neon |
| `boot` | `{"t":"boot","ms":2200,"cursore":1600}` | barra LOADING, poi cursore sul nero |
| `title` | `{"t":"title","lines":[…]}` | cartello nero a righe |
| `prop` | `{"t":"prop","id":"mac_terminal","show":true}` | mostra/nasconde l'oggetto di scena |
| `bg` | `{"t":"bg","id":"sjt_stage","fx":"zoom"}` | cambia sfondo / effetto |
| `fx` | `{"t":"fx","name":"flash"}` | `flash`, `blur`, `unblur` |
| `sipario` | `{"t":"sipario","davanti":"lobby_z1_tenda","dietro":"sala_teatro"}` | il fondale si apre in due meta' che scorrono ai lati, dietro c'e' quello nuovo |
| `carrellata` | `{"t":"carrellata","id":"discesa_palco"}` | piu' inquadrature in fila che si ingrandiscono e si dissolvono una nell'altra. Vedi sotto |
| `wait` | `{"t":"wait","ms":600}` | pausa |
| `set` | `{"t":"set","var":"__ok","value":"OK"}` | scrive una variabile |
| `goto` / `end` | `{"t":"goto","scene":"benvenuto"}` | salta di scena / fine |

Interpolazione nei testi:

* `{nome}` valore variabile, `{NOME}` in maiuscolo
* `{g:Benvenuto|Benvenuta}` variante per genere: una per valore di
  `meta.genderOrder`, nello stesso ordine (oggi `m|f`)
* `{label:anni}` etichetta dell'opzione scelta per quella variabile

### Lo step `hub`: esplorare una stanza a zone

La lobby (`[S1.HUB]` dello script master) non e' una sequenza di battute ma un
posto da girare: quattro zone che si scorrono di lato, senza ordine imposto.

```json
{ "t": "hub", "start": "tenda", "var": "zona",
  "tutorial": { "who": "francesca", "body": "gesto_swipe",
                "text": "Scorri per scoprire la lobby." },
  "zones": [
    { "id": "tenda", "bg": "lobby_z1_tenda", "who": "francesca", "body": "indica_tenda",
      "say": "La tenda e' quella.",
      "hotspots": [
        { "label": "ENTRA", "x": "40%", "y": "44%", "w": "20%", "h": "42%",
          "richiede": "swipe", "bloccato": "Aspetta, prima fatti un giro.",
          "conferma": { "text": "Entrare in sala?", "si": "Si'", "no": "Non ancora" },
          "goto": "ritardo_ceo" } ] } ] }
```

* **zone**: ognuna ha il suo `bg` e, se serve, un personaggio (`who` + `body`,
  con gli stessi `height`/`bottom`/`right` di `show`). `dice` separa chi parla
  da chi si vede — nella zona del quiz si vede Peter che dorme, ma commenta
  Francesca. `say` e' la battuta all'ingresso: la prima volta si scrive, dopo
  ricompare gia' intera.
* **hotspots**: rettangoli toccabili posizionati in percentuale sulla parte di
  schermo sopra il box dialogo. Un hotspot con `say` commenta e basta (si resta
  nell'hub); con `goto` porta a un'altra scena; con `conferma` chiede prima
  conferma in una modale. `react` fa reagire il personaggio.
* **`richiede": "swipe"`**: l'hotspot resta spento finche' il giocatore non ha
  cambiato zona almeno una volta, e al tocco dice `bloccato`. Serve a non far
  entrare in sala chi non si e' accorto che la lobby era visitabile.
* **`tutorial`**: finche' non c'e' stato il primo swipe parla lui al posto della
  zona, con la posa del gesto.
* **`when`**: `{"var":"locked","is":true}` su una zona o su un hotspot lo mostra
  solo se la condizione e' vera. La zona 4 e' scritta due volte, una per stato
  di `locked`: chiusa con Peter addormentato, aperta con il quiz. I pallini
  restano quattro in entrambi i casi.

Si scorre con le frecce, con il dito (oltre 40px di trascinamento) o con le
frecce della tastiera.

### Lo step `carosello`: scegliere fra piu' schede

La scelta dello stile di `[S3.02]`: si scorrono quattro figure, ognuna con la sua
descrizione e il perk che porta al quiz, e si conferma in una modale perche' e'
irreversibile.

Le opzioni **non stanno nello step**: vengono da un blocco a parte di
`story.json` (`da`, di norma `stili`), perche' le stesse pose e gli stessi perk
servono anche a S5 e S8.

```json
"stili": {
  "hawaiano": {
    "nome": "Hawaiano",
    "desc": "Non sa che ore sono, ma sa sempre cosa dire.",
    "perk": { "id": "seconda_chance", "testo": "un tentativo fallito non si conta, una volta per livello." },
    "evento": "stacchetto",
    "pose": { "idle_camerino": "…", "idle_palco": "…", "annuncio": "…", "…": "…" }
  }
}
```

Lo step dice solo quale posa mostrare (`posa`), in che variabile salvare (`var`)
e cosa chiede la conferma. `ordine` puo' forzare l'ordine delle schede; senza,
si usa quello del blocco.

### Chi c'e' in scena, e chi invece parla soltanto

L'inquadratura ha due posti fissi: **il giocatore a sinistra** (step `io`, sprite
dello stile scelto in S3) e **gli NPC a destra** (step `show`). Da S4 in poi i
due condividono la scena.

Un personaggio del cast puo' anche essere dichiarato **voce**, senza pose:

```json
"martha": { "name": "Martha", "voce": true,
            "icona": ["chars/chr_martha_indicatore_regia_1.webp",
                      "chars/chr_martha_indicatore_regia_2.webp"] }
```

Quando parla, invece di uno sprite in scena compare l'icona accanto al nome —
alternando i frame, cosi' "trasmette" — e il box del dialogo cambia colore.
Serve a distinguere una voce in cuffia (Martha, dalla regia) da qualcuno che ti
sta davvero davanti. `npm test` controlla che una voce non abbia pose e che le
sue icone esistano.

### S5, il keynote: griglia, domande, bivio, intermezzi

Il cuore del gioco. Le domande, le battute per stile, gli eventi e gli
intermezzi **non stanno in `story.json`**: stanno in `game/domande.json`, che il
motore riceve come `VN.banca`. Sono contenuto grande (29 domande x 4 stili di
battute) e che cambia per conto suo.

Il giro e' questo:

```
keynote    intermezzo R1, R2                      -> argomenti
argomenti  griglia dei 3 macroargomenti           -> argomento (quello scelto)
argomento  slide, core in sequenza, bivio,
           eventuali 3 facoltative, intermezzo    -> torna a argomenti
```

Quando tutte e tre le categorie hanno le loro core, la griglia **cede il turno**
e la scena prosegue verso il recap. Lo stato di ogni pannello non e' una lista
da tenere allineata: si ricava dalle risposte gia' date in `run.picks`, quindi
sopravvive da sola al salvataggio.

Tre regole dello script che il codice deve rispettare:

* **le facoltative si pescano al bivio**, non a inizio partita — chi rigioca in
  privato non deve poterle mappare;
* **la reazione della platea e' sempre casuale**, mai legata a quale opzione e'
  stata scelta: se lo fosse, il gioco suggerirebbe le risposte. Il quiz di Peter
  in S8 e' l'eccezione dichiarata, li' le risposte sono oggettive;
* **gli eventi non si ripetono**: si pescano da un sacchetto senza rimessa, con
  dentro i cinque micro-eventi piu' quello personale dello stile scelto.

`story.regia` regola il contorno: `probabilitaEvento` e le righe generiche con
cui Martha apre una domanda (`introDomanda`, scelte a caso).

### S6: il recap e l'invio

Lo step `recap` mostra tutte le risposte date, per macroargomento, ognuna ancora
toccabile: toccarla riapre la domanda originale con le stesse opzioni. Le
facoltative saltate compaiono come righe vuote e si possono giocare adesso — se
il pescaggio non era stato fatto, si fa ora.

Il punteggio **non e' accumulato ma derivato** dalle risposte: qui si possono
cambiare, e un contatore accumulato andrebbe fuori sincrono alla prima
correzione.

Il bottone rosso chiude la schedina: `run.locked = true`, e da quel momento la
zona 4 della lobby si apre (e' gia' condizionata a `locked`, non serve altro).

**L'invio.** `game/backend.json` dice dove spedire:

```json
{ "url": "https://....supabase.co", "tabella": "runs", "chiave": "<anon key>" }
```

Lo schema della tabella e le policy stanno in `docs/backend.sql`. La chiave
`anon` di Supabase e' fatta apposta per stare in un sito statico: la policy RLS
concede **solo INSERT**, quindi da sola non puo' leggere ne' modificare niente.
La chiave `service_role` non deve mai finire li' dentro.

Il timestamp lo mette il server (`default now()` sulla colonna), non il client:
un orologio del telefono spostato non deve poter cambiare l'ordine di arrivo.

Il blocco e' locale e irreversibile, quindi se l'invio fallisce — rete assente,
chiave non ancora configurata — la schedina **resta in coda** in `localStorage`
e si riprova da sola al prossimo avvio, invece di perdersi.

### S7: il countdown e la card

`meta.keynote` e' la data e ora verso cui conta il countdown (ISO, con fuso).
E' l'unica riga da cambiare se Apple sposta l'evento; senza una data valida
`npm test` si ferma, perche' un countdown senza traguardo non conta niente.

Chi riapre il gioco con la schedina gia' bloccata **non trova "riprendi"**:
torna qui, perche' non c'e' piu' storia da rigiocare. Da qui si va in lobby, e
la zona 4 e' ormai aperta.

La card si compone su una `canvas` — figura dello stile, nome, store, punteggio
— e si mostra come immagine. Su iPhone il salvataggio vero e' **tenere premuto**
sull'immagine: il tocco su un link di download li' apre solo una scheda. Il link
resta per chi gioca da computer.

### Le pose che dipendono da una variabile

`show` passa `body` e `head` dall'interpolazione (e `prop` il suo `id`), quindi
una scena puo' scrivere
`"body": "commento_{stile}"` e lasciare che sia la scelta a decidere lo sprite,
invece di ripetere lo stesso step una volta per valore. `npm test` espande la
posa su **tutti** i valori che quella variabile puo' prendere — li raccoglie da
chi la scrive — e controlla che ognuno esista: se ne mancasse uno, la scena
resterebbe senza personaggio solo su quel percorso.

Stessa cosa per le battute con `by`: o coprono tutti i valori, o hanno il
ripiego `"*"`.

### Le due transizioni: `sipario` e `carrellata`

**`sipario`** apre il fondale in due meta' che scorrono ai lati, scoprendo
quello dichiarato in `dietro`. Serve alla tenda della lobby (S1 → S2) e al
sipario del palco (S4): il manifest asset chiede proprio questo, e nessun
fondale "tenda aperta" e' mai stato disegnato. `davanti` dice esplicitamente
cosa si apre; senza, si usa il fondale che c'e' in quel momento — comodo, ma
saltando dentro la scena con `?scene=...` il fondale di partenza e' gia' quello
nuovo e non ci sarebbe niente da aprire.

**`carrellata`** e' una serie di inquadrature che si ingrandiscono e si
dissolvono una nell'altra, definite in `story.carrellate`:

```json
"discesa_palco": {
  "ms": 3400, "dissolvenza": 450, "origine": "50% 45%",
  "shots": [
    { "img": "bg/bg_sala_discesa_palco_layer1_sfondo.webp", "da": 1.0, "a": 1.5, "origine": "50% 40%" },
    { "img": "bg/bg_sala_discesa_palco_layer3_primopiano.webp", "da": 1.1, "a": 1.9, "origine": "30% 45%" },
    { "img": "bg/bg_sala_discesa_palco_layer2_poltrone.webp", "da": 1.05, "a": 1.35, "origine": "62% 25%" }
  ]
}
```

Le inquadrature stanno in fila, non sovrapposte. I tre file della discesa in
sala si chiamano `layer1/2/3` e sembrano i livelli di un'unica immagine, ma
provando a sovrapporli si coprono a vicenda: sono tre riprese successive dello
stesso percorso. Vanno giocate in ordine di percorso, non di nome — la
`discesa_palco` mette il primo piano (`layer3`) **in mezzo**, cosi' finisce
sulle poltrone davanti al palco invece che su un pilastro sfocato.

Il livello della carrellata non ha fondo proprio: sotto resta `#bg`. I tre file
sono ritagli con i bordi trasparenti, e su un fondo pieno quei bordi
diventerebbero buchi neri.

La scena puo' definire `terminal`: le righe mostrate sullo schermo del Mac, che si
compilano da sole man mano che le variabili vengono impostate. Sono tante e lo
schermo e' piccolo: il motore rimpicciolisce il testo finche' ci sta, e rimisura
quando l'immagine del Mac finisce di caricarsi.

`meta.assetiInArrivo` elenca i file gia' disegnati ma non ancora convertiti e
caricati: `npm test` li segnala come "da convertire" invece di fallire, e il
motore disegna un ripiego al posto loro.

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

## Atmosfera delle scene

Una scena puo' dichiarare quanti elementi vivi mettere in campo:

```json
"uccelli": 8, "foglie": 7, "pulviscolo": 14
```

* **uccelli** — silhouette che attraversano il cielo, ali che battono e planate
* **foglie** — scendono ondeggiando, portate da una brezza, tinte smorzate
* **pulviscolo** — puntini dorati controluce che salgono dal basso

Sono disegnati in CSS, nessun asset da caricare. Ogni elemento parte con durata,
traiettoria e ritardo diversi, e alcuni sono gia' a meta' corsa quando la scena
si apre: cosi' non si vede mai "l'inizio" dell'animazione e il ciclo non si
riconosce a occhio. Dosare: negli interni bastano due o tre foglie, il grosso va
sulle inquadrature aperte.

## Stato dello script

Atto 1 (arrivo → registrazione → benvenuto) e' completo e corrisponde al database
"Full Script / Onboarding Scene" su Notion. Atti 2-4 sono **segnaposto**: struttura,
personaggi e sezioni sono quelli decisi nella pagina "Cast Personaggi", i testi sono
marcati `[BOZZA]` e vanno riscritti.

## Aggiungere asset

Il file che esce dal programma di grafica pesa 1-6 MB e **non va committato cosi'**.
Convertilo prima: `prepara_asset.py` lo importa da fuori, ne fa un WebP e lo scrive
nella cartella giusta, **senza toccare il sorgente**.

```bash
python3 tools/prepara_asset.py _sorgenti/*.png --prova       # stima, non scrive
python3 tools/prepara_asset.py _sorgenti/*.png               # tutta la cartella
python3 tools/prepara_asset.py ~/Desktop/logo.png --tipo ui --nome logo_studio
```

**Il tipo si deduce dal prefisso del nome**, quindi una cartella mista si converte in
un colpo solo e ogni file finisce nella sua sottocartella:

| prefisso | va in | cos'e' |
|---|---|---|
| `bg_` | `assets/bg/` | fondali |
| `chr_` | `assets/chars/` | NPC (Lucas, Francesca, Peter, Susan, Martha) |
| `stile_` | `assets/stili/` | i 4 stili del personaggio giocante |
| `prop_` (o `obj_`) | `assets/props/` | oggetti di scena |
| `pla_` | `assets/platea/` | layer di reazione della platea |
| `fx_` | `assets/fx/` | overlay di effetto |
| `avt_` | `assets/avatar/` | avatar |

`obj_` e' accettato come sinonimo di `prop_` e il nome viene riportato al prefisso
canonico (`obj_badge.png` -> `prop_badge.webp`): una cartella meta' `prop_` e meta'
`obj_` e' solo un modo per non ritrovare piu' niente.

`obj_zaino_rider` e' un'eccezione dichiarata (`ECCEZIONI` in cima allo script): nel
manifest e' un personaggio pixel-art completo, non un oggetto isolato, quindi finisce
in `assets/chars/chr_zaino_rider.webp` anche se il nome inizia per `obj_`.

I file dal nome non riconoscibile vengono elencati e saltati invece che indovinati:
rinominali, o passali a parte con `--tipo`. Se `--tipo` contraddice il nome vince il
nome, altrimenti `--tipo chars` su uno sfondo produrrebbe un `chr_bg_qualcosa.webp`
in mezzo ai personaggi.

Le **tavole di riferimento** (`*_model_sheet`, `*_reference`) vengono saltate: servono
a chi disegna, non al gioco. `--tutto` le converte comunque.

Sui fondali il guadagno e' di **70-170 volte** (6 MB -> 36 KB) a
parita' di risoluzione: le soglie di ridimensionamento stanno sopra le dimensioni di
tutto quello che e' gia' nel repo, quindi la conversione cambia il peso e non la resa.
Usa `--pixel-art` se l'immagine va scalata a blocchi netti, `--qualita` per alzare o
abbassare la compressione (default 82; sotto 70 si inizia a vedere).

### Sprite sheet: un file consegnato come piu' pose in uno

Il manifest asset chiede alcuni file "a foglio": 4 teste affiancate
(`stile_X_espressioni`, `chr_susan_commento_stile`), 2 frame affiancati
(`obj_tavolino_buzzer_peter`, `obj_lucchetto_zona4`, `obj_clicker`). Il gioco
vuole un file per posa, quindi vanno tagliati **prima** di `prepara_asset.py`:

```bash
# 4 teste in una riga
python3 tools/taglia_sheet.py _sorgenti/stile_drip_espressioni.png \
    --pezzi 4 --nomi neutro sicuro sorpreso indifficolta

# 2 frame affiancati
python3 tools/taglia_sheet.py _sorgenti/obj_tavolino_buzzer_peter.png \
    --pezzi 2 --nomi non_premuto premuto

# una griglia vera (righe x colonne), letta riga per riga
python3 tools/taglia_sheet.py _sorgenti/foglio.png --righe 2 --colonne 2 --nomi a b c d
```

Ogni pezzo esce come `<nome_base>_<suffisso>.png` accanto al foglio originale, gia'
col prefisso giusto, pronto per il comando di conversione di sempre. Il foglio
originale viene spostato in `_sorgenti/_tagliati/`: resta li' come promemoria ma non
viene piu' raccolto dal glob `_sorgenti/*.png`, altrimenti verrebbe convertito anche
lui oltre ai suoi pezzi. Se le dimensioni non si dividono in modo esatto per la
griglia data, lo script si ferma con un errore invece di tagliare storto.

Poi:

1. Dichiaralo in `story.json` sotto `assets.chars` (o `bg`, `props`) e usalo negli step.
2. `npm test` verifica che ogni asset referenziato esista davvero.
3. `npm run bump` prima di pubblicare.

I sorgenti pesanti non vanno committati: servono solo a rigenerare, il gioco non li
carica mai. Tienili dove preferisci (Drive, iCloud, Scrivania) oppure, se e' comodo
averli a portata di mano, in una cartella `_sorgenti/` dentro il repo: e' nel
`.gitignore`, quindi Git la ignora e non rischi di caricare 200 MB di PNG per sbaglio.

Se uno sprite ha il **contorno a scaletta** ("ritagliato male"), la causa e' quasi
sempre l'alpha binaria: solo 0 o 255, nessuna sfumatura, quindi ogni bordo curvo o
diagonale diventa un gradino netto — e si nota ancora di piu' perche' il gioco
mostra le immagini rimpicciolite.

```bash
python3 tools/ammorbidisci_bordi.py --controlla     # chi ne ha bisogno
python3 tools/ammorbidisci_bordi.py assets/props/prop_mac_terminale.webp
```

Sbava il colore dei bordi verso l'esterno (senza, riaffiora il bianco del vecchio
sfondo come un alone) e poi sfuma solo l'alpha: l'interno resta pixel art nitida.
Salta da solo gli sprite gia' a posto, quindi si puo' lanciare su una cartella intera.

Se invece uno sprite ha **i quadretti della trasparenza addosso** in una zona
chiusa — fra le braccia alzate, fra un braccio e il fianco — `rimuovi_sfondo.py`
non ci arriva: quello riempie a partire dai bordi dell'immagine, e una toppa
circondata dal disegno dal bordo non si raggiunge. Anzi, viene tenuta apposta,
e' la stessa regola che salva i denti e i riflessi negli occhi.

```bash
python3 tools/togli_scacchiera.py --controlla       # chi ha quadretti chiusi dentro
python3 tools/togli_scacchiera.py assets/chars/chr_susan_mani_capelli.webp
```

Riconosce una scacchiera dal **lato dei quadretti**: strisce tutte lunghe uguali,
una ventina di pixel, con due tinte piatte. Un primo tentativo si accontentava
che chiaro e scuro si alternassero spesso, e voleva cancellare i capelli bianchi
di Peter e l'arco del lucchetto — che alternano a ogni pixel. Prima di lanciarlo
su file nuovi conviene guardare cosa toglierebbe con `--prova`.

Quando le tavole arrivano su **fondo bianco** invece che a scacchiera, la toppa
chiusa e' bianca e `togli_scacchiera.py` non la vede (non e' una griglia). E' il
caso dei quattro stili: puntini bianchi fra le ciocche dei capelli, chiazze
nell'occhiello fra braccio e busto. Per quelle c'e' `togli_bianchi.py`.

```bash
python3 tools/togli_bianchi.py --controlla                 # chi ha bianco chiuso dentro
python3 tools/togli_bianchi.py assets/stili/*.webp --anteprima shots/
python3 tools/togli_bianchi.py assets/stili/*.webp
```

Toglie solo il bianco **quasi puro e neutro** (ogni canale >= 235, i tre canali
entro 10 l'uno dall'altro): il bianco dipinto — la canottiera dell'Hawaiano, la
camicia dello Showman, le scarpe della Drip, i denti — e' sempre un po' sporco
di colore e resta dov'e'. Come per gli altri strumenti di pulizia, `--anteprima`
salva una copia con le zone candidate in magenta: **si guarda quella** prima di
scrivere. Non lanciarlo alla cieca su tutto `assets/`: sul lucchetto della lobby
e sul logo dello studio il bianco e' disegno, e li' mangerebbe il soggetto.

**`optimize_assets.py` e' un'altra cosa**: ricomprime *sul posto* file gia' dentro
`assets/` (resize + quantizzazione a 64 colori con alpha preservato), utile per
alleggerire la build single-file. Salta le cartelle `_originali/` proprio perche'
riscrive i file che gli passi.

Regola pratica: tenere il totale degli asset sotto ~1 MB, altrimenti la build
single-file diventa ingestibile su mobile.

---
© FantaLiberty. Progetto indipendente, non affiliato ad Apple Inc.
