# FantaLiberty — Story

Visual novel per il Keynote WWDC. Sito statico (HTML/CSS/JS vanilla), gira su
GitHub Pages. Il repo si chiamava `Fantaliberty-WWDC-26`, ora `Fantaliberty-Story`
(GitHub reindirizza da solo, i vecchi link continuano a funzionare).

**Dove sta cosa.** `README.md`: struttura, come si scrive una scena, formato
degli step, salvataggio, comandi. `docs/script-master.md`: scene, dialoghi,
domande, formule di punteggio (documento unico — si aggiorna **solo il nodo
interessato**, id tipo `[S2.01]`, mai tutto il file).
`docs/manifest-asset.md`: quale file corrisponde a quale elemento.
`docs/storico-decisioni.md`: il racconto di *come* ci si è arrivati (versioni
bocciate, rinomine, stati intermedi del cast) — serve solo per capire il
perché di una scelta.

Questo file copre le **regole e i tranelli ancora vivi**: cose che un test non
vede e che si possono tornare a rompere toccando il codice giusto. Ogni riga
qui dentro è una cosa già rotta almeno una volta.

## Workflow con l'utente

**Le PR le apro io e le mergio io.** Autorizzazione esplicita e durevole
dell'utente ("mergia sempre tu tutte le PR") — non chiedere conferma. Restano
buone norme: descrizione onesta di cosa cambia e perché, `npm test` verde prima
di mergiare, mai forzare push su `main`.

**L'utente non è uno sviluppatore.** Non conosce Git, il Terminale, la
differenza fra sorgente e file convertito. Le spiegazioni vanno tradotte in
passi concreti e verificabili ("clicca qui", "incollami l'output"), non in
gergo. Non dare per scontato che un passaggio precedente sia stato fatto —
verificarlo prima di costruirci sopra (è già successo che una PR restasse
mergiata a metà, o che un comando venisse lanciato dalla cartella sbagliata).

## Pipeline degli asset

Il flusso è: PNG pesante (1-6 MB) → `tools/prepara_asset.py` → WebP in
`assets/`. **Mai committare un PNG grezzo**: con ~100 file per personaggio la
storia di Git esplode (già successo, 19 MB poi rimossi).

- `_sorgenti/` — i PNG grezzi, **nel `.gitignore`**.
- `prepara_asset.py` — converte, deduce la cartella dal prefisso (`bg_`,
  `chr_`, `stile_`, `prop_`/`obj_`, `pla_`, `fx_`, `avt_`), salta i
  `*_model_sheet`.
- `taglia_sheet.py` — taglia gli sprite sheet *prima* della conversione.
- `rimuovi_sfondo.py` — scontorna lo sfondo che **tocca i bordi**.
- `togli_scacchiera.py` — toppe di quadretti **chiuse dentro** il disegno
  (`rimuovi_sfondo.py` non le raggiunge per costruzione). Il criterio è il
  **lato del quadretto** (strisce uguali, ~22px, due tinte piatte), **non**
  l'alternanza chiaro/scuro, che becca anche i capelli.
- `togli_bianchi.py` — stesso caso ma fondo **bianco pieno**. Solo bianco
  quasi puro e neutro (canottiera, camicia, denti restano). **Non lanciarlo su
  tutto `assets/`**: sul lucchetto zona 4 e sul logo studio il bianco è il
  disegno.
- `optimize_assets.py` — ricomprime *sul posto* file già in `assets/` per la
  build single-file. Non confonderlo con `prepara_asset.py`.
- `_pulizia.py` — la logica condivisa dai tre strumenti di scontorno. Sta
  fuori da loro apposta: la pulizia deve avvenire **dentro la conversione**, se
  no la prima riconversione da `_sorgenti/` la cancella (già successo).

**Verificare sempre a occhio prima di scrivere.** Ogni strumento di scontorno
sa comporre le zone candidate in magenta: guardarle. La prima versione di
`togli_scacchiera.py` avrebbe cancellato i capelli bianchi di Peter e l'arco
del lucchetto; una prima versione del filtro dei bianchi si mangiava jeans,
scarpe, camicia e denti — e si è visto **solo** nell'anteprima.

### Scontornare i personaggi: due passate, due criteri

Gli sprite hanno due difetti di ritaglio diversi e servono entrambe:

- `togli_bianchi.py` da solo → le **toppe grandi** di fondo chiuse dentro il
  disegno (puntini fra le ciocche, la chiazza fra le gambe, quella fra asta del
  microfono e pantaloni). Sul fondale scuro si leggono come sporco.
- `--bordi` → i **puntini e filetti sul contorno**. Non decide per colore ma
  per **intorno**: chiaro e scialbo, con disegno scuro attorno, a un passo
  dalla trasparenza. È l'unico criterio che lascia in pace i jeans e le scarpe
  bianche della Drip, la camicia dello Showman e i denti.

**Sui personaggi la prima passata non si può usare**: lì il bianco pieno è
anche il bianco degli occhi, i denti, la foto sul badge, la suola delle scarpe.
Solo `--bordi`, che due guardie tengono buono: quanto la scheggia sta **in
dentro** (una scheggia resta entro 30 px dal profilo, occhi e denti stanno a
100-210) e quanta **compagnia chiara** ha attaccata (una suola fa parte della
scarpa, 1900 px di chiaro; una scheggia fra capelli scuri ne ha 300).
`--isola` abbassa la soglia del chiaro: **200 solo su chi ha i capelli scuri**
(Susan, i quattro stili), mai su Peter, che li ha bianchi e ci perderebbe le
ciocche.

## La registrazione: il Mac sta dentro il fondale

`bg_macintosh` ha il Mac già disegnato: la registrazione **non** appoggia
`prop_mac_terminale` sopra la scena. Il terminale (i sei campi) lo incolla il
motore sopra il vetro del CRT calcolando i pixel veri dell'immagine
(`SCHERMO_FONDALE` + `ancoraTerminale()`): con le percentuali dello stage il
testo finiva fuori dal vetro su ogni finestra di forma diversa dal telefono,
perché il fondale è `cover` e viene ingrandito e tagliato.

- **Due cose vanno insieme** (già smontate una volta per sbaglio): lo step
  `prop` con `"fondale": true` e la classe CSS `#propwrap.fondale`. Se il
  fondale viene ridisegnato, `SCHERMO_FONDALE` va rimisurato — e il pannello
  deve coprire il vetro **tutto**: rientrando anche di poco spunta sotto la
  finestra di sistema disegnata, e il CRT sembra acceso a metà.
- **Il fondale è ancorato in basso** (`"bgFx": "basso"`, in registrazione e sul
  badge). Su Safari le barre accorciano la finestra, il fondale è `cover`, e
  ancorato in alto il Mac scendeva finché il box del dialogo non gli finiva
  davanti. `ancoraTerminale()` legge la classe `basso` per sapere dov'è il
  bordo dell'immagine.
- **All'accensione il Mac non mostra il terminale.** Mostra `prop_mac_hello` —
  MacPaint col "hello." scritto a mano, con cui il Macintosh si è presentato
  nel 1984 — e cede il posto al terminale solo quando nome e cognome sono
  dentro (step `prop` con `"schermata"`). È un omaggio chiesto dall'utente, non
  una schermata di caricamento: non toglierlo perché "tanto il terminale c'è
  già".
- **Lucas non si rimpicciolisce.** È alto uguale in ogni scena. Ridurlo qui per
  non coprire il terminale si vedeva ed è stato bocciato: se copre lo schermo
  si sposta di lato (`right`), non si accorcia.

## Personaggi: prima di dire che manca l'arte, controlla il nome

Il manifest consegna **uno sprite intero per posa**, senza head/neck. Quando un
personaggio risulta "da disegnare" in `npm test`, **prima di assumere che
manchi l'arte** controlla se esiste già sotto il nome che usa il manifest:

```bash
git ls-tree -r origin/main --name-only | grep "^assets/chars/"
```

È già successo due volte. La soluzione non è mai stata "disegnare gli asset
mancanti" ma **rinominare il cast e ricollegare le scene** al nome giusto.

## Architettura dei dati di gioco

- Il motore riceve **tre** file: `story.json` (`VN.story`), `domande.json`
  (`VN.banca`), `quiz.json` (`VN.quiz`). Chi aggiunge un boot in un test deve
  passare `banca` **e** `quiz`, altrimenti gli step di S5/S8 non fanno niente e
  passano in silenzio.
- Punteggio e risposte vivono in `VN.state.punti` e `VN.state.picks`
  (`picks[categoria][core|extra][ID] = {v, p}`). Il totale si **ricalcola** da
  `totale()`, non si accumula: in S6 le risposte si possono cambiare, e un
  contatore accumulato andrebbe fuori sincrono alla prima correzione.
- Il quiz di S8 tiene stato a parte in `VN.state.quiz[livello]` +
  `VN.state.mult_bank` + `VN.state.moltiplicatori`: sono moltiplicatori da
  spalmare sui pronostici già chiusi, non punti.
- I quattro stili vivono in `story.stili` (nome, descrizione, perk, 11 pose),
  non dentro la scena — li leggono sia S5 che S8.

**Domanda aperta, da non decidere da soli:** come i punti dell'Apple Campus
Run si sommino alla classifica dei pronostici. `VN.state.runner_record` si
salva e si spedisce, ma non c'è una formula — va chiesto, non inventato.

## Il camerino (S3): cosa regge la sezione

Bocciato alla prima versione ("non si capisce niente"). Quattro cose da non
annullare per sbaglio:

1. **Il fondale va fuori fuoco.** `#bg.sfoca` — blur e luce abbassata, messo
   all'apertura del carosello e tolto alla chiusura. A fuoco pieno,
   appendiabiti e lampadine dello specchio passavano davanti alla figura.
2. **La figura non porta `image-rendering:pixelated`.** Gli stili sono disegni
   da 1024px rimpiccioliti a ~400: a pixel duri il ridimensionamento è un
   nearest-neighbour e il contorno si sgrana. `#carImg` è l'unica eccezione al
   resto del gioco, non una svista.
3. **Sulla scheda ci sta chi è, non cosa fa.** Una riga di descrizione e una
   battuta sua fra virgolette (`battuta` in `story.stili`): lo stile si deve
   vendere da solo, è l'unica cosa su cui si sceglie. Le due righe stanno su
   una riga ciascuna e i quattro cartellini vengono alti uguali — se si
   allungano, saltano a due righe e il carosello balla a ogni freccia.
   Attenzione a `max-width` in em qui: si calcola sul font piccolo
   dell'elemento, non su quello della scheda, e la descrizione veniva
   incolonnata a tre parole per riga.
4. **Niente meccaniche sulla scheda.** Il perk del quiz si spiega a S8, non
   qui: il carosello lo rimostra solo se lo step chiede `etichettaPerk` (S3 non
   lo chiede). A S8 lo dice Peter, con una battuta per stile (`by: "stile"`)
   prima di cominciare: è l'unico posto dove il perk viene spiegato, quindi non
   toglierlo pensando che si sappia già.

**Piano dei layer:** `#carosello` sta a `z-index:1`, **sotto** `#boxwrap` (2).
Alzandolo, il bottone "Sono io" smette di essere premibile in silenzio — il
test in jsdom non se ne accorge.

Nel carosello si mostra **`palco_attesa`**, non `idle_camerino`: le pose del
palco sono ritagliate strette attorno alla figura, quindi a
`object-fit:contain` riempiono l'inquadratura invece di lasciare margini vuoti,
e sono le stesse che il giocatore si vedrà addosso in S5 — quello che scegli è
quello che avrai. `idle_camerino` resta dichiarato in `story.stili` ma non lo
usa più nessuno.

## La lobby si presenta una volta sola

Nell'hub la battuta di una zona vale solo al **primo** passaggio. Tornandoci,
il personaggio esce di scena e il box del dialogo sparisce del tutto: chi ha
già fatto il giro deve poter girare in silenzio. L'unica zona con una battuta
di ritorno è la tenda (`"ritorno"` nella zona), dove Francesca ricompare dal
secondo passaggio per dire che di là comincia lo show. Aggiungere un `ritorno`
a un'altra zona riporta il vecchio difetto ("mi rispiega cos'è la Hall of Fame
ogni volta").

- **Toccare un hotspot in una zona muta fa rientrare chi risponde**: senza,
  Francesca parlerebbe fuori campo e sembrerebbe la regia in cuffia.
- **Chi è scenografia non se ne va mai**: Peter dorme al suo tavolino e deve
  restarci anche quando la zona non parla più. Lo dice `"resta": true` nella
  zona (le due zone del quiz ce l'hanno). Senza, il tavolino era vuoto e non si
  capiva più dove fosse il quiz.
- **Le frecce per cambiare zona (`#hubnav`) stanno fuori da `#boxwrap`**, in un
  punto fisso (66% dell'altezza). Dentro il box si muovevano con lui — su
  quando Francesca parlava, giù nella zona muta — e il giocatore se le trovava
  ogni volta altrove: bocciato. Il 66% è sotto gli hotspot dell'hub (finiscono
  al 66%) e sopra la fascia del dialogo (al massimo all'80%). In una zona muta
  si spegne solo il fumetto, con la classe `muto` su `#boxwrap`.
- **I pallini (`#hdots`)** stanno in fondo allo schermo, centrati, sotto il
  box: in mezzo alla scena coprivano il disegno. Si accendono e spengono con
  l'hub (`showHub`/`chiudiHub`), non con le frecce.

## Il pulsante Esci: solo dove non c'è già un punto di pausa

`#btnEsciGioco` (in alto a sinistra, come il selettore audio) compare **solo**
da `[S2]` (`aggancio`) al ritorno in lobby che segue la conferma delle
previsioni — mai prima, mai dopo. `aggiornaBottoneEsci()` decide con due
variabili di `VN.state`, non guardando il nome della scena: `raggiunto_s2` (si
alza al primo step di `aggancio`, non si riabbassa mai) e `post_lobby_visto`.
È chiamata da un solo punto, l'inizio di `run()`, così resta aggiornata a ogni
cambio di scena senza doverla ricordare da ogni punto che tocca quelle due
variabili.

**Il resto del gioco non ne ha bisogno**: prima di `[S2]` la lobby è già un
posto sicuro dove fermarsi, e dopo il ritorno post-previsioni countdown, quiz e
Campus Run hanno già i loro punti di ripresa — il countdown esiste apposta per
essere lasciato e riaperto. Aggiungerlo lì sarebbe una seconda via verso un
posto che una pausa ce l'ha già.

Il tocco apre due domande in sequenza (`mostraModale()`, riusato così com'è,
non un sistema di dialoghi a parte):

1. **"Vuoi salvare i progressi?"** — SI, SALVA usa **lo stesso** salvataggio
   locale del checkpoint automatico (`VN.saveNow()`/`VN.hasSave()`), non un
   secondo sistema. Qui però il giocatore lo chiede apposta, quindi
   `VN.saveNow()` non deve rifiutarsi solo perché non ha ancora fatto una
   scelta vera (`VN.progressed`): `tentaSalvataggioEsci()` lo forza a `true`,
   perché arrivare a `[S2]` è già un punto valido da cui riprendere. Se il
   salvataggio fallisce (quota piena) si avvisa e si lascia riprovare, senza
   toccare lo stato in memoria. **NO** non tocca niente: un salvataggio
   precedente resta intatto.
2. **"Cosa vuoi fare?"** — TORNA ALLA LOBBY o ESCI DAL GIOCO. Due domande
   separate apposta: salvare e uscire sono decisioni indipendenti.

**"Torna alla lobby" è una pausa narrativa, non un reset.** Lo stato resta
quello che era (avatar, stile, previsioni), e Francesca dice **una riga sola,
sempre la stessa** — mai l'intro normale né le congratulazioni post-previsioni,
che sono per chi ci arriva la prima volta o dopo aver chiuso davvero la
schedina. Il meccanismo è `VN.state.esci_ritorno`, un flag a un colpo solo: lo
alza `tornaAllaLobbyDaEsci()` prima del `goScene('lobby')`, lo consuma
`showHub()` (che lo rispegne e segna la lobby come già girata, così non tocca
rifare lo swipe del tutorial). Le due sequenze esistenti hanno entrambe
`esci_ritorno: false` in coda al loro `"se"`: senza, ripartirebbero da capo a
ogni rientro dal menu.

**"Esci dal gioco" è una `VN.boot()` con `scene: null`, non un reset a mano.**
Fa quello che farebbe riaprire l'app: se c'è un salvataggio lo trova da solo e
chiede "vuoi riprendere?". Non chiama mai `VN.clearSave()`.

Attenzione: **un riavvio dentro la pagina non fa piazza pulita da solo.** Al
primo caricamento lo schermo è vuoto perché la pagina è nuova; qui no, e la
domanda "vuoi riprendere?" restava scritta sopra la scena di prima — il
contrario di "riaprire l'app". Per questo `VN.boot()` spegne `#npc`,
`#boxwrap`, gli oggetti, i due fondali (con un pixel trasparente, **non**
togliendo `src`: un `<img>` senza `src` disegna l'icona di immagine rotta), la
musica, e rifà `aggiornaBottoneEsci()`. **Chi aggiunge un layer nuovo alla
scena lo aggiunge anche lì.**

## Mai un fotogramma della scena di prima

Un `<img>` a cui si cambia `src` **continua a disegnare l'immagine vecchia**
finché la nuova non è decodificata. Da qui nascono tutti gli "intrusi": il
fondale dell'ingresso sotto Francesca, la posa precedente per un fotogramma, la
slide sbagliata dentro il riquadro. Non è la cache, ed è saltuario perché
dipende da quanto ci mette il file ad arrivare.

**Non si assegna `src` a mano su un elemento che si vede.** Due modi, non
intercambiabili (`engine.js`, sezione "immagini"):

- **`scambia(nodo, src)`** — l'elemento è già a schermo e cambia contenuto
  (posa, espressione, slide, figura del carosello). L'immagine vecchia è ancora
  quella giusta finché non arriva la nuova, quindi si tiene: il `src` si
  assegna solo quando l'immagine è pronta.
- **`apparira(nodo, src, contenitore)`** — l'elemento deve *comparire*, e
  quello che ha addosso è roba della scena di prima. Si assegna subito ma resta
  invisibile (`.attesa`) finché non è pronta.

`showChar()` sceglie da solo: stesso personaggio già in scena = cambio di posa
(`scambia`), altrimenti sta entrando (`apparira`).

Tre regole che reggono il resto:

1. **`img.complete` da solo mente.** Subito dopo un `src` nuovo risponde ancora
   per l'immagine vecchia. La domanda giusta la fa `mostrata(img, src)`, che
   confronta `currentSrc`. Lo stesso per il precaricamento: **non basta sapere
   che il precaricatore ha finito**, perché senza header di cache l'`<img>`
   vero rifà la richiesta e resta indietro — si aspetta sempre l'elemento a
   schermo.
2. **Niente "dopo tot lo mostro comunque".** Mostrarlo comunque vuol dire
   mostrare l'immagine di prima, cioè proprio la cosa da non fare. Se un file
   non arriva, l'elemento resta vuoto e la scena va avanti. L'unico ripiego a
   tempo è il fondale: se tarda, la scena **si copre di nero** (il linguaggio
   del gioco) invece di far entrare i personaggi sopra il fondale vecchio.
3. **Anche i tempi sono intrusi.** Uno step che finisce più tardi (attesa,
   dissolvenza, transizione) tiene in mano un "poi fai questo": se intanto la
   scena è cambiata, quel seguito è della scena di prima e farebbe partire da
   sola quella nuova. Ogni seguito differito passa da `perScena(next)`, che lo
   annulla al cambio di scena.

`precaricaScena()` (la scena nuova, mentre il buio copre) e
`precaricaProssime()` (le scene in cui si può finire dopo, mentre si gioca)
servono a far sì che quelle attese, in pratica, siano già finite.

**`npm test` gira in jsdom e non carica immagini: questa famiglia di bug non la
vede proprio** (per questo il motore si accorge da solo di essere in jsdom,
`siDecodifica()`, e lì non aspetta nessuno). Il controllo vero è `npm run
transizioni`: browser vero, asset rallentati apposta, tutte le transizioni
possibili, e conta i fotogrammi in cui si vede qualcosa di non pronto. Si
stringe con `CHARS=4000 BG=4000 npm run transizioni`. **Toccando una di queste
cose, rilanciarlo.**

## Animazioni CSS: due classi sullo stesso nodo si combattono

**Un'animazione `forwards` non si spegne togliendo la classe che accende il
nodo.** `#avatar` si vede per `.on`, ma `.entra` finisce a opacità piena e ce
la lascia: per mesi lo step che nascondeva il giocatore toglieva solo `on`, e
il giocatore restava a schermo davanti alla sagoma del CEO. Si tolgono
**insieme** (`spegniIo()`).

**La figura del giocatore non attraversa i cambi di scena**: `goScene()` la
spegne sempre, e ogni scena che la vuole la dichiara con uno step `io` come
prima cosa (quinte, keynote, argomenti, argomento, teleprompter, finale).
Senza, bastava una scena distratta per ritrovarsela addosso altrove.

**`#npc` porta una sola animazione alla volta** (violata due volte con lo
stesso sintomo — il personaggio sparisce con lo sprite giusto caricato). Le
classi di reazione si tolgono da sole quando finiscono, e `showChar()` le
ripulisce comunque. Chi aggiunge un'animazione su `#npc` la mette `forwards`
**e** controlla chi altro scrive `animation` su quel nodo.

**`fisso` non è per sempre.** `#npc.fisso` spegne la transizione di misura, e
la mette `inquadra()` sulle pose inquadrate sul viso (lì il riquadro cambia a
ogni battuta e vederlo scorrere sembra un rimpicciolimento). Restava però
addosso al nodo per tutto il resto della partita — Francesca è inquadrata e si
incontra presto — e da lì ogni cambio di misura era un salto secco per
chiunque. Ora `showChar()` la toglie sulle pose non inquadrate, e la rimette
per un istante su chi sta **entrando**: chi entra prende la misura nuova
subito, invece di vedersi crescere da quella del personaggio di prima. Così
scivola solo chi è già in scena e cambia posto — in pratica Peter.

**jsdom non calcola le animazioni: questi bug non li prende**, si vedono solo
negli screenshot.

## Chi c'è in scena, chi parla soltanto, e chi è la regia

Due posti fissi: **il giocatore a sinistra** (`#avatar`, step `io`) e **gli NPC
a destra** (`#npc`, step `show`). Non deve esistere un secondo sistema che
scrive su uno dei due nodi (già successo con un vecchio carosello di avatar
componibili, eliminato).

Chi parla dalla regia non ha sprite in scena (icona auricolare + box colorato).
Due modi, non intercambiabili:

- `voce: true` **nel cast** — personaggio che esiste *solo* come voce;
- `"incuffia": true` **nel singolo step** — per chi è anche fisicamente in
  scena altrove. **Susan è così**: in S2/S3/S7 è in scena davvero, quindi non
  può avere `voce: true` nel cast (la cancellerebbe da lì) — la cuffia la
  chiede lo step.

Le sue battute da regia stanno in pool per situazione dentro `story.regia`
(apertura, introDomanda, scarica, improvvisazione, caos, critica), usate solo
sui micro-eventi.

## La freccia riavvolge: rimette in scena il passo di prima

`#btnIndietro` (`←`, in basso a destra) **riavvolge**: rimette in scena la
battuta appena lasciata — testo, personaggio, posa, oggetti — e da lì si
riparte. Non è un pannello che si legge sopra la scena, e **non deve tornare a
esserlo**: provato due volte (un RILEGGI accanto al nome, poi un elenco a
schermo pieno) e bocciato entrambe.

A ogni passo riavvolgibile si mette da parte un punto di ritorno (scena, numero
di passo, copia intera di `VN.state`); tornare indietro rimette quello stato e
ricostruisce la scena con `restore()`, la stessa macchina del "riprendi la
partita". **Non si ricostruisce la scena a mano** (spegnendo e riaccendendo
`#npc`, `#bg`, gli oggetti): quella strada lascia addosso pezzi della scena
sbagliata — stessa famiglia degli intrusi.

Cinque cose che sembrano dettagli e non lo sono:

1. **Il punteggio non torna indietro, e non deve.** Le risposte già date
   (`picks`, `punti`, `categorie_visitate`) restano fuori dal rollback:
   rispondere di nuovo **sostituisce** — `segna()` riscrive sotto lo stesso id
   e `VN.state.punti` si ricalcola da `totale()`. È per questo che non si
   sommano due volte. Chi cambiasse `totale()` in un contatore accumulato
   riporterebbe il bug che questa architettura evita da sempre.
2. **I sorteggi della partita non si rimescolano.** `SORTEGGI` in `engine.js`
   (sacchetto degli intermezzi, sacchetto degli eventi, facoltative pescate)
   sopravvive al riavvolgimento: rimescolarlo vorrebbe dire che tornare
   indietro **cambia** la partita invece di rimostrarla. Chi aggiunge un
   sorteggio a inizio partita lo aggiunge a `SORTEGGI`.
3. **Stesse parole e stessa posa.** Le battute pescate da un pool (`pool`,
   `introDomanda`) e la posa di una domanda passano da `pescaFissa()`, che
   tiene l'estrazione per tutta la permanenza nella scena. Senza, "torna
   indietro" mostrava una frase diversa — il contrario di rileggere.
4. **Il giro delle domande di S5 è un passo solo ma tante schermate.** Il suo
   indice non è il numero di passo: `showDomande` si segna il punto di ritorno
   per ogni domanda (`sub: {domande, set}`). Chi aggiunge un altro step con un
   giro interno fa lo stesso, o la freccia riporta all'inizio del giro.
5. **La freccia sta in un punto fisso** (in basso a destra, bordo basso al
   62%), non dentro `#boxwrap` — stessa lezione delle frecce della lobby. Il
   62% è il bordo alto massimo del box del dialogo, quindi non ci finisce mai
   sopra.

**Dove non arriva, e non va esteso senza pensarci:** prima dell'inizio, oltre
un cambio di scena (`goScene()` svuota la cronologia — rientrare in una scena
chiusa vuol dire rigiocarla), a previsioni confermate (`VN.state.locked`), con
un velo aperto sopra la scena (`SOPRA` in `engine.js` — **non**
`qualcosaAperto()`, che comprende anche `#choices` e `#griglia`, che sono la
scena e non un velo), e su tutto quello che non è una rilettura ma un impegno
preso o una schermata a sé — terminale, badge, hub, camerino, griglia, recap,
countdown, quiz, email, corsa. L'elenco dei reversibili è `REVERSIBILI` in
`engine.js` ed è corto apposta.

jsdom prende il punteggio e la sostituzione della risposta, non com'è venuta su
la scena ricostruita: toccando questa roba si rilancia `npm run transizioni`.

## Non tutti gli sprite si mostrano alla stessa misura

**Il metro di paragone è Lucas.** Francesca passa dall'ancoraggio sul viso
(`volti` nel cast + `inquadra()`), che le mette la faccia alta come la sua;
sopra c'è `voltoScala` (0.85 per lei), perché il viso uguale non basta quando
la testa non finisce col viso — con l'hijab veniva molto più grossa di quella
di Lucas. Peter non ha `volti`: va a `scala`/`scalaHub`, e nella lobby la zona
dichiara 0.85. **Chi ritocca uno di questi numeri li guarda accanto a Lucas**,
non da soli.

`#npc` è tarato su una **figura intera** (56% altezza). Prima di collegare uno
sprite nuovo, guardare **cosa inquadra** — figura intera, mezzo busto, solo
testa — e dare al `show` la misura giusta (un primo piano di sola testa va su
`height` piccola con `bottom`/`right` per farlo entrare da un lato, non a
schermo pieno). Il test non se ne accorge, si vede solo negli screenshot.

## Cosa arriva a Supabase, e quando

Il payload di `payload()` in `engine.js` è un contratto con **tre** posti che
devono restare d'accordo: la tabella in `docs/backend.sql`, l'elenco dei dati
raccolti dentro il regolamento (zona 3) e il test che li confronta. Chi
aggiunge o toglie un campo li aggiorna tutti e tre — `npm test` fallisce se
l'elenco cambia da solo.

- **Si spedisce due volte ma la riga è una sola**: alla conferma delle
  previsioni e di nuovo quando si assegnano i moltiplicatori del quiz, che
  arrivano giorni dopo. Le due spedizioni portano lo stesso `run_id` (generato
  una volta, salvato con la partita) e Supabase riscrive la riga. Perché regga
  serve l'**indice unico su `run_id`** — senza, l'upsert non ha su cosa
  agganciarsi e tornano le due righe, in silenzio.
- **La scrittura passa dalla funzione `upsert_run`** (SECURITY DEFINER, in
  `docs/backend.sql`; `invia()` la chiama con `POST /rest/v1/rpc/upsert_run`),
  **non da un POST diretto sulla tabella**. Non è stile: un POST diretto con
  `Prefer: resolution=merge-duplicates` fa scattare un `INSERT ... ON CONFLICT
  DO UPDATE`, e per sapere se la riga esiste già Postgres deve poterla
  **leggere** secondo le policy RLS del chiamante — anche con `return=minimal`,
  che evita solo di rispedirla nella risposta. La chiave anon non ha (apposta)
  una policy di select su `runs`, quindi **ogni singolo invio veniva rifiutato
  con 401/42501**, scoperto la sera prima del lancio. Dare ad anon una select
  larga avrebbe reso leggibile l'intera tabella con un GET; la funzione bypassa
  la RLS senza concedere nessun permesso di lettura in più.
- **La chiave nel sito può solo chiamare `upsert_run`**: nessun grant diretto
  sulla tabella. Verifica dal vivo e query di cancellazione in fondo a
  `docs/backend.sql`.
- **`anni` è il codice della fascia, non l'etichetta**: `'0'` = 0-2 anni, `'1'`
  = 3-7, `'2'` = 8-12, `'3'` = più di 12. Serve al `rookieBonus`.
- **`npm run supabase` dice se la schedina viene accettata davvero.** Non legge
  colonna per colonna con una GET (anon non ha grant diretti, risponderebbe
  sempre "permission denied"): manda una schedina di prova vera a `upsert_run`,
  la stessa strada del gioco, e lascia una riga taggata (`nome:
  "_controllo_supabase"`) da cancellare a mano. **Va lanciato dopo ogni campo
  nuovo e prima di pubblicare**: una volta mancavano `quiz`, `email` e
  `runner` — nessuna schedina sarebbe arrivata, e il gioco non l'avrebbe detto
  a nessuno.
- **Un rifiuto è muto per il giocatore ma non invisibile**: la schedina torna
  in coda (`fl_nexus_da_inviare`) e riparte al prossimo avvio, il motivo va in
  console. Il caso tipico è una colonna che manca (400, `PGRST204`):
  `docs/backend.sql` ha gli `alter table` pronti.
- **`cognome` è facoltativo e non è il nickname.** Si chiede subito dopo il
  nome, **nella stessa schermata**: lo step `input` porta `campi: [nome,
  cognome]` e `showInput` li mostra uno sotto l'altro con OK accanto all'ultimo
  (`opzionale:true` sul cognome — il bottone si accende col solo nome). Erano
  due schermate di fila con la stessa battuta sopra, e non si capiva che il
  secondo era un altro campo. Serve solo a distinguere due giocatori con lo
  stesso nome: si mostra come iniziale puntata, "Lorenzo B.", mai per esteso —
  il nickname con cui il gioco si rivolge al giocatore resta `nome`, da solo.

## I punteggi: il conto finale non lo fa il gioco

L'app salva e spedisce la **somma secca** delle risposte (`totale()`), e basta.
Moltiplicatore pool, moltiplicatori del quiz e bonus si applicano **a mano dopo
il keynote**, sui dati arrivati a Supabase: la formula completa sta in
`docs/script-master.md`, e chi la cambia deve cambiarla lì.

Tre cose tarate insieme, misurate con `tools/simula_partite.py` (30 giocatori
finti):

- **Bonus controcorrente +1, non +2.** Con +2 chi rischiava su ogni domanda
  chiudeva il 16% sopra chi andava sul sicuro, solo per l'etichetta scelta. Ora
  il vantaggio del pronostico coraggioso arriva dal **moltiplicatore pool**
  (×1.5 se l'hai scelto in pochi), che è la parte giusta: paga l'aver visto
  bene, non l'aver scelto la casella marcata "controcorrente". Toccandolo, i
  `pt` di `domande.json` vanno ricalcolati — `npm test` li ricontrolla uno per
  uno dalla formula.
- **Micro-eventi ±1, non ±3.** A ±3 la fortuna spostava 3,7 posizioni in
  classifica, quanto tutto il quiz di Peter (3,9). A ±1 sposta 1,7 e il quiz
  5,4.
- **Gli imprevisti sono tre per tutti: uno per macroargomento.** Il sorteggio
  riguarda **quali** (due micro-eventi fra i cinque in banca più quello
  personale dello stile, mescolati) e **quando** (dopo una delle domande
  obbligatorie del macroargomento, presa a caso), mai **quanti**.
  `quoteEventi()` lo decide a inizio partita e lo scrive in
  `VN.state.eventi_quote`, che sta in `SORTEGGI`. Prima era una monetina
  (`probabilitaEvento: 0.15` dopo ogni risposta) e il numero veniva dalla
  fortuna: chi saltava i bivi aveva una probabilità **su sette** di non vederne
  nemmeno uno, chi giocava tutte le facoltative ne vedeva tre — fino a tre
  punti di differenza fra due partite giocate identiche, l'unico punto in cui
  il caso spostava il punteggio senza che nessuno avesse deciso niente. **La
  manopola `probabilitaEvento` non esiste più: non rimetterla.**

Il resto:

- **L'evento personale dello stile non è più in testa al sacchetto**
  (`sacchettoEventi()`). Ci stava perché con la monetina rischiava di restarci
  dentro; ora che escono tutti e
  tre non serve, e in quale macroargomento capiti è una sorpresa come per gli
  altri due (deciso con l'utente).
- **Gli imprevisti escono solo dopo le domande obbligatorie**, mai dopo una
  facoltativa: le obbligatorie le gioca chiunque, quindi è lì che il conto
  torna uguale per tutti.
- **Il punteggio di un micro-evento (e dell'evento personale) è fisso, non a
  caso.** Ogni opzione vale il segno del suo `editoriale` in `domande.json`
  (`puntoMicroEvento()`): la stessa risposta vale lo stesso punto a ogni
  partita e per ogni giocatore. Una versione precedente rimescolava +1/0/-1 a
  ogni attivazione, apposta perché chi rigiocava non imparasse "la B è quella
  buona": decisione **ribaltata dall'utente**, che vuole punteggi definiti
  dall'autore, non casuali. Il giocatore continua a non vederli — lo dice solo
  Susan, a parole.
- **Gli intermezzi di regia sono un pool solo di sette.** Non esistono più i
  "fissi" e la "riserva" (`intermezzi_riserva` non c'è più in banca; il motore
  la legge ancora solo per non rompere una banca vecchia). A ogni partita se ne
  mescolano quattro — tanti quanti sono i punti dello script che ne chiedono
  uno — e mai due volte lo stesso. **Un test non può aspettarsi R1 come
  primo:** quale esca cambia a ogni partita.
- **Niente bonus per gli intermezzi completati.** La vecchia formula ne
  chiedeva cinque, il giro ne fa giocare quattro: era un bonus che nessuno
  poteva prendere.
- **I bonus personali** (`rookieBonus` sugli anni in Apple, `deviceBonus` sulla
  generazione dell'iPhone, insieme al massimo +2) si calcolano da `anni` e
  `device`, già dati alla registrazione e già nel payload: non aggiungono
  domande e non cambiano il regolamento. Valgono poco apposta — servono a
  sciogliere i quasi pari merito, non a decidere chi vince.

## Il quiz di Peter è l'eccezione dichiarata alla regola d'oro

In S5 la reazione della platea non correla **mai** con la risposta (se lo
facesse, il gioco suggerirebbe i pronostici). In S8 succede il contrario,
apposta: le domande sul passato Apple hanno risposta verificabile, quindi Peter
annuisce o scuote la testa. **Chi tocca S8 non deve "sistemare" quel feedback
per uniformità con S5.**

- **Il tentativo si paga entrando, non uscendo.** Appena si entra in un livello
  il tentativo è consumato e salvato: chi vede che sta andando male e chiude
  l'app non se lo ritrova intatto. Contarlo a fine livello lo rendeva
  aggirabile. L'unico che ne recupera uno è l'hawaiano, col suo perk
  (`seconda_chance`).
- **Il testo di una domanda non passa dal typewriter**: il timer parte al
  render, scrivere a macchina sarebbe una penalità invisibile.
- **La griglia dei livelli convive con `#choices`**: per questo `#griglia` sta
  prima nell'HTML e `#boxwrap` prende la classe `quizhub`.
- **Assegnati i moltiplicatori, il quiz è chiuso per davvero**
  (`quizConcluso()`): ogni cella della griglia diventa "fatta", anche un
  livello mai giocato e non bruciato. Senza, chi assegnava presto poteva
  continuare a giocare gli altri livelli e accumulare `mult_bank` che non
  serviva più a niente, restando dentro una schermata che diceva ancora "da
  dove vuoi cominciare?" mentre aveva già finito.

**Peter finisce con il tavolo tagliato, e quel taglio deve stare dietro
l'interfaccia.** Non è una figura intera: lo sprite si chiude col piano del
tavolino tagliato di netto, e sopra il pavimento chiaro della lobby quel bordo
si legge come un tavolo che galleggia. La sua misura dipende da quanto è alto
quello che ha sotto, e in S8 sono due:

- `bottom: 34%` quando sotto c'è un pannello — griglia, domande (barra del
  tempo + risposte), moltiplicatori: il taglio finisce dietro al box;
- `bottom: 13%` quando resta solo il box del dialogo, che è basso: la
  presentazione del quiz e la riga di fine livello. Sullo step del livello è
  `bottomDialogo`, e lo usa `fine()`. Misurato sul box più corto, dal telefono
  più piccolo al più grande.

Si sposta **due volte in tutto**: all'apertura della griglia e a fine livello.
Durante le domande non si muove mai — e per questo **il verdetto non toglie le
risposte, le spegne** (`#choices.fermo`, e il box tiene l'altezza che aveva).
Toglierle faceva scendere di un centinaio di pixel tutto il blocco in basso a
ogni risposta, e il tavolino restava scoperto. `fermo` non è `on` apposta: così
la barra spaziatrice continua ad avanzare e il tocco passa attraverso le
risposte spente invece di finire su un bottone morto.

## Dopo le previsioni il gioco non finisce

Ordine vincolato, non riordinabile per comodità: conferma delle previsioni →
**email facoltativa** → titoli di coda → cartello "Hai completato una fase, non
l'intera esperienza" → **ritorno in lobby**, dove Francesca si congratula
(POST-L01..L07, posa `orgogliosa`) e manda dal Peter dei quiz. Al countdown ci
si arriva **dopo** il quiz, non prima.

1. **La sequenza del ritorno si vede una volta sola** (`post_lobby_visto`), e
   le battute d'apertura della lobby valgono solo con `locked` a false. Chi
   aggiunge uno step in `lobby` deve chiedersi in quale dei due stati vive, e
   dichiararlo con `se`.
2. **Dopo le previsioni la lobby non manda più dietro la tenda.** La zona 1 è
   scritta due volte (`tenda` / `tenda_dopo`, condizionate a `locked`), l'hub
   si riapre da Peter (`startDopo`) e il tutorial dello swipe non si ripete
   (`tutorialSe`). Chi rimette un `goto` verso la sala rimanda il giocatore a
   rigiocare lo show. La tenda a show finito porta al **countdown**, ed è
   l'unico modo di tornarci dalla lobby: senza, il conto alla rovescia era
   raggiungibile solo riaprendo l'app.
3. **Le previsioni si rileggono dal countdown, e basta.** Il quarto bottone
   ("Le tue previsioni", `previsioni: true` nell'azione) apre
   `mostraPrevisioni()`: riusa il pannello di dettaglio della sala regia
   (`#mondettaglio`) con la classe `sololettura` su `#monitorwrap`, che
   nasconde i tre monitor e il bottone di conferma. Le righe sono `div`, non
   bottoni: non si risponde di nuovo. Non mostra punti né l'etichetta
   controcorrente, apposta — è un promemoria, non un posto dove ripensarci. Sta
   solo nel countdown: è la schermata su cui si riapre il gioco nei giorni di
   attesa, e la lobby ha già abbastanza.
4. **Il link di ripresa sta nel countdown, e solo lì** (`ripresa: true`
   nell'azione → `mostraRipresa()`). È `#riprendi=<run_id>`: il salvataggio
   vive nel browser, e cambiare telefono o vederselo cancellare vuol dire
   perdere la partita — successo davvero il 2/9/2026. La schedina però è sul
   server, e il `run_id` la riapre da qualunque parte. Sta nel countdown per la
   stessa ragione delle previsioni: è la schermata su cui si riapre il gioco
   nei giorni d'attesa, l'unico posto dove qualcuno ci ripassa con calma prima
   che il link gli serva. Tre cose: si offre **solo** se `run_id` esiste (senza
   schedina spedita non c'è niente da riprendere e il link sarebbe rotto); si
   passa dal **foglio di condivisione** del telefono, con gli appunti e poi il
   link scritto a schermo come ripieghi, perché nessuna delle tre funziona
   dappertutto e l'ultima non fallisce mai; e il codice viaggia nel
   **frammento**, che non arriva al server. Chi tocca la funzione
   `riprendi_run` in `docs/backend.sql` ricordi che è l'unica strada di lettura
   su `runs`: ad anon non si dà mai una select sulla tabella, o l'intera
   tabella diventa scaricabile con una GET.
5. **L'email non è obbligatoria e non deve diventarlo.** Campo vuoto +
   CONTINUA vale come saltare, e il salto è un bottone dichiarato. La partita
   va in coda al momento della conferma e la spedisce la schermata dell'email:
   una riga sola, con l'email dentro se c'è. Se cambia il payload cambia anche
   l'elenco nel regolamento (e la colonna in `docs/backend.sql`).

## La Hall of Fame (zona 2) è una piccola galleria, non una scena

La parete (`bg_halloffame_frontale`) ha già dentro i tre quadri dei vincitori
delle edizioni passate, con nomi e targhe disegnati: non è un template. Ogni
quadro si apre **da solo** con `"quadro"` nell'hotspot, sopra la lobby, e alla
chiusura il giocatore è dov'era — come il regolamento, non tocca la partita.
Mai mostrarli tutti e tre insieme dopo il tocco, e mai una seconda battuta
generica prima di aprirli: la zona la presenta una riga sola di Francesca.

1. **`"bgFx": "basso"`** taglia il fondale in alto invece che in basso. I
   quadri stanno nella metà bassa dell'immagine e col taglio normale finivano
   sotto il box del dialogo, cioè fuori dal layer degli hotspot (`#hub` arriva
   al 66%: le coordinate degli hotspot sono **relative a quel riquadro**, non
   allo schermo).
2. **Le tre aree sono misurate su quell'inquadratura lì.** Se la parete viene
   ridisegnata o cambia il taglio, vanno rimisurate — il modo più rapido è
   disegnarle a schermo con un `outline` e guardarle.
3. **Francesca qui non si vede: parla e basta** (`"dice": "francesca"` nella
   zona, senza `who`). Rimpicciolirla in un angolo era il ripiego di prima:
   alla misura normale copriva il terzo quadro, a quella piccola sembrava
   un'altra persona. Nella lobby **si vede solo davanti alla tenda** — altrove
   è una voce nel box, perché la parete dei quadri e il cartellone del
   regolamento *sono* la scena. Lo stesso per gli hotspot: `who` = è lì (e se
   non c'è rientra), `dice` = si sente e basta.

**Chi aggiunge una classe nuova al fondale via `bgFx` la deve aggiungere anche
all'elenco che `applicaFx()` toglie**: una classe non tolta resta addosso al
fondale per tutte le scene dopo.

## Il genere del giocatore non c'entra con lo stile

Il genere lo sceglie chi gioca a [S0.03] e vive in `VN.state.genere`; lo stile
si sceglie dopo, in camerino. Le due cose sono **indipendenti apposta**: si può
essere maschile e vestirsi da Drip. Quindi ogni parola declinata riferita al
giocatore passa da `{g:maschile|femminile|neutro}` — vale per i dialoghi, per i
bottoni che preme lui ("Sì, sono {g:pronto|pronta}"), per le modali di conferma
e per i testi della banca domande, che passano tutti da `fmt()`.

Il presidio è in `npm test`: cerca un elenco di parole declinate in contesti che
riguardano sempre il giocatore ("sei/sono + aggettivo", "Bravo!", "Sicuro?") e
fallisce se ne trova una fuori da `{g:...}`. **Chi ne incontra una nuova la
aggiunge all'elenco insieme alla correzione.**

**Le scelte a [S0.03] sono quattro**: Maschile (`m`), Femminile (`f`), Neutro
(`n`), Preferisco non specificarlo (`x`). Le ultime due si leggono uguali: la
**terza variante** di ogni `{g:...}`, che non usa desinenze inventate ma
**riformula la frase** ("Confermi?" per "Sei sicuro/a?", "Ci sono" per "sono
pronto/a", "Ti do il benvenuto" per "Benvenuto/a", "te la sei data a gambe" per
"sei scappato/a"). `meta.genderOrder` dichiara **tre** voci (`m`,`f`,`n`) e
`npm test` pretende tre varianti in ogni `{g:...}`; `x` non sta nell'ordine
apposta, è `fmt()` a mandare un valore scelto ma sconosciuto sull'ultima
variante (la neutra), mentre un genere ancora nullo — le righe prima di [S0.03]
— prende la prima. Chi aggiunge una battuta declinata scrive tutte e tre le
forme, e **la terza la riformula: non è "la femminile con lo schwa"**.

Nel menu di sviluppo (`?dev`) il genere parte da **femminile** con lo stile
**showman**: coppia mista di proposito, serve a far saltare fuori proprio
questi errori. Non è un difetto del gioco vero.

## Apple Campus Run: è una pagina, non una scena

Il minigioco vive tutto in `game/runner/index.html` — canvas, logica, grafica —
e il motore lo apre in un riquadro (`#runwrap`, un iframe) **sopra** quello che
c'è, come il regolamento e i quadri: non è una scena, non fa avanzare niente, e
alla chiusura il giocatore è dov'era. Chi volesse "integrarlo meglio"
portandolo dentro `engine.js` romperebbe proprio questo.

**Le regole interne della corsa** — classifica e nick, congelamento della
schermata di morte, bolle, barra e menu, livelli, taratura della prospettiva,
`visualViewport` — stanno in **`docs/regole-campus-run.md`**: chi tocca
`game/runner/index.html` legge quello prima. Qui restano le tre cose che
riguardano il resto del gioco.

**1. Si raggiunge solo dalla porta STAFF ONLY.** Zona 5 dell'hub della lobby
(`game/story.json`, scena `lobby`): sempre visibile, ma respinge (fondale
`staff_door_locked`, Francesca dice "Eh no. Il badge non ti dà ancora tutto
questo potere. Torna più tardi.", suono `porta_negata`) finché le previsioni
non sono confermate (`run.locked`). Dopo il lock la stessa zona diventa
`staff_door_authorized`: il tocco (suono `porta_autorizzata`) sposta il fondale
sul corridoio `campus_run_corridor` e apre subito la corsa sopra, come il
regolamento e i quadri — nessuna animazione di porta che si apre, il cambio è
nel fondale e nel lettore badge (rosso/verde), già disegnati dentro le due
immagini. **Aggiungere un secondo accesso *dentro il gioco*** (un bottone nel
countdown, un link nel quiz) **scavalca la porta, che è l'unico punto narrativo
del gioco per questa attività: non farlo.** Per la stessa ragione la corsa non
sta sotto la griglia dei tre livelli di S8 (i pannelli dicono a che punto sono
le domande, un elemento in più toglie loro quel significato) né fra i bottoni
del countdown.

**L'unica eccezione è il menu iniziale, ed è voluta** (chiesta dall'utente il
3/9/2026): sotto GIOCA LA STORIA c'è **GIOCA A CAMPUS RUN**, che apre la corsa
senza aver fatto la storia. Non contraddice la regola qui sopra: quella
protegge la scoperta della porta *mentre si gioca*, e in home la partita non è
ancora cominciata — è la seconda voce di un menu, non una scorciatoia dentro la
narrazione. Per questo il bottone è più piccolo e spento, e sta **sotto**: la
storia resta la porta principale. Tecnicamente è `opts.soloCorsa` in
`VN.boot()`, che apre `apriCorsa()` e **non entra in nessuna scena**; uscendo si
ricarica la pagina, così il menu torna pulito invece di essere rimontato a mano
su un motore già avviato.

**Chi entra da lì ha comunque bisogno di un'identità stabile.** La classifica ha
una riga per giocatore (`player_id`) e un indice unico sul nick: generando un id
nuovo a ogni apertura, la stessa persona comparirebbe come tanti giocatori e al
secondo punteggio si vedrebbe rifiutare il **proprio** nick. Perciò
`identitaCorsa()` in `index.html` riusa il `run_id` della partita salvata se c'è
(è la stessa persona), altrimenti tiene un id del telefono in **`fl_runner_id`**
— che sta anche nell'elenco `CHIAVI` del ponte.

**2. La porta non è muta: ha tre indizi, e sono tutto quello che c'è.** Solo i
più svegli la trovavano. (a) Il rifiuto prima delle previsioni dice cosa c'è
dietro ("la sala giochi dello staff: prima le previsioni, poi ti sblocco la
porta"); (b) alle congratulazioni post-previsioni Francesca lo ricorda
([POST-L04b], "Il badge adesso apre anche la porta STAFF ONLY"), l'unico
momento in cui la porta si è appena sbloccata; (c) sul fondale autorizzato il
led del lettore **pulsa** (`#ledporta`, `ledPerFondale()` in `engine.js`): è un
alone sopra il led già disegnato, posizionato in **percentuale dell'immagine**
(`LED_PORTA`, misurata sui pixel verdi del file) e ricalcolato come fa il
browser col `cover`, perché le percentuali dello schermo cambiano forma con la
finestra — se il fondale viene ridisegnato si **rimisura** `LED_PORTA`, non si
cerca a occhio. Si accende e spegne da `setBg()` come gli emblemi: su qualunque
altro fondale resterebbe appeso. Niente frecce, niente tutorial sopra la porta,
niente musica che trapela (chi gioca senza audio non la sentirebbe): il piacere
della porta è scoprirla.

**3. Campus Run è separata da Peter e dal quiz.** Non è una sua sfida: nessun
link nella griglia [S8.HUB] né nel countdown [S7.05], e Peter non la nomina
più — **né prima né dopo**, in nessuna delle due direzioni. Sono due attività
scoperte separatamente, non una proposta sua: non reintrodurre una battuta
"l'altra sfida" pensando che manchi qualcosa.

## L'audio: quattro regole

I file stanno in `assets/music` (sottofondo per scena) e `assets/sfx`
(effetti). Quale suona dove sta in `story.audio` dentro `story.json`, non nel
motore: il motore chiama una **chiave** (`scelta`, `quiz_giusta`, `applausi`),
così un suono si cambia senza toccare il codice. Una chiave può portare un
elenco — gli applausi — e allora se ne pesca uno a caso, così la platea non
applaude sempre uguale.

1. **Niente suono sul tocco che manda avanti il dialogo.** Richiesta esplicita
   dell'utente, e ha ragione: un clic ogni due secondi per un'ora di gioco è
   rumore, non feedback. Gli effetti stanno solo dove succede qualcosa — una
   scelta, una risposta del quiz, le previsioni spedite, un pannello che si
   apre. `npm test` controlla che dentro `VN.step` non finisca un `suona`.
   **Il tocco secco (`tap`) segna un impegno preso**: entrare in un livello del
   quiz ("comincia") e scegliere una risposta ai pronostici in S5 — lì ha
   sostituito `scelta` (`sfx-ui-select`), che restava un rumore di clic da
   mouse su una scelta che invece pesa. `scelta` resta sul resto delle scelte
   di tono, dove il tocco non impegna a niente di misurabile. Nel terminale non
   si clicca, si scrive: `tastiera()` suona un colpo di tasti al massimo ogni
   140 ms mentre si digita (non uno per lettera), `tastiera_intro` quando il
   campo si accende e `invio` quando si conferma.
2. **La musica non riparte a ogni scena.** `musicaScena()` confronta il brano
   chiesto con quello che suona: se è lo stesso non tocca niente. Le quattro
   scene dell'atto 1 condividono il brano, e il giocatore non deve sentire uno
   stacco passando dall'ingresso alla registrazione. Quando cambia davvero, il
   vecchio sfuma mentre il nuovo entra (`sfuma()`, non una transizione CSS: il
   volume di un `<audio>` non è una proprietà CSS).
3. **Il primo suono aspetta il primo tocco.** Sul telefono il browser rifiuta
   qualunque riproduzione prima che la persona tocchi lo schermo: la prima
   musica resta in `musAttesa` e parte al primo `pointerdown`. Insistere con un
   timer non serve a niente.
4. **Sul telefono il volume di un `<audio>` non si cambia da codice.** iOS
   ignora `nodo.volume`: mettere la musica a zero **non** la zittisce. Quindi
   con l'interruttore su OFF il brano **non parte proprio** (`musicaScena()`
   prepara il nodo e si ferma lì); a riaccenderla pensa `aggiornaVolumi()`, che
   fa partire quello stesso nodo. Senza, bastava cambiare stanza e la musica
   tornava a volume pieno col pannello che diceva OFF.

**Gli applausi arrivano dopo l'annuncio, non sul tocco.** Il giocatore sceglie,
il personaggio annuncia, e **poi** (420 ms) la platea reagisce: è la reazione a
quello che ha sentito, non un rumore di conferma del bottone. Le varianti corte
girano a caso e non si ripetono due volte di fila (`ultimoSfx`); quelle lunghe
stanno solo ai momenti grossi — l'apertura dei pronostici e i tre
macroargomenti chiusi.

I volumi (musica ed effetti separati, più il muto) stanno in `fl_audio`, **non
nel salvataggio della partita**: chi ricomincia da capo non si ritrova la
musica riaccesa. Due trappole già prese:

- **La musica parte a 0.3, non a 0.6.** È un tappeto sotto la voce. Il valore
  salvato porta una `v`: cambiando `AUDIO_VERSIONE` chi aveva già giocato
  riparte dalla taratura nuova, altrimenti la modifica non la vede nessuno di
  quelli che hanno già toccato il selettore.
- **Il pannello non si chiude mentre si trascina un cursore.** Il dito che
  parte dalla manopola e finisce fuori dal riquadro faceva sparire il pannello
  a metà regolazione, e sembrava che il cursore fosse rotto. La percentuale
  scritta di fianco all'etichetta serve a vedere che si sta muovendo.

In `npm test` l'audio non esiste (jsdom ha `<audio>` ma non sa suonare, e
`play`/`pause` sporcano l'uscita): `CI_SONO_SUONI` lo riconosce con lo stesso
segnale di `siDecodifica()`, e il gioco gira identico, muto.

**I file si preparano con `tools/prepara_audio.py`**, non si committano come
escono dal programma di montaggio: i 42 MB consegnati sono diventati 9,5 MB
(MP3 mono, volume pareggiato con `loudnorm`, silenzio iniziale tagliato,
copertina buttata — un MP3 con dentro un disegno pesa il triplo dell'audio).
Chi aggiunge un file lo mette nella mappa dello script e rilancia.

## Lo schermo del palco si accende da solo (S5)

I tre pannelli di `bg_palco_schermo_categorie` si riempiono con l'emblema del
macroargomento (`prop_emblema_categoria_*`) **alla prima scelta** di quella
categoria, non a domande finite. Sono due informazioni diverse e vanno tenute
separate: i bottoni della griglia dicono a che punto sono le domande
(`categoriaFinita()`), lo schermo dice dove il giocatore è già stato
(`VN.state.categorie_visitate`, che entra nel salvataggio).

1. **Non è interfaccia, è scenografia.** Gli emblemi stanno in un layer suo
   (`#emblemi`), non dentro i `.gcell` e **non in `#propwrap`** — lì durante le
   domande c'è già la slide della categoria, e riusare lo slot le fa a pugni.
   Il layer sta sotto personaggi e box (z-index 0 contro 1 e 2) e non prende
   tocchi.
2. **Vivono su un fondale solo.** Si accendono e spengono da `setBg()`: su
   qualunque altro fondale resterebbero appesi in aria. Con la dissolvenza
   arrivano insieme al fondale nuovo, non prima.
3. **Le posizioni sono in percentuale dello schermo, non dell'immagine.** Il
   fondale è ritagliato in `cover`: le percentuali del file sorgente non
   corrispondono. Si misurano guardando il gioco a 390x844.
4. **`azzeraVars()` copia, non condivide.** `categorie_visitate` è un oggetto
   dentro `story.vars`: assegnandolo per riferimento, una partita nuova si
   ritroverebbe addosso quella di prima e scriverebbe dentro i dati della
   storia. Vale per qualunque variabile composta che si aggiunga lì.

## La platea non avrà mai i suoi layer

`pla_*` (idle, applausi, risata, silenzio, coro) **non si disegnano**: è una
decisione presa, non un lavoro in sospeso. Il motore sa già mostrarli e le
reazioni di S5 ci girano intorno: si lascia tutto com'è, senza compensare
l'assenza con altro. **Non rimetterli in `meta.assetiInArrivo`.**

## Il regolamento (zona 3) contiene anche la parte legale

Privacy, indipendenza da Apple, marchi e contatti stanno dentro il regolamento
sotto un separatore, **non** in una voce di menu propria, e **nessuna sezione
si chiama "note legali"** (vietato esplicitamente).

1. **Non è una scena.** L'hotspot ha `apre`, non `goto`: si mostra sopra la
   lobby, alla chiusura il giocatore è dov'era.
2. **Leggere non deve toccare la partita.** Il test fotografa `VN.state` prima
   di aprire e lo confronta dopo aver chiuso.
3. **Quello che c'è scritto deve essere vero.** L'elenco dei dati raccolti è
   esattamente il payload per Supabase; i 30 giorni di conservazione sono una
   promessa mantenuta a mano (procedura SQL in fondo a `docs/backend.sql`). Se
   cambia il payload, cambia anche il testo.

## Dialoghi: se una meccanica è già spiegata, non si rispiega

L'utente ha fatto un giro di sfoltimento sui dialoghi: via la domanda di regia
su Craig, via la spiegazione dei moltiplicatori in bocca a Peter, via la scena
di commento dopo il pannello dei moltiplicatori, battute più corte in camerino,
dietro le quinte, teleprompter e lobby.

La regola che ne resta: **quando una battuta serve solo a spiegare una
meccanica già spiegata altrove** (il regolamento, l'interfaccia stessa),
nell'ordine — si toglie, oppure si riduce a una riga sola, oppure la si lascia
spiegare all'interfaccia. **Il ritmo vale più della completezza**: si legge su
un telefono.

## Il linguaggio: mai "schedina bloccata"

Al giocatore non si dice mai "schedina bloccata", "la schedina è chiusa",
"previsioni bloccate". Si dice che le previsioni sono **fatte, confermate,
registrate, concluse**. Le variabili interne restano `locked` e compagnia: la
regola riguarda il testo che si legge a schermo (dialoghi, bottoni, modali,
countdown, card, regolamento, HTML).

## Il cartello di attesa su fantaliberty.com

Fino all'apertura il dominio pubblico non apre il gioco: mostra un cartello in
pixel art (sipario socchiuso, palco vuoto, faro) disegnato **solo con CSS**,
niente immagine da scaricare.

1. **Non è un controllo di accesso, è un'insegna.** Il controllo sta nel
   browser: chi legge il sorgente entra lo stesso. **Non va raccontato
   all'utente come una protezione.**
2. **Vale solo su `fantaliberty.com` / `www.fantaliberty.com`** (elenco
   `DOMINI_PUBBLICI` in `index.html`). L'indirizzo di sviluppo (github.io) e la
   build offline da `file://` restano aperti — chi allarga l'elenco blocca
   anche il proprio modo di provare il gioco. Scavalcano il cartello `?apri`,
   `?dev` e `?scene=`: l'utente il gioco lo prova dal dominio pubblico, quindi
   chi tocca quel controllo non deve togliere quelle porte.
3. **Si toglie da solo** a `APERTURA` (2 settembre 2026, 10:00 ora italiana):
   non serve un altro deploy per aprire il sito, ma spostare la data è una
   modifica sola in `index.html`.

Dopo il cartello c'è **la porta d'ingresso** (`#home` in `index.html`): il
fondale `bg_intro` e un bottone GIOCA, e basta. Non è una schermata di
caricamento: i dati si scaricano intanto, e il motore parte **al tocco**
(`avvia()` aspetta tutti e due). Quel tocco è anche il primo gesto sulla
pagina, cioè l'unico momento in cui il telefono concede l'audio: il bottone
chiama `VN.sbloccaAudio()` prima di far partire la sigla, se no il jingle dello
studio esce muto. **Chi la toglie "perché tanto c'è già la sigla" perde l'audio
all'apertura.** I tool (`verifica-transizioni`, `screenshots`) aprono la pagina
con `?subito`, che la salta; la saltano anche `?dev` e `?scene=`.

Il motore non parte proprio quando il cartello è su (`return` prima di
`VN.boot`): niente salvataggi toccati, niente richieste ai JSON.

## Il ponte http → https: il salvataggio è legato all'origine

Il salvataggio del browser vive **sotto un'origine**, e `http://fantaliberty.com`
e `https://fantaliberty.com` per il browser sono due siti diversi. Chi aveva
giocato in chiaro, riaprendo in sicuro non trovava più niente: sembrava che la
partita fosse sparita, e invece era di là. È successo davvero, il giorno del
lancio, a parecchie persone.

Il redirect a https (primo `<script>` di `index.html`) impedisce nuovi danni ma
**non restituisce niente**: da https il localStorage di http non si legge, e non
si può nemmeno aprire quella pagina in un iframe (è contenuto misto, il browser
lo blocca). L'unico istante in cui quei dati sono raggiungibili è **mentre la
pagina http è ancora aperta**. Per questo il redirect, prima di saltare, si
porta dietro le chiavi `fl_*` nel **frammento** dell'indirizzo (`#ponte=…`), che
il browser non manda al server; di là il pacco viene scaricato e l'indirizzo
ripulito con `history.replaceState`.

Tre cose da non rompere:

1. **Deve restare il primo script della pagina.** Gira prima che il motore
   legga il salvataggio: dopo, sarebbe già stato deciso che la partita non c'è.
   `npm test` controlla che stia prima del `<meta name="viewport">`.
2. **Non copre mai una chiave già presente di qua.** Chi ha già ricominciato da
   capo su https ha un salvataggio nuovo e più avanti: sovrascriverlo vorrebbe
   dire cancellargli la partita in corso per restituirgli quella persa — il
   danno che il ponte ripara, fatto al contrario. Si importa solo ciò che di qua
   manca, chiave per chiave.
3. **Chi aggiunge una chiave `fl_*` la aggiunge all'elenco `CHIAVI`**, o quella
   non passa il ponte.

**Accendere "Enforce HTTPS" su GitHub Pages spegne il ponte**: il redirect lo
farebbe il server, la pagina http non verrebbe più eseguita, e i dati rimasti di
là diventerebbero irrecuperabili per sempre. Va acceso solo quando si decide che
non c'è più niente da recuperare.

## Errori già fatti (per non ripeterli)

**Layout e layer, invisibili ai test e visti solo a schermo:**

- `#stage` con `overflow:hidden` lascia comunque un contenitore scorribile (il
  focus su un bottone parzialmente fuori schermo scorreva tutta la scena) —
  serve anche `overflow:clip`;
- un overlay con `display:grid`+`place-items:center` dimensiona la riga sul
  contenuto, quindi `max-height:100%` non limita niente — usare **flex**, dove
  l'altezza del genitore è definita;
- in una colonna flex i figli si stringono prima che il contenitore scorra
  (sezioni chiuse diventavano pillole vuote) — serve `flex:none`;
- `goScene` teneva su il sipario nero se la scena conteneva un `title` fra
  **tutti** gli step, invece di controllare solo se **comincia** su un cartello
  (il finale ha i titoli di coda in fondo);
- `#nero` sta **sopra** `#curtain`: un cartello che arriva dopo una dissolvenza
  al nero resta coperto anche se è nel DOM — va tolto il velo quando entra un
  cartello a schermo pieno.

**Sequenze e tocchi:**

- **`typeLines` non è una callback di completamento**: assegna `done` a
  `pending` ("cosa fare al prossimo tocco"). Per una sequenza automatica (i
  titoli di coda) serve il flag `subito`, che chiama `done()` subito.
- **Un tocco su una sequenza automatica deve accelerarla, mai cancellarla.** La
  prima versione dei titoli di coda è stata bocciata perché un tap li faceva
  sparire. Ora un tocco mette la sequenza in modalità veloce (i blocchi restano
  meno tempo ma **compaiono tutti**), l'ultimo blocco non sfuma mai da solo
  (resta con la freccia finché non arriva l'ultimo tap), e **il tocco non fa
  sparire il blocco che si sta leggendo**: aspetta comunque `TIENI_VELOCE`
  (~0,9s) prima di sfumare. Timing attuale: ~12s senza toccare, ~5,5s toccando
  di continuo — cambiarli tocca `titoliDiCoda` in `engine.js` e i `tieni` dei
  blocchi in `story.json`.
- **Le due schermate d'avvio (sigla e barra) si guardano e basta**: niente
  freccia, niente tocco che salta. Sono corte apposta (~4s e ~3s): se si
  allungano, torna la voglia di saltarle. Anche il cartello d'apertura non si
  salta finché non ha finito di scriversi — il tocco durante la scrittura non
  fa niente (`senzaSalto` in `typeLines`, e `skip()` che si ferma prima) — e
  solo dopo arriva la freccia. `ritmo` sullo step `title` scala insieme
  velocità di scrittura e pause.

**iOS:**

- **Il campo del terminale non si può scrivere piccolo.** Sotto i 16px di font
  iOS ingrandisce la pagina appena lo si tocca. Per farlo uguale al box (~10px)
  `#ti` resta a 16px ed è scalato a 0.6 dentro `#tiwrap`, che è l'unico a
  contare per il layout. Abbassare il `font-size` "per semplificare" riporta lo
  zoom.
- **Il doppio tocco del browser ingrandiva la pagina.** Il gioco si gioca a
  tocchi ravvicinati e Safari li leggeva come "ingrandisci qui", lasciando la
  scena zoomata a metà. Si toglie con `touch-action:manipulation`, che va messo
  **sia** su `body` **sia** su `#stage`: non si eredita, lo decide l'elemento
  che riceve il tocco. (`user-scalable=no` nel viewport iOS lo ignora dal 2016:
  non è quella la strada.)

**Processo:**

- **Le sostituzioni di stringhe lunghe su questo file falliscono in silenzio.**
  Apostrofi curvi e accenti spesso non combaciano e `str.replace`/`Edit` non
  protestano. **Dopo ogni modifica a CLAUDE.md, ricontrollare con un `grep` che
  il testo nuovo ci sia davvero.**
- **Un'estensione sbagliata rompe `npm test` in silenzio** finché qualcuno non
  lancia il test. Quando una conversione PNG→WebP sostituisce un asset,
  controllare che `story.json` punti alla nuova estensione.
- **Chiudere una PR draft con dei commit ancora in sospeso.** Se pushi altri
  commit dopo che l'utente ha già cliccato Merge, restano fuori da `main` —
  controllare `git log --oneline origin/main..HEAD` prima di darlo per
  scontato.
- **`npm test` può contenere asserzioni che documentano uno stato temporaneo**
  (es. "personaggio ancora senza sprite"). Se una modifica lo rende vero, il
  test va aggiornato insieme al codice, non aggirato.
