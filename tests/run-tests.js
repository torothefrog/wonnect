/* Zagon: node tests/run-tests.js */
'use strict';
const fs = require('fs');
const path = require('path');
const W = require('../game.js');

let passed = 0, failed = 0;
function ok(cond, name) {
  if (cond) { passed++; }
  else { failed++; console.error('FAIL:', name); }
}
function eq(a, b, name) { ok(JSON.stringify(a) === JSON.stringify(b), name + ' (dobljeno: ' + JSON.stringify(a) + ')'); }

/* --- normalizacija --- */
eq(W.normalizeWord('  hiša '), 'HIŠA', 'normalizeWord ureza in velike crke');
eq(W.normalizeWord('češnja'), 'ČEŠNJA', 'normalizeWord ohrani čšž');
eq(W.normalizeLetters(['a', 'A', 'b', '']), ['A', 'B'], 'normalizeLetters odstrani dvojnike');

/* --- abeceda --- */
const letters = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/letters.json'), 'utf8')).crke;
eq(letters.length, 25, 'slovenska abeceda ima 25 crk');
ok(letters.includes('Č') && letters.includes('Š') && letters.includes('Ž'), 'abeceda vkljucuje č š ž');
ok(!letters.includes('Q') && !letters.includes('W') && !letters.includes('X') && !letters.includes('Y'), 'abeceda brez q w x y');

/* --- canForm --- */
ok(W.canForm('OKO', ['O', 'K', 'O', 'T']), 'OKO iz OKOT (dva O-ja)');
ok(!W.canForm('OKO', ['T', 'O', 'K', 'A']), 'OKO ni iz TOKA (samo en O)');
ok(!W.canForm('SOL', ['Š', 'O', 'L', 'A']), 'SOL ni iz ŠOLA (Š ni S)');
ok(W.canForm('ŠOLA', ['Š', 'O', 'L', 'A']), 'ŠOLA iz ŠOLA');
ok(!W.canForm('TALA', ['S', 'O', 'L', 'A', 'T']), 'TALA ni iz SOLAT (samo en A)');

/* --- postavitev krizanke --- */
const simple = W.layoutCrossword(['GLAVA', 'LAVA', 'VAL'], 42);
eq(simple.unplaced, [], 'GLAVA/LAVA/VAL se vse postavijo');
ok(simple.placements.length === 3, 'tri postavitve');
/* vsaka naslednja beseda se vsaj enkrat kriza s prejsnjimi */
{
  const cells = new Set();
  simple.placements.forEach((p, idx) => {
    const mine = p.word.split('').map((ch, i) => (p.row + (p.dir === 'v' ? i : 0)) + ',' + (p.col + (p.dir === 'h' ? i : 0)));
    if (idx > 0) ok(mine.some(k => cells.has(k)), p.word + ' se kriza s prejsnjimi');
    mine.forEach(k => cells.add(k));
  });
}
/* determinizem: isto seme, ista postavitev */
const again = W.layoutCrossword(['GLAVA', 'LAVA', 'VAL'], 42);
eq(again.placements, simple.placements, 'postavitev je ponovljiva za isto seme');

/* --- buildLevel: napake --- */
const bad = W.buildLevel({ letters: 'AB', words: ['AX'] }, letters, ['AB'], 0);
ok(bad.errors.length >= 1, 'beseda izven abecede javi napako');
const bad2 = W.buildLevel({ letters: 'VODA', words: ['OKO'] }, letters, ['OKO'], 0);
ok(bad2.errors.length >= 1, 'beseda, ki je ni mogoce sestaviti, javi napako');

/* --- buildLevel: vse stopnje iz repozitorija --- */
const words = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/words.json'), 'utf8')).besede;
const levels = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/levels.json'), 'utf8')).stopnje;
ok(levels.length >= 10, 'vsaj 10 stopenj');
levels.forEach((lv, i) => {
  const b = W.buildLevel(lv, letters, words, i);
  eq(b.errors, [], 'stopnja ' + (i + 1) + ' (' + lv.letters + ') brez napak');
  eq(b.placedWords.length, lv.words.length, 'stopnja ' + (i + 1) + ': vse besede postavljene');
  /* mreza: stevilo celic = unikatne pozicije */
  const uniq = new Set(b.grid.cells.map(c => c.row + ',' + c.col));
  eq(uniq.size, b.grid.cells.length, 'stopnja ' + (i + 1) + ': brez podvojenih celic');
});

/* --- slovar --- */
const badWords = words.filter(w => !W.usesAlphabet(w, letters));
eq(badWords, [], 'vse besede slovarja znotraj abecede');
const dup = words.filter((w, i) => words.indexOf(w) !== i);
eq(dup, [], 'slovar brez dvojnikov');
levels.forEach((lv, i) => {
  lv.words.forEach(w => ok(words.includes(w), 'ciljna beseda ' + w + ' (stopnja ' + (i + 1) + ') je v slovarju'));
});

/* --- createGame: potek --- */
{
  const built = W.buildLevel({ letters: 'GLAVA', words: ['GLAVA', 'LAVA', 'VAL'] }, letters, words, 2);
  built.dictionarySet = new Set(words);
  const g = W.createGame(built);
  eq(g.submit('GLAVA').kind, 'zadetek', 'ciljna beseda = zadetek');
  eq(g.submit('glava').kind, 'ponovitev', 'ponovitev (brez razlikovanja velikosti)');
  eq(g.submit('LAVA').kind, 'zadetek', 'druga ciljna');
  const r = g.submit('VAL');
  ok(r.kind === 'zadetek' && r.complete === true, 'zadnja beseda zakljuci stopnjo');
  ok(g.isComplete(), 'isComplete po vseh besedah');
  const g2 = W.createGame(built);
  eq(g2.submit('VODA').kind, 'crke', 'beseda iz cudih crk = crke');
  eq(g2.submit('GAL').kind, 'neznan', 'neznana beseda iz pravilnih crk = neznan');
  eq(g2.submit('LAV').kind, 'neznan', 'LAV ni v slovarju = neznan');
  /* bonus: beseda iz crk kolesa, ki je v slovarju in ni ciljna */
  const b2 = W.buildLevel({ letters: 'VODA', words: ['VODA'] }, letters, words, 0);
  b2.dictionarySet = new Set(words);
  const g3 = W.createGame(b2);
  eq(g3.submit('DVA').kind, 'bonus', 'DVA je dodatna beseda na kolesu VODA');
  eq(g3.submit('DVA').kind, 'ponovitev-bonus', 'ponovljena dodatna');
  eq(g3.submit('VOD').kind, 'bonus', 'VOD je dodatna beseda (ni ciljna v tej definiciji)');
  /* revealedCells */
  const g4 = W.createGame(built);
  g4.submit('VAL');
  const rev = g4.revealedCells();
  ok(rev.size === 3, 'razkrite 3 celice po VAL');
  g4.submit('GLAVA');
  ok(g4.revealedCells().size > 3, 'razkritje se siri');
}

/* --- vztrajnost: format shranjevanja (logika iz app.js) --- */
{
  function freshSave(sig) { return { v: 1, sig: sig, level: 0, levels: {} }; }
  function loadSaveRaw(raw, sig) {
    try {
      if (!raw) return freshSave(sig);
      const data = JSON.parse(raw);
      if (!data || data.v !== 1 || typeof data.level !== 'number' || typeof data.levels !== 'object') return freshSave(sig);
      if (data.sig !== sig) return { v: 1, sig: sig, level: Math.min(data.level, 9999) | 0, levels: {} };
      return data;
    } catch (e) { return freshSave(sig); }
  }
  eq(loadSaveRaw(null, 's1').level, 0, 'brez shrambe = nova igra');
  eq(loadSaveRaw('{pokvarjeno', 's1').level, 0, 'pokvarjen JSON = nova igra');
  eq(loadSaveRaw('{"v":2,"level":5,"levels":{}}', 's1').level, 0, 'napacna razlicica = nova igra');
  const ch = loadSaveRaw(JSON.stringify({ v: 1, sig: 'star', level: 3, levels: { '3': { found: ['VODA'] } } }), 'nov');
  ok(ch.level === 3 && Object.keys(ch.levels).length === 0, 'sprememba podatkov ohrani stopnjo, ponastavi najdbe');
  const keep = loadSaveRaw(JSON.stringify({ v: 1, sig: 's1', level: 2, levels: { '2': { found: ['TOK'], bonus: ['DVA'], complete: false } } }), 's1');
  ok(keep.levels['2'].found[0] === 'TOK', 'nespremenjeni podatki ohranijo najdbe');
}

console.log('');
console.log(passed + ' opravljenih, ' + failed + ' padlih');
process.exit(failed ? 1 : 0);
