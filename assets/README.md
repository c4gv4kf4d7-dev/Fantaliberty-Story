# assets/ — dove caricare le immagini

Carica qui dentro tutto quello che genera Nanobanana/Gemini, **gia' ritagliato con
sfondo trasparente**. Il gioco pesca da queste cartelle: non serve toccare codice,
basta dichiarare il file in `game/story.json`.

```
assets/
  bg/       sfondi di scena        es. lobby.jpg, backstage.jpg
  chars/    personaggi             es. susan_panic.png
  props/    oggetti di scena       es. mac_terminal.png
```

## Nomi dei file: `personaggio_espressione.png`

Un file per **ogni espressione**, tutto minuscolo, niente spazi né accenti.

| Personaggio | File attesi (dal cast su Notion) |
|---|---|
| Lucas — concierge | `lucas_neutral.png` ✅, `lucas_happy.png` ✅, `lucas_invito.png` |
| Susan — assistente | `susan_panic.png`, `susan_orologio.png`, `susan_comando.png` |
| Maurice — guida lobby | `maurice_chill.png`, `maurice_spiega.png` |
| Martha — regia | `martha_regia.png`, `martha_radio.png` |
| Veterano *(nome TBD)* | `veterano_neutral.png`, `veterano_compiaciuto.png` |
| Premi *(nome TBD)* | `premi_neutral.png`, `premi_tada.png` |

✅ = già in repo. Gli altri nomi sono **già referenziati** in `story.json`: appena
carichi il file con quel nome e lo aggiungi alla lista `assets.chars`, il personaggio
compare in scena senza altre modifiche. Finché manca, il motore mostra la scena
senza personaggio (niente immagine rotta).

## Dimensioni e peso

Il personaggio viene disegnato alto ~34% dello schermo: **512–768 px di lato lungo**
sono più che sufficienti, l'alta risoluzione non si vede e pesa solo di più.
Dopo aver caricato i file:

```bash
python3 tools/optimize_assets.py --all      # resize + 64 colori, alpha intatto
npm test                                    # controlla che nulla manchi
```

Obiettivo: **sotto ~1 MB in totale**. Con ~15 sprite ottimizzati siamo intorno ai
300–400 KB.

## Come aggiungere lo sprite al gioco

1. file in `assets/chars/susan_panic.png`
2. in `game/story.json`, dentro `assets.chars`:
   `"susan_panic": "chars/susan_panic.png",`
3. negli step: `{ "t": "show", "char": "susan_panic" }`
