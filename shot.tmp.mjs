import { chromium, devices } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ ...devices['iPhone 13'] });
const scene=['ingresso','registrazione','badge','lobby','aggancio','camerino','quinte',
  'keynote','argomenti','argomento','teleprompter','finale','countdown','quiz','quiz_livello','moltiplicatori'];
for (const sc of scene) {
  const p = await ctx.newPage();
  try {
    await p.goto('http://localhost:8080/?dev',{waitUntil:'networkidle'});
    await p.waitForSelector('#dev.on',{timeout:8000});
    await p.evaluate(()=>document.fonts.ready);
    for (const bt of await p.$$('#dev .riga button')) if ((await bt.innerText()).includes("Gia' fatti")) await bt.click();
    for (const bt of await p.$$('#dev .scena')) { const t=(await bt.innerText()).split('\n')[1]||'';
      if (t.split(' ')[0]===sc){ await bt.click(); break; } }
    await p.evaluate(()=>{VN.speed=0;});
    for (let k=0;k<4;k++){ await p.click('#stage',{force:true}).catch(()=>{}); await p.waitForTimeout(160); }
    await p.waitForTimeout(500);
    await p.screenshot({path:`shots/v-${sc}.png`});
  } catch(e){ console.log(sc,'KO',e.message.slice(0,50)); }
  await p.close();
}
await b.close();
