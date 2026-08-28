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
    banca = json.loads(read("game", "domande.json"))
    base = story.get("meta", {}).get("assetBase", "")
    inArrivo = set(story.get("meta", {}).get("assetiInArrivo", []))
    for kind, items in story.get("assets", {}).items():
        for key, rel in list(items.items()):
            if rel.startswith(("data:", "http")):
                continue
            # gli asset dichiarati ma non ancora consegnati si tolgono invece di
            # far fallire la build: il motore li salta gia' da solo
            if rel in inArrivo and not os.path.exists(os.path.join(ROOT, base + rel)):
                del items[key]
                continue
            items[key] = data_uri(base + rel)
    # anche le pose degli stili e le icone delle voci sono asset, ma stanno in
    # blocchi loro invece che sotto "assets"
    for st in story.get("stili", {}).values():
        for k, rel in (st.get("pose") or {}).items():
            st["pose"][k] = data_uri(base + rel)
    for c in story.get("cast", {}).values():
        for k in ("bodies", "heads"):
            for i, rel in list((c.get(k) or {}).items()):
                if os.path.exists(os.path.join(ROOT, base + rel)):
                    c[k][i] = data_uri(base + rel)
        if c.get("icona"):
            c["icona"] = [data_uri(base + r) for r in c["icona"]]
    for cfg in story.get("carrellate", {}).values():
        for shot in cfg.get("shots", []):
            shot["img"] = data_uri(base + shot["img"])
    # la banca cita gli sprite degli eventi
    for e in banca.get("micro_eventi", []) + list(banca.get("eventi_personali", {}).values()):
        for k in ("asset", "extra_asset"):
            if e.get(k):
                e[k] = data_uri(base + e[k])
    story.setdefault("meta", {})["assetBase"] = ""

    html = read("index.html")
    # i riferimenti portano un ?v=NN che cambia a ogni pubblicazione: la
    # sostituzione deve tollerarlo, altrimenti la build esce con i tag intatti
    # e il file "single" continua a chiedere i file esterni
    html, n = re.subn(
        r'<link rel="stylesheet" href="\./game/engine\.css[^"]*">',
        lambda m: "<style>\n%s\n</style>" % read("game", "engine.css"), html)
    if n != 1:
        sys.exit("non trovo il link a engine.css in index.html")
    html, n = re.subn(
        r'<script src="\./game/engine\.js[^"]*"></script>',
        lambda m: "<script>\n%s\n</script>" % read("game", "engine.js"), html)
    if n != 1:
        sys.exit("non trovo lo script engine.js in index.html")
    inline = "<script>window.STORY_INLINE=%s;window.BANCA_INLINE=%s;</script>" % (
        json.dumps(story, ensure_ascii=False, separators=(",", ":")),
        json.dumps(banca, ensure_ascii=False, separators=(",", ":")),
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
