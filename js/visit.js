/* Tell the gallery owner that this browser just opened the site.
   The Telegram bot token stays on the server (api/visit.js). This file
   only sends the page path and referrer, once per tab session. */
(function () {
  "use strict";
  var KEY = "ail-visit-sent";
  try {
    if (sessionStorage.getItem(KEY) === "1") return;
  } catch (e) { /* private mode still tries */ }

  var payload;
  try {
    payload = JSON.stringify({
      path: String(location.pathname || "/") + String(location.search || ""),
      ref: String(document.referrer || "")
    }).slice(0, 700);
  } catch (e) {
    return;
  }

  fetch("/api/visit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload,
    keepalive: true,
    credentials: "omit"
  }).then(function (res) {
    return res.json();
  }).then(function (data) {
    if (data && data.sent) {
      try { sessionStorage.setItem(KEY, "1"); } catch (e) {}
    }
  }).catch(function () {});
})();
