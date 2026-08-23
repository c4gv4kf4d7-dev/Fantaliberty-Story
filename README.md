# FantaLiberty

Il fantacalcio dei keynote Apple. Ogni edizione è un gioco a previsioni: budget di Newton da
spendere, punti quando le previsioni si avverano, moltiplicatori che premiano il rischio.

🔗 **[fantaliberty.com](https://fantaliberty.com)**

---

## Struttura del repo

```
/
├── index.html          Hub: teaser prossima edizione + albo d'oro
├── assets/             Asset condivisi fra tutte le edizioni
│   ├── bg.jpg          Sfondo Liquid Glass
│   ├── logo2.png       Logo principale
│   ├── logo.png        Logo alternativo
│   └── data.png        Grafica usata nel gioco
├── wwdc26/             📦 EDIZIONE ARCHIVIATA — giugno 2026
│   ├── index.html      Landing post-evento
│   ├── leaderboard.html
│   ├── previsioni.html
│   ├── carta.html      Card collezionabile
│   └── ...             Asset specifici dell'edizione
├── _template/          Base per creare una nuova edizione
│   ├── game.html
│   └── README.md       ← istruzioni passo-passo
└── _work/              Materiale sorgente, non pubblicato
    ├── carte/          Sorgenti e reference delle card
    ├── email_header.png
    └── fronte.png
```

### Regole

- **Le edizioni non si spostano mai.** Una volta pubblicata, `wwdc26/` resta lì per sempre:
  i link condivisi continuano a funzionare.
- **Ogni nuova edizione = una nuova cartella** (`settembre26/`, `wwdc27/`, …).
- **La root è solo un hub.** Cambia a ogni stagione per puntare all'edizione live e
  aggiungere quella appena conclusa all'albo d'oro.
- **Gli asset condivisi stanno in `assets/`** e si referenziano con `../assets/…` dalle
  cartelle edizione. Gli asset specifici di un'edizione stanno dentro la sua cartella.
- **`_work/` e `_template/` non sono destinati al pubblico** (nessun link li raggiunge).

---

## Creare una nuova edizione

Vedi **[`_template/README.md`](_template/README.md)**.

---

## Edizioni

| Edizione | Quando | Giocatori | Previsioni azzeccate | Vincitori |
|---|---|---|---|---|
| [WWDC 26](https://fantaliberty.com/wwdc26/) | Giugno 2026 | 59 | 19/40 | Nico Stolfi · Michael Lanfranchi (30,4) |
| Settembre 2026 | *in preparazione* | — | — | — |

---

## Deploy

GitHub Pages dal branch `main`. Il dominio è configurato via `CNAME`;
`.nojekyll` disabilita l'elaborazione Jekyll (necessario perché le cartelle
iniziano con `_`).
