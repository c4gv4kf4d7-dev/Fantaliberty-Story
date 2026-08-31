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


def corsa_inline():
    """La pagina di Apple Campus Run con dentro le sue immagini e il suo font.

    Sul sito la corsa e' una pagina a parte e il motore la apre per indirizzo.
    Qui di indirizzi non ce ne sono: la pagina intera finisce dentro lo story,
    e il motore la monta nel riquadro con "srcdoc". Le immagini le chiede per
    nome a una cartella, e al posto della cartella si passa un elenco gia'
    incorporato (window.RUN_INLINE): un file che manca non ferma la build, la
    corsa disegna il suo segnaposto e va avanti, esattamente come sul sito.
    """
    pagina = read("game", "runner", "index.html")
    nomi = sorted(set(re.findall(r"carica\('[^']+',\s*'([^']+)'\)", pagina)))
    if not nomi:
        sys.exit("non trovo le immagini che la corsa carica")
    dentro = {}
    for f in nomi:
        rel = "assets/in_app_game/" + f
        if os.path.exists(os.path.join(ROOT, rel)):
            dentro[f] = data_uri(rel)
    tag = "<script>window.RUN_INLINE=%s;</script>\n" % json.dumps(
        dentro, separators=(",", ":")).replace("</", "<\\/")
    pagina, n = re.subn(r"<script>\n\(\(\) => \{", tag + "<script>\n(() => {",
                        pagina, count=1)
    if n != 1:
        sys.exit("non trovo dove agganciare le immagini nella pagina della corsa")
    pagina, nf = re.subn(
        r"url\('\.\./\.\./assets/font/([^']+)'\)",
        lambda m: "url('%s')" % data_uri("assets/font/" + m.group(1)), pagina)
    if nf != 1:
        sys.exit("non trovo il font da incorporare nella pagina della corsa")
    return pagina


def main():
    story = json.loads(read("game", "story.json"))
    banca = json.loads(read("game", "domande.json"))
    quiz = json.loads(read("game", "quiz.json"))
    backend = json.loads(read("game", "backend.json")) if os.path.exists(
        os.path.join(ROOT, "game", "backend.json")) else None
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
    # la corsa: niente cartella da cui pescare, quindi ci va la pagina intera
    story["meta"].pop("runner", None)
    story["meta"]["runnerInline"] = corsa_inline()

    html = read("index.html")
    # i riferimenti portano un ?v=NN che cambia a ogni pubblicazione: la
    # sostituzione deve tollerarlo, altrimenti la build esce con i tag intatti
    # e il file "single" continua a chiedere i file esterni
    css = read("game", "engine.css")
    # Il font va incorporato: se resta un url() relativo, il file unico non lo
    # trova e il browser ripiega su un monospace di sistema, largo circa la meta'
    # di questo. Con quel ripiego le battute occupano il doppio delle righe e
    # sbordano dal box del dialogo, che ha altezza fissa. Prima la build toglieva
    # e basta il riferimento al font: era esattamente il caso rotto.
    css, nf = re.subn(
        r"url\('\.\./assets/font/([^']+)'\)",
        lambda m: "url('%s')" % data_uri("assets/font/" + m.group(1)), css)
    if nf != 1:
        sys.exit("non trovo il font da incorporare in engine.css")
    html, n = re.subn(
        r'<link rel="stylesheet" href="\./game/engine\.css[^"]*">',
        lambda m: "<style>\n%s\n</style>" % css, html)
    if n != 1:
        sys.exit("non trovo il link a engine.css in index.html")
    html, n = re.subn(
        r'<script src="\./game/engine\.js[^"]*"></script>',
        lambda m: "<script>\n%s\n</script>" % read("game", "engine.js"), html)
    if n != 1:
        sys.exit("non trovo lo script engine.js in index.html")
    # "</" va spezzato: dentro lo story c'e' la pagina della corsa, e un
    # "</script>" nei dati chiuderebbe il tag a meta' dell'assegnazione. In una
    # stringa JavaScript "<\\/script>" e' identico a "</script>".
    def dump(x):
        return json.dumps(x, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")

    inline = ("<script>window.STORY_INLINE=%s;window.BANCA_INLINE=%s;"
              "window.BACKEND_INLINE=%s;window.QUIZ_INLINE=%s;</script>") % (
        dump(story), dump(banca), dump(backend), dump(quiz),
    )
    html = html.replace("<script>\n(function () {", inline + "\n<script>\n(function () {", 1)
    # (il font non arriva piu' dalla rete: sta nel CSS come data: URI, sopra)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(html)
    print("%s  (%.0f KB)" % (OUT, os.path.getsize(OUT) / 1024.0))


if __name__ == "__main__":
    main()
