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
    expanded: {},                // categorie aperte nella schermata Cerca
    lastFav: null
  };

  // ---------- utilita' ----------
  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  var EMOJI = [
    [/pizza/i, '🍕'], [/torte? dolc|torta|crostat/i, '🎂'], [/biscott|pasticcini/i, '🍪'],
    [/dolc|dessert|creme|budini|pasticc/i, '🍰'], [/gelat|sorbett/i, '🍨'], [/liquor|bevand|cocktail/i, '🍹'],
    [/colazion/i, '🥞'], [/primi|minestr|pasta|riso|gnocchi/i, '🍝'], [/zupp|brod|passati/i, '🍲'],
    [/uov|frittat/i, '🍳'], [/pesc|frutti di mare|crostacei/i, '🐟'],
    [/arrost|second|carne|lesso|umido|fritt|bolliti/i, '🍖'], [/insalat/i, '🥗'],
    [/contorn|verdur|legum/i, '🥦'], [/antipast|stuzzich/i, '🥟'], [/sals|condiment/i, '🥫'],
    [/pane|focacc/i, '🍞'], [/unic/i, '🍲']
  ];
  function emojiFor(course) {
    for (var i = 0; i < EMOJI.length; i++) if (EMOJI[i][0].test(course)) return EMOJI[i][1];
    return '🍽️';
  }
  var HUES = [
    [/dolc|torte|biscott|dessert|creme|gelat|budin/i, 335], [/zupp|brod/i, 22], [/primi|pasta|minestr|riso|gnocchi/i, 38],
    [/second|carne|arrost|lesso|umido|fritt/i, 10], [/insalat|contorn|verdur|legum/i, 125], [/antipast/i, 85],
    [/pesc/i, 200], [/bevand|liquor/i, 275], [/pane|pizza|focacc/i, 42], [/sals/i, 4], [/uov|colazion/i, 50]
  ];
  function hueFor(course) {
    for (var i = 0; i < HUES.length; i++) if (HUES[i][0].test(course)) return HUES[i][1];
    return 30;
  }

  var ING_EMOJI = [
    [/^uov/, '🥚'], [/^latte|^panna|^yogurt/, '🥛'], [/^burro/, '🧈'], [/^farina|^semolino|^amido/, '🌾'],
    [/^zucchero|^candito/, '🍬'], [/^miele/, '🍯'], [/^lievito/, '🍞'], [/^cipoll|^scalogno|^porr/, '🧅'],
    [/^aglio/, '🧄'], [/^pomodor|^passata/, '🍅'], [/^patat/, '🥔'], [/^carot/, '🥕'], [/^peperoncin/, '🌶️'],
    [/^peperon/, '🫑'], [/^fung/, '🍄'], [/^limon/, '🍋'], [/^aranc/, '🍊'], [/^mel[ae]$/, '🍎'], [/^per[ae]$/, '🍐'],
    [/^banan/, '🍌'], [/^fragol/, '🍓'], [/^ciliegi/, '🍒'], [/^uva|^uvetta/, '🍇'], [/^pesch/, '🍑'],
    [/^ananas/, '🍍'], [/^cocco/, '🥥'], [/^avocado/, '🥑'], [/^melanzan/, '🍆'], [/^mais/, '🌽'], [/^zucca/, '🎃'],
    [/^broccol|^cavolfiore|^verza|^cavol/, '🥦'], [/^insalat|^lattuga|^rucola|^spinaci|^bietol/, '🥬'],
    [/^cetriol|^zucchin/, '🥒'], [/^oliv|^olio/, '🫒'], [/^noci$|^nocciol|^mandorl|^pinoli|^pistacch|^arachid|^castagn/, '🥜'],
    [/^pane|^pangrattato|^panini/, '🍞'], [/^pasta|^spaghetti|^penne|^tagliatell/, '🍝'], [/^riso/, '🍚'],
    [/formaggio|^parmigiano|^pecorino|^mozzarella|^ricotta|^mascarpone|^grana|^gorgonzola|^provola|^fontina/, '🧀'],
    [/^prosciutto|^pancetta|^guanciale|^salsiccia|^bacon|^speck|^salame|^mortadella/, '🥓'], [/^pollo|^tacchino/, '🍗'],
    [/^manzo|^vitello|^maiale|^agnello|^carne|^coniglio|^bistecca/, '🥩'],
    [/^tonno|^salmone|^merluzzo|^acciughe|^pesce|^baccala|^sogliola|^trota/, '🐟'],
    [/^gamberi|^scampi|^cozze|^vongole|^calamari|^seppie|^polpo/, '🦐'], [/^ciocc|^cacao/, '🍫'],
    [/^vino|^marsala|^rum$|^grappa|^cognac/, '🍷'], [/^caffe/, '☕'], [/^birra/, '🍺'],
    [/^basilic|^prezzemol|^rosmarin|^salvia|^menta|^origano|^timo|^alloro|^maggiorana/, '🌿'],
    [/^sale|^pepe|^spezie|^cannella|^noce moscata|^zafferano|^chiodi|^cumino|^zenzero/, '🧂'],
    [/^fagioli|^ceci|^lenticchie|^piselli|^fave/, '🫘'], [/^brodo/, '🍲'], [/^vaniglia/, '🍦'], [/^aceto/, '🍶']
  ];
  function ingEmoji(g) {
    for (var i = 0; i < ING_EMOJI.length; i++) if (ING_EMOJI[i][0].test(g.k)) return ING_EMOJI[i][1];
    return '';
  }

  var ICON = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>'
  };

  // annunci (attivi solo nell'app o in prova con ?demoads=1): vedi js/ads.js
  var Ads = window.DispensaAds || null;
  function adsButton() {
    if (!Ads || !Ads.available()) return '';
    return Ads.adsFree()
      ? '<span class="tag hot">🚫 Senza annunci ancora ' + esc(Ads.remainingText()) + '</span>'
      : '<button class="btn" data-a="noads">🚫 Niente annunci</button>';
  }
  function adsInfo() {
    if (!Ads || !Ads.available()) return '';
    return '<h2>Annunci</h2><p>Dispensa è gratis grazie alla pubblicità. ' + (Ads.adsFree()
      ? 'Per ora non vedi annunci: ancora ' + esc(Ads.remainingText()) + '.</p>'
      : 'Se ti danno fastidio, guarda un breve video e li togli per 24 ore.</p><p><button class="btn pri" data-a="noads">📺 Guarda un video, niente annunci per 24 ore</button></p>');
  }

  function ingName(id) { var g = state.index.ingById.get(id); return g ? g.n : ''; }
  function isFav(id) { return state.fav.indexOf(id) >= 0; }

  // ---------- pezzi di pagina ----------
  function chip(g, on) {
    var em = ingEmoji(g);
    return '<button class="chip' + (on ? ' on' : '') + '" data-t="' + g.id + '" aria-pressed="' + !!on + '">' +
      (em ? '<i aria-hidden="true">' + em + '</i>' : '') + esc(g.n) + (on ? '<span class="x" aria-hidden="true">×</span>' : '') + '</button>';
  }

  function badge(m) {
    if (!m.miss.length) return '<span class="badge b-ok">Hai tutto</span>';
    var names = m.miss.slice(0, 3).map(ingName).join(', ') + (m.miss.length > 3 ? '…' : '');
    return '<span class="badge b-no">Ti manca: ' + esc(names) + '</span>';
  }

  function heart(id, cls) {
    var on = isFav(id), pop = state.lastFav === id ? ' pop' : '';
    return '<button class="' + cls + (on && cls === 'ib' ? ' on' : '') + pop + '" data-f="' + id + '" aria-label="' +
      (on ? 'Togli dai preferiti' : 'Aggiungi ai preferiti') + '" aria-pressed="' + on + '">' + (on ? '♥' : '♡') + '</button>';
  }

  function card(r, m) {
    var meta = esc(r.c) + ' · ' + plural(r.i.length, 'ingrediente', 'ingredienti');
    return '<div class="card"><a class="card-main" href="#/ricetta/' + r.id + '">' +
      '<div class="em" style="--h:' + hueFor(r.c) + '" aria-hidden="true">' + emojiFor(r.c) + '</div><div class="ci"><b>' + esc(r.t) + '</b>' +
      '<span class="meta">' + meta + '</span>' + (m ? '<br>' + badge(m) : '') + '</div></a>' + heart(r.id, 'heart') + '</div>';
  }

  function adSlot() {
    return CFG.adsEnabled ? '<div class="ad-slot" id="ad-slot" aria-label="Pubblicità"></div>' : '';
  }

  // ---------- schermate ----------
  function viewSearch() {
    var ix = state.index, data = ix.data;
    var sel = state.sel.map(function (id) { return ix.ingById.get(id); }).filter(Boolean);
    var h = '<section class="hero"><div class="floaters" aria-hidden="true"><span>🍅</span><span>🧄</span><span>🧀</span>' +
      '<span>🥕</span><span>🍋</span></div><h1>Dispensa</h1><p>Dimmi cosa hai in casa, ti dico cosa cucinare!</p>' +
      '<div class="stats"><span class="pill">' + plural(data.recipes.length, 'ricetta', 'ricette') + '</span>' +
      '<span class="pill">Funziona offline</span><span class="pill">Gratis</span></div></section>' +
      '<div class="search">' + ICON.search + '<input id="q" type="search" placeholder="Cerca un ingrediente…" autocomplete="off" ' +
      'autocapitalize="none" enterkeyhint="search" aria-label="Cerca un ingrediente" value="' + esc(state.q) + '"></div>' +
      '<div class="chips" id="sug"></div>' +
      '<div class="quick"><button class="btn" data-a="surprise">🎲 Sorprendimi</button>' + adsButton() + '</div>';
    if (!sel.length) {
      h += '<div class="steps3"><div><b>🥕</b>Scegli cosa hai</div><div><b>🔍</b>Cerca le ricette</div><div><b>🍳</b>Cucina!</div></div>';
    }
    h += todayCard();
    h += '<div class="sec"><span>I tuoi ingredienti</span>' +
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

    h += courseTiles();
    var n = D.search(ix, state.sel, state.mode, '').length;
    h += '<div class="cta"><button data-a="go"' + (state.sel.length ? '' : ' disabled') + '>' +
      (state.sel.length ? 'Vedi ' + plural(n, 'ricetta', 'ricette') : 'Scegli almeno un ingrediente') + '</button></div>';
    return h;
  }

  function viewResults() {
    var ix = state.index;
    var all = D.search(ix, state.sel, state.mode, '');
    var counts = {};
    all.forEach(function (m) { counts[m.r.c] = (counts[m.r.c] || 0) + 1; });
    if (state.course && !counts[state.course]) state.course = '';
    var res = state.course ? all.filter(function (m) { return m.r.c === state.course; }) : all;
    var sel = state.sel.map(function (id) { return ix.ingById.get(id); }).filter(Boolean);
    var courses = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
    var h = '<div class="bar"><a class="ib" href="#/" aria-label="Indietro">←</a><h2>' +
      plural(res.length, 'ricetta', 'ricette') + '</h2></div>' +
      '<div class="chips">' + sel.map(function (g) { return chip(g, true); }).join('') + '</div>' +
      '<div class="seg" role="group" aria-label="Modalità di ricerca">' +
      '<button data-m="all" class="' + (state.mode === 'all' ? 'on' : '') + '">Con tutti i miei ingredienti</button>' +
      '<button data-m="near" class="' + (state.mode === 'near' ? 'on' : '') + '">Quasi pronte</button></div>';
    if (courses.length > 1) {
      h += '<div class="scroller" role="group" aria-label="Tipo di piatto"><button class="chip' + (state.course ? '' : ' on') +
        '" data-course="">Tutti <small>' + all.length + '</small></button>' + courses.map(function (c) {
          return '<button class="chip' + (c === state.course ? ' on' : '') + '" data-course="' + esc(c) + '"><i aria-hidden="true">' +
            emojiFor(c) + '</i>' + esc(c) + ' <small>' + counts[c] + '</small></button>';
        }).join('') + '</div>';
    }
    if (!res.length) {
      h += '<div class="emptybox"><div class="big">🥣</div><p>Uh, nessuna ricetta trovata!<br>Prova a togliere un ingrediente' +
        (state.mode === 'all' ? ' oppure guarda le ricette a cui manca solo una cosa.' : '.') + '</p>' +
        (state.mode === 'all' ? '<button class="btn pri" data-m="near">Mostra “Quasi pronte”</button> ' : '') +
        '<button class="btn" data-a="clear-go">Ricomincia</button></div>';
    } else {
      h += res.slice(0, state.shown).map(function (m) { return card(m.r, m); }).join('');
      if (res.length > state.shown) {
        h += '<button class="btn more" data-a="more">Mostra altre ricette (' + (res.length - state.shown) + ')</button>';
      }
      h += adSlot();
    }
    return h;
  }

  // ricetta del giorno: sempre la stessa per tutta la giornata, cambia a mezzanotte
  function todayCard() {
    var ix = state.index;
    var pool = ix.recipes.filter(function (x) { return x.r.c !== 'Altro' && x.r.i.length >= 5 && x.r.i.length <= 12; });
    if (!pool.length) pool = ix.recipes;
    var d = new Date(), day = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
    var r = pool[day % pool.length].r;
    return '<a class="today" href="#/ricetta/' + r.id + '"><div class="em" aria-hidden="true">' + emojiFor(r.c) + '</div>' +
      '<div><span class="lab">🌟 Ricetta del giorno</span><b>' + esc(r.t) + '</b><span class="meta">' + esc(r.c) + ' · ' +
      plural(r.i.length, 'ingrediente', 'ingredienti') + '</span></div></a>';
  }

  function courseStats() {
    var ix = state.index;
    if (!ix.courseCounts) {
      ix.courseCounts = {};
      ix.recipes.forEach(function (x) { ix.courseCounts[x.r.c] = (ix.courseCounts[x.r.c] || 0) + 1; });
    }
    return ix.courseCounts;
  }

  // sfoglia le ricette per tipo di piatto, anche senza scegliere ingredienti
  function courseTiles() {
    var counts = courseStats();
    var names = Object.keys(counts).filter(function (c) { return counts[c] >= 8; }).sort(function (a, b) {
      return (a === 'Altro') - (b === 'Altro') || counts[b] - counts[a];
    }).slice(0, 12);
    if (!names.length) return '';
    return '<div class="sec"><span>Sfoglia per piatto</span></div><div class="tiles">' + names.map(function (c) {
      return '<a class="tile" style="--h:' + hueFor(c) + '" href="#/piatti/' + encodeURIComponent(c) + '"><span class="em2" aria-hidden="true">' +
        emojiFor(c) + '</span><b>' + esc(c === 'Altro' ? 'Altre ricette' : c) + '</b><small>' + counts[c] + ' ricette</small></a>';
    }).join('') + '</div>';
  }

  function viewCourse(course) {
    var ix = state.index;
    var list = ix.recipes.filter(function (x) { return x.r.c === course; }).sort(function (a, b) {
      return a.r.t.localeCompare(b.r.t, 'it');
    });
    var h = '<div class="bar"><a class="ib" href="#/" aria-label="Indietro">←</a><h2>' + emojiFor(course) + ' ' +
      esc(course === 'Altro' ? 'Altre ricette' : course) + '</h2></div><p class="sub" style="padding:0 18px">' +
      plural(list.length, 'ricetta', 'ricette') + ', in ordine alfabetico</p>';
    h += list.slice(0, state.shown).map(function (x) { return card(x.r, null); }).join('');
    if (list.length > state.shown) {
      h += '<button class="btn more" data-a="more">Mostra altre ricette (' + (list.length - state.shown) + ')</button>';
    }
    return h;
  }

  function viewFavorites() {
    var ix = state.index;
    var list = state.fav.map(function (id) { return ix.byId.get(id); }).filter(Boolean);
    return '<header class="top"><h1>♥ Preferiti</h1><p class="sub">Le ricette che hai salvato.</p></header>' +
      (list.length ? list.map(function (x) { return card(x.r, null); }).join('')
        : '<div class="emptybox"><div class="big">♡</div><p>Tocca il cuore su una ricetta per salvarla qui.<br>I preferiti restano sul tuo dispositivo.</p></div>');
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
    var haveN = lines.filter(function (l) { return l.ids.some(function (i) { return selected.has(i); }); }).length;
    var steps = r.st.split('\n').filter(Boolean);
    var src = ix.data.sources[r.src] || {};
    var stepsHtml = src.passi === 'prosa'
      ? '<div class="prose">' + steps.map(function (s) { return '<p>' + esc(s) + '</p>'; }).join('') + '</div>'
      : '<ol class="stepcards">' + steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>';
    return '<div class="bar"><button class="ib" data-a="back" aria-label="Indietro">←</button><span style="flex:1"></span>' +
      heart(r.id, 'ib') + '</div>' +
      '<div class="cover" style="--h:' + hueFor(r.c) + '"><div class="big" aria-hidden="true">' + emojiFor(r.c) + '</div></div>' +
      '<article class="detail"><h2>' + esc(r.t) + '</h2><div class="tags"><span class="tag">' + esc(r.c) + '</span>' +
      (r.sv ? '<span class="tag">per ' + plural(r.sv, 'persona', 'persone') + '</span>' : '') +
      '<span class="tag">' + plural(lines.length, 'ingrediente', 'ingredienti') + '</span>' +
      (selected.size ? '<span class="tag hot">🎯 ne hai ' + haveN + ' su ' + lines.length + '</span>' : '') + '</div>' +
      '<div class="actions"><button class="btn pri" data-a="share" data-id="' + r.id + '">Condividi</button></div>' +
      '<h3>Ingredienti</h3>' + (selected.size ? '<p class="legend"><span class="have">✓ ce l’hai</span> · <span class="miss">+ ti manca</span></p>' : '') +
      '<ul class="ing">' + items + '</ul><h3>Procedimento</h3>' + stepsHtml +
      '<div class="credit">' + (src.auto ? '<span class="auto">Tradotta automaticamente dall’inglese</span><br>' : '') +
      'Fonte: <a href="' + esc(r.u) + '" target="_blank" rel="noopener">' + esc(src.nome || r.src) +
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
        '<a href="' + esc(src[k].licenza_url) + '" target="_blank" rel="noopener">' + esc(src[k].licenza) + '</a>' +
        (src[k].auto ? ' (tradotta automaticamente)' : '') + '</li>';
    });
    h += '</ul><p>Ogni ricetta rimanda alla pagina originale, dove si vede l’elenco degli autori. ' +
      'I testi di Wikibooks sono stati ripuliti e riorganizzati; restano sotto licenza CC BY-SA 4.0. ' +
      'Le ricette tradotte dall’inglese possono contenere errori di traduzione.</p>' +
      adsInfo() +
      '<h2>Tutte le ricette</h2><p><a href="ricette/">Sfoglia l’elenco completo delle ricette</a>.</p>' +
      '<h2>Privacy</h2><p>Non ti chiediamo nessun account e non raccogliamo dati personali. Preferiti e ingredienti scelti restano salvati solo sul tuo dispositivo.' +
      (Ads && Ads.available() ? ' Gli annunci sono forniti da Google AdMob, che può usare l’identificativo pubblicitario del dispositivo secondo le tue scelte di consenso.' : '') + '</p>' +
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
    var mc = h.match(/^\/piatti\/(.+)$/);
    if (mc) return { name: 'piatto', course: decodeURIComponent(mc[1]), nav: 'cerca' };
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
    else if (r.name === 'piatto') h = viewCourse(r.course);
    else if (r.name === 'preferiti') h = viewFavorites();
    else if (r.name === 'dettaglio') h = viewDetail(r.id);
    else if (r.name === 'info') h = viewInfo();
    else h = viewSearch();
    app.innerHTML = h;
    state.lastFav = null;
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
    if (i < 0) { state.fav.push(id); state.lastFav = id; } else state.fav.splice(i, 1);
    save('fav', state.fav);
  }
  function share(id) {
    var x = state.index.byId.get(id); if (!x) return;
    var url = location.href.split('#')[0] + '#/ricetta/' + id;
    if (navigator.share) { navigator.share({ title: x.r.t, text: x.r.t + ' – Dispensa', url: url }).catch(function () {}); return; }
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { alert('Link copiato'); });
  }
  function surprise() {
    var all = state.index.recipes;
    location.hash = '#/ricetta/' + all[Math.floor(Math.random() * all.length)].r.id;
  }

  app.addEventListener('click', function (e) {
    var t = e.target.closest('[data-t],[data-f],[data-a],[data-m],[data-course]');
    if (!t) return;
    if (t.dataset.f) { toggleFav(parseInt(t.dataset.f, 10)); render(true); return; }
    if (t.dataset.t) { toggleIngredient(parseInt(t.dataset.t, 10)); render(true); return; }
    if (t.dataset.m) { state.mode = t.dataset.m; state.shown = PAGE; save('mode', state.mode); render(true); return; }
    if (t.hasAttribute('data-course')) { state.course = t.dataset.course; state.shown = PAGE; render(true); return; }
    switch (t.dataset.a) {
      case 'go': location.hash = '#/risultati'; break;
      case 'clear': state.sel = []; state.q = ''; save('sel', state.sel); render(true); break;
      case 'clear-go': state.sel = []; state.q = ''; save('sel', state.sel); location.hash = '#/'; break;
      case 'expand': state.expanded[t.dataset.c] = !state.expanded[t.dataset.c]; render(true); break;
      case 'more': state.shown += PAGE; render(true); break;
      case 'share': share(parseInt(t.dataset.id, 10)); break;
      case 'surprise': surprise(); break;
      case 'noads':
        if (Ads && confirm('Guarda un breve video per togliere gli annunci per 24 ore?')) Ads.offerRemoval();
        break;
      case 'back': if (history.length > 1) history.back(); else location.hash = '#/'; break;
    }
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
  // gli annunci a schermo intero compaiono solo quando si ESCE da una ricetta, mai mentre la si legge
  var prevRoute = null;
  function trackRouteForAds() {
    var r = route();
    if (Ads) {
      if (r.name === 'dettaglio') Ads.recipeOpened();
      if (prevRoute === 'dettaglio' && r.name !== 'dettaglio') Ads.maybeInterstitial();
    }
    prevRoute = r.name;
  }
  window.addEventListener('hashchange', function () { state.shown = PAGE; render(false); trackRouteForAds(); });

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
      trackRouteForAds();
      if (Ads) {
        Ads.onChange = function () { render(true); };
        Ads.init();
      }
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
