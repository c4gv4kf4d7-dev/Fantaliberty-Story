# Effetti sonori

Suoni corti attaccati ai momenti che contano: una scelta, una risposta del
quiz, le previsioni spedite, un pannello che si apre. **Non** c'e' un suono sul
tocco che manda avanti il dialogo, ed e' una scelta: un clic ogni due secondi
per un'ora di gioco e' rumore.

Le chiavi (`scelta`, `quiz_giusta`, `applausi`...) stanno in
`story.audio.effetti`: il motore chiama la chiave, non il nome del file, quindi
un suono si sostituisce senza toccare il codice. Una chiave puo' portare un
elenco di file — gli applausi — e allora se ne pesca uno a caso.

I file qui dentro sono gia' passati da `tools/prepara_audio.py`: MP3 mono a
96 kbps, volume pareggiato a -16 LUFS, silenzio iniziale tagliato (un decimo di
secondo di vuoto e' un decimo di secondo di ritardo fra il tocco e il suono).
