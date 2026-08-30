import { chromium, devices } from 'playwright';
import fs from 'fs';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const report = {};
const scene = ['arrivo','ingresso','registrazione','badge','lobby','aggancio','camerino',
  'quinte','keynote','argomenti','argomento','teleprompter','finale','countdown',
  'quiz','quiz_livello','moltiplicatori'];

for (const dev of ['iPhone SE']) {
  const ctx = await b.newContext({ ...devices[dev] });
  for (const sc of scene) {
    const p = await ctx.newPage();
    const errs=[], ko=[];
    p.on('pageerror', e=>errs.push(String(e.message).slice(0,120)));
    p.on('requestfailed', r=>{ if(!/fonts\.google/.test(r.url())) ko.push(r.url().split('/').slice(-2).join('/')); });
    p.on('response', r=>{ if(r.status()>=400) ko.push(r.status()+' '+r.url().split('/').pop()); });
    try {
      await p.goto('http://localhost:8080/?dev',{waitUntil:'networkidle'});
      await p.waitForSelector('#dev.on',{timeout:8000});
      await p.evaluate(()=>document.fonts.ready);
      for (const bt of await p.$$('#dev .riga button')) if ((await bt.innerText()).includes("Gia' fatti")) await bt.click();
      let ok=false;
      for (const bt of await p.$$('#dev .scena')) {
        const t=(await bt.innerText()).split('\n')[1]||'';
        if (t.split(' ')[0]===sc){ await bt.click(); ok=true; break; }
      }
      if(!ok){ (report[sc]=report[sc]||[]).push(dev+': non nel menu di salto'); await p.close(); continue; }
      await p.evaluate(()=>{VN.speed=0;});
      const guai=new Set();
      for (let k=0;k<16;k++){
        await p.waitForTimeout(130);
        for (const g of await p.evaluate(()=>{
          const out=[];
          const vis=(e)=>{const s=getComputedStyle(e);return s.display!=='none'&&s.visibility!=='hidden'&&+s.opacity>0.05&&e.offsetParent!==null;};
          const larg=(e)=>{try{const r=document.createRange();r.selectNodeContents(e);return r.getBoundingClientRect().width;}catch(x){return 0;}};
          const esenti=['npc','npcBody','npcHead','avatar','ioImg','bg','bg2','prop','badgeImg','carImg','ospite','plateaImg','evprop','sky','prlx','tende','tendaSx','tendaDx','arrow'];
          for (const e of document.querySelectorAll('#stage *')) {
            if(!vis(e)) continue;
            if(esenti.includes(e.id)||e.tagName==='IMG'||e.closest('#npc')||e.closest('#avatar')) continue;
            if(getComputedStyle(e).display==='inline') continue;
            let sk=false; for(let a=e.parentElement;a&&a.id!=='stage';a=a.parentElement){const o=getComputedStyle(a);if(o.overflowY==='auto'||o.overflowY==='scroll'){sk=true;break;}}
            if(sk) continue;
            const t=[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());
            if(!t) continue;
            const r=e.getBoundingClientRect(); if(r.width<2||r.height<2) continue;
            if(r.right>innerWidth+1||r.left<-1||r.bottom>innerHeight+1) out.push('fuori schermo: '+(e.id||e.className)+' "'+e.textContent.trim().slice(0,24)+'"');
            else if(larg(e)>e.clientWidth+2) out.push('testo largo: '+(e.id||e.className)+' "'+e.textContent.trim().slice(0,24)+'"');
            else if(e.scrollHeight>e.clientHeight+2&&getComputedStyle(e).overflowY==='hidden') out.push('testo alto: '+(e.id||e.className)+' "'+e.textContent.trim().slice(0,24)+'"');
          }
          // sprite rotti
          for (const i of document.querySelectorAll('#stage img')) {
            if (i.getAttribute('src') && i.complete && i.naturalWidth===0) out.push('immagine rotta: '+i.getAttribute('src').split('/').pop());
          }
          return out;
        })) guai.add(g);
        await p.click('#stage',{force:true}).catch(()=>{});
      }
      const tutti=[...guai, ...new Set(errs).values? [...new Set(errs)].map(x=>'JS: '+x):[], ...[...new Set(ko)].map(x=>'richiesta fallita: '+x)];
      if (tutti.length) (report[sc]=report[sc]||[]).push(dev+' → '+tutti.slice(0,5).join(' | '));
    } catch(e) { (report[sc]=report[sc]||[]).push(dev+': ECCEZIONE '+String(e.message).slice(0,90)); }
    await p.close();
  }
  await ctx.close();
}
fs.writeFileSync('/tmp/audit/runtime.json', JSON.stringify(report,null,1));
for (const sc of scene) console.log(sc.padEnd(15), report[sc] ? report[sc].join('\n                ') : 'ok');
await b.close();
