#!/usr/bin/env python3
"""Toglie le toppe di scacchiera rimaste DENTRO uno sprite gia' scontornato.

    python3 tools/togli_scacchiera.py --controlla          # chi ce l'ha ancora
    python3 tools/togli_scacchiera.py assets/chars/chr_susan_mani_capelli.webp
    python3 tools/togli_scacchiera.py assets/chars/*.webp --prova

Perche' serve un secondo strumento oltre a rimuovi_sfondo.py: quello riempie a
partire dai BORDI dell'immagine, quindi prende solo lo sfondo che tocca il bordo.
Se il personaggio alza le braccia sopra la testa, la scacchiera che resta
nell'occhiello fra un braccio e i capelli e' circondata dal disegno: dal bordo
non ci si arriva. Anzi, `binary_fill_holes` la considera *parte del soggetto* e
la tiene apposta — e' la stessa regola che salva i denti e i riflessi negli
occhi. Succede con `chr_susan_mani_capelli`: braccia alzate, due toppe di
quadretti ai lati della testa, e `rimuovi_sfondo.py --controlla` la dichiara
gia' a posto perche' il resto del contorno e' trasparente.

Come si riconosce una toppa di scacchiera e non un pezzo bianco del disegno:

  * e' **grigia neutra e chiara** (i quadretti sono bianco e grigino);
  * ha **due tinte** ben distinte, ognuna con una fetta consistente dell'area.
    E' questo che separa la scacchiera da un riflesso o da un dente: quelli
    sono di un colore solo, con al massimo una sfumatura continua;
  * le due tinte formano una **griglia regolare**: scorrendo una riga, le strisce
    di una tinta e dell'altra sono tutte lunghe uguali — il lato del quadretto,
    una ventina di pixel. E' questo il controllo che conta. Un primo tentativo si
    limitava a chiedere che le due tinte si alternassero spesso: ci cascavano i
    capelli bianchi di Peter e l'arco metallico del lucchetto, che alternano
    chiaro e scuro a ogni pixel. Misurando la lunghezza delle strisce la
    differenza e' netta: la scacchiera ha strisce da 22-24 px tutte uguali, i
    capelli strisce da 1 px sparse;
  * ogni quadretto e' **piatto**: dentro una tinta la luminosita' non varia. Un
    disegno dipinto ha sempre una sfumatura.

Richiede: pillow numpy scipy
"""
import argparse
import glob
import os
import sys

try:
    import numpy as np
    from PIL import Image
    from scipy.ndimage import label
except ImportError:
    sys.exit("Servono pillow, numpy e scipy:  pip install pillow numpy scipy")

# una toppa piu' piccola di cosi' non vale la pena di toccarla: sotto questa
# soglia si finisce per mangiare riflessi e dettagli chiari del disegno
MIN_AREA = 0.002          # frazione dell'immagine
NEUTRO = 12               # quanto una tinta puo' allontanarsi dal grigio puro
CHIARO = 185              # luminosita' minima dei quadretti
STACCO = 12               # differenza minima di luminosita' fra le due tinte
QUOTA_SECONDA = 0.12      # la tinta meno frequente deve valere almeno tanto
LATO_MIN = 6              # lato minimo del quadretto, in pixel
REGOLARITA = 0.42         # quante strisce devono essere lunghe come il lato
PIATTEZZA = 8.0           # deviazione massima della luminosita' dentro una tinta


def isole_candidate(a):
    """Le zone opache, chiare e neutre dell'immagine, una per una."""
    al = a[..., 3]
    rgb = a[..., :3].astype(int)
    neutro = (rgb.max(axis=2) - rgb.min(axis=2)) <= NEUTRO
    chiaro = rgb.mean(axis=2) >= CHIARO
    lab, n = label((al > 200) & neutro & chiaro)
    if n == 0:
        return []
    conte = np.bincount(lab.ravel())
    conte[0] = 0
    minimo = a.shape[0] * a.shape[1] * MIN_AREA
    return [(i, lab == i) for i in np.flatnonzero(conte >= minimo)]


def strisce(lum, isola, taglio):
    """Le lunghezze delle strisce di tinta uniforme lungo le righe dell'isola."""
    mappa = np.where(isola, lum < taglio, False)
    fuori = []
    for y in range(isola.shape[0]):
        xs = np.flatnonzero(isola[y])
        if xs.size < LATO_MIN * 2:
            continue                       # riga troppo corta per dire qualcosa
        riga = mappa[y, xs.min():xs.max() + 1]
        cambi = np.flatnonzero(np.diff(riga.astype(int)) != 0)
        if cambi.size > 1:
            fuori += list(np.diff(cambi))
    return np.array(fuori)


def e_scacchiera(rgb, isola):
    """Vero se l'isola e' una griglia regolare di quadretti a due tinte piatte."""
    lum = rgb.mean(axis=2)
    valori = lum[isola]
    if valori.size == 0:
        return False, ''

    # due tinte: si separano al punto di mezzo fra il chiaro e lo scuro
    alto, basso = np.percentile(valori, 90), np.percentile(valori, 10)
    if alto - basso < STACCO:
        return False, 'tinta unica (%.0f)' % alto
    taglio = (alto + basso) / 2
    scuri = valori < taglio
    quota = min(scuri.mean(), 1 - scuri.mean())
    if quota < QUOTA_SECONDA:
        return False, 'seconda tinta solo il %.0f%%' % (quota * 100)

    # ogni quadretto e' piatto: un disegno dipinto ha sempre una sfumatura
    piatto = max(valori[scuri].std(), valori[~scuri].std())
    if piatto > PIATTEZZA:
        return False, 'tinte sfumate (scarto %.1f): e\' disegno, non quadretti' % piatto

    # e soprattutto: le strisce sono tutte lunghe come il lato del quadretto
    lung = strisce(lum, isola, taglio)
    if lung.size < 10:
        return False, 'troppo poche strisce per dire se e\' una griglia'
    corte = lung[lung < 64]
    if corte.size == 0:
        return False, 'strisce troppo lunghe: non e\' una griglia'
    lato = int(np.bincount(corte).argmax())
    regolarita = float(np.mean(np.abs(lung - lato) <= 1))
    if lato < LATO_MIN:
        return False, 'strisce da %d px: e\' trama del disegno, non una scacchiera' % lato
    if regolarita < REGOLARITA:
        return False, 'strisce irregolari (%.2f): non e\' una griglia' % regolarita
    return True, 'quadretti da %d px, %.0f/%.0f, regolarita %.2f' % (lato, basso, alto, regolarita)


def pulisci_file(percorso, prova):
    im = Image.open(percorso)
    formato = im.format or ("WEBP" if percorso.lower().endswith(".webp") else "PNG")
    a = np.array(im.convert("RGBA"))
    rgb = a[..., :3].astype(int)

    togliere = []
    for _, isola in isole_candidate(a):
        ok, perche = e_scacchiera(rgb, isola)
        if ok:
            togliere.append((isola, perche))

    nome = os.path.basename(percorso)
    if not togliere:
        return False

    tolti = 0
    for isola, perche in togliere:
        tolti += int(isola.sum())
        if not prova:
            a[..., 3][isola] = 0
    print("  ~ %-46s %d toppe, %.1f%% dell'immagine  [%s]%s"
          % (nome, len(togliere), tolti / a[..., 3].size * 100,
             togliere[0][1], "   [prova: non scritto]" if prova else ""))

    if not prova:
        opz = dict(quality=92, method=6) if formato == "WEBP" else dict(optimize=True)
        Image.fromarray(a, "RGBA").save(percorso, formato, **opz)
    return True


def main():
    ap = argparse.ArgumentParser(
        description="Toglie le toppe di scacchiera rimaste dentro uno sprite gia' scontornato.")
    ap.add_argument("sorgenti", nargs="*", help="gli sprite da ripulire (modificati sul posto)")
    ap.add_argument("--controlla", action="store_true",
                    help="elenca chi ha ancora quadretti dentro, senza toccare nulla")
    ap.add_argument("--prova", action="store_true", help="mostra cosa toglierebbe senza scrivere")
    args = ap.parse_args()

    if args.controlla:
        files = sorted(glob.glob("assets/**/*.webp", recursive=True)
                       + glob.glob("assets/**/*.png", recursive=True))
        files = [f for f in files if os.sep + "bg" + os.sep not in f]
        trovati = sum(pulisci_file(f, True) for f in files)
        print("\n%d sprite con quadretti rimasti dentro." % trovati
              if trovati else "\nNessuno sprite ha quadretti rimasti dentro.")
        return

    if not args.sorgenti:
        ap.error("passa uno o piu' file, oppure --controlla")

    fatti = 0
    for s in args.sorgenti:
        if not os.path.isfile(s):
            print("  ! non trovato: %s" % s)
            continue
        fatti += pulisci_file(s, args.prova)
    print("\n%d sprite %s." % (fatti, "da ripulire" if args.prova else "ripuliti"))


if __name__ == "__main__":
    main()
