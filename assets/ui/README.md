# assets/ui/ — grafica di sistema

Qui va la grafica che non appartiene a una scena ma all'interfaccia del gioco.

## logo_studio.png

L'insegna **8Bit Studios** che si accende all'avvio, prima della barra LOADING.

Carica il file qui dentro **con questo nome esatto**: `logo_studio.png`.
Appena c'e', il gioco lo usa da solo — non serve toccare il codice.
Finche' manca, l'insegna viene disegnata in CSS con lo stesso aspetto.

Come dev'essere il file:

* **PNG con sfondo trasparente**, largo 800–1200 px
* l'insegna **spenta / neutra**: niente bagliore verde gia' disegnato attorno,
  niente scanline. Il glow, il lampeggio e la pulsazione li aggiunge il motore
  in tempo reale — se sono gia' cotti nell'immagine si sommano e diventa una
  macchia
* palo e base inclusi nell'immagine, se li vuoi come nel bozzetto

Durate dell'animazione (in `game/story.json`, step `logo`): `accensione` 1000 ms,
`fisso` 2000 ms, `uscita` 900 ms.
