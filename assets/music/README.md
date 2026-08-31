# Musica

Un brano per momento del gioco, in loop sotto la scena. Quale suona dove sta in
`story.audio.musica` dentro `game/story.json`: la chiave e' l'id della scena.

I file qui dentro sono gia' passati da `tools/prepara_audio.py`: MP3 mono a
80 kbps, volume pareggiato a -20 LUFS, niente copertina. Gli originali (WAV e
MP3 da 42 MB in tutto) sono nella storia di Git, non nel repo di oggi.

Per aggiungerne uno: mettilo qui col suo nome, aggiungilo alla mappa in
`tools/prepara_audio.py`, lancia `python3 tools/prepara_audio.py` e collegalo
alla scena in `story.json`. `npm test` controlla che il file dichiarato esista
davvero e che non sia troppo pesante.
