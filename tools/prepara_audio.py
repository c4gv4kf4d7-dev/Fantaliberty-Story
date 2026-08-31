#!/usr/bin/env python3
"""Prepara i file audio per il gioco: li alleggerisce, ne pareggia il volume e
li rinomina in modo che stiano in un indirizzo web.

I file consegnati sono WAV e MP3 pesanti (42 MB in tutto, uno da 7,6 MB per
trenta secondi): su un telefono in 4G la musica arriverebbe a scena finita.
Qui diventano MP3 mono, leggeri, tutti alla stessa altezza di volume.

  python3 tools/prepara_audio.py            # converte e sostituisce
  python3 tools/prepara_audio.py --prova    # dice solo cosa farebbe

Perche' mono: e' musica di sottofondo su un altoparlante di telefono, lo stereo
non si sente e pesa il doppio. Perche' loudnorm: cosi' un effetto non sfonda le
casse mentre un altro non si sente — il volume lo decide il giocatore con il
selettore, non il file.
"""
import os, re, subprocess, sys, json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
try:
    import imageio_ffmpeg
    FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
except ImportError:
    FFMPEG = 'ffmpeg'

# Nome consegnato -> nome nel gioco. I nomi nuovi non hanno spazi, accenti o
# due punti: finiscono dentro un indirizzo, e un indirizzo con uno spazio
# dentro e' una fonte di guai su meta' dei server.
MUSICA = {
    'musica entrata lobby.mp3':    'mus_lobby.mp3',
    'camerino.mp3':                'mus_camerino.mp3',
    'musica inizio atto 1.mp3':    'mus_atto1.mp3',
    'macroargomenti.mp3':          'mus_macroargomenti.mp3',
    'previsioni.mp3':              'mus_previsioni.mp3',
    ' musica quiz .wav':           'mus_quiz.mp3',
    'lobby ritorno endgame.mp3':   'mus_lobby_finale.mp3',
    "l'aggancio.mp3":              'mus_aggancio.mp3',
}
EFFETTI = {
    '8 bit studios.wav':                       'sfx_logo.mp3',
    'typing tastiera iniziale.wav':            'sfx_typing_intro.mp3',
    'sfx_keyboard_typing.wav':                 'sfx_typing.mp3',
    'sfx_keyboard_typing2.wav':                'sfx_typing2.mp3',
    'sfx_keyboard_press enter.wav':            'sfx_enter.mp3',
    'sfx-ui-select.mp3':                       'sfx_scelta.mp3',
    'sfx-ui-select2.mp3':                      'sfx_scelta2.mp3',
    'sfx-ui-tapmp3.mp3':                       'sfx_tap.mp3',
    'sfx-ui-open.wav':                         'sfx_apri.mp3',
    'chiudi:annulla.mp3':                      'sfx_chiudi.mp3',
    'sfx-scene-transition.mp3':                'sfx_transizione.mp3',
    'sfx-achievement.mp3':                     'sfx_traguardo.mp3',
    'sfx-error.mp3':                           'sfx_errore.mp3',
    'notifica iphone.mp3':                     'sfx_notifica.mp3',
    'risposta esatta quiz.wav':                'sfx_quiz_giusta.mp3',
    ' fallimento peter base,avanzato,leggenda.wav': 'sfx_quiz_fallito.mp3',
    'livello completato.wav':                  'sfx_quiz_livello.mp3',
    'previsioni inviate .wav':                 'sfx_previsioni_inviate.mp3',
    'ritorno in lobby.wav':                    'sfx_ritorno_lobby.mp3',
    'persone dentro lobby.mp3':                'sfx_folla_lobby.mp3',
    'sfx_applause1_inizio previsioni.mp3':     'sfx_applausi1.mp3',
    'sfx_applause2.mp3':                       'sfx_applausi2.mp3',
    'sfx_applause3.mp3':                       'sfx_applausi3.mp3',
    'sfx_applause4.mp3':                       'sfx_applausi4.mp3',
    'ES_Crowds, Cheering, Applause, Large Audience, Short 07 - Epidemic Sound.mp3':
                                               'sfx_applausi5.mp3',
    'sfx_applause_long.mp3':                   'sfx_applausi_lungo.mp3',
    'sfx_applause_long2.mp3':                  'sfx_applausi_lungo2.mp3',
    'sfx_disappointed.mp3':                    'sfx_delusione.mp3',
}

# La musica puo' permettersi meno banda: e' sotto la voce e sotto gli effetti.
# Gli effetti stanno in primo piano ma durano un secondo, quindi il bitrate
# alto costa pochi kilobyte.
PROFILI = {
    'music': {'bitrate': '80k', 'rate': '44100', 'lufs': -20},
    'sfx':   {'bitrate': '96k', 'rate': '44100', 'lufs': -16},
}

def converti(sorgente, destinazione, profilo, prova=False):
    p = PROFILI[profilo]
    filtri = ['loudnorm=I=%d:TP=-1.5:LRA=11' % p['lufs']]
    if profilo == 'sfx':
        # via il silenzio in testa: un decimo di secondo di vuoto e' un decimo
        # di secondo di ritardo fra il tocco e il suono
        filtri.insert(0, 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.02')
    cmd = [FFMPEG, '-y', '-hide_banner', '-loglevel', 'error', '-i', sorgente,
           '-vn',                      # via la copertina: un mp3 con dentro un
                                       # disegno pesa il triplo dell'audio
           '-ac', '1', '-ar', p['rate'], '-b:a', p['bitrate'],
           '-af', ','.join(filtri), '-map_metadata', '-1', destinazione]
    if prova:
        print('   ' + ' '.join(cmd[-8:]))
        return
    r = subprocess.run(cmd, capture_output=True)
    if r.returncode == 0: return
    # su qualche file ffmpeg inciampa sul taglio del silenzio: si ritenta senza,
    # meglio un decimo di secondo di vuoto che un effetto che non esiste
    cmd[cmd.index('-af') + 1] = 'loudnorm=I=%d:TP=-1.5:LRA=11' % p['lufs']
    subprocess.run(cmd, check=True)
    print('   (senza taglio del silenzio)', end=' ')

def kb(path): return os.path.getsize(path) / 1024

def main():
    prova = '--prova' in sys.argv
    totale_prima = totale_dopo = 0
    for cartella, mappa, profilo in (('music', MUSICA, 'music'), ('sfx', EFFETTI, 'sfx')):
        base = os.path.join(ROOT, 'assets', cartella)
        print('\n== %s ==' % cartella)
        presenti = set(os.listdir(base))
        for vecchio, nuovo in mappa.items():
            src = os.path.join(base, vecchio)
            if not os.path.exists(src):
                # gia' convertito in un giro precedente: non e' un errore
                if nuovo not in presenti: print('   manca: %s' % vecchio)
                continue
            dst = os.path.join(base, nuovo)
            prima = kb(src)
            if not prova:
                tmp = dst + '.tmp.mp3'
                converti(src, tmp, profilo)
                os.replace(tmp, dst)
                if os.path.abspath(src) != os.path.abspath(dst): os.remove(src)
                dopo = kb(dst)
            else:
                converti(src, dst, profilo, prova=True); dopo = 0
            totale_prima += prima; totale_dopo += dopo
            print('   %-28s %7.0f KB -> %6.0f KB   %s' % (vecchio[:28], prima, dopo, nuovo))
        rimasti = [f for f in sorted(os.listdir(base))
                   if f not in mappa.values() and not f.startswith('.') and f != 'README.md']
        if rimasti: print('   NON convertiti (nome sconosciuto): %s' % ', '.join(rimasti))
    print('\ntotale: %.1f MB -> %.1f MB' % (totale_prima / 1024, totale_dopo / 1024))

if __name__ == '__main__':
    main()
