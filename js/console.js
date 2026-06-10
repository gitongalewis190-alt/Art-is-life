/* ═══════════════════════════════════════════════════════════════════════
   console.js — Control Console (Developer Hub)  (Phase 2)
   Renders into the admin dashboard's #tab-console panel. Crown-gated by the
   existing RBAC (the nav item lives in #crownSection). Edits apply live for
   the editing admin, then "Publish" pushes to Firestore for ALL visitors.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  var esc = function (s) { return window.escapeHtml ? window.escapeHtml(s) : String(s == null ? "" : s); };

  var LAYOUTS = [
    { id: "1", name: "Editorial",  desc: "Classic gallery" },
    { id: "2", name: "Dense Grid", desc: "Contact sheet" },
    { id: "3", name: "Spotlight",  desc: "Spacious" },
    { id: "4", name: "Soft Glass", desc: "Frosted app" },
    { id: "5", name: "Gallery Dark", desc: "Museum wall" }
  ];

  function field(label, id, val, type, ph) {
    return '<label class="cc-label">' + esc(label) + '</label>' +
      (type === "textarea"
        ? '<textarea class="cc-input" id="' + id + '" rows="2" placeholder="' + esc(ph || "") + '">' + esc(val) + '</textarea>'
        : '<input class="cc-input" id="' + id + '" type="' + (type || "text") + '" value="' + esc(val) + '" placeholder="' + esc(ph || "") + '">');
  }
  function color(label, id, val) {
    return '<div class="cc-color"><span>' + esc(label) + '</span>' +
      '<input type="color" id="' + id + '" value="' + esc(val) + '"></div>';
  }

  window.renderConsole = function () {
    var el = document.getElementById("tab-console");
    if (!el) return;
    var cfg = (window.SiteConfig && window.SiteConfig.current) || {};
    var t = cfg.theme || {}, c = cfg.content || {}, d = cfg.daraja || {};

    el.innerHTML =
      '<div class="adm-page-header"><div class="adm-page-title">Control Console</div>' +
      '<div class="adm-page-sub">Live theme, layout & content — published to every visitor</div></div>' +

      '<div class="cc-grid">' +

        // THEME
        '<section class="cc-card"><h4>🎨 Palette</h4>' +
          color("Gold / brand", "cc_gold", t.gold || "#c9a84c") +
          color("Accent / action", "cc_accent", t.accent || "#1aa34a") +
          color("Ink / text", "cc_ink", t.ink || "#2c2c2c") +
          color("Cream / surface", "cc_cream", t.cream || "#faf8f3") +
          '<label class="cc-label">Corner radius</label>' +
          '<input class="cc-input" id="cc_radius" type="text" value="' + esc(t.radius || "4px") + '">' +
          '<label class="cc-label">Glass opacity — <span id="cc_alphaVal">' + (t.glassAlpha != null ? t.glassAlpha : 0.72) + '</span></label>' +
          '<input id="cc_alpha" type="range" min="0.3" max="1" step="0.02" value="' + (t.glassAlpha != null ? t.glassAlpha : 0.72) + '" style="width:100%">' +
          '<label class="cc-check"><input type="checkbox" id="cc_optics" ' + (t.optics ? "checked" : "") + '> Animated background optics</label>' +
        '</section>' +

        // LAYOUT
        '<section class="cc-card"><h4>🧩 Layout</h4><div class="cc-layouts">' +
          LAYOUTS.map(function (L) {
            return '<button type="button" class="cc-layout' + (String(cfg.layout) === L.id ? " sel" : "") +
              '" data-layout="' + L.id + '"><strong>' + L.id + '</strong>' + esc(L.name) +
              '<span>' + esc(L.desc) + '</span></button>';
          }).join("") +
        '</div><p class="cc-hint">Slots 6–10 reserved — switcher is ready to expand.</p></section>' +

        // CONTENT / CMS
        '<section class="cc-card"><h4>📝 Content</h4>' +
          field("Foundation name", "cc_name", c.foundationName) +
          field("Footer line", "cc_footer", c.footerText, "textarea") +
          field("Footer sub-line", "cc_footerSub", c.footerSub, "textarea") +
          field("WhatsApp number (2547…)", "cc_wa", c.whatsapp, "text", "254704708178") +
          field("Email", "cc_email", c.email, "email") +
          field("Instagram URL", "cc_ig", c.instagram, "url") +
          field("Address", "cc_addr", c.address) +
          field("Owner remark (splash)", "cc_remark", c.ownerRemark, "textarea") +
          field("Remark attribution", "cc_remarkBy", c.ownerRemarkBy) +
        '</section>' +

        // DARAJA (non-secret)
        '<section class="cc-card"><h4>💳 M-Pesa / Daraja</h4>' +
          '<p class="cc-hint">Only the PUBLIC endpoint URL goes here. Secret keys live on the server — never in this panel.</p>' +
          field("Business name", "cc_dbiz", d.businessName, "text") +
          field("Secure STK-push endpoint URL", "cc_dep", d.endpoint, "url", "https://your-backend/stkpush") +
          '<div class="cc-keystatus" id="cc_keystatus"></div>' +
        '</section>' +

      '</div>' +

      '<div class="cc-actions">' +
        '<button class="cc-btn cc-publish" id="cc_publish">Publish to all visitors</button>' +
        '<button class="cc-btn cc-reset" id="cc_reset">Revert preview</button>' +
        '<span class="cc-status" id="cc_status"></span>' +
      '</div>';

    wire();
    updateKeyStatus();
  };

  // Build a config object from the current form state
  function collect() {
    var g = function (id) { var n = document.getElementById(id); return n ? n.value : ""; };
    var ck = function (id) { var n = document.getElementById(id); return !!(n && n.checked); };
    var sel = document.querySelector(".cc-layout.sel");
    return {
      theme: {
        gold: g("cc_gold"), accent: g("cc_accent"), ink: g("cc_ink"), cream: g("cc_cream"),
        radius: g("cc_radius"), glassAlpha: parseFloat(g("cc_alpha")) || 0.72, optics: ck("cc_optics")
      },
      layout: sel ? sel.getAttribute("data-layout") : (window.SiteConfig.current.layout || "1"),
      content: {
        foundationName: g("cc_name"), footerText: g("cc_footer"), footerSub: g("cc_footerSub"),
        whatsapp: g("cc_wa").replace(/[^\d]/g, ""), email: g("cc_email"), instagram: g("cc_ig"),
        address: g("cc_addr"), ownerRemark: g("cc_remark"), ownerRemarkBy: g("cc_remarkBy")
      },
      daraja: { businessName: g("cc_dbiz"), endpoint: g("cc_dep").trim() }
    };
  }

  function preview() { if (window.SiteConfig) window.SiteConfig.apply(window.SiteConfig._merge(collect())); }

  function updateKeyStatus() {
    var box = document.getElementById("cc_keystatus");
    if (!box) return;
    var live = (document.getElementById("cc_dep").value || "").trim();
    box.className = "cc-keystatus " + (live ? "ok" : "warn");
    box.textContent = live
      ? "✓ Endpoint set — donations will trigger a live STK push."
      : "⚠ No endpoint yet — Donate button shows a friendly “coming soon”. Deploy the Cloud Function, then paste its URL here.";
  }

  function wire() {
    document.querySelectorAll(".cc-layout").forEach(function (b) {
      b.addEventListener("click", function () {
        document.querySelectorAll(".cc-layout").forEach(function (x) { x.classList.remove("sel"); });
        b.classList.add("sel"); preview();
      });
    });
    ["cc_gold","cc_accent","cc_ink","cc_cream","cc_radius","cc_optics"].forEach(function (id) {
      var n = document.getElementById(id); if (n) n.addEventListener("input", preview);
    });
    var a = document.getElementById("cc_alpha");
    if (a) a.addEventListener("input", function () {
      document.getElementById("cc_alphaVal").textContent = a.value; preview();
    });
    var dep = document.getElementById("cc_dep");
    if (dep) dep.addEventListener("input", updateKeyStatus);

    document.getElementById("cc_reset").addEventListener("click", function () {
      window.dispatchEvent(new Event("siteconfig_revert"));
      window.renderConsole();
    });
    document.getElementById("cc_publish").addEventListener("click", async function () {
      var status = document.getElementById("cc_status");
      status.textContent = "Publishing…"; status.className = "cc-status";
      var ok = await window.SiteConfig.publish(collect());
      status.textContent = ok ? "✓ Published live to all visitors" : "✕ Publish failed (admin only)";
      status.className = "cc-status " + (ok ? "ok" : "err");
      if (ok && window.showToast) window.showToast("Site settings published ✨");
    });
  }

  // Revert preview = re-apply last known good config from Firestore cache
  window.addEventListener("siteconfig_revert", function () {
    if (window.SiteConfig) window.SiteConfig.apply(window.SiteConfig.current);
  });
})();
