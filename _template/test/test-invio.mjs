// Estrae la logica di invio dal gioco e la prova contro un server finto,
// simulando i guasti che possono capitare il giorno del lancio.
import http from 'node:http';
import fs from 'node:fs';

const src = fs.readFileSync('/home/user/Fantaliberty-WWDC-26/_template/game.html', 'utf8');
function estrai(nome) {
  const i = src.indexOf(nome);
  if (i < 0) throw new Error('non trovata: ' + nome);
  let d = 0, s = src.indexOf('{', i), j = s;
  do { if (src[j] === '{') d++; else if (src[j] === '}') d--; j++; } while (d > 0);
  return src.slice(i, j);
}

// ─── server finto: /ok scrive, /500 fallisce, /lento non risponde mai ───
let scritte = [];
const srv = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => {
    const cors = { 'Access-Control-Allow-Origin': '*' };
    if (req.url.startsWith('/ok')) {
      scritte.push({ dove: req.url, body });
      res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } else if (req.url.startsWith('/500')) {
      res.writeHead(500, cors); res.end('boom');
    } else if (req.url.startsWith('/lento')) {
      /* non risponde: deve scattare il timeout */
    } else { res.writeHead(404, cors); res.end(); }
  });
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + srv.address().port;

// ─── costruisce lo scenario ───
function costruisci({ apps, supa }) {
  scritte = [];
  const ctx = {
    APPS_SCRIPT_URL: apps ? base + apps : '',
    SUPABASE_URL: supa ? base + supa : '',
    SUPABASE_ANON_KEY: supa ? 'chiave-finta' : '',
    SUPABASE_TABELLA: 't',
    EDIZIONE: 'settembre26',
    PREDICTIONS: [{ id: 1, name: 'Previsione A', cost: 5, prob: 'mid' }],
    selected: new Set([1]),
    identity: { name: 'Anna', surname: 'Bianchi', dept: 'Shopping', seniority: '0–3 anni', iphone: '17', store: 'Carosello', email: 'a@b.it' },
    computeBadge: () => ({ e: '🎲', n: 'Scommettitore' }),
    fetch, console, setTimeout, clearTimeout, AbortController, Promise, Error, Object, JSON, URLSearchParams,
  };
  // Supabase REST vuole il path senza /rest/v1 nel nostro finto server
  const code = [
    estrai('function raccogliDati()'),
    estrai('async function inviaAdAppsScript('),
    estrai('async function inviaASupabase(').replace("+'/rest/v1/'+SUPABASE_TABELLA", "+''"),
    estrai('function archiviAttivi()'),
    estrai('async function conRitentativo('),
    estrai('async function submitAnswers()'),
    'return submitAnswers;'
  ].join('\n');
  const f = new Function(...Object.keys(ctx), code);
  return f(...Object.values(ctx));
}

const scenari = [
  ['solo Apps Script, funziona',        { apps: '/ok-apps' },                    true,  1],
  ['solo Supabase, funziona',           { supa: '/ok-supa' },                    true,  1],
  ['entrambi attivi, entrambi ok',      { apps: '/ok-apps', supa: '/ok-supa' },  true,  2],
  ['entrambi attivi, Apps Script giù',  { apps: '/500',     supa: '/ok-supa' },  true,  1],
  ['entrambi attivi, Supabase giù',     { apps: '/ok-apps', supa: '/500' },      true,  1],
  ['entrambi giù → deve FALLIRE',       { apps: '/500',     supa: '/500' },      false, 0],
  ['nessuno configurato → FALLIRE',     {},                                      false, 0],
];

let pass = 0, fail = 0;
for (const [nome, cfg, atteso, minScritte] of scenari) {
  let esito, err = '';
  try { await costruisci(cfg)(); esito = true; }
  catch (e) { esito = false; err = e.message; }
  const ok = esito === atteso && (!atteso || scritte.length >= minScritte);
  console.log(`${ok ? '✅' : '❌'} ${nome.padEnd(36)} esito=${esito ? 'ok' : 'errore'} scritture=${scritte.length}${!atteso && err ? '  → "' + err.slice(0, 60) + '"' : ''}`);
  ok ? pass++ : fail++;
}

// timeout
console.log('\n--- timeout (server che non risponde) ---');
const t0 = Date.now();
try { await costruisci({ apps: '/lento' })(); console.log('❌ doveva fallire'); fail++; }
catch (e) { const s = Math.round((Date.now() - t0) / 1000); console.log(`✅ fallito dopo ~${s}s (2 tentativi da 15s + pausa)`); pass++; }

console.log(`\n${pass} superati, ${fail} falliti`);
srv.close();
process.exit(fail ? 1 : 0);
