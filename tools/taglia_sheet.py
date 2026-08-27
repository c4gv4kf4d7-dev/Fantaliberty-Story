#!/usr/bin/env python3
"""Taglia uno sprite sheet consegnato come unico file in pezzi separati.

Il manifest asset chiede alcuni file "a piu' pose in uno": un foglio con 4 teste
affiancate, un frame doppio chiuso/aperto, eccetera. Il gioco vuole un file per
posa, quindi vanno tagliati prima di passare da prepara_asset.py.

    # 4 teste affiancate in una riga (il caso piu' comune: espressioni, commento_stile)
    python3 tools/taglia_sheet.py _sorgenti/stile_drip_espressioni.png \\
        --pezzi 4 --nomi neutro sicuro sorpreso indifficolta

    # 2 frame affiancati (buzzer, lucchetto, clicker)
    python3 tools/taglia_sheet.py _sorgenti/obj_tavolino_buzzer_peter.png \\
        --pezzi 2 --nomi non_premuto premuto

    # una griglia vera (2 righe x 2 colonne), lettura riga per riga
    python3 tools/taglia_sheet.py _sorgenti/foglio.png --righe 2 --colonne 2 \\
        --nomi a b c d

Ogni pezzo esce come <nome_base>_<suffisso>.png accanto al file originale (di
norma dentro _sorgenti/), gia' con il prefisso giusto (stile_, chr_, obj_...)
per essere ripreso da prepara_asset.py con il comando di sempre:

    python3 tools/prepara_asset.py _sorgenti/*.png

Il foglio originale, una volta tagliato, viene spostato in
_sorgenti/_tagliati/: resta li' come promemoria ma non viene piu' raccolto dal
comando sopra (altrimenti verrebbe convertito anche lui, oltre ai suoi pezzi).

Richiede Pillow:  pip install pillow
"""
import argparse
import os
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("Serve Pillow: pip install pillow")


def taglia(sorgente, righe, colonne, nomi, prova):
    base_dir = os.path.dirname(os.path.abspath(sorgente))
    base_nome = os.path.splitext(os.path.basename(sorgente))[0]

    im = Image.open(sorgente).convert("RGBA")
    w, h = im.size

    if w % colonne or h % righe:
        print("  ! %s: %dx%d non si divide in modo esatto per %d colonne x %d righe."
              % (os.path.basename(sorgente), w, h, colonne, righe))
        print("    Ricontrolla la griglia, oppure il foglio consegnato ha margini da rifilare.")
        return []

    pw, ph = w // colonne, h // righe
    pezzi = []
    i = 0
    for r in range(righe):
        for c in range(colonne):
            box = (c * pw, r * ph, (c + 1) * pw, (r + 1) * ph)
            ritaglio = im.crop(box)
            suffisso = nomi[i] if nomi else str(i + 1)
            nome_file = "%s_%s.png" % (base_nome, suffisso)
            percorso = os.path.join(base_dir, nome_file)
            pezzi.append((percorso, ritaglio.size))
            if not prova:
                if os.path.exists(percorso):
                    print("  ~ %s esiste gia', sovrascritto." % nome_file)
                ritaglio.save(percorso, "PNG")
            i += 1

    print("  %s  (%dx%d)  ->  %d pezzi da %dx%d%s"
          % (os.path.basename(sorgente), w, h, len(pezzi), pw, ph,
             "   [prova: non scritto]" if prova else ""))
    for percorso, dim in pezzi:
        print("    %s  %s" % (os.path.basename(percorso), dim))
    return pezzi


def sposta_originale(sorgente, prova):
    cartella = os.path.join(os.path.dirname(os.path.abspath(sorgente)), "_tagliati")
    destinazione = os.path.join(cartella, os.path.basename(sorgente))
    if prova:
        print("    [prova] verrebbe spostato in %s" % os.path.relpath(destinazione))
        return
    os.makedirs(cartella, exist_ok=True)
    os.replace(sorgente, destinazione)
    print("    originale spostato in %s (cosi' non viene ritagliato/convertito di nuovo)"
          % os.path.relpath(destinazione))


def main():
    ap = argparse.ArgumentParser(
        description="Taglia uno sprite sheet in piu' file, uno per posa.",
        formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("sorgenti", nargs="+", help="i fogli da tagliare")
    ap.add_argument("--pezzi", type=int,
                    help="numero di pezzi affiancati in una riga sola "
                         "(scorciatoia per --colonne N --righe 1)")
    ap.add_argument("--righe", type=int, help="righe della griglia")
    ap.add_argument("--colonne", type=int, help="colonne della griglia")
    ap.add_argument("--nomi", nargs="+",
                    help="un suffisso per pezzo, letto riga per riga da sinistra "
                         "a destra (es. neutro sicuro sorpreso indifficolta). "
                         "Senza, i pezzi si chiamano _1, _2, ...")
    ap.add_argument("--prova", action="store_true",
                    help="mostra i tagli senza scrivere ne' spostare nulla")
    args = ap.parse_args()

    if args.pezzi and (args.righe or args.colonne):
        ap.error("--pezzi e --righe/--colonne sono alternativi: --pezzi e' gia' "
                  "una griglia a 1 riga")
    if args.pezzi:
        righe, colonne = 1, args.pezzi
    elif args.righe and args.colonne:
        righe, colonne = args.righe, args.colonne
    else:
        ap.error("serve --pezzi N, oppure --righe R --colonne C")

    totale_pezzi = righe * colonne
    if args.nomi and len(args.nomi) != totale_pezzi:
        ap.error("--nomi ne elenca %d, ma la griglia fa %d pezzi (%d righe x %d colonne)"
                  % (len(args.nomi), totale_pezzi, righe, colonne))

    almeno_uno = False
    for s in args.sorgenti:
        if not os.path.isfile(s):
            print("  ! non trovato: %s" % s)
            continue
        pezzi = taglia(s, righe, colonne, args.nomi, args.prova)
        if pezzi:
            almeno_uno = True
            sposta_originale(s, args.prova)
        print()

    if almeno_uno and not args.prova:
        print("Ora i pezzi sono pronti per la conversione di sempre:")
        print("  python3 tools/prepara_asset.py _sorgenti/*.png")


if __name__ == "__main__":
    main()
