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
| `susan` | Susan | 12 pose collegate, comprese le 4 `commento_*` tagliate dal foglio `chr_susan_commento_stile` (ordine confermato dall'utente: 1 drip, 2 hawaiano, 3 showman, 4 ingegnere). Servono a S3, non ancora usate |
| `peter` (ex `veterano`) | Peter | 6 pose collegate. Lo stato *dorme finché `locked` è falso, si sveglia dopo* **è modellato nella lobby** (zona 4, due varianti con `when`). La scena `quiz` resta la vecchia placeholder |
| `martha` | Martha | Sprite consegnati (`chr_martha_indicatore_regia`, `chr_martha_ritratto_regia`) ma **non collegati e non usati in nessuna scena**. Il cast punta ancora a 3 file `@3x` mai disegnati. Il manifest la descrive come "nessun corpo, solo icona" — un'icona a 2 frame mostrata *accanto al box dialogo*, non un personaggio `show`/`say` normale. Serve un meccanismo diverso da quello usato per gli altri NPC, non ancora costruito |
| `premi` | — | **Probabilmente da eliminare.** Non esiste un NPC "Premi" nel manifest: la sezione premi è gestita da Francesca in zona 3 (`chr_francesca_orgogliosa`). Nessuno sprite è mai stato consegnato per `premi`. Prima di cancellarlo controlla che la scena `premi` in `story.json` non serva ancora come segnaposto di flusso |

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

**Strato meccaniche — da costruire.** Il motore oggi sa fare scene lineari
(`say`/`choice`/`input`/`show`/`bg`). Lo script chiede meccaniche che **non
esistono**:

| serve | per |
|---|---|
| ~~hub a 4 zone con swipe + dot~~ — **fatto**: step `hub`, vedi README | `[S1.HUB]` lobby |
| carosello stile con descrizione, perk e conferma irreversibile | `[S3.02]` |
| griglia 3 macroargomenti con stati (attiva/completata/disabilitata) | `[S5.HUB]` |
| pescaggio casuale di 3 facoltative **al bivio**, non a inizio partita | `[S5.BIVIO]` |
| battuta risolta per (stile × opzione scelta) dalla banca domande | tutta `[S5]` |
| recap modificabile + lock irreversibile | `[S6]` |
| timer per domanda, livelli, due pool, perk per stile | `[S8]` |
| countdown persistente | `[S7.05]` |
| punteggio, moltiplicatori, `run.locked`, POST al backend | trasversale |

Ordine consigliato: prima il modello `run` completo e il salvataggio, poi S3
(stile, perché tutto S5 ne dipende), poi S5, poi S6/S7, infine S8.

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

## La struttura delle scene è più grezza dello script v3.0

`story.json` oggi ha 10 scene con nomi "Atto 1-4" (`registrazione`,
`ritardo_ceo`, `lobby`, `backstage`, `quiz`, `premi`, `finale`...). Lo script
di produzione (quello con Susan/Francesca/Peter/Martha, i 4 stili giocabili,
il sistema Newton/quiz a 3 livelli, il keynote con i 3 macroargomenti)
descrive una struttura molto più fine, **S0 → S8**, con scene che qui non
esistono ancora: la scelta dello stile (camerino, S3), il keynote vero
(S5, il cuore del gioco — previsioni, moltiplicatori, eventi per stile), il
teleprompter/recap (S6), il quiz a 3 livelli con timer e perk per stile
(S8 rifatto).

**Ora è in corso, una scena alla volta.** L'utente ha chiesto esplicitamente
di procedere *scena per scena, dialoghi e meccaniche insieme*, non tutti i
dialoghi prima e le meccaniche poi, e di **non tagliare niente** dallo script
("non togliere i micro eventi perché c'è assolutamente tempo visto che siamo
in due"). I giocatori partono il **2 settembre 2026**.

Ordine dei lavori e stato:

| scena | stato |
|---|---|
| S0 registrazione | fatto (genere a 2, fasce anzianità, lista iPhone, badge) |
| **S1 lobby** | **fatto**: hub a 4 zone con swipe, hotspot, zona 4 condizionata a `locked` |
| S2 l'aggancio | da fare — oggi è la vecchia `ritardo_ceo` |
| S3 camerino / scelta stile | da fare (le 4 teste di Susan sono già pronte) |
| S4 → S8 | da fare |

L'ordine delle scene in `story.json` è già stato corretto: `badge` → `lobby`
(S1) → `ritardo_ceo` (proto-S2). Prima la lobby veniva dopo l'incontro con
Susan, al contrario dello script.

Le correzioni precedenti erano invece mirate: ricollegare sprite reali a scene
placeholder, sistemare riferimenti rotti. Non mescolare i due tipi di lavoro
nella stessa PR.

## Errori già fatti (per non ripeterli)

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
