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

try:
    import numpy as np
    from PIL import Image, ImageFilter
    from scipy.ndimage import (binary_dilation, binary_erosion, binary_fill_holes,
                               distance_transform_edt, label)
except ImportError:
    sys.exit("Servono pillow, numpy e scipy:  pip install pillow numpy scipy")


def colori_di_sfondo(a, campione=6, tolleranza=12):
    """Le tinte che occupano i bordi dell'immagine: una se il fondo e' piatto,
    due se e' una scacchiera."""
    bordi = np.concatenate([
        a[:campione, :, :].reshape(-1, 3), a[-campione:, :, :].reshape(-1, 3),
        a[:, :campione, :].reshape(-1, 3), a[:, -campione:, :].reshape(-1, 3),
    ])
    colori, conte = np.unique(bordi, axis=0, return_counts=True)
    ordine = np.argsort(-conte)
    scelti = []
    for i in ordine:
        c = colori[i]
        if conte[i] < len(bordi) * 0.02:      # tinta marginale, non e' lo sfondo
            break
        if all(np.abs(c.astype(int) - s).max() > tolleranza for s in scelti):
            scelti.append(c.astype(int))
        if len(scelti) == 2:                  # oltre due tinte non e' uno sfondo
            break
    return scelti


def scontorna(percorso, tolleranza, sfuma, prova):
    im = Image.open(percorso)
    formato = im.format or ("WEBP" if percorso.lower().endswith(".webp") else "PNG")
    im = im.convert("RGBA")
    a = np.array(im)
    rgb = a[..., :3].astype(int)

    if (a[..., 3] < 255).any():
        print("  = %-46s ha gia' trasparenza, saltato" % os.path.basename(percorso))
        return False

    tinte = colori_di_sfondo(rgb)
    if not tinte:
        print("  ! %-46s non riconosco uno sfondo uniforme sui bordi"
              % os.path.basename(percorso))
        return False

    simile = np.zeros(rgb.shape[:2], bool)
    for t in tinte:
        simile |= (np.abs(rgb - t).max(axis=2) <= tolleranza)

    # Una scacchiera esportata in WEBP non ha due tinte pulite: la compressione le
    # sparpaglia su decine di valori, e i pixel di passaggio fra un quadretto e
    # l'altro (a meta' strada fra le due tinte) non somigliano a nessuna delle due.
    # Quei pixel fanno da muro e spezzano il riempimento, che si ferma dopo poco.
    # Se le tinte sono due e sono entrambe grigie, si accetta tutto il grigio
    # neutro compreso fra loro: i passaggi vengono inclusi e il muro cade.
    if len(tinte) == 2:
        neutre = [t for t in tinte if int(t.max() - t.min()) <= 12]
        if len(neutre) == 2:
            lum = rgb.mean(axis=2)
            basso = min(t.mean() for t in neutre) - tolleranza
            alto = max(t.mean() for t in neutre) + tolleranza
            grigio = (rgb.max(axis=2) - rgb.min(axis=2)) <= 14
            simile |= grigio & (lum >= basso) & (lum <= alto)

    # solo le zone di sfondo COLLEGATE al bordo: il bianco dentro il disegno resta
    lab, _ = label(simile)
    sul_bordo = set(lab[0, :]) | set(lab[-1, :]) | set(lab[:, 0]) | set(lab[:, -1])
    sul_bordo.discard(0)
    if not sul_bordo:
        print("  = %-46s nessuno sfondo sui bordi, saltato" % os.path.basename(percorso))
        return False

    sfondo = np.isin(lab, list(sul_bordo))
    soggetto = binary_fill_holes(~sfondo)
    soggetto = binary_erosion(soggetto, iterations=1)     # via l'alone di contorno

    quanto = float(sfondo.mean() * 100)
    if quanto < 2:
        print("  ! %-46s solo il %.1f%% sarebbe sfondo: sospetto, lascio stare"
              % (os.path.basename(percorso), quanto))
        return False

    # Verifica: se dopo il taglio restano opachi tanti pixel che somigliano ancora
    # allo sfondo, il riempimento si e' fermato a meta' e lo sprite e' peggio di
    # prima. Meglio non scrivere e dirlo, che riportare un successo falso.
    residuo = float((simile & soggetto).sum()) / max(soggetto.sum(), 1) * 100
    if residuo > 8:
        print("  ! %-46s NON RIUSCITO: resta il %.0f%% di sfondo attaccato al "
              "soggetto.\n      Lo sfondo non e' uniforme: va scontornato a mano."
              % (os.path.basename(percorso), residuo))
        return False

    alpha = (soggetto * 255).astype(np.uint8)
    if sfuma:
        alpha = np.array(Image.fromarray(alpha).filter(ImageFilter.GaussianBlur(0.8)))

    # sbava il colore sotto il nuovo trasparente, altrimenti la sfumatura
    # ripesca lo sfondo appena tolto e lascia un alone
    vicino = distance_transform_edt(~soggetto, return_distances=False, return_indices=True)
    rgb_fuori = a[..., :3][vicino[0], vicino[1]]

    prima = os.path.getsize(percorso)
    if not prova:
        fuori = np.dstack([rgb_fuori, alpha]).astype(np.uint8)
        opz = dict(quality=90, method=6) if formato == "WEBP" else dict(optimize=True)
        Image.fromarray(fuori, "RGBA").save(percorso, formato, **opz)
        dopo = os.path.getsize(percorso)
    else:
        dopo = prima

    print("  ~ %-46s sfondo %.0f%% (%d tinta%s)  %d KB -> %d KB%s"
          % (os.path.basename(percorso), quanto, len(tinte),
             "" if len(tinte) == 1 else "/e", prima / 1024, dopo / 1024,
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
