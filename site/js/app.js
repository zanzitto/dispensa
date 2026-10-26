/* Dispensa – interfaccia. La logica di ricerca sta in search.js. */
(function () {
  'use strict';

  var D = window.Dispensa;
  var CFG = window.DISPENSA_CONFIG || {};
  var PAGE = CFG.pageSize || 30;
  var app = document.getElementById('app');

  // ---------- memoria sul dispositivo (preferiti, ingredienti scelti, modo) ----------
  function load(key, def) {
    try { var v = localStorage.getItem('dispensa.' + key); return v ? JSON.parse(v) : def; } catch (e) { return def; }
  }
  function save(key, val) {
    try { localStorage.setItem('dispensa.' + key, JSON.stringify(val)); } catch (e) { /* modalita' privata */ }
  }

  var state = {
    index: null,
    sel: load('sel', []),        // id degli ingredienti scelti
    fav: load('fav', []),        // id delle ricette preferite
    mode: load('mode', 'all'),   // 'all' | 'near'
    course: '',
    shown: PAGE,
    q: '',
    expanded: {}                 // categorie aperte nella schermata Cerca
  };

  // ---------- utilita' ----------
  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  var EMOJI = [
    [/pizza/i, '🍕'], [/torte? dolc|torta|crostat/i, '🎂'], [/biscott|pasticcini/i, '🍪'],
    [/dolc|dessert|creme|budini|pasticc/i, '🍰'], [/gelat|sorbett/i, '🍨'], [/liquor|bevand|cocktail/i, '🍹'],
    [/primi|minestr|pasta|riso|gnocchi/i, '🍝'], [/zupp|brod|passati/i, '🍲'], [/uov|frittat/i, '🍳'],
    [/pesc|frutti di mare|crostacei/i, '🐟'], [/arrost|second|carne|lesso|umido|fritt|bolliti/i, '🍖'],
    [/contorn|verdur|insalat|legum/i, '🥦'], [/antipast|stuzzich/i, '🥗'], [/sals|condiment/i, '🥫'],
    [/pane|focacc/i, '🍞'], [/unic/i, '🍲']
  ];
  function emojiFor(course) {
    for (var i = 0; i < EMOJI.length; i++) if (EMOJI[i][0].test(course)) return EMOJI[i][1];
    return '🍽️';
  }

  function ingName(id) { var g = state.index.ingById.get(id); return g ? g.n : ''; }
  function isFav(id) { return state.fav.indexOf(id) >= 0; }

  // ---------- pezzi di pagina ----------
  function chip(g, on) {
    return '<button class="chip' + (on ? ' on' : '') + '" data-t="' + g.id + '" aria-pressed="' + !!on + '">' +
      esc(g.n) + (on ? '<span class="x" aria-hidden="true">×</span>' : '') + '</button>';
  }

  function badge(m) {
    if (!m.miss.length) return '<span class="badge b-ok">Hai tutto</span>';
    var names = m.miss.slice(0, 3).map(ingName).join(', ') + (m.miss.length > 3 ? '…' : '');
    return '<span class="badge b-no">Ti manca: ' + esc(names) + '</span>';
  }

  function card(r, m) {
    var meta = esc(r.c) + (r.sv ? ' · ' + plural(r.sv, 'persona', 'persone') : '');
    return '<div class="card"><a class="card-main" href="#/ricetta/' + r.id + '">' +
      '<div class="em" aria-hidden="true">' + emojiFor(r.c) + '</div><div class="ci"><b>' + esc(r.t) + '</b>' +
      '<span class="meta">' + meta + '</span>' + (m ? '<br>' + badge(m) : '') + '</div></a>' +
      '<button class="heart" data-f="' + r.id + '" aria-label="' + (isFav(r.id) ? 'Togli dai preferiti' : 'Aggiungi ai preferiti') +
      ': ' + esc(r.t) + '" aria-pressed="' + isFav(r.id) + '">' + (isFav(r.id) ? '♥' : '♡') + '</button></div>';
  }

  function adSlot() {
    return CFG.adsEnabled ? '<div class="ad-slot" id="ad-slot" aria-label="Pubblicità"></div>' : '';
  }

  // ---------- schermate ----------
  function viewSearch() {
    var ix = state.index, data = ix.data;
    var sel = state.sel.map(function (id) { return ix.ingById.get(id); }).filter(Boolean);
    var h = '<header class="top"><h1>🍅 Dispensa</h1><p class="sub">Scegli gli ingredienti che hai in casa e trova le ricette.</p></header>' +
      '<div class="search"><input id="q" type="search" placeholder="Cerca un ingrediente…" autocomplete="off" ' +
      'autocapitalize="none" enterkeyhint="search" aria-label="Cerca un ingrediente" value="' + esc(state.q) + '"></div>' +
      '<div class="chips" id="sug"></div>' +
      '<div class="sec"><span>I tuoi ingredienti</span>' +
      (sel.length ? '<button class="link" data-a="clear">Svuota</button>' : '') + '</div>' +
      (sel.length ? '<div class="chips">' + sel.map(function (g) { return chip(g, true); }).join('') + '</div>'
        : '<p class="empty">Ancora nessuno. Scrivili qui sopra o toccali qui sotto.</p>');

    data.categories.forEach(function (name, ci) {
      var list = D.popular(ix, ci).filter(function (g) { return state.sel.indexOf(g.id) < 0; });
      if (!list.length) return;
      var open = state.expanded[ci], shown = open ? list : list.slice(0, 14);
      h += '<div class="sec"><span>' + esc(name) + '</span></div><div class="chips">' +
        shown.map(function (g) { return chip(g, false); }).join('') + '</div>';
      if (list.length > 14) {
        h += '<div class="chips"><button class="link" data-a="expand" data-c="' + ci + '">' +
          (open ? 'Mostra meno' : 'Mostra tutti (' + list.length + ')') + '</button></div>';
      }
    });

    var n = D.search(ix, state.sel, state.mode, '').length;
    h += '<div class="cta"><button data-a="go"' + (state.sel.length ? '' : ' disabled') + '>' +
      (state.sel.length ? 'Vedi ' + plural(n, 'ricetta', 'ricette') : 'Scegli almeno un ingrediente') + '</button></div>';
    return h;
  }

  function viewResults() {
    var ix = state.index;
    var res = D.search(ix, state.sel, state.mode, state.course);
    var sel = state.sel.map(function (id) { return ix.ingById.get(id); }).filter(Boolean);
    var h = '<div class="bar"><a class="ib" href="#/" aria-label="Indietro">←</a><h2>' +
      plural(res.length, 'ricetta', 'ricette') + '</h2></div>' +
      '<div class="chips">' + sel.map(function (g) { return chip(g, true); }).join('') + '</div>' +
      '<div class="seg" role="group" aria-label="Modalità di ricerca">' +
      '<button data-m="all" class="' + (state.mode === 'all' ? 'on' : '') + '">Con tutti i miei ingredienti</button>' +
      '<button data-m="near" class="' + (state.mode === 'near' ? 'on' : '') + '">Quasi pronte</button></div>' +
      '<div class="filter"><select data-a="course" aria-label="Tipo di piatto"><option value="">Tutti i piatti</option>' +
      ix.courses.map(function (c) {
        return '<option value="' + esc(c) + '"' + (c === state.course ? ' selected' : '') + '>' + esc(c) + '</option>';
      }).join('') + '</select></div>';
    if (!res.length) {
      h += '<p class="empty">Nessuna ricetta trovata. Prova a togliere un ingrediente' +
        (state.mode === 'all' ? ' o passa a “Quasi pronte”' : '') + '.</p>';
    } else {
      h += res.slice(0, state.shown).map(function (m) { return card(m.r, m); }).join('');
      if (res.length > state.shown) {
        h += '<button class="btn more" data-a="more">Mostra altre ricette (' + (res.length - state.shown) + ')</button>';
      }
      h += adSlot();
    }
    return h;
  }

  function viewFavorites() {
    var ix = state.index;
    var list = state.fav.map(function (id) { return ix.byId.get(id); }).filter(Boolean);
    return '<header class="top"><h1>♥ Preferiti</h1></header>' +
      (list.length ? list.map(function (x) { return card(x.r, null); }).join('')
        : '<p class="empty">Tocca il cuore su una ricetta per salvarla qui. I preferiti restano sul tuo dispositivo.</p>');
  }

  function viewDetail(id) {
    var ix = state.index, x = ix.byId.get(id);
    if (!x) return '<div class="bar"><a class="ib" href="#/" aria-label="Indietro">←</a><h2>Ricetta non trovata</h2></div>';
    var r = x.r, selected = new Set(state.sel), lines = [], byLine = {};
    r.i.forEach(function (p) {
      var key = p[1];
      if (!byLine[key]) { byLine[key] = { text: key, ids: [] }; lines.push(byLine[key]); }
      byLine[key].ids.push(p[0]);
    });
    var items = lines.map(function (l) {
      var cls = '';
      if (l.ids.some(function (i) { return selected.has(i); })) cls = 'have';
      else if (selected.size && l.ids.some(function (i) { return D.isCore(ix, i, selected); })) cls = 'miss';
      return '<li' + (cls ? ' class="' + cls + '"' : '') + '>' + esc(l.text) + '</li>';
    }).join('');
    var steps = r.st.split('\n').filter(Boolean);
    var stepsHtml = r.src === 'wikibooks'
      ? '<ol>' + steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>'
      : steps.map(function (s) { return '<p>' + esc(s) + '</p>'; }).join('');
    var src = ix.data.sources[r.src] || {};
    return '<div class="bar"><button class="ib" data-a="back" aria-label="Indietro">←</button><span style="flex:1"></span>' +
      '<button class="ib" data-f="' + r.id + '" aria-label="Preferito" aria-pressed="' + isFav(r.id) + '">' +
      (isFav(r.id) ? '♥' : '♡') + '</button></div>' +
      '<article class="detail"><div class="big" aria-hidden="true">' + emojiFor(r.c) + '</div><h2>' + esc(r.t) + '</h2>' +
      '<div class="meta">' + esc(r.c) + (r.sv ? ' · per ' + plural(r.sv, 'persona', 'persone') : '') + '</div>' +
      '<div class="actions"><button class="btn" data-a="share" data-id="' + r.id + '">Condividi</button></div>' +
      '<h3>Ingredienti</h3>' + (selected.size ? '<p class="meta"><span class="have">Verde</span>: ce l’hai · <span class="miss">arancione</span>: ti manca</p>' : '') +
      '<ul>' + items + '</ul><h3>Procedimento</h3>' + stepsHtml +
      '<div class="credit">Fonte: <a href="' + esc(r.u) + '" target="_blank" rel="noopener">' + esc(src.nome || r.src) +
      '</a> · Licenza: ' + esc(src.licenza || '') + '</div></article>' + adSlot();
  }

  function viewInfo() {
    var src = state.index.data.sources, n = state.index.data.recipes.length;
    var h = '<header class="top"><h1>ℹ️ Info</h1></header><div class="page">' +
      '<h2>Come funziona</h2><p>Scegli gli ingredienti che hai in casa. Dispensa cerca tra ' + n + ' ricette, direttamente sul tuo dispositivo: ' +
      'nessun account, nessuna intelligenza artificiale, funziona anche senza connessione.</p>' +
      '<ul><li><b>Con tutti i miei ingredienti</b>: solo le ricette che li contengono tutti.</li>' +
      '<li><b>Quasi pronte</b>: ricette a cui manca al massimo un ingrediente.</li>' +
      '<li>Sale, pepe, olio e acqua si danno per scontati.</li></ul>' +
      '<h2>Fonti e licenze</h2><p>Le ricette provengono da opere libere. Grazie agli autori e ai volontari che le hanno scritte.</p><ul>';
    Object.keys(src).forEach(function (k) {
      h += '<li><a href="' + esc(src[k].url) + '" target="_blank" rel="noopener">' + esc(src[k].nome) + '</a> – ' +
        '<a href="' + esc(src[k].licenza_url) + '" target="_blank" rel="noopener">' + esc(src[k].licenza) + '</a></li>';
    });
    h += '</ul><p>Ogni ricetta rimanda alla pagina originale, dove si vede l’elenco degli autori. ' +
      'I testi di Wikibooks sono stati ripuliti e riorganizzati; restano sotto licenza CC BY-SA 4.0.</p>' +
      '<h2>Privacy</h2><p>L’app non raccoglie dati personali. Preferiti e ingredienti scelti restano salvati solo sul tuo dispositivo.</p>' +
      (CFG.contactEmail ? '<h2>Contatti</h2><p><a href="mailto:' + esc(CFG.contactEmail) + '">' + esc(CFG.contactEmail) + '</a></p>' : '') +
      '<p class="meta">Versione dati: ' + esc(state.index.data.version) + '</p></div>';
    return h;
  }

  // ---------- suggerimenti mentre si scrive (aggiorna solo quella parte, cosi' la tastiera non si chiude) ----------
  function updateSuggestions() {
    var box = document.getElementById('sug');
    if (!box) return;
    var q = state.q.trim();
    if (q.length < 2) { box.innerHTML = ''; return; }
    var list = D.suggest(state.index, q, state.sel, 12);
    box.innerHTML = list.length ? list.map(function (g) { return chip(g, false); }).join('')
      : '<span class="empty" style="margin:0">Nessun ingrediente trovato per “' + esc(q) + '”</span>';
  }

  // ---------- router ----------
  function route() {
    var h = location.hash.replace(/^#/, '') || '/';
    var m = h.match(/^\/ricetta\/(\d+)$/);
    if (m) return { name: 'dettaglio', id: parseInt(m[1], 10), nav: '' };
    if (h === '/risultati') return { name: 'risultati', nav: 'cerca' };
    if (h === '/preferiti') return { name: 'preferiti', nav: 'preferiti' };
    if (h === '/info') return { name: 'info', nav: 'info' };
    return { name: 'cerca', nav: 'cerca' };
  }

  function render(keepScroll) {
    if (!state.index) return;
    var y = keepScroll ? window.scrollY : 0, r = route(), h;
    if (r.name === 'risultati' && !state.sel.length) { location.replace('#/'); return; }
    if (r.name === 'risultati') h = viewResults();
    else if (r.name === 'preferiti') h = viewFavorites();
    else if (r.name === 'dettaglio') h = viewDetail(r.id);
    else if (r.name === 'info') h = viewInfo();
    else h = viewSearch();
    app.innerHTML = h;
    Array.prototype.forEach.call(document.querySelectorAll('#nav a'), function (a) {
      a.classList.toggle('on', a.getAttribute('data-nav') === r.nav);
    });
    if (r.name === 'cerca') updateSuggestions();
    var t = r.name === 'dettaglio' && state.index.byId.get(r.id);
    document.title = t ? t.r.t + ' – Dispensa' : 'Dispensa – ricette dai tuoi ingredienti';
    window.scrollTo(0, y);
  }

  // ---------- azioni ----------
  function toggleIngredient(id) {
    var i = state.sel.indexOf(id);
    if (i < 0) state.sel.push(id); else state.sel.splice(i, 1);
    state.q = ''; state.shown = PAGE;
    save('sel', state.sel);
  }
  function toggleFav(id) {
    var i = state.fav.indexOf(id);
    if (i < 0) state.fav.push(id); else state.fav.splice(i, 1);
    save('fav', state.fav);
  }
  function share(id) {
    var x = state.index.byId.get(id); if (!x) return;
    var url = location.href.split('#')[0] + '#/ricetta/' + id;
    if (navigator.share) { navigator.share({ title: x.r.t, text: x.r.t + ' – Dispensa', url: url }).catch(function () {}); return; }
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { alert('Link copiato'); });
  }

  app.addEventListener('click', function (e) {
    var t = e.target.closest('[data-t],[data-f],[data-a],[data-m]');
    if (!t) return;
    if (t.dataset.f) { toggleFav(parseInt(t.dataset.f, 10)); render(true); return; }
    if (t.dataset.t) { toggleIngredient(parseInt(t.dataset.t, 10)); render(true); return; }
    if (t.dataset.m) { state.mode = t.dataset.m; state.shown = PAGE; save('mode', state.mode); render(true); return; }
    switch (t.dataset.a) {
      case 'go': location.hash = '#/risultati'; break;
      case 'clear': state.sel = []; state.q = ''; save('sel', state.sel); render(true); break;
      case 'expand': state.expanded[t.dataset.c] = !state.expanded[t.dataset.c]; render(true); break;
      case 'more': state.shown += PAGE; render(true); break;
      case 'share': share(parseInt(t.dataset.id, 10)); break;
      case 'back': if (history.length > 1) history.back(); else location.hash = '#/'; break;
    }
  });
  app.addEventListener('change', function (e) {
    if (e.target.dataset.a === 'course') { state.course = e.target.value; state.shown = PAGE; render(true); }
  });
  app.addEventListener('input', function (e) {
    if (e.target.id === 'q') { state.q = e.target.value; updateSuggestions(); }
  });
  app.addEventListener('keydown', function (e) {
    if (e.target.id === 'q' && e.key === 'Enter') {
      var first = D.suggest(state.index, state.q, state.sel, 1)[0];
      if (first) { toggleIngredient(first.id); render(true); var q = document.getElementById('q'); if (q) q.focus(); }
    }
  });
  window.addEventListener('hashchange', function () { state.shown = PAGE; render(false); });

  // ---------- avvio ----------
  function start() {
    fetch('data/recipes.json').then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (data) {
      state.index = D.createIndex(data);
      // scarta ingredienti/ricette salvati che non esistono piu' dopo un aggiornamento dei dati
      state.sel = state.sel.filter(function (id) { return state.index.ingById.has(id); });
      state.fav = state.fav.filter(function (id) { return state.index.byId.has(id); });
      render(false);
    }).catch(function () {
      app.innerHTML = '<p class="loading">Non riesco a caricare le ricette.<br>' +
        '<button class="btn" onclick="location.reload()">Riprova</button></p>';
    });
  }
  start();

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
})();
