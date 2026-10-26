/* Logica di ricerca di Dispensa: nessuna dipendenza dal browser, quindi testabile con Node.
 *
 * Regole (come nel prototipo):
 * - sale, pepe, olio e acqua sono "scontati": non si chiedono e non contano come mancanti.
 * - un ingrediente rarissimo (in meno di MIN_COMMON ricette) non conta come "mancante",
 *   per non penalizzare le ricette con voci strane; se l'utente lo sceglie, conta.
 * - modo "all":  ricette che contengono TUTTI gli ingredienti scelti.
 * - modo "near": almeno un ingrediente scelto e al massimo 1 ingrediente comune mancante.
 * - ordine: meno ingredienti mancanti, poi piu' ingredienti scelti presenti, poi titolo.
 */
(function (root) {
  'use strict';

  var MIN_COMMON = 3;
  var MAX_MISSING_NEAR = 1;

  function norm(s) {
    return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // distanza di modifica limitata a 1 (basta per refusi e singolare/plurale)
  function within1(a, b) {
    if (Math.abs(a.length - b.length) > 1) return false;
    var i = 0, j = 0, diff = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++diff > 1) return false;
      if (a.length > b.length) i++;
      else if (a.length < b.length) j++;
      else { i++; j++; }
    }
    return diff + (a.length - i) + (b.length - j) <= 1;
  }

  function createIndex(data) {
    var ingById = new Map();
    data.ingredients.forEach(function (g) {
      g.words = g.k.split(' ');
      ingById.set(g.id, g);
    });
    var recipes = data.recipes.map(function (r) {
      var ids = new Set(r.i.map(function (p) { return p[0]; }));
      return { r: r, ids: ids };
    });
    var byId = new Map(recipes.map(function (x) { return [x.r.id, x]; }));
    var courses = Array.from(new Set(data.recipes.map(function (r) { return r.c; }))).sort();
    return { data: data, ingById: ingById, recipes: recipes, byId: byId, courses: courses };
  }

  function isCore(index, id, selected) {
    var g = index.ingById.get(id);
    if (!g || g.s) return false;
    return g.f >= MIN_COMMON || selected.has(id);
  }

  /** Suggerimenti per quello che l'utente sta scrivendo. */
  function suggest(index, query, selectedIds, limit) {
    var q = norm(query);
    if (q.length < 2) return [];
    var chosen = new Set(selectedIds);
    var stem = q.length >= 4 ? q.slice(0, -1) : q;   // "uovo" -> "uov" trova "uova"
    var out = [];
    index.data.ingredients.forEach(function (g) {
      if (g.s || chosen.has(g.id) || g.f < 2) return;
      var score = 0;
      if (g.k === q) score = 5;
      else if (g.k.indexOf(q) === 0) score = 4;
      else if (g.words.some(function (w) { return w.indexOf(q) === 0; })) score = 3;
      else if (g.k.indexOf(stem) === 0 || g.words.some(function (w) { return w.indexOf(stem) === 0; })) score = 2;
      else if (q.length >= 4 && g.words.some(function (w) { return within1(w, q); })) score = 1;
      else if (q.length >= 3 && g.k.indexOf(q) > 0) score = 1;
      if (score) out.push({ g: g, score: score });
    });
    out.sort(function (a, b) { return b.score - a.score || b.g.f - a.g.f; });
    return out.slice(0, limit || 12).map(function (x) { return x.g; });
  }

  /** Cerca le ricette. mode: 'all' | 'near'. Ritorna [{r, have:[id], miss:[id]}]. */
  function search(index, selectedIds, mode, course) {
    var selected = new Set(selectedIds);
    if (!selected.size) return [];
    var out = [];
    index.recipes.forEach(function (x) {
      if (course && x.r.c !== course) return;
      var have = [], miss = [];
      x.ids.forEach(function (id) {
        if (selected.has(id)) have.push(id);
        else if (isCore(index, id, selected)) miss.push(id);
      });
      if (mode === 'all') {
        if (have.length !== selected.size) return;
      } else if (!have.length || miss.length > MAX_MISSING_NEAR) {
        return;
      }
      out.push({ r: x.r, have: have, miss: miss });
    });
    out.sort(function (a, b) {
      return a.miss.length - b.miss.length || b.have.length - a.have.length ||
        a.r.t.localeCompare(b.r.t, 'it');
    });
    return out;
  }

  /** Ingredienti da mostrare come pulsanti nella schermata Cerca, per categoria. */
  function popular(index, categoryIndex) {
    return index.data.ingredients.filter(function (g) {
      return !g.s && g.c === categoryIndex && g.f >= MIN_COMMON;
    });
  }

  var api = {
    MIN_COMMON: MIN_COMMON, norm: norm, createIndex: createIndex, suggest: suggest,
    search: search, popular: popular, isCore: isCore
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Dispensa = api;
})(typeof window !== 'undefined' ? window : globalThis);
