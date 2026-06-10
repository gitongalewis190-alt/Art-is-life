/* ═══════════════════════════════════════════════════════════
   splash.js — Launch / immersion sequence (Phase 1)
   Phase 1: logo mark draws in        (CSS)
   Phase 2: brand typography reveal   (CSS)
   Phase 3: owner remark fades in     (JS, content-configurable)
   Phase 4: auto-exit into the live E-Gallery
   ═══════════════════════════════════════════════════════════ */
(function () {
  var splash = document.getElementById('splash');
  if (!splash) return;

  document.body.classList.add('splash-active');

  var remarkEl = document.getElementById('splashRemark');
  var skipBtn  = document.getElementById('splashSkip');

  /* Owner remark is CONTENT, not code — editable here today and
     from the Control Console in a later phase. No invented copy:
     this is a genuine welcome line; replace with the owner's words. */
  var CFG = (window.SITE_CONFIG = window.SITE_CONFIG || {});
  var remark = CFG.ownerRemark || {
    text: 'Every canvas here began as a feeling before it became a colour. Thank you for walking through this gallery with open eyes.',
    by: 'Lewis Gitonga — Founder'
  };

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Phase 3 — reveal the remark after the brand has settled.
  var t3 = setTimeout(function () {
    if (remarkEl && remark && remark.text) {
      remarkEl.innerHTML = String(remark.text).replace(/</g, '&lt;') +
        (remark.by ? '<span class="by">' + String(remark.by).replace(/</g, '&lt;') + '</span>' : '');
      remarkEl.classList.add('show');
    }
  }, reduce ? 100 : 2300);

  // Phase 4 — seamless exit into the gallery.
  var dismissed = false;
  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    clearTimeout(t3);
    clearTimeout(t4);
    splash.classList.add('is-leaving');
    document.body.classList.remove('splash-active');
    setTimeout(function () { splash.classList.add('is-gone'); }, 950);
    if (typeof window.track === 'function') window.track('splash_dismissed');
  }

  var t4 = setTimeout(dismiss, reduce ? 600 : 4200);
  if (skipBtn) skipBtn.addEventListener('click', dismiss);
})();
