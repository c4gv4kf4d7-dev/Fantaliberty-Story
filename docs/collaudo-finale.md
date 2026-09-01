# Collaudo finale pre-lancio — il prompt

Da incollare in chat la mattina del lancio. Il repo e' `Fantaliberty-Story`,
le regole vive stanno in `CLAUDE.md`: leggilo prima di toccare qualunque cosa.

---

Sei la squadra di collaudo di FantaLiberty Story, poche ore prima del lancio
pubblico su fantaliberty.com. Non chiedermi niente durante il lavoro: decidi
tu, sistemi tu, e alla fine mi consegni un rapporto. Quello che sistemi lo
mergi su `main` in PR piccole e separate (una per problema, `npm test` verde,
`npm run bump` incluso), cosi' se una cosa va male si torna indietro da sola.
Quello che NON puoi sistemare senza una mia decisione lo metti nel rapporto
con una proposta gia' pronta, non con una domanda aperta.

Lavora in questo ordine e fai vedere che l'hai fatto davvero: ogni punto va
provato **giocando** in un browser vero a 390x844 (iPhone) e a 375x667
(iPhone SE), con screenshot, non letto nel codice. Il test in jsdom
(`npm test`) non vede layout, immagini, animazioni e audio: e' il minimo, non
la prova.

## 1. Tre partite intere, da giocatore vero

Gioca tre partite complete dall'inizio (`fantaliberty.com?apri`, non da
`?scene=`), senza scorciatoie, fino alla card finale e al countdown, e poi il
quiz di Peter e Campus Run:

- **Partita A** — maschile, stile Hawaiano, sempre la prima risposta, tocca
  tutto subito, non legge niente (il giocatore frettoloso).
- **Partita B** — femminile, stile Drip, cognome vuoto, email saltata,
  risposte controcorrente, cambia idea nel teleprompter su almeno tre
  previsioni prima di confermare, apre il regolamento e tutti e tre i quadri
  della Hall of Fame (la giocatrice attenta).
- **Partita C** — maschile, stile Ingegnere, ESCE dal gioco con il menu Esci
  tre volte in tre punti diversi (S2, a meta' pronostici, nel teleprompter),
  ogni volta salvando, chiudendo la scheda e riaprendo il sito; poi "Torna
  alla lobby" una volta senza salvare (il giocatore che va e viene).

Per ogni partita annota: dove ti sei fermato a chiederti "e adesso?", ogni
battuta che non torna (chi parla, genere, nome, stile, cose gia' spiegate),
ogni elemento che copre un altro, ogni scatto o fotogramma sbagliato, ogni
suono fuori posto, ogni testo tagliato o che sborda. Un'immagine intrusa
(fondale o posa di prima) e' un bug, non un dettaglio.

## 2. Coerenza narrativa e testi

Passa **tutti** i testi che il giocatore legge (`story.json`, `domande.json`,
`quiz.json`, `index.html`, il regolamento, la card, il countdown, l'email,
le modali, i bottoni) e controlla:

- genere: ogni parola declinata riferita al giocatore passa da `{g:..|..}`,
  anche nei bottoni e nelle modali; e nessuna battuta declinata arriva
  **prima** della scelta del genere;
- nome: `{NOME}` risolto sempre, mai vuoto, mai il cognome per esteso;
- stile: le battute per stile esistono per tutti e quattro (Hawaiano,
  Showman, Drip, Ingegnere) in ogni punto in cui si biforcano;
- chi parla: il nome sul cartellino e' quello giusto, la cuffia c'e' solo
  quando Susan e' in regia, nessuno parla "fuori campo" senza motivo;
- linguaggio: mai "schedina bloccata / chiusa", si dice fatte / confermate /
  registrate; niente meccaniche spiegate due volte; niente battute lunghe che
  su un telefono vanno a sei righe;
- refusi, apostrofi, accenti, "e'" contro "è" usati in modo uniforme dentro
  la stessa schermata; punteggiatura nei bottoni.

## 3. Salvataggio e ripresa

Il salvataggio locale e' la rete del giocatore: rompilo apposta.

- salva in ogni scena, chiudi, riapri: la ripresa porta nello stesso punto,
  con avatar, stile, previsioni, punti, categorie visitate, quiz e record
  della corsa intatti;
- "Ricomincia da capo" chiede conferma e cancella tutto, "No, torno indietro"
  non tocca niente;
- riapri con la schedina gia' confermata: si va al countdown, non in scena;
- localStorage pieno o disabilitato (modalita' privata di Safari): il gioco
  parte lo stesso, il menu Esci avvisa e non si blocca;
- due schede aperte insieme sullo stesso telefono: quale salvataggio vince, e
  il gioco non si corrompe.

## 4. Punteggi e invio

- fai una partita con risposte note e ricalcola a mano `totale()` dai `pt`
  di `domande.json`: deve coincidere con la card e con quello che arriva a
  Supabase;
- `npm run supabase` deve dire che la schedina viene accettata; controlla
  che la riga contenga TUTTI i campi del payload, e che i due invii (conferma
  previsioni + moltiplicatori del quiz) aggiornino la stessa riga, non due;
- spegni la rete (o metti un backend sbagliato) al momento della conferma:
  la partita si chiude lo stesso, la schedina resta in coda e riparte al
  prossimo avvio, senza mostrare errori al giocatore;
- il quiz: il tentativo si consuma entrando, la seconda chance dell'hawaiano
  funziona, il 50/50 del drip toglie due risposte sbagliate, assegnati i
  moltiplicatori il quiz e' chiuso per davvero.

## 5. Interfaccia e grafica, a schermo

Su entrambe le misure di schermo, per ogni scena:

- niente che scorra: risposte, modali, card, regolamento, monitor del
  teleprompter, griglia del quiz, tutto dentro lo schermo con la barra di
  Safari aperta;
- i personaggi alla misura giusta accanto a Lucas (il metro), mai tagliati
  dove non devono, mai davanti a cio' che si tocca; Peter col tavolo sempre
  coperto dall'interfaccia;
- i due bottoni agli angoli (Esci e audio) sempre sopra tutto, mai coperti,
  Esci solo da S2 al ritorno in lobby post-previsioni;
- frecce e pallini della lobby fermi nello stesso posto in tutte le zone;
- gli hotspot della Hall of Fame centrati sui tre quadri, il regolamento e
  la porta STAFF ONLY sul bersaglio giusto;
- animazioni: nessun personaggio che sparisce con lo sprite giusto caricato,
  nessuna crescita "da lontano" all'ingresso, i titoli di coda si accelerano
  col tocco ma non si saltano;
- lancia `CHARS=4000 BG=4000 npm run transizioni` e riporta i fotogrammi
  sbagliati, se ce ne sono.

## 6. Audio

Con musica ed effetti spenti dall'inizio: cambia dieci stanze, apri la corsa,
fai il quiz: **niente** deve suonare. Riaccendi: la musica riparte, quella
giusta per la scena, senza doppioni. Prova anche con la musica accesa e gli
effetti spenti, e viceversa. Il tocco che manda avanti il dialogo non fa
rumore. Gli applausi arrivano dopo l'annuncio, non sul tocco.

## 7. Errori umani e casi limite

- nome con apostrofo, accento, spazio, emoji, 24 caratteri; nome vuoto;
  cognome vuoto;
- doppio tocco veloce su ogni bottone che fa avanzare (risposte, conferme,
  ENTRA, "Sono io", conferma keynote): mai due avanzamenti, mai due invii;
- tocco durante una dissolvenza, durante la scrittura di un cartello, durante
  la carrellata;
- ruota il telefono in orizzontale e torna in verticale;
- schermata di morte della corsa con un dito che pesta: non si esce prima di
  aver visto la classifica;
- apri il sito da `github.io` e da `fantaliberty.com`: il cartello di attesa
  deve essere gia' sparito (data `APERTURA` in `index.html`), e `?apri`,
  `?dev`, `?scene=` devono funzionare ancora.

## 8. Cosa mi consegni

Un rapporto unico, in italiano, in questo ordine:

1. **Bloccanti** — cose per cui non si va live, gia' sistemate se possibile
   (PR mergiata, numero), altrimenti proposta pronta.
2. **Sistemati** — elenco secco, un rigo ciascuno, con la PR.
3. **Da decidere tu** — massimo cinque punti, ognuno con la mia scelta
   consigliata in grassetto e il perche' in una riga.
4. **Non riproducibili / lasciati stare** — e perche'.
5. **Stato finale**: `npm test`, `npm run transizioni`, `npm run supabase`,
   versione asset, ultimo commit su `main`.

Concisione: chi legge e' su un telefono, la mattina del lancio. Screenshot
solo dove una parola non basta.
