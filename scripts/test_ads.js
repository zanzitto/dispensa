// Prove della logica degli annunci con un finto plugin AdMob.  Uso:  node scripts/test_ads.js
const path = require('path');
const assert = require('assert');
const file = path.join(__dirname, '..', 'site', 'js', 'ads.js');

let now = 1_000_000_000_000;
function setup(config, native = true) {
  const calls = [], handlers = {};
  const store = {};
  global.window = global;
  global.location = { search: '' };
  global.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  global.document = { documentElement: { style: { setProperty: (k, v) => calls.push(['css', k, v]) } }, getElementById: () => null };
  global.DISPENSA_CONFIG = { ads: config };
  const log = (name, ret) => (...a) => { calls.push([name, ...a]); return Promise.resolve(ret); };
  const AdMob = {
    requestConsentInfo: log('requestConsentInfo', { isConsentFormAvailable: true, status: 'REQUIRED' }),
    showConsentForm: log('showConsentForm'), initialize: log('initialize'),
    showBanner: log('showBanner'), removeBanner: log('removeBanner'),
    prepareInterstitial: log('prepareInterstitial'), showInterstitial: log('showInterstitial'),
    prepareRewardVideoAd: log('prepareRewardVideoAd'),
    showRewardVideoAd: (...a) => { calls.push(['showRewardVideoAd', ...a]); if (handlers.onRewardedVideoAdReward) handlers.onRewardedVideoAdReward({}); return Promise.resolve({}); },
    addListener: (name, fn) => { handlers[name] = fn; return Promise.resolve({ remove() {} }); },
  };
  global.Capacitor = native ? { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: { AdMob } } : undefined;
  Date.now = () => now;
  delete require.cache[file];
  require(file);
  return { ads: global.DispensaAds, calls, handlers, names: () => calls.map((c) => c[0]) };
}
const tick = () => new Promise((r) => setImmediate(r));
let n = 0;
async function test(name, fn) { await fn(); n++; console.log('ok  -', name); }

(async () => {
  await test('spento: nel sito web non fa nulla', async () => {
    const t = setup({ enabled: true }, false);
    assert.strictEqual(t.ads.available(), false);
    await t.ads.init(); t.ads.maybeInterstitial();
    assert.deepStrictEqual(t.calls, []);
  });

  await test('spento da configurazione, anche dentro l\'app', async () => {
    const t = setup({ enabled: false });
    assert.strictEqual(t.ads.available(), false);
  });

  await test('avvio: chiede il consenso, poi inizializza e mostra banner e prepara l\'interstitial (annunci di prova)', async () => {
    const t = setup({ enabled: true });
    await t.ads.init(); await tick();
    const names = t.names();
    assert(names.indexOf('requestConsentInfo') < names.indexOf('showConsentForm'));
    assert(names.indexOf('showConsentForm') < names.indexOf('initialize'));
    assert(names.indexOf('initialize') < names.indexOf('showBanner'));
    const banner = t.calls.find((c) => c[0] === 'showBanner')[1];
    assert.strictEqual(banner.adId, 'ca-app-pub-3940256099942544/6300978111');
    assert.strictEqual(banner.isTesting, true);
    assert(names.includes('prepareInterstitial'));
    assert.deepStrictEqual(t.calls.find((c) => c[0] === 'initialize')[1], { initializeForTesting: true });
  });

  await test('se i codici veri mancano e testMode e\' spento, non mostra nulla', async () => {
    const t = setup({ enabled: true, testMode: false, units: { android: {} } });
    await t.ads.init(); await tick();
    assert(!t.names().includes('showBanner'));
  });

  await test('usa i codici veri solo quando testMode e\' spento', async () => {
    const t = setup({ enabled: true, testMode: false, units: { android: { banner: 'ca-app-pub-1/2', interstitial: 'ca-app-pub-1/3' } } });
    await t.ads.init(); await tick();
    assert.strictEqual(t.calls.find((c) => c[0] === 'showBanner')[1].adId, 'ca-app-pub-1/2');
    assert.strictEqual(t.calls.find((c) => c[0] === 'showBanner')[1].isTesting, false);
  });

  await test('interstitial: non prima di 5 ricette, poi rispetta le pause', async () => {
    const t = setup({ enabled: true });
    await t.ads.init(); await tick();
    const shown = () => t.names().filter((x) => x === 'showInterstitial').length;
    for (let i = 0; i < 4; i++) { t.ads.recipeOpened(); t.ads.maybeInterstitial(); }
    assert.strictEqual(shown(), 0, 'troppo presto');
    t.ads.recipeOpened(); t.ads.maybeInterstitial();
    assert.strictEqual(shown(), 1, 'alla quinta ricetta');
    await tick();
    for (let i = 0; i < 5; i++) { t.ads.recipeOpened(); t.ads.maybeInterstitial(); }
    assert.strictEqual(shown(), 1, 'servono almeno 4 minuti');
    now += 5 * 60 * 1000;
    t.handlers.interstitialAdDismissed && t.handlers.interstitialAdDismissed();
    await tick();
    t.ads.maybeInterstitial();
    assert.strictEqual(shown(), 2, 'dopo la pausa');
    await tick();
    t.ads.recipeOpened(); t.ads.maybeInterstitial();
    assert.strictEqual(shown(), 2, 'non due di fila');
  });

  await test('video a premio: toglie banner e annunci per 24 ore, poi tornano', async () => {
    const t = setup({ enabled: true });
    await t.ads.init(); await tick();
    assert.strictEqual(t.ads.adsFree(), false);
    assert.strictEqual(await t.ads.offerRemoval(), true);
    assert.strictEqual(t.ads.adsFree(), true);
    assert(t.names().includes('removeBanner'));
    for (let i = 0; i < 10; i++) { t.ads.recipeOpened(); t.ads.maybeInterstitial(); }
    assert(!t.names().includes('showInterstitial'), 'nessun interstitial senza annunci');
    assert(/h|min/.test(t.ads.remainingText()));
    now += 25 * 3600 * 1000;
    assert.strictEqual(t.ads.adsFree(), false);
  });

  await test('se il video non viene guardato fino in fondo, niente premio', async () => {
    const t = setup({ enabled: true });
    await t.ads.init(); await tick();
    const AdMob = global.Capacitor.Plugins.AdMob;
    AdMob.showRewardVideoAd = () => Promise.resolve({});   // il premio non scatta
    assert.strictEqual(await t.ads.offerRemoval(), false);
    assert.strictEqual(t.ads.adsFree(), false);
  });

  await test('un errore del plugin non rompe l\'app', async () => {
    const t = setup({ enabled: true });
    global.Capacitor.Plugins.AdMob.requestConsentInfo = () => Promise.reject(new Error('rete assente'));
    await t.ads.init();
    t.ads.recipeOpened(); t.ads.maybeInterstitial();     // non deve lanciare
  });

  console.log('\n' + n + ' prove superate');
})().catch((e) => { console.error('FALLITA:', e.message); process.exit(1); });
