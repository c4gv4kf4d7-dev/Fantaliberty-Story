#!/usr/bin/env python3
"""Ottimizza gli sprite pixel-art prima di embeddarli.

Uso:
    python3 tools/optimize_assets.py assets/chars/lucas_happy.png
    python3 tools/optimize_assets.py --all              # tutta la cartella assets/
    python3 tools/optimize_assets.py --all --max-side 640 --colors 64

Cosa fa:
  * resize (lato lungo <= --max-side, nearest-neighbour: la pixel art non va interpolata)
  * quantizzazione colore FASTOCTREE a --colors colori, preservando l'alpha
  * ricompressione PNG (optimize=True) / JPEG per gli sfondi

Su pixel art la quantizzazione a 64 colori e' praticamente impercettibile e taglia
il peso di 10-20x: e' cio' che tiene il bundle inline sotto il megabyte.

Richiede Pillow:  pip install pillow
"""
import argparse
import os
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("Serve Pillow: pip install pillow")

EXTS = (".png", ".jpg", ".jpeg")


def optimize(path, max_side, colors, jpeg_quality, dry_run=False):
    before = os.path.getsize(path)
    im = Image.open(path)
    is_jpeg = path.lower().endswith((".jpg", ".jpeg"))

    if max(im.size) > max_side:
        ratio = max_side / float(max(im.size))
        new = (max(1, int(im.size[0] * ratio)), max(1, int(im.size[1] * ratio)))
        im = im.resize(new, Image.NEAREST)

    if is_jpeg:
        im = im.convert("RGB")
        if not dry_run:
            im.save(path, "JPEG", quality=jpeg_quality, optimize=True, progressive=True)
    else:
        im = im.convert("RGBA")
        alpha = im.getchannel("A")
        # quantizza solo i colori; l'alpha viene riattaccato intatto (niente aloni)
        rgb = im.convert("RGB").quantize(colors=colors, method=Image.FASTOCTREE)
        out = rgb.convert("RGBA")
        out.putalpha(alpha)
        if not dry_run:
            out.save(path, "PNG", optimize=True)

    after = os.path.getsize(path) if not dry_run else before
    print("%-42s %7.1f KB -> %7.1f KB" % (path, before / 1024.0, after / 1024.0))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("paths", nargs="*")
    ap.add_argument("--all", action="store_true", help="processa tutta la cartella assets/")
    ap.add_argument("--max-side", type=int, default=768)
    ap.add_argument("--colors", type=int, default=64)
    ap.add_argument("--jpeg-quality", type=int, default=72)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    targets = list(args.paths)
    if args.all:
        for root, _, files in os.walk("assets"):
            targets += [os.path.join(root, f) for f in files if f.lower().endswith(EXTS)]
    if not targets:
        ap.error("nessun file: passa dei path oppure --all")

    for p in targets:
        optimize(p, args.max_side, args.colors, args.jpeg_quality, args.dry_run)


if __name__ == "__main__":
    main()
