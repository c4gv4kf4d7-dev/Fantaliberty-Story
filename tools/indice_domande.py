#!/usr/bin/env python3
"""Rigenera docs/indice-domande.md dai dati veri.

    npm run indice

L'indice e' un riflesso di game/domande.json e game/quiz.json: si rigenera, non
si scrive a mano, cosi' non puo' divergere dai dati man mano che la banca cambia.
Serve ad avere sott'occhio gli id stabili (IPHONE.C1, B3, L10...) senza aprire
migliaia di righe di JSON.
"""
import json
import os

RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def leggi(rel):
    with open(os.path.join(RADICE, rel), encoding="utf-8") as f:
        return json.load(f)


def main():
    d = leggi("game/domande.json")
    q = leggi("game/quiz.json")

    r = [
        "# Indice della banca domande",
        "",
        "Generato da `game/domande.json` e `game/quiz.json`. **Non modificare a mano**:",
        "e' un riflesso dei dati, si rigenera con `npm run indice`.",
        "",
        "Gli id sono **stabili**: finiscono in `run.picks` e nelle run gia' salvate.",
        "Rinominarli rompe la corrispondenza con le schedine bloccate.",
        "",
        "## Pronostici [S5]",
        "",
        "| id | categoria | tipo | difficolta' | opzioni | domanda |",
        "|---|---|---|---|---|---|",
    ]
    n_batt = 0
    for c in d["categorie"].values():
        for grp in ("core", "extra"):
            for x in c[grp]:
                n_batt += sum(len(o.get("battute", {})) for o in x["opzioni"])
                r.append("| `%s` | %s | %s | %s | %d | %s |"
                         % (x["id"], c["nome"], grp, x.get("diff", "—"),
                            len(x["opzioni"]), x["q"]))

    r += ["", "## Intermezzi di regia (Susan)", "",
          "Non hanno battute per stile: il personaggio risponde in cuffia, non alla platea.",
          "", "| id | domanda | opzioni |", "|---|---|---|"]
    for x in d["intermezzi"]:
        r.append("| `%s` | %s | %d |" % (x["id"], x["q"], len(x["opzioni"])))
    r.append("")
    r.append("Piu' %d intermezzi di riserva." % len(d["intermezzi_riserva"]))

    r += ["", "## Quiz di Peter [S8]", "",
          "| livello | domande | soglia | 1o tentativo | 2o tentativo | pool |",
          "|---|---|---|---|---|---|"]
    for liv, cfg in q["livelli"].items():
        r.append("| %s | %d | %d/%d | +%sx | +%sx | 2 x %d |"
                 % (cfg["nome"], cfg["domande"], cfg["soglia"], cfg["domande"],
                    cfg["mult1"], cfg["mult2"], len(q["pool"][liv][0])))
    r += ["",
          "Tetto moltiplicatore cumulativo: **%sx**. Timer %ds per domanda "
          "(%ds con il perk dell'Ingegnere)."
          % (q["tetto_mult"], q["timer_s"], q["timer_s_ingegnere"]),
          ""]

    da_verificare = [x["id"] for liv in q["pool"] for p in q["pool"][liv]
                     for x in p if "_verifica" in x]
    if da_verificare:
        r += ["### Da riverificare prima della pubblicazione", "",
              "Domande il cui dato storico non e' stato confermato da fonte diretta:",
              "", ", ".join("`%s`" % i for i in da_verificare), ""]

    n_dom = sum(len(c[g]) for c in d["categorie"].values() for g in ("core", "extra"))
    r += ["---", "",
          "**Totali:** %d domande di pronostico, %d battute, %d domande di quiz."
          % (n_dom, n_batt,
             sum(len(p) for liv in q["pool"] for p in q["pool"][liv])),
          ""]

    fuori = os.path.join(RADICE, "docs/indice-domande.md")
    os.makedirs(os.path.dirname(fuori), exist_ok=True)
    with open(fuori, "w", encoding="utf-8") as f:
        f.write("\n".join(r))
    print("docs/indice-domande.md rigenerato: %d domande, %d battute, %d quiz."
          % (n_dom, n_batt, sum(len(p) for liv in q["pool"] for p in q["pool"][liv])))


if __name__ == "__main__":
    main()
