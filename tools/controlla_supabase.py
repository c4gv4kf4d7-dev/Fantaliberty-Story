#!/usr/bin/env python3
"""Controlla che la tabella di Supabase accetti davvero la schedina.

Legge i campi che il gioco spedisce (payload() in game/engine.js) e chiede a
Supabase, colonna per colonna, se esiste. Non scrive niente: usa una GET, che la
chiave anon non puo' comunque leggere (RLS), ma che risponde lo stesso "column
... does not exist" quando la colonna manca.

Una colonna mancante non si vede giocando: il gioco non lo dice al giocatore,
mette la schedina in coda e riprova. Sembra tutto a posto e non arriva niente.

  python3 tools/controlla_supabase.py
"""
import json, os, re, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def campi_del_payload():
    """I nomi dei campi come li scrive payload() nel motore."""
    src = open(os.path.join(ROOT, 'game', 'engine.js'), encoding='utf-8').read()
    corpo = src.split('function payload()', 1)[1].split('\n  }', 1)[0]
    corpo = re.sub(r'//[^\n]*', '', corpo)
    corpo = corpo.split('return {', 1)[1]
    # i campi stanno anche piu' d'uno per riga: si prendono le chiavi di primo
    # livello, saltando quello che sta dentro gli oggetti annidati
    campi, prof = [], 0
    for pezzo in re.finditer(r'[{}]|(\w+)\s*:', corpo):
        t = pezzo.group(0)
        if t == '{': prof += 1
        elif t == '}': prof -= 1
        elif prof == 0: campi.append(pezzo.group(1))
    return campi

def esiste(cfg, colonna):
    url = cfg['url'].rstrip('/') + '/rest/v1/' + cfg.get('tabella', 'runs') + '?select=' + colonna
    req = urllib.request.Request(url, headers={
        'apikey': cfg['chiave'], 'Authorization': 'Bearer ' + cfg['chiave']})
    try:
        urllib.request.urlopen(req, timeout=20)
        return True, ''
    except Exception as e:
        testo = e.read().decode() if hasattr(e, 'read') else str(e)
        try:
            return False, json.loads(testo).get('message', testo)
        except Exception:
            return False, testo[:120]

# La classifica della corsa e' una tabella a parte, e a differenza delle
# schedine si deve poter LEGGERE: senza la policy di select la classifica
# risponde una lista vuota e il gioco crede che non ci sia nessuno.
def controlla_classifica(cfg):
    base = cfg['url'].rstrip('/') + '/rest/v1/runner_leaderboard'
    req = urllib.request.Request(base + '?select=player_id,player_name,best_score&limit=1',
        headers={'apikey': cfg['chiave'], 'Authorization': 'Bearer ' + cfg['chiave']})
    try:
        urllib.request.urlopen(req, timeout=20)
        print('  runner_leaderboard  ok (esiste e si legge)')
        return True
    except Exception as e:
        testo = e.read().decode() if hasattr(e, 'read') else str(e)
        try:
            testo = json.loads(testo).get('message', testo)
        except Exception:
            pass
        print('  runner_leaderboard  MANCA  (' + testo[:90] + ')')
        print('    -> la classifica della corsa non funziona. Il blocco SQL sta')
        print('       in fondo a docs/backend.sql.')
        return False


def main():
    cfg = json.load(open(os.path.join(ROOT, 'game', 'backend.json'), encoding='utf-8'))
    if not cfg.get('url') or not cfg.get('chiave'):
        print('game/backend.json non e\' configurato: il gioco terrebbe tutto in coda.')
        return 1
    campi = campi_del_payload()
    print('tabella: %s/rest/v1/%s' % (cfg['url'].rstrip('/'), cfg.get('tabella', 'runs')))
    mancanti = []
    for c in campi:
        ok, msg = esiste(cfg, c)
        print('  %-10s %s' % (c, 'ok' if ok else 'MANCA  (' + msg + ')'))
        if not ok: mancanti.append(c)
    print()
    ok_classifica = controlla_classifica(cfg)
    print()
    if not mancanti and not ok_classifica:
        return 1
    if not mancanti:
        print('Tutte le colonne ci sono: la schedina viene accettata.')
        return 0
    print('%d colonne mancanti. Finche\' mancano, OGNI schedina viene rifiutata con un' % len(mancanti))
    print('400 e resta in coda nel telefono del giocatore, senza che nessuno se ne accorga.')
    print('Da incollare nell\'SQL Editor di Supabase:\n')
    for c in mancanti:
        tipo = {'email': 'text', 'run_id': 'uuid', 'cognome': 'text'}.get(c, 'jsonb')
        print('  alter table public.runs add column if not exists %s %s;' % (c, tipo))
    return 1

if __name__ == '__main__':
    sys.exit(main())
