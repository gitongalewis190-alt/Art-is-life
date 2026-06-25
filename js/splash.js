/* splash.js — Pebble vibrate → logo morph → fully automated entry into the gallery */
(function () {
  var splash = document.getElementById('splash');
  if (!splash) return;

  document.body.classList.add('splash-active');

  var pebbleWrap  = document.getElementById('splashPebbleWrap');
  var pebble      = document.getElementById('splashPebble');
  var markEl      = document.getElementById('splashMark');
  var brandEl     = document.getElementById('splashBrand');
  var remarkEl    = document.getElementById('splashRemark');
  var logoImg     = document.getElementById('splashLogoImg');
  var logoSvg     = document.getElementById('splashLogoSvg');

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Apply the logo set in the Control Console, if any
  function applyLogo() {
    var cfg = window.SITE_CONFIG || {};
    if (cfg.logoUrl && logoImg) {
      logoImg.src = cfg.logoUrl;
      logoImg.style.display = 'block';
      if (logoSvg) logoSvg.style.display = 'none';
    }
  }
  applyLogo();
  window.addEventListener('siteconfig_applied', applyLogo);

  // DISMISS — always automatic; tapping the splash also skips ahead early
  var dismissed = false;
  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    splash.classList.add('is-leaving');
    document.body.classList.remove('splash-active');
    setTimeout(function() { splash.classList.add('is-gone'); }, 950);
    if (typeof window.track === 'function') window.track('splash_dismissed');
  }
  splash.addEventListener('click', dismiss);

  if (reduce) {
    if (pebbleWrap) pebbleWrap.style.display = 'none';
    markEl.style.opacity = '1';
    brandEl.style.opacity = '1';
    remarkReveal(600);
    return;
  }

  // PEBBLE VIBRATE SEQUENCE — settles in, trembles briefly, then morphs to the logo
  function startPebble() {
    pebble.classList.add('is-in');
    setTimeout(function() {
      pebble.classList.add('is-vibrating');
      setTimeout(morphToLogo, 900);
    }, 350);
  }

  function morphToLogo() {
    pebble.classList.remove('is-vibrating');
    pebble.style.transition = 'transform 0.5s cubic-bezier(0.2,0.8,0.2,1), opacity 0.4s ease';
    pebble.style.transform  = 'scale(2.5)';
    pebble.style.opacity    = '0';

    markEl.style.transition = 'opacity 0.5s ease 0.15s, transform 0.5s cubic-bezier(0.2,0.8,0.2,1) 0.15s';
    markEl.style.transform  = 'scale(0.8)';
    setTimeout(function() {
      markEl.style.opacity   = '1';
      markEl.style.transform = 'scale(1)';
    }, 50);

    setTimeout(function() {
      brandEl.style.transition = 'opacity 0.6s ease, transform 0.6s cubic-bezier(0.25,0.46,0.45,0.94)';
      brandEl.style.transform  = 'translateY(12px)';
      setTimeout(function() {
        brandEl.style.opacity   = '1';
        brandEl.style.transform = 'translateY(0)';
      }, 20);
      if (pebbleWrap) pebbleWrap.style.display = 'none';
    }, 400);

    remarkReveal(1400);
  }

  function remarkReveal(delay) {
    setTimeout(function() {
      var CFG = (window.SITE_CONFIG = window.SITE_CONFIG || {});
      var remark = CFG.ownerRemark || {
        text: 'Every canvas here began as a feeling before it became a colour. Thank you for walking through this gallery with open eyes.',
        by: 'Lewis Gitonga — Founder'
      };
      if (remarkEl && remark && remark.text) {
        remarkEl.innerHTML = String(remark.text).replace(/</g,'&lt;') +
          (remark.by ? '<span class="by">' + String(remark.by).replace(/</g,'&lt;') + '</span>' : '');
        remarkEl.classList.add('show');
      }
      // Fully automated: no button — read for a beat, then enter the gallery.
      setTimeout(dismiss, 1900);
    }, delay);
  }

  setTimeout(startPebble, 300);
})();
