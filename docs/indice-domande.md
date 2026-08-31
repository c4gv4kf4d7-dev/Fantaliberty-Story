# Indice della banca domande

Generato da `game/domande.json` e `game/quiz.json`. **Non modificare a mano**:
e' un riflesso dei dati, si rigenera con `npm run indice`.

Gli id sono **stabili**: finiscono in `run.picks` e nelle run gia' salvate.
Rinominarli rompe la corrispondenza con le schedine bloccate.

## Pronostici [S5]

| id | categoria | tipo | difficolta' | opzioni | domanda |
|---|---|---|---|---|---|
| `IPHONE.C1` | iPhone | core | 4 | 3 | Il prezzo dell'iPhone 18 Pro |
| `IPHONE.C2` | iPhone | core | 3 | 4 | Il colore nuovo di quest'anno |
| `IPHONE.C3` | iPhone | core | 4 | 3 | L'apertura variabile su quali modelli arriva? |
| `IPHONE.C4` | iPhone | core | 3 | 3 | Come si chiama il pieghevole? |
| `IPHONE.C5` | iPhone | core | 5 | 4 | Quando e dove si può comprare il pieghevole? |
| `IPHONE.C6` | iPhone | core | 4 | 4 | Il prezzo di partenza del pieghevole in Italia |
| `IPHONE.E1` | iPhone | extra | — | 3 | La Dynamic Island: la rimpiccioliscono, la lasciano o la fanno sparire? |
| `IPHONE.E2` | iPhone | extra | — | 3 | Come si sblocca il pieghevole? |
| `IPHONE.E3` | iPhone | extra | — | 3 | Che fine fa il Camera Control? |
| `IPHONE.E4` | iPhone | extra | — | 2 | Apple presenta un accessorio dedicato al pieghevole? |
| `IPHONE.E5` | iPhone | extra | — | 3 | Quanti modelli di iPhone salgono sul palco? |
| `IPHONE.E6` | iPhone | extra | — | 2 | Dicono esplicitamente che non c'è la piega? |
| `WATCH.C1` | Watch | core | 2 | 3 | Il grande annuncio riguardo la salute |
| `WATCH.C2` | Watch | core | 1 | 3 | Il design |
| `WATCH.C3` | Watch | core | 2 | 4 | Il prezzo del Series 12 rispetto al Series 11 |
| `WATCH.E1` | Watch | extra | — | 2 | Funzioni satellitari Ultra annunciate? |
| `WATCH.E2` | Watch | extra | — | 3 | Come chiamano il chip nuovo? |
| `WATCH.E3` | Watch | extra | — | 2 | Esce un Apple Watch SE nuovo? |
| `WATCH.E4` | Watch | extra | — | 3 | Secondo te creano una nuova linea di cinturini? |
| `WATCH.E5` | Watch | extra | — | 2 | Ospite esterno per la parte salute? |
| `ALTRO.C1` | Altro | core | 3 | 3 | Ok, AirPods. Ne vediamo di nuove stasera? |
| `ALTRO.C2` | Altro | core | 2 | 2 | Viene presentata la nuova Apple TV? |
| `ALTRO.C3` | Altro | core | 2 | 3 | Le AirPods con le fotocamere |
| `ALTRO.E1` | Altro | extra | — | 2 | Nuovo HomePod mini? |
| `ALTRO.E2` | Altro | extra | — | 2 | Home hub, il display per la casa? |
| `ALTRO.E3` | Altro | extra | — | 2 | iPad mini OLED a settembre? |
| `ALTRO.E4` | Altro | extra | — | 2 | Un Mac sul palco? |
| `ALTRO.E5` | Altro | extra | — | 2 | Teaser smart glasses o Vision Pro? |
| `ALTRO.E6` | Altro | extra | — | 2 | Un vero 'one more thing'? |

## Intermezzi di regia (Susan)

Non hanno battute per stile: il personaggio risponde in cuffia, non alla platea.

| id | domanda | opzioni |
|---|---|---|
| `R1` | Prima che inizi. Scommessa tra noi due: chi si fa vedere stasera? | 3 |
| `R4` | Quanto dura stasera? Devo dirlo al catering. | 3 |
| `R5` | Ultima. In scaletta c'è un ospite che non conosco. Secondo te entra davvero? | 2 |

Piu' 4 intermezzi di riserva.

## Quiz di Peter [S8]

| livello | domande | soglia | 1o tentativo | 2o tentativo | pool |
|---|---|---|---|---|---|
| Base | 5 | 3/5 | +0.1x | +0.05x | 2 x 5 |
| Avanzato | 7 | 5/7 | +0.2x | +0.1x | 2 x 7 |
| Leggenda | 10 | 8/10 | +0.3x | +0.15x | 2 x 10 |

Tetto moltiplicatore cumulativo: **0.6x**. Timer 10s per domanda (13s con il perk dell'Ingegnere).

### Da riverificare prima della pubblicazione

Domande il cui dato storico non e' stato confermato da fonte diretta:

`L5`, `L2b`, `L7b`, `L10b`

---

**Totali:** 29 domande di pronostico, 316 battute, 44 domande di quiz.
