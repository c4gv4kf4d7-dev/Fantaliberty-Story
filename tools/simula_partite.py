#!/usr/bin/env python3
"""Simulazione di una classifica: N giocatori diversi giocano previsioni e quiz.

Serve a vedere COME SI DISTRIBUISCONO i punteggi finali, non a testare il
codice: riproduce le formule di docs/script-master.md leggendo i valori veri da
game/domande.json, game/quiz.json e game/story.json.

  python3 tools/simula_partite.py [--giocatori 30] [--seed 7] [--dettaglio]
"""
import json, random, argparse, statistics, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def carica(n): return json.load(open(os.path.join(ROOT, 'game', n), encoding='utf-8'))

BANCA, QUIZ, STORY = carica('domande.json'), carica('quiz.json'), carica('story.json')
CATEGORIE = BANCA['categorie']
STILI = list(STORY['stili'].keys())

# Quanti micro-eventi generali entrano nel sacchetto di una partita (piu'
# l'evento personale dello stile, che sta in testa). Sta anche in engine.js.
MAX_MICRO_EVENTI = 2
TUTTI_EVENTI = {e['id']: e for e in BANCA['micro_eventi']}
TUTTI_EVENTI.update({e['id']: e for e in BANCA['eventi_personali'].values()})

# Come sceglie un giocatore fra consenso / plausibile / controcorrente.
PROFILI = {
    'gregario':    {'consenso': 6, 'plausibile': 3, 'controcorrente': 1},
    'equilibrato': {'consenso': 3, 'plausibile': 4, 'controcorrente': 3},
    'azzardo':     {'consenso': 1, 'plausibile': 3, 'controcorrente': 6},
    'casuale':     {'consenso': 1, 'plausibile': 1, 'controcorrente': 1},
}

def scegli(opzioni, pesi_tipo, rnd):
    pesi = [pesi_tipo.get(o.get('tipo', 'plausibile'), 1) for o in opzioni]
    return rnd.choices(range(len(opzioni)), weights=pesi)[0]

def punti_core(d, i):
    o = d['opzioni'][i]
    return o.get('pt', d['diff'] + {'consenso': 0, 'plausibile': 1, 'controcorrente': 1}
                 .get(o.get('tipo'), 0))

def gioca_previsioni(g, rnd):
    """Un giro di S5: core di ogni categoria, 3 facoltative, gli intermezzi e i
    micro-eventi. Torna le risposte, non ancora i punti (il pool serve dopo)."""
    pesi = PROFILI[g['profilo']]
    risposte = []          # (categoria, id_domanda, indice_opzione, punti_base)
    n_domande = 0
    for cat, c in CATEGORIE.items():
        for d in c['core']:
            i = scegli(d['opzioni'], pesi, rnd)
            risposte.append((cat, d['id'], i, punti_core(d, i)))
            n_domande += 1
        pescate = rnd.sample(c['extra'], c.get('n_extra_da_pescare', 3))
        for d in pescate:
            i = scegli(d['opzioni'], pesi, rnd)
            risposte.append((cat, d['id'], i, d['opzioni'][i].get('val', 0)))
            n_domande += 1

    # intermezzi: uno all'apertura del keynote + uno per macroargomento,
    # pescati a caso dal pool unico dei sette
    n_int = 1 + len(CATEGORIE)
    pool_int = rnd.sample(BANCA['intermezzi'], n_int)
    for d in pool_int:
        i = rnd.randrange(len(d['opzioni']))
        risposte.append((None, d['id'], i, d['opzioni'][i].get('val', 0)))

    # micro-eventi: sacchetto corto e senza rimessa (due generali a caso piu'
    # l'evento personale dello stile, in testa). Il punteggio di ogni risposta
    # e' quello scritto in banca, non un abbinamento a caso.
    sacchetto = [e['id'] for e in BANCA['micro_eventi']]
    rnd.shuffle(sacchetto)
    sacchetto = sacchetto[:MAX_MICRO_EVENTI]
    mio = BANCA['eventi_personali'].get(g['stile'])
    if mio: sacchetto.insert(0, mio['id'])
    prob = STORY.get('regia', {}).get('probabilitaEvento', 0.3)
    micro = 0
    for _ in range(n_domande):
        if sacchetto and rnd.random() < prob:
            ev = TUTTI_EVENTI[sacchetto.pop(0)]
            i = rnd.randrange(len(ev['opzioni']))
            e = ev['opzioni'][i]['editoriale']
            risposte.append((None, 'EV', i, 1 if e > 0 else -1 if e < 0 else 0))
            micro += 1
    return risposte, n_int, micro

def gioca_quiz(g, rnd):
    """S8: tre livelli, due tentativi, i perk dei quattro stili."""
    perk = STORY['stili'][g['stile']]['perk']['id']
    ordine = ['base', 'avanzato', 'leggenda']
    banca, esiti = 0.0, {}
    for liv in ordine:
        cfg = QUIZ['livelli'][liv]
        if perk != 'tutto_sbloccato' and liv != 'base' and not esiti.get(ordine[ordine.index(liv) - 1], {}).get('passato'):
            esiti[liv] = {'passato': False, 'tentativi': 0}
            continue
        p = g['sapere']
        if perk == 'cinquanta': p += 0.10      # 50/50: una domanda per tentativo e' regalata
        if perk == 'tempo':     p += 0.05      # +3 secondi: meno tempo scaduto
        p = min(p, 0.97)
        tentativi, passato, vinto, seconda = 0, False, 0.0, False
        while tentativi < 2 and not passato:
            tentativi += 1
            giuste = sum(1 for _ in range(cfg['domande']) if rnd.random() < p)
            if giuste >= cfg['soglia']:
                passato = True
                vinto = cfg['mult1'] if tentativi == 1 else cfg['mult2']
                banca += vinto
            elif perk == 'seconda_chance' and not seconda:
                seconda = True; tentativi -= 1
        esiti[liv] = {'passato': passato, 'tentativi': tentativi, 'vinto': vinto}
        if not passato: break
    return round(min(banca, QUIZ['tetto_mult']), 2), esiti

def distribuisci(banca, g, rnd):
    """Come il giocatore spalma la banca sui tre macroargomenti (passo 0.05)."""
    cats = list(CATEGORIE.keys())
    quote = {c: 0.0 for c in cats}
    passi = int(round(banca / 0.05))
    if g['distribuzione'] == 'tutto_su_una':
        quote[rnd.choice(cats)] = round(passi * 0.05, 2)
    elif g['distribuzione'] == 'sparso':
        for _ in range(passi): quote[rnd.choice(cats)] = round(quote[rnd.choice(cats)], 2)
        # a caso ma passo per passo
        quote = {c: 0.0 for c in cats}
        for _ in range(passi):
            c = rnd.choice(cats); quote[c] = round(quote[c] + 0.05, 2)
    else:  # equa
        for k in range(passi):
            c = cats[k % len(cats)]; quote[c] = round(quote[c] + 0.05, 2)
    return quote

# I due bonus personali: piccoli, servono solo a sciogliere i quasi pari merito.
# Si calcolano da dati che il giocatore ha gia' dato in [S0], non da domande nuove.
# le chiavi sono i codici che finiscono davvero nel database ('0'..'3'), non le
# etichette che il giocatore legge
ANNI_BONUS = {'0': 1.0, '1': 0.5, '2': 0.25, '3': 0.0}
GEN_BONUS = {'17': 0.0, 'Air': 0.0, '16': 0.25, '15': 0.5, '14': 0.75, '13': 0.75}

def bonus_personali(anni, device):
    rookie = ANNI_BONUS.get(anni, 0.0)
    gen = str(device).split()[0]
    dev = GEN_BONUS.get(gen, 1.0)          # 12, 11, X e precedenti: il massimo
    return round(min(rookie + dev, 2.0), 2)

def moltiplicatore_pool(quota):
    if quota < 0.10: return 1.5
    if quota <= 0.30: return 1.25
    return 1.0

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--giocatori', type=int, default=30)
    ap.add_argument('--seed', type=int, default=7)
    ap.add_argument('--dettaglio', action='store_true')
    a = ap.parse_args()
    rnd = random.Random(a.seed)

    profili = list(PROFILI.keys())
    giocatori = []
    for n in range(a.giocatori):
        giocatori.append({
            'nome': 'P%02d' % (n + 1),
            'profilo': profili[n % len(profili)],
            'stile': STILI[n % len(STILI)],
            'sapere': round(rnd.uniform(0.35, 0.9), 2),   # quanto conosce la storia Apple
            'distribuzione': ['tutto_su_una', 'equa', 'sparso'][n % 3],
            'anni': list(ANNI_BONUS)[n % 4],
            'device': ['17 Pro', '16', '15 Plus', '13 mini', '11', 'XR'][n % 6],
        })

    # 1) tutti giocano le previsioni
    for g in giocatori:
        g['risposte'], g['n_int'], g['micro'] = gioca_previsioni(g, rnd)
        g['base'] = sum(p for _, _, _, p in g['risposte'])

    # 2) il pool: quanti hanno scelto la stessa opzione
    conte = {}
    for g in giocatori:
        for cat, qid, i, _ in g['risposte']:
            if qid == 'EV': continue
            conte.setdefault(qid, {}).setdefault(i, 0)
            conte[qid][i] += 1

    # 3) quiz e moltiplicatori
    for g in giocatori:
        g['banca'], g['quiz'] = gioca_quiz(g, rnd)
        g['quote'] = distribuisci(g['banca'], g, rnd)

    # 4) punteggio finale
    for g in giocatori:
        tot, capped = 0.0, 0
        for cat, qid, i, base in g['risposte']:
            if qid == 'EV':
                tot += base                      # i micro-eventi non passano da pool o quiz
                continue
            quota = conte[qid][i] / len(giocatori)
            mq = 1 + (g['quote'].get(cat, 0.0) if cat else 0.0)
            v = base * moltiplicatore_pool(quota) * mq
            if v > 10: capped += 1
            tot += min(10, v)
        bonus = len(CATEGORIE)                   # tutte le facoltative: il flusso le impone
        g['personali'] = bonus_personali(g['anni'], g['device'])
        bonus += g['personali']
        g['bonus'], g['capped'] = round(bonus, 2), capped
        g['finale'] = round(tot + bonus, 2)

    ordinati = sorted(giocatori, key=lambda g: -g['finale'])
    print('=' * 74)
    print('%-5s %-12s %-11s %6s %6s %6s %5s %8s' % ('', 'profilo', 'stile', 'base', 'quiz', 'bonus', 'cap', 'FINALE'))
    print('=' * 74)
    for g in ordinati:
        print('%-5s %-12s %-11s %6d %6s %6d %5d %8.2f' %
              (g['nome'], g['profilo'], g['stile'], g['base'],
               '+%.2f' % g['banca'], g['bonus'], g['capped'], g['finale']))

    fin = [g['finale'] for g in giocatori]
    basi = [g['base'] for g in giocatori]
    print('=' * 74)
    def riga(nome, v):
        print('%-22s min %7.2f  max %7.2f  mediana %7.2f  scarto %6.2f  spread %5.1f%%'
              % (nome, min(v), max(v), statistics.median(v), statistics.pstdev(v),
                 100 * (max(v) - min(v)) / max(statistics.median(v), 1)))
    riga('punteggio base', basi)
    riga('punteggio finale', fin)
    print('primo - secondo: %.2f punti' % (ordinati[0]['finale'] - ordinati[1]['finale']))
    arrot = [round(f) for f in fin]
    print('pari merito (al punto intero): %d su %d' % (len(arrot) - len(set(arrot)), len(fin)))
    print('domande tagliate dal tetto di 10: %d in totale (%.1f a testa)'
          % (sum(g['capped'] for g in giocatori), sum(g['capped'] for g in giocatori) / len(giocatori)))
    print('banca quiz: %s' % ', '.join('%.2f x%d' % (b, [g['banca'] for g in giocatori].count(b))
          for b in sorted(set(g['banca'] for g in giocatori))))
    print('intermezzi giocati per partita: %d' % giocatori[0]['n_int'])
    pers = [g['personali'] for g in giocatori]
    print('bonus personali: da %.2f a %.2f (mediana %.2f)' % (min(pers), max(pers), statistics.median(pers)))
    print('micro-eventi per partita: min %d, max %d' % (min(g['micro'] for g in giocatori),
                                                        max(g['micro'] for g in giocatori)))
    for nome in PROFILI:
        v = [g['finale'] for g in giocatori if g['profilo'] == nome]
        print('  profilo %-12s mediana %7.2f' % (nome, statistics.median(v)))

if __name__ == '__main__':
    main()
