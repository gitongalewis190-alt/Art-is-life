/* ═══════════════════════════════════════════════════════════════════════
   migrate.js -- Transfer tab: copies the site's data from Firebase to
   Supabase, from inside the Admin dashboard. Runs only in the browser of
   a signed-in Firebase admin, after signing in to Supabase as an admin.
   Firebase data is READ (admin rules allow it); nothing in Firebase changes.
   ═══════════════════════════════════════════════════════════════════════ */
import { collection, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref as storageRef, getBytes } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";

const SUPABASE_URL  = "https://idudctscwjyckkzhnthh.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlkdWRjdHNjd2p5Y2tremhudGhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyNTcwMDMsImV4cCI6MjEwODgzMzAwM30.OOVZLG-BNncsyfeHHP_H21bdA3hZOBASOXGDmKYlsCU";
const SB_BUCKET = "artworks";

let sb = null;          // Supabase client
let sbUser = null;      // signed-in Supabase user
let sbRole = null;      // role from the profiles table
let busy = false;

const $ = (id) => document.getElementById(id);

function log(msg, tone) {
  const box = $("trLog");
  if (!box) return;
  const line = document.createElement("div");
  line.textContent = msg;
  if (tone) line.style.color = tone;
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}

function setStatus(text, tone) {
  const el = $("trStatus");
  if (!el) return;
  el.textContent = text;
  el.style.color = tone || "var(--adm-muted,#9ca3af)";
}

function canRun() {
  return !!(window._firebaseAdmin && window._db && window._storage);
}

/* ── UI ─────────────────────────────────────────────────────────────── */

window.renderTransferTab = function () {
  const el = $("tab-transfer");
  if (!el) return;
  if (!el.dataset.ready) {
    el.dataset.ready = "1";
    el.innerHTML = `
      <div class="adm-page-title">Transfer to Supabase</div>
      <div class="adm-page-sub" style="margin-bottom:18px;">Copies artworks, pictures, orders, studio films, and site settings from Firebase into your Supabase project. Firebase is only read, never changed.</div>
      <div style="display:grid;gap:14px;max-width:560px;">
        <div class="adm-card" style="padding:16px;">
          <div style="font-weight:600;margin-bottom:8px;">1. Sign in to Supabase as admin</div>
          <input id="trSbEmail" class="adm-input" type="email" placeholder="Your Supabase admin email" autocomplete="username" autocapitalize="none" style="margin-bottom:8px;">
          <input id="trSbPass" class="adm-input" type="password" placeholder="Supabase password" autocomplete="current-password" style="margin-bottom:8px;">
          <button class="adm-btn-sm primary" id="trSbLogin">Sign in to Supabase</button>
        </div>
        <div class="adm-card" style="padding:16px;">
          <div style="font-weight:600;margin-bottom:8px;">2. Check what will move</div>
          <button class="adm-btn-sm" id="trCount">Count Firebase data</button>
        </div>
        <div class="adm-card" style="padding:16px;">
          <div style="font-weight:600;margin-bottom:8px;">3. Copy everything</div>
          <div style="font-size:0.8rem;color:var(--adm-muted,#9ca3af);margin-bottom:10px;">Safe to run again. Items keep their Firebase IDs, so nothing is duplicated.</div>
          <button class="adm-btn-sm primary" id="trRun" disabled>Start transfer</button>
        </div>
        <div id="trStatus" style="font-size:0.85rem;"></div>
        <div id="trLog" style="font-family:monospace;font-size:0.76rem;background:#0f0e0b;color:#e5e7eb;padding:12px;border-radius:8px;min-height:120px;max-height:320px;overflow:auto;white-space:pre-wrap;"></div>
      </div>`;
    $("trSbLogin").addEventListener("click", signInSupabase);
    $("trCount").addEventListener("click", countFirebase);
    $("trRun").addEventListener("click", startTransfer);
  }
  if (!canRun()) setStatus("Sign in to the admin dashboard with your Firebase admin account first.", "#e05252");
};

async function signInSupabase() {
  const email = $("trSbEmail").value.trim();
  const password = $("trSbPass").value;
  if (!email || !password) return setStatus("Enter your Supabase admin email and password.", "#e05252");
  sb = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: true } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return setStatus("Supabase sign-in failed: " + error.message, "#e05252");
  sbUser = data.user;
  const { data: prof } = await sb.from("profiles").select("role").eq("id", sbUser.id).maybeSingle();
  sbRole = prof ? prof.role : null;
  if (sbRole !== "admin" && sbRole !== "crown") {
    setStatus("Signed in, but this account has no admin role in Supabase yet. Run the last step of schema.sql for this email.", "#e05252");
    return;
  }
  setStatus("Signed in to Supabase as " + sbUser.email + " (" + sbRole + ").", "#34d399");
  $("trRun").disabled = !canRun();
}

async function countFirebase() {
  if (!canRun()) return setStatus("Firebase admin session needed.", "#e05252");
  setStatus("Counting…");
  const counts = {};
  for (const name of ["artworks", "orders", "studioVideos", "studioArchive", "likes", "comments"]) {
    counts[name] = (await getDocs(collection(window._db, name))).size;
  }
  const cfg = await getDoc(doc(window._db, "siteConfig", "main"));
  counts.siteConfig = cfg.exists() ? 1 : 0;
  log("Firebase data found:");
  Object.entries(counts).forEach(([k, v]) => log(`  ${k}: ${v}`));
  log("Likes and comments are not copied (see the note below).", "#f5c26b");
  setStatus("Counted. Sign in to Supabase, then start the transfer.");
}

/* ── Transfer ───────────────────────────────────────────────────────── */

async function uuidFrom(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  const h = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const iso = (v) => (v && typeof v.toDate === "function" ? v.toDate().toISOString() : new Date().toISOString());
const clip = (v, n) => String(v == null ? "" : v).slice(0, n);

function guessType(p) {
  if (/\.png$/i.test(p)) return "image/png";
  if (/\.webp$/i.test(p)) return "image/webp";
  if (/\.gif$/i.test(p)) return "image/gif";
  return "image/jpeg";
}

// Firebase picture → Supabase bucket. Local site images (assets/...) stay as they are.
async function moveImage(url, key) {
  if (!url || !/^https?:\/\//.test(url)) return url || "";
  const m = url.match(/\/o\/([^?]+)/);
  if (!m) { log("  picture left as-is (unknown link): " + url.slice(0, 60), "#f5c26b"); return url; }
  const path = decodeURIComponent(m[1]);
  const bytes = await getBytes(storageRef(window._storage, path));
  const type = guessType(path);
  const name = ("migrated/" + key + "-" + path.split("/").pop()).replace(/[^\w.\-\/]/g, "_");
  const { error } = await sb.storage.from(SB_BUCKET).upload(name, new Blob([bytes], { type }), { upsert: true, contentType: type });
  if (error) throw new Error("picture upload: " + error.message);
  return sb.storage.from(SB_BUCKET).getPublicUrl(name).data.publicUrl;
}

async function startTransfer() {
  if (busy) return;
  if (!sbUser || (sbRole !== "admin" && sbRole !== "crown")) return setStatus("Sign in to Supabase as an admin first.", "#e05252");
  if (!canRun()) return setStatus("Firebase admin session needed.", "#e05252");
  if (!confirm("Copy everything from Firebase into Supabase now?")) return;
  busy = true;
  $("trRun").disabled = true;
  $("trLog").textContent = "";
  const tally = { artworks: 0, pictures: 0, orders: 0, studioVideos: 0, studioArchive: 0, siteConfig: 0, failed: 0 };

  try {
    log("Copying artworks…");
    for (const d of (await getDocs(collection(window._db, "artworks"))).docs) {
      try {
        const x = d.data();
        const image = await moveImage(x.image, d.id);
        if (image !== x.image && /^https?:\/\//.test(x.image || "")) tally.pictures++;
        const { error } = await sb.from("artworks").upsert({
          id: d.id,
          title: clip(x.title, 140) || "Untitled",
          price_kes: Math.max(0, Math.floor(Number(x.priceNum) || 0)),
          description: clip(x.desc, 2000),
          image_url: image,
          dimensions: clip(x.dimensions, 80),
          status: ["available", "featured", "sold"].includes(x.status) ? x.status : "available",
          deleted_at: x.deleted === true ? iso(x.deletedAt || x.createdAt) : null,
          created_at: iso(x.createdAt),
          updated_at: iso(x.createdAt),
        }, { onConflict: "id" });
        if (error) throw new Error(error.message);
        tally.artworks++;
        log("  ✓ " + clip(x.title, 40));
      } catch (e) { tally.failed++; log("  ✗ artwork " + d.id + ": " + e.message, "#e05252"); }
    }

    log("Copying orders…");
    for (const d of (await getDocs(collection(window._db, "orders"))).docs) {
      try {
        const x = d.data(), c = x.customerInfo || {};
        const { error } = await sb.from("orders").upsert({
          id: await uuidFrom("order:" + d.id),
          kind: x.type === "commission" ? "commission" : "purchase",
          name: clip(c.name, 80) || "Customer",
          phone: clip(c.phone, 24),
          email: clip(x.email || c.email, 120),
          address: clip(c.address, 240),
          items: Array.isArray(x.items) ? x.items : [],
          total_kes: Math.max(0, Math.floor(Number(x.totalPrice) || 0)),
          status: ["pending", "paid", "completed", "cancelled"].includes(x.status) ? x.status : "pending",
          channel: clip(x.channel, 20),
          notes: "Moved from Firebase order " + d.id,
          created_at: iso(x.createdAt),
          updated_at: iso(x.createdAt),
        }, { onConflict: "id" });
        if (error) throw new Error(error.message);
        tally.orders++;
      } catch (e) { tally.failed++; log("  ✗ order " + d.id + ": " + e.message, "#e05252"); }
    }
    log("  orders copied: " + tally.orders);

    log("Copying studio films…");
    for (const d of (await getDocs(collection(window._db, "studioVideos"))).docs) {
      try {
        const x = d.data();
        const { error } = await sb.from("studio_videos").upsert({
          id: await uuidFrom("video:" + d.id),
          youtube_id: clip(x.youtube, 32),
          title: clip(x.title, 140),
          description: clip(x.description, 2000),
          tags: Array.isArray(x.tags) ? x.tags.map((t) => clip(t, 40)).filter(Boolean) : [],
          timestamp_label: clip(x.timestamp ?? x.time, 80),
          created_at: iso(x.createdAt),
        }, { onConflict: "id" });
        if (error) throw new Error(error.message);
        tally.studioVideos++;
      } catch (e) { tally.failed++; log("  ✗ film " + d.id + ": " + e.message, "#e05252"); }
    }

    log("Copying studio archive…");
    for (const d of (await getDocs(collection(window._db, "studioArchive"))).docs) {
      try {
        const x = d.data();
        const image = await moveImage(x.image, "archive-" + d.id);
        const { error } = await sb.from("studio_archive").upsert({
          id: await uuidFrom("archive:" + d.id),
          title: clip(x.title, 140) || "Untitled",
          medium: clip(x.medium, 80),
          description: clip(x.description || x.year, 2000),
          image_url: image,
          created_at: iso(x.createdAt),
        }, { onConflict: "id" });
        if (error) throw new Error(error.message);
        tally.studioArchive++;
      } catch (e) { tally.failed++; log("  ✗ archive " + d.id + ": " + e.message, "#e05252"); }
    }

    log("Copying site settings…");
    const cfg = await getDoc(doc(window._db, "siteConfig", "main"));
    if (cfg.exists()) {
      const data = JSON.parse(JSON.stringify(cfg.data(), (k, v) =>
        v && typeof v === "object" && typeof v.toDate === "function" ? v.toDate().toISOString() : v));
      const { error } = await sb.from("site_config").upsert({ id: "main", data, updated_at: new Date().toISOString() }, { onConflict: "id" });
      if (error) throw new Error(error.message);
      tally.siteConfig = 1;
    }

    log("");
    log("DONE", "#34d399");
    log(`artworks ${tally.artworks} · pictures moved ${tally.pictures} · orders ${tally.orders}`);
    log(`films ${tally.studioVideos} · archive ${tally.studioArchive} · settings ${tally.siteConfig} · failed ${tally.failed}`);
    log("Likes and comments were not copied. Visitors' sign-ins are new in Supabase, so their old likes can't be linked.", "#f5c26b");
    setStatus(tally.failed ? "Finished with " + tally.failed + " problem(s). Check the log, then run again." : "Transfer complete.", tally.failed ? "#f5c26b" : "#34d399");
  } catch (e) {
    log("Stopped: " + e.message, "#e05252");
    setStatus("Transfer stopped. Fix the problem and run it again; finished items are kept.", "#e05252");
  } finally {
    busy = false;
    $("trRun").disabled = false;
  }
}
