/* Controlla che un cambio di scena non lasci passare "intrusi": il fondale
   della scena di prima, o il personaggio di prima, visibili per un fotogramma
   mentre la luce si alza sulla scena nuova.

   L'invariante controllata e' semplice: quando qualcosa e' visibile a schermo,
   la sua immagine deve essere gia' decodificata (img.complete). Se non lo e',
   il browser sta ancora disegnando quella vecchia — ed e' esattamente il lampo
   che si vedeva entrando in lobby.

   Serve un server locale attivo:  npm run serve   (poi)  node tools/verifica-transizioni.mjs
   Gli asset vengono rallentati apposta: senza rallentamento il problema non si
   riproduce su una macchina veloce con la cache calda. */
import { chromium, devices } from 'playwright';

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ ...devices['iPhone 13'] });
const p = await ctx.newPage();
await p.route('**/assets/chars/**', async r => { await new Promise(s => setTimeout(s, 1800)); r.continue(); });
await p.route('**/assets/bg/**', async r => { await new Promise(s => setTimeout(s, 1200)); r.continue(); });

await p.goto('http://localhost:8080/', { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.VN && VN.story, null, { timeout: 20000 });
await p.evaluate(() => {
  VN.clearSave();
  VN.boot(VN.story, { speed: 22, banca: VN.banca, quiz: VN.quiz, scene: 'badge' });
  VN.state.nome = 'Mike'; VN.state.genere = 'm'; VN.state.anni = '1';
});

// La scena di partenza qui viene montata a freddo (il gioco vero non parte mai
// a meta' storia): si aspetta che sia a regime, poi si registra il passaggio.
await p.waitForFunction(() => {
  const bg = document.getElementById('bg');
  return bg.complete && bg.naturalWidth > 0;
}, null, { timeout: 20000 });

// un fotogramma alla volta: un lampo dura meno di un campionamento a intervalli
await p.evaluate(() => {
  window.__f = [];
  const tick = () => {
    const npc = document.getElementById('npc');
    const cs = getComputedStyle(npc);
    const bg = document.getElementById('bg');
    const body = document.getElementById('npcBody');
    window.__f.push({
      scena: VN.sceneId,
      velo: +getComputedStyle(document.getElementById('nero')).opacity,
      bgPronto: bg.complete && bg.naturalWidth > 0,
      npcVisibile: cs.visibility === 'visible' && +cs.opacity > 0.05,
      npcPronto: body.complete && body.naturalWidth > 0,
    });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

// avanti a tocchi fino alla dissolvenza che porta in lobby
for (let i = 0; i < 25; i++) {
  if (await p.evaluate(() => VN.sceneId !== 'badge')) break;
  const btn = await p.$('#choices .ch, #modalbtns .ch');
  if (btn) await btn.click(); else await p.click('#stage');
  await p.waitForTimeout(350);
}
await p.waitForTimeout(8000);

const f = await p.evaluate(() => window.__f);
const scoperto = x => x.velo < 0.95;                       // il velo nero non copre piu'
const fondaleIntruso = f.filter(x => scoperto(x) && !x.bgPronto);
const figuraIntrusa = f.filter(x => scoperto(x) && x.npcVisibile && !x.npcPronto);

console.log('fotogrammi:', f.length, '· scene:', [...new Set(f.map(x => x.scena))].join(' -> '));
console.log('fondale non ancora pronto ma gia\' scoperto:', fondaleIntruso.length);
console.log('personaggio visibile con lo sprite non pronto:', figuraIntrusa.length);
await b.close();

if (fondaleIntruso.length || figuraIntrusa.length) {
  console.error('KO: la scena si scopre prima di essere pronta');
  process.exit(1);
}
console.log('OK: nessun intruso');
