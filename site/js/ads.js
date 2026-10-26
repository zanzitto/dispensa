/* Dispensa – annunci per l'app (Google AdMob tramite il plugin Capacitor "@capacitor-community/admob").
 *
 * Sul sito web questo modulo non fa nulla. Si attiva solo:
 *   - dentro l'app nativa (Capacitor) quando DISPENSA_CONFIG.ads.enabled e' true, oppure
 *   - in "prova" sul sito aprendo l'indirizzo con ?demoads=1 (annunci finti, per vedere come si comportano).
 *
 * Formati usati (scelti per rendere senza far scappare gli utenti):
 *   - banner fisso in basso;
 *   - interstitial a schermo intero SOLO quando si esce da una ricetta (mai mentre si cucina), con limiti di frequenza;
 *   - video "a premio": l'utente lo guarda per scelta e toglie gli annunci per 24 ore.
 *
 * Regole importanti:
 *   - in sviluppo usa SEMPRE gli annunci di prova (testMode: true). Cliccare sui tuoi annunci veri fa chiudere l'account AdMob.
 *   - tutto e' protetto da try/catch: un problema con gli annunci non deve mai rompere l'app.
 */
(function (root) {
  'use strict';

  var CFG = (root.DISPENSA_CONFIG || {}).ads || {};
  var simulate = !!CFG.simulate || /[?&]demoads=1/.test(root.location ? root.location.search : '');

  // Codici di prova pubblicati da Google (da ricontrollare nella documentazione AdMob prima dell'uso)
  var TEST_UNITS = {
    android: { banner: 'ca-app-pub-3940256099942544/6300978111', interstitial: 'ca-app-pub-3940256099942544/1033173712', rewarded: 'ca-app-pub-3940256099942544/5224354917' },
    ios: { banner: 'ca-app-pub-3940256099942544/2934735716', interstitial: 'ca-app-pub-3940256099942544/4411468910', rewarded: 'ca-app-pub-3940256099942544/1712485313' }
  };
  var LIM = {
    minSecondsBetweenInterstitials: 240,   // al massimo una ogni 4 minuti
    recipesBeforeFirstInterstitial: 5,     // niente interstitial finche' non ha aperto 5 ricette
    recipesBetweenInterstitials: 3,        // poi una ogni 3 ricette, se sono passati i minuti sopra
    noAdsHours: 24,                        // premio del video
    bannerBottomMargin: 72                 // spazio per la barra di navigazione: da regolare dopo la prova sul telefono
  };
  Object.keys(CFG.limits || {}).forEach(function (k) { LIM[k] = CFG.limits[k]; });
  var testMode = CFG.testMode !== false;   // se non dici il contrario, restano gli annunci di prova

  // ---------- stato salvato sul dispositivo ----------
  var KEY = 'dispensa.ads';
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; }
  }
  var st = load();
  st.noAdsUntil = st.noAdsUntil || 0; st.lastInterstitialAt = st.lastInterstitialAt || 0;
  st.opened = st.opened || 0; st.sinceInterstitial = st.sinceInterstitial || 0;
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* modalita' privata */ } }

  // ---------- piattaforma ----------
  function cap() { return root.Capacitor; }
  function isNative() { var c = cap(); return !!(c && c.isNativePlatform && c.isNativePlatform()); }
  function plugin() { var c = cap(); return isNative() && c.Plugins ? c.Plugins.AdMob : null; }
  function platform() { var c = cap(); return c && c.getPlatform ? c.getPlatform() : 'web'; }
  function enabled() { return !!(simulate || (CFG.enabled && plugin())); }
  function unit(kind) {
    var p = platform(), own = CFG.units && CFG.units[p] && CFG.units[p][kind];
    if (!testMode && own) return own;
    return testMode && TEST_UNITS[p] ? TEST_UNITS[p][kind] : own || '';
  }
  function adsFree() { return Date.now() < st.noAdsUntil; }

  var api = { onChange: null };
  function changed() { if (typeof api.onChange === 'function') { try { api.onChange(); } catch (e) { /* ignora */ } } }
  function setAdHeight(h) { try { document.documentElement.style.setProperty('--ad-h', (h || 0) + 'px'); } catch (e) { /* ignora */ } }

  // ---------- finti annunci per provare l'esperienza sul sito ----------
  function overlay(html) {
    var d = document.createElement('div');
    d.className = 'adm'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true');
    d.innerHTML = '<div class="adm-box">' + html + '</div>';
    document.body.appendChild(d);
    return d;
  }
  function countdown(box, seconds, btnSel, done) {
    var btn = box.querySelector(btnSel), n = seconds;
    btn.disabled = true;
    var t = setInterval(function () {
      n--; btn.textContent = n > 0 ? btn.dataset.wait.replace('{n}', n) : btn.dataset.ready;
      if (n <= 0) { clearInterval(t); btn.disabled = false; if (done) done(); }
    }, 1000);
    btn.textContent = btn.dataset.wait.replace('{n}', n);
  }
  function mockBanner() {
    if (document.getElementById('adbanner')) return;
    var b = document.createElement('div');
    b.id = 'adbanner'; b.className = 'adbanner'; b.textContent = 'Annuncio di prova · banner';
    document.body.appendChild(b); setAdHeight(50);
  }
  function mockInterstitial() {
    return new Promise(function (resolve) {
      var o = overlay('<p class="adm-tag">Annuncio di prova</p><div class="adm-art">📺</div><p>Qui comparirebbe un annuncio a schermo intero.</p>' +
        '<button class="btn" data-wait="Chiudi tra {n}…" data-ready="Chiudi ✕">Chiudi</button>');
      countdown(o, 3, 'button', null);
      o.querySelector('button').addEventListener('click', function () { o.remove(); resolve(); });
    });
  }
  function mockRewarded() {
    return new Promise(function (resolve) {
      var o = overlay('<p class="adm-tag">Video di prova</p><div class="adm-art">🎬</div><p>Guarda il video fino alla fine per ottenere il premio.</p>' +
        '<button class="btn pri" data-wait="Video in corso… {n}" data-ready="Ottieni il premio 🎁">Video</button>' +
        '<button class="link adm-skip" type="button">Annulla</button>');
      countdown(o, 5, '.btn', null);
      o.querySelector('.btn').addEventListener('click', function () { o.remove(); resolve(true); });
      o.querySelector('.adm-skip').addEventListener('click', function () { o.remove(); resolve(false); });
    });
  }

  // ---------- plugin nativo ----------
  var ready = false, interstitialReady = false, bannerOn = false;

  function showBanner() {
    if (!enabled() || adsFree()) return;
    bannerOn = true;
    if (simulate && !plugin()) { mockBanner(); return; }
    var AdMob = plugin(), id = unit('banner');
    if (!AdMob || !id) return;
    AdMob.showBanner({ adId: id, adSize: 'ADAPTIVE_BANNER', position: 'BOTTOM_CENTER', margin: LIM.bannerBottomMargin, isTesting: testMode })
      .catch(function () { /* nessun annuncio disponibile */ });
  }
  function hideBanner() {
    bannerOn = false;
    var b = document.getElementById('adbanner'); if (b) b.remove();
    setAdHeight(0);
    var AdMob = plugin();
    if (AdMob && AdMob.removeBanner) { try { AdMob.removeBanner(); } catch (e) { /* ignora */ } }
  }
  function prepareInterstitial() {
    var AdMob = plugin(), id = unit('interstitial');
    interstitialReady = false;
    if (simulate && !AdMob) { interstitialReady = true; return; }
    if (!AdMob || !id) return;
    AdMob.prepareInterstitial({ adId: id, isTesting: testMode }).then(function () { interstitialReady = true; }).catch(function () {});
  }

  /** Da chiamare una volta all'avvio dell'app. */
  api.init = function () {
    if (!enabled() || ready) return Promise.resolve();
    ready = true;
    var AdMob = plugin();
    if (!AdMob) { showBanner(); prepareInterstitial(); changed(); return Promise.resolve(); }
    return Promise.resolve()
      // iPhone: richiesta di permesso al tracciamento (obbligatoria prima di mostrare annunci personalizzati)
      .then(function () { return platform() === 'ios' && AdMob.requestTrackingAuthorization ? AdMob.requestTrackingAuthorization() : null; })
      // Europa: modulo del consenso (UMP) di Google
      .then(function () { return AdMob.requestConsentInfo(); })
      .then(function (info) {
        if (info && info.isConsentFormAvailable && info.status === 'REQUIRED') return AdMob.showConsentForm();
      })
      .then(function () { return AdMob.initialize({ initializeForTesting: testMode }); })
      .then(function () {
        AdMob.addListener('bannerAdSizeChanged', function (s) { setAdHeight(s && s.height); });
        AdMob.addListener('interstitialAdDismissed', function () { prepareInterstitial(); });
        showBanner(); prepareInterstitial(); changed();
      })
      .catch(function () { ready = false; });
  };

  api.available = function () { return enabled(); };
  api.adsFree = adsFree;
  api.remainingText = function () {
    var ms = st.noAdsUntil - Date.now(); if (ms <= 0) return '';
    var m = Math.ceil(ms / 60000), h = Math.floor(m / 60);
    return h ? h + ' h ' + (m % 60) + ' min' : m + ' min';
  };

  /** Una ricetta e' stata aperta (serve a contare quando mostrare un interstitial). */
  api.recipeOpened = function () {
    st.opened++; st.sinceInterstitial++; save();
    if (ready && !bannerOn && !adsFree()) showBanner();   // il premio di 24 ore e' scaduto: il banner torna
  };

  /** Da chiamare quando l'utente ESCE da una ricetta: mostra un interstitial solo se i limiti lo permettono. */
  api.maybeInterstitial = function () {
    try {
      if (!enabled() || adsFree() || !ready || !interstitialReady) return;
      var now = Date.now();
      if (st.opened < LIM.recipesBeforeFirstInterstitial) return;
      if (st.sinceInterstitial < LIM.recipesBetweenInterstitials) return;
      if (now - st.lastInterstitialAt < LIM.minSecondsBetweenInterstitials * 1000) return;
      st.lastInterstitialAt = now; st.sinceInterstitial = 0; save(); interstitialReady = false;
      var AdMob = plugin();
      (simulate && !AdMob ? mockInterstitial() : AdMob.showInterstitial()).catch(function () {}).then(function () {
        if (simulate && !AdMob) prepareInterstitial();
      });
    } catch (e) { /* ignora */ }
  };

  /** L'utente sceglie di guardare un video per togliere gli annunci. Ritorna una promessa: true se ha ottenuto il premio. */
  api.offerRemoval = function () {
    if (!enabled()) return Promise.resolve(false);
    var AdMob = plugin(), id = unit('rewarded');
    var run;
    if (simulate && !AdMob) run = mockRewarded();
    else if (AdMob && id) {
      var earned = false;
      run = AdMob.addListener('onRewardedVideoAdReward', function () { earned = true; })
        .then(function () { return AdMob.prepareRewardVideoAd({ adId: id, isTesting: testMode }); })
        .then(function () { return AdMob.showRewardVideoAd(); })
        .then(function () { return earned; });
    } else return Promise.resolve(false);
    return run.catch(function () { return false; }).then(function (ok) {
      if (ok) {
        st.noAdsUntil = Date.now() + LIM.noAdsHours * 3600 * 1000; save(); hideBanner();
      }
      changed();
      return !!ok;
    });
  };

  root.DispensaAds = api;
})(typeof window !== 'undefined' ? window : globalThis);
