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
const KNOWN = new Set(['say', 'choice', 'input', 'avatar', 'show', 'hide', 'prop', 'bg', 'react', 'fx', 'wait', 'set', 'goto', 'end']);
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
  }
}

/* ---------- 2. asset: fondali e prop devono esistere; i personaggi non ancora
   disegnati sono ammessi (il motore mostra la scena senza personaggio) ---------- */
const base = story.meta.assetBase || '';
const onDisk = (rel) => fs.existsSync(path.join(ROOT, base + rel));

for (const kind of ['bg', 'props']) {
  for (const rel of Object.values(story.assets[kind] || {})) {
    assert.ok(onDisk(rel), `asset mancante: ${base + rel}`);
  }
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

// avatar: 4 layer, ogni layer deve avere il suo slot con almeno un'opzione
const av = story.avatar;
assert.ok(av && av.layers?.length === 4, 'avatar: servono 4 layer');
for (const slot of av.layers) {
  const s = av.slots.find((x) => x.id === slot);
  assert.ok(s?.options?.length, `avatar: slot "${slot}" senza opzioni`);
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
assert.equal(opts.length, 3);
opts[1].onclick({ stopPropagation() {} });              // femminile
assert.equal(VN.state.genere, 'f');
assert.equal($('tval_genere').textContent, 'FEMMINILE');

// scelta anzianita'
assert.match(txt(), /da quanto tempo lavori in Apple/);
[...$('choices').querySelectorAll('.ch')][2].onclick({ stopPropagation() {} });   // 5-10 anni
assert.equal(VN.state.anni, '2');
assert.equal($('tval_anni').textContent, '5-10 ANNI');
assert.equal($('tval___ok').textContent, '> REGISTRAZIONE OK');

// avatar a 4 layer: preselezione, cambio opzione, conferma
assert.ok($('picker').classList.contains('on'), 'picker avatar visibile');
assert.match(txt(), /Costruisci il tuo avatar/);
assert.equal($('avatar').querySelectorAll('.alayer').length, 4, '4 layer disegnati');
assert.equal(VN.state.avatar_testa, 'a', 'preselezione del primo slot');
const optC = [...$('picker').querySelectorAll('.popt')].find((b) => b.dataset.option === 'c');
optC.onclick({ stopPropagation() {} });
assert.equal(VN.state.avatar_testa, 'c', 'opzione avatar cambiata');
$('pok').onclick({ stopPropagation() {} });

// l'avatar sopravvive al cambio scena
assert.equal($('avatar').querySelectorAll('.alayer').length, 4, 'avatar ancora in scena');

// scena benvenuto: variante di genere femminile + sprite happy
assert.match(txt(), /^Benvenuta allo Steve Jobs Theater, FRANCO!/, 'variante {g:} femminile');
assert.ok($('npcBody').getAttribute('src').includes('chr_lucas_felice'), 'posa felice dopo il flash');

VN.step();
assert.match(txt(), /Ti sei registrata senza intoppi\. Da 5 a 10 anni in Apple/, 'label scelta riusata nel testo');

VN.step();
assert.match(txt(), /Direi che sei pronta/);

/* ---------- 4. salvataggio / ripresa ---------- */
assert.ok(VN.hasSave(story), 'partita salvata in localStorage');
const saved = VN.readSave();
assert.equal(saved.state.nome, 'Franco');
assert.equal(saved.scene, 'benvenuto');

// nuova sessione: riprende dal checkpoint invece di ricominciare
VN.boot(story, { speed: 0 });
assert.match(txt(), /Avevi lasciato il gioco a "Atto 1 — Benvenuto"/, 'prompt di ripresa');
const resumeBtns = [...$('choices').querySelectorAll('.ch')];
assert.equal(resumeBtns.length, 2);
resumeBtns[0].onclick({ stopPropagation() {} });                       // Riprendi
assert.equal(VN.state.nome, 'Franco', 'variabili ripristinate');
assert.match(txt(), /Direi che sei pronta/, 'ripreso dalla battuta giusta');
assert.ok($('npcBody').getAttribute('src').includes('chr_lucas_felice'), 'scena ricomposta (posa corretta)');

// ...oppure ricomincia da capo e il salvataggio sparisce
VN.boot(story, { speed: 0 });
[...$('choices').querySelectorAll('.ch')][1].onclick({ stopPropagation() {} });   // Ricomincia
assert.equal(VN.hasSave(story), false, 'salvataggio cancellato');
assert.match(txt(), /Io sono Lucas/, 'ripartito dalla prima scena');

/* ---------- 5. atto 2: personaggi ancora senza sprite ---------- */
VN.boot(story, { speed: 0, scene: 'ritardo_ceo' });
assert.match(txt(), /Ternus e' in ritardo/, 'atto 2 raggiungibile');
assert.equal($('name').textContent, 'Susan', 'nome parlante preso dal cast');
assert.ok($('npcBody').getAttribute('src').includes('chr_susan_corpo_in_piedi'), 'posa di Susan referenziata');
assert.equal(typeof $('npcBody').onerror, 'function', 'file mancante: il personaggio viene nascosto, niente immagine rotta');

// la reazione segue il TONO della scelta, mai il contenuto del pronostico
VN.step();
VN.step();
const toni = [...$('choices').querySelectorAll('.ch')];
assert.equal(toni.length, 2);
toni[0].onclick({ stopPropagation() {} });
assert.equal(VN.state.tono, 'sfacciato');

/* ---------- 6. variante maschile, percorso rapido ---------- */
VN.clearSave();
VN.boot(story, { speed: 0 });
VN.step();
$('ti').value = 'Luca'; $('ti').oninput(); $('tok').onclick();
[...$('choices').querySelectorAll('.ch')][0].onclick({ stopPropagation() {} });   // maschile
[...$('choices').querySelectorAll('.ch')][0].onclick({ stopPropagation() {} });   // <1 anno
$('pok').onclick({ stopPropagation() {} });                                      // avatar di default
assert.match(txt(), /^Benvenuto allo Steve Jobs Theater, LUCA!/, 'variante {g:} maschile');

if (todoAssets.size) console.log(`asset ancora da disegnare (${todoAssets.size}):`, [...todoAssets].join(', '));
console.log('smoke test: OK');
