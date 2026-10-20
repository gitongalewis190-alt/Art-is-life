/* ═══════════════════════════════════════════════════════════════════════
   siteConfig.js — Global CMS / theme / layout engine  (Phase 2)
   ───────────────────────────────────────────────────────────────────────
   Stores ONE Firestore document  ->  siteConfig/main
   - Public READ  : every visitor gets live theme + content (onSnapshot)
   - Admin WRITE  : only the Control Console (crown role) can publish
   Reuses the Firestore instance firebase.js already created (window._db).

   IMPORTANT (security): this document is world-readable, so it must only
   ever hold NON-secret values (colours, text, social links, the public
   Daraja *endpoint URL*). Real secrets (Daraja keys/passkey) live only on
   the server — never here. The Console enforces this.
   ═══════════════════════════════════════════════════════════════════════ */
import {
  doc, getDoc, setDoc, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* Defaults mirror the site's existing real content so nothing ever blanks
   out before an admin has published anything. These are the live values. */
const DEFAULTS = {
  theme: {
    gold:       "#c9a84c",
    accent:     "#1aa34a",
    ink:        "#2c2c2c",
    cream:      "#faf8f3",
    radius:     "4px",
    glassAlpha: 0.72,
    optics:     true
  },
  layout: "1",
  content: {
    foundationName: "LEES.mobile",
    footerText:     "© 2026 LEES.MOBILE — Lewis Gitonga. All rights reserved.",
    footerSub:      "Each artwork is an original, one-time creation. Nairobi, Kenya.",
    whatsapp:       "254704708178",
    email:          "",
    instagram:      "https://instagram.com/lewis_art.is.life",
    address:        "Nairobi, Kenya",
    ownerRemark:    "Every canvas here began as a feeling before it became a colour. Thank you for walking through this gallery with open eyes.",
    ownerRemarkBy:  "Lewis Gitonga — Founder"
  },
  daraja:     { endpoint: "", businessName: "Art is Life Foundation" },
  cloudinary: { cloudName: "", uploadPreset: "" },
  gaId:       "G-MPX5MMNRB2",
  logoUrl:    ""
};

/* structuredClone() is missing on older browsers — fall back to JSON so a
   single missing API can never stop the whole site from booting. */
function clone(value) {
  if (typeof structuredClone === "function") {
    try { return structuredClone(value); } catch (_) { /* fall through */ }
  }
  return JSON.parse(JSON.stringify(value));
}

/* Colours/radius are interpolated into CSS custom properties. */
const CSS_LENGTH  = /^-?\d{1,4}(\.\d{1,3})?(px|rem|em|%)$/;
const CSS_COLOUR  = /^(#[0-9a-f]{3,8}|rgba?\([\d.,\s%]{6,40}\)|hsla?\([\d.,\s%]{6,40}\)|[a-z]{3,20})$/i;
const GA_ID       = /^G-[A-Z0-9]{4,20}$/;

function safeCss(value, fallback, pattern) {
  const text = String(value == null ? "" : value).trim();
  return pattern.test(text) ? text : fallback;
}

/* Keys that must never be copied out of a stored document: they can alter a
   prototype chain instead of a setting (prototype pollution). */
const BLOCKED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const MAX_TEXT = 300;

const SiteConfig = {
  current: clone(DEFAULTS),
  _started: false,

  /** Deep-merge stored doc over defaults so new fields always have a value. */
  _merge(stored) {
    const out = clone(DEFAULTS);
    if (!stored || typeof stored !== "object") return out;
    for (const k of Object.keys(out)) {
      if (BLOCKED_KEYS.has(k)) continue;
      const value = stored[k];
      if (value && typeof out[k] === "object" && typeof value === "object" && !Array.isArray(value)) {
        for (const sub of Object.keys(value)) {
          if (!BLOCKED_KEYS.has(sub)) out[k][sub] = value[sub];
        }
      } else if (value !== undefined) {
        out[k] = value;
      }
    }
    return out;
  },

  /** Trim/length-cap every published string and re-validate colours + GA id,
      so the world-readable document can never hold an unbounded payload. */
  _sanitise(cfg) {
    const src = (cfg && typeof cfg === "object") ? cfg : {};
    const text = (v, max) => String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max || MAX_TEXT);
    const t = src.theme || {};
    const c = src.content || {};
    const d = src.daraja || {};
    const cl = src.cloudinary || {};
    const alpha = Number(t.glassAlpha);
    return {
      theme: {
        gold:       safeCss(t.gold, "#c9a84c", CSS_COLOUR),
        accent:     safeCss(t.accent, "#1aa34a", CSS_COLOUR),
        ink:        safeCss(t.ink, "#2c2c2c", CSS_COLOUR),
        cream:      safeCss(t.cream, "#faf8f3", CSS_COLOUR),
        radius:     safeCss(t.radius, "4px", CSS_LENGTH),
        glassAlpha: Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : 0.72,
        optics:     !!t.optics
      },
      layout:     ["1", "2", "3", "4", "5", "6", "7"].includes(String(src.layout)) ? String(src.layout) : "1",
      content: {
        foundationName: text(c.foundationName, 80),
        footerText:     text(c.footerText, 200),
        footerSub:      text(c.footerSub, 200),
        whatsapp:       String(c.whatsapp || "").replace(/[^\d]/g, "").slice(0, 15),
        email:          text(c.email, 120),
        instagram:      (window.safeUrl && window.safeUrl(c.instagram)) || "",
        address:        text(c.address, 160),
        ownerRemark:    text(c.ownerRemark, 400),
        ownerRemarkBy:  text(c.ownerRemarkBy, 80)
      },
      daraja: {
        // Public endpoint only — never a key. Relative paths or https URLs.
        endpoint:     (() => {
          const raw = text(d.endpoint, 300);
          return (/^\/(?!\/)/.test(raw) || /^https:\/\//i.test(raw)) ? raw : "";
        })(),
        businessName: text(d.businessName, 80)
      },
      cloudinary: {
        cloudName:    text(cl.cloudName, 64).replace(/[^\w-]/g, ""),
        uploadPreset: text(cl.uploadPreset, 64).replace(/[^\w-]/g, "")
      },
      gaId:    GA_ID.test(String(src.gaId || "")) ? String(src.gaId) : "G-MPX5MMNRB2",
      logoUrl: (window.safeImageUrl && window.safeImageUrl(src.logoUrl)) || ""
    };
  },

  /** Push values into the live DOM: theme vars, layout, content, splash. */
  apply(cfg) {
    const safe = (cfg && typeof cfg === "object") ? cfg : clone(DEFAULTS);
    this.current = safe;
    const root = document.documentElement;
    const t = cfg.theme || {};

    // Theme -> CSS custom properties (main.css/glass.css read these)
    root.style.setProperty("--gold", safeCss(t.gold, "#c9a84c", CSS_COLOUR));
    root.style.setProperty("--green", safeCss(t.accent, "#1aa34a", CSS_COLOUR)); // accent maps to action colour
    root.style.setProperty("--ink", safeCss(t.ink, "#2c2c2c", CSS_COLOUR));
    root.style.setProperty("--cream", safeCss(t.cream, "#faf8f3", CSS_COLOUR));
    root.style.setProperty("--radius", safeCss(t.radius, "4px", CSS_LENGTH));
    const alpha = Number(t.glassAlpha);
    root.style.setProperty("--glass-alpha", String(Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : 0.72));
    root.dataset.optics = t.optics ? "on" : "off";

    // Layout preset
    root.dataset.layout = ["1", "2", "3", "4", "5", "6", "7"].includes(String(safe.layout)) ? String(safe.layout) : "1";

    // Content -> any element tagged data-cfg="key" (text) or data-cfg-href
    const c = cfg.content || {};
    document.querySelectorAll("[data-cfg]").forEach((el) => {
      const key = el.getAttribute("data-cfg");
      if (c[key] != null && c[key] !== "") el.textContent = c[key];
    });
    this._setHref("[data-cfg-href='instagram']", c.instagram);
    this._setHref("[data-cfg-href='whatsapp']", c.whatsapp ? "https://wa.me/" + c.whatsapp : "");

    // Splash owner remark
    window.SITE_CONFIG = window.SITE_CONFIG || {};
    window.SITE_CONFIG.ownerRemark = { text: c.ownerRemark, by: c.ownerRemarkBy };
    window.SITE_CONFIG.daraja      = safe.daraja     || {};
    window.SITE_CONFIG.cloudinary  = safe.cloudinary || {};
    window.SITE_CONFIG.gaId        = GA_ID.test(String(safe.gaId || "")) ? safe.gaId : "G-MPX5MMNRB2";
    window.SITE_CONFIG.logoUrl     = window.safeImageUrl ? (window.safeImageUrl(safe.logoUrl) || '') : '';
    window.dispatchEvent(new CustomEvent('arten_logo_update', { detail: window.SITE_CONFIG.logoUrl }));

    // If GA Measurement ID changed, re-configure gtag silently
    if (window.SITE_CONFIG.gaId !== "G-MPX5MMNRB2" && typeof window.gtag === "function") {
      window.gtag("config", window.SITE_CONFIG.gaId);
    }

    window.dispatchEvent(new CustomEvent("siteconfig_applied", { detail: safe }));
  },

  _setHref(sel, val) {
    // Only http(s)/mailto/tel/sms/relative URLs — blocks javascript: links
    // planted in world-readable CMS content.
    const safe = window.safeUrl ? window.safeUrl(val) : "";
    if (!safe) return;
    document.querySelectorAll(sel).forEach((el) => {
      el.href = safe;
      if (/^https?:/i.test(safe)) el.rel = "noopener noreferrer";
    });
  },

  /** Begin live sync. Safe to call before Firestore is ready (it waits). */
  async start() {
    if (this._started) return;
    this._started = true;
    this.apply(this.current); // paint defaults immediately

    const db = await this._waitForDb();
    if (!db) return; // offline / firebase blocked -> defaults stand
    try {
      onSnapshot(doc(db, "siteConfig", "main"), (snap) => {
        this.apply(this._merge(snap.exists() ? snap.data() : null));
      }, () => {/* read denied/offline -> keep current */});
    } catch (_) {/* keep defaults */}
  },

  /** Publish (admin/crown only — Firestore rules enforce the real gate). */
  async publish(partial) {
    // Firestore rules are the real gate; this just gives a clear message.
    if (!window._firebaseAdmin || window._currentRole !== "crown") {
      if (typeof window.showToast === "function") window.showToast("⛔ Crown role required to publish.");
      return false;
    }
    const db = window._db;
    if (!db) return false;
    const merged = this._merge({ ...this.current, ...partial });
    const next = this._sanitise(merged);
    try {
      await setDoc(doc(db, "siteConfig", "main"),
        { ...next, updatedAt: serverTimestamp() }, { merge: true });
      return true;
    } catch (err) {
      console.error("Config publish failed:", err && err.message);
      if (typeof window.showToast === "function") window.showToast("❌ Publish failed — check your connection and crown role.");
      return false;
    }
  },

  _waitForDb() {
    return new Promise((res) => {
      if (window._db) return res(window._db);
      let tries = 0;
      const iv = setInterval(() => {
        if (window._db) { clearInterval(iv); res(window._db); }
        else if (++tries > 60) { clearInterval(iv); res(null); } // ~6s cap
      }, 100);
    });
  }
};

window.SiteConfig = SiteConfig;
SiteConfig.start();
