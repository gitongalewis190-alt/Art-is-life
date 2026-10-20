"use strict";

/* Structural tests for the security rules. They cannot execute Firestore's
   rules engine, but they do pin the properties that matter most. */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const rules = fs.readFileSync(path.join(ROOT, "firestore.rules"), "utf8");
const storage = fs.readFileSync(path.join(ROOT, "storage.rules"), "utf8");

function block(fileText, header) {
  const start = fileText.indexOf(header);
  assert.ok(start >= 0, "missing block: " + header);
  const nextMatch = fileText.slice(start + header.length).match(/\n {4}(match|function) /);
  return fileText.slice(start, nextMatch ? start + header.length + nextMatch.index : fileText.length);
}

test("every collection has an explicit rule and everything else is denied", () => {
  const expected = [
    "match /artworks/", "match /orders/", "match /likes/", "match /comments/",
    "match /users/", "match /siteConfig/", "match /studioVideos/",
    "match /studioArchive/", "match /donations/"
  ];
  for (const header of expected) {
    assert.ok(rules.includes(header), "missing rules for " + header);
  }
  assert.match(rules, /match \/\{document=\*\*\}/);
  const catchAll = block(rules, "match /{document=**}");
  assert.match(catchAll, /allow read, write: if false;/);
});

test("no collection is world-writable", () => {
  assert.ok(!/allow\s+(write|create|update)\s*:\s*if\s+true/.test(rules),
    "found a world-writable rule");
  assert.ok(!/allow\s+read,\s*write:\s*if\s+true/.test(rules));
});

test("donations are server-only", () => {
  const donations = block(rules, "match /donations/");
  assert.match(donations, /allow read, write: if false;/);
});

test("orders cannot be created with a forged status or total", () => {
  const orders = block(rules, "match /orders/");
  assert.match(orders, /request\.resource\.data\.status == 'pending'/);
  assert.match(orders, /totalPrice <= 10000000/);
  assert.match(orders, /keys\(\)\.hasOnly/);
  assert.match(orders, /allow read: if isAdmin\(\);/);
});

test("likes require an authenticated owner and a fixed document id", () => {
  const likes = block(rules, "match /likes/");
  assert.match(likes, /allow create: if isSignedIn\(\)/);
  assert.match(likes, /likeId == request\.auth\.uid \+ '_' \+ request\.resource\.data\.artworkId/);
  assert.match(likes, /allow update: if false/);
  assert.match(likes, /allow delete: if isSignedIn\(\)/);
});

test("comments are length-capped and typed", () => {
  const comments = block(rules, "match /comments/");
  assert.match(comments, /text\.size\(\) <= 1000/);
  assert.match(comments, /createdAt == request\.time/);
});

test("users rules stop privilege escalation", () => {
  const users = block(rules, "match /users/");
  assert.match(users, /allow read: if isSignedIn\(\) && \(request\.auth\.uid == userId \|\| isAdmin\(\)\)/);
  assert.match(users, /allow create: if isCrown\(\)/);
  assert.match(users, /allow update: if isCrown\(\)/);
  assert.match(users, /allow delete: if false;/);
});

test("artwork edits require admin, with only the like tally exempted", () => {
  const artworks = block(rules, "match /artworks/");
  assert.match(artworks, /allow update: if isAdmin\(\) \|\| isLikeCountChange\(\)/);
  assert.match(artworks, /affectedKeys\(\)\.hasOnly\(\['likeCount'\]\)/);
  assert.match(artworks, /allow delete: if isAdmin\(\)/);
});

test("role helper is guarded against missing documents", () => {
  assert.match(rules, /exists\(userDoc\(request\.auth\.uid\)\)/);
});

test("storage rules limit uploads to admins, images and 10 MB", () => {
  assert.match(storage, /firestore\.exists/);
  assert.match(storage, /role', ''\) in \['admin', 'crown'\]/);
  assert.match(storage, /contentType\.matches\('image\/\.\*'\)/);
  assert.match(storage, /request\.resource\.size <= 10 \* 1024 \* 1024/);
  assert.match(storage, /match \/\{allPaths=\*\*\}/);
});
