# FantaLiberty · invio dei risultati con Supabase

Il gioco (`template-wwdc26.html`) manda le previsioni compilate dal giocatore a
un database Supabase. Questa guida serve a metterlo in piedi da zero.

Prima si usava un Google Apps Script chiamato con `mode:'no-cors'`: funzionava,
ma il browser non poteva leggere la risposta, quindi il sito non sapeva mai se
l'invio fosse andato a buon fine. Supabase risponde con CORS corretto, quindi
ora abbiamo conferma reale, ritenta da solo e mostra un errore se qualcosa non va.

---

## 1. Crea il progetto Supabase

1. Vai su [supabase.com](https://supabase.com) → **New project**
   (piano free: più che sufficiente per questo gioco).
2. Scegli la region **EU (Frankfurt)** o **EU (Ireland)** — i dati restano in UE,
   coerente con le note legali del gioco.
3. Segna la password del database, poi aspetta ~2 minuti che il progetto sia pronto.

## 2. Crea la tabella

Apri **SQL Editor** → **New query**, incolla tutto il contenuto di
[`supabase/schema.sql`](supabase/schema.sql) e premi **Run**.

Lo script crea la tabella `public.previsioni`, attiva la Row Level Security e
concede **solo l'INSERT** al pubblico. È idempotente: puoi rilanciarlo.

## 3. Prendi le due chiavi

**Project Settings → API** (oppure **API Keys**):

| Valore | Dove si trova | Va nell'HTML? |
|---|---|---|
| **Project URL** (`https://xxxx.supabase.co`) | Settings → API | ✅ sì |
| **anon / publishable key** | Settings → API Keys | ✅ sì |
| **service_role / secret key** | Settings → API Keys | ❌ **MAI** |

> La `anon key` è pubblica per design: è un token che dice solo "sono un
> visitatore anonimo". Da sola non dà accesso a niente — è la RLS del punto 2 a
> decidere cosa può fare (qui: solo inserire). La `service_role` key invece
> scavalca la RLS: se finisse nell'HTML, chiunque potrebbe leggere e cancellare
> tutti gli invii.

## 4. Configura il gioco

In `template-wwdc26.html`, subito sotto il blocco `/* ═══ SUPABASE ═══ */`
(~riga 842), sostituisci i due segnaposto:

```js
const SUPABASE_URL      = 'https://xxxxxxxxxxxx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOi...';   // anon key, non service_role
```

Il sito è statico su GitHub Pages: non c'è build né variabili d'ambiente, quindi
i valori stanno in chiaro nel file. È il modo previsto da Supabase per questo
scenario, purché la RLS sia configurata come al punto 2.

## 5. Prova

1. Apri `template-wwdc26.html` (anche in locale), gioca e invia.
2. Supabase → **Table Editor** → `previsioni`: deve comparire la riga.
3. Se non compare, apri la console del browser: l'errore è loggato come
   `[FantaLiberty] invio Supabase fallito: ...` (vedi *Problemi frequenti*).

## 6. Spegni il vecchio canale

Quando gli invii su Supabase arrivano regolarmente, in `template-wwdc26.html`:

```js
const APPS_SCRIPT_FALLBACK = false;
```

Finché resta `true`, se Supabase fallisce l'invio ripiega sul Google Apps Script
esistente, così durante la transizione non si perde nessuna giocata.

---

## Come funziona l'invio

Alla conferma nel modal, il pulsante si blocca su *"Invio in corso…"* e:

1. **Supabase** — `POST /rest/v1/previsioni` con la anon key, timeout 12 s,
   fino a 3 tentativi con backoff (solo su errori di rete o 5xx: un 4xx è un
   problema di dati o di policy, riprovare non servirebbe).
2. **Fallback Apps Script** — solo se Supabase fallisce e `APPS_SCRIPT_FALLBACK`
   è `true`.
3. **Coda locale** — se non riesce nemmeno quello, il payload resta in
   `localStorage` (`FANTALIBERTY_WWDC26_PENDING`, ultimi 5) e viene ritentato al
   caricamento successivo della pagina.
4. **Errore visibile** — se tutto fallisce compare il messaggio nel modal e un
   link *"Invia via email 📧"* come ultima spiaggia (il `mailto` che era già nel
   codice ma non veniva mai usato).

La schermata di successo appare solo se l'invio è effettivamente riuscito.

### Cosa viene salvato

Una riga per invio, con: `nome`, `cognome`, `reparto`, `seniority`, `iphone`,
`store`, `email`, `profilo` (il badge), `newton_spesi`, `budget`,
`previsioni` (JSONB: `[{id, nome, costo, prob}]`), `previsioni_testo` (stessa
lista leggibile, comoda per l'export CSV), `inviato_il`, `user_agent`, `creato_il`.

Chi rigioca crea una riga nuova: la vista `previsioni_ultime` tiene solo l'ultimo
invio per email.

### Leggere i risultati

Dalla dashboard Supabase (**Table Editor** o **SQL Editor**), che usa la
service_role e quindi scavalca la RLS:

```sql
select nome, cognome, reparto, store, profilo, newton_spesi, previsioni_testo, creato_il
from public.previsioni_ultime
order by creato_il desc;
```

Il pulsante **Download CSV** del Table Editor esporta tutto per la classifica.

### Cancellazione dati (note legali)

Le note legali promettono la cancellazione dei dati identificativi entro 72 ore
dal Keynote. In fondo a `schema.sql` c'è la `UPDATE` pronta che azzera nome,
cognome, email e user_agent lasciando intatte le statistiche aggregate.

---

## Problemi frequenti

| Sintomo in console | Causa | Soluzione |
|---|---|---|
| `Supabase 401: Invalid API key` | anon key sbagliata o troncata | ricopia la chiave intera da Settings → API Keys |
| `Supabase 404` | nome tabella o Project URL errati | controlla `SUPABASE_URL` e che `previsioni` esista |
| `Supabase 403: new row violates row-level security policy` | lo `schema.sql` non è stato eseguito, o il payload non passa il `with check` (serve nome, cognome e almeno 1 previsione) | rilancia `schema.sql` |
| `Supabase 400: ... column "xxx" does not exist` | tabella creata a mano invece che con lo schema | rilancia `schema.sql` |
| Nessun errore ma nessuna riga | Supabase non configurato → è partito il fallback | cerca `[FantaLiberty] Supabase non configurato` in console |
| `AbortError` / `Failed to fetch` | rete o progetto Supabase in pausa | i progetti free vanno in pausa dopo 7 giorni di inattività: riattivalo dalla dashboard |

---

## Nota sui limiti

L'invio è pubblico e non autenticato: chiunque conosca l'URL può inserire righe.
Per un gioco interno va bene, e la RLS impedisce comunque di **leggere**,
modificare o cancellare gli invii altrui. Se in futuro servisse più controllo, le
strade sono: Supabase Auth con magic link via email, oppure una Edge Function con
rate limiting davanti all'INSERT.
