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
     griglia | domande | bivio | intermezzo | recap | countdown | show | hide |
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
    engine: '14',
    story: null,
    banca: null,    // game/domande.json: domande, battute per stile, eventi, intermezzi
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

  function skip() {
    if (!typing) return false;
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

    setTimeout(accendi, nero);

    function accendi() {
    void el.logo.offsetWidth;
    el.logo.classList.add('accendi');
    setTimeout(function () {
      el.logo.classList.remove('accendi');
      el.logo.classList.add('acceso');
      setTimeout(function () {
        el.logo.classList.remove('acceso');
        el.logo.classList.add('spegni');
        setTimeout(function () { el.logo.className = ''; done(); }, uscita);
      }, fisso);
    }, accensione);
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

    // il blocco in corso e' grigio, quelli fatti sono pieni: come una barra vera
    var passo = caricamento / blocchi, n = 0;
    var avanza = setInterval(function () {
      if (n > 0) celle[n - 1].className = 'bblock full';
      if (n < blocchi) celle[n].className = 'bblock cur';
      if (++n > blocchi) clearInterval(avanza);
    }, passo);

    setTimeout(function () {
      clearInterval(avanza);
      el.boot.classList.remove('on');
      // fase 2: schermo nero e basta, con il cursore che aspetta
      var cur = global.document.createElement('div');
      cur.className = 'tline';
      cur.innerHTML = '<span class="tcur"></span>';
      el.curtainTxt.appendChild(cur);
      setTimeout(function () { el.curtainTxt.innerHTML = ''; done(); }, attesa);
    }, caricamento + 260);
  }

  /* ---------------- cartello d'apertura ----------------
     Schermo nero, righe a macchina da scrivere una dopo l'altra; al tap la scena
     si accende (il nero sfuma via e sotto c'e' gia' il fondale). */
  function typeLines(lines, done) {
    el.curtainTxt.innerHTML = '';
    el.curtainArrow.style.opacity = 0;
    var i = 0, nodi = [];

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
        var want = Math.min(line.length, Math.floor((ts - t0) / VN.speed));
        if (want !== shown) { shown = want; node.textContent = line.slice(0, shown); }
        if (shown >= line.length) {
          typing = false; tId = null;
          return setTimeout(prossima, lines[k].pausa != null ? lines[k].pausa : 420);
        }
        tId = global.requestAnimationFrame(tick);
      };
      tId = global.requestAnimationFrame(tick);
    }

    revealUI = completaTutto;
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
  function next() { if (silent) return; VN.i++; run(); }

  function goScene(id) {
    var sc = VN.story.scenes[id];
    if (!sc) throw new Error('scena inesistente: ' + id);
    chiudiHub();
    chiudiCarosello();
    chiudiGriglia();
    chiudiRecap();
    chiudiCountdown();
    chiudiTransizioni();
    if (el.modal) el.modal.classList.remove('on');
    if (!(sc.steps || []).some(function (s) { return s.t === 'title' || s.t === 'boot' || s.t === 'logo'; })) {
      el.curtain.classList.remove('on', 'lights');
    }
    // Il box del dialogo restava acceso con l'ultima battuta della scena
    // precedente finche' non ne arrivava una nuova: si vedeva la vecchia frase
    // sopra il fondale nuovo.
    if (!silent) { el.boxwrap.classList.remove('in'); el.txt.textContent = ''; el.arrow.style.opacity = 0; }
    VN.scene = sc; VN.sceneId = id; VN.i = 0;
    if (sc.bg) setBg(sc.bg, sc.bgFx, sc.dissolvenza);
    atmosfera(sc);
    if (sc.terminal) buildTerminal(sc.terminal);
    run();
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
    if (!silent && (st.t === 'say' || st.t === 'choice' || st.t === 'input' ||
                    st.t === 'list' || st.t === 'badge' ||
                    st.t === 'carosello' || st.t === 'hub' || st.t === 'griglia' ||
                    st.t === 'domande' || st.t === 'bivio' || st.t === 'intermezzo' ||
                    st.t === 'recap')) VN.saveNow();

    switch (st.t) {

      case 'say':
        el.boxwrap.classList.add('in');
        setSpeaker(st.who);
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
          ? function () { el.arrow.style.opacity = 0; setTimeout(next, st.attesa); }
          : function () { pending = next; el.arrow.style.opacity = 1; };
        el.boxwrap.classList.toggle('sistema', !!st.sistema);
        type(fmt(testoDi(st)), avanzaSay);
        revealUI = avanzaSay;
        return;

      case 'choice':
        el.boxwrap.classList.remove('sistema');
        el.boxwrap.classList.add('in');
        setSpeaker(st.who);
        type(fmt(st.text), function () { showChoices(st); });
        revealUI = function () { showChoices(st); };
        return;

      case 'input':
        el.boxwrap.classList.remove('sistema');
        el.boxwrap.classList.add('in');
        setSpeaker(st.who);
        type(fmt(st.text), function () { showInput(st); });
        revealUI = function () { showInput(st); };
        return;

      case 'list':
        el.boxwrap.classList.remove('sistema');
        el.boxwrap.classList.add('in');
        setSpeaker(st.who);
        type(fmt(st.text), function () { showList(st); });
        revealUI = function () { showList(st); };
        return;

      case 'badge':
        el.boxwrap.classList.remove('sistema');
        // Il badge compare mentre Lucas dice "ecco il tuo badge": prima si
        // aspettava che finisse di scrivere e poi un altro tap. Adesso la
        // tessera entra subito, e il tap serve solo ad andare avanti.
        el.boxwrap.classList.add('in');
        if (st.who) setSpeaker(st.who);
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
        return velaNero(true, st.ms, next);

      case 'luce':
        return velaNero(false, st.ms, next);

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

      // S6: il recap modificabile e il blocco della schedina
      case 'recap':
        return showRecap(st);

      // S7: il countdown al keynote vero, ultima schermata del gioco
      case 'countdown':
        return showCountdown(st);

      // Transizioni: al ripristino non si rigiocano (il giocatore le ha gia'
      // viste), ma il fondale che lasciano dietro va rimesso a posto.
      case 'carrellata':
        if (silent) return next();
        return carrellata(st, next);

      case 'sipario':
        if (silent) { if (st.dietro) setBg(st.dietro, st.fx); return next(); }
        return sipario(st, next);

      case 'logo':
        el.boxwrap.classList.remove('in');
        el.hint.style.opacity = 0;
        sigla(st, next);
        return;

      case 'boot':
        el.boxwrap.classList.remove('in');
        el.hint.style.opacity = 0;
        boot(st, next);
        return;

      case 'title':
        el.boxwrap.classList.remove('in');
        el.hint.style.opacity = 0;
        el.curtain.classList.remove('lights');
        el.curtain.classList.add('on');
        typeLines((st.lines || []).map(function (l) {
          return typeof l === 'string' ? { text: fmt(l) }
            : { text: fmt(l.text), small: l.small, big: l.big, pausa: l.pausa };
        }), next);
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
        // l'id passa da fmt(): cosi' una scena puo' scrivere "slide_{categoria}"
        // e far scegliere l'oggetto alla variabile
        if (st.id) el.prop.src = assetUrl('props', fmt(st.id));
        el.propwrap.style.width = st.size || '';        // la scena puo' ridimensionare il prop
        el.propwrap.style.top = st.top || '';
        el.propwrap.classList.remove(st.show ? 'out' : 'in');
        el.propwrap.classList.add(st.show ? 'in' : 'out');
        return next();

      case 'bg':
        var cambiato = setBg(st.id || (VN.scene && VN.scene.bg), st.fx, st.dissolvenza);
        if (st.uccelli != null || st.foglie != null || st.pulviscolo != null) atmosfera(st);
        // Con la dissolvenza il fondale nuovo arriva 1,4s dopo. Senza questa
        // attesa lo "show" successivo cambiava posa e faccia subito, sopra il
        // fondale vecchio: si vedeva prima lo scatto del personaggio e poi il
        // fondale. Ora i due coincidono.
        if (cambiato && VN.speed) return setTimeout(next, BG_FADE);
        return next();

      case 'fx':
        if (st.name === 'flash') { el.flash.classList.remove('go'); void el.flash.offsetWidth; el.flash.classList.add('go'); }
        else if (st.name === 'blur') el.bg.classList.add('blur');
        else if (st.name === 'unblur') el.bg.classList.remove('blur');
        else if (st.name === 'lights') {          // si accendono le luci: il nero sfuma via
          el.curtainArrow.style.opacity = 0;
          el.curtain.classList.add('lights');
          el.hint.style.opacity = '';
          var spegni = function () { el.curtain.classList.remove('on', 'lights'); };
          if (!VN.speed) spegni(); else setTimeout(spegni, 3400);
        }
        return next();

      case 'wait':
        if (!VN.speed) return next();          // speed 0 = modalita' test/skip
        return setTimeout(next, st.ms || 400);

      case 'set':
        VN.state[st.var] = st.value;
        termSet(st.var);
        // "BADGE IN STAMPA" lampeggia mentre la stampante lavora. Non blocca:
        // il lampeggio deve andare *sotto* la riga d'attesa nel box, non prima.
        if (st.lampeggia && VN.speed) lampeggia(st.var, st.lampeggia);
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
    current.who = who; current.body = body; current.head = head;

    // file dichiarato ma non ancora consegnato: si nasconde il personaggio
    // invece di lasciare l'icona di immagine rotta in mezzo alla scena
    el.npcBody.onerror = function () { el.npc.classList.add('broken'); };
    el.npc.classList.remove('broken');
    el.npcBody.src = bodySrc;
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
    el.npc.style.height = st.height || (scala === 1 ? '' : (NPC_H * scala).toFixed(1) + '%');
    el.npc.style.bottom = st.bottom || '';
    el.npc.style.right = st.right || '';
    inquadra(c, body, st);

    el.npc.style.opacity = '';
    el.npc.style.animation = '';
    el.npc.classList.remove('out', 'micro');
    if (st.pop) { el.npc.classList.remove('in'); void el.npc.offsetWidth; el.npc.classList.add('pop'); }
    else { el.npc.classList.remove('pop'); void el.npc.offsetWidth; el.npc.classList.add('in'); }
  }

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

  function inquadra(c, posa, st) {
    var v = c && c.volti && c.volti[posa];
    if (!v || st.height || st.scala != null) return;   // la scena comanda: non si tocca
    var img = el.npcBody;
    var applica = function () {
      el.npc.classList.add('fisso');       // niente transizione: il salto si vedrebbe
      var w = img.naturalWidth, h = img.naturalHeight;
      if (!w || !h) return;
      var sh = el.stage.clientHeight, sw = el.stage.clientWidth;
      if (!sh || !sw) return;
      var a = w / h;
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
    if (img.complete && img.naturalWidth) applica();
    else img.addEventListener('load', applica, { once: true });
  }

  function setHead(head) {
    var src = partUrl(current.who, 'heads', head);
    el.npcHead.onerror = function () { el.npcHead.style.visibility = 'hidden'; };
    el.npcHead.style.visibility = '';
    el.npcHead.style.display = src ? '' : 'none';   // personaggi a sprite unico: nessuna testa separata
    if (src) el.npcHead.src = src;
    current.head = head;
  }

  function react(st) {
    var level = st.level || 'micro';
    if (level === 'pose' && st.body) {
      var src = partUrl(current.who, 'bodies', st.body);
      if (src) { el.npcBody.src = src; current.body = st.body; }
      if (st.head) setHead(st.head);
      el.npc.classList.remove('pop'); void el.npc.offsetWidth; el.npc.classList.add('pop');
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

  function mostraIo(st) {
    if (st.hide) { el.avatar.classList.remove('on'); return; }
    var src = posaStile(st.posa || 'idle_palco');
    if (!src) { el.avatar.classList.remove('on'); return; }   // stile non ancora scelto
    el.avatar.innerHTML = '';
    var img = global.document.createElement('img');
    img.className = 'alayer';
    img.id = 'ioImg';
    img.src = withBase(src);
    // file dichiarato ma non consegnato: meglio nessuna figura che l'icona rotta
    img.onerror = function () { el.avatar.classList.remove('on'); };
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
    var ordine = st.ordine || Object.keys(da);
    return ordine.filter(function (k) { return da[k]; }).map(function (k) {
      var o = da[k];
      return {
        id: k,
        nome: o.nome || k,
        desc: o.desc || '',
        perk: (o.perk && o.perk.testo) || '',
        img: (o.pose && o.pose[st.posa]) || o.img || ''
      };
    });
  }

  function showCarosello(st) {
    var opts = opzioniCarosello(st);
    if (!opts.length) return next();

    var cur = -1;
    var visti = {};
    var uscito = false;

    function mostra(i, dir) {
      cur = (i + opts.length) % opts.length;
      var o = opts[cur];
      visti[o.id] = true;
      el.carImg.src = withBase(o.img);
      if (dir) {
        el.carImg.classList.remove('entraSx', 'entraDx');
        void el.carImg.offsetWidth;
        el.carImg.classList.add(dir > 0 ? 'entraSx' : 'entraDx');
      }
      el.carnome.textContent = fmt(o.nome);
      el.cardesc.textContent = fmt(o.desc);
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
     sequenza fissa, poi il bivio di Martha che puo' pescare tre facoltative dal
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
    if (!chiavi.length) return next();
    if (chiavi.every(categoriaFinita)) { chiudiGriglia(); return next(); }

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
        VN.progressed = true;
        VN.state[st.var || 'categoria'] = k;
        VN.state.pescate = null;                 // le facoltative si pescano al bivio
        chiudiGriglia();
        hideUI();
        goScene(st.goto);
      };
      el.griglia.appendChild(b);
    });

    el.boxwrap.classList.add('in');
    setSpeaker(st.who);
    el.griglia.classList.add('on');
    pending = null;
    if (st.text) typeKeep(fmt(st.text));
  }

  function chiudiGriglia() {
    if (el.griglia) { el.griglia.classList.remove('on'); el.griglia.innerHTML = ''; }
  }

  function chiudiRecap() {
    if (!el.recap) return;
    el.recap.classList.remove('on');
    el.recap.innerHTML = '';
    el.boxwrap.classList.remove('recap');
  }

  /* ---------------- il giro di una domanda [S5.DOMANDA] ----------------
     Martha introduce, il giocatore sceglie, il personaggio annuncia alla platea
     con la battuta del suo stile, e ogni tanto succede qualcosa.

     Regola d'oro dello script: la reazione della platea e' SEMPRE casuale, mai
     legata a quale opzione e' stata scelta. Se lo fosse, il gioco suggerirebbe
     le risposte e i pronostici non varrebbero piu' niente. */
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
      mostraIo({ posa: 'idle_palco' });
      setSpeaker(st.who || 'martha');
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
          segna(VN.state.categoria, tipo, d.id, o.label, o.pt != null ? o.pt : (o.val || 0));
          VN.saveNow();
          annuncia(d, o);
        };
        el.choices.appendChild(b);
      });
      el.choices.classList.add('on');
    }

    function annuncia(d, o) {
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
      platea(aCaso(VN.story.reazioni || (VN.banca && VN.banca.reazioni_platea)));
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

  function esitiMicroEvento(e) {
    var valori = e.valori || [3, 0, -3];
    return mescola(valori.slice());
  }

  function conseguenzaMicroEvento(punti) {
    if (punti > 0) return 'La platea segue il ritmo. Martha lascia correre e il keynote riparte.';
    if (punti < 0) return 'Per un secondo resta solo il ronzio delle luci. Poi Martha riapre la linea.';
    return 'La regia assorbe il colpo. Nessuno capisce se fosse previsto, e va bene cosi\'.';
  }

  function mostraEvento(e, done) {
    // l'evento personale dello stile ha una posa dedicata, i micro-eventi no
    if (e.asset && e.asset.indexOf('stili/') === 0) mostraIo({ posa: 'evento' });
    else mostraIo({ posa: 'imbarazzo' });
    // un oggetto (il clicker che si inceppa, la slide sbagliata) va nello slot
    // dei prop; un secondo personaggio (il rider) nello slot degli ospiti
    if (e.asset && e.asset.indexOf('props/') === 0) mostraPropEvento(e.asset);
    if (e.extra_asset) mostraOspite(e.extra_asset);
    platea(e.platea);

    el.boxwrap.classList.add('in');
    setSpeaker(null);
    el.name.classList.add('hidden');
    var poi = function () {
      var opzioni = e.opzioni || [];
      if (opzioni.length) return scelteEvento(e, opzioni, done);
      pending = function () {
        nascondiOspite();
        el.evpropwrap.classList.remove('on');
        if (e.martha) return battutaMartha(e.martha, done);
        done();
      };
      el.arrow.style.opacity = 1;
    };
    type(fmt(e.testo), poi);
    revealUI = poi;
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
          setSpeaker(null);
          el.name.classList.add('hidden');
          type(fmt(o.esito || conseguenzaMicroEvento(punti)), function () {
            pending = function () {
              nascondiOspite();
              el.evpropwrap.classList.remove('on');
              if (e.martha) return battutaMartha(e.martha, done);
              done();
            };
            el.arrow.style.opacity = 1;
          });
        } };
      })
    });
  }

  function battutaMartha(testo, done) {
    setSpeaker('martha');
    var poi = function () { pending = done; el.arrow.style.opacity = 1; };
    type(fmt(testo), poi);
    revealUI = poi;
  }

  // un secondo personaggio in scena solo per la durata di un evento (il rider)
  function mostraOspite(rel) {
    el.ospite.src = withBase(rel);
    el.ospite.onerror = function () { el.ospitewrap.classList.remove('on'); };
    el.ospitewrap.classList.add('on');
  }
  function nascondiOspite() { if (el.ospitewrap) el.ospitewrap.classList.remove('on'); }

  // l'oggetto di un micro-evento. Slot suo: #propwrap durante il keynote tiene
  // la slide del macroargomento attivo, e sovrascriverla la farebbe sparire per
  // tutto il resto del blocco.
  function mostraPropEvento(rel) {
    el.evprop.src = withBase(rel);
    el.evprop.onerror = function () { el.evpropwrap.classList.remove('on'); };
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
    el.plateaImg.src = src;
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
    setSpeaker(st.who || 'martha');
    var apri = function () {
      showChoices({
        options: [
          { label: st.approfondisci || 'Approfondiamo', value: 1, _do: function () {
              var pool = (cat.extra || []).map(function (d) { return d.id; });
              VN.state.pescate = mescola(pool).slice(0, cat.n_extra_da_pescare || 3);
              VN.progressed = true;
              hideUI();
              next();
            } },
          { label: st.passa || 'Passiamo al prossimo', value: 0, _do: function () {
              VN.state.pescate = [];
              VN.progressed = true;
              hideUI();
              next();
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
    setSpeaker(st.who || 'martha');
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

  // Tutte le domande della banca, indicizzate per id: al recap servono il testo
  // della domanda e le opzioni, che nelle risposte non ci sono.
  function domandaPerId(id) {
    var b = (VN.banca && VN.banca.categorie) || {};
    for (var cat in b) {
      var trovata = (b[cat].core || []).concat(b[cat].extra || [])
        .filter(function (d) { return d.id === id; })[0];
      if (trovata) return { d: trovata, cat: cat, tipo: (b[cat].core || []).indexOf(trovata) >= 0 ? 'core' : 'extra' };
    }
    return null;
  }

  /* ---------------- il recap [S6.02] ----------------
     Tutte le risposte, per macroargomento, ognuna ancora modificabile. Le
     facoltative che il giocatore ha saltato compaiono come righe vuote: si
     possono completare adesso, e se il pescaggio non era stato fatto si fa ora.
     Sotto, il bottone rosso che chiude la schedina. */
  function showRecap(st) {
    var uscito = false;

    function righe() {
      el.recap.innerHTML = '';
      var argomenti = VN.story[st.da || 'argomenti'] || {};
      Object.keys(argomenti).forEach(function (cat) {
        var c = (VN.banca && VN.banca.categorie && VN.banca.categorie[cat]) || {};
        var date = (VN.state.picks || {})[cat] || {};

        var h = global.document.createElement('div');
        h.className = 'rtit';
        h.textContent = fmt(argomenti[cat].nome || cat);
        el.recap.appendChild(h);

        (c.core || []).forEach(function (d) { riga(cat, 'core', d, (date.core || {})[d.id]); });

        // le facoltative: quelle giocate, poi i posti ancora liberi
        var giocate = Object.keys(date.extra || {});
        giocate.forEach(function (id) {
          var q = (c.extra || []).filter(function (d) { return d.id === id; })[0];
          if (q) riga(cat, 'extra', q, date.extra[id]);
        });
        var mancano = (c.n_extra_da_pescare || 0) - giocate.length;
        for (var k = 0; k < mancano; k++) vuota(cat);
      });
    }

    function riga(cat, tipo, d, risposta) {
      var b = global.document.createElement('button');
      b.className = 'rriga';
      b.innerHTML = '<span class="rq"></span><span class="rv"></span>';
      b.querySelector('.rq').textContent = fmt(d.q);
      b.querySelector('.rv').textContent = risposta ? fmt(risposta.v) : '—';
      b.onclick = function (ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        if (uscito) return;
        chiedi(cat, tipo, d);
      };
      el.recap.appendChild(b);
    }

    // Un posto ancora libero fra le facoltative: al tocco si pesca (se non era
    // gia' stato fatto) e si risponde adesso.
    function vuota(cat) {
      var b = global.document.createElement('button');
      b.className = 'rriga vuota';
      b.innerHTML = '<span class="rq"></span><span class="rv">+</span>';
      b.querySelector('.rq').textContent = fmt(st.daFare || 'Domanda facoltativa non giocata');
      b.onclick = function (ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        if (uscito) return;
        var c = (VN.banca && VN.banca.categorie && VN.banca.categorie[cat]) || {};
        var gia = Object.keys(((VN.state.picks || {})[cat] || {}).extra || {});
        var libere = (c.extra || []).filter(function (d) { return gia.indexOf(d.id) < 0; });
        if (!libere.length) return;
        chiedi(cat, 'extra', mescola(libere)[0]);
      };
      el.recap.appendChild(b);
    }

    // Rispondere di nuovo a una domanda: le stesse opzioni di prima, e il
    // punteggio si ricalcola da solo perche' e' derivato dalle risposte.
    function chiedi(cat, tipo, d) {
      el.recap.classList.remove('on');
      el.boxwrap.classList.remove('recap');
      setSpeaker(st.who);
      var apri = function () {
        el.choices.innerHTML = '';
        (d.opzioni || []).forEach(function (o) {
          var b = global.document.createElement('button');
          b.className = 'ch';
          b.textContent = fmt(o.label);
          b.onclick = function (ev) {
            if (ev && ev.stopPropagation) ev.stopPropagation();
            hideUI();
            segna(cat, tipo, d.id, o.label, o.pt != null ? o.pt : (o.val || 0));
            VN.progressed = true;
            VN.saveNow();
            apriRecap();
          };
          el.choices.appendChild(b);
        });
        el.choices.classList.add('on');
      };
      type(fmt(d.q), apri);
      revealUI = apri;
    }

    function apriRecap() {
      hideUI();
      righe();
      setSpeaker(st.who);
      el.txt.textContent = fmt(st.text || '');
      el.arrow.style.opacity = 0;
      el.boxwrap.classList.add('in', 'recap');
      el.recap.classList.add('on');
      el.blocca.textContent = fmt(st.bottone || 'BLOCCA LA SCALETTA');
      pending = null;
    }

    /* ---------------- il blocco [S6.03] ---------------- */
    el.blocca.onclick = function (ev) {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      if (uscito) return;
      mostraModale(st.lock || { text: 'Sicuro? Dopo questo, la schedina e\' chiusa.' }, function () {
        uscito = true;
        VN.state.locked = true;
        VN.state.punti = totale();
        VN.progressed = true;
        invia();                              // il POST non blocca il gioco
        el.recap.classList.remove('on');
        el.boxwrap.classList.remove('recap');
        hideUI();
        VN.saveNow();
        if (st.goto) return goScene(st.goto);
        next();
      }, null);
    };

    apriRecap();
  }

  /* ---------------- invio al server ----------------
     La schedina chiusa vale solo se arriva. Il blocco pero' e' locale e
     irreversibile: se l'invio fallisce (rete, chiave mancante) la partita resta
     in coda e si riprova al prossimo avvio, invece di perdersi.

     Il timestamp non lo mette il client: la colonna ha default now() sul
     server, come chiede lo script. */
  function payload() {
    var s = VN.state;
    return {
      nome: s.nome, genere: s.genere, store: s.store, reparto: s.reparto,
      anni: s.anni, device: s.device, stile: s.stile,
      punti: totale(), picks: s.picks || {},
      flags: { sfacciato: !!s.sfacciato, studiato: s.studiato },
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
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(corpo)
    }).then(function (r) {
      if (r.ok) return svuotaCoda();
      accoda(corpo);
    }).catch(function () { accoda(corpo); });
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

    function aggiorna() {
      var m = quando ? mancano(quando - Date.now()) : null;
      if (!m) {
        el.cdtempo.textContent = fmt(st.arrivato || 'E\' iniziato.');
        if (cId) { clearInterval(cId); cId = null; }
        return;
      }
      el.cdtempo.textContent = (m.g ? m.g + 'g ' : '') + due(m.h) + ':' + due(m.m) + ':' + due(m.s);
    }

    el.cdnome.textContent = fmt(st.titolo || '{NOME} — SCALETTA BLOCCATA');
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
      x.fillText(fmt(st.cardTitolo || 'SCALETTA BLOCCATA'), W / 2, 1650);
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

  /* ---------------- hub a zone ----------------
     La lobby dello script: quattro zone che si scorrono di lato, senza ordine
     imposto, ognuna con il suo fondale, il suo personaggio e le sue aree
     toccabili. Il fondale e il personaggio passano dai soliti setBg()/showChar():
     l'hub aggiunge solo lo scorrimento e gli hotspot.

     Il tutorial e' un vincolo dello script: l'area che porta avanti la storia
     resta disattivata finche' il giocatore non ha scorso almeno una volta —
     altrimenti entra in sala senza accorgersi che la lobby era visitabile. */
  function showHub(st) {
    var zones = (st.zones || []).filter(function (z) { return condizioneOk(z.when); });
    if (!zones.length) return next();

    var cur = -1;
    var visti = {};
    var scorso = false;                 // il giocatore ha gia' cambiato zona?
    var uscito = false;                 // l'hub ha gia' ceduto il turno: niente doppi goto

    function entra(i, dir) {
      var nuova = (i + zones.length) % zones.length;
      if (nuova === cur) return;
      if (cur >= 0) scorso = true;
      cur = nuova;
      var z = zones[cur];
      var primaVolta = !visti[z.id];
      visti[z.id] = true;

      if (z.bg) setBg(z.bg, z.bgFx);
      // Nell'hub il protagonista e' l'ambiente: il personaggio commenta da
      // bordo scena e non deve coprire quello che c'e' da toccare. Percio' qui
      // vale "scalaHub" del cast (piu' contenuta) invece di "scala".
      if (z.who) showChar(perHub(z));
      else { el.npc.classList.remove('in', 'pop'); el.npc.classList.add('out'); current.who = null; }

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
      var battuta = (!scorso && st.tutorial && st.tutorial.text) || z.say;
      var chi = (!scorso && st.tutorial && st.tutorial.who) || z.dice || z.who;
      if (battuta) {
        setSpeaker(chi);
        // gia' vista: si rimette a schermo intera, senza rifarla scrivere
        if (primaVolta) typeKeep(fmt(battuta));
        else { stopTyping(); typing = false; el.txt.textContent = fmt(battuta); }
      }
      if (!scorso && st.tutorial && st.tutorial.body) {
        showChar(perHub({ who: chi, body: st.tutorial.body }));
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
        setSpeaker(h.who || zones[cur].who);
        typeKeep(fmt(h.bloccato || 'Non ancora: prima guardati intorno.'));
        return;
      }
      if (h.react) react(h.react);
      var vai = function () {
        if (uscito) return;
        if (h.set) { VN.state[h.set.var] = h.set.value; termSet(h.set.var); }
        if (h.say) {                      // commento e basta: si resta nell'hub
          var righe = [{ who: h.who || zones[cur].who, text: h.say }].concat(h.after || []);
          var k = 0;
          var parla = function () {
            var r = righe[k++];
            setSpeaker(r.who || h.who || zones[cur].who);
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
      var t = e.changedTouches && e.changedTouches[0];
      var dx = t ? t.clientX - x0 : 0;
      x0 = null;
      if (Math.abs(dx) < 40) return;                       // sotto i 40px e' un tocco, non uno swipe
      if (e.preventDefault) e.preventDefault();            // non farlo diventare anche un click
      entra(cur + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
    };

    hubTasti = function (k) {
      if (uscito) return false;
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
    if (!st.start) return 0;
    for (var i = 0; i < zones.length; i++) if (zones[i].id === st.start) return i;
    return 0;
  }

  /* ---------------- UI ---------------- */
  // Chi parla. Un personaggio dichiarato "voce" (Martha, dalla regia) non ha uno
  // sprite in scena: al suo posto lampeggia l'icona dell'auricolare accanto al
  // nome, e il box cambia colore. Serve a distinguere una voce in cuffia da
  // qualcuno che ti sta davvero davanti.
  var vId = null;
  function setSpeaker(who) {
    var c = cast(who);
    var label = c ? (c.name || who) : who;
    el.nametxt.textContent = label || '';
    el.name.classList.toggle('hidden', !label);

    if (vId) { clearInterval(vId); vId = null; }
    var frames = (c && c.voce && c.icona) || null;
    el.name.classList.toggle('incuffia', !!frames);
    el.boxwrap.classList.toggle('incuffia', !!frames);
    if (!frames) return;

    var k = 0;
    var batti = function () { el.voce.src = withBase(frames[k++ % frames.length]); };
    batti();
    if (frames.length > 1 && VN.speed) vId = setInterval(batti, 520);
  }

  function showChoices(st) {
    el.choices.innerHTML = '';
    // Da quattro voci in su si passa a due colonne, se le etichette sono corte:
    // incolonnate tutte, l'ultima finiva fuori dallo schermo. Le frasi lunghe
    // (le risposte a Susan) restano una per riga, dove hanno spazio per andare
    // a capo.
    var lunga = (st.options || []).some(function (o) { return fmt(o.label).length > 18; });
    el.choices.classList.toggle('due', !!st.colonne || (!st.colonne && !lunga && (st.options || []).length >= 4));
    (st.options || []).forEach(function (o) {
      var b = global.document.createElement('button');
      b.className = 'ch';
      b.textContent = fmt(o.label);
      b.onclick = function (ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
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
    el.tok.disabled = true;
    el.ti.oninput = function () {
      var v = el.ti.value.replace(re, '').slice(0, max);
      el.ti.value = v;
      VN.state[st.var] = v;
      termSet(st.var);
      el.tok.disabled = v.trim().length === 0;
    };
    el.ti.onkeydown = function (e) { if (e.key === 'Enter' && !el.tok.disabled) el.tok.click(); };
    el.tok.onclick = function (ev) {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      if (el.tok.disabled) return;
      VN.progressed = true;
      hideUI();
      termCursorOff();
      next();
    };
    el.inputform.classList.add('on');
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
    el.badgeName.textContent = fmt(st.nome || '{NOME}');
    el.badgewrap.classList.remove('senzaimg');

    var src = st.img ? withBase(st.img) : (st.prop ? assetUrl('props', st.prop) : '');
    if (src) {
      el.badgeImg.onerror = function () { el.badgewrap.classList.add('senzaimg'); };
      // il riquadro del nome e' in percentuale sull'immagine: finche' non e'
      // caricata non ha una larghezza vera da misurare
      el.badgeImg.onload = function () { adattaBadge(); };
      el.badgeImg.src = src;
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
  function withBase(rel) {
    if (!rel) return '';
    if (rel.indexOf('data:') === 0 || rel.indexOf('http') === 0) return rel;   // build single-file
    return ((VN.story.meta && VN.story.meta.assetBase) || '') + rel;
  }

  function assetUrl(kind, id) {
    var a = VN.story.assets && VN.story.assets[kind] && VN.story.assets[kind][id];
    return a ? withBase(a) : '';
  }

  // Cambio fondale. Con "dissolvenza" il nuovo entra sopra il vecchio e prende
  // il suo posto a transizione finita, cosi' il passaggio non e' uno stacco secco.
  var bgCorrente = null;
  /* Dissolvenza al nero. Serve a coprire un cambio di scena: il motore va
     avanti solo quando il buio e' pieno, quindi fondale e personaggio nuovi
     vengono montati mentre non si vede niente. In modalita' test (speed 0)
     e' istantanea. */
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
    el.boxwrap.classList.remove('in', 'sistema');
    void el.boxwrap.offsetWidth;
    el.boxwrap.style.transition = '';

    el.txt.textContent = '';
    el.arrow.style.opacity = 0;
    el.name.classList.add('hidden');
    hideUI();

    // Stessa cosa per il personaggio, con in piu' che "out" e' un @keyframes
    // che parte da opacity:1: aggiungerlo a uno gia' invisibile lo riaccende.
    // Qui si azzera l'animazione, non se ne mette un'altra.
    el.npc.classList.remove('in', 'pop', 'micro', 'out');
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
      }, BG_FADE);
    } else {
      if (id) el.bg.src = src;
      applicaFx(el.bg, fx);
      el.bg2.className = '';
    }
    if (id) bgCorrente = id;
    return inDissolvenza;
  }

  function applicaFx(node, fx) {
    node.classList.remove('zoom', 'zoomlento', 'blur');
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
    Object.keys(story.vars || {}).forEach(function (k) { VN.state[k] = story.vars[k]; });
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
      recap: $('recap'), blocca: $('blocca'),
      countdown: $('countdown'), cdnome: $('cdnome'), cdlabel: $('cdlabel'),
      cdtempo: $('cdtempo'), cdpunti: $('cdpunti'), cdbtn: $('cdbtn'),
      cardwrap: $('cardwrap'), cardImg: $('cardImg'), cardsalva: $('cardsalva'),
      cardchiudi: $('cardchiudi'),
      carosello: $('carosello'), carImg: $('carImg'), carta: $('carta'),
      cprev: $('cprev'), cnext: $('cnext'), cdots: $('cdots'),
      carnome: $('carnome'), cardesc: $('cardesc'), carperk: $('carperk'), carok: $('carok')
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
    chiudiTransizioni();
    if (el.modal) el.modal.classList.remove('on');
    bgCorrente = null;

    el.stage.onclick = function (e) {
      if (e && e.target && e.target.closest &&
          (e.target.closest('#choices') || e.target.closest('#inputform') ||
           e.target.closest('#listform') || e.target.closest('#hubnav') ||
           e.target.closest('#hubspots') || e.target.closest('#modal') ||
           e.target.closest('#carta') || e.target.closest('#carosello') ||
           e.target.closest('#griglia') || e.target.closest('#recapwrap') ||
           e.target.closest('#countdown') || e.target.closest('#cardwrap') ||
           e.target.closest('#propwrap'))) return;
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
          (el.recap && el.recap.classList.contains('on')) ||
          (el.countdown && el.countdown.classList.contains('on')) ||
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
