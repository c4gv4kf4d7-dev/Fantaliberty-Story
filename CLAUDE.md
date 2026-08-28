# FantaLiberty — Nexus

Visual novel per il Keynote WWDC. Sito statico (HTML/CSS/JS vanilla), gira su
GitHub Pages. Il repo si chiamava `Fantaliberty-WWDC-26`, ora `Fantaliberty-Story`
(GitHub reindirizza da solo, i vecchi link continuano a funzionare).

Leggi `README.md` per la struttura del progetto, come si scrive una scena in
`game/story.json`, il formato degli step, il salvataggio, tutto ciò che è
comandi/sviluppo. Questo file copre le **decisioni prese in questa
collaborazione** e le **cose lasciate a metà di proposito** — cosa che il
README, essendo documentazione stabile, non è il posto giusto per registrare.

## Workflow con l'utente

**Le PR le apro io e le mergio io.** L'utente ha dato autorizzazione
esplicita e durevole ("mergia sempre tu tutte le PR") — non chiedere
conferma per il merge di una PR aperta in questa collaborazione. Resta
comunque buona norma: aprire la PR con una descrizione onesta di cosa
cambia e perché, verificare `npm test` verde prima di mergiare, non forzare
mai push su `main`.

L'utente non è uno sviluppatore. Non conosce Git, il Terminale, la
differenza fra sorgente e file convertito. Le spiegazioni tecniche vanno
tradotte in passi concreti e verificabili ("clicca qui", "incollami
l'output"), non in gergo. Non dare per scontato che un passaggio precedente
sia stato fatto — verificarlo prima di costruirci sopra (è successo più
volte che una PR restasse mergiata solo a metà, o che un comando venisse
lanciato dalla cartella sbagliata).

## Pipeline degli asset

Il flusso è: PNG pesante (1-6 MB) → `tools/prepara_asset.py` → WebP in
`assets/`. Non committare mai un PNG grezzo da 1-6 MB — con ~100 file per un
personaggio o una scena, la storia di Git esplode (è già successo: 19 MB di
`_originali/` rimasti nel repo, poi rimossi).

- `_sorgenti/` — cartella per i PNG grezzi, **nel `.gitignore`**: ci si mette
  dentro senza rischio di committarli per sbaglio.
- `tools/prepara_asset.py` — converte, deduce la cartella di destinazione dal
  prefisso del nome (`bg_`, `chr_`, `stile_`, `prop_`/`obj_`, `pla_`, `fx_`,
  `avt_`), salta le tavole di riferimento (`*_model_sheet`).
- `tools/taglia_sheet.py` — per i file consegnati come sprite sheet (più pose
  in un'unica immagine): li taglia in pezzi separati *prima* della
  conversione.
- `tools/rimuovi_sfondo.py` — scontorna lo sfondo che **tocca i bordi**
  dell'immagine (riempimento dai bordi).
- `tools/togli_scacchiera.py` — le toppe di quadretti **chiuse dentro** il
  disegno (fra le braccia alzate, fra braccio e fianco). Sono il caso che
  `rimuovi_sfondo.py` non può raggiungere per costruzione: dal bordo non ci si
  arriva, e `binary_fill_holes` le considera apposta parte del soggetto —
  è la stessa regola che salva denti e riflessi.

**Gli strumenti di pulizia vanno verificati a occhio prima di lanciarli.** La
prima versione di `togli_scacchiera.py` segnalava 12 file: fra questi i capelli
bianchi di Peter e l'arco del lucchetto, che avrebbe cancellato. Riconosceva le
scacchiere dal fatto che chiaro e scuro si alternassero — e i capelli alternano
a ogni pixel. Il criterio giusto è il **lato del quadretto**: strisce tutte
lunghe uguali, ~22 px, con due tinte piatte. Da 12 file si è passati a 2, quelli
veri. Il modo per accorgersene è stato comporre le zone candidate in magenta e
guardarle, non leggere i numeri.
- `tools/togli_bianchi.py` — stesso caso, ma quando il fondo consegnato era
  **bianco pieno** invece che a scacchiera: `togli_scacchiera.py` non lo vede,
  perche' cerca una griglia. E' il difetto dei quattro stili (puntini fra le
  ciocche dei capelli, chiazze nell'occhiello fra braccio e busto). Toglie solo
  il bianco quasi puro e neutro, cosi' canottiera, camicia, scarpe e denti —
  che sono avorio o ombreggiati — restano. **Non va lanciato su tutto
  `assets/`**: sul lucchetto della zona 4 e sul logo dello studio il bianco e'
  il disegno, e li' cancellerebbe il soggetto.
- `tools/optimize_assets.py` — ricomprime *sul posto* file già dentro
  `assets/`, per la build single-file. Diverso scopo, non confonderlo con
  `prepara_asset.py`.

`docs/manifest-asset.md` è il documento di riferimento per **quale file
corrisponde a quale elemento del gioco**, in che scena appare, con che
meccanica va gestito. Consultalo prima di collegare un asset nuovo a
`story.json` — dice se è un layer, uno sprite sheet da tagliare, un
template con overlay dinamico, ecc.

## Personaggi: il pattern "segnaposto vs sprite reale"

`game/story.json` è nato prima del manifest asset attuale (v3.0). Il cast
originale (`maurice`, `susan`, `veterano`, `martha`, `premi`) era scritto per
uno schema **corpo+testa separati** (`chars/chr_X_corpo_Y@3x.webp` +
`chars/chr_X_testa_Z@3x.webp`) che non è mai stato disegnato. Il manifest
attuale consegna invece **uno sprite intero per posa**, senza head/neck —
lo stesso pattern già usato per `lucas`.

Quando un personaggio del cast risulta "da disegnare" in `npm test`, **prima
di assumere che manchi davvero l'arte**, controlla se esiste già sotto il
nome che il manifest usa:

```bash
git ls-tree -r origin/main --name-only | grep "^assets/chars/"
```

È già successo due volte: `maurice` (segnaposto, mai disegnato) aveva gli
sprite veri fermi sotto il nome `francesca`; `veterano` (segnaposto) aveva
gli sprite veri sotto `peter`. In entrambi i casi la soluzione non è stata
"disegnare gli asset mancanti" ma **rinominare il cast e ricollegare le
scene** al nome giusto.

### Stato attuale del cast (dopo la rimappatura)

| cast key | manifest | stato |
|---|---|---|
| `lucas` | Lucas | 2 pose collegate (`neutro`, `felice`, i nomi del prototipo). Il manifest ne descrive altre 3 già consegnate e **non ancora collegate**: `chr_lucas_idle`, `chr_lucas_indica_terminale` (più `chr_lucas_saluto`, `chr_lucas_pollice_su`, `chr_lucas_divertito`, mai disegnate) |
| `francesca` | Francesca | 7 pose, tutte collegate |
| `susan` | Susan | 12 pose collegate, comprese le 4 `commento_*` (ordine confermato dall'utente: 1 drip, 2 hawaiano, 3 showman, 4 ingegnere), usate in S3 |
| `peter` (ex `veterano`) | Peter | 6 pose, tutte collegate. Lo stato *dorme finché `locked` è falso, si sveglia dopo* **è modellato nella lobby** (zona 4, due varianti con `when`); le altre quattro pose (`annuisce`, `scuote_testa`, `guarda_orologio`, `applauso_ironico`) sono il quiz di S8. Tutte a `height 44%` **e `bottom 34%`**: è seduto a un tavolino in primo piano, non è una figura intera, e con il box del dialogo alto cinque righe alla misura standard gli resta fuori solo un braccio |
| ~~`martha`~~ | — | **Eliminata su richiesta dell'utente.** Il ruolo della regia è passato a Susan, riscrivendo le battute sulla sua caratterizzazione — non con un search/replace. L'icona dell'auricolare era generica ed è stata rinominata `chr_indicatore_regia_*`: ora è di Susan. `chr_martha_ritratto_regia` è rimasto nel repo ma non lo usa più nessuno (segnalato da `npm test`) |
| ~~`premi`~~ | — | **Eliminato.** Non è mai esistito un NPC "Premi" nel manifest, e da quando la zona 3 è il regolamento non esiste più nemmeno la sezione: `chr_francesca_orgogliosa` non è più collegata da nessuna scena (resta nel repo, potrebbe servire altrove) |

## Lo script master v4.0 e i due strati del lavoro

`docs/script-master.md` è il **documento unico di riferimento**: scene S0B→S8,
dialoghi, tutte le domande, il quiz, le formule di punteggio. Sostituisce ogni
versione precedente dello script. Quando l'utente chiede una modifica al gioco,
si aggiorna **solo il nodo interessato** (gli id tipo `[S2.01]`, `IPHONE.C1`),
non l'intero documento.

Il lavoro di aderire allo script si divide in due strati ben distinti:

**Strato contenuti — fatto.** `game/domande.json` (29 domande di pronostico,
79 opzioni, 316 battute: una per opzione per ciascuno dei 4 stili) e
`game/quiz.json` (44 domande su due pool per livello). Sono validati da
`npm test`: i punteggi delle core vengono **ricalcolati** da difficoltà + tipo
e confrontati con quelli scritti, quindi un errore di trascrizione non passa.
`npm run indice` rigenera `docs/indice-domande.md` dai dati veri.

**Strato meccaniche — fatto anche questo.** Il motore partiva sapendo fare solo
scene lineari (`say`/`choice`/`input`/`show`/`bg`). Lo script ne chiedeva molte
altre, costruite una alla volta insieme alla scena che le usa:

| serve | per |
|---|---|
| ~~hub a 4 zone con swipe + dot~~ — **fatto**: step `hub`, vedi README | `[S1.HUB]` lobby |
| ~~carosello stile con descrizione, perk e conferma irreversibile~~ — **fatto**: step `carosello` | `[S3.02]` |
| ~~griglia 3 macroargomenti con stati~~ — **fatto**: step `griglia` | `[S5.HUB]` |
| ~~pescaggio casuale di 3 facoltative **al bivio**~~ — **fatto**: step `bivio` | `[S5.BIVIO]` |
| ~~battuta risolta per (stile × opzione scelta)~~ — **fatto**: step `domande` | tutta `[S5]` |
| ~~recap modificabile + lock irreversibile~~ — **fatto**: step `recap` | `[S6]` |
| ~~timer per domanda, livelli, due pool, perk per stile~~ — **fatto**: step `quizhub`/`quizlivello` | `[S8]` |
| ~~countdown persistente~~ — **fatto**: step `countdown` | `[S7.05]` |
| ~~punteggio, `run.locked`, POST al backend, moltiplicatori~~ — **fatto** | trasversale |

**Lo strato meccaniche è finito.** Non restano step da costruire: quello che
manca è arte (i sei layer della platea) e le due cose da chiedere all'utente,
qui sotto.

### Domande aperte sullo script (non decise da solo)

- **Il terminale dice "campo 1/7"…"6/7" ma i campi elencati sono 6.** O ne
  manca uno o l'etichetta è sbagliata: non inventato, va chiesto.
- ~~**Il genere**~~ — **deciso dall'utente: due opzioni, come da script.**
  `meta.genderOrder` è `["m","f"]`, l'opzione Neutro non c'è più e tutti i
  `{g:...}` hanno due varianti. `npm test` controlla che il numero di varianti
  combaci con `genderOrder`, così una terza reintrodotta per sbaglio non passa.
- **Le fasce di anzianità** sono state allineate allo script (0-1 / 2-3 / 4-7 /
  8+) e le due battute di Lucas che citavano i vecchi valori ("Cinque, dieci
  anni…", "Più di dieci anni") sono state adattate di conseguenza.

## Come è stata costruita la struttura delle scene

`story.json` partiva con 10 scene dai nomi "Atto 1-4" (`registrazione`,
`ritardo_ceo`, `lobby`, `backstage`, `quiz`, `premi`, `finale`...), molto più
grezze dello script di produzione. Oggi la struttura è quella dello script,
**S0 → S8**, scena per scena.

**È stato fatto una scena alla volta.** L'utente ha chiesto esplicitamente
di procedere *scena per scena, dialoghi e meccaniche insieme*, non tutti i
dialoghi prima e le meccaniche poi, e di **non tagliare niente** dallo script
("non togliere i micro eventi perché c'è assolutamente tempo visto che siamo
in due"). I giocatori partono il **2 settembre 2026**.

Ordine dei lavori e stato:

| scena | stato |
|---|---|
| S0 registrazione | fatto (genere a 2, fasce anzianità, lista iPhone, badge) |
| **S1 lobby** | **fatto**: hub a 4 zone con swipe, hotspot, zona 4 condizionata a `locked` |
| **S2 l'aggancio** | **fatto**: scena `aggancio`, con il sipario della tenda e la carrellata di discesa |
| **S3 camerino** | **fatto**: carosello dei 4 stili e conferma irreversibile, commento di Susan per stile. Rifatto a livello visivo (vedi sotto) |
| **S4 dietro le quinte** | **fatto**: il giocatore entra in scena (step `io`), il sipario del palco riusa lo step di S2, Susan passa in regia e da lì in poi parla in cuffia |
| **S5 keynote** | **fatto**: griglia a 3 macroargomenti, core in sequenza, bivio che pesca 3 facoltative, battuta per stile, micro-eventi ed evento personale, intermezzi, punteggio |
| **S6 teleprompter** | **fatto**: recap modificabile, blocco irreversibile, invio a Supabase (chiave anon configurata e verificata dal vivo) |
| **S7 finale** | **fatto**: la porta a tre fotogrammi, il countdown persistente, la card da salvare |
| **S8 quiz** | **fatto**: griglia dei tre livelli, domande a tempo, i quattro perk, i due pool per tentativo, i moltiplicatori con distribuzione irreversibile |

Il motore ora riceve **tre** file: `story.json` (`VN.story`), `domande.json`
(`VN.banca`) e `quiz.json` (`VN.quiz`). Chi aggiunge un boot in un test deve
passare `banca` **e** `quiz`, altrimenti gli step di S5 e S8 non fanno niente e
passano in silenzio.

Il punteggio e le risposte vivono in `VN.state.punti` e `VN.state.picks`
(`picks[categoria][core|extra][ID] = {v, p}`). È da lì che S6 costruisce il
recap e da lì che parte l'invio a Supabase. Il totale si **ricalcola** dalle
risposte (`totale()`), non si accumula: in S6 le risposte si possono cambiare, e
un contatore accumulato andrebbe fuori sincrono alla prima correzione.

Il quiz di S8 tiene il suo stato a parte, in `VN.state.quiz[livello]` +
`VN.state.mult_bank` + `VN.state.moltiplicatori`: non sono punti, sono
moltiplicatori da spalmare sui pronostici già chiusi.

I quattro stili vivono in **`story.stili`**, non dentro la scena: nome,
descrizione, perk e le 11 pose di ciascuno. È la stessa tabella che serviranno
S5 (`idle_palco`, `annuncio`, `indica_schermo`, `imbarazzo`, `evento`, le 4
espressioni) e S8 (i perk). Quando si costruisce S5, si legge da lì.

L'ordine delle scene in `story.json` è già stato corretto: `badge` → `lobby`
(S1) → `aggancio` (S2). Prima la lobby veniva dopo l'incontro con Susan, al
contrario dello script. La vecchia `ritardo_ceo` **non esiste più**: era la
bozza di S2 ed è stata assorbita, non affiancata.

Attenzione ai nomi: lo script master chiama `bg_sala_ingresso_superiore` il
fondale di S2, che è stato consegnato come **`bg_sala_teatro`** — è lo stesso
file. Stessa cosa dei personaggi (`maurice`→`francesca`, `veterano`→`peter`):
prima di dichiarare mancante un asset del manifest, cerca se esiste sotto un
altro nome.

Le correzioni precedenti erano invece mirate: ricollegare sprite reali a scene
placeholder, sistemare riferimenti rotti. Non mescolare i due tipi di lavoro
nella stessa PR.

## Il camerino (S3): cosa regge la sezione

L'utente l'ha bocciata alla prima versione ("non si capisce niente"). Le tre
cose che l'hanno rimessa in piedi, da non annullare per sbaglio:

1. **il fondale va fuori fuoco.** `#bg.sfoca` — blur e luce abbassata, messo
   all'apertura del carosello e tolto alla chiusura. A fuoco pieno,
   appendiabiti e lampadine dello specchio passavano davanti alla figura;
2. **la figura non porta `image-rendering:pixelated`.** Gli stili sono disegni
   da 1024 px rimpiccioliti a ~400: a pixel duri il ridimensionamento e' un
   nearest-neighbour e il contorno si sgrana. Il resto del gioco resta
   pixelato, `#carImg` no — e' l'eccezione, non una svista;
3. **niente meccaniche sulla scheda.** Il perk del quiz e' stato tolto: si
   spiega a S8. Il dato resta in `story.stili`, e il carosello lo rimostra solo
   se lo step chiede `etichettaPerk` (S3 non lo chiede). Sotto la figura ci
   stanno soltanto pallini, nome, una riga di descrizione e "Sono io".

Attenzione al piano dei layer: `#carosello` copre tutto lo schermo ma sta a
`z-index:1`, **sotto** `#boxwrap` (2). Alzandolo, il velo copre la scheda e il
bottone "Sono io" non si preme piu' — succede in silenzio, il test in jsdom non
se ne accorge.

I quattro sprite avevano **residui di sfondo bianco chiusi dentro il disegno**
(puntini fra le ciocche dei capelli, una chiazza fra braccio e busto): a schermo,
sul fondale scuro, si leggevano come sporco. Ripuliti con `tools/togli_bianchi.py`
su tutto `assets/stili/`, non solo sulle pose del camerino — lo stesso difetto si
vedeva sul palco.

## Animazioni CSS: due classi sullo stesso nodo si combattono

Successo due volte in due giorni, con lo stesso sintomo — **il personaggio
sparisce, con lo sprite giusto caricato**:

- lo scorrimento dell'hub metteva la sua animazione anche su `#npc`, e quella
  vinceva su `#npc.in` (stessa proprietà `animation`, regola più in basso nel
  CSS). Non essendo `forwards`, a fine corsa il nodo tornava a `opacity:0`;
- la classe `micro` della reazione restava addosso dopo l'animazione e faceva
  esattamente lo stesso al personaggio mostrato subito dopo.

Regola: **`#npc` porta una sola animazione alla volta.** Le classi di reazione
si tolgono da sole quando finiscono, e `showChar()` le ripulisce comunque.
Chi aggiunge un'animazione nuova su `#npc` la mette `forwards` **e** controlla
chi altro scrive `animation` su quel nodo.

`npm test` gira in jsdom, che non calcola le animazioni: questi bug **non li
prende**. Si vedono solo negli screenshot. I test che li presidiano fissano
l'invariante ("il fondale scorre, il personaggio no"; "la classe micro non resta
addosso"), non l'effetto visivo.

## Chi c'è in scena e chi parla soltanto

L'inquadratura ha due posti fissi: **il giocatore a sinistra** (`#avatar`, step
`io`, sprite dello stile scelto in S3) e **gli NPC a destra** (`#npc`, step
`show`). Da S4 in poi i due condividono la scena, e per questo il vecchio
carosello degli avatar componibili è stato **eliminato**: era l'unico altro
pezzo di codice che scriveva su `#avatar`, e due sistemi sullo stesso nodo si
sarebbero pestati i piedi come già successo con le animazioni.

Chi parla dalla regia non ha uno sprite in scena: l'icona dell'auricolare
lampeggia accanto al nome e il box cambia colore. Si chiede in due modi, e la
differenza conta: un personaggio che esiste **solo** come voce lo dichiara nel
cast (`voce: true`), mentre **Susan è un personaggio vero** — in S2, S3 e S7 è lì
davanti — quindi per lei la cuffia la chiede il **singolo step** con
`"incuffia": true`. Metterle `voce: true` la cancellerebbe dalle scene in cui
deve esserci.

## Non tutti gli sprite si mostrano alla stessa misura

`#npc` è tarato su una **figura intera** (56% di altezza). Diversi asset
consegnati non lo sono, e alla misura standard sbagliano di parecchio:

- le `chr_susan_commento_stile_*` sono **ritagli di sola testa** dal foglio a 4
  teste: a schermo pieno diventavano una faccia alta mezzo schermo. Vanno a
  `height 30%`, `bottom 14%`, `right 2%` — un primo piano che entra da destra,
  col taglio delle spalle nascosto dietro il box;
- `chr_peter_occhi_bassi` è **seduto a un tavolo** in primo piano: `height 44%`;
- Susan sul palco in fondo alla sala, in S2, è a `height 9%`.

Regola: prima di collegare uno sprite nuovo, guardare **cosa inquadra** —
figura intera, mezzo busto, testa — e dare al `show` la misura giusta. Il test
non può accorgersene, si vede solo negli screenshot.

## Il quiz di Peter è l'eccezione dichiarata alla regola d'oro

In S5 la reazione della platea non correla **mai** con la risposta: se lo
facesse, il gioco suggerirebbe i pronostici e non varrebbero più niente. In S8
succede il contrario, ed è giusto: le domande sul passato di Apple hanno una
risposta verificabile, quindi Peter annuisce o scuote la testa. Chi tocca S8 non
deve "sistemare" quel feedback per uniformità con S5.

Altre due cose di S8 che sembrano dettagli e non lo sono:

- **il testo di una domanda non passa dal typewriter.** Il timer parte al
  render, quindi scrivere a macchina sarebbe una penalità invisibile;
- **la griglia dei livelli convive con i bottoni delle azioni.** In S5 la
  `griglia` era sola nel box; qui c'è anche `#choices`, e per questo `#griglia`
  sta **prima** nell'HTML e `#boxwrap` prende la classe `quizhub` che stringe il
  box.

## Susan è anche la regia, e non è un personaggio "voce"

Martha è stata eliminata su richiesta dell'utente e il suo ruolo è passato a
Susan, con le battute **riscritte** sulla sua caratterizzazione (responsabile
dell'evento, sotto pressione, ironica come valvola di sfogo, scarica il problema
sul giocatore) — non con un search/replace, che la richiesta vietava.

**Susan non può avere `voce: true` nel cast.** La farebbe sparire da S2, S3 e S7,
dove è in scena davvero. La cuffia è una proprietà del **singolo step**
(`"incuffia": true`). Il test lo presidia nelle due direzioni: gli step della
regia devono chiederla, quelli di S2/S3 no.

Le sue battute durante il keynote stanno in **pool per situazione** dentro
`story.regia` (apertura, introDomanda, scarica, improvvisazione, caos, critica).
I pool situazionali escono solo sui micro-eventi, così non parla dopo ogni
singola scelta.

## Il regolamento (zona 3) contiene anche la parte legale

Privacy, indipendenza da Apple, marchi e contatti **non** hanno una voce di menu
propria: stanno dentro il regolamento, sotto un separatore. E nessuna sezione si
chiama "note legali" — quel titolo la richiesta lo vietava esplicitamente.

Tre cose da non rompere:

1. **Non è una scena.** L'hotspot ha `apre`, non `goto`: il pannello si mostra
   sopra la lobby e alla chiusura il giocatore è dov'era, con l'hub aperto.
2. **Leggere non deve toccare la partita.** Il test fotografa `VN.state` prima
   di aprire e lo confronta dopo aver chiuso.
3. **Quello che c'è scritto deve essere vero.** L'elenco dei dati raccolti è
   esattamente il payload che parte per Supabase, e i 30 giorni di conservazione
   sono una promessa che qualcuno deve mantenere a mano: la procedura SQL è in
   fondo a `docs/backend.sql`. Se cambia il payload, cambia anche il testo.

## Errori già fatti (per non ripeterli)

- **Cinque bug di layout e di layer che i test non prendono, tutti visti solo a
  schermo.** Sono lo stesso genere di inciampo e vale la pena conoscerli:
  - `#stage` aveva `overflow:hidden`, che ritaglia ma **lascia un contenitore
    scorribile**: il personaggio sborda a destra, e quando il fuoco finiva su un
    bottone il browser lo portava in vista scorrendo tutta la scena di qualche
    decina di pixel. Ora è `overflow:clip`;
  - un overlay centrato con `display:grid` + `place-items:center` dimensiona la
    riga sul contenuto, quindi il suo `max-height:100%` si misura su se stesso e
    non limita niente. In **flex** l'altezza del genitore è definita e funziona;
  - in una colonna flex i figli si **stringono** prima che il contenitore
    scorra: le sezioni chiuse del regolamento diventavano pillole vuote. Serve
    `flex:none`;
  - `goScene` cercava un `title` fra **tutti** gli step per decidere se tenere
    su il sipario nero: il finale ha i titoli di coda in fondo, quindi tutta la
    sequenza della porta si giocava dietro al nero. Ora conta solo se la scena
    **comincia** su un cartello;
  - `#nero` sta **sopra** `#curtain`: un cartello a schermo pieno che arriva
    dopo una dissolvenza al nero resta coperto, con il testo presente nel DOM e
    lo schermo nero. Ora il cartello toglie il velo entrando.
- **`typeLines` non è una callback di completamento.** Assegna `done` a
  `pending`, cioè "cosa fare al prossimo tocco". Riusarla per una sequenza
  automatica (i titoli di coda) la lasciava ferma al primo blocco: serve il flag
  `subito`.
- **Un tocco su una sequenza automatica deve accelerarla, non cancellarla.** Nei
  titoli di coda la prima versione trattava il tap come "vai via": bastava
  sfiorare lo schermo e i titoli sparivano. L'utente l'ha bocciata subito. Ora un
  tocco mette la sequenza in modalità veloce — i blocchi successivi compaiono
  già scritti e restano meno, ma **compaiono tutti** — e alla fine serve un
  ultimo tocco per andare al countdown, così l'ultima riga si guarda quanto si
  vuole. Verificato nel browser con tre scenari (nessun tocco, un tocco a metà,
  tocchi continui): in tutti e tre i blocchi completati restano cinque. In jsdom
  la sequenza a tempo non gira, quindi il test presidia il contratto sul codice
  e non il comportamento.
- **Le sostituzioni di stringhe lunghe su questo file falliscono in silenzio.**
  Gli apostrofi curvi e gli accenti non combaciano quasi mai al primo colpo, e
  `str.replace` non protesta: un'intera sezione di appunti è andata persa così,
  e nessuno se n'è accorto fino al giro dopo. Dopo ogni modifica a CLAUDE.md,
  ricontrollare con un `grep` che il testo nuovo ci sia davvero.
- **Un'estensione sbagliata rompe `npm test` in silenzio finché qualcuno non
  lancia il test.** Quando una conversione PNG→WebP sostituisce un asset,
  controllare che `story.json` punti alla nuova estensione. Successo con
  `prop_mac_terminale.png`→`.webp` e `chr_lucas_*.png`→`.webp`: `main` è
  rimasta rossa per un po' prima che qualcuno se ne accorgesse.
- **Chiudere una PR draft con dei commit ancora in sospeso.** Se pushi altri
  commit sullo stesso branch dopo che l'utente ha già cliccato Merge, quei
  commit restano fuori da `main` e vanno recuperati con `git rebase` su una
  nuova PR. Controllare `git log --oneline origin/main..HEAD` prima di dare
  per scontato che l'ultimo push sia entrato.
- **`npm test` può contenere asserzioni che documentano uno stato
  temporaneo** (es. "personaggio ancora senza sprite"). Se una modifica lo
  rende vero, il test va aggiornato insieme al codice, non aggirato.
