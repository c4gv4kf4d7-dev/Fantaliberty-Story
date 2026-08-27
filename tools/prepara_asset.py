#!/usr/bin/env python3
"""Prepara un'immagine pesante per il repo: la converte in WebP e la mette al posto giusto.

Serve a questo: il file che esce dal programma di grafica pesa 1-6 MB e non va
committato cosi'. Questo script ne ricava un WebP da poche decine di KB, con lo
stesso aspetto sullo schermo del telefono, e lo salva dentro assets/.

    python3 tools/prepara_asset.py ~/Desktop/camerino.png --tipo bg
    python3 tools/prepara_asset.py ~/Desktop/susan_ansia.png --tipo chars --nome chr_susan_ansia
    python3 tools/prepara_asset.py ~/Desktop/*.png --tipo chars --pixel-art
    python3 tools/prepara_asset.py ~/Desktop/logo.png --tipo ui --prova   # solo stima, non scrive

L'originale NON viene mai toccato: tienilo fuori dal repo (Drive, iCloud, Notion),
serve solo a te per rigenerare.

Differenza da optimize_assets.py: quello ricomprime *sul posto* file gia' dentro
assets/ per la build single-file; questo *importa* un file da fuori, lo converte
in WebP e non modifica nulla di quello che gli dai in pasto.

Richiede Pillow:  pip install pillow
"""
import argparse
import os
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("Serve Pillow: pip install pillow")

# dove finisce ogni tipo di asset e oltre quale lato lungo conviene ridimensionare.
#
# Questi sono TETTI DI SICUREZZA, non bersagli: fermano un export da 6000 px, non
# rimpiccioliscono l'arte buona. Il guadagno vero viene dal WebP (4-170x), non dal
# ridimensionamento, quindi in dubbio si preferisce non toccare i pixel.
# Il gioco e' 390x844 pt: a 3x un personaggio a tutta altezza sta in 2532, ed e'
# la scala con cui sono nominati gli sprite (@3x). 2560 li lascia intatti.
# Quando un tetto scatta davvero, lo script lo dice a schermo.
TIPI = {
    "bg":     {"dir": "assets/bg",     "lato": 2560, "alpha": False, "prefisso": "bg_"},
    "chars":  {"dir": "assets/chars",  "lato": 2560, "alpha": True,  "prefisso": "chr_"},
    "props":  {"dir": "assets/props",  "lato": 2560, "alpha": True,  "prefisso": "prop_"},
    "avatar": {"dir": "assets/avatar", "lato": 1200, "alpha": True,  "prefisso": "avt_"},
    "ui":     {"dir": "assets/ui",     "lato": 1600, "alpha": True,  "prefisso": ""},
}


def kb(n):
    return "%.0f KB" % (n / 1024.0)


def nome_uscita(sorgente, tipo, nome_forzato):
    if nome_forzato:
        base = nome_forzato
    else:
        base = os.path.splitext(os.path.basename(sorgente))[0]
        # spazi e maiuscole nei nomi file danno problemi negli URL: via
        base = base.lower().replace(" ", "_").replace("-", "_")
        pref = TIPI[tipo]["prefisso"]
        if pref and not base.startswith(pref):
            base = pref + base
    return base + ".webp"


def prepara(sorgente, tipo, qualita, lato_max, pixel_art, nome_forzato, prova, radice):
    cfg = TIPI[tipo]
    if not os.path.isfile(sorgente):
        print("  ! non trovato: %s" % sorgente)
        return None

    prima = os.path.getsize(sorgente)
    im = Image.open(sorgente)
    dim_prima = im.size

    lato = lato_max or cfg["lato"]
    ridotto = max(im.size) > lato
    if ridotto:
        r = lato / float(max(im.size))
        nuova = (max(1, round(im.size[0] * r)), max(1, round(im.size[1] * r)))
        # la pixel art va scalata a blocchi netti, un'illustrazione no
        im = im.resize(nuova, Image.NEAREST if pixel_art else Image.LANCZOS)

    im = im.convert("RGBA" if cfg["alpha"] else "RGB")

    destinazione = os.path.join(radice, cfg["dir"], nome_uscita(sorgente, tipo, nome_forzato))
    if not prova:
        os.makedirs(os.path.dirname(destinazione), exist_ok=True)
        im.save(destinazione, "WEBP", quality=qualita, method=6)
        dopo = os.path.getsize(destinazione)
    else:
        import io
        b = io.BytesIO()
        im.save(b, "WEBP", quality=qualita, method=6)
        dopo = b.tell()

    print("  %s" % os.path.basename(sorgente))
    print("    %s %s  ->  %s %s   (%.0f volte piu' leggero)"
          % (dim_prima, kb(prima), im.size, kb(dopo), prima / float(max(dopo, 1))))
    print("    %s%s" % (os.path.relpath(destinazione, radice),
                        "   [prova: non scritto]" if prova else ""))
    if ridotto:
        print("    ATTENZIONE: ridimensionato, il lato lungo superava %d px."
              " Usa --lato per alzare il tetto." % lato)
    return dopo


def main():
    ap = argparse.ArgumentParser(
        description="Converte un'immagine pesante in WebP e la mette in assets/.")
    ap.add_argument("sorgenti", nargs="+", help="i file da importare (restano intatti)")
    ap.add_argument("--tipo", required=True, choices=sorted(TIPI),
                    help="dove va a finire: bg, chars, props, avatar, ui")
    ap.add_argument("--nome", help="nome del file di uscita senza estensione "
                                   "(solo con una sorgente alla volta)")
    ap.add_argument("--qualita", type=int, default=82,
                    help="qualita' WebP 1-100 (default 82; sotto 70 si inizia a vedere)")
    ap.add_argument("--lato", type=int, help="forza il lato lungo in pixel")
    ap.add_argument("--pixel-art", action="store_true",
                    help="ridimensiona a blocchi netti invece che sfumando")
    ap.add_argument("--prova", action="store_true", help="mostra il risultato senza scrivere")
    args = ap.parse_args()

    if args.nome and len(args.sorgenti) > 1:
        ap.error("--nome vale per una sorgente sola")

    radice = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    print("Destinazione: %s/  (qualita' %d)\n" % (TIPI[args.tipo]["dir"], args.qualita))
    totale = 0
    fatti = 0
    for s in args.sorgenti:
        d = prepara(s, args.tipo, args.qualita, args.lato, args.pixel_art,
                    args.nome, args.prova, radice)
        if d:
            totale += d
            fatti += 1
        print()

    if fatti:
        print("%d file, %s in totale." % (fatti, kb(totale)))
        if not args.prova:
            print("\nOra dichiaralo in game/story.json sotto assets.%s, poi:"
                  % ("bg" if args.tipo == "bg" else args.tipo))
            print("  npm test      # verifica che gli asset citati esistano")
            print("  npm run bump  # obbligatorio prima di pubblicare")


if __name__ == "__main__":
    main()
