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
  analytics.js         utility centralizzata per Google Analytics 4 (vedi docs/analytics.md)
  story.json            SCRIPT DEL GIOCO: scene, battute, scelte, asset  <- si edita qui
  domande.json          banca pronostici [S5]: 29 domande, 316 battute (una per stile)
  quiz.json             quiz di Peter [S8]: 44 domande, due pool per livello
  backend.json          dove spedire la partita conclusa (url + chiave anon)
  runner/index.html     APPLE CAMPUS RUN [S9]: il minigioco, pagina a se'
assets/
  bg/                   sfondi
  chars/                sprite personaggi (un file per espressione)
  props/                oggetti di scena (es. il terminale Mac)
  in_app_game/          la grafica della corsa (la carica solo game/runner/)
tools/
  prepara_asset.py      PNG pesanti -> WebP in assets/, con pulizia inclusa
  taglia_sheet.py       un foglio con piu' pose -> un file per posa
  rimuovi_sfondo.py     scontorna: sfondo che tocca i bordi dell'immagine
  togli_scacchiera.py   toglie le toppe di quadretti chiuse DENTRO uno sprite
  togli_bianchi.py      toglie le toppe di bianco chiuse DENTRO uno sprite
  ammorbidisci_bordi.py sfuma i contorni a scaletta (alpha binaria)
  optimize_assets.py    resize + quantizzazione colore (Pillow)
  build_single_file.py  compila tutto in dist/nexus_game.html (asset inline base64)
  taratura_pista.html   traccia a mano i bordi della pista della corsa [S9]
  verifica-corsa.mjs    gioca una partita intera ad Apple Campus Run (npm run corsa)
docs/
  script-master.md      DOCUMENTO UNICO di riferimento: scene S0B-S9, formule
  manifest-asset.md     quale file grafico serve in quale scena
  indice-domande.md     indice degli id, rigenerato da `npm run indice`
  backend.sql           schema e policy della tabella runs, da incollare in Supabase
  analytics.md          Google Analytics 4: eventi, funnel, tracking QR (vedi game/analytics.js)
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
npm run transizioni # (serve `npm run serve` attivo) controlla che un cambio di
                   # scena non scopra fondale o personaggio prima che siano pronti
npm run build      # dist/nexus_game.html, singolo file offline
```

Parametri utili in sviluppo:

* `?dev` — apre il **menu di salto rapido** (vedi sotto)
* `?fast=1` — niente typewriter, si scorre il flusso in fretta
* `?scene=lobby` — parte direttamente da una scena (ignora il salvataggio)
* `?reset=1` — cancella il salvataggio

### Il menu di salto rapido (`?dev`)

`https://fantaliberty.com/?dev` apre un elenco di tutte le scene: si tocca
quella che si vuole provare e il gioco parte da li'. Serve a non rigiocare
mezz'ora di storia ogni volta che si cambia una battuta di S6.

In cima ci sono le impostazioni del giocatore finto con cui si entra: genere,
anni in Apple, stile (quello che nel gioco si sceglie in S3) e se i pronostici
sono gia' stati fatti. Servono perche' le scene da S3 in poi danno per scontato
un giocatore registrato: saltandoci dentro a mani vuote, l'avatar non ha sprite
e il recap di S6 e' una pagina bianca. Con "pronostici gia' fatti" le risposte
vengono riempite dalla banca e il punteggio calcolato di conseguenza, cosi' S6 e
S7 hanno qualcosa da mostrare.

Con la schedina anche **chiusa** ("Schedina: Chiusa (locked)"), saltando alla
scena `lobby` si arriva **direttamente** all'hub, gia' aperto sulla zona di
Peter: la sequenza di ritorno di Francesca ("Ah, eccoti...") si salta da sola
(`post_lobby_visto` parte gia' a `true`), cosi' non tocca ritoccarla a ogni
prova. Da li' un giro di swipe (o le frecce ai lati) porta a tutte le zone,
compresa la 5 — la porta **STAFF ONLY** di Apple Campus Run, gia' sbloccata:
e' cosi' che si prova la corsa senza dover rigiocare fino in fondo le
previsioni ogni volta.

C'e' anche una scorciatoia dedicata, sotto "Dall'inizio, come un giocatore
vero": **"Apple Campus Run — porta STAFF ONLY gia' sbloccata"** salta dritto
alla lobby con l'hub gia' aperto sulla zona 5 sbloccata, un tocco dalla corsa
vera e propria — senza nemmeno lo swipe. Usa `VN.state.__devZona`
(`indiceIniziale()` in `engine.js`), una variabile che esiste solo per questo:
non e' contenuto della storia e un giocatore vero non la imposta mai.

L'elenco delle scene **non e' scritto a mano**: si ricava seguendo i `next` a
partire da `meta.start`, e chi resta fuori (le scene che si raggiungono solo con
un `goto`) finisce in coda. Una scena nuova in `story.json` compare da sola.

Al menu si arriva **solo** aggiungendo `?dev` all'indirizzo: dal gioco non c'e'
nessun modo di aprirlo, quindi un giocatore non ci finisce dentro per sbaglio.
Conviene salvarsi il link fra i preferiti.

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

**Il pulsante ESCI** (in alto a sinistra) offre lo stesso salvataggio a comando,
ma solo dove serve: da `[S2]` fino al ritorno in lobby dopo le previsioni
confermate, l'unico tratto lungo del gioco senza un punto di pausa naturale.
Chiede prima se salvare, poi se tornare alla lobby (pausa, non reset — lo stato
resta quello che era) o uscire (`VN.boot()` con `scene:null`, la stessa
schermata di un riavvio vero). Dettagli e motivazioni in `CLAUDE.md`, sezione
"Il pulsante Esci".

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
| `intermezzo` | `{"t":"intermezzo","who":"susan","incuffia":true}` | la prossima scommessa di regia, in ordine |
| `recap` | `{"t":"recap","da":"argomenti","lock":{…},"goto":"finale"}` | il teleprompter di S6: tutte le risposte, modificabili, e il blocco |
| `countdown` | `{"t":"countdown","azioni":[{"label":"…","goto":"lobby"},{"label":"…","card":true}]}` | l'ultima schermata: quanto manca al keynote vero, e la card da salvare |
| `quizhub` | `{"t":"quizhub","goto":"quiz_livello","gotoMult":"moltiplicatori","esci":{…}}` | i tre livelli del quiz di Peter, con lo stato di ognuno. Vedi sotto |
| `quizlivello` | `{"t":"quizlivello","who":"peter","height":"44%"}` | un livello: N domande a tempo, perk dello stile, esito |
| `quizmult` | `{"t":"quizmult","da":"argomenti","conferma":{…}}` | distribuzione dei moltiplicatori vinti, irreversibile |
| `logo` | `{"t":"logo","img":"ui/logo_studio.png"}` | sigla che si accende come un neon |
| `boot` | `{"t":"boot","ms":2200,"cursore":1600}` | barra LOADING, poi cursore sul nero |
| `title` | `{"t":"title","lines":[…]}` | cartello nero a righe che si accumulano |
| `title` a blocchi | `{"t":"title","blocchi":[{"righe":[…],"tieni":1500}]}` | i titoli di coda: ogni blocco compare, resta, sfuma, e arriva il prossimo. Va da solo; il tocco **accelera**, non salta |
| `prop` | `{"t":"prop","id":"mac_terminal","show":true}` | mostra/nasconde l'oggetto di scena |
| `bg` | `{"t":"bg","id":"sjt_stage","fx":"zoom"}` | cambia sfondo / effetto |
| `fx` | `{"t":"fx","name":"flash"}` | `flash`, `blur`, `unblur` |
| `sipario` | `{"t":"sipario","davanti":"lobby_z1_tenda","dietro":"sala_teatro"}` | il fondale si apre in due meta' che scorrono ai lati, dietro c'e' quello nuovo |
| `carrellata` | `{"t":"carrellata","id":"discesa_palco"}` | piu' inquadrature in fila che si ingrandiscono e si dissolvono una nell'altra. Vedi sotto |
| `wait` | `{"t":"wait","ms":600}` | pausa |
| `set` | `{"t":"set","var":"__ok","value":"OK"}` | scrive una variabile |
| `goto` / `end` | `{"t":"goto","scene":"benvenuto"}` | salta di scena / fine |

Qualsiasi step accetta **`se`**: con la condizione falsa lo step viene saltato,
senza fermare la scena. La forma e' quella delle zone dell'hub
(`{"var":"quiz_visto","is":false}`, oppure `non` / `almeno`). Serve alle battute
che si dicono una volta sola — Peter presenta il quiz al primo ingresso, non a
ogni ritorno dalla griglia dei livelli.

Interpolazione nei testi:

* `{nome}` valore variabile, `{NOME}` in maiuscolo
* `{g:Benvenuto|Benvenuta}` variante per genere: una per valore di
  `meta.genderOrder`, nello stesso ordine (oggi `m|f`)
* `{label:anni}` etichetta dell'opzione scelta per quella variabile

### Lo step `hub`: esplorare una stanza a zone

La lobby (`[S1.HUB]` dello script master) non e' una sequenza di battute ma un
posto da girare: cinque zone che si scorrono di lato, senza ordine imposto —
teatro, Hall of Fame, regolamento, Peter/quiz e la porta STAFF ONLY di Apple
Campus Run (S9).

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
  nell'hub); con `goto` porta a un'altra scena; con `apre` mostra un pannello da
  leggere sopra la lobby (vedi sotto); con `conferma` chiede prima conferma in
  una modale. `react` fa reagire il personaggio.
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

### Il regolamento: un pannello che si legge e si chiude

La zona 3 della lobby e' il cartellone del regolamento. L'hotspot non porta a
una scena: apre un pannello **sopra** la lobby, che alla chiusura lascia tutto
com'era.

```json
{ "label": "IL REGOLAMENTO", "x": "30%", "y": "16%", "w": "60%", "h": "42%",
  "apre": "regolamento" }
```

`apre` nomina un blocco di `story.json` — oggi solo `regolamento`. Dentro ci
sono due gruppi: le regole del gioco e le informazioni sul progetto (privacy,
indipendenza da Apple, contatti). Stanno nella stessa schermata e non in una
voce di menu a parte, cosi' chi cerca come si gioca trova anche il resto.

```json
"regolamento": {
  "titolo": "REGOLAMENTO",
  "sezioni":      [ { "id": "come_si_gioca", "titolo": "COME SI GIOCA", "righe": [...] } ],
  "gruppo":       "INFORMAZIONI SUL PROGETTO",
  "informazioni": [ { "id": "privacy", "titolo": "PRIVACY E DATI", "righe": [...] } ],
  "chiusa": { "titolo": "REGOLA NON SCRITTA", "testo": "Se sei {g:sicuro|sicura}..." },
  "bottone": "HO CAPITO"
}
```

Ogni voce e' una **riga richiudibile**: titolo e `+`, e sotto il testo. Si parte
tutte chiuse, cosi' l'elenco sta in una schermata sola. Lo stato aperto/chiuso
vive nel DOM e basta — non entra in `VN.state`, perche' leggere il regolamento
non deve toccare la partita.

Una `riga` e' una stringa (paragrafo) oppure:

| forma | cosa diventa |
|---|---|
| `{"h": "Quali dati raccogliamo"}` | sottotitolo in oro |
| `{"lista": ["...", "..."]}` | elenco puntato |
| `{"mail": "hello@fantaliberty.com"}` | indirizzo, come link `mailto:` |

**La parte legale deve dire il vero.** Quello che c'e' scritto in PRIVACY E DATI
e' anche quello che il gioco fa: i campi elencati sono esattamente quelli del
payload (vedi `docs/backend.sql`), Supabase e la memoria locale del browser sono
i due posti dove finiscono i dati, e i 30 giorni sono una cosa da fare a mano —
la procedura sta in fondo a `backend.sql`. Se cambia il payload, va cambiato
anche il testo. `npm test` controlla che le parole chiave ci siano ancora.

Il testo sta nei dati e non nel motore perche' e' contenuto: cambiarlo non deve
voler dire toccare il codice. Passa da `fmt()` come tutto il resto, quindi
`{NOME}` e `{g:...}` funzionano anche qui.

**La regola da non rompere: leggere il regolamento non tocca la partita.** Ne'
punti, ne' `picks`, ne' `locked`, ne' lo stile, ne' le domande gia' consumate.
`npm test` fotografa `VN.state` prima di aprirlo e lo confronta dopo averlo
chiuso: se una riga cambia, il test fallisce.

Il fondale va fuori fuoco mentre e' aperto (`#bg.sfoca`, la stessa classe del
camerino): senza, il pannello si confondeva con il cartellone disegnato dietro.
Titolo e bottone sono fissi e scorre solo il corpo — su uno schermo piccolo
"HO CAPITO" deve restare raggiungibile senza scorrere fino in fondo.

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

### La freccia `←`: rileggere quello che e' gia' stato detto

Durante il keynote, in alto a sinistra, una freccia apre l'elenco delle battute
gia' scritte: chi ha letto male una riga o vuole ricontrollare come era posta
una domanda se la rilegge, e chiude.

**Non e' una navigazione: e' un pannello.** Vale lo stesso contratto del
regolamento e dei quadri della Hall of Fame — si mostra sopra quello che c'e',
alla chiusura il giocatore e' dov'era, la partita non si e' mossa. Quindi non
tocca `VN.i`, non chiama `exec()`, non scrive dentro `VN.state`, e non
ricostruisce nessuna scena: sono battute gia' scritte, non schermate da
rimettere in piedi.

| pezzo | dove |
|---|---|
| l'elenco si riempie | `annota()`, chiamata da `type()` — l'unico passaggio di ogni battuta del box |
| chi parla | il nome che il box ha addosso: `setSpeaker()` viene sempre prima di `type()` |
| dove si vede la freccia | `SCENE_REGISTRO` in `engine.js`: `keynote`, `argomenti`, `argomento` |
| quanto tiene | le ultime `MAX_REGISTRO` battute (60) |

Il pannello non sopravvive a un cambio di scena (`goScene()` chiama
`chiudiRegistro()`) e il registro riparte vuoto a ogni `VN.boot()`.

### Parlare in cuffia

Chi parla dalla regia non ha uno sprite in scena: al suo posto compare l'icona
dell'auricolare accanto al nome — alternando i due frame, cosi' "trasmette" — e
il box del dialogo cambia colore. Serve a distinguere una voce nell'orecchio da
qualcuno che ti sta davvero davanti.

Si chiede in due modi. Un personaggio che esiste **solo** come voce lo dichiara
nel cast con `"voce": true` (e allora non deve avere pose: `npm test` lo
controlla, e controlla che le sue icone esistano).

**Susan invece e' un personaggio vero**: in S2, S3 e S7 e' li' in scena, dal
keynote in poi parla dalla regia. Per lei la cuffia la chiede il singolo step:

```json
{ "t": "say", "who": "susan", "incuffia": true, "text": "Ok. Tra trenta secondi andiamo." }
```

Funziona su `say`, `choice`, `griglia`, `domande`, `bivio`, `intermezzo` e
`recap`. Il cast di Susan dichiara solo l'`icona`:

```json
"susan": { "name": "Susan", "bodies": { "...": "..." },
           "icona": ["chars/chr_indicatore_regia_1.webp",
                     "chars/chr_indicatore_regia_2.webp"] }
```

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
* **gli eventi non si ripetono e sono pochi**: si pescano da un sacchetto senza
  rimessa che tiene **due** micro-eventi presi a caso fra i cinque della banca,
  piu' quello personale dello stile scelto, in testa. Tre imprevisti per
  partita;
* **gli intermezzi di regia sono un pool solo di sette**: si mescolano a inizio
  partita e se ne giocano al massimo quattro (`VN.state.intermezzi_sacchetto`),
  mai due volte lo stesso.

### Le battute della regia

`story.regia` e' il blocco della regia: chi e' (`chi`), ogni quanto succede
qualcosa (`probabilitaEvento`) e **i pool delle sue battute**.

Susan non parla dopo ogni singola scelta — sarebbe rumore, e la farebbe sembrare
una commentatrice invece che una che sta lavorando. Le battute stanno in pool per
situazione, e ognuno esce nel suo punto:

| pool | quando esce |
|---|---|
| `apertura` | una volta sola, a inizio S5 |
| `introDomanda` | riga corta prima di ogni domanda |
| `scarica` | quando parte un micro-evento senza una battuta sua |
| `improvvisazione` / `caos` / `critica` | conseguenza di un micro-evento, per esito |

Uno step `say` puo' pescare da un pool invece di avere il testo scritto:

```json
{ "t": "say", "who": "susan", "incuffia": true, "pool": "apertura" }
```

### I micro-eventi: tre risposte, e il punteggio non si vede

Un micro-evento non e' una scenetta passiva: ha **tre risposte**, e in banca
ognuna porta un `editoriale` (`game/domande.json`, `+3`/`0`/`-3`) che e' il
tono narrativo della scelta — utile, neutra, egoista. Il punto che finisce nel
totale e' il **segno** di quel valore (`+1`/`0`/`-1`, `puntoMicroEvento()` in
`engine.js`): fisso, deciso dall'autore, mai a caso. La stessa risposta vale
sempre lo stesso punto, a ogni partita e per ogni giocatore — non c'e' nessun
rimescolamento a runtime.

Il giro e': narrazione dell'evento → un tocco → Susan dalla regia, con le tre
risposte sotto → la conseguenza, sempre detta da Susan.

**Il giocatore non deve mai vedere il valore.** Niente numeri, badge, popup,
"bonus" o "malus": l'unico ritorno e' come Susan racconta com'e' andata. `npm
test` controlla che ogni evento abbia esattamente un `+3`, uno `0` e un `-3` in
banca, che le etichette e i pool non contengano cifre, e che il punto salvato
sia sempre quello dell'editoriale scelto — mai un altro, mai diverso fra un
giro e l'altro.

### S6: il recap e l'invio

Lo step `recap` mostra tutte le risposte date, per macroargomento, ognuna ancora
toccabile: toccarla riapre la domanda originale con le stesse opzioni. Le
facoltative saltate compaiono come righe vuote e si possono giocare adesso — se
il pescaggio non era stato fatto, si fa ora.

Il punteggio **non e' accumulato ma derivato** dalle risposte: qui si possono
cambiare, e un contatore accumulato andrebbe fuori sincrono alla prima
correzione.

Il bottone rosso conferma le previsioni: `run.locked = true`, e da quel momento la
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

La partita **non parte subito**: al momento della conferma finisce in coda in
`localStorage`, e la spedisce la schermata dell'email che arriva un attimo dopo
(vedi S7). Cosi' quello che arriva al server e' una riga sola, con dentro
l'email se il giocatore l'ha lasciata.

Il blocco e' locale e irreversibile, quindi se l'invio fallisce — rete assente,
chiave non ancora configurata, o il giocatore che chiude il gioco sulla
schermata dell'email — la partita **resta in coda** e si riprova da sola al
prossimo avvio, invece di perdersi.

### S7: l'email, i titoli di coda, il countdown

Fra la conferma delle previsioni e i titoli di coda c'e' una schermata sola:
l'email. E' **facoltativa** — si continua a campo vuoto, o con "Preferisco
spezzare loro il cuore" — e serve solo a mandare i risultati finali quando ci
saranno. Se c'e', viaggia con la partita (colonna `email` in `docs/backend.sql`:
su una tabella creata prima va aggiunta, altrimenti l'invio viene rifiutato).
Quello che il regolamento elenca fra i dati raccolti deve restare uguale al
payload: se cambia uno, cambia l'altro.

Dopo i titoli di coda arriva un cartello — "Hai completato una fase, non
l'intera esperienza" — e al tocco si torna **in lobby**, non al countdown: li'
Francesca si congratula, indirizza a Peter e la lobby prosegue in modalita'
post-previsioni (`post_lobby_visto` fa si' che la sequenza si veda una volta
sola). Al countdown ci si arriva dopo il quiz.

### Il countdown e la card

`meta.keynote` e' la data e ora verso cui conta il countdown (ISO, con fuso).
E' l'unica riga da cambiare se Apple sposta l'evento; senza una data valida
`npm test` si ferma, perche' un countdown senza traguardo non conta niente.

Chi riapre il gioco con le previsioni gia' confermate **non trova "riprendi"**:
torna qui, perche' non c'e' piu' storia da rigiocare. Da qui si va in lobby, e
la zona 4 e' ormai aperta.

La card si compone su una `canvas` — figura dello stile, nome, store, punteggio
— e si mostra come immagine. Su iPhone il salvataggio vero e' **tenere premuto**
sull'immagine: il tocco su un link di download li' apre solo una scheda. Il link
resta per chi gioca da computer.

### S8: il quiz di Peter

Tre file di dati, non due: oltre a `story.json` e `domande.json` il motore
riceve **`game/quiz.json`** (`VN.quiz`). Chi aggiunge un boot in un test deve
passare anche `quiz`, altrimenti gli step di S8 non fanno niente e passano in
silenzio — come gia' succede con `banca`.

```
quiz            [S8.01] Peter + [S8.HUB] la griglia dei tre livelli
  -> quiz_livello   [S8.LOOP] un livello, poi "next" riporta alla griglia
  -> moltiplicatori [S8.FINALE] la distribuzione, poi il countdown
```

`quiz.json` porta i tre livelli (`domande`, `soglia`, `mult1`, `mult2`), il
timer (`timer_s`, `timer_s_ingegnere`), il tetto dei moltiplicatori
(`tetto_mult`) e **due pool per livello**: chi fallisce trova domande diverse al
secondo tentativo, cosi' sbagliare apposta per memorizzarle non serve.

Lo stato del quiz vive in `VN.state.quiz[livello]`
(`passato`, `tentativi`, `pool`, `seconda`, `vinto`) e quindi entra nel
salvataggio: il quiz si gioca nei giorni fra il lock e il keynote, non in una
sessione sola. Quello che si vince si accumula in `VN.state.mult_bank`, e in
`[S8.FINALE]` diventa `VN.state.moltiplicatori`.

Il quiz e' solo il quiz: Apple Campus Run non e' piu' legata a Peter e non
compare in questa griglia — vedi S9 qui sotto per dove si raggiunge davvero.

I quattro perk di `story.stili` cadono tutti qui:

| perk | stile | effetto |
|---|---|---|
| `tutto_sbloccato` | showman | i tre livelli aperti da subito, ordine libero |
| `tempo` | ingegnere | `timer_s_ingegnere` al posto di `timer_s` |
| `cinquanta` | drip | un 50:50 per livello, sotto le risposte |
| `seconda_chance` | hawaiano | il primo fallimento di ogni livello non consuma il tentativo |

**Il quiz e' l'eccezione dichiarata alla regola d'oro di S5.** Li' la reazione
della platea non correla mai con la risposta, perche' i pronostici sono opinioni
sul futuro. Qui le risposte sono verificabili, quindi Peter annuisce o scuote la
testa — ed e' giusto cosi'.

**Il tentativo si paga entrando, non uscendo**: appena si entra in un livello
viene contato e salvato. Contarlo a fine livello — com'era all'inizio — lo
rendeva aggirabile: chi vedeva che stava andando male chiudeva l'app e se lo
ritrovava intatto. L'unico che ne recupera uno e' l'hawaiano, col suo perk.

Peter va mostrato a `height 44%` **e `bottom 34%`**: e' un primo piano di un uomo
seduto a un tavolino, e alla misura standard finisce quasi tutto dietro al box
del dialogo, che e' alto cinque righe fisse.

Il timer parte **quando la domanda compare**, non quando finisce di scriversi:
per questo il testo di una domanda non passa dal typewriter. Sotto i tre secondi
la barra diventa rossa e Peter guarda l'orologio.

`[S8.FINALE]` si apre solo nelle **24 ore prima di `meta.keynote`**: prima la
voce si vede nella griglia — cosi' si sa che esiste — ma non si tocca. La
conferma e' irreversibile come il lock di S6, e come quello fa partire un invio
al server.

### S9: Apple Campus Run

Il minigioco **non e' una scena e non e' dentro il motore**: e' una pagina a se'
(`game/runner/index.html`, una sola, con dentro il suo canvas e la sua logica) e
il gioco la apre in un riquadro sopra quello che c'e' — come il regolamento e i
quadri della Hall of Fame. Chiudendola il giocatore e' esattamente dov'era, e la
storia non si e' mossa di un passo.

**Non e' una sfida di Peter e non ha niente a che fare con il quiz.** E'
un'attivita' indipendente che si scopre da soli: una porta **STAFF ONLY**, zona
5 dell'hub della lobby (`game/story.json`, scena `lobby`, `t: hub`), visibile
fin dall'inizio ma respinge (fondale `staff_door_locked`, dialogo di Francesca)
finche' le previsioni non sono confermate (`run.locked`). Dopo il lock la stessa
zona mostra il fondale `staff_door_authorized`: il tocco sposta il fondale sul
corridoio (`campus_run_corridor`) e apre subito la corsa sopra — l'hotspot porta
un campo `corsa` (`label`/`esci`), lo stesso oggetto che prima stava dentro lo
step `quizhub`. Non esiste nessun'altra via: ne' la griglia di Peter [S8.HUB] ne'
il countdown [S7.05] offrono piu' un bottone diretto — un secondo accesso
scavalcherebbe la porta, che e' apposta l'unico punto narrativo del gioco.

Le due pagine si parlano con dei messaggi (`postMessage`), e nessuna delle due
sa niente dell'altra oltre a questo:

```
corsa -> gioco    pronto   sono in piedi
                  fine     partita finita (punti, record)
                  esci     il giocatore ha toccato il bottone d'uscita
gioco -> corsa    apri     con il nome del posto da cui l'ha aperta
```

Il nome arriva da fuori perche' il gioco lo sa e la corsa no: e' quello che
finisce sul bottone d'uscita ("Torna da Peter", "Torna al countdown"). Aprendo
`game/runner/` da soli quel bottone non compare proprio — non ci sarebbe niente
dietro. `#runchiudi`, nel gioco grande, e' solo la via di sicurezza: compare
dopo sei secondi se la pagina non ha dato segni di vita.

**Il record entra nel salvataggio** (`VN.state.runner_record`) ma **non nei punti
delle previsioni**: come le due cose si sommano e' una decisione ancora aperta.

La prospettiva del corridoio e' **misurata a mano**, non calcolata: i due bordi
della pista sono due tabelle di coppie `[y, x]` tracciate su
`assets/in_app_game/run_corridoio_base.webp` con `tools/taratura_pista.html`.
Se un giorno cambia il fondale si rifa' la taratura e si sostituiscono quelle
due tabelle — non c'e' altro da toccare.

Un file grafico che manca **non rompe niente**: al suo posto la corsa disegna un
segnaposto e va avanti (`run_traguardo` e' proprio in quel caso).

**`npm run corsa`** gioca una partita intera in un browser vero — apre la corsa
dalla porta STAFF ONLY, prende una botta, recupera un cuore, passa un traguardo,
apre il menu, muore, riparte ed esce — e controlla che ogni comando risponda.
Serve perche' `npm test` gira in jsdom: non disegna, non anima e non clicca,
quindi tutto quello che si rompe dentro la corsa si rompe in silenzio. Va
lanciato con `npm run serve` attivo in un altro terminale. Due difetti li ha
gia' trovati: un "annulla" scollegato che lasciava il giocatore chiuso nella
conferma d'uscita, e la classifica che si apriva sotto il menu, che le mangiava
i tocchi.

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
motore disegna un ripiego al posto loro. Al momento e' vuoto: non c'e' arte in
attesa.

## Formato e layout

### Il font sta nel repo, non su Google Fonts

`assets/font/press-start-2p.woff2` (SIL OFL, licenza in `assets/font/OFL.txt`).

Non e' una preferenza: la richiesta a Google Fonts puo' fallire, e quando
fallisce il browser ripiega su un monospace di sistema **largo circa la meta'**
(0.6em per carattere contro 1em). La stessa frase passa da cinque righe a tre e
tutte le misure dell'interfaccia diventano bugie. E' successo davvero: il box
del dialogo era stato tarato su un ambiente dove Google Fonts non rispondeva, e
sui telefoni veri il testo spariva sotto il bordo. Con il file nel repo il
ripiego non esiste piu' — e il gioco funziona anche offline e nella build in
file unico.

**Si possono usare solo i caratteri che il font sa disegnare.** Press Start 2P
ha un repertorio limitato. Un carattere che non ha non fa sparire il testo: il
browser ripiega su un altro font *solo per quel carattere*, e a schermo esce una
lettera di famiglia diversa in mezzo alla frase. `npm test` lo rifiuta e dice
quale carattere e' e dove sta; l'elenco dei caratteri buoni e' in
`game/glifi.json`, rigenerabile con `python3 tools/glifi_font.py` se si cambia
font. Le lettere accentate italiane (a, e, i, o, u con accento) ci sono tutte.

**Chi misura qualcosa che dipende dal testo deve aspettare `document.fonts.ready`.**
Il terminale del Mac e il nome sul badge lo fanno: rimisurano quando il font e'
pronto, perche' la prima misura arriva quasi sempre prima.

### Il box del dialogo: due righe di base, cresce solo quando serve

Cinque righe fisse coprivano il personaggio anche quando la battuta ne occupava
una: 371 battute su 595 stanno in una o due righe, quindi per il 62% del gioco
c'erano tre righe di scatolone vuoto davanti a Lucas. Adesso il box parte da due
righe e cresce fino a cinque solo se la battuta le richiede.

**Il salto mentre si scrive non torna** — era il difetto di partenza. `type()`
misura la frase intera *prima* di cominciare e fissa subito l'altezza definitiva
(`riservaAltezza()`): il box non si muove mai durante una battuta, cambia solo
fra una battuta e l'altra, e per due volte su tre nemmeno quello.

**Niente scorrimento del testo.** Era stato proposto di bloccare il box a due
righe e far scorrere: con 425 battute su 595 che occupano tre righe o piu',
vorrebbe dire far scorrere il 71% dei dialoghi, e una battuta che si legge solo
scorrendo e' una battuta che qualcuno non legge.

### Le scelte vanno su due colonne quando ci stanno

Anche con due sole voci. Una colonna sola sprecava meta' larghezza e allungava
il blocco verso l'alto, coprendo il personaggio: "Maschile / Femminile"
occupavano due righe per due parole. Il limite e' la larghezza, non il numero di
voci — mezza riga tiene ~16 caratteri col font vero. Le frasi lunghe (le risposte
a Susan, i pronostici) restano una per riga, dove hanno spazio per andare a capo
invece di essere spezzate in una colonnina.

### Il tetto delle cinque righe

Cinque e' il massimo che il box arriva a mostrare, ed e' il massimo che serve davvero: misurate nel browser, **col font vero**,
tutte le 595 battute del gioco (dialoghi, opzioni, domande di pronostico e
quiz), ne vengono 170 da una riga, 201 da due, 120 da tre, 82 da quattro e 22 da
cinque. Cinque righe occupano il 18% dello schermo sull'iPhone piu' piccolo,
quindi non serve rimpicciolire il testo per farcele stare.

**Una battuta piu' lunga di cinque righe non manda a capo il box: sparisce sotto
`overflow:hidden`.** E' un difetto che non si vede finche' qualcuno non gioca
proprio quella scena, quindi `npm test` lo rifiuta e dice quale battuta
accorciare. Il conto e' a caratteri (34 per riga, misurati 36 e tenuti stretti
per margine) e non a pixel: il corpo del testo e' in `vw` e il box e' una
percentuale della larghezza, quindi i caratteri per riga restano gli stessi su
qualunque telefono — verificato identici su iPhone SE, 13 e 14 Pro Max.

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

Tutte le scene dello script master v4.0, da S0 a S8, sono scritte e giocabili:
registrazione, lobby a zone, l'aggancio, il camerino con i quattro stili, il
dietro le quinte, il keynote con i tre macroargomenti, il teleprompter con la
conferma delle previsioni, i titoli di coda con l'email facoltativa, il ritorno
in lobby e il quiz di Peter con i moltiplicatori e il countdown.

I sei layer della platea (`platea/pla_*`) **non si fanno**: allungherebbero il
gioco fra una scelta e l'altra. Restano dichiarati in `story.json` — il motore
saprebbe mostrarli — ma non sono piu' in lavorazione, e senza di loro la scena
va avanti uguale.

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
| `chr_` | `assets/chars/` | NPC (Lucas, Francesca, Peter, Susan) e l'icona della regia |
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

python3 tools/togli_bianchi.py --bordi --prova assets/stili/*.webp   # i puntini sul contorno
python3 tools/togli_bianchi.py --bordi assets/stili/*.webp
```

`--bordi` e' la seconda passata, per un difetto diverso: non le toppe grandi ma
i **puntini e i filetti** di fondo rimasti fra le ciocche dei capelli e lungo il
profilo delle gambe. Li' il colore non basta a decidere — sono spesso sotto la
soglia del bianco pieno — quindi il criterio e' **cosa hanno intorno**: un pixel
chiaro e scialbo, con disegno scuro attorno, a meno di cinque pixel dalla
trasparenza. Cosi' i jeans e le scarpe bianche della Drip, la camicia dello
Showman, i denti e i riflessi negli occhi restano dove sono: sono chiari ma
hanno intorno altro chiaro, o stanno in mezzo al disegno e non sul bordo.

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
