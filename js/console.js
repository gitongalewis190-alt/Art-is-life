/* ═══════════════════════════════════════════════════════════════════════
   console.js — Control Console (Developer Hub)  (Phase 3)
   Neural-network canvas background + Cloudinary image upload
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  var esc = function (s) { return window.escapeHtml ? window.escapeHtml(s) : String(s == null ? "" : s); };

  var LAYOUTS = [
    { id: "1", name: "Obsidian",   desc: "Void + liquid glass (default)" },
    { id: "2", name: "Linen",      desc: "Warm editorial, terracotta" },
    { id: "3", name: "Museum",     desc: "Pure white, art as star" },
    { id: "4", name: "Matrix",     desc: "Dense navy, electric-blue" },
    { id: "5", name: "Aurora",     desc: "Nebula violet + rose glass" },
    { id: "6", name: "Cinematic",  desc: "Film-strip, full-bleed" },
    { id: "7", name: "Spectrum",   desc: "Light + rainbow accents" }
  ];

  /* ─── Neural-network particle canvas ─── */
  var _neuralRAF = null;
  function startNeural(canvas) {
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    var W, H, nodes = [], MAX = 55, LINK_DIST = 130;

    function resize() {
      W = canvas.width  = canvas.offsetWidth;
      H = canvas.height = canvas.offsetHeight;
    }
    resize();
    new ResizeObserver(resize).observe(canvas);

    for (var i = 0; i < MAX; i++) {
      nodes.push({
        x: Math.random() * (W || 800),
        y: Math.random() * (H || 600),
        vx: (Math.random() - 0.5) * 0.42,
        vy: (Math.random() - 0.5) * 0.42,
        r: 2.2 + Math.random() * 2,
        pulse: Math.random() * Math.PI * 2
      });
    }

    function draw() {
      _neuralRAF = requestAnimationFrame(draw);
      ctx.clearRect(0, 0, W, H);

      var gold = "201,168,76", purple = "120,60,220", blue = "37,99,235";
      var palette = [gold, gold, purple, blue];

      nodes.forEach(function (n, i) {
        n.x += n.vx; n.y += n.vy; n.pulse += 0.025;
        if (n.x < 0 || n.x > W) n.vx *= -1;
        if (n.y < 0 || n.y > H) n.vy *= -1;

        // Draw links
        for (var j = i + 1; j < nodes.length; j++) {
          var m = nodes[j];
          var dx = n.x - m.x, dy = n.y - m.y;
          var dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < LINK_DIST) {
            var alpha = (1 - dist / LINK_DIST) * 0.28;
            var col = palette[(i + j) % palette.length];
            ctx.beginPath();
            ctx.moveTo(n.x, n.y);
            ctx.lineTo(m.x, m.y);
            ctx.strokeStyle = "rgba(" + col + "," + alpha + ")";
            ctx.lineWidth = 0.9;
            ctx.stroke();
          }
        }

        // Draw node
        var glow = 0.55 + Math.sin(n.pulse) * 0.3;
        var col2 = palette[i % palette.length];
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r * (0.9 + Math.sin(n.pulse) * 0.2), 0, Math.PI * 2);
        ctx.fillStyle = "rgba(" + col2 + "," + glow + ")";
        ctx.fill();

        // Halo
        var grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 5);
        grad.addColorStop(0, "rgba(" + col2 + "," + (glow * 0.25) + ")");
        grad.addColorStop(1, "rgba(" + col2 + ",0)");
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r * 5, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
      });
    }
    if (_neuralRAF) cancelAnimationFrame(_neuralRAF);
    draw();
  }
  function stopNeural() {
    if (_neuralRAF) { cancelAnimationFrame(_neuralRAF); _neuralRAF = null; }
  }
  window._stopNeural = stopNeural;

  /* ─── Cloudinary upload logic ─── */
  var _uploadedUrls = [];

  function getCloudinaryCfg() {
    var cfg = (window.SiteConfig && window.SiteConfig.current) || {};
    return cfg.cloudinary || {};
  }

  function renderUploadThumbs() {
    var grid = document.getElementById("cc_thumbgrid");
    if (!grid) return;
    if (!_uploadedUrls.length) { grid.innerHTML = ""; return; }
    grid.innerHTML = _uploadedUrls.map(function (url, idx) {
      return '<div class="cc-upload-thumb">' +
        '<img src="' + esc(url) + '" loading="lazy">' +
        '<button class="cc-upload-thumb-del" onclick="window._ccDelThumb(' + idx + ')">×</button>' +
        '</div>';
    }).join("");
  }

  window._ccDelThumb = function (idx) {
    _uploadedUrls.splice(idx, 1);
    renderUploadThumbs();
  };

  async function uploadToCloudinary(file) {
    var cc = getCloudinaryCfg();
    var cloudName = cc.cloudName || "";
    var preset    = cc.uploadPreset || "";
    if (!cloudName || !preset) {
      return { error: "Set your Cloudinary Cloud Name and Upload Preset in the fields above first." };
    }
    var fd = new FormData();
    fd.append("file", file);
    fd.append("upload_preset", preset);
    fd.append("folder", "art-is-life/artworks");
    try {
      var res = await fetch("https://api.cloudinary.com/v1_1/" + encodeURIComponent(cloudName) + "/image/upload", {
        method: "POST", body: fd
      });
      var json = await res.json();
      if (json.secure_url) return { url: json.secure_url };
      return { error: (json.error && json.error.message) || "Upload failed." };
    } catch (e) {
      return { error: "Network error: " + e.message };
    }
  }

  function wireUpload() {
    var zone = document.getElementById("cc_uploadzone");
    var input = document.getElementById("cc_fileinput");
    var prog  = document.getElementById("cc_upprog");
    if (!zone || !input) return;

    zone.addEventListener("click", function () { input.click(); });
    zone.addEventListener("dragover", function (e) { e.preventDefault(); zone.classList.add("drag"); });
    zone.addEventListener("dragleave", function () { zone.classList.remove("drag"); });
    zone.addEventListener("drop", function (e) {
      e.preventDefault(); zone.classList.remove("drag");
      handleFiles(e.dataTransfer.files);
    });
    input.addEventListener("change", function () { handleFiles(input.files); input.value = ""; });

    async function handleFiles(files) {
      if (!files || !files.length) return;
      prog.textContent = "Uploading " + files.length + " file(s)…";
      prog.className = "cc-upload-progress uploading";
      var errors = [];
      for (var i = 0; i < files.length; i++) {
        var f = files[i];
        if (!f.type.startsWith("image/")) { errors.push(f.name + " is not an image"); continue; }
        var result = await uploadToCloudinary(f);
        if (result.url) {
          _uploadedUrls.push(result.url);
          renderUploadThumbs();
        } else {
          errors.push(f.name + ": " + result.error);
        }
      }
      if (errors.length) {
        prog.textContent = errors.join(" · ");
        prog.className = "cc-upload-progress err";
      } else {
        prog.textContent = "✓ " + files.length + " image(s) uploaded. Copy URL(s) below for artworks.";
        prog.className = "cc-upload-progress done";
      }
    }
  }

  /* ─── Form helpers ─── */
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

  /* ─── Main render ─── */
  window.renderConsole = function () {
    var el = document.getElementById("tab-console");
    if (!el) return;
    stopNeural();

    var cfg = (window.SiteConfig && window.SiteConfig.current) || {};
    var t = cfg.theme || {}, c = cfg.content || {}, d = cfg.daraja || {};
    var cl = cfg.cloudinary || {};

    el.innerHTML =
      '<div class="cc-shell">' +
      '<canvas class="cc-neural-canvas" id="cc_neural"></canvas>' +

      '<div class="adm-page-header"><div class="adm-page-title">Control Console</div>' +
      '<div class="adm-page-sub">Live theme, layout & content — published to every visitor instantly</div></div>' +

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
          '<input id="cc_alpha" type="range" min="0.02" max="1" step="0.02" value="' + (t.glassAlpha != null ? t.glassAlpha : 0.72) + '" style="width:100%">' +
          '<label class="cc-check"><input type="checkbox" id="cc_optics" ' + (t.optics !== false ? "checked" : "") + '> Animated background optics</label>' +
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

        // IMAGE UPLOAD — Cloudinary
        '<section class="cc-card"><h4>🖼 Image Upload (Cloudinary)</h4>' +
          '<p class="cc-hint">Free Cloudinary account → Dashboard → Cloud name + create an <em>unsigned</em> upload preset. Paste below. Your images go to the <code>art-is-life/artworks</code> folder.</p>' +
          field("Cloud Name", "cc_cld_name", cl.cloudName, "text", "your-cloud-name") +
          field("Upload Preset (unsigned)", "cc_cld_preset", cl.uploadPreset, "text", "art_unsigned") +
          '<div id="cc_uploadzone" class="cc-upload-zone">' +
            '<input type="file" id="cc_fileinput" multiple accept="image/*">' +
            '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom:6px"><path d="M12 16V8m0 0-3 3m3-3 3 3"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>' +
            '<div>Drop images here or <strong>click to browse</strong></div>' +
            '<div style="font-size:.7rem;margin-top:4px;opacity:.6">JPG, PNG, WEBP — any size</div>' +
          '</div>' +
          '<div id="cc_upprog" class="cc-upload-progress"></div>' +
          '<div id="cc_thumbgrid" class="cc-upload-thumb-grid"></div>' +
          '<p class="cc-hint" style="margin-top:10px">After upload, copy the URL and paste it into the Artwork image field in the admin artworks panel.</p>' +
        '</section>' +

        // DARAJA (non-secret)
        '<section class="cc-card"><h4>💳 M-Pesa / Daraja</h4>' +
          '<p class="cc-hint">Only the PUBLIC endpoint URL goes here. Secret keys live on the server — never in this panel.</p>' +
          field("Business name", "cc_dbiz", d.businessName, "text") +
          field("Secure STK-push endpoint URL", "cc_dep", d.endpoint, "url", "https://your-backend/stkpush") +
          '<div class="cc-keystatus" id="cc_keystatus"></div>' +
        '</section>' +

        // GOOGLE ANALYTICS
        '<section class="cc-card"><h4>📊 Google Analytics</h4>' +
          '<p class="cc-hint">Your GA4 Measurement ID. Fires real events on every visitor interaction.</p>' +
          field("Measurement ID", "cc_ga_id", (window.SITE_CONFIG && window.SITE_CONFIG.gaId) || "G-MPX5MMNRB2", "text", "G-XXXXXXXXXX") +
          (function(){
            var evts = (window.dataLayer || []).filter(function(e){ return typeof e[0]==="string" && e[0]==="event"; });
            var ok = typeof window.gtag === "function";
            return '<div class="cc-keystatus ' + (ok?"ok":"warn") + '" style="margin-top:10px">' +
              (ok ? "✓ gtag active — " + evts.length + " event(s) fired this session." : "⚠ gtag not responding — may be blocked by an ad-blocker. Real visitors still tracked.") +
              '</div>' +
              '<div style="margin-top:10px;max-height:80px;overflow-y:auto;font-family:monospace;font-size:.69rem;background:rgba(0,0,0,0.04);border-radius:6px;padding:7px 9px;color:var(--muted);line-height:1.65">' +
              (evts.slice(-5).map(function(e){return String(e[1]||"event")+(e[2]?" · "+JSON.stringify(e[2]).slice(0,38):"");}).join("<br>")||"No events yet this session.") +
              '</div>';
          })() +
          '<div style="margin-top:10px"><a href="https://analytics.google.com" target="_blank" rel="noopener" style="font-size:.74rem;color:var(--gold-dark);text-decoration:underline">Open Google Analytics →</a></div>' +
        '</section>' +

        // FIREBASE STATUS
        '<section class="cc-card"><h4>🔥 Firebase</h4>' +
          (function(){
            var db = window._db;
            var auth = window._auth;
            var role = window._currentRole || "none";
            var email = (auth && auth.currentUser && auth.currentUser.email) || "Not signed in";
            var uid = (auth && auth.currentUser && auth.currentUser.uid) || "—";
            var pid = (db && db.app && db.app.options && db.app.options.projectId) || "artislife-44968";
            return '<div style="display:grid;gap:7px">' +
              '<div class="cc-keystatus ' + (db?"ok":"warn") + '">' + (db?"✓ Firestore connected · project: "+pid:"⚠ Firestore offline") + '</div>' +
              '<div class="cc-keystatus ' + (auth?"ok":"warn") + '">' + (auth?"✓ Firebase Auth ready":"⚠ Auth not ready") + '</div>' +
            '</div>' +
            '<div style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
              '<div><label class="cc-label">Email</label><div style="font-size:.78rem;word-break:break-all">' + esc(email) + '</div></div>' +
              '<div><label class="cc-label">Role</label><div style="font-size:.8rem;font-weight:700;color:var(--gold-dark);text-transform:uppercase;letter-spacing:.05em">' + esc(role) + '</div></div>' +
            '</div>' +
            '<label class="cc-label" style="margin-top:10px">UID</label>' +
            '<code style="display:block;font-size:.68rem;font-family:monospace;background:rgba(0,0,0,0.05);padding:6px 9px;border-radius:5px;word-break:break-all;user-select:all">' + esc(uid) + '</code>' +
            '<div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap">' +
              '<a href="https://console.firebase.google.com/project/'+pid+'/firestore" target="_blank" rel="noopener" style="font-size:.73rem;color:var(--gold-dark);text-decoration:underline">Firestore →</a>' +
              '<a href="https://console.firebase.google.com/project/'+pid+'/authentication/users" target="_blank" rel="noopener" style="font-size:.73rem;color:var(--gold-dark);text-decoration:underline">Auth →</a>' +
              '<a href="https://console.firebase.google.com/project/'+pid+'/overview" target="_blank" rel="noopener" style="font-size:.73rem;color:var(--gold-dark);text-decoration:underline">Project →</a>' +
            '</div>';
          })() +
        '</section>' +

        // PWA & APP
        '<section class="cc-card"><h4>📱 PWA &amp; App</h4>' +
          (function(){
            var standalone = window.matchMedia("(display-mode:standalone)").matches || window.navigator.standalone === true;
            var swOk = "serviceWorker" in navigator;
            return '<div style="display:grid;gap:7px">' +
              '<div class="cc-keystatus ' + (swOk?"ok":"warn") + '">' + (swOk?"✓ Service Worker active · cache: ail-v2":"⚠ Service Worker not supported") + '</div>' +
              '<div class="cc-keystatus ' + (standalone?"ok":"warn") + '">' + (standalone?"✓ Running as installed app":"ℹ Browser mode · install via Share → Add to Home Screen") + '</div>' +
            '</div>' +
            '<div style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
              '<div><label class="cc-label">Cache</label><div style="font-size:.85rem;font-weight:700">ail-v2</div></div>' +
              '<div><label class="cc-label">Mode</label><div style="font-size:.85rem;font-weight:700">' + (standalone?"Standalone":"Browser") + '</div></div>' +
            '</div>' +
            '<p class="cc-hint" style="margin-top:10px">iOS: Share → Add to Home Screen. Android: install prompt in browser address bar. App works offline.</p>';
          })() +
        '</section>' +

      '</div>' +

      '<div class="cc-actions">' +
        '<button class="cc-btn cc-publish" id="cc_publish">Publish to all visitors</button>' +
        '<button class="cc-btn cc-reset" id="cc_reset">Revert preview</button>' +
        '<span class="cc-status" id="cc_status"></span>' +
      '</div>' +
      '</div>'; // .cc-shell

    // Start neural canvas
    var canvas = document.getElementById("cc_neural");
    if (canvas) setTimeout(function () { startNeural(canvas); }, 60);

    wire();
    wireUpload();
    updateKeyStatus();
    renderUploadThumbs();
  };

  function collect() {
    var g = function (id) { var n = document.getElementById(id); return n ? n.value : ""; };
    var ck = function (id) { var n = document.getElementById(id); return !!(n && n.checked); };
    var sel = document.querySelector(".cc-layout.sel");
    return {
      theme: {
        gold: g("cc_gold"), accent: g("cc_accent"), ink: g("cc_ink"), cream: g("cc_cream"),
        radius: g("cc_radius"), glassAlpha: parseFloat(g("cc_alpha")) || 0.72, optics: ck("cc_optics")
      },
      layout: sel ? sel.getAttribute("data-layout") : (window.SiteConfig.current.layout || "5"),
      content: {
        foundationName: g("cc_name"), footerText: g("cc_footer"), footerSub: g("cc_footerSub"),
        whatsapp: g("cc_wa").replace(/[^\d]/g, ""), email: g("cc_email"), instagram: g("cc_ig"),
        address: g("cc_addr"), ownerRemark: g("cc_remark"), ownerRemarkBy: g("cc_remarkBy")
      },
      cloudinary: {
        cloudName: g("cc_cld_name").trim(),
        uploadPreset: g("cc_cld_preset").trim()
      },
      daraja:    { businessName: g("cc_dbiz"), endpoint: g("cc_dep").trim() },
      gaId:      g("cc_ga_id").trim() || "G-MPX5MMNRB2"
    };
  }

  function preview() { if (window.SiteConfig) window.SiteConfig.apply(window.SiteConfig._merge(collect())); }

  function updateKeyStatus() {
    var box = document.getElementById("cc_keystatus");
    if (!box) return;
    var live = (document.getElementById("cc_dep") || {}).value || "";
    box.className = "cc-keystatus " + (live.trim() ? "ok" : "warn");
    box.textContent = live.trim()
      ? "✓ Endpoint set — donations will trigger a live STK push."
      : "⚠ No endpoint yet — Donate button shows a friendly "coming soon". Deploy the Cloud Function, then paste its URL here.";
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
      document.getElementById("cc_alphaVal").textContent = parseFloat(a.value).toFixed(2); preview();
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

  window.addEventListener("siteconfig_revert", function () {
    if (window.SiteConfig) window.SiteConfig.apply(window.SiteConfig.current);
  });

})();
