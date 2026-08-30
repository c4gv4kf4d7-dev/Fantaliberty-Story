import { chromium, devices } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ ...devices['iPhone 13'] });
const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8080/?dev',{waitUntil:'networkidle'});
await p.waitForSelector('#dev.on');
for (const bt of await p.$$('#dev .riga button')) if ((await bt.innerText()).includes("Gia' fatti")) await bt.click();
for (const bt of await p.$$('#dev .scena')) { const t=(await bt.innerText()).split('\n')[1]||'';
  if (t.split(' ')[0]==='finale'){ await bt.click(); break; } }
await p.evaluate(()=>{VN.speed=0;});
for (let k=0;k<40 && await p.evaluate(()=>VN.i<17);k++){ await p.click('#stage',{force:true}); await p.waitForTimeout(90); }
await p.waitForTimeout(500);
console.log('siamo a', await p.evaluate(()=>VN.sceneId+'#'+VN.i));
console.log('UI visibile:', await p.evaluate(()=>{
  const out={};
  for (const id of ['emailwrap','emailin','emailok','emailsalta','nero','curtain','boxwrap','stage']) {
    const e=document.getElementById(id);
    out[id]= e ? (e.offsetParent? 'VISIBILE class='+e.className : 'nascosto class='+e.className) : 'ASSENTE';
  }
  out.bottoni=[...document.querySelectorAll('button')].filter(b=>b.offsetParent).map(b=>(b.id||b.className)+':"'+b.textContent.trim().slice(0,18)+'"');
  return JSON.stringify(out,null,1);
}));
await p.screenshot({path:'shots/a-email.png'});
console.log('errori:', errs.length?errs:'nessuno');
await b.close();
