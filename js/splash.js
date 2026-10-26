/* splash.js — 1.5-second welcome banner on opening the site.
   The fade itself is pure CSS (css/glass.css, .splash / welcomeBanner), so the
   banner finishes in 1.5 s even if this script never runs. This script only
   unlocks scrolling and removes the banner from layout once it has finished. */
(function () {
  var banner = document.getElementById('splash');
  if (!banner) return;

  document.body.classList.add('splash-active');

  var closed = false;
  function close() {
    if (closed) return;
    closed = true;
    banner.classList.add('is-gone');
    document.body.classList.remove('splash-active');
  }

  // Preferred: exactly when the CSS fade ends. Backstop: a timer just after 1.5 s.
  banner.addEventListener('animationend', close);
  setTimeout(close, 1600);
})();
