# Archivio

Materiale dell'edizione **WWDC 26**, non piu' collegato al sito ma conservato
per riferimento (e perche' i link vecchi nelle mail continuino a funzionare).

- `wwdc26/manutenzione.html` — la pagina "sito in manutenzione" che stava su index.html
- `wwdc26/leaderboard.html`, `previsioni.html`, `landing_evento.html`, `carta.html`,
  `template-wwdc26.html`, `badges.js` — il gioco/classifica dell'edizione precedente
- `wwdc26/*.webp` — grafiche di quell'edizione, e `email_header.png`

Niente qui dentro viene caricato dal gioco nuovo: gli asset della visual novel
stanno in `assets/`.

## Due cose da sapere prima di toccare questa cartella

**`email_header.png` resta un PNG apposta.** E' l'immagine in testa alle mail
gia' spedite: quelle mail puntano a `fantaliberty.com/archivio/wwdc26/email_header.png`
e cambiarle l'estensione le lascerebbe con un buco al posto dell'intestazione.
Tutto il resto e' stato convertito in WebP (19 MB → 2 MB) proprio perche' non
e' linkato da fuori.

**`FL Cards/` era una copia di lavoro**, non una cartella a se': cinque dei
suoi file erano byte per byte identici a quelli in `wwdc26/`, e il suo
`carta.html` cercava immagini che li' dentro non c'erano mai state (funziona
solo la copia in `wwdc26/`). I duplicati sono stati tolti; restano `retro.webp`
e `reference/`, che sono varianti vere.
