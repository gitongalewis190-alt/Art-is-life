/* splash.js -- opening welcome sequence.
   1. "Welcome to a world of art" types out letter by letter.
   2. "Art is Life" resolves letter by letter with a gold brush stroke.
   3. The banner dissolves and the gallery is revealed.
   Tap or click anywhere to skip. Reduced-motion visitors get the text at once.
   The banner is only hidden by this script; without JavaScript the
   <noscript> rule in index.html removes it so the site is never blocked. */
(function () {
  var banner = document.getElementById('splash');
  if (!banner) return;

  var line1 = document.getElementById('splashLine1');
  var line2 = document.getElementById('splashLine2');
  var TEXT1 = 'Welcome to a world of art';
  var TEXT2 = 'Art is Life';

  /* Timing (ms) -- tune here. */
  var START_DELAY   = 500;   // pause before the first letter
  var TYPE_BASE     = 52;   // per-letter typing speed
  var TYPE_JITTER   = 16;    // small random variation so it feels hand-typed
  var WORD_PAUSE    = 28;    // extra beat after each space
  var READ_WELCOME  = 2000;  // full "Welcome…" line stays long enough to read (about 2 s)
  var LINE_FADE     = 700;   // welcome line fades out
  var LETTER_STEP   = 75;   // delay between each "Art is Life" letter
  var READ_ART      = 2400;  // "Art is Life" stays on screen this long
  var EXIT_FADE     = 900;   // whole banner dissolves
  var TOTAL = START_DELAY + TYPE_BASE * TEXT1.length + READ_WELCOME + LINE_FADE
            + LETTER_STEP * TEXT2.length + 1000 + READ_ART + EXIT_FADE;

  document.body.classList.add('splash-active');

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var timers = [];
  var closed = false;

  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }

  function close() {
    if (closed) return;
    closed = true;
    timers.forEach(clearTimeout);
    banner.classList.add('is-leaving');
    setTimeout(function () {
      banner.classList.add('is-gone');
      document.body.classList.remove('splash-active');
    }, 900);
  }

  // Deliberate tap or click skips the sequence. (No touchstart: scrolling must not skip it.)
  banner.addEventListener('click', close);

  // Backstop only: a hung timer can never trap the visitor behind the banner.
  setTimeout(close, TOTAL + 3000);

  if (reduce) {
    line1.textContent = TEXT1;
    line2.textContent = TEXT2;
    line2.classList.add('is-on');
    later(close, 2000);
    return;
  }

  /* Build "Art is Life" as individual letters for the staggered reveal. */
  line2.textContent = '';
  line2.setAttribute('aria-label', TEXT2);
  Array.prototype.forEach.call(TEXT2, function (ch, i) {
    var span = document.createElement('span');
    span.className = 'splash-letter';
    span.setAttribute('aria-hidden', 'true');
    span.style.animationDelay = (i * LETTER_STEP / 1000).toFixed(2) + 's';
    span.textContent = ch === ' ' ? '\u00A0' : ch;
    line2.appendChild(span);
  });

  /* Typewriter with a blinking caret and a natural, slightly uneven rhythm. */
  var caret = document.createElement('span');
  caret.className = 'splash-caret';
  caret.setAttribute('aria-hidden', 'true');
  line1.textContent = '';
  line1.appendChild(caret);
  var typed = document.createTextNode('');
  line1.insertBefore(typed, caret);

  var i = 0;
  function nextChar() {
    if (closed) return;
    i += 1;
    typed.data = TEXT1.slice(0, i);
    if (i < TEXT1.length) {
      var ch = TEXT1.charAt(i - 1);
      var pause = (ch === ' ') ? WORD_PAUSE : 0;
      later(nextChar, TYPE_BASE + pause + Math.round(Math.random() * TYPE_JITTER));
    } else {
      finishTyping();
    }
  }

  function finishTyping() {
    later(function () {
      line1.classList.add('is-out');        // the welcome line dissolves only after it has been read
      later(function () {
        line2.classList.add('is-on');       // then "Art is Life" resolves letter by letter
      }, LINE_FADE);
    }, READ_WELCOME);
    later(close, READ_WELCOME + LINE_FADE + LETTER_STEP * TEXT2.length + 1000 + READ_ART);
  }

  later(nextChar, START_DELAY);
})();
