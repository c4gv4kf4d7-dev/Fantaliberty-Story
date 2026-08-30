import { chromium, devices } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ ...devices['iPhone 13'] });
const p = await ctx.newPage();
const errs=[], ko=[];
p.on('pageerror',e=>errs.push(String(e.message).slice(0,120)));
p.on('requestfailed',r=>{ if(!/fonts\.google/.test(r.url())) ko.push(r.url().split('/').pop()); });
p.on('response',r=>{ if(r.status()>=400) ko.push(r.status()+' '+r.url().split('/').pop()); });
await p.goto('http://localhost:8080/test/runner/',{waitUntil:'networkidle'});
await p.waitForTimeout(2500);
await p.screenshot({path:'shots/r-avvio.png'});
// provo a giocarci: tap e swipe
for (let k=0;k<12;k++){ await p.click('body',{force:true}).catch(()=>{}); await p.waitForTimeout(400); }
await p.screenshot({path:'shots/r-gioco.png'});
await p.waitForTimeout(4000);
await p.screenshot({path:'shots/r-dopo.png'});
console.log('errori JS:', errs.length?[...new Set(errs)]:'nessuno');
console.log('richieste fallite:', ko.length?[...new Set(ko)].slice(0,8):'nessuna');
await b.close();
