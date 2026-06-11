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
  layout: "5",
  content: {
    foundationName: "Art Is Life Foundation",
    footerText:     "© 2026 ART IS LIFE FOUNDATION — Lewis Gitonga. All rights reserved.",
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
  gaId:       "G-MPX5MMNRB2"
};

const SiteConfig = {
  current: structuredClone(DEFAULTS),
  _started: false,

  /** Deep-merge stored doc over defaults so new fields always have a value. */
  _merge(stored) {
    const out = structuredClone(DEFAULTS);
    if (!stored) return out;
    for (const k of Object.keys(out)) {
      if (stored[k] && typeof out[k] === "object") Object.assign(out[k], stored[k]);
      else if (stored[k] !== undefined) out[k] = stored[k];
    }
    return out;
  },

  /** Push values into the live DOM: theme vars, layout, content, splash. */
  apply(cfg) {
    this.current = cfg;
    const root = document.documentElement;
    const t = cfg.theme || {};

    // Theme -> CSS custom properties (main.css/glass.css read these)
    root.style.setProperty("--gold", t.gold);
    root.style.setProperty("--green", t.accent);   // accent maps to action colour
    root.style.setProperty("--ink", t.ink);
    root.style.setProperty("--cream", t.cream);
    root.style.setProperty("--radius", t.radius);
    root.style.setProperty("--glass-alpha", String(t.glassAlpha));
    root.dataset.optics = t.optics ? "on" : "off";

    // Layout preset
    root.dataset.layout = String(cfg.layout || "1");

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
    window.SITE_CONFIG.daraja      = cfg.daraja     || {};
    window.SITE_CONFIG.cloudinary  = cfg.cloudinary || {};
    window.SITE_CONFIG.gaId        = cfg.gaId       || "G-MPX5MMNRB2";

    // If GA Measurement ID changed, re-configure gtag silently
    if (cfg.gaId && cfg.gaId !== "G-MPX5MMNRB2" && typeof window.gtag === "function") {
      window.gtag("config", cfg.gaId);
    }

    window.dispatchEvent(new CustomEvent("siteconfig_applied", { detail: cfg }));
  },

  _setHref(sel, val) {
    if (!val) return;
    document.querySelectorAll(sel).forEach((el) => { el.href = val; });
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
    if (!window._firebaseAdmin) {
      if (typeof window.showToast === "function") window.showToast("⛔ Admin role required.");
      return false;
    }
    const db = window._db;
    if (!db) return false;
    const next = this._merge({ ...this.current, ...partial });
    await setDoc(doc(db, "siteConfig", "main"),
      { ...next, updatedAt: serverTimestamp() }, { merge: true });
    return true;
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
