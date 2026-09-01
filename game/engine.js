/* FantaLiberty — motore visual novel data-driven, vanilla JS.
   Nessuna dipendenza: legge game/story.json ed esegue una state machine di step.

   Impostazione (specifiche "Visual - Character & Scenarios"):
     * iPhone portrait, baseline 390x844 pt; il terzo inferiore dello schermo e'
       area dialogo, quindi i fondali non ci mettono dettagli importanti;
     * i personaggi sono CORPO + TESTA separati (posa + espressione), con punto
       di ancoraggio del collo definito una volta per personaggio;
     * la figura del giocatore e' lo sprite dello stile scelto in S3, a sinistra.

   API pubblica:
     VN.boot(story, opts)   avvia il gioco
     VN.state               variabili correnti (debug / smoke test)
     VN.step()              avanza (equivale al tap sullo schermo)
     VN.hasSave() / VN.readSave() / VN.clearSave() / VN.saveNow()

   Step supportati:
     logo | boot | title | say | choice | input | list | badge | hub | carosello |
     griglia | domande | bivio | intermezzo | recap | countdown |
     quizhub | quizlivello | quizmult | show | hide |
     io | react | prop | bg | fx | carrellata | sipario | nero | luce | wait |
     set | goto | end
*/
(function (global) {
  'use strict';

  var $ = function (id) { return global.document.getElementById(id); };

  var VN = {
    // Versione del motore. index.html controlla che sia quella che si aspetta:
    // se il browser mescola una pagina nuova con un motore vecchio preso dalla
    // cache, il gioco resta nero. Da alzare quando cambia il contratto (step
    // nuovi, id nuovi nell'HTML).
    engine: '24',
    story: null,
    banca: null,    // game/domande.json: domande, battute per stile, eventi, intermezzi
    quiz: null,     // game/quiz.json: i tre livelli del quiz di Peter [S8]
    backend: null,  // game/backend.json: dove spedire la schedina chiusa
    state: {},      // variabili di gioco (nome, genere, stile, ...)
    scene: null,
    sceneId: null,
    i: 0,
    speed: 36,      // ms per carattere
    onEnd: null,
    progressed: false
  };

  var el = {};
  var typing = false, tId = null, pending = null, curLine = '', revealUI = null;
  var typeTarget = null;   // nodo su cui si sta scrivendo (box dialogo o cartello)
  var hubTasti = null;     // frecce della tastiera mentre l'hub e' aperto
  var current = { who: null, body: null, head: null };   // NPC in scena

  /* ---------------- Google Analytics 4 ----------------
     Ogni evento di gioco passa da qui, mai da una chiamata a gtag() sparsa nel
     resto del file (game/analytics.js e' l'unico punto che tocca window.gtag).
     Se lo script di Analytics non e' caricato — test headless, sviluppo senza
     rete, adblock — global.FLAnalytics semplicemente non esiste e ga()/gaOnce()
     non fanno niente: il gioco non se ne accorge.

     La deduplica "una volta per partita" (game_start, quiz_started, ecc.) vive
     dentro VN.state._ga, quindi segue lo stesso salvataggio di tutto il resto:
     sopravvive a un refresh o a una riapertura nei giorni fra la registrazione
     e il keynote, e si azzera da sola con una partita nuova perche' azzeraVars()
     rimpiazza VN.state per intero. E' la persistenza gia' presente nel
     progetto, non un meccanismo a parte. */
  function ga(eventName, params) {
    if (global.FLAnalytics) global.FLAnalytics.track(eventName, params || {});
  }
  function gaOnce(chiave, eventName, params) {
    var g = VN.state._ga || (VN.state._ga = {});
    if (g[chiave]) return;
    g[chiave] = true;
    ga(eventName, params);
  }

  /* ---------------- testo: interpolazione ---------------- */
  // {nome} valore · {NOME} maiuscolo · {label:anni} etichetta scelta
  // {g:uno|una} variante per la variabile di genere (m|f), nell'ordine di
  // meta.genderOrder. Se il genere non e' ancora stato scelto si usa la prima
  // variante: capita solo nelle righe prima di [S0.03].
  function fmt(s) {
    if (!s) return '';
    var genderVar = (VN.story.meta && VN.story.meta.genderVar) || 'genere';
    var order = (VN.story.meta && VN.story.meta.genderOrder) || ['m', 'f'];
    s = s.replace(/\{g:([^}]*)\}/g, function (_, body) {
      var parts = body.split('|');
      var idx = order.indexOf(VN.state[genderVar]);
      if (idx < 0) idx = 0;
      return parts[Math.min(idx, parts.length - 1)] || '';
    });
    s = s.replace(/\{label:(\w+)\}/g, function (_, k) {
      var l = VN.state['__label_' + k];
      return l == null ? '' : l;
    });
    return s.replace(/\{(\w+)\}/g, function (m, k) {
      var v = VN.state[k.toLowerCase()];
      if (v == null) return m;
      return k === k.toUpperCase() && k !== k.toLowerCase() ? String(v).toUpperCase() : String(v);
    });
  }

  // Il testo di una battuta puo' dipendere da una variabile: si scrive "by" con
  // il nome della variabile e "text" come oggetto valore -> frase ("*" e' il
  // ripiego). Serve per far dire a Lucas cose diverse a seconda delle risposte.
  function testoDi(st) {
    // "pool": la battuta si pesca da un elenco di story.regia invece di essere
    // scritta nello step. Serve alle battute di Susan durante il keynote, che
    // lo script vuole variabili e non sempre le stesse.
    if (st.pool) return aCaso((VN.story.regia || {})[st.pool]) || '';
    if (typeof st.text === 'string') return st.text;
    if (!st.text) return '';
    var v = st.by ? VN.state[st.by] : null;
    var scelto = st.text[String(v)];
    return scelto != null ? scelto : (st.text['*'] || '');
  }

  /* ---------------- typewriter ---------------- */
  function hideUI() {
    el.choices.classList.remove('on');
    el.inputform.classList.remove('on');
    if (el.listform) el.listform.classList.remove('on');
    revealUI = null;
  }

  function chiudiHub() {
    if (!el.hub) return;
    el.hub.classList.remove('on');
    el.hubnav.classList.remove('on');
    el.hubspots.innerHTML = '';
  }

  // Le transizioni durano piu' di un tap: se si cambia scena mentre una e' in
  // corso, quello che resta a schermo va tolto o copre la scena nuova.
  function chiudiTransizioni() {
    if (codaId) { clearTimeout(codaId); codaId = null; }
    if (el.curtainTxt) el.curtainTxt.classList.remove('sfumato');
    if (el.prlx) { el.prlx.classList.remove('on'); el.prlx.innerHTML = ''; }
    if (el.tende) el.tende.classList.remove('on', 'apri');
    if (el.platea) el.platea.classList.remove('on');
    if (el.ospitewrap) el.ospitewrap.classList.remove('on');
    if (el.evpropwrap) el.evpropwrap.classList.remove('on');
  }

  // Il testo si scrive su requestAnimationFrame invece che con setInterval:
  // un timer a 36 ms su iOS finisce fuori sincrono col refresh e "singhiozza".
  function type(line, after) {
    stopTyping();
    el.arrow.style.opacity = 0;
    hideUI();
    curLine = line; typing = true; pending = null; typeTarget = el.txt;
    riservaAltezza(line);
    if (!VN.speed) { el.txt.textContent = line; typing = false; return after(); }
    var shown = 0, t0 = 0;
    el.txt.textContent = '';
    var tick = function (ts) {
      if (!typing) return;
      if (!t0) t0 = ts;
      var want = Math.min(line.length, Math.floor((ts - t0) / VN.speed));
      if (want !== shown) { shown = want; el.txt.textContent = line.slice(0, shown); }
      if (shown >= line.length) { typing = false; tId = null; return after(); }
      tId = global.requestAnimationFrame(tick);
    };
    tId = global.requestAnimationFrame(tick);
  }

  /* Il testo e' centrato nel box, che ha altezza fissa: senza questo, mentre
     si scrive, il blocco parte alto una riga e si sposta ogni volta che ne
     compare un'altra — cioe' lo stesso scatto che l'altezza fissa doveva
     togliere. Qui si scrive la frase intera un attimo, si misura quanto sara'
     alta, e si tiene quello spazio da subito: il testo appare dentro un blocco
     gia' della misura giusta e non si muove piu'. */
  function riservaAltezza(line) {
    if (!el.txt) return;
    el.txt.style.minHeight = '';
    var prima = el.txt.textContent;
    el.txt.textContent = line;
    var h = el.txt.offsetHeight;
    el.txt.textContent = prima;
    if (h) el.txt.style.minHeight = h + 'px';
  }

  // come type(), ma non chiude la UI aperta: serve a chi resta a schermo mentre
  // il testo cambia (l'hub, che continua a mostrare zone e hotspot)
  function typeKeep(line) {
    stopTyping();
    el.arrow.style.opacity = 0;
    curLine = line; typing = true; pending = null; typeTarget = el.txt;
    if (!VN.speed) { el.txt.textContent = line; typing = false; return; }
    var shown = 0, t0 = 0;
    el.txt.textContent = '';
    var tick = function (ts) {
      if (!typing) return;
      if (!t0) t0 = ts;
      var want = Math.min(line.length, Math.floor((ts - t0) / VN.speed));
      if (want !== shown) { shown = want; el.txt.textContent = line.slice(0, shown); }
      if (shown >= line.length) { typing = false; tId = null; return; }
      tId = global.requestAnimationFrame(tick);
    };
    tId = global.requestAnimationFrame(tick);
  }

  function stopTyping() {
    if (tId && global.cancelAnimationFrame) global.cancelAnimationFrame(tId);
    tId = null;
  }

  /* Alcune schermate si guardano e basta: il cartello d'apertura si scrive fino
     in fondo, e il tocco durante la scrittura non fa niente (ma nemmeno passa
     oltre: mangerebbe il tap che serve dopo). */
  var senzaSalto = false;

  function skip() {
    if (!typing) return false;
    if (senzaSalto) return true;
    stopTyping();
    (typeTarget || el.txt).textContent = curLine;
    typing = false;
    if (revealUI) { var r = revealUI; revealUI = null; r(); }
    else if (pending) el.arrow.style.opacity = 1;
    return true;
  }

  /* ---------------- sigla dello studio ----------------
     Nero, il logo si accende a scatti come un neon, resta acceso pulsando,
     poi sfuma. Va da solo, nessun tap. Se il PNG del logo non c'e' ancora,
     l'insegna viene disegnata in CSS con lo stesso aspetto. */
  function sigla(st, done) {
    var nero = st.nero != null ? st.nero : 0;          // buio prima di accendere
    var accensione = st.accensione != null ? st.accensione : 1000;
    var fisso = st.fisso != null ? st.fisso : 2000;
    var uscita = st.uscita != null ? st.uscita : 900;

    el.curtain.classList.remove('lights');
    el.curtain.classList.add('on');
    el.curtainTxt.innerHTML = '';
    el.curtainArrow.style.opacity = 0;

    var src = st.img ? withBase(st.img) : '';
    el.logoImg.classList.remove('ok');
    if (src) {
      el.logoImg.onload = function () { el.logoImg.classList.add('ok'); };
      el.logoImg.onerror = function () { el.logoImg.classList.remove('ok'); };
      el.logoImg.src = src;
    }

    el.logo.className = 'on';
    if (!VN.speed) { el.logo.className = ''; return done(); }

    /* Si guarda e basta: niente freccia e niente tocco che salta. E' corta
       apposta — se si allunga, torna la voglia di saltarla. */
    var timers = [];
    var finita = false;
    var chiudi = function () {
      if (finita) return;
      finita = true;
      timers.forEach(clearTimeout);
      el.logo.className = '';
      el.curtainArrow.style.opacity = 0;
      done();
    };

    timers.push(setTimeout(accendi, nero));

    function accendi() {
    if (finita) return;
    void el.logo.offsetWidth;
    el.logo.classList.add('accendi');
    timers.push(setTimeout(function () {
      if (finita) return;
      el.logo.classList.remove('accendi');
      el.logo.classList.add('acceso');
      timers.push(setTimeout(function () {
        if (finita) return;
        el.logo.classList.remove('acceso');
        el.logo.classList.add('spegni');
        timers.push(setTimeout(chiudi, uscita));
      }, fisso));
    }, accensione));
    }
  }

  /* ---------------- schermata di avvio ----------------
     Barra a blocchi che finge di caricare, poi solo il cursore che lampeggia
     sul nero, poi il cartello. Nessun tap richiesto: va da sola. */
  function boot(st, done) {
    var blocchi = st.blocchi || 9;
    var caricamento = st.ms != null ? st.ms : 2200;
    var attesa = st.cursore != null ? st.cursore : 1600;

    el.curtain.classList.remove('lights');
    el.curtain.classList.add('on');
    el.curtainTxt.innerHTML = '';
    el.curtainArrow.style.opacity = 0;
    el.bootbar.innerHTML = '';
    el.boot.classList.add('on');

    var celle = [];
    for (var i = 0; i < blocchi; i++) {
      var b = global.document.createElement('div');
      b.className = 'bblock';
      el.bootbar.appendChild(b);
      celle.push(b);
    }

    if (!VN.speed) { el.boot.classList.remove('on'); return done(); }

    // come la sigla: si guarda e basta, nessun tocco da aspettare
    var timers = [];
    var finito = false;
    var chiudi = function () {
      if (finito) return;
      finito = true;
      clearInterval(avanza);
      timers.forEach(clearTimeout);
      el.boot.classList.remove('on');
      el.curtainTxt.innerHTML = '';
      el.curtainArrow.style.opacity = 0;
      done();
    };

    // il blocco in corso e' grigio, quelli fatti sono pieni: come una barra vera
    var passo = caricamento / blocchi, n = 0;
    var avanza = setInterval(function () {
      if (n > 0) celle[n - 1].className = 'bblock full';
      if (n < blocchi) celle[n].className = 'bblock cur';
      if (++n > blocchi) clearInterval(avanza);
    }, passo);

    timers.push(setTimeout(function () {
      if (finito) return;
      clearInterval(avanza);
      el.boot.classList.remove('on');
      // fase 2: schermo nero e basta, con il cursore che aspetta
      var cur = global.document.createElement('div');
      cur.className = 'tline';
      cur.innerHTML = '<span class="tcur"></span>';
      el.curtainTxt.appendChild(cur);
      timers.push(setTimeout(chiudi, attesa));
    }, caricamento + 260));
  }

  /* ---------------- cartello d'apertura ----------------
     Schermo nero, righe a macchina da scrivere una dopo l'altra; al tap la scena
     si accende (il nero sfuma via e sotto c'e' gia' il fondale). */
  function righeTitolo(lines) {
    return (lines || []).map(function (l) {
      return typeof l === 'string' ? { text: fmt(l) }
        : { text: fmt(l.text), small: l.small, big: l.big, pausa: l.pausa };
    });
  }

  /* ---------------- titoli di coda ----------------
     Stessa schermata del cartello d'apertura ("-1 / ORA: CUPERTINO"): nero,
     testo centrato, scritto a macchina. La differenza e' che qui i blocchi non
     si sommano — ognuno compare, resta, sfuma, e lascia il posto al prossimo.
     Va avanti da solo: e' una sequenza da guardare, non da tappare. Un tocco
     solo la salta tutta. */
  var codaId = null;
  function titoliDiCoda(st, done) {
    var blocchi = st.blocchi || [];
    var sfuma = st.dissolvenza != null ? st.dissolvenza : 600;
    var i = 0, chiuso = false, veloce = false;

    // Quanto resta a schermo un blocco, e quanto dura la dissolvenza, una volta
    // che il giocatore ha toccato: abbastanza per leggere, non abbastanza per
    // annoiarsi.
    var TIENI_VELOCE = st.tieniVeloce != null ? st.tieniVeloce : 900;
    var SFUMA_VELOCE = 200;
    var attesaVeloce = false;   // il blocco a schermo sta gia' finendo il suo giro

    function stop() { if (codaId) { clearTimeout(codaId); codaId = null; } }

    /* Il tocco NON salta i titoli: li accelera. Da qui in avanti ogni blocco
       compare gia' scritto e resta meno, ma compare — si legge tutto fino alla
       fine. E' la differenza fra "accelera" e "vai via", e la prima versione
       faceva la seconda: un tocco per sbaglio e i titoli sparivano. */
    function avanti() {
      if (chiuso || attesaVeloce) return;
      veloce = true;
      attesaVeloce = true;
      stop();
      // Il blocco a schermo NON sparisce sotto il dito: resta il tempo di
      // leggerlo, solo piu' corto. Prima il tocco lo faceva sfumare subito, e
      // le scritte sparivano proprio mentre si cercava di andare piu' veloce.
      codaId = setTimeout(function () {
        if (chiuso) return;
        pending = null;
        if (i >= blocchi.length) return attendiUltimo();
        el.curtainTxt.classList.add('sfumato');
        codaId = setTimeout(prossimo, SFUMA_VELOCE);
      }, TIENI_VELOCE);
    }

    // Dopo l'ultimo blocco la sequenza si ferma e aspetta: il countdown arriva
    // con un tocco, non da solo. Cosi' l'ultima riga si puo' guardare quanto si
    // vuole.
    function attendiUltimo() {
      revealUI = null;
      pending = chiudi;
      el.curtainArrow.style.opacity = 1;
    }

    function chiudi() {
      if (chiuso) return;
      chiuso = true;
      stop();
      stopTyping();
      typing = false;
      el.curtainTxt.classList.remove('sfumato');
      el.curtainTxt.innerHTML = '';
      revealUI = null;
      pending = null;
      el.curtainArrow.style.opacity = 0;
      done();
    }

    function prossimo() {
      if (chiuso) return;
      if (i >= blocchi.length) return attendiUltimo();
      var b = blocchi[i++];
      attesaVeloce = false;
      el.curtainTxt.classList.remove('sfumato');
      el.curtainTxt.innerHTML = '';

      // finito di scrivere: si tiene a schermo, poi si sfuma e si passa oltre
      var dopo = function () {
        if (chiuso) return;
        revealUI = null;
        el.curtainArrow.style.opacity = 0;
        pending = avanti;                 // un tocco qui va al blocco dopo
        codaId = setTimeout(function () {
          if (chiuso) return;
          pending = null;
          // l'ultimo blocco non sfuma: resta a schermo con la freccia, cosi'
          // si guarda quanto si vuole invece di sparire nel nero
          if (i >= blocchi.length) return attendiUltimo();
          el.curtainTxt.classList.add('sfumato');
          codaId = setTimeout(prossimo, veloce ? SFUMA_VELOCE : sfuma);
        }, veloce ? TIENI_VELOCE : (b.tieni != null ? b.tieni : 1200));
      };

      // "macchina": un colpo di sfx_typing3 a ogni blocco che comincia, non uno
      // solo a inizio sequenza — sono i titoli di coda, durano tutta la scena.
      if (st.macchina) suona('titoli_typing');
      typeLines(righeTitolo(b.righe), dopo, true);

      /* typeLines lascia in revealUI la sua "scrivi tutto adesso": la si tiene,
         perche' e' esattamente quello che deve fare un tocco mentre scrive.
         Ci si aggiunge solo il passaggio in modalita' veloce. */
      var completa = revealUI;
      revealUI = function () { veloce = true; if (completa) completa(); };
      if (veloce && !chiuso) { var r = revealUI; revealUI = null; r(); }
    }

    if (!VN.speed) return chiudi();         // test/skip: niente sequenza a tempo
    prossimo();
  }

  /* "subito": a fine sequenza chiama done() invece di aspettare un tocco. Il
     cartello d'apertura aspetta il giocatore; i titoli di coda vanno da soli. */
  function typeLines(lines, done, subito, cfg) {
    el.curtainTxt.innerHTML = '';
    el.curtainArrow.style.opacity = 0;
    var i = 0, nodi = [];
    // "ritmo": moltiplicatore sulla velocita' di scrittura e sulle pause. 0.9 =
    // un decimo piu' svelto. "senzaSalto": il tocco non accelera niente.
    var ritmo = (cfg && cfg.ritmo) || 1;
    senzaSalto = !!(cfg && cfg.senzaSalto);

    // il cursore segue la riga che si sta scrivendo e continua a lampeggiare
    // anche nelle pause: sembra qualcuno che sta scrivendo davvero
    var cur = global.document.createElement('span');
    cur.className = 'tcur'; cur.id = 'tcur-intro';

    function completaTutto() {                 // tap durante la scrittura: le mostra tutte
      stopTyping();
      typing = false;
      for (var k = 0; k < lines.length; k++) {
        if (!nodi[k]) nodi[k] = riga(k);
        nodi[k].textContent = lines[k].text;
      }
      fine();
    }

    function riga(k) {
      var d = global.document.createElement('div');
      d.className = 'tline' + (lines[k].small ? ' small' : '') + (lines[k].big ? ' big' : '');
      var t = global.document.createElement('span');
      d.appendChild(t);
      el.curtainTxt.appendChild(d);
      d.appendChild(cur);              // il cursore si sposta sulla riga nuova
      return t;
    }

    function fine() {
      revealUI = null;
      senzaSalto = false;              // finito di scrivere, il tocco torna a valere
      if (subito) { pending = null; el.curtainArrow.style.opacity = 0; return done(); }
      pending = done;
      el.curtainArrow.style.opacity = 1;
    }

    function prossima() {
      if (i >= lines.length) return fine();
      var k = i++;
      var node = nodi[k] = riga(k);
      var line = lines[k].text;
      curLine = line; typeTarget = node; typing = true;
      if (!VN.speed) { node.textContent = line; typing = false; return prossima(); }
      var shown = 0, t0 = 0;
      var tick = function (ts) {
        if (!typing) return;
        if (!t0) t0 = ts;
        var want = Math.min(line.length, Math.floor((ts - t0) / (VN.speed * ritmo)));
        if (want !== shown) { shown = want; node.textContent = line.slice(0, shown); }
        if (shown >= line.length) {
          typing = false; tId = null;
          return setTimeout(prossima, (lines[k].pausa != null ? lines[k].pausa : 420) * ritmo);
        }
        tId = global.requestAnimationFrame(tick);
      };
      tId = global.requestAnimationFrame(tick);
    }

    // il tocco durante la scrittura la completa, dove e' permesso
    revealUI = senzaSalto ? null : completaTutto;
    prossima();
  }

  /* ---------------- salvataggio (localStorage) ----------------
     Checkpoint a ogni step bloccante, a partire dalla prima risposta del
     giocatore. Il ripristino rigioca in silenzio i soli step visivi. */
  var SAVE_KEY = 'fl_nexus_save_v1';

  function store() {
    try { return global.localStorage; } catch (e) { return null; }   // Safari privato
  }

  VN.saveNow = function () {
    var s = store();
    if (!s || !VN.sceneId || !VN.progressed) return;
    try {
      s.setItem(SAVE_KEY, JSON.stringify({
        v: (VN.story.meta && VN.story.meta.version) || '0',
        scene: VN.sceneId, i: VN.i, state: VN.state, ts: Date.now()
      }));
    } catch (e) { /* quota piena: il gioco continua comunque */ }
  };

  VN.readSave = function () {
    var s = store();
    if (!s) return null;
    try {
      var d = JSON.parse(s.getItem(SAVE_KEY) || 'null');
      return (d && d.scene) ? d : null;
    } catch (e) { return null; }
  };

  VN.hasSave = function (story) {
    var d = VN.readSave();
    if (!d) return false;
    var st = story || VN.story;
    // salvataggio di una versione precedente dello script: si scarta, altrimenti
    // il ripristino punta a scene o step che non esistono piu'
    if (st && st.meta && d.v !== (st.meta.version || '0')) { VN.clearSave(); return false; }
    if (st && !st.scenes[d.scene]) return false;                // scena rimossa dallo script
    if (st && d.scene === st.meta.start && !d.i) return false;
    return true;
  };

  VN.clearSave = function () {
    var s = store();
    if (s) { try { s.removeItem(SAVE_KEY); } catch (e) {} }
  };

  var VISUAL = { show: 1, hide: 1, react: 1, prop: 1, bg: 1, set: 1, sipario: 1, io: 1 };

  function restore(save) {
    VN.state = save.state || VN.state;
    VN.progressed = true;
    var sc = VN.story.scenes[save.scene];
    VN.scene = sc; VN.sceneId = save.scene;
    if (sc.bg) setBg(sc.bg, sc.bgFx);
    precaricaScena(sc);
    // mentre si gioca questa, si scaricano le scene in cui si puo' finire dopo
    precaricaProssime(sc);
    atmosfera(sc);
    if (sc.terminal) { buildTerminal(sc.terminal); sc.terminal.forEach(function (r) { termSet(r.var); }); }
    var upto = Math.min(save.i || 0, (sc.steps || []).length);
    for (var k = 0; k < upto; k++) {
      if (VISUAL[sc.steps[k].t]) { silent = true; VN.i = k; exec(sc.steps[k]); silent = false; }
    }
    VN.i = upto;
    run();
  }

  /* ---------------- step runner ---------------- */
  var silent = false;   // true durante il ripristino

  /* Ogni scena ha il suo numero di giro. Serve perche' gli step che finiscono
     PIU' TARDI (un'attesa, una dissolvenza, una transizione) tengono in mano un
     "poi fai questo": se nel frattempo la scena e' cambiata, quel seguito
     apparteneva alla scena di prima e non deve far avanzare quella nuova —
     altrimenti la scena nuova parte da sola, saltando i suoi primi passi.
     E' l'altra faccia degli intrusi: non un'immagine di prima, ma un tempo di
     prima che continua a comandare. */
  var gen = 0;
  function perScena(fn) {
    var mio = gen;
    return function () { if (mio !== gen) return; return fn.apply(this, arguments); };
  }

  function next() { if (silent) return; VN.i++; run(); }

  /* Una scena che COMINCIA su un cartello nero (sigla, barra di caricamento,
     titolo) si tiene addosso il sipario nero. Una che ce l'ha in mezzo o in
     fondo no: i titoli di coda stanno alla fine del finale, e cercando un
     "title" in qualunque punto della scena il nero restava su per tutta la
     sequenza della porta — che quindi non si vedeva. Gli step che non mostrano
     niente (hide, wait, set, nero, luce) si saltano: possono stare prima senza
     voler dire che la scena parte illuminata. */
  var INVISIBILI = { hide: 1, wait: 1, set: 1, nero: 1, luce: 1 };

  /* Le "location" di Analytics non sono le scene dello script (sono di piu' e
     hanno nomi narrativi diversi): e' una lettura a parte, pensata per chi
     guarda i dati, non per chi scrive lo story. La Hall of Fame non e' una
     scena ma una zona dell'hub della lobby: la sua location_opened parte da
     entra(), non da qui. */
  var LOCATION_SCENA = {
    lobby: 'lobby', camerino: 'camerino', keynote: 'palco',
    argomenti: 'platea', teleprompter: 'teleprompter', quiz: 'quiz_area'
  };
  function trackLocationScena(id) {
    var loc = LOCATION_SCENA[id];
    if (!loc) return;
    gaOnce('loc:' + loc, 'location_opened', { location_name: loc });
    // La lobby e' il primo posto in cui il giocatore ha davvero in mano il
    // gioco (arrivo/registrazione/badge sono onboarding): e' li' che comincia
    // per davvero l'esperienza, non al semplice caricamento della pagina.
    if (id === 'lobby') gaOnce('game_start', 'game_start', { entry_point: 'lobby' });
    if (id === 'teleprompter') gaOnce('teleprompter_started', 'teleprompter_started', {});
    if (id === 'quiz') gaOnce('quiz_started', 'quiz_started', {});
  }

  function apreSulNero(sc) {
    var steps = sc.steps || [];
    for (var i = 0; i < steps.length; i++) {
      if (INVISIBILI[steps[i].t]) continue;
      return steps[i].t === 'title' || steps[i].t === 'boot' || steps[i].t === 'logo';
    }
    return false;
  }

  function goScene(id) {
    var sc = VN.story.scenes[id];
    if (!sc) throw new Error('scena inesistente: ' + id);
    chiudiHub();
    chiudiCarosello();
    chiudiGriglia();
    chiudiRecap();
    chiudiCountdown();
    chiudiQuiz();
    chiudiRegole();
    chiudiQuadro();
    chiudiCorsa();
    chiudiEmail();
    chiudiTransizioni();
    /* La figura del giocatore non attraversa i cambi di scena: ogni scena che
       la vuole la dichiara con uno step "io" come prima cosa (le uniche sono
       quinte, keynote, argomenti, argomento, teleprompter e finale). Senza
       questa riga bastava una scena che si dimenticava di nasconderla per
       ritrovarsela addosso altrove — in lobby, davanti a Francesca, dopo le
       previsioni. */
    spegniIo();
    if (el.modal) el.modal.classList.remove('on');
    if (!apreSulNero(sc)) el.curtain.classList.remove('on', 'lights');
    // Il box del dialogo restava acceso con l'ultima battuta della scena
    // precedente finche' non ne arrivava una nuova: si vedeva la vecchia frase
    // sopra il fondale nuovo.
    // Va spento di netto: con la sua transizione di mezzo secondo, la vecchia
    // battuta sfumava *sopra* il fondale nuovo.
    if (!silent) {
      el.boxwrap.style.transition = 'none';
      el.boxwrap.classList.remove('in', 'muto');
      void el.boxwrap.offsetWidth;
      el.boxwrap.style.transition = '';
      el.txt.textContent = '';
      el.arrow.style.opacity = 0;
    }
    gen++;              // da qui in poi i seguiti della scena di prima non contano piu'
    pending = null;
    senzaSalto = false;
    VN.scene = sc; VN.sceneId = id; VN.i = 0;
    trackLocationScena(id);
    /* Lo stacco di transizione solo sui cambi di POSTO dichiarati in
       story.audio.transizioni (la lobby, il palco, il camerino...), e solo se
       si arriva davvero da un'altra parte: rientrare nella stessa scena dopo un
       pannello non e' un viaggio. */
    var daAltrove = VN.sceneId && VN.sceneId !== id;
    if (daAltrove && (cfgAudio().transizioni || []).indexOf(id) >= 0) suona('transizione', 0.8);
    musicaScena(id);          // cambia solo se la scena nuova chiede un altro brano
    if (sc.bg) setBg(sc.bg, sc.bgFx, sc.dissolvenza);
    // gli asset della scena nuova si chiedono subito: se questa si apre al
    // buio, arrivano mentre non si vede niente
    precaricaScena(sc);
    atmosfera(sc);
    if (sc.terminal) buildTerminal(sc.terminal);
    else terminaleNelFondale(false);   // il terminale sul fondale non sopravvive alla scena
    avviaQuandoPronta(id);
  }

  /* La scena non comincia finche' il suo fondale non e' pronto: altrimenti i
     personaggi nuovi entrano sopra il fondale di quella di prima. Vale per
     tutte, non solo per quelle che si aprono con lo step "luce" — la maggior
     parte cambia scena senza un nero che copra.

     Se il fondale tarda oltre il tetto non si fa entrare comunque la scena
     sopra quello vecchio: si mette il nero (che e' il linguaggio del gioco per
     un cambio di scena) e lo si toglie appena il fondale c'e'. Cosi' l'attesa
     puo' allungarsi senza che si veda mai un fotogramma sbagliato.
     Con il precaricamento, in pratica, non si aspetta mai. */
  function avviaQuandoPronta(id) {
    var mio = gen;
    var partita = false;
    var parti = function () {
      if (partita || mio !== gen || VN.sceneId !== id) return;
      partita = true;
      run();
    };
    if (!VN.speed || !siDecodifica() || !el.bg || mostrata(el.bg, bgVoluto)) return parti();

    var coperto = false;
    var tetto = global.setTimeout(function () {
      if (partita || mio !== gen || VN.sceneId !== id) return;
      coperto = true;
      el.nero.classList.remove('sfuma');      // di netto: e' un ripiego, non un effetto
      el.nero.classList.add('on');
      parti();
    }, ATTESA_MAX);

    quandoPronti(function () {
      global.clearTimeout(tetto);
      if (mio !== gen || VN.sceneId !== id) return;
      parti();
      // il nero si toglie solo quando sotto c'e' davvero il fondale nuovo: se
      // tarda ancora, meglio restare al buio che scoprire quello vecchio
      if (!coperto) return;
      if (mostrata(el.bg, bgVoluto)) return el.nero.classList.remove('on');
      el.bg.addEventListener('load', function () {
        if (mio === gen) el.nero.classList.remove('on');
      }, { once: true });
    }, TETTO_FONDALE);
  }

  function run() {
    if (!VN.scene) return;
    var steps = VN.scene.steps || [];
    if (VN.i >= steps.length) {
      if (VN.scene.next) return goScene(VN.scene.next);
      return finish();
    }
    exec(steps[VN.i]);
  }

  function finish() {
    VN.scene = null;
    VN.clearSave();
    if (typeof VN.onEnd === 'function') VN.onEnd(VN.state);
  }

  function exec(st) {
    // Uno step con "se" viene saltato quando la condizione e' falsa. Serve alle
    // battute che si dicono una volta sola: Peter presenta il quiz al primo
    // ingresso, non tutte le sere che si torna a giocare un livello.
    if (st.se && !condizioneOk(st.se)) return next();

    if (!silent && (st.t === 'say' || st.t === 'choice' || st.t === 'input' ||
                    st.t === 'list' || st.t === 'badge' ||
                    st.t === 'carosello' || st.t === 'hub' || st.t === 'griglia' ||
                    st.t === 'domande' || st.t === 'bivio' || st.t === 'intermezzo' ||
                    st.t === 'recap' || st.t === 'quizhub' || st.t === 'quizmult' ||
                    st.t === 'email')) VN.saveNow();

    switch (st.t) {

      case 'say':
        el.boxwrap.classList.add('in');
        setSpeaker(st.who, st.incuffia);
        // revealUI duplica il completamento di type(): se il tap arriva PRIMA che
        // il typewriter finisca da solo, skip() cancella il tick in corso e la sua
        // callback (quella su type()) non parte mai. Senza questa copia, "pending"
        // restava null per sempre e il gioco si bloccava sulla riga (bug: tap
        // durante la scrittura -> game freeze). choice/input/list gia' se ne
        // proteggevano cosi'; a "say" mancava.
        // "attesa": la riga si scrive e va avanti da sola dopo N ms, senza il
        // tap. Serve per i momenti in cui il gioco sta facendo qualcosa (il
        // badge in stampa) e la battuta e' un'indicazione, non una replica.
        var avanzaSay = st.attesa && VN.speed
          ? function () { el.arrow.style.opacity = 0; setTimeout(perScena(next), st.attesa); }
          : function () { pending = next; el.arrow.style.opacity = 1; };
        el.boxwrap.classList.toggle('sistema', !!st.sistema);
        type(fmt(testoDi(st)), avanzaSay);
        revealUI = avanzaSay;
        return;

      case 'choice':
        el.boxwrap.classList.remove('sistema');
        el.boxwrap.classList.add('in');
        setSpeaker(st.who, st.incuffia);
        type(fmt(st.text), function () { showChoices(st); });
        revealUI = function () { showChoices(st); };
        return;

      case 'input':
        el.boxwrap.classList.remove('sistema');
        el.boxwrap.classList.add('in');
        setSpeaker(st.who, st.incuffia);
        // Senza testo la battuta di prima resta a schermo e si apre solo il
        // campo. E' il caso di due campi chiesti con una domanda sola ("Nome e
        // cognome?"): far riscrivere a Lucas una riga per il secondo sarebbe
        // una domanda che nessuno ha fatto. A dire quale campo si sta
        // riempiendo ci pensa il suggerimento dentro al campo.
        if (!st.text) return showInput(st);
        type(fmt(st.text), function () { showInput(st); });
        revealUI = function () { showInput(st); };
        return;

      case 'list':
        el.boxwrap.classList.remove('sistema');
        el.boxwrap.classList.add('in');
        setSpeaker(st.who, st.incuffia);
        type(fmt(st.text), function () { showList(st); });
        revealUI = function () { showList(st); };
        return;

      case 'badge':
        el.boxwrap.classList.remove('sistema');
        // Il badge compare mentre Lucas dice "ecco il tuo badge": prima si
        // aspettava che finisse di scrivere e poi un altro tap. Adesso la
        // tessera entra subito, e il tap serve solo ad andare avanti.
        el.boxwrap.classList.add('in');
        if (st.who) setSpeaker(st.who, st.incuffia);
        mostraBadge(st);
        if (st.text) {
          var avanzaBadge = function () { pending = chiudiBadge; el.arrow.style.opacity = 1; };
          type(fmt(st.text), avanzaBadge);
          revealUI = avanzaBadge;
        } else {
          pending = chiudiBadge; el.arrow.style.opacity = 1;
        }
        return;

      // dissolvenza al nero e ritorno: coprono un cambio di scena
      case 'nero':
        return velaNero(true, st.ms, perScena(next));

      case 'luce':
        // la luce si alza su una scena gia' pronta: e' qui che si evita il
        // fotogramma con il personaggio (o il fondale) di prima
        return quandoPronti(perScena(function () { velaNero(false, st.ms, perScena(next)); }), TETTO_FONDALE);

      // la figura del giocatore: entra, cambia posa, esce
      case 'io':
        mostraIo(st);
        return next();

      case 'hub':
        return showHub(st);

      case 'carosello':
        return showCarosello(st);

      // S5: la griglia dei macroargomenti, il giro delle domande, il bivio
      // delle facoltative, gli intermezzi di regia
      case 'griglia':
        return showGriglia(st);

      case 'domande':
        return showDomande(st);

      case 'bivio':
        return showBivio(st);

      case 'intermezzo':
        return showIntermezzo(st);

      // S6: il riepilogo modificabile nella sala regia e il blocco della schedina
      case 'monitor':
        return showMonitor(st);

      // S8: il quiz di Peter — scelta del livello, un livello, i moltiplicatori
      case 'quizhub':
        return showQuizHub(st);

      case 'quizlivello':
        return showQuizLivello(st);

      case 'quizmult':
        return showMult(st);

      // S7: il countdown al keynote vero, ultima schermata del gioco
      case 'email':
        return showEmail(st);

      case 'countdown':
        return showCountdown(st);

      // Transizioni: al ripristino non si rigiocano (il giocatore le ha gia'
      // viste), ma il fondale che lasciano dietro va rimesso a posto.
      case 'carrellata':
        if (silent) return next();
        return carrellata(st, perScena(next));

      case 'sipario':
        if (silent) { if (st.dietro) setBg(st.dietro, st.fx); return next(); }
        return sipario(st, perScena(next));

      case 'logo':
        el.boxwrap.classList.remove('in');
        el.hint.style.opacity = 0;
        scopriCartello();
        suona('logo');            // "8 bit studios": la sigla dello studio
        sigla(st, perScena(next));
        return;

      case 'boot':
        el.boxwrap.classList.remove('in');
        el.hint.style.opacity = 0;
        scopriCartello();
        boot(st, perScena(next));
        return;

      case 'title':
        el.boxwrap.classList.remove('in');
        el.hint.style.opacity = 0;
        scopriCartello();
        el.curtain.classList.remove('lights');
        el.curtain.classList.add('on');
        // "blocchi": i titoli di coda. Le righe non si accumulano come nel
        // cartello d'apertura — ogni blocco compare, resta, sfuma, e arriva il
        // prossimo. Va da solo, un tocco salta tutto.
        if (st.blocchi) return titoliDiCoda(st, perScena(next));
        // "macchina": il cartello scrive a macchina, e si sente (sfx_typing3).
        // Non tutti i cartelli ce l'hanno: solo dove lo dichiara lo step. Il
        // file consegnato dura piu' della scrittura vera: parte con la prima
        // riga e si ferma di netto appena la scrittura finisce, non quando
        // finisce lui.
        if (st.macchina) suona('titoli_typing');
        var doneScrittura = perScena(next);
        // "ritmo" accorcia scrittura e pause; "senzaSalto" fa si' che il tocco
        // non lo completi a meta': si legge tutto, poi la freccia
        typeLines(righeTitolo(st.lines), function () {
          if (st.macchina) fermaSuono('titoli_typing');
          doneScrittura();
        }, false, { ritmo: st.ritmo, senzaSalto: st.senzaSalto !== false });
        return;

      case 'show':
        showChar(st);
        return next();

      case 'hide':
        if (!current.who) return next();       // non c'e' nessuno: niente da far uscire
        el.npc.classList.remove('in', 'pop');
        el.npc.classList.add('out');
        current.who = null;
        return next();

      // reazione dopo un input del giocatore. Tre livelli (vedi Notion):
      //   micro  -> nessun asset nuovo, solo animazione procedurale
      //   expr   -> cambia il file della testa
      //   pose   -> cambia corpo + testa (momenti chiave)
      case 'react':
        react(st);
        return next();

      case 'prop':
        // Variante "fondale": non c'e' nessun oggetto da far comparire, il Mac
        // e' gia' dentro il fondale della scena. Serve solo ad accendere (e poi
        // spegnere) il terminale sopra lo schermo che sta nell'immagine.
        if (st.fondale) {
          // Il Mac puo' mostrare una schermata sua invece del terminale: e'
          // cosi' che all'accensione c'e' il "hello." di MacPaint e il
          // terminale arriva solo dopo i primi dati.
          mostraSchermata(st.show ? st.schermata : null);
          terminaleNelFondale(!!st.show);
          el.propwrap.classList.remove(st.show ? 'out' : 'in');
          el.propwrap.classList.add(st.show ? 'in' : 'out');
          return next();
        }
        // l'id passa da fmt(): cosi' una scena puo' scrivere "slide_{categoria}"
        // e far scegliere l'oggetto alla variabile
        if (st.id) {
          var srcProp = assetUrl('props', fmt(st.id));
          if (el.propwrap.classList.contains('in')) scambia(el.prop, srcProp);
          else apparira(el.prop, srcProp, el.propwrap);
        }
        el.propwrap.style.width = st.size || '';        // la scena puo' ridimensionare il prop
        el.propwrap.style.top = st.top || '';
        el.propwrap.classList.remove(st.show ? 'out' : 'in');
        el.propwrap.classList.add(st.show ? 'in' : 'out');
        return next();

      case 'bg':
        var cambiato = setBg(st.id || (VN.scene && VN.scene.bg), st.fx, st.dissolvenza);
        // "suona": un effetto fisso legato a questo fondale (es. il pollice in
        // su del CEO), non alla scena intera come musicaScena() e non a un
        // tocco come gli altri suona() sparsi nel motore.
        if (st.suona) suona(st.suona);
        if (st.uccelli != null || st.foglie != null || st.pulviscolo != null) atmosfera(st);
        // Con la dissolvenza il fondale nuovo arriva 1,4s dopo. Senza questa
        // attesa lo "show" successivo cambiava posa e faccia subito, sopra il
        // fondale vecchio: si vedeva prima lo scatto del personaggio e poi il
        // fondale. Ora i due coincidono.
        if (cambiato && VN.speed) return setTimeout(perScena(next), BG_FADE);
        return next();

      case 'fx':
        if (st.name === 'flash') { el.flash.classList.remove('go'); void el.flash.offsetWidth; el.flash.classList.add('go'); }
        else if (st.name === 'blur') el.bg.classList.add('blur');
        else if (st.name === 'unblur') el.bg.classList.remove('blur');
        else if (st.name === 'lights') {          // si accendono le luci: il nero sfuma via
          // Il fondale porta lo zoom lento fin dal caricamento della scena,
          // dietro al nero (sigla, barra di avvio, cartello scritto a
          // macchina): senza riavviarlo qui, il giocatore lo vede gia' a
          // meta' corsa appena il nero sfuma, uno scatto in avanti invece di
          // partire dall'immagine intera. Si riparte da questo istante,
          // quello vero in cui il fondale diventa visibile.
          ['zoom', 'zoomlento'].forEach(function (c) {
            if (el.bg.classList.contains(c)) {
              el.bg.classList.remove(c);
              void el.bg.offsetWidth;
              el.bg.classList.add(c);
            }
          });
          el.curtainArrow.style.opacity = 0;
          el.curtain.classList.add('lights');
          el.hint.style.opacity = '';
          var spegni = function () { el.curtain.classList.remove('on', 'lights'); };
          if (!VN.speed) spegni(); else setTimeout(spegni, 3400);
        }
        return next();

      case 'wait':
        if (!VN.speed) return next();          // speed 0 = modalita' test/skip
        return setTimeout(perScena(next), st.ms || 400);

      case 'set':
        VN.state[st.var] = st.value;
        termSet(st.var);
        // "BADGE IN STAMPA" lampeggia mentre la stampante lavora. Non blocca:
        // il lampeggio deve andare *sotto* la riga d'attesa nel box, non prima.
        if (st.lampeggia && VN.speed) lampeggia(st.var, st.lampeggia);
        // "suona": un effetto legato a questo set, come "suona" sugli step bg
        // (es. il colpo della stampante quando parte "BADGE IN STAMPA").
        if (st.suona) suona(st.suona);
        return next();

      case 'goto':
        VN.i = 0;
        return goScene(st.scene);

      case 'end':
        return finish();

      default:
        return next();                          // step sconosciuto: non blocca il flusso
    }
  }

  // Copia dello step con la misura ridotta dell'hub, se il cast ne dichiara una.
  function perHub(st) {
    var c = cast(st.who || st.char);
    if (st.scala != null || !c || c.scalaHub == null) return st;
    var fuori = {};
    for (var k in st) if (Object.prototype.hasOwnProperty.call(st, k)) fuori[k] = st[k];
    fuori.scala = c.scalaHub;
    return fuori;
  }

  /* ---------------- personaggi: corpo + testa ----------------
     NPC_H e' l'altezza di riferimento del riquadro #npc, la stessa scritta nel
     CSS: va tenuta allineata a mano perche' serve a calcolare le scale. */
  var NPC_H = 56;

  function cast(who) { return (VN.story.cast && VN.story.cast[who]) || null; }

  function partUrl(who, kind, id) {
    var c = cast(who);
    if (!c || !id) return '';
    var m = c[kind] || {};
    return m[id] ? withBase(m[id]) : '';
  }

  function showChar(st) {
    var who = st.who || st.char;               // st.char: forma breve legacy
    var c = cast(who);
    // posa ed espressione passano da fmt(): cosi' una scena puo' scrivere
    // "commento_{stile}" e far scegliere lo sprite alla variabile, invece di
    // ripetere lo stesso step una volta per valore
    var body = fmt(st.body) || (c && c.defaultBody) || 'neutro';
    var head = fmt(st.head) || (c && c.defaultHead) || 'neutro';
    var bodySrc = partUrl(who, 'bodies', body) || assetUrl('chars', who);   // sprite unico legacy
    if (!bodySrc) {                            // asset non ancora disegnato: scena senza personaggio
      el.npc.classList.remove('in', 'pop');
      el.npc.classList.add('out');
      current.who = null;
      return;
    }
    var precedente = current.who;
    current.who = who; current.body = body; current.head = head;

    // file dichiarato ma non ancora consegnato: si nasconde il personaggio
    // invece di lasciare l'icona di immagine rotta in mezzo alla scena
    el.npcBody.onerror = function () { el.npc.classList.add('broken'); };
    el.npc.classList.remove('broken');
    // Due casi diversi. Se in scena c'e' gia' lo stesso personaggio, questo e'
    // un cambio di posa: la posa vecchia resta finche' non arriva la nuova
    // (sparire e ricomparire sarebbe peggio). Se invece entra adesso — altro
    // personaggio, o riquadro vuoto — quello che ha addosso l'<img> e' il
    // personaggio della scena precedente: si tiene invisibile finche' non e'
    // pronto.
    var giaInScena = precedente === who && el.npc.classList.contains('in')
      && !el.npc.classList.contains('attesa');
    // chi il motore INTENDE mostrare. Serve a tools/verifica-transizioni.mjs per
    // distinguere una continuita' voluta (lo stesso personaggio che resta in
    // scena) da un intruso (il personaggio di prima ancora disegnato).
    el.npc.setAttribute('data-chi', who);
    if (giaInScena) scambia(el.npcBody, bodySrc);
    else apparira(el.npcBody, bodySrc, el.npc);
    setHead(head);
    if (c && c.neck) {                         // ancoraggio del collo, in % del riquadro corpo
      el.npcHead.style.left = c.neck.x || '50%';
      el.npcHead.style.top = c.neck.y || '4%';
      el.npcHead.style.width = c.neck.w || '34%';
    }
    // Misura. Il riquadro #npc ha proporzione fissa (3/5) e l'immagine ci sta
    // dentro con object-fit:contain, quindi uno sprite largo (Francesca a
    // braccia aperte, 1536x1024) viene limitato dalla larghezza e finisce alto
    // meta' di uno stretto (Lucas, 1162x1353) a parita' di riquadro.
    //
    // "scala" corregge il ritaglio a occhio, un valore per personaggio. Non
    // basta quando le pose sono di tipo diverso: Francesca ha cinque mezzibusti
    // e due primi piani di sola testa, e con una scala sola o erano giganti i
    // primi o minuscoli i secondi. Per lei il cast dichiara "volti", la misura
    // del viso in ogni posa, e ci pensa inquadra() a renderli tutti uguali.
    var scala = st.scala != null ? st.scala : ((c && c.scala) || 1);
    // Se la posa e' fra quelle inquadrate sul viso, NON si passa dalla misura di
    // default: la si sostituisce direttamente con quella giusta, piu' sotto.
    // Rimettere il default in mezzo faceva vedere per un fotogramma la figura
    // piccola, a ogni cambio di battuta.
    if (!inquadrata(c, body, st)) {
      el.npc.style.height = st.height || (scala === 1 ? '' : (NPC_H * scala).toFixed(1) + '%');
      el.npc.style.bottom = st.bottom || '';
      el.npc.style.right = st.right || '';
    }
    inquadra(c, body, st);

    el.npc.style.opacity = '';
    el.npc.style.animation = '';
    el.npc.classList.remove('out', 'micro');
    if (st.pop) { el.npc.classList.remove('in'); void el.npc.offsetWidth; el.npc.classList.add('pop'); }
    else { el.npc.classList.remove('pop'); void el.npc.offsetWidth; el.npc.classList.add('in'); }
  }

  /* Il riquadro del personaggio resta nascosto (visibility, non opacity: cosi'
     l'animazione d'ingresso parte lo stesso) finche' lo sprite chiesto non e'
     pronto. Il tetto di tempo e' una rete di sicurezza: se il file non arriva,
     meglio mostrarlo comunque che lasciare la scena vuota. */
  /* Inquadratura sul volto.
     Il viso e' la cosa che l'occhio confronta fra un personaggio e l'altro:
     due pose "alte uguali" sembrano diverse se una e' un mezzobusto e l'altra
     un primo piano. Qui il riquadro viene calcolato al contrario — dalla
     misura che il viso deve avere a schermo — cosi' ogni posa mostra la faccia
     grande come quella di Lucas e nello stesso punto.

     VOLTO_H e VOLTO_X sono presi da Lucas nella posa "idle": il metro di
     paragone e' lui, come chiede lo script. */
  // Misurati su Lucas nelle due pose con cui parla, "neutro" e "felice": danno
  // gli stessi tre numeri a meno di mezzo punto percentuale, quindi sono un
  // riferimento solido. (La prima versione aveva VOLTO_X calcolato a mano
  // invece che misurato, ed era sbagliato: 0.664 invece di 0.734 — per questo
  // Francesca risultava spostata a sinistra rispetto a Lucas.)
  var VOLTO_H = 0.1246;     // altezza del viso, in frazione dell'altezza della scena
  var VOLTO_X = 0.734;      // centro del viso, in frazione della larghezza
  var VOLTO_Y = 0.620;      // centro del viso, in frazione dell'altezza
  var NPC_AR = 0.6;         // proporzione del riquadro #npc (3/5), come nel CSS

  // La posa e' fra quelle con il viso misurato?
  function inquadrata(c, posa, st) {
    return !!(c && c.volti && c.volti[posa] && !st.height && st.scala == null);
  }

  function inquadra(c, posa, st) {
    var v = c && c.volti && c.volti[posa];
    if (!v || st.height || st.scala != null) return;   // la scena comanda: non si tocca
    var img = el.npcBody;
    var applica = function () {
      el.npc.classList.add('fisso');       // niente transizione: il salto si vedrebbe
      // La proporzione arriva dal cast, non dall'immagine: aspettare che
      // l'immagine sia caricata per sapere quanto e' larga voleva dire lasciare
      // il riquadro alla misura di default per almeno un fotogramma — ed e'
      // quello il lampo in cui la figura si vedeva piccola. naturalWidth resta
      // come ripiego per una posa non ancora misurata.
      var a = v.ar || (img.naturalWidth && img.naturalHeight
        ? img.naturalWidth / img.naturalHeight : 0);
      if (!a) return;
      var sh = el.stage.clientHeight, sw = el.stage.clientWidth;
      if (!sh || !sw) return;
      var altezzaImg = (VOLTO_H * sh) / v.h;           // quanto deve venire alta l'immagine
      var boxW = a > NPC_AR ? altezzaImg * a : altezzaImg * NPC_AR;
      var boxH = a > NPC_AR ? boxW / NPC_AR : altezzaImg;
      // Il riquadro cambia misura da una posa all'altra (il disegno include piu'
      // o meno corpo): se restasse ancorato in basso, il viso salterebbe su e giu'
      // a ogni battuta e la figura sembrerebbe rimpicciolire. Ancorando il VISO su
      // tutti e due gli assi, quello che si muove e' il corpo attorno, che si nota
      // molto meno. Il resto della figura puo' uscire dall'inquadratura: esce anche
      // il fianco di Lucas.
      el.npc.style.height = boxH.toFixed(1) + 'px';
      el.npc.style.right = (sw - (VOLTO_X * sw + (1 - v.cx) * boxW)).toFixed(1) + 'px';
      if (v.cy != null) {
        el.npc.style.bottom = (sh - (VOLTO_Y * sh + (1 - v.cy) * altezzaImg)).toFixed(1) + 'px';
      }
    };
    // Con "ar" nel cast si puo' fare subito, nello stesso giro in cui cambia lo
    // sprite: il browser non disegna niente in mezzo, quindi non c'e' nessun
    // fotogramma con la misura sbagliata.
    if (v.ar) return applica();
    if (img.complete && img.naturalWidth) applica();
    else img.addEventListener('load', applica, { once: true });
  }

  function setHead(head) {
    var src = partUrl(current.who, 'heads', head);
    el.npcHead.onerror = function () { el.npcHead.style.visibility = 'hidden'; };
    el.npcHead.style.visibility = '';
    el.npcHead.style.display = src ? '' : 'none';   // personaggi a sprite unico: nessuna testa separata
    // La testa si scambia quando la nuova e' pronta: nasconderla nel frattempo
    // vorrebbe dire un personaggio senza testa per mezzo secondo.
    if (src) scambia(el.npcHead, src);
    current.head = head;
  }

  function react(st) {
    var level = st.level || 'micro';
    if (level === 'pose' && st.body) {
      var src = partUrl(current.who, 'bodies', st.body);
      var scatta = function () {
        el.npc.classList.remove('pop'); void el.npc.offsetWidth; el.npc.classList.add('pop');
      };
      if (st.head) setHead(st.head);
      // il sussulto parte quando la posa nuova c'e' davvero, non prima
      if (src) { current.body = st.body; scambia(el.npcBody, src, scatta); }
      else scatta();
      return;
    }
    if (level === 'expr' && st.head) { setHead(st.head); return; }
    // micro: nessun asset nuovo, solo un movimento minimo
    el.npc.classList.remove('micro'); void el.npc.offsetWidth; el.npc.classList.add('micro');
    // La classe va tolta appena finisce. Restando addosso, la sua animazione
    // sostituisce quella d'ingresso del personaggio successivo (stessa proprieta',
    // regola piu' in basso nel CSS) e siccome non e' "forwards" lo lascia
    // trasparente: Susan spariva dal corridoio subito dopo una reazione micro.
    setTimeout(function () { el.npc.classList.remove('micro'); }, 500);
  }

  /* ---------------- la figura del giocatore ----------------
     Dalla S4 in poi il giocatore e' in scena: si vede lo sprite dello stile
     scelto in S3. Sta a sinistra, in #avatar, cosi' puo' condividere
     l'inquadratura con un NPC (che sta a destra, in #npc).

     Le pose vengono da story.stili[stile].pose, la stessa tabella che alimenta
     il carosello di S3 e i perk di S8: lo step dice solo quale posa.

     Il carosello degli avatar componibili del prototipo non c'e' piu' — lo
     script master lo ha sostituito con il badge in S0 e con gli stili in S3 —
     e con lui e' sparito l'unico altro pezzo di codice che scriveva su #avatar.
     Due sistemi sullo stesso nodo si sarebbero pestati i piedi. */
  function posaStile(posa) {
    var s = (VN.story.stili || {})[VN.state[VN.story.meta.styleVar || 'stile']];
    if (!s) return '';
    return (s.pose && s.pose[posa]) || '';
  }

  /* "entra" e' un'animazione "forwards": finisce a opacita' piena e ce la
     lascia, quindi togliere solo "on" non spegneva niente — il giocatore
     restava a schermo davanti alla sagoma del CEO. Le due classi vanno via
     insieme. E' la stessa trappola gia' documentata per #npc. */
  function spegniIo() { el.avatar.classList.remove('on', 'entra'); }

  function mostraIo(st) {
    if (st.hide) { spegniIo(); return; }
    var src = posaStile(st.posa || 'idle_palco');
    if (!src) { spegniIo(); return; }   // stile non ancora scelto
    el.avatar.innerHTML = '';
    var img = global.document.createElement('img');
    img.className = 'alayer';
    img.id = 'ioImg';
    img.src = withBase(src);
    // file dichiarato ma non consegnato: meglio nessuna figura che l'icona rotta
    img.onerror = function () { spegniIo(); };
    el.avatar.appendChild(img);
    el.avatar.style.height = st.height || '';
    el.avatar.style.bottom = st.bottom || '';
    el.avatar.style.left = st.left || '';
    el.avatar.classList.remove('entra');
    void el.avatar.offsetWidth;
    el.avatar.classList.add('on', 'entra');
  }

  /* ---------------- carrellata: la camera attraversa un posto ----------------
     I tre file della discesa in sala non sono i livelli di un'unica immagine da
     sovrapporre — provato: si coprono a vicenda, il piu' vicino nasconde tutto.
     Sono tre INQUADRATURE successive dello stesso percorso: la sala dall'alto,
     il passaggio accanto a un pilastro, le poltrone davanti al palco.

     Quindi si giocano in fila: ognuna entra in dissolvenza sopra la precedente
     mentre continua a ingrandirsi. E' l'ingrandimento che non si ferma mai,
     attraverso il cambio di inquadratura, a dare la sensazione di una camera
     che scende senza stacchi.

     Il movimento e' una transition CSS e non un @keyframes: le scale arrivano
     dallo script, e una transition si imposta con due valori senza dover
     generare regole a runtime. */
  function carrellata(st, done) {
    var cfg = (VN.story.carrellate && VN.story.carrellate[st.id]) || st;
    var shots = cfg.shots || [];
    if (!shots.length || !VN.speed) return done();       // speed 0 = test: si salta

    var ms = st.ms || cfg.ms || 2800;
    var dissolvenza = cfg.dissolvenza || 700;
    // Le inquadrature partono a distanza regolare, ma l'ultima deve restare in
    // campo un po' prima della fine: dividendo per il numero esatto di
    // inquadrature finirebbe di dissolvere proprio mentre la carrellata si
    // chiude, e l'arrivo sarebbe un mezzo fotogramma sfumato.
    var passo = ms / (shots.length + 0.5);

    el.prlx.innerHTML = '';
    var nodi = shots.map(function (s, i) {
      var img = global.document.createElement('img');
      img.className = 'plyr';
      img.src = withBase(s.img);
      img.style.transformOrigin = s.origine || cfg.origine || '50% 45%';
      img.style.transform = 'scale(' + (s.da != null ? s.da : 1) + ')';
      img.style.opacity = i === 0 ? 1 : 0;              // la prima e' gia' in campo
      el.prlx.appendChild(img);
      return img;
    });

    // via il dialogo e il personaggio: la carrellata e' un'inquadratura sola,
    // e i file della sala hanno i bordi trasparenti — chi resta dietro si vede
    el.boxwrap.classList.remove('in');
    el.npc.classList.remove('in', 'pop');
    el.npc.classList.add('out');
    current.who = null;
    el.hint.style.opacity = 0;
    el.prlx.classList.add('on');

    var timers = [];
    nodi.forEach(function (img, i) {
      var s = shots[i];
      var parte = function () {
        img.style.transition = 'transform ' + Math.max(ms - i * passo, 200) + 'ms linear, '
          + 'opacity ' + dissolvenza + 'ms ease-in';
        img.style.transform = 'scale(' + (s.a != null ? s.a : 1.3) + ')';
        img.style.opacity = 1;
      };
      // il primo fotogramma dopo: cambiare i valori subito non farebbe partire
      // niente, il browser non ha ancora disegnato lo stato iniziale
      if (i === 0) global.requestAnimationFrame(function () { global.requestAnimationFrame(parte); });
      else timers.push(setTimeout(parte, i * passo));
    });

    timers.push(setTimeout(function () {
      timers.forEach(clearTimeout);
      el.prlx.classList.remove('on');
      el.prlx.innerHTML = '';
      el.hint.style.opacity = '';
      done();
    }, ms));
  }

  /* ---------------- sipario: il fondale si apre in due ----------------
     La tenda della lobby e il sipario del palco sono lo stesso effetto: si
     fotografa il fondale che c'e' adesso nelle due meta', si mette dietro quello
     nuovo, e le due meta' scorrono via ai lati. Il manifest chiede proprio
     questo — nessun secondo fondale "tenda aperta" e' mai stato disegnato. */
  function sipario(st, done) {
    // "davanti" dice esplicitamente cosa si apre. Senza, si usa il fondale che
    // c'e' adesso — comodo, ma vale solo se la scena e' stata raggiunta dal
    // punto giusto: saltandoci dentro per lo sviluppo (?scene=...) il fondale
    // di partenza e' gia' quello nuovo e non ci sarebbe niente da aprire.
    var vecchio = st.davanti ? assetUrl('bg', st.davanti) : el.bg.getAttribute('src');
    if (st.dietro) setBg(st.dietro, st.fx);
    if (!vecchio || !VN.speed) return done();

    el.tendaSx.style.backgroundImage = 'url("' + vecchio + '")';
    el.tendaDx.style.backgroundImage = 'url("' + vecchio + '")';
    el.tende.classList.remove('apri');
    el.tende.classList.add('on');
    el.boxwrap.classList.remove('in');
    void el.tende.offsetWidth;
    el.tende.classList.add('apri');

    setTimeout(function () {
      el.tende.classList.remove('on', 'apri');
      done();
    }, st.ms || 1600);
  }

  /* ---------------- condizioni ----------------
     Forma dichiarativa, niente eval: una zona o un'area toccabile compare solo
     se la condizione e' vera. Serve alla zona 4 della lobby, che lo script
     descrive due volte — chiusa finche' i pronostici non sono bloccati, aperta
     dopo — e in generale a tutto quello che dipende da run.locked. */
  function condizioneOk(cond) {
    if (cond == null) return true;
    if (Array.isArray(cond)) return cond.every(condizioneOk);
    var v = VN.state[cond.var];
    if ('is' in cond) return v === cond.is;
    if ('non' in cond) return v !== cond.non;
    if ('almeno' in cond) return Number(v) >= Number(cond.almeno);
    return true;
  }

  /* ---------------- modale di conferma ----------------
     Copre tutto: finche' e' aperta niente altro e' toccabile. La usano i passi
     senza ritorno (entrare in sala, confermare lo stile, chiudere i pronostici),
     dove un tocco per sbaglio costerebbe la partita. */
  function mostraModale(cfg, onSi, onNo) {
    el.modaltxt.textContent = fmt(cfg.text || 'Sicuro?');
    el.modalbtns.innerHTML = '';
    var bottone = function (testo, azione) {
      var b = global.document.createElement('button');
      b.className = 'ch';
      b.textContent = fmt(testo);
      b.onclick = function (ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        el.modal.classList.remove('on');
        if (azione) azione();
      };
      el.modalbtns.appendChild(b);
      return b;
    };
    bottone(cfg.si || 'Si\'', onSi);
    bottone(cfg.no || 'Non ancora', onNo);
    el.modal.classList.add('on');
  }

  /* ---------------- carosello di scelta ----------------
     La scelta dello stile di S3: si scorrono quattro figure, ognuna con la sua
     descrizione e il perk che porta al quiz, e si conferma in una modale perche'
     e' irreversibile — lo stile accompagna tutta la partita.

     Le opzioni non stanno nello step: vengono da un blocco di story.json
     (story.stili) che serve anche a S5 e S8. Cosi' le pose e i perk sono scritti
     in un posto solo, e la scena dice soltanto quale posa mostrare. */
  function opzioniCarosello(st) {
    var da = VN.story[st.da || 'stili'] || {};
    // le chiavi con l'underscore sono note di lavorazione, non opzioni: senza
    // questo filtro un "_nota" scritto accanto agli stili comparirebbe nel
    // carosello del camerino come un quinto stile scegliibile
    var ordine = st.ordine || Object.keys(da).filter(function (k) { return k[0] !== '_'; });
    return ordine.filter(function (k) { return da[k]; }).map(function (k) {
      var o = da[k];
      return {
        id: k,
        nome: o.nome || k,
        desc: o.desc || '',
        battuta: o.battuta || '',
        perk: (o.perk && o.perk.testo) || '',
        img: (o.pose && o.pose[st.posa]) || o.img || ''
      };
    });
  }

  function showCarosello(st) {
    suona('apri');
    var opts = opzioniCarosello(st);
    if (!opts.length) return next();

    var cur = -1;
    var visti = {};
    var uscito = false;

    function mostra(i, dir) {
      cur = (i + opts.length) % opts.length;
      var o = opts[cur];
      visti[o.id] = true;
      scambia(el.carImg, withBase(o.img));
      if (dir) {
        el.carImg.classList.remove('entraSx', 'entraDx');
        void el.carImg.offsetWidth;
        el.carImg.classList.add(dir > 0 ? 'entraSx' : 'entraDx');
      }
      el.carnome.textContent = fmt(o.nome);
      el.cardesc.textContent = fmt(o.desc);
      // la battuta: e' lo stile che si presenta con la sua voce. Non e' una
      // meccanica, e' il motivo per cui uno lo sceglie.
      el.carbattuta.textContent = o.battuta ? fmt(o.battuta) : '';
      el.carbattuta.style.display = o.battuta ? 'block' : 'none';
      // Il perk e' una meccanica del quiz: in S3 non c'entra e confondeva la
      // scheda. Compare solo se lo step chiede esplicitamente un'etichetta.
      var vuoiPerk = !!(st.etichettaPerk && o.perk);
      el.carperk.textContent = vuoiPerk ? st.etichettaPerk + ' ' + fmt(o.perk) : '';
      el.carperk.style.display = vuoiPerk ? 'block' : 'none';
      el.cdots.innerHTML = '';
      opts.forEach(function (oo, k) {
        var d = global.document.createElement('span');
        d.className = 'cdot' + (k === cur ? ' sel' : '') + (visti[oo.id] ? ' seen' : '');
        el.cdots.appendChild(d);
      });
    }

    function conferma() {
      if (uscito) return;
      uscito = true;
      var o = opts[cur];
      suona('traguardo');    // sfx-achievement: lo stile scelto e' definitivo
      VN.progressed = true;
      VN.state[st.var] = o.id;
      VN.state['__label_' + st.var] = o.nome;
      termSet(st.var);
      chiudiCarosello();
      next();
    }

    el.cprev.onclick = function (ev) { if (ev && ev.stopPropagation) ev.stopPropagation(); mostra(cur - 1, -1); };
    el.cnext.onclick = function (ev) { if (ev && ev.stopPropagation) ev.stopPropagation(); mostra(cur + 1, 1); };
    el.carok.textContent = fmt(st.conferma_label || 'Scelgo questo');
    el.carok.onclick = function (ev) {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      if (uscito) return;
      if (st.conferma) return mostraModale(st.conferma, conferma, null);
      conferma();
    };

    var x0 = null;
    el.carosello.ontouchstart = el.carta.ontouchstart = function (e) {
      x0 = e.touches && e.touches[0] ? e.touches[0].clientX : null;
    };
    el.carosello.ontouchend = el.carta.ontouchend = function (e) {
      if (x0 == null) return;
      var t = e.changedTouches && e.changedTouches[0];
      var dx = t ? t.clientX - x0 : 0;
      x0 = null;
      if (Math.abs(dx) < 40) return;
      if (e.preventDefault) e.preventDefault();
      mostra(cur + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
    };

    hubTasti = function (k) {
      if (uscito) return false;
      if (el.regole && el.regole.classList.contains('on')) return false;
      if (k === 'ArrowLeft') { mostra(cur - 1, -1); return true; }
      if (k === 'ArrowRight') { mostra(cur + 1, 1); return true; }
      return false;
    };

    // il personaggio che parlava lascia il campo: qui il soggetto e' la figura
    el.npc.classList.remove('in', 'pop');
    el.npc.classList.add('out');
    current.who = null;
    el.boxwrap.classList.add('in', 'carta');
    // il camerino passa fuori fuoco: appendiabiti e lampadine dello specchio
    // rubavano l'occhio alla figura, che qui e' l'unica cosa da guardare
    el.bg.classList.add('sfoca');
    el.carosello.classList.add('on');
    el.carta.classList.add('on');
    pending = null;
    mostra(indiceIniziale(st, opts), 0);
  }

  function chiudiCarosello() {
    if (!el.carosello) return;
    el.carosello.classList.remove('on');
    el.carta.classList.remove('on');
    if (el.bg) el.bg.classList.remove('sfoca');   // il camerino torna a fuoco
    el.boxwrap.classList.remove('carta');
  }

  /* ================ S5: il keynote ================
     Tre macroargomenti in ordine libero; dentro ognuno le domande core in
     sequenza fissa, poi il bivio della regia che puo' pescare tre facoltative dal
     pool. Le domande, le battute per stile, gli eventi e gli intermezzi stanno
     in game/domande.json (VN.banca), non in story.json: sono contenuto che
     cambia per conto suo, e messi insieme pesano quanto tutto il resto. */

  function catCorrente() {
    var b = VN.banca && VN.banca.categorie;
    return (b && b[VN.state.categoria]) || null;
  }

  // Le risposte date, per categoria e tipo. Ci si appoggia il recap di S6 e
  // l'invio al server, e ci si legge quali macroargomenti sono finiti.
  function segna(categoria, tipo, id, valore, punti) {
    var p = VN.state.picks || (VN.state.picks = {});
    var c = p[categoria] || (p[categoria] = {});
    var t = c[tipo] || (c[tipo] = {});
    t[id] = { v: valore, p: punti || 0 };
    VN.state.punti = totale();
    // Solo il fatto che la categoria e' completa, mai la risposta data: niente
    // contenuto delle previsioni verso Analytics.
    if (tipo === 'core' && categoriaFinita(categoria)) {
      gaOnce('prediction_completed:' + categoria, 'prediction_completed', { category: categoria });
    }
  }

  // Il totale si ricalcola dalle risposte invece di essere accumulato: in S6 le
  // risposte si possono cambiare, e un contatore accumulato andrebbe fuori
  // sincrono alla prima correzione.
  function totale() {
    var somma = 0;
    var p = VN.state.picks || {};
    Object.keys(p).forEach(function (cat) {
      Object.keys(p[cat]).forEach(function (tipo) {
        Object.keys(p[cat][tipo]).forEach(function (id) {
          somma += p[cat][tipo][id].p || 0;
        });
      });
    });
    return somma;
  }

  // Un macroargomento e' finito quando ha tutte le sue core: si ricava dalle
  // risposte, senza una lista di "fatti" da tenere allineata a parte — cosi'
  // sopravvive da sola al salvataggio e alla ripresa.
  function categoriaFinita(k) {
    var c = (VN.banca && VN.banca.categorie && VN.banca.categorie[k]) || null;
    if (!c) return false;
    var date = ((VN.state.picks || {})[k] || {}).core || {};
    return Object.keys(date).length >= c.core.length;
  }

  function mescola(a) {
    var v = a.slice();
    for (var i = v.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = v[i]; v[i] = v[j]; v[j] = t;
    }
    return v;
  }

  function aCaso(a) { return a && a.length ? a[Math.floor(Math.random() * a.length)] : null; }

  /* ---------------- griglia dei macroargomenti [S5.HUB] ----------------
     Tre pannelli, nessun ordine imposto. Lo stato di ognuno si legge dalle
     risposte gia' date: attivo finche' mancano delle core, completato dopo.
     Quando sono completati tutti e tre lo step cede il turno e la scena
     prosegue verso il recap. */
  function showGriglia(st) {
    var argomenti = VN.story[st.da || 'argomenti'] || {};
    var chiavi = Object.keys(argomenti);
    // Questa griglia esiste in story.json una volta sola, per i macroargomenti
    // dei pronostici (var "categoria"): gli eventi di Analytics restano legati
    // a quell'uso, cosi' un domani un'altra griglia non li erediterebbe per
    // sbaglio.
    var ePronostici = (st.var || 'categoria') === 'categoria';
    if (!chiavi.length) return next();
    if (ePronostici && !VN.state.__aperturaPlatea) {
      VN.state.__aperturaPlatea = true;
      suona('applausi_apertura', 0.7);       // il pubblico saluta l'inizio dei pronostici
    }
    if (ePronostici) gaOnce('predictions_started', 'predictions_started', {});
    var finite = chiavi.filter(categoriaFinita).length;
    if (ePronostici && finite > (VN.state.__finiteViste || 0)) {
      VN.state.__finiteViste = finite;
      if (finite < chiavi.length) suona('traguardo');   // un macroargomento chiuso
    }
    if (chiavi.every(categoriaFinita)) {
      suona('applausi_lungo', 0.75);          // tutti e tre: e' la fine dello show
      chiudiGriglia();
      if (ePronostici) gaOnce('predictions_complete', 'predictions_complete', { completed_categories: chiavi.length });
      return next();
    }

    var uscito = false;
    el.griglia.innerHTML = '';
    chiavi.forEach(function (k) {
      var a = argomenti[k];
      var c = (VN.banca && VN.banca.categorie && VN.banca.categorie[k]) || {};
      var fatta = categoriaFinita(k);
      var b = global.document.createElement('button');
      b.className = 'gcell' + (fatta ? ' fatta' : '');
      b.dataset.arg = k;
      var quante = (c.core || []).length;
      var date = Object.keys(((VN.state.picks || {})[k] || {}).core || {}).length;
      b.innerHTML = '<span class="gnome"></span><span class="gstato"></span>';
      b.querySelector('.gnome').textContent = fmt(a.nome || k);
      b.querySelector('.gstato').textContent = fatta
        ? (st.etichettaFatta || 'fatto')
        : date + '/' + quante;
      b.onclick = function (ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        if (uscito || fatta) return;
        uscito = true;
        suona('scelta');
        VN.progressed = true;
        VN.state[st.var || 'categoria'] = k;
        // il pannello sullo schermo si accende adesso, alla scelta, non a
        // domande finite
        var viste = VN.state.categorie_visitate || (VN.state.categorie_visitate = {});
        var primaVolta = !viste[k];
        viste[k] = true;
        VN.state.pescate = null;                 // le facoltative si pescano al bivio
        VN.saveNow();
        if (primaVolta) aggiornaEmblemi(k);
        if (primaVolta && ePronostici) gaOnce('category_selected:' + k, 'category_selected', { category: k });
        chiudiGriglia();
        hideUI();
        goScene(st.goto);
      };
      el.griglia.appendChild(b);
    });

    el.boxwrap.classList.add('in');
    setSpeaker(st.who, st.incuffia);
    el.griglia.classList.add('on');
    pending = null;
    if (st.text) typeKeep(fmt(st.text));
  }

  /* ---------------- gli emblemi sullo schermo del palco ----------------
     I tre pannelli del fondale si accendono uno per volta, alla PRIMA scelta
     del macroargomento — non a categoria finita. Sono due informazioni diverse:
     i bottoni della griglia dicono a che punto sono le domande, lo schermo dice
     dove il giocatore e' gia' stato.

     La verita' sta in VN.state.categorie_visitate, che entra nel salvataggio:
     cosi' gli emblemi tornano anche riaprendo il gioco, e non dipendono da una
     classe CSS rimasta addosso. */
  var EMBLEMI = { iphone: 'emblemaIphone', watch: 'emblemaWatch', altro: 'emblemaAltro' };

  function aggiornaEmblemi(nuova) {
    if (!el.emblemi) return;
    var viste = VN.state.categorie_visitate || {};
    Object.keys(EMBLEMI).forEach(function (k) {
      var img = el[EMBLEMI[k]];
      if (!img) return;
      img.classList.remove('nuovo');
      if (!viste[k]) { img.classList.remove('attivo'); return; }
      // apparira(): il src si assegna subito ma l'emblema resta invisibile
      // finche' l'immagine non e' pronta, cosi' non si accende un pannello
      // vuoto (o, peggio, con l'emblema di un'altra categoria)
      apparira(img, assetUrl('props', 'emblema_categoria_' + k), img);
      img.classList.add('attivo');
      // lo scatto di accensione solo a quello appena scelto: gli altri erano
      // gia' accesi e devono restare fermi
      if (k === nuova) { void img.offsetWidth; img.classList.add('nuovo'); }
    });
  }

  /* Gli emblemi vivono su un fondale solo: lo schermo del palco. Su qualunque
     altro resterebbero appesi in aria — durante le domande, per esempio, dove
     il fondale e' la platea. Si aggancia al cambio di fondale, cosi' vale anche
     per un salvataggio ripreso e per il ritorno dalla categoria. */
  function emblemiPerFondale(id) {
    if (!el.emblemi) return;
    var acceso = id === 'palco_schermo_categorie';
    el.emblemi.classList.toggle('on', acceso);
    if (acceso) aggiornaEmblemi(null);
  }

  function chiudiGriglia() {
    if (el.griglia) { el.griglia.classList.remove('on'); el.griglia.innerHTML = ''; }
    if (el.boxwrap) el.boxwrap.classList.remove('quizhub');
  }

  function chiudiRecap() {
    if (!el.monitorwrap) return;
    el.monitorwrap.classList.remove('on');
    if (el.mondettaglio) el.mondettaglio.classList.remove('on');
    if (el.monschermi) el.monschermi.innerHTML = '';
    if (el.monlista) el.monlista.innerHTML = '';
  }

  /* ---------------- il giro di una domanda [S5.DOMANDA] ----------------
     La regia introduce, il giocatore sceglie, il personaggio annuncia alla platea
     con la battuta del suo stile, e ogni tanto succede qualcosa.

     Regola d'oro dello script: la reazione della platea e' SEMPRE casuale, mai
     legata a quale opzione e' stata scelta. Se lo fosse, il gioco suggerirebbe
     le risposte e i pronostici non varrebbero piu' niente. */
  /* Che faccia fa il giocatore mentre legge la domanda.
     Prima restava in "idle_palco" per tutte e ventuno le domande: uno sta sul
     palco di un keynote per mezz'ora senza mai cambiare espressione. Gli stili
     hanno gia' disegnate quattro pose apposta (neutro, sicuro, sorpreso,
     difficolta) e non le usava nessuno.

     La posa segue il tono della domanda, non la risposta giusta: e' la
     difficolta' dichiarata nella banca a dire se e' una da prendere alla
     leggera o una tosta. Questo NON viola la regola d'oro di S5 — quella dice
     che la reazione non deve correlare con la RISPOSTA del giocatore, perche'
     se lo facesse suggerirebbe il pronostico. Qui non c'e' nessuna risposta
     ancora: si commenta la domanda, che il giocatore ha gia' davanti agli
     occhi, e nessuna posa punta a un'opzione piuttosto che a un'altra.

     Dentro ogni fascia si pesca a caso fra due pose, come si fa gia' per
     l'annuncio: venti domande di fila con la stessa inquadratura si notano.

     Si usano le "palco_*", che sono figure intere come idle_palco e come le
     pose dell'annuncio: cosi' per tutto il giro delle domande l'inquadratura
     non cambia mai taglio. Le "espressioni_*" sono primi piani del viso e
     alternarle a una figura intera faceva saltare la camera a ogni battuta. */
  var POSE_DOMANDA = {
    facile:  ['palco_sicuro', 'palco_attesa'],    // diff 1-2: una che si sa gia'
    media:   ['palco_attesa', 'palco_presenta'],  // diff 3
    tosta:   ['palco_dubbio', 'palco_attesa'],    // diff 4-5: qui si suda
    extra:   ['palco_dubbio', 'palco_sicuro']     // le facoltative: a sorpresa
  };

  function posaPerDomanda(d, tipo) {
    var fascia;
    if (tipo === 'extra') fascia = 'extra';
    else {
      var diff = d && d.diff;
      if (diff == null) fascia = 'media';
      else if (diff <= 2) fascia = 'facile';
      else if (diff === 3) fascia = 'media';
      else fascia = 'tosta';
    }
    var pose = POSE_DOMANDA[fascia];
    var scelta = pose[Math.floor(Math.random() * pose.length)];
    // se lo stile non ha quella posa disegnata si resta com'era, invece di
    // far sparire la figura
    return posaStile(scelta) ? scelta : 'idle_palco';
  }

  function showDomande(st) {
    var cat = catCorrente();
    if (!cat) return next();
    var lista = st.set === 'extra'
      ? (VN.state.pescate || []).map(function (id) {
          return (cat.extra || []).filter(function (d) { return d.id === id; })[0];
        }).filter(Boolean)
      : (cat.core || []);
    if (!lista.length) return next();

    var i = 0;
    var tipo = st.set === 'extra' ? 'extra' : 'core';

    function intro() {
      if (i >= lista.length) { hideUI(); return next(); }
      var d = lista[i];
      el.boxwrap.classList.add('in');
      mostraIo({ posa: posaPerDomanda(d, tipo) });
      setSpeaker(st.who || 'susan', st.incuffia !== false);
      var apri = function () { opzioni(d); };
      type(fmt(aCaso(VN.story.regia && VN.story.regia.introDomanda) || 'Tocca a te.') + ' ' + fmt(d.q), apri);
      revealUI = apri;
    }

    function opzioni(d) {
      el.choices.innerHTML = '';
      (d.opzioni || []).forEach(function (o) {
        var b = global.document.createElement('button');
        b.className = 'ch';
        b.textContent = fmt(o.label);
        b.onclick = function (ev) {
          if (ev && ev.stopPropagation) ev.stopPropagation();
          hideUI();
          VN.progressed = true;
          // core: punti gia' calcolati nella banca. extra e intermezzi: val secco
          suona('tap');
          segna(VN.state.categoria, tipo, d.id, o.label, o.pt != null ? o.pt : (o.val || 0));
          VN.saveNow();
          annuncia(d, o);
        };
        el.choices.appendChild(b);
      });
      el.choices.classList.add('on');
    }

    function annuncia(d, o) {
      /* Il pronostico e' stato annunciato: la platea reagisce. Non e' il tocco
         sulla risposta a farla applaudire — e' l'annuncio, un attimo dopo,
         quando il personaggio ha finito di dirlo. Le varianti corte girano a
         caso: venti domande con lo stesso applauso sarebbero venti volte la
         stessa registrazione. */
      setTimeout(perScena(function () { suona('applausi', 0.55); }), 420);
      // la posa alterna a caso fra le due, cosi' venti domande di fila non
      // sembrano venti volte la stessa inquadratura
      mostraIo({ posa: Math.random() < 0.5 ? 'annuncio' : 'indica_schermo' });
      setSpeaker(null);
      el.name.classList.remove('hidden');
      el.nametxt.textContent = fmt('{NOME}');
      var poi = function () { pending = function () { dopoRisposta(); }; el.arrow.style.opacity = 1; };
      var battuta = (o.battute && o.battute[VN.state.stile]) || o.label;
      type(fmt(battuta), poi);
      revealUI = poi;
    }

    function dopoRisposta() {
      var reazione = aCaso(VN.story.reazioni || (VN.banca && VN.banca.reazioni_platea));
      platea(reazione);
      var ev = pescaEvento();
      i++;
      if (ev) return mostraEvento(ev, intro);
      intro();
    }

    intro();
  }

  /* ---------------- eventi: micro generali e personale dello stile ----------------
     Si pescano da un sacchetto senza rimessa: cosi' non si ripetono nella stessa
     partita e il loro numero e' limitato dal sacchetto, non dalla fortuna.
     L'evento personale dello stile sta nel sacchetto insieme agli altri. */
  function sacchettoEventi() {
    if (VN.state.eventi_sacchetto) return VN.state.eventi_sacchetto;
    var b = VN.banca || {};
    var v = mescola((b.micro_eventi || []).map(function (e) { return e.id; }));
    var mio = (b.eventi_personali || {})[VN.state.stile];
    if (mio) v.splice(Math.floor(Math.random() * (v.length + 1)), 0, mio.id);
    VN.state.eventi_sacchetto = v;
    return v;
  }

  function trovaEvento(id) {
    var b = VN.banca || {};
    var e = (b.micro_eventi || []).filter(function (x) { return x.id === id; })[0];
    if (e) return e;
    var mio = (b.eventi_personali || {})[VN.state.stile];
    return mio && mio.id === id ? mio : null;
  }

  function pescaEvento() {
    var v = sacchettoEventi();
    if (!v.length) return null;
    var p = VN.story.regia && VN.story.regia.probabilitaEvento;
    if (Math.random() >= (p == null ? 0.3 : p)) return null;
    return trovaEvento(v.shift());
  }

  /* I tre esiti di un micro-evento sono sempre +1, 0 e -1 — uno per opzione — ma
     l'abbinamento si rimescola a ogni attivazione. I valori "editoriale" scritti
     nella banca dicono soltanto che tono ha ciascuna risposta: NON sono il
     mapping del gioco. Cosi' chi rigioca non puo' imparare "la B e' quella
     buona", e deve scegliere la risposta che gli sembra giusta. */
  function esitiMicroEvento(e) {
    var valori = e.valori || [1, 0, -1];
    return mescola(valori.slice());
  }

  /* Come e' andata lo dice Susan, e lo dice a parole: niente numeri, niente
     "bonus", nessun segnale che riveli il punteggio. Le tre battute vengono da
     tre pool diversi di story.regia, uno per esito. */
  function conseguenzaMicroEvento(punti) {
    var r = VN.story.regia || {};
    var pool = punti > 0 ? r.improvvisazione : punti < 0 ? r.critica : r.caos;
    return aCaso(pool) || '';
  }

  function mostraEvento(e, done) {
    // l'evento personale dello stile ha una posa dedicata, i micro-eventi no
    if (e.asset && e.asset.indexOf('stili/') === 0) mostraIo({ posa: 'evento' });
    else mostraIo({ posa: 'imbarazzo' });
    // un oggetto (il clicker che si inceppa, la slide sbagliata) va nello slot
    // dei prop; un secondo personaggio (il rider) nello slot degli ospiti.
    // "prop" e' per l'evento personale che ha GIA' un asset stili/ per la posa
    // e in piu' un oggetto separato (l'ukulele accanto alla posa di ballo).
    if (e.asset && e.asset.indexOf('props/') === 0) mostraPropEvento(e.asset);
    if (e.prop) mostraPropEvento(e.prop);
    if (e.extra_asset) mostraOspite(e.extra_asset);
    platea(e.platea);

    el.boxwrap.classList.add('in');
    setSpeaker(null);
    el.name.classList.add('hidden');
    var opzioni = e.opzioni || [];
    // Dopo la narrazione parla Susan, dalla regia: la battuta scritta
    // sull'evento se ce l'ha, altrimenti una di quelle con cui ti scarica addosso
    // il problema. E' l'unico modo in cui la regia si fa sentire durante il
    // keynote, e succede solo sugli eventi — non a ogni domanda.
    var suo = e.regia || aCaso((VN.story.regia || {}).scarica);

    // le risposte compaiono sotto l'ultima riga, senza un tocco in mezzo
    var apri = opzioni.length
      ? function () { scelteEvento(e, opzioni, done); }
      : function () { pending = function () { chiudiEvento(); done(); }; el.arrow.style.opacity = 1; };

    // La narrazione va letta: senza questo tocco in mezzo la battuta della regia
    // ci scriveva sopra nello stesso istante e il giocatore non vedeva mai
    // cos'era successo.
    var poi = suo
      ? function () { pending = function () { battutaRegia(suo, apri); }; el.arrow.style.opacity = 1; }
      : apri;

    type(fmt(e.testo), poi);
    revealUI = poi;
  }

  function chiudiEvento() {
    nascondiOspite();
    el.evpropwrap.classList.remove('on');
  }

  function scelteEvento(e, opzioni, done) {
    var esiti = esitiMicroEvento(e);
    showChoices({
      options: opzioni.map(function (o, idx) {
        var punti = esiti[idx % esiti.length] || 0;
        return { label: o.label, value: idx, _do: function () {
          segna('micro_eventi', 'r', e.id, o.label, punti);
          VN.progressed = true;
          VN.saveNow();
          chiudiEvento();
          // la conseguenza la racconta Susan in cuffia: e' l'unico ritorno che
          // il giocatore riceve, e non dice mai quanto vale
          battutaRegia(o.esito || conseguenzaMicroEvento(punti), function () {
            pending = done; el.arrow.style.opacity = 1;
          });
        } };
      })
    });
  }

  /* Una battuta della regia: Susan, in cuffia, senza sprite in scena. "poi" viene
     chiamata quando la riga e' tutta a schermo — sta a chi chiama decidere se
     mostrare subito qualcosa sotto (le risposte di un evento) o aspettare un
     tocco. */
  function battutaRegia(testo, poi) {
    if (!testo) return poi();           // pool vuoto: niente box muto da toccare
    setSpeaker((VN.story.regia && VN.story.regia.chi) || 'susan', true);
    type(fmt(testo), poi);
    revealUI = poi;
  }

  // un secondo personaggio in scena solo per la durata di un evento (il rider)
  function mostraOspite(rel) {
    el.ospite.onerror = function () { el.ospitewrap.classList.remove('on'); };
    apparira(el.ospite, withBase(rel), el.ospitewrap);
    el.ospitewrap.classList.add('on');
  }
  function nascondiOspite() { if (el.ospitewrap) el.ospitewrap.classList.remove('on'); }

  // l'oggetto di un micro-evento. Slot suo: #propwrap durante il keynote tiene
  // la slide del macroargomento attivo, e sovrascriverla la farebbe sparire per
  // tutto il resto del blocco.
  function mostraPropEvento(rel) {
    el.evprop.onerror = function () { el.evpropwrap.classList.remove('on'); };
    apparira(el.evprop, withBase(rel), el.evpropwrap);
    el.evpropwrap.classList.remove('on'); void el.evpropwrap.offsetWidth;
    el.evpropwrap.classList.add('on');
  }

  // reazione della platea: un layer sopra il fondale. Finche' i file non sono
  // stati consegnati non si vede niente, e va bene cosi' — l'importante e' che
  // l'assegnazione resti casuale, perche' e' quella a non dover suggerire nulla.
  function platea(id) {
    if (!el.platea) return;
    var src = id ? assetUrl('platea', id) : '';
    if (!src) { el.platea.classList.remove('on'); return; }
    el.plateaImg.onerror = function () { el.platea.classList.remove('on'); };
    apparira(el.plateaImg, src, el.platea);
    el.platea.classList.remove('on'); void el.platea.offsetWidth;
    el.platea.classList.add('on');
  }

  /* ---------------- il bivio dopo le core [S5.BIVIO] ----------------
     Le tre facoltative si pescano QUI, non a inizio partita: chi rigioca non
     puo' mapparle in anticipo. */
  function showBivio(st) {
    var cat = catCorrente();
    if (!cat) return next();
    el.boxwrap.classList.add('in');
    setSpeaker(st.who || 'susan', st.incuffia !== false);
    // La regia commenta la scelta prima di andare avanti: e' una risposta, non
    // un giudizio sul pronostico, quindi qui la battuta puo' dipendere da cosa
    // hai scelto senza infrangere la regola d'oro.
    var commenta = function (testo) {
      hideUI();
      if (!testo) return next();
      var poi = function () { pending = next; el.arrow.style.opacity = 1; };
      type(fmt(testo), poi);
      revealUI = poi;
    };

    var apri = function () {
      showChoices({
        options: [
          { label: st.approfondisci || 'Approfondiamo', value: 1, _do: function () {
              var pool = (cat.extra || []).map(function (d) { return d.id; });
              VN.state.pescate = mescola(pool).slice(0, cat.n_extra_da_pescare || 3);
              VN.progressed = true;
              commenta(st.dopoApprofondisci);
            } },
          { label: st.passa || 'Passiamo al prossimo', value: 0, _do: function () {
              VN.state.pescate = [];
              VN.progressed = true;
              commenta(st.dopoPassa);
            } }
        ]
      });
    };
    type(fmt(st.text), apri);
    revealUI = apri;
  }

  /* ---------------- intermezzi di regia ----------------
     Cinque fissi in ordine, poi quelli di riserva. Valgono punti come le
     facoltative: il "val" secco dell'opzione. */
  function showIntermezzo(st) {
    var b = VN.banca || {};
    var n = VN.state.intermezzi || 0;
    var fissi = b.intermezzi || [];
    var q = fissi[n] || (b.intermezzi_riserva || [])[n - fissi.length];
    if (!q) return next();
    VN.state.intermezzi = n + 1;

    el.boxwrap.classList.add('in');
    setSpeaker(st.who || 'susan', st.incuffia !== false);
    var apri = function () {
      showChoices({
        options: (q.opzioni || []).map(function (o) {
          return { label: o.label, value: o.val, _do: function () {
            segna('intermezzi', 'r', q.id, o.label, o.val || 0);
            VN.progressed = true;
            hideUI();
            next();
          } };
        })
      });
    };
    type(fmt(q.q), apri);
    revealUI = apri;
  }

  /* ================ S6: teleprompter e blocco ================ */

  // Quanto manca a un macroargomento: le core sono sempre tutte gia' fatte
  // (la griglia di S5 non cede il turno finche' non lo sono), quindi quello
  // che puo' ancora mancare sono solo le facoltative pescate.
  function statoCategoria(argomenti, cat) {
    var c = (VN.banca && VN.banca.categorie && VN.banca.categorie[cat]) || {};
    var date = (VN.state.picks || {})[cat] || {};
    var core = c.core || [];
    var extra = c.extra || [];
    var quotaExtra = c.n_extra_da_pescare || 0;
    var extraGiocate = Object.keys(date.extra || {});
    var totale = core.length + quotaExtra;
    var fatte = core.filter(function (d) { return !!(date.core || {})[d.id]; }).length + extraGiocate.length;
    return {
      id: cat, nome: fmt((argomenti[cat] || {}).nome || cat),
      core: core, extra: extra, quotaExtra: quotaExtra, extraGiocate: extraGiocate, date: date,
      totale: totale, fatte: fatte,
      percento: totale ? Math.round(fatte / totale * 100) : 100
    };
  }

  /* I tre schermi bianchi disegnati dentro bg_control_room_monitors,
     misurati sul file sorgente (1024x1536): stessa tecnica di
     SCHERMO_FONDALE/ancoraTerminale per il terminale della registrazione,
     ripetuta tre volte. Se il fondale viene ridisegnato, questi quattro
     numeri per schermo vanno rimisurati. */
  var SCHERMI_MONITOR = [
    { x: 0.00879, y: 0.05859, w: 0.31445, h: 0.52279 },   // sinistra
    { x: 0.34375, y: 0.05469, w: 0.31445, h: 0.52930 },   // centro
    { x: 0.68457, y: 0.05859, w: 0.31445, h: 0.52539 }    // destra
  ];

  function ancoraMonitor() {
    var box = el && el.monschermi;
    if (!box || !box.children.length) return;
    var img = el.bg;
    var nw = img && img.naturalWidth, nh = img && img.naturalHeight;
    if (!nw || !nh) {
      if (img && !img.complete) img.addEventListener('load', ancoraMonitor, { once: true });
      return;
    }
    var lw = el.stage ? el.stage.clientWidth : 0;
    var lh = el.stage ? el.stage.clientHeight : 0;
    if (!lw || !lh) return;
    var scala = Math.max(lw / nw, lh / nh);        // object-fit: cover
    var dw = nw * scala, dh = nh * scala;
    var ox = (lw - dw) / 2, oy = 0;                // object-position: center top
    Array.prototype.forEach.call(box.children, function (nodo, i) {
      var r = SCHERMI_MONITOR[i];
      if (!r) return;
      nodo.style.left = (ox + r.x * dw).toFixed(1) + 'px';
      nodo.style.top = (oy + r.y * dh).toFixed(1) + 'px';
      nodo.style.width = (r.w * dw).toFixed(1) + 'px';
      nodo.style.height = (r.h * dh).toFixed(1) + 'px';
    });
  }
  global.addEventListener('resize', function () {
    if (el.monitorwrap && el.monitorwrap.classList.contains('on')) ancoraMonitor();
  });

  /* ---------------- [S6] il riepilogo nella sala regia ----------------
     Le previsioni per macroargomento, come tre monitor: la vista generale
     mostra a colpo d'occhio quanto manca a ciascuno (di solito niente: le
     core sono gia' tutte fatte), il tocco apre il dettaglio con le singole
     risposte — ancora tutte modificabili — e le facoltative rimaste da
     pescare. Il bottone che chiude la schedina sta nella vista generale, non
     nel dettaglio: e' un gesto sulla plancia, non su un monitor solo. I tre
     riepiloghi vivono dentro gli schermi disegnati nel fondale, non in una
     griglia sovrapposta: ogni pannello viene posizionato pixel per pixel su
     uno dei tre schermi (ancoraMonitor). */
  function showMonitor(st) {
    var argomenti = VN.story[st.da || 'argomenti'] || {};
    var chiavi = Object.keys(argomenti);
    var uscito = false;
    // segna quali categorie erano gia' complete PRIMA di aprire questa
    // schermata: il suono di completamento e' per quello che succede qui
    // dentro, non per rifare notare cio' che era gia' a posto
    var completatePrima = {};
    chiavi.forEach(function (k) {
      if (statoCategoria(argomenti, k).percento >= 100) completatePrima[k] = true;
    });

    // L'anello di completamento: un cerchio pieno color panello e uno
    // conico verde sopra, con un buco al centro che lascia vedere solo la
    // corona. "--pct" parte da 0 e si anima verso il valore vero un istante
    // dopo il mount, cosi' la transizione CSS ha un "prima" da cui partire.
    function anello(pct) {
      var d = global.document.createElement('div');
      d.className = 'monanello';
      d.style.setProperty('--pct', 0);
      var buco = global.document.createElement('div');
      buco.className = 'monbuco';
      var num = global.document.createElement('div');
      num.className = 'monnum';
      d.appendChild(buco);
      d.appendChild(num);
      setTimeout(function () { d.style.setProperty('--pct', pct); }, 30);
      return { nodo: d, num: num };
    }

    // Una riga di statistica compatta ("DOMANDE 4/4"): lo spazio verticale
    // dello schermo e' generoso (misurato sul fondale), meglio due numeri
    // leggibili che un elenco di risposte troppo stretto per starci dentro.
    function msRiga(box, etichetta, fatte, totale) {
      var r = global.document.createElement('div');
      r.className = 'msRiga';
      var e = global.document.createElement('span');
      e.className = 'msEtichetta';
      e.textContent = etichetta;
      var v = global.document.createElement('span');
      v.className = 'msValore';
      v.textContent = fatte + '/' + totale;
      r.appendChild(e); r.appendChild(v);
      box.appendChild(r);
    }

    function griglia() {
      el.monschermi.innerHTML = '';
      chiavi.forEach(function (k) {
        var s = statoCategoria(argomenti, k);
        if (s.percento >= 100 && !completatePrima[k]) {
          completatePrima[k] = true;
          suona('traguardo');   // un effetto positivo, non un applauso
        }
        var b = global.document.createElement('button');
        b.className = 'monschermo' + (s.percento >= 100 ? ' fatta' : '');

        var tit = global.document.createElement('div');
        tit.className = 'montit';
        tit.textContent = s.nome;
        b.appendChild(tit);

        var an = anello(s.percento);
        an.num.innerHTML = '<b>' + s.fatte + '/' + s.totale + '</b><span>' + s.percento + '%</span>';
        b.appendChild(an.nodo);

        var stats = global.document.createElement('div');
        stats.className = 'msStats';
        msRiga(stats, 'PREVISIONI', s.core.filter(function (d) {
          return !!(s.date.core || {})[d.id];
        }).length, s.core.length);
        msRiga(stats, 'OPZIONALI', s.extraGiocate.length, s.quotaExtra);
        b.appendChild(stats);

        var stato = global.document.createElement('div');
        stato.className = 'monstato';
        stato.textContent = s.percento >= 100 ? (st.completato || 'COMPLETATO')
          : (st.daFinire || (s.totale - s.fatte) + ' da completare');
        b.appendChild(stato);

        b.onclick = function (ev) {
          if (ev && ev.stopPropagation) ev.stopPropagation();
          if (uscito) return;
          apriDettaglio(k);
        };
        el.monschermi.appendChild(b);
      });
      ancoraMonitor();
    }

    function apriDettaglio(cat) {
      dettaglio(cat);
      el.mondettaglio.classList.add('on');
    }

    function dettaglio(cat) {
      var s = statoCategoria(argomenti, cat);
      el.montesta.innerHTML = '';
      var tit = global.document.createElement('div');
      tit.className = 'montit';
      tit.textContent = s.nome;
      el.montesta.appendChild(tit);
      var an = anello(s.percento);
      an.num.innerHTML = '<b>' + s.fatte + '/' + s.totale + '</b><span>' + s.percento + '%</span>';
      el.montesta.appendChild(an.nodo);

      el.monlista.innerHTML = '';
      s.core.forEach(function (d) { riga(s, 'core', d, (s.date.core || {})[d.id]); });
      s.extraGiocate.forEach(function (id) {
        var q = s.extra.filter(function (d) { return d.id === id; })[0];
        if (q) riga(s, 'extra', q, s.date.extra[id]);
      });
      var mancano = s.quotaExtra - s.extraGiocate.length;
      for (var i = 0; i < mancano; i++) vuota(s);
    }

    function riga(s, tipo, d, risposta) {
      var b = global.document.createElement('button');
      b.className = 'monriga';
      b.innerHTML = '<span class="monq"></span><span class="monv"></span>';
      b.querySelector('.monq').textContent = fmt(d.q);
      b.querySelector('.monv').textContent = risposta ? fmt(risposta.v) : '—';
      b.onclick = function (ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        if (uscito) return;
        chiedi(s.id, tipo, d);
      };
      el.monlista.appendChild(b);
    }

    // Un posto ancora libero fra le facoltative: al tocco si pesca (se non
    // era gia' stato fatto) e si risponde adesso.
    function vuota(s) {
      var b = global.document.createElement('button');
      b.className = 'monriga monvuota';
      b.innerHTML = '<span class="monq"></span><span class="monv">+</span>';
      b.querySelector('.monq').textContent = fmt(st.daFare || 'Previsione mancante');
      b.onclick = function (ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        if (uscito) return;
        var libere = s.extra.filter(function (d) { return s.extraGiocate.indexOf(d.id) < 0; });
        if (!libere.length) return;
        chiedi(s.id, 'extra', mescola(libere)[0]);
      };
      el.monlista.appendChild(b);
    }

    // Rispondere di nuovo (o per la prima volta a una facoltativa): le stesse
    // opzioni della domanda vera, e il punteggio si ricalcola da solo perche'
    // e' derivato dalle risposte. Si torna alla vista generale, non al
    // dettaglio: e' li' che si vede il progresso appena aggiornato.
    function chiedi(cat, tipo, d) {
      el.monitorwrap.classList.remove('on');
      el.boxwrap.classList.add('in');
      setSpeaker(st.who, st.incuffia !== false);
      var apri = function () {
        el.choices.innerHTML = '';
        (d.opzioni || []).forEach(function (o) {
          var b = global.document.createElement('button');
          b.className = 'ch';
          b.textContent = fmt(o.label);
          b.onclick = function (ev) {
            if (ev && ev.stopPropagation) ev.stopPropagation();
            hideUI();
            suona('tap');
            segna(cat, tipo, d.id, o.label, o.pt != null ? o.pt : (o.val || 0));
            VN.progressed = true;
            VN.saveNow();
            apriMonitor();
          };
          el.choices.appendChild(b);
        });
        el.choices.classList.add('on');
      };
      type(fmt(d.q), apri);
      revealUI = apri;
    }

    function apriMonitor() {
      hideUI();
      el.boxwrap.classList.remove('in');
      el.mondettaglio.classList.remove('on');
      griglia();
      el.monitorwrap.classList.add('on');
      pending = null;
    }

    el.mondietro.onclick = function (ev) {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      el.mondettaglio.classList.remove('on');
    };

    /* ---------------- il blocco [S6.03] ---------------- */
    el.monconferma.textContent = fmt(st.bottone || 'CONFERMA IL TUO KEYNOTE');
    el.monconferma.onclick = function (ev) {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      if (uscito) return;
      mostraModale(st.lock || { text: 'Sicuro? Dopo questo le tue previsioni sono definitive.' }, function () {
        uscito = true;
        VN.state.locked = true;
        VN.state.punti = totale();
        VN.progressed = true;
        gaOnce('teleprompter_complete', 'teleprompter_complete', {});
        // Non si spedisce ancora: subito dopo c'e' la schermata dell'email, e
        // una partita spedita due volte sarebbe due righe nella tabella. La
        // partita va in coda, e la spedisce lo step 'email' (o il prossimo
        // avvio, se il giocatore chiude li').
        accoda(payload());
        chiudiRecap();
        hideUI();
        VN.saveNow();
        if (st.goto) return goScene(st.goto);
        next();
      }, null);
    };

    apriMonitor();
  }

  /* ---------------- invio al server ----------------
     La schedina chiusa vale solo se arriva. Il blocco pero' e' locale e
     irreversibile: se l'invio fallisce (rete, chiave mancante) la partita resta
     in coda e si riprova al prossimo avvio, invece di perdersi.

     Il timestamp non lo mette il client: la colonna ha default now() sul
     server, come chiede lo script. */
  /* L'identificativo della partita. Serve a spedire UNA riga sola: la schedina
     parte due volte (alla conferma delle previsioni e quando si assegnano i
     moltiplicatori del quiz, che arrivano giorni dopo), e senza un id la
     seconda spedizione creava una seconda riga della stessa partita. Con l'id,
     la seconda riscrive la prima.

     Si genera una volta e vive nel salvataggio: chi riapre l'app riprende la
     sua riga. Una partita nuova ne prende uno nuovo. */
  function idPartita() {
    var s = VN.state;
    if (!s.run_id) {
      s.run_id = (global.crypto && global.crypto.randomUUID)
        ? global.crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
          });
    }
    return s.run_id;
  }

  function payload() {
    var s = VN.state;
    return {
      run_id: idPartita(),
      nome: s.nome, cognome: s.cognome || null, genere: s.genere, store: s.store, reparto: s.reparto,
      anni: s.anni, device: s.device, stile: s.stile,
      punti: totale(), picks: s.picks || {},
      flags: { sfacciato: !!s.sfacciato, studiato: s.studiato },
      quiz: { livelli: s.quiz || {}, banca: bancaMult(), moltiplicatori: s.moltiplicatori || null },
      // Apple Campus Run: il record e' l'unica cosa che la corsa lascia. Come
      // entri in classifica non e' deciso, ma se non parte con la schedina non
      // c'e' modo di deciderlo dopo: qui il dato c'e', chi conta a mano lo usa
      // o lo ignora.
      runner: { record: Number(s.runner_record || 0) },
      email: s.email || null,
      versione: (VN.story.meta && VN.story.meta.version) || ''
    };
  }

  var CODA = 'fl_nexus_da_inviare';

  function invia(dati) {
    var cfg = VN.backend || {};
    var corpo = dati || payload();
    if (!cfg.url || !cfg.chiave) return accoda(corpo);      // non configurato: in coda
    if (typeof global.fetch !== 'function') return accoda(corpo);
    global.fetch(cfg.url.replace(/\/+$/, '') + '/rest/v1/' + (cfg.tabella || 'runs'), {
      method: 'POST',
      headers: {
        'apikey': cfg.chiave,
        'Authorization': 'Bearer ' + cfg.chiave,
        'Content-Type': 'application/json',
        // merge-duplicates: se la riga con questo run_id c'e' gia' (la prima
        // spedizione), viene riscritta invece di aggiungerne una seconda
        'Prefer': 'return=minimal,resolution=merge-duplicates'
      },
      body: JSON.stringify(corpo)
    }).then(function (r) {
      if (r.ok) return svuotaCoda();
      // Un rifiuto va in coda e si riprova al prossimo avvio, ma resta muto per
      // il giocatore: se e' un problema di schema (una colonna che manca nella
      // tabella) nessuno se ne accorgerebbe mai. Il motivo finisce almeno in
      // console, cosi' e' diagnosticabile.
      accoda(corpo);
      if (global.console && r.text) {
        r.text().then(function (t) { global.console.warn('schedina non accettata:', r.status, t); },
                      function () {});
      }
    }).catch(function (e) {
      accoda(corpo);
      if (global.console) global.console.warn('schedina non spedita:', e);
    });
  }

  function accoda(corpo) {
    var s = store();
    if (s) { try { s.setItem(CODA, JSON.stringify(corpo)); } catch (e) {} }
  }
  function svuotaCoda() {
    var s = store();
    if (s) { try { s.removeItem(CODA); } catch (e) {} }
  }
  VN.riprovaInvio = function () {
    var s = store();
    if (!s) return;
    var d = null;
    try { d = JSON.parse(s.getItem(CODA) || 'null'); } catch (e) {}
    if (d) invia(d);
  };

  /* ---------------- l'email facoltativa [S7.03b] ----------------
     Sta fra il blocco delle previsioni e i titoli di coda, e serve a una cosa
     sola: mandare i risultati quando ci saranno. E' facoltativa davvero — si
     continua anche saltandola, e saltarla e' un bottone dichiarato, non una X
     nascosta.

     Qui parte anche la spedizione della partita: al blocco e' finita in coda
     apposta, cosi' quello che arriva al server e' una riga sola, con dentro
     l'email se il giocatore l'ha lasciata. */
  var RE_EMAIL = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;
  var RE_EMAIL_LAVORO = /@apple\.com$/i;

  function showEmail(st) {
    hideUI();
    el.boxwrap.classList.remove('in');
    el.emailtit.textContent = fmt(st.titolo || 'DOVE TI TROVIAMO?');
    el.emailtesto.textContent = fmt(st.testo || '');
    el.emaillabel.textContent = fmt(st.label || 'La tua email');
    el.emailnota.textContent = fmt(st.nota || '');
    el.emailprivacy.textContent = fmt(st.privacy || '');
    el.emailok.textContent = fmt(st.ok || 'CONTINUA');
    el.emailsalta.textContent = fmt(st.salta || 'Preferisco spezzare loro il cuore');
    el.emailin.placeholder = st.placeholder || 'nome@esempio.com';
    el.emailin.value = VN.state.email || '';
    el.emailerr.textContent = '';
    el.emailerr.classList.remove('on');

    var uscito = false;
    function esci() {
      if (uscito) return;
      uscito = true;
      chiudiEmail();
      suona('previsioni_inviate');
      invia();                       // il POST non blocca il gioco
      VN.saveNow();
      next();
    }

    el.emailin.oninput = function () { el.emailerr.classList.remove('on'); };
    el.emailin.onkeydown = function (e) { if (e.key === 'Enter') el.emailok.click(); };

    el.emailok.onclick = function (ev) {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      var v = String(el.emailin.value || '').trim();
      // campo vuoto e CONTINUA: e' un modo come un altro di saltare, non un
      // errore da rinfacciare
      if (!v) { VN.state.email = null; return esci(); }
      if (!RE_EMAIL.test(v)) {
        el.emailerr.textContent = fmt(st.errore || 'Manca qualcosa: controlla che ci siano la chiocciola e il punto.');
        el.emailerr.classList.add('on');
        try { el.emailin.focus(); } catch (e) {}
        return;
      }
      // Niente mail di lavoro: e' un gioco per il tempo libero, non serve
      // saperlo su un indirizzo aziendale.
      if (RE_EMAIL_LAVORO.test(v)) {
        el.emailerr.textContent = fmt(st.erroreLavoro
          || 'Non puoi usare la mail di lavoro: gioca nel tuo tempo libero.');
        el.emailerr.classList.add('on');
        try { el.emailin.focus(); } catch (e) {}
        return;
      }
      VN.state.email = v;
      VN.progressed = true;
      // Solo il fatto che l'invio e' andato a buon fine: l'indirizzo non parte
      // mai verso Analytics.
      gaOnce('email_submitted', 'email_submitted', { method: 'optional_results_email' });
      esci();
    };

    el.emailsalta.onclick = function (ev) {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      VN.state.email = null;
      esci();
    };

    el.emailwrap.classList.add('on');
    pending = null;
    if (VN.speed) setTimeout(function () { try { el.emailin.focus(); } catch (e) {} }, 80);
  }

  function chiudiEmail() {
    if (el.emailwrap) el.emailwrap.classList.remove('on');
    if (el.emailerr) el.emailerr.classList.remove('on');
  }

  /* ================ S7: countdown e card ================ */

  function quandoKeynote() {
    var q = VN.story.meta && VN.story.meta.keynote;
    var t = q ? Date.parse(q) : NaN;
    return isNaN(t) ? null : t;
  }

  function mancano(ms) {
    if (ms <= 0) return null;
    var s = Math.floor(ms / 1000);
    return {
      g: Math.floor(s / 86400),
      h: Math.floor(s / 3600) % 24,
      m: Math.floor(s / 60) % 60,
      s: s % 60
    };
  }

  function due(n) { return (n < 10 ? '0' : '') + n; }

  /* ---------------- il countdown [S7.05] ----------------
     Schermata che si riapre ogni giorno fino al keynote vero: e' l'ultimo posto
     dove il gioco lascia il giocatore, e quello che rivede riaprendo. */
  var cId = null;
  function showCountdown(st) {
    var quando = quandoKeynote();
    // Il countdown e' l'ultimo posto in cui il gioco lascia il giocatore dopo
    // aver chiuso la parte narrativa: non punteggio, non nome, non email — solo
    // se le due fasi principali sono state completate. quiz_completed si legge
    // dal registro di gaOnce, che e' gia' la fonte di verita' su quiz_complete.
    gaOnce('game_complete', 'game_complete', {
      predictions_completed: !!VN.state.locked,
      quiz_completed: !!(VN.state._ga && VN.state._ga.quiz_complete)
    });

    function aggiorna() {
      var m = quando ? mancano(quando - Date.now()) : null;
      if (!m) {
        el.cdtempo.textContent = fmt(st.arrivato || 'E\' iniziato.');
        if (cId) { clearInterval(cId); cId = null; }
        return;
      }
      el.cdtempo.textContent = (m.g ? m.g + 'g ' : '') + due(m.h) + ':' + due(m.m) + ':' + due(m.s);
    }

    el.cdnome.textContent = fmt(st.titolo || '{NOME} — PREVISIONI COMPLETATE');
    el.cdlabel.textContent = fmt(st.label || 'Il keynote vero inizia tra');
    el.cdpunti.textContent = fmt(st.punti || 'Punti in gioco:') + ' ' + totale();
    aggiorna();
    if (cId) clearInterval(cId);
    if (VN.speed) cId = setInterval(aggiorna, 1000);

    el.cdbtn.innerHTML = '';
    (st.azioni || []).forEach(function (a) {
      var b = global.document.createElement('button');
      b.className = 'ch';
      b.textContent = fmt(a.label);
      b.onclick = function (ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        if (a.card) return mostraCard(st);
        // la corsa si apre sopra il countdown e lo lascia acceso sotto: alla
        // chiusura si e' di nuovo davanti al conto alla rovescia, senza aver
        // cambiato scena
        if (a.corsa) return apriCorsa(a, null);
        if (a.goto) { chiudiCountdown(); return goScene(a.goto); }
      };
      el.cdbtn.appendChild(b);
    });

    el.boxwrap.classList.remove('in');
    el.countdown.classList.add('on');
    pending = null;
  }

  function chiudiCountdown() {
    if (cId) { clearInterval(cId); cId = null; }
    if (el.countdown) el.countdown.classList.remove('on');
    if (el.cardwrap) el.cardwrap.classList.remove('on');
  }

  /* ---------------- la card condivisibile ----------------
     Composta qui, su una canvas, non scaricata da nessuna parte: il gioco e' un
     sito statico e la card dipende da come e' andata la partita.

     Su iPhone il salvataggio vero e' "tieni premuto sull'immagine": il tocco su
     un link di download apre una scheda e basta. Quindi si mostra l'immagine, e
     il link resta per chi gioca da computer. */
  function mostraCard(st) {
    var W = 1080, H = 1920;
    var c = global.document.createElement('canvas');
    c.width = W; c.height = H;
    var x = c.getContext('2d');

    var g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#141a2e'); g.addColorStop(1, '#05060a');
    x.fillStyle = g; x.fillRect(0, 0, W, H);

    var font = function (px, peso) {
      x.font = (peso || '') + px + 'px "Press Start 2P", ui-monospace, monospace';
    };
    x.textAlign = 'center';

    var scrivi = function () {
      x.fillStyle = '#ffd98a'; font(44);
      x.fillText('FANTALIBERTY', W / 2, 150);
      x.fillStyle = '#fff'; font(58);
      x.fillText(String(VN.state.nome || '').toUpperCase(), W / 2, 265);
      x.fillStyle = '#9fb4d8'; font(26);
      var sotto = [VN.state.store, VN.state.reparto].filter(Boolean).join(' · ');
      if (sotto) x.fillText(sotto.toUpperCase(), W / 2, 320);

      var s = (VN.story.stili || {})[VN.state.stile];
      if (s) { x.fillStyle = '#ffd98a'; font(30); x.fillText((s.nome || '').toUpperCase(), W / 2, 1520); }

      x.fillStyle = '#fff'; font(34);
      x.fillText(fmt(st.cardTitolo || 'PREVISIONI COMPLETATE'), W / 2, 1650);
      x.fillStyle = '#ffd98a'; font(72);
      x.fillText(String(totale()), W / 2, 1760);
      x.fillStyle = '#9fb4d8'; font(22);
      x.fillText(fmt(st.cardPunti || 'PUNTI IN GIOCO'), W / 2, 1815);

      el.cardImg.src = c.toDataURL('image/png');
      el.cardsalva.href = el.cardImg.src;
      el.cardsalva.download = 'fantaliberty-' + String(VN.state.nome || 'card').toLowerCase() + '.png';
      el.cardwrap.classList.add('on');
      el.cardchiudi.onclick = function (ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        el.cardwrap.classList.remove('on');
      };
    };

    // la figura dello stile scelto, se c'e': si disegna quando e' caricata
    var posa = posaStile('saluto_finale');
    if (!posa) return scrivi();
    var im = new global.Image();
    im.onload = function () {
      var h = 1050, w = im.width * (h / im.height);
      x.drawImage(im, (W - w) / 2, 400, w, h);
      scrivi();
    };
    im.onerror = scrivi;
    im.src = withBase(posa);
  }

  /* ================ S8: il quiz di Peter ================

     Tre livelli, due tentativi ciascuno, e domande a risposta secca sul passato
     di Apple. E' l'unico punto del gioco in cui il feedback dice se hai
     azzeccato o no: la regola d'oro di S5 (la platea non correla mai con la
     risposta) vale per i pronostici, che sono opinioni sul futuro. Qui le
     risposte sono verificabili, quindi Peter puo' annuire o scuotere la testa.

     Quello che si vince non sono punti: sono MOLTIPLICATORI, che in [S8.FINALE]
     si distribuiscono sui tre macroargomenti dei pronostici gia' chiusi. */

  var qId = null;          // il tick del timer della domanda

  // Il testo di una domanda a tempo compare tutto insieme: il typewriter
  // mangerebbe secondi al cronometro.
  function scriviSubito(riga) {
    stopTyping();
    typing = false; curLine = riga; typeTarget = el.txt;
    pending = null; revealUI = null;
    el.txt.textContent = riga;
    el.arrow.style.opacity = 0;
  }

  function cfgQuiz() { return VN.quiz || {}; }

  function livelliQuiz() { return cfgQuiz().livelli || {}; }

  // Lo stato per livello vive in VN.state, quindi entra nel salvataggio e
  // sopravvive alla chiusura dell'app: il quiz si gioca nei giorni fra il lock
  // e il keynote, non in una sessione sola.
  function statoQuiz(liv) {
    var q = VN.state.quiz || (VN.state.quiz = {});
    return q[liv] || (q[liv] = { passato: false, tentativi: 0, pool: null, seconda: false });
  }

  function perkStile() {
    var s = (VN.story.stili || {})[VN.state.stile];
    return (s && s.perk && s.perk.id) || null;
  }

  // Il perk dello showman e' proprio questo: niente scaletta imposta, i tre
  // livelli sono aperti da subito. Per tutti gli altri si sale un gradino alla
  // volta, come chiede lo script.
  function livelloAperto(liv, ordine) {
    if (perkStile() === 'tutto_sbloccato') return true;
    var i = ordine.indexOf(liv);
    if (i <= 0) return true;
    return statoQuiz(ordine[i - 1]).passato;
  }

  // Chiuso = non ci si puo' piu' entrare: o e' gia' passato, o i due tentativi
  // sono finiti.
  function livelloChiuso(liv) {
    var s = statoQuiz(liv);
    return s.passato || s.tentativi >= 2;
  }

  /* Un livello e' fuori portata quando uno di quelli prima e' stato bruciato:
     la scaletta chiede di passarlo, e passarlo non si puo' piu'. Non e' la
     stessa cosa di "prima l'altro", che e' un'attesa: qui non si apre mai piu',
     e dirlo con l'etichetta dell'attesa lascia il giocatore a girare fra tre
     pannelli spenti aspettando qualcosa che non arriva. */
  function livelloIrraggiungibile(liv, ordine) {
    if (perkStile() === 'tutto_sbloccato') return false;
    var i = ordine.indexOf(liv);
    for (var k = 0; k < i; k++) {
      var s = statoQuiz(ordine[k]);
      if (!s.passato && s.tentativi >= 2) return true;
    }
    return false;
  }

  function secondiQuiz() {
    var c = cfgQuiz();
    return perkStile() === 'tempo' ? (c.timer_s_ingegnere || c.timer_s || 10) : (c.timer_s || 10);
  }

  function bancaMult() { return Number(VN.state.mult_bank || 0); }

  /* ---------------- [S8.HUB] scelta del livello ----------------
     Tre pannelli come la griglia di S5, piu' le azioni sotto: assegnare i
     moltiplicatori (solo nelle 24 ore prima del keynote) e tornare indietro. */
  function showQuizHub(st) {
    var livelli = livelliQuiz();
    var ordine = st.ordine || Object.keys(livelli);
    if (!ordine.length) return next();

    var uscito = false;

    el.griglia.innerHTML = '';
    ordine.forEach(function (liv) {
      var cfg = livelli[liv] || {};
      var s = statoQuiz(liv);
      var aperto = livelloAperto(liv, ordine);
      var chiuso = livelloChiuso(liv);
      var b = global.document.createElement('button');
      b.className = 'gcell' + (chiuso || !aperto ? ' fatta' : '');
      b.dataset.livello = liv;
      b.innerHTML = '<span class="gnome"></span><span class="gstato"></span>';
      b.querySelector('.gnome').textContent = fmt(cfg.nome || liv);
      b.querySelector('.gstato').textContent = !aperto
        ? (livelloIrraggiungibile(liv, ordine)
            ? (st.etichettaMai || 'fuori portata')
            : (st.etichettaChiuso || 'chiuso'))
        : s.passato ? '+' + mult(s.vinto || 0)
        : s.tentativi >= 2 ? (st.etichettaBruciato || 'finito')
        : cfg.domande + ' dom · ' + secondiQuiz() + 's';
      b.onclick = function (ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        if (uscito || chiuso || !aperto) return;
        uscito = true;
        suona('tap');           // si entra in un livello: "comincia"
        VN.progressed = true;
        VN.state.livello = liv;
        gaOnce('quiz_level_started:' + liv, 'quiz_level_started', { quiz_level: liv });
        chiudiGriglia();
        hideUI();
        goScene(st.goto);
      };
      el.griglia.appendChild(b);
    });

    // le azioni sotto la griglia: i moltiplicatori e l'uscita
    var azioni = [];
    if (bancaMult() > 0) {
      var pronto = finestraMult() || !!VN.state.moltiplicatori;
      azioni.push({
        label: VN.state.moltiplicatori
          ? (st.assegnati || 'Rivedi i moltiplicatori')
          : pronto
          ? (st.assegna || 'Assegna i moltiplicatori (+{banca})').replace('{banca}', mult(bancaMult()))
          : (st.assegnaPresto || 'Moltiplicatori: si assegnano il giorno del keynote'),
        spento: !pronto,
        _do: function () {
          if (!pronto) return;
          uscito = true;
          chiudiGriglia();
          hideUI();
          if (st.gotoMult) return goScene(st.gotoMult);
          next();
        }
      });
    }
    // Apple Campus Run non e' piu' una sfida del quiz di Peter: nessun
    // pulsante verso la corsa in questa griglia. Si raggiunge solo dalla
    // porta STAFF ONLY della lobby.
    if (st.esci) {
      azioni.push({ label: st.esci.label || 'Torna in lobby', _do: function () {
        uscito = true;
        chiudiGriglia();
        hideUI();
        goScene(st.esci.goto);
      } });
    }

    el.boxwrap.classList.add('in', 'quizhub');
    setSpeaker(st.who || 'peter');
    el.griglia.classList.add('on');
    pending = null;
    // Quando non resta niente da giocare — livelli passati, bruciati o fuori
    // portata — "da dove vuoi cominciare?" e' una domanda senza risposta: la
    // griglia e' tutta spenta e il giocatore non capisce di aver finito.
    var restaQualcosa = ordine.some(function (liv) {
      return livelloAperto(liv, ordine) && !livelloChiuso(liv);
    });
    // "Conclude definitivamente il quiz": non resta piu' nessun livello da
    // giocare, passato o bruciato che sia. Il livello piu' alto superato segue
    // l'ordine della scaletta (ordine e' gia' dal piu' facile al piu' difficile).
    if (!restaQualcosa) {
      var superati = ordine.filter(function (liv) { return statoQuiz(liv).passato; });
      var params = superati.length ? { highest_level_completed: superati[superati.length - 1] } : {};
      gaOnce('quiz_complete', 'quiz_complete', params);
    }
    var riga = (!restaQualcosa && st.finito) ? st.finito : (testoDi(st) || st.text);
    // Senza riga la griglia parla da sola: si toglie la battuta di prima (di
    // solito l'ultima cosa detta da Peter prima di arrivare qui), altrimenti
    // resterebbe a schermo dietro la griglia come se fosse ancora valida.
    if (riga) typeKeep(fmt(riga));
    else { stopTyping(); el.txt.textContent = ''; el.arrow.style.opacity = 0; }
    if (azioni.length) showChoices({ options: azioni, colonne: false });
  }

  // I moltiplicatori si scrivono come "+0.30": due decimali, mai la notazione
  // di JavaScript (0.30000000000000004 dopo due somme).
  function mult(n) { return Number(n || 0).toFixed(2); }

  /* [S8.FINALE] Quando si possono assegnare i moltiplicatori.

     Di default: appena se ne vince uno. La finestra delle ultime ore prima del
     keynote c'era per fare attesa, ma teneva la schermata spenta per tutti i
     giorni in cui il quiz si gioca davvero: quello che si era vinto non si
     poteva mettere da nessuna parte, e la parte finale del quiz non la vedeva
     nessuno. Se un giorno la si rivuole, basta rimettere "finestra_ore" in
     game/quiz.json: senza quella chiave non si blocca niente. */
  function finestraMult() {
    var ore = VN.quiz && VN.quiz.finestra_ore;
    if (!ore) return true;
    var q = quandoKeynote();
    if (!q) return true;
    return Date.now() >= q - ore * 3600000;
  }

  /* ---------------- [S8.LOOP] un livello ----------------
     Si pescano le domande da uno dei due pool: mai quello del tentativo
     precedente, cosi' sbagliare apposta per memorizzare le risposte non serve a
     niente. Il timer parte al render della domanda, non alla fine della
     scrittura: per questo il testo compare tutto insieme. */
  function showQuizLivello(st) {
    var liv = VN.state.livello;
    var cfg = livelliQuiz()[liv];
    var pools = (cfgQuiz().pool || {})[liv];
    if (!cfg || !pools || !pools.length) return next();

    var s = statoQuiz(liv);
    // primo tentativo: pool a caso. Secondo: l'altro.
    var iPool = s.pool == null ? Math.floor(Math.random() * pools.length)
                               : (s.pool + 1) % pools.length;
    s.pool = iPool;
    var lista = mescola(pools[iPool] || []);
    if (!lista.length) return next();

    /* Il tentativo si consuma QUI, non alla fine. Contandolo a fine livello,
       chi vedeva che stava andando male poteva chiudere l'app prima dell'ultima
       risposta e ritrovarsi il tentativo intatto: il salvataggio era fermo alla
       griglia. Adesso entrare in un livello costa il tentativo, punto — anche
       se poi si esce, per qualunque motivo. */
    s.tentativi = s.tentativi + 1;
    var tentativo = s.tentativi;
    VN.progressed = true;
    VN.saveNow();

    var i = 0, giuste = 0;
    var cinquantaUsato = false;
    var msTotali = secondiQuiz() * 1000;
    var rimasti = msTotali;

    function chiudiTimer() {
      if (qId) { clearInterval(qId); qId = null; }
      VN.quizScadenza = null;
      el.quizbar.classList.remove('on');
      el.qtimer.classList.remove('poco');
    }

    function disegnaTimer() {
      var frazione = Math.max(0, rimasti / msTotali);
      el.qbar.style.width = (frazione * 100).toFixed(1) + '%';
      el.qsec.textContent = Math.ceil(rimasti / 1000) + 's';
      // sotto i tre secondi Peter guarda l'orologio: lo chiede lo script, ed e'
      // l'unico avviso oltre alla barra che si sta per scadere
      var poco = rimasti <= 3000;
      el.qtimer.classList.toggle('poco', poco);
      if (poco && current.body !== 'guarda_orologio') showChar({ who: 'peter', body: 'guarda_orologio', height: st.height, bottom: st.bottom });
    }

    function domanda() {
      chiudiTimer();
      if (i >= lista.length) return fine();
      var d = lista[i];
      rimasti = msTotali;

      el.boxwrap.classList.add('in');
      setSpeaker(st.who || 'peter');
      showChar({ who: 'peter', body: 'alza_occhi', height: st.height, bottom: st.bottom });
      // niente typewriter: il tempo scorre gia', e leggere in ritardo sarebbe
      // una penalita' invisibile
      scriviSubito(fmt(d.q));

      el.qinfo.textContent = fmt(cfg.nome || liv) + ' · ' + (i + 1) + '/' + lista.length +
        ' · ' + fmt(st.giuste || 'giuste') + ' ' + giuste + '/' + cfg.soglia;
      el.quizbar.classList.add('on');
      disegnaTimer();

      opzioni(d, d.opzioni.map(function (_, k) { return k; }));

      VN.quizScadenza = function () { rispondi(d, -1); };
      if (VN.speed) {
        qId = global.setInterval(function () {
          rimasti -= 100;
          disegnaTimer();
          if (rimasti <= 0) { var f = VN.quizScadenza; chiudiTimer(); if (f) f(); }
        }, 100);
      }
    }

    // "visibili" sono gli indici ancora in gioco: il 50/50 del drip ne toglie
    // due sbagliati e ridisegna la stessa domanda.
    function opzioni(d, visibili) {
      el.choices.innerHTML = '';
      el.choices.classList.toggle('due', visibili.length >= 4);
      visibili.forEach(function (k) {
        var b = global.document.createElement('button');
        b.className = 'ch';
        b.textContent = fmt(d.opzioni[k]);
        b.onclick = function (ev) {
          if (ev && ev.stopPropagation) ev.stopPropagation();
          rispondi(d, k);
        };
        el.choices.appendChild(b);
      });
      // il perk del drip: una volta per livello, e non ferma il tempo
      if (perkStile() === 'cinquanta' && !cinquantaUsato && visibili.length > 2) {
        var p = global.document.createElement('button');
        p.className = 'ch perk';
        p.textContent = fmt(st.cinquanta || '50:50 — togli le risposte sbagliate');
        p.onclick = function (ev) {
          if (ev && ev.stopPropagation) ev.stopPropagation();
          cinquantaUsato = true;
          // ne resta una sbagliata sola, accanto a quella giusta
          var salva = mescola(visibili.filter(function (k) { return k !== d.ok; })).slice(0, 1);
          opzioni(d, visibili.filter(function (k) { return k === d.ok || salva.indexOf(k) >= 0; }));
        };
        el.choices.appendChild(p);
      }
      el.choices.classList.add('on');
    }

    function rispondi(d, scelto) {
      chiudiTimer();
      hideUI();
      VN.progressed = true;
      var giusta = scelto === d.ok;
      if (giusta) giuste++;
      suona(giusta ? 'quiz_giusta' : 'quiz_sbagliata');
      showChar({ who: 'peter', body: giusta ? 'annuisce' : 'scuote_testa', height: st.height, bottom: st.bottom });
      setSpeaker(st.who || 'peter');
      var testo = giusta ? (st.giusta || 'Esatto.')
        : scelto < 0 ? (st.scaduta || 'Tempo. Era: {r}.')
        : (st.sbagliata || 'No. Era: {r}.');
      i++;
      var poi = function () { pending = function () { domanda(); }; el.arrow.style.opacity = 1; };
      type(fmt(testo).replace('{r}', fmt(d.opzioni[d.ok])), poi);
      revealUI = poi;
    }

    /* Fine livello: passato o no, e quanto vale. Il perk dell'hawaiano assorbe
       il PRIMO fallimento di ogni livello — il tentativo non si consuma, quindi
       gliene restano comunque due veri. */
    function fine() {
      chiudiTimer();
      hideUI();
      var passato = giuste >= cfg.soglia;
      var primo = tentativo === 1;
      var assorbito = false;

      if (passato) {
        s.passato = true;
        s.vinto = primo ? cfg.mult1 : cfg.mult2;
        VN.state.mult_bank = Number((bancaMult() + s.vinto).toFixed(2));
      } else if (perkStile() === 'seconda_chance' && !s.seconda) {
        // il perk dell'hawaiano restituisce il tentativo appena speso: e' il
        // giro che "non si conta", quindi gliene restano comunque due veri
        s.seconda = true;
        s.tentativi = s.tentativi - 1;
        assorbito = true;
      }
      VN.progressed = true;
      VN.saveNow();
      // Ogni tentativo che finisce le sue domande, mai le risposte date.
      ga('quiz_level_complete', { quiz_level: liv, result: passato ? 'passed' : 'failed' });

      // il livello passato e' un traguardo; il fallito e' quello di Peter, e
      // suona solo a fine livello: su ogni risposta sbagliata sarebbe pesante
      suona(passato ? 'quiz_livello' : 'quiz_fallito');
      showChar({ who: 'peter', body: passato ? 'applauso_ironico' : 'scuote_testa', height: st.height, bottom: st.bottom });
      setSpeaker(st.who || 'peter');
      var testo = passato
        ? (st.passato || 'Passato: {giuste} su {n}. Vale +{mult}.')
        : assorbito ? (st.assorbito || '{giuste} su {n}. Questo giro non lo conto: rifallo.')
        : livelloChiuso(liv) ? (st.bruciato || '{giuste} su {n}. Basta cosi\', questo livello e\' chiuso.')
        : (st.ritenta || '{giuste} su {n}. Ne serviva {soglia}. Hai ancora un tentativo.');
      var riga = fmt(testo)
        .replace('{giuste}', giuste).replace('{n}', lista.length)
        .replace('{soglia}', cfg.soglia).replace('{mult}', mult(s.vinto || 0));
      var poi = function () { pending = function () { hideUI(); next(); }; el.arrow.style.opacity = 1; };
      type(riga, poi);
      revealUI = poi;
    }

    domanda();
  }

  function chiudiQuiz() {
    if (qId) { clearInterval(qId); qId = null; }
    VN.quizScadenza = null;
    if (el.quizbar) el.quizbar.classList.remove('on');
    if (el.multwrap) el.multwrap.classList.remove('on');
    if (el.boxwrap) el.boxwrap.classList.remove('mult');
  }

  /* ---------------- [S8.FINALE] i moltiplicatori ----------------
     Quello che si e' vinto al quiz si spalma sui tre macroargomenti dei
     pronostici, che a questo punto sono chiusi da giorni. Nessun tetto per
     categoria: si puo' anche mettere tutto su una sola. Conferma irreversibile,
     come il lock di S6. */
  function showMult(st) {
    var argomenti = VN.story[st.da || 'argomenti'] || {};
    var chiavi = Object.keys(argomenti);
    var banca = bancaMult();
    var passo = st.passo || 0.05;

    // gia' assegnati: si guarda e basta
    var fatti = VN.state.moltiplicatori;
    var quote = {};
    chiavi.forEach(function (k) { quote[k] = fatti ? Number(fatti[k] || 0) : 0; });

    function speso() {
      var t = 0;
      chiavi.forEach(function (k) { t += quote[k]; });
      return Number(t.toFixed(2));
    }

    function righe() {
      el.multrighe.innerHTML = '';
      chiavi.forEach(function (k) {
        var r = global.document.createElement('div');
        r.className = 'mriga';
        r.innerHTML = '<span class="mnome"></span><button class="mmeno">−</button>' +
                      '<span class="mval"></span><button class="mpiu">+</button>';
        r.querySelector('.mnome').textContent = fmt(argomenti[k].nome || k);
        r.querySelector('.mval').textContent = '×' + (1 + quote[k]).toFixed(2);
        var meno = r.querySelector('.mmeno'), piu = r.querySelector('.mpiu');
        if (fatti) { meno.disabled = true; piu.disabled = true; }
        meno.onclick = function (ev) {
          if (ev && ev.stopPropagation) ev.stopPropagation();
          if (fatti || quote[k] < passo) return;
          quote[k] = Number((quote[k] - passo).toFixed(2));
          righe();
        };
        piu.onclick = function (ev) {
          if (ev && ev.stopPropagation) ev.stopPropagation();
          if (fatti || speso() + passo > banca + 1e-9) return;
          quote[k] = Number((quote[k] + passo).toFixed(2));
          righe();
        };
        el.multrighe.appendChild(r);
      });
      var resta = Number((banca - speso()).toFixed(2));
      el.multresto.textContent = fatti
        ? fmt(st.restoFatto || 'Assegnati, e non si tornano indietro.')
        : fmt(st.resto || 'Da distribuire:') + ' ' + mult(resta);
      // gia' assegnati: la schermata resta consultabile, e il bottone e' l'uscita
      el.multok.disabled = !fatti && resta > 1e-9;
      el.multok.textContent = fmt(fatti ? (st.gia || 'Chiudi') : (st.bottone || 'CONFERMA'));
    }

    el.multok.onclick = function (ev) {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      if (el.multok.disabled) return;
      if (fatti) { chiudiQuiz(); hideUI(); return st.goto ? goScene(st.goto) : next(); }
      mostraModale(st.conferma || { text: 'Confermi? I moltiplicatori non si cambiano piu\'.' }, function () {
        VN.state.moltiplicatori = quote;
        VN.progressed = true;
        VN.saveNow();
        // secondo salvataggio-specchio lato server: come il lock, e' un atto
        // irreversibile, e vale solo se arriva
        invia();
        chiudiQuiz();
        hideUI();
        if (st.goto) return goScene(st.goto);
        next();
      }, null);
    };

    // punteggio pieno al quiz: Peter applaude, ironico
    showChar({ who: st.who || 'peter', body: banca >= (cfgQuiz().tetto_mult || 0.6) - 1e-9
      ? 'applauso_ironico' : 'alza_occhi', height: st.height, bottom: st.bottom });
    setSpeaker(st.who || 'peter');
    el.txt.textContent = fmt(st.text || '');
    el.arrow.style.opacity = 0;
    el.boxwrap.classList.add('in', 'mult');
    el.multwrap.classList.add('on');
    pending = null;
    righe();
  }

  /* ---------------- un quadro della Hall of Fame [S1.ZONA2] ----------------
     Come il regolamento: si apre sopra la lobby, si chiude, e il giocatore
     resta dov'era. Non e' una scena e non tocca la partita.

     Un quadro alla volta: i tre vincitori si guardano uno per uno, non tutti
     insieme dentro la stessa schermata. L'immagine si assegna con apparira(),
     altrimenti riaprendo la galleria si vedrebbe per un fotogramma il quadro
     di prima. */
  // Non i nomi dei vincitori (dati personali): solo l'edizione, dall'id del
  // quadro che l'hotspot dichiara in story.json.
  var HOF_EDIZIONI = { halloffame_fabio: '2024', halloffame_michael: '2025', halloffame_nicola: '2026' };

  function mostraQuadro(h, done) {
    // Niente suono qui: la Hall of Fame e' silenziosa, a differenza del
    // regolamento e della corsa che condividono lo stesso 'apri'/'chiudi'.
    if (!el.quadrowrap) return done && done();
    var src = assetUrl('bg', h.quadro);   // assetUrl applica gia' la base
    if (HOF_EDIZIONI[h.quadro]) ga('hall_of_fame_edition_opened', { edition: HOF_EDIZIONI[h.quadro] });
    el.quadroImg.alt = fmt(h.alt || h.label || '');
    apparira(el.quadroImg, src, el.quadrowrap);
    el.quadrochiudi.textContent = fmt(h.chiudi || 'Chiudi');
    el.quadrochiudi.onclick = function (ev) {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      chiudiQuadro();
      if (done) done();
    };
    el.quadrowrap.classList.add('on');
    // il fondale passa fuori fuoco, come nel camerino e nel regolamento: il
    // quadro si stacca dalla parete invece di confondercisi dentro
    if (el.bg) el.bg.classList.add('sfoca');
  }

  function chiudiQuadro() {
    if (!el.quadrowrap) return;
    el.quadrowrap.classList.remove('on', 'attesa');
    if (el.bg) el.bg.classList.remove('sfoca');
  }

  /* ---------------- Apple Campus Run ----------------
     Il minigioco non e' una scena e non e' dentro il motore: e' una pagina sua
     (game/runner/) che si apre in un riquadro sopra quello che c'e', come il
     regolamento e i quadri della Hall of Fame. Chiudendola il giocatore e'
     esattamente dov'era — nella griglia di Peter o davanti al countdown — e la
     storia non si e' mossa di un passo.

     Le due pagine si parlano con dei messaggi:
       corsa -> gioco   'pronto' (sono in piedi), 'fine' (partita finita),
                        'esci'   (il giocatore ha toccato il bottone d'uscita);
       gioco -> corsa   'apri', con il nome del posto da cui l'ha aperta, che
                        diventa l'etichetta di quel bottone.
     Il bottone d'uscita sta dentro la corsa, non qui sopra: li' e' una
     schermata sola, mentre un bottone del gioco grande finirebbe sopra il
     punteggio o sotto il dito. #runchiudi e' solo la via di sicurezza, per la
     pagina che non si carica. */
  var corsaAscolto = null, corsaAttesa = null;

  function apriCorsa(cfg, done) {
    suona('apri');
    cfg = cfg || {};
    if (!el.runwrap || !el.runframe) return done && done();
    // Musica a caso per la corsa, non quella della scena sotto: si sente ogni
    // volta diversa, non un effetto che si ripete (audio.musica.corsa e' un
    // elenco, come gli applausi fra gli effetti).
    musicaScena('corsa');
    var etichetta = fmt(cfg.esci || 'Torna al gioco');
    var chiusa = false;

    function chiudi() {
      if (chiusa) return;
      chiusa = true;
      chiudiCorsa();
      if (done) done();
    }

    corsaAscolto = function (e) {
      var m = e && e.data;
      if (!m || m.fl !== 'runner') return;
      if (m.tipo === 'pronto') {
        // e' in piedi: via la via di sicurezza, e le si dice da dove si torna
        if (corsaAttesa) { global.clearTimeout(corsaAttesa); corsaAttesa = null; }
        el.runchiudi.hidden = true;
        try {
          /* Insieme al nome del posto da cui si torna, la corsa riceve
             l'identita' che il giocatore ha gia' (il nome scelto in [S0] e
             l'id della partita) e dove sta il database. Non c'e' un secondo
             sistema di identita': la corsa non chiede niente a nessuno, riusa
             quello che il gioco sa gia'. Senza queste due cose la corsa gira
             identica, solo senza classifica globale. */
          el.runframe.contentWindow.postMessage({
            fl: 'gioco', tipo: 'apri', esci: etichetta,
            playerId: idPartita(),
            playerName: VN.state.nome || '',
            backend: VN.backend || null
          }, '*');
        } catch (err) { /* niente: resta la via di sicurezza */ }
        return;
      }
      if (m.tipo === 'fine') return segnaCorsa(m);
      if (m.tipo === 'esci') { segnaCorsa(m); chiudi(); }
    };
    global.addEventListener('message', corsaAscolto);

    el.runchiudi.textContent = etichetta;
    el.runchiudi.hidden = true;
    el.runchiudi.onclick = function (ev) {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      chiudi();
    };
    // se entro sei secondi la corsa non ha detto niente, meglio un bottone in
    // piu' che un giocatore chiuso dentro un riquadro nero
    if (VN.speed) corsaAttesa = global.setTimeout(function () {
      if (el.runchiudi) el.runchiudi.hidden = false;
    }, 6000);

    var pagina = (VN.story.meta && VN.story.meta.runnerInline) || null;
    if (pagina) el.runframe.srcdoc = pagina;
    else el.runframe.src = conVersione((VN.story.meta && VN.story.meta.runner) || 'game/runner/');
    el.runwrap.classList.add('on');
  }

  /* La pagina della corsa e' un file come engine.js: senza una query di versione
     il browser se la tiene in cache dopo una pubblicazione. Si riusa la stessa
     di index.html, cosi' "npm run bump" la alza anche qui senza che nessuno
     debba ricordarsene. */
  function conVersione(url) {
    var t = global.document.querySelector('script[src*="engine.js"]');
    var m = t && /\?v=(\d+)/.exec(t.getAttribute('src') || '');
    if (!m) return url;
    return url + (url.indexOf('?') < 0 ? '?' : '&') + 'v=' + m[1];
  }

  function chiudiCorsa() {
    if (corsaAscolto) { global.removeEventListener('message', corsaAscolto); corsaAscolto = null; }
    if (corsaAttesa) { global.clearTimeout(corsaAttesa); corsaAttesa = null; }
    if (!el.runwrap) return;
    var eraAperta = el.runwrap.classList.contains('on');
    el.runwrap.classList.remove('on');
    // si torna al brano della scena sotto, ma solo se la corsa era davvero
    // aperta: altrimenti ogni cambio scena (che chiama chiudiCorsa per pulizia)
    // rifarebbe la stessa richiesta a vuoto
    if (eraAperta) musicaScena(VN.sceneId);
    if (el.runchiudi) { el.runchiudi.hidden = true; el.runchiudi.onclick = null; }
    // il riquadro si svuota: la corsa smette di girare, non resta a macinare
    // fotogrammi dietro la scena
    if (el.runframe) {
      el.runframe.removeAttribute('srcdoc');
      el.runframe.src = 'about:blank';
    }
  }

  /* Il record della corsa entra nel salvataggio, cosi' non si perde chiudendo
     l'app, ma NON entra nei punti delle previsioni: come le due cose si
     sommano e' una decisione ancora da prendere. Finche' non c'e', qui si
     tiene il numero e basta. */
  function segnaCorsa(m) {
    var r = Math.max(Number(m.record || 0), Number(m.punti || 0));
    if (r > Number(VN.state.runner_record || 0)) VN.state.runner_record = r;
    VN.state.runner_giocato = true;
    VN.progressed = true;
    if (VN.saveNow) VN.saveNow();
  }

  /* ---------------- il regolamento [S1.ZONA3] ----------------
     Un pannello che si legge e si chiude. Non e' una scena: si apre sopra la
     lobby, e alla chiusura il giocatore e' esattamente dov'era. Non tocca
     NIENTE della partita — ne' punti, ne' picks, ne' locked, ne' stile, ne' le
     domande gia' consumate: e' solo da leggere.

     Il fondale va sfocato, come nel camerino: cosi' il pannello si stacca dal
     cartellone invece di confondercisi dentro. */
  function mostraRegole(id, done) {
    suona('apri');
    var r = VN.story[id || 'regolamento'];
    if (!r) return done && done();

    el.regtit.textContent = fmt(r.titolo || 'REGOLAMENTO');
    el.regcorpo.innerHTML = '';

    (r.sezioni || []).forEach(function (s) { el.regcorpo.appendChild(sezioneRegole(s)); });

    // Le informazioni sul progetto stanno nella stessa schermata delle regole,
    // sotto un separatore: chi cerca come si gioca trova anche privacy,
    // indipendenza e contatti, senza una voce di menu in piu'.
    if ((r.informazioni || []).length) {
      var sep = global.document.createElement('div');
      sep.className = 'reggruppo';
      sep.appendChild(global.document.createElement('i'));
      var et = global.document.createElement('span');
      et.textContent = fmt(r.gruppo || 'INFORMAZIONI SUL PROGETTO');
      sep.appendChild(et);
      sep.appendChild(global.document.createElement('i'));
      el.regcorpo.appendChild(sep);
      r.informazioni.forEach(function (s) { el.regcorpo.appendChild(sezioneRegole(s)); });
    }

    if (r.chiusa) {
      var c = global.document.createElement('div');
      c.className = 'regsez chiusa';
      var t = global.document.createElement('div');
      t.className = 'regnome';
      t.textContent = fmt(r.chiusa.titolo || '');
      var p2 = global.document.createElement('p');
      p2.className = 'regriga';
      p2.textContent = fmt(r.chiusa.testo || '');
      c.appendChild(t); c.appendChild(p2);
      el.regcorpo.appendChild(c);
    }

    el.regok.textContent = fmt(r.bottone || 'HO CAPITO');
    el.regok.onclick = function (ev) {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      chiudiRegole();
      if (done) done();
    };
    el.regcorpo.scrollTop = 0;
    // ripiego per i browser senza overflow:clip, dove il fuoco su un bottone
    // puo' aver spostato di lato tutta la scena
    if (el.stage) el.stage.scrollLeft = 0;
    if (el.bg) el.bg.classList.add('sfoca');
    el.regole.classList.add('on');
  }

  /* Una sezione richiudibile: la riga col titolo e il "+", e sotto il testo.
     Si apre una alla volta al tocco, e si parte tutte chiuse — l'elenco delle
     voci deve stare in una schermata sola, altrimenti non si capisce cosa c'e'.

     Lo stato aperto/chiuso vive nel DOM e basta: NON va in VN.state. Leggere il
     regolamento non deve toccare la partita, e il test lo controlla
     confrontando lo stato prima e dopo. */
  function sezioneRegole(s) {
    var box = global.document.createElement('div');
    box.className = 'regsez';
    if (s.id) box.dataset.sez = s.id;

    var testa = global.document.createElement('button');
    testa.className = 'regtesta';
    testa.type = 'button';
    testa.setAttribute('aria-expanded', 'false');
    var nome = global.document.createElement('span');
    nome.className = 'regnome';
    nome.textContent = fmt(s.titolo || '');
    var segno = global.document.createElement('span');
    segno.className = 'regsegno';
    segno.textContent = '+';
    testa.appendChild(nome); testa.appendChild(segno);

    // due nodi: quello esterno si apre da 0fr a 1fr, quello interno tiene il
    // testo. Senza il secondo il contenuto verrebbe schiacciato invece che
    // tagliato mentre si apre.
    var sotto = global.document.createElement('div');
    sotto.className = 'regsotto';
    var dentro = global.document.createElement('div');
    dentro.className = 'regdentro';
    sotto.appendChild(dentro);

    (s.righe || []).forEach(function (riga) { dentro.appendChild(rigaRegole(riga)); });

    testa.onclick = function (ev) {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      var apri = !box.classList.contains('aperta');
      box.classList.toggle('aperta', apri);
      segno.textContent = apri ? '\u2212' : '+';       // meno vero, non un trattino
      testa.setAttribute('aria-expanded', apri ? 'true' : 'false');
    };

    box.appendChild(testa);
    box.appendChild(sotto);
    return box;
  }

  /* Una riga del regolamento. Di solito e' un paragrafo, ma la parte legale ha
     bisogno anche di sottotitoli, elenchi puntati e dell'indirizzo di posta. */
  function rigaRegole(riga) {
    var doc = global.document;
    if (typeof riga === 'string') {
      var p = doc.createElement('p');
      p.className = 'regriga';
      p.textContent = fmt(riga);
      return p;
    }
    if (riga && riga.h) {
      var h = doc.createElement('div');
      h.className = 'regsotto-tit';
      h.textContent = fmt(riga.h);
      return h;
    }
    if (riga && riga.lista) {
      var ul = doc.createElement('ul');
      ul.className = 'reglista';
      riga.lista.forEach(function (v) {
        var li = doc.createElement('li');
        li.textContent = fmt(v);
        ul.appendChild(li);
      });
      return ul;
    }
    if (riga && riga.mail) {
      var a = doc.createElement('a');
      a.className = 'regmail';
      a.href = 'mailto:' + riga.mail;
      a.textContent = riga.mail;
      return a;
    }
    return doc.createTextNode('');
  }

  function chiudiRegole() {
    if (el.regole && el.regole.classList.contains('on')) suona('chiudi');
    if (!el.regole) return;
    el.regole.classList.remove('on');
    el.regcorpo.innerHTML = '';
    if (el.bg) el.bg.classList.remove('sfoca');
  }

  /* ---------------- hub a zone ----------------
     La lobby dello script: quattro zone che si scorrono di lato, senza ordine
     imposto, ognuna con il suo fondale, il suo personaggio e le sue aree
     toccabili. Il fondale e il personaggio passano dai soliti setBg()/showChar():
     l'hub aggiunge solo lo scorrimento e gli hotspot.

     Il tutorial e' un vincolo dello script: l'area che porta avanti la storia
     resta disattivata finche' il giocatore non ha scorso almeno una volta —
     altrimenti entra in sala senza accorgersi che la lobby era visitabile. */
  function showHub(st) {
    // Il ritorno dopo le previsioni si sente, una volta per partita
    // (sfx_folla_lobby all'arrivo e' stato tolto: il file resta in
    // assets/sfx, solo il gioco non lo suona piu').
    if (VN.state.locked && !VN.state.__ritorno) {
      VN.state.__ritorno = true;
      suona('ritorno_lobby', 0.8);
    }
    var zones = (st.zones || []).filter(function (z) { return condizioneOk(z.when); });
    if (!zones.length) return next();

    // Il tutorial ("scorri, le zone sono quattro") si dice una volta nella
    // partita, non a ogni apertura dell'hub: tornando in lobby dopo le
    // previsioni il giro della lobby e' gia' stato fatto. Lo dichiara la scena
    // con "tutorialSe".
    var tutorial = condizioneOk(st.tutorialSe) ? st.tutorial : null;

    var cur = -1;
    var visti = {};
    var scorso = false;                 // il giocatore ha gia' cambiato zona?
    var uscito = false;                 // l'hub ha gia' ceduto il turno: niente doppi goto

    function entra(i, dir) {
      var nuova = (i + zones.length) % zones.length;
      if (nuova === cur) return;
      // "dir" e' zero solo alla prima apertura dell'hub: li' non e' un tocco
      // del giocatore, e' come si presenta la scena. Frecce, swipe e frecce
      // della tastiera passano sempre un verso, quindi il suono e' loro.
      if (dir) suona('transizione');
      if (cur >= 0) scorso = true;
      cur = nuova;
      var z = zones[cur];
      var primaVolta = !visti[z.id];
      visti[z.id] = true;
      // La Hall of Fame e' una zona dell'hub, non una scena: non passa da
      // trackLocationScena(), quindi la sua location_opened parte da qui.
      if (primaVolta && z.id === 'hall_of_fame') {
        gaOnce('loc:hall_of_fame', 'location_opened', { location_name: 'hall_of_fame' });
        gaOnce('hall_of_fame_opened', 'hall_of_fame_opened', {});
      }

      // Dal secondo passaggio in poi la guida non ripete cos'e' la zona: o la
      // zona dichiara una battuta di ritorno (la tenda: "sei pronto?"), oppure
      // resta muta e il personaggio sparisce del tutto, per lasciare girare in
      // pace chi ha gia' fatto il giro.
      var ritorno = primaVolta ? null : (z.ritorno || null);
      var muta = !primaVolta && !ritorno;

      if (z.bg) setBg(z.bg, z.bgFx);
      // Nell'hub il protagonista e' l'ambiente: il personaggio commenta da
      // bordo scena e non deve coprire quello che c'e' da toccare. Percio' qui
      // vale "scalaHub" del cast (piu' contenuta) invece di "scala".
      // "resta": il personaggio della zona e' scenografia, non la guida — Peter
      // dorme al suo tavolino e deve restarci anche quando la zona non parla
      // piu'. Senza, tornando sulla zona il tavolino era vuoto.
      var chiInScena = (muta && !z.resta) ? null : (ritorno ? (ritorno.who || z.who) : z.who);
      if (chiInScena) {
        showChar(perHub(ritorno
          ? { who: chiInScena, body: ritorno.body || z.body, height: z.height, bottom: z.bottom, right: z.right }
          : z));
      } else { el.npc.classList.remove('in', 'pop'); el.npc.classList.add('out'); current.who = null; }

      if (dir) {
        var verso = dir > 0 ? 'vaiSx' : 'vaiDx';
        [el.hub, el.bg].forEach(function (n) {
          n.classList.remove('vaiSx', 'vaiDx');
          void n.offsetWidth;
          n.classList.add(verso);
        });
      }

      // finche' non ha scorso, parla il tutorial; poi ogni zona ha la sua battuta.
      // "dice" separa chi parla da chi si vede: nella zona del quiz si vede Peter
      // che dorme, ma a commentare e' Francesca.
      var battuta = (!scorso && tutorial && tutorial.text)
        || (ritorno ? ritorno.say : (muta ? null : z.say));
      var chi = (!scorso && tutorial && tutorial.who)
        || (ritorno ? (ritorno.dice || ritorno.who || z.who) : (z.dice || z.who));
      stopTyping();
      typing = false;
      pending = null;
      el.arrow.style.opacity = 0;
      if (battuta) {
        el.boxwrap.classList.remove('muto');
        el.boxwrap.classList.add('in');
        setSpeaker(chi);
        typeKeep(fmt(battuta));
      } else {
        // Niente da dire: via il fumetto, cosi' la lobby resta pulita. Il
        // contenitore pero' resta acceso, perche' le frecce per cambiare zona
        // stanno dentro di lui: spegnendolo tutto, il giocatore non aveva piu'
        // nessun comando visibile per girare.
        el.txt.textContent = '';
        el.boxwrap.classList.add('in', 'muto');
        setSpeaker(null);
      }
      if (!scorso && tutorial && tutorial.body) {
        showChar(perHub({ who: chi, body: tutorial.body }));
      }
      render();
    }

    function render() {
      var z = zones[cur];
      el.hubspots.innerHTML = '';
      (z.hotspots || []).forEach(function (h) {
        if (!condizioneOk(h.when)) return;
        var bloccato = h.richiede === 'swipe' && !scorso;
        var b = global.document.createElement('button');
        b.className = 'hspot' + (bloccato ? ' chiuso' : '');
        // Niente scritta a schermo: il rettangolo con "LE TARGHE" scritto sopra
        // le targhe copriva il disegno e ripeteva quello che si vede gia'. Il
        // nome resta come etichetta accessibile, il segnale luminoso (<i>) dice
        // che li' si tocca.
        b.setAttribute('aria-label', fmt(h.label || 'Zona interattiva'));
        b.appendChild(global.document.createElement('i'));
        b.style.left = h.x || '35%';
        b.style.top = h.y || '40%';
        b.style.width = h.w || '30%';
        b.style.height = h.h || '22%';
        b.onclick = function (ev) {
          if (ev && ev.stopPropagation) ev.stopPropagation();
          tocca(h, bloccato);
        };
        el.hubspots.appendChild(b);
      });

      el.hdots.innerHTML = '';
      zones.forEach(function (zz, i) {
        var d = global.document.createElement('span');
        d.className = 'hdot' + (i === cur ? ' sel' : '') + (visti[zz.id] ? ' seen' : '')
          + (zz.chiuso ? ' chiuso' : '');
        el.hdots.appendChild(d);
      });
    }

    function tocca(h, bloccato) {
      if (uscito) return;
      if (bloccato) {
        var bw = h.who || zones[cur].who;
        el.boxwrap.classList.remove('muto');
        el.boxwrap.classList.add('in');
        if (bw && current.who !== bw) showChar(perHub(bw === zones[cur].who ? zones[cur] : { who: bw }));
        setSpeaker(bw);
        typeKeep(fmt(h.bloccato || 'Non ancora: prima guardati intorno.'));
        return;
      }
      // Feedback sonoro dell'hotspot (il lettore badge della porta STAFF ONLY:
      // un suono al tocco, rosso o verde a seconda dello stato, e' gia' tutto
      // nel fondale della zona). Non e' il tocco che manda avanti il dialogo —
      // e' la risposta a un'azione, come una scelta o un pannello che si apre.
      if (h.suono) suona(h.suono);
      if (h.react) react(h.react);
      var vai = function () {
        if (uscito) return;
        if (h.set) { VN.state[h.set.var] = h.set.value; termSet(h.set.var); }
        // un pannello da leggere (il regolamento): si apre sopra la lobby e si
        // chiude da solo, senza cambiare scena e senza toccare la partita
        if (h.apre) return mostraRegole(h.apre, null);
        // un quadro da guardare (la Hall of Fame): stessa cosa, un'immagine sola
        if (h.quadro) return mostraQuadro(h, null);
        // la porta STAFF ONLY autorizzata: il fondale passa al corridoio e la
        // corsa si apre sopra di esso, come il regolamento e i quadri. Alla
        // chiusura si torna qui, nella lobby, con la zona com'era.
        if (h.corsa) {
          var zonaStaff = zones[cur];
          if (h.corridoio) setBg(h.corridoio);
          var lanciaCorsa = function () {
            if (uscito) return;
            apriCorsa(h.corsa, function () {
              if (uscito) return;
              setBg(zonaStaff.bg, zonaStaff.bgFx);
            });
          };
          return VN.speed ? global.setTimeout(lanciaCorsa, 650) : lanciaCorsa();
        }
        if (h.say) {                      // commento e basta: si resta nell'hub
          var righe = [{ who: h.who || zones[cur].who, text: h.say }].concat(h.after || []);
          var k = 0;
          var parla = function () {
            var r = righe[k++];
            var rw = r.who || h.who || zones[cur].who;
            el.boxwrap.classList.remove('muto');
            el.boxwrap.classList.add('in');
            // nelle zone gia' viste il personaggio non e' in scena: se e' lui a
            // rispondere al tocco, rientra invece di parlare da fuori campo
            if (rw && current.who !== rw) {
              showChar(perHub(rw === zones[cur].who
                ? zones[cur]
                : { who: rw }));
            }
            setSpeaker(rw);
            typeKeep(fmt(r.text || ''));
            pending = k < righe.length ? parla : null;
            el.arrow.style.opacity = k < righe.length ? 1 : 0;
          };
          parla();
          return;
        }
        uscito = true;
        VN.progressed = true;
        chiudiHub();
        hideUI();
        if (h.goto) return goScene(h.goto);
        next();
      };
      if (h.conferma) return mostraModale(h.conferma, vai, null);
      vai();
    }

    // scorrimento: frecce, trascinamento col dito, e frecce della tastiera
    el.hprev.onclick = function (ev) { if (ev && ev.stopPropagation) ev.stopPropagation(); entra(cur - 1, -1); };
    el.hnext.onclick = function (ev) { if (ev && ev.stopPropagation) ev.stopPropagation(); entra(cur + 1, 1); };

    var x0 = null;
    el.hub.ontouchstart = function (e) { x0 = e.touches && e.touches[0] ? e.touches[0].clientX : null; };
    el.hub.ontouchend = function (e) {
      if (x0 == null) return;
      if ((el.regole && el.regole.classList.contains('on')) ||
          (el.quadrowrap && el.quadrowrap.classList.contains('on'))) { x0 = null; return; }
      var t = e.changedTouches && e.changedTouches[0];
      var dx = t ? t.clientX - x0 : 0;
      x0 = null;
      if (Math.abs(dx) < 40) return;                       // sotto i 40px e' un tocco, non uno swipe
      if (e.preventDefault) e.preventDefault();            // non farlo diventare anche un click
      entra(cur + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
    };

    hubTasti = function (k) {
      if (uscito) return false;
      if (el.regole && el.regole.classList.contains('on')) return false;
      if (el.quadrowrap && el.quadrowrap.classList.contains('on')) return false;
      if (k === 'ArrowLeft') { entra(cur - 1, -1); return true; }
      if (k === 'ArrowRight') { entra(cur + 1, 1); return true; }
      return false;
    };

    el.boxwrap.classList.add('in');
    el.hub.classList.add('on');
    el.hubnav.classList.add('on');
    pending = null;
    entra(indiceIniziale(st, zones), 0);
  }

  function indiceIniziale(st, zones) {
    // "startDopo": da quale zona si apre l'hub quando una condizione e' vera.
    // Serve alla lobby dopo le previsioni: li' il contenuto nuovo e' Peter, e
    // riaprire sulla tenda manderebbe il giocatore verso una porta chiusa.
    var start = st.start;
    if (st.startDopo && condizioneOk(st.startDopo.se)) start = st.startDopo.zona;
    if (!start) return 0;
    for (var i = 0; i < zones.length; i++) if (zones[i].id === start) return i;
    return 0;
  }

  /* ---------------- UI ---------------- */
  // Chi parla. Chi parla in cuffia non ha uno sprite in scena: al suo posto
  // lampeggia l'icona dell'auricolare accanto al nome, e il box cambia colore.
  // Serve a distinguere una voce nell'auricolare da qualcuno che ti sta davvero
  // davanti.
  //
  // Due modi per chiederlo. Un personaggio che esiste SOLO come voce lo dichiara
  // nel cast (`voce: true`). Susan invece e' un personaggio vero — in S2, S3 e
  // S7 e' li' in scena — ma dal keynote in poi parla dalla regia: la' la cuffia
  // la chiede il singolo step con "incuffia": true.
  var vId = null;
  function setSpeaker(who, incuffia) {
    var c = cast(who);
    var label = c ? (c.name || who) : who;
    el.nametxt.textContent = label || '';
    el.name.classList.toggle('hidden', !label);

    if (vId) { clearInterval(vId); vId = null; }
    var frames = (c && (c.voce || incuffia) && c.icona) || null;
    el.name.classList.toggle('incuffia', !!frames);
    el.boxwrap.classList.toggle('incuffia', !!frames);
    if (!frames) return;

    var k = 0;
    var batti = function () { el.voce.src = withBase(frames[k++ % frames.length]); };
    batti();
    if (frames.length > 1 && VN.speed) vId = setInterval(batti, 520);
  }

  // Caratteri che entrano in mezza riga: il box tiene ~36 caratteri col font
  // vero, e un bottone a meta' larghezza ne tiene circa la meta' meno i suoi
  // margini. Tenuto stretto: meglio una colonna sola che un'etichetta troncata.
  var MEZZA_RIGA = 16;

  function showChoices(st) {
    el.choices.innerHTML = '';
    /* Due colonne ogni volta che le etichette ci stanno, anche con due sole
       voci: una colonna sola sprecava meta' larghezza e allungava il blocco
       verso l'alto, coprendo il personaggio. "Maschile / Femminile" occupavano
       due righe per due parole.
       Il limite e' la larghezza, non il numero di voci: mezza riga tiene ~16
       caratteri col font vero (36 per riga intera, meno il divisorio e i
       margini del bottone). Le frasi lunghe — le risposte a Susan, i pronostici
       — restano una per riga, dove hanno spazio per andare a capo invece di
       essere spezzate a meta' in una colonnina. */
    var opzioni = st.options || [];
    var lunga = opzioni.some(function (o) { return fmt(o.label).length > MEZZA_RIGA; });
    var due = st.colonne != null ? !!st.colonne : (!lunga && opzioni.length >= 2);
    el.choices.classList.toggle('due', due);
    (st.options || []).forEach(function (o) {
      var b = global.document.createElement('button');
      // "spento": la voce si vede ma non si tocca. Serve a dire perche' una
      // strada e' chiusa, invece di non mostrarla e lasciare il dubbio.
      b.className = 'ch' + (o.spento ? ' spento' : '');
      b.disabled = !!o.spento;
      b.textContent = fmt(o.label);
      b.onclick = function (ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        if (o.spento) return;
        suona('scelta');
        hideUI();
        if (o._do) return o._do();
        VN.progressed = true;
        if (st.var) {
          VN.state[st.var] = o.value;
          VN.state['__label_' + st.var] = o.say != null ? o.say : o.label;
          termSet(st.var);
        }
        // reazione al TONO della scelta, mai al contenuto del pronostico
        if (o.react) react(o.react);
        if (o.goto) return goScene(o.goto);
        next();
      };
      el.choices.appendChild(b);
    });
    el.choices.classList.add('on');
  }

  function showInput(st) {
    var max = st.max || 24;
    // Il limite lo dichiara la scena (story.json), non l'HTML: due limiti
    // diversi sullo stesso campo sono due verita' che prima o poi divergono.
    // Passarlo anche al campo fa smettere di accettare invece di tagliare zitto.
    el.ti.maxLength = max;
    var re = st.pattern ? new RegExp(st.pattern, 'g') : /[^A-Za-zÀ-ÿ0-9' ]/g;
    el.ti.value = '';
    // il suggerimento dentro al campo: quando due campi di fila arrivano con una
    // domanda sola, e' l'unica cosa che dice quale dei due si sta scrivendo
    el.ti.placeholder = fmt(st.placeholder || '');
    // Un campo opzionale (es. il cognome) lascia il bottone premibile anche
    // a vuoto: si continua senza aver scritto niente, non e' un errore.
    el.tok.disabled = !st.opzionale;
    el.ti.oninput = function () {
      tastiera();                       // un colpo di tasti, non uno per lettera
      var v = el.ti.value.replace(re, '').slice(0, max);
      el.ti.value = v;
      VN.state[st.var] = v;
      termSet(st.var);
      el.tok.disabled = !st.opzionale && v.trim().length === 0;
    };
    el.ti.onkeydown = function (e) { if (e.key === 'Enter' && !el.tok.disabled) el.tok.click(); };
    el.tok.onclick = function (ev) {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      if (el.tok.disabled) return;
      suona('invio');                   // il campo del terminale si conferma
      VN.progressed = true;
      hideUI();
      termCursorOff();
      next();
    };
    el.inputform.classList.add('on');
    suona('tastiera_intro', 0.42);      // il terminale si accende (volume -40%)
    setTimeout(function () { try { el.ti.focus(); } catch (e) {} }, 80);
  }

  /* Scelta da lista: come "choice" ma con un <select> invece dei bottoni.
     Serve quando le opzioni sono troppe per stare a schermo — i 31 modelli di
     iPhone — e su iOS apre il selettore nativo, molto piu' comodo di una
     colonna di bottoni lunga tre schermate.
     Le opzioni possono portarsi dietro una classe (`classe`) che viene messa sul
     <body> con il prefisso dichiarato in `classeCorpo`: e' cosi' che il modello
     di iPhone scelto adatta il layout, come faceva l'edizione WWDC26. */
  function showList(st) {
    var gruppi = st.gruppi || [{ opzioni: st.options || [] }];
    el.tsel.innerHTML = '';

    if (st.placeholder !== false) {
      var vuota = global.document.createElement('option');
      vuota.value = ''; vuota.textContent = st.placeholder || 'Scegli…';
      vuota.disabled = true; vuota.selected = true;
      el.tsel.appendChild(vuota);
    }
    gruppi.forEach(function (g) {
      var dove = el.tsel;
      if (g.nome) {
        dove = global.document.createElement('optgroup');
        dove.label = g.nome;
        el.tsel.appendChild(dove);
      }
      (g.opzioni || []).forEach(function (o) {
        var op = global.document.createElement('option');
        op.value = o.value;
        op.textContent = o.label;
        if (o.classe) op.dataset.classe = o.classe;
        dove.appendChild(op);
      });
    });

    el.tselok.disabled = st.placeholder !== false;
    el.tsel.onchange = function () { el.tselok.disabled = !el.tsel.value; };
    el.tselok.onclick = function (ev) {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      if (el.tselok.disabled) return;
      suona('invio');
      var scelta = el.tsel.options[el.tsel.selectedIndex];
      VN.state[st.var] = el.tsel.value;
      VN.state['__label_' + st.var] = scelta.textContent;
      if (st.classeCorpo && scelta.dataset.classe) applicaClasseCorpo(st.classeCorpo, scelta.dataset.classe);
      termSet(st.var);
      VN.progressed = true;
      hideUI();
      next();
    };
    el.listform.classList.add('on');
  }

  // Toglie le classi precedenti con lo stesso prefisso e mette quella nuova,
  // cosi' due scelte di fila non lasciano due classi addosso al body.
  function applicaClasseCorpo(prefisso, valore) {
    var b = global.document.body;
    [].slice.call(b.classList).forEach(function (c) {
      if (c.indexOf(prefisso) === 0) b.classList.remove(c);
    });
    b.classList.add(prefisso + valore);
  }

  /* ---------------- terminale del prop ---------------- */

  /* Il Mac della registrazione non e' un prop appoggiato sopra la scena: e'
     disegnato dentro il fondale (bg_macintosh). Il terminale allora deve
     incollarsi allo schermo che sta nell'immagine, e quello non si puo'
     inseguire con percentuali dello stage: il fondale e' object-fit:cover con
     object-position center top, quindi su una finestra piu' larga l'immagine
     viene ingrandita e tagliata sotto, e la stessa percentuale finisce da
     un'altra parte. Qui le coordinate si ricalcolano dalla geometria vera
     dell'immagine disegnata, cosi' il testo resta dentro il vetro del CRT su
     qualunque schermo.
     I quattro numeri sono il vetro dello schermo misurato su bg_macintosh
     (852x1846: x 252-577, y 792-1025). Il pannello lo copre tutto, fino alla
     cornice nera del tubo: rientrando anche solo di poco si vedeva spuntare la
     finestra di sistema disegnata sotto, e il CRT sembrava acceso a meta'. */
  var SCHERMO_FONDALE = { x: 0.298, y: 0.431, w: 0.377, h: 0.122 };

  function ancoraTerminale() {
    var s = el && el.screen;
    if (!s || !el.propwrap || !el.propwrap.classList.contains('fondale')) return;
    var img = el.bg;
    var nw = img && img.naturalWidth, nh = img && img.naturalHeight;
    if (!nw || !nh) return;                       // fondale non ancora decodificato
    var lw = el.stage ? el.stage.clientWidth : 0;
    var lh = el.stage ? el.stage.clientHeight : 0;
    if (!lw || !lh) return;
    var scala = Math.max(lw / nw, lh / nh);       // object-fit: cover
    var dw = nw * scala, dh = nh * scala;
    // object-position: center top, oppure center bottom quando la scena
    // chiede il fondale tagliato in alto ("basso"). Sbagliare questo ancoraggio
    // sposta il terminale di tutta l'altezza che il fondale sfora.
    var ox = (lw - dw) / 2;
    var oy = el.bg.classList.contains('basso') ? (lh - dh) : 0;
    var box = {
      left: (ox + SCHERMO_FONDALE.x * dw).toFixed(1) + 'px',
      top: (oy + SCHERMO_FONDALE.y * dh).toFixed(1) + 'px',
      width: (SCHERMO_FONDALE.w * dw).toFixed(1) + 'px',
      height: (SCHERMO_FONDALE.h * dh).toFixed(1) + 'px'
    };
    [s, el.schermata].forEach(function (n) {
      if (!n) return;
      n.style.left = box.left; n.style.top = box.top;
      n.style.width = box.width; n.style.height = box.height;
    });
    adattaTerminale();
  }

  // Il terminale si aggancia al fondale, quindi va rimisurato quando il fondale
  // cambia forma: finestra ridimensionata, rotazione, immagine appena arrivata.
  function terminaleNelFondale(dentro) {
    if (!el || !el.propwrap) return;
    el.propwrap.classList.toggle('fondale', !!dentro);
    if (!dentro) {
      if (el.screen) el.screen.style.cssText = '';
      mostraSchermata(null);
      return;
    }
    ancoraTerminale();
    if (el.bg && !el.bg.complete) el.bg.addEventListener('load', ancoraTerminale, { once: true });
  }

  /* La schermata che il Mac mostra prima del terminale. E' un'immagine dentro
     il vetro, non un fondale: prende lo stesso riquadro del terminale
     (ancoraTerminale) e si accende con apparira(), perche' quello che ha
     addosso l'<img> e' della scena di prima. */
  function mostraSchermata(id) {
    if (!el || !el.schermata) return;
    if (!id) {
      el.schermata.classList.remove('on');
      el.propwrap.classList.remove('conschermata');
      return;
    }
    el.propwrap.classList.add('conschermata');
    apparira(el.schermata, assetUrl('props', fmt(id)), el.schermata);
    el.schermata.classList.add('on');
  }

  var termRows = [];
  function buildTerminal(rows) {
    termRows = rows;
    el.screen.innerHTML = '';
    rows.forEach(function (r) {
      var d = global.document.createElement('div');
      d.className = 'frow';
      d.innerHTML = '<span class="fk">' + (r.key || '') + '</span> <span class="fv" id="tval_' +
        (r.var || r.key) + '"></span>';
      el.screen.appendChild(d);
    });
    var c = global.document.createElement('span');
    c.className = 'cur'; c.id = 'tcur'; c.textContent = ' ';
    el.screen.appendChild(c);
    osservaTerminale();
    adattaTerminale();
  }

  // Lo schermo del Mac e' un ritaglio a misura fissa dentro l'immagine del prop:
  // non puo' crescere. Aggiungendo campi al terminale il testo sfora e sparisce
  // sotto overflow:hidden, in silenzio. Qui la scritta viene rimpicciolita finche'
  // non ci sta: cosi' aggiungere una riga allo script non fa piu' sparire le altre.
  // Sotto questa altezza il riquadro non e' ancora quello vero: #propwrap prende
  // l'altezza dall'immagine del Mac, quindi finche' il PNG non e' caricato lo
  // schermo e' alto quanto il suo solo padding. Misurare li' rimpicciolirebbe il
  // testo al minimo per sempre.
  /* La riga piu' larga sta dentro?
     Non si puo' chiedere alla riga il suo scrollWidth: le righe hanno
     overflow:hidden e in quel caso il browser risponde con la larghezza gia'
     tagliata — cioe' dice sempre che ci sta. E' per questo che "MASSIMILIANO"
     usciva dallo schermo del Mac senza che la misura se ne accorgesse.
     Un Range sul contenuto della riga da' invece l'ingombro reale del testo
     disegnato, tagliato o no. */
  function larghezzaTesto(riga) {
    try {
      var r = global.document.createRange();
      r.selectNodeContents(riga);
      return r.getBoundingClientRect().width;
    } catch (e) {
      return riga.scrollWidth;
    }
  }

  function sfora(s) {
    var righe = s.children;
    for (var i = 0; i < righe.length; i++) {
      if (larghezzaTesto(righe[i]) > righe[i].clientWidth + 1) return true;
    }
    return false;
  }

  var TERM_H_MIN = 24;
  var TERM_FS_MIN = 3.2;
  function adattaTerminale() {
    var s = el && el.screen;
    if (!s || s.clientHeight < TERM_H_MIN) return;
    s.style.fontSize = '';                     // riparti dalla misura del CSS
    var fs = parseFloat(global.getComputedStyle(s).fontSize) || 10;
    // scrollHeight non scende mai sotto clientHeight: quando i due coincidono il
    // testo ci sta, e il ciclo si ferma da solo
    // Sfora sia in altezza (troppe righe) sia in larghezza: le righe sono
    // nowrap, quindi un valore lungo — "shopping" fra le categorie — usciva a
    // destra e spariva sotto overflow:hidden invece di mandare a capo.
    for (var i = 0; i < 20 && fs > TERM_FS_MIN && (s.scrollHeight > s.clientHeight || sfora(s)); i++) {
      fs = Math.max(TERM_FS_MIN, fs * 0.94);
      s.style.fontSize = fs.toFixed(2) + 'px';
    }
  }

  // Rimisura quando il riquadro cambia davvero: immagine del Mac caricata,
  // rotazione, ridimensionamento della finestra.
  var termOsservatore = null;
  function osservaTerminale() {
    if (termOsservatore || !el || !el.screen) return;
    // Il font vero e' largo quasi il doppio del monospace di ripiego: se la
    // misura viene fatta prima che sia pronto, il testo "ci sta" e poi non ci
    // sta piu'. Rimisurare a font caricato e' l'unico modo di non sbagliare.
    if (global.document.fonts && global.document.fonts.ready) {
      global.document.fonts.ready.then(function () { adattaTerminale(); adattaBadge(); });
    }
    if (typeof global.ResizeObserver === 'function') {
      termOsservatore = new global.ResizeObserver(function () { adattaTerminale(); });
      termOsservatore.observe(el.screen);
    } else {
      global.addEventListener('resize', adattaTerminale);   // ripiego
      termOsservatore = true;
    }
    global.addEventListener('resize', ancoraTerminale);
  }

  function termSet(varName) {
    var row = termRows.filter(function (r) { return r.var === varName; })[0];
    if (!row) return;
    var node = $('tval_' + varName);
    if (!node) return;
    var v = VN.state[varName];
    if (row.map) v = row.map[v] != null ? row.map[v] : v;
    v = v == null ? '' : String(v);
    node.textContent = row.upper === false ? v : v.toUpperCase();
    adattaTerminale();
  }

  function lampeggia(varName, ms) {
    var node = $('tval_' + varName);
    if (!node) return;
    node.classList.add('lampeggia');
    setTimeout(function () { node.classList.remove('lampeggia'); }, ms);
  }

  function termCursorOff() { var c = $('tcur'); if (c) c.style.display = 'none'; }

  /* Badge dell'accredito: Lucas lo consegna a fine registrazione. L'immagine e'
     un template con la mela gia' disegnata e lo spazio del nome vuoto (vedi
     docs/manifest-asset.md); il nome ci viene scritto sopra qui.
     Se il file non c'e' ancora, la cornice viene disegnata in CSS: il nome
     resta leggibile e la scena non mostra un'icona di immagine rotta. */
  function mostraBadge(st) {
    if (!el.badgewrap) return;
    suona('notifica');          // la tessera arriva: e' l'unico momento in cui
                                // una notifica ha senso nella storia
    el.badgeName.textContent = fmt(st.nome || '{NOME}');
    el.badgewrap.classList.remove('senzaimg');

    var src = st.img ? withBase(st.img) : (st.prop ? assetUrl('props', st.prop) : '');
    if (src) {
      el.badgeImg.onerror = function () { el.badgewrap.classList.add('senzaimg'); };
      // il riquadro del nome e' in percentuale sull'immagine: finche' non e'
      // caricata non ha una larghezza vera da misurare
      el.badgeImg.onload = function () { adattaBadge(); };
      apparira(el.badgeImg, src, el.badgewrap);
    } else {
      el.badgewrap.classList.add('senzaimg');
    }

    el.badgewrap.classList.add('in');
    adattaBadge();
    if (st.coriandoli) coriandoli(st.coriandoli === true ? 34 : st.coriandoli);
  }

  /* Coriandoli. Partono da dietro alla tessera e si aprono a ventaglio: ognuno
     ha direzione, distanza, giro e durata suoi, cosi' non si vede la ripetizione.
     Sono nodi usa e getta, tolti a fine corsa. */
  var CORCOLORI = ['#f2c14e', '#e8604c', '#4bb3e8', '#6fce7c', '#fff', '#c07be0'];
  function coriandoli(quanti) {
    if (!el.coriandoli || !VN.speed) return;
    el.coriandoli.innerHTML = '';
    for (var i = 0; i < quanti; i++) {
      var d = global.document.createElement('span');
      d.className = 'cor';
      var ang = caso(-Math.PI, 0);                 // verso l'alto, a ventaglio
      var dist = caso(70, 190);
      d.style.background = CORCOLORI[i % CORCOLORI.length];
      d.style.setProperty('--x', (Math.cos(ang) * dist).toFixed(0) + 'px');
      d.style.setProperty('--y', (Math.sin(ang) * dist * 0.7 + caso(90, 190)).toFixed(0) + 'px');
      d.style.setProperty('--giro', caso(-540, 540).toFixed(0) + 'deg');
      d.style.setProperty('--d', caso(1.1, 1.9).toFixed(2) + 's');
      d.style.setProperty('--rit', caso(0, 0.35).toFixed(2) + 's');
      el.coriandoli.appendChild(d);
    }
    setTimeout(function () { if (el.coriandoli) el.coriandoli.innerHTML = ''; }, 2600);
  }

  /* Il nome stampato sulla tessera: "MASSIMILIANO" col font vero e' quasi il
     doppio piu' largo che col monospace di ripiego, e usciva dai bordi del
     cartoncino. Qui si rimpicciolisce finche' non ci sta, come sul terminale
     del Mac. */
  function adattaBadge() {
    var n = el && el.badgeName;
    if (!n || !n.clientWidth) return;
    n.style.fontSize = '';
    var fs = parseFloat(global.getComputedStyle(n).fontSize) || 10;
    for (var i = 0; i < 20 && n.scrollWidth > n.clientWidth + 1 && fs > 4; i++) {
      fs = Math.max(4, fs * 0.92);
      n.style.fontSize = fs.toFixed(2) + 'px';
    }
  }

  function chiudiBadge() {
    if (el.badgewrap) el.badgewrap.classList.remove('in');
    next();
  }

  /* ---------------- asset ---------------- */
  /* ================= audio: musica di scena ed effetti =================

     Tre regole, e vengono dalle richieste dell'utente:

     1. **La musica non riparte a ogni scena.** Cambia solo quando la scena
        nuova chiede un brano diverso, e allora il vecchio sfuma mentre il
        nuovo entra. Scene diverse che condividono il brano (i quattro momenti
        dell'atto 1, la griglia e le domande) non se ne accorgono nemmeno.
     2. **Niente suono sul tocco che manda avanti il dialogo.** Un clic ogni
        due secondi per un'ora di gioco e' rumore, non feedback. Gli effetti
        stanno solo sui momenti che contano: una scelta, una risposta del quiz,
        le previsioni spedite, un pannello che si apre.
     3. **Il volume lo decide chi gioca**, e la scelta gli resta addosso: sta
        in un suo posto del browser (fl_audio), non nel salvataggio della
        partita, cosi' sopravvive anche a "ricomincia da capo".

     Su iPhone il browser non fa suonare niente finche' la persona non tocca lo
     schermo: la prima musica resta in attesa (musaAttesa) e parte al primo
     tocco vero, non a un timer. */
  var AUDIO_CHIAVE = 'fl_audio';
  // Niente cursori: musica ed effetti si accendono e si spengono, ciascuno
  // per conto suo (i cursori non rispondevano bene al tocco su telefono). I
  // due volumi restano fissi quando sono accesi — la musica e' un tappeto
  // sotto la voce, quindi resta indietro; gli effetti si sentono per davvero.
  var VOLUME_MUS = 0.21;   // -30% dal vecchio 0.3
  var VOLUME_SFX = 0.8;
  // La versione serve a far ripartire dai valori nuovi chi aveva gia' salvato
  // i suoi: senza, chi ha gia' girato i cursori vecchi si ritrova con lo
  // schema di dati sbagliato invece dei due interruttori.
  var AUDIO_VERSIONE = 3;
  var audio = { mus: true, sfx: true, v: AUDIO_VERSIONE };
  var musNodo = null, musNome = null, musFade = null, musAttesa = null;
  var audioSbloccato = false;
  var sfxCache = {}, ultimoSfx = {};

  // Senza <audio> (jsdom nei test, o un browser antico) l'audio semplicemente
  // non esiste: il gioco va avanti identico, muto.
  // In jsdom l'elemento <audio> esiste ma non sa suonare (play e pause sono
  // "not implemented" e sporcano l'uscita dei test): si riconosce dallo stesso
  // segnale che usa siDecodifica(), cioe' un browser vero.
  var CI_SONO_SUONI = typeof global.Audio === 'function'
    && typeof global.Image === 'function'
    && typeof new global.Image().decode === 'function';

  function cfgAudio() { return (VN.story && VN.story.audio) || {}; }

  function leggiAudio() {
    var st = store();
    if (!st) return;
    try {
      var d = JSON.parse(st.getItem(AUDIO_CHIAVE) || 'null');
      if (d && d.v !== AUDIO_VERSIONE) d = null;      // valori di un'altra taratura
      if (d) {
        if (typeof d.mus === 'boolean') audio.mus = d.mus;
        if (typeof d.sfx === 'boolean') audio.sfx = d.sfx;
      }
    } catch (e) {}
  }
  function salvaAudio() {
    audio.v = AUDIO_VERSIONE;
    var st = store();
    if (st) { try { st.setItem(AUDIO_CHIAVE, JSON.stringify(audio)); } catch (e) {} }
  }

  function volumeMusica() { return audio.mus ? VOLUME_MUS : 0; }

  /* Una dissolvenza vera: il volume si muove a passi piccoli. Non si usa una
     transizione CSS perche' il volume di un <audio> non e' una proprieta' CSS,
     e non si usa un solo salto perche' uno stacco secco sulla musica si sente
     come un errore. */
  function sfuma(nodo, da, a, ms, poi) {
    if (musFade && musFade.nodo === nodo) clearInterval(musFade.id);
    var passo = 50, t = 0;
    nodo.volume = Math.max(0, Math.min(1, da));
    var id = setInterval(function () {
      t += passo;
      var k = Math.min(1, t / Math.max(1, ms));
      nodo.volume = Math.max(0, Math.min(1, da + (a - da) * k));
      if (k >= 1) {
        clearInterval(id);
        if (musFade && musFade.id === id) musFade = null;
        if (poi) poi();
      }
    }, passo);
    musFade = { id: id, nodo: nodo };
  }

  function fermaMusica(ms) {
    if (!musNodo) return;
    var vecchio = musNodo;
    musNodo = null; musNome = null;
    sfuma(vecchio, vecchio.volume, 0, ms == null ? (cfgAudio().fade || {}).uscita || 900 : ms,
      function () { try { vecchio.pause(); } catch (e) {} });
  }

  /* Il brano della scena. Se e' gia' quello che sta suonando non si tocca
     niente: e' la regola 1. */
  function musicaScena(id) {
    if (!CI_SONO_SUONI) return;
    var mappa = cfgAudio().musica || {};
    var file = mappa[id];
    // Una chiave puo' portare un elenco (la corsa: musica a caso a ogni
    // apertura, invece del brano fisso di una scena) — stesso principio degli
    // effetti con piu' file, qui applicato alla musica.
    if (Array.isArray(file)) file = aCaso(file);
    if (!file) return fermaMusica();
    if (file === musNome && musNodo) return;      // stesso brano: continua

    var fade = cfgAudio().fade || {};
    var entrata = fade.entrata || 1200;
    fermaMusica(fade.uscita || 900);

    var nodo = new global.Audio(withBase('music/' + file));
    nodo.loop = true;
    nodo.preload = 'auto';
    nodo.volume = 0;
    musNodo = nodo; musNome = file;

    var parti = function () {
      if (musNodo !== nodo) return;               // scena cambiata nel frattempo
      try {
        var p = nodo.play();
        if (p && p.catch) p.catch(function () { musAttesa = parti; });
      } catch (e) {}                              // jsdom non sa suonare: non e' un errore
      sfuma(nodo, 0, volumeMusica(), entrata);
    };
    if (audioSbloccato) parti(); else musAttesa = parti;
  }

  /* Un effetto. "quale" e' una chiave di story.audio.effetti, non un nome di
     file: i file si cambiano senza toccare il codice. Se la chiave porta un
     elenco (gli applausi) se ne pesca uno a caso, cosi' la platea non applaude
     sempre nello stesso modo. */
  function suona(quale, volume) {
    if (!CI_SONO_SUONI || !audio.sfx || !audioSbloccato) return;
    var mappa = cfgAudio().effetti || {};
    var file = mappa[quale];
    if (Array.isArray(file)) {
      // varianti dello stesso suono: si pesca a caso, evitando quella appena
      // usata — due volte di fila lo stesso file si sente come un difetto
      var scelte = file.length > 1
        ? file.filter(function (f) { return f !== ultimoSfx[quale]; })
        : file;
      file = scelte[Math.floor(Math.random() * scelte.length)];
      ultimoSfx[quale] = file;
    }
    if (!file) return;
    var nodo = sfxCache[file];
    if (!nodo) {
      nodo = new global.Audio(withBase('sfx/' + file));
      nodo.preload = 'auto';
      sfxCache[file] = nodo;
    }
    try {
      nodo.currentTime = 0;
      nodo.volume = Math.max(0, Math.min(1, VOLUME_SFX * (volume == null ? 1 : volume)));
      var p = nodo.play();
      if (p && p.catch) p.catch(function () {});
    } catch (e) {}
  }

  /* Ferma un effetto gia' partito, prima che la sua registrazione naturale
     finisca da sola. Serve quando un file consegnato grezzo (piu' lungo di un
     singolo "colpo") deve chiudersi in sincronia con qualcos'altro — la
     scrittura a video di un cartello, o il tasto vero che arriva sopra
     all'accensione del terminale — invece che a tempo suo. */
  function fermaSuono(quale) {
    var mappa = cfgAudio().effetti || {};
    var file = mappa[quale];
    if (Array.isArray(file)) file = ultimoSfx[quale] || file[0];
    var nodo = file && sfxCache[file];
    if (nodo) { try { nodo.pause(); nodo.currentTime = 0; } catch (e) {} }
  }

  /* La tastiera del terminale: un colpo di tasti ogni tanto, non uno per
     lettera. Chi scrive "Lorenzo" deve sentire qualcuno che digita, non una
     mitragliatrice: si suona al massimo ogni 140 ms, alternando le due
     varianti, e a volume basso perche' e' un rumore di fondo. */
  var ultimoTasto = 0;
  function tastiera() {
    var ora = Date.now();
    if (ora - ultimoTasto < 140) return;
    ultimoTasto = ora;
    // il primo tasto vero zittisce l'accensione del terminale: sfx_typing_intro
    // dura piu' di un singolo colpo, e senza questo il tasto ci suonava sopra —
    // due suoni di tastiera insieme, non uno.
    fermaSuono('tastiera_intro');
    suona('tastiera', 0.27);   // volume -40%
  }

  /* Il primo tocco della persona sblocca l'audio: prima di quello il browser
     del telefono rifiuta qualunque riproduzione, e insistere non serve. */
  function sbloccaAudio() {
    if (audioSbloccato) return;
    audioSbloccato = true;
    if (musAttesa) { var f = musAttesa; musAttesa = null; f(); }
  }

  function aggiornaVolumi() {
    if (musNodo) {
      if (musFade) { clearInterval(musFade.id); musFade = null; }
      musNodo.volume = volumeMusica();
      if (!audio.mus) { try { musNodo.pause(); } catch (e) {} }
      else if (musNodo.paused && audioSbloccato) { try { musNodo.play(); } catch (e) {} }
    }
  }

  /* ---------------- il selettore dell'audio ----------------
     Un bottone piccolo in un angolo, e un pannello con due interruttori:
     musica ed effetti, separati perche' sono due fastidi diversi (la musica
     in ufficio, gli effetti di notte). Niente cursori — non rispondevano bene
     al tocco — e niente "silenzia tutto": con due interruttori indipendenti
     non serve un terzo bottone che fa la somma degli altri due. Il pannello
     si chiude toccando fuori, come le altre finestre del gioco, e non tocca
     la partita. */
  function aggiornaBottoneAudio() {
    if (!el.audiobtn) return;
    el.audiobtn.classList.toggle('muto', !audio.mus && !audio.sfx);
  }

  function aggiornaToggle() {
    if (el.audiomus) {
      el.audiomus.textContent = 'MUSICA: ' + (audio.mus ? 'ON' : 'OFF');
      el.audiomus.classList.toggle('off', !audio.mus);
    }
    if (el.audiosfx) {
      el.audiosfx.textContent = 'EFFETTI: ' + (audio.sfx ? 'ON' : 'OFF');
      el.audiosfx.classList.toggle('off', !audio.sfx);
    }
  }

  function apriAudio() {
    if (!el.audiowrap) return;
    suona('apri');
    el.audiowrap.classList.add('on');
    aggiornaToggle();
  }
  function chiudiAudio() {
    if (el.audiowrap) el.audiowrap.classList.remove('on');
  }

  function montaAudio() {
    leggiAudio();
    aggiornaBottoneAudio();
    if (!el.audiobtn) return;
    el.audiobtn.onclick = function (ev) {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      sbloccaAudio();
      if (el.audiowrap.classList.contains('on')) { suona('chiudi'); chiudiAudio(); }
      else apriAudio();
    };
    var partitoDentro = false;
    el.audiowrap.onpointerdown = function (ev) { partitoDentro = ev.target !== el.audiowrap; };
    el.audiowrap.onclick = function (ev) {
      if (ev.target === el.audiowrap && !partitoDentro) { suona('chiudi'); chiudiAudio(); }
      else if (ev.stopPropagation) ev.stopPropagation();
      partitoDentro = false;
    };
    if (el.audiomus) {
      el.audiomus.onclick = function (ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        audio.mus = !audio.mus;
        aggiornaVolumi(); aggiornaBottoneAudio(); aggiornaToggle(); salvaAudio();
      };
    }
    if (el.audiosfx) {
      el.audiosfx.onclick = function (ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        audio.sfx = !audio.sfx;
        aggiornaBottoneAudio(); aggiornaToggle(); salvaAudio();
        if (audio.sfx) suona('scelta');   // un colpo di prova, solo quando si riaccende
      };
    }
    if (el.audiook) {
      el.audiook.onclick = function (ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        suona('chiudi'); chiudiAudio();
      };
    }
  }

  // introspezione per le verifiche automatiche: quale brano sta suonando
  VN.audio = { suona: suona, musica: musicaScena, stato: audio,
    suonando: function () { return musNodo && !musNodo.paused ? musNome : null; },
    volume: function () { return musNodo ? musNodo.volume : 0; } };

  function withBase(rel) {
    if (!rel) return '';
    if (rel.indexOf('data:') === 0 || rel.indexOf('http') === 0) return rel;   // build single-file
    return ((VN.story.meta && VN.story.meta.assetBase) || '') + rel;
  }

  /* ---------------- immagini: mai un fotogramma sbagliato ----------------
     Un <img> a cui si cambia "src" continua a disegnare l'immagine VECCHIA
     finche' la nuova non e' decodificata. Da qui nascono tutti gli "intrusi":
     il fondale della scena di prima sotto i personaggi di quella nuova, la posa
     precedente per un fotogramma, la slide sbagliata dentro il riquadro.

     Due modi di cambiare un'immagine, e vanno tenuti distinti:

       scambia()  - l'elemento e' GIA' a schermo e cambia contenuto (una posa,
                    un'espressione, una slide). L'immagine vecchia e' ancora
                    giusta finche' non arriva la nuova, quindi si tiene: si
                    assegna il src solo quando e' pronta. Nessun buco.

       apparira() - l'elemento deve COMPARIRE, e quello che ha addosso e' roba
                    di prima che non c'entra niente. Si assegna subito ma si
                    tiene invisibile finche' non e' pronta. Nessun intruso.

     In piu' si precaricano gli asset della scena nuova mentre il buio copre, e
     quelli della scena dopo mentre si gioca: cosi' le due attese sopra, nella
     pratica, non si vedono mai. */
  var caricati = {};                 // src -> true quando e' decodificata
  var inAttesa = {};                 // src -> callback in coda
  var critici = {};                  // src che qualcuno sta aspettando adesso
  var inCorso = 0;                   // quante ne aspettiamo
  var attese = [];                   // chi aspetta che finiscano
  var ATTESA_MAX = 2500;             // oltre questo si va avanti comunque
  var TETTO_FONDALE = 8000;          // quanto si puo' aspettare un fondale al coperto

  /* C'e' davvero qualcuno che decodifica le immagini? In jsdom (i test) no: gli
     <img> non caricano mai, e aspettarli vorrebbe dire aspettare per sempre.
     La spia e' img.decode(), che i browser hanno e jsdom no — ed e' proprio la
     capacita' su cui si basa tutta questa parte, quindi senza quella non c'e'
     niente da aspettare. */
  var decodifica = null;
  function siDecodifica() {
    if (decodifica === null) {
      decodifica = typeof global.Image === 'function'
        && typeof new global.Image().decode === 'function';
    }
    return decodifica;
  }

  /* ATTENZIONE: subito dopo aver assegnato un src nuovo, img.complete risponde
     ancora per l'immagine VECCHIA (il browser avvia il caricamento dopo, non
     nella stessa riga). Chiedere solo "complete" quindi da' via libera quando
     non bisognerebbe. L'unica risposta affidabile e' currentSrc: si aggiorna
     solo quando l'immagine e' davvero quella scelta. */
  function stessoFile(a, b) {
    if (!a || !b) return false;
    var pulisci = function (u) { return String(u).replace(/^\.\//, ''); };
    a = pulisci(a); b = pulisci(b);
    return a === b || a.slice(-b.length) === b || b.slice(-a.length) === a;
  }

  function mostrata(img, src) {
    if (!img) return true;
    var voluta = src || img.getAttribute('src');
    if (!voluta) return true;
    if (!img.complete || !img.naturalWidth) return false;
    return stessoFile(img.currentSrc || img.src, voluta);
  }

  function decodificata(img) { return mostrata(img, null); }
  function pronta(src) { return !src || caricati[src] === true; }

  // Scarica una src una volta sola. "critico" = la scena non parte senza.
  function carica(src, cb, critico) {
    if (!src) return cb && cb();
    if (caricati[src] === true) return cb && cb();
    if (!siDecodifica()) { caricati[src] = true; return cb && cb(); }

    if (critico && !critici[src]) { critici[src] = true; inCorso++; }

    if (!inAttesa[src]) {
      inAttesa[src] = [];
      var img = new global.Image();
      var fine = function () {
        if (caricati[src] === true) return;
        caricati[src] = true;
        var coda = inAttesa[src] || [];
        delete inAttesa[src];
        if (critici[src]) {
          delete critici[src];
          inCorso--;
          if (inCorso <= 0) { inCorso = 0; var q = attese; attese = []; q.forEach(function (f) { f(); }); }
        }
        coda.forEach(function (f) { f(); });
      };
      img.onload = fine;
      img.onerror = fine;              // un asset mancante non deve bloccare niente
      img.src = src;
    }
    if (cb) inAttesa[src].push(cb);
  }

  function precarica(src, critico) { carica(src, null, critico); }

  /* L'elemento e' gia' a schermo: si cambia il src solo quando la nuova immagine
     e' pronta, cosi' resta la vecchia (che e' ancora quella giusta) invece di un
     buco. Se ne arriva un'altra nel frattempo, questa viene abbandonata. */
  function scambia(node, src, poi) {
    if (!node || !src) return poi && poi();
    if (node.getAttribute('src') === src) return poi && poi();
    var mio = (node.__scambio = (node.__scambio || 0) + 1);
    var metti = function () {
      if (node.__scambio !== mio) return;
      node.src = src;
      if (poi) poi();
    };
    if (!VN.speed || !siDecodifica() || pronta(src)) return metti();
    var fatto = false;
    var una = function () { if (fatto) return; fatto = true; metti(); };
    carica(src, una);
    global.setTimeout(una, ATTESA_MAX);
  }

  /* L'elemento deve comparire: il src si assegna subito (serve a chi misura),
     ma resta invisibile finche' non c'e' niente di giusto da mostrare. */
  function apparira(node, src, wrapper) {
    if (!node) return;
    var vestito = wrapper || node;
    node.src = src;
    if (!VN.speed || !siDecodifica() || mostrata(node, src)) { vestito.classList.remove('attesa'); return; }
    var mio = (node.__attesa = (node.__attesa || 0) + 1);
    var scopri = function () { if (node.__attesa === mio) vestito.classList.remove('attesa'); };
    vestito.classList.add('attesa');
    // Si aspetta il caricamento DELL'ELEMENTO, non quello del precaricatore: se
    // il server non manda header di cache, l'<img> vero rifa' la richiesta e
    // resta indietro. E' il precaricamento a rendere questa attesa quasi sempre
    // gia' finita, ma la parola definitiva ce l'ha l'elemento a schermo.
    node.addEventListener('load', scopri, { once: true });
    // Niente "dopo tot lo mostro comunque": mostrarlo comunque vuol dire
    // mostrare l'immagine di prima, che e' proprio la cosa da non fare mai. Se
    // il file non arriva l'elemento resta vuoto — la scena va avanti lo stesso,
    // e un file rotto lo intercetta gia' onerror.
    node.addEventListener('error', scopri, { once: true });
  }

  // Chiama done() quando la scena e' davvero pronta, o allo scadere del tetto.
  // Non basta la fine del precaricamento: senza header di cache l'<img> vero
  // rifa' la richiesta e resta indietro, quindi si guarda l'elemento a schermo.
  function quandoPronti(done, tetto) {
    if (!VN.speed || !siDecodifica()) return done();
    var scaduto = false, fatto = false;
    var una = function () { if (fatto) return; fatto = true; done(); };
    var pronti = function () {
      return !inCorso && (!el.bg || !el.bg.getAttribute('src') || mostrata(el.bg, bgVoluto));
    };
    var controlla = function () {
      if (fatto) return;
      if (scaduto || pronti()) return una();
      global.setTimeout(controlla, 30);
    };
    if (pronti()) return una();                     // gia' tutto in memoria: nessun ritardo
    // sveglia appena il fondale arriva, senza aspettare il giro dell'orologio
    if (el.bg && el.bg.addEventListener) el.bg.addEventListener('load', controlla, { once: true });
    global.setTimeout(function () { scaduto = true; controlla(); }, tetto || ATTESA_MAX);
    controlla();
  }

  /* Tutti gli asset che una scena mostrera'. Critici solo il fondale e il primo
     personaggio: aspettare anche i quattro fondali dell'hub vorrebbe dire tenere
     il nero per secondi. */
  function precaricaScena(sc, critico) {
    if (!sc) return;
    if (sc.bg) precarica(assetUrl('bg', sc.bg), critico !== false);
    // gli emblemi non stanno in nessuno step: li chiede il fondale
    if (sc.bg === 'palco_schermo_categorie') {
      Object.keys(EMBLEMI).forEach(function (k) { precarica(assetUrl('props', 'emblema_categoria_' + k)); });
    }
    var steps = sc.steps || [];
    for (var i = 0; i < steps.length && critico !== false; i++) {
      var st = steps[i];
      if (!st || (st.t !== 'show' && st.t !== 'io')) continue;
      var chi = st.who || st.char;
      if (chi) {
        var c = cast(chi);
        precarica(partUrl(chi, 'bodies', st.body || (c && c.defaultBody) || 'neutro')
          || assetUrl('chars', chi), true);
        precarica(partUrl(chi, 'heads', st.head || (c && c.defaultHead) || 'neutro'), true);
      }
      break;
    }
    raccogli(steps);
  }

  /* Le scene in cui si puo' finire da qui: quella dopo e quelle raggiunte da un
     "goto". Si scaricano mentre il giocatore gioca questa, senza che nessuno le
     aspetti: quando ci si arriva sono gia' in memoria. */
  function precaricaProssime(sc) {
    if (!sc || !VN.story.scenes) return;
    var viste = {};
    var metti = function (id) {
      var altra = id && VN.story.scenes[id];
      if (!altra || viste[id]) return;
      viste[id] = true;
      if (altra.bg) precarica(assetUrl('bg', altra.bg));
      raccogli((altra.steps || []).slice(0, 6));
    };
    metti(sc.next);
    cerca(sc.steps || [], metti);
  }

  function cerca(nodi, metti) {
    (nodi || []).forEach(function (n) {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) return cerca(n, metti);
      if (n.goto) metti(n.goto);
      ['steps', 'zones', 'hotspots', 'options', 'after', 'esci']
        .forEach(function (k) { if (n[k]) cerca(Array.isArray(n[k]) ? n[k] : [n[k]], metti); });
    });
  }

  function raccogli(nodi) {
    (nodi || []).forEach(function (n) {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) return raccogli(n);
      if (n.bg) precarica(assetUrl('bg', n.bg));
      // i quadri della Hall of Fame: si aprono da un tocco, quindi non c'e'
      // nessun nero a coprire l'attesa. Scaricati insieme alla zona, sono gia'
      // li' quando il giocatore ne tocca uno.
      if (n.quadro) precarica(assetUrl('bg', n.quadro));
      var chi = n.who || n.char;
      if (chi) {
        var c = cast(chi);
        precarica(partUrl(chi, 'bodies', n.body || (c && c.defaultBody) || 'neutro')
          || assetUrl('chars', chi));
        precarica(partUrl(chi, 'heads', n.head || (c && c.defaultHead) || 'neutro'));
      }
      ['steps', 'zones', 'hotspots', 'after', 'options', 'tutorial', 'ritorno', 'react']
        .forEach(function (k) { if (n[k]) raccogli(Array.isArray(n[k]) ? n[k] : [n[k]]); });
    });
  }

  function assetUrl(kind, id) {
    var a = VN.story.assets && VN.story.assets[kind] && VN.story.assets[kind][id];
    return a ? withBase(a) : '';
  }

  // Cambio fondale. Con "dissolvenza" il nuovo entra sopra il vecchio e prende
  // il suo posto a transizione finita, cosi' il passaggio non e' uno stacco secco.
  var bgCorrente = null;
  var bgVoluto = null;      // il file che il fondale DEVE mostrare adesso
  /* Dissolvenza al nero. Serve a coprire un cambio di scena: il motore va
     avanti solo quando il buio e' pieno, quindi fondale e personaggio nuovi
     vengono montati mentre non si vede niente. In modalita' test (speed 0)
     e' istantanea. */
  /* Un cartello a schermo pieno (sigla, caricamento, titolo) arriva spesso dopo
     una dissolvenza al nero — i titoli di coda vengono proprio da li'. Il velo
     #nero pero' sta SOPRA il cartello, quindi lo coprirebbe: il testo c'e' nel
     DOM ma lo schermo resta nero e sembra che non succeda niente. Toglierlo non
     si vede, perche' il cartello e' nero a sua volta. */
  function scopriCartello() {
    if (el.nero) el.nero.classList.remove('on', 'sfuma');
  }

  function velaNero(giu, ms, done) {
    if (!el.nero) return done();
    var d = ms == null ? 1000 : ms;
    if (!VN.speed) { el.nero.classList.toggle('on', !!giu); return done(); }
    el.nero.style.setProperty('--nero', d + 'ms');
    el.nero.classList.add('sfuma');
    void el.nero.offsetWidth;
    el.nero.classList.toggle('on', !!giu);
    // A buio pieno si sgombra: box del dialogo, testo e personaggio via
    // *senza* animazione. Senza questo, quando la luce tornava si vedeva per
    // mezzo secondo il personaggio della scena precedente che sfumava e la sua
    // ultima battuta ancora a schermo — Lucas che ricompariva nella lobby.
    setTimeout(function () { if (giu) sgombra(); done(); }, d);
  }

  /* Azzera l'inquadratura senza animazioni: si usa quando il cambio e' coperto
     (dissolvenza al nero, cambio di scena). Le animazioni qui sarebbero visibili
     appena si riapre, ed e' esattamente quello che non deve succedere. */
  function sgombra() {
    // Il box ha una transizione di mezzo secondo sull'opacita': togliergli "in"
    // e basta lo lascia sfumare *dopo*, cioe' mentre la luce torna. Va spento
    // di netto, con la transizione disattivata per un giro.
    el.boxwrap.style.transition = 'none';
    el.boxwrap.classList.remove('in', 'sistema', 'muto');
    void el.boxwrap.offsetWidth;
    el.boxwrap.style.transition = '';

    el.txt.textContent = '';
    el.arrow.style.opacity = 0;
    el.name.classList.add('hidden');
    hideUI();

    // Stessa cosa per il personaggio, con in piu' che "out" e' un @keyframes
    // che parte da opacity:1: aggiungerlo a uno gia' invisibile lo riaccende.
    // Qui si azzera l'animazione, non se ne mette un'altra.
    el.npc.classList.remove('in', 'pop', 'micro', 'out', 'attesa');
    el.npc.style.animation = 'none';
    el.npc.style.opacity = '0';
    current.who = null;
    if (el.badgewrap) el.badgewrap.classList.remove('in');
    if (el.coriandoli) el.coriandoli.innerHTML = '';
  }

  var BG_FADE = 1400;          // deve combaciare con #bg2.mostra nel CSS

  function setBg(id, fx, dissolvenza) {
    var src = id ? assetUrl('bg', id) : el.bg.src;

    var inDissolvenza = !!(dissolvenza && VN.speed && bgCorrente && id !== bgCorrente);
    if (inDissolvenza) {
      el.bg2.src = src;
      el.bg2.className = '';
      void el.bg2.offsetWidth;
      applicaFx(el.bg2, fx);
      el.bg2.classList.add('mostra');
      setTimeout(function () {
        el.bg.src = src;
        applicaFx(el.bg, fx);
        el.bg2.className = '';
        // gli emblemi arrivano col fondale, non prima: durante la dissolvenza
        // sotto c'e' ancora quello di prima
        emblemiPerFondale(bgCorrente);
      }, BG_FADE);
    } else {
      if (id) el.bg.src = src;
      applicaFx(el.bg, fx);
      el.bg2.className = '';
    }
    if (id) { bgCorrente = id; bgVoluto = src; }
    if (!inDissolvenza) emblemiPerFondale(bgCorrente);
    return inDissolvenza;
  }

  function applicaFx(node, fx) {
    // l'elenco dev'essere completo: una classe di fx che non viene tolta qui
    // resta addosso al fondale per tutte le scene dopo
    node.classList.remove('zoom', 'zoomlento', 'blur', 'basso');
    if (fx) String(fx).split(' ').forEach(function (f) { if (f) node.classList.add(f); });
  }

  // Atmosfera della scena: uccelli in cielo, foglie portate dalla brezza,
  // pulviscolo controluce. Ogni elemento parte con tempi e traiettorie diverse,
  // e alcuni sono gia' a meta' corsa all'apertura, cosi' non si vede "l'inizio".
  function caso(a, b) { return a + Math.random() * (b - a); }

  function atmosfera(sc) {
    sc = sc || {};
    var uccelli = sc.uccelli || 0, foglie = sc.foglie || 0, pulviscolo = sc.pulviscolo || 0;
    el.sky.innerHTML = '';
    el.sky.classList.toggle('on', !!(uccelli || foglie || pulviscolo));

    var i, e;
    for (i = 0; i < uccelli; i++) {
      e = global.document.createElement('div');
      e.className = 'bird';
      e.innerHTML =
        '<svg viewBox="0 0 64 26" aria-hidden="true"><g class="ali">' +
        '<path d="M2 6c6 .5 11 3.6 14.5 7.4 2 2.2 3.6 3.9 5.2 4.7 1.7.9 3.3.9 5 0' +
        ' 1.7-.9 3.3-2.6 5.3-4.8C35.6 9.4 40.5 6.4 46.6 6c-4.5 2.6-7.6 6-10 9.3' +
        '-1.6 2.2-3 4.2-4.7 5.5-1.3 1-2.6 1.5-4 1.5s-2.7-.5-4-1.5c-1.7-1.3-3.1-3.3' +
        '-4.7-5.5C16.8 12 13.7 8.6 9.2 6c-2.5-.1-5-.1-7.2 0z"/>' +
        '</g></svg>';
      e.style.top = caso(5, 34) + '%';
      e.style.width = caso(14, 34) + 'px';
      e.style.animationDuration = caso(24, 48) + 's';
      e.style.animationDelay = -caso(0, 46) + 's';
      var ali = e.querySelector('.ali');
      if (ali) ali.style.animationDuration = caso(1.2, 2) + 's';
      el.sky.appendChild(e);
    }

    var verdi = ['rgba(86,104,62,.62)', 'rgba(108,116,66,.6)', 'rgba(124,98,56,.58)',
                 'rgba(96,112,70,.55)', 'rgba(136,110,62,.5)'];
    for (i = 0; i < foglie; i++) {
      e = global.document.createElement('div');
      e.className = 'leaf';
      e.innerHTML = '<i></i>';
      e.style.left = caso(-4, 96) + '%';
      e.style.setProperty('--drift', caso(6, 26) + 'vw');
      var g = caso(0.5, 1.05);
      e.style.width = (9 * g) + 'px';
      e.style.height = (12 * g) + 'px';
      e.style.animationDuration = caso(16, 30) + 's';
      e.style.animationDelay = -caso(0, 28) + 's';
      var foglia = e.querySelector('i');
      foglia.style.background = verdi[i % verdi.length];
      foglia.style.animationDuration = caso(2.4, 4.6) + 's';
      foglia.style.animationDelay = -caso(0, 4) + 's';
      el.sky.appendChild(e);
    }

    for (i = 0; i < pulviscolo; i++) {
      e = global.document.createElement('div');
      e.className = 'mote';
      e.style.left = caso(2, 98) + '%';
      e.style.top = caso(52, 96) + '%';         // sale dal basso, dove batte la luce
      e.style.setProperty('--drift', caso(-6, 8) + 'vw');
      e.style.animationDuration = caso(11, 22) + 's';
      e.style.animationDelay = -caso(0, 20) + 's';
      e.style.opacity = caso(0.35, 0.9);
      el.sky.appendChild(e);
    }
  }

  /* ---------------- boot ---------------- */
  function azzeraVars(story) {
    VN.state = {};
    VN.progressed = false;
    // Copia, non riferimento: un valore composto (categorie_visitate e' un
    // oggetto) verrebbe condiviso fra la partita e story.vars, e la partita
    // nuova si ritroverebbe addosso quella di prima — scrivendo per giunta
    // dentro i dati della storia.
    Object.keys(story.vars || {}).forEach(function (k) {
      var v = story.vars[k];
      VN.state[k] = (v && typeof v === 'object') ? JSON.parse(JSON.stringify(v)) : v;
    });
  }

  /* ---------------- pannello di sviluppo ----------------
     Un menu che elenca le scene e ci salta dentro. Si apre solo aggiungendo
     ?dev all'indirizzo: dal gioco non ci si arriva, quindi un giocatore non ci
     finisce per sbaglio.

     L'elenco NON e' scritto a mano: si ricava seguendo i "next" da meta.start,
     e chi resta fuori (le scene raggiunte solo per salto) viene aggiunto in
     coda. Cosi' aggiungere una scena a story.json la fa comparire da sola,
     senza doversi ricordare di aggiornare anche questa lista. */
  function ordineScene(story) {
    var visti = {}, ordine = [], id = (story.meta && story.meta.start);
    while (id && story.scenes[id] && !visti[id]) { visti[id] = 1; ordine.push(id); id = story.scenes[id].next; }
    Object.keys(story.scenes).forEach(function (k) { if (!visti[k]) ordine.push(k); });
    return ordine;
  }

  // Chi si vede in una scena: serve solo a far riconoscere la scena a colpo
  // d'occhio nell'elenco ("ah, questa e' quella con Susan").
  function chiCiSta(story, sc) {
    var nomi = [], visto = {};
    (function scava(n) {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) return n.forEach(scava);
      var w = n.who || n.dice;
      if (typeof w === 'string' && !visto[w]) {
        visto[w] = 1;
        var c = story.cast && story.cast[w];
        nomi.push((c && c.name) || w);
      }
      Object.keys(n).forEach(function (k) { scava(n[k]); });
    })(sc.steps);
    return nomi;
  }

  // Un giocatore verosimile gia' registrato: senza questo, saltare a meta'
  // storia parte con nome vuoto, genere nullo e nessuno stile — e le scene da
  // S3 in poi non hanno niente da mostrare.
  function statoFinto(story, scelte) {
    var st = {};
    Object.keys(story.vars || {}).forEach(function (k) { st[k] = story.vars[k]; });
    st.nome = 'Tester';
    st.genere = scelte.genere;
    st.anni = scelte.anni;
    st.store = 'liberty';
    st.reparto = 'operation';
    st.device = '17 Pro';
    st.stile = scelte.stile;
    st.__ok = '';
    if (scelte.pronostici) {
      // pronostici gia' fatti: servono a S6 e S7, che senza risposte mostrano
      // un recap vuoto e uno zero secco
      var cat = (VN.banca && VN.banca.categorie) || {};
      st.picks = {};
      Object.keys(cat).forEach(function (k) {
        st.picks[k] = { core: {}, extra: {} };
        (cat[k].core || []).forEach(function (d) {
          var op = (d.opzioni || [])[0] || {};
          st.picks[k].core[d.id] = { v: op.label || '?', p: op.pt || 0 };
        });
      });
      st.locked = !!scelte.locked;
      var somma = 0;
      Object.keys(st.picks).forEach(function (k) {
        Object.keys(st.picks[k].core).forEach(function (i) { somma += st.picks[k].core[i].p || 0; });
      });
      st.punti = somma;

      // schedina chiusa: la sequenza di ritorno in lobby (Francesca che si
      // congratula) l'ha gia' vista, altrimenti saltare qui alla lobby
      // significherebbe ritoccare quella sequenza a ogni prova invece di
      // arrivare subito all'hub — dove adesso c'e' anche la zona 5, la
      // porta STAFF ONLY di Apple Campus Run, gia' raggiungibile a colpo
      // di swipe come le altre.
      if (st.locked) st.post_lobby_visto = true;

      // schedina chiusa = il quiz e' aperto: si finge anche un livello gia'
      // passato, altrimenti saltare a [S8.FINALE] mostra una banca vuota, la
      // conferma spenta e nessuna via d'uscita
      if (st.locked) {
        st.quiz_visto = true;
        var primo = Object.keys((VN.quiz && VN.quiz.livelli) || {})[0];
        if (primo) {
          var cfg = VN.quiz.livelli[primo];
          st.quiz = {};
          st.quiz[primo] = { passato: true, tentativi: 1, pool: 0, seconda: false, vinto: cfg.mult1 };
          st.mult_bank = cfg.mult1;
        }
      }
    }
    return st;
  }

  function pannelloSviluppo(story, opts) {
    var box = $('dev');
    if (!box) return goScene((story.meta && story.meta.start));
    var doc = global.document;
    var scelte = { genere: 'f', anni: 2, stile: 'showman', pronostici: false, locked: false };

    var disegna = function () {
      box.innerHTML = '';
      var h = doc.createElement('h1');
      h.textContent = 'Salto rapido';
      var sub = doc.createElement('div');
      sub.className = 'sub';
      sub.textContent = 'Solo per lo sviluppo. Scegli come deve essere il giocatore, '
        + 'poi tocca la scena da cui vuoi partire. La partita salvata viene cancellata.';
      box.appendChild(h); box.appendChild(sub);

      var gruppo = function (titolo, valori, campo) {
        var t = doc.createElement('h2'); t.textContent = titolo; box.appendChild(t);
        var r = doc.createElement('div'); r.className = 'riga';
        valori.forEach(function (v) {
          var b = doc.createElement('button');
          b.textContent = v.label;
          if (scelte[campo] === v.value) b.className = 'sel';
          b.onclick = function () { scelte[campo] = v.value; disegna(); };
          r.appendChild(b);
        });
        box.appendChild(r);
      };

      gruppo('GENERE', [{ label: 'Maschile', value: 'm' }, { label: 'Femminile', value: 'f' }], 'genere');
      gruppo('ANNI IN APPLE', [{ label: '0-2', value: 0 }, { label: '3-7', value: 1 },
        { label: '8-12', value: 2 }, { label: '12+', value: 3 }], 'anni');
      gruppo('STILE (scelto in S3)', Object.keys(story.stili || {}).map(function (k) {
        return { label: (story.stili[k].nome || k), value: k };
      }), 'stile');
      gruppo('PRONOSTICI', [{ label: 'Non ancora fatti', value: false },
        { label: 'Gia\' fatti', value: true }], 'pronostici');
      if (scelte.pronostici) {
        gruppo('SCHEDINA', [{ label: 'Aperta', value: false },
          { label: 'Chiusa (locked)', value: true }], 'locked');
      }

      var t2 = doc.createElement('h2'); t2.textContent = 'DA DOVE PARTIRE'; box.appendChild(t2);

      var via = doc.createElement('button');
      via.className = 'via';
      via.textContent = 'Dall\'inizio, come un giocatore vero';
      via.onclick = function () {
        box.classList.remove('on');
        VN.clearSave();
        VN.boot(story, unisci(opts, { dev: false, scene: null, stato: null }));
      };
      box.appendChild(via);

      ordineScene(story).forEach(function (id) {
        var sc = story.scenes[id];
        var b = doc.createElement('button');
        b.className = 'scena';
        var nome = doc.createElement('b');
        nome.textContent = sc.title || id;
        var chi = chiCiSta(story, sc);
        var note = doc.createElement('span');
        note.textContent = id + (chi.length ? '  ·  ' + chi.join(', ') : '');
        b.appendChild(nome); b.appendChild(note);
        b.onclick = function () {
          box.classList.remove('on');
          VN.clearSave();
          VN.boot(story, unisci(opts, { dev: false, scene: id, stato: statoFinto(story, scelte) }));
        };
        box.appendChild(b);
      });
    };

    disegna();
    box.classList.add('on');
  }

  function unisci(a, b) {
    var o = {};
    Object.keys(a || {}).forEach(function (k) { o[k] = a[k]; });
    Object.keys(b || {}).forEach(function (k) { o[k] = b[k]; });
    return o;
  }

  VN.boot = function (story, opts) {
    opts = opts || {};
    VN.story = story;
    current = { who: null, body: null, head: null };
    azzeraVars(story);
    // stato preconfezionato: lo passa il pannello di sviluppo per far partire
    // una scena di meta' storia con un giocatore gia' registrato
    if (opts.stato) Object.keys(opts.stato).forEach(function (k) { VN.state[k] = opts.stato[k]; });
    if (opts.speed != null) VN.speed = opts.speed;
    VN.onEnd = opts.onEnd || null;
    // la banca dei pronostici (game/domande.json): sta fuori da story.json
    // perche' e' contenuto grande e che cambia per conto suo
    if (opts.banca) VN.banca = opts.banca;
    // le 44 domande del quiz di Peter (game/quiz.json): stesso motivo della
    // banca, e' contenuto grande e cambia per conto suo
    if (opts.quiz) VN.quiz = opts.quiz;
    // indirizzo e chiave del backend (game/backend.json). Senza, la partita si
    // chiude lo stesso e resta in coda per il prossimo avvio.
    if (opts.backend) VN.backend = opts.backend;
    VN.riprovaInvio();

    el = {
      stage: $('stage'), bg: $('bg'), bg2: $('bg2'), sky: $('sky'), npc: $('npc'), npcBody: $('npcBody'), npcHead: $('npcHead'),
      curtain: $('curtain'), curtainTxt: $('curtainTxt'), curtainArrow: $('curtainArrow'),
      hint: $('hint') || { style: {} },   // la scritta "tap" e' stata tolta: stub muto
      nero: $('nero'),
      boot: $('boot'), bootbar: $('bootbar'), logo: $('logo'), logoImg: $('logoImg'),
      avatar: $('avatar'), propwrap: $('propwrap'), prop: $('prop'), screen: $('screen'),
      schermata: $('schermata'),
      boxwrap: $('boxwrap'), name: $('name'), nametxt: $('nametxt'), voce: $('voce'),
      txt: $('txt'), arrow: $('arrow'),
      choices: $('choices'), inputform: $('inputform'), ti: $('ti'), tok: $('tok'),
      listform: $('listform'), tsel: $('tsel'), tselok: $('tselok'),
      badgewrap: $('badgewrap'), badgeImg: $('badgeImg'), badgeName: $('badgeName'),
      coriandoli: $('coriandoli'),
      flash: $('flash'),
      hub: $('hub'), hubspots: $('hubspots'), hubnav: $('hubnav'),
      hprev: $('hprev'), hnext: $('hnext'), hdots: $('hdots'),
      modal: $('modal'), modaltxt: $('modaltxt'), modalbtns: $('modalbtns'),
      prlx: $('prlx'), tende: $('tende'), tendaSx: $('tendaSx'), tendaDx: $('tendaDx'),
      platea: $('platea'), plateaImg: $('plateaImg'),
      ospitewrap: $('ospitewrap'), ospite: $('ospite'), griglia: $('griglia'),
      evpropwrap: $('evpropwrap'), evprop: $('evprop'),
      monitorwrap: $('monitorwrap'), monschermi: $('monschermi'), monconferma: $('monconferma'),
      mondettaglio: $('mondettaglio'), mondietro: $('mondietro'), montesta: $('montesta'), monlista: $('monlista'),
      quizbar: $('quizbar'), qinfo: $('qinfo'), qtimer: $('qtimer'), qbar: $('qbar'), qsec: $('qsec'),
      multwrap: $('multwrap'), multrighe: $('multrighe'), multresto: $('multresto'), multok: $('multok'),
      regole: $('regole'), regtit: $('regtit'), regcorpo: $('regcorpo'), regok: $('regok'),
      quadrowrap: $('quadrowrap'), quadroImg: $('quadroImg'), quadrochiudi: $('quadrochiudi'),
      runwrap: $('runwrap'), runframe: $('runframe'), runchiudi: $('runchiudi'),
      emblemi: $('emblemi'), emblemaIphone: $('emblema-iphone'),
      emblemaWatch: $('emblema-watch'), emblemaAltro: $('emblema-altro'),
      emailwrap: $('emailwrap'), emailbox: $('emailbox'), emailtit: $('emailtit'),
      emailtesto: $('emailtesto'), emaillabel: $('emaillabel'), emailin: $('emailin'),
      emailerr: $('emailerr'), emailnota: $('emailnota'), emailprivacy: $('emailprivacy'),
      emailok: $('emailok'), emailsalta: $('emailsalta'),
      countdown: $('countdown'), cdnome: $('cdnome'), cdlabel: $('cdlabel'),
      cdtempo: $('cdtempo'), cdpunti: $('cdpunti'), cdbtn: $('cdbtn'),
      cardwrap: $('cardwrap'), cardImg: $('cardImg'), cardsalva: $('cardsalva'),
      cardchiudi: $('cardchiudi'),
      carosello: $('carosello'), carImg: $('carImg'), carta: $('carta'),
      cprev: $('cprev'), cnext: $('cnext'), cdots: $('cdots'),
      carnome: $('carnome'), cardesc: $('cardesc'), carbattuta: $('carbattuta'),
      carperk: $('carperk'), carok: $('carok'),
      audiobtn: $('audiobtn'), audiowrap: $('audiowrap'), audiomus: $('audiomus'),
      audiosfx: $('audiosfx'), audiook: $('audiook')
    };
    el.avatar.innerHTML = '';
    el.avatar.classList.remove('on', 'entra');
    if ($('badgewrap')) $('badgewrap').classList.remove('in');
    if ($('coriandoli')) $('coriandoli').innerHTML = '';
    if (el.nero) el.nero.classList.remove('on', 'sfuma');   // ripartenza pulita: mai il nero addosso
    hubTasti = null;
    chiudiHub();
    chiudiCarosello();
    chiudiGriglia();
    chiudiRecap();
    chiudiCountdown();
    chiudiQuiz();
    chiudiRegole();
    chiudiQuadro();
    chiudiCorsa();
    chiudiEmail();
    chiudiTransizioni();
    if (el.modal) el.modal.classList.remove('on');
    bgCorrente = null;

    // Il primo tocco della persona e' l'unico momento in cui il browser del
    // telefono accetta di far partire un suono: da li' in poi si puo'.
    global.document.addEventListener('pointerdown', sbloccaAudio, { once: true });
    global.document.addEventListener('keydown', sbloccaAudio, { once: true });
    montaAudio();

    el.stage.onclick = function (e) {
      if (e && e.target && e.target.closest &&
          (e.target.closest('#choices') || e.target.closest('#inputform') ||
           e.target.closest('#listform') || e.target.closest('#hubnav') ||
           e.target.closest('#hubspots') || e.target.closest('#modal') ||
           e.target.closest('#carta') || e.target.closest('#carosello') ||
           e.target.closest('#griglia') || e.target.closest('#monitorwrap') ||
           e.target.closest('#countdown') || e.target.closest('#cardwrap') ||
           e.target.closest('#multwrap') || e.target.closest('#regole') ||
           e.target.closest('#emailwrap') || e.target.closest('#quadrowrap') ||
           e.target.closest('#runwrap') || e.target.closest('#propwrap') ||
           e.target.closest('#audiowrap') || e.target.closest('#audiobtn'))) return;
      VN.step();
    };
    global.document.onkeydown = function (e) {
      // frecce: scorrono le zone dell'hub o le figure del carosello, se aperti
      var scorribile = (el.hub && el.hub.classList.contains('on'))
        || (el.carosello && el.carosello.classList.contains('on'));
      if (hubTasti && scorribile && hubTasti(e.key)) return;
      if (e.key !== ' ' && e.key !== 'Enter') return;
      if (el.inputform.classList.contains('on') || el.choices.classList.contains('on') ||
          (el.listform && el.listform.classList.contains('on')) ||
          (el.griglia && el.griglia.classList.contains('on')) ||
          (el.monitorwrap && el.monitorwrap.classList.contains('on')) ||
          (el.countdown && el.countdown.classList.contains('on')) ||
          (el.multwrap && el.multwrap.classList.contains('on')) ||
          (el.regole && el.regole.classList.contains('on')) ||
          (el.quadrowrap && el.quadrowrap.classList.contains('on')) ||
          (el.runwrap && el.runwrap.classList.contains('on')) ||
          (el.emailwrap && el.emailwrap.classList.contains('on')) ||
          (el.modal && el.modal.classList.contains('on'))) return;
      VN.step();
    };

    var start = opts.scene || (story.meta && story.meta.start) || Object.keys(story.scenes)[0];

    if (opts.dev) return pannelloSviluppo(story, opts);          // ?dev, menu di salto rapido
    if (opts.scene) { VN.clearSave(); return goScene(start); }   // ?scene=lobby, per lo sviluppo

    if (opts.resume !== false && VN.hasSave(story)) {
      var save = VN.readSave();
      // [S0B] Partita gia' chiusa: non si riprende niente, si torna al
      // countdown. La schedina e' bloccata, non c'e' piu' storia da rigiocare —
      // e da li' si arriva comunque alla lobby e al quiz.
      if (save.state && save.state.locked && story.scenes[story.meta.dopoLock || 'countdown']) {
        VN.state = save.state;
        VN.progressed = true;
        return goScene(story.meta.dopoLock || 'countdown');
      }
      el.boxwrap.classList.add('in');
      setSpeaker(null);
      var sc = story.scenes[save.scene];
      var where = (sc && sc.title) || save.scene;
      // il genere salvato serve gia' qui, per declinare "bentornato/a": le
      // variabili vengono rimesse a posto da restore(), ma la card di ripresa si
      // scrive prima. Senza questa riga usciva un asterisco a schermo.
      VN.state = save.state || VN.state;
      var resumeUI = function () {
        showChoices({
          options: [
            { label: 'Riprendi', value: 'r', _do: function () { restore(save); } },
            { label: 'Ricomincia da capo', value: 'n', _do: function () {
                // ricominciare cancella la partita: lo script chiede una conferma
                mostraModale({
                  text: 'Sicuro? Perdi tutti i progressi di questa partita.',
                  si: 'Si\', ricomincio', no: 'No, torno indietro'
                }, function () { VN.clearSave(); azzeraVars(story); goScene(start); },
                   function () { el.boxwrap.classList.add('in'); resumeUI(); });
              } }
          ]
        });
      };
      type(fmt('{g:Bentornato|Bentornata}! Eri arrivat{g:o|a} fino a "' + where + '". Vuoi riprendere da li\'?'), resumeUI);
      revealUI = resumeUI;
      return;
    }

    goScene(start);
  };

  VN.step = function () {
    if (skip()) return;
    if (pending) { var f = pending; pending = null; el.arrow.style.opacity = 0; f(); }
  };

  global.VN = VN;
})(typeof window !== 'undefined' ? window : globalThis);
