# Storico decisioni — FantaLiberty Nexus

Questo file raccoglie il *racconto* di come si è arrivati allo stato attuale
del progetto: versioni bocciate, rinomine, l'ordine in cui le scene sono
state costruite. Non è necessario leggerlo per lavorare tutti i giorni — le
regole ancora attive e i tranelli da non ripetere sono in `CLAUDE.md`.
Consultalo quando serve capire *perché* qualcosa è fatto in un certo modo.

## Personaggi: il pattern "segnaposto vs sprite reale"

`game/story.json` è nato prima del manifest asset attuale (v3.0). Il cast
originale (`maurice`, `susan`, `veterano`, `martha`, `premi`) era scritto per
uno schema **corpo+testa separati** (`chars/chr_X_corpo_Y@3x.webp` +
`chars/chr_X_testa_Z@3x.webp`) che non è mai stato disegnato. Il manifest
attuale consegna invece **uno sprite intero per posa**, senza head/neck —
lo stesso pattern già usato per `lucas`.

È già successo due volte: `maurice` (segnaposto, mai disegnato) aveva gli
sprite veri fermi sotto il nome `francesca`; `veterano` (segnaposto) aveva
gli sprite veri sotto `peter`. In entrambi i casi la soluzione non è stata
"disegnare gli asset mancanti" ma **rinominare il cast e ricollegare le
scene** al nome giusto.

### Stato del cast (dopo la rimappatura)

| cast key | manifest | stato |
|---|---|---|
| `lucas` | Lucas | 2 pose collegate (`neutro`, `felice`, i nomi del prototipo). Il manifest ne descrive altre 3 già consegnate e non ancora collegate: `chr_lucas_idle`, `chr_lucas_indica_terminale` (più `chr_lucas_saluto`, `chr_lucas_pollice_su`, `chr_lucas_divertito`, mai disegnate) |
| `francesca` | Francesca | 7 pose, tutte collegate |
| `susan` | Susan | 12 pose collegate, comprese le 4 `commento_*` (ordine confermato dall'utente: 1 drip, 2 hawaiano, 3 showman, 4 ingegnere), usate in S3 |
| `peter` (ex `veterano`) | Peter | 6 pose, tutte collegate. Lo stato *dorme finché `locked` è falso, si sveglia dopo* è modellato nella lobby (zona 4, due varianti con `when`); le altre quattro pose (`annuisce`, `scuote_testa`, `guarda_orologio`, `applauso_ironico`) sono il quiz di S8. Tutte a `height 44%` e `bottom 34%`: è seduto a un tavolino in primo piano |
| ~~`martha`~~ | — | Eliminata su richiesta dell'utente. Il ruolo della regia è passato a Susan, riscrivendo le battute sulla sua caratterizzazione — non con un search/replace. L'icona dell'auricolare era generica ed è stata rinominata `chr_indicatore_regia_*`: ora è di Susan. `chr_martha_ritratto_regia` è rimasto nel repo ma non lo usa più nessuno (segnalato da `npm test`) |
| ~~`premi`~~ | — | Eliminato. Non è mai esistito un NPC "Premi" nel manifest, e da quando la zona 3 è il regolamento non esiste più nemmeno la sezione: `chr_francesca_orgogliosa` non è più collegata da nessuna scena (resta nel repo, potrebbe servire altrove) |

## Lo script master v4.0 e i due strati del lavoro

`docs/script-master.md` sostituisce ogni versione precedente dello script.
Il lavoro di aderirvi si è diviso in due strati:

**Strato contenuti — fatto.** `game/domande.json` (29 domande di pronostico,
79 opzioni, 316 battute: una per opzione per ciascuno dei 4 stili) e
`game/quiz.json` (44 domande su due pool per livello). Validati da
`npm test`: i punteggi delle core vengono ricalcolati da difficoltà + tipo e
confrontati con quelli scritti. `npm run indice` rigenera
`docs/indice-domande.md` dai dati veri.

**Strato meccaniche — fatto.** Il motore partiva sapendo fare solo scene
lineari (`say`/`choice`/`input`/`show`/`bg`). Costruiti uno alla volta:

| serve | per |
|---|---|
| hub a 4 zone con swipe + dot — step `hub` | `[S1.HUB]` lobby |
| carosello stile con descrizione, perk, conferma irreversibile — step `carosello` | `[S3.02]` |
| griglia 3 macroargomenti con stati — step `griglia` | `[S5.HUB]` |
| pescaggio casuale di 3 facoltative al bivio — step `bivio` | `[S5.BIVIO]` |
| battuta risolta per (stile × opzione scelta) — step `domande` | tutta `[S5]` |
| recap modificabile + lock irreversibile — step `recap` | `[S6]` |
| timer per domanda, livelli, due pool, perk per stile — step `quizhub`/`quizlivello` | `[S8]` |
| countdown persistente — step `countdown` | `[S7.05]` |
| punteggio, `run.locked`, POST al backend, moltiplicatori | trasversale |

Non restano step da costruire: quello che manca è arte (i sei layer della
platea).

### Decisioni dell'utente sullo script

- **Il genere**: due opzioni, come da script. `meta.genderOrder` è
  `["m","f"]`, l'opzione Neutro non c'è più e tutti i `{g:...}` hanno due
  varianti. `npm test` controlla che il numero di varianti combaci con
  `genderOrder`.
- **Le fasce di anzianità** sono state allineate allo script (0-1 / 2-3 /
  4-7 / 8+) e le due battute di Lucas che citavano i vecchi valori
  ("Cinque, dieci anni…", "Più di dieci anni") sono state adattate.

## Come è stata costruita la struttura delle scene

`story.json` partiva con 10 scene dai nomi "Atto 1-4" (`registrazione`,
`ritardo_ceo`, `lobby`, `backstage`, `quiz`, `premi`, `finale`...), molto più
grezze dello script di produzione. Oggi la struttura è quella dello script,
**S0 → S8**, scena per scena.

L'utente ha chiesto esplicitamente di procedere *scena per scena, dialoghi e
meccaniche insieme*, non tutti i dialoghi prima e le meccaniche poi, e di
**non tagliare niente** dallo script ("non togliere i micro eventi perché
c'è assolutamente tempo visto che siamo in due"). I giocatori partono il
**2 settembre 2026**.

Stato per scena (tutte fatte):

| scena | stato |
|---|---|
| S0 registrazione | genere a 2, fasce anzianità, lista iPhone, badge |
| S1 lobby | hub a 4 zone con swipe, hotspot, zona 4 condizionata a `locked` |
| S2 l'aggancio | scena `aggancio`, sipario della tenda, carrellata di discesa |
| S3 camerino | carosello dei 4 stili e conferma irreversibile, commento di Susan per stile |
| S4 dietro le quinte | il giocatore entra in scena (step `io`), il sipario del palco riusa lo step di S2, Susan passa in regia |
| S5 keynote | griglia a 3 macroargomenti, core in sequenza, bivio che pesca 3 facoltative, battuta per stile, micro-eventi, evento personale, intermezzi, punteggio |
| S6 teleprompter | recap modificabile, blocco irreversibile, invio a Supabase (chiave anon verificata dal vivo) |
| S7 finale | la porta a tre fotogrammi, il countdown persistente, la card da salvare |
| S8 quiz | griglia dei tre livelli, domande a tempo, i quattro perk, i due pool per tentativo, i moltiplicatori con distribuzione irreversibile |

L'ordine delle scene in `story.json` è stato corretto: `badge` → `lobby`
(S1) → `aggancio` (S2). Prima la lobby veniva dopo l'incontro con Susan, al
contrario dello script. La vecchia `ritardo_ceo` non esiste più: era la
bozza di S2 ed è stata assorbita, non affiancata.

Nomi da ricordare: lo script master chiama `bg_sala_ingresso_superiore` il
fondale di S2, consegnato come `bg_sala_teatro` — stesso file. Stessa cosa
dei personaggi (`maurice`→`francesca`, `veterano`→`peter`): prima di
dichiarare mancante un asset del manifest, cercare se esiste sotto un altro
nome.

Le correzioni precedenti erano mirate: ricollegare sprite reali a scene
placeholder, sistemare riferimenti rotti — un tipo di lavoro da non
mescolare con lo sviluppo di nuove scene nella stessa PR.

## Il camerino (S3): la prima versione bocciata

I quattro sprite avevano residui di sfondo bianco chiusi dentro il disegno
(puntini fra le ciocche dei capelli, una chiazza fra braccio e busto): a
schermo, sul fondale scuro, si leggevano come sporco. Ripuliti con
`tools/togli_bianchi.py` su tutto `assets/stili/`, non solo sulle pose del
camerino — lo stesso difetto si vedeva sul palco.

## Susan è anche la regia — come si è arrivati alla scelta

Martha è stata eliminata su richiesta dell'utente e il suo ruolo è passato a
Susan, con le battute riscritte sulla sua caratterizzazione (responsabile
dell'evento, sotto pressione, ironica come valvola di sfogo, scarica il
problema sul giocatore) — non con un search/replace, che la richiesta
vietava.
