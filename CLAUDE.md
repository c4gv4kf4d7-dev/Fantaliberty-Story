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

## La registrazione: il Mac sta dentro il fondale

`bg_macintosh` ha il Mac gia' disegnato: la registrazione **non** appoggia
`prop_mac_terminale` sopra la scena. Il terminale (i sei campi) lo incolla il
motore sopra il vetro del CRT calcolando i pixel veri dell'immagine disegnata
(`SCHERMO_FONDALE` + `ancoraTerminale()`): con le percentuali dello stage il
testo finiva fuori dal vetro su ogni finestra di forma diversa dal telefono,
perche' il fondale e' `cover` e viene ingrandito e tagliato.

Due cose che vanno insieme, e che sono gia' state smontate una volta per
sbaglio (poi rimesse): lo step `prop` con `"fondale": true` e la classe CSS
`#propwrap.fondale`. Se il fondale viene ridisegnato, `SCHERMO_FONDALE` va
rimisurato — e il pannello deve coprire il vetro **tutto**: rientrando anche
di poco spunta sotto la finestra di sistema disegnata, e il CRT sembra acceso
a meta'.

Altre due, imparate a schermo:

- **Il fondale e' ancorato in basso** (`"bgFx": "basso"`, sia in registrazione
  che sul badge). Su Safari le barre del browser accorciano la finestra, il
  fondale e' `cover`, e ancorato in alto il Mac scendeva finche' il box del
  dialogo non gli finiva davanti. Ancorato in basso quello che avanza si taglia
  dal soffitto, che non serve a niente. `ancoraTerminale()` deve saperlo:
  legge la classe `basso` per capire dove sta il bordo dell'immagine.
- **All'accensione il Mac non mostra il terminale.** Mostra `prop_mac_hello`
  — MacPaint col "hello." scritto a mano, l'immagine con cui il Macintosh si e'
  presentato nel 1984 — e cede il posto al terminale solo quando nome e cognome
  sono dentro (step `prop` con `"schermata"`). E' un omaggio chiesto
  dall'utente, non una schermata di caricamento: non va tolto perche' "tanto il
  terminale c'e' gia'".
- **Lucas non si rimpicciolisce.** E' alto uguale in ogni scena, ed era stato
  ridotto proprio qui per non coprire il terminale: si vedeva, ed e' stato
  bocciato. Se copre lo schermo si sposta di lato (`right`), non si accorcia.

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
3. **sulla scheda ci sta chi e', non cosa fa.** Una riga di descrizione e una
   battuta sua fra virgolette (`battuta` in `story.stili`): lo stile si deve
   vendere da solo, e' l'unica cosa su cui si sceglie. Le due righe stanno su
   una riga ciascuna e i quattro cartellini vengono alti uguali — se si
   allungano, saltano a due righe e il carosello balla a ogni freccia.
   Attenzione a `max-width` in em qui: si calcola sul font piccolo
   dell'elemento, non su quello della scheda, e con un valore in em la
   descrizione veniva incolonnata a tre parole per riga;
4. **niente meccaniche sulla scheda.** Il perk del quiz si spiega a S8, non
   qui: il carosello lo rimostra solo se lo step chiede `etichettaPerk` (S3
   non lo chiede). A S8 lo dice Peter, con una battuta per stile (`by:
   "stile"`) prima di cominciare: e' l'unico posto dove il perk viene
   spiegato, quindi non va tolto pensando che si sappia gia'.

Attenzione al piano dei layer: `#carosello` sta a `z-index:1`, **sotto**
`#boxwrap` (2). Alzandolo, il bottone "Sono io" smette di essere premibile
in silenzio — il test in jsdom non se ne accorge.

Nel carosello si mostra **`palco_attesa`**, non `idle_camerino`: le pose del
palco sono ritagliate strette attorno alla figura, quindi a `object-fit:contain`
riempiono l'inquadratura invece di lasciare margini vuoti, e sono le stesse che
il giocatore si vedra' addosso in S5 — quello che scegli e' quello che avrai.
`idle_camerino` resta dichiarato in `story.stili` ma non lo usa piu' nessuno.

Lo stesso sporco ce l'aveva **Susan** (schegge chiuse nella crocchia e sul
padiglione della cuffia). Sui personaggi pero' il filtro delle toppe grandi non
si puo' usare: li' il bianco pieno e' anche il bianco degli occhi, i denti, la
foto sul badge e la suola delle scarpe. Va usato solo `--bordi`, che due guardie
tengono buono — quanto la scheggia sta **in dentro** (una scheggia resta entro
30 px dal profilo, occhi e denti stanno a 100-210) e quanta **compagnia chiara**
ha attaccata (una suola fa parte della scarpa, 1900 px di chiaro; una scheggia
in mezzo ai capelli scuri ne ha 300). Con `--isola` si abbassa la soglia del
chiaro: **200 solo su chi ha i capelli scuri** (Susan, i quattro stili), mai su
Peter, che i capelli li ha bianchi e ci perderebbe le ciocche.

Gli sprite hanno due difetti di ritaglio diversi, e servono due passate:
`tools/togli_bianchi.py` da solo prende le **toppe grandi** di fondo chiuse
dentro il disegno; `--bordi` prende i **puntini e i filetti sul contorno** (fra
le ciocche dei capelli dell'Hawaiano e dello Showman, lungo le gambe). Il
secondo non decide per colore ma per **intorno**: chiaro e scialbo, con disegno
scuro attorno, a un passo dalla trasparenza. E' l'unico criterio che lascia in
pace i jeans e le scarpe bianche della Drip, la camicia dello Showman e i denti
— una prima versione che guardava solo il colore se li mangiava tutti, e si e'
visto **solo** nell'anteprima in magenta. Guardarla sempre prima di scrivere.

I quattro sprite avevano anche **residui di sfondo bianco chiusi dentro il disegno**
(puntini fra le ciocche dei capelli, una chiazza fra le gambe, una fra l'asta
del microfono e i pantaloni): sul fondale scuro si leggono come sporco. Si
tolgono con `tools/togli_bianchi.py`, guardando **sempre** l'anteprima in
magenta prima di scrivere — su canottiera, camicia e scarpe bianche il confine
e' sottile.

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

Chi e' **scenografia** invece non se ne va mai: Peter dorme al suo tavolino e
deve restarci anche quando la zona non parla piu'. Lo dice `"resta": true`
nella zona (le due zone del quiz ce l'hanno). Senza, tornando li' il tavolino
era vuoto e non si capiva piu' dove fosse il quiz.

**Le frecce per cambiare zona (`#hubnav`) stanno fuori da `#boxwrap`, in un
punto fisso dello schermo (66% dell'altezza).** Prima stavano dentro il box e
si muovevano con lui: su quando Francesca parlava, giu' nella zona muta — il
giocatore se le trovava ogni volta in un posto diverso, ed e' stato bocciato.
Il 66% e' sotto gli hotspot dell'hub (finiscono al 66%) e sopra la fascia del
dialogo (al massimo arriva all'80%): sono sempre li', con o senza fumetto.
In una zona muta si spegne solo il fumetto, con la classe `muto` su `#boxwrap`.

## Il pulsante Esci: solo dove non c'e' gia' un punto di pausa

`#btnEsciGioco` (in alto a sinistra, come il selettore audio) compare **solo**
da `[S2]` (`aggancio`) al ritorno in lobby che segue la conferma delle
previsioni — mai prima, mai dopo. `aggiornaBottoneEsci()` in `engine.js`
decide con due variabili di `VN.state`, non guardando il nome della scena:
`raggiunto_s2` (si alza al primo step di `aggancio`, non si riabbassa mai) e
`post_lobby_visto` (si alza quando la sequenza di ritorno post-previsioni e'
stata vista). E' chiamata da un solo punto, l'inizio di `run()`, cosi' resta
aggiornata a ogni cambio di scena e a ogni step senza dover ricordarsi di
chiamarla da ogni punto che tocca quelle due variabili.

**Il resto del gioco non ha bisogno di questo pulsante**: prima di `[S2]` la
lobby stessa e' gia' un posto sicuro dove fermarsi, e dopo il ritorno
post-previsioni countdown/quiz/Campus Run hanno gia' i loro punti di ripresa
— il countdown esiste apposta per essere lasciato e riaperto. Aggiungerlo
anche li' sarebbe una seconda via verso un posto che una pausa ce l'ha gia'.

Il tocco apre due domande in sequenza (`mostraModale()`, riusato cosi' com'e',
non un sistema di dialoghi a parte):

1. **"Vuoi salvare i progressi?"** — SI, SALVA usa **lo stesso** salvataggio
   locale del checkpoint automatico (`VN.saveNow()`/`VN.hasSave()`), non un
   secondo sistema. La differenza e' che qui il giocatore lo chiede apposta,
   quindi `VN.saveNow()` non deve rifiutarsi solo perche' non ha ancora fatto
   una scelta vera (`VN.progressed`): `tentaSalvataggioEsci()` lo forza a
   `true` prima di salvare, perche' arrivare a `[S2]` e' gia' un punto valido
   da cui riprendere. Se il salvataggio fallisce (quota piena) si avvisa e si
   lascia riprovare, senza toccare lo stato in memoria. **NO** non tocca
   proprio niente: se c'era gia' un salvataggio di prima, resta li' intatto.
2. **"Cosa vuoi fare?"** — TORNA ALLA LOBBY o ESCI DAL GIOCO. Sono due
   domande separate apposta: salvare e uscire sono decisioni indipendenti.

**"Torna alla lobby" e' una pausa narrativa, non un reset.** Lo stato resta
quello che era (avatar, stile, previsioni gia' fatte, tutto), e Francesca dice
**una riga sola, sempre la stessa** — mai l'intro normale ("Io sono
Francesca...") ne' le congratulazioni post-previsioni, che sono per chi ci
arriva per la prima volta o dopo aver chiuso davvero la schedina. Il
meccanismo e' `VN.state.esci_ritorno`, un flag a un colpo solo: lo alza
`tornaAllaLobbyDaEsci()` prima del `goScene('lobby')`, lo consuma
`showHub()` (che lo rispegne e insieme segna la lobby come gia' girata, cosi'
non tocca rifare lo swipe del tutorial per riaprire la tenda). Le due sequenze
esistenti in `story.json` (l'intro pre-previsioni e le congratulazioni
post-previsioni) hanno entrambe `esci_ritorno: false` in coda al loro `"se"`:
senza, ripartirebbero da capo ogni volta che si rientra dal menu Esci.

**"Esci dal gioco" e' una `VN.boot()` con `scene: null`, non un reset a mano.**
Fa esattamente quello che farebbe riaprire l'app: se c'e' un salvataggio (per
essere arrivati a questo punto, solo se il giocatore ha scelto SI, SALVA
poco prima) lo trova da solo e chiede "vuoi riprendere?" — nessun bisogno di
duplicare quella logica qui. Non chiama mai `VN.clearSave()`.

Attenzione pero': **un riavvio dentro la pagina non fa piazza pulita da solo.**
Al primo caricamento lo schermo e' vuoto perche' la pagina e' nuova; qui no, e
la domanda "vuoi riprendere?" restava scritta sopra la scena di prima —
fondale, personaggio, box, oggetti — che e' esattamente il contrario di
"riaprire l'app". Per questo `VN.boot()` spegne `#npc`, `#boxwrap`, gli
oggetti, i due fondali (con un pixel trasparente, non togliendo `src`: un
`<img>` senza `src` disegna l'icona di immagine rotta), la musica, e rifa'
`aggiornaBottoneEsci()`. Chi aggiunge un layer nuovo alla scena lo aggiunge
anche li'.

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

Vale anche al contrario, ed e' la stessa trappola: **un'animazione
`forwards` non si spegne togliendo la classe che accende il nodo.** `#avatar`
si vede per `.on`, ma `.entra` finisce a opacita' piena e ce la lascia: per
mesi lo step che nascondeva il giocatore toglieva solo `on`, e il giocatore
restava a schermo davanti alla sagoma del CEO. Si tolgono **insieme**
(`spegniIo()`).

**La figura del giocatore non attraversa i cambi di scena**: `goScene()` la
spegne sempre, e ogni scena che la vuole la dichiara con uno step `io` come
prima cosa (quinte, keynote, argomenti, argomento, teleprompter, finale).
Senza, bastava una scena che si dimenticava di nasconderla per ritrovarsela
addosso altrove — in lobby, davanti a Francesca, dopo le previsioni.

Regola (violata due volte con lo stesso sintomo — il personaggio sparisce
con lo sprite giusto caricato): **`#npc` porta una sola animazione alla
volta.** Le classi di reazione si tolgono da sole quando finiscono, e
`showChar()` le ripulisce comunque. Chi aggiunge un'animazione nuova su
`#npc` la mette `forwards` **e** controlla chi altro scrive `animation` su
quel nodo.

**`fisso` non e' per sempre.** `#npc.fisso` spegne la transizione di misura, e
la mette `inquadra()` sulle pose inquadrate sul viso (li' il riquadro cambia a
ogni battuta e vederlo scorrere sembra un rimpicciolimento). Restava pero'
addosso al nodo per tutto il resto della partita — Francesca e' inquadrata e si
incontra presto — e da li' in poi ogni cambio di misura era un salto secco per
chiunque. Adesso `showChar()` la toglie sulle pose non inquadrate, e la rimette
per un istante su chi sta **entrando**: chi entra prende la misura nuova subito,
invece di vedersi crescere partendo da quella del personaggio di prima. Il
risultato e' che scivola solo chi e' gia' in scena e cambia posto — in pratica
Peter, fra il dialogo e i pannelli del quiz.

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

**Il metro di paragone e' Lucas.** Francesca passa dall'ancoraggio sul viso
(`volti` nel cast + `inquadra()`), che le mette la faccia alta come la sua;
sopra c'e' `voltoScala` (0.85 per lei), perche' il viso uguale non basta quando
la testa non finisce col viso — con l'hijab veniva molto piu' grossa di quella
di Lucas. Peter invece non ha `volti`: va a `scala`/`scalaHub`, e nella lobby
la zona dichiara 0.85. Chi ritocca uno di questi numeri li guarda **accanto a
Lucas**, non da soli.

`#npc` è tarato su una **figura intera** (56% altezza). Prima di collegare
uno sprite nuovo, guardare **cosa inquadra** — figura intera, mezzo busto,
solo testa — e dare al `show` la misura giusta (es. un primo piano di sola
testa va su `height` piccola con `bottom`/`right` per farlo entrare da un
lato, non a schermo pieno). Il test non se ne accorge, si vede solo negli
screenshot.

## Cosa arriva a Supabase, e quando

Il payload di `payload()` in `engine.js` e' un contratto con **tre** posti che
devono restare d'accordo: la tabella in `docs/backend.sql`, l'elenco dei dati
raccolti dentro il regolamento (zona 3 della lobby) e il test che li confronta.
Chi aggiunge o toglie un campo li aggiorna tutti e tre — `npm test` fallisce se
l'elenco dei campi cambia da solo.

- **Si spedisce due volte ma la riga e' una sola**: alla conferma delle
  previsioni e di nuovo quando si assegnano i moltiplicatori del quiz, che
  arrivano giorni dopo. Le due spedizioni portano lo stesso `run_id` (generato
  una volta, salvato con la partita) e Supabase riscrive la riga invece di
  aggiungerne un'altra. Perche' regga serve l'indice unico su `run_id` —
  senza, l'upsert non ha su cosa agganciarsi e tornano le due righe, in
  silenzio. Sta in `docs/backend.sql`.
- **La scrittura non passa da un POST diretto sulla tabella, passa dalla
  funzione `upsert_run`** (SECURITY DEFINER, in `docs/backend.sql`; il motore
  la chiama in `invia()` con `POST /rest/v1/rpc/upsert_run`). Non e' un
  capriccio stilistico: un POST diretto con `Prefer:
  resolution=merge-duplicates` fa scattare in Postgres un `INSERT ... ON
  CONFLICT DO UPDATE`, e per sapere se la riga col run_id esiste gia' Postgres
  deve poterla **leggere** secondo le policy RLS di chi chiama — anche con
  `return=minimal`, che evita solo di rispedirla nella risposta, non il
  controllo. La chiave anon non ha (apposta) una policy di select su `runs`,
  quindi quel controllo falliva sempre, non solo sui duplicati: **ogni singolo
  invio veniva rifiutato con 401/42501** ("new row violates row-level security
  policy"), scoperto il 1 settembre 2026 la sera prima del lancio. Dare ad
  anon una select larga avrebbe risolto ma reso leggibile l'intera tabella con
  un GET — la funzione bypassa la RLS del chiamante senza concederle nessun
  permesso di lettura in piu'.
- **`anni` e' il codice della fascia, non l'etichetta**: `'0'` = 0-2 anni,
  `'1'` = 3-7, `'2'` = 8-12, `'3'` = piu' di 12. Serve al `rookieBonus`.
- **`npm run supabase` dice se la schedina viene accettata davvero.** Non
  legge piu' colonna per colonna con una GET (anon non ha nessun grant diretto
  sulla tabella, quindi risponderebbe sempre "permission denied" a prescindere
  dallo schema): manda una schedina di prova vera alla funzione `upsert_run`,
  la stessa strada del gioco, e lascia una riga taggata (`nome:
  "_controllo_supabase"`) da cancellare a mano. Va lanciato dopo ogni campo
  nuovo e prima di pubblicare: il 31 agosto 2026 mancavano `quiz`, `email` e
  `runner`, cioe' **nessuna schedina sarebbe arrivata** e il gioco non
  l'avrebbe detto a nessuno.
- **Un rifiuto e' muto per il giocatore ma non invisibile**: la schedina torna
  in coda (`fl_nexus_da_inviare`) e riparte al prossimo avvio, e il motivo
  finisce in console. Il caso tipico e' una colonna che manca nella tabella
  (400, `PGRST204`): `docs/backend.sql` ha gli `alter table` pronti.
- **La chiave nel sito puo' solo chiamare `upsert_run`.** Non ha nessun grant
  diretto sulla tabella: non legge, non modifica, non cancella scavalcando la
  funzione. La verifica dal vivo e le query di cancellazione stanno in fondo a
  `docs/backend.sql`.
- **`cognome` e' facoltativo e non e' il nickname.** Si chiede subito dopo il
  nome nel terminale (`opzionale:true` sullo step `input` — il bottone resta
  premibile a campo vuoto, vedi `showInput`). Serve solo a distinguere due
  giocatori con lo stesso nome nei punteggi: si mostra come iniziale
  puntata, "Lorenzo B.", mai per esteso — il nickname con cui il gioco si
  rivolge al giocatore resta `nome`, da solo.

## I punteggi: il conto finale non lo fa il gioco

L'app salva e spedisce la **somma secca** delle risposte (`totale()`), e basta.
Moltiplicatore pool, moltiplicatori del quiz e bonus si applicano **a mano dopo
il keynote del 9 settembre**, sui dati arrivati a Supabase: la formula completa
sta in `docs/script-master.md`, e chi la cambia deve cambiarla li'.

Tre cose tarate insieme (agosto 2026, misurate con
`tools/simula_partite.py`, che fa giocare 30 giocatori finti):

- **bonus controcorrente +1, non +2.** Con +2 chi rischiava su ogni domanda
  chiudeva il 16% sopra chi andava sul sicuro solo per l'etichetta scelta. Ora
  il vantaggio del pronostico coraggioso arriva dal **moltiplicatore pool**
  (×1.5 se l'hai scelto in pochi), che e' la parte giusta: paga l'aver visto
  bene, non l'aver scelto la casella marcata "controcorrente". Se si tocca il
  bonus, i `pt` di `domande.json` vanno ricalcolati — `npm test` li ricontrolla
  uno per uno dalla formula.
- **micro-eventi ±1, non ±3.** A ±3 la fortuna spostava 3,7 posizioni in
  classifica, quanto tutto il quiz di Peter (3,9). A ±1 sposta 1,7 e il quiz
  5,4.
- **il punteggio di un micro-evento (e dell'evento personale dello stile) e'
  fisso, non a caso.** Ogni opzione vale il segno del suo `editoriale` in
  `domande.json` (`puntoMicroEvento()` in `engine.js`) — la stessa risposta
  vale lo stesso punto a ogni partita e per ogni giocatore. Una versione
  precedente rimescolava +1/0/-1 fra le tre opzioni a ogni attivazione,
  apposta perche' chi rigiocava non imparasse "la B e' quella buona": decisione
  poi ribaltata dall'utente, che vuole i punteggi definiti dall'autore, non
  casuali. Il giocatore continua a non vederli — lo dice solo Susan, a parole.
- **niente bonus per gli intermezzi completati.** La vecchia formula ne
  chiedeva cinque, il giro ne fa giocare quattro (uno all'apertura del keynote,
  uno per macroargomento): era un bonus che nessuno poteva prendere.

I **bonus personali** (`rookieBonus` sugli anni in Apple, `deviceBonus` sulla
generazione dell'iPhone, insieme al massimo +2) si calcolano da `anni` e
`device`, che il giocatore ha gia' dato alla registrazione e che sono gia' nel
payload: non aggiungono domande e non cambiano il regolamento. Valgono poco
apposta — servono a sciogliere i quasi pari merito, non a decidere chi vince.

## Il quiz di Peter è l'eccezione dichiarata alla regola d'oro

In S5 la reazione della platea non correla **mai** con la risposta (se lo
facesse, il gioco suggerirebbe i pronostici). In S8 succede il contrario,
apposta: le domande sul passato Apple hanno risposta verificabile, quindi
Peter annuisce o scuote la testa. Chi tocca S8 non deve "sistemare" quel
feedback per uniformità con S5.

**Il tentativo si paga entrando, non uscendo.** Appena si entra in un livello
il tentativo e' consumato e salvato: chi vede che sta andando male e chiude
l'app non se lo ritrova intatto. Contarlo a fine livello — com'era prima — lo
rendeva aggirabile. L'unico che ne recupera uno e' l'hawaiano, e solo col suo
perk (`seconda_chance`), che glielo restituisce.

Altre due cose di S8 che sembrano dettagli e non lo sono:
- **il testo di una domanda non passa dal typewriter** — il timer parte al
  render, scrivere a macchina sarebbe una penalità invisibile;
- **la griglia dei livelli convive con `#choices`** — per questo `#griglia`
  sta prima nell'HTML e `#boxwrap` prende la classe `quizhub`.

**Peter finisce con il tavolo tagliato, e quel taglio deve stare dietro
l'interfaccia.** Non e' una figura intera: lo sprite si chiude con il piano del
tavolino tagliato di netto, e sopra il pavimento chiaro della lobby quel bordo
si legge come un tavolo che galleggia a mezz'aria. Quindi la sua misura dipende
da quanto e' alto quello che ha sotto, e in S8 sono due:

- `bottom: 34%` quando sotto c'e' un pannello — griglia dei livelli, domande
  (barra del tempo + risposte), moltiplicatori: il taglio finisce dietro al box;
- `bottom: 13%` quando resta solo il box del dialogo, che e' basso: la
  presentazione del quiz e la riga di fine livello. Sullo step del livello e'
  `bottomDialogo`, e lo usa `fine()` in `engine.js`. Misurato sul box piu'
  corto, dal telefono piu' piccolo al piu' grande.

Si sposta **due volte in tutto**: quando si apre la griglia la prima volta, e a
fine livello. Durante le domande non si muove mai — e per questo **il verdetto
non toglie le risposte, le spegne** (`#choices.fermo`, e il box tiene l'altezza
che aveva). Toglierle faceva scendere di un centinaio di pixel tutto il blocco
in basso a ogni risposta, e il tavolino restava scoperto. `fermo` non e' `on`
apposta: cosi' la barra spaziatrice continua ad avanzare e il tocco passa
attraverso le risposte spente invece di finire su un bottone morto.

**Assegnati i moltiplicatori, il quiz è chiuso per davvero** (`quizConcluso()`
in `engine.js`): ogni cella della griglia diventa "fatta", anche un livello
mai giocato e non bruciato. Senza questo, chi assegnava presto — appena
vinto un livello, la voce si vede subito, non serve aspettare il keynote —
poteva continuare a giocare gli altri livelli e accumulare `mult_bank` che
non serviva più a niente, restando dentro una schermata che diceva ancora
"da dove vuoi cominciare?" mentre in realtà aveva già finito.

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
   rigiocare lo show. La tenda a show finito porta al **countdown**, ed e'
   l'unico modo di tornarci dalla lobby: senza, chi entrava in lobby si
   ritrovava il conto alla rovescia raggiungibile solo riaprendo l'app.
3. **L'email non e' obbligatoria e non deve diventarlo.** Campo vuoto +
   CONTINUA vale come saltare, e il salto e' un bottone dichiarato. La partita
   va in coda al momento della conferma e la spedisce la schermata dell'email:
   una riga sola, con l'email dentro se c'e'. Se cambia il payload cambia anche
   l'elenco nel regolamento (e la colonna in `docs/backend.sql`).

## La Hall of Fame (zona 2) e' una piccola galleria, non una scena

La parete (`bg_halloffame_frontale`) ha gia' dentro i tre quadri dei vincitori
delle edizioni passate, con nomi e targhe disegnati: non e' un template. Ogni
quadro si apre **da solo** con `"quadro"` nell'hotspot, sopra la lobby, e alla
chiusura il giocatore e' dov'era — come il regolamento, non tocca la partita.
Mai mostrarli tutti e tre insieme dopo il tocco, e mai una seconda battuta
generica prima di aprirli: la zona la presenta una riga sola di Francesca.

Tre misure che sembrano dettagli e non lo sono:

1. **`"bgFx": "basso"`** taglia il fondale in alto invece che in basso. I
   quadri stanno nella meta' bassa dell'immagine e con il taglio normale
   finivano sotto il box del dialogo, cioe' fuori dal layer degli hotspot
   (`#hub` arriva al 66% dell'altezza: le coordinate degli hotspot sono
   **relative a quel riquadro**, non allo schermo).
2. **Le tre aree sono misurate su quell'inquadratura li'.** Se la parete viene
   ridisegnata o cambia il taglio, vanno rimisurate — il modo piu' rapido e'
   disegnarle a schermo con un `outline` e guardarle.
3. **Francesca qui non si vede: parla e basta** (`"dice": "francesca"` nella
   zona, senza `who`). Rimpicciolirla in un angolo era il ripiego di prima:
   alla misura normale copriva il terzo quadro, a quella piccola sembrava
   un'altra persona. Nella lobby **si vede solo davanti alla tenda** — nelle
   altre zone e' una voce nel box, perche' la parete dei quadri e il cartellone
   del regolamento *sono* la scena. Lo stesso vale per gli hotspot: `who` =
   e' li' (e se non c'e' rientra), `dice` = si sente e basta.

Chi aggiunge una classe nuova al fondale via `bgFx` la deve aggiungere anche
all'elenco che `applicaFx()` toglie: una classe che non viene tolta resta
addosso al fondale per tutte le scene dopo.

## Il genere del giocatore non c'entra con lo stile

Il genere lo sceglie chi gioca a [S0.03] e vive in `VN.state.genere`; lo stile
si sceglie dopo, in camerino, e i quattro sprite hanno un aspetto loro. Le due
cose sono **indipendenti apposta**: si puo' essere maschile e vestirsi da Drip.
Quindi ogni parola declinata riferita al giocatore passa da
`{g:maschile|femminile}` — vale per i dialoghi, per i bottoni che preme lui
("Si', sono {g:pronto|pronta}"), per le modali di conferma e per i testi della
banca domande, che passano tutti da `fmt()`.

Il presidio e' in `npm test`: cerca un elenco di parole declinate in contesti
che nel gioco riguardano sempre il giocatore ("sei/sono + aggettivo", le
esclamazioni tipo "Bravo!", "Sicuro?") e fallisce se ne trova una fuori da
`{g:...}`. Chi ne incontra una nuova la aggiunge all'elenco insieme alla
correzione.

Nel menu di sviluppo (`?dev`) il genere parte da **femminile** con lo stile
**showman**: e' una coppia mista di proposito, serve a far saltare fuori
proprio questi errori. Non e' un difetto del gioco vero, dove il genere lo
decide chi gioca.

## Apple Campus Run: e' una pagina, non una scena

Il minigioco vive tutto in `game/runner/index.html` — canvas, logica, grafica
— e il motore lo apre in un riquadro (`#runwrap`, un iframe) **sopra** quello
che c'e', come il regolamento e i quadri: non e' una scena, non fa avanzare
niente, e alla chiusura il giocatore e' esattamente dov'era. Chi volesse
"integrarlo meglio" portandolo dentro `engine.js` romperebbe proprio questo.

Sei cose da non annullare per sbaglio:

1. **Il bottone per uscire sta dentro la corsa, non sopra.** Il gioco le manda
   il nome del posto da cui l'ha aperta (`esci`) e quello diventa l'etichetta:
   "Torna in lobby". Aprendo `game/runner/` da soli il bottone non compare —
   non ci sarebbe niente dietro. `#runchiudi` e' solo la via di sicurezza per
   la pagina che non si carica.
2. **Campus Run e' completamente separata da Peter e dal quiz.** Non e' una
   sua sfida, non c'e' nessun link nella griglia [S8.HUB] ne' nel countdown
   [S7.05], e Peter non la nomina piu'. L'unico modo di raggiungerla e' la
   porta **STAFF ONLY**, zona 5 dell'hub della lobby (`game/story.json`,
   scena `lobby`): sempre visibile, ma respinge (fondale `staff_door_locked`,
   Francesca dice "Eh no. Il badge non ti dà ancora tutto questo potere. Torna
   più tardi.", suono `porta_negata`) finche' le previsioni non sono
   confermate (`run.locked`). Dopo il lock la stessa zona diventa
   `staff_door_authorized`: il tocco (suono `porta_autorizzata`) sposta il
   fondale sul corridoio `campus_run_corridor` e apre subito la corsa sopra,
   esattamente come il regolamento e i quadri della Hall of Fame — nessuna
   animazione di porta che si apre, il cambio e' nel fondale e nel lettore
   badge (rosso/verde), gia' disegnati dentro le due immagini. Aggiungere un
   secondo accesso (un bottone nel countdown, un link nel quiz) scavalca
   apposta la porta, che e' l'unico punto narrativo del gioco per questa
   attivita': non farlo.
3. **La corsa non e' un livello del quiz e non e' un'azione del countdown.**
   Non sta sotto la griglia dei tre livelli (i pannelli dicono a che punto
   sono le domande, un elemento in piu' toglie loro quel significato) e non
   sta fra i bottoni del countdown (che offrirebbe una scorciatoia attorno
   alla porta STAFF ONLY).
4. **La classifica e' una tabella a parte, e si legge.** `runner_leaderboard`
   tiene **una riga per giocatore** con dentro il miglior punteggio, non lo
   storico delle partite. L'identita' non la chiede la corsa: arriva dal gioco
   grande nel messaggio di apertura (`playerId` = il `run_id` della schedina,
   `playerName` = il nome scelto in [S0]) insieme a dove sta il database.
   Aprendo `game/runner/` da soli non arriva niente e la corsa gira come prima,
   col record del telefono — che resta comunque la riserva quando il server non
   risponde. Il bottone CLASSIFICA sta in **due posti**: sulla schermata
   iniziale (`btnClassificaInizio`, si vede da subito — non serve aver gia'
   giocato) e su quella di fine partita (`btnClassifica`); il primo carica in
   sola lettura (`claCarica()`, mai una scrittura), il secondo arriva da
   `claAggiorna()`, che prima confronta e semmai scrive il punteggio nuovo.
   Tre cose da non rompere: il punteggio si scrive **solo se batte** quello
   che c'e' (e un trigger nel database lo garantisce comunque, vedi
   `docs/backend.sql`); la posizione si fa **contare al database**
   (`Prefer: count=exact`), non scaricando la tabella; e la classifica non
   ferma mai il gioco — quella di fine partita parte dopo aver mostrato il
   game over, e ANCORA resta premibile mentre carica.
5. **Il record si tiene, i punti no.** `VN.state.runner_record` entra nel
   salvataggio; come i punti della corsa si sommino alla classifica dei
   pronostici **non e' deciso** — non inventarlo.
6. **Bolla chiara si prende, bolla rossa si scansa.** I tre prodotti Apple
   valgono punti, le tre fregature (cuffie aggrovigliate, cavo sfilacciato,
   batteria all'1%) ne tolgono, e si distinguono **solo** dal colore della
   bolla: e' l'unica cosa che tiene in piedi la regola. Un malus disegnato come
   un premio e' un gioco che sembra rotto. Le fregature **non tolgono cuori** —
   il carrello resta l'unica cosa che ne toglie uno — e sono sempre schivabili
   cambiando corsia.
7. **La schermata di morte non si tocca per un attimo.** Compare sotto il dito
   di chi stava ancora giocando, e il tocco di troppo lo portava fuori dalla
   corsa prima di aver letto la posizione in classifica — e' successo davvero.
   I tasti restano spenti finche' la riga della classifica non e' arrivata
   (`congelaFine` / `scongelaFine`), con un minimo di 900 ms perche' il tocco
   di troppo non arrivi comunque, e un tetto di 3 secondi perche' **la
   classifica non deve mai fermare il gioco**: se il database non risponde i
   tasti si riaccendono lo stesso. Per la stessa ragione i due conteggi della
   posizione si chiedono insieme (`Promise.all`) e le prime dieci si chiedono
   dopo: ogni viaggio in fila e' un secondo in cui il giocatore rischia di
   andarsene senza aver visto dov'e' arrivato.
8. **La X in alto a sinistra apre un menu, non esce.** E' l'unica via d'uscita
   mentre si corre, e uscire e' l'unica cosa irreversibile che si puo' fare li'
   dentro: chiede conferma, e **mentre chiede il mondo si ferma**
   (`apriUscita` mette `S.fase = 'menu'`, `chiudiUscita` rimette la fase di
   prima). Chiedere "sei sicuro?" lasciando arrivare i carrelli sarebbe una
   domanda a tradimento. La X non c'e' sulla schermata di morte — li' l'uscita
   c'e' gia', e un tasto fuori dal congelamento mentre qualcuno pesta sullo
   schermo e' esattamente il difetto che il congelamento serve a togliere — e
   non c'e' nemmeno aprendo `game/runner/` da soli, dove non c'e' niente da cui
   uscire. E' disegnata dal codice (`disegnaX`), non caricata: e' una croce di
   quadretti, e cosi' non c'e' un asset in piu' da pubblicare e da invalidare.
9. **Il livello e' un tratto con un cuore dentro.** Ogni mille punti si
   attraversa la riga dorata e la velocita' sale di uno scalino; dentro ogni
   livello esce **un cuore di ricarica solo**, a un punto a caso del tratto
   (`nuovaQuotaVita()`), e si prova a ogni gruppo — non solo in quelli
   comodi, se no il cuore dipendeva da quale gruppo usciva a caso. Chi lo
   perde se lo tiene fino al traguardo dopo: e' quello che rende un livello
   una cosa da attraversare invece che un contatore.

La riga sul pavimento non e' decorazione: la stella passa per aria e il
cambio di livello restava una cosa che succedeva altrove. La riga si vede
arrivare, ci si corre dentro, e li' cambia la velocita'. La scritta
"LIVELLO n" pero' **non si disegna sulla riga**: al centro del corridoio
corre il personaggio, e qualunque cosa scritta li' gli finisce dietro — sta
a schermo, sopra tutto, per un secondo (`annuncio()`). E' la stessa ragione
per cui il numero del traguardo sta sopra la stella e non sotto.

La prospettiva del corridoio e' **misurata a mano**, non calcolata: due tabelle
di coppie `[y,x]` tracciate su `run_corridoio_base.webp` con
`tools/taratura_pista.html`. Se cambia il fondale si rifa' la taratura, non si
cerca una formula: ci sono gia' stati due tentativi (spostamento lineare del
centro, parabola interpolata) e il corridoio non li segue.

Peter non parla piu' della corsa, in nessuna delle due direzioni: non la
presenta prima di cominciare il quiz e non la commenta al ritorno. E' voluto —
sono due attivita' scoperte separatamente, non una proposta sua — quindi non
va reintrodotta una battuta "l'altra sfida" pensando che manchi qualcosa.

**Il riquadro del gioco si misura su `visualViewport`, non solo su
`innerWidth`/`innerHeight`.** Su Safari mobile le barre del browser sono
sempre aperte alla primissima apertura di una pagina e si accorciano da
sole poco dopo, ma quel cambiamento non sempre fa scattare `resize`: la
misura calcolata subito restava quella (piu' stretta) di quando le barre
c'erano ancora. `adatta()` ascolta anche `visualViewport.resize`/`scroll` e
si ricontrolla un'altra volta quando il gioco e' davvero pronto (`PRONTI`),
non solo al caricamento dello script.

## L'audio: tre regole, e una che vale piu' delle altre

I file stanno in `assets/music` (sottofondo per scena) e `assets/sfx` (effetti).
Quale suona dove sta in `story.audio` dentro `story.json`, non nel motore: il
motore chiama una **chiave** (`scelta`, `quiz_giusta`, `applausi`), cosi' un
suono si cambia senza toccare il codice. Una chiave puo' portare un elenco —
gli applausi — e allora se ne pesca uno a caso, cosi' la platea non applaude
sempre uguale.

1. **Niente suono sul tocco che manda avanti il dialogo.** E' la richiesta
   esplicita dell'utente, e ha ragione: un clic ogni due secondi per un'ora di
   gioco e' rumore, non feedback. Gli effetti stanno solo dove succede qualcosa
   — una scelta, una risposta del quiz, le previsioni spedite, un pannello che
   si apre. `npm test` controlla che dentro `VN.step` non ci finisca un `suona`.
   **Il tocco secco (`tap`) segna un impegno preso**: entrare in un livello
   del quiz ("comincia") e scegliere una risposta ai pronostici in S5 — li' ha
   sostituito `scelta` (`sfx-ui-select`), che restava un rumore di clic da
   mouse su una scelta che invece pesa. `scelta` resta sul resto delle scelte
   di tono, dove il tocco non impegna a niente di misurabile. Nel terminale
   della registrazione non si clicca: si scrive: `tastiera()` suona un colpo
   di tasti al massimo ogni 140 ms mentre si digita (non uno per lettera),
   `tastiera_intro` quando il campo si accende e `invio` quando si conferma.
2. **La musica non riparte a ogni scena.** `musicaScena()` confronta il brano
   chiesto con quello che sta suonando: se e' lo stesso non tocca niente. Le
   quattro scene dell'atto 1 condividono il brano, e il giocatore non deve
   sentire uno stacco passando dall'ingresso alla registrazione. Quando cambia
   davvero, il vecchio sfuma mentre il nuovo entra (`sfuma()`, non una
   transizione CSS: il volume di un `<audio>` non e' una proprieta' CSS).
3. **Il primo suono aspetta il primo tocco.** Sul telefono il browser rifiuta
   qualunque riproduzione prima che la persona tocchi lo schermo: la prima
   musica resta in `musAttesa` e parte al primo `pointerdown`. Insistere con un
   timer non serve a niente.
4. **Sul telefono il volume di un `<audio>` non si cambia da codice.** iOS
   ignora `nodo.volume`: mettere la musica a zero **non** la zittisce. Quindi
   con l'interruttore su OFF il brano non si mette a volume zero, **non parte
   proprio** (`musicaScena()` prepara il nodo e si ferma li'); a riaccenderla
   ci pensa `aggiornaVolumi()`, che fa partire quello stesso nodo. Senza,
   bastava cambiare stanza e la musica tornava a volume pieno con il pannello
   che diceva OFF.

**Gli applausi arrivano dopo l'annuncio, non sul tocco.** Il giocatore sceglie
un pronostico, il personaggio lo annuncia, e **poi** (420 ms) la platea
reagisce: e' la reazione a quello che ha sentito, non un rumore di conferma del
bottone. Le varianti corte girano a caso e non si ripetono due volte di fila
(`ultimoSfx`); quelle lunghe stanno solo ai momenti grossi — l'apertura dei
pronostici e i tre macroargomenti chiusi.

I volumi (musica ed effetti separati, piu' il muto) stanno in `fl_audio`, **non
nel salvataggio della partita**: chi ricomincia da capo non si ritrova la
musica riaccesa. Il selettore e' il bottone in alto a destra. Due trappole gia'
prese:

- **la musica parte a 0.3, non a 0.6.** E' un tappeto sotto la voce. Il valore
  salvato porta una `v`: cambiando `AUDIO_VERSIONE` chi aveva gia' giocato
  riparte dalla taratura nuova, altrimenti la modifica non la vede nessuno di
  quelli che hanno gia' toccato il selettore.
- **il pannello non si chiude mentre si trascina un cursore.** Il dito che
  parte dalla manopola e finisce fuori dal riquadro faceva sparire il pannello
  a meta' regolazione, e sembrava che il cursore fosse rotto. La percentuale
  scritta di fianco all'etichetta serve a vedere che si sta muovendo.

In `npm test` l'audio non esiste (jsdom ha `<audio>` ma non sa suonare, e
`play`/`pause` sporcano l'uscita): `CI_SONO_SUONI` lo riconosce con lo stesso
segnale di `siDecodifica()`, e il gioco gira identico, muto.

**I file si preparano con `tools/prepara_audio.py`**, non si committano come
escono dal programma di montaggio: i 42 MB consegnati sono diventati 9,5 MB
(MP3 mono, volume pareggiato con `loudnorm`, silenzio iniziale tagliato,
copertina buttata — un MP3 con dentro un disegno pesa il triplo dell'audio).
Chi aggiunge un file lo mette nella mappa dello script e rilancia.

## Il linguaggio: mai "schedina bloccata"

Al giocatore non si dice mai "schedina bloccata", "la schedina e' chiusa",
"previsioni bloccate". Si dice che le previsioni sono **fatte, confermate,
registrate, concluse**. Le variabili interne restano `locked` e compagnia: la
regola riguarda il testo che si legge a schermo (dialoghi, bottoni, modali,
countdown, card, regolamento, HTML).

## Lo schermo del palco si accende da solo (S5)

I tre pannelli di `bg_palco_schermo_categorie` si riempiono con l'emblema del
macroargomento (`prop_emblema_categoria_*`) **alla prima scelta** di quella
categoria, non a domande finite. Sono due informazioni diverse e vanno tenute
separate: i bottoni della griglia dicono a che punto sono le domande
(`categoriaFinita()`), lo schermo dice dove il giocatore e' gia' stato
(`VN.state.categorie_visitate`, che entra nel salvataggio).

Quattro cose da non rompere:

1. **Non e' interfaccia, e' scenografia.** Gli emblemi stanno in un layer suo
   (`#emblemi`), non dentro i `.gcell` e **non in `#propwrap`** — li' durante
   le domande c'e' gia' la slide della categoria, e riusare lo slot le fa a
   pugni. Il layer sta sotto personaggi e box (z-index 0 contro 1 e 2) e non
   prende tocchi.
2. **Vivono su un fondale solo.** Si accendono e si spengono da `setBg()`: su
   qualunque altro fondale — la platea durante le domande, per dire — resterebbero
   appesi in aria. Con la dissolvenza arrivano insieme al fondale nuovo, non prima.
3. **Le posizioni sono in percentuale dello schermo, non dell'immagine.** Il
   fondale e' ritagliato in `cover`: le percentuali del file sorgente non
   corrispondono. Si misurano guardando il gioco a 390x844.
4. **`azzeraVars()` copia, non condivide.** `categorie_visitate` e' un oggetto
   dentro `story.vars`: assegnandolo per riferimento, una partita nuova si
   ritroverebbe addosso quella di prima e scriverebbe dentro i dati della
   storia. Vale per qualunque variabile composta che si aggiunga li'.

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

## Dialoghi: se una meccanica e' gia' spiegata, non si rispiega

L'utente ha fatto un giro di sfoltimento sui dialoghi (agosto 2026): via la
domanda di regia su Craig, via la spiegazione dei moltiplicatori in bocca a
Peter, via la scena di commento dopo il pannello dei moltiplicatori, battute
piu' corte in camerino, dietro le quinte, teleprompter e lobby.

La regola che ne resta, per le prossime volte: **quando una battuta serve solo
a spiegare una meccanica gia' spiegata altrove** (il regolamento, l'interfaccia
stessa), nell'ordine — si toglie, oppure si riduce a una riga sola, oppure la
si lascia spiegare all'interfaccia. Il ritmo vale piu' della completezza: si
legge su un telefono.

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
  arriva l'ultimo tap). **Il tocco non fa sparire il blocco che si sta
  leggendo**: mette in modalità veloce e aspetta comunque `TIENI_VELOCE`
  (~0,9s) prima di sfumare. Timing attuale: ~12s senza toccare, ~5,5s
  toccando di continuo — cambiarli tocca `titoliDiCoda` in `engine.js` e i
  `tieni` dei blocchi in `story.json`.

- **Le due schermate d'avvio (sigla e barra) si guardano e basta**: niente
  freccia, niente tocco che salta. Sono corte apposta (~4s e ~3s): se si
  allungano, torna la voglia di saltarle. Anche il cartello d'apertura non si
  salta finché non ha finito di scriversi — il tocco durante la scrittura non
  fa niente (`senzaSalto` in `typeLines`, e `skip()` che si ferma prima) — e
  solo dopo arriva la freccia. `ritmo` sullo step `title` scala insieme
  velocità di scrittura e pause.
- **Il campo del terminale non si puo' scrivere piccolo.** Sotto i 16px di
  font iOS ingrandisce la pagina appena lo si tocca. Per farlo uguale al box
  (~10px) `#ti` resta a 16px ed e' scalato a 0.6 dentro `#tiwrap`, che e'
  l'unico a contare per il layout. Abbassare il `font-size` "per semplificare"
  riporta lo zoom.
- **Il doppio tocco del browser ingrandiva la pagina.** Il gioco si gioca a
  tocchi ravvicinati (si tocca per far scorrere il dialogo) e Safari li leggeva
  come "ingrandisci qui", lasciando la scena zoomata a meta'. Si toglie con
  `touch-action:manipulation`, che va messo **sia** su `body` **sia** su
  `#stage`: non si eredita, lo decide l'elemento che riceve il tocco.
  (`user-scalable=no` nel viewport iOS lo ignora dal 2016: non e' quella la
  strada.)
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

## Il cartello di attesa su fantaliberty.com

Fino al 2 settembre il dominio pubblico non apre il gioco: mostra un cartello
in pixel art (sipario socchiuso, palco vuoto, faro) disegnato **solo con CSS**,
niente immagine da scaricare. Tre cose da sapere:

1. **Non e' un controllo di accesso, e' un'insegna.** Il controllo sta nel
   browser: chi legge il sorgente entra lo stesso. Non va raccontato all'utente
   come una protezione.
2. **Vale solo su `fantaliberty.com` / `www.fantaliberty.com`** (elenco
   `DOMINI_PUBBLICI` in `index.html`). L'indirizzo di sviluppo (github.io) e la
   build offline da `file://` restano aperti — se qualcuno allarga l'elenco,
   blocca anche il proprio modo di provare il gioco. Scavalcano il cartello
   `?apri`, `?dev` e `?scene=` — l'utente il gioco lo prova dal dominio
   pubblico, non dall'indirizzo github.io: chi tocca quel controllo non deve
   togliere quelle porte.
3. **Si toglie da solo** a `APERTURA` (2 settembre 2026, ora italiana): non
   serve un altro deploy per aprire il sito, ma spostare la data e' una
   modifica sola in `index.html`.

Il motore non parte proprio quando il cartello e' su (`return` prima di
`VN.boot`): niente salvataggi toccati, niente richieste ai JSON.
