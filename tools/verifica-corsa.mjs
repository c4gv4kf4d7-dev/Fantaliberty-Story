/* Gioca una partita intera ad Apple Campus Run e controlla che tutto risponda.

   Perche' serve: la corsa e' una pagina a se', con un canvas e un'interfaccia
   sua, e `npm test` gira in jsdom — non disegna, non anima, non clicca. Tutto
   quello che si rompe qui dentro si rompe in silenzio.

   Non e' un test di grafica: e' un test di comandi. Apre la corsa dal gioco
   vero (porta STAFF ONLY della lobby), gioca, prende una botta, recupera un
   cuore, passa un traguardo, apre il menu, muore, riparte ed esce — e a ogni
   passo chiede: ha risposto?

   Due difetti veri li ha gia' trovati, e nessuno dei due si vedeva stando
   fermi a guardare le schermate: "annulla, resto qui" che non era collegato a
   niente (e chi apriva la conferma d'uscita restava chiuso li' dentro), e la
   classifica che si apriva sotto il menu, che le mangiava i tocchi.

   Serve un server locale attivo:
     npm run serve       (in un terminale)
     npm run corsa       (in un altro)

   Il 404 di run_traguardo e' atteso: quell'insegna non e' ancora disegnata e
   al suo posto la corsa mette un segnaposto. Anche il timeout verso Supabase
   e' atteso quando non c'e' rete: la classifica non deve fermare il gioco. */
import { chromium } from 'playwright';

const INDIRIZZO = process.env.URL || 'http://localhost:8099';
const esiti = [];
let rotti = 0;

function dice(cosa, ok) {
  esiti.push((ok ? '  ok  ' : '  NO  ') + cosa);
  if (!ok) rotti++;
  return ok;
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium'
});
const pagina = await browser.newPage({ viewport: { width: 390, height: 844 } });
const erroriJs = [], richiesteFallite = [];
pagina.on('pageerror', (e) => erroriJs.push('PAGINA: ' + e.message));
pagina.on('console', (m) => {
  if (m.type() === 'error' && !/404|ERR_CONNECTION|ERR_NAME/.test(m.text())) {
    erroriJs.push('CONSOLE: ' + m.text());
  }
});
pagina.on('response', (r) => {
  if (r.status() >= 400) richiesteFallite.push(r.status() + ' ' + r.url().split('/').pop());
});

/* ---------- arrivarci come ci arriva il giocatore ---------- */
await pagina.goto(INDIRIZZO + '/index.html?scene=lobby', { waitUntil: 'networkidle' });
await pagina.evaluate(() => {
  VN.state.locked = true; VN.state.post_lobby_visto = true;
  VN.state.genere = 'm'; VN.state.nome = 'Collaudo'; VN.state.stile = 'drip';
});
for (let i = 0; i < 10 && !(await pagina.$eval('#hub', (e) => e.classList.contains('on'))); i++) {
  await pagina.evaluate(() => VN.step());
  await pagina.waitForTimeout(350);
}
for (let g = 0; g < 6; g++) {
  const etichette = await pagina.$$eval('#hubspots button', (bs) => bs.map((b) => b.getAttribute('aria-label')));
  if (etichette.some((x) => /STAFF/i.test(x || ''))) break;
  await pagina.click('#hnext');
  await pagina.waitForTimeout(700);
}
await pagina.click('#hubspots button');
await pagina.waitForTimeout(1000);
if (await pagina.$('#modal.on')) { await pagina.click('#modal .ch'); await pagina.waitForTimeout(1000); }
for (let i = 0; i < 40 && !pagina.frames().find((f) => f.url().includes('/runner/')); i++) {
  await pagina.waitForTimeout(200);
}
const corsa = pagina.frames().find((f) => f.url().includes('/runner/'));
if (!dice('la corsa si apre dalla porta STAFF ONLY', !!corsa)) {
  console.log(esiti.join('\n'));
  await browser.close();
  process.exit(1);
}

const nelRiquadro = (f) => corsa.evaluate(f);
const testo = (sel) => corsa.$eval(sel, (e) => e.textContent);
const nascosto = (sel) => corsa.$eval(sel, (e) => e.hidden || e.classList.contains('spento'));

dice('il bottone audio del gioco sparisce dietro la corsa',
  !(await pagina.$eval('#audiobtn', (e) => getComputedStyle(e).display !== 'none')));
dice('la targa e\' spenta prima di cominciare', await nascosto('#hud'));

/* ---------- il tutorial ---------- */
await corsa.click('#btnVia');
await pagina.waitForTimeout(600);
const schede = [];
for (let i = 0; i < 3; i++) {
  if (await corsa.$eval('#lezione', (e) => !e.hidden)) {
    schede.push(await testo('#lezTitolo'));
    await corsa.click('#lezOk');
    await pagina.waitForTimeout(500);
  } else await pagina.waitForTimeout(900);
}
dice('il tutorial mostra le due schede: ' + schede.join(' + '), schede.length === 2);

/* Da qui in poi gli ostacoli veri si tolgono: le botte le da' il collaudo
   quando servono, se no una partita su tre il personaggio muore prima della
   prova successiva e il risultato dipende dalla fortuna. */
await nelRiquadro(() => {
  window.__pulisci = true;
  (function giro() {
    if (window.__pulisci) {
      RUN.intoccabile = 9e9;
      RUN.cose = RUN.cose.filter((c) => !['ostacolo', 'cartello', 'arco'].includes(c.tipo));
    }
    requestAnimationFrame(giro);
  })();
});

/* ---------- si corre ---------- */
await pagina.waitForTimeout(1500);
const primaDeiPunti = await nelRiquadro(() => RUN.punti);
await pagina.waitForTimeout(2500);
const dopoIPunti = await nelRiquadro(() => RUN.punti);
dice('il punteggio sale correndo (' + primaDeiPunti + ' -> ' + dopoIPunti + ')', dopoIPunti > primaDeiPunti);
dice('la targa mostra lo stesso numero',
  Math.abs(+(await testo('#punti')) - dopoIPunti) < 40);
dice('i cuori a schermo sono tre',
  (await corsa.$$eval('#vite span', (s) => s.filter((x) => !x.classList.contains('spenta')).length)) === 3);
dice('il record e\' scritto per esteso', /^RECORD \d+$/.test(await testo('#record')));
dice('la faccia e\' neutra mentre si corre', (await corsa.$eval('#faccia', (e) => e.className)) === '');

/* ---------- una botta ---------- */
await nelRiquadro(() => {
  window.__pulisci = false; RUN.vite = 3; RUN.intoccabile = 0;
  RUN.cose = [{ tipo: 'ostacolo', z: 0.05, corsia: RUN.corsiaVista }];
});
await pagina.waitForTimeout(300);
dice('la botta toglie un cuore', (await nelRiquadro(() => RUN.vite)) === 2);
dice('e la faccia fa male', (await corsa.$eval('#faccia', (e) => e.className)) === 'male');
dice('un cuore si spegne nella targa',
  (await corsa.$$eval('#vite span', (s) => s.filter((x) => x.classList.contains('spenta')).length)) === 1);
await pagina.waitForTimeout(1300);
dice('la faccia torna neutra da sola', (await corsa.$eval('#faccia', (e) => e.className)) === '');

/* ---------- il cuore del livello ---------- */
await nelRiquadro(() => { RUN.cose = [{ tipo: 'vita', z: 0.05, corsia: RUN.corsiaVista }]; });
await pagina.waitForTimeout(300);
dice('il cuore recuperato torna a tre', (await nelRiquadro(() => RUN.vite)) === 3);
dice('e la faccia e\' contenta', (await corsa.$eval('#faccia', (e) => e.className)) === 'contento');

/* ---------- il traguardo ---------- */
await nelRiquadro(() => { RUN.raccolti = 1001; });
for (let i = 0; i < 60 && !(await nelRiquadro(() => !!RUN.annuncio)); i++) await pagina.waitForTimeout(100);
dice('il traguardo annuncia il livello', await nelRiquadro(() => !!RUN.annuncio));

/* ---------- il menu ---------- */
await corsa.click('#btnIng');
await pagina.waitForTimeout(400);
const distanzaAllApertura = await nelRiquadro(() => RUN.distanza);
await pagina.waitForTimeout(900);
dice('il menu ferma il gioco', (await nelRiquadro(() => RUN.distanza)) === distanzaAllApertura);
const voci = await corsa.$$eval('#menu .voci button', (bs) => bs.filter((b) => !b.hidden).map((b) => b.textContent));
dice('cinque voci: ' + voci.join(' / '), voci.length === 5);
await corsa.click('#mnMusica');
await pagina.waitForTimeout(300);
dice('la musica del gioco si spegne davvero', (await pagina.evaluate(() => VN.audio.stato.mus)) === false);
await corsa.click('#mnMusica');
await pagina.waitForTimeout(300);
dice('e si riaccende', (await pagina.evaluate(() => VN.audio.stato.mus)) === true);
await corsa.click('#mnClassifica');
await pagina.waitForTimeout(600);
dice('la classifica si apre', await corsa.$eval('#veloClassifica', (e) => !e.hidden));
await corsa.click('#btnChiudiClassifica');       // sopra il menu: se ci finisse sotto, qui si pianta
await pagina.waitForTimeout(300);
dice('e si chiude tornando al menu', await corsa.$eval('#menu', (e) => !e.hidden));
await corsa.click('#mnRiprendi');
await pagina.waitForTimeout(600);
dice('riprendi fa ripartire la corsa', (await nelRiquadro(() => RUN.fase)) === 'corsa');

/* ---------- morire ---------- */
await nelRiquadro(() => {
  window.__pulisci = false; RUN.vite = 1; RUN.intoccabile = 0;
  RUN.cose = [{ tipo: 'ostacolo', z: 0.05, corsia: RUN.corsiaVista }];
});
await pagina.waitForTimeout(300);
dice('si muore e compare la schermata', (await nelRiquadro(() => RUN.fase)) === 'fine');
dice('la targa sparisce', await nascosto('#hud'));
dice('l\'ingranaggio sparisce', await nascosto('#btnIng'));
dice('i tasti sono congelati', await corsa.$eval('#veloFine', (e) => e.classList.contains('congelato')));
await nelRiquadro(() => {
  window.__colpi = 0;
  document.getElementById('btnAncora').addEventListener('click', () => window.__colpi++);
});
for (let i = 0; i < 8; i++) {
  await corsa.click('#veloFine', { position: { x: 195, y: 430 }, force: true }).catch(() => {});
  await pagina.waitForTimeout(40);
}
dice('pestare sullo schermo non preme niente', (await nelRiquadro(() => window.__colpi)) === 0);
for (let i = 0; i < 40 && await corsa.$eval('#veloFine', (e) => e.classList.contains('congelato')); i++) {
  await pagina.waitForTimeout(100);
}
dice('poi i tasti si riaccendono', !(await corsa.$eval('#veloFine', (e) => e.classList.contains('congelato'))));

/* ---------- ancora, e uscire ---------- */
await corsa.click('#btnAncora');
await pagina.waitForTimeout(700);
dice('ANCORA fa ripartire', ['corsa', 'lezione'].includes(await nelRiquadro(() => RUN.fase)));
dice('la targa torna', !(await nascosto('#hud')));
dice('e l\'ingranaggio torna', !(await nascosto('#btnIng')));

await corsa.click('#btnIng');
await pagina.waitForTimeout(400);
await corsa.click('#mnEsci');
await pagina.waitForTimeout(400);
dice('ESCI chiede conferma', await corsa.$eval('#uscita', (e) => !e.hidden));
await corsa.click('#btnEsciNo');                 // se non fosse collegato, qui si pianta
await pagina.waitForTimeout(400);
dice('annullando si resta nella corsa', await pagina.$eval('#runwrap', (e) => e.classList.contains('on')));
await corsa.click('#btnIng');
await pagina.waitForTimeout(300);
await corsa.click('#mnEsci');
await pagina.waitForTimeout(300);
await corsa.click('#btnEsciSi');
await pagina.waitForTimeout(900);
dice('confermando si torna in lobby',
  !(await pagina.$eval('#runwrap', (e) => e.classList.contains('on'))) &&
  (await pagina.evaluate(() => VN.sceneId)) === 'lobby');
dice('e il bottone audio del gioco torna',
  await pagina.$eval('#audiobtn', (e) => getComputedStyle(e).display !== 'none'));

/* ---------- il verdetto ---------- */
console.log(esiti.join('\n'));
if (erroriJs.length) console.log('\nerrori JavaScript:\n  ' + erroriJs.join('\n  '));
const attese = [...new Set(richiesteFallite)].filter((r) => !/run_traguardo/.test(r));
if (attese.length) console.log('\nrichieste fallite: ' + attese.join(', '));
console.log('\n' + (rotti ? 'ROTTO: ' + rotti + ' controlli su ' + esiti.length
                          : 'OK: ' + esiti.length + ' controlli, tutti passati'));
await browser.close();
process.exit(rotti || erroriJs.length ? 1 : 0);
