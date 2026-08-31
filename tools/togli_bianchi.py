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
    from scipy.ndimage import binary_dilation, convolve, distance_transform_edt, label
except ImportError:
    sys.exit("Servono pillow, numpy e scipy:  pip install pillow numpy scipy")

CHIARO = 235          # ogni canale almeno cosi': sotto, e' bianco dipinto
NEUTRO = 10           # scarto massimo fra i canali: il bianco vero non ha tinta
MIN_AREA = 12         # sotto questa dimensione e' rumore del disegno, si lascia
ALONE = 2             # anelli di pixel attorno alla toppa da ripulire
ALONE_CHIARO = 205    # nell'anello si toglie solo cio' che e' comunque chiaro
ALONE_NEUTRO = 26

# --- modalita' --frangia: i puntini e i filetti sul contorno ---------------
# Le toppe grandi le prende gia' `toppe()`. Restano gli scampoli di fondo
# incastrati fra le ciocche dei capelli e lungo il profilo delle gambe: pochi
# pixel l'uno, spesso sotto la soglia del bianco pieno, ma su fondale scuro si
# contano uno per uno.
#
# Il criterio NON e' "quanto e' bianco" — su quello si sbaglia. E' **cosa ha
# intorno**: un residuo di fondo e' un pixel chiaro e scialbo circondato da
# disegno SCURO, e a un passo dalla trasparenza. Detto al contrario, quello che
# resta al suo posto:
#
#   * i jeans della Drip, le sue scarpe bianche, la camicia dello Showman: sono
#     chiari, ma hanno intorno altro chiaro (la quota di scuro non ci arriva).
#     La prima versione di questo filtro guardava solo il colore e se li
#     mangiava tutti — l'anteprima in magenta e' servita a quello;
#   * denti, riflessi negli occhi, bottoni: stanno in mezzo al disegno, lontano
#     dal contorno, e FR_VICINANZA li esclude;
#   * il colletto bianco sotto un bavero nero: e' chiaro con intorno scuro, ma
#     e' dentro la figura, non a ridosso del vuoto. Anche quello lo salva
#     FR_VICINANZA, ed e' il motivo per cui e' tenuta stretta.
FR_CHIARO = 165        # sotto questo il fondo non arriva mai
FR_NEUTRO = 32         # il fondo e' scialbo; pelle e stoffe colorate no
FR_RAGGIO = 7          # quanto intorno si guarda
FR_SCURO = 110         # cosa conta come "disegno scuro" nell'intorno
FR_QUOTA_SCURA = 0.50  # meta' dell'intorno dev'essere scuro
FR_VICINANZA = 5       # px dalla trasparenza: piu' dentro di cosi' e' disegno
FR_ORLO = 130          # il filetto lasciato dal ritaglio, attaccato al buco
FR_ORLO_NEUTRO = 48


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


def _intorno_scuro(a):
    """Per ogni pixel, quanta parte del disegno intorno e' scura."""
    dentro = a[..., 3].astype(int) > 40
    lum = a[..., :3].astype(int).mean(axis=2)
    k = np.ones((2 * FR_RAGGIO + 1, 2 * FR_RAGGIO + 1))
    tot = convolve(dentro.astype(float), k, mode="constant")
    scuro = convolve((dentro & (lum < FR_SCURO)).astype(float), k, mode="constant")
    return dentro, np.divide(scuro, np.maximum(tot, 1))


def frangia(a):
    """Toglie i residui di fondo sul contorno. Torna la maschera di cio' che ha tolto."""
    dentro, quota = _intorno_scuro(a)
    rgb = a[..., :3].astype(int)
    chiara = (rgb.min(axis=2) >= FR_CHIARO) & ((rgb.max(axis=2) - rgb.min(axis=2)) <= FR_NEUTRO)
    vicino = distance_transform_edt(dentro) <= FR_VICINANZA
    tolto = dentro & chiara & (quota > FR_QUOTA_SCURA) & vicino
    if not tolto.any():
        return tolto
    a[tolto] = [0, 0, 0, 0]

    # l'orlo: il filetto rimasto appiccicato al buco appena aperto, piu' chiaro
    # del disegno intorno. Due giri, cioe' al massimo due pixel — abbastanza per
    # togliere la righina bianca, non per rosicchiare un capo.
    for _ in range(2):
        rgb = a[..., :3].astype(int)
        vivi = a[..., 3].astype(int) > 40
        anello = binary_dilation(tolto, iterations=1) & vivi
        m = anello & (rgb.min(axis=2) >= FR_ORLO) & \
            ((rgb.max(axis=2) - rgb.min(axis=2)) <= FR_ORLO_NEUTRO) & \
            (quota > FR_QUOTA_SCURA)
        if not m.any():
            break
        a[m] = [0, 0, 0, 0]
        tolto |= m
    return tolto


def anteprima(a, mask, dest):
    """Le zone candidate in magenta, su fondo scuro: si guardano, non si leggono."""
    o = a.copy()
    o[mask] = [255, 0, 255, 255]
    fondo = Image.new("RGB", (a.shape[1], a.shape[0]), (20, 24, 40))
    im = Image.fromarray(o)
    fondo.paste(im, (0, 0), im)
    fondo.save(dest)


def pulisci_file(path, prova=False, cartella_anteprima=None, bordi=False):
    im = Image.open(path).convert("RGBA")
    a = np.array(im)
    if bordi:
        pulito = a.copy()
        mask = frangia(pulito)
        quante = 0
    else:
        mask, quante = toppe(a)
    tolti = int(mask.sum())
    if not tolti:
        return False

    opachi = int((a[..., 3] > 128).sum()) or 1
    quota = 100.0 * tolti / opachi
    if bordi:
        print("  %-52s frangia: %5d px (%.2f%% del soggetto)"
              % (os.path.basename(path), tolti, quota))
    else:
        print("  %-52s %2d toppe, %5d px (%.2f%% del soggetto)"
              % (os.path.basename(path), quante, tolti, quota))

    if cartella_anteprima:
        dest = os.path.join(cartella_anteprima,
                            "bianchi-" + os.path.splitext(os.path.basename(path))[0] + ".png")
        anteprima(a, mask, dest)
        print("      anteprima: %s" % dest)
    if prova or cartella_anteprima:
        return True

    if bordi:
        a = pulito
    else:
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
    ap.add_argument("--bordi", action="store_true",
                    help="modalita' frangia: i puntini e i filetti di fondo sul contorno "
                         "(fra le ciocche dei capelli, lungo le gambe), non le toppe grandi")
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
        fatti += pulisci_file(s, args.prova or args.controlla, args.anteprima, args.bordi)
    print("\n%d sprite %s." % (fatti, "da ripulire" if (args.prova or args.controlla
                                                       or args.anteprima) else "ripuliti"))


if __name__ == "__main__":
    main()
