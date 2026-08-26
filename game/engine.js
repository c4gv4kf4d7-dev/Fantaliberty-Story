/* FantaLiberty — motore visual novel data-driven, vanilla JS.
   Nessuna dipendenza: legge game/story.json ed esegue una state machine di step.

   API pubblica:
     VN.boot(story, opts)  -> avvia il gioco
     VN.state              -> variabili correnti (debug / smoke test)
     VN.step()             -> avanza (equivale al click sullo stage)
     VN.hasSave() / VN.clearSave() / VN.saveNow()  -> salvataggio in localStorage

   Tipi di step supportati (vedi game/story.json):
     say | choice | input | show | hide | prop | bg | fx | wait | set | goto | end
*/
(function (global) {
  'use strict';

  var $ = function (id) { return global.document.getElementById(id); };

  var VN = {
    story: null,
    state: {},      // variabili di gioco (nome, genere, ...)
    scene: null,    // scena corrente
    i: 0,           // indice step nella scena
    speed: 36,      // ms per carattere
    onEnd: null
  };

  var el = {};
  var typing = false, tId = null, pending = null, curLine = '', revealUI = null;

  /* ---------------- testo: interpolazione ---------------- */
  // {nome}          -> valore variabile
  // {NOME}          -> valore variabile in MAIUSCOLO
  // {label:anni}    -> etichetta leggibile dell'opzione scelta
  // {g:uno|una|neutro} -> variante per la variabile di genere (m|f|x)
  function fmt(s) {
    if (!s) return '';
    var genderVar = (VN.story.meta && VN.story.meta.genderVar) || 'genere';
    var order = (VN.story.meta && VN.story.meta.genderOrder) || ['m', 'f', 'x'];
    s = s.replace(/\{g:([^}]*)\}/g, function (_, body) {
      var parts = body.split('|');
      var idx = order.indexOf(VN.state[genderVar]);
      if (idx < 0) idx = order.length - 1;
      return parts[Math.min(idx, parts.length - 1)] || '';
    });
    s = s.replace(/\{label:(\w+)\}/g, function (_, k) {
      var l = VN.state['__label_' + k];
      return l == null ? '' : l;
    });
    return s.replace(/\{(\w+)\}/g, function (m, k) {
      var key = k.toLowerCase();
      var v = VN.state[key];
      if (v == null) return m;
      return k === k.toUpperCase() && k !== k.toLowerCase() ? String(v).toUpperCase() : String(v);
    });
  }

  /* ---------------- typewriter ---------------- */
  function hideUI() {
    el.choices.classList.remove('on');
    el.inputform.classList.remove('on');
    revealUI = null;
  }

  function type(line, after) {
    clearInterval(tId);
    el.arrow.style.opacity = 0;
    hideUI();
    curLine = line; typing = true; pending = null;
    if (!VN.speed) { el.txt.textContent = line; typing = false; return after(); }
    var i = 0; el.txt.textContent = '';
    tId = setInterval(function () {
      el.txt.textContent = line.slice(0, ++i);
      if (i >= line.length) { clearInterval(tId); typing = false; after(); }
    }, VN.speed);
  }

  function skip() {
    if (!typing) return false;
    clearInterval(tId);
    el.txt.textContent = curLine;
    typing = false;
    if (revealUI) { var r = revealUI; revealUI = null; r(); }
    else if (pending) el.arrow.style.opacity = 1;
    return true;
  }

  /* ---------------- salvataggio (localStorage) ----------------
     Si salva a ogni step "bloccante" (say/choice/input): se il giocatore chiude
     la pagina riprende esattamente da li'. Il ripristino rigioca in silenzio i
     soli step visivi della scena (show/prop/bg/fx/set) fino al punto salvato,
     cosi' la scena si ricompone senza rimostrare battute gia' lette. */
  var SAVE_KEY = 'fl_nexus_save_v1';

  function store() {
    try { return global.localStorage; } catch (e) { return null; }   // Safari privato
  }

  // Non si salva finche' il giocatore non ha fatto la prima scelta reale: cosi'
  // chi apre la pagina e la chiude subito non si ritrova il prompt "riprendi?".
  VN.progressed = false;

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
      if (!d || !d.scene) return null;
      return d;
    } catch (e) { return null; }
  };

  VN.hasSave = function (story) {
    var d = VN.readSave();
    if (!d) return false;
    var st = story || VN.story;
    if (st && !st.scenes[d.scene]) return false;                       // scena rimossa dallo script
    if (st && d.scene === st.meta.start && !d.i) return false;         // salvataggio all'inizio: inutile
    return true;
  };

  VN.clearSave = function () {
    var s = store();
    if (s) { try { s.removeItem(SAVE_KEY); } catch (e) {} }
  };

  var VISUAL = { show: 1, hide: 1, prop: 1, bg: 1, set: 1 };   // rigiocabili in silenzio

  function restore(save) {
    VN.state = save.state || VN.state;
    VN.progressed = true;
    var sc = VN.story.scenes[save.scene];
    VN.scene = sc; VN.sceneId = save.scene;
    if (sc.bg) setBg(sc.bg, sc.bgFx);
    if (sc.terminal) { buildTerminal(sc.terminal); sc.terminal.forEach(function (r) { termSet(r.var); }); }
    var upto = Math.min(save.i || 0, (sc.steps || []).length);
    for (var k = 0; k < upto; k++) {
      var st = sc.steps[k];
      if (VISUAL[st.t]) { silent = true; VN.i = k; exec(st); silent = false; }
    }
    VN.i = upto;
    run();
  }

  /* ---------------- step runner ---------------- */
  var silent = false;   // true durante il ripristino: gli step visivi non fanno avanzare il flusso
  function next() { if (silent) return; VN.i++; run(); }

  function goScene(id) {
    var sc = VN.story.scenes[id];
    if (!sc) throw new Error('scena inesistente: ' + id);
    VN.scene = sc; VN.sceneId = id; VN.i = 0;
    if (sc.bg) setBg(sc.bg, sc.bgFx);
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
    VN.clearSave();          // storia finita: niente ripresa a meta'
    if (typeof VN.onEnd === 'function') VN.onEnd(VN.state);
  }

  function exec(st) {
    // checkpoint: si salva prima di ogni step che aspetta il giocatore
    if (!silent && (st.t === 'say' || st.t === 'choice' || st.t === 'input')) VN.saveNow();

    switch (st.t) {

      case 'say':
        el.boxwrap.classList.add('in');
        setSpeaker(st.who);
        type(fmt(st.text), function () {
          pending = next;
          el.arrow.style.opacity = 1;
        });
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

      case 'show':
        var src = assetUrl('chars', st.char);
        if (!src) {            // sprite non ancora disegnato: scena senza personaggio, niente immagine rotta
          el.char.classList.remove('in', 'pop');
          el.char.classList.add('out');
          return next();
        }
        el.char.src = src;
        el.char.classList.remove('out');
        if (st.pop) { el.char.classList.remove('in'); void el.char.offsetWidth; el.char.classList.add('pop'); }
        else { el.char.classList.remove('pop'); void el.char.offsetWidth; el.char.classList.add('in'); }
        if (st.height) el.char.style.height = st.height;
        if (st.bottom) el.char.style.bottom = st.bottom;
        if (st.right) el.char.style.right = st.right;
        return next();

      case 'hide':
        el.char.classList.remove('in', 'pop');
        el.char.classList.add('out');
        return next();

      case 'prop':
        if (st.id) el.prop.src = assetUrl('props', st.id);
        el.propwrap.classList.remove(st.show ? 'out' : 'in');
        el.propwrap.classList.add(st.show ? 'in' : 'out');
        return next();

      case 'bg':
        setBg(st.id || (VN.scene && VN.scene.bg), st.fx);
        return next();

      case 'fx':
        if (st.name === 'flash') {
          el.flash.classList.remove('go'); void el.flash.offsetWidth; el.flash.classList.add('go');
        } else if (st.name === 'blur') {
          el.bg.classList.add('blur');
        } else if (st.name === 'unblur') {
          el.bg.classList.remove('blur');
        }
        return next();

      case 'wait':
        if (!VN.speed) return next();   // speed 0 = modalita' test/skip: nessuna attesa
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
        // step sconosciuto: non blocca il flusso, lo salta
        return next();
    }
  }

  /* ---------------- UI ---------------- */
  function setSpeaker(who) {
    if (who) { el.name.textContent = who; el.name.classList.remove('hidden'); }
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
        if (st.var) {
          VN.state[st.var] = o.value;
          VN.state['__label_' + st.var] = o.say != null ? o.say : o.label;
          termSet(st.var);
        }
        if (o._do) return o._do();
        VN.progressed = true;
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

  /* ---------------- terminale del prop ---------------- */
  var termRows = [];
  function buildTerminal(rows) {
    termRows = rows;
    el.screen.innerHTML = '';
    rows.forEach(function (r) {
      var d = global.document.createElement('div');
      d.className = 'frow';
      d.id = 'trow_' + (r.var || r.key);
      d.innerHTML = '<span class="fk">' + (r.key || '') + '</span> <span class="fv" id="tval_' +
        (r.var || r.key) + '"></span>';
      el.screen.appendChild(d);
    });
    var c = global.document.createElement('span');
    c.className = 'cur'; c.id = 'tcur'; c.textContent = ' ';
    el.screen.appendChild(c);
  }

  function termSet(varName) {
    var row = termRows.filter(function (r) { return r.var === varName; })[0];
    if (!row) return;
    var node = $('tval_' + varName);
    if (!node) return;
    var v = VN.state[varName];
    if (row.map) v = row.map[v] != null ? row.map[v] : v;
    node.textContent = row.upper === false ? String(v == null ? '' : v) : String(v == null ? '' : v).toUpperCase();
  }

  function termCursorOff() { var c = $('tcur'); if (c) c.style.display = 'none'; }

  /* ---------------- asset ---------------- */
  function assetUrl(kind, id) {
    var a = (VN.story.assets && VN.story.assets[kind] && VN.story.assets[kind][id]);
    if (!a) return '';
    // build single-file: gli asset possono essere gia' data: URI
    if (a.indexOf('data:') === 0 || a.indexOf('http') === 0) return a;
    return ((VN.story.meta && VN.story.meta.assetBase) || '') + a;
  }

  function setBg(id, fx) {
    if (id) el.bg.src = assetUrl('bg', id);
    el.bg.classList.remove('zoom', 'blur');
    if (fx) String(fx).split(' ').forEach(function (f) { if (f) el.bg.classList.add(f); });
  }

  /* ---------------- boot ---------------- */
  VN.boot = function (story, opts) {
    opts = opts || {};
    VN.story = story;
    VN.state = {};
    VN.progressed = false;
    Object.keys(story.vars || {}).forEach(function (k) { VN.state[k] = story.vars[k]; });
    if (opts.speed != null) VN.speed = opts.speed;
    if (opts.onEnd) VN.onEnd = opts.onEnd;

    el = {
      stage: $('stage'), bg: $('bg'), char: $('char'), propwrap: $('propwrap'), prop: $('prop'),
      screen: $('screen'), boxwrap: $('boxwrap'), name: $('name'), txt: $('txt'), arrow: $('arrow'),
      choices: $('choices'), inputform: $('inputform'), ti: $('ti'), tok: $('tok'), flash: $('flash')
    };

    el.stage.onclick = function (e) {
      if (e && e.target && e.target.closest &&
          (e.target.closest('#choices') || e.target.closest('#inputform') || e.target.closest('#propwrap'))) return;
      VN.step();
    };
    global.document.addEventListener('keydown', function (e) {
      if (e.key === ' ' || e.key === 'Enter') {
        if (el.inputform.classList.contains('on') || el.choices.classList.contains('on')) return;
        VN.step();
      }
    });

    var start = opts.scene || (story.meta && story.meta.start) || Object.keys(story.scenes)[0];

    if (opts.scene) { VN.clearSave(); return goScene(start); }   // salto di scena per debug (?scene=lobby)

    if (opts.resume !== false && VN.hasSave(story)) {
      var save = VN.readSave();
      el.boxwrap.classList.add('in');
      setSpeaker(null);
      var sc = story.scenes[save.scene];
      var where = (sc && sc.title) || save.scene;
      var resumeUI = function () {
        showChoices({
          options: [
            { label: 'Riprendi', value: 'r', _do: function () { restore(save); } },
            { label: 'Ricomincia da capo', value: 'n', _do: function () { VN.clearSave(); goScene(start); } }
          ]
        });
      };
      type('Bentornat*! Avevi lasciato il gioco a "' + where + '". Vuoi riprendere da li\'?', resumeUI);
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
