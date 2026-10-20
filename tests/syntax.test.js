"use strict";

/* Parse every shipped JavaScript file. Catches the classic "worked in one
   browser tab but is a syntax error" mistake before it reaches users. */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");

const CLASSIC = [
  "js/sanitize.js",
  "js/app.js",
  "js/splash.js",
  "js/pwa.js",
  "js/console.js",
  "js/arten.js",
  "js/services/analytics.js",
  "service-worker.js",
  "api/mpesa.js",
  "functions/index.js"
];

const MODULES = [
  "js/services/firebase.js",
  "js/services/siteConfig.js",
  "js/services/daraja.js",
  "js/studio.js"
];

function check(relPath, asModule) {
  const source = fs.readFileSync(path.join(ROOT, relPath), "utf8");
  const args = asModule ? ["--input-type=module", "--check"] : ["--check"];
  const result = spawnSync(process.execPath, args, { input: source, encoding: "utf8" });
  assert.equal(result.status, 0, `${relPath} failed to parse:\n${result.stderr}`);
}

test("classic scripts parse", () => {
  for (const file of CLASSIC) check(file, false);
});

test("ES modules parse", () => {
  for (const file of MODULES) check(file, true);
});

test("module files use only static https imports", () => {
  for (const file of MODULES) {
    const source = fs.readFileSync(path.join(ROOT, file), "utf8");
    const imports = source.match(/from\s+["'][^"']+["']/g) || [];
    for (const spec of imports) {
      const url = spec.replace(/^from\s+["']|["']$/g, "");
      assert.ok(/^https:\/\//.test(url) || /^\.{1,2}\//.test(url),
        `${file} imports a non-https specifier: ${url}`);
    }
  }
});
