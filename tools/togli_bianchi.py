#!/usr/bin/env python3
"""Toglie le toppe di BIANCO rimaste dentro uno sprite gia' scontornato.

    python3 tools/togli_bianchi.py --controlla            # chi ce l'ha ancora
    python3 tools/togli_bianchi.py assets/stili/*.webp --prova
    python3 tools/togli_bianchi.py assets/stili/*.webp --anteprima shots/
    python3 tools/togli_bianchi.py assets/stili/*.webp

E' il terzo strumento della famiglia, e serve per un caso che gli altri due non
coprono:

  * `rimuovi_sfondo.py` riempie a partire dai BORDI: prende solo lo sfondo che
    tocca il bordo dell'immagine. Fra una ciocca di capelli e l'altra, o
    nell'occhiello fra il braccio e il fianco, dal bordo non ci si arriva.
  * `togli_scacchiera.py` prende le toppe chiuse dentro il disegno, ma solo
    quando sono a quadretti (due tinte, griglia regolare).

Qui le toppe sono di **bianco pieno**: il fondo delle tavole consegnate era
bianco, non a scacchiera. Restano come puntini nei capelli e come chiazze fra
braccio e busto — a schermo, sopra un fondale scuro, si leggono come sporco.

Come si riconosce il bianco dello sfondo e non il bianco del disegno:

  * e' **quasi puro** (ogni canale >= 235) e **neutro** (i tre canali entro 10
    l'uno dall'altro). Il bianco dipinto — la canottiera dell'Hawaiano, la
    camicia dello Showman, le scarpe della Drip — non lo e' mai: e' avorio,
    grigio-azzurro, ombreggiato. Sono proprio quei capi il motivo per cui la
    soglia sta alta: abbassandola si mangia il vestiario;
  * i **denti e i riflessi negli occhi** restano fuori per la stessa ragione:
    sono piccoli e sempre un po' sporchi di colore.

La verifica si fa **a occhio, prima di scrivere**: `--anteprima` salva una copia
con le zone candidate in magenta su fondo scuro. E' cosi' che si e' visto che le
chiazze grandi dell'Ingegnere e dello Showman erano lo sfondo incastrato fra
braccio e busto, e non un capo bianco.

Richiede: pillow numpy scipy
"""
import argparse
import glob
import os
import sys

try:
    import numpy as np
    from PIL import Image
    from scipy.ndimage import binary_dilation, label
except ImportError:
    sys.exit("Servono pillow, numpy e scipy:  pip install pillow numpy scipy")

CHIARO = 235          # ogni canale almeno cosi': sotto, e' bianco dipinto
NEUTRO = 10           # scarto massimo fra i canali: il bianco vero non ha tinta
MIN_AREA = 12         # sotto questa dimensione e' rumore del disegno, si lascia
ALONE = 2             # anelli di pixel attorno alla toppa da ripulire
ALONE_CHIARO = 205    # nell'anello si toglie solo cio' che e' comunque chiaro
ALONE_NEUTRO = 26


def toppe(a):
    """La maschera del bianco di sfondo rimasto dentro, alone compreso."""
    al = a[..., 3]
    rgb = a[..., :3].astype(int)
    neutro = (rgb.max(axis=2) - rgb.min(axis=2)) <= NEUTRO
    puro = (al > 128) & neutro & (rgb.min(axis=2) >= CHIARO)

    lab, n = label(puro)
    if n == 0:
        return np.zeros(al.shape, bool), 0
    conte = np.bincount(lab.ravel())
    conte[0] = 0
    tenute = np.flatnonzero(conte >= MIN_AREA)
    if not len(tenute):
        return np.zeros(al.shape, bool), 0
    nucleo = np.isin(lab, tenute)

    # L'alone: il bordo sfumato che il ritaglio ha lasciato attorno alla toppa.
    # Se resta, al posto della chiazza compare un contorno chiaro — lo stesso
    # difetto, solo piu' sottile. Si toglie solo cio' che e' chiaro e scialbo:
    # il disegno vero attorno (capelli, stoffa) e' scuro o colorato e resta.
    ring = binary_dilation(nucleo, iterations=ALONE) & ~nucleo
    scialbo = ((rgb.max(axis=2) - rgb.min(axis=2)) <= ALONE_NEUTRO) & \
              (rgb.min(axis=2) >= ALONE_CHIARO)
    return nucleo | (ring & scialbo & (al > 0)), len(tenute)


def anteprima(a, mask, dest):
    """Le zone candidate in magenta, su fondo scuro: si guardano, non si leggono."""
    o = a.copy()
    o[mask] = [255, 0, 255, 255]
    fondo = Image.new("RGB", (a.shape[1], a.shape[0]), (20, 24, 40))
    im = Image.fromarray(o)
    fondo.paste(im, (0, 0), im)
    fondo.save(dest)


def pulisci_file(path, prova=False, cartella_anteprima=None):
    im = Image.open(path).convert("RGBA")
    a = np.array(im)
    mask, quante = toppe(a)
    tolti = int(mask.sum())
    if not tolti:
        return False

    opachi = int((a[..., 3] > 128).sum()) or 1
    quota = 100.0 * tolti / opachi
    print("  %-52s %2d toppe, %5d px (%.2f%% del soggetto)"
          % (os.path.basename(path), quante, tolti, quota))

    if cartella_anteprima:
        dest = os.path.join(cartella_anteprima,
                            "bianchi-" + os.path.splitext(os.path.basename(path))[0] + ".png")
        anteprima(a, mask, dest)
        print("      anteprima: %s" % dest)
    if prova or cartella_anteprima:
        return True

    a[mask] = [0, 0, 0, 0]
    Image.fromarray(a).save(path, "WEBP" if path.lower().endswith(".webp") else None,
                            quality=92, method=6)
    return True


def main():
    ap = argparse.ArgumentParser(
        description="Toglie le toppe di bianco rimaste dentro uno sprite gia' scontornato.")
    ap.add_argument("sorgenti", nargs="*", help="gli sprite da ripulire (modificati sul posto)")
    ap.add_argument("--controlla", action="store_true",
                    help="elenca chi ha ancora bianco dentro, senza toccare nulla")
    ap.add_argument("--prova", action="store_true", help="mostra cosa toglierebbe senza scrivere")
    ap.add_argument("--anteprima", metavar="CARTELLA",
                    help="salva le zone candidate in magenta, da guardare prima di lanciare")
    args = ap.parse_args()

    if args.anteprima:
        os.makedirs(args.anteprima, exist_ok=True)

    sorgenti = args.sorgenti
    if args.controlla and not sorgenti:
        sorgenti = sorted(glob.glob("assets/**/*.webp", recursive=True)
                          + glob.glob("assets/**/*.png", recursive=True))
        sorgenti = [f for f in sorgenti if os.sep + "bg" + os.sep not in f]
    if not sorgenti:
        ap.error("passa uno o piu' file, oppure --controlla")

    fatti = 0
    for s in sorgenti:
        if not os.path.isfile(s):
            print("  ! non trovato: %s" % s)
            continue
        fatti += pulisci_file(s, args.prova or args.controlla, args.anteprima)
    print("\n%d sprite %s." % (fatti, "da ripulire" if (args.prova or args.controlla
                                                       or args.anteprima) else "ripuliti"))


if __name__ == "__main__":
    main()
