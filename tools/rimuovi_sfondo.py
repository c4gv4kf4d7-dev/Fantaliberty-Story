#!/usr/bin/env python3
"""Rende trasparente lo sfondo di uno sprite: scacchiera, bianco o tinta piatta.

    python3 tools/rimuovi_sfondo.py --controlla            # chi non e' scontornato
    python3 tools/rimuovi_sfondo.py assets/chars/chr_susan_panico_telefoni.webp
    python3 tools/rimuovi_sfondo.py assets/chars/*.webp --prova

Il caso piu' insidioso e' la **scacchiera**: molti editor mostrano la trasparenza
come quadretti grigi e bianchi, e se lo sprite viene esportato appiattito quei
quadretti diventano pixel veri. A schermo si vede lo scacchiere addosso al
personaggio — sembra un errore del gioco, e' un errore di esportazione.

Come funziona:

  1. **impara i colori dello sfondo dai bordi** invece di usare una soglia fissa:
     una scacchiera ha due tinte (es. bianco 254 e grigio 243), un fondo piatto
     una sola. Prendere una soglia sola lascerebbe indietro i quadretti scuri.
  2. **riempie dai bordi** (flood fill): il bianco *dentro* il disegno — denti,
     occhi, riflessi — non e' collegato al bordo e resta.
  3. **richiude i buchi** del soggetto e toglie un pixel di alone.
  4. **sfuma il contorno** e sbava il colore verso l'esterno, come
     ammorbidisci_bordi.py: senza, resterebbe la scaletta dura.

Il formato del file viene mantenuto (un .webp resta .webp) e le dimensioni della
tela non cambiano, cosi' non si sposta l'inquadratura del personaggio.

Richiede: pillow numpy scipy
"""
import argparse
import glob
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    import numpy as np
    from PIL import Image
    from _pulizia import SOGLIA_RESIDUO, maschera_soggetto, sbava_colore, sfuma_alpha
except ImportError:
    sys.exit("Servono pillow, numpy e scipy:  pip install pillow numpy scipy")


def scontorna(percorso, tolleranza, sfuma, prova):
    im = Image.open(percorso)
    formato = im.format or ("WEBP" if percorso.lower().endswith(".webp") else "PNG")
    im = im.convert("RGBA")
    a = np.array(im)
    rgb = a[..., :3].astype(int)

    if (a[..., 3] < 255).any():
        print("  = %-46s ha gia' trasparenza, saltato" % os.path.basename(percorso))
        return False

    esito = maschera_soggetto(rgb, tolleranza)
    if esito is None:
        print("  ! %-46s non riconosco uno sfondo uniforme sui bordi"
              % os.path.basename(percorso))
        return False
    soggetto, quanto, residuo = esito

    if quanto < 2:
        print("  ! %-46s solo il %.1f%% sarebbe sfondo: sospetto, lascio stare"
              % (os.path.basename(percorso), quanto))
        return False
    if residuo > SOGLIA_RESIDUO:
        print("  ! %-46s NON RIUSCITO: resta il %.0f%% di sfondo attaccato al "
              "soggetto.\n      Lo sfondo non e' uniforme: va scontornato a mano."
              % (os.path.basename(percorso), residuo))
        return False
    alpha = (soggetto * 255).astype(np.uint8)
    if sfuma:
        alpha = sfuma_alpha(alpha)
    # il colore va sbavato verso l'esterno prima della sfumatura, altrimenti
    # questa ripesca lo sfondo appena tolto e lascia un alone
    rgb_fuori = sbava_colore(a[..., :3].astype(np.float32), soggetto)

    prima = os.path.getsize(percorso)
    if not prova:
        fuori = np.dstack([rgb_fuori, alpha]).astype(np.uint8)
        opz = dict(quality=90, method=6) if formato == "WEBP" else dict(optimize=True)
        Image.fromarray(fuori, "RGBA").save(percorso, formato, **opz)
        dopo = os.path.getsize(percorso)
    else:
        dopo = prima

    print("  ~ %-46s sfondo %.0f%%, residuo %.1f%%  %d KB -> %d KB%s"
          % (os.path.basename(percorso), quanto, residuo, prima / 1024, dopo / 1024,
             "   [prova: non scritto]" if prova else ""))
    return True


def controlla():
    trovati = []
    for p in sorted(glob.glob("assets/**/*.webp", recursive=True)
                    + glob.glob("assets/**/*.png", recursive=True)):
        if os.sep + "bg" + os.sep in p:
            continue                       # i fondali sono opachi per definizione
        if (np.array(Image.open(p).convert("RGBA"))[..., 3] == 255).all():
            trovati.append(p)
    if not trovati:
        print("Tutti gli sprite sono scontornati.")
        return
    print("Sprite senza nessuna trasparenza (mai scontornati):\n")
    for p in trovati:
        print("  %s" % p)
    print("\nControlla le immagini prima di lanciare: se una NON e' uno sprite ma\n"
          "una scena intera (es. una sagoma dentro il suo sfondo), va lasciata com'e'.")


def main():
    ap = argparse.ArgumentParser(
        description="Rende trasparente lo sfondo di uno sprite (scacchiera, bianco, tinta piatta).")
    ap.add_argument("sorgenti", nargs="*", help="gli sprite da scontornare (modificati sul posto)")
    ap.add_argument("--controlla", action="store_true",
                    help="elenca gli sprite mai scontornati, senza toccare nulla")
    ap.add_argument("--tolleranza", type=int, default=14,
                    help="quanto un pixel puo' discostarsi dalla tinta di sfondo (default 14)")
    ap.add_argument("--netto", action="store_true",
                    help="contorno duro senza sfumatura (di norma il contorno viene sfumato)")
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
        fatti += scontorna(s, args.tolleranza, not args.netto, args.prova)
    print("\n%d sprite %s." % (fatti, "da scontornare" if args.prova else "scontornati"))


if __name__ == "__main__":
    main()
