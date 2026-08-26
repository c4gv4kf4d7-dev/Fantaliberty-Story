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
     say | choice | input | avatar | show | hide | react | prop | bg | fx |
     wait | set | goto | end
*/
(function (global) {
  'use strict';

  var $ = function (id) { return global.document.getElementById(id); };

  var VN = {
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
  var current = { who: null, body: null, head: null };   // NPC in scena

  /* ---------------- testo: interpolazione ---------------- */
  // {nome} valore · {NOME} maiuscolo · {label:anni} etichetta scelta
  // {g:uno|una|neutro} variante per la variabile di genere (m|f|x)
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
      var v = VN.state[k.toLowerCase()];
      if (v == null) return m;
      return k === k.toUpperCase() && k !== k.toLowerCase() ? String(v).toUpperCase() : String(v);
    });
  }

  /* ---------------- typewriter ---------------- */
  function hideUI() {
    el.choices.classList.remove('on');
    el.inputform.classList.remove('on');
    el.picker.classList.remove('on');
    revealUI = null;
  }

  // Il testo si scrive su requestAnimationFrame invece che con setInterval:
  // un timer a 36 ms su iOS finisce fuori sincrono col refresh e "singhiozza".
  function type(line, after) {
    stopTyping();
    el.arrow.style.opacity = 0;
    hideUI();
    curLine = line; typing = true; pending = null;
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

  function stopTyping() {
    if (tId && global.cancelAnimationFrame) global.cancelAnimationFrame(tId);
    tId = null;
  }

  function skip() {
    if (!typing) return false;
    stopTyping();
    el.txt.textContent = curLine;
    typing = false;
    if (revealUI) { var r = revealUI; revealUI = null; r(); }
    else if (pending) el.arrow.style.opacity = 1;
    return true;
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
    if (st && !st.scenes[d.scene]) return false;                // scena rimossa dallo script
    if (st && d.scene === st.meta.start && !d.i) return false;
    return true;
  };

  VN.clearSave = function () {
    var s = store();
    if (s) { try { s.removeItem(SAVE_KEY); } catch (e) {} }
  };

  var VISUAL = { show: 1, hide: 1, react: 1, prop: 1, bg: 1, set: 1, avatar: 0 };

  function restore(save) {
    VN.state = save.state || VN.state;
    VN.progressed = true;
    var sc = VN.story.scenes[save.scene];
    VN.scene = sc; VN.sceneId = save.scene;
    if (sc.bg) setBg(sc.bg, sc.bgFx);
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
    VN.clearSave();
    if (typeof VN.onEnd === 'function') VN.onEnd(VN.state);
  }

  function exec(st) {
    if (!silent && (st.t === 'say' || st.t === 'choice' || st.t === 'input' || st.t === 'avatar')) VN.saveNow();

    switch (st.t) {

      case 'say':
        el.boxwrap.classList.add('in');
        setSpeaker(st.who);
        type(fmt(st.text), function () { pending = next; el.arrow.style.opacity = 1; });
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

      case 'avatar':
        el.boxwrap.classList.add('in');
        setSpeaker(st.who);
        type(fmt(st.text), function () { showPicker(st); });
        revealUI = function () { showPicker(st); };
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
        el.propwrap.classList.remove(st.show ? 'out' : 'in');
        el.propwrap.classList.add(st.show ? 'in' : 'out');
        return next();

      case 'bg':
        setBg(st.id || (VN.scene && VN.scene.bg), st.fx);
        return next();

      case 'fx':
        if (st.name === 'flash') { el.flash.classList.remove('go'); void el.flash.offsetWidth; el.flash.classList.add('go'); }
        else if (st.name === 'blur') el.bg.classList.add('blur');
        else if (st.name === 'unblur') el.bg.classList.remove('blur');
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
    var body = st.body || (c && c.defaultBody) || 'neutro';
    var head = st.head || (c && c.defaultHead) || 'neutro';
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
    if (st.height) el.npc.style.height = st.height;

    el.npc.classList.remove('out');
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
  }

  /* ---------------- avatar del giocatore (4 layer) ---------------- */
  // I layer sono file separati registrati sullo stesso rig: qui si impilano e
  // basta. Le scelte vivono in variabili avatar_<slot>, quindi il salvataggio
  // le porta con se' e l'avatar si ridisegna da solo alla ripresa.
  function avatarCfg() { return VN.story.avatar || null; }

  function avatarSrc(slot, option) {
    var a = avatarCfg();
    if (!a || !option) return '';
    var pat = a.path || 'avatar/{slot}_{option}.png';
    return withBase(pat.replace('{slot}', slot).replace('{option}', option));
  }

  function drawAvatar() {
    var a = avatarCfg();
    if (!a) return;
    el.avatar.innerHTML = '';
    var any = false;
    (a.layers || []).forEach(function (slot) {
      var opt = VN.state['avatar_' + slot];
      if (!opt) return;
      any = true;
      var img = global.document.createElement('img');
      img.className = 'alayer';
      img.dataset.slot = slot;
      img.src = avatarSrc(slot, opt);
      img.onerror = function () {   // layer non ancora disegnato: silhouette, niente icona rotta
        img.onerror = null;
        img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        img.classList.add('missing');
      };
      el.avatar.appendChild(img);
    });
    el.avatar.classList.toggle('on', any);
  }

  function showPicker(st) {
    var a = avatarCfg();
    if (!a) return next();
    var slots = a.slots || [];
    var cur = 0;

    // default: prima opzione di ogni slot, cosi' l'anteprima non e' mai vuota
    slots.forEach(function (s) {
      if (!VN.state['avatar_' + s.id]) VN.state['avatar_' + s.id] = (s.options[0] || {}).id;
    });
    drawAvatar();

    function render() {
      el.picker.innerHTML = '';

      var tabs = global.document.createElement('div');
      tabs.className = 'ptabs';
      slots.forEach(function (s, idx) {
        var b = global.document.createElement('button');
        b.className = 'ptab' + (idx === cur ? ' sel' : '');
        b.textContent = s.label || s.id;
        b.onclick = function (ev) { if (ev && ev.stopPropagation) ev.stopPropagation(); cur = idx; render(); };
        tabs.appendChild(b);
      });
      el.picker.appendChild(tabs);

      var opts = global.document.createElement('div');
      opts.className = 'popts';
      var slot = slots[cur];
      (slot.options || []).forEach(function (o) {
        var b = global.document.createElement('button');
        b.className = 'popt' + (VN.state['avatar_' + slot.id] === o.id ? ' sel' : '');
        b.textContent = o.label || o.id;
        b.dataset.slot = slot.id;
        b.dataset.option = o.id;
        b.onclick = function (ev) {
          if (ev && ev.stopPropagation) ev.stopPropagation();
          VN.state['avatar_' + slot.id] = o.id;
          drawAvatar();
          render();
        };
        opts.appendChild(b);
      });
      el.picker.appendChild(opts);

      var ok = global.document.createElement('button');
      ok.id = 'pok'; ok.className = 'ch'; ok.textContent = st.confirm || 'Sono io';
      ok.onclick = function (ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        VN.progressed = true;
        hideUI();
        next();
      };
      el.picker.appendChild(ok);
    }

    render();
    el.picker.classList.add('on');
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
    current = { who: null, body: null, head: null };
    Object.keys(story.vars || {}).forEach(function (k) { VN.state[k] = story.vars[k]; });
    if (opts.speed != null) VN.speed = opts.speed;
    VN.onEnd = opts.onEnd || null;

    el = {
      stage: $('stage'), bg: $('bg'), npc: $('npc'), npcBody: $('npcBody'), npcHead: $('npcHead'),
      avatar: $('avatar'), propwrap: $('propwrap'), prop: $('prop'), screen: $('screen'),
      boxwrap: $('boxwrap'), name: $('name'), txt: $('txt'), arrow: $('arrow'),
      choices: $('choices'), inputform: $('inputform'), ti: $('ti'), tok: $('tok'),
      picker: $('picker'), flash: $('flash')
    };
    el.avatar.innerHTML = '';
    el.avatar.classList.remove('on');

    el.stage.onclick = function (e) {
      if (e && e.target && e.target.closest &&
          (e.target.closest('#choices') || e.target.closest('#inputform') ||
           e.target.closest('#picker') || e.target.closest('#propwrap'))) return;
      VN.step();
    };
    global.document.onkeydown = function (e) {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      if (el.inputform.classList.contains('on') || el.choices.classList.contains('on') ||
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
