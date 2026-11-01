/* monoline.js -- the living mono-line drawing: a hand opens, a butterfly rises on a string.

   One drawing, four jobs (the art itself lives in js/monoline-art.js):
     1. SPLASH   Plays across the welcome screen. The hand draws and opens, the butterfly
                 emerges and flies, still on its string, so that it leaves through the
                 right-hand edge exactly when the welcome sequence ends.
     2. THE WALL It then appears from the exact point it left, on the left-hand edge, like a
                 bullet through a wall, and flies diagonally across the page. Its string lets
                 go, its colours bloom and the page opens from where it flies.
     3. HERO     Same drawing in the hero. The butterfly stays put on its string, flaps,
                 and the string releases gently.
     4. PLACEHOLDER  Same drawing wherever something is loading or empty. The butterfly
                 stays attached.

   All lines drift very slightly (a travelling ripple along the pen path). Nothing here
   touches the app logic: splash.js calls beginSplash() / handoff(), the rest is markup
   (data-mono="hero" | "ph") picked up by mountAll(). Without this file the site works as before. */
(function () {
  'use strict';

  var ART = window.MONO_ART;
  if (!ART || !document.createElementNS) return;

  var NS = 'http://www.w3.org/2000/svg';
  var PI = Math.PI, DEG = PI / 180;
  var reduceMq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reduced() { return !!(reduceMq && reduceMq.matches); }
  function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }

  /* ───────────────────────── maths ───────────────────────── */
  function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function seg(t, a, b) { return clamp((t - a) / (b - a), 0, 1); }
  function eio(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function esine(t) { return 0.5 - 0.5 * Math.cos(PI * t); }
  function ssm(t) { return t * t * (3 - 2 * t); }
  function r1(v) { return Math.round(v * 10) / 10; }
  function eo(t) { return 1 - Math.pow(1 - t, 3); }
  function unit(x, y) { var l = Math.hypot(x, y) || 1; return [x / l, y / l]; }

  /* Wing beat. A second harmonic makes the stroke lopsided (a quicker down-stroke, a lazier
     recovery) and a faint flutter keeps it from looking like a metronome. ft is flap time. */
  function wingQ(ft, ph) {
    var th = ft * 0.0148 + ph;
    var q = 0.5 + 0.5 * Math.sin(th) + 0.2 * Math.sin(2 * th + 0.9) + 0.05 * Math.sin(ft / 190 + ph * 3);
    return clamp(q, 0, 1);
  }

  /* 2D affine [a b c d e f]: x' = a x + c y + e,  y' = b x + d y + f */
  function mmul(m, n) {
    return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
            m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
            m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  }
  function mT(x, y) { return [1, 0, 0, 1, x, y]; }
  function mR(a) { var c = Math.cos(a), s = Math.sin(a); return [c, s, -s, c, 0, 0]; }
  function mS(x, y) { return [x, 0, 0, y == null ? x : y, 0, 0]; }
  function about(m, px, py) { return mmul(mT(px, py), mmul(m, mT(-px, -py))); }
  function mapply(m, x, y) { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }
  function mstr(m) {
    return 'matrix(' + r1(m[0] * 1e3) / 1e3 + ' ' + r1(m[1] * 1e3) / 1e3 + ' ' + r1(m[2] * 1e3) / 1e3 + ' ' +
      r1(m[3] * 1e3) / 1e3 + ' ' + r1(m[4] * 10) / 10 + ' ' + r1(m[5] * 10) / 10 + ')';
  }

  /* ───────────────────────── the drawing, prepared once ───────────────────────── */
  var PIV = ART.pivot, ATT = ART.attach, PP = ART.palmPivot;
  var BOX = ART.box;                                           // [x0, y0, x1, y1] visible art area
  var AXIS = Math.atan2(-25, 20);                              // body axis: lower-left -> upper-right

  function prep(flat, pen) {
    var n = flat.length / 2, i;
    var o = { n: n, pen: pen, x: new Float32Array(n), y: new Float32Array(n), cum: new Float32Array(n),
              nx: new Float32Array(n), ny: new Float32Array(n) };
    for (i = 0; i < n; i++) { o.x[i] = flat[2 * i]; o.y[i] = flat[2 * i + 1]; }
    for (i = 1; i < n; i++) o.cum[i] = o.cum[i - 1] + Math.hypot(o.x[i] - o.x[i - 1], o.y[i] - o.y[i - 1]);
    for (i = 0; i < n; i++) {
      var a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      var tx = o.x[b] - o.x[a], ty = o.y[b] - o.y[a], l = Math.hypot(tx, ty) || 1;
      o.nx[i] = -ty / l; o.ny[i] = tx / l;
    }
    o.len = o.cum[n - 1];
    return o;
  }
  var G = { palm: [], fing: [], wing: [], str: prep(ART.string, 0) };
  ART.strokes.forEach(function (s) {
    (s.g === 0 ? G.palm : s.g === 1 ? G.fing : G.wing).push(prep(s.p, s.d));
  });

  /* A ripple that travels along the pen path: lines are never still, but never wobble either. */
  function ripple(pen, t) {
    return Math.sin(pen * 0.052 - t * 0.0021) + 0.5 * Math.sin(pen * 0.117 + t * 0.00135 + 1.3);
  }

  /* 'd' for a list of strokes, drawn up to pen distance P (art units), rippled by amp (art units). */
  function dStrokes(list, P, amp, t) {
    var out = '';
    for (var j = 0; j < list.length; j++) {
      var s = list[j], f = P - s.pen;
      if (f <= 0) continue;
      if (f > s.len) f = s.len;
      var n = s.n, i, w, px, py, d = '';
      for (i = 0; i < n; i++) {
        if (s.cum[i] > f) {
          var u = (f - s.cum[i - 1]) / ((s.cum[i] - s.cum[i - 1]) || 1);
          w = amp * ripple(s.pen + f, t);
          px = lerp(s.x[i - 1], s.x[i], u) + lerp(s.nx[i - 1], s.nx[i], u) * w;
          py = lerp(s.y[i - 1], s.y[i], u) + lerp(s.ny[i - 1], s.ny[i], u) * w;
          d += 'L' + r1(px) + ' ' + r1(py);
          break;
        }
        w = amp * ripple(s.pen + s.cum[i], t);
        px = s.x[i] + s.nx[i] * w; py = s.y[i] + s.ny[i] * w;
        d += (i === 0 ? 'M' : 'L') + r1(px) + ' ' + r1(py);
      }
      if (d.charAt(0) !== 'M') d = 'M' + d.slice(1);
      out += d;
    }
    return out;
  }

  /* 'd' for a polyline given as arrays, visible between fractions a..b of its points. */
  function dPoly(xs, ys, a, b) {
    var n = xs.length;
    if (n < 2 || b <= a) return '';
    var fa = a * (n - 1), fb = b * (n - 1), i0 = Math.floor(fa), i1 = Math.ceil(fb), d = '', i, u;
    u = fa - i0;
    d += 'M' + r1(lerp(xs[i0], xs[Math.min(n - 1, i0 + 1)], u)) + ' ' + r1(lerp(ys[i0], ys[Math.min(n - 1, i0 + 1)], u));
    for (i = i0 + 1; i < i1; i++) d += 'L' + r1(xs[i]) + ' ' + r1(ys[i]);
    u = fb - (i1 - 1);
    if (i1 >= 1) d += 'L' + r1(lerp(xs[i1 - 1], xs[i1], u)) + ' ' + r1(lerp(ys[i1 - 1], ys[i1], u));
    return d;
  }

  /* ───────────────────────── images (start loading at once) ───────────────────────── */
  var IMG = ART.img, imgReady = false;
  (function preload() {
    var keys = ['wingsSoft', 'wingsVivid', 'palm', 'fingers'], left = keys.length;
    keys.forEach(function (k) {
      var im = new Image();
      var done = function () { if (--left === 0) imgReady = true; };
      im.onload = im.onerror = done;
      im.src = IMG[k].file;
    });
  })();

  /* ───────────────────────── the rig: one drawing in one <svg> ───────────────────────── */
  var uid = 0;
  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function image(def, parent, cls) {
    var e = el('image', { x: def.x, y: def.y, width: def.w, height: def.h, 'class': cls || '', preserveAspectRatio: 'none' }, parent);
    e.setAttribute('href', def.file);
    e.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', def.file);
    return e;
  }

  function Rig(kind) {
    this.kind = kind;                                  // 'stage' (full-screen px) or 'view' (art box)
    this.id = 'ml' + (++uid) + '-';
    var svg = this.svg = el('svg', { 'class': 'ml-svg ml-' + kind, 'aria-hidden': 'true', focusable: 'false',
      xmlns: NS });
    if (kind === 'view') {
      svg.setAttribute('viewBox', BOX[0] + ' ' + BOX[1] + ' ' + (BOX[2] - BOX[0]) + ' ' + (BOX[3] - BOX[1]));
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    }
    var defs = el('defs', null, svg), id = this.id;
    var glows = [['gp', 'rgba(169,139,224,.85)'], ['gb', 'rgba(56,168,240,.85)'],
                 ['gy', 'rgba(255,224,74,.9)'], ['gl', 'rgba(154,168,245,.8)']];
    glows.forEach(function (g) {
      var rg = el('radialGradient', { id: id + g[0] }, defs);
      el('stop', { offset: '0', 'stop-color': g[1] }, rg);
      el('stop', { offset: '1', 'stop-color': g[1].replace(/[\d.]+\)$/, '0)') }, rg);
    });
    var bg = el('linearGradient', { id: id + 'body', x1: '0', y1: '1', x2: '1', y2: '0' }, defs);
    el('stop', { offset: '0', 'stop-color': '#0a2410' }, bg);
    el('stop', { offset: '1', 'stop-color': '#1f5a2c' }, bg);

    this.gHand = el('g', { 'class': 'ml-hand' }, svg);
    this.imPalm = image(IMG.palm, this.gHand, 'ml-wash');
    this.pPalm = el('path', { 'class': 'ml-line' }, this.gHand);
    this.gFing = el('g', null, this.gHand);
    this.imFing = image(IMG.fingers, this.gFing, 'ml-wash');
    this.pFing = el('path', { 'class': 'ml-line' }, this.gFing);

    this.pStr = el('path', { 'class': 'ml-line ml-string' }, svg);

    /* the flow trail behind a free butterfly (hero only): soft dots that thin out behind it */
    this.trailDots = null;
    if (kind === 'view') {
      this.gTrail = el('g', { 'class': 'ml-trail' }, svg);
      this.trailDots = [];
      for (var td = 0; td < 14; td++) this.trailDots.push(el('circle', { r: 0, fill: 'url(#' + id + 'gl)', cx: 0, cy: 0 }, this.gTrail));
    }

    this.gBf = el('g', { 'class': 'ml-bf' }, svg);
    this.gWings = el('g', null, this.gBf);
    this.gGlow = el('g', { 'class': 'ml-glow' }, this.gWings);
    [['gp', 655, 265, 95], ['gb', 645, 352, 72], ['gy', 738, 292, 46], ['gy', 672, 383, 40], ['gl', 745, 230, 62]]
      .forEach(function (c) { el('circle', { cx: c[1], cy: c[2], r: c[3], fill: 'url(#' + id + c[0] + ')' }, this.gGlow); }, this);
    this.imSoft = image(IMG.wingsSoft, this.gWings, 'ml-wash');
    this.imVivid = image(IMG.wingsVivid, this.gWings, 'ml-wash');
    this.pWing = el('path', { 'class': 'ml-line' }, this.gWings);
    this.pBody = el('path', { d: ART.body, fill: 'url(#' + id + 'body)', stroke: '#0f3016', 'stroke-width': '1.4',
      'stroke-linejoin': 'round' }, this.gBf);

    this.Th = [1, 0, 0, 1, 0, 0];                       // art -> target space
    this.k = 1;                                         // screen px per art unit (hand)
    this.phase = Math.random() * 6;
    this.last = {};
  }

  Rig.prototype.setWidth = function (px) { this.svg.style.setProperty('--ml-w', px.toFixed(2) + 'px'); };

  /* the flow trail: pts is newest-last; each dot is smaller and fainter than the one ahead of it */
  Rig.prototype.drawTrail = function (pts, a) {
    var dots = this.trailDots, n = dots.length, i;
    for (i = 0; i < n; i++) {
      var c = dots[i], p = pts[pts.length - 1 - i];
      if (!p || a <= 0.01) { if (c.__r !== 0) { c.setAttribute('r', 0); c.__r = 0; } continue; }
      var f = i / n;
      c.setAttribute('cx', r1(p.x)); c.setAttribute('cy', r1(p.y));
      c.setAttribute('r', r1(4 + 9 * (1 - f))); c.__r = 1;
      c.style.opacity = r1(clamp(a, 0, 1) * (1 - f) * (1 - f) * 0.42);
    }
  };

  /* Draws one frame from a state object (see the *State functions below). */
  Rig.prototype.render = function (st) {
    var t = st.t, Th = this.Th, k = this.k, L = this.last;

    /* hand: breathes, fingers open */
    var Rh = about(mR(st.breath * 0.55 * DEG * Math.sin(t / 1700)), 130, 770);
    var hm = mmul(Th, Rh);
    var o = st.open;
    var Ff = about(mmul(mR(-7 * DEG * (1 - o)), mS(1 - 0.07 * (1 - o))), PP[0], PP[1]);
    this.gHand.setAttribute('transform', mstr(hm));
    this.gFing.setAttribute('transform', mstr(Ff));
    this.setOp(this.gHand, st.handAlpha);
    this.setOp(this.imPalm, st.handColour * 0.92);
    this.setOp(this.imFing, st.handColour * 0.92);
    var ampH = st.waveHand / k;
    this.pPalm.setAttribute('d', dStrokes(G.palm, st.penHand, ampH, t));
    this.pFing.setAttribute('d', dStrokes(G.fing, st.penHand, ampH, t));

    /* butterfly: position, heading, size, wing flap */
    var bf = st.bf;
    var q = wingQ(st.flapT != null ? st.flapT : t, this.phase) * bf.flap;
    if (this.trailDots) this.drawTrail(st.trail || [], st.trailA || 0);
    var fl = about(mmul(mR(AXIS), mmul(mS(1, 1 - 0.36 * q), mR(-AXIS))), PIV[0], PIV[1]);
    fl = mmul(about(mR(3.2 * DEG * (2 * q - 1)), PIV[0], PIV[1]), fl);
    var Mb = mmul(mT(bf.x, bf.y), mmul(mR(bf.rot), mmul(mS(bf.sc), mT(-PIV[0], -PIV[1]))));
    this.gBf.setAttribute('transform', mstr(Mb));
    this.gWings.setAttribute('transform', mstr(fl));
    this.setOp(this.gBf, bf.alpha);
    var v = clamp(st.v, 0, 1);
    this.setOp(this.imSoft, 1);
    this.setOp(this.imVivid, v);
    this.setOp(this.gGlow, 0.62 * Math.pow(v, 1.5));
    this.pWing.setAttribute('d', dStrokes(G.wing, st.penWing, st.waveWing / (k * bf.sc), t));

    /* string: either an elastic copy of the drawn string between the two ends, or a supplied trail */
    var S = st.str;
    if (!S || S.alpha <= 0.002) { this.setOp(this.pStr, 0); return; }
    this.setOp(this.pStr, S.alpha);
    if (S.poly) { this.pStr.setAttribute('d', S.poly); return; }
    var A = mapply(mmul(hm, Ff), ART.string[0], ART.string[1]);
    var B = mapply(mmul(Mb, fl), ATT[0], ATT[1]);
    var A0 = mapply(Th, ART.string[0], ART.string[1]), B0 = mapply(Th, ATT[0], ATT[1]);
    var v0x = B0[0] - A0[0], v0y = B0[1] - A0[1], vx = B[0] - A[0], vy = B[1] - A[1];
    var l0 = Math.hypot(v0x, v0y) || 1, l1 = Math.hypot(vx, vy) || 1;
    var kk = l1 / l0, th = Math.atan2(vy, vx) - Math.atan2(v0y, v0x), c = Math.cos(th), s = Math.sin(th);
    var sx = G.str, n = sx.n, xs = new Array(n), ys = new Array(n), i;
    var slack = Math.pow(1 - clamp(kk, 0, 1), 1.4) * 0.32 * l1;          // loose rope when the ends are close
    var pxAmp = S.amp / (this.kind === 'view' ? k : 1);                  // ripple, converted to target units
    var nxv = -vy / l1, nyv = vx / l1;
    for (i = 0; i < n; i++) {
      var u = sx.cum[i] / sx.len;
      var bx = mapply(Th, sx.x[i], sx.y[i]), nx0 = sx.nx[i], ny0 = sx.ny[i];
      var dx = (bx[0] - A0[0]) * kk, dy = (bx[1] - A0[1]) * kk;
      var px = A[0] + dx * c - dy * s, py = A[1] + dx * s + dy * c;
      var nx = nx0 * c - ny0 * s, ny = nx0 * s + ny0 * c;
      var w = pxAmp * (0.22 + 0.78 * Math.pow(u, 1.25)) * ripple(400 + sx.cum[i], t) * (1 + 1.6 * S.loose * u);
      w += slack * Math.sin(PI * u);
      xs[i] = px + nx * w * 1 + nxv * 0; ys[i] = py + ny * w * 1 + nyv * 0;
    }
    this.pStr.setAttribute('d', dPoly(xs, ys, S.a, S.b));
    this.lastB = B;
  };

  Rig.prototype.setOp = function (node, v) {
    v = Math.round(clamp(v, 0, 1) * 1000) / 1000;
    if (node.__o === v) return;
    node.__o = v;
    node.style.opacity = v;
    node.style.visibility = v <= 0.001 ? 'hidden' : 'visible';
  };

  function blankState(t) {
    return { t: t, breath: 1, open: 1, penHand: ART.handPen, penWing: ART.wingPen, handAlpha: 1, handColour: 1,
             waveHand: 0.8, waveWing: 0.5, v: 0.5,
             bf: { x: PIV[0], y: PIV[1], rot: 0, sc: 1, alpha: 1, flap: 1 },
             str: { a: 0, b: 1, alpha: 1, amp: 2.6, loose: 0 } };
  }

  /* ───────────────────────── VIEW: hero + placeholders ───────────────────────── */
  var views = [], loopOn = false, heroGo = false;

  function viewState(inst, ms) {
    var tt = ms * inst.speed, st = blankState(ms);
    var hero = inst.mode === 'hero';
    st.penHand = esine(seg(tt, 150, 2300)) * ART.handPen;
    st.handAlpha = ssm(seg(tt, 80, 500));
    st.handColour = ssm(seg(tt, 900, 3200));
    st.open = eio(seg(tt, 1500, 3200));
    st.penWing = esine(seg(tt, 2500, 3700)) * ART.wingPen;
    st.bf.alpha = ssm(seg(tt, 2350, 2800));
    st.bf.flap = ssm(seg(tt, 3000, 4200));
    var strDraw = esine(seg(tt, 1300, 2800));
    var v = lerp(0.04, 0.5, ssm(seg(tt, 2800, 5600)));
    var dd = 0;
    if (hero) {
      /* gentle release: the string lets go of the butterfly and slips back into the hand */
      dd = eio(seg(tt, 6200, 9000));
      v = lerp(v, 1, ssm(seg(tt, 6600, 9400)));
    }
    st.v = v;
    st.str.a = 0;
    st.str.b = strDraw * (1 - dd);
    st.str.alpha = (1 - 0.0 * dd) * (strDraw > 0 ? 1 : 0);
    st.str.loose = dd * 1.2;
    st.str.amp = lerp(2.2, 4.6, dd) * (0.7 + 0.3 * ssm(seg(tt, 3000, 4500)));
    /* the butterfly hovers: a slow bob, a little lift once free */
    st.bf.y = PIV[1] - 14 * ssm(dd) + 2.6 * Math.sin(ms / 940) * ssm(seg(tt, 3000, 4200));
    st.bf.x = PIV[0] + (hero ? 3 * ssm(dd) : 0) + 1.2 * Math.sin(ms / 1330);
    st.bf.rot = 2.5 * DEG * Math.sin(ms / 1500);
    return st;
  }

  /* ───────────────────────── HERO: freeing, the scroll cue, then the free flight ─────────────────────────
     Times are ms from the moment the hero opens:
       0 - 1.5 s    the hand draws and opens; the butterfly rests on its string
       1.8 - 3.0 s  the butterfly struggles: three tugs, each pulled back and then punching harder
       3.0 s        the string lets go; the butterfly glows and flees up and out to the right
       4.1 - 4.9 s  it comes back closer and larger, and melts into a hand
       4.9 - 6.9 s  the hand gives the scroll cue (up, down, up, down; half a second each) and a toast
       6.9 - 7.5 s  the butterfly rises out of the hand and roams the hero                              */
  var HR = { draw: 1500, bfIn: 1100, s0: 1800, s1: 3000, f1: 4100, back1: 4900,
             cueIn: 4500, cue0: 4900, cueStep: 500, cueEnd: 6900, roam0: 7500 };
  var FLEE = [BOX[2] + 320, BOX[1] - 240];
  var CENTRE = [(BOX[0] + BOX[2]) / 2, (BOX[1] + BOX[3]) / 2];
  var SAFE = [BOX[0] + 150, BOX[1] + 130, BOX[2] - 150, BOX[3] - 130];

  /* one struggle, u in 0..1: three tugs; each pulls back a little, then punches harder than the last */
  function struggleOffset(u) {
    var c = Math.min(u, 0.999999) * 3, k = Math.floor(c), s = c - k;
    var A = 40 + 34 * k;
    return s < 0.62 ? -0.35 * A * eio(s / 0.62) : lerp(-0.35 * A, A, eo((s - 0.62) / 0.38));
  }

  /* roaming: 96 combinations of shape (6) x size (4) x side (2) x tempo (2), changed abruptly */
  var ROAM_AMP = [70, 110, 150, 185], ROAM_PER = [5200, 3300];
  function roamCombo(i) {
    var shape = i % 6, size = Math.floor(i / 6) % 4, side = Math.floor(i / 24) % 2 ? -1 : 1;
    var A = ROAM_AMP[size];
    return { shape: shape, A: A, B: A * (0.45 + 0.35 * ((size + shape) % 2)), dir: side, per: ROAM_PER[Math.floor(i / 48) % 2] };
  }
  function roamOffset(cb, tau) {
    var th = 2 * PI * tau / cb.per, A = cb.A, B = cb.B, x, y, r;
    switch (cb.shape) {
      case 0: x = A * Math.cos(th); y = 0.5 * B * Math.sin(2 * th); break;                 // figure of eight
      case 1: x = A * Math.sin(th); y = -B * Math.cos(th); break;                          // loop
      case 2: x = A * 0.6366 * Math.asin(Math.sin(th)); y = 0.6 * B * Math.sin(2 * th); break; // zigzag
      case 3: x = A * Math.sin(th); y = 0.5 * B * (1 - Math.cos(2 * th)); break;           // swoop
      case 4: x = 0.7 * A * Math.sin(th) + 0.3 * A * Math.sin(2.9 * th); y = 0.6 * B * Math.sin(1.7 * th); break; // hover
      default: r = A * (0.55 + 0.45 * Math.cos(0.37 * th)); x = r * Math.cos(th); y = 0.7 * r * Math.sin(th); // spiral
    }
    return [cb.dir * x, y];
  }
  function roamPlan(inst, upTo) {
    var segs = inst.roam || (inst.roam = []);
    while ((segs.length ? segs[segs.length - 1].end : 0) < upTo) {
      var prev = segs[segs.length - 1], pick, guard = 0;
      do { pick = Math.floor(Math.random() * 96); } while (prev && pick === prev.pick && guard++ < 8);
      var cb = roamCombo(pick), start = prev ? prev.end : 0, dur = 3200 + Math.random() * 2600;
      var c = [lerp(SAFE[0] + cb.A, SAFE[2] - cb.A, Math.random()), lerp(SAFE[1] + cb.B, SAFE[3] - cb.B, Math.random())];
      segs.push({ pick: pick, combo: cb, start: start, end: start + dur, c: c });
    }
  }
  function segPos(sg, tau) {
    var o = roamOffset(sg.combo, tau - sg.start);
    return [sg.c[0] + o[0], sg.c[1] + o[1]];
  }
  /* where the roaming butterfly's pivot is, tau ms after the roam begins */
  function roamAt(inst, tau) {
    roamPlan(inst, tau + 2000);
    var segs = inst.roam, i = 0;
    while (i < segs.length - 1 && tau >= segs[i].end) i++;
    var sg = segs[i], cur = segPos(sg, tau);
    var prev = i === 0 ? CENTRE : segPos(segs[i - 1], segs[i - 1].end);
    var b = ssm(seg(tau, sg.start, sg.start + 420));                   // a short blend, then the new pattern
    return [lerp(prev[0], cur[0], b) + 9 * Math.sin(tau / 700) + 5 * Math.sin(tau / 1130 + 1.2),
            lerp(prev[1], cur[1], b) + 7 * Math.cos(tau / 890 + 0.4)];
  }

  function heroState(inst, t) {
    var st = blankState(t), P = PIV, d = unit(PIV[0] - ATT[0], PIV[1] - ATT[1]);
    var s0 = HR.s0, s1 = HR.s1, f1 = HR.f1, b1 = HR.back1;
    st.penHand = esine(seg(t, 0, HR.draw)) * ART.handPen;
    st.handAlpha = ssm(seg(t, 0, 300));
    st.handColour = ssm(seg(t, 250, 1100));
    st.open = eio(seg(t, 500, 1500));
    st.penWing = esine(seg(t, 800, 1700)) * ART.wingPen;

    /* the string: drawn in, tightens while the butterfly tugs, then snaps away */
    var strIn = esine(seg(t, 500, 1600)), snap = ssm(seg(t, s1, s1 + 260));
    st.str.a = 0; st.str.b = strIn; st.str.loose = 0;
    st.str.alpha = strIn > 0 ? 1 - snap : 0;
    st.str.amp = 2.6 + 2.4 * seg(t, s0, s1);

    var bob = 2.6 * Math.sin(t / 940) * ssm(seg(t, HR.bfIn + 200, 1800));
    var px = P[0], py = P[1] + bob, sc = 1, rot = 2.5 * DEG * Math.sin(t / 1500), rate = 1;
    if (t < s0) {
      /* resting on the string */
    } else if (t < s1) {
      var u = seg(t, s0, s1), off = struggleOffset(u);
      px = P[0] + d[0] * off; py = P[1] + d[1] * off + 3 * Math.sin(t / 37);
      rate = 1 + 0.9 * u;
    } else if (t < f1) {
      var F = Math.pow(seg(t, s1, f1), 2.2), off1 = struggleOffset(1);
      var x0 = P[0] + d[0] * off1, y0 = P[1] + d[1] * off1;
      px = lerp(x0, FLEE[0], F); py = lerp(y0, FLEE[1], F);
      rot = clamp((Math.atan2(FLEE[1] - y0, FLEE[0] - x0) - AXIS) * 0.5, -0.9, 0.9);
      rate = 2.2;
    } else if (t < b1) {
      var e = eio(seg(t, f1, b1)), arc = Math.sin(PI * e) * -90;
      px = lerp(FLEE[0], CENTRE[0], e) + arc * 0.4; py = lerp(FLEE[1], CENTRE[1], e) + arc;
      sc = lerp(1, 1.7, ssm(seg(t, f1 + 300, b1)));
      rate = 1.6;
    } else if (t < HR.cueEnd) {
      px = CENTRE[0]; py = CENTRE[1]; sc = 1.7;
    } else if (t < HR.roam0) {
      px = CENTRE[0]; py = CENTRE[1]; sc = lerp(1.7, 1, ssm(seg(t, HR.cueEnd, HR.roam0)));
    } else {
      var tau = t - HR.roam0, rp = roamAt(inst, tau), h0 = roamAt(inst, tau - 12), h1 = roamAt(inst, tau + 12);
      var hd = Math.atan2(h1[1] - h0[1], h1[0] - h0[0]);
      px = rp[0]; py = rp[1];
      rot = lerp(rot, clamp((hd - AXIS) * 0.5, -0.9, 0.9), ssm(seg(t, HR.roam0, HR.roam0 + 600)));
    }
    st.bf.x = px; st.bf.y = py; st.bf.sc = sc; st.bf.rot = rot;
    st.flapRate = rate;

    /* visibility: it appears on the string, melts into the hand, and rises again out of it */
    var appear = ssm(seg(t, HR.bfIn, HR.bfIn + 400));
    var melt = 1 - ssm(seg(t, b1 + 100, b1 + 600));
    st.bf.alpha = t < HR.cueEnd ? appear * melt : ssm(seg(t, HR.cueEnd, HR.cueEnd + 300));
    st.bf.flap = ssm(seg(t, HR.bfIn + 150, 1800));

    /* glow: a first flash at release, then a steady warm glow; the trail flows behind it */
    var vBase = lerp(0.04, 0.5, ssm(seg(t, 1300, 2600))) + 0.22 * seg(t, s0, s1);
    var rel = seg(t, s1, s1 + 1500);
    st.v = t < s1 ? vBase : (t < HR.roam0 ? 0.5 + 0.5 * Math.pow(1 - rel, 2) : 0.5 + 0.06 * Math.sin(t / 900));
    var trailIn = ssm(seg(t, s1 + 120, s1 + 700)), trailOut = 1 - ssm(seg(t, b1 - 500, b1));
    st.trailA = t < b1 ? trailIn * trailOut : (t >= HR.cueEnd ? ssm(seg(t, HR.cueEnd + 200, HR.roam0 + 500)) : 0);
    return st;
  }

  /* the scroll cue: a hand that swipes up and down, the page nudging with it, a toast, and a
     gentle retreat as soon as the visitor touches the page */
  function makeCue(host) {
    var el = document.createElement('div');
    el.className = 'ml-cue';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<svg class="ml-cue-hand" viewBox="0 0 64 64" focusable="false">' +
      '<g fill="currentColor"><rect x="25" y="3" width="11" height="32" rx="5.5"/>' +
      '<rect x="37" y="14" width="10" height="24" rx="5"/><rect x="17" y="19" width="9" height="20" rx="4.5"/>' +
      '<rect x="43" y="23" width="8" height="17" rx="4"/><rect x="5" y="31" width="13" height="9" rx="4.5"/>' +
      '<rect x="14" y="28" width="36" height="28" rx="14"/></g></svg>';
    host.appendChild(el);
    return el;
  }
  function cueSeen() { try { return sessionStorage.getItem('ail_cue_seen') === '1'; } catch (_) { return false; } }
  function markCueSeen() { try { sessionStorage.setItem('ail_cue_seen', '1'); } catch (_) { /* private mode */ } }
  function fx(v) { return Math.round(clamp(v, 0, 1) * 1000) / 1000; }

  /* a visitor's touch, wheel, key or press during the cue retreats it */
  function cutCues() {
    views.forEach(function (v) {
      if (v.cue && v.cueStarted && !v.cueDone && v.cutAt < 0) v.cutAt = v.lastMs || 0;
    });
  }
  ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach(function (ev) {
    window.addEventListener(ev, cutCues, { passive: true, capture: true });
  });

  function staticState(inst) {
    var st = blankState(0);
    st.waveHand = 0; st.waveWing = 0; st.breath = 0; st.v = inst.mode === 'hero' ? 1 : 0.6;
    st.bf.flap = 0.4; st.str.amp = 0; st.str.alpha = inst.mode === 'hero' ? 0 : 1; st.str.b = 1;
    if (inst.mode === 'hero') st.bf.y = PIV[1] - 14;
    return st;
  }

  function View(host, mode) {
    this.host = host; this.mode = mode;
    this.speed = mode === 'ph' ? 1.5 : 1;
    this.rig = new Rig('view');
    host.appendChild(this.rig.svg);
    host.classList.add('ml-host');
    this.t0 = 0; this.started = false; this.visible = true; this.lastDraw = 0;
    this.flapT = 0; this.lastT = -1; this.lastMs = 0; this.hist = []; this.roam = null;
    this.cue = mode === 'hero' ? makeCue(host) : null; this.cueStarted = false; this.cueDone = false;
    this.cueK = -1; this.cuePage = 0; this.cueBase = 0; this.cutAt = -1;
    this.still = reduced();
    var self = this;
    this.measure();
    if (window.ResizeObserver) { this.ro = new ResizeObserver(function () { self.measure(); }); this.ro.observe(host); }
    if (window.IntersectionObserver) {
      this.io = new IntersectionObserver(function (es) { self.visible = es[es.length - 1].isIntersecting; }, { rootMargin: '80px' });
      this.io.observe(host);
    }
    if (this.still) { this.rig.render(staticState(this)); this.started = true; }
    else if (mode === 'ph' || heroGo) this.start();
    else this.rig.render(preState());
  }
  function preState() {
    var st = blankState(0);
    st.penHand = 0; st.penWing = 0; st.handAlpha = 0; st.handColour = 0; st.bf.alpha = 0; st.str.alpha = 0; st.v = 0;
    return st;
  }
  View.prototype.start = function () { if (this.started) return; this.started = true; this.t0 = now(); };
  View.prototype.measure = function () {
    var w = this.host.clientWidth || 300, h = this.host.clientHeight || 300;
    var bw = BOX[2] - BOX[0], bh = BOX[3] - BOX[1];
    this.rig.k = Math.min(w / bw, h / bh) || 0.4;
    this.rig.setWidth(clamp(3.3 * this.rig.k * 1.12, 1.25, 3.2));
  };
  View.prototype.tick = function (t) {
    if (!this.started || this.still || !this.visible) return;
    var gap = this.mode === 'ph' ? 33 : 0;
    if (gap && t - this.lastDraw < gap) return;
    this.lastDraw = t;
    var ms = t - this.t0;
    this.lastMs = ms;
    if (this.mode !== 'hero') { this.rig.render(viewState(this, ms)); return; }
    var st = heroState(this, ms);
    var dt = this.lastT < 0 ? 16 : Math.min(64, t - this.lastT);
    this.lastT = t;
    this.flapT += dt * st.flapRate;
    st.flapT = this.flapT;
    if (st.trailA > 0.01) { this.hist.push({ x: st.bf.x, y: st.bf.y }); if (this.hist.length > 14) this.hist.shift(); }
    else this.hist.length = 0;
    st.trail = this.hist;
    st.trailA = st.trailA || 0;
    this.rig.render(st);
    this.cueTick(ms);
  };

  View.prototype.cueTick = function (t) {
    var el = this.cue;
    if (!el || this.cueDone) return;
    if (!this.cueStarted) {
      if (t < HR.cueIn) return;
      this.cueStarted = true;
      if (window.scrollY > 4 || cueSeen()) { this.cueDone = true; el.style.opacity = '0'; return; }
      markCueSeen();
      var rr = this.rig.svg.getBoundingClientRect(), hr = this.host.getBoundingClientRect();
      el.style.left = (rr.left - hr.left + rr.width / 2) + 'px';
      el.style.top = (rr.top - hr.top + rr.height / 2) + 'px';
      this.cueBase = window.scrollY || 0;
      document.documentElement.style.scrollBehavior = 'auto';
    }
    var vis = ssm(seg(t, HR.cueIn, HR.cue0)) * (1 - ssm(seg(t, HR.cueEnd, HR.cueEnd + 350)));
    if (this.cutAt >= 0) {                                   // the visitor touched the page: retreat
      var out = 1 - ssm(seg(t, this.cutAt, this.cutAt + 320));
      el.style.opacity = String(fx(out));
      el.style.transform = 'translate(-50%,-50%) scale(' + fx(0.84 + 0.16 * out) + ')';
      if (t >= this.cutAt + 320) this.finishCue();
      return;
    }
    var y = 0, page = 0;
    if (t >= HR.cue0 && t < HR.cueEnd) {
      var k = Math.floor((t - HR.cue0) / HR.cueStep), up = k % 2 === 0;
      var e = eio(seg(t, HR.cue0 + k * HR.cueStep, HR.cue0 + (k + 1) * HR.cueStep));
      y = up ? lerp(14, -14, e) : lerp(-14, 14, e);
      page = up ? 64 * e : 64 * (1 - e);
      if (k !== this.cueK) { this.cueK = k; if (window.Feel) window.Feel.tick('tick'); }
      if (!this.toasted) {
        this.toasted = true;
        if (typeof window.showToast === 'function') window.showToast('Scroll up for contents and more', 2000);
      }
    }
    if (page !== this.cuePage) { window.scrollTo(0, this.cueBase + page); this.cuePage = page; }
    el.style.opacity = String(fx(vis));
    el.style.transform = 'translate(-50%,-50%) translateY(' + r1(y) + 'px) scale(' + fx(0.84 + 0.16 * vis) + ')';
    if (t >= HR.cueEnd + 350) this.finishCue();
  };

  View.prototype.finishCue = function () {
    this.cueDone = true;
    document.documentElement.style.scrollBehavior = '';
    if (this.cue) this.cue.style.opacity = '0';
  };
  View.prototype.destroy = function () {
    if (this.ro) this.ro.disconnect();
    if (this.cue && this.cue.parentNode) this.cue.parentNode.removeChild(this.cue);
    if (this.io) this.io.disconnect();
    if (this.rig.svg.parentNode) this.rig.svg.parentNode.removeChild(this.rig.svg);
    this.host.classList.remove('ml-host');
    this.host.__mono = null;
  };

  /* ───────────────────────── loop ───────────────────────── */
  var stage = null;
  function frame(t) {
    var i;
    if (!document.hidden) {
      for (i = views.length - 1; i >= 0; i--) {
        var v = views[i];
        if (!v.host.isConnected) { v.destroy(); views.splice(i, 1); continue; }
        v.tick(t);
      }
      if (stage) stage.tick(t);
    }
    if (views.length || stage) window.requestAnimationFrame(frame); else loopOn = false;
  }
  function ensureLoop() { if (!loopOn) { loopOn = true; window.requestAnimationFrame(frame); } }

  /* ───────────────────────── paths for the stage (smooth Catmull-Rom, by arc length) ───────────────────────── */
  function makePath(pts, back) {
    var out = [], i, j, N = 26;
    var P = pts.slice();
    P.unshift([2 * P[0][0] - P[1][0], 2 * P[0][1] - P[1][1]]);
    P.push([2 * P[P.length - 1][0] - P[P.length - 2][0], 2 * P[P.length - 1][1] - P[P.length - 2][1]]);
    for (i = 1; i < P.length - 2; i++) {
      for (j = 0; j < N; j++) {
        var u = j / N, u2 = u * u, u3 = u2 * u, p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2];
        out.push([0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * u + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * u2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * u3),
                  0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * u + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * u2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * u3)]);
      }
    }
    out.push(pts[pts.length - 1].slice());
    var cum = [0];
    for (i = 1; i < out.length; i++) cum.push(cum[i - 1] + Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]));
    var len = cum[cum.length - 1];
    return {
      len: len,
      /* position + unit tangent at arc length s; straight extensions beyond both ends */
      at: function (s) {
        var a, b, u, lo = 0, hi = cum.length - 1;
        if (s <= 0) { a = out[0]; b = out[1]; u = s / ((cum[1]) || 1); }
        else if (s >= len) { a = out[out.length - 2]; b = out[out.length - 1]; u = 1 + (s - len) / ((cum[cum.length - 1] - cum[cum.length - 2]) || 1); }
        else {
          while (hi - lo > 1) { var m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
          a = out[lo]; b = out[hi]; u = (s - cum[lo]) / ((cum[hi] - cum[lo]) || 1);
        }
        var tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1;
        return { x: a[0] + tx * u, y: a[1] + ty * u, tx: tx / l, ty: ty / l };
      }
    };
  }

  /* ───────────────────────── STAGE: splash flight, the wall, the opening ───────────────────────── */
  var T_B = 5400;                                      // length of the "through the wall" scene (ms)

  function Stage(opts) {
    this.closeAt = Math.max(3000, opts.closeAt);       // when the welcome sequence ends (ms from start)
    this.rig = new Rig('stage');
    var host = document.createElement('div');
    host.className = 'ml-stage';
    host.setAttribute('aria-hidden', 'true');
    host.appendChild(this.rig.svg);
    document.body.appendChild(host);
    this.host = host;
    this.tA = 0; this.rate = 1; this.last = 0;
    this.phase = 'A';                                  // A: splash, B: through the wall, done
    this.tB = 0; this.finish = null; this.skipped = false;
    this.curtain = null; this.heroFired = false; this.freeze = null;
    this.layout();
    var self = this;
    this.onResize = function () { self.layout(); };
    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', this.onResize);
  }

  Stage.prototype.layout = function () {
    var W = window.innerWidth || document.documentElement.clientWidth, H = window.innerHeight || document.documentElement.clientHeight;
    this.W = W; this.H = H;
    var svg = this.rig.svg;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('width', W); svg.setAttribute('height', H);
    /* art zone: the upper part of the screen; the welcome text sits lower */
    var ax0 = 40, ay0 = 180, ax1 = 790, ay1 = 960;
    var zx0 = W * 0.06, zx1 = W * 0.94, zy0 = Math.max(H * 0.11, 44), zy1 = H * 0.585;
    var s = Math.min((zx1 - zx0) / (ax1 - ax0), (zy1 - zy0) / (ay1 - ay0));
    var ox = (zx0 + zx1) / 2 - ((ax0 + ax1) / 2) * s, oy = zy0 - ay0 * s;
    this.s = s;
    this.rig.Th = [s, 0, 0, s, ox, oy];
    this.rig.k = s;
    this.rig.setWidth(clamp(3.4 * s * 1.15, 1.5, 3.4));
    var T = this.rig.Th, me = this;
    function art(x, y) { return mapply(T, x, y); }
    /* butterfly size on screen, and how far off-screen it must be to be fully hidden */
    var bfPx = Math.max(240, 250) * s;
    var m = bfPx * 0.78;
    this.m = m;
    /* flight A: the butterfly rises out of the palm along its own string, then glides out to the right */
    var str = G.str, up = [];
    function sPt(u) { var i = Math.round(u * (str.n - 1)); return art(str.x[i], str.y[i]); }
    var dl = [(PIV[0] - ATT[0]) * s, (PIV[1] - ATT[1]) * s];
    var A0 = sPt(0), K3 = art(PIV[0], PIV[1]);
    var k0 = [A0[0] + dl[0] * 0.15, A0[1] + dl[1] * 0.15];
    var k1 = [sPt(0.3)[0] + dl[0] * 0.8, sPt(0.3)[1] + dl[1] * 0.8];
    var k2 = [sPt(0.64)[0] + dl[0], sPt(0.64)[1] + dl[1]];
    var exitY = Math.min(K3[1] + H * 0.13, H * 0.42);
    var k4 = [lerp(K3[0], W + m, 0.45), lerp(K3[1], exitY, 0.35)];
    var k5 = [W + m, exitY];
    this.pathA = makePath([k0, k1, k2, K3, k4, k5]);
    this.palm = k0;
    /* the wall: same height, other side, same heading */
    var end = this.pathA.at(this.pathA.len), slope = end.ty / (end.tx || 1);
    var yc = this.pathA.at(this.pathA.len - m * 1.0).y;             // height where it crossed the right edge
    var yL = yc - slope * 0 ;                                        // keep the exact crossing height on the left edge
    var b0 = [-m, yL - slope * 0];
    var b1 = [b0[0] + end.tx * W * 0.2, b0[1] + end.ty * W * 0.2];
    var pts = [b0, b1,
               [W * 0.28, yL + H * 0.035],
               [W * 0.52, yL + H * 0.005],
               [W * 0.76, yL - H * 0.075],
               [W + m * 1.4, yL - H * 0.20]];
    this.pathB = makePath(pts);
    this.vA = 0;
  };

  Stage.prototype.A = function (t) {                     // state of the splash scene at tA = t (ms)
    var st = blankState(t), s = this.s, tc = this.closeAt;
    st.penHand = esine(seg(t, 200, 2300)) * ART.handPen;
    st.handAlpha = ssm(seg(t, 100, 500));
    st.handColour = ssm(seg(t, 700, 2900));
    st.open = eio(seg(t, 1700, 3300));
    st.waveHand = 0.9; st.waveWing = 0.5;
    var e = seg(t, 2500, 3900);
    st.penWing = esine(seg(t, 2500, 3500)) * ART.wingPen;
    st.bf.alpha = ssm(seg(t, 2450, 2900));
    st.bf.flap = ssm(seg(t, 2700, 3900));
    st.bf.sc = s * lerp(0.2, 1, 1 - Math.pow(1 - e, 3));
    st.v = lerp(0.04, 0.42, ssm(seg(t, 2600, tc)));
    var x = clamp((t - 3000) / (tc - 3000), 0, 1);
    var f = 0.2 * x + 0.8 * (1 - Math.cos(PI * x / 2));
    var P = this.pathA, p = P.at(f * P.len);
    var flutter = Math.sin(t / 430) * 5.5 * s * 2 * Math.min(1, x * 3 + 0.0);
    var pre = (1 - seg(t, 2500, 3900));
    var base = P.at(Math.min(P.len * 0.02, 12));                          // hover over the palm while emerging
    st.bf.x = lerp(p.x, base.x, pre) - p.ty * flutter;
    st.bf.y = lerp(p.y, base.y, pre) + p.tx * flutter - 6 * pre;
    var ang = Math.atan2(p.ty, p.tx);
    st.bf.rot = clamp((ang - AXIS) * 0.5, -0.9, 0.9);
    this.vA = x; this.speedA = P.len * (0.2 + 0.8 * (PI / 2) * Math.sin(PI * x / 2)) / (tc - 3000);   // px per ms
    st.str.alpha = ssm(seg(t, 2500, 2850));
    st.str.amp = 3.2; st.str.loose = 0;
    return st;
  };

  Stage.prototype.B = function (tb) {                   // state of the wall scene, tb ms after hand-over
    var st = blankState(this.tA + tb), W = this.W, H = this.H, s = this.s;
    var P = this.pathB, L = P.len;
    /* position along the path: starts at the speed it left with, glides, drifts off */
    var T = T_B, v0 = Math.max(0.02, this.speedA || 0.09), v1 = v0 * 0.9;
    var u = clamp(tb / T, 0, 1), u2 = u * u, u3 = u2 * u;
    var h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
    var sB = h10 * T * v0 + h01 * L + h11 * T * v1;
    sB = clamp(sB, 0, L * 1.2);
    if (tb < 40) sB = Math.max(sB, tb * v0);
    var p = P.at(sB);
    var big = 1 + 0.22 * ssm(seg(tb, 1600, 3600));
    var flutter = Math.sin((this.tA + tb) / 430) * 8 * s;
    st.bf.x = p.x - p.ty * flutter; st.bf.y = p.y + p.tx * flutter;
    st.bf.sc = s * big;
    st.bf.rot = clamp((Math.atan2(p.ty, p.tx) - AXIS) * 0.5, -0.9, 0.9);
    st.bf.alpha = 1 - ssm(seg(tb, 4300, T_B - 100));
    st.bf.flap = 1;
    st.v = lerp(0.42, 1, ssm(seg(tb, 1000, 3300)));
    /* hand and splash scene leave with the old page */
    var out = 1 - ssm(seg(tb, 0, 520));
    st.handAlpha = out; st.handColour = out; st.penHand = ART.handPen; st.penWing = ART.wingPen;
    this.rig.lastB = [st.bf.x, st.bf.y];
    st.str = { alpha: 1, amp: 3, a: 0, b: 1, loose: 0, poly: this.trail(tb, sB, p, st) };
    return st;
  };

  /* The string behind the butterfly in the wall scene: it trails the flight path, then lets go. */
  Stage.prototype.trail = function (tb, sB, p, st) {
    var P = this.pathB, N = 72, W = this.W, s = this.s;
    var Lstr = clamp(W * 0.85, 300, 780), gap = Lstr / N, t = this.tA + tb;
    var dp = eio(seg(tb, 1500, 3300));                               // how far the string has let go
    if (!this.freeze && tb >= 1500) this.freeze = { sB: sB, tb: tb, off: null };
    var rig = this.rig;
    var Mb = mmul(mT(st.bf.x, st.bf.y), mmul(mR(st.bf.rot), mmul(mS(st.bf.sc), mT(-PIV[0], -PIV[1]))));
    var q = wingQ(t, rig.phase);
    var fl = about(mmul(mR(AXIS), mmul(mS(1, 1 - 0.36 * q), mR(-AXIS))), PIV[0], PIV[1]);
    var B = mapply(mmul(Mb, fl), ATT[0], ATT[1]);
    var offLive = [B[0] - p.x, B[1] - p.y];
    var fz = this.freeze, offF = null, pF = null;
    if (fz) { pF = P.at(fz.sB); if (!fz.off) fz.off = [offLive[0], offLive[1]]; offF = fz.off; }
    var fade = 1 - ssm(seg(tb, 3000, 4300));
    var fall = 52 * s * ssm(seg(tb, 2300, 4600));
    var xs = [], ys = [], k, d = '';
    for (k = 0; k <= N; k++) {
      var f = k / N, pk = P.at(sB - k * gap);
      var lx = pk.x + offLive[0] * Math.pow(1 - f, 2), ly = pk.y + offLive[1] * Math.pow(1 - f, 2);
      var x = lx, y = ly, nx = -pk.ty, ny = pk.tx;
      if (fz) {
        var pf = P.at(fz.sB - k * gap);
        var fx = pf.x + offF[0] * Math.pow(1 - f, 2), fy = pf.y + offF[1] * Math.pow(1 - f, 2);
        x = lerp(lx, fx, dp); y = lerp(ly, fy, dp);
      }
      var w = (1.0 + 5.0 * Math.pow(f, 1.2) + dp * 5 * (1 - f)) * ripple(700 + k * 5.5, t) * (0.6 + 0.4 * f + dp);
      xs.push(x + nx * w); ys.push(y + ny * w + fall * (0.25 + 0.75 * f) * dp);
    }
    st.str.alpha = fade;
    return dPoly(xs, ys, 0, 1);
  };

  Stage.prototype.tick = function (t) {
    var dt = this.last ? Math.min(64, t - this.last) : 16;
    this.last = t;
    if (this.phase === 'A') {
      this.tA += dt * this.rate;
      var tc = this.closeAt;
      if (this.finish && this.tA >= tc) { this.enterB(); return; }
      this.rig.render(this.A(Math.min(this.tA, tc + 400)));
    } else if (this.phase === 'B') {
      this.tB += dt * this.rateB;
      var tb = this.tB;
      this.rig.render(this.B(tb));
      this.drive(tb);
      if (tb >= T_B) this.done();
    }
  };

  /* Called by splash.js when the welcome sequence ends (or is skipped). */
  Stage.prototype.handoff = function (finishFn, skipped) {
    this.finish = finishFn; this.skipped = !!skipped;
    if (this.tA < this.closeAt - 60) {
      this.rate = 7;                                    // skipped early: fast-forward the flight
      this.host.classList.add('is-skipping');
      document.body.classList.add('mono-opening');
    }
  };

  /* A -> B: the splash text leaves, the paper stays, the butterfly comes out of the left-hand wall. */
  Stage.prototype.enterB = function () {
    this.phase = 'B'; this.tB = 0; this.rateB = 1; this.rate = 1;
    document.body.classList.add('mono-opening');
    var c = document.createElement('div');
    c.className = 'ml-curtain';
    c.setAttribute('aria-hidden', 'true');
    document.body.appendChild(c);
    this.curtain = c;
    var self = this;
    c.addEventListener('click', function () { self.rateB = 4; });
    try { if (this.finish) this.finish(); } catch (e) { /* the splash must never be left up */ }
    this.finish = null;
  };

  /* The page opens from where the butterfly flies: a soft circle of paper lifts away. */
  Stage.prototype.drive = function (tb) {
    var c = this.curtain;
    if (!c) return;
    var r0 = seg(tb, 1900, 3400);
    if (r0 > 0 && !this.heroFired && tb > 2500) { this.heroFired = true; openHero(); }
    if (r0 <= 0) return;
    var b = this.rig.lastB || [this.W / 2, this.H / 3];
    var cx = b[0], cy = b[1];
    var W = this.W, H = this.H;
    var rMax = Math.max(Math.hypot(cx, cy), Math.hypot(W - cx, cy), Math.hypot(cx, H - cy), Math.hypot(W - cx, H - cy)) + 140;
    var r = eio(r0) * rMax, soft = 110 + 120 * r0;
    var m = 'radial-gradient(circle at ' + r1(cx) + 'px ' + r1(cy) + 'px, transparent ' + r1(Math.max(0, r - soft)) + 'px, #000 ' + r1(r) + 'px)';
    c.style.webkitMaskImage = m; c.style.maskImage = m;
    if (r0 >= 1) c.style.display = 'none';
  };

  Stage.prototype.done = function () {
    this.phase = 'done';
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('orientationchange', this.onResize);
    if (this.curtain && this.curtain.parentNode) this.curtain.parentNode.removeChild(this.curtain);
    if (this.host.parentNode) this.host.parentNode.removeChild(this.host);
    document.body.classList.remove('mono-opening');
    if (!this.heroFired) openHero();
    stage = null;
    try { window.dispatchEvent(new Event('monoline:done')); } catch (e) { /* old browsers */ }
  };

  /* ───────────────────────── public API ───────────────────────── */
  function openHero() {
    heroGo = true;
    views.forEach(function (v) { if (v.mode === 'hero') v.start(); });
    try { window.dispatchEvent(new Event('monoline:open')); } catch (e) { /* old browsers */ }
  }

  function mount(host, mode) {
    if (!host || host.__mono) return host && host.__mono;
    mode = mode || host.getAttribute('data-mono') || 'ph';
    var v = new View(host, mode === 'hero' ? 'hero' : 'ph');
    host.__mono = v;
    views.push(v);
    ensureLoop();
    return v;
  }
  function mountAll(root) {
    var list = (root || document).querySelectorAll('[data-mono]');
    for (var i = 0; i < list.length; i++) mount(list[i]);
  }
  function unmount(host) {
    var v = host && host.__mono;
    if (!v) return;
    v.destroy();
    var i = views.indexOf(v);
    if (i >= 0) views.splice(i, 1);
  }

  /* splash.js: called once when the welcome sequence starts. closeAt = ms until it ends. */
  function beginSplash(opts) {
    if (reduced() || stage) return false;
    try {
      stage = new Stage(opts || {});
      ensureLoop();
      return true;
    } catch (e) {
      stage = null;
      return false;
    }
  }
  /* splash.js: called when the welcome sequence ends. Returns true if the butterfly now owns the exit. */
  function handoff(finishFn, info) {
    if (!stage) return false;
    stage.handoff(finishFn, info && info.skipped);
    return true;
  }

  window.MonoLine = { mount: mount, mountAll: mountAll, unmount: unmount, beginSplash: beginSplash,
                      handoff: handoff, openHero: openHero,
                      _debug: function () { return stage; } };

  /* Start the hero when there is no welcome screen to wait for. */
  function boot() {
    mountAll(document);
    /* placeholders arrive with gallery / cart re-renders: pick them up as they appear */
    if (window.MutationObserver) {
      var queued = false;
      new MutationObserver(function () {
        if (queued) return;
        queued = true;
        window.requestAnimationFrame(function () { queued = false; mountAll(document); });
      }).observe(document.body, { childList: true, subtree: true });
    }
    if (!document.getElementById('splash') || reduced()) openHero();
    else setTimeout(function () { if (!heroGo) openHero(); }, 30000);     // never leave the hero blank
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
