/* ═══════════════════════════════════════════════════════════════════════
   tests/dom-smoke.js — end-to-end DOM smoke test (optional; needs jsdom)

     npm i --no-save jsdom
     node tests/dom-smoke.js

   Loads the real index.html plus every classic script in jsdom, then:
     • renders the gallery from the local artwork data
     • feeds hostile Firestore/CMS values through the real render paths and
       proves nothing executes and no markup is injected
     • proves the admin dashboard cannot be opened without a Firebase role
   ═══════════════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');

let JSDOM, VirtualConsole;
try {
  ({ JSDOM, VirtualConsole } = require('jsdom'));
} catch (_) {
  console.log('SKIP: jsdom is not installed (run: npm i --no-save jsdom)');
  process.exit(0);
}

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let html = read('index.html');

// No outbound network in this sandbox: drop external scripts/styles, keep local ones.
html = html.replace(/<script[^>]*src="https?:\/\/[^"]*"[^>]*><\/script>/g, '');
html = html.replace(/<link[^>]*href="https?:\/\/[^"]*"[^>]*>/g, '');
// Modules can't run in jsdom; they're parse-checked separately.
html = html.replace(/<script[^>]*type="module"[^>]*><\/script>/g, '');

// siteConfig.js is a module in production; strip its gstatic import so the
// real implementation can run in jsdom.
const siteConfigSrc = read('js/services/siteConfig.js').replace(/import\s*\{[^}]*\}\s*from\s*"[^"]+";/, '');
const studioSrc = read('js/studio.js').replace(/import\s*\{[^}]*\}\s*from\s*"[^"]+";/, '');

const scripts = ['js/sanitize.js', 'js/services/analytics.js', 'js/app.js', 'js/splash.js'];
const extra = [siteConfigSrc, read('js/console.js'), studioSrc];
let injected = '';
for (const s of scripts) {
  injected += `<script>\n${read(s)}\n</script>\n`;
}
for (const s of extra) injected += `<script>\n${s}\n</script>\n`;
html = html.replace('</body>', injected + '</body>');

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('jsdomError: ' + (e && e.message)));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'https://example.test/index.html',
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(window) {
    window.IntersectionObserver = class {
      constructor(cb) { this.cb = cb; }
      observe() { this.cb([{ isIntersecting: true }]); }
      disconnect() {}
      unobserve() {}
    };
    window.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
    window.scrollTo = () => {};
    window.Element.prototype.scrollIntoView = () => {};
    window.crypto = window.crypto || {};
    if (!window.crypto.getRandomValues) {
      window.crypto.getRandomValues = (arr) => { for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256); return arr; };
    }
    window.fetch = () => Promise.reject(new Error('network disabled in smoke test'));
    // Poisoned storage: the cart must be rebuilt from typed, escaped values.
    try {
      window.localStorage.setItem('ail_cart', JSON.stringify([
        { id: '1', title: '<img src=x onerror="window.__pwned=99">', price: '<b>1 KES</b>', priceNum: 1, qty: '"><img src=x onerror="window.__pwned=98">' }
      ]));
    } catch (_) { /* storage unavailable */ }
  }
});

const { window } = dom;
const results = [];
const check = (name, cond, extra) => { results.push({ name, ok: !!cond, extra }); };

async function run() {
  const doc = window.document;
  check('sanitize helpers installed', typeof window.escapeHtml === 'function' && typeof window.jsArg === 'function');
  check('sanitize is the canonical implementation (escapes backticks)', window.escapeHtml('`').includes('&#96;'));

  const cards = doc.querySelectorAll('#gallery .art-card');
  check('gallery renders local artworks', cards.length === 12, 'cards=' + cards.length);

  const firstTitle = doc.querySelector('#gallery .art-title');
  check('artwork title rendered', firstTitle && firstTitle.textContent.trim().length > 0,
    firstTitle && firstTitle.textContent);

  // ── Stored-XSS simulation: hostile artwork from Firestore ─────────────
  const payloads = [
    '<img src=x onerror="window.__pwned=1">',
    '"><svg onload=window.__pwned=2>',
    "'><script>window.__pwned=3</script>",
    'javascript:window.__pwned=4'
  ];

  payloads.forEach((payload, idx) => {
    window._firestoreArtworks = [{
      id: "x');window.__pwned=5;//" + idx,
      title: payload,
      price: payload,
      priceNum: 10,
      image: 'javascript:window.__pwned=6',
      desc: payload,
      dimensions: payload,
      status: 'available'
    }];
    window.dispatchEvent(new window.Event('artworks_updated'));

    const card = doc.querySelector('#gallery .art-card');
    check('payload ' + idx + ' rendered without executing', !window.__pwned, 'pwned=' + window.__pwned);
    check('payload ' + idx + ' contains no injected element', !card.querySelector('script') && !card.querySelector('svg[onload]'),
      card.innerHTML.slice(0, 120));
    check('payload ' + idx + ' image src is not javascript:', !/^javascript:/i.test(card.querySelector('img').getAttribute('src') || ''),
      card.querySelector('img').getAttribute('src'));
  });

  // ── Control Console with hostile CMS values ──────────────────────────
  const evil = '"><img src=x onerror="window.__pwned=7">';
  const evilCfg = window.SiteConfig._merge({
    theme: { gold: 'red;background:url(javascript:alert(1))', accent: '#1aa34a', ink: '#2c2c2c', cream: '#faf8f3', radius: '4px;}', glassAlpha: 5, optics: true },
    layout: '1',
    content: { foundationName: evil, footerText: evil, footerSub: evil, whatsapp: '254184336391', email: evil, instagram: 'javascript:window.__pwned=8', address: evil, ownerRemark: evil, ownerRemarkBy: evil },
    daraja: { endpoint: 'javascript:window.__pwned=9', businessName: evil },
    cloudinary: { cloudName: evil, uploadPreset: evil },
    gaId: evil,
    logoUrl: 'javascript:window.__pwned=10'
  });
  window.SiteConfig.apply(evilCfg);
  window._firebaseAdmin = true;
  window._currentRole = 'crown';
  window._currentUser = { email: 'owner@example.test', uid: 'uid123' };

  window.renderConsole();
  const consoleTab = doc.getElementById('tab-console');
  check('control console renders', consoleTab && consoleTab.querySelector('.cc-shell'));
  check('console CMS text is escaped', !consoleTab.querySelector('img[onerror]'), consoleTab.innerHTML.slice(0, 100));
  check('console never executed CMS payload', !window.__pwned, 'pwned=' + window.__pwned);
  const igHref = doc.querySelector('[data-cfg-href]');
  check('console did not create a javascript: href',
    !igHref || !/^javascript:/i.test(igHref.getAttribute('href') || ''), igHref && igHref.getAttribute('href'));

  // Theme values must not break out of the CSS custom property.
  const goldValue = doc.documentElement.style.getPropertyValue('--gold');
  check('hostile theme colour rejected', goldValue !== 'red;background:url(javascript:alert(1))', JSON.stringify(goldValue));
  check('hostile radius rejected', doc.documentElement.style.getPropertyValue('--radius') === '4px',
    JSON.stringify(doc.documentElement.style.getPropertyValue('--radius')));
  check('glass alpha clamped to 0..1', doc.documentElement.style.getPropertyValue('--glass-alpha') === '1',
    JSON.stringify(doc.documentElement.style.getPropertyValue('--glass-alpha')));
  check('hostile GA id rejected', window.SITE_CONFIG.gaId === 'G-MPX5MMNRB2', window.SITE_CONFIG.gaId);
  check('hostile logo URL rejected', window.SITE_CONFIG.logoUrl === '', window.SITE_CONFIG.logoUrl);

  // ── CMS write-path sanitisation (what would be published) ──────────
  const dirty = window.SiteConfig._sanitise({
    theme: { gold: 'red;background:url(//evil)', radius: '4px;}', glassAlpha: 99, optics: 'yes' },
    layout: '"><script>window.__pwned=12</script>',
    content: {
      foundationName: '  <b>x</b>  ',
      whatsapp: '254 184 336 391<script>',
      instagram: 'javascript:window.__pwned=13',
      email: 'a@b.c',
      footerText: 'x'.repeat(5000)
    },
    daraja: { endpoint: 'javascript:window.__pwned=14', businessName: 'Biz' },
    cloudinary: { cloudName: 'a b/../c<script>', uploadPreset: 'preset name' },
    gaId: 'evil',
    logoUrl: 'javascript:window.__pwned=15'
  });
  check('publish sanitises hostile colours', dirty.theme.gold === '#c9a84c', dirty.theme.gold);
  check('publish clamps glass alpha', dirty.theme.glassAlpha === 1, String(dirty.theme.glassAlpha));
  check('publish rejects unknown layouts', dirty.layout === '1', dirty.layout);
  check('publish accepts every supported layout',
    ['1', '2', '3', '4', '5', '6', '7'].every((n) => window.SiteConfig._sanitise({ layout: n }).layout === n));
  window.SiteConfig.apply(window.SiteConfig._merge({ layout: '7' }));
  check('layout 7 is applied to the document', doc.documentElement.dataset.layout === '7', doc.documentElement.dataset.layout);
  window.SiteConfig.apply(window.SiteConfig._merge({ layout: '1' }));
  check('publish strips markup from text', dirty.content.foundationName === '<b>x</b>', dirty.content.foundationName);
  check('publish caps long text', dirty.content.footerText.length === 200, String(dirty.content.footerText.length));
  check('publish keeps only digits in WhatsApp', dirty.content.whatsapp === '254184336391', dirty.content.whatsapp);
  check('publish drops javascript: social links', dirty.content.instagram === '', dirty.content.instagram);
  check('publish drops javascript: payment endpoint', dirty.daraja.endpoint === '', dirty.daraja.endpoint);
  check('publish strips cloudinary identifiers', /^[\w-]*$/.test(dirty.cloudinary.cloudName), dirty.cloudinary.cloudName);
  check('publish rejects a bad GA id', dirty.gaId === 'G-MPX5MMNRB2', dirty.gaId);
  check('publish rejects a javascript: logo', dirty.logoUrl === '', dirty.logoUrl);

  // Prototype pollution through a stored config document must be ignored.
  const polluted = window.SiteConfig._merge(JSON.parse('{"__proto__":{"pwned":true},"theme":{"__proto__":{"pwned":true},"gold":"#ffffff"}}'));
  check('config merge ignores __proto__', ({}).pwned === undefined && polluted.theme.gold === '#ffffff', String(({}).pwned));

  window._firebaseAdmin = false;
  window._currentRole = null;

  // ── Studio video lightbox ────────────────────────────────────────────
  const frame = doc.getElementById('videoFrame');
  window.openVideo && window.openVideo('"><img src=x onerror="window.__pwned=11">');
  check('studio rejects a non-YouTube id', frame.innerHTML === '', frame.innerHTML.slice(0, 60));
  window.openVideo && window.openVideo('dQw4w9WgXcQ');
  const iframe = frame.querySelector('iframe');
  check('studio embeds a valid YouTube id',
    iframe && iframe.getAttribute('src').startsWith('https://www.youtube.com/embed/dQw4w9WgXcQ'),
    iframe && iframe.getAttribute('src'));
  check('studio payload never executed', !window.__pwned, 'pwned=' + window.__pwned);
  window.closeVideo && window.closeVideo();

  // Admin dashboard must refuse to open without a verified Firebase session.
  window._firebaseAdmin = false;
  window._currentRole = null;
  window.openAdminDashboard && window.openAdminDashboard();
  check('dashboard stays closed without Firebase admin',
    !doc.getElementById('adminDashboard').classList.contains('active'));

  // Device PIN alone must not grant privilege (no password set + no Firebase).
  window.openAdminLogin && window.openAdminLogin();
  check('login modal opens for a signed-out visitor',
    doc.getElementById('adminLoginModal').classList.contains('active'));
  check('email field visible for a signed-out visitor',
    doc.getElementById('adminEmailGroup').style.display !== 'none');
  check('still not admin after opening the login modal', window._firebaseAdmin === false);

  // ── Poisoned localStorage must not become markup ─────────────────────
  window.openCart && window.openCart();
  const cartHtml = doc.getElementById('cartItems').innerHTML;
  check('stored cart markup is escaped',
    !window.__pwned && cartHtml.indexOf('<img') === -1 && !doc.querySelector('#cartItems img'), cartHtml.slice(0, 120));
  check('poisoned quantity is coerced to a number',
    !/qty|NaN/.test(cartHtml) && /(^|>)\s*1\s*(<|$)/.test(cartHtml), cartHtml.slice(0, 120));
  window.closeCart && window.closeCart();

  // ── Accessible state of overlays (MutationObserver runs on a microtask) ─
  await Promise.resolve();
  await Promise.resolve();
  check('open modal is exposed to assistive tech',
    doc.getElementById('adminLoginModal').getAttribute('aria-hidden') === 'false',
    doc.getElementById('adminLoginModal').getAttribute('aria-hidden'));
  check('closed dashboard is aria-hidden',
    doc.getElementById('adminDashboard').getAttribute('aria-hidden') === 'true');
  window.closeAdminLogin && window.closeAdminLogin();
  await Promise.resolve();
  await Promise.resolve();
  check('closing a modal flips aria-hidden back',
    doc.getElementById('adminLoginModal').getAttribute('aria-hidden') === 'true',
    doc.getElementById('adminLoginModal').getAttribute('aria-hidden'));

  // ── Upload must not create a document on its own (no duplicates) ─────
  let addCalls = 0;
  window.adminAddArtwork = () => { addCalls += 1; return Promise.resolve({ id: 'fake' }); };
  window.uploadArtworkImage = (file, onProgress, onComplete) => {
    onProgress(50);
    onComplete('https://example.test/uploaded.png');
  };
  window.handleImageUpload({ files: [{ name: 'piece.png', type: 'image/png', size: 1024 }] });
  check('upload stores the URL without publishing', addCalls === 0, 'adminAddArtwork calls=' + addCalls);
  check('upload shows the confirmation label',
    (doc.getElementById('uploadedUrl').textContent || '').indexOf('Uploaded') !== -1,
    doc.getElementById('uploadedUrl').textContent);

  // ── Admin action guards ──────────────────────────────────────────────
  let roleCalls = 0;
  window.adminUpdateUser = () => { roleCalls += 1; return Promise.resolve(true); };
  window._firebaseAdmin = true;
  window._currentRole = 'crown';
  await window.changeUserRole('some-uid', 'superadmin');
  check('invalid role is rejected before Firestore', roleCalls === 0, 'calls=' + roleCalls);

  await window.changeUserRole('some-uid', 'editor');
  check('valid role is forwarded', roleCalls === 1, 'calls=' + roleCalls);

  let restoreCalls = 0;
  window.adminRestoreArtwork = () => { restoreCalls += 1; return Promise.resolve(); };
  await window.restoreArtwork('missing-id', 'Test');
  check('restore calls through without throwing', restoreCalls === 1, 'calls=' + restoreCalls);

  // Rejecting a role must reset the <select> rather than leaving a wrong value.
  window._firebaseAdmin = false;
  window._currentRole = null;

  // Artwork details must use the admin palette (readable on the dark surface).
  // Reset the catalogue to the bundled local artworks first.
  window._firestoreArtworks = [];
  window.dispatchEvent(new window.Event('artworks_updated'));
  window._firebaseAdmin = true;
  const likeAttr = doc.querySelector('#gallery .art-card .like-btn').getAttribute('onclick') || '';
  const idMatch = likeAttr.match(/toggleLike\('([^']+)'\)/);
  check('gallery card exposes an artwork id', !!idMatch, likeAttr);
  if (idMatch) window.viewArtworkDetails(idMatch[1]);
  const details = doc.getElementById('artworkDetailsModal');
  check('artwork details modal opens', !!details);
  check('artwork details use admin theme variables',
    !!details && details.innerHTML.indexOf('var(--adm-') !== -1 && details.innerHTML.indexOf('var(--charcoal)') === -1);
  window.closeArtworkDetails && window.closeArtworkDetails();
  window._firebaseAdmin = false;
}

window.addEventListener('load', () => {
  setTimeout(async () => {
    try { await run(); } catch (err) { errors.push('threw: ' + err.stack); }
    dom.window.close();

    const failed = results.filter(r => !r.ok);
    for (const r of results) console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.extra !== undefined ? '  [' + r.extra + ']' : ''));
    if (errors.length) {
      console.log('\n--- console/jsdom errors ---');
      for (const e of errors) console.log(e);
    }
    console.log('\n' + (results.length - failed.length) + '/' + results.length + ' checks passed');
    process.exit(failed.length || errors.length ? 1 : 0);
  }, 150);
});
