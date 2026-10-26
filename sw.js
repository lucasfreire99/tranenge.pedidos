/* Service worker: guarda os arquivos do próprio app para abrir sem internet.
   - Só mexe em arquivos do mesmo endereço do app. Respostas da API do Supabase,
     fontes e a biblioteca externa passam direto, nunca ficam em cache.
   - Tenta a rede primeiro e usa o cache só quando está sem internet, então uma
     atualização do app aparece sem precisar limpar nada.
   Só funciona fora do Claude, servido por HTTPS ou localhost. */
const CACHE = 'rancho-v4';
const ASSETS = ['./', 'index.html', 'css/tokens.css', 'css/styles.css',
  'js/config.js', 'js/logic.js', 'js/util.js', 'js/cloud.js', 'js/store.js',
  'js/theme.js', 'js/pwa.js', 'js/backup.js', 'js/views.js', 'js/cloudviews.js',
  'js/actions.js', 'js/main.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then(hit => hit || caches.match('index.html')))
  );
});
