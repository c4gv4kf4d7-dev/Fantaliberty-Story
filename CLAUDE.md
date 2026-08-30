# FantaLiberty — Story

Visual novel per il Keynote WWDC. Sito statico (HTML/CSS/JS vanilla), gira su
GitHub Pages. Il repo si chiamava `Fantaliberty-WWDC-26`, ora `Fantaliberty-Story`
(GitHub reindirizza da solo, i vecchi link continuano a funzionare).

Leggi `README.md` per la struttura del progetto, come si scrive una scena in
`game/story.json`, il formato degli step, il salvataggio, tutto ciò che è
comandi/sviluppo. Questo file copre le **regole e i tranelli ancora vivi** di
questa collaborazione — cose che un test non vede e che si può tornare a
rompere toccando il codice giusto. Il racconto di *come* ci si è arrivati (le
versioni bocciate, le scene costruite una a una, gli stati intermedi del
cast) è in `docs/storico-decisioni.md`: consultalo solo se serve capire il
perché di una scelta, non è necessario per lavorare tutti i giorni.

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

- `_sorgenti/` — cartella per i PNG grezzi, **nel `.gitignore`**.
- `tools/prepara_asset.py` — converte, deduce la cartella dal prefisso
  (`bg_`, `chr_`, `stile_`, `prop_`/`obj_`, `pla_`, `fx_`, `avt_`), salta le
  tavole di riferimento (`*_model_sheet`).
- `tools/taglia_sheet.py` — taglia gli sprite sheet in pezzi separati
  *prima* della conversione.
- `tools/rimuovi_sfondo.py` — scontorna lo sfondo che **tocca i bordi**.
- `tools/togli_scacchiera.py` — toppe di quadretti **chiuse dentro** il
  disegno (`rimuovi_sfondo.py` non le raggiunge per costruzione). Il
  criterio giusto per riconoscerle è il **lato del quadretto** (strisce
  tutte lunghe uguali, ~22px, due tinte piatte) — non l'alternanza
  chiaro/scuro, che becca anche i capelli. **Verificare sempre a occhio**
  (comporre le zone candidate in magenta) prima di lanciarlo: la prima
  versione avrebbe cancellato i capelli bianchi di Peter e l'arco del
  lucchetto.
- `tools/togli_bianchi.py` — stesso caso ma fondo **bianco pieno** invece
  che a scacchiera. Toglie solo il bianco quasi puro e neutro (canottiera,
  camicia, denti restano). **Non va lanciato su tutto `assets/`**: sul
  lucchetto zona 4 e sul logo studio il bianco è il disegno.
- `tools/optimize_assets.py` — ricomprime *sul posto* file già dentro
  `assets/` per la build single-file. Non confonderlo con `prepara_asset.py`.

`docs/manifest-asset.md` è il riferimento per **quale file corrisponde a
quale elemento del gioco**. Consultalo prima di collegare un asset nuovo a
`story.json`.

## Personaggi: prima di dire che manca l'arte, controlla il nome

Il manifest asset consegna **uno sprite intero per posa**, senza head/neck.
Quando un personaggio del cast risulta "da disegnare" in `npm test`,
**prima di assumere che manchi davvero l'arte**, controlla se esiste già
sotto il nome che il manifest usa:

```bash
git ls-tree -r origin/main --name-only | grep "^assets/chars/"
```

È già successo due volte (dettagli in `docs/storico-decisioni.md`): la
soluzione non è mai stata "disegnare gli asset mancanti" ma **rinominare il
cast e ricollegare le scene** al nome giusto.

## Architettura dei dati di gioco

- Il motore riceve **tre** file: `story.json` (`VN.story`), `domande.json`
  (`VN.banca`) e `quiz.json` (`VN.quiz`). Chi aggiunge un boot in un test
  deve passare `banca` **e** `quiz`, altrimenti gli step di S5/S8 non fanno
  niente e passano in silenzio.
- Punteggio e risposte vivono in `VN.state.punti` e `VN.state.picks`
  (`picks[categoria][core|extra][ID] = {v, p}`). Il totale si **ricalcola**
  da `totale()`, non si accumula: in S6 le risposte si possono cambiare, e
  un contatore accumulato andrebbe fuori sincrono alla prima correzione.
- Il quiz di S8 tiene stato a parte in `VN.state.quiz[livello]` +
  `VN.state.mult_bank` + `VN.state.moltiplicatori`: sono moltiplicatori da
  spalmare sui pronostici già chiusi, non punti.
- I quattro stili vivono in `story.stili` (nome, descrizione, perk, 11
  pose), non dentro la scena — li leggono sia S5 che S8.
- `docs/script-master.md` è il documento unico di riferimento per
  scene/dialoghi/domande/formule di punteggio. Quando l'utente chiede una
  modifica, si aggiorna **solo il nodo interessato** (id tipo `[S2.01]`),
  non l'intero documento.

### Domande aperte sullo script (non decise da solo)

- **Il terminale dice "campo 1/7"…"6/7" ma i campi elencati sono 6.** O ne
  manca uno o l'etichetta è sbagliata: non inventato, va chiesto.

## Il camerino (S3): cosa regge la sezione

L'utente l'ha bocciata alla prima versione ("non si capisce niente"). Tre
cose da non annullare per sbaglio:

1. **il fondale va fuori fuoco.** `#bg.sfoca` — blur e luce abbassata,
   messo all'apertura del carosello e tolto alla chiusura. A fuoco pieno,
   appendiabiti e lampadine dello specchio passavano davanti alla figura;
2. **la figura non porta `image-rendering:pixelated`.** Gli stili sono
   disegni da 1024px rimpiccioliti a ~400: a pixel duri il ridimensionamento
   è un nearest-neighbour e il contorno si sgrana. `#carImg` è l'unica
   eccezione al resto del gioco (pixelato), non una svista;
3. **niente meccaniche sulla scheda.** Il perk del quiz si spiega a S8, non
   qui: il carosello lo rimostra solo se lo step chiede `etichettaPerk` (S3
   non lo chiede).

Attenzione al piano dei layer: `#carosello` sta a `z-index:1`, **sotto**
`#boxwrap` (2). Alzandolo, il bottone "Sono io" smette di essere premibile
in silenzio — il test in jsdom non se ne accorge.

## La lobby si presenta una volta sola

Nell'hub la battuta di una zona vale solo al **primo** passaggio. Tornandoci,
il personaggio esce di scena e il box del dialogo sparisce del tutto: chi ha
gia' fatto il giro deve poter girare in silenzio. L'unica zona con una
battuta di ritorno e' la tenda (`"ritorno"` nella zona di `story.json`), dove
Francesca ricompare dal secondo passaggio per dire che di la' comincia lo
show. Se si aggiunge un `ritorno` a un'altra zona, si torna al vecchio
difetto ("mi rispiega cos'e' la Hall of Fame ogni volta").

Toccare un hotspot in una zona muta fa **rientrare** chi risponde: senza
quello, Francesca parlerebbe fuori campo e sembrerebbe la regia in cuffia.

**Le frecce per cambiare zona (`#hubnav`) stanno dentro `#boxwrap`.** Quindi in
una zona muta non si spegne il contenitore (`in`), che porterebbe via anche
quelle e lascerebbe il giocatore senza comandi visibili: si spegne solo il
fumetto, con la classe `muto`.

## Mai un fotogramma della scena di prima

Un `<img>` a cui si cambia `src` **continua a disegnare l'immagine vecchia**
finche' la nuova non e' decodificata. Da qui nascono tutti gli "intrusi": il
fondale dell'ingresso sotto Francesca, la posa precedente per un fotogramma,
la slide sbagliata dentro il riquadro. Non e' la cache del browser, ed e'
saltuario perche' dipende da quanto ci mette il file ad arrivare.

**Non si assegna `src` a mano su un elemento che si vede.** Ci sono due modi,
e non sono intercambiabili (`engine.js`, sezione "immagini"):

- **`scambia(nodo, src)`** — l'elemento e' gia' a schermo e cambia contenuto
  (posa, espressione, slide, figura del carosello). L'immagine vecchia e'
  ancora quella giusta finche' non arriva la nuova, quindi si tiene: il `src`
  si assegna solo quando l'immagine e' pronta. Nessun buco.
- **`apparira(nodo, src, contenitore)`** — l'elemento deve *comparire*, e
  quello che ha addosso e' roba della scena di prima. Si assegna subito ma
  resta invisibile (`.attesa`) finche' non e' pronta. Nessun intruso.

`showChar()` sceglie da solo fra i due: stesso personaggio gia' in scena =
cambio di posa (`scambia`), altrimenti sta entrando (`apparira`).

Tre regole che reggono il resto:

1. **`img.complete` da solo mente.** Subito dopo aver assegnato un `src`
   nuovo risponde ancora per l'immagine vecchia. La domanda giusta la fa
   `mostrata(img, src)`, che confronta `currentSrc`. Lo stesso vale per il
   precaricamento: **non basta sapere che il precaricatore ha finito**, perche'
   senza header di cache l'`<img>` vero rifa' la richiesta e resta indietro —
   si aspetta sempre l'elemento a schermo.
2. **Niente "dopo tot lo mostro comunque".** Mostrarlo comunque vuol dire
   mostrare l'immagine di prima, cioe' proprio la cosa da non fare. Se un file
   non arriva, l'elemento resta vuoto e la scena va avanti lo stesso. L'unico
   ripiego a tempo e' il fondale: se tarda, la scena **si copre di nero**
   (che e' il linguaggio del gioco) invece di far entrare i personaggi nuovi
   sopra il fondale vecchio.
3. **Anche i tempi sono intrusi.** Uno step che finisce piu' tardi (attesa,
   dissolvenza, transizione) tiene in mano un "poi fai questo": se intanto la
   scena e' cambiata, quel seguito e' della scena di prima e farebbe partire da
   sola quella nuova. Per questo ogni seguito differito passa da
   `perScena(next)`, che lo annulla al cambio di scena.

`precaricaScena()` (la scena nuova, mentre il buio copre) e
`precaricaProssime()` (le scene in cui si puo' finire dopo, mentre si gioca)
servono a far si' che quelle attese, in pratica, siano gia' finite.

`npm test` gira in jsdom e non carica immagini: **questa famiglia di bug non
la vede proprio** (per questo il motore si accorge da solo di essere in jsdom,
`siDecodifica()`, e li' non aspetta nessuno). Il controllo vero e'
`npm run transizioni`: browser vero, asset rallentati apposta, tutte le
transizioni che la storia puo' fare, e conta i fotogrammi in cui si vede
qualcosa che non e' ancora pronto. Si puo' stringere la vite con
`CHARS=4000 BG=4000 npm run transizioni`. Se si tocca una di queste cose,
rilanciarlo.

## Animazioni CSS: due classi sullo stesso nodo si combattono

Regola (violata due volte con lo stesso sintomo — il personaggio sparisce
con lo sprite giusto caricato): **`#npc` porta una sola animazione alla
volta.** Le classi di reazione si tolgono da sole quando finiscono, e
`showChar()` le ripulisce comunque. Chi aggiunge un'animazione nuova su
`#npc` la mette `forwards` **e** controlla chi altro scrive `animation` su
quel nodo.

`npm test` gira in jsdom, che non calcola le animazioni: questi bug **non
li prende**, si vedono solo negli screenshot.

## Chi c'è in scena, chi parla soltanto, e chi è la regia

Due posti fissi: **il giocatore a sinistra** (`#avatar`, step `io`) e **gli
NPC a destra** (`#npc`, step `show`). Non deve esistere un secondo sistema
che scrive su uno dei due nodi (già successo con un vecchio carosello di
avatar componibili, eliminato).

Chi parla dalla regia non ha sprite in scena (icona auricolare + box
colorato). Due modi per dichiararlo, non intercambiabili:
- `voce: true` **nel cast** — personaggio che esiste *solo* come voce;
- `"incuffia": true` **nel singolo step** — per un personaggio che è anche
  fisicamente in scena altrove. **Susan è così**: in S2/S3/S7 è in scena
  davvero, quindi non può avere `voce: true` nel cast (la cancellerebbe da
  lì) — la cuffia la chiede lo step della regia. Le sue battute da regia
  stanno in pool per situazione dentro `story.regia` (apertura,
  introDomanda, scarica, improvvisazione, caos, critica), usate solo sui
  micro-eventi.

## Non tutti gli sprite si mostrano alla stessa misura

`#npc` è tarato su una **figura intera** (56% altezza). Prima di collegare
uno sprite nuovo, guardare **cosa inquadra** — figura intera, mezzo busto,
solo testa — e dare al `show` la misura giusta (es. un primo piano di sola
testa va su `height` piccola con `bottom`/`right` per farlo entrare da un
lato, non a schermo pieno). Il test non se ne accorge, si vede solo negli
screenshot.

## Il quiz di Peter è l'eccezione dichiarata alla regola d'oro

In S5 la reazione della platea non correla **mai** con la risposta (se lo
facesse, il gioco suggerirebbe i pronostici). In S8 succede il contrario,
apposta: le domande sul passato Apple hanno risposta verificabile, quindi
Peter annuisce o scuote la testa. Chi tocca S8 non deve "sistemare" quel
feedback per uniformità con S5.

Altre due cose di S8 che sembrano dettagli e non lo sono:
- **il testo di una domanda non passa dal typewriter** — il timer parte al
  render, scrivere a macchina sarebbe una penalità invisibile;
- **la griglia dei livelli convive con `#choices`** — per questo `#griglia`
  sta prima nell'HTML e `#boxwrap` prende la classe `quizhub`.

## Dopo le previsioni il gioco non finisce

L'ordine e' vincolato e non va riordinato per comodita': conferma delle
previsioni -> **email facoltativa** -> titoli di coda -> cartello "Hai
completato una fase, non l'intera esperienza" -> **ritorno in lobby**, dove
Francesca si congratula (POST-L01..L07, posa `orgogliosa`) e manda dal Peter
dei quiz. Al countdown ci si arriva **dopo** il quiz, non prima.

Tre cose da non rompere:

1. **La sequenza del ritorno si vede una volta sola** (`post_lobby_visto`), e
   le battute d'apertura della lobby ("io sono Francesca") valgono solo con
   `locked` a false. Chi aggiunge uno step in `lobby` deve chiedersi in quale
   dei due stati vive, e dichiararlo con `se`.
2. **Dopo le previsioni la lobby non manda piu' dietro la tenda.** La zona 1 e'
   scritta due volte (`tenda` / `tenda_dopo`, condizionate a `locked`), l'hub si
   riapre da Peter (`startDopo`) e il tutorial dello swipe non si ripete
   (`tutorialSe`). Chi rimette un `goto` verso la sala rimanda il giocatore a
   rigiocare lo show.
3. **L'email non e' obbligatoria e non deve diventarlo.** Campo vuoto +
   CONTINUA vale come saltare, e il salto e' un bottone dichiarato. La partita
   va in coda al momento della conferma e la spedisce la schermata dell'email:
   una riga sola, con l'email dentro se c'e'. Se cambia il payload cambia anche
   l'elenco nel regolamento (e la colonna in `docs/backend.sql`).

## Il linguaggio: mai "schedina bloccata"

Al giocatore non si dice mai "schedina bloccata", "la schedina e' chiusa",
"previsioni bloccate". Si dice che le previsioni sono **fatte, confermate,
registrate, concluse**. Le variabili interne restano `locked` e compagnia: la
regola riguarda il testo che si legge a schermo (dialoghi, bottoni, modali,
countdown, card, regolamento, HTML).

## La platea non avra' mai i suoi layer

`pla_*` (idle, applausi, risata, silenzio, coro) **non si disegnano**: e' una
decisione presa, non un lavoro in sospeso. Il motore sa gia' mostrarli e le
reazioni di S5 ci girano intorno: si lascia tutto com'e', senza compensare
l'assenza con altro. Non rimetterli in `meta.assetiInArrivo`.

## Il regolamento (zona 3) contiene anche la parte legale

Privacy, indipendenza da Apple, marchi e contatti stanno dentro il
regolamento sotto un separatore, **non** in una voce di menu propria, e
nessuna sezione si chiama "note legali" (vietato esplicitamente).

Tre cose da non rompere:
1. **Non è una scena.** L'hotspot ha `apre`, non `goto`: si mostra sopra la
   lobby, alla chiusura il giocatore è dov'era.
2. **Leggere non deve toccare la partita.** Il test fotografa `VN.state`
   prima di aprire e lo confronta dopo aver chiuso.
3. **Quello che c'è scritto deve essere vero.** L'elenco dei dati raccolti è
   esattamente il payload per Supabase; i 30 giorni di conservazione sono
   una promessa mantenuta a mano (procedura SQL in fondo a
   `docs/backend.sql`). Se cambia il payload, cambia anche il testo.

## Errori già fatti (per non ripeterli)

- **Bug di layout/layer invisibili ai test, visti solo a schermo:**
  - `#stage` con `overflow:hidden` lascia comunque un contenitore
    scorribile (il focus su un bottone parzialmente fuori schermo scorreva
    tutta la scena) — serve anche `overflow:clip`;
  - un overlay con `display:grid`+`place-items:center` dimensiona la riga
    sul contenuto, quindi `max-height:100%` non limita niente — usare
    **flex**, dove l'altezza del genitore è definita;
  - in una colonna flex i figli si stringono prima che il contenitore
    scorra (sezioni chiuse diventavano pillole vuote) — serve `flex:none`;
  - `goScene` teneva su il sipario nero se la scena conteneva un `title` fra
    **tutti** gli step, invece di controllare solo se **comincia** su un
    cartello (il finale ha i titoli di coda in fondo);
  - `#nero` sta **sopra** `#curtain`: un cartello che arriva dopo una
    dissolvenza al nero resta coperto anche se è nel DOM — va tolto il
    velo quando entra un cartello a schermo pieno.
- **`typeLines` non è una callback di completamento**: assegna `done` a
  `pending` ("cosa fare al prossimo tocco"). Per una sequenza automatica
  (i titoli di coda) serve il flag `subito`, che chiama `done()` subito.
- **Un tocco su una sequenza automatica deve accelerarla, mai
  cancellarla.** L'utente ha bocciato la prima versione dei titoli di coda
  perché un tap li faceva sparire. Ora un tocco mette la sequenza in
  modalità veloce (i blocchi restano meno tempo ma **compaiono tutti**),
  l'ultimo blocco non sfuma mai da solo (resta con la freccia finché non
  arriva l'ultimo tap). Timing attuale: ~12s senza toccare, ~6s con un
  tocco a metà, ~4s toccando di continuo — cambiarli tocca `titoliDiCoda`
  in `engine.js` e i `tieni` dei blocchi in `story.json`.
- **Le sostituzioni di stringhe lunghe su questo file falliscono in
  silenzio.** Apostrofi curvi e accenti spesso non combaciano e
  `str.replace`/`Edit` non protestano. **Dopo ogni modifica a CLAUDE.md,
  ricontrollare con un `grep` che il testo nuovo ci sia davvero.**
- **Un'estensione sbagliata rompe `npm test` in silenzio** finché qualcuno
  non lancia il test. Quando una conversione PNG→WebP sostituisce un
  asset, controllare che `story.json` punti alla nuova estensione.
- **Chiudere una PR draft con dei commit ancora in sospeso.** Se pushi
  altri commit dopo che l'utente ha già cliccato Merge, restano fuori da
  `main` — controllare `git log --oneline origin/main..HEAD` prima di darlo
  per scontato.
- **`npm test` può contenere asserzioni che documentano uno stato
  temporaneo** (es. "personaggio ancora senza sprite"). Se una modifica lo
  rende vero, il test va aggiornato insieme al codice, non aggirato.
