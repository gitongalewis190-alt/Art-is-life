/* pwa.js — register the service worker (progressive enhancement).
   Safe no-op where service workers aren't supported. */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("service-worker.js").catch(function (err) {
      console.warn("SW registration skipped:", err && err.message);
    });
  });
}
