/* FantaLiberty — motore visual novel data-driven, vanilla JS.
   Nessuna dipendenza: legge game/story.json ed esegue una state machine di step.

   Impostazione (specifiche "Visual - Character & Scenarios"):
     * iPhone portrait, baseline 390x844 pt; il terzo inferiore dello schermo e'
       area dialogo, quindi i fondali non ci mettono dettagli importanti;
     * i personaggi sono CORPO + TESTA separati (posa + espressione), con punto
       di ancoraggio del collo definito una volta per personaggio;
     * l'avatar del giocatore e' composto da 4 layer (bottom/top/scarpe/testa).

   API pubblica:
     VN.boot(story, opts)   avvia il gioco
     VN.state               variabili correnti (debug / smoke test)
     VN.step()              avanza (equivale al tap sullo schermo)
     VN.hasSave() / VN.readSave() / VN.clearSave() / VN.saveNow()

   Step supportati:
     logo | boot | title | say | choice | input | list | badge | avatar | hub |
     carosello | show | hide | react | prop | bg | fx | carrellata | sipario |
     wait | set | goto | end
*/
(function (global) {
  'use strict';

  var $ = function (id) { return global.document.getElementById(id); };

  var VN = {
    // Versione del motore. index.html controlla che sia quella che si aspetta:
    // se il browser mescola una pagina nuova con un motore vecchio preso dalla
    // cache, il gioco resta nero. Da alzare quando cambia il contratto (step
    // nuovi, id nuovi nell'HTML).
    engine: '5',
    story: null,
    state: {},      // variabili di gioco (nome, genere, avatar_*, ...)
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
    el.picker.classList.remove('on');
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
  }

  // Il testo si scrive su requestAnimationFrame invece che con setInterval:
  // un timer a 36 ms su iOS finisce fuori sincrono col refresh e "singhiozza".
  function type(line, after) {
    stopTyping();
    el.arrow.style.opacity = 0;
    hideUI();
    curLine = line; typing = true; pending = null; typeTarget = el.txt;
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

  // come type(), ma non chiude la UI aperta: serve al carosello dell'avatar,
  // che resta a schermo mentre Lucas commenta l'avatar mostrato
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

  var VISUAL = { show: 1, hide: 1, react: 1, prop: 1, bg: 1, set: 1, sipario: 1, avatar: 0 };

  function restore(save) {
    VN.state = save.state || VN.state;
    VN.progressed = true;
    var sc = VN.story.scenes[save.scene];
    VN.scene = sc; VN.sceneId = save.scene;
    if (sc.bg) setBg(sc.bg, sc.bgFx);
    atmosfera(sc);
    if (sc.terminal) { buildTerminal(sc.terminal); sc.terminal.forEach(function (r) { termSet(r.var); }); }
    drawAvatar();                                   // l'avatar vive nelle variabili: si ridisegna sempre
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
    chiudiTransizioni();
    if (el.modal) el.modal.classList.remove('on');
    if (!(sc.steps || []).some(function (s) { return s.t === 'title' || s.t === 'boot' || s.t === 'logo'; })) {
      el.curtain.classList.remove('on', 'lights');
    }
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
                    st.t === 'avatar' || st.t === 'hub')) VN.saveNow();

    switch (st.t) {

      case 'say':
        el.boxwrap.classList.add('in');
        setSpeaker(st.who);
        // revealUI duplica il completamento di type(): se il tap arriva PRIMA che
        // il typewriter finisca da solo, skip() cancella il tick in corso e la sua
        // callback (quella su type()) non parte mai. Senza questa copia, "pending"
        // restava null per sempre e il gioco si bloccava sulla riga (bug: tap
        // durante la scrittura -> game freeze). choice/input/avatar gia' se ne
        // proteggevano cosi'; a "say" mancava.
        var avanzaSay = function () { pending = next; el.arrow.style.opacity = 1; };
        type(fmt(testoDi(st)), avanzaSay);
        revealUI = avanzaSay;
        return;

      case 'choice':
        el.boxwrap.classList.add('in');
        setSpeaker(st.who);
        type(fmt(st.text), function () { showChoices(st); });
        revealUI = function () { showChoices(st); };
        return;

      case 'input':
        el.boxwrap.classList.add('in');
        setSpeaker(st.who);
        type(fmt(st.text), function () { showInput(st); });
        revealUI = function () { showInput(st); };
        return;

      case 'list':
        el.boxwrap.classList.add('in');
        setSpeaker(st.who);
        type(fmt(st.text), function () { showList(st); });
        revealUI = function () { showList(st); };
        return;

      case 'badge':
        el.boxwrap.classList.add('in');
        if (st.who) setSpeaker(st.who);
        if (st.text) type(fmt(st.text), function () { mostraBadge(st, next); });
        else mostraBadge(st, next);
        revealUI = function () { mostraBadge(st, next); };
        return;

      case 'avatar':
        el.boxwrap.classList.add('in');
        setSpeaker(st.who);
        type(fmt(st.text), function () { showPicker(st); });
        revealUI = function () { showPicker(st); };
        return;

      case 'hub':
        return showHub(st);

      case 'carosello':
        return showCarosello(st);

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
        if (st.id) el.prop.src = assetUrl('props', st.id);
        el.propwrap.style.width = st.size || '';        // la scena puo' ridimensionare il prop
        el.propwrap.style.top = st.top || '';
        el.propwrap.classList.remove(st.show ? 'out' : 'in');
        el.propwrap.classList.add(st.show ? 'in' : 'out');
        return next();

      case 'bg':
        setBg(st.id || (VN.scene && VN.scene.bg), st.fx, st.dissolvenza);
        if (st.uccelli != null || st.foglie != null || st.pulviscolo != null) atmosfera(st);
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

  /* ---------------- personaggi: corpo + testa ---------------- */
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
    // la scena puo' riposizionare il personaggio (es. quando c'e' il terminale)
    el.npc.style.height = st.height || '';
    el.npc.style.bottom = st.bottom || '';
    el.npc.style.right = st.right || '';

    el.npc.classList.remove('out', 'micro');
    if (st.pop) { el.npc.classList.remove('in'); void el.npc.offsetWidth; el.npc.classList.add('pop'); }
    else { el.npc.classList.remove('pop'); void el.npc.offsetWidth; el.npc.classList.add('in'); }
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

  /* ---------------- avatar del giocatore ----------------
     Quattro avatar gia' pronti, non componibili: il giocatore li scorre uno a
     uno e Lucas commenta ognuno. La conferma compare solo dopo che li ha visti
     tutti; da li' in poi puo' continuare a scorrere finche' non sceglie.
     La scelta vive in VN.state.avatar, quindi il salvataggio se la porta dietro
     e l'avatar si ridisegna da solo alla ripresa. */
  function avatarCfg() { return VN.story.avatar || null; }

  function avatarSrc(id) {
    var a = avatarCfg();
    if (!a || !id) return '';
    return withBase((a.path || 'avatar/avt_{id}.png').replace('{id}', id));
  }

  function avatarOption(id) {
    var a = avatarCfg();
    if (!a) return null;
    return (a.options || []).filter(function (o) { return o.id === id; })[0] || null;
  }

  function drawAvatar(id) {
    var a = avatarCfg();
    if (!a) return;
    id = id || VN.state.avatar;
    el.avatar.innerHTML = '';
    if (!id) { el.avatar.classList.remove('on'); return; }
    var img = global.document.createElement('img');
    img.className = 'alayer';
    img.id = 'avatarImg';
    img.dataset.avatar = id;
    img.src = avatarSrc(id);
    img.onerror = function () {          // avatar non ancora disegnato: sagoma, niente icona rotta
      img.onerror = null;
      img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
      img.classList.add('missing');
    };
    el.avatar.appendChild(img);
    el.avatar.classList.add('on');
  }

  function showPicker(st) {
    var a = avatarCfg();
    if (!a || !(a.options || []).length) return next();
    var opts = a.options;
    var cur = 0;
    var visti = {};

    function tuttiVisti() { return Object.keys(visti).length >= opts.length; }

    function mostra(i, dir) {
      cur = (i + opts.length) % opts.length;
      var o = opts[cur];
      visti[o.id] = true;
      VN.state.avatar = o.id;
      drawAvatar(o.id);
      var img = $('avatarImg');
      if (img && dir) { img.classList.add(dir > 0 ? 'slideL' : 'slideR'); }
      // finche' non li ha visti tutti Lucas presenta l'avatar; poi passa all'invito a scegliere
      typeKeep(fmt(tuttiVisti() ? (a.prompt || 'Scegline uno.') : (o.say || o.label || '')));
      render();
    }

    function render() {
      el.picker.innerHTML = '';

      var nav = global.document.createElement('div');
      nav.className = 'pnav';

      var prev = global.document.createElement('button');
      prev.className = 'parrow'; prev.id = 'pprev'; prev.textContent = '◀';
      prev.onclick = function (ev) { if (ev && ev.stopPropagation) ev.stopPropagation(); mostra(cur - 1, -1); };

      var dots = global.document.createElement('div');
      dots.className = 'pdots';
      opts.forEach(function (o, i) {
        var d = global.document.createElement('span');
        d.className = 'pdot' + (i === cur ? ' sel' : '') + (visti[o.id] ? ' seen' : '');
        dots.appendChild(d);
      });

      var nextb = global.document.createElement('button');
      nextb.className = 'parrow'; nextb.id = 'pnext'; nextb.textContent = '▶';
      nextb.onclick = function (ev) { if (ev && ev.stopPropagation) ev.stopPropagation(); mostra(cur + 1, 1); };

      nav.appendChild(prev); nav.appendChild(dots); nav.appendChild(nextb);
      el.picker.appendChild(nav);

      if (tuttiVisti()) {
        var ok = global.document.createElement('button');
        ok.id = 'pok'; ok.className = 'ch'; ok.textContent = st.confirm || a.confirm || 'Scelgo questo';
        ok.onclick = function (ev) {
          if (ev && ev.stopPropagation) ev.stopPropagation();
          VN.state.avatar = opts[cur].id;
          VN.state.__label_avatar = opts[cur].label || opts[cur].id;
          VN.progressed = true;
          el.avatar.classList.remove('pick');
          hideUI();
          next();
        };
        el.picker.appendChild(ok);
      }
    }

    mostra(0, 0);
    el.avatar.classList.add('pick');
    el.picker.classList.add('on');
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
      el.carperk.textContent = o.perk ? (st.etichettaPerk || 'Al quiz:') + ' ' + fmt(o.perk) : '';
      el.carperk.style.display = o.perk ? '' : 'none';
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
    el.carosello.classList.add('on');
    el.carta.classList.add('on');
    pending = null;
    mostra(indiceIniziale(st, opts), 0);
  }

  function chiudiCarosello() {
    if (!el.carosello) return;
    el.carosello.classList.remove('on');
    el.carta.classList.remove('on');
    el.boxwrap.classList.remove('carta');
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
      if (z.who) showChar(z);
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
        showChar({ who: chi, body: st.tutorial.body });
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
        b.textContent = fmt(h.label || '');
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
          setSpeaker(h.who || zones[cur].who);
          typeKeep(fmt(h.say));
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
  function setSpeaker(who) {
    var c = cast(who);
    var label = c ? (c.name || who) : who;
    if (label) { el.name.textContent = label; el.name.classList.remove('hidden'); }
    else el.name.classList.add('hidden');
  }

  function showChoices(st) {
    el.choices.innerHTML = '';
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
  var TERM_H_MIN = 24;
  var TERM_FS_MIN = 3.2;
  function adattaTerminale() {
    var s = el && el.screen;
    if (!s || s.clientHeight < TERM_H_MIN) return;
    s.style.fontSize = '';                     // riparti dalla misura del CSS
    var fs = parseFloat(global.getComputedStyle(s).fontSize) || 10;
    // scrollHeight non scende mai sotto clientHeight: quando i due coincidono il
    // testo ci sta, e il ciclo si ferma da solo
    for (var i = 0; i < 12 && s.scrollHeight > s.clientHeight && fs > TERM_FS_MIN; i++) {
      fs = Math.max(TERM_FS_MIN, fs * 0.94);
      s.style.fontSize = fs.toFixed(2) + 'px';
    }
  }

  // Rimisura quando il riquadro cambia davvero: immagine del Mac caricata,
  // rotazione, ridimensionamento della finestra.
  var termOsservatore = null;
  function osservaTerminale() {
    if (termOsservatore || !el || !el.screen) return;
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
  }

  function termCursorOff() { var c = $('tcur'); if (c) c.style.display = 'none'; }

  /* Badge dell'accredito: Lucas lo consegna a fine registrazione. L'immagine e'
     un template con la mela gia' disegnata e lo spazio del nome vuoto (vedi
     docs/manifest-asset.md); il nome ci viene scritto sopra qui.
     Se il file non c'e' ancora, la cornice viene disegnata in CSS: il nome
     resta leggibile e la scena non mostra un'icona di immagine rotta. */
  function mostraBadge(st, done) {
    if (!el.badgewrap) return done();
    el.badgeName.textContent = fmt(st.nome || '{NOME}');
    el.badgewrap.classList.remove('senzaimg');

    var src = st.img ? withBase(st.img) : (st.prop ? assetUrl('props', st.prop) : '');
    if (src) {
      el.badgeImg.onerror = function () { el.badgewrap.classList.add('senzaimg'); };
      el.badgeImg.src = src;
    } else {
      el.badgewrap.classList.add('senzaimg');
    }

    el.badgewrap.classList.add('in');
    pending = function () { el.badgewrap.classList.remove('in'); done(); };
    el.arrow.style.opacity = 1;
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
  function setBg(id, fx, dissolvenza) {
    var src = id ? assetUrl('bg', id) : el.bg.src;

    if (dissolvenza && VN.speed && bgCorrente && id !== bgCorrente) {
      el.bg2.src = src;
      el.bg2.className = '';
      void el.bg2.offsetWidth;
      applicaFx(el.bg2, fx);
      el.bg2.classList.add('mostra');
      setTimeout(function () {
        el.bg.src = src;
        applicaFx(el.bg, fx);
        el.bg2.className = '';
      }, 1400);
    } else {
      if (id) el.bg.src = src;
      applicaFx(el.bg, fx);
      el.bg2.className = '';
    }
    if (id) bgCorrente = id;
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

  VN.boot = function (story, opts) {
    opts = opts || {};
    VN.story = story;
    current = { who: null, body: null, head: null };
    azzeraVars(story);
    if (opts.speed != null) VN.speed = opts.speed;
    VN.onEnd = opts.onEnd || null;

    el = {
      stage: $('stage'), bg: $('bg'), bg2: $('bg2'), sky: $('sky'), npc: $('npc'), npcBody: $('npcBody'), npcHead: $('npcHead'),
      curtain: $('curtain'), curtainTxt: $('curtainTxt'), curtainArrow: $('curtainArrow'), hint: $('hint'),
      boot: $('boot'), bootbar: $('bootbar'), logo: $('logo'), logoImg: $('logoImg'),
      avatar: $('avatar'), propwrap: $('propwrap'), prop: $('prop'), screen: $('screen'),
      boxwrap: $('boxwrap'), name: $('name'), txt: $('txt'), arrow: $('arrow'),
      choices: $('choices'), inputform: $('inputform'), ti: $('ti'), tok: $('tok'),
      listform: $('listform'), tsel: $('tsel'), tselok: $('tselok'),
      badgewrap: $('badgewrap'), badgeImg: $('badgeImg'), badgeName: $('badgeName'),
      picker: $('picker'), flash: $('flash'),
      hub: $('hub'), hubspots: $('hubspots'), hubnav: $('hubnav'),
      hprev: $('hprev'), hnext: $('hnext'), hdots: $('hdots'),
      modal: $('modal'), modaltxt: $('modaltxt'), modalbtns: $('modalbtns'),
      prlx: $('prlx'), tende: $('tende'), tendaSx: $('tendaSx'), tendaDx: $('tendaDx'),
      carosello: $('carosello'), carImg: $('carImg'), carta: $('carta'),
      cprev: $('cprev'), cnext: $('cnext'), cdots: $('cdots'),
      carnome: $('carnome'), cardesc: $('cardesc'), carperk: $('carperk'), carok: $('carok')
    };
    el.avatar.innerHTML = '';
    el.avatar.classList.remove('on');
    if ($('badgewrap')) $('badgewrap').classList.remove('in');
    hubTasti = null;
    chiudiHub();
    chiudiCarosello();
    chiudiTransizioni();
    if (el.modal) el.modal.classList.remove('on');
    bgCorrente = null;

    el.stage.onclick = function (e) {
      if (e && e.target && e.target.closest &&
          (e.target.closest('#choices') || e.target.closest('#inputform') ||
           e.target.closest('#listform') || e.target.closest('#hubnav') ||
           e.target.closest('#hubspots') || e.target.closest('#modal') ||
           e.target.closest('#carta') || e.target.closest('#carosello') ||
           e.target.closest('#picker') || e.target.closest('#propwrap'))) return;
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
          (el.modal && el.modal.classList.contains('on')) ||
          el.picker.classList.contains('on')) return;
      VN.step();
    };

    var start = opts.scene || (story.meta && story.meta.start) || Object.keys(story.scenes)[0];

    if (opts.scene) { VN.clearSave(); return goScene(start); }   // ?scene=lobby, per lo sviluppo

    if (opts.resume !== false && VN.hasSave(story)) {
      var save = VN.readSave();
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
