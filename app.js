/* Wonnect - uporabniski vmesnik (DOM). Logika je v game.js. */
(function () {
  'use strict';
  var icon = window.WonnectIcons;
  function label(node, name, text) {
    node.innerHTML = icon(name);
    node.appendChild(document.createTextNode(text));
  }
  var LEGACY_KEY = 'wonnect-napredek-v1';
  var PROFILES_KEY = 'wonnect-profili-v1';
  var SAVE_KEY = LEGACY_KEY; /* ključ shrambe aktivnega igralca */
  var profiles = null; /* { active, profiles: [{ id, name, key }] } */

  /* Prvi igralec uporablja stari ključ, zato obstoječi napredek ostane nedotaknjen. */
  function loadProfiles() {
    var p = null;
    try { p = JSON.parse(window.localStorage.getItem(PROFILES_KEY)); } catch (e) {}
    if (!p || !Array.isArray(p.profiles) || !p.profiles.length) {
      p = { active: 'p1', profiles: [{ id: 'p1', name: 'Igralec 1', key: LEGACY_KEY }] };
    }
    if (!p.profiles.some(function (x) { return x.id === p.active; })) p.active = p.profiles[0].id;
    return p;
  }
  function saveProfiles() {
    try { window.localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles)); } catch (e) { /* brez shrambe */ }
  }
  function activeProfile() {
    return profiles.profiles.filter(function (x) { return x.id === profiles.active; })[0];
  }
  function readSaveFor(key) {
    var raw = null;
    try { raw = window.localStorage.getItem(key); } catch (e) {}
    return Wonnect.loadSaveRaw(raw, state.sig, state.keys, state.keys12, newSeed());
  }

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
    outOfHearts: document.getElementById('out-of-hearts'),
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
    toastIcon.innerHTML = window.WonnectIcons(icon);
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
    var pad = window.getComputedStyle(el.boardWrap);
    var w = el.boardWrap.clientWidth - parseFloat(pad.paddingLeft) - parseFloat(pad.paddingRight) - 12;
    var h = el.boardWrap.clientHeight - parseFloat(pad.paddingTop) - parseFloat(pad.paddingBottom) - 12;
    var gap = 5;
    var size = Math.floor(Math.min((w - gap * (g.cols - 1)) / g.cols, (h - gap * (g.rows - 1)) / g.rows, 58));
    if (size < 16) size = 16;
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
      { icon: 'trophy', text: 'Bravo!' },
      { icon: 'star', text: 'Super!' },
      { icon: 'check', text: 'Pravilno!' }
    ],
    bonus: [
      { icon: 'star', text: 'Dodatna beseda!' },
      { icon: 'star', text: 'Bonus beseda!' }
    ],
    'ponovitev': [
      { icon: 'repeat', text: '"{w}" imaš že!' }
    ],
    'ponovitev-bonus': [
      { icon: 'repeat', text: '"{w}" je že na seznamu!' }
    ],
    neznan: [
      { icon: 'smile', text: 'Hihi, "{w}" ni prava beseda!' },
      { icon: 'smile', text: 'Ups, "{w}"? Te besede ni!' },
      { icon: 'think', text: 'Hmm, "{w}" ne poznam!' },
      { icon: 'smile', text: 'Kva? "{w}" ni beseda!' }
    ],
    crke: [
      { icon: 'puzzle', text: 'Te črke ne gredo skupaj!' }
    ],
    kratek: [
      { icon: 'edit', text: 'Prekratko!' }
    ]
  };

  function currentKey() { return save.order[save.pos]; }

  function submit(word) {
    var res = state.game.submit(word);
    var variants = FEEDBACK[res.kind] || [{ icon: 'think', text: res.kind }];
    var pick = variants[Math.floor(Math.random() * variants.length)];
    if (res.kind === 'neznan' && heartsOn()) {
      hearts.lose();
      renderHearts();
      if (hearts.isOut()) { showOutOfHearts(); return; }
      toast(pick.icon, pick.text.split('{w}').join(res.word) + ' -1 srček');
      return;
    }
    toast(pick.icon, pick.text.split('{w}').join(res.word));
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
    label(el.foundCount, 'target', ' ' + c.found + ' / ' + c.target);
    el.foundCount.setAttribute('aria-label', 'Najdene besede: ' + c.found + ' od ' + c.target);
    label(el.bonusCount, 'star', ' ' + c.bonus);
    el.bonusCount.setAttribute('aria-label', 'Dodatne besede: ' + c.bonus);
    label(el.levelLabel, 'flag', ' Stopnja ' + (save.pos + 1) + ' / ' + save.order.length);
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
    hearts.retry();
    el.outOfHearts.hidden = true;
    renderWheel(built.letters);
    refresh();
    renderHearts();
    persist();
  }

  var hearts = Wonnect.createHearts(10);

  function heartsOn() { return !!(save && save.heartsMode); }

  function renderHearts() {
    if (!heartsOn()) { el.hearts.hidden = true; return; }
    el.hearts.hidden = false;
    el.hearts.innerHTML = icon('heart').repeat(hearts.left()) + '<span class="hearts-empty">' + icon('heart-outline').repeat(hearts.max() - hearts.left()) + '</span>';
    el.hearts.setAttribute('aria-label', 'Srčki: ' + hearts.left() + ' od ' + hearts.max());
  }

  function renderHeartsToggle() {
    label(el.toggleHearts, heartsOn() ? 'heart' : 'heart-outline', heartsOn() ? ' Srčki: VKLOP' : ' Srčki: IZKLOP');
    el.toggleHearts.setAttribute('aria-pressed', String(heartsOn()));
  }

  function onToggleHearts() {
    save.heartsMode = !heartsOn();
    hearts.retry();
    el.outOfHearts.hidden = true;
    persist();
    renderHearts();
    renderHeartsToggle();
    toast(heartsOn() ? 'heart' : 'heart-outline', heartsOn() ? 'Srčki vklopljeni! Napačna beseda = -1 srček.' : 'Srčki izklopljeni.');
  }

  /* Ob 0 srckih: nic samodejnega - otrok sam izbere, ali poskusi znova ali odpre meni. */
  function showOutOfHearts() {
    el.outOfHearts.hidden = false;
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
        icon(done ? 'check' : (i === save.pos ? 'play' : 'puzzle')) + '</span>';
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
    label(el.resetGame, 'retry', ' Začni od začetka');
    el.resetGame.classList.remove('armed');
    renderHeartsToggle();
    renderProfileButton();
    el.levelMenu.hidden = false;
  }

  function renderProfileButton() {
    label(document.getElementById('open-profiles'), 'person', ' Igralec: ' + activeProfile().name);
  }

  var profileMenu = document.getElementById('profile-menu');
  var profileList = document.getElementById('profile-list');
  var profileName = document.getElementById('profile-name');
  function renderProfileMenu() {
    label(document.getElementById('profile-title'), 'person', ' Igralci');
    label(document.getElementById('profile-add'), 'add', ' Nov igralec');
    label(document.getElementById('profile-close'), 'close', ' Zapri');
    profileList.innerHTML = '';
    profiles.profiles.forEach(function (p) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = p.id === profiles.active ? 'current' : '';
      b.innerHTML = icon(p.id === profiles.active ? 'check' : 'person');
      b.appendChild(document.createTextNode(p.name));
      var meta = document.createElement('span');
      meta.className = 'p-meta';
      var done = 0;
      try {
        var d = (p.id === profiles.active) ? save : JSON.parse(window.localStorage.getItem(p.key));
        Object.keys((d && d.levels) || {}).forEach(function (k) { if (d.levels[k].complete) done++; });
      } catch (e) {}
      meta.textContent = done + ' / ' + (state.keys12.length);
      b.appendChild(meta);
      b.addEventListener('click', function () { switchProfile(p.id); });
      profileList.appendChild(b);
    });
  }
  function openProfileMenu() {
    renderProfileMenu();
    profileName.value = '';
    profileMenu.hidden = false;
  }
  function switchProfile(id) {
    if (id === profiles.active) { profileMenu.hidden = true; return; }
    persist();
    profiles.active = id;
    SAVE_KEY = activeProfile().key;
    saveProfiles();
    save = readSaveFor(SAVE_KEY);
    profileMenu.hidden = true;
    el.levelMenu.hidden = true;
    startLevel(save.pos);
    toast('person', 'Igralec: ' + activeProfile().name);
  }
  function addProfile() {
    var name = profileName.value.replace(/\s+/g, ' ').trim();
    if (!name) { profileName.focus(); return; }
    var clash = profiles.profiles.some(function (p) { return p.name.toLocaleUpperCase('sl') === name.toLocaleUpperCase('sl'); });
    if (clash) { profileName.value = ''; profileName.placeholder = 'IME ŽE OBSTAJA'; profileName.focus(); return; }
    var n = 2;
    var ids = profiles.profiles.map(function (p) { return p.id; });
    while (ids.indexOf('p' + n) !== -1) n++;
    var id = 'p' + n;
    profiles.profiles.push({ id: id, name: name, key: LEGACY_KEY + '-' + id });
    saveProfiles();
    try { window.localStorage.removeItem(LEGACY_KEY + '-' + id); } catch (e) {}
    switchProfile(id);
  }

  var resetArmed = false;
  var resetTimer = null;
  function onResetGame() {
    if (!resetArmed) {
      resetArmed = true;
      label(el.resetGame, 'warning', ' Res pobrisati igralca? Tapni še enkrat!');
      el.resetGame.classList.add('armed');
      if (resetTimer) clearTimeout(resetTimer);
      resetTimer = setTimeout(function () {
        resetArmed = false;
        label(el.resetGame, 'retry', ' Začni od začetka');
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
    toast('retry', 'Začetek! Vse besede so pobrisane.');
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
        sig: Wonnect.lettersSignature(alphabet, words),
        builtByKey: result.builtByKey,
        keys: result.keys,
        keys12: result.keys.slice(0, 12)
      };
      profiles = loadProfiles();
      SAVE_KEY = activeProfile().key;
      save = readSaveFor(SAVE_KEY);
      saveProfiles();
      startLevel(save.pos);
      if (result.errors.length) toast('warning', result.errors.length + ' stopnja(e) preskočena(e).');
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
  document.getElementById('open-profiles').addEventListener('click', openProfileMenu);
  document.getElementById('profile-add').addEventListener('click', addProfile);
  document.getElementById('profile-close').addEventListener('click', function () { profileMenu.hidden = true; });
  profileName.addEventListener('keydown', function (e) { if (e.key === 'Enter') addProfile(); });
  profileMenu.addEventListener('click', function (e) { if (e.target === profileMenu) profileMenu.hidden = true; });
  el.toggleHearts.addEventListener('click', onToggleHearts);
  document.getElementById('hearts-retry').addEventListener('click', function () {
    hearts.retry();
    renderHearts();
    el.outOfHearts.hidden = true;
    toast('retry', 'Novi srčki! Poskusi še enkrat.');
  });
  document.getElementById('hearts-menu').addEventListener('click', function () {
    hearts.retry();
    renderHearts();
    el.outOfHearts.hidden = true;
    openLevelMenu();
  });
  el.levelMenu.addEventListener('click', function (e) { if (e.target === el.levelMenu) el.levelMenu.hidden = true; });
  window.addEventListener('resize', function () {
    if (state && state.game) renderBoard(state.builtByKey[currentKey()], state.game.revealedCells());
  });

  if (window.ResizeObserver) {
    new ResizeObserver(function () {
      if (state && state.game) sizeCells(state.builtByKey[currentKey()].grid);
    }).observe(el.boardWrap);
  }
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () {
      if (state && state.game) sizeCells(state.builtByKey[currentKey()].grid);
    });
  }

  boot();
})();
