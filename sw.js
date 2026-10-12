// オフライン対応：通信できるときは最新を取得してキャッシュを更新し、
// 通信できないときはキャッシュから返す
const CACHE = 'kokorozashi-v7';
const ASSETS = [
  './', 'index.html', 'style.css', 'js/app.js', 'js/science.js',
  'photo.html', 'photo.css', 'photo.js', 'manifest.webmanifest',
  'js/icons.js', 'js/illustrations.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png', 'icons/favicon-96.png', 'icons/logo-256.webp',
];
// Google Fonts はオフラインでも表示できるよう、一度読んだらキャッシュから使う
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (FONT_HOSTS.includes(url.hostname)) {
    e.respondWith(caches.match(request).then((hit) => hit || fetch(request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(request, copy));
      return res;
    })));
    return;
  }
  if (url.origin !== location.origin) return;
  e.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      })
      .catch(() => caches.match(request, { ignoreSearch: true })),
  );
});
