/* Wonnect - jedro igre. Cista logika, brez DOM; deluje v brskalniku in v Node.js. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Wonnect = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function normalizeWord(w) { return String(w == null ? '' : w).trim().toLocaleUpperCase('sl'); }

  function normalizeLetters(list) {
    const out = [], seen = new Set();
    (list || []).forEach(function (l) {
      const n = normalizeWord(l);
      if (n && !seen.has(n)) { seen.add(n); out.push(n); }
    });
    return out;
  }

  function usesAlphabet(word, alphabet) {
    const set = new Set(normalizeLetters(alphabet));
    for (const ch of normalizeWord(word)) if (!set.has(ch)) return false;
    return true;
  }

  /* Ali lahko besedo sestavimo iz crk kolesa (vsako najvec tolikokrat, kolikor je na kolesu). */
  function canForm(word, wheel) {
    const real = {};
    (wheel || []).forEach(function (l) {
      const n = normalizeWord(l);
      real[n] = (real[n] || 0) + 1;
    });
    for (const ch of normalizeWord(word)) {
      if (!real[ch]) return false;
      real[ch] -= 1;
    }
    return true;
  }

  function key(r, c) { return r + ',' + c; }

  function tryPlace(board, word, row, col, dr, dc) {
    if (board.has(key(row - dr, col - dc))) return null;
    if (board.has(key(row + dr * word.length, col + dc * word.length))) return null;
    let intersections = 0;
    for (let i = 0; i < word.length; i++) {
      const r = row + dr * i, c = col + dc * i;
      const existing = board.get(key(r, c));
      if (existing !== undefined) {
        if (existing !== word[i]) return null;
        intersections++;
      } else {
        if (board.has(key(r + dc, c + dr))) return null;
        if (board.has(key(r - dc, c - dr))) return null;
      }
    }
    if (intersections === 0) return null;
    return { intersections: intersections };
  }

  function placementsFor(board, word) {
    const out = [];
    const dirs = [{ dr: 0, dc: 1, dir: 'h' }, { dr: 1, dc: 0, dir: 'v' }];
    for (const d of dirs) {
      for (const entry of board) {
        const parts = entry[0].split(',');
        const r = +parts[0], c = +parts[1], ch = entry[1];
        for (let i = 0; i < word.length; i++) {
          if (word[i] !== ch) continue;
          const sr = r - d.dr * i, sc = c - d.dc * i;
          const res = tryPlace(board, word, sr, sc, d.dr, d.dc);
          if (res) out.push({ row: sr, col: sc, dir: d.dir, intersections: res.intersections });
        }
      }
    }
    return out;
  }

  function bounds(cells) {
    let r0 = Infinity, r1 = -Infinity, c0 = Infinity, c1 = -Infinity;
    cells.forEach(function (cell) {
      r0 = Math.min(r0, cell.row); r1 = Math.max(r1, cell.row);
      c0 = Math.min(c0, cell.col); c1 = Math.max(c1, cell.col);
    });
    return { r0: r0, r1: r1, c0: c0, c1: c1 };
  }

  /* Postavi besede v krizanko. Vrne { placements, unplaced } ali null. */
  function layoutCrossword(words, seed) {
    const rng = mulberry32(seed);
    const board = new Map();
    const placements = [];
    const first = { word: words[0], row: 0, col: 0, dir: 'h' };
    placements.push(first);
    for (let i = 0; i < first.word.length; i++) board.set(key(0, i), first.word[i]);
    const unplaced = [];
    for (let w = 1; w < words.length; w++) {
      const word = words[w];
      const cands = placementsFor(board, word);
      if (!cands.length) { unplaced.push(word); continue; }
      cands.forEach(function (p) { p.score = p.intersections * 4 + rng(); });
      cands.sort(function (a, b) { return b.score - a.score; });
      const pick = cands[0];
      placements.push({ word: word, row: pick.row, col: pick.col, dir: pick.dir });
      for (let i = 0; i < word.length; i++) {
        board.set(key(pick.row + (pick.dir === 'v' ? i : 0), pick.col + (pick.dir === 'h' ? i : 0)), word[i]);
      }
    }
    return { placements: placements, unplaced: unplaced };
  }

  /* Gradi stopnjo; ce postavitev ni popolna, poskusi z drugimi semeni. */
  function buildLevel(def, alphabet, dictionary, levelIndex) {
    const alpha = normalizeLetters(alphabet);
    const wheel = String(def && def.letters || '').split('').map(normalizeWord).filter(function (x) { return !!x; });
    const words = [];
    const seen = new Set();
    (def && def.words || []).forEach(function (w) {
      const n = normalizeWord(w);
      if (n.length >= 2 && !seen.has(n)) { seen.add(n); words.push(n); }
    });
    words.sort(function (a, b) { return b.length - a.length || (a < b ? -1 : 1); });
    const errors = [];
    if (!wheel.length) errors.push('stopnja nima crk (letters)');
    if (!words.length) errors.push('stopnja nima besed (words)');
    words.forEach(function (w) {
      if (!usesAlphabet(w, alpha)) errors.push('beseda ' + w + ' vsebuje crke izven abecede');
      if (!canForm(w, def && def.letters ? String(def.letters).split('') : [])) {
        errors.push('besede ' + w + ' ni mogoce sestaviti iz crk ' + String(def.letters));
      }
    });
    if (errors.length) return { errors: errors };
    const baseSeed = 1000 + (levelIndex || 0) * 7919;
    let best = null;
    for (let attempt = 0; attempt < 40; attempt++) {
      const res = layoutCrossword(words, baseSeed + attempt);
      if (!best || res.unplaced.length < best.unplaced.length) best = res;
      if (!res.unplaced.length) break;
    }
    const grid = new Map();
    best.placements.forEach(function (p) {
      for (let i = 0; i < p.word.length; i++) {
        const r = p.row + (p.dir === 'v' ? i : 0), c = p.col + (p.dir === 'h' ? i : 0);
        grid.set(key(r, c), { row: r, col: c, letter: p.word[i] });
      }
    });
    const cells = Array.from(grid.values());
    const b = bounds(cells);
    const gridCells = cells.map(function (cell) {
      return { row: cell.row - b.r0, col: cell.col - b.c0, letter: cell.letter };
    });
    const placedWords = best.placements.map(function (p) {
      return {
        word: p.word,
        row: p.row - b.r0,
        col: p.col - b.c0,
        dir: p.dir,
        cells: p.word.split('').map(function (ch, i) {
          return { row: p.row - b.r0 + (p.dir === 'v' ? i : 0), col: p.col - b.c0 + (p.dir === 'h' ? i : 0), letter: ch };
        })
      };
    });
    const dictSet = new Set(normalizeLetters(dictionary));
    const bonus = [];
    best.unplaced.forEach(function (w) { if (!dictSet.has(w)) bonus.push(w); });
    return {
      letters: wheel,
      words: words,
      grid: { rows: b.r1 - b.r0 + 1, cols: b.c1 - b.c0 + 1, cells: gridCells },
      placedWords: placedWords,
      bonusWords: bonus,
      errors: []
    };
  }

  /* Stanje ene stopnje: konec je, ko je mreza polna ali so vse ciljne besede najdene. */
  function createGame(built) {
    const targets = new Set(built.placedWords.map(function (p) { return p.word; }));
    const found = new Set();
    const bonus = new Set();
    const dictSet = built.dictionarySet || new Set();
    const placedByWord = {};
    built.placedWords.forEach(function (p) { placedByWord[p.word] = p; });

    function revealedCells() {
      const set = new Set();
      found.forEach(function (w) {
        const p = placedByWord[w];
        if (p) p.cells.forEach(function (c) { set.add(key(c.row, c.col)); });
      });
      return set;
    }

    return {
      submit: function (raw) {
        const w = normalizeWord(raw);
        if (w.length < 2) return { kind: 'kratek', word: w };
        if (!canForm(w, built.letters)) return { kind: 'crke', word: w };
        if (found.has(w)) return { kind: 'ponovitev', word: w };
        if (targets.has(w)) {
          found.add(w);
          return { kind: 'zadetek', word: w, complete: found.size === targets.size, foundCount: found.size, targetCount: targets.size };
        }
        if (bonus.has(w)) return { kind: 'ponovitev-bonus', word: w };
        if (dictSet.has(w)) {
          bonus.add(w);
          return { kind: 'bonus', word: w, bonusCount: bonus.size };
        }
        return { kind: 'neznan', word: w };
      },
      isComplete: function () { return found.size === targets.size; },
      foundWords: function () { return Array.from(found); },
      bonusWords: function () { return Array.from(bonus); },
      counts: function () { return { found: found.size, target: targets.size, bonus: bonus.size }; },
      revealedCells: revealedCells
    };
  }

  return {
    mulberry32: mulberry32,
    normalizeWord: normalizeWord,
    normalizeLetters: normalizeLetters,
    usesAlphabet: usesAlphabet,
    canForm: canForm,
    layoutCrossword: layoutCrossword,
    buildLevel: buildLevel,
    createGame: createGame
  };
});
