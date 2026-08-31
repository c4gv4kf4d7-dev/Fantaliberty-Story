/* Smoke test headless del motore VN (jsdom, nessun browser).
   Verifica: struttura di story.json, flusso scene -> input -> scelte -> variabili,
   interpolazione testo ({NOME}, {g:...}, {label:...}) e terminale del prop.

   npm install && npm test
*/
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let JSDOM;
try {
  ({ JSDOM } = await import('jsdom'));
} catch {
  console.error('jsdom non installato: esegui `npm install` prima di `npm test`.');
  process.exit(1);
}

const story = JSON.parse(fs.readFileSync(path.join(ROOT, 'game/story.json'), 'utf8'));
// La banca dei pronostici e' un file a parte, ma story.json ci fa riferimento
// (le categorie della griglia, gli id delle domande): serve gia' qui.
const banca = JSON.parse(fs.readFileSync(path.join(ROOT, 'game/domande.json'), 'utf8'));
// il quiz di Peter (S8) sta in un terzo file: le scene ci fanno riferimento
const quiz = JSON.parse(fs.readFileSync(path.join(ROOT, 'game/quiz.json'), 'utf8'));

/* ---------- 1. validazione dello script ---------- */
const todoAssets = new Set();

// risolve un personaggio: cast + posa + espressione (file separati)
function partOf(who, kind, id) {
  const c = story.cast?.[who];
  return c && id ? c[kind]?.[id] : undefined;
}
const KNOWN = new Set(['logo', 'boot', 'title', 'say', 'choice', 'input', 'list', 'badge', 'hub', 'carosello', 'griglia', 'domande', 'bivio', 'intermezzo', 'recap', 'email', 'countdown', 'quizhub', 'quizlivello', 'quizmult', 'show', 'hide', 'io', 'prop', 'bg', 'react', 'fx', 'carrellata', 'sipario', 'nero', 'luce', 'wait', 'set', 'goto', 'end']);
assert.ok(story.scenes[story.meta.start], 'meta.start punta a una scena esistente');

// Tutti i valori che una variabile puo' assumere, raccolti da chi la scrive.
// Serve a espandere le pose che dipendono da una scelta ("commento_{stile}").
function valoriDi(nome) {
  const fuori = new Set();
  for (const sc of Object.values(story.scenes)) {
    for (const st of sc.steps || []) {
      if (st.var !== nome) continue;
      if (st.t === 'carosello') Object.keys(story[st.da || 'stili'] || {}).forEach((k) => fuori.add(k));
      if (st.t === 'griglia') Object.keys(story[st.da || 'argomenti'] || {}).forEach((k) => fuori.add(k));
      for (const o of st.options || []) fuori.add(String(o.value));
      for (const g of st.gruppi || []) for (const o of g.opzioni || []) fuori.add(String(o.value));
    }
  }
  return [...fuori];
}

// "commento_{stile}" -> ["commento_hawaiano", "commento_showman", ...]
function espandi(s) {
  if (!s) return [];
  const m = String(s).match(/\{(\w+)\}/);
  if (!m) return [s];
  const valori = valoriDi(m[1]);
  assert.ok(valori.length, `"${s}" dipende da "${m[1]}", ma nessuno step scrive quella variabile`);
  return valori.flatMap((v) => espandi(String(s).replace(m[0], v)));
}

for (const [id, sc] of Object.entries(story.scenes)) {
  assert.ok(Array.isArray(sc.steps) && sc.steps.length, `scena ${id}: steps non vuoti`);
  if (sc.next) assert.ok(story.scenes[sc.next], `scena ${id}: next "${sc.next}" esiste`);
  if (sc.bg) assert.ok(story.assets.bg[sc.bg], `scena ${id}: bg "${sc.bg}" dichiarato`);
  for (const st of sc.steps) {
    assert.ok(KNOWN.has(st.t), `scena ${id}: step sconosciuto "${st.t}"`);
    if (st.t === 'show') {
      const c = story.cast?.[st.who];
      assert.ok(c, `scena ${id}: personaggio "${st.who}" non e' nel cast`);
      // La posa puo' contenere una variabile ("commento_{stile}"): va controllata
      // per ogni valore che quella variabile puo' prendere, non come stringa
      // letterale — un solo valore senza sprite lascerebbe la scena senza
      // personaggio, e solo per quel percorso.
      for (const body of espandi(st.body || c.defaultBody)) {
        assert.ok(c.bodies?.[body], `scena ${id}: posa "${body}" non dichiarata per ${st.who}`);
      }
      for (const head of espandi(st.head)) {
        assert.ok(c.heads?.[head], `scena ${id}: espressione "${head}" non dichiarata per ${st.who}`);
      }
    }
    if (st.t === 'react' && st.level === 'pose') assert.ok(st.body, `scena ${id}: react pose senza body`);
    if (st.t === 'react' && st.level === 'expr') assert.ok(st.head, `scena ${id}: react expr senza head`);
    // come per le pose, l'id di un prop puo' dipendere da una variabile
    if (st.t === 'prop' && st.id) {
      for (const p of espandi(st.id)) {
        assert.ok(story.assets.props[p], `scena ${id}: prop "${p}" dichiarato`);
      }
    }
    // Un id di fondale non dichiarato non da' nessun errore: setBg() mette una
    // src vuota e la scena resta con il fondale di prima. Successo con
    // backstage_corridoio, che esisteva su disco ma non in assets.bg.
    if (st.t === 'bg' && st.id) assert.ok(story.assets.bg[st.id], `scena ${id}: bg "${st.id}" non dichiarato`);
    if (st.t === 'goto') assert.ok(story.scenes[st.scene], `scena ${id}: goto "${st.scene}" esiste`);
    if (st.t === 'choice') assert.ok(st.options?.length, `scena ${id}: choice senza opzioni`);
    if (st.t === 'list') {
      const opz = (st.gruppi || []).flatMap((g) => g.opzioni || []).concat(st.options || []);
      assert.ok(opz.length, `scena ${id}: list senza opzioni`);
      assert.ok(st.var, `scena ${id}: list senza variabile in cui salvare`);
    }
    if (st.t === 'badge') {
      assert.ok(st.prop || st.img, `scena ${id}: badge senza immagine`);
      if (st.prop) assert.ok(story.assets.props[st.prop], `scena ${id}: prop "${st.prop}" dichiarato`);
    }
    if (st.t === 'title') {
      // un cartello ha "lines", i titoli di coda "blocchi": uno dei due, non zero
      assert.ok(st.lines?.length || st.blocchi?.length, `scena ${id}: title senza righe`);
      for (const b of st.blocchi || []) {
        assert.ok(b.righe?.length, `scena ${id}: blocco dei titoli di coda vuoto`);
        for (const r of b.righe) assert.ok((typeof r === 'string' ? r : r.text)?.length,
          `scena ${id}: riga dei titoli di coda vuota`);
      }
    }
    // battuta che cambia con una variabile: o copre tutti i valori, o ha "*".
    // Senza, per un percorso il box resterebbe vuoto.
    if (st.by && typeof st.text === 'object' && !st.text['*']) {
      for (const v of valoriDi(st.by)) {
        assert.ok(st.text[v] != null,
          `scena ${id}: battuta per "${st.by}" senza il caso "${v}" e senza ripiego "*"`);
      }
    }
    // la figura del giocatore: la posa deve esistere per OGNI stile, altrimenti
    // chi ha scelto quello sbagliato resta senza figura in scena
    if (st.t === 'io' && !st.hide) {
      const posa = st.posa || 'idle_palco';
      for (const [k, s2] of Object.entries(story.stili || {})) {
        // le chiavi con l'underscore sono note di lavorazione, non stili
        if (k.startsWith('_')) continue;
        const f = s2.pose?.[posa];
        assert.ok(f, `scena ${id}: lo stile "${k}" non ha la posa "${posa}"`);
        assert.ok(fs.existsSync(path.join(ROOT, (story.meta.assetBase || '') + f)),
          `scena ${id}: la posa "${f}" non esiste su disco`);
      }
    }
    if (st.t === 'hub') controllaHub(id, st);
    if (st.t === 'griglia') {
      const arg = story[st.da || 'argomenti'];
      assert.ok(arg && Object.keys(arg).length, `scena ${id}: griglia su "${st.da}", che non esiste`);
      assert.ok(story.scenes[st.goto], `scena ${id}: la griglia porta a "${st.goto}", che non esiste`);
      for (const [k, a] of Object.entries(arg)) {
        assert.ok(a.nome, `scena ${id}: macroargomento "${k}" senza nome`);
        assert.ok(banca.categorie[k], `scena ${id}: "${k}" non e' una categoria della banca domande`);
        if (a.slide) assert.ok(story.assets.props[a.slide], `scena ${id}: slide "${a.slide}" non dichiarata`);
      }
    }
    if (st.t === 'domande') {
      assert.ok(['core', 'extra'].includes(st.set || 'core'),
        `scena ${id}: domande set "${st.set}" - solo "core" o "extra"`);
    }
    if (st.t === 'bivio') assert.ok(st.text, `scena ${id}: bivio senza domanda`);
    if (st.t === 'countdown') {
      assert.ok(st.azioni?.length, `scena ${id}: countdown senza vie d'uscita`);
      for (const a of st.azioni) {
        assert.ok(a.goto || a.card || a.corsa, `scena ${id}: azione "${a.label}" non fa niente`);
        if (a.goto) assert.ok(story.scenes[a.goto], `scena ${id}: countdown verso "${a.goto}", che non esiste`);
      }
      // senza una data il countdown non conta niente
      assert.ok(story.meta.keynote && !isNaN(Date.parse(story.meta.keynote)),
        'meta.keynote deve essere una data valida: e\' quella verso cui conta il countdown');
    }
    if (st.t === 'recap') {
      assert.ok(story[st.da || 'argomenti'], `scena ${id}: recap su "${st.da}", che non esiste`);
      assert.ok(st.lock?.text, `scena ${id}: il blocco e' irreversibile, serve una conferma`);
      if (st.goto) assert.ok(story.scenes[st.goto], `scena ${id}: recap verso "${st.goto}", che non esiste`);
    }
    if (st.t === 'carosello') controllaCarosello(id, st);
    if (st.t === 'sipario') {
      for (const k of ['davanti', 'dietro']) {
        if (st[k]) assert.ok(story.assets.bg[st[k]], `scena ${id}: sipario, "${k}" -> "${st[k]}" non dichiarato`);
      }
      assert.ok(st.dietro, `scena ${id}: sipario senza "dietro" - si apre sul nulla`);
    }
    if (st.t === 'carrellata') {
      const cfg = st.id ? story.carrellate?.[st.id] : st;
      assert.ok(cfg, `scena ${id}: carrellata "${st.id}" non definita in story.carrellate`);
      assert.ok(cfg.shots?.length >= 2,
        `scena ${id}: carrellata "${st.id}" con meno di due inquadrature - e' uno stacco, non una carrellata`);
      for (const s of cfg.shots) {
        assert.ok(s.img, `scena ${id}: inquadratura di "${st.id}" senza immagine`);
        assert.ok(fs.existsSync(path.join(ROOT, (story.meta.assetBase || '') + s.img)),
          `scena ${id}: inquadratura "${s.img}" non esiste su disco`);
        // La camera va sempre avanti: se un'inquadratura si rimpicciolisse,
        // a meta' discesa si tornerebbe indietro.
        assert.ok((s.a != null ? s.a : 1.3) > (s.da != null ? s.da : 1),
          `scena ${id}: l'inquadratura "${s.img}" si stringe invece di avvicinarsi`);
      }
      const ms = st.ms || cfg.ms || 2800;
      assert.ok((cfg.dissolvenza || 700) < ms,
        `scena ${id}: la dissolvenza di "${st.id}" dura piu' della carrellata intera`);
    }
  }
}

/* Un hub sbagliato non fa rumore: il motore salta le zone che non sa risolvere e
   il giocatore resta chiuso in una lobby senza uscita. Qui si controlla che ogni
   zona abbia il suo fondale, il suo personaggio e almeno una via d'uscita. */
function controllaHub(id, st) {
  const zones = st.zones || [];
  assert.ok(zones.length, `scena ${id}: hub senza zone`);
  const visti = new Set();
  let usciteTotali = 0;
  for (const z of zones) {
    assert.ok(z.id, `scena ${id}: zona senza id`);
    assert.ok(!visti.has(z.id), `scena ${id}: due zone con id "${z.id}"`);
    visti.add(z.id);
    assert.ok(story.assets.bg[z.bg], `scena ${id}, zona ${z.id}: bg "${z.bg}" non dichiarato`);
    if (z.dice) assert.ok(story.cast?.[z.dice], `scena ${id}, zona ${z.id}: "dice" punta a "${z.dice}", non nel cast`);
    if (z.who) {
      const c = story.cast?.[z.who];
      assert.ok(c, `scena ${id}, zona ${z.id}: personaggio "${z.who}" non e' nel cast`);
      const body = z.body || c.defaultBody;
      assert.ok(c.bodies?.[body], `scena ${id}, zona ${z.id}: posa "${body}" non dichiarata per ${z.who}`);
    }
    for (const h of z.hotspots || []) {
      assert.ok(h.goto || h.say || h.set || h.apre || h.quadro,
        `scena ${id}, zona ${z.id}: hotspot "${h.label}" non fa niente`);
      // "apre" mostra un pannello da leggere sopra la lobby: dev'esserci
      if (h.apre) assert.ok(story[h.apre],
        `scena ${id}: hotspot apre "${h.apre}", che non e' un blocco di story.json`);
      // "quadro" apre un'immagine sola (i vincitori della Hall of Fame): idem,
      // dev'essere un fondale dichiarato, altrimenti si apre un riquadro vuoto
      if (h.quadro) assert.ok(story.assets.bg[h.quadro],
        `scena ${id}: hotspot quadro "${h.quadro}" non dichiarato in assets.bg`);
      if (h.goto) { assert.ok(story.scenes[h.goto], `scena ${id}: hotspot verso "${h.goto}" inesistente`); usciteTotali++; }
      if (h.richiede) assert.equal(h.richiede, 'swipe',
        `scena ${id}: "richiede" accetta solo "swipe", non "${h.richiede}"`);
      if (h.richiede) assert.ok(h.bloccato, `scena ${id}: hotspot bloccato senza battuta di rifiuto`);
    }
  }
  if (st.start) assert.ok(visti.has(st.start), `scena ${id}: hub start "${st.start}" non e' una zona`);
  if (st.tutorial?.who) {
    const c = story.cast?.[st.tutorial.who];
    assert.ok(c?.bodies?.[st.tutorial.body], `scena ${id}: posa tutorial "${st.tutorial.body}" non dichiarata`);
  }
  // un hub e' bloccante: senza almeno un'uscita il gioco finisce li'
  assert.ok(usciteTotali > 0, `scena ${id}: hub senza nessuna uscita`);
  // le zone condizionate devono coprire tutti i casi: se la zona 4 esistesse solo
  // con locked=true, prima del lock la lobby ne mostrerebbe tre e i pallini
  // sarebbero tre, non quattro
  const senzaCondizione = zones.filter((z) => !z.when).length;
  assert.ok(senzaCondizione >= 1, `scena ${id}: hub con tutte le zone condizionate`);
}

/* Il carosello pesca le opzioni da un blocco di story.json, non dallo step: se
   quel blocco non c'e' o non ha le pose giuste il motore salta lo step e la
   scelta non avviene mai, senza dire niente. */
function controllaCarosello(id, st) {
  assert.ok(st.var, `scena ${id}: carosello senza variabile in cui salvare`);
  const da = story[st.da || 'stili'];
  assert.ok(da, `scena ${id}: carosello su "${st.da}", che non esiste in story.json`);
  const chiavi = st.ordine || Object.keys(da);
  assert.ok(chiavi.length >= 2, `scena ${id}: carosello con meno di due opzioni`);
  for (const k of chiavi) {
    const o = da[k];
    assert.ok(o, `scena ${id}: carosello, opzione "${k}" non esiste`);
    assert.ok(o.nome, `scena ${id}: "${k}" senza nome`);
    assert.ok(o.desc, `scena ${id}: "${k}" senza descrizione`);
    const img = o.pose?.[st.posa] || o.img;
    assert.ok(img, `scena ${id}: "${k}" non ha la posa "${st.posa}"`);
    assert.ok(fs.existsSync(path.join(ROOT, (story.meta.assetBase || '') + img)),
      `scena ${id}: la posa "${img}" non esiste su disco`);
  }
  // la conferma di un passo irreversibile non e' facoltativa
  assert.ok(st.conferma?.text, `scena ${id}: carosello irreversibile senza modale di conferma`);
}

/* ---------- 1c. le battute devono stare nel box ----------
   Il box del dialogo ha un'altezza FISSA di tre righe (vedi #box in engine.css):
   il testo che sfora non manda a capo il box, sparisce sotto overflow:hidden.
   E' l'errore che non si vede finche' qualcuno non gioca quella scena.

   Le righe si contano a caratteri, non a pixel: il corpo del testo e' in vw e
   il box e' una percentuale della larghezza, quindi i caratteri per riga
   restano gli stessi su qualunque telefono — misurati 36 identici su iPhone SE,
   13 e 14 Pro Max.

   36 e non 60: Press Start 2P e' largo 1em per carattere. La prima versione di
   questo test diceva 60 perche' era stata calibrata dove Google Fonts non
   rispondeva e il browser ripiegava su un monospace di sistema, largo 0.6em.
   Con quel numero il test passava e sui telefoni veri il testo spariva sotto il
   bordo del box. Adesso il font sta nel repo, quindi il ripiego non c'e' piu'.

   Qui si tiene 34, un po' stretto, perche' il conto e' una stima e il margine
   deve stare dalla parte giusta. */
const PER_RIGA = 34;
const RIGHE_MAX = 5;

// il testo piu' lungo che quella battuta puo' produrre a schermo: nome lungo,
// variante di genere piu' lunga, etichetta di una risposta al posto del segnaposto
function testoPeggiore(t) {
  return String(t)
    .replace(/\{NOME\}/g, 'MASSIMILIANO')
    .replace(/\{nome\}/g, 'Massimiliano')
    .replace(/\{g:([^}]*)\}/g, (_, v) => v.split('|').sort((a, b) => b.length - a.length)[0])
    .replace(/\{label:[^}]*\}/g, 'Nessun aumento, resta a 1.239 euro')
    .replace(/\{[^}]*\}/g, 'XXXXXXXX');
}

function quanteRighe(t) {
  let n = 1, len = 0;
  for (const parola of testoPeggiore(t).split(/\s+/)) {
    if (len && len + 1 + parola.length > PER_RIGA) { n++; len = parola.length; }
    else len += (len ? 1 : 0) + parola.length;
  }
  return n;
}

// Gli appunti di lavorazione marcati [BOZZA] non sono battute: non vanno
// accorciati, vanno riscritti quando si fa quella scena. Non li si controlla,
// ma li si elenca a fine test, cosi' restano sotto gli occhi.
const bozze = [];
function controllaLunghezza(dove, t) {
  if (String(t).startsWith('[BOZZA]')) { bozze.push(dove); return; }
  const n = quanteRighe(t);
  assert.ok(n <= RIGHE_MAX,
    `${dove}: la battuta occupa ${n} righe, il box ne tiene ${RIGHE_MAX} — ` +
    `accorciala. "${String(t).slice(0, 70)}..."`);
}

for (const [id, sc] of Object.entries(story.scenes)) {
  for (const st of sc.steps) {
    const testi = typeof st.text === 'string' ? [st.text]
      : (st.text && typeof st.text === 'object' ? Object.values(st.text) : []);
    for (const t of testi) controllaLunghezza(`scena ${id}`, t);
  }
}
for (const [cat, c] of Object.entries(banca.categorie || {})) {
  for (const d of [...(c.core || []), ...(c.extra || [])]) {
    for (const op of d.opzioni || []) {
      for (const [stile, battuta] of Object.entries(op.battute || {})) {
        controllaLunghezza(`${d.id} / ${stile}`, battuta);
      }
    }
  }
}

if (bozze.length) {
  console.log(`appunti [BOZZA] ancora nello script (${bozze.length}): ${[...new Set(bozze)].join(', ')}`);
}

/* ---------- 1d. solo caratteri che il font sa disegnare ----------
   Il gioco usa Press Start 2P, che ha un repertorio limitato. Un carattere che
   il font non ha NON fa sparire il testo: il browser ripiega su un altro font
   solo per quel carattere, quindi a schermo esce una lettera di famiglia
   diversa in mezzo alla frase. E' un difetto che si vede solo giocando quella
   battuta — successo con la okina di "'Ohi'a lehua" in una domanda iPhone.

   game/glifi.json e' l'elenco dei caratteri che il font copre davvero, estratto
   dal file del font da tools/glifi_font.py: va rigenerato se si cambia font. */
const glifi = new Set(
  JSON.parse(fs.readFileSync(new URL('../game/glifi.json', import.meta.url), 'utf8')).codici
);
{
  const fuori = new Map();
  const guarda = (dove, t) => {
    for (const ch of String(t)) {
      const c = ch.codePointAt(0);
      if (c > 31 && !glifi.has(c) && !fuori.has(ch)) fuori.set(ch, `${dove}: "${String(t).slice(0, 50)}"`);
    }
  };
  // Si guardano TUTTE le stringhe tranne quelle strutturali (id, nomi di file,
  // nomi di variabile). Elencare invece i campi "di testo" lascia scoperti i
  // punti annidati — le battute stanno sotto opzioni[].battute.<stile>, cioe'
  // sotto una chiave che e' il nome dello stile, e la prima versione di questo
  // test non le guardava: proprio dove stava la okina che l'ha motivato.
  const strutturali = new Set(['id', 'var', 'who', 'char', 'body', 'head', 'goto', 'gotoMult',
    'next', 'bg', 't', 'posa', 'img', 'asset', 'extra_asset', 'da', 'name', 'icona', 'prop',
    'classe', 'classeCorpo', 'value', 'tipo', 'pattern', 'stile', 'src']);
  const scava = (n, dove) => {
    if (Array.isArray(n)) return n.forEach((v) => scava(v, dove));
    if (n && typeof n === 'object') {
      for (const [k, v] of Object.entries(n)) {
        if (k.startsWith('_') || strutturali.has(k)) continue;
        if (typeof v === 'string') guarda(dove, v);
        else scava(v, dove);
      }
    }
  };
  for (const [id, sc] of Object.entries(story.scenes)) scava(sc, `scena ${id}`);
  scava(story.stili, 'stili');
  scava(banca, 'domande');
  scava(quiz, 'quiz');
  assert.equal(fuori.size, 0,
    `caratteri che il font non sa disegnare: ${[...fuori.entries()]
      .map(([ch, dove]) => `${JSON.stringify(ch)} (U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}) in ${dove}`)
      .join(' — ')}`);
}

/* ---------- 1b. niente asterischi di declinazione nei dialoghi ---------- */
// Dopo che il giocatore ha detto come rivolgersi a lui, ogni frase deve essere
// declinata: "impalat*" a schermo e' un difetto visibile.
for (const [id, sc] of Object.entries(story.scenes)) {
  for (const st of sc.steps) {
    const testi = typeof st.text === 'string' ? [st.text]
      : (st.text && typeof st.text === 'object' ? Object.values(st.text) : []);
    for (const t of testi) {
      const senzaVarianti = t.replace(/\{g:[^}]*\}/g, '');
      assert.ok(!/\w\*/.test(senzaVarianti),
        `scena ${id}: asterisco di declinazione in "${t.slice(0, 60)}" - usa {g:...}`);
      // Una variante di troppo non si vede a schermo: il motore prende quella
      // che serve e ignora le altre. Il test la trova.
      for (const m of t.matchAll(/\{g:([^}]*)\}/g)) {
        assert.equal(m[1].split('|').length, story.meta.genderOrder.length,
          `scena ${id}: "{g:${m[1]}}" ha ${m[1].split('|').length} varianti, ` +
          `meta.genderOrder ne dichiara ${story.meta.genderOrder.length}`);
      }
    }
    for (const o of st.options || []) {
      assert.ok(!/\w\*/.test(String(o.label || '')), `scena ${id}: asterisco nell'opzione "${o.label}"`);
    }
  }
}

/* ---------- 1e. Apple Campus Run ----------
   Il minigioco non e' una scena: e' una pagina sua, aperta in un riquadro sopra
   quello che c'e'. Qui si controlla che la pagina esista davvero e che le due
   porte che ci portano — la griglia di Peter e il countdown — siano ancora
   aperte: sono facili da perdere in una modifica allo script, e a schermo si
   vedrebbe solo un bottone in meno. */
{
  const runner = story.meta.runner;
  assert.ok(runner, 'meta.runner: manca l\'indirizzo della corsa');
  const pagina = path.join(ROOT, runner.replace(/\/$/, '/index.html'));
  assert.ok(fs.existsSync(pagina), `meta.runner punta a "${runner}", che non esiste`);
  const sorgente = fs.readFileSync(pagina, 'utf8');
  // e' la versione definitiva, non una prova: nessuna scritta lo deve smentire
  assert.ok(!/prototipo/i.test(sorgente),
    'la corsa non e\' piu\' un prototipo: via la parola dalla pagina');
  // le due porte
  const hub = Object.values(story.scenes)
    .flatMap((sc) => sc.steps || []).find((st) => st.t === 'quizhub');
  assert.ok(hub?.corsa?.label, 'la griglia di Peter deve offrire anche la corsa ("corsa")');
  assert.ok(hub.corsa.esci, 'la corsa aperta da Peter deve dire da dove si torna ("esci")');
  const cd = Object.values(story.scenes)
    .flatMap((sc) => sc.steps || []).find((st) => st.t === 'countdown');
  assert.ok((cd?.azioni || []).some((a) => a.corsa),
    'il countdown e\' la schermata su cui si rientra: la corsa deve essere li\'');
  assert.ok((cd?.azioni || []).some((a) => a.goto === 'quiz'),
    'il countdown e\' la schermata su cui si rientra: anche il quiz deve essere li\'');
  // il record vive nel salvataggio, quindi la variabile va dichiarata
  for (const v of ['runner_record', 'runner_giocato']) {
    assert.ok(v in story.vars, `vars: manca "${v}", il record della corsa non si salverebbe`);
  }
}

/* ---------- 2. asset: fondali e prop devono esistere; i personaggi non ancora
   disegnati sono ammessi (il motore mostra la scena senza personaggio) ---------- */
const base = story.meta.assetBase || '';
const onDisk = (rel) => fs.existsSync(path.join(ROOT, base + rel));

// Fondali e oggetti devono esistere sul disco: un percorso sbagliato qui e' un
// errore, non un lavoro in corso. L'unica eccezione sono i file dichiarati in
// meta.assetiInArrivo — arte gia' disegnata ma non ancora convertita e caricata:
// vengono elencati come "da caricare" invece di far fallire il test, e il motore
// disegna un ripiego al posto loro.
const inArrivo = new Set(story.meta.assetiInArrivo || []);
// I layer della platea restano dichiarati (il motore sa mostrarli, e le reazioni
// di S5 ci girano intorno) ma NON sono piu' in lavorazione: l'arte non si fa, e
// la scena senza quei file va avanti uguale. Percio' non stanno fra i file che
// devono esistere sul disco, e non stanno nemmeno in meta.assetiInArrivo.
assert.equal(story.meta.assetiInArrivo?.length ?? 0, 0,
  'niente piu\' layer della platea in roadmap: l\'arte della platea non si fa');
for (const kind of ['bg', 'props']) {
  for (const rel of Object.values(story.assets[kind] || {})) {
    if (inArrivo.has(rel)) { if (!onDisk(rel)) todoAssets.add(rel + ' (da convertire)'); continue; }
    assert.ok(onDisk(rel), `asset mancante: ${base + rel}`);
  }
}
for (const rel of inArrivo) {
  assert.ok(Object.values(story.assets).some((m) => Object.values(m).includes(rel)),
    `meta.assetiInArrivo elenca "${rel}" che nessuna scena usa: toglilo`);
}
for (const [who, c] of Object.entries(story.cast || {})) {
  for (const kind of ['bodies', 'heads']) {
    for (const [id, rel] of Object.entries(c[kind] || {})) {
      if (!onDisk(rel)) todoAssets.add(`${who}/${kind}/${id}`);
    }
  }
  // una voce in cuffia non ha sprite in scena: al suo posto serve l'icona
  if (c.voce) {
    assert.ok(c.icona?.length, `cast ${who}: dichiarato "voce" ma senza icona`);
    for (const f of c.icona) {
      assert.ok(fs.existsSync(path.join(ROOT, base + f)), `cast ${who}: icona "${f}" non esiste`);
    }
    assert.equal(Object.keys(c.bodies || {}).length, 0,
      `cast ${who}: e' una voce, non deve avere pose in scena`);
  }
  // corpo e testa separati: se ci sono espressioni serve l'ancoraggio del collo
  if (Object.keys(c.heads || {}).length) assert.ok(c.neck, `cast ${who}: manca "neck" (ancoraggio collo)`);
}

/* ---------- 3. flusso di gioco in jsdom ---------- */
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  .replace(/<script src=".*?"><\/script>/, '')
  .replace(/<script>[\s\S]*?<\/script>/, '');           // via il bootstrap con fetch

const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://fantaliberty.com/' });
dom.window.eval(fs.readFileSync(path.join(ROOT, 'game/engine.js'), 'utf8'));

const { window } = dom;
const { VN, document } = window;
const $ = (id) => document.getElementById(id);
const txt = () => $('txt').textContent;

let ended = null;
VN.boot(story, { speed: 0, banca, quiz, onEnd: (s) => { ended = s; } });   // speed 0 = niente timer

// avvio: la barra di caricamento precede il cartello
const primi = story.scenes[story.meta.start].steps.map((s) => s.t);
assert.deepEqual(primi.slice(0, 3), ['logo', 'boot', 'title'], 'sigla, poi loading, poi cartello');
// l'apertura sta su due fondali: vialetto con gli uccelli, poi ingresso in dissolvenza
assert.equal(story.scenes.arrivo.bg, 'esterno_vialetto');
assert.ok(story.scenes.arrivo.uccelli >= 8, 'stormo sul vialetto');
assert.ok(story.scenes.arrivo.foglie > 0 && story.scenes.arrivo.pulviscolo > 0,
  'foglie e pulviscolo rendono viva la scena d\'apertura');
assert.equal(story.scenes.ingresso.bg, 'esterno_ingresso');
assert.ok(story.scenes.ingresso.dissolvenza, 'il cambio fondale e\' in dissolvenza');
// niente piu' scelta avatar: Lucas consegna il badge, e la figura del giocatore
// e' lo sprite dello stile scelto in S3
assert.ok(!story.avatar, 'il carosello avatar non e\' piu\' nell\'apertura');
const perAnni = story.scenes.badge.steps.find((s) => s.by === 'anni');
assert.ok(perAnni, 'una battuta cambia in base agli anni');
for (const k of ['0', '1', '2', '3']) {
  assert.ok(perAnni.text[k]?.length > 20, `manca la battuta per la fascia ${k}`);
}
assert.ok(perAnni.text['*'], 'serve anche un ripiego');
assert.match(JSON.stringify(story.scenes.badge.steps), /Ecco il tuo badge/);

// intro: cartello nero, righe scritte una dopo l'altra
assert.ok($('curtain').classList.contains('on'), 'sipario nero visibile all\'avvio');
const righe = [...$('curtainTxt').querySelectorAll('.tline')].map((d) => d.textContent);
assert.equal(righe.length, 3, 'tre righe di intro');
assert.match(righe[0], /Cupertino/);
assert.match(righe[2], /Keynote/);
assert.ok($('curtainTxt').querySelector('.tline.big'), 'ultima riga con enfasi');
assert.ok($('curtainTxt').querySelector('.tcur'), 'cursore lampeggiante presente');
assert.equal($('curtainTxt').querySelectorAll('.tcur').length, 1, 'un solo cursore, segue la riga');

VN.step();                                              // tap: si accendono le luci
assert.equal($('curtain').classList.contains('on'), false, 'sipario via dopo l\'accensione');

// scena "arrivo": la battuta di Lucas e' gia' scritta
assert.match(txt(), /Io sono Lucas/, 'prima battuta mostrata');
assert.equal($('name').textContent, 'Lucas');
assert.ok($('npcBody').getAttribute('src').includes('chr_lucas_neutro'), 'posa neutra in scena');

VN.step();                                              // -> scena registrazione

// input nome
assert.ok($('inputform').classList.contains('on'), 'form nome visibile');
assert.match(txt(), /Come ti chiami/);
$('ti').value = 'Fr@nc€sco!!!';
$('ti').oninput();
assert.equal(VN.state.nome, 'Frncsco', 'sanitizzazione input');
assert.equal($('tval_nome').textContent, 'FRNCSCO', 'terminale aggiornato live');
$('ti').value = 'Franco';
$('ti').oninput();
$('tok').onclick();

// scelta genere -> interpolazione {NOME}
assert.match(txt(), /Perfetto, FRANCO/, 'interpolazione {NOME}');
const opts = [...$('choices').querySelectorAll('.ch')];
assert.equal(opts.length, 2, 'lo script master prescrive due bottoni: Maschile | Femminile');
opts[1].onclick({ stopPropagation() {} });              // femminile
assert.equal(VN.state.genere, 'f');
assert.equal($('tval_genere').textContent, 'F');

// store (campo aggiunto dallo script master v4.0)
assert.match(txt(), /In che store lavori/);
[...$('choices').querySelectorAll('.ch')][0].onclick({ stopPropagation() {} });   // Piazza Liberty
assert.equal(VN.state.store, 'liberty');
assert.equal($('tval_store').textContent, 'LIBERTY');

// dipartimento (campo aggiunto dallo script master v4.0)
assert.match(txt(), /in che dipartimento/);
[...$('choices').querySelectorAll('.ch')][2].onclick({ stopPropagation() {} });   // Shopping
assert.equal(VN.state.reparto, 'shopping');
assert.equal($('tval_reparto').textContent, 'SHOPPING');

// scelta anzianita' (fasce: 0-2 / 3-7 / 8-12 / 12+)
assert.match(txt(), /quanto tempo lavori in Apple/);
[...$('choices').querySelectorAll('.ch')][2].onclick({ stopPropagation() {} });   // 8-12 anni
assert.equal(VN.state.anni, '2');
assert.equal($('tval_anni').textContent, '8-12');

// iPhone in uso: lista a tendina, 32 modelli, non bottoni
assert.match(txt(), /che iPhone usi/);
assert.ok($('listform').classList.contains('on'), 'la lista a tendina e\' aperta');
const modelli = [...$('tsel').querySelectorAll('option')].filter((o) => o.value);
assert.equal(modelli.length, 32, 'la lista completa dell\'edizione WWDC26');
assert.ok($('tsel').querySelectorAll('optgroup').length >= 8, 'modelli raggruppati per generazione');
$('tsel').value = '16 Pro';
$('tsel').onchange();
$('tselok').onclick({ stopPropagation() {} });
assert.equal(VN.state.device, '16 Pro');
// niente controllo su tval_device: appena scelto il modello parte lo step badge,
// che sostituisce le righe del terminale con la tessera stampata (verificata sotto)
// il modello scelto adatta il layout: 16 Pro -> 6.3", fascia "lg"
assert.ok(document.body.classList.contains('disp-lg'),
  'il modello di iPhone applica la classe di layout al body');

// il terminale resta la lista dei campi: il badge non si stampa piu' li'
const term = [...$('screen').querySelectorAll('.frow')].map((d) => d.textContent);
assert.match(term[0], /NOME: FRANCO/, 'il terminale mostra i campi compilati');
assert.equal($('tval___ok').textContent, '> BADGE IN STAMPA');

// riga di sistema mentre la stampante lavora: non la dice nessuno
assert.match(txt(), /stampa in corso/, 'avviso di stampa nel box');
assert.ok($('boxwrap').classList.contains('sistema'), 'riga di sistema, senza parlante');
VN.step();

// scena benvenuto: variante di genere femminile + sprite happy
assert.match(txt(), /^Ecco il tuo badge, FRANCO\./, 'Lucas consegna il badge');
assert.equal($('boxwrap').classList.contains('sistema'), false, 'e qui torna a parlare Lucas');
assert.ok($('npcBody').getAttribute('src').includes('chr_lucas_felice'), 'posa felice dopo il flash');

// Lucas consegna il badge: la tessera e' gia' a schermo mentre lo dice, senza
// un tap in mezzo, col nome del giocatore stampato sopra
assert.ok($('badgewrap').classList.contains('in'), 'il badge compare con la battuta');
assert.equal($('badgeName').textContent, 'FRANCO', 'sul badge c\'e\' il nome, e basta');
VN.step();                                              // tap: via il badge
assert.equal($('badgewrap').classList.contains('in'), false, 'il badge sparisce al tap');

assert.match(txt(), /otto ai dodici anni/, 'Lucas commenta la fascia di anzianita\' scelta');
VN.step();
assert.match(txt(), /^Benvenuta allo Steve Jobs Theater\./, 'variante di genere');



/* ---------- 4. salvataggio / ripresa ---------- */
assert.ok(VN.hasSave(story), 'partita salvata in localStorage');
const saved = VN.readSave();
assert.equal(saved.state.nome, 'Franco');
assert.equal(saved.scene, 'badge');

// nuova sessione: riprende dal checkpoint invece di ricominciare
VN.boot(story, { speed: 0, banca, quiz });
// la card di ripresa e' gia' declinata: il genere sta nel salvataggio, non serve
// aspettare restore() per leggerlo (prima usciva un asterisco a schermo)
assert.match(txt(), /^Bentornata! Eri arrivata fino a "Atto 1 — Il badge"/, 'prompt di ripresa declinato');
const resumeBtns = [...$('choices').querySelectorAll('.ch')];
assert.equal(resumeBtns.length, 2);
resumeBtns[0].onclick({ stopPropagation() {} });                       // Riprendi
assert.equal(VN.state.nome, 'Franco', 'variabili ripristinate');
assert.match(txt(), /non restare qui impalat/, 'ripreso dalla battuta giusta');
assert.ok($('npcBody').getAttribute('src').includes('chr_lucas_felice'), 'scena ricomposta (posa corretta)');

// ...oppure ricomincia da capo. Cancellare la partita e' irreversibile: lo script
// chiede conferma prima, non basta il tocco sul bottone
VN.boot(story, { speed: 0, banca, quiz });
[...$('choices').querySelectorAll('.ch')][1].onclick({ stopPropagation() {} });   // Ricomincia
assert.ok($('modal').classList.contains('on'), 'la conferma di reset e\' una modale');
assert.ok(VN.hasSave(story), 'finche\' non conferma, il salvataggio resta');
[...$('modalbtns').querySelectorAll('.ch')][1].onclick({ stopPropagation() {} });   // No, torno indietro
assert.equal($('modal').classList.contains('on'), false, 'modale chiusa');
assert.ok(VN.hasSave(story), 'annullare non cancella niente');
[...$('choices').querySelectorAll('.ch')][1].onclick({ stopPropagation() {} });   // Ricomincia, di nuovo
[...$('modalbtns').querySelectorAll('.ch')][0].onclick({ stopPropagation() {} });   // Si', ricomincio
assert.equal(VN.hasSave(story), false, 'salvataggio cancellato');
assert.equal(VN.state.nome, '', 'le variabili tornano a zero, non restano quelle vecchie');
assert.ok($('curtain').classList.contains('on'), 'ripartito dall\'intro');
assert.match($('curtainTxt').textContent, /Cupertino/);

/* ---------- 5. S2: l'aggancio ---------- */
VN.boot(story, { speed: 0, banca, quiz, scene: 'aggancio' });
assert.match(txt(), /Ehi, tu/, 'Susan chiama dal palco in fondo');
assert.equal($('name').textContent, 'Susan', 'nome parlante preso dal cast');
assert.ok($('npcBody').getAttribute('src').includes('chr_susan_panico_telefoni'), 'posa di Susan referenziata');
assert.equal(typeof $('npcBody').onerror, 'function', 'file mancante: il personaggio viene nascosto, niente immagine rotta');
// Susan sta sempre alla misura standard degli NPC, quella di Lucas: la
// versione minuscola in fondo alla sala si leggeva come un difetto grafico,
// non come distanza
assert.equal($('npc').style.height, '', 'Susan alla misura standard');

VN.step();                                          // discesa (saltata a speed 0) + primo piano
assert.ok($('npcBody').getAttribute('src').includes('chr_susan_mani_capelli'), 'ravvicinata dopo la discesa');
assert.equal($('npc').style.height, '', 'e a grandezza normale');
assert.match(txt(), /bloccato in tangenziale/);
VN.step();
assert.match(txt(), /prova generale/);
VN.step();
assert.match(txt(), /un piccolo problema/);
VN.step();
assert.match(txt(), /unico essere umano/);
VN.step();
assert.match(txt(), /fai l'host/);
VN.step();

// [S2.03] tre opzioni, solo tono: nessuna tocca il punteggio
const toni = [...$('choices').querySelectorAll('.ch')];
assert.equal(toni.length, 3, 'tre risposte, come nello script');
const puntiPrima = VN.state.punti;
toni[1].onclick({ stopPropagation() {} });          // la sfacciata
assert.equal(VN.state.sfacciato, true, 'la risposta sfacciata si ricorda: sblocca Susan carponi in S5');
assert.equal(VN.state.punti, puntiPrima, 'il tono non da\' punti');

// [S2.04] il corridoio arriva sulla battuta del camerino, non due battute prima
assert.match(txt(), /Ottimo, hai detto/, 'prima il si\', ancora in sala');
assert.ok($('bg').getAttribute('src').includes('palco_vuoto'),
  'e ancora il palco vuoto, dove la discesa e\' andata a finire');
VN.step();
assert.ok($('bg').getAttribute('src').includes('backstage_corridoio'), 'si passa al corridoio');
assert.ok($('npcBody').getAttribute('src').includes('chr_susan_indica_camerino'));
// La reazione "micro" della battuta sfacciata lasciava addosso la sua classe:
// la sua animazione sostituiva quella d'ingresso del personaggio dopo (stessa
// proprieta', regola piu' in basso nel CSS) e non essendo "forwards" lo lasciava
// trasparente. Susan spariva dal corridoio, con lo sprite giusto caricato.
assert.equal($('npc').classList.contains('micro'), false,
  'bug: la classe della reazione micro restava addosso e rendeva invisibile il personaggio dopo');
assert.ok($('npc').classList.contains('in'), 'e il personaggio entra con la sua animazione');
assert.match(txt(), /ultima porta a destra/, 'fondale e battuta del camerino arrivano insieme');
VN.step();
assert.match(txt(), /crolli il resto/, 'e Susan torna al suo di problema');

// le altre due risposte non alzano il flag
VN.boot(story, { speed: 0, banca, quiz, scene: 'aggancio' });
for (let i = 0; i < 6; i++) VN.step();
[...$('choices').querySelectorAll('.ch')][2].onclick({ stopPropagation() {} });   // annuire in silenzio
assert.equal(VN.state.sfacciato, false);

/* ---------- 5a. le due transizioni nuove ----------
   Con speed 0 non partono (sono animazioni, non contenuto) e devono cedere
   subito il turno: una transizione che non chiama il seguito blocca il gioco. */
{
  const sc = story.scenes.aggancio;
  const sip = sc.steps.find((s) => s.t === 'sipario');
  assert.ok(sip, 'S2 si apre con la tenda della lobby che si divide');
  assert.equal(sip.dietro, 'sala_teatro', 'dietro la tenda c\'e\' la sala');
  const car = sc.steps.find((s) => s.t === 'carrellata');
  assert.ok(car, 'e la discesa verso il palco e\' una carrellata, non uno stacco');
  assert.equal(story.carrellate[car.id].shots.length, 3, 'tre inquadrature come i file consegnati');

  // a velocita' vera le transizioni partono e non lasciano niente a schermo
  const dom3 = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://fantaliberty.com/' });
  dom3.window.eval(fs.readFileSync(path.join(ROOT, 'game/engine.js'), 'utf8'));
  const { VN: VN3, document: doc3 } = dom3.window;
  const $3 = (id) => doc3.getElementById(id);
  VN3.boot(story, { speed: 30, banca, quiz, scene: 'aggancio' });
  assert.ok($3('tende').classList.contains('on'), 'le due meta\' della tenda sono a schermo');
  assert.ok($3('tendaSx').style.backgroundImage.includes('lobby_z1_tenda'),
    'e portano il fondale che c\'era prima, non quello nuovo');
  assert.ok($3('bg').getAttribute('src').includes('sala_teatro'), 'dietro c\'e\' gia\' la sala');
  // cambiare scena mentre una transizione e' in corso non deve lasciare
  // mezzo fondale appeso sopra quella nuova
  VN3.boot(story, { speed: 30, banca, quiz, scene: 'lobby' });
  assert.equal($3('tende').classList.contains('on'), false, 'la transizione interrotta si chiude');
  assert.equal($3('prlx').children.length, 0);
}

/* ---------- 5d. S3: il camerino e la scelta dello stile ----------
   Lo stile decide gli sprite di S4-S7 e il perk di S8: e' la scelta piu' pesante
   del gioco, e l'unica che non si puo' rifare. */
{
  VN.clearSave();
  VN.boot(story, { speed: 0, banca, quiz, scene: 'camerino' });
  VN.state.genere = 'f';
  const dots = () => [...$('cdots').querySelectorAll('.cdot')];

  assert.match(txt(), /Scegli uno stile/, 'Susan apre la scena');
  assert.ok($('npcBody').getAttribute('src').includes('chr_susan_guarda_orologio'));
  VN.step();

  assert.ok($('carosello').classList.contains('on'), 'si apre il carosello');
  assert.ok($('boxwrap').classList.contains('carta'), 'e il box del dialogo lascia il posto alla scheda');
  assert.equal(dots().length, 4, 'quattro stili');
  assert.equal($('carnome').textContent, 'Hawaiano', 'si parte dal primo dello script');
  assert.match($('cardesc').textContent, /Arriva tardi/);
  assert.match($('carbattuta').textContent, /Se sbaglio rifaccio/, 'e la sua battuta');
  // Il perk e' una meccanica del quiz: sulla scheda del camerino non ci va, e
  // lo step di S3 infatti non chiede 'etichettaPerk'. Il dato resta in
  // story.stili per S8 — qui si controlla solo che non finisca a schermo.
  assert.equal($('carperk').textContent, '', 'niente perk mentre ci si veste');
  assert.equal($('carperk').style.display, 'none');
  assert.ok($('bg').classList.contains('sfoca'), 'il camerino va fuori fuoco dietro la figura');
  assert.ok($('carImg').getAttribute('src').includes('stile_hawaiano_palco_attesa'));

  $('cnext').onclick({ stopPropagation() {} });
  assert.equal($('carnome').textContent, 'Showman');
  $('cprev').onclick({ stopPropagation() {} });
  $('cprev').onclick({ stopPropagation() {} });
  assert.equal($('carnome').textContent, 'Ingegnere', 'il carosello gira');
  assert.ok($('carImg').getAttribute('src').includes('stile_ingegnere_palco_attesa'));

  // confermare e' irreversibile: prima la modale, e "Fammi ripensare" non sceglie
  $('carok').onclick({ stopPropagation() {} });
  assert.ok($('modal').classList.contains('on'), 'conferma prima di bloccare lo stile');
  assert.match($('modaltxt').textContent, /^Sei sicura\?/, 'la conferma e\' declinata');
  assert.equal(VN.state.stile, null, 'con la modale aperta lo stile non e\' ancora scelto');
  [...$('modalbtns').querySelectorAll('.ch')][1].onclick({ stopPropagation() {} });   // Fammi ripensare
  assert.equal(VN.state.stile, null, '"Fammi ripensare" non sceglie');
  assert.ok($('carosello').classList.contains('on'), 'e si resta nel carosello');
  assert.equal($('carnome').textContent, 'Ingegnere', 'sullo stile che si stava guardando');

  $('carok').onclick({ stopPropagation() {} });
  [...$('modalbtns').querySelectorAll('.ch')][0].onclick({ stopPropagation() {} });   // Si', sono io
  assert.equal(VN.state.stile, 'ingegnere', 'lo stile e\' scelto');
  assert.equal($('carosello').classList.contains('on'), false, 'il carosello si chiude');
  assert.equal($('boxwrap').classList.contains('carta'), false, 'e il box del dialogo torna');
  assert.equal($('bg').classList.contains('sfoca'), false, 'e il camerino torna a fuoco');

  // [S3.04] Susan commenta con la testa dello stile scelto: lo sprite lo decide
  // la variabile, non uno step per valore
  assert.ok($('npcBody').getAttribute('src').includes('chr_susan_commento_stile_ingegnere'),
    'la posa "commento_{stile}" si risolve sulla scelta');
  assert.match(txt(), /^Ingegnere\. Perfetto\./, 'commento dello stile giusto');
}

/* ---------- 5e. S4: dietro le quinte ----------
   Qui succedono due cose per la prima volta: il giocatore entra in scena come
   figura, e qualcuno parla senza esserci — Susan, che da qui in poi e' la regia
   e parla in cuffia. */
{
  // Si entra da S3, non saltando direttamente qui: lo stile va scelto prima che
  // la scena parta, perche' e' lui a decidere lo sprite del giocatore.
  VN.clearSave();
  VN.boot(story, { speed: 0, banca, quiz, scene: 'camerino' });
  VN.state.genere = 'f';
  VN.step();                                                   // -> carosello
  $('cnext').onclick({ stopPropagation() {} });                // Showman
  $('carok').onclick({ stopPropagation() {} });
  [...$('modalbtns').querySelectorAll('.ch')][0].onclick({ stopPropagation() {} });
  assert.equal(VN.state.stile, 'showman');
  VN.step();                                                   // -> scena quinte

  assert.equal(VN.sceneId, 'quinte', 'da S3 si passa a S4');
  // Le due composizioni duo_* mostrano gia' Susan e il personaggio insieme:
  // l'avatar separato resta spento per tutta questa sezione, altrimenti si
  // vedrebbe una seconda copia del personaggio sovrapposta alla prima.
  assert.equal($('avatar').classList.contains('on'), false,
    'l\'avatar resta nascosto: e\' gia\' dentro la composizione duo_*');
  assert.ok($('npcBody').getAttribute('src').includes('scene_showman_ready'),
    'la posa "duo_pronto_{stile}" si risolve sullo stile scelto');
  assert.match(txt(), /Studiato, vero\?/);
  VN.step();
  const scelte = [...$('choices').querySelectorAll('.ch')];
  assert.equal(scelte.length, 2);
  scelte[1].onclick({ stopPropagation() {} });                 // "No."
  assert.equal(VN.state.studiato, false);
  assert.match(txt(), /^Onesta\./, 'la risposta e\' declinata');
  VN.step();

  assert.equal($('avatar').classList.contains('on'), false, 'ancora nascosto: siamo su duo_spinta');
  assert.ok($('npcBody').getAttribute('src').includes('scene_showman_push'),
    'la posa "duo_spinta_{stile}" si risolve sullo stile scelto');
  assert.equal(txt(), 'Vai.', 'la spinta finale, senza la battuta sulle luci');
  VN.step();

  // Susan (nella coppia) esce di scena col push; l'avatar torna da solo,
  // con lo sprite dello stile scelto e non uno generico
  assert.ok($('avatar').classList.contains('on'), 'il giocatore e\' di nuovo in scena, da solo');
  assert.ok($('ioImg').getAttribute('src').includes('stile_showman_idle_palco'));

  // il sipario del palco e' lo stesso effetto della tenda della lobby
  const sip = story.scenes.quinte.steps.find((s) => s.t === 'sipario');
  assert.equal(sip.davanti, 'palco_sipario_chiuso');
  assert.equal(sip.dietro, 'palco_platea_piena');
  assert.ok($('bg').getAttribute('src').includes('palco_platea_piena'), 'si apre sul palco');

  // [S4.03] Susan passa in regia: niente sprite in scena, icona dell'auricolare
  // accanto al nome e box di un altro colore. Non e' un personaggio "voce" come
  // era Martha — e' lo step a chiedere la cuffia.
  assert.equal($('nametxt').textContent, 'Susan');
  assert.equal($('npc').classList.contains('out'), true, 'e non e\' piu\' in scena');
  assert.ok($('name').classList.contains('incuffia'), 'accanto al nome c\'e\' l\'auricolare');
  assert.ok($('boxwrap').classList.contains('incuffia'), 'e il box cambia colore');
  assert.ok($('voce').getAttribute('src').includes('chr_indicatore_regia'));
  assert.match(txt(), /Tra trenta secondi andiamo/);
  VN.step();
  assert.match(txt(), /sono io/, 'e ti avvisa che la voce in cuffia e\' la sua');
  VN.step(); VN.step();
  assert.match(txt(), /nessuno sa che sei .*sostitut/, '[S4.04] ultimo briefing');
  VN.step(); VN.step();
  assert.match(txt(), /crolli il resto/, 'e torna al suo di lavoro');

  // e quando riprende a parlare qualcuno che c'e' davvero, la cuffia sparisce
  VN.boot(story, { speed: 0, banca, quiz, scene: 'camerino' });
  assert.equal($('name').classList.contains('incuffia'), false);
  assert.equal($('boxwrap').classList.contains('incuffia'), false);
}

/* ---------- 5f. S5: il keynote ----------
   Il pezzo piu' grosso del gioco. Qui si controlla il giro completo: griglia,
   core in sequenza, bivio che pesca, intermezzi, punteggio, e la regola d'oro
   dello script — la reazione della platea non deve mai dipendere dalla risposta. */
{
  const scegli = (i) => [...$('choices').querySelectorAll('.ch')][i].onclick({ stopPropagation() {} });
  const celle = () => [...$('griglia').querySelectorAll('.gcell')];

  VN.clearSave();
  VN.boot(story, { speed: 0, banca, quiz, scene: 'keynote' });
  VN.state.genere = 'f'; VN.state.stile = 'drip'; VN.state.nome = 'Franca';

  // [S5] Susan apre dalla regia con una battuta pescata dal pool
  assert.equal($('nametxt').textContent, 'Susan');
  assert.ok($('boxwrap').classList.contains('incuffia'), 'parla in cuffia, non e\' sul palco');
  assert.ok(story.regia.apertura.includes(txt()), 'la battuta d\'apertura viene dal pool');
  VN.step();

  // [S5.INTERMEZZO.R1]: una sola scommessa di regia prima di cominciare — la
  // seconda (la luce per Craig) e' stata tolta per non allungare l'apertura
  assert.match(txt(), /chi entra per primo/, 'primo intermezzo');
  assert.equal($('nametxt').textContent, 'Susan');
  scegli(1);                                                   // John Ternus, val 2
  assert.equal(VN.state.punti, 2, 'gli intermezzi valgono il "val" secco');
  assert.equal(VN.state.intermezzi, 1, 'gli intermezzi si consumano in ordine');
  assert.equal(banca.intermezzi.some((i) => /Craig/.test(i.q)), false,
    'la domanda su Craig non e\' piu\' nella banca');

  // [S5.HUB]: tre macroargomenti, nessuno ancora fatto
  assert.equal(VN.sceneId, 'argomenti');
  assert.equal(celle().length, 3);
  assert.deepEqual(celle().map((c) => c.querySelector('.gnome').textContent),
    ['iPhone', 'Watch', 'Altro']);
  assert.equal(celle()[1].querySelector('.gstato').textContent, '0/3', 'Watch: 3 core');
  assert.equal(celle().filter((c) => c.classList.contains('fatta')).length, 0);

  celle()[1].onclick({ stopPropagation() {} });                // Watch
  assert.equal(VN.state.categoria, 'watch');
  assert.equal(VN.sceneId, 'argomento');

  // le core, in sequenza fissa
  const core = banca.categorie.watch.core;
  for (let k = 0; k < core.length; k++) {
    assert.ok(txt().includes(core[k].q), `domanda core ${k + 1} nell'ordine della banca`);
    assert.ok($('ioImg').getAttribute('src').includes('stile_drip'), 'in scena c\'e\' lo stile scelto');
    const prima = VN.state.punti;
    scegli(0);
    // la battuta e' quella dello stile, non l'etichetta dell'opzione
    assert.equal(txt(), core[k].opzioni[0].battute.drip, `battuta dello stile sulla domanda ${k + 1}`);
    assert.equal($('nametxt').textContent, 'FRANCA', 'a parlare alla platea e\' il giocatore');
    assert.equal(VN.state.punti, prima + core[k].opzioni[0].pt, 'punti della core presi dalla banca');
    assert.equal(VN.state.picks.watch.core[core[k].id].v, core[k].opzioni[0].label,
      'la risposta segnata e\' l\'etichetta scelta');
    VN.step();                                                 // via la battuta
    // gli eventi si intromettono a caso fra una domanda e l'altra: si tira
    // avanti finche' non ricompaiono dei bottoni (la prossima domanda, o il bivio)
    for (let g = 0; g < 12 && !txt().includes(core[k + 1]?.q || 'entrare nel dettaglio'); g++) {
      if ($('choices').classList.contains('on')) scegli(0);    // eventuale micro-challenge
      else VN.step();
    }
  }
  assert.equal(Object.keys(VN.state.picks.watch.core).length, 3, 'tutte e tre le core segnate');

  // [S5.BIVIO]: le facoltative si pescano QUI, non a inizio partita
  assert.match(txt(), /entrare nel dettaglio o passiamo al prossimo argomento/, 'il bivio della regia');
  assert.equal(VN.state.pescate, null, 'prima del bivio non e\' stato pescato niente');
  scegli(0);                                                   // approfondiamo
  // la regia commenta la scelta: e' una risposta al giocatore, non un giudizio
  // sul pronostico, quindi qui puo' dipendere da cosa ha scelto
  assert.match(txt(), /Perche' fermarsi quando stava andando tutto bene/, 'Susan commenta il bivio');
  assert.equal(VN.state.pescate.length, 3, 'tre facoltative pescate dal pool');
  const pool = banca.categorie.watch.extra.map((d) => d.id);
  assert.ok(VN.state.pescate.every((x) => pool.includes(x)), 'e vengono dal pool giusto');
  assert.equal(new Set(VN.state.pescate).size, 3, 'senza ripetizioni');
}

/* ---------- 5i. gli asset citati dalla banca esistono ----------
   I percorsi negli eventi erano scritti senza estensione e uno puntava a un file
   mai consegnato (il clicker, che esiste in due frame): a schermo non compariva
   niente e nessuno se ne accorgeva, perche' l'evento continuava lo stesso. */
for (const e of banca.micro_eventi) {
  for (const k of ['asset', 'extra_asset', 'prop']) {
    if (e[k]) assert.ok(fs.existsSync(path.join(ROOT, base + e[k])),
      `micro-evento ${e.id}: "${e[k]}" non esiste`);
  }
}
for (const [stile, e] of Object.entries(banca.eventi_personali)) {
  assert.ok(story.stili[stile], `evento personale per lo stile "${stile}", che non esiste`);
  for (const k of ['asset', 'extra_asset', 'prop']) {
    if (e[k]) assert.ok(fs.existsSync(path.join(ROOT, base + e[k])),
      `evento personale ${e.id}: "${e[k]}" non esiste`);
  }
  if (e.platea) assert.ok(story.assets.platea[e.platea.replace(/^pla_/, '')],
    `evento personale ${e.id}: reazione "${e.platea}" non dichiarata`);
}

/* ---------- 5j. micro-eventi interattivi ----------
   Ogni micro-evento e' una micro-challenge a tre risposte: il dato editoriale
   resta in banca per revisione testi, ma il motore assegna a runtime una
   permutazione opaca di +3, 0 e -3. */
{
  assert.equal(banca.micro_eventi.length, 5, 'cinque micro-eventi generali');
  const visti = new Set();
  for (const e of banca.micro_eventi) {
    assert.equal(e.opzioni.length, 3, `${e.id}: servono esattamente 3 opzioni`);
    assert.deepEqual([...new Set(e.opzioni.map((o) => o.editoriale))].sort((a, b) => a - b), [-3, 0, 3],
      `${e.id}: il mapping editoriale deve contenere -3, 0 e +3 una volta`);
    assert.ok(!/[+-]3|\\b0\\b/.test(e.testo), `${e.id}: il testo evento non deve mostrare valori numerici`);
    e.opzioni.forEach((o) => {
      assert.ok(!/[+-]3|\\b0\\b|bonus|malus/i.test(o.label), `${e.id}: opzione con punteggio visibile`);
      visti.add(o.label);
    });
  }
  for (const [stile, e] of Object.entries(banca.eventi_personali)) {
    assert.equal(e.stile, stile, `${e.id}: l'evento personale dichiara lo stile corretto`);
    assert.equal(e.opzioni.length, 3, `${e.id}: servono esattamente 3 opzioni`);
    assert.deepEqual([...new Set(e.opzioni.map((o) => o.editoriale))].sort((a, b) => a - b), [-3, 0, 3],
      `${e.id}: il mapping editoriale deve contenere -3, 0 e +3 una volta`);
  }
  const engineSrc = fs.readFileSync(path.join(ROOT, 'game/engine.js'), 'utf8');
  assert.match(engineSrc, /mescola\(valori\.slice\(\)\)/, 'il mapping A/B/C dei micro-eventi viene mescolato a runtime');
  assert.doesNotMatch(engineSrc, /Momentum|Chaos/i, 'non introdurre Momentum/Chaos');

  /* La randomizzazione non basta scriverla: se la prima opzione prendesse sempre
     lo stesso valore, chi rigioca imparerebbe la risposta buona e i micro-eventi
     non varrebbero piu' niente. Qui si gioca lo stesso evento tante volte e si
     controlla che ogni posizione abbia visto tutti e tre gli esiti. */
  const storyRnd = JSON.parse(JSON.stringify(story));
  storyRnd.regia.probabilitaEvento = 1;
  const vistiPerPosizione = [new Set(), new Set(), new Set()];
  for (let giro = 0; giro < 60; giro++) {
    const posto = giro % 3;
    VN.clearSave();
    VN.boot(storyRnd, { speed: 0, banca, quiz, scene: 'keynote' });
    VN.state.genere = 'f'; VN.state.stile = 'drip'; VN.state.nome = 'Franca';
    VN.state.eventi_sacchetto = ['MARIMBA'];
    for (let g = 0; g < 40; g++) {
      if (txt().includes('Marimba')) {
        VN.step();                                             // la battuta della regia
        [...$('choices').querySelectorAll('.ch')][posto].onclick({ stopPropagation() {} });
        vistiPerPosizione[posto].add(VN.state.picks.micro_eventi.r.MARIMBA.p);
        break;
      }
      if ($('griglia').classList.contains('on')) {
        [...$('griglia').querySelectorAll('.gcell')].filter((c) => !c.classList.contains('fatta'))[0]
          ?.onclick({ stopPropagation() {} });
      } else if ($('choices').classList.contains('on')) {
        [...$('choices').querySelectorAll('.ch')][0].onclick({ stopPropagation() {} });
      } else VN.step();
    }
  }
  vistiPerPosizione.forEach((visti, i) => {
    assert.deepEqual([...visti].sort((a, b) => a - b), [-1, 0, 1],
      `la risposta in posizione ${i + 1} non ha visto tutti e tre gli esiti: il mapping non e' davvero casuale`);
  });
}


/* ---------- 5k. la regia e' Susan, e parla in cuffia ----------
   Martha e' stata eliminata dal progetto: il suo ruolo lo prende Susan, che pero'
   e' un personaggio vero — in S2, S3 e S7 e' li' in scena. La cuffia quindi non
   e' una proprieta' del personaggio ma dello step: chi parla dalla regia lo
   dichiara con "incuffia". */
{
  assert.equal(story.cast.martha, undefined, 'Martha non e\' piu\' nel cast');
  assert.ok(story.cast.susan.icona?.length, 'Susan ha l\'icona dell\'auricolare per quando e\' in regia');
  for (const f of story.cast.susan.icona) {
    assert.ok(fs.existsSync(path.join(ROOT, base + f)), `icona regia mancante: ${f}`);
    assert.doesNotMatch(f, /martha/i, 'l\'icona della regia non porta piu\' il nome di Martha');
  }
  assert.equal(story.cast.susan.voce, undefined,
    'Susan NON e\' un personaggio "voce": in S2, S3 e S7 e\' in scena davvero');
  assert.equal(story.regia.chi, 'susan', 'la regia e\' Susan');

  // ogni step che la fa parlare dalla regia deve chiedere la cuffia, altrimenti
  // a schermo sembra che sia li' sul palco insieme al giocatore
  const inRegia = ['keynote', 'argomenti', 'argomento', 'teleprompter'];
  for (const id of inRegia) {
    for (const st of story.scenes[id].steps) {
      if (st.who !== 'susan') continue;
      assert.equal(st.incuffia, true, `scena ${id}: Susan parla dalla regia, serve "incuffia"`);
    }
  }
  // ...e in S2/S3 no: li' e' in scena
  for (const id of ['aggancio', 'camerino']) {
    for (const st of story.scenes[id].steps) {
      assert.notEqual(st.incuffia, true, `scena ${id}: qui Susan e\' in scena, non in cuffia`);
    }
  }
}

/* ---------- 5l. i pool di battute della regia ----------
   Lo script chiede che Susan non parli dopo ogni singola scelta: le sue battute
   vengono da pool per situazione, e i tre pool degli esiti sono l'unico ritorno
   che il giocatore riceve dopo un micro-evento. Non devono mai far capire quanto
   vale la risposta. */
{
  const pool = ['apertura', 'introDomanda', 'improvvisazione', 'caos', 'critica', 'scarica'];
  for (const k of pool) {
    assert.ok(Array.isArray(story.regia[k]) && story.regia[k].length,
      `story.regia.${k}: pool mancante o vuoto`);
    for (const riga of story.regia[k]) {
      assert.equal(typeof riga, 'string');
      assert.doesNotMatch(riga, /[+-]\s?\d|\bbonus\b|\bmalus\b|\bpunt/i,
        `story.regia.${k}: "${riga}" lascia trapelare il punteggio`);
    }
  }
  // uno step "say" puo' pescare da un pool invece di avere il testo scritto
  const apre = story.scenes.keynote.steps.find((st) => st.pool);
  assert.equal(apre?.pool, 'apertura', 'S5 si apre con una battuta pescata dal pool');
  assert.equal(apre.text, undefined, 'e senza testo fisso accanto');
}

/* ---------- 5m. il micro-evento: Susan prima, Susan dopo, mai un numero ----------
   Il giocatore deve capire come e' andata solo da come gliela racconta la regia. */
{
  const scegli = (i) => [...$('choices').querySelectorAll('.ch')][i].onclick({ stopPropagation() {} });
  const clicker = banca.micro_eventi.find((e) => e.id === 'CLICKER');
  assert.ok(clicker.regia, 'il clicker porta la battuta della regia fuori dalla narrazione');
  assert.doesNotMatch(clicker.testo, /Susan|Martha/, 'che quindi non e\' piu\' dentro al testo');

  VN.clearSave();

  // L'evento si forza invece di aspettare il 30%: qui interessa il giro, non il
  // caso. Si lavora su una copia dello script, cosi' la probabilita' alzata non
  // si porta dietro negli altri test.
  const storyEvento = JSON.parse(JSON.stringify(story));
  storyEvento.regia.probabilitaEvento = 1;
  /* Le battute di conseguenza passano da fmt() come tutte le altre: quella
     dell'improvvisazione ha dentro "{g:Bravissimo|Bravissima}", quindi a
     schermo arriva declinata. Confrontare la stringa grezza faceva fallire il
     test ogni volta che usciva proprio quella (due volte su tre). */
  const declina = (t) => String(t).replace(/\{g:([^|}]*)\|([^}]*)\}/g,
    (_, m, f) => (VN.state.genere === 'm' ? m : f));
  const conseguenze = new Set([...story.regia.improvvisazione, ...story.regia.caos,
    ...story.regia.critica].flatMap((t) => [t, declina(t)]));
  let visto = false;
  for (let tentativi = 0; tentativi < 5 && !visto; tentativi++) {
    VN.boot(storyEvento, { speed: 0, banca, quiz, scene: 'keynote' });
    VN.state.genere = 'f'; VN.state.stile = 'drip'; VN.state.nome = 'Franca';
    VN.state.eventi_sacchetto = ['CLICKER'];
    VN.state.categoria = 'watch';
    // si tira avanti finche' non compare la narrazione del clicker
    for (let g = 0; g < 60; g++) {
      if (txt().includes('Il clicker non risponde')) {
        // la narrazione si legge da sola: se la battuta della regia le scrivesse
        // sopra nello stesso istante, il giocatore non saprebbe mai cos'e'
        // successo (ed e' quello che faceva la prima versione)
        assert.equal($('choices').classList.contains('on'), false,
          'prima si legge cos\'e\' successo, le risposte arrivano dopo');
        VN.step();                                             // -> la battuta della regia
        assert.equal($('nametxt').textContent, 'Susan', 'la regia si annuncia col nome di Susan');
        assert.ok($('boxwrap').classList.contains('incuffia'), 'e in cuffia');
        assert.equal(txt(), clicker.regia, 'con la battuta scritta sull\'evento');
        const btn = [...$('choices').querySelectorAll('.ch')];
        assert.equal(btn.length, 3, 'tre risposte');
        const puntiPrima = VN.state.punti;
        btn[0].onclick({ stopPropagation() {} });
        // il ritorno e' solo narrativo: nessun numero, nessun badge
        assert.ok(conseguenze.has(txt()), 'la conseguenza viene dai pool della regia');
        assert.equal($('nametxt').textContent, 'Susan');
        assert.doesNotMatch(txt(), /[+-]\s?\d|\bbonus\b|\bmalus\b/i, 'e non dice mai quanto vale');
        const dato = VN.state.picks.micro_eventi.r.CLICKER;
        assert.ok([1, 0, -1].includes(dato.p), 'il punteggio applicato e\' uno dei tre');
        assert.equal(VN.state.punti, puntiPrima + dato.p, 'e finisce nel totale');
        visto = true;
        break;
      }
      if ($('griglia').classList.contains('on')) {
        [...$('griglia').querySelectorAll('.gcell')].filter((c) => !c.classList.contains('fatta'))[0]
          ?.onclick({ stopPropagation() {} });
      } else if ($('choices').classList.contains('on')) scegli(0);
      else VN.step();
    }
  }
  assert.ok(visto, 'il micro-evento del clicker non e\' comparso nemmeno a probabilita\' 1');
}

/* ---------- 5m-bis. l'evento personale di hawaiano mostra ANCHE l'ukulele ----------
   E' il caso in cui "asset" (la posa stili/ del personaggio) e "prop" (l'oggetto
   separato) sono dichiarati insieme: il primo va sull'avatar, il secondo nello
   slot degli oggetti di scena, e sparisce con l'evento invece di restare in scena. */
{
  const ukulele = banca.eventi_personali.hawaiano;
  assert.equal(ukulele.id, 'UKULELE');
  assert.ok(ukulele.prop, 'l\'evento porta anche un oggetto separato dalla posa');

  const storyEvento = JSON.parse(JSON.stringify(story));
  storyEvento.regia.probabilitaEvento = 1;
  let visto = false;
  for (let tentativi = 0; tentativi < 5 && !visto; tentativi++) {
    VN.clearSave();
    VN.boot(storyEvento, { speed: 0, banca, quiz, scene: 'keynote' });
    VN.state.genere = 'f'; VN.state.stile = 'hawaiano'; VN.state.nome = 'Franca';
    VN.state.eventi_sacchetto = ['UKULELE'];
    VN.state.categoria = 'watch';
    for (let g = 0; g < 60; g++) {
      if (txt().includes('Un ukulele')) {
        assert.equal($('evpropwrap').classList.contains('on'), true, 'lo slot dell\'oggetto si accende');
        assert.ok($('evprop').getAttribute('src').includes('prop_ukulele'), 'con l\'ukulele dentro');
        assert.ok($('ioImg').getAttribute('src').includes('stile_hawaiano_evento_stacchetto'),
          'e l\'avatar prende comunque la sua posa dedicata, non quella generica');
        VN.step();                                             // -> la battuta della regia, poi le scelte
        [...$('choices').querySelectorAll('.ch')][0].onclick({ stopPropagation() {} });
        assert.equal($('evpropwrap').classList.contains('on'), false,
          'l\'ukulele sparisce con l\'evento, non resta in scena');
        visto = true;
        break;
      }
      if ($('griglia').classList.contains('on')) {
        [...$('griglia').querySelectorAll('.gcell')].filter((c) => !c.classList.contains('fatta'))[0]
          ?.onclick({ stopPropagation() {} });
      } else if ($('choices').classList.contains('on')) {
        [...$('choices').querySelectorAll('.ch')][0].onclick({ stopPropagation() {} });
      } else VN.step();
    }
  }
  assert.ok(visto, 'l\'evento dell\'ukulele non e\' comparso nemmeno a probabilita\' 1');
}

/* ---------- 5n. Martha non esiste piu' da nessuna parte ----------
   Non basta toglierla dalle scene: un id rimasto in un dato o in un asset la
   riporterebbe dentro in silenzio. */
{
  const daControllare = ['game/story.json', 'game/domande.json', 'game/quiz.json',
    'game/engine.js', 'game/engine.css', 'index.html'];
  for (const f of daControllare) {
    const testo = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.doesNotMatch(testo, /martha/i, `${f}: c'e' ancora un riferimento a Martha`);
  }
  const chars = fs.readdirSync(path.join(ROOT, base, 'chars'));
  const orfani = chars.filter((f) => /martha/i.test(f));
  if (orfani.length) console.log(`asset di Martha rimasti, non piu' usati da nessuna scena: ${orfani.join(', ')}`);
}

/* ---------- 5h. S5: il keynote si chiude da solo ----------
   Fatti tutti e tre i macroargomenti la griglia deve cedere il turno e mandare
   avanti la scena. Senza, il giocatore resterebbe a girare per sempre fra tre
   pannelli tutti spenti. */
{
  VN.clearSave();
  VN.boot(story, { speed: 0, banca, quiz, scene: 'keynote' });
  VN.state.genere = 'f'; VN.state.stile = 'ingegnere'; VN.state.nome = 'Franca';

  const bottoni = () => [...$('choices').querySelectorAll('.ch')];
  const celle = () => [...$('griglia').querySelectorAll('.gcell')];
  // Un giocatore che tira dritto: sceglie sempre la prima opzione, tappa via
  // tutto il resto. Il limite di giri e' una rete di sicurezza, non un'attesa:
  // se il keynote non finisce, il test si ferma e lo dice.
  let giri = 0;
  while (VN.sceneId !== 'teleprompter' && giri++ < 900) {
    if ($('griglia').classList.contains('on')) {
      const libere = celle().filter((c) => !c.classList.contains('fatta'));
      if (!libere.length) { VN.step(); continue; }
      libere[0].onclick({ stopPropagation() {} });
    } else if ($('choices').classList.contains('on')) {
      bottoni()[0].onclick({ stopPropagation() {} });
    } else {
      VN.step();
    }
  }
  assert.equal(VN.sceneId, 'teleprompter', `il keynote non si e' chiuso in ${giri} passi`);
  for (const k of ['iphone', 'watch', 'altro']) {
    assert.equal(Object.keys(VN.state.picks[k].core).length, banca.categorie[k].core.length,
      `${k}: mancano delle core`);
    assert.equal(Object.keys(VN.state.picks[k].extra).length, banca.categorie[k].n_extra_da_pescare,
      `${k}: le facoltative pescate non sono state giocate tutte`);
  }
  assert.equal(VN.state.intermezzi, 4, 'quattro intermezzi: uno all\'inizio e uno per macroargomento');
  assert.ok(VN.state.punti > 0, 'il punteggio si accumula');
  // il sacchetto degli eventi non si ripete: ogni evento al massimo una volta
  assert.ok(VN.state.eventi_sacchetto, 'il sacchetto degli eventi e\' stato creato');
  const tutti = banca.micro_eventi.length + 1;
  assert.ok(VN.state.eventi_sacchetto.length < tutti, 'e qualche evento e\' uscito');

  /* ---------- S6: recap, modifica, blocco ---------- */
  // si arriva qui con una partita vera alle spalle: e' il momento giusto per
  // provare il recap, che senza risposte non avrebbe niente da mostrare
  VN.step(); VN.step();                                        // le due battute di Susan
  assert.ok($('recap').classList.contains('on'), 'il recap si apre');
  assert.ok($('boxwrap').classList.contains('recap'), 'il box lascia spazio alla lista');

  const righe = () => [...$('recap').querySelectorAll('.rriga')];
  const titoli = [...$('recap').querySelectorAll('.rtit')].map((t) => t.textContent);
  assert.deepEqual(titoli, ['iPhone', 'Watch', 'Altro'], 'una sezione per macroargomento');
  // 12 core + 9 facoltative pescate: tutte le risposte sono in lista
  assert.equal(righe().length, 21, 'tutte le domande giocate sono in lista');
  assert.equal(righe().filter((r) => r.classList.contains('vuota')).length, 0,
    'nessun posto libero: le facoltative erano state giocate tutte');

  // modificare una riga: si riapre la stessa domanda e il punteggio si aggiorna
  const puntiPrima = VN.state.punti;
  const primaDomanda = banca.categorie.iphone.core[0];
  righe()[0].onclick({ stopPropagation() {} });
  assert.equal(txt(), primaDomanda.q, 'tocco la riga e torna la domanda originale');
  const opz = [...$('choices').querySelectorAll('.ch')];
  assert.equal(opz.length, primaDomanda.opzioni.length);
  const ultima = primaDomanda.opzioni[primaDomanda.opzioni.length - 1];
  opz[opz.length - 1].onclick({ stopPropagation() {} });
  assert.ok($('recap').classList.contains('on'), 'e si torna al recap');
  assert.equal(VN.state.picks.iphone.core[primaDomanda.id].v, ultima.label, 'la risposta e\' cambiata');
  // il totale e' ricalcolato dalle risposte, non accumulato: senza, correggere
  // una risposta lascerebbe i punti della vecchia dentro al conto
  assert.equal(VN.state.punti,
    puntiPrima - primaDomanda.opzioni[0].pt + ultima.pt, 'e il punteggio si e\' aggiornato');

  // il blocco e' irreversibile: prima la conferma
  assert.equal(VN.state.locked, false);
  $('blocca').onclick({ stopPropagation() {} });
  assert.ok($('modal').classList.contains('on'), 'conferma prima di chiudere la schedina');
  [...$('modalbtns').querySelectorAll('.ch')][1].onclick({ stopPropagation() {} });   // fammi rileggere
  assert.equal(VN.state.locked, false, 'annullare non chiude niente');
  assert.ok($('recap').classList.contains('on'), 'e si resta sul recap');

  $('blocca').onclick({ stopPropagation() {} });
  [...$('modalbtns').querySelectorAll('.ch')][0].onclick({ stopPropagation() {} });
  assert.equal(VN.state.locked, true, 'la schedina e\' chiusa');
  assert.equal(VN.sceneId, 'finale', 'e si va al finale');
  // senza chiave configurata l'invio non si perde: resta in coda per il prossimo avvio
  const coda = JSON.parse(dom.window.localStorage.getItem('fl_nexus_da_inviare') || 'null');
  assert.ok(coda, 'la schedina non spedita resta in coda');
  assert.equal(coda.stile, 'ingegnere');
  assert.equal(coda.punti, VN.state.punti);
  assert.ok(coda.picks.iphone.core, 'e porta con se\' tutte le risposte');
  assert.ok(!('submitted_at' in coda), 'il timestamp lo mette il server, non il client');
}

/* ---------- 5g. S5: la regola d'oro della platea ----------
   La reazione della platea non deve MAI dipendere da quale opzione e' stata
   scelta: se lo facesse, il gioco suggerirebbe le risposte e i pronostici non
   varrebbero piu' niente. Si verifica che rispondendo sempre allo stesso modo
   la reazione cambi comunque, e che le reazioni pescabili non comprendano
   quelle riservate (il silenzio e il coro dello Showman). */
{
  assert.ok(story.reazioni?.length >= 2, 'ci sono piu' + ' reazioni fra cui pescare');
  for (const r of story.reazioni) {
    assert.ok(story.assets.platea[r], `reazione "${r}" non dichiarata fra gli asset platea`);
  }
  assert.ok(!story.reazioni.includes('coro_nome'),
    'il coro col nome e\' solo dell\'evento dello Showman, non pescabile a caso');
  assert.ok(!story.reazioni.includes('platea_idle'), 'l\'idle e\' lo stato di riposo, non una reazione');

  const viste = new Set();
  for (let giro = 0; giro < 24; giro++) {
    // Si entra dalla griglia, come farebbe un giocatore: la scena "argomento"
    // parte subito all'avvio, quindi impostare le variabili dopo un boot diretto
    // arriverebbe troppo tardi e il giro delle domande verrebbe saltato.
    VN.clearSave();
    VN.boot(story, { speed: 0, banca, quiz, scene: 'argomenti' });
    VN.state.stile = 'drip'; VN.state.nome = 'Franca';
    [...$('griglia').querySelectorAll('.gcell')][0].onclick({ stopPropagation() {} });
    $('plateaImg').removeAttribute('src');                     // niente residui dal giro prima
    [...$('choices').querySelectorAll('.ch')][0].onclick({ stopPropagation() {} });  // sempre la stessa
    VN.step();
    const src = $('plateaImg').getAttribute('src');
    if (src) viste.add(src.split('/').pop());
  }
  assert.ok(viste.size >= 2,
    `rispondendo sempre uguale la platea ha reagito sempre allo stesso modo (${[...viste]}): la reazione sta seguendo la risposta`);
}

/* ---------- 5j. S7: finale, countdown, card ---------- */
{
  VN.clearSave();
  VN.boot(story, { speed: 0, banca, quiz, scene: 'finale' });
  VN.state.genere = 'f'; VN.state.stile = 'drip'; VN.state.nome = 'Franca';
  VN.state.store = 'liberty'; VN.state.locked = true;
  VN.state.picks = { iphone: { core: { 'IPHONE.C1': { v: 'x', p: 6 } } } };

  // la sagoma alla porta e' un fondale, non uno sprite: e' bg_finale_porta_vicino
  const passi = story.scenes.finale.steps.map((x) => x.t);
  assert.ok(passi.includes('nero'), 'il finale chiude sul nero');
  const sfondi = story.scenes.finale.steps.filter((x) => x.t === 'bg').map((x) => x.id);
  assert.deepEqual(sfondi, ['finale_porta_illuminata', 'finale_porta_vicino', 'finale_porta_pollice'],
    'la porta in fondo, la sagoma da vicino, il pollice in su');
  // I tre fotogrammi sono fondali, non sprite: sovrapporre chr_ceo_pollice_su
  // alla sagoma gia' disegnata dentro bg_finale_porta_vicino metteva due
  // persone nella stessa porta.
  assert.ok(!story.cast.ceo, 'il CEO non e\' un personaggio in scena: e\' nei fondali');

  VN.boot(story, { speed: 0, banca, quiz, scene: 'countdown' });
  VN.state.nome = 'Franca'; VN.state.stile = 'drip';
  VN.state.picks = { iphone: { core: { 'IPHONE.C1': { v: 'x', p: 6 } } } };
  VN.i = 0; VN.step();
  assert.ok($('countdown').classList.contains('on'), 'il countdown si apre');
  assert.match($('cdtempo').textContent, /^\d+g \d\d:\d\d:\d\d$/,
    `il tempo che manca non e' formattato: "${$('cdtempo').textContent}"`);
  const azioni = [...$('cdbtn').querySelectorAll('.ch')];
  assert.deepEqual(azioni.map((b) => b.textContent),
    ['Il quiz di Peter', 'Apple Campus Run', 'Torna in lobby', 'La tua card'],
    'e\' la schermata su cui si rientra: le due sfide stanno prima delle altre vie');

  // la corsa si apre SOPRA il countdown e non cambia scena: chiudendola il
  // giocatore e' esattamente dov'era, come per il regolamento e i quadri
  azioni[1].onclick({ stopPropagation() {} });
  assert.ok($('runwrap').classList.contains('on'), 'la corsa si apre');
  assert.ok($('countdown').classList.contains('on'), 'e il countdown resta acceso sotto');
  assert.equal(VN.sceneId, 'countdown', 'la corsa non e\' una scena');
  $('runchiudi').onclick({ stopPropagation() {} });
  assert.equal($('runwrap').classList.contains('on'), false, 'chiusa la corsa, si torna dov\'era');
  assert.ok($('countdown').classList.contains('on'), 'e il countdown e\' ancora li\'');

  azioni[2].onclick({ stopPropagation() {} });
  assert.equal(VN.sceneId, 'lobby', 'da qui si torna in lobby');
  assert.equal($('countdown').classList.contains('on'), false, 'e il countdown si chiude');
}

/* ---------- 5k. S0B: chi riapre con la schedina chiusa ----------
   Non c'e' niente da riprendere: la partita e' chiusa, quindi si torna al
   countdown invece di offrire "riprendi da dove eri". */
{
  VN.clearSave();
  VN.boot(story, { speed: 0, banca, quiz, scene: 'countdown' });
  VN.state.nome = 'Franca'; VN.state.locked = true; VN.state.stile = 'drip';
  VN.progressed = true;
  VN.saveNow();
  assert.ok(VN.hasSave(story));

  VN.boot(story, { speed: 0, banca, quiz });
  assert.equal(VN.sceneId, 'countdown', 'chi ha gia\' bloccato torna al countdown');
  assert.equal($('choices').classList.contains('on'), false,
    'e non gli viene chiesto se vuole riprendere: non c\'e\' niente da riprendere');
  VN.clearSave();
}

/* ---------- 5b. S1: hub della lobby a quattro zone ----------
   Il vincolo dello script e' che la tenda NON sia toccabile finche' il giocatore
   non ha scorso almeno una volta: senza quello entra in sala senza accorgersi che
   la lobby era visitabile, e la meta' del contenuto di S1 non la vede nessuno. */
{
  VN.clearSave();
  VN.boot(story, { speed: 0, banca, quiz, scene: 'lobby' });
  const spots = () => [...$('hubspots').querySelectorAll('.hspot')];
  const dots = () => [...$('hdots').querySelectorAll('.hdot')];

  VN.step(); VN.step(); VN.step();      // le tre battute di Francesca prima dell'hub
  assert.ok($('hub').classList.contains('on'), 'l\'hub si apre dopo l\'introduzione');
  assert.ok($('hubnav').classList.contains('on'), 'frecce e pallini visibili');

  // quattro zone: la quarta e' quella chiusa, perche' locked e' ancora false
  assert.equal(dots().length, 4, 'quattro zone, come nello script');
  assert.equal(dots()[0].classList.contains('sel'), true, 'si parte dalla tenda');
  assert.equal(VN.state.locked, false);

  // prima dello swipe: la tenda si vede ma non si entra
  assert.equal(spots().length, 1);
  assert.ok(spots()[0].classList.contains('chiuso'), 'ENTRA disattivato prima del tutorial');
  assert.match(txt(), /Scorri per scoprire la lobby/, 'parla il tutorial, non la zona');
  spots()[0].onclick({ stopPropagation() {} });
  assert.equal(VN.sceneId, 'lobby', 'toccare ENTRA prima dello swipe non porta via');
  assert.match(txt(), /prima fatti un giro/i, 'e spiega perche\'');

  // uno swipe: si passa alla Hall of Fame
  $('hnext').onclick({ stopPropagation() {} });
  assert.ok(dots()[1].classList.contains('sel'), 'seconda zona');
  assert.ok($('bg').getAttribute('src').includes('halloffame_frontale'),
    'fondale della zona 2: la parete con i tre quadri');
  assert.match(txt(), /Hall of Fame/);
  assert.ok($('npcBody').getAttribute('src').includes('chr_francesca_presenta'),
    'Francesca c\'e\' anche qui, e presenta la parete');
  // Lo scorrimento si anima sul fondale, non sul personaggio: #npc ha gia' la sua
  // animazione d'ingresso, e una seconda la sovrascriveva lasciandolo trasparente
  // a fine corsa — a schermo Francesca spariva da tutte le zone dopo il primo swipe.
  assert.ok($('bg').classList.contains('vaiSx'), 'il fondale scorre');
  assert.equal($('npc').classList.contains('vaiSx'), false, 'il personaggio no');
  assert.ok($('npc').classList.contains('in'), 'ed entra con la sua animazione');
  /* La Hall of Fame e' una piccola galleria: tre quadri, uno per vincitore, e
     ognuno si apre per conto suo. Guardarli non e' una scena e non deve toccare
     la partita, come il regolamento. */
  assert.equal(spots().length, 3, 'tre quadri, uno per edizione');
  const primaDeiQuadri = JSON.stringify(VN.state);
  spots()[1].onclick({ stopPropagation() {} });
  assert.equal(VN.sceneId, 'lobby', 'aprire un quadro non cambia scena');
  assert.ok($('quadrowrap').classList.contains('on'), 'si apre la visuale del quadro');
  assert.ok($('quadroImg').getAttribute('src').includes('halloffame_michael'),
    'e dentro c\'e\' il vincitore che ho toccato, lui solo');
  $('quadrochiudi').onclick({ stopPropagation() {} });
  assert.equal($('quadrowrap').classList.contains('on'), false, 'si chiude');
  assert.ok($('hub').classList.contains('on'), 'e si torna nella Hall of Fame');
  spots()[2].onclick({ stopPropagation() {} });
  assert.ok($('quadroImg').getAttribute('src').includes('halloffame_nicola'),
    'ogni quadro ha la sua visuale');
  $('quadrochiudi').onclick({ stopPropagation() {} });
  assert.equal(JSON.stringify(VN.state), primaDeiQuadri,
    'guardare i quadri non tocca la partita');

  // zona 4: Peter dorme finche' i pronostici non sono chiusi
  $('hnext').onclick({ stopPropagation() {} });
  $('hnext').onclick({ stopPropagation() {} });
  assert.ok(dots()[3].classList.contains('sel'), 'quarta zona');
  assert.ok($('bg').getAttribute('src').includes('quiz_bloccata'), 'zona 4 ancora chiusa');
  assert.ok($('npcBody').getAttribute('src').includes('chr_peter_dorme'), 'Peter dorme');
  // si vede Peter, ma a commentare e' Francesca: chi parla e chi e' in scena
  // sono due cose diverse
  assert.equal($('name').textContent, 'Francesca', 'la battuta sulla zona 4 e\' di Francesca');
  spots()[0].onclick({ stopPropagation() {} });
  assert.ok($('npcBody').getAttribute('src').includes('chr_peter_annoiato'), 'al tocco si sveglia, ma annoiato');
  assert.equal($('name').textContent, 'Peter', 'ma al tocco parla Peter');
  assert.match(txt(), /Ti ho sentito/);
  VN.step();
  assert.equal($('name').textContent, 'Francesca', 'Francesca chiude la presentazione di Peter');
  assert.match(txt(), /ancora vivo/);
  assert.equal(VN.sceneId, 'lobby', 'la zona 4 chiusa non porta al quiz');

  // giro completo: si torna alla tenda, e adesso ENTRA e' attivo
  $('hnext').onclick({ stopPropagation() {} });
  assert.ok(dots()[0].classList.contains('sel'), 'l\'hub e\' circolare');
  assert.equal(spots()[0].classList.contains('chiuso'), false, 'dopo lo swipe ENTRA si accende');
  // fatto il giro, Francesca non ripete cos'e' la tenda: dalla seconda volta in
  // poi compare solo qui, e solo per dire che di la' comincia lo show
  assert.match(txt(), /Dietro questa tenda/, 'al ritorno sulla tenda la battuta cambia');
  assert.equal($('name').textContent, 'Francesca', 'ed e\' Francesca a dirla');
  assert.ok($('npc').classList.contains('in'), 'Francesca ricompare davanti alla tenda');
  assert.ok($('boxwrap').classList.contains('in'), 'con il box a schermo');

  // le altre zone, rivedendole, restano mute: niente Francesca, niente box
  $('hnext').onclick({ stopPropagation() {} });
  assert.equal(txt(), '', 'la zona gia\' vista non ripete la presentazione');
  assert.ok($('boxwrap').classList.contains('muto'), 'e il fumetto sparisce');
  // ...ma il contenitore resta acceso: dentro ci sono le frecce per cambiare
  // zona, e senza quelle il giocatore non ha piu' nessun comando visibile
  assert.ok($('boxwrap').classList.contains('in'), 'le frecce restano a schermo');
  assert.ok($('hubnav').classList.contains('on'), 'la barra delle zone e\' accesa');
  assert.equal($('npc').classList.contains('in'), false, 'Francesca non e\' piu\' in scena');
  // Peter pero' resta: e' scenografia, non la guida. Prima spariva e il
  // tavolino del quiz restava vuoto.
  $('hnext').onclick({ stopPropagation() {} });
  $('hnext').onclick({ stopPropagation() {} });
  assert.ok($('bg').getAttribute('src').includes('quiz_bloccata'), 'zona 4, gia' + '\' vista');
  assert.equal(txt(), '', 'la zona non ripete la presentazione');
  assert.ok($('npc').classList.contains('in'), 'ma Peter e\' ancora al suo tavolino');
  assert.ok($('npcBody').getAttribute('src').includes('chr_peter_dorme'), 'e dorme, come prima');
  $('hnext').onclick({ stopPropagation() {} });
  $('hnext').onclick({ stopPropagation() {} });

  // ...e i quadri restano guardabili anche nella zona muta: non serve una
  // battuta per aprirli, li apre il tocco
  spots()[0].onclick({ stopPropagation() {} });
  assert.ok($('quadrowrap').classList.contains('on'), 'il quadro si apre lo stesso');
  assert.ok($('quadroImg').getAttribute('src').includes('halloffame_fabio'));
  $('quadrochiudi').onclick({ stopPropagation() {} });
  $('hprev').onclick({ stopPropagation() {} });
  assert.match(txt(), /Dietro questa tenda/, 'e sulla tenda la battuta si ripete');

  // entrare e' irreversibile: prima la conferma
  spots()[0].onclick({ stopPropagation() {} });
  assert.ok($('modal').classList.contains('on'), 'conferma prima di entrare in sala');
  assert.equal(VN.sceneId, 'lobby', 'la modale aperta non ha ancora cambiato scena');
  [...$('modalbtns').querySelectorAll('.ch')][1].onclick({ stopPropagation() {} });   // Non ancora
  assert.equal(VN.sceneId, 'lobby', '"Non ancora" riporta nell\'hub');
  assert.ok($('hub').classList.contains('on'), 'l\'hub e\' ancora aperto');

  spots()[0].onclick({ stopPropagation() {} });
  [...$('modalbtns').querySelectorAll('.ch')][0].onclick({ stopPropagation() {} });   // Si', entro
  assert.equal(VN.sceneId, 'aggancio', 'ENTRA porta in sala');
  assert.equal($('hub').classList.contains('on'), false, 'uscendo, l\'hub si chiude');
  assert.equal($('hubspots').children.length, 0, 'e non lascia hotspot appesi sopra la scena');
}

/* ---------- 5c. la zona 4 cambia faccia quando i pronostici sono chiusi ---------- */
{
  VN.clearSave();
  VN.boot(story, { speed: 0, banca, quiz, scene: 'lobby' });
  VN.state.locked = true;                       // come dopo il lock di S6
  VN.state.post_lobby_visto = true;             // la sequenza del ritorno l'ha gia' vista
  VN.step(); VN.step(); VN.step();
  const dots = () => [...$('hdots').querySelectorAll('.hdot')];
  assert.equal(dots().length, 4, 'restano quattro zone anche dopo il lock');
  // dopo le previsioni l'hub si apre gia' su Peter: e' quello che resta da fare
  assert.ok($('bg').getAttribute('src').includes('quiz_aperta'), 'zona 4 aperta');
  assert.ok($('npcBody').getAttribute('src').includes('chr_peter_prego'), 'Peter sveglio, e invita al tavolo');
  const spot = $('hubspots').querySelector('.hspot');
  spot.onclick({ stopPropagation() {} });
  [...$('modalbtns').querySelectorAll('.ch')][0].onclick({ stopPropagation() {} });
  assert.equal(VN.sceneId, 'quiz', 'ora la zona 4 porta al quiz');
}


/* ---------- 5c-bis. il ritorno in lobby dopo le previsioni ----------
   Chiuse le previsioni, il giocatore torna in lobby e Francesca gli dice che ha
   finito una fase, non il gioco, e che il pezzo che resta e' Peter. Va detto una
   volta sola: la seconda volta che si torna in lobby (dal countdown, o
   riaprendo il gioco) la lobby e' muta e si riparte dall'hub. */
{
  VN.clearSave();
  VN.boot(story, { speed: 0, banca, quiz, scene: 'lobby' });
  VN.state.locked = true;
  assert.equal(VN.state.post_lobby_visto, false, 'la sequenza non e\' ancora stata vista');
  // le battute d'apertura ("io sono Francesca") valgono solo prima del keynote:
  // sono dichiarate con "se locked = false", e con la partita chiusa non partono.
  // (Qui il flag si alza a scena gia' avviata, quindi le prime tre si vedono
  //  comunque: quello che si verifica e' la condizione nello script.)
  const intro = story.scenes.lobby.steps.filter(
    (st) => (st.t === 'say' || st.t === 'show') && /Io sono Francesca|non si inizia senza di te|verso la tenda/.test(String(st.text || '')));
  assert.ok(intro.length >= 2 && intro.every((st) => st.se && st.se.var === 'locked' && st.se.is === false),
    'le battute d\'apertura sono legate a "previsioni non ancora fatte"');
  const dette = [];
  for (let k = 0; k < 12 && !$('hub').classList.contains('on'); k++) {
    if (txt()) dette.push(txt());
    VN.step();
  }
  const tutto = dette.join(' | ');
  assert.match(tutto, /com'e' andata/, 'POST-L01: si congratula');
  assert.match(tutto, /Ma non abbiamo finito/, 'POST-L03: il gioco non e\' finito');
  assert.match(tutto, /Vai da Peter/, 'POST-L05: indirizza al quiz');
  assert.match(tutto, /moltiplicare i punti/, 'POST-L06: e spiega a cosa serve');
  assert.ok($('hub').classList.contains('on'), 'e poi si torna a girare la lobby');
  assert.equal(VN.state.post_lobby_visto, true, 'la sequenza si segna come vista');
  // la posa "orgogliosa", che prima non usava nessuno, e' qui
  const orgogliosa = story.scenes.lobby.steps.some(
    (st) => st.t === 'show' && st.who === 'francesca' && st.body === 'orgogliosa');
  assert.ok(orgogliosa, 'Francesca orgogliosa compare al ritorno in lobby');
  assert.ok(story.cast.francesca.bodies.orgogliosa, 'e la posa e\' dichiarata nel cast');
  // niente tutorial dello swipe: la lobby l'ha gia' girata tutta
  assert.ok(!/Scorri per scoprire la lobby/.test(txt()), 'niente tutorial al ritorno');

  // seconda volta: muta, si riparte direttamente dall'hub
  const stato = VN.state;
  VN.boot(story, { speed: 0, banca, quiz, scene: 'lobby' });
  VN.state = stato;
  VN.step(); VN.step(); VN.step();
  assert.ok($('hub').classList.contains('on'), 'la seconda volta si arriva subito all\'hub');
  VN.clearSave();
}

/* ---------- 5o. la zona 3 e' il regolamento, non piu' la teca dei premi ----------
   E' una zona da leggere: si apre sopra la lobby, si chiude, e la partita deve
   trovarsi esattamente come prima. Se toccasse anche una sola variabile della
   run sarebbe un bug grosso — uno che legge le regole non sta giocando. */
{
  const zone = story.scenes.lobby.steps.find((st) => st.t === 'hub').zones;
  // la zona 1 e' scritta due volte (prima e dopo le previsioni): il regolamento
  // si cerca per id, non per posizione
  const z3 = zone.find((z) => z.id === 'regolamento');
  assert.ok(z3, 'la zona del regolamento c\'e\'');
  assert.equal(z3.bg, 'lobby_z3_regolamento');
  assert.ok(fs.existsSync(path.join(ROOT, base + story.assets.bg.lobby_z3_regolamento)),
    'il fondale nuovo del regolamento esiste su disco');
  assert.equal(story.assets.bg.lobby_z3_premi, undefined, 'la teca dei premi non e\' piu\' dichiarata');
  assert.match(z3.say, /Il regolamento e' li'/, 'Francesca introduce la sezione');
  assert.equal(z3.hotspots.length, 1);
  assert.equal(z3.hotspots[0].apre, 'regolamento');
  assert.equal(z3.hotspots[0].goto, undefined, 'non porta a una scena separata: resta nella lobby');

  // il testo: due gruppi, le regole del gioco e le informazioni sul progetto
  const r = story.regolamento;
  assert.deepEqual(r.sezioni.map((x) => x.titolo), ['COME SI GIOCA', 'PUNTEGGI'],
    'le due voci delle regole');
  assert.deepEqual(r.informazioni.map((x) => x.titolo),
    ['PARTECIPAZIONE', 'IL PROGETTO', 'PRIVACY E DATI', 'SICUREZZA', 'INDIPENDENZA',
     'MARCHI E CONTENUTI', 'CONTATTI'], 'le sette voci sul progetto');
  assert.match(r.gruppo, /INFORMAZIONI SUL PROGETTO/);
  assert.ok(r.chiusa?.testo, 'la regola non scritta c\'e\'');
  assert.match(r.chiusa.titolo, /REGOLA NON SCRITTA/);
  // "NOTE LEGALI" e' proprio il titolo che la specifica non vuole
  assert.doesNotMatch(JSON.stringify(r), /NOTE LEGALI/i, 'niente "NOTE LEGALI"');
  for (const sez of [...r.sezioni, ...r.informazioni]) {
    assert.ok(sez.id, `sezione "${sez.titolo}" senza id`);
    assert.ok(sez.righe.length, `sezione ${sez.titolo} vuota`);
  }

  // la parte legale deve dire il vero: quello che c'e' scritto qui e' anche
  // quello che il gioco fa davvero
  const privacy = JSON.stringify(r.informazioni.find((x) => x.id === 'privacy'));
  assert.match(privacy, /Supabase/, 'la privacy dice dove finiscono i dati');
  assert.match(privacy, /Unione Europea/);
  assert.match(privacy, /memoria locale del browser/, 'e che il gioco usa il salvataggio locale');
  assert.match(privacy, /30\s*giorni/, 'e per quanto tempo li tiene');
  assert.match(privacy, /hello@fantaliberty\.com/, 'e a chi scrivere');
  assert.match(JSON.stringify(r.informazioni.find((x) => x.id === 'indipendenza')),
    /non e' affiliato, sponsorizzato o approvato da Apple/, 'e che non c\'entra con Apple');

  // apertura vera dalla lobby
  VN.clearSave();
  VN.boot(story, { speed: 0, banca, quiz, scene: 'lobby' });
  VN.state.genere = 'f';
  VN.step(); VN.step(); VN.step();                       // fino all'hub
  $('hnext').onclick({ stopPropagation() {} });
  $('hnext').onclick({ stopPropagation() {} });          // zona 3
  assert.ok($('bg').getAttribute('src').includes('lobby_z3_regolamento'), 'fondale del regolamento');
  assert.match(txt(), /qualche possibilita' di sbagliare/, 'Francesca dice la sua battuta');

  // una fotografia della partita prima di aprire
  const prima = JSON.stringify(VN.state);
  const scenaPrima = VN.sceneId;

  $('hubspots').querySelector('.hspot').onclick({ stopPropagation() {} });
  assert.ok($('regole').classList.contains('on'), 'il regolamento si apre');
  assert.ok($('bg').classList.contains('sfoca'), 'e il fondale va fuori fuoco, come nel camerino');
  assert.equal(VN.sceneId, scenaPrima, 'non e\' una scena separata: si resta nella lobby');
  assert.ok($('hub').classList.contains('on'), 'e la lobby resta aperta sotto');

  const sezioni = [...$('regcorpo').querySelectorAll('.regsez')];
  assert.equal(sezioni.length, 10, 'due voci di regole, sette sul progetto, piu\' la regola non scritta');
  assert.match($('regtit').textContent, /REGOLAMENTO/);
  assert.match($('regcorpo').textContent, /INFORMAZIONI SUL PROGETTO/, 'il separatore fra i due gruppi');

  // tutte chiuse all'apertura: l'elenco delle voci deve stare in una schermata
  const teste = [...$('regcorpo').querySelectorAll('.regtesta')];
  assert.equal(teste.length, 9, 'nove voci richiudibili');
  assert.equal(teste.filter((t) => t.querySelector('.regsegno').textContent === '+').length, 9,
    'si parte tutte chiuse');
  assert.equal(sezioni.filter((x) => x.classList.contains('aperta')).length, 0);
  assert.equal(teste[0].getAttribute('aria-expanded'), 'false');

  // aprirne una: il segno diventa meno, il testo e' li'
  teste[0].onclick({ stopPropagation() {} });
  assert.ok(sezioni[0].classList.contains('aperta'), 'la voce si apre');
  assert.equal(teste[0].querySelector('.regsegno').textContent, '\u2212', 'il + diventa meno');
  assert.equal(teste[0].getAttribute('aria-expanded'), 'true');
  assert.match(sezioni[0].textContent, /CONTROCORRENTE/, 'le tre scelte sono spiegate qui dentro');
  teste[0].onclick({ stopPropagation() {} });
  assert.equal(sezioni[0].classList.contains('aperta'), false, 'e si richiude');
  assert.equal(teste[0].querySelector('.regsegno').textContent, '+');

  // i contenuti: quelli di prima non si sono persi, quelli nuovi ci sono
  assert.match($('regcorpo').textContent, /\+3, 0 oppure -3/, 'i micro-eventi');
  assert.match($('regcorpo').textContent, /Peter/, 'il quiz finale');
  assert.match($('regcorpo').textContent, /volontaria e gratuita/, 'la partecipazione');
  assert.match($('regcorpo').textContent, /Apple Inc/, 'i marchi');
  // l'indirizzo e' un link vero, non testo che non si puo' toccare
  const mail = [...$('regcorpo').querySelectorAll('.regmail')];
  assert.ok(mail.length >= 2, 'l\'indirizzo compare in privacy e in contatti');
  assert.equal(mail[0].getAttribute('href'), 'mailto:hello@fantaliberty.com');
  // l'elenco dei dati raccolti e' una lista vera
  assert.ok($('regcorpo').querySelectorAll('.reglista li').length >= 12,
    'l\'elenco dei dati raccolti e\' puntato');
  assert.ok($('regcorpo').querySelector('.regsez.chiusa'), 'la regola non scritta e\' staccata');
  // il testo va declinato come tutto il resto: qui il genere e' femminile
  assert.match($('regcorpo').textContent, /sicura al 100%/, 'anche il regolamento e\' declinato');

  // HO CAPITO chiude e riporta in zona 3, senza aver toccato niente
  assert.match($('regok').textContent, /HO CAPITO/);
  $('regok').onclick({ stopPropagation() {} });
  assert.equal($('regole').classList.contains('on'), false, 'il regolamento si chiude');
  assert.equal($('bg').classList.contains('sfoca'), false, 'e il fondale torna a fuoco');
  assert.ok($('bg').getAttribute('src').includes('lobby_z3_regolamento'), 'si resta in zona 3');
  assert.ok($('hub').classList.contains('on'), 'e la lobby e\' di nuovo navigabile');
  assert.equal(JSON.stringify(VN.state), prima,
    'leggere il regolamento non deve cambiare NIENTE della partita');

  // e la zona 4 continua a funzionare dopo esserci passati
  $('hnext').onclick({ stopPropagation() {} });
  assert.ok($('bg').getAttribute('src').includes('quiz_bloccata'), 'la zona 4 e\' ancora li\'');
}

/* ---------- 5p. della teca dei premi non resta niente di funzionale ---------- */
{
  for (const f of ['game/story.json', 'game/engine.js', 'index.html']) {
    const testo = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.doesNotMatch(testo, /teca|lobby_z3_premi|obj_teca_premi/i,
      `${f}: c'e' ancora un riferimento alla teca dei premi`);
  }
  const bgs = fs.readdirSync(path.join(ROOT, base, 'bg'));
  const orfani = bgs.filter((f) => /z3_premi/.test(f));
  if (orfani.length) console.log(`fondale della vecchia teca, non piu' usato: ${orfani.join(', ')}`);
}


/* ---------- 5q. i titoli di coda ----------
   Vengono dopo il pollice in su del CEO e prima del countdown, e vanno da soli:
   e' una sequenza da guardare, non da tappare riga per riga. Un tocco solo la
   salta tutta. */
{
  const passi = story.scenes.finale.steps;
  const iTitoli = passi.findIndex((st) => st.t === 'title');
  const iPollice = passi.findIndex((st) => st.t === 'bg' && st.id === 'finale_porta_pollice');
  assert.ok(iPollice >= 0, 'la porta col pollice in su c\'e\' ancora');
  assert.ok(iTitoli > iPollice, 'i titoli vengono DOPO la comparsa del CEO');
  // Fine delle previsioni -> email facoltativa -> titoli -> cartello -> lobby.
  // Il countdown non e' piu' la fine del gioco: ci si arriva dopo il quiz.
  const iMail = passi.findIndex((st) => st.t === 'email');
  assert.ok(iMail >= 0 && iMail < iTitoli, 'l\'email si chiede prima dei titoli di coda');
  assert.equal(story.scenes.finale.next, 'lobby', 'e dopo i titoli si torna in lobby');

  const blocchi = passi[iTitoli].blocchi;
  assert.equal(blocchi.length, 5, 'cinque blocchi, come da specifica');
  const testo = (b) => b.righe.map((r) => (typeof r === 'string' ? r : r.text));
  assert.deepEqual(testo(blocchi[0]), ['FANTALIBERTY', 'STORY']);
  assert.deepEqual(testo(blocchi[1]), ['CREATO DA', 'Lorenzo', 'Michael']);
  // "I due nomi devono avere lo stesso peso visivo": stessa classe, niente big/small
  const nomi = blocchi[1].righe.slice(1);
  assert.ok(nomi.every((r) => !r.big && !r.small), 'Lorenzo e Michael hanno lo stesso peso');
  assert.deepEqual(testo(blocchi[2]), ['TEST', 'Qualcuno, probabilmente']);
  assert.deepEqual(testo(blocchi[3]), ['SUPPORTO PSICOLOGICO', 'Assente']);
  assert.deepEqual(testo(blocchi[4]), ['BUDGET', '30 Newton']);

  /* Durata complessiva senza tocchi. L'ultimo blocco NON sfuma — resta a schermo
     con la freccia, da guardare — quindi le dissolvenze sono una in meno dei
     blocchi. */
  const sfuma = passi[iTitoli].dissolvenza ?? 600;
  let ms = 0;
  blocchi.forEach((b, k) => {
    for (const r of b.righe) {
      ms += (typeof r === 'string' ? r : r.text).length * 36;   // typewriter
      ms += (typeof r === 'string' ? 420 : r.pausa ?? 420);
    }
    ms += b.tieni ?? 1200;
    if (k < blocchi.length - 1) ms += sfuma;
  });
  assert.ok(ms > 10000 && ms < 14000,
    `i titoli durano ${(ms / 1000).toFixed(1)}s, fuori dai 12 chiesti`);

  // a velocita' zero la sequenza a tempo non parte e cede subito il turno:
  // senza, il test di percorso resterebbe appeso per quindici secondi
  VN.clearSave();
  VN.boot(story, { speed: 0, banca, quiz, scene: 'finale' });

  /* Il sipario nero si tiene solo per le scene che COMINCIANO su un cartello.
     Cercando un "title" in un punto qualsiasi, il finale — che ha i titoli di
     coda in fondo — restava al buio per tutta la sequenza della porta. */
  assert.equal($('curtain').classList.contains('on'), false,
    'il finale si apre in scena, non sul nero: i titoli stanno in fondo');
  assert.ok(story.scenes.arrivo.steps.some((st) => ['title', 'boot', 'logo'].includes(st.t)));

  let giri = 0;
  while (!$('emailwrap').classList.contains('on') && giri++ < 60) VN.step();
  assert.ok($('emailwrap').classList.contains('on'), 'prima dei titoli si chiede l\'email');
  $('emailsalta').onclick({ stopPropagation() {} });        // "spezzare loro il cuore"
  giri = 0;
  while (VN.sceneId !== 'lobby' && giri++ < 60) VN.step();
  assert.equal(VN.sceneId, 'lobby', 'dopo i titoli e il cartello si torna in lobby');

  /* Il tocco durante i titoli ACCELERA, non salta: ogni blocco compare comunque,
     solo piu' in fretta, e alla fine serve un ultimo tocco per il countdown. La
     sequenza e' a tempo e in jsdom non gira (a speed 0 cede subito il turno),
     quindi qui si presidia il contratto sul codice; il comportamento vero e'
     verificato nel browser, con tre scenari: nessun tocco, un tocco a meta',
     tocchi continui. In tutti e tre i blocchi completati restano cinque. */
  const src = fs.readFileSync(path.join(ROOT, 'game/engine.js'), 'utf8');
  const coda = src.slice(src.indexOf('function titoliDiCoda'),
                         src.indexOf('function typeLines'));
  assert.match(coda, /veloce = true/, 'il tocco mette la sequenza in modalita\' veloce');
  assert.match(coda, /TIENI_VELOCE/, 'e i blocchi restano comunque a schermo, solo meno');
  /* Il tocco non fa sfumare subito il blocco che si sta leggendo: mette in
     modalita' veloce e aspetta lo stesso TIENI_VELOCE. Prima il blocco spariva
     sotto il dito, che e' l'opposto di "accelera". */
  const avanti = coda.slice(coda.indexOf('function avanti'), coda.indexOf('function attendiUltimo'));
  assert.ok(avanti.indexOf('TIENI_VELOCE') > 0, 'il blocco toccato resta il tempo di leggerlo');
  assert.ok(avanti.indexOf('setTimeout') < avanti.indexOf("classList.add('sfumato')"),
    'la dissolvenza arriva DOPO l\'attesa: il blocco non sparisce sotto il dito');

  /* Le prime due schermate (sigla e barra di avvio) si guardano e basta: niente
     freccia e niente tocco che salta. Sono corte apposta — se si allungano,
     torna la voglia di saltarle. */
  const sigla = src.slice(src.indexOf('function sigla'), src.indexOf('function boot'));
  const avvio = src.slice(src.indexOf('function boot'), src.indexOf('function righeTitolo'));
  [['sigla', sigla], ['boot', avvio]].forEach(([nome, corpo]) => {
    assert.doesNotMatch(corpo, /curtainArrow\.style\.opacity = 1/, `${nome}: nessuna freccia`);
    assert.doesNotMatch(corpo, /pending = /, `${nome}: e nessun tocco da aspettare`);
  });
  const apertura = story.scenes.arrivo.steps;
  const durata = (t, campi) => campi.reduce((n, k) => n + (apertura.find((x) => x.t === t)[k] || 0), 0);
  assert.ok(durata('logo', ['nero', 'accensione', 'fisso', 'uscita']) <= 4000,
    'la sigla sta sotto i quattro secondi');
  assert.ok(durata('boot', ['ms', 'cursore']) <= 3200, 'e la barra di avvio pure');

  /* Il cartello d'apertura si scrive fino in fondo: il tocco durante la
     scrittura non lo completa a meta'. Finito, arriva la freccia. */
  const cartello = apertura.find((x) => x.t === 'title');
  assert.equal(cartello.ritmo, 0.9, 'il cartello si scrive un decimo piu\' svelto');
  assert.match(src, /if \(senzaSalto\) return true;/,
    'il tocco durante una scrittura senza salto non fa niente');
  assert.match(src, /senzaSalto: st\.senzaSalto !== false/,
    'e il cartello d\'apertura nasce cosi\'');
  assert.doesNotMatch(coda.slice(coda.indexOf('function avanti'), coda.indexOf('function attendiUltimo')),
    /done\(\)/, 'il tocco NON chiude la sequenza: passa al blocco dopo');
  assert.match(coda, /pending = chiudi;[\s\S]{0,80}curtainArrow\.style\.opacity = 1/,
    'finito l\'ultimo blocco si aspetta un tocco, con la freccia');
  // e l'ultimo blocco non sfuma prima della freccia, altrimenti si aspetterebbe
  // su uno schermo vuoto
  assert.match(coda, /if \(i >= blocchi\.length\) return attendiUltimo\(\);\s*\n\s*el\.curtainTxt\.classList\.add\('sfumato'\)/,
    'l\'ultimo blocco resta a schermo invece di sfumare nel nero');
}

/* ---------- 5q-ter. l'email facoltativa ----------
   Sta fra le previsioni e i titoli di coda, e deve restare facoltativa: si va
   avanti anche saltandola. E' anche il momento in cui la partita parte davvero
   verso il server — al blocco viene solo messa in coda, cosi' la riga spedita e'
   una sola e, se l'email c'e', ce l'ha dentro. */
{
  const passo = story.scenes.finale.steps.find((st) => st.t === 'email');
  assert.match(passo.titolo, /DOVE TI TROVIAMO/);
  // snella: niente etichetta sopra il campo, lo dice gia' il segnaposto
  assert.equal(passo.label, undefined, 'niente etichetta sopra il campo');
  assert.match(passo.placeholder, /@/, 'il segnaposto dice da solo cosa si scrive');
  assert.match(passo.nota, /Lorenzo e Michael/, 'la nota ironica e\' quella concordata');
  assert.match(passo.salta, /spezzare loro il cuore/, 'e il salto e\' dichiarato');

  const apri = () => {
    VN.clearSave();
    dom.window.localStorage.removeItem('fl_nexus_da_inviare');
    VN.boot(story, { speed: 0, banca, quiz, scene: 'finale' });
    VN.state.nome = 'Franca'; VN.state.locked = true;
    let giri = 0;
    while (!$('emailwrap').classList.contains('on') && giri++ < 60) VN.step();
    assert.ok($('emailwrap').classList.contains('on'), 'la schermata dell\'email si apre');
  };
  const coda = () => JSON.parse(dom.window.localStorage.getItem('fl_nexus_da_inviare') || 'null');

  // indirizzo storto: si resta li' e si spiega cosa manca, invece di mandare via
  // un indirizzo che non ricevera' mai niente
  apri();
  $('emailin').value = 'chiocciola dimenticata';
  $('emailok').onclick({ stopPropagation() {} });
  assert.ok($('emailwrap').classList.contains('on'), 'con un indirizzo storto non si va avanti');
  assert.ok($('emailerr').classList.contains('on'), 'e si dice cosa non va');
  assert.equal(VN.state.email, null);

  // indirizzo buono: si continua, e la partita spedita se lo porta dietro
  $('emailin').value = ' franca@esempio.com ';
  $('emailin').oninput();
  $('emailok').onclick({ stopPropagation() {} });
  assert.equal($('emailwrap').classList.contains('on'), false, 'la schermata si chiude');
  assert.equal(VN.state.email, 'franca@esempio.com', 'l\'indirizzo e\' salvato senza spazi');
  assert.equal(coda()?.email, 'franca@esempio.com', 'e viaggia con la partita');

  // saltare non blocca niente, e la partita parte lo stesso
  apri();
  $('emailsalta').onclick({ stopPropagation() {} });
  assert.equal($('emailwrap').classList.contains('on'), false, 'saltando si va avanti');
  assert.equal(VN.state.email, null, 'e non resta niente in memoria');
  assert.equal(coda()?.email, null, 'la partita parte comunque, senza email');
  assert.equal(coda()?.nome, 'Franca');

  // campo vuoto + CONTINUA: e' un modo come un altro di saltare
  apri();
  $('emailok').onclick({ stopPropagation() {} });
  assert.equal($('emailwrap').classList.contains('on'), false, 'il campo vuoto non e\' un errore');
  VN.clearSave();
}

/* ---------- 5q-bis. un cartello a schermo pieno scopre il velo nero ----------
   #nero sta SOPRA #curtain: i titoli di coda arrivano subito dopo una
   dissolvenza al nero, e senza toglierla il testo c'era nel DOM ma lo schermo
   restava nero. Non lo prende nessuno screenshot automatico e non lo prende il
   test di percorso: qui si controlla l'invariante. */
{
  VN.clearSave();
  VN.boot(story, { speed: 0, banca, quiz, scene: 'finale' });
  $('nero').classList.add('on', 'sfuma');       // come dopo lo step "nero"
  let giri = 0;
  while (giri++ < 60) {
    const passo = (VN.scene?.steps || [])[VN.i];
    if (!passo) break;
    if (passo.t === 'title') { VN.step(); break; }
    if (passo.t === 'email') { $('emailsalta').onclick({ stopPropagation() {} }); continue; }
    VN.step();
  }
  assert.equal($('nero').classList.contains('on'), false,
    'il cartello dei titoli toglie il velo nero, altrimenti lo coprirebbe');
}

/* ---------- 6. variante maschile, percorso rapido ---------- */
VN.clearSave();
VN.boot(story, { speed: 0, banca, quiz });
VN.step();                    // luci
VN.step();                    // prima battuta di Lucas
$('ti').value = 'Luca'; $('ti').oninput(); $('tok').onclick();
const scegli = (i) => [...$('choices').querySelectorAll('.ch')][i].onclick({ stopPropagation() {} });
scegli(0);   // maschile
scegli(0);   // store: Piazza Liberty
scegli(0);   // dipartimento: Operation
scegli(0);   // anzianita': 0-2 anni
$('tsel').value = '17'; $('tsel').onchange(); $('tselok').onclick({ stopPropagation() {} });
VN.step();   // via l'avviso di stampa
assert.match(txt(), /^Ecco il tuo badge, LUCA\./, 'percorso rapido fino al badge');

/* ---------- 7. bug: tap durante la scrittura non deve bloccare il gioco ----------
   Con speed:0 (test 3-6 sopra) il typewriter e' gia' bypassato e non lo si vede
   mai scrivere: serve una run con velocita' reale per riprodurre il bug.
   Non servono timer veri: type() imposta typing=true in modo sincrono PRIMA di
   avviare l'animazione (il tick parte su requestAnimationFrame, mai nello stesso
   giro), quindi un secondo VN.step() chiamato subito dopo l'inizio dello step
   "say" e' indistinguibile, per il motore, da un tap arrivato mentre la riga si
   sta ancora scrivendo. */
{
  const dom2 = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://fantaliberty.com/' });
  dom2.window.eval(fs.readFileSync(path.join(ROOT, 'game/engine.js'), 'utf8'));
  const { VN: VN2, document: doc2 } = dom2.window;
  const $2 = (id) => doc2.getElementById(id);

  VN2.boot(story, { speed: 30, banca, quiz, scene: 'quiz' });          // hide+show sono istantanei,
  // il motore e' gia' fermo sullo step "say" successivo, a meta' della scrittura
  VN2.step();                                             // tap #1: skip, mostra la riga intera
  const dopoSkip = $2('txt').textContent;
  assert.match(dopoSkip, /conosci quelli passati/, 'skip mostra subito la riga intera');

  VN2.step();                                             // tap #2: deve avanzare allo step dopo
  assert.notEqual($2('txt').textContent, dopoSkip,
    'bug: un tap durante la scrittura lasciava "pending" vuoto per sempre e il gioco restava fermo sulla riga');
}

/* ---------- 8. banca domande dei pronostici (game/domande.json) ----------
   Il valore in punti di ogni opzione core e' ridondante: e' anche calcolabile da
   difficolta' + tipo. Ricalcolarlo qui trasforma quella ridondanza in un
   controllo — un punteggio trascritto male dallo script master non passa. */
const domande = banca;
const STILI = ['hawaiano', 'showman', 'drip', 'ingegnere'];
const BONUS = { consenso: 0, plausibile: 1, controcorrente: 1 };
const idsDomande = new Set();
let nOpzioni = 0, nBattute = 0;

for (const [cat, c] of Object.entries(domande.categorie)) {
  assert.equal(c.core.length, c.n_core, `${cat}: n_core dichiarato non corrisponde`);
  assert.ok(c.extra.length >= c.n_extra_da_pescare,
    `${cat}: il pool facoltative ha meno domande di quante se ne pescano`);
  for (const gruppo of ['core', 'extra']) {
    for (const q of c[gruppo]) {
      assert.ok(!idsDomande.has(q.id), `id domanda duplicato: ${q.id}`);
      idsDomande.add(q.id);
      assert.ok(q.opzioni.length >= 2, `${q.id}: servono almeno 2 opzioni`);
      for (const o of q.opzioni) {
        nOpzioni++;
        for (const s of STILI) {
          assert.ok(o.battute?.[s]?.length > 10,
            `${q.id} / "${o.label}": manca la battuta per lo stile ${s}`);
          nBattute++;
        }
        if (gruppo === 'core') {
          assert.equal(o.pt, q.diff + BONUS[o.tipo],
            `${q.id} / "${o.label}": pt=${o.pt} ma difficolta' ${q.diff} + ${o.tipo} fa ${q.diff + BONUS[o.tipo]}`);
        } else {
          assert.ok([1, 2, 3].includes(o.val), `${q.id} / "${o.label}": val fuori da 1-3`);
        }
      }
    }
  }
}
assert.equal(idsDomande.size, 29, '29 domande: 12 core + 17 facoltative');
assert.equal(nOpzioni, 79, '79 opzioni in totale');
assert.equal(nBattute, 316, '316 battute: una per opzione per ciascuno dei 4 stili');
assert.equal(domande.intermezzi.length, 3, '3 intermezzi di regia fissi');
// tre fissi e quattro macroargomenti-piu'-apertura da coprire: l'ultimo giro
// pesca dalla riserva, che serve esattamente a questo
assert.ok(domande.intermezzi_riserva.length >= 1, 'e almeno uno di riserva');
assert.equal(Object.keys(domande.eventi_personali).length, 4, 'un evento personale per stile');
for (const s of STILI) assert.ok(domande.eventi_personali[s], `manca l'evento personale di ${s}`);

/* ---------- 8b. il giocatore non ha un genere fisso ----------
   Il genere lo sceglie chi gioca a [S0.03] e NON c'entra con lo stile: si puo'
   benissimo essere maschile e vestirsi da Drip. Quindi ogni parola declinata
   che si riferisce al giocatore deve passare da {g:maschile|femminile}, o
   prima o poi qualcuno si sente dare della bugiarda avendo scelto lo Showman
   (successo davvero, agosto 2026).

   La lista e' di parole che nel gioco si riferiscono SEMPRE al giocatore: non
   pretende di prendere tutti i casi possibili, presidia quelli visti. Chi ne
   incontra uno nuovo lo aggiunge qui insieme alla correzione. */
const DECLINATE = [
  // esclamazioni rivolte a chi gioca: qui dentro sono sempre sue
  /(^|[«"(.!?]\s*)(bravo|brava|bravissimo|bravissima)\b/i,
  // predicati: "sei/sono/eri + aggettivo", cioe' il giocatore descritto
  /\b(sei|sono|eri|sarai|sembri|ti senti)\s+(gia'\s+|molto\s+|davvero\s+)?(pronto|pronta|sicuro|sicura|bugiardo|bugiarda|coraggioso|coraggiosa|rilassato|rilassata|sveglio|sveglia|convinto|convinta|emozionato|emozionata|agitato|agitata|nato|nata|tornato|tornata|arrivato|arrivata)\b/i,
  // "sei il sostituto", "sei la nuova": ruolo del giocatore
  /\b(sei|sono)\s+(il|la|un|una)\s+(sostituto|sostituta|nuovo|nuova)\b/i,
  // domanda secca di conferma, sempre al giocatore
  /(^|[.!?]\s*)(sicuro|sicura)\s*\?/i,
];
const SENZA_G = /\{g:[^}]*\}/g;
const declinateFuori = [];
function frugaGenere(node, path) {
  if (typeof node === 'string') {
    // i percorsi degli asset e le note non sono testo che si legge a schermo
    if (/_nota|\/note|\/pose\//.test(path) || /\.(webp|png|jpg)$/i.test(node)) return;
    const nudo = node.replace(SENZA_G, ' ');
    for (const re of DECLINATE) {
      if (re.test(nudo)) declinateFuori.push(`${path}: "${node.slice(0, 70)}"`);
    }
  } else if (Array.isArray(node)) {
    node.forEach((v, i) => frugaGenere(v, `${path}/${i}`));
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) frugaGenere(v, `${path}/${k}`);
  }
}
frugaGenere(story, 'story');
frugaGenere(domande, 'domande');
frugaGenere(quiz, 'quiz');
assert.deepEqual(declinateFuori, [],
  'parole declinate al maschile o al femminile fuori da {g:...}:\n  '
  + declinateFuori.join('\n  '));

/* ---------- 9. quiz di Peter (game/quiz.json) ---------- */
const idsQuiz = new Set();
let sommaMult = 0;
for (const [liv, cfg] of Object.entries(quiz.livelli)) {
  const pools = quiz.pool[liv];
  assert.equal(pools.length, 2, `${liv}: servono due pool (primo e secondo tentativo)`);
  assert.ok(cfg.soglia <= cfg.domande, `${liv}: soglia piu' alta del numero di domande`);
  assert.equal(cfg.mult2, cfg.mult1 / 2, `${liv}: il secondo tentativo vale meta' del primo`);
  sommaMult += cfg.mult1;
  for (const [i, p] of pools.entries()) {
    assert.equal(p.length, cfg.domande, `${liv} pool ${i + 1}: numero di domande sbagliato`);
    for (const q of p) {
      assert.ok(!idsQuiz.has(q.id), `id quiz duplicato: ${q.id}`);
      idsQuiz.add(q.id);
      assert.ok(q.opzioni.length >= 2, `${q.id}: servono almeno 2 opzioni`);
      assert.ok(Number.isInteger(q.ok) && q.ok >= 0 && q.ok < q.opzioni.length,
        `${q.id}: indice della risposta corretta fuori range`);
    }
  }
}
assert.equal(idsQuiz.size, 44, '44 domande di quiz in totale');
/* Le date non devono tornare a essere il formato dominante: un quiz sul mondo
   Apple non e' un test di memoria sugli anni. Meno di una domanda su due per
   pool puo' cominciare con "In che anno". */
for (const [liv, pools] of Object.entries(quiz.pool)) {
  pools.forEach((p, i) => {
    const date = p.filter((q) => /^in che anno/i.test(q.q)).length;
    assert.ok(date * 2 <= p.length,
      `${liv} pool ${i + 1}: ${date} domande su ${p.length} chiedono solo un anno`);
  });
}
assert.equal(Number(sommaMult.toFixed(2)), quiz.tetto_mult,
  'la somma dei moltiplicatori pieni deve fare esattamente il tetto dichiarato');

/* ---------- 10. S8: il quiz di Peter ----------
   Il quiz e' l'unico punto del gioco in cui il feedback dice se hai indovinato:
   la regola d'oro di S5 vale per i pronostici, che sono opinioni sul futuro.
   Qui le risposte sono verificabili. */

// struttura: gli step di S8 puntano a scene e livelli che esistono davvero
for (const [id, sc] of Object.entries(story.scenes)) {
  for (const st of sc.steps || []) {
    if (st.t === 'quizhub') {
      assert.ok(story.scenes[st.goto], `scena ${id}: quizhub.goto "${st.goto}" non esiste`);
      assert.ok(story.scenes[st.gotoMult], `scena ${id}: quizhub.gotoMult "${st.gotoMult}" non esiste`);
      assert.ok(story.scenes[st.esci?.goto], `scena ${id}: quizhub.esci "${st.esci?.goto}" non esiste`);
      for (const liv of st.ordine || Object.keys(quiz.livelli)) {
        assert.ok(quiz.livelli[liv], `scena ${id}: livello "${liv}" non e' in quiz.json`);
      }
    }
    if (st.t === 'quizlivello') {
      // le battute di fine livello: i segnaposto che il motore sostituisce
      assert.match(st.passato || '', /\{mult\}/, `scena ${id}: "passato" senza {mult}`);
      assert.match(st.sbagliata || '', /\{r\}/, `scena ${id}: "sbagliata" senza la risposta giusta`);
    }
    if (st.t === 'quizmult') {
      assert.ok(st.conferma?.text, `scena ${id}: quizmult senza modale di conferma`);
    }
  }
}
// il quiz si raggiunge solo a pronostici chiusi: la scena non deve essere
// appesa a niente che il giocatore possa toccare prima del lock
assert.equal(story.scenes.quiz_livello.next, 'quiz', 'finito un livello si torna alla griglia');

// ogni livello dev'essere raggiungibile: se un livello di quiz.json non compare
// nella catena base -> avanzato -> leggenda, per chi non e' showman e' morto
{
  const ordine = Object.keys(quiz.livelli);
  assert.ok(ordine.length >= 1, 'almeno un livello di quiz');
  assert.equal(ordine[0], 'base', 'il primo livello e\' quello sempre aperto');
}

const cellePerLivello = () => [...$('griglia').querySelectorAll('.gcell')];
const azioniQuiz = () => [...$('choices').querySelectorAll('.ch')];

// porta il motore dalla scena "quiz" fino alla griglia dei livelli
function apriQuizHub(stile) {
  VN.clearSave();
  VN.boot(story, { speed: 0, banca, quiz, scene: 'quiz' });
  VN.state.stile = stile;
  VN.state.locked = true;
  // le battute di presentazione, quante siano: si va avanti finche' la griglia
  // non e' a schermo. Peter presenta il quiz e, malvolentieri, la corsa.
  for (let i = 0; i < 20 && !$('griglia').classList.contains('on'); i++) VN.step();
  return cellePerLivello();
}

/* ---------- 9-ter. due dettagli di scena ----------
   Piccoli, ma si vedono solo a schermo. */
{
  /* Il giocatore deve sparire davvero quando la scena lo dice. "entra" e'
     un'animazione forwards: finisce a opacita' piena e ce la lascia, quindi
     togliere solo "on" non spegneva niente e il giocatore restava a schermo
     davanti alla sagoma del CEO. */
  VN.clearSave();
  VN.boot(story, { speed: 0, banca, quiz, scene: 'finale' });
  VN.state.stile = 'drip'; VN.state.genere = 'm'; VN.state.nome = 'Tester';
  // com'e' a schermo quando il giocatore e' in scena: acceso E con l'animazione
  // d'ingresso finita addosso
  $('avatar').classList.add('on', 'entra');
  const iNascondi = story.scenes.finale.steps.findIndex((x) => x.t === 'io' && x.hide);
  assert.ok(iNascondi > 0, 'il finale nasconde il giocatore prima della porta');
  while (VN.i <= iNascondi && VN.sceneId === 'finale') VN.step();
  assert.equal($('avatar').classList.contains('on'), false, 'il giocatore e\' spento');
  assert.equal($('avatar').classList.contains('entra'), false,
    'e senza l\'animazione che lo teneva visibile lo stesso');

  // niente striscia della categoria sopra la scena delle domande
  assert.equal((story.scenes.argomento.steps || []).some((x) => x.t === 'prop'), false,
    'nessun prop sopra la scena durante le previsioni');
}

/* ---------- 9-quinquies. la registrazione: il Mac sta nel fondale ----------
   Non e' un oggetto appoggiato sopra la scena. Il terminale si incolla in pixel
   allo schermo disegnato dentro bg_macintosh, perche' con le percentuali dello
   stage il testo finiva fuori dal vetro su ogni finestra di forma diversa dal
   telefono. E' gia' stato smontato una volta per sbaglio: questo lo presidia. */
{
  const reg = story.scenes.registrazione;
  assert.equal(reg.bg, 'macintosh', 'la registrazione sta sul fondale col Mac dentro');
  assert.equal(reg.bgFx, undefined, 'e a fuoco: il terminale si deve leggere');
  const prop = reg.steps.filter((x) => x.t === 'prop');
  assert.ok(prop.length && prop.every((x) => x.fondale === true),
    'il Mac non torna un oggetto sovrapposto: gli step prop sono quelli "fondale"');
  assert.ok(prop.some((x) => x.show === true) && prop.some((x) => x.show === false),
    'il terminale si accende e a fine registrazione si spegne');
  const lucas = reg.steps.find((x) => x.t === 'show' && x.who === 'lucas');
  assert.ok(lucas.height && lucas.bottom,
    'Lucas e\' piu\' piccolo e piu\' in basso, se no copre lo schermo');
  assert.equal(story.scenes.badge.bg, 'macintosh', 'il badge resta nello stesso posto');
  assert.equal(story.scenes.badge.bgFx, 'blur', 'fuori fuoco, cosi\' il badge si stacca');

  const motore = fs.readFileSync(path.join(ROOT, 'game/engine.js'), 'utf8');
  assert.match(motore, /SCHERMO_FONDALE/, 'il motore sa dov\'e\' il vetro del CRT');
  assert.match(motore, /function ancoraTerminale/, 'e ci incolla il terminale in pixel');
  assert.match(motore, /if \(st\.fondale\)/, 'lo step prop conosce la variante "fondale"');
}

/* ---------- 9-quater. il giocatore non attraversa le scene ----------
   Ogni scena che vuole la figura del giocatore la dichiara come primo step. Se
   una se ne dimentica non deve ritrovarsela addosso: e' cosi' che restava a
   schermo in lobby, davanti a Francesca, dopo le previsioni. */
{
  VN.clearSave();
  VN.boot(story, { speed: 0, banca, quiz, scene: 'countdown' });
  VN.state.stile = 'drip'; VN.state.genere = 'm'; VN.state.nome = 'Tester';
  // com'e' a schermo quando il giocatore e' in scena: acceso e con addosso
  // l'animazione d'ingresso, che da sola basta a tenerlo visibile
  $('avatar').classList.add('on', 'entra');
  [...$('cdbtn').querySelectorAll('.ch')]
    .find((b) => /lobby/i.test(b.textContent))
    .onclick({ stopPropagation() {} });
  assert.equal(VN.sceneId, 'lobby', 'si cambia scena davvero');
  assert.equal($('avatar').classList.contains('on'), false,
    'cambiando scena la figura del giocatore si spegne');
  assert.equal($('avatar').classList.contains('entra'), false, 'animazione compresa');

  // le scene che la vogliono la rimettono da sole, come primo step
  const conIo = ['quinte', 'keynote', 'argomenti', 'argomento', 'teleprompter', 'finale'];
  conIo.forEach((n) => {
    const passi = story.scenes[n].steps.slice(0, 2);
    assert.ok(passi.some((x) => x.t === 'io'),
      `scena ${n}: usa la figura del giocatore, quindi deve dichiararla subito`);
  });
}

/* ---------- 9-bis. gli emblemi sullo schermo del palco (S5) ----------
   I tre pannelli del fondale si accendono alla PRIMA scelta del macroargomento,
   non a categoria finita, e restano accesi tornando alla griglia e riaprendo il
   gioco. Sono scenografia: vivono solo sul fondale dello schermo. */
{
  const embl = () => ({
    layer: $('emblemi').classList.contains('on'),
    iphone: $('emblema-iphone').classList.contains('attivo'),
    watch: $('emblema-watch').classList.contains('attivo'),
    altro: $('emblema-altro').classList.contains('attivo')
  });
  const cellaDi = (k) => [...$('griglia').querySelectorAll('.gcell')].find((c) => c.dataset.arg === k);

  // A. partita nuova: schermo spento
  VN.clearSave();
  VN.boot(story, { speed: 0, banca, quiz, scene: 'argomenti' });
  VN.state.genere = 'f'; VN.state.stile = 'drip'; VN.state.nome = 'Franca';
  assert.deepEqual(Object.keys(VN.state.categorie_visitate || {}), [],
    'si parte senza categorie visitate');
  assert.equal(embl().layer, true, 'sul fondale dello schermo il layer c\'e\'');
  assert.deepEqual([embl().iphone, embl().watch, embl().altro], [false, false, false],
    'ma i tre pannelli sono vuoti');

  // B. si sceglie Watch per primo: si accende solo quello (l'ordine non conta)
  cellaDi('watch').onclick({ stopPropagation() {} });
  assert.equal(VN.state.categorie_visitate.watch, true, 'la categoria e\' segnata come visitata');
  assert.equal(VN.state.categorie_visitate.iphone, undefined, 'e solo quella');
  assert.equal($('emblema-watch').classList.contains('attivo'), true, 'il pannello Watch si accende');
  assert.equal($('emblema-watch').classList.contains('nuovo'), true, 'con lo scatto di accensione');
  assert.ok($('emblema-watch').getAttribute('src').includes('prop_emblema_categoria_watch'));
  assert.equal($('emblema-iphone').classList.contains('attivo'), false, 'gli altri due restano spenti');

  // F. entrando nella categoria il fondale cambia: gli emblemi non restano
  // appesi sopra il palco durante le domande
  assert.equal(VN.sceneId, 'argomento');
  assert.equal($('emblemi').classList.contains('on'), false,
    'su un altro fondale il layer si spegne');

  // E. ripresa da salvataggio: gli emblemi tornano da soli
  VN.clearSave();
  dom.window.localStorage.setItem('fl_nexus_save_v1', JSON.stringify({
    v: story.meta.version, scene: 'argomenti', i: 0,
    state: { nome: 'Franca', genere: 'f', stile: 'drip', picks: {},
             categorie_visitate: { iphone: true, altro: true } }
  }));
  VN.boot(story, { speed: 0, banca, quiz });
  [...$('choices').querySelectorAll('.ch')][0].onclick({ stopPropagation() {} });   // Riprendi
  assert.equal(VN.sceneId, 'argomenti');
  assert.deepEqual([embl().iphone, embl().watch, embl().altro], [true, false, true],
    'riaprendo il gioco lo schermo e\' come lo si era lasciato');
  assert.equal($('emblema-iphone').classList.contains('nuovo'), false,
    'e nessuno rifa\' l\'animazione di accensione');

  // D. la terza categoria completa lo schermo
  cellaDi('watch').onclick({ stopPropagation() {} });
  assert.deepEqual([embl().iphone, embl().watch, embl().altro], [true, true, true],
    'tutti e tre i pannelli accesi');

  // le categorie visitate non sopravvivono a una partita nuova: "vars" e' un
  // modello, non lo stato condiviso di tutte le partite
  VN.clearSave();
  VN.boot(story, { speed: 0, banca, quiz, scene: 'argomenti' });
  assert.deepEqual(Object.keys(VN.state.categorie_visitate || {}), [],
    'partita nuova, schermo pulito');
  assert.deepEqual(Object.keys(story.vars.categorie_visitate || {}), [],
    'e story.vars non e\' stato scritto');
}

/* 10a. la scaletta dei livelli */
{
  const celle = apriQuizHub('ingegnere');
  assert.equal(celle.length, 3, 'tre livelli nella griglia');
  assert.equal(celle[0].classList.contains('fatta'), false, 'Base e\' sempre aperto');
  assert.ok(celle[1].classList.contains('fatta'), 'Avanzato chiuso finche\' Base non passa');
  assert.ok(celle[2].classList.contains('fatta'), 'Leggenda chiuso finche\' Avanzato non passa');
  assert.match(celle[0].querySelector('.gstato').textContent, /13s/,
    'il perk dell\'ingegnere allunga il timer a 13 secondi');

  // le battute di presentazione si dicono una volta sola
  assert.equal(VN.state.quiz_visto, true, 'la presentazione e\' segnata come vista');

  // niente da assegnare finche' non si vince qualcosa: la voce non c'e' proprio
  // a banca vuota i moltiplicatori non si vedono proprio: restano l'altra sfida
  // e la via d'uscita
  assert.deepEqual(azioniQuiz().map((b) => b.textContent),
    ['Apple Campus Run', 'Basta cosi\', torno in lobby'],
    'la corsa sta sotto la griglia, prima dell\'uscita');
}

/* 10a-bis. i moltiplicatori si assegnano appena se ne vince uno: la voce e'
   viva, non spenta in attesa del giorno del keynote. La finestra a tempo c'era
   e teneva la schermata irraggiungibile per tutti i giorni in cui il quiz si
   gioca davvero — resta possibile rimetterla con "finestra_ore" in quiz.json. */
{
  VN.clearSave();
  VN.boot(story, { speed: 0, banca, quiz, scene: 'quiz' });
  VN.state.stile = 'showman';
  VN.state.mult_bank = 0.3;                    // come dopo aver passato un livello
  for (let i = 0; i < 20 && !$('griglia').classList.contains('on'); i++) VN.step();
  const assegna = azioniQuiz().find((b) => /moltiplicatori/i.test(b.textContent));
  assert.ok(assegna, 'con qualcosa in banca la voce c\'e\'');
  assert.equal(assegna.classList.contains('spento'), false, 'ed e\' viva');
  assert.equal(assegna.disabled, false, 'anche per la tastiera');
  assert.match(assegna.textContent, /0\.30/, 'e dice quanto c\'e\' da distribuire');
  assegna.onclick({ stopPropagation() {} });
  assert.equal(VN.sceneId, 'moltiplicatori', 'e porta alla schermata dei moltiplicatori');

  // a banca vuota resta fuori: non c'e' niente da assegnare
  VN.clearSave();
  VN.boot(story, { speed: 0, banca, quiz, scene: 'quiz' });
  VN.state.stile = 'showman';
  for (let i = 0; i < 20 && !$('griglia').classList.contains('on'); i++) VN.step();
  assert.equal(azioniQuiz().some((b) => /moltiplicatori/i.test(b.textContent)), false,
    'senza niente in banca non c\'e\' niente da assegnare');

  // la finestra a tempo esiste ancora, se un giorno la si rivuole
  const conFinestra = { ...quiz, finestra_ore: 24 };
  VN.clearSave();
  VN.boot(story, { speed: 0, banca, quiz: conFinestra, scene: 'quiz' });
  VN.state.stile = 'showman';
  VN.state.mult_bank = 0.3;
  for (let i = 0; i < 20 && !$('griglia').classList.contains('on'); i++) VN.step();
  const dentro = Date.now() >= Date.parse(story.meta.keynote) - 24 * 3600e3;
  const voce = azioniQuiz().find((b) => /moltiplicatori/i.test(b.textContent));
  assert.ok(voce, 'la voce c\'e\' comunque');
  assert.equal(voce.classList.contains('spento'), !dentro,
    'con "finestra_ore" torna spenta finche\' non si e\' dentro la finestra');
}

/* 10a-ter. "se" salta uno step quando la condizione e' falsa: le battute di
   presentazione non si ripetono a ogni ritorno alla griglia */
{
  VN.clearSave();
  VN.boot(story, { speed: 0, banca, quiz, scene: 'quiz' });
  VN.state.quiz_visto = true;
  VN.state.stile = 'showman';
  VN.step();
  assert.ok($('griglia').classList.contains('on'),
    'gia\' vista la presentazione, un solo tap porta alla griglia');
}

/* 10a-quater. prima di cominciare, Peter dice al giocatore che vantaggio si
   porta dietro. E' l'unico posto dove il perk viene spiegato: in S3, sulla
   scheda del carosello, era una meccanica del quiz messa troppo presto. */
{
  const battutaPerk = (stile) => {
    VN.clearSave();
    VN.boot(story, { speed: 0, banca, quiz, scene: 'quiz' });
    VN.state.stile = stile; VN.state.genere = 'f'; VN.state.locked = true;
    // la battuta del perk arriva dopo che Peter ha presentato le due sfide: si
    // va avanti finche' non e' quella a schermo, invece di contare i tocchi
    for (let i = 0; i < 20 && !/stile/i.test($('txt').textContent); i++) VN.step();
    return $('txt').textContent;
  };
  const detto = {
    hawaiano: battutaPerk('hawaiano'),
    showman: battutaPerk('showman'),
    drip: battutaPerk('drip'),
    ingegnere: battutaPerk('ingegnere')
  };
  assert.equal(new Set(Object.values(detto)).size, 4, 'una battuta diversa per stile');
  assert.match(detto.hawaiano, /primo giro storto/, 'hawaiano: il giro che non si conta');
  assert.match(detto.showman, /gia' aperti/, 'showman: i livelli sono tutti aperti');
  assert.match(detto.drip, /due risposte sbagliate/, 'drip: il 50:50');
  assert.match(detto.ingegnere, /tre secondi in piu'/, 'ingegnere: il tempo in piu\'');
  assert.equal($('name').textContent, 'Peter', 'la dice Peter');

  // e vale una volta sola: tornando dalla griglia non si rispiega niente
  VN.clearSave();
  VN.boot(story, { speed: 0, banca, quiz, scene: 'quiz' });
  VN.state.stile = 'drip'; VN.state.quiz_visto = true;
  VN.step();
  assert.ok($('griglia').classList.contains('on'),
    'gia' + '\' vista la presentazione, il perk non si ripete');
}

/* 10b. il perk dello showman: tutti e tre i livelli aperti da subito */
{
  const celle = apriQuizHub('showman');
  assert.equal(celle.filter((c) => c.classList.contains('fatta')).length, 0,
    'showman: nessun livello bloccato, ordine libero');
  assert.match(celle[0].querySelector('.gstato').textContent, /10s/, 'timer normale per lo showman');
}

/* 10c. giocare un livello: tutte giuste -> passato, e il moltiplicatore in banca */
// risponde alla domanda a schermo: trova la domanda vera nel pool dal testo, e
// clicca il bottone giusto (o uno sbagliato) — i bottoni seguono l'ordine delle
// opzioni, quindi l'indice della risposta corretta e' proprio "ok"
const tutteQuiz = Object.values(quiz.pool).flat(2);
function rispondiQuiz(giusto) {
  const d = tutteQuiz.find((x) => x.q === $('txt').textContent);
  assert.ok(d, `domanda a schermo non trovata nel pool: "${$('txt').textContent}"`);
  const btns = [...$('choices').querySelectorAll('.ch')].filter((b) => !b.classList.contains('perk'));
  const i = giusto ? d.ok : (d.ok + 1) % btns.length;
  btns[i].onclick({ stopPropagation() {} });
  VN.step();                                 // via la reazione di Peter
  return d;
}

function giocaLivello(liv, stile, giuste) {
  VN.clearSave();
  VN.boot(story, { speed: 0, banca, quiz, scene: 'quiz' });
  VN.state.stile = stile;
  VN.state.locked = true;
  VN.state.quiz_visto = true;
  // si entra dalla griglia, come farebbe il giocatore
  VN.step(); VN.step(); VN.step();
  const celle = cellePerLivello();
  const cella = celle.find((c) => c.dataset.livello === liv);
  cella.onclick({ stopPropagation() {} });
  assert.equal(VN.sceneId, 'quiz_livello', `si entra nel livello ${liv}`);
  const viste = [];
  for (let k = 0; k < quiz.livelli[liv].domande; k++) viste.push(rispondiQuiz(giuste.fn(k)));
  return viste;
}

{
  const viste = giocaLivello('base', 'ingegnere', { fn: () => true });
  assert.equal(viste.length, 5, 'Base: cinque domande');
  assert.equal(new Set(viste.map((d) => d.id)).size, 5, 'nessuna domanda ripetuta nel giro');
  assert.match($('txt').textContent, /Passato: 5 su 5/, 'passato con il pieno');
  assert.match($('txt').textContent, /\+0\.10/, 'il moltiplicatore compare come +0.10, non 0.1');
  assert.equal(VN.state.quiz.base.passato, true, 'livello segnato come passato');
  assert.equal(VN.state.mult_bank, 0.1, 'primo tentativo: moltiplicatore pieno in banca');

  VN.step();                                  // torna alla griglia
  assert.equal(VN.sceneId, 'quiz', 'finito il livello si torna alla griglia');
  VN.step(); VN.step(); VN.step();
  const celle = cellePerLivello();
  assert.ok(celle[0].classList.contains('fatta'), 'Base ora e\' chiuso: passato');
  assert.equal(celle[1].classList.contains('fatta'), false, 'e Avanzato si e\' aperto');
  assert.match(celle[0].querySelector('.gstato').textContent, /\+0\.10/, 'la griglia mostra cosa hai vinto');
}

/* 10d. sbagliare: primo tentativo bruciato, il secondo pesca dall'altro pool */
{
  const primo = giocaLivello('base', 'ingegnere', { fn: () => false });
  assert.match($('txt').textContent, /Ne servivano 3/, 'sotto soglia: si puo\' riprovare');
  assert.equal(VN.state.quiz.base.tentativi, 1, 'un tentativo consumato');
  const poolPrimo = VN.state.quiz.base.pool;

  VN.step();
  VN.step(); VN.step(); VN.step();
  const cella = cellePerLivello().find((c) => c.dataset.livello === 'base');
  assert.equal(cella.classList.contains('fatta'), false, 'con un tentativo residuo il livello resta aperto');
  cella.onclick({ stopPropagation() {} });
  const secondo = [];
  for (let k = 0; k < 5; k++) secondo.push(rispondiQuiz(false));
  assert.notEqual(VN.state.quiz.base.pool, poolPrimo, 'il secondo tentativo usa l\'altro pool');
  const idsPrimo = new Set(primo.map((d) => d.id));
  assert.equal(secondo.some((d) => idsPrimo.has(d.id)), false,
    'nessuna domanda del primo tentativo torna nel secondo');
  assert.match($('txt').textContent, /questo livello per te e' chiuso/,
    'due tentativi falliti: livello chiuso per questa run');
  assert.equal(VN.state.quiz.base.tentativi, 2);
  assert.equal(VN.state.mult_bank, 0, 'niente in banca se non si passa');

  VN.step();
  VN.step(); VN.step(); VN.step();
  assert.ok(cellePerLivello()[0].classList.contains('fatta'), 'Base non si riapre');

  /* Bruciato Base, la scaletta e' finita: Avanzato e Leggenda non si apriranno
     mai piu'. Peter non deve chiedere "da dove vuoi cominciare?" davanti a una
     griglia tutta spenta, e i due livelli irraggiungibili non devono dire
     "prima l'altro", che suona come un'attesa. */
  const celleFinite = cellePerLivello();
  const step = story.scenes.quiz.steps.find((x) => x.t === 'quizhub');
  assert.equal($('txt').textContent, step.finito,
    'niente piu\' da giocare: Peter lo dice invece di chiedere da dove cominciare');
  assert.equal(celleFinite[1].querySelector('.gstato').textContent, step.etichettaMai,
    'Avanzato e\' fuori portata, non in attesa');
  assert.equal(celleFinite[2].querySelector('.gstato').textContent, step.etichettaMai,
    'e cosi\' Leggenda');
  assert.deepEqual(azioniQuiz().map((b) => b.textContent),
    ['Apple Campus Run', 'Basta cosi\', torno in lobby'],
    'finito il quiz resta l\'altra sfida, e la via d\'uscita');
}

/* 10d-bis. lo showman non resta mai bloccato: i suoi livelli sono aperti da
   subito, quindi bruciarne uno non chiude gli altri */
{
  VN.clearSave();
  VN.boot(story, { speed: 0, banca, quiz, scene: 'quiz' });
  VN.state.stile = 'showman'; VN.state.locked = true; VN.state.quiz_visto = true;
  VN.state.quiz = { base: { passato: false, tentativi: 2, pool: 0, seconda: false } };
  VN.step();
  const celle = cellePerLivello();
  assert.ok(celle[0].classList.contains('fatta'), 'Base bruciato resta chiuso');
  assert.equal(celle[1].classList.contains('fatta'), false, 'ma Avanzato e\' ancora giocabile');
  const stepQ = story.scenes.quiz.steps.find((x) => x.t === 'quizhub');
  assert.equal($('txt').textContent, stepQ.text, 'e Peter chiede ancora da dove cominciare');
}

/* 10d-ter. il tentativo si paga entrando, non uscendo: chi molla a meta' non se
   lo ritrova intatto. Prima il conteggio stava in fondo al livello e il
   salvataggio era fermo alla griglia, quindi bastava chiudere l'app davanti a
   una domanda andata male. */
{
  VN.clearSave();
  VN.boot(story, { speed: 0, banca, quiz, scene: 'quiz' });
  VN.state.stile = 'ingegnere'; VN.state.locked = true; VN.state.quiz_visto = true;
  VN.step();
  cellePerLivello()[0].onclick({ stopPropagation() {} });
  assert.equal(VN.state.quiz.base.tentativi, 1, 'entrare nel livello costa il tentativo');
  assert.equal(VN.readSave().state.quiz.base.tentativi, 1,
    'ed e\' gia\' nel salvataggio: chiudere l\'app adesso non lo restituisce');

  // due risposte e via, come chi se ne va a meta'
  rispondiQuiz(false); rispondiQuiz(false);
  assert.equal(VN.state.quiz.base.tentativi, 1, 'il tentativo resta uno solo, non due');

  // ripartendo da quel salvataggio, il livello ha davvero un tentativo in meno
  VN.boot(story, { speed: 0, banca, quiz });
  [...$('choices').querySelectorAll('.ch')][0].onclick({ stopPropagation() {} });   // Riprendi
  assert.equal(VN.state.quiz.base.tentativi, 1, 'e al rientro il conto e\' quello');
}

/* 10e. il perk dell'hawaiano: il primo fallimento di ogni livello non conta */
{
  giocaLivello('base', 'hawaiano', { fn: () => false });
  assert.match($('txt').textContent, /questo giro non l'ho visto/, 'Peter chiude un occhio');
  assert.equal(VN.state.quiz.base.tentativi, 0, 'il tentativo non e\' stato consumato');
  assert.equal(VN.state.quiz.base.seconda, true, 'ma il perk e\' bruciato');
}

/* 10f. il perk del drip: il 50/50 lascia due risposte, una delle quali giusta */
{
  VN.clearSave();
  VN.boot(story, { speed: 0, banca, quiz, scene: 'quiz' });
  VN.state.stile = 'drip'; VN.state.locked = true; VN.state.quiz_visto = true;
  VN.step(); VN.step(); VN.step();
  cellePerLivello()[0].onclick({ stopPropagation() {} });

  const perk = () => [...$('choices').querySelectorAll('.ch.perk')];
  assert.equal(perk().length, 1, 'il drip ha il 50:50 sotto le risposte');
  const d = tutteQuiz.find((x) => x.q === $('txt').textContent);
  perk()[0].onclick({ stopPropagation() {} });
  const restano = [...$('choices').querySelectorAll('.ch')].filter((b) => !b.classList.contains('perk'));
  assert.equal(restano.length, 2, '50:50: restano due risposte');
  assert.ok(restano.some((b) => b.textContent === d.opzioni[d.ok]), 'e una e\' quella giusta');
  assert.equal(perk().length, 0, 'una volta sola per livello');

  // dopo il 50/50 i bottoni non seguono piu' gli indici delle opzioni: si clicca
  // quello con il testo giusto
  restano.find((b) => b.textContent === d.opzioni[d.ok]).onclick({ stopPropagation() {} });
  assert.match($('txt').textContent, /Esatto/, 'risposta giusta dopo il 50:50');
  VN.step();
  assert.equal($('choices').querySelectorAll('.ch.perk').length, 0,
    'il 50:50 non torna alla domanda dopo');
}

/* 10g. il tempo che scade vale come una risposta sbagliata */
{
  VN.clearSave();
  VN.boot(story, { speed: 0, banca, quiz, scene: 'quiz' });
  VN.state.stile = 'showman'; VN.state.locked = true; VN.state.quiz_visto = true;
  VN.step(); VN.step(); VN.step();
  cellePerLivello()[0].onclick({ stopPropagation() {} });
  assert.ok($('quizbar').classList.contains('on'), 'la barra del tempo e\' accesa');
  assert.match($('qinfo').textContent, /Base · 1\/5/, 'l\'avanzamento del livello e\' scritto');
  assert.equal(parseFloat($('qbar').style.width), 100, 'il timer parte pieno');

  // con speed 0 il tick non gira (niente timer veri nei test): si chiama a mano
  // lo stesso scadere che chiamerebbe l'intervallo
  assert.equal(typeof VN.quizScadenza, 'function', 'la scadenza e\' innescata');
  VN.quizScadenza();
  assert.match($('txt').textContent, /Tempo scaduto/, 'scaduto: si passa avanti senza punto');
  VN.step();
  assert.match($('qinfo').textContent, /2\/5 · giuste 0\/3/, 'la domanda scaduta non fa punto');
}

/* Niente piu' battute attorno al pannello dei moltiplicatori: si apre gia' al
   primo giro di step, quindi la banca dev'esserci PRIMA. Ci si arriva da un
   salvataggio, che e' poi la strada vera — il giocatore assegna il giorno del
   keynote, riaprendo il gioco.
   "locked" resta false apposta: con i pronostici gia' chiusi la ripresa porta
   al countdown, e al pannello serve solo la banca. */
function apriMoltiplicatori(stato, extra) {
  VN.clearSave();
  dom.window.localStorage.setItem('fl_nexus_save_v1', JSON.stringify({
    v: story.meta.version, scene: 'moltiplicatori', i: 0,
    state: { nome: 'Franca', genere: 'f', stile: 'showman', locked: false,
             picks: {}, quiz: {}, moltiplicatori: null, ...stato }
  }));
  VN.boot(story, { speed: 0, banca, quiz, ...(extra || {}) });
  [...$('choices').querySelectorAll('.ch')][0].onclick({ stopPropagation() {} });   // Riprendi
  assert.equal(VN.sceneId, 'moltiplicatori');
}

/* 10h. i moltiplicatori [S8.FINALE]: si distribuisce tutto o non si conferma ---- */
{
  apriMoltiplicatori({ mult_bank: 0.3 });
  assert.ok($('multwrap').classList.contains('on'),
    'la schermata dei moltiplicatori si apre subito, senza spiegazioni');

  const righe = () => [...$('multrighe').querySelectorAll('.mriga')];
  assert.equal(righe().length, 3, 'una riga per macroargomento');
  assert.equal(righe()[0].querySelector('.mval').textContent, '×1.00', 'si parte da ×1.00');
  assert.ok($('multok').disabled, 'non si conferma con la banca ancora da spendere');

  const piu = (i) => righe()[i].querySelector('.mpiu').onclick({ stopPropagation() {} });
  const meno = (i) => righe()[i].querySelector('.mmeno').onclick({ stopPropagation() {} });
  for (let k = 0; k < 6; k++) piu(0);          // 6 x 0.05 = 0.30, tutto su iPhone
  assert.equal(righe()[0].querySelector('.mval').textContent, '×1.30', 'niente 1.2999999999');
  assert.ok(!$('multok').disabled, 'banca finita: si puo\' confermare');

  piu(1);
  assert.equal(righe()[1].querySelector('.mval').textContent, '×1.00',
    'non si spende piu\' di quello che si ha in banca');
  meno(0);
  assert.ok($('multok').disabled, 'tolto un pezzo, la conferma si richiude');
  piu(0);

  // conferma irreversibile: prima la modale, come il lock di S6
  $('multok').onclick({ stopPropagation() {} });
  assert.ok($('modal').classList.contains('on'), 'conferma prima di assegnare');
  assert.equal(VN.state.moltiplicatori, null, 'la modale aperta non ha assegnato niente');
  [...$('modalbtns').querySelectorAll('.ch')][1].onclick({ stopPropagation() {} });   // ripensaci
  assert.equal(VN.state.moltiplicatori, null, '"fammi ripensare" non assegna');

  $('multok').onclick({ stopPropagation() {} });
  [...$('modalbtns').querySelectorAll('.ch')][0].onclick({ stopPropagation() {} });   // confermo
  assert.deepEqual({ ...VN.state.moltiplicatori }, { iphone: 0.3, watch: 0, altro: 0 },
    'i moltiplicatori sono scritti nello stato');
  assert.equal(VN.sceneId, 'countdown',
    'confermato, si va dritti al countdown: nessuna scena di commento');
}

/* 10i. gia' assegnati: la schermata resta consultabile, ma non si tocca ---- */
{
  VN.clearSave();
  apriMoltiplicatori({ mult_bank: 0.3, moltiplicatori: { iphone: 0.2, watch: 0.1, altro: 0 } });
  const righe = [...$('multrighe').querySelectorAll('.mriga')];
  assert.equal(righe[0].querySelector('.mval').textContent, '×1.20', 'rilegge quello che c\'e\'');
  assert.ok(righe[0].querySelector('.mpiu').disabled, 'i tasti sono spenti');
  assert.ok(!$('multok').disabled, 'e il bottone serve solo a uscire');
  $('multok').onclick({ stopPropagation() {} });
  assert.equal($('modal').classList.contains('on'), false, 'nessuna modale: non c\'e\' niente da confermare');
  assert.deepEqual({ ...VN.state.moltiplicatori }, { iphone: 0.2, watch: 0.1, altro: 0 }, 'e non cambia niente');
}

/* 10j. il quiz viaggia insieme alla schedina quando si spedisce ---- */
{
  VN.clearSave();
  let spedito = null;
  window.fetch = (url, opt) => { spedito = JSON.parse(opt.body); return Promise.resolve({ ok: true }); };
  apriMoltiplicatori({ mult_bank: 0.15,
    quiz: { base: { passato: true, tentativi: 1, pool: 0, seconda: false, vinto: 0.1 } } },
    { backend: { url: 'https://esempio', chiave: 'x' } });
  const righe = [...$('multrighe').querySelectorAll('.mriga')];
  for (let k = 0; k < 3; k++) righe[2].querySelector('.mpiu').onclick({ stopPropagation() {} });
  $('multok').onclick({ stopPropagation() {} });
  [...$('modalbtns').querySelectorAll('.ch')][0].onclick({ stopPropagation() {} });
  assert.ok(spedito, 'assegnare i moltiplicatori fa partire un invio, come il lock');
  assert.equal(spedito.quiz.banca, 0.15, 'il payload porta la banca del quiz');
  assert.deepEqual(spedito.quiz.moltiplicatori, { iphone: 0, watch: 0, altro: 0.15 },
    'e la distribuzione scelta');
  assert.equal(spedito.quiz.livelli.base.passato, true, 'e come sono andati i livelli');
  delete window.fetch;
}

/* ---------- il cartello di attesa sul dominio pubblico ---------- */
{
  const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const domini = /var DOMINI_PUBBLICI = \[([^\]]*)\]/.exec(src);
  assert.ok(domini, 'il cartello di attesa dichiara i domini pubblici');
  const lista = domini[1].split(',').map(x => x.trim().replace(/^'|'$/g, ''));
  assert.deepEqual(lista.sort(), ['fantaliberty.com', 'www.fantaliberty.com'],
    'il cartello vale solo sul dominio pubblico: l\'indirizzo di sviluppo resta aperto');
  const data = /var APERTURA = Date.parse\('([^']+)'\)/.exec(src);
  assert.ok(data && !Number.isNaN(Date.parse(data[1])),
    'il cartello si toglie da solo a una data valida');
  for (const porta of ["params.has('apri')", "params.has('dev')", "params.get('scene')"]) {
    assert.ok(src.includes(porta),
      `il cartello lascia passare ${porta}: sono le porte di servizio sul dominio pubblico`);
  }
  assert.ok(/id="gate"[^>]*hidden/.test(src),
    'il cartello parte nascosto: lo accende solo il controllo sul dominio');
}

/* ---------- 11. Google Analytics 4 ----------
   game/analytics.js non e' mai caricato negli altri test di questo file: solo
   engine.js lo e', per questo gli hook di GA sopra sono rimasti no-op silenziosi
   in tutta la suite finora. Qui si accende il pezzo mancante (proprio come fa
   index.html, engine dopo analytics) e si verifica il contrario: con
   FLAnalytics presente, gli eventi partono nei punti giusti, una volta sola
   dove richiesto, e senza mai portarsi dietro nome, email o risposte. */
{
  const srcHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(srcHtml, /googletagmanager\.com\/gtag\/js\?id=G-SYX1RZLNNE/, 'il tag gtag.js e\' installato');
  assert.match(srcHtml, /gtag\('config', 'G-SYX1RZLNNE'\)/, 'con il Measurement ID giusto');
  assert.equal((srcHtml.match(/googletagmanager\.com\/gtag\/js/g) || []).length, 1,
    'il tag si carica una volta sola');
  assert.match(srcHtml, /<script src="\.\/game\/analytics\.js/, 'analytics.js e\' collegato dalla pagina');
  assert.ok(srcHtml.indexOf('game/analytics.js') < srcHtml.indexOf('game/engine.js'),
    'analytics.js arriva prima di engine.js: engine.js lo usa da subito');

  window.eval(fs.readFileSync(path.join(ROOT, 'game/analytics.js'), 'utf8'));
  assert.ok(window.FLAnalytics, 'analytics.js si installa da solo su window');
  assert.equal(window.FLAnalytics.id, 'G-SYX1RZLNNE');

  // senza gtag non succede niente, e non si rompe niente
  assert.doesNotThrow(() => window.FLAnalytics.track('prova', { a: 1 }),
    'track() senza window.gtag non lancia niente');

  let eventi = [];
  window.gtag = (tipo, nome, params) => { if (tipo === 'event') eventi.push([nome, params || {}]); };
  const conta = (nome) => eventi.filter(([n]) => n === nome).length;
  // I parametri arrivano dal realm di jsdom (engine.js gira dentro dom.window):
  // per deepEqual serve una copia vera nel realm di questo file, altrimenti
  // Node li tratta come non "reference-equal" pur essendo identici.
  const ultimo = (nome) => {
    const p = eventi.filter(([n]) => n === nome).slice(-1)[0]?.[1];
    return p ? { ...p } : p;
  };
  const nessunDatoPersonale = () => {
    const vietate = /nome|email|punt|risp|pick/i;
    for (const [nome, params] of eventi) {
      for (const chiave of Object.keys(params || {})) {
        assert.ok(!vietate.test(chiave), `${nome}: parametro "${chiave}" sembra un dato personale`);
      }
    }
  };

  /* ---- game_start + location_opened alla prima lobby, mai piu' dopo ---- */
  eventi = [];
  VN.clearSave();
  VN.boot(story, { speed: 0, banca, quiz, scene: 'lobby' });
  assert.equal(conta('game_start'), 1, 'game_start una volta sola, alla lobby');
  assert.deepEqual(ultimo('game_start'), { entry_point: 'lobby' });
  assert.equal(conta('location_opened'), 1, 'e una location_opened per la lobby');
  assert.deepEqual(ultimo('location_opened'), { location_name: 'lobby' });

  /* ---- la Hall of Fame: zona + quadro, e niente doppioni girando l'hub ---- */
  VN.step(); VN.step(); VN.step();                    // le battute prima dell'hub
  $('hnext').onclick({ stopPropagation() {} });        // -> zona 2, Hall of Fame
  assert.equal(conta('hall_of_fame_opened'), 1, 'hall_of_fame_opened alla prima apertura della zona');
  assert.deepEqual(ultimo('location_opened'), { location_name: 'hall_of_fame' });
  const quadri = () => [...$('hubspots').querySelectorAll('.hspot')];
  quadri()[0].onclick({ stopPropagation() {} });        // halloffame_fabio -> 2024
  assert.deepEqual(ultimo('hall_of_fame_edition_opened'), { edition: '2024' });
  $('quadrochiudi').onclick({ stopPropagation() {} });
  quadri()[2].onclick({ stopPropagation() {} });        // halloffame_nicola -> 2026
  assert.deepEqual(ultimo('hall_of_fame_edition_opened'), { edition: '2026' });
  $('quadrochiudi').onclick({ stopPropagation() {} });
  assert.equal(conta('hall_of_fame_edition_opened'), 2, 'un evento per ogni quadro aperto, anche ripetuto');
  // giro completo dell'hub: si ripassa dalla Hall of Fame, niente evento in piu'
  $('hnext').onclick({ stopPropagation() {} });
  $('hnext').onclick({ stopPropagation() {} });
  $('hnext').onclick({ stopPropagation() {} });
  assert.equal(conta('hall_of_fame_opened'), 1, 'ma hall_of_fame_opened non si ripete');
  assert.equal(conta('location_opened'), 2, 'due location_opened in tutto: lobby e hall_of_fame');

  /* ---- pronostici: dalla griglia al blocco delle previsioni ---- */
  eventi = [];
  VN.clearSave();
  VN.boot(story, { speed: 0, banca, quiz, scene: 'keynote' });
  VN.state.genere = 'f'; VN.state.stile = 'ingegnere'; VN.state.nome = 'Franca';
  {
    const bottoni = () => [...$('choices').querySelectorAll('.ch')];
    const celle = () => [...$('griglia').querySelectorAll('.gcell')];
    let giri = 0;
    while (VN.sceneId !== 'teleprompter' && giri++ < 900) {
      if ($('griglia').classList.contains('on')) {
        const libere = celle().filter((c) => !c.classList.contains('fatta'));
        if (!libere.length) { VN.step(); continue; }
        libere[0].onclick({ stopPropagation() {} });
      } else if ($('choices').classList.contains('on')) {
        bottoni()[0].onclick({ stopPropagation() {} });
      } else {
        VN.step();
      }
    }
  }
  assert.equal(VN.sceneId, 'teleprompter', 'si arriva al teleprompter');
  assert.equal(conta('predictions_started'), 1, 'predictions_started una volta sola');
  assert.equal(conta('category_selected'), 3, 'una per macroargomento, mai due volte lo stesso');
  assert.deepEqual(new Set(eventi.filter(([n]) => n === 'category_selected').map(([, p]) => p.category)),
    new Set(['iphone', 'watch', 'altro']));
  assert.equal(conta('prediction_completed'), 3, 'una per macroargomento completato');
  assert.equal(conta('predictions_complete'), 1, 'e il completamento di tutte, una volta sola');
  assert.deepEqual(ultimo('predictions_complete'), { completed_categories: 3 });
  assert.equal(conta('teleprompter_started'), 1, 'entrando nel teleprompter parte anche questo, una volta');
  assert.equal(conta('teleprompter_complete'), 0, 'non ancora: le previsioni non sono bloccate');

  // il blocco delle previsioni: la conferma nella modale, come nel resto del gioco
  VN.step(); VN.step();                                // le due battute prima del recap
  $('blocca').onclick({ stopPropagation() {} });
  [...$('modalbtns').querySelectorAll('.ch')][0].onclick({ stopPropagation() {} });   // Si', confermo
  assert.equal(VN.state.locked, true);
  assert.equal(conta('teleprompter_complete'), 1, 'teleprompter_complete al blocco');
  assert.equal(VN.sceneId, 'finale');

  /* ---- email facoltativa: solo un invio riuscito manda l'evento ---- */
  eventi = [];
  VN.clearSave();
  VN.boot(story, { speed: 0, banca, quiz, scene: 'finale' });
  VN.state.nome = 'Franca'; VN.state.locked = true;
  {
    let giri = 0;
    while (!$('emailwrap').classList.contains('on') && giri++ < 60) VN.step();
  }
  assert.ok($('emailwrap').classList.contains('on'), 'schermata email raggiunta');
  $('emailok').onclick({ stopPropagation() {} });        // campo vuoto = salto
  assert.equal(conta('email_submitted'), 0, 'saltare col campo vuoto non manda l\'evento');

  eventi = [];
  VN.clearSave();
  VN.boot(story, { speed: 0, banca, quiz, scene: 'finale' });
  VN.state.nome = 'Franca'; VN.state.locked = true;
  {
    let giri = 0;
    while (!$('emailwrap').classList.contains('on') && giri++ < 60) VN.step();
  }
  $('emailin').value = 'franca@esempio.com';
  $('emailok').onclick({ stopPropagation() {} });
  assert.equal(conta('email_submitted'), 1, 'email valida: l\'evento parte, una volta sola');
  assert.deepEqual(ultimo('email_submitted'), { method: 'optional_results_email' });
  nessunDatoPersonale();

  /* ---- il quiz di Peter: griglia, livelli, e la fine della scaletta ---- */
  eventi = [];
  VN.clearSave();
  VN.boot(story, { speed: 0, banca, quiz, scene: 'quiz' });
  VN.state.stile = 'ingegnere';
  VN.state.locked = true;
  VN.state.quiz_visto = true;
  VN.step(); VN.step(); VN.step();
  assert.equal(conta('quiz_started'), 1, 'quiz_started una volta sola, alla griglia');
  assert.equal(conta('location_opened'), 1, 'e la location "quiz_area"');
  assert.deepEqual(ultimo('location_opened'), { location_name: 'quiz_area' });

  const cellePerLivello = () => [...$('griglia').querySelectorAll('.gcell')];
  const tutteQuiz = Object.values(quiz.pool).flat(2);
  const rispondiQuizGiusto = () => {
    const d = tutteQuiz.find((x) => x.q === $('txt').textContent);
    assert.ok(d, `domanda a schermo non trovata nel pool: "${$('txt').textContent}"`);
    const btns = [...$('choices').querySelectorAll('.ch')].filter((b) => !b.classList.contains('perk'));
    btns[d.ok].onclick({ stopPropagation() {} });
    VN.step();
  };
  for (const liv of ['base', 'avanzato', 'leggenda']) {
    const cella = cellePerLivello().find((c) => c.dataset.livello === liv);
    assert.ok(cella, `livello ${liv} in griglia`);
    cella.onclick({ stopPropagation() {} });
    assert.equal(VN.sceneId, 'quiz_livello', `si entra nel livello ${liv}`);
    for (let k = 0; k < quiz.livelli[liv].domande; k++) rispondiQuizGiusto();
    assert.ok(eventi.some(([n, p]) => n === 'quiz_level_complete' && p.quiz_level === liv && p.result === 'passed'),
      `quiz_level_complete(${liv}, passed)`);
    VN.step();                                          // torna alla griglia
    assert.equal(VN.sceneId, 'quiz', 'si torna alla griglia');
    VN.step(); VN.step(); VN.step();
  }
  assert.equal(conta('quiz_level_started'), 3, 'un quiz_level_started per livello, non di piu\'');
  assert.equal(conta('quiz_complete'), 1, 'quiz_complete quando la scaletta e\' davvero finita');
  assert.deepEqual(ultimo('quiz_complete'), { highest_level_completed: 'leggenda' });
  nessunDatoPersonale();

  /* ---- game_complete: solo al countdown, e riflette cosa e' stato fatto ---- */
  eventi = [];
  VN.clearSave();
  VN.boot(story, { speed: 0, banca, quiz, scene: 'countdown', stato: { locked: false } });
  assert.equal(conta('game_complete'), 1, 'game_complete al countdown, una volta sola');
  assert.deepEqual(ultimo('game_complete'), { predictions_completed: false, quiz_completed: false });

  eventi = [];
  VN.clearSave();
  VN.boot(story, { speed: 0, banca, quiz, scene: 'countdown',
    stato: { locked: true, _ga: { quiz_complete: true } } });
  assert.deepEqual(ultimo('game_complete'), { predictions_completed: true, quiz_completed: true },
    'i due flag riflettono lo stato della partita, non un numero o un punteggio');
  nessunDatoPersonale();

  delete window.gtag;
}

if (todoAssets.size) console.log(`asset ancora da disegnare (${todoAssets.size}):`, [...todoAssets].join(', '));
console.log(`banca domande: ${idsDomande.size} domande, ${nBattute} battute · quiz: ${idsQuiz.size} domande`);
console.log('smoke test: OK');
