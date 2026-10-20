/* ═══════════════════════════════════════════════════════════════════════
   sanitize.js — shared output-escaping + URL-safety helpers
   ───────────────────────────────────────────────────────────────────────
   WHY THIS FILE EXISTS
   Artwork titles, descriptions, comments, order details and CMS content all
   flow from Firestore into `innerHTML` template strings. Any of that data
   can be attacker-controlled (comments and orders are writable by the
   public), so every interpolation MUST be escaped before it reaches the
   DOM. This file is the single source of truth for that.

   Loaded synchronously in <head> BEFORE app.js / console.js / studio.js so
   the helpers always exist, even if another script fails to load.

   API (all also exposed on `window`):
     escapeHtml(value)          → text/attribute-safe string
     escapeAttr(value)          → alias of escapeHtml (kept for clarity)
     jsArg(value)               → safe to embed inside 'single quotes' in an
                                  inline HTML handler  e.g. onclick="f('…')"
     safeUrl(url, opts)         → '' unless http(s)://, mailto:, tel:, sms:
                                  or a same-origin relative path
     safeImageUrl(url)          → like safeUrl but without mailto/tel/sms
     safeJsonParse(text, fallback)
   ═══════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api; // node (tests)
  if (typeof window !== "undefined") {
    window.escapeHtml     = api.escapeHtml;
    window.escapeAttr     = api.escapeAttr;
    window.jsArg          = api.jsArg;
    window.safeUrl        = api.safeUrl;
    window.safeImageUrl   = api.safeImageUrl;
    window.safeJsonParse  = api.safeJsonParse;
    window.Sanitize       = api;
  }
})(this, function () {
  "use strict";

  var HTML_ESCAPES = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
    "`": "&#96;"
  };

  /** Escape a value for use in HTML text or a quoted HTML attribute. */
  function escapeHtml(value) {
    if (value === null || value === undefined) return "";
    return String(value).replace(/[&<>"'`]/g, function (ch) {
      return HTML_ESCAPES[ch];
    });
  }

  /** Alias — same escaping works for attribute values (quotes included). */
  function escapeAttr(value) {
    return escapeHtml(value);
  }

  /**
   * Escape a value for a *JavaScript string literal* that itself sits inside
   * a double-quoted HTML attribute:
   *     <button onclick="remove('${jsArg(id)}')">
   * JS escaping happens first, then HTML escaping (the browser decodes HTML
   * entities before the JS is evaluated). Everything stays inside the string.
   */
  function jsArg(value) {
    if (value === null || value === undefined) return "";
    return String(value)
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'")
      .replace(/\r/g, "\\r")
      .replace(/\n/g, "\\n")
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  var DANGEROUS_SCHEME = /^(?:javascript|vbscript|data|file|blob|filesystem):/i;
  var WEB_SCHEME       = /^https?:\/\//i;
  var CONTACT_SCHEME   = /^(?:mailto|tel|sms):/i;

  /**
   * Return a safe URL or "". Blocks javascript:, data:, vbscript:, file:,
   * protocol-relative //host URLs and anything obfuscated with control
   * characters or embedded whitespace.
   *
   * opts.allowContact  (default true)  allow mailto:/tel:/sms:
   * opts.allowRelative (default true)  allow "/path", "./path", "path/file"
   */
  function safeUrl(value, opts) {
    var options = opts || {};
    if (value === null || value === undefined) return "";
    var raw = String(value).trim();
    if (!raw) return "";

    // Collapse whitespace and strip control characters before scheme checks
    // so "java\tscript:" and " javascript:" are caught too.
    var probe = raw.replace(/[\u0000-\u0020\u007f-\u009f]/g, "").toLowerCase();

    if (!probe) return "";
    if (DANGEROUS_SCHEME.test(probe)) return "";

    if (WEB_SCHEME.test(raw)) return raw;
    if (options.allowContact !== false && CONTACT_SCHEME.test(raw)) return raw;

    // Protocol-relative ("//evil.example") is NOT treated as same-origin.
    if (/^\/\//.test(raw)) return "";

    if (options.allowRelative !== false) {
      if (/^(?:\/|\.{1,2}\/|#)/.test(raw)) return raw;
      // Bare relative asset path, e.g. assets/artworks/x.jpg (no scheme).
      if (/^[a-zA-Z0-9][a-zA-Z0-9._~%\-\/]*$/.test(raw) && !/^[a-zA-Z][a-zA-Z0-9+.\-]*:/.test(raw)) {
        return raw;
      }
    }
    return "";
  }

  /** Image sources: http(s) or same-origin relative only. */
  function safeImageUrl(value) {
    return safeUrl(value, { allowContact: false });
  }

  /** JSON.parse that never throws (corrupt localStorage, bad payloads). */
  function safeJsonParse(text, fallback) {
    if (typeof text !== "string" || !text) return fallback;
    try {
      var parsed = JSON.parse(text);
      return parsed === null || parsed === undefined ? fallback : parsed;
    } catch (_) {
      return fallback;
    }
  }

  return {
    escapeHtml: escapeHtml,
    escapeAttr: escapeAttr,
    jsArg: jsArg,
    safeUrl: safeUrl,
    safeImageUrl: safeImageUrl,
    safeJsonParse: safeJsonParse
  };
});
