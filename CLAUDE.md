# FantaLiberty — istruzioni per le sessioni Claude

Gioco a previsioni sui keynote Apple, sito statico su GitHub Pages
([fantaliberty.com](https://fantaliberty.com)). Due fondatori: **Lorenzo Bandini** e
**Michael Lanfranchi** (Mike). Nessun ruolo fisso, lavorano entrambi sul codice.

## Dove sta la verità

Leggi questi prima di agire — sono aggiornati, questa pagina no:

| Fonte | Cosa contiene |
|---|---|
| [`README.md`](README.md) | struttura del repo, regole multi-edizione |
| [`_template/README.md`](_template/README.md) | come si crea una nuova edizione, passo per passo |
| Notion — *FantaLiberty, Base di lavoro & Playbook* | regole del gioco, badge, credenziali, archivio |
| Notion — *Roadmap Edizione Settembre 2026* | lavoro in corso, rischi, raccolta rumor |

Le **credenziali stanno solo su Notion**, mai nel repo.

## Stato

- **WWDC 26** — conclusa. 59 giocatori, 19/40 azzeccate. Archiviata in `wwdc26/`.
- **Settembre 2026** — in preparazione. Nome in codice interno **🌰 Melograno**,
  cartella pubblica `settembre26/`. Evento atteso ~8 settembre, data non confermata.
- **PR #4** aperta in draft: ristrutturazione multi-edizione, invio riparato,
  supporto Supabase. **Va rivista e mergiata** — finché resta draft il sito non cambia.

## Trappole (verificate sul campo)

**L'invio non usa Google Form né `entry.ID`.** Vecchi commit e vecchie note lo dicono,
ed è falso: il gioco fa un POST a un **Apps Script**, in alternativa o in parallelo a
**Supabase**. Non riproporre la rimappatura degli entry ID.

**Il badge esiste già.** `computeBadge()` lo deriva dal mix di previsioni scelte e
viene inviato come `profilo`. Non è dichiarato dal giocatore. Non ricostruirlo.

**L'invio è stato riparato: non tornare indietro.** Usava `mode:'no-cors'`, quindi il
browser non poteva leggere la risposta e il gioco diceva "inviato" anche quando il
salvataggio falliva. Ora attende l'esito davvero. Se tocchi quella parte, esegui
`node _template/test/test-invio.mjs` (8 scenari di guasto).

**Le edizioni non si spostano.** Ogni stagione è una cartella nuova, la root è solo un
hub. Alla root ci sono dei redirect per i vecchi indirizzi che **preservano la query
string**: `carta.html?name=…&rank=…` è stato spedito per email a 59 persone e deve
continuare a funzionare. Non rimuoverli.

**`#legal` è linkato dalle mail.** Apre le note legali (privacy). Deve restare
funzionante sull'hub.

## Limiti dell'ambiente

- La politica di rete **blocca `api.supabase.com` e `api.cloudflare.com`** (403 sul
  CONNECT). Non è possibile creare progetti o fare deploy da qui: si può solo
  preparare codice e istruzioni. Verifica con
  `curl -sS "$HTTPS_PROXY/__agentproxy/status"`.
- L'accesso GitHub **può decadere a metà sessione**. Se `git push` dà 403, non è un
  problema di branch: va riautorizzata la GitHub App. Verifica sempre che il push sia
  andato davvero (`git ls-remote origin | grep $(git rev-parse HEAD)`) — un push
  fallito è facile da scambiare per riuscito.
- C'è **PostgreSQL 16 in locale**: utile per validare `_template/supabase-setup.sql`
  per davvero invece che a occhio (crea i ruoli `anon` e `authenticated` a mano).

## Come si taratura un'edizione

`punti = 10 − costo_Newton`. Le regole complete e i moltiplicatori stanno su Notion.

Cose imparate da WWDC 26, da tenere presenti scrivendo le previsioni:

- La sezione Watch/iPad/Home ha fatto **0 su 54**. Attenzione a costruire intere
  sezioni su prodotti che Apple può semplicemente non nominare.
- La previsione più scelta (28 persone, 47%) era **sbagliata**. Le previsioni
  consensuali sono trappole, ed è ciò che il moltiplicatore rarità deve premiare.
- Un evento **hardware** di settembre è diverso da WWDC: keynote più corto, rumor più
  allineati, quindi meno dispersione naturale. La proposta in roadmap è scendere a
  **~30 previsioni / 30 Newton** e aggiungere previsioni "a incastro" (prezzo o nome
  esatto) che generano dispersione da sole.

## Modo di lavorare

- Si parla **italiano**.
- **Verifica invece di dichiarare.** In questo repo si è rivelato utile: servire il
  sito in locale per controllare i link, eseguire lo SQL su Postgres vero, lanciare i
  test di invio. Più volte ha smentito assunzioni che sembravano solide.
- **Leggi il codice prima di costruire.** Due funzionalità della wishlist (badge nel
  form, card collezionabile) erano già implementate e segnate come da fare.
- Lavora sul branch indicato dalla sessione, commit descrittivi, PR in draft.
