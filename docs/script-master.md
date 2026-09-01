# FANTALIBERTY — "IL SOSTITUTO"
## DOCUMENTO MASTER — v4.0

Script completo: scene, dialoghi, struttura delle domande, quiz di Peter,
istruzioni tecniche. **Documento unico di riferimento**: sostituisce ogni
versione precedente (script-canonico, battute-tutte, quiz-peter).

---

## ⚙️ Nota di implementazione (leggere prima di modificare)

Due sezioni di questo documento sono state **materializzate come dati**, perché
sono ciò che il gioco legge davvero a runtime:

| contenuto | dove vive ora |
|---|---|
| le 316 battute alla platea (29 domande × opzioni × 4 stili) | `game/domande.json` |
| le 44 domande del quiz di Peter (2 pool × 3 livelli) | `game/quiz.json` |
| indice navigabile degli id | `docs/indice-domande.md` (`npm run indice`) |

Sono lì e non qui **per non avere due fonti che divergono in silenzio**: se una
battuta cambia in un posto e non nell'altro, nessuno se ne accorge finché non lo
vede un giocatore. `npm test` valida i dati contro le formule dichiarate qui
sotto — i punti di ogni opzione core vengono ricalcolati da difficoltà + tipo e
confrontati con quelli scritti, quindi un errore di trascrizione fallisce il test.

**Per modificare una domanda o una battuta: si edita il JSON, non questo file.**
Questo documento resta l'autorità su scene, dialoghi, struttura e formule.

---

## Convenzioni

- Ogni nodo ha un **ID univoco** tra parentesi quadre, es. `[S2.01]`. Usali nei
  commit/PR per riferirti a un punto preciso.
- `{variabile}` = valore dinamico da `run`.
- `→ [ID]` indica il nodo successivo. `SE ... → [ID]` una diramazione.
- Le domande di pronostico hanno un **ID stabile** (es. `IPHONE.C1`) che finisce
  nel payload `picks`: **non rinominare gli ID tra revisioni**, altrimenti si
  rompe la corrispondenza con le run già salvate.
- Quando l'utente chiede una modifica, si aggiorna **solo il nodo interessato** e
  quelli che lo referenziano, non l'intero documento.
- La riga **`Asset:`** indica quali file grafici caricare in quel punto. Dove usa
  `stile_X`, sostituire X con `run.style`. Un ⚠️ GAP segnala un asset che manca
  ancora in produzione: usare il placeholder indicato.
  Il dettaglio asset→scena→uso sta in `docs/manifest-asset.md`.

---

## PERSONAGGI

| chi | ruolo |
|---|---|
| **Lucas** | accredito, S0 |
| **Francesca** | lobby, S1 |
| **Susan** | responsabile dell'evento, coordinamento **e regia**: S2, S3, S4, S5, S6, S7 |
| **Peter** | il quiz finale, S8 — non ha niente a che fare con la corsa di S9 |

**Martha non esiste più.** Il ruolo della regia durante il keynote è di Susan.
Non è un rinominamento: le battute sono riscritte sulla sua caratterizzazione.

### Susan

Responsabile diretta dell'evento e della regia. Competente, molto sotto
pressione, consapevole del peso che ha addosso. Ironica come valvola di sfogo:
diretta, rapida, concreta, e tende a scaricare ironicamente parte della pressione
sul giocatore. **Non è cattiva né cinica, e non deve diventare una macchietta.**

La comicità nasce dal contrasto fra *Susan deve far funzionare tutto* e *il
giocatore è diventato improvvisamente un altro problema da gestire*.

Da `[S4.03]` in poi Susan **non è in scena**: parla in cuffia dalla regia. A
schermo questo si vede dall'icona dell'auricolare accanto al nome e dal box di un
altro colore. In `[S2]`, `[S3]` e `[S7]` invece è lì davanti, con il suo sprite.

---

## INDICE SCENE

| ID | Scena |
|---|---|
| S0B | Ripresa partita (boot) |
| S0 | Esterno / terminale |
| S1 | Lobby |
| S2 | L'aggancio |
| S3 | Camerino — scelta stile |
| S4 | Dietro le quinte |
| S5 | Il keynote (core del gioco, con diramazioni) |
| S6 | Teleprompter / recap |
| S7 | Finale / countdown |
| S8 | Quiz di Peter |

---

# [S0B] RIPRESA PARTITA

**Condizione di ingresso:** `localStorage.run` esiste E `run.locked === false`

```
[S0B.01] CARD "BENTORNATO"
  Asset: nessun fondale dedicato — card UI sopra l'ultima scena visitata
  Testo: "Eri arrivato fino a: {last_scene}"
  Bottone A: RIPRENDI → vai a {last_scene}
  Link B: "Ricomincia da capo" → [S0B.02]

[S0B.02] MODALE CONFERMA RESET
  Asset: modale sopra la scena corrente, nessun asset nuovo
  Testo: "Sicuro? Perdi tutti i progressi di questa run."
  Bottone Sì → cancella run locale, crea run nuova → [S0.01]
  Bottone No → [S0B.01]
```

**Condizione alternativa:** `run.locked === true` → salta direttamente a
`[S7.05]` (countdown) o `[S1.ZONA4]` se il giocatore riapre dopo il lock.

---

# [S0] ESTERNO / TERMINALE

```
[S0.01] LUCAS — dialogo
  Asset: bg_esterno_vialetto → bg_esterno_ingresso + chr_lucas_saluto
  "Buongiorno! Sei in anticipo, bravo. Sei il primo che vedo oggi.
   Prima di entrare passa dal terminale e registrati. Ci vuole un minuto."
  → [S0.02]

[S0.02] TERMINALE — campo 1
  Asset: bg_esterno_ingresso + obj_terminale_accrediti + chr_lucas_idle
  Label: "Nome"   Tipo: testo libero
  Salva in: run.nome. Non serve il nome vero: e' il nickname con cui il
  gioco si rivolge al giocatore e con cui compare in classifica.

[S0.02b] TERMINALE — campo 2
  Label: "Cognome"   Tipo: testo libero, FACOLTATIVO — si continua anche a
  campo vuoto, senza dover toccare un bottone di salto a parte.
  Salva in: run.cognome. Serve solo a distinguere due giocatori con lo
  stesso nome in classifica ("Nome" + iniziale, es. "Lorenzo B."); non e'
  il nickname, quello resta run.nome.

[S0.03] TERMINALE — campo 3
  Label: "Genere" (per come il gioco si rivolge a te — non legato allo stile)
  Tipo: 2 bottoni — Maschile | Femminile
  Salva in: run.gender

[S0.04] TERMINALE — campo 4
  Label: "Store"   Tipo: lista — Piazza Liberty | Carosello | Fiordaliso
  Salva in: run.store

[S0.05] TERMINALE — campo 5
  Label: "Dipartimento"
  Tipo: lista — Operation | Support | Shopping | Leadership | People
  Salva in: run.department

[S0.06] TERMINALE — campo 6
  Label: "Da quanto sei in Apple"   Tipo: 4 bottoni — 0-1 | 2-3 | 4-7 | 8+
  Salva in: run.tenure

[S0.07] TERMINALE — campo 7
  Label: "iPhone che usi"   Tipo: lista, da iPhone 11 in poi
  Salva in: run.device

[S0.08] TERMINALE — stampa badge
  Asset: bg_esterno_ingresso + obj_terminale_accrediti (badge via UI, non immagine)
  "ACCREDITO CONFERMATO
   {nickname} · {store} · {department}
   ANZIANITÀ: {tenure} · DISPOSITIVO: {device}
   RUOLO: OSPITE"
  Effetto: la riga "RUOLO" resta visibile ~1s in più delle altre (easter egg)
  → [S0.09]

[S0.09] LUCAS — dialogo
  Asset: bg_esterno_ingresso + chr_lucas_pollice_su
  "Perfetto, {nickname}. La lobby è aperta, accomodati pure.
   Ah — se senti qualcuno urlare, non preoccuparti. Succede sempre."
  → [S1.01]
```

---

# [S1] LOBBY

```
[S1.01] FRANCESCA — dialogo (genere già noto da run.gender)
  Asset: bg_lobby_z1_tenda + chr_francesca_benvenuto
  "{nickname}! Benvenuto/a. Fai con calma, guardati pure intorno e fai un
   giro... tanto di là non si inizia senza di te.
   Scorri per scoprire la lobby. Tutto quello che brilla si tocca."
  → [S1.02]

[S1.02] FRANCESCA — indica la tenda (tono neutro, NO SPOILER)
  Asset: bg_lobby_z1_tenda + chr_francesca_indica_tenda
  "Quando sei pronto/a, vai verso la tenda. Da lì in poi... sei a teatro."
  → [S1.HUB]

[S1.HUB] HUB LOBBY — 5 zone, swipe orizzontale libero, nessun ordine forzato
  ZONA1 → bg_lobby_z1_tenda (nessun oggetto separato per la tenda)
  ZONA1 dopo le previsioni → stesso fondale, senza hotspot ENTRA: lo show è
                     andato, e la battuta non manda più nessuno di là
  ZONA2 → bg_lobby_z2_hall_of_fame + obj_targa_hall_of_fame + chr_francesca_idle
  ZONA3 → bg_lobby_z3_regolamento + chr_francesca_idle
  ZONA4 bloccata   → bg_lobby_z4_quiz_bloccata + obj_tavolino_buzzer_peter
                     (frame non premuto) + chr_peter_occhi_bassi (addormentato)
                     → chr_peter_alza_occhi al tocco
  ZONA4 sbloccata  → bg_lobby_z4_quiz_aperta + obj_lucchetto_zona4 (frame
                     "aperto", animazione una tantum al primo sblocco)
  ZONA5 bloccata   → bg_staff_door_locked (lettore badge rosso, disegnato nel
                     fondale) — la porta di Apple Campus Run, vedi [S1.ZONA5]
  ZONA5 sbloccata  → bg_staff_door_authorized (lettore badge verde, porta
                     ancora chiusa: il badge è autorizzato, non la porta aperta)
  Tutorial swipe   → chr_francesca_gesto_swipe (deve coincidere col gesto reale
                     implementato: verificare prima di finalizzare l'asset)

  Vincolo tutorial: ENTRA in [S1.ZONA1] disabilitato finché il giocatore non ha
  fatto almeno 1 swipe.

  Presentazione una volta sola: la battuta che spiega una zona si dice al primo
  passaggio. Tornandoci, Francesca sparisce e il box non compare: chi ha già
  fatto il giro gira in silenzio. Unica eccezione la tenda: dal secondo
  passaggio in poi Francesca ricompare lì e basta —
    FRANCESCA: "Sei pronto? Dietro questa tenda comincia lo show."
  Toccare un hotspot in una zona già vista fa comunque rientrare il personaggio
  che risponde.

  [S1.ZONA1] Tenda d'ingresso
    Hotspot ENTRA (attivo solo dopo il tutorial)
      → MODALE "Vuoi entrare nel teatro? Sì, entro / Non ancora"
      → Sì: effetto in codice (fade o split-scroll di bg_lobby_z1_tenda) → [S2.01]
      → Non ancora: resta in [S1.HUB]

  [S1.ZONA2] Hall of Fame
    La parete con i tre vincitori delle edizioni passate (2024, 2025, 2026).
    Ogni quadro si apre per conto suo, uno alla volta, e si chiude tornando
    nella zona: non e' una scena, non tocca la partita.
    FRANCESCA: "La Hall of Fame. Qui finiscono quelli che per un anno possono
                dire di averci visto lungo."
    (nessuna seconda battuta prima delle immagini: la zona la presenta questa
     riga, il resto lo dice il disegno)

  [S1.ZONA3] Regolamento
    FRANCESCA:
      "Il regolamento è lì sul cartellone, se ti serve. Non è lungo:
       abbiamo preferito lasciarti qualche possibilità di sbagliare."
      (battuta valida sia prima sia dopo le previsioni: la lobby si rivisita)

    Hotspot sul cartellone: IL REGOLAMENTO
      → apre la UI Regolamento (pannello sopra la lobby, non una scena a parte:
        il fondale va fuori fuoco e la lobby resta sotto)
      → [HO CAPITO] chiude e riporta a [S1.ZONA3]

    Il pannello ha due gruppi di voci richiudibili:
      REGOLE      COME SI GIOCA · PUNTEGGI
      ──── INFORMAZIONI SUL PROGETTO ────
                  PARTECIPAZIONE · IL PROGETTO · PRIVACY E DATI · SICUREZZA ·
                  INDIPENDENZA · MARCHI E CONTENUTI · CONTATTI
      e in fondo, fissa, la REGOLA NON SCRITTA.

    Privacy, indipendenza e contatti NON hanno una voce di menu propria: stanno
    qui. Nessuna sezione si chiama "note legali".

    La schermata NON tocca niente della partita: né punti, né picks, né
    run.locked, né lo stile, né le domande già consumate. È solo da leggere.
    Testo delle cinque sezioni + la regola non scritta in `story.regolamento`
    (game/story.json).

  [S1.ZONA4] Quiz — Peter
    SE run.locked === false:
      lucchetto chiuso, Peter addormentato
      PETER (al tocco, si sveglia di scatto):
        "Prima segui il keynote. Poi le domande difficili."
    SE run.locked === true:
      lucchetto aperto (animazione una tantum) → [S8.01]

  [S1.ZONA5] Porta STAFF ONLY — vedi [S9] per i dettagli completi
    Non ha un personaggio in scena: la porta è la scenografia, e a rispondere
    è Francesca, che compare solo al tocco.
    SE run.locked === false:
      hotspot sulla porta → suono errore/fail, lettore rosso (nel fondale)
      FRANCESCA: "Eh no. Il badge non ti dà ancora tutto questo potere.
                  Torna più tardi."
      → resta in [S1.HUB]
    SE run.locked === true:
      hotspot sulla porta → suono successo/livello completato, lettore verde
      → il fondale passa a bg_campus_run_corridor, e sopra si apre [S9]
      → alla chiusura si torna qui, in [S1.HUB]
```

---

# [S2] L'AGGANCIO

```
[S2.01] Ingresso in sala (post-transizione tenda)
  Asset: bg_sala_ingresso_superiore + chr_susan_panico_telefoni (piccola, in fondo)
  SUSAN: "Ehi, tu! Sì, proprio tu. Vieni qui."
  → transizione verso il palco (fade o parallax opzionale) → [S2.02]

[S2.02] SUSAN — dialogo (forma neutra, nessun indirizzo di genere)
  Asset: bg_palco_vuoto + chr_susan_mani_capelli
  (la discesa in sala finisce sul palco, visto da chi ci sta sopra: prima
   tornava la sala dall'alto, cioe' il punto da cui era appena partita)
  "Ascolta. Il CEO è bloccato in tangenziale, no in autostrada...
   insomma è fermo.

   Tra quaranta minuti abbiamo la prova generale: regia, luci, grafici,
   tutto. E senza di lui non si fa niente.

   Quindi abbiamo un piccolo problema.

   Tu sei l'unico essere umano qui dentro...

   Congratulazioni! Fai l'host."
  → [S2.03]

[S2.03] SCELTA — SOLO TONO, nessun effetto su stato o punteggio
  Asset: stessa inquadratura, nessun cambio
  A: "Io? Ma non ho studiato niente!"
  B: "Finalmente qualcuno se n'è accorto."
  C: (annuire in silenzio)
  Tutte → [S2.04]

[S2.04] SUSAN — dialogo IN DUE TAP
  Asset: bg_backstage_corridoio + chr_susan_indica_camerino
  Tap 1: "Ottimo, hai detto sì."
  Tap 2: "Ora vai in camerino, ultima porta a destra. Hai quattro minuti e ne
          hai già persi due."
  Tap 3: "Io intanto provo a evitare che crolli il resto."
  → [S3.01]
```

**Nota:** l'opzione B ("sfacciata") abilita l'evento comico `chr_susan_carponi`
più avanti in `[S5]`. Salvare in `run.flags.sfacciato_s2 = true/false`.

---

# [S3] CAMERINO — SCELTA STILE

```
[S3.01] SUSAN — dialogo
  Asset: bg_camerino + chr_susan_guarda_orologio
  "Scegli uno stile e cambiati. Veloce. Ho un Keynote da salvare
   e tu non sarai il problema numero due."
  → [S3.02]

[S3.02] SCHERMATA STILE — carosello, 4 opzioni
  Asset: bg_camerino + stile_{hawaiano|showman|drip|ingegnere}_palco_attesa
  ⚠️ run.gender è già noto da [S0.03] e NON dipende dallo stile scelto qui.

  Ogni card mostra immagine + descrizione ironica + il perk del quiz collegato:

  Hawaiano   "Non sa che ore sono, ma sa sempre cosa dire."
             Perk: un tentativo fallito non si conta, una volta per livello
  Showman    "Crede a tutto ciò che dice, per davvero."
             Perk: tutte le difficoltà sbloccate da subito, ordine libero
  Drip       "Non le importa, ma lo fa con più stile di te."
             Perk: un 50/50 per livello, elimina due risposte sbagliate
  Ingegnere  "Ha già letto le specifiche che tu non sapevi esistessero."
             Perk: +3 secondi su ogni domanda

  → [S3.03]

[S3.03] MODALE CONFERMA — irreversibile
  "Sei sicuro/a? Questo stile ti accompagna per tutta la partita. Non si cambia."
  Sì, sono io → run.style = {scelto}, blocco permanente → [S3.04]
  Fammi ripensare → [S3.02]

[S3.04] SUSAN — commento, varia SOLO in base a run.style
  Asset: bg_camerino + chr_susan_commento_stile (testa tagliata corrispondente
    allo stile, dallo sprite sheet a 4 teste)
  hawaiano  → "Ok. Relax. Ottimo. Proprio quello che mi serviva in una
               situazione del genere."
  showman   → "Perfetto. Uno che non avrà problemi a parlare. Il problema
               sarà farlo smettere."
  drip      → "Va bene. Non ho idea di cosa significhi, ma evidentemente tu sì."
  ingegnere → "Ingegnere. Perfetto. Finalmente qualcuno che può spiegarmi
               perché tutto sta andando storto."
  → [S4.01]
```

---

# [S4] DIETRO LE QUINTE

```
[S4.01] SUSAN infila l'auricolare
  Asset: bg_dietro_le_quinte + chr_susan.duo_pronto_X (X = stile scelto)
  Risolto: non e' piu' un placeholder. Il gap era "Susan e il personaggio come
  due sprite separati da riallineare a mano" — le composizioni scene_X_ready
  (una per stile) arrivano gia' complete, Susan e il giocatore insieme, e
  sostituiscono sia stile_X_idle_camerino sia il vecchio placeholder
  chr_susan_indica_camerino (rimasto nel cast, usato ancora in [S2]).
  "Studiato, vero?"
  A: "Certo." → "Che bugiardo/a. Adoro, sei già nel personaggio."
  B: "No."    → "Onesto/a. Sarà un problema tuo, non mio. Vai."
  → [S4.02]

[S4.02] SUSAN spinge in scena
  Asset: bg_dietro_le_quinte + chr_susan.duo_spinta_X (X = stile scelto)
  Stessa composizione della coppia scene_X_push: sostituisce
  chr_susan_spinta_in_scena (rimosso dal cast, non piu' usato da nessuna scena).
  "Vai."
  → effetto sipario (split animato di bg_palco_sipario_chiuso) → [S4.03]

[S4.03] SUSAN — passa in regia, prima battuta in cuffia
  Asset: bg_palco_sipario_chiuso → fx_apertura_sipario → bg_palco_platea_piena
         + chr_indicatore_regia + stile_X_idle_palco
  "Ok. Tra trenta secondi andiamo."
  (pausa)
  "Il pubblico è caldo. Se qualcosa va storto... tu continua a parlare."
  (unica battuta della sequenza su pubblico e imprevisti: niente luci calde,
   niente "non guardare in alto")

[S4.04] SUSAN — ultimo briefing
  "Ricorda una cosa: nessuno sa chi sei."
  (pausa)
  "Quindi, tecnicamente, non puoi deludere nessuno."
  "Io intanto provo a evitare che crolli il resto."
  → [S5.INTERMEZZO.R1]
```

---

# [S5] IL KEYNOTE

## Struttura

```
[S5.INTERMEZZO.R1] → intermezzo di regia R1
  (uno solo prima del primo macroargomento: R2, la luce per Craig, è stata
   tolta per non allungare l'apertura)
  Asset: bg_palco_platea_piena + chr_indicatore_regia + stile_X_idle_palco
  ↓
[S5.HUB] GRIGLIA 3 MACROARGOMENTI, ordine libero
  Asset: bg_palco_schermo_categorie + obj_icone_categorie (stato attiva/
         completata/disabilitata per ciascuna) + stile_X_idle_palco
  I tre pannelli dello schermo alle spalle si accendono uno per volta, con
  l'emblema del macroargomento (prop_emblema_categoria_*), alla PRIMA scelta
  di quella categoria — non a domande finite. Sono scenografia, non
  interfaccia: stanno sul fondale, non dentro i bottoni, e valgono solo su
  questo fondale. Fonte: run.categorie_visitate, che entra nel salvataggio.
  - iPhone   (6 core, pool 6 facoltative)
  - Watch    (3 core, pool 5 facoltative)
  - Altro    (3 core, pool 6 facoltative)

Entrando in un macroargomento: tutte le CORE in ordine fisso, sequenza
obbligata, nessuna scelta di rumor → [S5.BIVIO]

[S5.BIVIO] dopo l'ultima core
  SUSAN: "Siamo in tempo. Vuoi entrare nel dettaglio o passiamo al prossimo
          argomento?"
  APPROFONDISCI → SUSAN: "Certo. Perché fermarsi quando stava andando tutto
    bene." → pesca 3 facoltative a caso dal pool della categoria
    (pescate ORA, non a inizio partita: chi rigioca in privato non può
    mapparle) → esegui le 3 → intermezzo → torna a [S5.HUB]
  PASSA AL PROSSIMO → SUSAN: "Ottima scelta. Una cosa in meno da gestire."
    → intermezzo → torna a [S5.HUB]

Tutti e 3 i macroargomenti completati → [S6.01]
```

## Loop di una singola domanda

```
[S5.DOMANDA]
  Asset: bg_palco_platea_piena + stile_X_annuncio / stile_X_indica_schermo
  (alternati a caso) + reazione platea (assegnata a caso, MAI legata alla
  risposta)
  Niente slide della categoria sopra la scena: la striscia orizzontale in alto
  rubava spazio e ripeteva quello che diceva gia' la domanda. Dove il giocatore
  e' gia' stato lo dice lo schermo del palco in [S5.HUB], con gli emblemi.

  1. SUSAN introduce la domanda dalla regia (riga corta, dal pool
     `regia.introDomanda`: "Tocca a te.", "Vai.", "Slide su."...)
  2. Card con le opzioni (2-4)
  3. Il giocatore sceglie → run.picks[categoria][core|extra][ID]
  4. Il personaggio annuncia alla platea con la battuta del suo stile
     (da game/domande.json, campo `battute[run.style]`)
  5. SE random() < probabilità (0.15, `regia.probabilitaEvento`): il prossimo
     evento del sacchetto. Il sacchetto si mescola una volta per partita e
     l'evento personale dello stile sta in testa, quindi è il primo a uscire:
     in media 3 eventi su 21 risposte, uno ogni sette domande
  6. Il micro-evento, se estratto, presenta tre reazioni rapide: il valore di
     ciascuna è +1 / 0 / -1, fisso — quello scritto dall'autore in banca
     (`editoriale`, sul segno) — e non viene mai mostrato al giocatore
  7. Reazione platea A CASO — mai legata al contenuto della risposta
  8. → prossima domanda, o [S5.BIVIO] se era l'ultima core
```

> **Regola d'oro.** Durante il keynote la reazione della platea non deve MAI
> correlare col contenuto del pronostico scelto: assegnazione casuale. Altrimenti
> il gioco suggerisce le risposte e falsa i pronostici. Il quiz di Peter `[S8]` è
> l'eccezione dichiarata: lì il feedback giusto/sbagliato è corretto, perché le
> domande hanno risposte oggettive.

## Le battute di Susan durante il keynote

Susan **non parla dopo ogni singola scelta**: sarebbe rumore, e la farebbe
sembrare un commentatore invece che una che sta lavorando. Le sue battute stanno
in **pool per situazione** (`story.regia` in `game/story.json`) e escono nei
punti dove servono:

| pool | quando esce |
|---|---|
| `apertura` | una volta sola, a inizio `[S5]` |
| `introDomanda` | riga corta prima di ogni domanda ("Tocca a te.", "Slide su.") |
| `scarica` | quando parte un micro-evento che non ha una sua battuta scritta |
| `improvvisazione` | conseguenza di un micro-evento andato bene |
| `caos` | conseguenza di un micro-evento neutro |
| `critica` | conseguenza di un micro-evento andato male |

I tre pool di conseguenza sono l'**unico** ritorno che il giocatore riceve dopo
un micro-evento. Non devono mai far capire quanto vale la risposta: niente
numeri, niente "bene"/"male" espliciti, solo come Susan racconta com'è andata.

## Micro-eventi generali, eventi personali, intermezzi

Elenco e testi in `game/domande.json` (`micro_eventi`, `eventi_personali`,
`intermezzi`). Cinque micro-eventi generali in banca, uno personale per stile,
sette intermezzi. R2 (la luce per Craig) e R3 (il primo piano) sono state tolte
per non allungare le previsioni.

**Gli intermezzi sono un pool solo di sette** (R1, R4, R5, RS1-RS4): non ci
sono più "fissi" e "riserva", valgono tutti uguale. A ogni partita si mescolano
e se ne giocano **al massimo quattro** — uno prima del primo macroargomento,
gli altri dopo un macroargomento completato — e mai due volte lo stesso. Quali
quattro escano non si sa in anticipo e cambia da una partita all'altra.

**I micro-eventi sono al massimo due per partita**, pescati a caso fra i cinque,
più l'evento personale dello stile, che sta in testa al sacchetto: tre
imprevisti in tutto. Sono limitati apposta — il keynote è fatto di pronostici, e
un imprevisto ogni tre domande smetterebbe di essere un imprevisto. Nessuno si
ripete nella stessa partita.

Ogni voce contiene tre `opzioni`, ognuna con un `editoriale` (`+3`/`0`/`-3`) che
è insieme il tono della battuta e il punteggio vero — il motore lo traduce nel
segno (`+1` risposta positiva o collaborativa, `0` neutra, `-1` egoista o
cattiva), **fisso, mai mescolato**: la stessa risposta vale sempre lo stesso
punto, a ogni partita e per ogni giocatore. Il valore lo decide l'autore nella
banca, non il motore a runtime. L'interfaccia non deve mostrare mai numeri,
badge, popup, "bonus" o "malus": l'esito deve restare leggibile solo come
conseguenza narrativa.

## Riavvolgere

In basso a destra, appena sopra il box del dialogo, una freccia `←`
**riavvolge**: rimette in scena la battuta appena lasciata — testo,
personaggio, posa — e da lì si riparte. Su una domanda già risposta si può
rispondere di nuovo: la risposta nuova **sostituisce** la vecchia e il totale
si ricalcola da capo, quindi il punto di prima non resta sommato da nessuna
parte.

Dove non arriva, per scelta: prima dell'inizio, oltre un cambio di scena
(rientrare in una scena chiusa vorrebbe dire rigiocarla), dopo le previsioni
confermate, e sulle schermate che non sono una rilettura ma un impegno preso o
un posto a sé — terminale, badge, lobby, camerino, griglia, riepilogo,
countdown, quiz, email, Campus Run.

Quello che è stato **sorteggiato** per la partita (quali intermezzi, quali
imprevisti, quali facoltative) non si rimescola riavvolgendo: cambierebbe la
partita invece di rimostrarla. Anche le parole sono le stesse — le battute
pescate da un pool restano quelle che erano.

## Le domande

29 domande — 12 core + 17 facoltative — in `game/domande.json`.
Indice degli id in `docs/indice-domande.md`.

---

# [S6] TELEPROMPTER / SALA REGIA

```
[S6.01] SUSAN — il giocatore lascia il palco
  Asset: bg_control_room_susan (Susan alla console, tre monitor davanti a lei
  — l'immagine ha già la figura disegnata dentro: niente sprite npc qui, la
  battuta arriva in cuffia come il resto della regia)
  "Questo è il tuo Keynote. O almeno la versione che hai deciso di prevedere."
  "Ok, da qui non si torna indietro."
  → [S6.02]

[S6.02] SUSAN — cambio fondale
  Asset: bg_control_room_monitors, dissolvenza. Appena la dissolvenza finisce
  si apre subito [S6.03], senza un'altra battuta in mezzo: le due righe di
  Susan restano entrambe prima del cambio fondale, cosi' il tocco dopo "Ok,
  da qui non si torna indietro" porta dritto ai tre monitor.
  → [S6.03]

[S6.03] I TRE MONITOR — riepilogo modificabile
  Asset: bg_control_room_monitors + UI reale sovrapposta (non è un'immagine
  fissa): tre schede, una per macroargomento (iPhone, Watch, Altro).
  Vista generale: nome della categoria, anello di completamento (fatte/totale,
  percentuale), "COMPLETATO" a 100%. Le core sono sempre già tutte fatte (la
  griglia di [S5.HUB] non cede il turno prima) — quello che può mancare sono
  solo le facoltative pescate.
  Tocco su un monitor → dettaglio: titolo, anello, elenco delle risposte date
  (ogni riga riapre la card originale, come nel vecchio recap), righe
  tratteggiate per le facoltative non ancora pescate ("Previsione mancante" —
  al tocco pesca e fa rispondere subito, come un posto libero da riempire).
  Rispondere (modifica o facoltativa nuova) riporta alla vista generale, non
  al dettaglio: è lì che si vede il progresso aggiornato.
  Bottone rosso fisso nella vista generale: CONFERMA IL TUO KEYNOTE → [S6.04]

[S6.04] MODALE CONFERMA
  "Sicuro? Dopo questo le tue previsioni sono definitive."
  Sì → run.locked = true, run.submitted_at = TIMESTAMP SERVER,
       la run va in coda (il POST parte da [S7.03b], così è una riga sola con
       dentro l'email), sblocco [S1.ZONA4] → [S7.01]
  No → [S6.03]

  Nota di lessico: al giocatore non si dice mai "schedina bloccata" (né "la
  schedina è chiusa", "previsioni bloccate"). Si dice che le previsioni sono
  fatte, confermate, registrate, concluse.
```

---

# [S7] FINALE

```
[S7.01] SUSAN
  Asset: bg_palco_platea_piena + chr_susan_sollievo → chr_susan_sguardo_in_alto
  "Wow! Ce l'abbiamo fatta!" (guarda in alto) "...eccolo, è arrivato."

[S7.02] Sagoma alla porta
  Asset: bg_finale_porta_illuminata + fx_fascio_luce_porta
         + chr_ceo_sagoma → (dopo 2s) chr_ceo_pollice_su

[S7.03] SUSAN — ultima battuta
  Asset: stessa inquadratura + chr_indicatore_regia
  "Bella prova. Ci vediamo tra poco per quella vera."

[S7.04] Nero

[S7.03b] EMAIL FACOLTATIVA — dopo il teleprompter, prima dei titoli di coda
  Pannello UI sopra il nero, nessun asset nuovo.
    Titolo:      DOVE TI TROVIAMO?
    Testo:       "Quando avremo i risultati finali, possiamo mandarteli via
                  email."
    Campo:       "La tua email"  (placeholder nome@esempio.com)
    Nota:        "Non devi lasciarla per forza. Però Lorenzo e Michael ci hanno
                  lavorato parecchio, quindi ecco. Pensaci."
    Privacy:     "La useremo solo per inviarti i risultati di FantaLiberty
                  Story."
    Bottone:     CONTINUA
    Salto:       "Preferisco spezzare loro il cuore"

  È facoltativa davvero: si continua anche a campo vuoto. Se c'è, viene salvata
  con la run (colonna `email`) e serve solo a mandare i risultati. Da qui parte
  il POST della run messa in coda in [S6.03].

[S7.04b] TITOLI DI CODA
  Stile del cartello d'apertura: nero, testo centrato, scritto a macchina.
  Cinque blocchi che compaiono, restano e sfumano uno nell'altro — non si
  accumulano. Vanno da soli, ~12 secondi in tutto.

    FANTALIBERTY / STORY
    CREATO DA / Lorenzo / Michael          (stesso peso visivo)
    TEST / Qualcuno, probabilmente
    SUPPORTO PSICOLOGICO / Assente
    BUDGET / 30 Newton

  Il tocco ACCELERA, non salta: i blocchi restano tutti e cinque, solo piu'
  veloci (~6s con un tocco a meta', ~4s toccando di continuo). L'ultimo blocco
  NON sfuma: resta a schermo con la freccia, e un ultimo tocco porta al
  cartello [S7.04c].

  Tono asciutto: i primi crediti seri, poi due assurdi, chiusa sui 30 Newton.
  Non aggiungere altri ruoli o battute senza chiedere.

[S7.04c] CARTELLO — subito dopo i titoli di coda
  Stesso nero dei titoli. NON è una battuta di Francesca: è il gioco che parla.
    "Hai completato una fase,
     non l'intera esperienza."
    "Tocca lo schermo per continuare"   (riga piccola)
  Al tocco → [S1.HUB] in modalità post-previsioni, cioè [S1.POST].

[S1.POST] RITORNO IN LOBBY — una volta sola (post_lobby_visto)
  Asset: bg_lobby_z1_tenda + chr_francesca_orgogliosa → chr_francesca_idle
  Tono gentile e incoraggiante, ironico senza pungere.

    [POST-L01] "Ah, eccoti. Allora, com'è andata?"
    [POST-L02] "Hai completato le tue previsioni. Adesso aspettiamo il keynote
                e scopriamo quanto ci hai preso."
    [POST-L03] "Ma non abbiamo finito."
    [POST-L04] "Vai da Peter: ha una sfida per te, tutta di testa."
    [POST-L05] "Le risposte giuste possono moltiplicare i punti delle tue
                previsioni."
    [POST-L06] "Quindi sì, quei dettagli inutilmente specifici potrebbero
                finalmente servirti."

  Poi → [S1.HUB], che qui si apre direttamente sulla ZONA4 (Peter): è quello che
  resta da fare. Niente tutorial dello swipe — la lobby è già stata girata — e
  la ZONA1 diventa la variante a show finito: la tenda non riporta in sala (là
  si rigiocherebbe lo show), porta al conto alla rovescia — ed è l'unico modo
  di tornarci dalla lobby.

[S7.05] COUNTDOWN — ci si arriva dopo il quiz, e a ogni riapertura
  Asset: bg_countdown_nero
  "{nickname} — PREVISIONI COMPLETATE
   Il keynote vero inizia tra [ 00:00:00 ]"
  È la schermata su cui si riapre il gioco nei giorni fra le previsioni e il
  keynote, quindi il quiz sta qui, a un tocco: chi rientra non deve rifare il
  giro della lobby per arrivarci. APPLE CAMPUS RUN non è fra queste azioni: si
  raggiunge solo dalla porta STAFF ONLY in lobby, mai da una scorciatoia qui.
  A: IL QUIZ DI PETER → [S8.01]
  B: TORNA IN LOBBY → [S1.HUB] (zona 4 ora sbloccata, e zona 5 — STAFF ONLY —
     ora autorizzata)
  C: LA TUA CARD → genera ed esporta obj_card_condivisibile client-side
     (1080x1920 / 1080x1350)
```

---

# [S8] QUIZ DI PETER

```
[S8.01] PETER — prima volta
  Asset: bg_lobby_z4_quiz_aperta + chr_peter_alza_occhi
  "Hai fatto il keynote. Ora vediamo quanto conosci quelli passati."
  (Peter parla solo del quiz: Apple Campus Run non la nomina, non la
   commenta, non c'entra niente con lui. Si scopre altrove, dalla porta
   STAFF ONLY della lobby)

  "Lo stile che hai scelto ti dà una mano: <perk dello stile>."
    hawaiano  → il primo giro storto di ogni livello non conta
    showman   → i livelli sono già aperti tutti e tre
    drip      → una volta per livello Peter toglie due risposte sbagliate
    ingegnere → tre secondi in più su ogni domanda
  "3 livelli di difficoltà e due tentativi, con il tempo che scorre.
   Quante ne sai?"
  (il perk si spiega QUI e solo qui — in S3, sulla scheda del carosello, era
   una meccanica del quiz arrivata troppo presto. La meccanica dei
   moltiplicatori invece non si rispiega: sta nel regolamento)

[S8.HUB] Selezione livello
  SE run.style == showman: tutti e 3 i livelli sbloccati, ordine libero
  ALTRIMENTI: Avanzato dopo aver passato Base, Leggenda dopo Avanzato
  Sotto la griglia, solo l'uscita verso la lobby. APPLE CAMPUS RUN non è qui:
  niente pulsante, niente link, niente battuta di ritorno — è un'attività
  indipendente, si raggiunge solo dalla porta STAFF ONLY della lobby (vedi
  [S9]). Nessuna battuta fissa "da dove vuoi cominciare?": la griglia parla
  da sola.

[S8.LOOP] per ogni livello
  Asset: bg_lobby_z4_quiz_aperta + chr_peter_guarda_orologio (timer sotto i 3s)
         → chr_peter_annuisce (giusta) / chr_peter_scuote_testa (sbagliata)

  1. ENTRARE nel livello consuma subito il tentativo (attempts += 1) e lo
     salva: chi esce a metà — chiude l'app, ricarica — non se lo ritrova
     intatto. Prima si contava a fine livello, ed era aggirabile.
  2. Pesca N domande dal pool del livello (mai le stesse del tentativo
     precedente per lo stesso giocatore/livello — per questo i pool sono due)
  3. Per ogni domanda: timer parte al render, risposta o timeout
     drip     → 1x per livello il 50/50
     hawaiano → il primo fallimento per livello non consuma il tentativo
                (glielo restituisce: attempts -= 1)
  4. Fine → punteggio
     SE punteggio >= soglia: passed = true, mult_bank += (1° tentativo ?
       valore pieno : metà)
     ALTRIMENTI: sotto i 2 tentativi si riprova con l'altro pool, da 2 in poi
       il livello è chiuso per questa run. Se così si chiude anche la strada ai
       livelli successivi, la griglia lo dice ("fuori portata") e Peter smette
       di chiedere da dove cominciare

[S8.FINALE] assegnazione moltiplicatori — apribile appena se ne vince uno
  (la finestra delle 24h prima del keynote teneva la schermata spenta per
   tutti i giorni in cui il quiz si gioca: si torna a metterla scrivendo
   "finestra_ore" in game/quiz.json, senza quella chiave non blocca niente)
  Asset: bg_lobby_z4_quiz_aperta + chr_peter_alza_occhi
  Nessuna battuta attorno al pannello: la meccanica è nel regolamento e
  ripeterla qui allungava soltanto. Peter è in scena e basta.
  Distribuisci run.mult_bank su iphone/watch/altro. Nessun tetto per categoria
  oltre al totale accumulato. Conferma → run.multipliers, irreversibile.
```

Le domande girano fra prodotti, persone, tecnologia, storia, design, software e
cultura dei keynote: le date restano dove sono iconiche, ma non sono il formato
dominante. Base = i prodotti che si conoscono, Avanzato = ecosistema e figure
chiave, Leggenda = storia e curiosita' meno note.

Livelli, soglie, timer, perk e le 44 domande (due pool per livello) in
`game/quiz.json`.

---

# [S9] APPLE CAMPUS RUN

```
Non è una scena e non tocca la partita: si apre in un riquadro sopra quello
che c'è — come il regolamento e i quadri della Hall of Fame — e chiudendola il
giocatore è esattamente dov'era. Vive in una pagina sua, `game/runner/`.

Attività completamente indipendente da Peter e dal quiz: nessun link nella
griglia [S8.HUB], nessuna azione nel countdown [S7.05]. Un solo accesso:

  [S1.HUB], ZONA5 — porta STAFF ONLY, sempre visibile nella lobby
    Bloccata (run.locked == false): bg_staff_door_locked, lettore badge
    rosso. Al tocco:
      suono errore/fail → "Eh no. Il badge non ti dà ancora tutto questo
      potere. Torna più tardi." (Francesca) → resta in lobby.
    Autorizzata (run.locked == true, dopo la conferma delle previsioni):
    bg_staff_door_authorized, lettore badge verde. Al tocco:
      suono successo/livello completato → il fondale passa al corridoio
      (bg_campus_run_corridor) → si apre [S9] sopra di esso, senza mostrare
      la porta aprirsi fisicamente. Alla chiusura si torna alla porta, in
      lobby — non è mai una scena.

Come si gioca: corsa senza fine dentro il corridoio vetrato del campus, tre
corsie, swipe per cambiare corsia, saltare e scivolare. Anelli e prodotti
Apple danno punti, le tre "fregature" nelle bolle rosse — cuffie aggrovigliate,
cavo sfilacciato, batteria all'1% — ne tolgono (25 / 50 / 100), e gli ostacoli
tolgono cuori (se ne parte con tre). Si
riprova quante volte si vuole. Il record resta nel salvataggio
(run.runner_record).

Ogni mille punti si cambia livello: si attraversa una riga dorata che pulsa
sul pavimento, sotto la stella del traguardo, e da lì in poi si corre più
veloce (dieci scalini, fino a 10.000 punti). In ogni livello c'è **un solo
cuore di ricarica**, in un punto a caso del tratto: chi lo perde se lo tiene
fino al traguardo dopo.

IN SOSPESO: come i punti della corsa entrano nella classifica dei pronostici.
Finché non è deciso, il record si tiene e basta — non tocca né i punti né i
moltiplicatori.
```

---

# TABELLA VALORI E FORMULE

```
Punteggio domanda core = difficoltà (1-5) + bonus opzione
  consenso +0 · plausibile +1 · controcorrente +1

Punteggio facoltativa/intermezzo = valore secco dell'opzione (1, 2 o 3)

Punteggio micro-evento (ed evento personale dello stile) = +1 / 0 / -1, fisso
  per opzione (dal segno di "editoriale" in banca), mai a caso e mai mostrato

Moltiplicatore pool = opzione scelta da <10% dei giocatori  ×1.5
                                        10-30%             ×1.25
                                        >30%               ×1

Punteggio finale per domanda =
  min(10, punteggio_base × pool × moltiplicatore_quiz)

Bonus completamento = +1 per ogni categoria con tutte e 3 le facoltative
  completate (max +3)

Bonus personali (piccoli, servono a sciogliere i quasi pari merito)
  rookieBonus, da "anni" chiesto in [S0] (nel database e' il CODICE 0-3,
  non l'etichetta):
    0 = 0-2 anni +1 · 1 = 3-7 anni +0.5 · 2 = 8-12 anni +0.25 · 3 = oltre 0
  deviceBonus, dalla generazione dell'iPhone scelto in [S0]:
    17 / Air 0 · 16 +0.25 · 15 +0.5 · 14 e 13 +0.75 · 12 e precedenti +1
  Tetto: rookieBonus + deviceBonus ≤ +2
```

Il conto finale (pool, moltiplicatori del quiz, bonus) **non lo fa il gioco**:
l'app salva e spedisce solo la somma secca delle risposte. La classifica si
calcola a mano dopo il keynote del 9 settembre, sui dati arrivati a Supabase —
`anni` e `device` sono gia' nel payload, i bonus personali non chiedono niente
di nuovo al giocatore.

Il bonus del completamento degli intermezzi non esiste piu': il giro ne fa
giocare quattro (uno all'apertura del keynote, uno per macroargomento) e un
bonus che nessuno poteva prendere era solo un numero scritto in un documento.

`npm test` ricalcola i punteggi delle core da questa formula e li confronta con
quelli scritti in `game/domande.json`.

---

# NOTA GENERE

`run.gender` è un **campo indipendente**, chiesto in `[S0.03]` subito dopo il
nome — **non** derivato dallo stile scelto in S3.

- Il genere del personaggio visivo (Hawaiano/Showman disegnati maschili,
  Drip/Ingegnere femminili) **non ha alcun effetto sul testo**: una giocatrice
  che dichiara "femminile" e sceglie Showman riceve battute al femminile, anche
  se lo sprite è un uomo. Viceversa per chi sceglie Drip o Ingegnere.
- **Convenzione di scrittura:** quando cambia solo la desinenza (bugiardo/a,
  onesto/a, sicuro/a) si scrive **inline con lo slash**, una riga sola. Quando
  la frase cambia in modo più sostanziale, o quando si può evitare del tutto una
  parola di genere riformulando (es. "Ascolta." invece di "Senti caro/a."), si
  preferisce la seconda strada: più naturale, meno meccanica da leggere.
- Da `[S0.03]` in poi ogni riga che richiede una forma di genere usa **sempre e
  solo** `run.gender`, mai lo stile.

---

# VINCOLI TECNICI

1. **Persistenza:** `localStorage` per lo stato della run (sopravvive a chiusura
   app, riavvio, giorni di distanza). **Cache API/service worker solo per gli
   asset** — mai per lo stato di gioco. Sono cose tecnicamente diverse e servono
   entrambe.
2. **Autosave a ogni singola scelta e a ogni cambio scena** (`run.last_scene`
   sempre aggiornato), non solo ai checkpoint.
3. **Salvataggio-specchio lato server** appena parte il quiz e appena si fa il
   lock, non solo alla fine. Timestamp di lock generato **lato server**: mai
   fidarsi di un timestamp client.
4. **Regola d'oro** (vedi [S5]): la reazione della platea non correla mai col
   contenuto del pronostico.
5. **Stile** scelto una volta, per tutta l'edizione, irreversibile — con modale
   di conferma esplicito.
6. **Una sola giocata per persona:** identità = nome e cognome normalizzato
   (minuscolo, spazi collassati) + store. Vale il **primo timestamp di lock**,
   non di inizio partita. Chi rigioca in privato non è un problema: conta solo
   la prima consegna.

## Struttura per iPhone

Baseline **390 × 844 pt, solo portrait**, orientamento bloccato. Layout a tre
fasce sempre uguale: scena 55% · dialogo 25% · azioni 20% (zona pollice).

- Battuta max ~140 caratteri. Hotspot minimo 44×44 pt con alone pulsante.
- Massimo 4 opzioni per scelta, impilate verticalmente.
- Lobby: swipe orizzontale tra le 4 zone + dot indicator, frecce sempre visibili.
- Camerino: ritratti fissi in alto, 4 stili in carosello, CONFERMA sticky.
- Palco: griglia coi 3 macroargomenti, poi domande in sequenza a tutta larghezza.
- Recap: lista scrollabile, header sticky per categoria, bottone rosso fisso.
- PWA con "Aggiungi a Home". Sessione target: **4 minuti** (solo core) —
  **8 minuti** (con approfondimenti).

## UI senza asset grafici (solo codice/CSS)

Box dialogo (variante colore per la regia) · bottone scelta · navigazione lobby
(frecce+dot) · hotspot pulsante · carosello scelta stile · card domanda ·
schermata recap · modale conferma · timer domanda · badge moltiplicatore quiz ·
banner notifica fantasma · countdown finale · card "bentornato".

---

# APPENDICE — DECISIONI SOSPESE

1. **WATCH.C2** è troppo scontata (difficoltà 1). Proposta alternativa: "Quanti
   modelli di Apple Watch vengono presentati?" — due (consenso) / tre o uno solo
   (entrambe controcorrente). Non ancora deciso se sostituire.
2. **Prezzi di riferimento** (iPhone 17 Pro 1.239€, Pro Max 1.489€, Watch
   Series 11 ~459€) da riverificare su apple.com/it prima della pubblicazione:
   sono la base di calcolo di `IPHONE.C1`, `IPHONE.C6`, `WATCH.C3`.
3. **Valori consenso/plausibile/controcorrente** da ricontrollare nei giorni
   prima del lock: se un rumor diventa certezza dopo l'invito ufficiale Apple, la
   sua opzione va riclassificata a "consenso" (+0) prima che i giocatori
   blocchino le schedine.
4. **Domande del quiz da riconfermare** — dati storici non verificati da fonte
   diretta: `L3` (sorpasso su Microsoft), `L5` (anno del logo arcobaleno), `L2b`
   (prezzo Apple I), `L7b` (primo Apple Store italiano), `L10b` (nome dello spot
   "1984"). Elencate anche in fondo a `docs/indice-domande.md`.
5. **Numerazione dei campi del terminale** in `[S0]`: la v4.0 li etichettava
   "x/7" ma ne elenca sei. Chiarire se ne manca uno.
6. **Genere a 2 o 3 opzioni:** `[S0.03]` prescrive due bottoni
   (Maschile/Femminile); il gioco implementato ne ha tre (con Neutro) e il motore
   supporta `{g:m|f|x}`. Togliere l'opzione neutra è una decisione di prodotto,
   non applicata in attesa di conferma.
