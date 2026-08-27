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

/* ---------- 1. validazione dello script ---------- */
const todoAssets = new Set();

// risolve un personaggio: cast + posa + espressione (file separati)
function partOf(who, kind, id) {
  const c = story.cast?.[who];
  return c && id ? c[kind]?.[id] : undefined;
}
const KNOWN = new Set(['logo', 'boot', 'title', 'say', 'choice', 'input', 'list', 'badge', 'avatar', 'hub', 'show', 'hide', 'prop', 'bg', 'react', 'fx', 'wait', 'set', 'goto', 'end']);
assert.ok(story.scenes[story.meta.start], 'meta.start punta a una scena esistente');

for (const [id, sc] of Object.entries(story.scenes)) {
  assert.ok(Array.isArray(sc.steps) && sc.steps.length, `scena ${id}: steps non vuoti`);
  if (sc.next) assert.ok(story.scenes[sc.next], `scena ${id}: next "${sc.next}" esiste`);
  if (sc.bg) assert.ok(story.assets.bg[sc.bg], `scena ${id}: bg "${sc.bg}" dichiarato`);
  for (const st of sc.steps) {
    assert.ok(KNOWN.has(st.t), `scena ${id}: step sconosciuto "${st.t}"`);
    if (st.t === 'show') {
      const c = story.cast?.[st.who];
      assert.ok(c, `scena ${id}: personaggio "${st.who}" non e' nel cast`);
      const body = st.body || c.defaultBody;
      assert.ok(c.bodies?.[body], `scena ${id}: posa "${body}" non dichiarata per ${st.who}`);
      if (st.head) assert.ok(c.heads?.[st.head], `scena ${id}: espressione "${st.head}" non dichiarata per ${st.who}`);
    }
    if (st.t === 'react' && st.level === 'pose') assert.ok(st.body, `scena ${id}: react pose senza body`);
    if (st.t === 'react' && st.level === 'expr') assert.ok(st.head, `scena ${id}: react expr senza head`);
    if (st.t === 'prop' && st.id) assert.ok(story.assets.props[st.id], `scena ${id}: prop "${st.id}" dichiarato`);
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
    if (st.t === 'hub') controllaHub(id, st);
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
VN.boot(story, { speed: 0, onEnd: (s) => { ended = s; } });   // speed 0 = niente timer

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
// niente piu' scelta avatar: Lucas consegna il badge
assert.ok(!story.avatar, 'il carosello avatar non e\' piu\' nell\'apertura');
assert.ok(!Object.values(story.scenes).some((sc) => sc.steps.some((st) => st.t === 'avatar')),
  'nessuno step avatar nelle scene');
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

// Lucas consegna il badge: oggetto a schermo, con sopra il nome del giocatore
VN.step();                                              // tap sulla battuta
assert.ok($('badgewrap').classList.contains('in'), 'il badge compare');
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
VN.boot(story, { speed: 0 });
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
VN.boot(story, { speed: 0 });
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

/* ---------- 5. atto 2: Susan (sprite reale, un file per posa) ---------- */
VN.boot(story, { speed: 0, scene: 'ritardo_ceo' });
assert.match(txt(), /Ternus e' in ritardo/, 'atto 2 raggiungibile');
assert.equal($('name').textContent, 'Susan', 'nome parlante preso dal cast');
assert.ok($('npcBody').getAttribute('src').includes('chr_susan_panico_telefoni'), 'posa di Susan referenziata');
assert.equal(typeof $('npcBody').onerror, 'function', 'file mancante: il personaggio viene nascosto, niente immagine rotta');

// la reazione segue il TONO della scelta, mai il contenuto del pronostico
VN.step();
VN.step();
const toni = [...$('choices').querySelectorAll('.ch')];
assert.equal(toni.length, 2);
toni[0].onclick({ stopPropagation() {} });
assert.equal(VN.state.tono, 'sfacciato');

/* ---------- 5b. S1: hub della lobby a quattro zone ----------
   Il vincolo dello script e' che la tenda NON sia toccabile finche' il giocatore
   non ha scorso almeno una volta: senza quello entra in sala senza accorgersi che
   la lobby era visitabile, e la meta' del contenuto di S1 non la vede nessuno. */
{
  VN.clearSave();
  VN.boot(story, { speed: 0, scene: 'lobby' });
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
  assert.equal(VN.sceneId, 'ritardo_ceo', 'ENTRA porta in sala');
  assert.equal($('hub').classList.contains('on'), false, 'uscendo, l\'hub si chiude');
  assert.equal($('hubspots').children.length, 0, 'e non lascia hotspot appesi sopra la scena');
}

/* ---------- 5c. la zona 4 cambia faccia quando i pronostici sono chiusi ---------- */
{
  VN.clearSave();
  VN.boot(story, { speed: 0, scene: 'lobby' });
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
VN.boot(story, { speed: 0 });
VN.step();                    // luci
VN.step();                    // prima battuta di Lucas
$('ti').value = 'Luca'; $('ti').oninput(); $('tok').onclick();
const scegli = (i) => [...$('choices').querySelectorAll('.ch')][i].onclick({ stopPropagation() {} });
scegli(0);   // maschile
scegli(0);   // store: Piazza Liberty
scegli(0);   // dipartimento: Operation
scegli(0);   // anzianita': 0-2 anni
$('tsel').value = '17'; $('tsel').onchange(); $('tselok').onclick({ stopPropagation() {} });
VN.step();   // via il badge stampato
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

  VN2.boot(story, { speed: 30, scene: 'quiz' });          // hide+show sono istantanei,
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
const domande = JSON.parse(fs.readFileSync(path.join(ROOT, 'game/domande.json'), 'utf8'));
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
