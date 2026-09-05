# Apple Campus Run — regole interne del minigioco

Le regole che valgono **dentro** `game/runner/index.html`. Chi tocca quel file
legge questo prima. Quello che riguarda il resto del gioco — la porta STAFF
ONLY, il fatto che sia un iframe e non una scena, il silenzio di Peter — sta in
`CLAUDE.md`, che è l'unico posto da cui la corsa si raggiunge.

Come per `CLAUDE.md`: ogni riga qui è una cosa già rotta almeno una volta.

## L'uscita e la classifica

**Il bottone per uscire sta dentro la corsa, non sopra.** Il gioco grande le
manda il nome del posto da cui l'ha aperta (`esci`) e quello diventa
l'etichetta: "Torna in lobby". Aprendo `game/runner/` da soli il bottone non
compare — non ci sarebbe niente dietro. `#runchiudi` è solo la via di sicurezza
per la pagina che non si carica.

**La classifica è una tabella a parte, e si legge.** `runner_leaderboard` tiene
**una riga per giocatore** con dentro il miglior punteggio, non lo storico
delle partite. L'identità non la chiede la corsa: arriva dal gioco grande nel
messaggio di apertura (`playerId` = il `run_id` della schedina, `playerName` =
il nome scelto in [S0]) insieme a dove sta il database. Aprendo `game/runner/`
da soli non arriva niente e la corsa gira col record del telefono — che resta
comunque la riserva quando il server non risponde.

Il bottone CLASSIFICA sta in **due posti**: sulla schermata iniziale
(`btnClassificaInizio`, si vede da subito — non serve aver già giocato) e su
quella di fine partita (`btnClassifica`). Il primo carica in sola lettura
(`claCarica()`, mai una scrittura), il secondo arriva da `claAggiorna()`, che
prima confronta e semmai scrive il punteggio nuovo. Tre cose da non rompere:

- il punteggio si scrive **solo se batte** quello che c'è (e un trigger nel
  database lo garantisce comunque, vedi `docs/backend.sql`);
- la posizione si fa **contare al database** (`Prefer: count=exact`), non
  scaricando la tabella;
- **la classifica non ferma mai il gioco**: quella di fine partita parte dopo
  aver mostrato il game over, e ANCORA resta premibile mentre carica.

**In classifica si va col nick, non col nome della registrazione.** Due "Marco"
erano indistinguibili. Il nick si chiede **alla prima morte** con una
classifica davanti (`#nickWrap`, "INSERISCI IL TUO NICK" — voluto così, "come
ti firmi" è stato bocciato), proposto dal nome di [S0] in maiuscolo, 2-10
caratteri `[A-Z0-9 _-]`, e si cambia dal tabellone (CAMBIA NICK →
`claRinomina()`). È **unico**: `claNickLibero()` controlla prima, ma con un
tempo massimo (`NICK_ATTESA`) e se il server tace si prova a salvare lo stesso
— la guardia vera è l'indice unico `lower(player_name)` in `docs/backend.sql`,
e un 409 riporta alla finestra con "GIA' PRESO". Vive in `fl_runner_nick` nel
telefono, **non** nel salvataggio del gioco grande: nel messaggio `apri`
`playerName` è solo la proposta. Finché la finestra è aperta la schermata di
morte resta congelata (`scongelaFine` non fa niente), e all'OK il congelamento
riparte: il dito che ha appena premuto non deve finire su ESCI.

Il tabellone ha **tre colonne** — nick, punti, tempo (`best_time_s`, i secondi
della partita migliore) — ma l'ordine è **per punti e basta**; la colonna del
tempo può mancare sul server (`CLA.conTempo`, si riprova senza al primo 400), e
il gioco non se ne accorge.

**I punti della corsa non entrano nella classifica dei pronostici** (deciso
dall'utente il 3/9/2026). `VN.state.runner_record` entra nel salvataggio e
viaggia con la schedina, ma è solo un dato conservato: la corsa ha la sua
classifica, separata, ed è lì che quei punti valgono. **Non inventare una
formula che li sommi ai pronostici.**

È anche il motivo per cui il menu iniziale, prima di aprire la corsa, chiede
"Hai già giocato la storia?": chi risponde di no viene mandato alla storia,
perché fermandosi qui non starebbe accumulando niente che conti per la gara.

## Il server non si fida del telefono

Un giocatore ha aperto "Ispeziona elemento", cambiato la velocita' e tolto gli
scalini, e ha fatto un punteggio altissimo; un altro ha usato un bot. Il gioco
gira per forza sul telefono, quindi **non si puo' impedire di manometterlo**:
si puo' rifiutare quello che non e' possibile, e lo fa il database, dove il
browser non arriva (`docs/backend.sql`, sezione "Il server non si fida del
telefono").

- **La partita si annuncia prima di cominciare.** `via()` chiama `claInizio()`
  (`rpc/runner_inizio`): il server segna l'ora e restituisce un id. A fine
  corsa `claFine()` (`rpc/runner_fine`) manda id, punti e secondi, e il server
  **misura il tempo da solo**: un telefono che dice "ho giocato tre minuti"
  dopo trenta secondi viene scartato. Se l'annuncio non arriva (rete giu') la
  partita si gioca lo stesso, solo che non entra in classifica — la classifica
  non ferma mai il gioco, anche qui.
- **Il punteggio deve essere possibile in quel tempo.** `runner_massimo()`
  e' la curva di un giocatore perfetto (velocita' per livello, ~215 punti al
  metro, qui 280 piu' 500 di abbuono) e `runner_tetto()` e' il tetto assoluto
  (40.000). Chi cambia le costanti in questo file (velocita' 0.62 + 0.20 a
  scalino, valore degli anelli, `PASSO_ANELLI`, probabilita' delle chicche)
  **rifa' il conto anche li'**, se no le partite oneste vengono rifiutate.
- **La chiave del sito non scrive piu' sulla tabella.** Le policy di insert e
  update per `anon` sono state tolte: `claSalva` non esiste piu', il nick si
  cambia con `rpc/runner_rinomina`. La lettura (`claMio`, `claTop`, i conteggi)
  resta diretta, come prima.
- **Un rifiuto e' muto per il giocatore.** La riga della posizione mostra il
  record che c'era, il motivo va in console (`[run] partita non accettata`) e
  nel registro `runner_partite` sul server, con la query per leggerlo in fondo
  a `backend.sql`. Niente messaggio a schermo: chi manomette non deve capire
  dov'e' la soglia.
- **`window.RUN` e `window.CLA` esistono solo con `?prova`.** Nel gioco vero
  lo stato non e' in console (era una riga sola per cambiare la velocita'). Non
  e' una protezione — chi vuole modifica il sorgente — e' un gradino in piu'.
  Il collaudo (`npm run corsa`) apre il gioco con `?scene=lobby&prova`, e
  `apriCorsa()` in `engine.js` passa `prova` alla corsa.
- **Cosa non fa**: un bot che gioca davvero, con punteggi possibili, passa.
  Per fermarlo bisognerebbe rigiocare la partita sul server mossa per mossa —
  un altro progetto, non un ritocco.

## La schermata di morte non si tocca per un attimo

Compare sotto il dito di chi stava ancora giocando, e il tocco di troppo lo
portava fuori dalla corsa prima di aver letto la posizione in classifica — è
successo davvero. I tasti restano spenti finché la riga della classifica non è
arrivata (`congelaFine` / `scongelaFine`), con:

- un **minimo di 900 ms**, perché il tocco di troppo non arrivi comunque;
- un **tetto di 3 secondi**, perché la classifica non deve mai fermare il
  gioco: se il database non risponde i tasti si riaccendono lo stesso.

Per la stessa ragione i due conteggi della posizione si chiedono insieme
(`Promise.all`) e le prime dieci si chiedono dopo: ogni viaggio in fila è un
secondo in cui il giocatore rischia di andarsene senza aver visto dov'è
arrivato.

## Bolla chiara si prende, bolla rossa si scansa

I tre prodotti Apple valgono punti, le tre fregature (cuffie aggrovigliate,
cavo sfilacciato, batteria all'1%) ne tolgono, e si distinguono **solo dal
colore della bolla**: è l'unica cosa che tiene in piedi la regola. Un malus
disegnato come un premio è un gioco che sembra rotto.

Le fregature **non tolgono cuori** — il carrello resta l'unica cosa che ne
toglie uno — e sono sempre schivabili cambiando corsia.

## La barra è una targa sola, e l'ingranaggio ferma il gioco

In alto a sinistra faccia + cuori + anello con il punteggio stanno nello stesso
pannello: sono la stessa informazione — come sto andando — e insieme si leggono
con un'occhiata invece che con due.

In alto a destra l'ingranaggio apre il menu, e **aprendolo il mondo si ferma**
(`apriMenu` mette `S.fase = 'menu'`, `chiudiMenu` rimette la fase di prima):
cambiare le cose mentre arrivano i carrelli non ha senso, e la conferma
dell'uscita a maggior ragione. **Né l'ingranaggio né il menu ci sono sulla
schermata di morte** — lì l'uscita c'è già, e un tasto fuori dal congelamento
mentre qualcuno pesta sullo schermo è il difetto che il congelamento serve a
togliere.

Ingranaggio e X sono **disegnati dal codice**, non caricati: sono quadretti, e
così non c'è un asset in più da pubblicare e da invalidare. La faccia invece è
una tavola (`run_avatar`, tre espressioni in fila) e cambia su due cose sole,
quelle che il giocatore sente addosso: la botta e il cuore recuperato. Torna
neutra da sola — un'espressione appiccicata smette di voler dire qualcosa.

**La musica non è della corsa**: è quella del gioco grande, che continua a
suonare sotto il riquadro. L'interruttore del menu la chiede a lui con un
messaggio e passa dallo stesso stato del pannello audio, uno solo — se no si
spegne in un posto e resta accesa nell'altro. Aprendo `game/runner/` da soli
quella voce non compare proprio: non c'è nessuna musica da spegnere.

## Il livello è un tratto con un cuore dentro

Ogni mille punti si attraversa la riga dorata e la velocità sale di uno
scalino. Dentro ogni livello esce **un cuore di ricarica solo**, a un punto a
caso del tratto (`nuovaQuotaVita()`), e si prova a ogni gruppo — non solo in
quelli comodi, se no il cuore dipendeva da quale gruppo usciva a caso. Chi lo
perde se lo tiene fino al traguardo dopo: è quello che rende un livello una
cosa da attraversare invece che un contatore.

**La riga sul pavimento non è decorazione**: la stella passa per aria e il
cambio di livello restava una cosa che succedeva altrove. La riga si vede
arrivare, ci si corre dentro, e lì cambia la velocità. La scritta "LIVELLO n"
però **non si disegna sulla riga**: al centro del corridoio corre il
personaggio, e qualunque cosa scritta lì gli finisce dietro — sta a schermo,
sopra tutto, per un secondo (`annuncio()`). È la stessa ragione per cui il
numero del traguardo sta sopra la stella e non sotto.

## Due misure che non si calcolano

**La prospettiva del corridoio è misurata a mano**, non calcolata: due tabelle
di coppie `[y,x]` tracciate su `run_corridoio_base.webp` con
`tools/taratura_pista.html`. Se cambia il fondale si rifà la taratura, non si
cerca una formula: ci sono già stati due tentativi (spostamento lineare del
centro, parabola interpolata) e il corridoio non li segue.

**Il riquadro si misura su `visualViewport`**, non solo su
`innerWidth`/`innerHeight`. Su Safari mobile le barre del browser sono sempre
aperte alla primissima apertura di una pagina e si accorciano da sole poco
dopo, ma quel cambiamento non sempre fa scattare `resize`: la misura calcolata
subito restava quella (più stretta) di quando le barre c'erano ancora.
`adatta()` ascolta anche `visualViewport.resize`/`scroll` e si ricontrolla
un'altra volta quando il gioco è davvero pronto (`PRONTI`), non solo al
caricamento dello script.
