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

/* ---------- 1. validazione dello script ---------- */
const todoAssets = new Set();

// risolve un personaggio: cast + posa + espressione (file separati)
function partOf(who, kind, id) {
  const c = story.cast?.[who];
  return c && id ? c[kind]?.[id] : undefined;
}
const KNOWN = new Set(['logo', 'boot', 'title', 'say', 'choice', 'input', 'list', 'badge', 'hub', 'carosello', 'griglia', 'domande', 'bivio', 'intermezzo', 'recap', 'show', 'hide', 'io', 'prop', 'bg', 'react', 'fx', 'carrellata', 'sipario', 'nero', 'luce', 'wait', 'set', 'goto', 'end']);
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
    if (st.t === 'title') assert.ok(st.lines?.length, `scena ${id}: title senza righe`);
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
      assert.ok(h.goto || h.say || h.set,
        `scena ${id}, zona ${z.id}: hotspot "${h.label}" non fa niente`);
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
for (const kind of ['bg', 'props', 'platea']) {
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
VN.boot(story, { speed: 0, banca, onEnd: (s) => { ended = s; } });   // speed 0 = niente timer

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

// scena benvenuto: variante di genere femminile + sprite happy
assert.match(txt(), /^Ecco il tuo badge, FRANCO\./, 'Lucas consegna il badge');
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
VN.boot(story, { speed: 0, banca });
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
VN.boot(story, { speed: 0, banca });
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
VN.boot(story, { speed: 0, banca, scene: 'aggancio' });
assert.match(txt(), /Ehi TU/, 'Susan urla dal palco in fondo');
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
assert.match(txt(), /fai l'host tu/);
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
assert.ok($('bg').getAttribute('src').includes('sala_teatro'), 'e ancora il fondale della sala');
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

// le altre due risposte non alzano il flag
VN.boot(story, { speed: 0, banca, scene: 'aggancio' });
for (let i = 0; i < 4; i++) VN.step();
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
  VN3.boot(story, { speed: 30, banca, scene: 'aggancio' });
  assert.ok($3('tende').classList.contains('on'), 'le due meta\' della tenda sono a schermo');
  assert.ok($3('tendaSx').style.backgroundImage.includes('lobby_z1_tenda'),
    'e portano il fondale che c\'era prima, non quello nuovo');
  assert.ok($3('bg').getAttribute('src').includes('sala_teatro'), 'dietro c\'e\' gia\' la sala');
  // cambiare scena mentre una transizione e' in corso non deve lasciare
  // mezzo fondale appeso sopra quella nuova
  VN3.boot(story, { speed: 30, banca, scene: 'lobby' });
  assert.equal($3('tende').classList.contains('on'), false, 'la transizione interrotta si chiude');
  assert.equal($3('prlx').children.length, 0);
}

/* ---------- 5d. S3: il camerino e la scelta dello stile ----------
   Lo stile decide gli sprite di S4-S7 e il perk di S8: e' la scelta piu' pesante
   del gioco, e l'unica che non si puo' rifare. */
{
  VN.clearSave();
  VN.boot(story, { speed: 0, banca, scene: 'camerino' });
  VN.state.genere = 'f';
  const dots = () => [...$('cdots').querySelectorAll('.cdot')];

  assert.match(txt(), /Scegli il tuo stile/, 'Susan apre la scena');
  assert.ok($('npcBody').getAttribute('src').includes('chr_susan_guarda_orologio'));
  VN.step();

  assert.ok($('carosello').classList.contains('on'), 'si apre il carosello');
  assert.ok($('boxwrap').classList.contains('carta'), 'e il box del dialogo lascia il posto alla scheda');
  assert.equal(dots().length, 4, 'quattro stili');
  assert.equal($('carnome').textContent, 'Hawaiano', 'si parte dal primo dello script');
  assert.match($('cardesc').textContent, /Non sa che ore sono/);
  // il perk e' l'informazione che decide la scelta: deve stare sulla scheda,
  // non aspettare il quiz
  assert.match($('carperk').textContent, /un tentativo fallito non si conta/);
  assert.ok($('carImg').getAttribute('src').includes('stile_hawaiano_idle_camerino'));

  $('cnext').onclick({ stopPropagation() {} });
  assert.equal($('carnome').textContent, 'Showman');
  assert.match($('carperk').textContent, /ordine libero/);
  $('cprev').onclick({ stopPropagation() {} });
  $('cprev').onclick({ stopPropagation() {} });
  assert.equal($('carnome').textContent, 'Ingegnere', 'il carosello gira');
  assert.match($('carperk').textContent, /\+3 secondi/);
  assert.ok($('carImg').getAttribute('src').includes('stile_ingegnere_idle_camerino'));

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

  // [S3.04] Susan commenta con la testa dello stile scelto: lo sprite lo decide
  // la variabile, non uno step per valore
  assert.ok($('npcBody').getAttribute('src').includes('chr_susan_commento_stile_ingegnere'),
    'la posa "commento_{stile}" si risolve sulla scelta');
  assert.match(txt(), /^Una che sembra sapere quello che dice/, 'commento dello stile giusto, declinato');
}

/* ---------- 5e. S4: dietro le quinte ----------
   Qui succedono due cose per la prima volta: il giocatore entra in scena come
   figura, e qualcuno parla senza esserci (Martha, dalla regia). */
{
  // Si entra da S3, non saltando direttamente qui: lo stile va scelto prima che
  // la scena parta, perche' e' lui a decidere lo sprite del giocatore.
  VN.clearSave();
  VN.boot(story, { speed: 0, banca, scene: 'camerino' });
  VN.state.genere = 'f';
  VN.step();                                                   // -> carosello
  $('cnext').onclick({ stopPropagation() {} });                // Showman
  $('carok').onclick({ stopPropagation() {} });
  [...$('modalbtns').querySelectorAll('.ch')][0].onclick({ stopPropagation() {} });
  assert.equal(VN.state.stile, 'showman');
  VN.step();                                                   // -> scena quinte

  assert.equal(VN.sceneId, 'quinte', 'da S3 si passa a S4');
  assert.ok($('ioImg').getAttribute('src').includes('stile_showman_idle_camerino'),
    'il giocatore entra in scena con lo stile che ha scelto');
  assert.match(txt(), /Studiato, vero\?/);
  VN.step();
  const scelte = [...$('choices').querySelectorAll('.ch')];
  assert.equal(scelte.length, 2);
  scelte[1].onclick({ stopPropagation() {} });                 // "No."
  assert.equal(VN.state.studiato, false);
  assert.match(txt(), /^Onesta\./, 'la risposta e\' declinata');
  VN.step();

  assert.ok($('avatar').classList.contains('on'), 'il giocatore e\' in scena');
  assert.ok($('ioImg').getAttribute('src').includes('stile_showman_idle_palco'),
    'con lo sprite dello stile scelto, non uno generico');
  assert.ok($('npcBody').getAttribute('src').includes('chr_susan_spinta_in_scena'));
  assert.match(txt(), /Non guardare in alto/);
  VN.step();

  // il sipario del palco e' lo stesso effetto della tenda della lobby
  const sip = story.scenes.quinte.steps.find((s) => s.t === 'sipario');
  assert.equal(sip.davanti, 'palco_sipario_chiuso');
  assert.equal(sip.dietro, 'palco_platea_piena');
  assert.ok($('bg').getAttribute('src').includes('palco_platea_piena'), 'si apre sul palco');

  // Martha parla dalla regia: niente sprite in scena, icona e box di un altro colore
  assert.equal($('nametxt').textContent, 'Martha');
  assert.ok($('name').classList.contains('incuffia'), 'accanto al nome c\'e\' l\'auricolare');
  assert.ok($('boxwrap').classList.contains('incuffia'), 'e il box cambia colore');
  assert.ok($('voce').getAttribute('src').includes('chr_martha_indicatore_regia'));
  assert.match(txt(), /sono Martha, regia/);
  VN.step(); VN.step();
  assert.match(txt(), /Quando sei pronta tu/, 'ultima riga, declinata');

  // e quando riprende a parlare qualcuno che c'e' davvero, la cuffia sparisce
  VN.boot(story, { speed: 0, banca, scene: 'camerino' });
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
  VN.boot(story, { speed: 0, banca, scene: 'keynote' });
  VN.state.genere = 'f'; VN.state.stile = 'drip'; VN.state.nome = 'Franca';

  // [S5.INTERMEZZO.R1/R2]: due scommesse di regia prima di cominciare
  assert.match(txt(), /chi entra per primo/, 'primo intermezzo');
  assert.equal($('nametxt').textContent, 'Martha');
  scegli(1);                                                   // John Ternus, val 2
  assert.equal(VN.state.punti, 2, 'gli intermezzi valgono il "val" secco');
  assert.match(txt(), /la luce per Craig/, 'secondo intermezzo');
  scegli(0);                                                   // val 3
  assert.equal(VN.state.punti, 5);
  assert.equal(VN.state.intermezzi, 2, 'gli intermezzi si consumano in ordine');

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
    for (let g = 0; g < 8 && !$('choices').classList.contains('on'); g++) VN.step();
  }
  assert.equal(Object.keys(VN.state.picks.watch.core).length, 3, 'tutte e tre le core segnate');

  // [S5.BIVIO]: le facoltative si pescano QUI, non a inizio partita
  assert.match(txt(), /entrare nel dettaglio/, 'il bivio di Martha');
  assert.equal(VN.state.pescate, null, 'prima del bivio non e\' stato pescato niente');
  scegli(0);                                                   // approfondiamo
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
  for (const k of ['asset', 'extra_asset']) {
    if (e[k]) assert.ok(fs.existsSync(path.join(ROOT, base + e[k])),
      `micro-evento ${e.id}: "${e[k]}" non esiste`);
  }
}
for (const [stile, e] of Object.entries(banca.eventi_personali)) {
  assert.ok(story.stili[stile], `evento personale per lo stile "${stile}", che non esiste`);
  for (const k of ['asset', 'extra_asset']) {
    if (e[k]) assert.ok(fs.existsSync(path.join(ROOT, base + e[k])),
      `evento personale ${e.id}: "${e[k]}" non esiste`);
  }
  if (e.platea) assert.ok(story.assets.platea[e.platea.replace(/^pla_/, '')],
    `evento personale ${e.id}: reazione "${e.platea}" non dichiarata`);
}

/* ---------- 5h. S5: il keynote si chiude da solo ----------
   Fatti tutti e tre i macroargomenti la griglia deve cedere il turno e mandare
   avanti la scena. Senza, il giocatore resterebbe a girare per sempre fra tre
   pannelli tutti spenti. */
{
  VN.clearSave();
  VN.boot(story, { speed: 0, banca, scene: 'keynote' });
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
  assert.equal(VN.state.intermezzi, 5, 'cinque intermezzi: due all\'inizio e uno per macroargomento');
  assert.ok(VN.state.punti > 0, 'il punteggio si accumula');
  // il sacchetto degli eventi non si ripete: ogni evento al massimo una volta
  assert.ok(VN.state.eventi_sacchetto, 'il sacchetto degli eventi e\' stato creato');
  const tutti = banca.micro_eventi.length + 1;
  assert.ok(VN.state.eventi_sacchetto.length < tutti, 'e qualche evento e\' uscito');

  /* ---------- S6: recap, modifica, blocco ---------- */
  // si arriva qui con una partita vera alle spalle: e' il momento giusto per
  // provare il recap, che senza risposte non avrebbe niente da mostrare
  VN.step(); VN.step();                                        // le due battute di Martha
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
    VN.boot(story, { speed: 0, banca, scene: 'argomenti' });
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

/* ---------- 5b. S1: hub della lobby a quattro zone ----------
   Il vincolo dello script e' che la tenda NON sia toccabile finche' il giocatore
   non ha scorso almeno una volta: senza quello entra in sala senza accorgersi che
   la lobby era visitabile, e la meta' del contenuto di S1 non la vede nessuno. */
{
  VN.clearSave();
  VN.boot(story, { speed: 0, banca, scene: 'lobby' });
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
  assert.ok($('bg').getAttribute('src').includes('hall_of_fame'), 'fondale della zona 2');
  assert.match(txt(), /Hall of Fame/);
  assert.ok($('npcBody').getAttribute('src').includes('chr_francesca_idle'), 'Francesca c\'e\' anche qui');
  // Lo scorrimento si anima sul fondale, non sul personaggio: #npc ha gia' la sua
  // animazione d'ingresso, e una seconda la sovrascriveva lasciandolo trasparente
  // a fine corsa — a schermo Francesca spariva da tutte le zone dopo il primo swipe.
  assert.ok($('bg').classList.contains('vaiSx'), 'il fondale scorre');
  assert.equal($('npc').classList.contains('vaiSx'), false, 'il personaggio no');
  assert.ok($('npc').classList.contains('in'), 'ed entra con la sua animazione');
  // l'hotspot che commenta e basta non fa uscire dall'hub
  spots()[0].onclick({ stopPropagation() {} });
  assert.equal(VN.sceneId, 'lobby');
  assert.match(txt(), /albo d'oro/);

  // zona 4: Peter dorme finche' i pronostici non sono chiusi
  $('hnext').onclick({ stopPropagation() {} });
  $('hnext').onclick({ stopPropagation() {} });
  assert.ok(dots()[3].classList.contains('sel'), 'quarta zona');
  assert.ok($('bg').getAttribute('src').includes('quiz_bloccata'), 'zona 4 ancora chiusa');
  assert.ok($('npcBody').getAttribute('src').includes('chr_peter_occhi_bassi'), 'Peter dorme');
  // si vede Peter, ma a commentare e' Francesca: chi parla e chi e' in scena
  // sono due cose diverse
  assert.equal($('name').textContent, 'Francesca', 'la battuta sulla zona 4 e\' di Francesca');
  spots()[0].onclick({ stopPropagation() {} });
  assert.ok($('npcBody').getAttribute('src').includes('chr_peter_alza_occhi'), 'al tocco si sveglia di scatto');
  assert.equal($('name').textContent, 'Peter', 'ma al tocco parla Peter');
  assert.match(txt(), /Prima segui il keynote/);
  assert.equal(VN.sceneId, 'lobby', 'la zona 4 chiusa non porta al quiz');

  // giro completo: si torna alla tenda, e adesso ENTRA e' attivo
  $('hnext').onclick({ stopPropagation() {} });
  assert.ok(dots()[0].classList.contains('sel'), 'l\'hub e\' circolare');
  assert.equal(spots()[0].classList.contains('chiuso'), false, 'dopo lo swipe ENTRA si accende');
  assert.match(txt(), /La tenda e' quella/, 'ora parla la zona, non piu\' il tutorial');

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
  VN.boot(story, { speed: 0, banca, scene: 'lobby' });
  VN.state.locked = true;                       // come dopo il lock di S6
  VN.step(); VN.step(); VN.step();
  const dots = () => [...$('hdots').querySelectorAll('.hdot')];
  assert.equal(dots().length, 4, 'restano quattro zone anche dopo il lock');
  $('hnext').onclick({ stopPropagation() {} });
  $('hnext').onclick({ stopPropagation() {} });
  $('hnext').onclick({ stopPropagation() {} });
  assert.ok($('bg').getAttribute('src').includes('quiz_aperta'), 'zona 4 aperta');
  assert.ok($('npcBody').getAttribute('src').includes('chr_peter_alza_occhi'), 'Peter sveglio');
  const spot = $('hubspots').querySelector('.hspot');
  spot.onclick({ stopPropagation() {} });
  [...$('modalbtns').querySelectorAll('.ch')][0].onclick({ stopPropagation() {} });
  assert.equal(VN.sceneId, 'quiz', 'ora la zona 4 porta al quiz');
}

/* ---------- 6. variante maschile, percorso rapido ---------- */
VN.clearSave();
VN.boot(story, { speed: 0, banca });
VN.step();                    // luci
VN.step();                    // prima battuta di Lucas
$('ti').value = 'Luca'; $('ti').oninput(); $('tok').onclick();
const scegli = (i) => [...$('choices').querySelectorAll('.ch')][i].onclick({ stopPropagation() {} });
scegli(0);   // maschile
scegli(0);   // store: Piazza Liberty
scegli(0);   // dipartimento: Operation
scegli(0);   // anzianita': 0-2 anni
$('tsel').value = '17'; $('tsel').onchange(); $('tselok').onclick({ stopPropagation() {} });
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

  VN2.boot(story, { speed: 30, banca, scene: 'quiz' });          // hide+show sono istantanei,
  // il motore e' gia' fermo sullo step "say" successivo, a meta' della scrittura
  VN2.step();                                             // tap #1: skip, mostra la riga intera
  const dopoSkip = $2('txt').textContent;
  assert.match(dopoSkip, /2007/, 'skip mostra subito la riga intera');

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
const BONUS = { consenso: 0, plausibile: 1, controcorrente: 2 };
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
assert.equal(domande.intermezzi.length, 5, '5 intermezzi di regia fissi');
assert.equal(Object.keys(domande.eventi_personali).length, 4, 'un evento personale per stile');
for (const s of STILI) assert.ok(domande.eventi_personali[s], `manca l'evento personale di ${s}`);

/* ---------- 9. quiz di Peter (game/quiz.json) ---------- */
const quiz = JSON.parse(fs.readFileSync(path.join(ROOT, 'game/quiz.json'), 'utf8'));
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
assert.equal(Number(sommaMult.toFixed(2)), quiz.tetto_mult,
  'la somma dei moltiplicatori pieni deve fare esattamente il tetto dichiarato');

if (todoAssets.size) console.log(`asset ancora da disegnare (${todoAssets.size}):`, [...todoAssets].join(', '));
console.log(`banca domande: ${idsDomande.size} domande, ${nBattute} battute · quiz: ${idsQuiz.size} domande`);
console.log('smoke test: OK');
