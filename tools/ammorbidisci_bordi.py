#!/usr/bin/env python3
"""Ammorbidisce il contorno degli sprite con l'alpha "dura" (senza sfumature).

    python3 tools/ammorbidisci_bordi.py assets/props/prop_mac_terminale.webp
    python3 tools/ammorbidisci_bordi.py --controlla          # elenca chi ne ha bisogno
    python3 tools/ammorbidisci_bordi.py assets/chars/*.webp --prova

Il problema: alcuni sprite hanno l'alpha a due soli valori, 0 o 255. Ogni bordo
diagonale o curvo diventa una scaletta netta, e siccome il gioco mostra le
immagini rimpicciolite (il Mac e' 938px e si vede a ~750px) la scaletta diventa
irregolare e si legge come "ritagliato male".

Cosa fa, in due passaggi che vanno insieme:

  1. **sbava il colore verso l'esterno** — sotto i pixel trasparenti resta il
     colore del vecchio sfondo (nel Mac era bianco 252,252,252). Sfumando
     l'alpha senza questo passaggio, quel bianco riaffiora e si vede come un
     alone chiaro attorno alla sagoma.
  2. **sfuma solo l'alpha** di --raggio pixel. L'interno del disegno non viene
     toccato: resta pixel art nitida, si ammorbidisce solo il contorno.

Non ha effetto sugli sprite che hanno gia' l'alpha morbida: quelli vengono
saltati, cosi' si puo' lanciare su una cartella intera senza pensarci.

Richiede: pillow numpy scipy
"""
import argparse
import glob
import os
import sys

try:
    import numpy as np
    from PIL import Image, ImageFilter
    from scipy.ndimage import distance_transform_edt
except ImportError:
    sys.exit("Servono pillow, numpy e scipy:  pip install pillow numpy scipy")

# sotto questa percentuale di pixel semitrasparenti il contorno e' "duro"
SOGLIA_DURA = 0.3


def percentuale_sfumata(alpha):
    return float(((alpha > 0) & (alpha < 255)).mean() * 100)


def ammorbidisci(percorso, raggio, prova):
    im = Image.open(percorso).convert("RGBA")
    a = np.array(im).astype(np.float32)
    rgb, alpha = a[..., :3], a[..., 3]

    prima = percentuale_sfumata(alpha)
    if prima >= SOGLIA_DURA:
        print("  = %-46s gia' morbido (%.1f%%), saltato"
              % (os.path.basename(percorso), prima))
        return False
    if not (alpha == 0).any():
        print("  = %-46s nessuna trasparenza, saltato" % os.path.basename(percorso))
        return False

    # 1. il colore dei pixel opachi piu' vicini riempie la zona trasparente,
    #    cosi' la sfumatura successiva non tira dentro il vecchio sfondo
    opaco = alpha > 0
    vicino = distance_transform_edt(~opaco, return_distances=False, return_indices=True)
    rgb = rgb[vicino[0], vicino[1]]

    # 2. sfuma solo l'alpha: il disegno resta identico, cambia solo il bordo
    alpha = np.array(
        Image.fromarray(alpha.astype(np.uint8)).filter(ImageFilter.GaussianBlur(raggio))
    ).astype(np.float32)

    dopo = percentuale_sfumata(alpha)
    peso_prima = os.path.getsize(percorso)

    if not prova:
        fuori = np.dstack([rgb, alpha]).clip(0, 255).astype(np.uint8)
        salva = {"WEBP": dict(quality=90, method=6)}.get(
            Image.open(percorso).format, dict(optimize=True))
        Image.fromarray(fuori, "RGBA").save(percorso, **salva)
        peso_dopo = os.path.getsize(percorso)
    else:
        peso_dopo = peso_prima

    print("  ~ %-46s contorno %.1f%% -> %.1f%%   %d KB -> %d KB%s"
          % (os.path.basename(percorso), prima, dopo,
             peso_prima / 1024, peso_dopo / 1024,
             "   [prova: non scritto]" if prova else ""))
    return True


def controlla():
    trovati = []
    for p in sorted(glob.glob("assets/**/*.webp", recursive=True)
                    + glob.glob("assets/**/*.png", recursive=True)):
        if os.sep + "bg" + os.sep in p:
            continue                       # i fondali non hanno contorno
        alpha = np.array(Image.open(p).convert("RGBA"))[..., 3]
        if (alpha == 255).all():
            continue
        pct = percentuale_sfumata(alpha)
        if pct < SOGLIA_DURA:
            trovati.append((p, pct))
    if not trovati:
        print("Nessuno sprite con contorno duro. Tutto a posto.")
        return
    print("Sprite con contorno duro (alpha senza sfumature):\n")
    for p, pct in trovati:
        print("  %-52s %.2f%%" % (p, pct))
    print("\nPer sistemarli:\n  python3 tools/ammorbidisci_bordi.py %s"
          % " ".join(p for p, _ in trovati))


def main():
    ap = argparse.ArgumentParser(
        description="Ammorbidisce il contorno degli sprite con alpha binaria.")
    ap.add_argument("sorgenti", nargs="*", help="gli sprite da correggere (modificati sul posto)")
    ap.add_argument("--controlla", action="store_true",
                    help="elenca gli sprite che ne avrebbero bisogno, senza toccare nulla")
    ap.add_argument("--raggio", type=float, default=0.8,
                    help="quanto sfumare il bordo, in pixel (default 0.8: "
                         "abbastanza da togliere la scaletta, non tanto da sbiadire)")
    ap.add_argument("--prova", action="store_true", help="mostra il risultato senza scrivere")
    args = ap.parse_args()

    if args.controlla:
        return controlla()
    if not args.sorgenti:
        ap.error("passa uno o piu' file, oppure --controlla")

    fatti = 0
    for s in args.sorgenti:
        if not os.path.isfile(s):
            print("  ! non trovato: %s" % s)
            continue
        fatti += ammorbidisci(s, args.raggio, args.prova)
    print("\n%d sprite %s." % (fatti, "da correggere" if args.prova else "corretti"))


if __name__ == "__main__":
    main()
