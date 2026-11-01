/* Wonnect - uporabniski vmesnik (DOM). Logika je v game.js. */
(function () {
  'use strict';
  var SAVE_KEY = 'wonnect-napredek-v1';

  var el = {
    board: document.getElementById('board'),
    boardWrap: document.getElementById('board-wrap'),
    wheel: document.getElementById('wheel'),
    lines: document.getElementById('link-lines'),
    current: document.getElementById('current-word'),
    toast: document.getElementById('toast'),
    levelLabel: document.getElementById('level-label'),
    foundCount: document.getElementById('found-count'),
    bonusCount: document.getElementById('bonus-count'),
    complete: document.getElementById('level-complete'),
    completeStats: document.getElementById('complete-stats'),
    allComplete: document.getElementById('all-complete'),
    loadError: document.getElementById('load-error'),
    loadErrorMsg: document.getElementById('load-error-msg')
  };

  /* Podpis podatkov: ce se datoteke spremenijo, shranjeni najdeni besedi morda ne veljata vec. */
  function signature(letters, levels, words) {
    var s = JSON.stringify([letters, levels, words]);
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return String(h);
  }

  function freshSave(sig) { return { v: 1, sig: sig, level: 0, levels: {} }; }

  function loadSave(sig) {
    try {
      var raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return freshSave(sig);
      var data = JSON.parse(raw);
      if (!data || data.v !== 1 || typeof data.level !== 'number' || typeof data.levels !== 'object') {
        return freshSave(sig);
      }
      if (data.sig !== sig) {
        /* Podatki igre so se spremenili: ohrani polozaj stopnje, ponastavi najdbe. */
        return { v: 1, sig: sig, level: Math.min(data.level, 9999) | 0, levels: {} };
      }
      return data;
    } catch (e) {
      return freshSave(sig);
    }
  }

  function persist() {
    try { window.localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* brez shrambe */ }
  }

  var toastTimer = null;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.classList.remove('show'); }, 1400);
  }

  var state = null; /* { defs, alphabet, words, built[], save, game, sel[] } */
  var save = null;

  function buildAll(defs, alphabet, words) {
    var built = [];
    var errs = [];
    defs.forEach(function (def, i) {
      var b = Wonnect.buildLevel(def, alphabet, words, i);
      if (b.errors && b.errors.length) errs.push('Stopnja ' + (i + 1) + ': ' + b.errors.join('; '));
      else {
        b.dictionarySet = new Set(Wonnect.normalizeLetters(words));
        built.push(b);
      }
    });
    return { built: built, errors: errs };
  }

  function renderBoard(built, revealed) {
    var g = built.grid;
    el.board.style.gridTemplateColumns = 'repeat(' + g.cols + ', var(--cell-size, 40px))';
    el.board.innerHTML = '';
    var map = {};
    g.cells.forEach(function (c) { map[c.row + ',' + c.col] = c.letter; });
    for (var r = 0; r < g.rows; r++) {
      for (var c = 0; c < g.cols; c++) {
        var d = document.createElement('div');
        var letter = map[r + ',' + c];
        if (letter === undefined) {
          d.className = 'cell void';
        } else if (revealed.has(r + ',' + c)) {
          d.className = 'cell open';
          d.textContent = letter;
        } else {
          d.className = 'cell slot';
        }
        el.board.appendChild(d);
      }
    }
    sizeCells(g);
  }

  function sizeCells(g) {
    var w = el.boardWrap.clientWidth - 16;
    var h = el.boardWrap.clientHeight - 16;
    var size = Math.floor(Math.min(w / g.cols, h / g.rows, 56));
    if (size < 22) size = 22;
    el.board.style.setProperty('--cell-size', size + 'px');
  }

  var letterButtons = [];
  function renderWheel(letters) {
    el.wheel.querySelectorAll('.letter').forEach(function (b) { b.remove(); });
    el.lines.innerHTML = '';
    letterButtons = [];
    var n = letters.length;
    var radius = 38; /* odstotkov polmera */
    letters.forEach(function (ch, i) {
      var angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'letter';
      b.textContent = ch;
      b.dataset.letter = ch;
      b.style.left = (50 + radius * Math.cos(angle)) + '%';
      b.style.top = (50 + radius * Math.sin(angle)) + '%';
      el.wheel.appendChild(b);
      letterButtons.push(b);
    });
  }

  var dragging = false;
  var sel = []; /* izbrane crke (gumbi) */

  function redrawLines(pointer) {
    el.lines.innerHTML = '';
    var rect = el.wheel.getBoundingClientRect();
    var pts = sel.map(function (b) {
      var r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2 - rect.left, y: r.top + r.height / 2 - rect.top };
    });
    if (pointer && pts.length) pts.push({ x: pointer.x - rect.left, y: pointer.y - rect.top });
    for (var i = 0; i + 1 < pts.length; i++) {
      var ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      ln.setAttribute('x1', pts[i].x); ln.setAttribute('y1', pts[i].y);
      ln.setAttribute('x2', pts[i + 1].x); ln.setAttribute('y2', pts[i + 1].y);
      el.lines.appendChild(ln);
    }
  }

  function updateCurrent() {
    el.current.textContent = sel.map(function (b) { return b.dataset.letter; }).join('');
  }

  function clearSel() {
    sel.forEach(function (b) { b.classList.remove('on'); });
    sel = [];
    updateCurrent();
    redrawLines(null);
  }

  function letterAt(x, y) {
    var t = document.elementFromPoint(x, y);
    if (t && t.classList && t.classList.contains('letter')) return t;
    return null;
  }

  function onDown(e) {
    if (!state || !state.game) return;
    var b = e.target.classList && e.target.classList.contains('letter') ? e.target : letterAt(e.clientX, e.clientY);
    if (!b) return;
    dragging = true;
    try { el.wheel.setPointerCapture(e.pointerId); } catch (err) {}
    if (!sel.includes(b)) { sel.push(b); b.classList.add('on'); }
    updateCurrent();
    redrawLines({ x: e.clientX, y: e.clientY });
    e.preventDefault();
  }

  function onMove(e) {
    if (!dragging) return;
    var b = letterAt(e.clientX, e.clientY);
    if (b && !sel.includes(b)) { sel.push(b); b.classList.add('on'); updateCurrent(); }
    redrawLines({ x: e.clientX, y: e.clientY });
  }

  function onUp() {
    if (!dragging) return;
    dragging = false;
    var word = el.current.textContent;
    clearSel();
    if (word.length < 2) return;
    submit(word);
  }

  var FEEDBACK = {
    zadetek: 'Pravilno!',
    bonus: 'Dodatna beseda!',
    'ponovitev': 'Že najdena.',
    'ponovitev-bonus': 'Ta dodatna je že na seznamu.',
    neznan: 'Besede ni v slovarju.',
    crke: 'Črke ne ustrezajo.',
    kratek: 'Prekratko.'
  };

  function submit(word) {
    var res = state.game.submit(word);
    toast(FEEDBACK[res.kind] || res.kind);
    if (res.kind === 'zadetek' || res.kind === 'bonus') {
      var rec = save.levels[save.level] || (save.levels[save.level] = { found: [], bonus: [], complete: false });
      if (res.kind === 'zadetek') { if (!rec.found.includes(res.word)) rec.found.push(res.word); }
      else { if (!rec.bonus.includes(res.word)) rec.bonus.push(res.word); }
      refresh();
      persist();
      if (res.kind === 'zadetek' && state.game.isComplete()) {
        rec.complete = true;
        persist();
        var c = state.game.counts();
        el.completeStats.textContent = 'Najdenih ' + c.found + ' besed, ' + c.bonus + ' dodatnih.';
        el.complete.hidden = false;
      }
    }
  }

  function refresh() {
    renderBoard(state.built[save.level], state.game.revealedCells());
    var c = state.game.counts();
    el.foundCount.textContent = 'Besede: ' + c.found + ' / ' + c.target;
    el.bonusCount.textContent = 'Dodatne: ' + c.bonus;
    el.levelLabel.textContent = 'Stopnja ' + (save.level + 1) + ' / ' + state.built.length;
  }

  function startLevel(idx) {
    save.level = idx;
    el.complete.hidden = true;
    el.allComplete.hidden = true;
    var built = state.built[idx];
    state.game = Wonnect.createGame(built);
    var rec = save.levels[idx];
    if (rec) {
      (rec.found || []).forEach(function (w) { state.game.submit(w); });
      (rec.bonus || []).forEach(function (w) { state.game.submit(w); });
    }
    renderWheel(built.letters);
    refresh();
    persist();
  }

  function shuffleWheel() {
    var b = state.built[save.level];
    var arr = b.letters.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    b.letters = arr;
    clearSel();
    renderWheel(arr);
  }

  function showError(msg) {
    el.loadErrorMsg.textContent = msg;
    el.loadError.hidden = false;
  }

  function boot() {
    Promise.all([
      fetch('data/letters.json').then(function (r) { return r.json(); }),
      fetch('data/levels.json').then(function (r) { return r.json(); }),
      fetch('data/words.json').then(function (r) { return r.json(); })
    ]).then(function (files) {
      var alphabet = files[0].crke;
      var defs = files[1].stopnje;
      var words = files[2].besede;
      var result = buildAll(defs, alphabet, words);
      if (!result.built.length) {
        showError('Nobena stopnja ni veljavna. ' + result.errors.join(' '));
        return;
      }
      if (result.errors.length) console.warn(result.errors.join('\n'));
      state = { built: result.built };
      save = loadSave(signature(alphabet, defs, words));
      if (save.level >= result.built.length) save.level = 0;
      startLevel(save.level);
      if (result.errors.length) toast('Opozorilo: ' + result.errors.length + ' stopnja(e) preskočena(e).');
    }).catch(function (err) {
      showError('Podatkov ni bilo mogoče naložiti: ' + err.message);
    });
  }

  el.wheel.addEventListener('pointerdown', onDown);
  el.wheel.addEventListener('pointermove', onMove);
  el.wheel.addEventListener('pointerup', onUp);
  el.wheel.addEventListener('pointercancel', onUp);
  document.getElementById('shuffle').addEventListener('click', shuffleWheel);
  document.getElementById('clear').addEventListener('click', clearSel);
  document.getElementById('next-level').addEventListener('click', function () {
    if (save.level + 1 < state.built.length) startLevel(save.level + 1);
    else { el.complete.hidden = true; el.allComplete.hidden = false; }
  });
  document.getElementById('restart').addEventListener('click', function () {
    save.levels = {};
    startLevel(0);
  });
  window.addEventListener('resize', function () {
    if (state) renderBoard(state.built[save.level], state.game.revealedCells());
  });

  boot();
})();
