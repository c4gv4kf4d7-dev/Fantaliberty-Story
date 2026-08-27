"""Pulizia degli sprite: togliere lo sfondo cotto dentro l'immagine e
ammorbidire il contorno. Condiviso fra gli strumenti di tools/.

Sta qui, e non dentro uno dei tre script, perche' serve a tutti e tre e perche'
la pulizia deve avvenire **dentro la conversione**: se fosse solo un passaggio a
parte, la prima riconversione da _sorgenti/ la cancellerebbe — ed e' successo.

Due problemi distinti, che si presentano insieme:

  * **sfondo cotto**: lo sprite e' stato esportato appiattito, con dentro il
    fondo bianco o la scacchiera che l'editor usa per mostrare la trasparenza.
    A schermo si vede il motivo a quadretti addosso al personaggio.
  * **contorno duro**: l'alpha ha solo due valori, 0 o 255. Ogni bordo curvo o
    diagonale diventa una scaletta netta, e si nota di piu' perche' il gioco
    mostra le immagini rimpicciolite.
"""
import numpy as np
from PIL import Image, ImageFilter
from scipy.ndimage import (binary_erosion, binary_fill_holes,
                           distance_transform_edt, label)

# sotto questa percentuale di pixel semitrasparenti il contorno e' "duro"
SOGLIA_DURA = 0.3
# se dopo il taglio resta attaccato piu' di cosi' di sfondo, il taglio e' fallito
SOGLIA_RESIDUO = 8.0


def percentuale_sfumata(alpha):
    """Quanti pixel stanno fra trasparente e opaco: e' la misura del contorno."""
    return float(((alpha > 0) & (alpha < 255)).mean() * 100)


def ha_contorno_duro(alpha):
    return percentuale_sfumata(alpha) < SOGLIA_DURA


def colori_di_sfondo(rgb, campione=6, tolleranza=12):
    """Le tinte che occupano i bordi: una se il fondo e' piatto, due se e' una
    scacchiera. Impararle dai bordi funziona meglio di una soglia fissa, che su
    una scacchiera prenderebbe i quadretti chiari e lascerebbe quelli scuri."""
    bordi = np.concatenate([
        rgb[:campione, :, :].reshape(-1, 3), rgb[-campione:, :, :].reshape(-1, 3),
        rgb[:, :campione, :].reshape(-1, 3), rgb[:, -campione:, :].reshape(-1, 3),
    ])
    colori, conte = np.unique(bordi, axis=0, return_counts=True)
    scelti = []
    for i in np.argsort(-conte):
        c = colori[i].astype(int)
        if conte[i] < len(bordi) * 0.02:
            break                                  # tinta marginale: non e' lo sfondo
        if all(np.abs(c - s).max() > tolleranza for s in scelti):
            scelti.append(c)
        if len(scelti) == 2:
            break
    return scelti


def maschera_soggetto(rgb, tolleranza=14):
    """Separa il soggetto dallo sfondo. Restituisce (maschera, quanto_sfondo, residuo)
    oppure None se non riconosce uno sfondo uniforme sui bordi."""
    tinte = colori_di_sfondo(rgb)
    if not tinte:
        return None

    simile = np.zeros(rgb.shape[:2], bool)
    for t in tinte:
        simile |= (np.abs(rgb - t).max(axis=2) <= tolleranza)

    # Una scacchiera esportata in WEBP non ha due tinte pulite: la compressione le
    # sparpaglia su decine di valori, e i pixel di passaggio fra un quadretto e
    # l'altro non somigliano a nessuna delle due. Quei pixel fanno da muro e
    # spezzano il riempimento. Se le due tinte sono grigie si accetta tutto il
    # grigio neutro compreso fra loro, e il muro cade.
    if len(tinte) == 2:
        neutre = [t for t in tinte if int(t.max() - t.min()) <= 12]
        if len(neutre) == 2:
            lum = rgb.mean(axis=2)
            grigio = (rgb.max(axis=2) - rgb.min(axis=2)) <= 14
            simile |= (grigio
                       & (lum >= min(t.mean() for t in neutre) - tolleranza)
                       & (lum <= max(t.mean() for t in neutre) + tolleranza))

    # solo le zone di sfondo COLLEGATE al bordo: il bianco dentro il disegno
    # (denti, occhi, riflessi) non e' collegato e resta
    lab, _ = label(simile)
    sul_bordo = set(lab[0, :]) | set(lab[-1, :]) | set(lab[:, 0]) | set(lab[:, -1])
    sul_bordo.discard(0)
    if not sul_bordo:
        return None

    sfondo = np.isin(lab, list(sul_bordo))
    soggetto = binary_erosion(binary_fill_holes(~sfondo), iterations=1)
    soggetto = togli_puntini(soggetto)
    quanto = float(sfondo.mean() * 100)

    # Il residuo va misurato con una tolleranza FISSA e larga, non con quella
    # usata per il taglio: altrimenti stringendo la tolleranza si abbassa anche
    # il residuo misurato, e un taglio pessimo sembra ottimo. E' successo con il
    # badge: a tolleranza 6 il residuo diceva 2%, ma meta' scacchiera era ancora
    # li' sotto forma di puntini.
    somiglia_largo = np.zeros(rgb.shape[:2], bool)
    for t in tinte:
        somiglia_largo |= (np.abs(rgb - t).max(axis=2) <= 30)

    # ...ma non basta contare i pixel del soggetto che somigliano allo sfondo: un
    # badge bianco su scacchiera bianca e grigia somiglia allo sfondo quasi tutto,
    # pur essendo tagliato bene. Contano solo i FRAMMENTI SPARSI: lo sfondo
    # sopravvissuto resta come pulviscolo di isolette, il bianco che appartiene al
    # disegno e' una macchia sola e grande.
    residuo = float(area_sparsa(somiglia_largo & soggetto)) / max(soggetto.sum(), 1) * 100
    return soggetto, quanto, residuo


def area_sparsa(maschera, quota=0.01):
    """Pixel che stanno in isolette piccole, ignorando le macchie grandi."""
    lab, n = label(maschera)
    if n == 0:
        return 0
    conte = np.bincount(lab.ravel())
    conte[0] = 0
    if not conte.any():
        return 0
    limite = max(conte.max() * quota, 8)
    return int(conte[conte < limite].sum())


# Un pezzo staccato piu' piccolo di questa frazione dell'immagine e' un residuo
# di sfondo, non un dettaglio del disegno. Soglia bassa apposta: le linee di
# movimento accanto alle mani di Peter sono piccole ma molto piu' grandi di un
# quadretto di scacchiera rimasto indietro.
MIN_PEZZO = 0.0004


def togli_puntini(soggetto):
    """Butta via i frammenti isolati: la scacchiera che sopravvive al taglio
    resta come pulviscolo di puntini, il disegno no."""
    lab, n = label(soggetto)
    if n <= 1:
        return soggetto
    conte = np.bincount(lab.ravel())
    conte[0] = 0
    minimo = max(soggetto.size * MIN_PEZZO, 8)
    tieni = np.flatnonzero(conte >= minimo)
    return np.isin(lab, tieni)


def sbava_colore(rgb, soggetto):
    """Estende il colore dei pixel del soggetto nella zona trasparente.

    Serve *prima* di sfumare l'alpha: sotto i pixel trasparenti resta il colore
    del vecchio sfondo (nel Mac era bianco 252,252,252) e senza questo passaggio
    la sfumatura lo ripesca, lasciando un alone chiaro attorno alla sagoma.
    """
    vicino = distance_transform_edt(~soggetto, return_distances=False, return_indices=True)
    return rgb[vicino[0], vicino[1]]


def sfuma_alpha(alpha, raggio=0.8):
    return np.array(
        Image.fromarray(alpha.astype(np.uint8)).filter(ImageFilter.GaussianBlur(raggio))
    ).astype(np.float32)


def pulisci(im, tolleranza=14, raggio=0.8):
    """Applica quello che serve a questa immagine, e niente di piu'.

    Restituisce (immagine, nota) dove nota descrive cosa e' stato fatto, oppure
    None se non serviva niente. L'immagine non viene mai peggiorata: se il taglio
    lascia attaccato troppo sfondo, si preferisce non toccarla e dirlo.
    """
    a = np.array(im.convert("RGBA")).astype(np.float32)
    rgb, alpha = a[..., :3], a[..., 3]
    note = []

    if (alpha == 255).all():
        esito = maschera_soggetto(rgb.astype(int), tolleranza)
        if esito is None:
            return None, "nessuno sfondo uniforme riconosciuto sui bordi"
        soggetto, quanto, residuo = esito
        if quanto < 2:
            return None, "solo il %.0f%% sarebbe sfondo: sospetto, lasciato com'e'" % quanto
        if residuo > SOGLIA_RESIDUO:
            return None, ("NON RIUSCITO: resterebbe il %.0f%% di sfondo attaccato al "
                          "soggetto, va scontornato a mano" % residuo)
        rgb = sbava_colore(rgb, soggetto)
        alpha = sfuma_alpha((soggetto * 255).astype(np.uint8), raggio)
        note.append("sfondo tolto (%.0f%%)" % quanto)
    elif ha_contorno_duro(alpha):
        soggetto = alpha > 0
        rgb = sbava_colore(rgb, soggetto)
        alpha = sfuma_alpha(alpha, raggio)
        note.append("contorno ammorbidito")

    if not note:
        return None, None                      # gia' a posto: nessuna modifica
    fuori = np.dstack([rgb, alpha]).clip(0, 255).astype(np.uint8)
    return Image.fromarray(fuori, "RGBA"), ", ".join(note)
