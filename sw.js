'use strict';
const CACHE_NAME = 'ascii-vault-offline-v3';
const APP_URL = new URL('index.html', self.registration.scope).href;
const MANIFEST_URL = new URL('manifest.webmanifest', self.registration.scope).href;
const ICON_URLS = ['icons/icon-192.png', 'icons/icon-512.png'].map(p => new URL(p, self.registration.scope).href);
const ROOT_URL = self.registration.scope;
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll([APP_URL, MANIFEST_URL, ...ICON_URLS])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(names => Promise.all(names.filter(name => name.startsWith('ascii-vault-offline-') && name !== CACHE_NAME).map(name => caches.delete(name)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  url.hash = '';
  url.search = '';
  if (![APP_URL, ROOT_URL, MANIFEST_URL].includes(url.href)) return;
  const key = url.href === ROOT_URL ? APP_URL : url.href;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(event.request);
      if (response.ok && url.href !== ROOT_URL) await cache.put(key, response.clone());
      if (response.ok) return response;
      return await cache.match(key) || response;
    } catch (error) {
      return await cache.match(key) || new Response('离线资源尚未缓存，请联网打开一次后再试。', {status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8'}});
    }
  })());
});
