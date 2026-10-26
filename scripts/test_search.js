// Prove rapide della logica di ricerca.  Uso:  node scripts/test_search.js
const path = require('path');
const assert = require('assert');
const D = require(path.join(__dirname, '..', 'site', 'js', 'search.js'));
const data = require(path.join(__dirname, '..', 'site', 'data', 'recipes.json'));
const index = D.createIndex(data);
const id = (key) => data.ingredients.find((g) => g.k === key).id;
const names = (ids) => ids.map((i) => index.ingById.get(i).n);

let n = 0;
function test(nome, fn) { fn(); n++; console.log('ok  -', nome); }

test('i suggerimenti trovano singolare/plurale e refusi', () => {
  const k = (q) => D.suggest(index, q, []).map((g) => g.k);
  assert(k('pomodoro').includes('pomodori'));
  assert(k('uovo').includes('uova'));
  assert(k('parmigi').includes('parmigiano'));
  assert(k('pomdori').includes('pomodori'));        // refuso
  assert(k('Àglio').includes('aglio'));             // maiuscole e accenti
});
test('sale, pepe, olio, acqua non vengono mai suggeriti', () => {
  ['sale', 'pepe', 'olio', 'acqua'].forEach((q) =>
    assert(!D.suggest(index, q, []).some((g) => g.s), q));
});
test('un ingrediente gia scelto non e suggerito di nuovo', () => {
  assert(!D.suggest(index, 'aglio', [id('aglio')]).some((g) => g.k === 'aglio'));
});
test('modo "all": ogni risultato contiene tutti gli ingredienti scelti', () => {
  const sel = [id('uova'), id('parmigiano')];
  const res = D.search(index, sel, 'all');
  assert(res.length > 0);
  res.forEach((x) => sel.forEach((s) => assert(x.r.i.some((p) => p[0] === s))));
});
test('modo "near": al massimo 1 mancante e almeno 1 presente', () => {
  const res = D.search(index, [id('farina'), id('passata di pomodoro')], 'near');
  assert(res.length > 0);
  res.forEach((x) => { assert(x.miss.length <= 1); assert(x.have.length >= 1); });
});
test('ordine: prima le ricette con meno ingredienti mancanti', () => {
  const res = D.search(index, [id('patate')], 'near');
  for (let i = 1; i < res.length; i++) assert(res[i - 1].miss.length <= res[i].miss.length);
});
test('nessun ingrediente scelto = nessun risultato', () => {
  assert.strictEqual(D.search(index, [], 'all').length, 0);
});
test('piu ingredienti scelti = meno o uguali risultati', () => {
  const a = D.search(index, [id('uova')], 'all').length;
  const b = D.search(index, [id('uova'), id('farina')], 'all').length;
  const c = D.search(index, [id('uova'), id('farina'), id('burro')], 'all').length;
  assert(a >= b && b >= c);
  console.log('       uova:', a, '| +farina:', b, '| +burro:', c);
});
test('il filtro per portata restringe i risultati', () => {
  const tutte = D.search(index, [id('uova')], 'all');
  const dolci = D.search(index, [id('uova')], 'all', 'Dolci');
  assert(dolci.length < tutte.length && dolci.every((x) => x.r.c === 'Dolci'));
});

console.log('\n' + n + ' prove superate');
const ex = D.search(index, [id('pasta'), id('pomodori')], 'all').slice(0, 5);
console.log('pasta + pomodori:', ex.map((x) => x.r.t + (x.miss.length ? ' (manca ' + names(x.miss).join(', ') + ')' : ' (hai tutto)')));
