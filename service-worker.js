/* ═══════════════════════════════════════════════════════════════════════
   service-worker.js -- PWA offline + caching  (Phase 5 polish)
   Strategy:
     • navigation (index.html)  -> network-first (always get latest), cache fallback
     • same-origin static assets -> stale-while-revalidate (fast + self-updating)
     • /api/* and any non-GET    -> never touched (payment + health endpoints)
     • cross-origin (Firebase, gstatic, YouTube, GA) -> always network
   Bump CACHE on releases to retire old assets.
   ═══════════════════════════════════════════════════════════════════════ */
const CACHE = "ail-v16";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/main.css",
  "./css/glass.css",
  "./css/layouts.css",
  "./js/sanitize.js",
  "./js/app.js",
  "./js/splash.js",
  "./js/pwa.js",
  "./js/console.js",
  "./js/services/firebase.js",
  "./js/studio.js",
  "./js/services/analytics.js",
  "./js/services/siteConfig.js",
  "./js/services/daraja.js",
  "./assets/brand/cover.jpg",
  "./assets/brand/icon-192.png",
  "./assets/brand/icon-512.png",
  "./assets/brand/icon-maskable-512.png",
  "./assets/brand/apple-touch-icon.png",
  "./assets/brand/admin_icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // Tolerate any single miss so one bad asset can't block the install.
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

/** Only cache complete, same-origin, successful responses. */
function cachePut(request, response) {
  if (!response || !response.ok || response.type !== "basic") return;
  if (response.status !== 200) return;
  caches.open(CACHE).then((cache) => cache.put(request, response)).catch(() => {});
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch (_) {
    return;
  }

  // Never intercept cross-origin (Firebase/Firestore, gstatic SDK, YouTube, GA).
  if (url.origin !== self.location.origin) return;

  // Never intercept server endpoints -- a cached 503 health check or payment
  // response would be actively harmful.
  if (url.pathname.startsWith("/api/")) return;

  // Respect explicit no-store requests.
  if (request.cache === "no-store") return;

  // Navigation -> network-first so deploys show immediately.
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        cachePut(request, response.clone());
        return response;
      } catch (_) {
        return (await caches.match(request)) ||
               (await caches.match("./index.html")) ||
               new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
      }
    })());
    return;
  }

  // Static assets -> stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          cachePut(request, response.clone());
          return response;
        })
        // Never resolve with `undefined`: respondWith() requires a Response.
        .catch(() => cached || new Response("Offline", {
          status: 504,
          headers: { "Content-Type": "text/plain; charset=utf-8" }
        }));
      return cached || network;
    })
  );
});
