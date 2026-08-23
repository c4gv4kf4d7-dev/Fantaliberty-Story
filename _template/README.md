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

> ℹ️ **Non si usa più un Google Form con gli `entry.ID`.** Il gioco fa un POST
> form-urlencoded a un **Apps Script** pubblicato come Web App, che scrive la riga
> sul Foglio. Niente ID da rimappare.

1. Crea un nuovo Foglio Google per l'edizione
2. Incolla [`apps-script.gs`](apps-script.gs) in Estensioni → Apps Script e segui il
   setup descritto in cima al file
3. Copia l'URL `/exec` della Web App in **`APPS_SCRIPT_URL`** dentro `index.html`
4. **Testa con 3-4 invii reali** prima del lancio, non il giorno stesso

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
