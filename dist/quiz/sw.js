importScripts("./offline-manifest.js");

const manifest = self.__OFFLINE_MANIFEST__ || { version: "v1", files: [] };
const cacheName = `quiz-offline-${manifest.version}`;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    await cache.addAll(manifest.files);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith("quiz-offline-") && key !== cacheName)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }

    try {
      const response = await fetch(request);
      const requestUrl = new URL(request.url);
      if (response.ok && requestUrl.origin === self.location.origin) {
        const cache = await caches.open(cacheName);
        cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      if (request.mode === "navigate") {
        const fallback = await caches.match("./index.html");
        if (fallback) {
          return fallback;
        }
      }
      throw error;
    }
  })());
});
