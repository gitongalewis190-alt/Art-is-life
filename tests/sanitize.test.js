"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
  escapeHtml,
  escapeAttr,
  jsArg,
  safeUrl,
  safeImageUrl,
  safeJsonParse
} = require(path.join(__dirname, "..", "js", "sanitize.js"));

test("escapeHtml neutralises markup and quotes", () => {
  assert.equal(escapeHtml('<img src=x onerror="alert(1)">'),
    "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  assert.equal(escapeHtml("' & `"), "&#39; &amp; &#96;");
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(undefined), "");
  assert.equal(escapeHtml(0), "0");
});

test("escapeAttr behaves like escapeHtml", () => {
  assert.equal(escapeAttr('a"b'), "a&quot;b");
});

test("jsArg keeps a value inside a single-quoted inline handler", () => {
  const payload = "'); alert(document.domain); //";
  const encoded = jsArg(payload);

  // HTML-special characters are encoded...
  assert.ok(!encoded.includes("<"));
  assert.ok(!encoded.includes('"'));
  // ...and the single quote is backslash-escaped, not raw.
  assert.ok(!/(^|[^\\])'/.test(encoded), "raw single quote leaked: " + encoded);

  // Simulate the browser: decode entities, then evaluate the JS literal.
  const decoded = encoded
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
  const icky = {};
  const v = new Function("icky", "return '" + decoded + "';")(icky);
  assert.equal(v, payload);
});

test("jsArg escapes backslashes and newlines", () => {
  const v = jsArg("a\\b\nc");
  assert.ok(v.includes("\\\\a") || v.includes("a\\\\b"));
  assert.ok(!v.includes("\n"));
});

test("safeUrl allows web, contact and relative URLs", () => {
  assert.equal(safeUrl("https://example.com/a?b=1"), "https://example.com/a?b=1");
  assert.equal(safeUrl("http://example.com"), "http://example.com");
  assert.equal(safeUrl("mailto:a@b.co"), "mailto:a@b.co");
  assert.equal(safeUrl("tel:+254184336391"), "tel:+254184336391");
  assert.equal(safeUrl("/api/mpesa"), "/api/mpesa");
  assert.equal(safeUrl("assets/artworks/x.jpg"), "assets/artworks/x.jpg");
  assert.equal(safeUrl("#section"), "#section");
});

test("safeUrl blocks script and data schemes, including obfuscated ones", () => {
  const bad = [
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    " java\nscript:alert(1)",
    "java\tscript:alert(1)",
    "vbscript:msgbox(1)",
    "data:text/html;base64,PHNjcmlwdD4=",
    "file:///etc/passwd",
    "blob:https://x/y",
    "//evil.example/path",
    ""
  ];
  for (const value of bad) {
    assert.equal(safeUrl(value), "", "expected block: " + JSON.stringify(value));
  }
  assert.equal(safeUrl(null), "");
  assert.equal(safeUrl(undefined), "");
});

test("safeImageUrl rejects contact schemes", () => {
  assert.equal(safeImageUrl("mailto:a@b.co"), "");
  assert.equal(safeImageUrl("tel:123"), "");
  assert.equal(safeImageUrl("https://res.cloudinary.com/x.png"), "https://res.cloudinary.com/x.png");
  assert.equal(safeImageUrl("assets/brand/cover.jpg"), "assets/brand/cover.jpg");
});

test("safeUrl can disallow relative URLs", () => {
  assert.equal(safeUrl("assets/x.jpg", { allowRelative: false }), "");
  assert.equal(safeUrl("https://x/y", { allowRelative: false }), "https://x/y");
});

test("safeJsonParse never throws", () => {
  assert.deepEqual(safeJsonParse('{"a":1}', {}), { a: 1 });
  assert.deepEqual(safeJsonParse("not json", []), []);
  assert.deepEqual(safeJsonParse("null", []), []);
  assert.deepEqual(safeJsonParse(undefined, "fallback"), "fallback");
});
