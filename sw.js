const CACHE_PREFIX = "koperasi-kasir-";
const CACHE_NAME = CACHE_PREFIX + "v2";
const APP_ROOT = new URL("./", self.registration.scope).href;
const APP_SHELL = [APP_ROOT, new URL("index.html", APP_ROOT).href];
const STATIC_REMOTE_ASSETS = [
  "https://cdn.tailwindcss.com/",
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.23/jspdf.plugin.autotable.min.js",
  "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js"
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(APP_SHELL.map(async url => {
      try {
        const response = await fetch(url, { cache: "reload" });
        if (response.ok) await cache.put(url, response.clone());
      } catch (_) {}
    }));
    await Promise.all(STATIC_REMOTE_ASSETS.map(async url => {
      try {
        const request = new Request(url, { mode: "no-cors" });
        const response = await fetch(request);
        if (response.ok || response.type === "opaque") await cache.put(request, response.clone());
      } catch (_) {}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const isAppOrigin = url.origin === self.location.origin;

  if (request.mode === "navigate" && isAppOrigin) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response.ok) {
          await cache.put(APP_ROOT, response.clone());
          await cache.put(new URL("index.html", APP_ROOT).href, response.clone());
          return response;
        }
      } catch (_) {}
      return (await cache.match(request)) || (await cache.match(new URL("index.html", APP_ROOT).href)) || new Response(
        "<!doctype html><html lang=\"id\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Kasir offline</title><body><h1>Aplikasi belum tersimpan di perangkat ini</h1><p>Buka aplikasi sekali saat internet tersedia, tunggu katalog selesai dimuat, lalu coba lagi.</p></body></html>",
        { headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    })());
    return;
  }

  if (isAppOrigin) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) {
        fetch(request).then(response => {
          if (response.ok) cache.put(request, response.clone());
        }).catch(() => {});
        return cached;
      }
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch (_) {
        return new Response("", { status: 503, statusText: "Offline" });
      }
    })());
    return;
  }

  if (STATIC_REMOTE_ASSETS.includes(request.url)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok || response.type === "opaque") await cache.put(request, response.clone());
        return response;
      } catch (_) {
        return new Response("", { status: 503, statusText: "Offline" });
      }
    })());
  }
});
