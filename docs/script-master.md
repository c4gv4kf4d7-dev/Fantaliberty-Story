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
  Label: "Nome e cognome"   Tipo: testo libero, minimo 2 parole
  Salva in: run.fullname   Deriva: run.nickname = prima parola

[S0.03] TERMINALE — campo 2
  Label: "Genere" (per come il gioco si rivolge a te — non legato allo stile)
  Tipo: 2 bottoni — Maschile | Femminile
  Salva in: run.gender

[S0.04] TERMINALE — campo 3
  Label: "Store"   Tipo: lista — Piazza Liberty | Carosello | Fiordaliso
  Salva in: run.store

[S0.05] TERMINALE — campo 4
  Label: "Dipartimento"
  Tipo: lista — Operation | Support | Shopping | Leadership | People
  Salva in: run.department

[S0.06] TERMINALE — campo 5
  Label: "Da quanto sei in Apple"   Tipo: 4 bottoni — 0-1 | 2-3 | 4-7 | 8+
  Salva in: run.tenure

[S0.07] TERMINALE — campo 6
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

> ⚠️ **Aperto:** la v4.0 numerava questi campi "1/7"…"6/7" ma ne elenca sei.
> Qui sono rinumerati 1-6. Se ne manca davvero uno, va aggiunto.

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
  "Quando sei pronto vai pure verso la tenda ed entra. Da quel momento...
   sei a teatro."
  → [S1.HUB]

[S1.HUB] HUB LOBBY — 4 zone, swipe orizzontale libero, nessun ordine forzato
  ZONA1 → bg_lobby_z1_tenda (nessun oggetto separato per la tenda)
  ZONA2 → bg_lobby_z2_hall_of_fame + obj_targa_hall_of_fame + chr_francesca_idle
  ZONA3 → bg_lobby_z3_premi + obj_teca_premi + chr_francesca_orgogliosa
  ZONA4 bloccata   → bg_lobby_z4_quiz_bloccata + obj_tavolino_buzzer_peter
                     (frame non premuto) + chr_peter_occhi_bassi (addormentato)
                     → chr_peter_alza_occhi al tocco
  ZONA4 sbloccata  → bg_lobby_z4_quiz_aperta + obj_lucchetto_zona4 (frame
                     "aperto", animazione una tantum al primo sblocco)
  Tutorial swipe   → chr_francesca_gesto_swipe (deve coincidere col gesto reale
                     implementato: verificare prima di finalizzare l'asset)

  Vincolo tutorial: ENTRA in [S1.ZONA1] disabilitato finché il giocatore non ha
  fatto almeno 1 swipe.

  [S1.ZONA1] Tenda d'ingresso
    Hotspot ENTRA (attivo solo dopo il tutorial)
      → MODALE "Entrare in sala? Sì / Non ancora"
      → Sì: effetto in codice (fade o split-scroll di bg_lobby_z1_tenda) → [S2.01]
      → Non ancora: resta in [S1.HUB]

  [S1.ZONA2] Hall of Fame
    Targhe cliccabili (albo d'oro edizioni precedenti, dato esterno non hardcoded)
    FRANCESCA: "Ogni anno qualcuno giura di aver 'solo tirato a indovinare'."

  [S1.ZONA3] Sezione premi
    FRANCESCA: "Qui troverai i premi: il nuovo iPhone? Una macchina nuova?
      Un viaggio? Naa, non credo, siamo in spending review."

  [S1.ZONA4] Quiz — Peter
    SE run.locked === false:
      lucchetto chiuso, Peter addormentato
      PETER (al tocco, si sveglia di scatto):
        "Prima segui il keynote. Poi le domande difficili."
    SE run.locked === true:
      lucchetto aperto (animazione una tantum) → [S8.01]
```

---

# [S2] L'AGGANCIO

```
[S2.01] Ingresso in sala (post-transizione tenda)
  Asset: bg_sala_ingresso_superiore + chr_susan_panico_telefoni (piccola, in fondo)
  SUSAN (urlando): "Ehi TU! Sì, tu! Scendi!"
  → transizione verso il palco (fade o parallax opzionale) → [S2.02]

[S2.02] SUSAN — dialogo (forma neutra, nessun indirizzo di genere)
  Asset: bg_sala_ingresso_superiore (ravvicinata) + chr_susan_mani_capelli
  "Ascolta. Il CEO è bloccato in tangenziale, no in autostrada... insomma
   è fermo. Tra quaranta minuti c'è la prova generale, con la regia, le
   luci, i grafici, tutto. Se non la facciamo, stasera non si va in onda.
   Tu sei l'unico essere umano in questa sala. Congratulazioni: fai
   l'host tu."
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
  Tap 2: "Camerino, ultima porta a destra. Hai quattro minuti e ne hai
          già persi due."
  → [S3.01]
```

**Nota:** l'opzione B ("sfacciata") abilita l'evento comico `chr_susan_carponi`
più avanti in `[S5]`. Salvare in `run.flags.sfacciato_s2 = true/false`.

---

# [S3] CAMERINO — SCELTA STILE

```
[S3.01] SUSAN — dialogo
  Asset: bg_camerino + chr_susan_guarda_orologio
  "Scegli il tuo stile e cambiati. Veloce, la platea perdona tutto tranne
   l'esitazione."
  → [S3.02]

[S3.02] SCHERMATA STILE — carosello, 4 opzioni
  Asset: bg_camerino + stile_{hawaiano|showman|drip|ingegnere}_idle_camerino
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
  hawaiano  → "...coraggioso/a. Speriamo tu sia sveglio/a quanto sei rilassato/a."
  showman   → "Wow... sembri essere nato/a per questo..."
  drip      → "Capisco la metà di quello che dici, ma sono certa che andrà bene."
  ingegnere → "Uno/a che sembra sapere quello che dice. Basta e avanza."
  → [S4.01]
```

---

# [S4] DIETRO LE QUINTE

```
[S4.01] SUSAN infila l'auricolare
  Asset: bg_dietro_le_quinte + stile_X_idle_camerino
  ⚠️ GAP: non esiste un asset "Susan infila l'auricolare" — usare
  chr_susan_indica_camerino come placeholder, o generare una posa dedicata.
  "Studiato, vero?"
  A: "Certo." → "Che bugiardo/a. Adoro, sei già nel personaggio."
  B: "No."    → "Onesto/a. Sarà un problema tuo, non mio. Vai."
  → [S4.02]

[S4.02] SUSAN spinge in scena
  Asset: bg_dietro_le_quinte + chr_susan_spinta_in_scena + stile_X_idle_palco
  "Le luci sono calde. Non guardare in alto. Vai."
  → effetto sipario (split animato di bg_palco_sipario_chiuso) → [S4.03]

[S4.03] MARTHA — prima battuta in cuffia
  Asset: bg_palco_sipario_chiuso → fx_apertura_sipario → bg_palco_platea_piena
         + chr_martha_indicatore_regia + stile_X_idle_palco
  "Ciao, sono Martha, regia. Ti sento bene, tu senti me. Non esistono
   risposte sbagliate, esistono solo risposte che qualcuno ha raccontato
   con poca sicurezza. Quando sei pronto/a tu."
  → [S5.INTERMEZZO.R1]
```

---

# [S5] IL KEYNOTE

## Struttura

```
[S5.INTERMEZZO.R1] → intermezzo di regia R1
[S5.INTERMEZZO.R2] → intermezzo di regia R2
  Asset: bg_palco_platea_piena + chr_martha_indicatore_regia + stile_X_idle_palco
  ↓
[S5.HUB] GRIGLIA 3 MACROARGOMENTI, ordine libero
  Asset: bg_palco_schermo_categorie + obj_icone_categorie (stato attiva/
         completata/disabilitata per ciascuna) + stile_X_idle_palco
  - iPhone   (6 core, pool 6 facoltative)
  - Watch    (3 core, pool 5 facoltative)
  - Altro    (3 core, pool 6 facoltative)

Entrando in un macroargomento: tutte le CORE in ordine fisso, sequenza
obbligata, nessuna scelta di rumor → [S5.BIVIO]

[S5.BIVIO] dopo l'ultima core
  MARTHA: "Siamo in tempo. Vuoi entrare nel dettaglio o passiamo al prossimo?"
  APPROFONDISCI → pesca 3 facoltative a caso dal pool della categoria
    (pescate ORA, non a inizio partita: chi rigioca in privato non può
    mapparle) → esegui le 3 → intermezzo → torna a [S5.HUB]
  PASSA AL PROSSIMO → intermezzo → torna a [S5.HUB]

Tutti e 3 i macroargomenti completati → [S6.01]
```

## Loop di una singola domanda

```
[S5.DOMANDA]
  Asset: bg_palco_platea_piena + obj_schermo_slide_categoria (variante della
  categoria attiva) + stile_X_annuncio / stile_X_indica_schermo (alternati a
  caso) + reazione platea (assegnata a caso, MAI legata alla risposta)

  1. MARTHA introduce la domanda (riga generica, es. "Tocca a te.")
  2. Card con le opzioni (2-4)
  3. Il giocatore sceglie → run.picks[categoria][core|extra][ID]
  4. Il personaggio annuncia alla platea con la battuta del suo stile
     (da game/domande.json, campo `battute[run.style]`)
  5. SE random() < probabilità: micro-evento generale, oppure l'evento
     personale dello stile se non ancora mostrato in questa run
  6. Il micro-evento, se estratto, presenta tre reazioni rapide: il valore
     interno è una permutazione runtime di +3 / 0 / -3 e non viene mai mostrato
     al giocatore
  7. Reazione platea A CASO — mai legata al contenuto della risposta
  8. → prossima domanda, o [S5.BIVIO] se era l'ultima core
```

> **Regola d'oro.** Durante il keynote la reazione della platea non deve MAI
> correlare col contenuto del pronostico scelto: assegnazione casuale. Altrimenti
> il gioco suggerisce le risposte e falsa i pronostici. Il quiz di Peter `[S8]` è
> l'eccezione dichiarata: lì il feedback giusto/sbagliato è corretto, perché le
> domande hanno risposte oggettive.

## Micro-eventi generali, eventi personali, intermezzi

Elenco e testi in `game/domande.json` (`micro_eventi`, `eventi_personali`,
`intermezzi`, `intermezzi_riserva`). Cinque micro-eventi generali, uno personale
per stile mostrato al massimo una volta a run, cinque intermezzi fissi (R1-R2
prima del primo macroargomento, R3-R5 dopo ciascuno dei tre completati, in ordine
di completamento) più quattro di riserva.

I micro-eventi non sono più passivi: ogni voce contiene tre `opzioni`. I valori
editoriali indicano il tono previsto della battuta, ma il motore mescola a ogni
attivazione i tre esiti numerici `+3`, `0`, `-3`. L'interfaccia non deve mostrare
mai numeri, badge, popup, "bonus" o "malus": l'esito deve restare leggibile solo
come conseguenza narrativa.

## Le domande

29 domande — 12 core + 17 facoltative — in `game/domande.json`.
Indice degli id in `docs/indice-domande.md`.

---

# [S6] TELEPROMPTER / RECAP

```
[S6.01] MARTHA
  Asset: bg_palco_luci_calate + chr_martha_indicatore_regia + stile_X_idle_palco
  "Ultimo giro. Da adesso non si torna indietro. Prenditi il tempo che vuoi.
   Nessuno ha fretta." (pausa) "Susan ha fretta. Ma nessun altro."
  → [S6.02]

[S6.02] SCHERMATA RECAP
  Asset: bg_palco_luci_calate + obj_gobbo_teleprompter (il testo è UI reale)
  Lista di tutte le scelte per macroargomento (core + extra), ogni riga
  modificabile (torna alla card originale).
  Facoltative NON completate: riga vuota, cliccabile per completarle ORA
  (il pescaggio a caso vale anche qui, se non già fatto).
  Bottone rosso fisso: BLOCCA LA SCALETTA → [S6.03]

[S6.03] MODALE CONFERMA LOCK
  "Sicuro? Dopo questo, la schedina è chiusa."
  Sì → run.locked = true, run.submitted_at = TIMESTAMP SERVER,
       POST della run al backend, sblocco [S1.ZONA4] → [S7.01]
  No → [S6.02]
```

---

# [S7] FINALE

```
[S7.01] SUSAN
  Asset: bg_palco_platea_piena + chr_susan_sollievo → chr_susan_sguardo_in_alto
  "Ha funzionato. Ha funzionato." (guarda in alto) "...eccolo, è arrivato."

[S7.02] Sagoma alla porta
  Asset: bg_finale_porta_illuminata + fx_fascio_luce_porta
         + chr_ceo_sagoma → (dopo 2s) chr_ceo_pollice_su

[S7.03] MARTHA — ultima battuta
  Asset: stessa inquadratura + chr_martha_indicatore_regia
  "Regia a host: bella prova. Ci vediamo tra poco per quella vera."

[S7.04] Nero

[S7.05] COUNTDOWN — schermata persistente, riaperta ogni giorno
  Asset: bg_countdown_nero
  "{nickname} — SCALETTA BLOCCATA
   Il keynote vero inizia tra [ 00:00:00 ]"
  A: TORNA IN LOBBY → [S1.HUB] (zona 4 ora sbloccata)
  B: LA TUA CARD → genera ed esporta obj_card_condivisibile client-side
     (1080x1920 / 1080x1350)
```

---

# [S8] QUIZ DI PETER

```
[S8.01] PETER — prima volta
  Asset: bg_lobby_z4_quiz_aperta + chr_peter_alza_occhi
  "Hai fatto un keynote intero, ma conosci quelli passati? Vediamo."

[S8.HUB] Selezione livello
  SE run.style == showman: tutti e 3 i livelli sbloccati, ordine libero
  ALTRIMENTI: Avanzato dopo aver passato Base, Leggenda dopo Avanzato

[S8.LOOP] per ogni livello
  Asset: bg_lobby_z4_quiz_aperta + chr_peter_guarda_orologio (timer sotto i 3s)
         → chr_peter_annuisce (giusta) / chr_peter_scuote_testa (sbagliata)

  1. Pesca N domande dal pool del livello (mai le stesse del tentativo
     precedente per lo stesso giocatore/livello — per questo i pool sono due)
  2. Per ogni domanda: timer parte al render, risposta o timeout
     drip     → 1x per livello il 50/50
     hawaiano → il primo fallimento per livello non consuma il tentativo
  3. Fine → punteggio
     SE punteggio >= soglia: passed = true, mult_bank += (1° tentativo ?
       valore pieno : metà)
     ALTRIMENTI: attempts += 1; sotto 2 si riprova con l'altro pool,
       da 2 in poi il livello è chiuso per questa run

[S8.FINALE] assegnazione moltiplicatori — apribile solo nelle 24h prima del keynote
  Asset: bg_lobby_z4_quiz_aperta + chr_peter_applauso_ironico (punteggio pieno)
  PETER: "Hai fatto punti per giorni e ora devi decidere dove metterli.
          Interessante: hai puntato tutto sulla categoria di cui eri meno sicuro."
  Distribuisci run.mult_bank su iphone/watch/altro. Nessun tetto per categoria
  oltre al totale accumulato. Conferma → run.multipliers, irreversibile.
```

Livelli, soglie, timer, perk e le 44 domande (due pool per livello) in
`game/quiz.json`.

---

# TABELLA VALORI E FORMULE

```
Punteggio domanda core = difficoltà (1-5) + bonus opzione
  consenso +0 · plausibile +1 · controcorrente +2

Punteggio facoltativa/intermezzo = valore secco dell'opzione (1, 2 o 3)

Punteggio micro-evento = permutazione runtime opaca di +3 / 0 / -3

Moltiplicatore pool = opzione scelta da <10% dei giocatori  ×1.5
                                        10-30%             ×1.25
                                        >30%               ×1

Punteggio finale per domanda =
  min(10, punteggio_base × pool × moltiplicatore_quiz)

Bonus completamento = +1 per ogni categoria con tutte e 3 le facoltative
  completate (max +3), +1 se tutti e 5 gli intermezzi completati.
  Massimo totale: +4
```

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

Box dialogo (variante colore per Martha) · bottone scelta · navigazione lobby
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
