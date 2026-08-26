#!/usr/bin/env python3
"""Rende trasparente lo sfondo bianco (o a scacchiera) di uno sprite.

    python3 tools/rimuovi_sfondo.py assets/props/prop_mac_terminale.png

Come funziona: prende i pixel chiari CONNESSI ai bordi (flood fill), cosi' il
bianco interno al disegno resta; richiude i buchi del soggetto; erode di 1px per
togliere l'alone chiaro sul contorno; ritaglia al soggetto e quantizza a 64
colori (su pixel art e' impercettibile e taglia il peso).

Richiede: pillow numpy scipy
"""
import argparse
import os
import sys

try:
    import numpy as np
    from PIL import Image
    from scipy.ndimage import label, binary_erosion, binary_fill_holes
except ImportError:
    sys.exit("Servono pillow, numpy e scipy:  pip install pillow numpy scipy")


def scontorna(path, soglia, colori, erosione):
    im = Image.open(path).convert('RGB')
    a = np.array(im).astype(int)

    chiaro = (a[:, :, 0] > soglia) & (a[:, :, 1] > soglia) & (a[:, :, 2] > soglia)
    lab, _ = label(chiaro)
    bordo = set(lab[0, :]) | set(lab[-1, :]) | set(lab[:, 0]) | set(lab[:, -1])
    bordo.discard(0)
    if not bordo:
        print("nessuno sfondo chiaro sui bordi: il file e' gia' a posto")
        return

    sfondo = np.isin(lab, list(bordo))
    soggetto = binary_fill_holes(~sfondo)
    if erosione:
        soggetto = binary_erosion(soggetto, iterations=erosione)

    alpha = (soggetto * 255).astype(np.uint8)
    out = Image.fromarray(np.dstack([np.array(im), alpha]), 'RGBA')
    out = out.crop(Image.fromarray(alpha).getbbox())

    q = out.convert('RGB').quantize(colors=colori, method=Image.FASTOCTREE).convert('RGBA')
    q.putalpha(out.getchannel('A'))

    prima = os.path.getsize(path)
    q.save(path, 'PNG', optimize=True)
    print("%s  %s  %.0f KB -> %.0f KB" % (path, out.size, prima / 1024.0,
                                          os.path.getsize(path) / 1024.0))


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('paths', nargs='+')
    ap.add_argument('--soglia', type=int, default=246, help='quanto chiaro conta come sfondo')
    ap.add_argument('--colori', type=int, default=64)
    ap.add_argument('--erosione', type=int, default=1, help='pixel di alone da togliere')
    args = ap.parse_args()
    for p in args.paths:
        scontorna(p, args.soglia, args.colori, args.erosione)
