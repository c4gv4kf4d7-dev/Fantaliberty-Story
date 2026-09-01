#!/usr/bin/env python3
"""Controlla che Supabase accetti davvero la schedina.

Legge i campi che il gioco spedisce (payload() in game/engine.js) e li manda
per davvero alla funzione upsert_run() con la chiave anon — la stessa strada
che usa il gioco (game/engine.js, invia(): POST /rest/v1/rpc/upsert_run).

Non e' piu' una GET colonna per colonna: dal 1 settembre 2026 anon non ha
nessun grant diretto sulla tabella 'runs' (vedi docs/backend.sql), quindi una
GET restituirebbe sempre "permission denied" a prescindere dalle colonne, e
il controllo direbbe sempre "manca tutto" anche a schema giusto. L'unica
interfaccia che anon puo' davvero usare e' la funzione, quindi e' quella che
si controlla: se una colonna manca sul serio, l'errore di Postgres la nomina
per esteso ("column ... does not exist").

Lascia una riga di prova nella tabella (run_id fisso, nome
"_controllo_supabase"): si puo' cancellare a mano, come le altre righe di
collaudo — vedi docs/backend.sql in fondo.

  python3 tools/controlla_supabase.py
"""
import json, os, re, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUN_ID_PROVA = '00000000-0000-4000-8000-000000000000'

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

DUMMY = {
    'run_id': RUN_ID_PROVA, 'nome': '_controllo_supabase', 'cognome': None,
    'genere': 'm', 'store': None, 'reparto': None, 'anni': None, 'device': None,
    'stile': None, 'punti': 0, 'picks': {}, 'flags': {}, 'quiz': {}, 'runner': {},
    'email': None, 'versione': 'controllo_supabase',
}

def prova_upsert(cfg, campi):
    corpo = {c: DUMMY.get(c) for c in campi}
    url = cfg['url'].rstrip('/') + '/rest/v1/rpc/upsert_run'
    # la funzione prende un unico parametro jsonb ('p'), come il motore
    # (game/engine.js, invia()): con un parametro per campo, dentro la
    # funzione un identificatore come 'run_id' risultava ambiguo (poteva
    # essere il parametro o la colonna della tabella), perche' i nomi dei
    # parametri ricalcavano apposta quelli del payload.
    req = urllib.request.Request(url, data=json.dumps({'p': corpo}).encode(), method='POST', headers={
        'apikey': cfg['chiave'], 'Authorization': 'Bearer ' + cfg['chiave'],
        'Content-Type': 'application/json', 'Prefer': 'return=minimal'})
    try:
        urllib.request.urlopen(req, timeout=20)
        return True, ''
    except Exception as e:
        testo = e.read().decode() if hasattr(e, 'read') else str(e)
        try:
            j = json.loads(testo)
            return False, (j.get('message', '') + ' ' + (j.get('hint') or '')).strip()
        except Exception:
            return False, testo[:200]

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
    url_rpc = cfg['url'].rstrip('/') + '/rest/v1/rpc/upsert_run'
    print('funzione: %s' % url_rpc)
    ok, msg = prova_upsert(cfg, campi)
    if ok:
        print('  upsert_run  ok — la schedina di prova e\' stata accettata')
        print('  (riga di prova nella tabella: run_id %s, nome "_controllo_supabase";' % RUN_ID_PROVA)
        print('   si cancella a mano dall\'SQL Editor come le altre righe di collaudo)')
    else:
        print('  upsert_run  RIFIUTATA  (' + msg + ')')
    print()
    ok_classifica = controlla_classifica(cfg)
    print()
    if ok and ok_classifica:
        print('Tutto a posto: la schedina viene accettata.')
        return 0
    if not ok:
        print('La schedina viene rifiutata. Il messaggio sopra dice perche\':')
        print('  - "function ... does not exist" / "PGRST202"  -> la funzione upsert_run')
        print('    non esiste ancora: va incollato il blocco SQL da docs/backend.sql')
        print('    nell\'SQL Editor di Supabase.')
        print('  - "column ... does not exist"                 -> una colonna manca sulla')
        print('    tabella runs: aggiungerla con alter table (vedi docs/backend.sql).')
        print('  - "permission denied" / "42501"                -> il grant di esecuzione ad')
        print('    anon sulla funzione non c\'e\' (grant execute ... to anon, in fondo al')
        print('    blocco SQL).')
    return 1

if __name__ == '__main__':
    sys.exit(main())
