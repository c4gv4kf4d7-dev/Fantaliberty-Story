/* Controlla che NESSUN cambio di scena lasci passare un "intruso": il fondale
   della scena di prima, il personaggio di prima, o un riquadro che compare con
   dentro ancora l'immagine precedente.

   Perche' serve: un <img> a cui si cambia "src" continua a disegnare l'immagine
   vecchia finche' la nuova non e' decodificata. `npm test` gira in jsdom, che
   non carica immagini: questa famiglia di bug non la vede proprio.

   L'invariante controllata, fotogramma per fotogramma: se una cosa e' visibile
   a schermo (e non c'e' il nero o il sipario a coprire), la sua immagine deve
   essere gia' decodificata. Altrimenti quello che si vede e' roba di prima.

   Ogni scena viene provata come DESTINAZIONE, partendo da un'altra scena gia'
   a schermo: e' il caso in cui gli intrusi si vedono.

   Serve un server locale attivo:
     npm run serve            (in un terminale)
     npm run transizioni      (in un altro)
   Gli asset vengono rallentati apposta: a cache calda il problema non si
   riproduce, e infatti sfuggiva. */
import { chromium, devices } from 'playwright';

// Si possono spostare da riga di comando per mettere alla prova un caso
// preciso: CHARS=0 BG=3000 (fondale lento) e' quello in cui il personaggio
// nuovo rischia di entrare sopra il fondale vecchio.
const LENTEZZA_CHARS = +(process.env.CHARS ?? 1500);
const LENTEZZA_BG = +(process.env.BG ?? 1000);
const ATTESA_SCENA = +(process.env.ATTESA ?? 4000);   // quanto si registra dopo il cambio
const SOLO = process.env.SOLO || '';                  // filtro sulle transizioni

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ ...devices['iPhone 13'] });
const p = await ctx.newPage();
const errori = [];
p.on('pageerror', (e) => errori.push('JS: ' + e.message));
await p.route('**/assets/chars/**', async (r) => { await new Promise((s) => setTimeout(s, LENTEZZA_CHARS)); r.continue(); });
await p.route('**/assets/bg/**', async (r) => { await new Promise((s) => setTimeout(s, LENTEZZA_BG)); r.continue(); });

await p.goto('http://localhost:8080/?subito', { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.VN && VN.story, null, { timeout: 30000 });

// il registratore: un fotogramma alla volta, perche' un lampo dura meno di
// qualunque campionamento a intervalli
await p.addInitScript(() => {});
const registratore = () => {
  window.__f = [];
  window.__rec = false;
  window.__prima = { bg: '', npc: '' };
  // NB: subito dopo un cambio di src, img.complete risponde ancora per
  // l'immagine vecchia. currentSrc invece dice quale file e' davvero a schermo.
  const pronta = (img) => {
    if (!img || !img.complete || !img.naturalWidth) return false;
    const voluta = (img.getAttribute('src') || '').replace(/^\.\//, '');
    const vera = img.currentSrc || img.src || '';
    return !!voluta && vera.endsWith(voluta);
  };
  const visibile = (nodo) => {
    if (!nodo) return false;
    const cs = getComputedStyle(nodo);
    return cs.visibility === 'visible' && cs.display !== 'none' && +cs.opacity > 0.05;
  };
  const tick = () => {
    if (window.__rec) {
      const coperto = +getComputedStyle(document.getElementById('nero')).opacity > 0.95
        || document.getElementById('curtain').classList.contains('on')
        || document.getElementById('tende').classList.contains('on');
      const bg = document.getElementById('bg');
      const npc = document.getElementById('npc');
      const corpo = document.getElementById('npcBody');
      const guai = [];

      if (!coperto) {
        const bgNuovo = bg.getAttribute('src') !== window.__prima.bg;
        const bgPronto = pronta(bg);
        const npcVisibile = visibile(npc) && visibile(corpo) && corpo.getAttribute('src');
        // Chi il motore intende mostrare adesso. Lo dichiara lui con data-chi;
        // se manca (versioni vecchie del motore) si ricava dal nome del file,
        // altrimenti il controllo passerebbe sempre senza guardare niente.
        const daFile = (src) => ((src || '').split('/').pop().split('_')[1] || '');
        const chi = npc.getAttribute('data-chi') || daFile(corpo.getAttribute('src'));
        const entrato = npcVisibile && chi && chi !== window.__prima.chi;

        // 1. e' entrato un personaggio nuovo ma la sua immagine non e' pronta:
        //    quello che si vede e' ancora il personaggio della scena di prima
        if (entrato && !pronta(corpo)) guai.push('personaggio di prima ancora a schermo');
        // 2. il personaggio nuovo sopra il fondale della scena vecchia
        if (entrato && bgNuovo && !bgPronto) guai.push('personaggio nuovo su fondale vecchio');

        // 3. i riquadri che compaiono: oggetti, badge, platea, carosello
        const coppie = [
          ['propwrap', 'prop', 'oggetto'],
          ['ospitewrap', 'ospite', 'ospite'],
          ['evpropwrap', 'evprop', 'oggetto evento'],
          ['platea', 'plateaImg', 'platea'],
          ['badgewrap', 'badgeImg', 'badge'],
          ['carosello', 'carImg', 'carosello'],
        ];
        for (const [wrap, img, nome] of coppie) {
          const w = document.getElementById(wrap);
          const i = document.getElementById(img);
          if (w && i && i.getAttribute('src') && visibile(w) && visibile(i) && !pronta(i)) {
            guai.push(nome + ' non pronto');
          }
        }
      }
      if (guai.length) window.__f.push({ scena: VN.sceneId, guai,
        nero: +getComputedStyle(document.getElementById('nero')).opacity,
        tende: document.getElementById('tende').classList.contains('on'),
        chi: npc.getAttribute('data-chi'),
        bgSrc: (bg.getAttribute('src') || '').split('/').pop(),
        bgOk: pronta(bg), t: performance.now() });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};
await p.evaluate(registratore);

// Solo i passaggi che la storia puo' davvero fare: "next" di ogni scena e ogni
// "goto" scritto negli step. Provare coppie inventate darebbe falsi allarmi
// (due scene che nella storia non si toccano mai).
const transizioni = await p.evaluate(() => {
  const scene = VN.story.scenes;
  const fuori = [];
  const cerca = (nodi, da) => (nodi || []).forEach((n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return cerca(n, da);
    if (n.goto && scene[n.goto]) fuori.push([da, n.goto]);
    ['steps', 'zones', 'hotspots', 'options', 'after', 'esci'].forEach((k) => {
      if (n[k]) cerca(Array.isArray(n[k]) ? n[k] : [n[k]], da);
    });
  });
  Object.keys(scene).forEach((id) => {
    if (scene[id].next && scene[scene[id].next]) fuori.push([id, scene[id].next]);
    cerca(scene[id].steps, id);
  });
  return fuori.filter(([a, b], i) => a !== b
    && fuori.findIndex(([c, d]) => c === a && d === b) === i);
});

const stato = () => ({ nome: 'Mike', genere: 'm', anni: '1', stile: 'showman', store: 'liberty', reparto: 'shopping' });

const monta = async (id, extra = {}) => {
  await p.evaluate(([scena, st]) => {
    VN.clearSave();
    VN.boot(VN.story, { speed: 22, banca: VN.banca, quiz: VN.quiz, scene: scena, stato: st });
  }, [id, { ...stato(), ...extra }]);
};

// aspetta che la scena di partenza sia a regime: quello che succede al primo
// montaggio a freddo non e' un cambio di scena
const aRegime = () => p.waitForFunction(() => {
  const bg = document.getElementById('bg');
  return bg.complete && bg.naturalWidth > 0;
}, null, { timeout: 30000 }).catch(() => {});

let problemi = 0;
for (const [partenza, destinazione] of transizioni.filter(([a, b]) => !SOLO || (a + '->' + b).includes(SOLO))) {
  await monta(partenza);
  await aRegime();
  await p.waitForTimeout(600);
  await p.evaluate(() => {
    window.__prima = {
      bg: document.getElementById('bg').getAttribute('src'),
      npc: document.getElementById('npcBody').getAttribute('src'),
      chi: document.getElementById('npc').getAttribute('data-chi')
        || ((document.getElementById('npcBody').getAttribute('src') || '').split('/').pop().split('_')[1] || ''),
    };
    window.__f = [];
    window.__rec = true;
  });
  await monta(destinazione);
  await p.waitForTimeout(ATTESA_SCENA);
  await p.evaluate(() => { window.__rec = false; });
  const f = await p.evaluate(() => window.__f);
  const tipi = [...new Set(f.flatMap((x) => x.guai))];
  if (f.length && process.env.DETTAGLI) console.log('   primo:', JSON.stringify(f[0]), '\n   ultimo:', JSON.stringify(f[f.length-1]));
  if (f.length) problemi++;
  console.log(`${partenza} -> ${destinazione}`.padEnd(34) + (f.length ? `KO  ${f.length} fotogrammi · ${tipi.join(', ')}` : 'ok'));
}

await b.close();
console.log(errori.length ? 'errori JS: ' + errori.join(' | ') : 'nessun errore JS');
if (problemi) {
  console.error(`\nKO: ${problemi} transizioni su ${transizioni.length} scoprono qualcosa prima che sia pronto`);
  process.exit(1);
}
console.log(`\nOK: nessun intruso in ${transizioni.length} transizioni`);
