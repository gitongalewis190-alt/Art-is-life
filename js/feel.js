/* feel.js -- touch feedback for the gallery: haptics, the water-drop sound, the like celebration,
   the tick as each work comes to the centre of the screen, and the header butterfly waking up.

   Haptics work in two ways. Android Chrome exposes navigator.vibrate. iPhone (iOS 18 and later)
   has no vibrate API, so a hidden switch-style checkbox is toggled instead; iOS plays its Taptic
   tick for that. Browsers only allow either one after the visitor has tapped the page once, so
   the splash ticks are quiet on a first visit and every later tick is felt.

   Nothing here touches app logic. app.js calls Feel.like(); the rest is wired by delegation. */
(function () {
  'use strict';

  var PATTERNS = { tap: 8, press: 12, tick: 6, pop: [14, 40, 10] };
  var EMOJI = ['✨', '💛', '🙌', '🎨', '🦋', '🌿',
               '🔥', '💫', '🥰', '🌈'];
  var canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  var reduceMq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  /* ───────────── haptics ───────────── */
  var switchLabel = null;
  function iosSwitch() {
    if (switchLabel) return switchLabel;
    try {
      var label = document.createElement('label');
      label.className = 'feel-switch';
      label.setAttribute('aria-hidden', 'true');
      var input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      input.tabIndex = -1;
      label.appendChild(input);
      document.body.appendChild(label);
      switchLabel = label;
    } catch (_) { switchLabel = null; }
    return switchLabel;
  }

  function tick(kind) {
    var pattern = PATTERNS[kind || 'tap'] || PATTERNS.tap;
    if (canVibrate) {
      try { if (navigator.vibrate(pattern)) return true; } catch (_) { /* blocked: fall through */ }
    }
    var sw = iosSwitch();
    if (sw) { try { sw.click(); } catch (_) { /* no haptic here */ } }
    return false;
  }

  /* Every press on a control gives a short, firm tap. Capture phase, so it fires even when the
     control's own handler stops propagation. */
  var PRESS_SEL = 'button, [role="button"], a[href], .channel-opt, .filter-chip, .art-btn, .like-btn, .fab-btn, .engage-btn';
  document.addEventListener('pointerdown', function (e) {
    var t = e.target && e.target.closest ? e.target.closest(PRESS_SEL) : null;
    if (!t || t.disabled || t.getAttribute('aria-disabled') === 'true') return;
    tick('press');
  }, { capture: true, passive: true });

  /* ───────────── the water drop ─────────────
     Synthesised, so there is no file to fetch: a short sine that glides upward (the drop), then a
     softer bubble. It starts on the same frame as the heart's pop. */
  var audioCtx = null;
  function ctx() {
    try {
      if (!audioCtx) {
        var C = window.AudioContext || window.webkitAudioContext;
        if (!C) return null;
        audioCtx = new C();
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();
      return audioCtx;
    } catch (_) { return null; }
  }
  function drop() {
    var a = ctx();
    if (!a) return;
    var t0 = a.currentTime;
    var o = a.createOscillator(), g = a.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(620, t0);
    o.frequency.exponentialRampToValueAtTime(1280, t0 + 0.085);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.2, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
    o.connect(g); g.connect(a.destination);
    o.start(t0); o.stop(t0 + 0.22);

    var t1 = t0 + 0.085;
    var o2 = a.createOscillator(), g2 = a.createGain();
    o2.type = 'sine';
    o2.frequency.setValueAtTime(420, t1);
    o2.frequency.exponentialRampToValueAtTime(860, t1 + 0.11);
    g2.gain.setValueAtTime(0.0001, t1);
    g2.gain.exponentialRampToValueAtTime(0.09, t1 + 0.01);
    g2.gain.exponentialRampToValueAtTime(0.0001, t1 + 0.14);
    o2.connect(g2); g2.connect(a.destination);
    o2.start(t1); o2.stop(t1 + 0.16);
  }

  /* ───────────── the like: heart, drop, haptic, and a thank you ───────────── */
  function thankYou(btn) {
    var r = btn.getBoundingClientRect();
    var box = document.createElement('div');
    box.className = 'feel-thanks';
    box.setAttribute('aria-hidden', 'true');
    // keep the words inside the screen even when the work sits at the edge
    var cx = Math.min(Math.max(r.left + r.width / 2, 84), window.innerWidth - 84);
    box.style.left = Math.round(cx) + 'px';
    box.style.top = Math.round(r.top) + 'px';
    var msg = document.createElement('span');
    msg.className = 'feel-thanks-text';
    msg.textContent = 'Thank you';
    box.appendChild(msg);
    var n = 5 + Math.floor(Math.random() * 3);
    for (var i = 0; i < n; i++) {
      var em = document.createElement('span');
      em.className = 'feel-emoji';
      em.textContent = EMOJI[Math.floor(Math.random() * EMOJI.length)];
      em.style.left = Math.round(Math.random() * 180 - 90) + 'px';
      em.style.animationDelay = (0.08 + Math.random() * 0.5).toFixed(2) + 's';
      em.style.setProperty('--tilt', Math.round(Math.random() * 60 - 30) + 'deg');
      box.appendChild(em);
    }
    document.body.appendChild(box);
    setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 2300);
  }

  function like(btn) {
    drop();
    tick('pop');
    if (!btn) return;
    btn.classList.remove('x-love');
    void btn.offsetWidth;                       // restart the 1.5 s heart on repeat likes
    btn.classList.add('x-love');
    setTimeout(function () { btn.classList.remove('x-love'); }, 1500);
    thankYou(btn);
  }

  /* ───────────── the tick as each work passes the centre of the screen ───────────── */
  var lastCard = -1, frame = 0;
  function centredCard() {
    frame = 0;
    var cards = document.querySelectorAll('.art-card');
    if (!cards.length) return;
    var mid = window.innerHeight / 2, best = -1, bestD = Infinity;
    for (var i = 0; i < cards.length; i++) {
      var r = cards[i].getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) continue;
      var d = Math.abs((r.top + r.bottom) / 2 - mid);
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best < 0) return;
    if (lastCard >= 0 && best !== lastCard && !(reduceMq && reduceMq.matches)) tick('tick');
    lastCard = best;
  }
  window.addEventListener('scroll', function () {
    if (!frame) frame = window.requestAnimationFrame(centredCard);
  }, { passive: true });

  /* ───────────── the header butterfly wakes when the hero opens ───────────── */
  window.addEventListener('monoline:open', function () {
    var mark = document.querySelector('.header-brand-mark');
    if (!mark) return;
    mark.classList.add('is-awake');
    setTimeout(function () { mark.classList.remove('is-awake'); }, 1400);
  });

  window.Feel = { tick: tick, like: like, drop: drop };
})();
