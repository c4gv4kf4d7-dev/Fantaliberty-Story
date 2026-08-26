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
const KNOWN = new Set(['say', 'choice', 'input', 'show', 'hide', 'prop', 'bg', 'fx', 'wait', 'set', 'goto', 'end']);
assert.ok(story.scenes[story.meta.start], 'meta.start punta a una scena esistente');

for (const [id, sc] of Object.entries(story.scenes)) {
  assert.ok(Array.isArray(sc.steps) && sc.steps.length, `scena ${id}: steps non vuoti`);
  if (sc.next) assert.ok(story.scenes[sc.next], `scena ${id}: next "${sc.next}" esiste`);
  if (sc.bg) assert.ok(story.assets.bg[sc.bg], `scena ${id}: bg "${sc.bg}" dichiarato`);
  for (const st of sc.steps) {
    assert.ok(KNOWN.has(st.t), `scena ${id}: step sconosciuto "${st.t}"`);
    if (st.t === 'show') assert.ok(story.assets.chars[st.char], `scena ${id}: char "${st.char}" dichiarato`);
    if (st.t === 'prop' && st.id) assert.ok(story.assets.props[st.id], `scena ${id}: prop "${st.id}" dichiarato`);
    if (st.t === 'goto') assert.ok(story.scenes[st.scene], `scena ${id}: goto "${st.scene}" esiste`);
    if (st.t === 'choice') assert.ok(st.options?.length, `scena ${id}: choice senza opzioni`);
  }
}

/* ---------- 2. gli asset referenziati esistono su disco ---------- */
const base = story.meta.assetBase || '';
for (const items of Object.values(story.assets)) {
  for (const rel of Object.values(items)) {
    if (rel.startsWith('data:') || rel.startsWith('http')) continue;
    assert.ok(fs.existsSync(path.join(ROOT, base + rel)), `asset mancante: ${base + rel}`);
  }
}

/* ---------- 3. flusso di gioco in jsdom ---------- */
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  .replace(/<script src=".*?"><\/script>/, '')
  .replace(/<script>[\s\S]*?<\/script>/, '');           // via il bootstrap con fetch

const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true });
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
assert.ok($('char').getAttribute('src').includes('lucas_neutral'), 'sprite neutro in scena');

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

// scena benvenuto: variante di genere femminile + sprite happy
assert.match(txt(), /^Benvenuta allo Steve Jobs Theater, FRANCO!/, 'variante {g:} femminile');
assert.ok($('char').getAttribute('src').includes('lucas_happy'), 'sprite happy dopo il flash');

VN.step();
assert.match(txt(), /Ti sei registrata senza intoppi\. Da 5 a 10 anni in Apple/, 'label scelta riusata nel testo');

VN.step();
assert.match(txt(), /Direi che sei pronta/);

VN.step();
assert.ok(ended, 'onEnd chiamato a fine storia');
assert.deepEqual(
  { nome: ended.nome, genere: ended.genere, anni: ended.anni },
  { nome: 'Franco', genere: 'f', anni: '2' },
  'stato finale del giocatore'
);

// variante maschile, percorso rapido
VN.boot(story, { speed: 0 });
VN.step();
$('ti').value = 'Luca'; $('ti').oninput(); $('tok').onclick();
[...$('choices').querySelectorAll('.ch')][0].onclick({ stopPropagation() {} });
[...$('choices').querySelectorAll('.ch')][0].onclick({ stopPropagation() {} });
assert.match(txt(), /^Benvenuto allo Steve Jobs Theater, LUCA!/, 'variante {g:} maschile');

console.log('smoke test: OK');
