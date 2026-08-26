/* Screenshot del gioco a misura iPhone, per controllare il layout senza telefono.
   Richiede un server locale attivo:  npm run serve   (poi)  node tools/screenshots.mjs
   Le immagini finiscono in shots/ (cartella ignorata da git). */
import { chromium, devices } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ ...devices['iPhone 13'] });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push('JS: ' + e.message));
p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });
p.on('requestfailed', r => errs.push('404?: ' + r.url()));
await p.goto('http://localhost:8080/?fast=1', { waitUntil: 'networkidle' });
await p.waitForTimeout(2600);
await p.screenshot({ path: 'shots/1-arrivo.png' });
await p.click('#stage');                                  // -> registrazione
await p.waitForTimeout(1200);
await p.screenshot({ path: 'shots/2-nome.png' });
await p.fill('#ti', 'Mike'); await p.click('#tok');
await p.waitForTimeout(400);
await p.screenshot({ path: 'shots/3-genere.png' });
await p.click('#choices .ch:nth-child(1)');
await p.waitForTimeout(300);
await p.click('#choices .ch:nth-child(3)');
await p.waitForTimeout(1200);
await p.screenshot({ path: 'shots/4-avatar-1.png' });
await p.click('#pnext'); await p.waitForTimeout(500);
await p.click('#pnext'); await p.waitForTimeout(500);
await p.click('#pnext'); await p.waitForTimeout(1200);
await p.screenshot({ path: 'shots/4-avatar-4.png' });
await p.click('#pok');
await p.waitForTimeout(900);
await p.screenshot({ path: 'shots/5-benvenuto.png' });
console.log(errs.length ? errs.join('\n') : 'nessun errore JS/rete');
await b.close();
