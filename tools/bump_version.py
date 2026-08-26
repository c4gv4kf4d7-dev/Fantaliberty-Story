#!/usr/bin/env python3
"""Alza il numero di versione degli asset in index.html (cache busting).

    python3 tools/bump_version.py

I browser tengono in cache engine.css / engine.js / story.json anche dopo un
ricaricamento. Cambiando la query (?v=12 -> ?v=13) sono costretti a riscaricarli,
cosi' una modifica pubblicata si vede subito senza svuotare la cache a mano.
"""
import re
import sys

P = 'index.html'
html = open(P, encoding='utf-8').read()

vers = [int(v) for v in re.findall(r'\?v=(\d+)', html)]
nuova = (max(vers) + 1) if vers else 1
html = re.sub(r'\?v=\d+', '?v=%d' % nuova, html)

open(P, 'w', encoding='utf-8').write(html)
print('versione asset -> v=%d' % nuova)
