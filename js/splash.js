/* splash.js — Pebble bounce → logo morph sequence */
(function () {
  var splash = document.getElementById('splash');
  if (!splash) return;

  document.body.classList.add('splash-active');

  var pebbleWrap  = document.getElementById('splashPebbleWrap');
  var pebble      = document.getElementById('splashPebble');
  var markEl      = document.getElementById('splashMark');
  var brandEl     = document.getElementById('splashBrand');
  var remarkEl    = document.getElementById('splashRemark');
  var skipBtn     = document.getElementById('splashSkip');
  var logoImg     = document.getElementById('splashLogoImg');
  var logoSvg     = document.getElementById('splashLogoSvg');

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Apply custom logo if admin has set one
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

  if (reduce) {
    // Reduced motion: just show logo and brand immediately
    if (pebbleWrap) pebbleWrap.style.display = 'none';
    markEl.style.opacity = '1';
    brandEl.style.opacity = '1';
    remarkReveal(800);
    return;
  }

  // PEBBLE BOUNCE SEQUENCE
  // The pebble starts tiny (scale 0.04, perspective far) and bounces toward viewer
  var bounceCount = 0;
  var maxBounces  = 5;
  var sizes       = [0.04, 0.10, 0.22, 0.45, 0.72, 1.0];  // growing per bounce
  var durations   = [320,  260,  210,  170,  140,  120];   // faster each bounce

  function nextBounce() {
    if (bounceCount > maxBounces) {
      morphToLogo();
      return;
    }
    var s = sizes[bounceCount] || 1.0;
    var d = durations[bounceCount] || 120;
    // Animate down (squash) then up (stretch + scale up)
    pebble.style.transition = 'none';
    pebble.style.transform  = 'scale(' + (s * 0.9) + ') scaleY(0.6)';
    setTimeout(function() {
      pebble.style.transition = 'transform ' + d + 'ms cubic-bezier(0.2,0.8,0.2,1)';
      pebble.style.transform  = 'scale(' + s + ')';
      bounceCount++;
      setTimeout(nextBounce, d + 30);
    }, 20);
  }

  function morphToLogo() {
    // Pebble expands and fades; logo fades in
    pebble.style.transition = 'transform 0.5s cubic-bezier(0.2,0.8,0.2,1), opacity 0.4s ease';
    pebble.style.transform  = 'scale(2.5)';
    pebble.style.opacity    = '0';

    markEl.style.transition = 'opacity 0.5s ease 0.15s, transform 0.5s cubic-bezier(0.2,0.8,0.2,1) 0.15s';
    markEl.style.transform  = 'scale(0.8)';
    setTimeout(function() {
      markEl.style.opacity   = '1';
      markEl.style.transform = 'scale(1)';
    }, 50);

    // Brand text
    setTimeout(function() {
      brandEl.style.transition = 'opacity 0.6s ease, transform 0.6s cubic-bezier(0.25,0.46,0.45,0.94)';
      brandEl.style.transform  = 'translateY(12px)';
      setTimeout(function() {
        brandEl.style.opacity   = '1';
        brandEl.style.transform = 'translateY(0)';
      }, 20);
      if (pebbleWrap) pebbleWrap.style.display = 'none';
    }, 400);

    // Remark
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
      if (skipBtn) skipBtn.classList.add('visible');
    }, delay);
  }

  // Start the bounce sequence after a short delay
  setTimeout(nextBounce, 300);

  // DISMISS
  var dismissed = false;
  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    splash.classList.add('is-leaving');
    document.body.classList.remove('splash-active');
    setTimeout(function() { splash.classList.add('is-gone'); }, 950);
    if (typeof window.track === 'function') window.track('splash_dismissed');
  }
  if (skipBtn) skipBtn.addEventListener('click', dismiss);
})();
