/* 小管家 Cloudflare 版 Service Worker
 * V2.0 在线优先（PRD 七）：只缓存静态壳资源（cache-first），
 * API 与图片一律直连网络（不缓存，保证账单数据实时一致）。
 */
const CACHE = 'xgj-cf-v1';
const ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/icon.svg',
];

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
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  // API / 图片代理：一律走网络
  if (url.pathname.startsWith('/api/')) return;

  // 静态资源：缓存优先，后台更新
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => {
      const fetching = fetch(e.request).then((res) => {
        if (res.ok && (url.pathname.startsWith('/_astro/') || ASSETS.includes(url.pathname))) {
          caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
        }
        return res;
      }).catch(() => hit);
      return hit || fetching;
    }),
  );
});
