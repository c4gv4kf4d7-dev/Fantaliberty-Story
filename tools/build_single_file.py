#!/usr/bin/env python3
"""Compila index.html + game/* + assets/* in un unico HTML statico offline.

    python3 tools/build_single_file.py            -> dist/nexus_game.html

Il file prodotto non fa nessuna richiesta HTTP (asset in base64 inline, story
iniettata come window.STORY_INLINE) e quindi funziona anche aperto da file://
o inviato per email. Il sito su GitHub Pages continua invece a usare i file
separati, che restano la sorgente di verita'.
"""
import base64
import json
import mimetypes
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "dist", "nexus_game.html")


def read(*p):
    with open(os.path.join(ROOT, *p), encoding="utf-8") as f:
        return f.read()


def data_uri(rel):
    path = os.path.join(ROOT, rel)
    if not os.path.exists(path):
        sys.exit("asset mancante: %s" % rel)
    mime = mimetypes.guess_type(path)[0] or "application/octet-stream"
    with open(path, "rb") as f:
        return "data:%s;base64,%s" % (mime, base64.b64encode(f.read()).decode())


def main():
    story = json.loads(read("game", "story.json"))
    base = story.get("meta", {}).get("assetBase", "")
    for kind, items in story.get("assets", {}).items():
        for key, rel in items.items():
            if not rel.startswith(("data:", "http")):
                items[key] = data_uri(base + rel)
    story.setdefault("meta", {})["assetBase"] = ""

    html = read("index.html")
    html = html.replace(
        '<link rel="stylesheet" href="./game/engine.css">',
        "<style>\n%s\n</style>" % read("game", "engine.css"),
    )
    html = html.replace(
        '<script src="./game/engine.js"></script>',
        "<script>\n%s\n</script>" % read("game", "engine.js"),
    )
    inline = "<script>window.STORY_INLINE=%s;</script>" % json.dumps(
        story, ensure_ascii=False, separators=(",", ":")
    )
    html = html.replace("<script>\n(function () {", inline + "\n<script>\n(function () {", 1)
    # niente font remoti nella build offline: fallback su monospace di sistema
    html = re.sub(r'<link rel="preconnect"[^>]*>\s*', "", html)
    html = re.sub(r'<link href="https://fonts\.googleapis[^>]*>\s*', "", html)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(html)
    print("%s  (%.0f KB)" % (OUT, os.path.getsize(OUT) / 1024.0))


if __name__ == "__main__":
    main()
