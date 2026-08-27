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
    from scipy.ndimage import label, binary_dilation, binary_erosion
except ImportError:
    sys.exit("Servono pillow, numpy e scipy:  pip install pillow numpy scipy")


def pulisci(path, soglia, area_max, isola_max=60, salto=45, passate=2, dry_run=False):
    im = Image.open(path).convert('RGBA')
    a = np.array(im)
    rgb = a[:, :, :3].astype(int)
    alpha = a[:, :, 3]
    opaco = alpha > 0

    lum = rgb.mean(axis=2)
    sat = rgb.max(axis=2) - rgb.min(axis=2)
    chiaro = opaco & (lum > soglia) & (sat < 40)

    # 1. isole staccate dalla figura: puntini rimasti attorno al soggetto dopo
    #    uno scontorno approssimativo. Si cancellano, non hanno niente sotto.
    lab_op, n_op = label(opaco)
    isole = 0
    if n_op > 1:
        dim = np.bincount(lab_op.ravel())
        dim[0] = 0
        principale = dim.argmax()
        for i in range(1, n_op + 1):
            if i == principale or dim[i] > isola_max:
                continue
            alpha[lab_op == i] = 0
            isole += int(dim[i])
        opaco = alpha > 0

    # 2. alone di scontorno: il pixel piu' esterno e' molto piu' chiaro di quello
    #    che ha subito dentro. E' sfondo rimasto attaccato, non disegno: via.
    #    Si vede solo sui fondali scuri, per questo sfugge a occhio.
    aloni = 0
    for _ in range(passate):
        opaco = alpha > 0
        interno = binary_erosion(opaco)
        bordo = opaco & ~interno
        # colore del vicino interno: media dei pixel interni attorno
        vicino = np.zeros_like(lum)
        conta = np.zeros_like(lum)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dy == 0 and dx == 0:
                    continue
                sp = np.roll(np.roll(lum * interno, dy, 0), dx, 1)
                sc = np.roll(np.roll(interno.astype(float), dy, 0), dx, 1)
                vicino += sp
                conta += sc
        media = np.divide(vicino, np.maximum(conta, 1))
        alone = bordo & (conta > 0) & (lum > media + salto)
        if not alone.any():
            break
        alpha[alone] = 0
        aloni += int(alone.sum())
        lum = np.where(alpha > 0, lum, 0)

    opaco = alpha > 0
    chiaro = opaco & (lum > soglia) & (sat < 40)

    # 3. macchie chiare rimaste dentro il disegno
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

    a[:, :, 3] = alpha
    if not dry_run:
        Image.fromarray(a, 'RGBA').save(path, 'PNG', optimize=True)
    print("%-34s %3d ricoperti, %2d isole, %3d alone di contorno"
          % (os.path.basename(path), tolte, isole, aloni))


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('paths', nargs='+')
    ap.add_argument('--soglia', type=int, default=195)
    ap.add_argument('--area-max', type=int, default=30)
    ap.add_argument('--salto', type=int, default=45,
                    help='quanto piu' ' chiaro del vicino interno per essere alone')
    ap.add_argument('--passate', type=int, default=2)
    ap.add_argument('--isola-max', type=int, default=60,
                    help='isole staccate piu' ' piccole di cosi vengono cancellate')
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()
    for p in args.paths:
        pulisci(p, args.soglia, args.area_max, args.isola_max,
                args.salto, args.passate, args.dry_run)
