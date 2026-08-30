"""Rigenera game/glifi.json dall'elenco dei caratteri che il font sa disegnare.

Serve al test: una battuta che usa un carattere fuori da quell'elenco non viene
disegnata dal font del gioco. Il browser ripiega su un altro font solo per quel
carattere, quindi a schermo esce una lettera di famiglia diversa in mezzo alla
frase — successo con la okina hawaiana di "'Ohi'a lehua".

Uso:  python3 tools/glifi_font.py     (dopo aver cambiato assets/font/*.woff2)
Serve fonttools:  pip install fonttools brotli
"""
import io
import json
import os

from fontTools.ttLib import TTFont

FONT = os.path.join("assets", "font", "press-start-2p.woff2")
OUT = os.path.join("game", "glifi.json")


def main():
    f = TTFont(FONT)
    cmap = set()
    for t in f["cmap"].tables:
        cmap |= set(t.cmap.keys())
    codici = sorted(c for c in cmap if 32 <= c <= 0x2200)
    nota = (
        "Elenco dei caratteri che %s sa disegnare. Generato da tools/glifi_font.py. "
        "Serve al test: un carattere fuori da qui non viene disegnato dal font del "
        "gioco e il browser ripiega su un altro font, quindi a schermo si vede una "
        "lettera di famiglia diversa in mezzo alla frase. Rigenerare dopo aver "
        "cambiato il file del font." % FONT
    )
    with io.open(OUT, "w", encoding="utf-8") as fh:
        json.dump({"_nota": nota, "codici": codici}, fh, ensure_ascii=False,
                  separators=(",", ":"))
    print("%s — %d caratteri" % (OUT, len(codici)))


if __name__ == "__main__":
    main()
