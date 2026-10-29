/* ═══════════════════════════════════════════════════════════════════════
   studio.js -- Studio / Exhibition wing  (Phase 3)
   Two sections, YouTube-backed "video infrastructure":
     • Process Studio : behind-the-scenes clips (YouTube embeds + metadata)
     • Archive        : non-sale master paintings
   Metadata (title, tags, description, timestamp, youtube id / image) lives
   in Firestore so the owner manages it from the Studio Manager -- no code.
   Public read is live (onSnapshot); writes are admin-gated.
   ═══════════════════════════════════════════════════════════════════════ */
/* Data goes through js/services/supabase.js (sbStudioSubscribe / sbStudioAdd / sbStudioDelete). */

/* Escaping helpers from js/sanitize.js, with real (not identity) fallbacks. */
const esc = (s) => (window.escapeHtml
  ? window.escapeHtml(s)
  : String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"));

const jarg = (s) => (window.jsArg
  ? window.jsArg(s)
  : String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/'/g, "\\'")
      .replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"));

const imgUrl = (s) => {
  const raw = String(s == null ? "" : s);
  return window.safeImageUrl ? window.safeImageUrl(raw) : raw;
};

const cleanText = (s, max) => String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
let VIDEOS = [];
let ARCHIVE = [];

/* ── YouTube helpers ─────────────────────────────────────────────────── */
function ytId(input) {
  const s = String(input || "").trim();
  if (/^[\w-]{11}$/.test(s)) return s; // already an id
  const m = s.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/);
  return m ? m[1] : "";
}
const ytThumb = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

/* ── Public rendering ────────────────────────────────────────────────── */
function renderVideos() {
  const grid = document.getElementById("studioVideoGrid");
  if (!grid) return;
  if (!VIDEOS.length) {
    grid.innerHTML = '<div class="studio-empty">Behind-the-scenes films are coming soon. Watch this space.</div>';
    return;
  }
  grid.innerHTML = VIDEOS.map((v) => {
    const id = ytId(v.youtube);
    const tags = (v.tags || []).map((t) => `<span class="studio-tag">${esc(t)}</span>`).join("");
    return `<div class="studio-card" role="button" tabindex="0" aria-label="Play film: ${esc(v.title)}"
        onclick="openVideo('${jarg(id)}')"
        onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openVideo('${jarg(id)}');}">
      <div class="studio-thumb">
        <img loading="lazy" src="${esc(imgUrl(v.thumb) || ytThumb(id))}" alt="${esc(v.title)}" onerror="this.src='assets/brand/cover.jpg'">
        <div class="studio-play"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="11" fill="rgba(0,0,0,0.45)"/><path d="M10 8l6 4-6 4z" fill="#fff"/></svg></div>
      </div>
      <div class="studio-meta">
        <h4>${esc(v.title)}</h4>
        ${v.description ? `<p>${esc(v.description)}</p>` : ""}
        <div class="studio-tags">${tags}</div>
        ${v.timestamp ? `<div class="studio-time">${esc(v.timestamp)}</div>` : ""}
      </div>
    </div>`;
  }).join("");
}

function renderArchive() {
  const grid = document.getElementById("studioArchiveGrid");
  if (!grid) return;
  if (!ARCHIVE.length) {
    grid.innerHTML = '<div class="studio-empty">The master archive is being catalogued.</div>';
    return;
  }
  grid.innerHTML = ARCHIVE.map((a) => `
    <div class="studio-archive-card">
      <img loading="lazy" src="${esc(imgUrl(a.image))}" alt="${esc(a.title)}" role="button" tabindex="0"
        onclick="openZoom('${jarg(imgUrl(a.image))}','${jarg(a.title)}')"
        onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openZoom('${jarg(imgUrl(a.image))}','${jarg(a.title)}');}"
        onerror="this.src='assets/brand/cover.jpg'">
      <div class="studio-archive-cap"><h5>${esc(a.title)}</h5><span>${esc(a.year || "")}${a.medium ? " · " + esc(a.medium) : ""}</span></div>
    </div>`).join("");
}

/* ── Public tab switch + video lightbox (global for inline onclick) ───── */
window.studioView = function (which) {
  document.querySelectorAll(".studio-tab").forEach((t) =>
    t.classList.toggle("sel", t.getAttribute("data-studio") === which));
  const p = document.getElementById("studioProcess");
  const a = document.getElementById("studioArchive");
  if (p) p.style.display = which === "process" ? "" : "none";
  if (a) a.style.display = which === "archive" ? "" : "none";
};

window.openVideo = function (id) {
  // Defence in depth: only an 11-character YouTube id may reach the iframe src.
  const safeId = String(id || "").trim();
  if (!/^[\w-]{11}$/.test(safeId)) return;
  const frame = document.getElementById("videoFrame");
  const ov = document.getElementById("videoOverlay");
  if (!frame || !ov) return;
  frame.innerHTML = `<iframe src="https://www.youtube.com/embed/${safeId}?autoplay=1&rel=0" title="Studio film" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
  ov.classList.add("active");
  ov.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  window._videoReturnFocus = document.activeElement;
  const closer = ov.querySelector(".video-close");
  if (closer) { try { closer.focus(); } catch (_) { /* ignore */ } }
  if (typeof window.track === "function") window.track("studio_video_play", { id: safeId });
};
window.closeVideo = function (e) {
  if (e && e.target && e.target.closest && e.target.closest(".video-frame")) return; // ignore clicks inside
  const frame = document.getElementById("videoFrame");
  const ov = document.getElementById("videoOverlay");
  if (frame) frame.innerHTML = ""; // stop playback
  if (ov) { ov.classList.remove("active"); ov.setAttribute("aria-hidden", "true"); }
  document.body.style.overflow = "";
  const back = window._videoReturnFocus;
  window._videoReturnFocus = null;
  if (back && typeof back.focus === "function") { try { back.focus(); } catch (_) { /* ignore */ } }
};

/* ── Live Firestore sync (public read) ───────────────────────────────── */
async function startSync() {
  if (typeof window.sbStudioSubscribe !== "function") { renderVideos(); renderArchive(); return; }
  try {
    window.sbStudioSubscribe(({ videos, archive }) => {
      VIDEOS = videos;
      ARCHIVE = archive;
      renderVideos(); renderArchive();
      if (window._studioMgrOpen) window.renderStudioManager();
    });
  } catch (_) { renderVideos(); renderArchive(); }
}

function waitForDb() {
  return new Promise((res) => {
    if (window._db) return res(window._db);
    let n = 0;
    const iv = setInterval(() => {
      if (window._db) { clearInterval(iv); res(window._db); }
      else if (++n > 60) { clearInterval(iv); res(null); }
    }, 100);
  });
}

/* ── Admin: Studio Manager (rendered into #tab-studio) ───────────────── */
window.renderStudioManager = function () {
  const el = document.getElementById("tab-studio");
  if (!el) return;
  window._studioMgrOpen = true;
  el.innerHTML =
    '<div class="adm-page-header"><div class="adm-page-title">Studio Manager</div>' +
    '<div class="adm-page-sub">Publish behind-the-scenes films & archive pieces</div></div>' +
    '<div class="cc-grid">' +
      '<section class="cc-card"><h4>🎬 Add process video</h4>' +
        '<label class="cc-label">YouTube URL or ID</label><input class="cc-input" id="sv_url" placeholder="https://youtu.be/…">' +
        '<label class="cc-label">Title</label><input class="cc-input" id="sv_title">' +
        '<label class="cc-label">Description</label><textarea class="cc-input" id="sv_desc" rows="2"></textarea>' +
        '<label class="cc-label">Tags (comma separated)</label><input class="cc-input" id="sv_tags" placeholder="process, oil, timelapse">' +
        '<label class="cc-label">Timestamp / label</label><input class="cc-input" id="sv_time" placeholder="e.g. Studio · March 2026">' +
        '<button class="cc-btn cc-publish" id="sv_add" style="margin-top:14px">Publish video</button>' +
        '<span class="cc-status" id="sv_status"></span>' +
      '</section>' +
      '<section class="cc-card"><h4>🖼 Add archive piece</h4>' +
        '<label class="cc-label">Image URL</label><input class="cc-input" id="sa_img" placeholder="restoration.jpg or https://…">' +
        '<label class="cc-label">Title</label><input class="cc-input" id="sa_title">' +
        '<label class="cc-label">Year</label><input class="cc-input" id="sa_year">' +
        '<label class="cc-label">Medium</label><input class="cc-input" id="sa_medium" placeholder="Oil on canvas">' +
        '<button class="cc-btn cc-publish" id="sa_add" style="margin-top:14px">Add to archive</button>' +
        '<span class="cc-status" id="sa_status"></span>' +
      '</section>' +
    '</div>' +
    '<h4 style="margin:24px 0 10px;font-size:.9rem">Published videos (' + VIDEOS.length + ')</h4>' +
    listHtml(VIDEOS, "video") +
    '<h4 style="margin:24px 0 10px;font-size:.9rem">Archive pieces (' + ARCHIVE.length + ')</h4>' +
    listHtml(ARCHIVE, "archive");

  wireManager();
};

function listHtml(items, kind) {
  if (!items.length) return '<p class="cc-hint">None yet.</p>';
  return '<div class="studio-archive-grid">' + items.map((it) =>
    `<div class="studio-archive-card">
      <img loading="lazy" alt="${esc(it.title || "")}" src="${esc(kind === "video" ? (imgUrl(it.thumb) || ytThumb(ytId(it.youtube))) : imgUrl(it.image))}" onerror="this.src='assets/brand/cover.jpg'">
      <div class="studio-archive-cap"><h5>${esc(it.title)}</h5>
      <button class="cc-btn cc-reset" style="margin-top:8px;padding:6px 12px;font-size:.78rem" onclick="studioDelete('${jarg(kind)}','${jarg(it.id)}')">Delete</button></div>
    </div>`).join("") + '</div>';
}

window.studioDelete = async function (kind, id) {
  if (!window._firebaseAdmin) return;
  const db = window._db; if (!db) return;
  try {
    if (!(await window.sbStudioDelete(kind, id))) throw new Error("delete failed");
    if (window.showToast) window.showToast("Removed.");
  } catch (_) { if (window.showToast) window.showToast("Delete failed."); }
};

function wireManager() {
  const addVideo = document.getElementById("sv_add");
  if (addVideo) addVideo.addEventListener("click", async () => {
    const st = document.getElementById("sv_status");
    const url = document.getElementById("sv_url").value;
    const id = ytId(url);
    if (!id) { st.textContent = "✕ Not a valid YouTube link/ID"; st.className = "cc-status err"; return; }
    if (!window._firebaseAdmin) { st.textContent = "✕ Admin only"; st.className = "cc-status err"; return; }
    st.textContent = "Publishing…"; st.className = "cc-status";
    try {
      await window.sbStudioAdd("video", {
        youtube: id,
        title: cleanText(document.getElementById("sv_title").value, 140) || "Untitled",
        description: cleanText(document.getElementById("sv_desc").value, 1000),
        tags: document.getElementById("sv_tags").value.split(",")
          .map((t) => cleanText(t, 24)).filter(Boolean).slice(0, 12),
        timestamp: cleanText(document.getElementById("sv_time").value, 60),
      });
      st.textContent = "✓ Published"; st.className = "cc-status ok";
      if (window.showToast) window.showToast("Video published 🎬");
    } catch (_) { st.textContent = "✕ Failed"; st.className = "cc-status err"; }
  });

  const addArch = document.getElementById("sa_add");
  if (addArch) addArch.addEventListener("click", async () => {
    const st = document.getElementById("sa_status");
    const img = document.getElementById("sa_img").value.trim();
    if (!img) { st.textContent = "✕ Image URL required"; st.className = "cc-status err"; return; }
    if (!window._firebaseAdmin) { st.textContent = "✕ Admin only"; st.className = "cc-status err"; return; }
    st.textContent = "Adding…"; st.className = "cc-status";
    try {
      const safeImg = imgUrl(img);
      if (!safeImg) { st.textContent = "✕ Use an https:// or relative image URL"; st.className = "cc-status err"; return; }
      await window.sbStudioAdd("archive", {
        image: safeImg,
        title: cleanText(document.getElementById("sa_title").value, 140) || "Untitled",
        year: cleanText(document.getElementById("sa_year").value, 12),
        medium: cleanText(document.getElementById("sa_medium").value, 60),
      });
      st.textContent = "✓ Added"; st.className = "cc-status ok";
      if (window.showToast) window.showToast("Archive piece added 🖼");
    } catch (_) { st.textContent = "✕ Failed"; st.className = "cc-status err"; }
  });
}

/* Esc closes the video lightbox */
document.addEventListener("keydown", (e) => { if (e.key === "Escape") window.closeVideo(); });

startSync();
