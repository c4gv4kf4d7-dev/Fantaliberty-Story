import { chromium, devices } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ ...devices['iPhone 13'] });
const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(String(e.message).slice(0,100)));
const avanti = async () => p.evaluate(()=>{
  if (document.querySelector('#ti')?.offsetParent){const t=document.getElementById('ti');t.value='Mike';t.dispatchEvent(new Event('input'));document.getElementById('tok').click();return;}
  if (document.querySelector('#emailin')?.offsetParent){const k=document.getElementById('emailsalta'); if(k&&k.offsetParent){k.click();return;}}
  if (document.querySelector('#tsel')?.offsetParent){const s=document.getElementById('tsel');s.selectedIndex=1;s.dispatchEvent(new Event('change'));document.getElementById('tselok').click();return;}
  for (const sel of ['#modalbtns button','#choices .ch','#carok','#griglia button:not(.fatta)','#blocca','#cdbtn']) {
    const e=[...document.querySelectorAll(sel)].filter(x=>x.offsetParent&&!x.disabled)[0]; if(e){e.click();return;} }
  const av=[...document.querySelectorAll('.hspot:not(.chiuso)')].filter(x=>x.offsetParent&&/ENTRA|QUIZ/i.test(x.getAttribute('aria-label')||''));
  if (av[0]){av[0].click();return;}
  const nx=document.getElementById('hnext'); if(nx&&nx.offsetParent){nx.click();return;}
  document.getElementById('stage').click();
});
const stato = () => p.evaluate(()=>{
  let r=0; const pk=VN.state.picks||{};
  for(const c of Object.keys(pk)) for(const t of Object.keys(pk[c])) r+=Object.keys(pk[c][t]).length;
  return {sc:VN.sceneId,i:VN.i,punti:VN.state.punti,nome:VN.state.nome,genere:VN.state.genere,
          stile:VN.state.stile,locked:VN.state.locked,risposte:r};
});
await p.goto('http://localhost:8080/?reset=1&fast=1',{waitUntil:'networkidle'});
await p.waitForFunction(()=>window.VN&&VN.story);
await p.evaluate(()=>{VN.speed=0;});

const guai=[];
let controlli=0;
for (let n=0;n<700;n++){
  await avanti(); await p.waitForTimeout(45);
  // ogni 25 passi: simulo la chiusura del browser e la riapertura
  if (n%25===24) {
    const prima = await stato();
    if (!prima.sc) break;
    const salvato = await p.evaluate(()=>{ try{return JSON.parse(localStorage.getItem('fl_nexus_save_v1'));}catch(e){return null;} });
    await p.goto('http://localhost:8080/?fast=1',{waitUntil:'networkidle'});   // senza reset: e' una riapertura vera
    await p.waitForFunction(()=>window.VN&&VN.story);
    await p.evaluate(()=>{VN.speed=0;});
    await p.waitForTimeout(200);
    // la schermata di ripresa: clicco "Riprendi"
    const ripreso = await p.evaluate(()=>{
      const b=[...document.querySelectorAll('#choices .ch')].find(x=>/riprend/i.test(x.textContent));
      if(b){b.click();return true;} return false;
    });
    await p.waitForTimeout(300);
    const dopo = await stato();
    controlli++;
    const perso=[];
    if (!salvato) perso.push('niente salvataggio in localStorage');
    if (!ripreso && prima.sc) perso.push('nessuna offerta di ripresa');
    for (const k of ['nome','genere','stile','locked','punti','risposte']) {
      if (JSON.stringify(prima[k])!==JSON.stringify(dopo[k])) perso.push(k+': '+JSON.stringify(prima[k])+' -> '+JSON.stringify(dopo[k]));
    }
    if (dopo.sc!==prima.sc) perso.push('scena: '+prima.sc+' -> '+dopo.sc);
    if (perso.length) guai.push('a '+prima.sc+'#'+prima.i+' → '+perso.join('; '));
  }
}
console.log('interruzioni provate:', controlli);
console.log(guai.length ? 'PERDITE:\n  '+guai.join('\n  ') : 'nessuna perdita di stato');
console.log('errori JS:', errs.length?[...new Set(errs)]:'nessuno');
await b.close();
