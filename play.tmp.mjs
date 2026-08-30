import { chromium, devices } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ ...devices['iPhone 13'] });
const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(String(e.message).slice(0,140)));
await p.goto('http://localhost:8080/?reset=1&fast=1',{waitUntil:'networkidle'});
await p.waitForFunction(()=>window.VN&&VN.story);
await p.evaluate(()=>document.fonts.ready);
await p.evaluate(()=>{VN.speed=0;});

const stato = () => p.evaluate(()=>{
  let risposte=0; const pk=VN.state.picks||{};
  for (const c of Object.keys(pk)) for (const t of Object.keys(pk[c])) risposte+=Object.keys(pk[c][t]).length;
  return {sc:VN.sceneId, i:VN.i, punti:VN.state.punti, locked:VN.state.locked, risposte,
          quiz:JSON.stringify(VN.state.quiz||{}).length, testo:(document.getElementById('txt')||{}).textContent||''};
});
const visitate = new Set(); const trace=[];
let fermo=0, ultimo='';
for (let n=0; n<900; n++) {
  const s = await stato();
  const chiave = [s.sc,s.i,s.punti,s.risposte,s.locked,s.quiz,s.testo.slice(0,40)].join('|');
  if (s.sc) visitate.add(s.sc);
  if (chiave===ultimo) { fermo++; } else { fermo=0; ultimo=chiave; trace.push(s.sc+'#'+s.i); }
  if (fermo>30) { console.log('BLOCCATO:', JSON.stringify(s));
    console.log('dettaglio:', await p.evaluate(()=>{
      const out={};
      const cat=(VN.banca&&VN.banca.categorie)||{};
      for (const k of Object.keys(cat)) {
        const core=Object.keys(((VN.state.picks||{})[k]||{}).core||{}).length;
        const extra=Object.keys(((VN.state.picks||{})[k]||{}).extra||{}).length;
        out[k]=core+'/'+(cat[k].core||[]).length+' core, '+extra+' extra';
      }
      out.__celle=[...document.querySelectorAll('.gcell')].map(c=>c.textContent.trim()+(c.classList.contains('fatta')?' [FATTA]':''));
      return JSON.stringify(out);
    })); break; }
  if (!s.sc) { console.log('FINE partita al passo', n); break; }
  // interagisci con quello che c'e'
  const fatto = await p.evaluate(()=>{
    const cl=(sel)=>{const e=document.querySelector(sel); if(e&&e.offsetParent){e.click();return true;} return false;};
    if (document.querySelector('#ti')?.offsetParent) { const t=document.getElementById('ti');
      t.value='Mike'; t.dispatchEvent(new Event('input')); document.getElementById('tok').click(); return 'nome'; }
    if (document.querySelector('#emailin')?.offsetParent) { const t=document.getElementById('emailin');
      t.value='a@b.it'; t.dispatchEvent(new Event('input'));
      const ok=document.getElementById('emailok'); if(ok&&ok.offsetParent&&!ok.disabled){ok.click();return 'email';}
      const sk=document.getElementById('emailsalta'); if(sk&&sk.offsetParent){sk.click();return 'email saltata';} return 'email?'; }
    if (document.querySelector('#tsel')?.offsetParent) { const s=document.getElementById('tsel');
      s.selectedIndex=1; s.dispatchEvent(new Event('change')); document.getElementById('tselok').click(); return 'lista'; }
    for (const sel of ['#modalbtns button','#choices .ch','#carok','#griglia button:not(.fatta)','#blocca','#cdbtn']) {
      const e=[...document.querySelectorAll(sel)].filter(x=>x.offsetParent && !x.disabled)[0];
      if (e) { e.click(); return sel; }
    }
    // nell'hub: prima gli hotspot che portano avanti, se aperti; se no si scorre
    const av=[...document.querySelectorAll('.hspot:not(.chiuso)')].filter(x=>x.offsetParent
      && /ENTRA|QUIZ/i.test(x.getAttribute('aria-label')||''));
    if (av[0]) { av[0].click(); return 'hotspot avanti'; }
    const nx=document.getElementById('hnext');
    if (nx && nx.offsetParent) { nx.click(); return 'scorri zona'; }
    document.getElementById('stage').click(); return 'tap';
  });
  await p.waitForTimeout(60);
}
console.log('\nscene visitate:', [...visitate].join(', '));
console.log('errori JS:', errs.length? [...new Set(errs)] : 'nessuno');
console.log('stato finale:', JSON.stringify(await stato()));
await b.close();
