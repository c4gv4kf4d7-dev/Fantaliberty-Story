# Creare una nuova edizione

`game.html` è il gioco completo e funzionante di WWDC 26, conservato come base di partenza.
Non modificarlo: copialo.

---

## 1. Crea la cartella

```bash
cp _template/game.html settembre26/index.html
```

Nome cartella: **per data, non per prodotto** (`settembre26/`, `wwdc27/`). Il nome del
prodotto Apple spesso non si conosce finché non viene annunciato, e la cartella non si
può più rinominare una volta che i link sono in giro.

I path degli asset condivisi (`../assets/…`) funzionano già, purché la cartella stia a un
livello dalla root.

## 2. Aggiorna il contenuto del gioco

Dentro `index.html`:

- **Le previsioni** e i relativi **costi in Newton** (array delle sezioni)
- **Budget totale** di Newton
- Date, anno, titoli, testi del keynote
- Countdown: data e ora dell'evento

> ⚠️ La taratura dei costi Newton è la parte più delicata: `punti = 10 − costo`.
> Sbagliarla rovina la classifica finale.

## 3. Raccolta risposte

> ℹ️ **Non si usa più un Google Form con gli `entry.ID`.** Quella era la vecchia
> meccanica. Oggi il gioco parla direttamente con uno o due archivi.

Sono supportati **due archivi, attivabili insieme**. In cima al `<script>` del gioco:

```js
const EDIZIONE = 'settembre26';   // cambia a ogni edizione

const APPS_SCRIPT_URL   = 'https://script.google.com/macros/s/…/exec';

const SUPABASE_URL      = '';     // vuoto = disattivato
const SUPABASE_ANON_KEY = '';
```

Un archivio con URL vuota è spento. Con entrambi accesi la schedina viene scritta su
tutti e due e **l'invio riesce se almeno uno risponde ok**: è quel che permette di
migrare senza rischio, tenendoli accesi insieme finché non ti fidi del nuovo.

> ⚠️ Con entrambi attivi le risposte esistono **in due copie**. Allo spoglio scegli
> UNA fonte come autorevole; l'altra è solo rete di sicurezza. Se unisci i due
> elenchi ti ritrovi ogni giocatore due volte.

### Opzione A — Apps Script + Foglio Google

1. Crea un nuovo Foglio Google per l'edizione
2. Incolla [`apps-script.gs`](apps-script.gs) in Estensioni → Apps Script e segui il
   setup descritto in cima al file
3. Copia l'URL `/exec` della Web App in **`APPS_SCRIPT_URL`**

### Opzione B — Supabase

1. Crea il progetto su Supabase
2. SQL Editor → incolla [`supabase-setup.sql`](supabase-setup.sql) → Run
3. Copia URL del progetto e chiave `anon` in **`SUPABASE_URL`** / **`SUPABASE_ANON_KEY`**

La chiave `anon` è pubblica e finisce nel sito: lo SQL imposta le protezioni perché
con quella si possa **solo inserire, mai leggere**. Per lo spoglio usa la dashboard,
dove trovi anche le viste già pronte (`v_partecipanti`, `v_conteggio_previsioni`,
`v_profili`, `v_partecipazione`).

### 4. Testa prima del lancio

```bash
node _template/test/test-invio.mjs
```

Prova la logica di invio contro un server finto: archivi singoli, entrambi attivi,
guasti parziali, guasto totale, timeout. Non sostituisce **un invio vero** contro
l'endpoint reale, che va fatto comunque e non il giorno stesso.

### Dati inviati a ogni invio

| Parametro | Contenuto |
|---|---|
| `nome`, `cognome` | identità |
| `reparto` | reparto Apple |
| `seniority` | da quanto è in Apple |
| `iphone` | modello posseduto (moltiplicatore underdog) |
| `store` | store di appartenenza |
| `email` | per l'invio dei risultati |
| `profilo` | **il badge**, calcolato da `computeBadge()` sul pattern di scelte |
| `previsioni` | previsioni scelte, separate da ` \| ` |

Il badge **è già incluso** nell'invio: `computeBadge()` lo deriva dal mix di previsioni
ad alta/media/bassa probabilità e `submitSilent()` lo manda come `profilo`. Se aggiungi
parametri nuovi, ricordati di aggiungerli anche a `COLONNE` in `apps-script.gs`,
altrimenti finiscono solo nei log.

## 4. Aggiorna la root

In `/index.html`:
- Sposta l'edizione appena conclusa nell'albo d'oro
- Punta il teaser / la CTA alla nuova edizione

E aggiorna la tabella edizioni nel `README.md` di root.

## 5. Dopo l'evento

Costruisci le pagine post-evento dentro la cartella dell'edizione, prendendo come
riferimento `wwdc26/`:

- `index.html` → landing post-evento (sostituisce il gioco)
- `leaderboard.html` → classifica, ricerca, schede personali, statistiche
- `previsioni.html` → tutte le previsioni con ✅/❌

Le strutture dati da popolare in `leaderboard.html`:

| Costante | Contenuto |
|---|---|
| `RESULTS` | nome previsione → `true`/`false` |
| `COSTS` | nome previsione → costo in Newton |
| `PLAYERS` | dati giocatori (rank, punteggio, picks, store, profilo…) |
| `REPARTI` | nome giocatore → reparto |
