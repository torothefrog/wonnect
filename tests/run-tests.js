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

/* --- izbira stopenj (raznolikost) --- */
{
  const a = W.selectLevelOrder(27, 12, 12345);
  const b = W.selectLevelOrder(27, 12, 12345);
  eq(a, b, 'isti seed = ista izbira (ponovljivost)');
  eq(new Set(a).size, 12, '12 razlicnih stopenj');
  ok(a.every(i => i >= 0 && i < 27), 'indeksi znotraj nabora');
  const c = W.selectLevelOrder(27, 12, 999);
  ok(JSON.stringify(a) !== JSON.stringify(c), 'drug seed = drugacna izbira');
  eq(W.selectLevelOrder(5, 12, 1).length, 5, 'manjsi nabor = manj stopenj');
}

/* --- vztrajnost: v2 shranjevanje (iz game.js) --- */
{
  const letters2 = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/letters.json'), 'utf8')).crke;
  const words2 = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/words.json'), 'utf8')).besede;
  const lvls = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/levels.json'), 'utf8')).stopnje;
  const keys = lvls.map(W.levelKey);
  const keys12 = keys.slice(0, 12);
  const sig = W.lettersSignature(letters2, words2);

  const fresh = W.loadSaveRaw(null, sig, keys, keys12, 42);
  ok(fresh.v === 2 && fresh.order.length === 12 && fresh.pos === 0, 'brez shrambe = svezha igra z 12 izbranimi');
  ok(fresh.order.every(k => keys.includes(k)), 'izbrane stopnje obstajajo v naboru');

  eq(W.loadSaveRaw('{pokvarjeno', sig, keys, keys12, 42).v, 2, 'pokvarjen JSON = svezha igra');
  eq(W.loadSaveRaw('{"v":9}', sig, keys, keys12, 42).pos, 0, 'napacna razlicica = svezha igra');

  /* selitev v1: ohranjeni najdbe in polozaj */
  const v1 = JSON.stringify({ v: 1, sig: 'star', level: 2, levels: { '2': { found: ['GLAVA'], bonus: ['SOL'], complete: false } } });
  const mig = W.loadSaveRaw(v1, sig, keys, keys12, 42);
  ok(mig.v === 2 && mig.pos === 2 && mig.order.length === 12, 'v1 -> v2: polozaj ohranjen');
  eq(mig.order, keys12, 'v1 -> v2: vrstni red = prvih 12 stopenj');
  eq(mig.levels[keys12[2]].found, ['GLAVA'], 'v1 -> v2: najdbe preseljene na kljuc stopnje');

  /* sprememba abecede/slovarja: polozaj in izbira ostaneta, najdbe se ponastavijo */
  const ch = W.loadSaveRaw(JSON.stringify({ v: 2, sig: 'drug', seed: 7, order: keys12, pos: 3, levels: { [keys12[3]]: { found: ['X'] } } }), sig, keys, keys12, 42);
  ok(ch.pos === 3 && ch.order.length === 12 && Object.keys(ch.levels).length === 0, 'sprememba slovarja: ohrani polozaj, ponastavi najdbe');

  /* odstranjena stopnja se izloci iz reda */
  const fewer = keys.slice(1);
  const rec = W.loadSaveRaw(JSON.stringify({ v: 2, sig: sig, seed: 7, order: keys12, pos: 0, levels: {} }), sig, fewer, keys12, 42);
  ok(rec.order.every(k => fewer.includes(k)), 'odstranjene stopnje se izlocijo iz reda');

  /* isti seed ob svezi igri = enaka izbira (shranjena igra se obnove enako) */
  const r1 = W.freshSave(sig, keys, 555);
  const r2 = W.freshSave(sig, keys, 555);
  eq(r1.order, r2.order, 'svezha igra z istim seed-om = enak vrstni red');
}

/* --- nacin s srcki (cista logika) --- */
{
  const h = W.createHearts(10);
  eq(h.left(), 10, 'srcki: zacetek s polnim stetjem');
  eq(h.isOut(), false, 'srcki: ni prazno na zacetku');
  h.lose();
  eq(h.left(), 9, 'srcki: napacna beseda vzame 1');
  for (let i = 0; i < 20; i++) h.lose();
  eq(h.left(), 0, 'srcki: ne gre pod 0');
  eq(h.isOut(), true, 'srcki: prazno ob 0');
  eq(h.retry(), 10, 'srcki: retry napolni nazaj na 10');
  eq(h.isOut(), false, 'srcki: po retry ni vec prazno');
  const h3 = W.createHearts(3);
  h3.lose(); h3.lose(); h3.lose();
  eq(h3.isOut(), true, 'srcki: poljubno maksimum (3) se uposteva');
}

/* --- napredek stopnje in nacin preziveta nalaganje shrambe --- */
{
  const sig = W.lettersSignature(['A'], ['A']);
  const save = W.freshSave(sig, ['k1', 'k2'], 7);
  save.levels['k1'] = { found: ['AB'], bonus: ['BA'], complete: false };
  save.heartsMode = true;
  const loaded = W.loadSaveRaw(JSON.stringify(save), sig, ['k1', 'k2'], ['k1', 'k2'], 9);
  eq(loaded.levels['k1'].found, ['AB'], 'shramba: najdene besede se ohranijo');
  eq(loaded.levels['k1'].bonus, ['BA'], 'shramba: dodatne besede se ohranijo');
  eq(loaded.heartsMode, true, 'shramba: nastavitev srckov se ohrani');
  eq(loaded.v, 2, 'shramba: razlicica ostane 2');
  const loaded2 = W.loadSaveRaw(JSON.stringify(save), 'drug-sig', ['k1', 'k2'], ['k1', 'k2'], 9);
  eq(Object.keys(loaded2.levels).length, 0, 'shramba: sprememba podatkov ponastavi najdbe, izbira stopenj ostane');
  eq(loaded2.order, save.order, 'shramba: izbira 12 stopenj se ohrani ob spremembi podatkov');
}

console.log(passed + ' opravljenih, ' + failed + ' padlih');
if (failed) process.exit(1);
