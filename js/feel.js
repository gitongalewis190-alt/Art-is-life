/* feel.js -- touch feedback for the gallery: haptics, sounds, the like and cart celebrations,
   the scroll ratchet, and the header butterfly waking up.

   Haptics: Android Chrome exposes navigator.vibrate. iPhone (iOS 18 and later) has no vibrate
   API, so a hidden switch-style checkbox is toggled instead; iOS plays its Taptic tick for that.
   Browsers only allow vibration after the visitor has tapped the page once, so the first splash
   ticks are quiet; every tick after that is felt.

   The scroll ratchet works like a date picker wheel: a short detent every DETENT_PX of travel,
   and a firmer click each time a new work reaches the centre of the screen.

   Nothing here touches app logic. app.js calls Feel.like() and Feel.cart(); the rest is wired by
   delegation. */
(function () {
  'use strict';

  var PATTERNS = { tap: 8, press: 14, tick: 6, detent: 5, click: 12, pop: [14, 40, 10], cart: [10, 30, 10, 30, 18] };
  var DETENT_PX = 48;
  var EMOJI = ['✨', '💛', '🙌', '🎨', '🦋', '🌿',
               '🔥', '💫', '🥰', '🌈'];
  var BAG = ['🛍️', '🧺', '👜', '✨', '🛒'];
  var canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  var reduceMq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reduced() { return !!(reduceMq && reduceMq.matches); }

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

  /* Every press on a control gives a firm tap. Capture phase, so it fires even when the
     control's own handler stops propagation. */
  var PRESS_SEL = 'button, [role="button"], [onclick], a[href], label.btn, .channel-opt, .filter-chip, ' +
                  '.art-btn, .like-btn, .fab-btn, .engage-btn, .cart-btn, .hamburger-btn';
  document.addEventListener('pointerdown', function (e) {
    var t = e.target && e.target.closest ? e.target.closest(PRESS_SEL) : null;
    if (!t || t.disabled || t.getAttribute('aria-disabled') === 'true') return;
    if (t.classList && t.classList.contains('feel-switch')) return;
    tick('press');
  }, { capture: true, passive: true });

  /* ───────────── sounds (synthesised: no files to fetch) ───────────── */
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
  /* a sine with a short attack and an exponential decay, starting at t */
  function blip(a, t, freq, freqEnd, peak, dur, glide) {
    var o = a.createOscillator(), g = a.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (glide) o.frequency.exponentialRampToValueAtTime(freqEnd, t + glide);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(a.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  /* the water drop: a glide upward, then a softer bubble (the like) */
  function drop() {
    var a = ctx(); if (!a) return;
    var t0 = a.currentTime;
    blip(a, t0, 620, 1280, 0.2, 0.2, 0.085);
    blip(a, t0 + 0.085, 420, 860, 0.09, 0.14, 0.11);
  }
  /* the cart: a bright, short two-note chime, unlike the drop */
  function chime() {
    var a = ctx(); if (!a) return;
    var t0 = a.currentTime;
    blip(a, t0, 1568, 0, 0.13, 0.42, 0);
    blip(a, t0 + 0.07, 2349, 0, 0.08, 0.36, 0);
  }

  /* ───────────── floating words with emojis (the like and the cart share this) ───────────── */
  function floatLabel(btn, text, emojis, cls, count) {
    var r = btn.getBoundingClientRect();
    var box = document.createElement('div');
    box.className = 'feel-float ' + cls;
    box.setAttribute('aria-hidden', 'true');
    // keep the words inside the screen even when the work sits at the edge
    var cx = Math.min(Math.max(r.left + r.width / 2, 84), window.innerWidth - 84);
    box.style.left = Math.round(cx) + 'px';
    box.style.top = Math.round(r.top) + 'px';
    var msg = document.createElement('span');
    msg.className = 'feel-float-text';
    msg.textContent = text;
    box.appendChild(msg);
    for (var i = 0; i < count; i++) {
      var em = document.createElement('span');
      em.className = 'feel-emoji';
      em.textContent = emojis[Math.floor(Math.random() * emojis.length)];
      em.style.left = Math.round(Math.random() * 180 - 90) + 'px';
      em.style.animationDelay = (0.08 + Math.random() * 0.5).toFixed(2) + 's';
      em.style.setProperty('--tilt', Math.round(Math.random() * 60 - 30) + 'deg');
      box.appendChild(em);
    }
    document.body.appendChild(box);
    setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 2300);
  }

  /* ───────────── the like: heart, drop, haptic, and a thank you ───────────── */
  function like(btn) {
    drop();
    tick('pop');
    if (!btn) return;
    btn.classList.remove('x-love');
    void btn.offsetWidth;                       // restart the 1.5 s heart on repeat likes
    btn.classList.add('x-love');
    setTimeout(function () { btn.classList.remove('x-love'); }, 1500);
    floatLabel(btn, 'Thank you', EMOJI, 'feel-thanks', 5 + Math.floor(Math.random() * 3));
  }

  /* ───────────── the cart: the bag bounces, a chime, a haptic, and "Added to cart" ───────────── */
  function cart(btn) {
    chime();
    tick('cart');
    var badge = document.getElementById('cartCount');
    if (badge) {
      badge.classList.remove('x-bump');
      void badge.offsetWidth;
      badge.classList.add('x-bump');
      setTimeout(function () { badge.classList.remove('x-bump'); }, 700);
    }
    if (!btn) return;
    btn.classList.remove('x-cart');
    void btn.offsetWidth;
    btn.classList.add('x-cart');
    setTimeout(function () { btn.classList.remove('x-cart'); }, 1100);
    floatLabel(btn, 'Added to cart', BAG, 'feel-cartlabel', 3 + Math.floor(Math.random() * 2));
  }

  /* ───────────── the scroll ratchet ───────────── */
  var lastY = window.scrollY || 0, carry = 0, frame = 0, lastCard = -1;
  function centredCard() {
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
    if (lastCard >= 0 && best !== lastCard) tick('click');
    lastCard = best;
  }
  function ratchet() {
    frame = 0;
    var y = window.scrollY || 0, d = Math.abs(y - lastY);
    lastY = y;
    if (!d || reduced()) return;
    carry += d;
    var steps = 0;
    while (carry >= DETENT_PX && steps < 4) { carry -= DETENT_PX; steps++; tick('detent'); }
    if (carry > DETENT_PX) carry = DETENT_PX;
    centredCard();
  }
  window.addEventListener('scroll', function () {
    if (!frame) frame = window.requestAnimationFrame(ratchet);
  }, { passive: true });

  /* On iPhone there is no scroll-driven haptic, so the ratchet is also fed from the finger's
     movement. Android already gets it from the scroll, so it is not doubled there. */
  var touchY = null, touchCarry = 0;
  window.addEventListener('touchstart', function (e) { touchY = e.touches[0].clientY; touchCarry = 0; }, { passive: true });
  window.addEventListener('touchmove', function (e) {
    if (canVibrate || touchY === null || reduced()) return;
    var y = e.touches[0].clientY;
    touchCarry += Math.abs(y - touchY);
    touchY = y;
    while (touchCarry >= DETENT_PX) { touchCarry -= DETENT_PX; tick('detent'); }
    centredCard();                       // a work reaching the middle gives its own halt, under the finger
  }, { passive: true });
  window.addEventListener('touchend', function () { touchY = null; }, { passive: true });

  /* ───────────── the header butterfly wakes when the hero opens ───────────── */
  window.addEventListener('monoline:open', function () {
    var mark = document.querySelector('.header-brand-mark');
    if (!mark) return;
    mark.classList.add('is-awake');
    setTimeout(function () { mark.classList.remove('is-awake'); }, 1400);
  });

  window.Feel = { tick: tick, like: like, cart: cart, drop: drop, chime: chime };
})();
