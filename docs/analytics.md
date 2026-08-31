# Google Analytics 4

Measurement ID:

```
G-SYX1RZLNNE
```

Il tag e' installato con il Google tag ufficiale (`gtag.js`), non con Google
Tag Manager. Parte in testa a `index.html`, prima di tutto il resto: raccoglie
da solo le visite (incluso, per default di GA4, i parametri UTM del QR code —
niente codice nostro per quello) e non richiede nessun consenso via banner
perche' non e' mai stato chiesto: se un domani serve un banner di consenso, e'
un pezzo a parte, non di questa implementazione.

E' invisibile al giocatore: nessun popup, nessun banner, nessuna scritta a
schermo. Se la rete non lo fa arrivare (adblock, offline, sviluppo locale) il
gioco continua identico — nessun evento parte, e nessuna eccezione arriva a
`engine.js`.

## File coinvolti

- **`index.html`** — installa `gtag.js` e lo configura con il Measurement ID,
  poi carica `game/analytics.js` prima di `game/engine.js` (l'ordine conta:
  engine.js si appoggia a `window.FLAnalytics` fin dal primo evento).
- **`game/analytics.js`** — utility centralizzata. Due funzioni sole:
  `FLAnalytics.track(nome, parametri)` chiama `gtag('event', ...)` se
  `window.gtag` esiste, altrimenti non fa niente; `FLAnalytics.trackOnce(...)`
  e' una comodita' per chi vuole una deduplica locale al file (non la usa
  engine.js, che ha la sua — vedi sotto).
- **`game/engine.js`** — unico punto che chiama `FLAnalytics.track()` (tramite
  due funzioni interne, `ga()` e `gaOnce()`, dichiarate vicino alla cima del
  file). Nessuna chiamata a `gtag()` e' sparsa altrove nel motore.

## Come funziona la deduplica

Gli eventi "una volta per partita" (`game_start`, `quiz_started`, ecc.) si
segnano in `VN.state._ga`, un piccolo registro `{ chiave: true }` dentro allo
stato di gioco. Non e' un meccanismo a parte: `VN.state` e' gia' quello che
`VN.saveNow()` scrive in `localStorage` a ogni checkpoint, quindi il registro
sopravvive a un refresh e alle riaperture nei giorni fra la registrazione e il
keynote — esattamente la persistenza gia' presente nel progetto, come chiede
la specifica. Una partita nuova riparte pulita perche' `azzeraVars()`
rimpiazza `VN.state` per intero a ogni `VN.boot()`.

Per gli eventi "una volta per valore" (`location_opened`, `category_selected`)
la chiave nel registro include il valore (`loc:hall_of_fame`,
`category_selected:iphone`), cosi' ogni location o categoria si conta a parte.

## Eventi implementati

| Evento | Trigger | Parametri |
|---|---|---|
| `game_start` | Prima volta che il giocatore raggiunge la lobby (S1) — la registrazione, il badge, l'aggancio sono onboarding, non ancora il gioco in mano. Una volta per partita. | `entry_point: "lobby"` |
| `location_opened` | Prima volta che il giocatore raggiunge una delle location tracciate. Una volta per valore. | `location_name`: `lobby`, `hall_of_fame`, `camerino`, `palco` (S5, l'apertura del keynote), `platea` (S5, i macroargomenti dei pronostici), `teleprompter` (S6), `quiz_area` (S8) |
| `hall_of_fame_opened` | Prima volta che il giocatore entra nella zona Hall of Fame dell'hub. Una volta per partita. | — |
| `hall_of_fame_edition_opened` | Ogni volta che si apre uno dei tre quadri (si puo' riaprire piu' volte: non e' nell'elenco "una tantum"). | `edition`: `2024`, `2025`, `2026` |
| `predictions_started` | Prima volta che si apre la griglia dei tre macroargomenti (S5). Una volta per partita. | — |
| `category_selected` | Prima scelta di un macroargomento. Una volta per categoria. | `category`: `iphone`, `watch`, `altro` |
| `prediction_completed` | Un macroargomento ha tutte le sue domande core risposte. Una volta per categoria. | `category` |
| `predictions_complete` | Tutti e tre i macroargomenti sono completi e la griglia cede il turno. Una volta per partita. | `completed_categories` (sempre 3 con lo script attuale) |
| `teleprompter_started` | Si entra nella scena del teleprompter (S6, il recap). Una volta per partita. | — |
| `teleprompter_complete` | Le previsioni vengono bloccate (bottone "CONFERMA LE PREVISIONI" + conferma nella modale). Una volta per partita — il blocco stesso e' irreversibile. | — |
| `quiz_started` | Si entra nella scena del quiz di Peter (S8). Una volta per partita. | — |
| `quiz_level_started` | Si entra in un livello del quiz. Puo' arrivare piu' volte nel senso della specifica (una per livello). | `quiz_level`: `base`, `avanzato`, `leggenda` |
| `quiz_level_complete` | Finite le domande di un tentativo, passato o no (ogni tentativo, non solo il primo). | `quiz_level`, `result`: `passed` / `failed` |
| `quiz_complete` | Non resta piu' nessun livello giocabile (passati, bruciati o fuori portata: la griglia di Peter e' tutta spenta). Una volta per partita. | `highest_level_completed`: `base` / `avanzato` / `leggenda` (assente se nessun livello e' stato superato) |
| `email_submitted` | L'email facoltativa viene inviata con un indirizzo valido (mai al salto, mai al campo vuoto). Una volta per partita. | `method: "optional_results_email"` — **mai l'indirizzo** |
| `game_complete` | Si raggiunge il countdown (S7 finale): l'ultimo posto in cui il gioco lascia il giocatore dopo la parte narrativa. Una volta per partita — non a previsioni completate, non al ritorno in lobby, non a fine quiz da soli. | `predictions_completed` (`VN.state.locked`), `quiz_completed` (se `quiz_complete` e' gia' partito) — **mai punteggio, nome o email** |

Non implementato: la specifica chiedeva anche `game_abandoned` come evento *da
non fare* — l'abbandono si legge dal funnel qui sotto, non da un evento
inventato con un timer.

## Funnel

```
Visit
↓
Game Start
↓
Predictions Started
↓
Predictions Complete
↓
Teleprompter Started
↓
Teleprompter Complete
↓
Quiz Started
↓
Quiz Complete
↓
Game Complete
```

In GA4: Esplora → Esplorazione a imbuto, con gli eventi sopra nell'ordine
scritto. Dove il funnel si assottiglia piu' del previsto e' li' che i
giocatori abbandonano.

## QR tracking

URL del QR principale:

```
https://fantaliberty.com/?utm_source=qr_code&utm_medium=offline&utm_campaign=fantaliberty_story&utm_content=main
```

GA4 raccoglie da solo i parametri UTM di ogni richiesta: non serve nessun
codice per leggerli o per contare le scansioni. Per un QR diverso — un
poster, l'insegna, la presentazione — basta cambiare `utm_content`:

- `main` — il QR principale
- `poster`
- `banner`
- `screen`
- `presentation`

`utm_source`, `utm_medium` e `utm_campaign` restano gli stessi; solo
`utm_content` cambia per distinguere da dove e' arrivata la scansione.

## Privacy

Verso Analytics non viaggiano mai: nome, email, genere, risposte alle domande
(pronostici o quiz), punteggi, o qualunque altro dato che nei log di Supabase
identifica il giocatore. Il tracking e' aggregato e comportamentale — cosa fa
il giocatore, mai chi e' o cosa ha risposto.

## Verifica in GA4

**Realtime** (Report → In tempo reale): apri il sito, gioca qualche minuto.
Compaiono i "conteggi utenti nell'ultimi 30 minuti" e, sotto "Eventi negli
ultimi 30 minuti", i nomi degli eventi via via che partono — `page_view`
subito, poi `game_start` entrando in lobby, e cosi' via seguendo il funnel.

**DebugView** (Amministrazione → DebugView, o Configura → DebugView a seconda
della versione dell'interfaccia): mostra il flusso evento per evento con i
parametri di ognuno, utile per controllare che (ad esempio) `category_selected`
porti davvero `category` e non altro. Per vederci gli eventi di una sessione di
sviluppo, installare l'estensione "Google Analytics Debugger" per Chrome (o
aggiungere `?utm_source=...` e aprire la console con `window.gtag('set',
'debug_mode', true)` prima che l'evento parta) — altrimenti gli eventi restano
comunque visibili in Realtime, solo non nel dettaglio di DebugView.

Per riconoscere una visita dal QR: Report → Acquisizione → Traffico di
acquisizione, e filtrare per `Sessione origine/mezzo` = `qr_code / offline`,
oppure per `Sessione contenuto della campagna` = `main` (o il valore usato).
