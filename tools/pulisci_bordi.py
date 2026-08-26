#!/usr/bin/env python3
"""Toglie i puntini e i trattini bianchi rimasti negli sprite.

    python3 tools/pulisci_bordi.py assets/chars/chr_lucas_neutro.png

Gli sprite generati arrivano spesso con piccoli residui quasi bianchi: puntini
isolati, trattini lungo i contorni interni, avanzi dello sfondo rimasti
attaccati. Qui vengono trovati e RIEMPITI col colore che hanno intorno, non resi
trasparenti: cosi' non si aprono buchi nel disegno.

Cosa viene risparmiato: le zone bianche che fanno parte del disegno - denti,
bianco degli occhi, riflessi. Si riconoscono perche' sono piu' grandi, oppure
compatte (un riflesso e' quadrato, un residuo e' un trattino) e circondate da
pixel scuri.
"""
import argparse
import os
import sys

try:
    import numpy as np
    from PIL import Image
    from scipy.ndimage import label, binary_dilation
except ImportError:
    sys.exit("Servono pillow, numpy e scipy:  pip install pillow numpy scipy")


def pulisci(path, soglia, area_max, dry_run=False):
    im = Image.open(path).convert('RGBA')
    a = np.array(im)
    rgb = a[:, :, :3].astype(int)
    opaco = a[:, :, 3] > 0

    lum = rgb.mean(axis=2)
    sat = rgb.max(axis=2) - rgb.min(axis=2)
    chiaro = opaco & (lum > soglia) & (sat < 40)

    lab, n = label(chiaro)
    tolte = 0
    for i in range(1, n + 1):
        macchia = lab == i
        area = int(macchia.sum())
        if area > area_max:
            continue                                   # denti, bianco degli occhi
        ys, xs = np.where(macchia)
        w, h = xs.max() - xs.min() + 1, ys.max() - ys.min() + 1
        allungata = max(w, h) >= 2 * min(w, h)

        anello = binary_dilation(macchia, iterations=2) & ~macchia & opaco
        if not anello.any():
            continue
        su_chiaro = lum[anello].mean() > 100

        # compatta e circondata di scuro = riflesso disegnato: si tiene
        if not (allungata or su_chiaro):
            continue

        colore = np.median(rgb[anello & ~chiaro], axis=0) if (anello & ~chiaro).any() \
            else np.median(rgb[anello], axis=0)
        a[macchia, :3] = colore.astype(np.uint8)
        tolte += area

    if not dry_run:
        Image.fromarray(a, 'RGBA').save(path, 'PNG', optimize=True)
    print("%-34s %3d pixel di residuo ricoperti" % (os.path.basename(path), tolte))


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('paths', nargs='+')
    ap.add_argument('--soglia', type=int, default=195)
    ap.add_argument('--area-max', type=int, default=30)
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()
    for p in args.paths:
        pulisci(p, args.soglia, args.area_max, args.dry_run)
