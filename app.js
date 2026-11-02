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
    progressFill: document.getElementById('progress-fill'),
    foundCount: document.getElementById('found-count'),
    bonusCount: document.getElementById('bonus-count'),
    complete: document.getElementById('level-complete'),
    completeStats: document.getElementById('complete-stats'),
    completeBonus: document.getElementById('complete-bonus'),
    allComplete: document.getElementById('all-complete'),
    levelMenu: document.getElementById('level-menu'),
    levelGrid: document.getElementById('level-grid'),
    resetGame: document.getElementById('reset-game'),
    toggleHearts: document.getElementById('toggle-hearts'),
    hearts: document.getElementById('hearts'),
    loadError: document.getElementById('load-error'),
    loadErrorMsg: document.getElementById('load-error-msg')
  };

  function newSeed() { return Math.floor(Math.random() * 2147483647); }

  function persist() {
    try { window.localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* brez shrambe */ }
  }

  var toastIcon = document.getElementById('toast-icon');
  var toastText = document.getElementById('toast-text');
  /* Otroški toast: ostane viden, dokler se ga ne tapne (brez samodejnega skritja). */
  function toast(icon, msg) {
    toastIcon.textContent = icon;
    toastText.textContent = msg;
    el.toast.classList.remove('show', 'pop');
    void el.toast.offsetWidth;
    el.toast.classList.add('show', 'pop');
  }
  function hideToast() {
    el.toast.classList.remove('show');
  }
  el.toast.addEventListener('click', hideToast);

  var state = null; /* { builtByKey, keys, keys12, save, game } */
  var save = null;

  function buildAll(defs, alphabet, words) {
    var builtByKey = {};
    var keys = [];
    var errs = [];
    var dictSet = new Set(Wonnect.normalizeLetters(words));
    defs.forEach(function (def, i) {
      var b = Wonnect.buildLevel(def, alphabet, words, i);
      if (b.errors && b.errors.length) { errs.push('Stopnja ' + (i + 1) + ': ' + b.errors.join('; ')); return; }
      b.dictionarySet = dictSet;
      var key = Wonnect.levelKey(def);
      builtByKey[key] = b;
      keys.push(key);
    });
    return { builtByKey: builtByKey, keys: keys, errors: errs };
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
        if (letter === undefined) d.className = 'cell void';
        else if (revealed.has(r + ',' + c)) { d.className = 'cell open'; d.textContent = letter; }
        else d.className = 'cell slot';
        el.board.appendChild(d);
      }
    }
    sizeCells(g);
  }

  function sizeCells(g) {
    var w = el.boardWrap.clientWidth - 16;
    var h = el.boardWrap.clientHeight - 16;
    var size = Math.floor(Math.min(w / g.cols, h / g.rows, 58));
    if (size < 22) size = 22;
    el.board.style.setProperty('--cell-size', size + 'px');
  }

  var letterButtons = [];
  function renderWheel(letters) {
    el.wheel.querySelectorAll('.letter').forEach(function (b) { b.remove(); });
    el.lines.innerHTML = '';
    letterButtons = [];
    var n = letters.length;
    var radius = 38;
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
  var sel = [];

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
    el.current.classList.toggle('active', sel.length > 0);
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

  /* Ikonca + kratko besedilo; {w} se zamenja z vneseno besedo. Vec variant = igralno. */
  var FEEDBACK = {
    zadetek: [
      { icon: '🎉', text: 'Bravo!' },
      { icon: '⭐', text: 'Super!' },
      { icon: '✅', text: 'Pravilno!' }
    ],
    bonus: [
      { icon: '⭐', text: 'Dodatna beseda!' },
      { icon: '🌟', text: 'Bonus beseda!' }
    ],
    'ponovitev': [
      { icon: '🔁', text: '"{w}" imaš že!' }
    ],
    'ponovitev-bonus': [
      { icon: '🔁', text: '"{w}" je že na seznamu!' }
    ],
    neznan: [
      { icon: '🤪', text: 'Hihi, "{w}" ni prava beseda!' },
      { icon: '🙈', text: 'Ups, "{w}"? Te besede ni!' },
      { icon: '🤔', text: 'Hmm, "{w}" ne poznam!' },
      { icon: '🐸', text: 'Kva? "{w}" ni beseda!' }
    ],
    crke: [
      { icon: '🧩', text: 'Te črke ne gredo skupaj!' }
    ],
    kratek: [
      { icon: '✏️', text: 'Prekratko!' }
    ]
  };

  function currentKey() { return save.order[save.pos]; }

  function submit(word) {
    var res = state.game.submit(word);
    var variants = FEEDBACK[res.kind] || [{ icon: '❔', text: res.kind }];
    var pick = variants[Math.floor(Math.random() * variants.length)];
    var heartOut = false;
    if (res.kind === 'neznan' && heartsOn()) heartOut = loseHeart();
    if (!heartOut) toast(pick.icon, pick.text.split('{w}').join(res.word) + (heartsOn() && res.kind === 'neznan' ? ' -1 ❤️' : ''));
    if (res.kind === 'zadetek' || res.kind === 'bonus') {
      var key = currentKey();
      var rec = save.levels[key] || (save.levels[key] = { found: [], bonus: [], complete: false });
      if (res.kind === 'zadetek') { if (!rec.found.includes(res.word)) rec.found.push(res.word); }
      else if (!rec.bonus.includes(res.word)) rec.bonus.push(res.word);
      refresh();
      persist();
      if (res.kind === 'zadetek' && state.game.isComplete()) {
        rec.complete = true;
        persist();
        var c = state.game.counts();
        el.completeStats.textContent = 'Najdenih ' + c.found + ' besed' +
          (c.bonus ? ', ' + c.bonus + ' dodatnih.' : '.');
        el.completeBonus.textContent = c.bonus ? 'Dodatne: ' + state.game.bonusWords().join(', ') : '';
        el.progressFill.style.width = ((save.pos + 1) / save.order.length * 100) + '%';
        setTimeout(function () { el.complete.hidden = false; }, 450);
      }
    }
  }

  function refresh() {
    renderBoard(state.builtByKey[currentKey()], state.game.revealedCells());
    var c = state.game.counts();
    el.foundCount.textContent = '🎯 ' + c.found + ' / ' + c.target;
    el.bonusCount.textContent = '⭐ ' + c.bonus;
    el.levelLabel.textContent = '🚩 Stopnja ' + (save.pos + 1) + ' / ' + save.order.length;
    el.progressFill.style.width = ((save.pos) / save.order.length * 100) + '%';
  }

  function startLevel(pos) {
    save.pos = pos;
    el.complete.hidden = true;
    el.allComplete.hidden = true;
    var built = state.builtByKey[currentKey()];
    state.game = Wonnect.createGame(built);
    var rec = save.levels[currentKey()];
    if (rec) {
      (rec.found || []).forEach(function (w) { state.game.submit(w); });
      (rec.bonus || []).forEach(function (w) { state.game.submit(w); });
    }
    heartsLeft = HEARTS_MAX;
    renderWheel(built.letters);
    refresh();
    renderHearts();
    persist();
  }

  var HEARTS_MAX = 10;
  var heartsLeft = HEARTS_MAX;

  function heartsOn() { return !!(save && save.heartsMode); }

  function renderHearts() {
    if (!heartsOn()) { el.hearts.hidden = true; return; }
    el.hearts.hidden = false;
    el.hearts.textContent = '❤️'.repeat(heartsLeft) + '🤍'.repeat(HEARTS_MAX - heartsLeft);
  }

  function renderHeartsToggle() {
    el.toggleHearts.textContent = heartsOn() ? '❤️ Srčki: VKLOP' : '🤍 Srčki: IZKLOP';
  }

  function onToggleHearts() {
    save.heartsMode = !heartsOn();
    heartsLeft = HEARTS_MAX;
    persist();
    renderHearts();
    renderHeartsToggle();
    toast(heartsOn() ? '❤️' : '🤍', heartsOn() ? 'Srčki vklopljeni! Napačna beseda = -1 ❤️' : 'Srčki izklopljeni.');
  }

  function loseHeart() {
    heartsLeft = Math.max(0, heartsLeft - 1);
    renderHearts();
    if (heartsLeft === 0) {
      heartsLeft = HEARTS_MAX;
      renderHearts();
      toast('💔', 'Srčki so šli! Nič hudega - dobiš nove! 💪');
      return true;
    }
    return false;
  }

  function renderLevelMenu() {
    el.levelGrid.innerHTML = '';
    save.order.forEach(function (key, i) {
      var rec = save.levels[key];
      var done = !!(rec && rec.complete);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'level-tile' + (done ? ' done' : '') + (i === save.pos ? ' current' : '');
      btn.innerHTML = '<span class="tile-num">' + (i + 1) + '</span><span class="tile-icon">' +
        (done ? '✅' : (i === save.pos ? '▶️' : '🧩')) + '</span>';
      btn.setAttribute('aria-label', 'Stopnja ' + (i + 1) + (done ? ' (končana)' : ''));
      btn.addEventListener('click', function () {
        el.levelMenu.hidden = true;
        startLevel(i);
      });
      el.levelGrid.appendChild(btn);
    });
  }

  function openLevelMenu() {
    if (!state || !state.game) return;
    renderLevelMenu();
    resetArmed = false;
    el.resetGame.textContent = '🔄 Začni od začetka';
    el.resetGame.classList.remove('armed');
    renderHeartsToggle();
    el.levelMenu.hidden = false;
  }

  var resetArmed = false;
  var resetTimer = null;
  function onResetGame() {
    if (!resetArmed) {
      resetArmed = true;
      el.resetGame.textContent = '⚠️ Res pobrisati vse? Tapni še enkrat!';
      el.resetGame.classList.add('armed');
      if (resetTimer) clearTimeout(resetTimer);
      resetTimer = setTimeout(function () {
        resetArmed = false;
        el.resetGame.textContent = '🔄 Začni od začetka';
        el.resetGame.classList.remove('armed');
      }, 3500);
      return;
    }
    if (resetTimer) clearTimeout(resetTimer);
    resetArmed = false;
    /* Namerna ponastavitev: pobrise najdbe, obdrzi istih 12 stopenj, nazaj na 1. */
    save.levels = {};
    save.pos = 0;
    el.levelMenu.hidden = true;
    startLevel(0);
    toast('🔄', 'Začetek! Vse besede so pobrisane.');
  }

  function newGame() {
    var fresh = Wonnect.freshSave(save.sig, state.keys, newSeed());
    save.seed = fresh.seed;
    save.order = fresh.order;
    save.levels = {};
    save.pos = 0;
    startLevel(0);
  }

  var shuffleBtn = document.getElementById('shuffle');
  function shuffleWheel() {
    if (!state || !state.game) return;
    var b = state.builtByKey[currentKey()];
    /* Zapomni si stare polozaje gumbov (po crkah, zaradi ponovitev crk v vrsti). */
    var oldRects = letterButtons.map(function (btn) { return btn.getBoundingClientRect(); });
    var oldByLetter = {};
    b.letters.forEach(function (ch, i) {
      (oldByLetter[ch] = oldByLetter[ch] || []).push(oldRects[i]);
    });
    var arr = b.letters.slice();
    var tries = 0;
    do {
      for (var i = arr.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      tries++;
    } while (tries < 5 && arr.join('') === b.letters.join(''));
    b.letters = arr;
    clearSel();
    renderWheel(arr);
    /* Poleti iz starega polozaja v novega, da otrok vidi, da se je kaj zgodilo. */
    letterButtons.forEach(function (btn) {
      var q = oldByLetter[btn.dataset.letter];
      var old = q && q.shift();
      if (!old) return;
      var now = btn.getBoundingClientRect();
      var dx = old.left - now.left;
      var dy = old.top - now.top;
      if (!dx && !dy) return;
      btn.style.transition = 'none';
      btn.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)';
      void btn.offsetWidth;
      btn.style.transition = 'transform 0.4s cubic-bezier(0.2, 0.9, 0.3, 1.2)';
      btn.style.transform = 'translate(0px, 0px)';
      setTimeout(function () {
        btn.style.transition = '';
        btn.style.transform = '';
      }, 460);
    });
    shuffleBtn.classList.remove('spin');
    void shuffleBtn.offsetWidth;
    shuffleBtn.classList.add('spin');
    shuffleBtn.disabled = true;
    setTimeout(function () { shuffleBtn.disabled = false; }, 460);
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
      if (!result.keys.length) {
        showError('Nobena stopnja ni veljavna. ' + result.errors.join(' '));
        return;
      }
      if (result.errors.length) console.warn(result.errors.join('\n'));
      state = {
        builtByKey: result.builtByKey,
        keys: result.keys,
        keys12: result.keys.slice(0, 12)
      };
      var rawSave = null;
      try { rawSave = window.localStorage.getItem(SAVE_KEY); } catch (e) {}
      save = Wonnect.loadSaveRaw(rawSave, Wonnect.lettersSignature(alphabet, words), result.keys, state.keys12, newSeed());
      startLevel(save.pos);
      if (result.errors.length) toast('⚠️', result.errors.length + ' stopnja(e) preskočena(e).');
    }).catch(function (err) {
      showError('Podatkov ni bilo mogoče naložiti: ' + err.message);
    });
  }

  el.wheel.addEventListener('pointerdown', onDown);
  el.wheel.addEventListener('pointermove', onMove);
  el.wheel.addEventListener('pointerup', onUp);
  el.wheel.addEventListener('pointercancel', onUp);
  shuffleBtn.addEventListener('click', shuffleWheel);
  document.getElementById('clear').addEventListener('click', clearSel);
  document.getElementById('next-level').addEventListener('click', function () {
    if (save.pos + 1 < save.order.length) startLevel(save.pos + 1);
    else { el.complete.hidden = true; el.progressFill.style.width = '100%'; el.allComplete.hidden = false; }
  });
  document.getElementById('restart').addEventListener('click', newGame);
  document.getElementById('menu-btn').addEventListener('click', openLevelMenu);
  document.getElementById('menu-close').addEventListener('click', function () { el.levelMenu.hidden = true; });
  el.resetGame.addEventListener('click', onResetGame);
  el.toggleHearts.addEventListener('click', onToggleHearts);
  el.levelMenu.addEventListener('click', function (e) { if (e.target === el.levelMenu) el.levelMenu.hidden = true; });
  window.addEventListener('resize', function () {
    if (state && state.game) renderBoard(state.builtByKey[currentKey()], state.game.revealedCells());
  });

  boot();
})();
