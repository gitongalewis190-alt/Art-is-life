/* ═══════════════════════════════════════════════════════════════════════
   service-worker.js — PWA offline + caching  (Phase 5 polish)
   Strategy:
     • navigation (index.html)  -> network-first (always get latest), cache fallback
     • same-origin static assets -> stale-while-revalidate (fast + self-updating)
     • cross-origin (Firebase, gstatic, YouTube, GA) -> always network (never cached)
   Bump CACHE on releases to retire old assets.
   ═══════════════════════════════════════════════════════════════════════ */
const CACHE = "ail-v3";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/main.css",
  "./css/glass.css",
  "./css/layouts.css",
  "./js/app.js",
  "./js/splash.js",
  "./js/pwa.js",
  "./js/console.js",
  "./js/studio.js",
  "./js/services/analytics.js",
  "./js/services/siteConfig.js",
  "./js/services/daraja.js",
  "./assets/brand/cover.jpg",
  "./assets/brand/admin_icon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))) // tolerate any miss
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Never intercept cross-origin (Firebase/Firestore, gstatic SDK, YouTube, GA).
  if (url.origin !== self.location.origin) return;

  // Navigation -> network-first so deploys show immediately.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => { cachePut(req, res.clone()); return res; })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Static assets -> stale-while-revalidate.
  e.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => { cachePut(req, res.clone()); return res; })
        .catch(() => cached);
      return cached || network;
    })
  );
});

function cachePut(req, res) {
  if (res && res.ok) caches.open(CACHE).then((c) => c.put(req, res));
}
