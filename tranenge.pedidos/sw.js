/* Service worker: guarda os arquivos do app para abrir sem internet.
   Só funciona fora do Claude, servido por HTTPS ou localhost. */
const CACHE = 'rancho-v1';
const ASSETS = ['./', 'index.html', 'css/tokens.css', 'css/styles.css',
  'js/logic.js', 'js/util.js', 'js/store.js', 'js/theme.js', 'js/pwa.js',
  'js/backup.js', 'js/views.js', 'js/actions.js', 'js/main.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
    const copy = res.clone();
    caches.open(CACHE).then(c => c.put(e.request, copy));
    return res;
  }).catch(() => caches.match('index.html'))));
});
