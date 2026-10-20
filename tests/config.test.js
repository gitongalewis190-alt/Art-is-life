"use strict";

/* Static "guard-rail" tests: they fail if a future edit quietly removes a
   security control (CSP, HSTS, default-deny rules, escaping in the UI). */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const firebaseJson = JSON.parse(read("firebase.json"));

function headerValue(name) {
  const all = firebaseJson.hosting.headers.flatMap((h) => h.headers);
  const entry = all.find((h) => h.key.toLowerCase() === name.toLowerCase());
  return entry ? entry.value : "";
}

test("firebase.json wires up rules for Firestore and Storage", () => {
  assert.equal(firebaseJson.firestore.rules, "firestore.rules");
  assert.equal(firebaseJson.storage.rules, "storage.rules");
  assert.ok(fs.existsSync(path.join(ROOT, "firestore.rules")));
  assert.ok(fs.existsSync(path.join(ROOT, "storage.rules")));
});

test("hosting never publishes server source or tests", () => {
  const ignore = firebaseJson.hosting.ignore;
  for (const pattern of ["api/**", "functions/**", "tests/**", "firestore.rules", "storage.rules"]) {
    assert.ok(ignore.includes(pattern), "missing ignore: " + pattern);
  }
});

test("Content-Security-Policy is present and sane", () => {
  const csp = headerValue("Content-Security-Policy");
  assert.ok(csp.length > 0, "CSP missing");
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /base-uri 'self'/);
  assert.ok(!/unsafe-eval/.test(csp), "unsafe-eval must never be allowed");
  assert.ok(!/(^|;)\s*script-src[^;]*\*/.test(csp), "script-src must not use a wildcard");
});

test("standard hardening headers are configured", () => {
  assert.equal(headerValue("X-Content-Type-Options"), "nosniff");
  assert.equal(headerValue("X-Frame-Options"), "DENY");
  assert.equal(headerValue("Referrer-Policy"), "strict-origin-when-cross-origin");
  assert.match(headerValue("Strict-Transport-Security"), /max-age=\d+/);
  assert.match(headerValue("Permissions-Policy"), /camera=\(\)/);
});

test("HTML/JS is revalidated while images stay cacheable", () => {
  const rules = firebaseJson.hosting.headers;
  const noCache = rules.find((r) => /html\|js\|css/.test(r.source));
  assert.ok(noCache, "no no-cache rule for html/js/css");
  assert.match(noCache.headers[0].value, /no-cache/);
  const images = rules.find((r) => /jpg\|jpeg/.test(r.source));
  assert.ok(images, "no cache rule for images");
});

test("sanitize.js loads before any app code in index.html", () => {
  const html = read("index.html");
  const sanitizeAt = html.indexOf('src="js/sanitize.js"');
  const appAt = html.indexOf('src="js/app.js"');
  assert.ok(sanitizeAt > 0, "sanitize.js is not loaded");
  assert.ok(appAt > sanitizeAt, "sanitize.js must load before app.js");
});

test("external links opened in a new tab are rel-protected", () => {
  const html = read("index.html");
  const tags = html.match(/<a\b[^>]*target="_blank"[^>]*>/gi) || [];
  assert.ok(tags.length > 0);
  for (const tag of tags) {
    assert.match(tag, /rel="[^"]*noopener/, "missing rel=noopener: " + tag.slice(0, 90));
  }
});

test("admin privileges are only granted by the Firebase role check", () => {
  const firebase = read("js/services/firebase.js");
  const app = read("js/app.js");

  assert.ok(!/_firebaseAdmin\s*=\s*true/.test(app),
    "app.js must never set _firebaseAdmin — only the verified auth listener may");
  assert.ok(!/getAdminSetupInfo/.test(firebase),
    "credential-oracle helper getAdminSetupInfo must not exist");
  assert.match(firebase, /_firebaseAdmin = true/);
  assert.match(firebase, /isAdminRole\(result\.role\)/);
});

test("the browser never persists an API secret", () => {
  const consoleJs = read("js/console.js");
  assert.ok(!/localStorage\.setItem\(\s*['"]ail_arten_el_key/.test(consoleJs),
    "ElevenLabs keys must not be stored in localStorage");
  assert.match(consoleJs, /removeItem\('ail_arten_el_key'\)/);
});

test("service worker never caches API responses", () => {
  const sw = read("service-worker.js");
  assert.match(sw, /pathname\.startsWith\("\/api\/"\)/);
  assert.match(sw, /request\.method !== "GET"/);
  assert.match(sw, /response\.type !== "basic"/);
});

test("no hard-coded Daraja/Safaricom secrets in the repo", () => {
  const files = [
    "api/mpesa.js",
    "functions/index.js",
    "js/services/daraja.js",
    "js/services/siteConfig.js",
    "index.html"
  ];
  for (const file of files) {
    const text = read(file);
    assert.ok(!/DARAJA_CONSUMER_SECRET\s*[:=]\s*["'][^"']+["']/.test(text),
      file + " appears to contain a hard-coded consumer secret");
    assert.ok(!/bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919/i.test(text),
      file + " contains the public sandbox passkey literal");
  }
});

test("manifest icons exist and declare a maskable variant", () => {
  const manifest = JSON.parse(read("manifest.webmanifest"));
  assert.match(manifest.start_url, /^\.?\//);
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons.length >= 2);
  for (const icon of manifest.icons) {
    assert.ok(fs.existsSync(path.join(ROOT, icon.src)), "missing icon file: " + icon.src);
    assert.equal(icon.type, "image/png");
  }
  assert.ok(manifest.icons.some((i) => i.purpose === "maskable"), "no maskable icon");
  assert.ok(manifest.icons.some((i) => i.purpose === "any" && i.sizes === "512x512"));
});

test("service worker precache list only names files that exist", () => {
  const sw = read("service-worker.js");
  const listed = Array.from(sw.matchAll(/"(\.[^"]*)"/g)).map((m) => m[1]);
  assert.ok(listed.length > 5);
  for (const item of listed) {
    if (item === "./") continue;
    assert.ok(fs.existsSync(path.join(ROOT, item)), "service worker precaches a missing file: " + item);
  }
  assert.ok(!/\/api\//.test(listed.join(",")), "the API must never be precached");
});

test("every local asset referenced by index.html exists", () => {
  const html = read("index.html");
  // (?<![\w-]) so data-cfg-href="..." is not mistaken for href="..."
  const refs = Array.from(html.matchAll(/(?<![\w-])(?:src|href)="([^"]+)"/g)).map((m) => m[1]);
  const local = refs.filter((r) => !/^(https?:|mailto:|tel:|sms:|#|data:)/.test(r));
  for (const ref of local) {
    assert.ok(fs.existsSync(path.join(ROOT, ref.split("#")[0].split("?")[0])), "missing asset: " + ref);
  }
});

test("every label points at a real control id", () => {
  const html = read("index.html");
  const ids = new Set(Array.from(html.matchAll(/\bid="([^"]+)"/g)).map((m) => m[1]));
  const fors = Array.from(html.matchAll(/<label[^>]*\bfor="([^"]+)"/g)).map((m) => m[1]);
  assert.ok(fors.length > 10);
  for (const f of fors) assert.ok(ids.has(f), "label for a missing id: " + f);
});

test("index.html has no duplicate ids", () => {
  const ids = Array.from(read("index.html").matchAll(/\bid="([^"]+)"/g)).map((m) => m[1]);
  const seen = new Set();
  for (const id of ids) {
    assert.ok(!seen.has(id), "duplicate id: " + id);
    seen.add(id);
  }
});

test("the docs never promise a PIN-only admin login", () => {
  const readme = read("README.md");
  assert.ok(!/console password is all you need/i.test(readme));
});
