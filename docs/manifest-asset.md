# FANTALIBERTY — MANIFEST ASSET
### Cosa sono, dove si usano, come li carica il codice

Questo documento accompagna lo script (v3.0) e serve a Claude Code per capire
**quale file corrisponde a quale elemento del gioco**, in che scena appare,
e con che meccanica va gestito (stato fisso, sprite intercambiabile, layer
sovrapposto, ecc.). I nomi file sono quelli usati in produzione.

Formato per ogni voce: **file** → *scena* → uso.

---

## FONDALI
Uno sfondo intero per schermata, sempre presente sotto ogni altra cosa.

| File | Scena | Uso |
|---|---|---|
| `bg_esterno_vialetto` | S0 | Primo frame assoluto del gioco, prima di qualunque interazione |
| `bg_esterno_ingresso` | S0 | L'ingresso del teatro: Lucas accoglie il giocatore |
| `bg_macintosh` | S0 | Registrazione e consegna del badge. Il Mac non e' piu' un oggetto sovrapposto (`prop_mac_terminale`): sta dentro il fondale, e il terminale si incolla in pixel allo schermo disegnato qui (`ancoraTerminale()` in engine.js, step `prop` con `"fondale": true`). Se l'immagine viene ridisegnata, ricontrollare le coordinate del vetro in `SCHERMO_FONDALE` |
| `bg_lobby_z1_tenda` | S1 | Zona 1 della lobby. Ha l'hotspot ENTRA al centro. **L'apertura si anima in codice** (fade o split delle due metà dell'immagine), non serve un secondo fondale "tenda aperta" |
| `bg_halloffame_frontale` | S1 | Zona 2, la parete della Hall of Fame con i tre quadri dei vincitori gia' dentro l'immagine: non e' un template, i nomi sono disegnati. Le tre aree toccabili in `story.json` sono misurate su questa immagine — se viene ridisegnata, ricontrollarle |
| `bg_halloffame_fabio` · `bg_halloffame_michael` · `bg_halloffame_nicola` | S1 | I tre quadri singoli, uno per edizione (2024, 2025, 2026). Si aprono uno alla volta dal tocco sul quadro corrispondente (`"quadro"` nell'hotspot), sopra la lobby: non sono scene e non toccano la partita |
| `bg_lobby_z2_hall_of_fame` | S1 | La vecchia parete vuota della zona 2. Non piu' usata dal gioco: l'ha sostituita `bg_halloffame_frontale` |
| `bg_lobby_z3_regolamento` | S1 | Zona 3. Il cartellone illuminato del regolamento: la lastra bianca è **vuota di proposito**, il testo è UI vera che si apre sopra (non va disegnato nell'immagine). Ha preso il posto di `bg_lobby_z3_premi`, la vecchia teca dei premi |
| `bg_lobby_z4_quiz_bloccata` | S1 | Zona 4 prima del lock. Sopra: `obj_tavolino_buzzer_peter` + Peter addormentato |
| `bg_lobby_z4_quiz_aperta` | S8 | Stessa zona, generata come derivato diretto della bloccata con le luci alzate — va usata al posto della precedente non appena `run.locked === true` |
| `bg_sala_ingresso_superiore` | S2 | Appare subito dopo la transizione della tenda. Susan piccola sul palco in fondo |
| `bg_sala_discesa_palco` | S2 | Opzionale/P1 — solo se si implementa il parallax a 3 layer invece del fade semplice tra S2 e S4 |
| `bg_backstage_corridoio` | S2 | Corridoio verso il camerino, durante la corsa |
| `bg_camerino` | S3 | Fondale della scelta stile — il più a lungo osservato del gioco |
| `bg_dietro_le_quinte` | S4 | Subito prima dell'ingresso in scena |
| `bg_palco_sipario_chiuso` | S4 | Frame 1 dell'apertura sipario. **Simmetrico sull'asse centrale**: si taglia in due metà via codice per l'animazione, non serve un asset per il sipario a metà apertura |
| `bg_palco_platea_piena` | S5 | Fondale di base del palco per tutta la Scena 5. La platea qui è neutra/in attesa — le reazioni vere sono layer separati (vedi PLATEA) |
| `bg_palco_schermo_categorie` | S5 | Variante di `bg_palco_platea_piena` con lo schermo dietro in evidenza, diviso in 3 pannelli vuoti dove vanno sovrapposte `obj_icone_categorie` |
| `bg_palco_luci_calate` | S6 | Fondale del teleprompter — derivato da `bg_palco_platea_piena` con luci abbassate |
| `bg_finale_porta_illuminata` | S7 | La porta col rettangolo di luce vuoto: sopra ci va lo sprite `chr_ceo_sagoma` / `chr_ceo_pollice_su` |
| `bg_countdown_nero` | S7 | Schermata post-lock, riaperta ogni giorno fino al keynote vero |

---

## PERSONAGGI FISSI (NPC)
Ogni file è uno sprite PNG trasparente intero (non a layer). Il codice
sceglie quale mostrare in base allo stato della scena/dialogo corrente.

### Lucas — solo Scena 0
`chr_lucas_idle` · `chr_lucas_saluto` · `chr_lucas_indica_terminale` ·
`chr_lucas_pollice_su` (dopo accredito) · `chr_lucas_divertito` (P2, reazione
a nickname/input buffi)

### Francesca — solo Scena 1
`chr_francesca_idle` · `chr_francesca_benvenuto` · `chr_francesca_gesto_swipe`
(tutorial — **deve coincidere col gesto reale richiesto**, verificare
l'animazione dello swipe implementata prima di finalizzare l'asset) ·
`chr_francesca_indica_tenda` (tono neutro, no spoiler) ·
`chr_francesca_orgogliosa` (P2, non più collegata da quando la zona 3 è il regolamento) · `chr_francesca_ride` (P2, solo
testa) · `chr_francesca_scettica` (P2, solo testa, se il giocatore ritocca
lo stesso hotspot 3+ volte)

### Susan — Scene 2, 3, 4, 5 (evento carponi), 7
`chr_susan_panico_telefoni` (S2, primo incontro) · `chr_susan_mani_capelli`
(S2) · `chr_susan_indica_camerino` (S2) · `chr_susan_guarda_orologio` (S3, se
il giocatore impiega troppo a scegliere lo stile) ·
`chr_susan_commento_stile` (S3 — **sprite sheet con 4 teste**, una per
stile: va tagliato in 4 file separati e mostrato in base a `run.style`) ·
`chr_susan_spinta_in_scena` (non più collegata: sostituita dalle otto
composizioni `scene_<stile>_push/ready` sotto) · `chr_susan_sollievo` (S7) ·
`chr_susan_sguardo_in_alto` (S7, verso la porta) · `chr_susan_carponi` (S5,
P2, solo se scelta sfacciata in S2)

### Peter — Scene 1 e 8
`chr_peter_occhi_bassi` (S1, ora **addormentato** — versione riveduta) ·
`chr_peter_alza_occhi` (S8, si sveglia di scatto) · `chr_peter_annuisce`
(S8, risposta corretta — feedback lecito qui) · `chr_peter_scuote_testa`
(S8, risposta sbagliata — **frame singolo**, non più a 2 frame) ·
`chr_peter_applauso_ironico` (S8, P2, punteggio pieno) ·
`chr_peter_guarda_orologio` (S8, timer sotto i 3 secondi)

### La regia — nessun corpo, solo un'icona (S4, S5, S6, S7)
`chr_indicatore_regia` — **icona, non personaggio**: 2 frame di cuffia+onde
sonore, mostrata accanto al box dialogo ogni volta che parla la regia (box con
colore diverso dagli altri, per distinguere "voce" da "presenza fisica").
Era `chr_martha_indicatore_regia`: rinominato quando Martha e' stata eliminata,
perche' l'icona e' generica e ora serve a **Susan**, che dal keynote in poi
parla dalla regia.

`chr_martha_ritratto_regia` — **non piu' usato.** Era l'unica immagine con il
volto di Martha, prevista per il finale in un riquadro stile monitor. Con Martha
eliminata non ha piu' un posto nel gioco: il file e' ancora nel repo, da
cancellare quando qualcuno conferma che non serve.

### CEO — solo Scena 7
`chr_ceo_sagoma` (silhouette, immobile) → `chr_ceo_pollice_su` (2° frame,
stessa posizione/scala, solo il braccio cambia) — sovrapposti al rettangolo
vuoto di `bg_finale_porta_illuminata`

---

## I 4 STILI GIOCABILI
Ogni stile ha 9 file. Una volta scelto in `run.style` durante la S3,
**quello stesso sprite set** viene usato per tutta la partita (S4→S7). Non
sono layer componibili: ogni posa è un'immagine intera.

| File (per ogni stile: hawaiano / showman / drip / ingegnere) | Dove |
|---|---|
| `stile_X_palco_attesa` | S3 — carosello di scelta (e S5, fra le pose della domanda) |
| `stile_X_idle_camerino` | non collegato: sostituito nel carosello da `palco_attesa`, che e' ritagliato piu' stretto e sta meglio a figura intera |
| `stile_X_idle_palco` | S4-S5 — stato di attesa, ha l'auricolare disegnato dentro |
| `stile_X_annuncio` | S5 — **la posa più usata di tutto il gioco**, mostrata a ogni risposta data |
| `stile_X_indica_schermo` | S5 — si alterna casualmente con `_annuncio` per dare varietà |
| `stile_X_imbarazzo` | S5 — mostrata sui micro-eventi generali che vanno storti |
| `stile_X_saluto_finale` | S7 — usata anche nella card condivisibile esportata |
| `stile_X_espressioni` | **sprite sheet 4 teste** (neutro/sicuro/sorpreso/in difficoltà) — va tagliato in 4 file e sovrapposto come variante di espressione dove serve una reazione più fine senza cambiare tutta la posa |
| `stile_X_evento_STACCHETTO/ASSOLO/RIDER/DOMANDA` | S5 — mostrata solo durante l'evento personale specifico di quello stile |

*Nota per il codice:* `run.style` determina quale set di 9 file caricare
all'inizio della S4 e non cambia più per tutta la sessione.

---

## OGGETTI E PROPS

| File | Dove | Uso |
|---|---|---|
| `obj_terminale_accrediti` | S0 | Il Macintosh vintage. **Lo schermo CRT è vuoto/generico nell'immagine** — il testo dei 6 campi del form è HTML/UI vera sovrapposta, non parte della grafica |
| `obj_badge` | S0, S7 | Template riutilizzabile: nome e foto/avatar restano placeholder vuoti nell'immagine, riempiti via codice. Riusato identico nella card condivisibile finale |
| `obj_targa_hall_of_fame` | S1 | **Non serve piu'**: la Hall of Fame usa immagini gia' complete (`bg_halloffame_*`), una per vincitore, invece di un template con testo sovrapposto |
| `obj_lucchetto_zona4` | S1, S8 | **2 frame** (chiuso/che si apre): mostrato sopra Peter finché `run.locked === false`, poi sostituito dal frame "aperto" con un piccolo effetto una tantum al momento dello sblocco |
| `obj_tavolino_buzzer_peter` | S1, S8 | **2 frame** (non premuto/premuto), da tagliare a metà dal file consegnato — sono due immagini identiche affiancate, split orizzontale semplice |
| `prop_emblema_categoria_iphone` · `prop_emblema_categoria_watch` · `prop_emblema_categoria_altro` | S5 | I tre emblemi che si accendono nei pannelli del fondale `bg_palco_schermo_categorie`, uno per macroargomento, alla prima scelta. Tagliati da un unico foglio consegnato (`prop_productcategory.png`) e ridotti a 420px di lato lungo: a schermo sono larghi ~100pt. Non c'entrano con `prop_schermo_slide_categoria_*`, che sono le slide mostrate durante le domande |
| `obj_clicker` | S5 | **2 frame** (integro/inceppato), usato durante il micro-evento "il clicker si inceppa" |
| `obj_gobbo_teleprompter` | S6 | Cornice UI del recap — il testo scorrevole delle scelte è HTML/UI vera, non grafica |
| `obj_slide_compleanno` | S5 | Immagine intera mostrata per un attimo sullo schermo del palco durante il relativo micro-evento |
| `obj_schermo_slide_categoria` | S5 | **3 varianti** (iPhone/Watch/Altro). **Non piu' usate**: la striscia sopra la scena durante le domande e' stata tolta. Restano dichiarate in `story.argomenti[].slide` e sul disco, se un giorno servisse rimetterle |
| `obj_icone_categorie` | S5 | **9 file** (3 icone × 3 stati: attiva/completata/disabilitata) — sovrapposte sui 3 pannelli vuoti di `bg_palco_schermo_categorie`, lo stato cambia in base a `picks[categoria]` completo o no |
| `obj_card_condivisibile` | S7 | Template finale: combina `stile_X_saluto_finale`, `obj_badge` compilato, nome e store — esportato client-side come immagine 1080×1920/1080×1350 |
| `obj_zaino_rider` | S5 | **Ora è un personaggio pixel-art completo** (rider con zaino termico), non un oggetto isolato — appare solo nell'evento personale della Drip |
| `prop_ukulele` | S5 | Oggetto separato dell'evento personale dell'Hawaiano (UKULELE): compare solo per la durata dell'evento, non resta in scena dopo |

### Le otto composizioni Susan + personaggio (S4)
Consegnate come **immagini già complete** (Susan e lo stile scelto insieme,
proporzione e posizione decise nel disegno): non vanno più trattate come due
sprite separati da riallineare a mano, sostituiscono `chr_susan_indica_camerino`
(S4, ora usato solo in S2) e `chr_susan_spinta_in_scena` (non più collegato).
Una coppia push/ready per stile, nomi in inglese nel file ma agganciati alle
chiavi italiane di `story.stili` (`hawaiano`→hawaiian, `ingegnere`→engineer):

| File | Stile | Momento |
|---|---|---|
| `scene_hawaiian_ready` / `scene_hawaiian_push` | Hawaiano | `duo_pronto`/`duo_spinta` |
| `scene_drip_ready` / `scene_drip_push` | Drip | `duo_pronto`/`duo_spinta` |
| `scene_showman_ready` / `scene_showman_push` | Showman | `duo_pronto`/`duo_spinta` |
| `scene_engineer_ready` / `scene_engineer_push` | Ingegnere | `duo_pronto`/`duo_spinta` |

---

## PLATEA — non si fanno
Erano layer da sovrapporre a `bg_palco_platea_piena`, mai correlati al
contenuto della risposta. **Decisione presa: non si disegnano.** Il gioco è già
lungo e le reazioni della platea aggiungerebbero un passaggio fra una scelta e
l'altra; la priorità è rifinire quello che c'è. I file restano dichiarati in
`story.json` (il motore sa mostrarli, se un giorno arrivassero) ma non sono più
in lavorazione: senza di loro la scena va avanti uguale, senza layer di
reazione. Le scene non vanno modificate per compensarne l'assenza.

| File | Uso |
|---|---|
| `pla_platea_idle` | Stato di default, sempre presente sotto le altre reazioni |
| `pla_applauso_pieno` | Reazione casuale dopo una risposta, **mai legata a quale opzione è stata scelta** |
| `pla_applauso_tiepido` | Idem, variante più contenuta |
| `pla_risata` | Sui micro-eventi comici |
| `pla_silenzio_imbarazzato` | Sul micro-evento marimba |
| `pla_coro_nome` | Solo durante l'evento personale dello Showman (L'assolo) |

---

## EFFETTI

| File | Dove | Uso |
|---|---|---|
| `fx_apertura_sipario` | S4 | Applicato tagliando `bg_palco_sipario_chiuso` in due metà e animandole verso i lati — non un asset separato da generare, è una tecnica di codice sull'immagine esistente |
| `fx_fascio_luce_porta` | S7 | Overlay luminoso sopra `bg_finale_porta_illuminata` |
| `fx_transizioni_base` | Trasversale | Fade nero, parallax dello swipe in lobby, shake — 3 effetti CSS/codice, riusati ovunque serva un cambio scena |

---

## UI (nessun asset grafico — solo codice/CSS)

box dialogo (variante colore per la regia) · bottone scelta · navigazione
lobby (frecce+dot) · hotspot pulsante · carosello scelta stile · card
domanda · schermata recap · modale conferma · timer domanda (10s, +3s per
l'Ingegnere) · badge/salvadanaio moltiplicatore quiz · banner notifica
fantasma · countdown finale · card "bentornato" (ripresa partita)

---

## ASSET SCARTATI IN FASE DI PROGETTAZIONE
Segnati qui per evitare che Claude Code li cerchi per errore.

- **`obj_tenda_ingresso`** — eliminato. L'apertura della tenda è un effetto
  di codice su `bg_lobby_z1_tenda`, non un oggetto separato.
- **`obj_auricolare`** — eliminato come asset a sé. È disegnato direttamente
  dentro ogni `stile_X_idle_palco` e le pose successive di ciascuno stile.
- **`obj_specchio_camerino`** — assorbito dentro `bg_camerino` come parte
  fissa del fondale, non serve come oggetto separato.
- Un ipotetico fondale "tenda aperta" — non esiste, si salta direttamente a
  `bg_sala_ingresso_superiore` dopo la transizione in codice.

## Le pose consegnate il 30 agosto

Sette fogli, tagliati in 40 pose singole. I fogli grezzi (15 MB di PNG) non
stanno nel repo: `.gitignore` esclude `assets/**/*.PNG`.

| foglio | pezzi | dove finiscono |
|---|---|---|
| `stile_<stile>_pose_palco` (4 fogli) | 4 figure intere | `assets/stili/stile_<stile>_palco_{attesa,presenta,sicuro,dubbio}.webp` |
| `stile_francesca_pose` | 8 mezzibusti | `assets/chars/chr_francesca_{presenta,contenta,pensa,indica_su,ride,spiega,pollice_su,tablet}.webp` |
| `stile_peter_pose` | 8 mezzibusti | `assets/chars/chr_peter_{braccia,occhiali,valuta,prego,esatto,sbuffa,annoiato,dorme}.webp` |
| `stile_susan-pose` | 8 mezzibusti | `assets/chars/chr_susan_{severa,ordina,regia,spazientita,pensa,incita,stop,approva}.webp` |

**L'ordine sui fogli non e' lo stesso per tutti gli stili**: il ruolo e' stato
assegnato guardando le pose una per una, non per posizione.

Tre fogli (hawaiian, showman, peter) sono arrivati su fondo a scacchiera, senza
trasparenza. Scontornati partendo dai bordi, non per colore: il contorno scuro
del disegno fa da diga, quindi i capelli bianchi di Peter e la camicia dello
showman non vengono toccati. Verificato componendo su magenta.

Le nuove pose di Susan la mostrano **con l'auricolare**: sono la sua versione
"regia". Quelle vecchie (panico, mani nei capelli, indica il camerino) non ce
l'hanno e restano al loro posto nelle scene dove serve la Susan di persona.
