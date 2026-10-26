/* Service worker: fa funzionare Dispensa anche senza connessione.
   Strategia: prima la copia salvata, poi aggiorna in background (stale-while-revalidate).
   Quando cambi i file del sito o i dati, aumenta VERSION per forzare l'aggiornamento. */
const VERSION = 'dispensa-v1';
const FILES = [
  './', 'index.html', 'css/style.css', 'js/search.js', 'js/app.js',
  'data/recipes.json', 'manifest.webmanifest', 'icon.svg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(VERSION).then((cache) =>
      cache.match(req).then((hit) => {
        const net = fetch(req).then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        }).catch(() => hit);
        return hit || net;
      })
    )
  );
});
