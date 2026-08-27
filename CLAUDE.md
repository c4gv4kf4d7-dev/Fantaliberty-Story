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
| `susan` | Susan | 8 pose collegate. **`chr_susan_commento_stile` è ancora uno sprite sheet a 4 teste**, non tagliato — va passato da `taglia_sheet.py` prima di poter essere usato |
| `peter` (ex `veterano`) | Peter | 6 pose collegate. Il manifest lo vuole *addormentato* (`occhi_bassi`) finché `run.locked` è falso e sveglio (`alza_occhi`) solo in S8 — la scena `quiz` esistente è ancora la vecchia placeholder e **non modella questo stato** |
| `martha` | Martha | Sprite consegnati (`chr_martha_indicatore_regia`, `chr_martha_ritratto_regia`) ma **non collegati e non usati in nessuna scena**. Il manifest la descrive come "nessun corpo, solo icona" — un'icona a 2 frame mostrata *accanto al box dialogo*, non un personaggio `show`/`say` normale. Serve un meccanismo diverso da quello usato per gli altri NPC, non ancora costruito |
| `premi` | — | **Probabilmente da eliminare.** Non esiste un NPC "Premi" nel manifest: la sezione premi è gestita da Francesca in zona 3 (`chr_francesca_orgogliosa`). Nessuno sprite è mai stato consegnato per `premi`. Prima di cancellarlo controlla che la scena `premi` in `story.json` non serva ancora come segnaposto di flusso |

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

**Questo non è stato ancora affrontato.** Le correzioni fatte finora sono
state mirate: ricollegare sprite reali a scene placeholder esistenti,
sistemare riferimenti rotti, mai riscrivere la logica di gioco. Riscrivere
le scene per farle aderire allo script v3.0 è un lavoro grosso e separato —
non improvvisarlo dentro un fix più piccolo.

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
