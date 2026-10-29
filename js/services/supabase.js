/* ═══════════════════════════════════════════════════════════════════════
   supabase.js -- database, sign-in, pictures and live updates (Supabase).
   Replaces firebase.js. It exposes the same window.* names the rest of
   the site already calls, so app.js, console.js and studio.js keep working.
   Security is enforced by the row-level policies in schema.sql, not here.
   ═══════════════════════════════════════════════════════════════════════ */
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";

const SUPABASE_URL  = "https://idudctscwjyckkzhnthh.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlkdWRjdHNjd2p5Y2tremhudGhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyNTcwMDMsImV4cCI6MjEwODgzMzAwM30.OOVZLG-BNncsyfeHHP_H21bdA3hZOBASOXGDmKYlsCU";

const sb = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { persistSession: true, autoRefreshToken: true }
});

const ROLE_ORDER  = ["viewer", "editor", "admin", "crown"];
const ADMIN_ROLES = ["admin", "crown"];
const MAX_TEXT    = { title: 140, desc: 2000, comment: 1000, name: 80, phone: 24, address: 240 };

/* ── helpers ─────────────────────────────────────────────────────────── */
function cleanText(value, max) {
  return String(value == null ? "" : value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim().slice(0, max);
}
// A Date that also answers .toDate(), so older display code keeps working.
function when(value) {
  const d = new Date(value || Date.now());
  d.toDate = () => new Date(d.getTime());
  return d;
}
function toast(msg) { if (typeof window.showToast === "function") window.showToast(msg); }

/* ── shared state (read by app.js / console.js / studio.js) ──────────── */
window._db = sb;                 // truthy once loaded; console.js checks this
window._auth = sb.auth;
window._storage = sb.storage;
window._authReady = false;
window._currentUser = null;      // { uid, email }
window._currentRole = null;
window._firebaseAdmin = false;   // true only for admin/crown (name kept for app.js)
window._artworksUnsubscribe = null;
window._firestoreArtworks = [];
window._firestoreLikeCounts = {};

/* ── sign-in and roles ───────────────────────────────────────────────── */
async function applySession(session) {
  const user = session && session.user;
  if (!user) {
    window._currentUser = null; window._currentRole = null; window._firebaseAdmin = false;
    return;
  }
  window._currentUser = { uid: user.id, email: user.email };
  const { data } = await sb.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = data && ROLE_ORDER.includes(data.role) ? data.role : null;
  window._currentRole = role;
  window._firebaseAdmin = ADMIN_ROLES.includes(role);
}

// Restore an existing session on load, then tell the page auth is ready.
(async () => {
  try {
    const { data } = await sb.auth.getSession();
    await applySession(data.session);
  } catch (err) {
    console.warn("Session check failed:", err && err.message);
  } finally {
    window._authReady = true;
    window.dispatchEvent(new Event("auth_ready"));
  }
})();

// Keep the role in step with sign-in and sign-out (deferred to avoid re-entrancy).
sb.auth.onAuthStateChange((_event, session) => {
  setTimeout(() => { applySession(session).catch(() => {}); }, 0);
});

window.firebaseAdminLogin = async function (email, password) {
  const { data, error } = await sb.auth.signInWithPassword({
    email: cleanText(email, 254),
    password: String(password || "")
  });
  if (error) {
    return { success: false, error: /invalid login/i.test(error.message) ? "Wrong email or password." : error.message };
  }
  await applySession(data.session);
  if (!window._firebaseAdmin) {
    await sb.auth.signOut();
    return { success: false, error: "This account is not an admin." };
  }
  return { success: true };
};

window.firebaseResetPassword = async function (email) {
  const clean = cleanText(email, 254);
  if (!clean) return { success: false, error: "Enter your email address." };
  const { error } = await sb.auth.resetPasswordForEmail(clean, { redirectTo: window.location.origin + "/" });
  return error ? { success: false, error: error.message } : { success: true };
};

window.firebaseAdminLogout = async function () {
  try { await sb.auth.signOut(); } catch (_) { /* ignore */ }
  window._firebaseAdmin = false; window._currentRole = null; window._currentUser = null;
};

function requireAdmin() {
  if (!window._firebaseAdmin) { toast("⛔ Admin role required."); return false; }
  return true;
}

/* ── artworks ────────────────────────────────────────────────────────── */
function mapArt(r) {
  const price = Number(r.price_kes) || 0;
  return {
    id: String(r.id),
    title: String(r.title || "Untitled").slice(0, 140),
    price: `${price} KES`,
    priceNum: price,
    image: String(r.image_url || "").trim().slice(0, 500) || "assets/brand/cover.jpg",
    desc: String(r.description || "").slice(0, 2000),
    dimensions: String(r.dimensions || ""),
    status: ["available", "featured", "sold"].includes(r.status) ? r.status : "available",
    likes: 0,
    deleted: !!r.deleted_at,
    createdAt: when(r.created_at)
  };
}

async function loadArtworks() {
  const { data, error } = await sb.from("artworks").select("*")
    .is("deleted_at", null).order("created_at", { ascending: false }).limit(500);
  if (error) { console.warn("Artworks load error:", error.message); return; }
  window._firestoreArtworks = (data || []).map(mapArt);
  window.dispatchEvent(new Event("artworks_updated"));
}

window.startArtworksSync = function () {
  if (window._artworksUnsubscribe) return;
  loadArtworks();
  const ch = sb.channel("pub-artworks")
    .on("postgres_changes", { event: "*", schema: "public", table: "artworks" }, loadArtworks)
    .subscribe();
  window._artworksUnsubscribe = () => sb.removeChannel(ch);
};

/* ── likes ───────────────────────────────────────────────────────────── */
async function loadLikeCounts() {
  const { data, error } = await sb.from("likes").select("artwork_id").limit(5000);
  if (error) return;
  const counts = Object.create(null);
  (data || []).forEach((r) => { if (r.artwork_id) counts[r.artwork_id] = (counts[r.artwork_id] || 0) + 1; });
  window._firestoreLikeCounts = counts;
  window.dispatchEvent(new Event("likes_updated"));
}

window.startLikesSync = function () {
  loadLikeCounts();
  sb.channel("pub-likes")
    .on("postgres_changes", { event: "*", schema: "public", table: "likes" }, loadLikeCounts)
    .subscribe();
};

window.fetchArtworkLikesCounts = async function () {
  await loadLikeCounts();
  return { ...window._firestoreLikeCounts };
};

window.toggleLikeFirestore = async function (artworkId) {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;                      // likes need a signed-in visitor
  const artId = cleanText(artworkId, 100);
  if (!artId || !/^[\w:-]+$/.test(artId)) return null;
  const { data: existing } = await sb.from("likes").select("artwork_id")
    .eq("user_id", user.id).eq("artwork_id", artId).maybeSingle();
  if (existing) {
    const { error } = await sb.from("likes").delete().eq("user_id", user.id).eq("artwork_id", artId);
    return error ? null : "unliked";
  }
  const { error } = await sb.from("likes").insert({ user_id: user.id, artwork_id: artId });
  return error ? null : "liked";
};

/* ── comments ────────────────────────────────────────────────────────── */
function mapComment(r) {
  return { id: String(r.id), artworkId: r.artwork_id, text: r.body,
           author: r.author_name || "Visitor", createdAt: when(r.created_at) };
}

window.startCommentsSync = function (artworkId, callback) {
  const safeId = cleanText(artworkId, 100);
  if (!safeId) { callback([]); return () => {}; }
  const load = async () => {
    const { data, error } = await sb.from("comments").select("*")
      .eq("artwork_id", safeId).order("created_at", { ascending: true }).limit(200);
    callback(error ? [] : (data || []).map(mapComment));
  };
  load();
  const ch = sb.channel("cm-" + safeId)
    .on("postgres_changes", { event: "*", schema: "public", table: "comments",
      filter: "artwork_id=eq." + safeId }, load)
    .subscribe();
  return () => sb.removeChannel(ch);
};

window.saveCommentFirestore = async function (artworkId, text) {
  const artId = cleanText(artworkId, 100);
  const body = String(text == null ? "" : text).trim();
  if (!artId || body.length < 2) return false;
  if (body.length > MAX_TEXT.comment) { toast("⚠️ Comment is too long (max 1000 characters)"); return false; }
  const { data: { user } } = await sb.auth.getUser();
  if (!user) { toast("Sign in to leave a comment"); return false; }
  const { error } = await sb.from("comments").insert({
    artwork_id: artId,
    user_id: user.id,
    author_name: cleanText((user.email || "").split("@")[0], 40) || "Visitor",
    body
  });
  if (error) { console.error("Comment save failed:", error.message); return false; }
  return true;
};

/* ── orders ──────────────────────────────────────────────────────────── */
window.saveOrderToFirestore = async function (orderData) {
  try {
    const src = orderData || {};
    const c = src.customerInfo || {};
    const items = (Array.isArray(src.items) ? src.items.slice(0, 50) : []).map((it) => ({
      id: cleanText(it && it.id, 64),
      title: cleanText(it && it.title, MAX_TEXT.title),
      price: cleanText(it && it.price, 32),
      priceNum: Math.max(0, Math.floor(Number(it && it.priceNum) || 0)),
      qty: Math.min(99, Math.max(1, Math.floor(Number(it && it.qty) || 1)))
    }));
    const channel = ["wa", "email", "sms"].includes(src.channel) ? src.channel : "wa";
    const id = crypto.randomUUID();
    // No .select() here: visitors cannot read orders back, and the policy allows insert only.
    const { error } = await sb.from("orders").insert({
      id,
      kind: src.type === "commission" ? "commission" : "purchase",
      name: cleanText(c.name, MAX_TEXT.name) || "Customer",
      phone: cleanText(c.phone, MAX_TEXT.phone),
      email: cleanText(c.email, 120),
      address: cleanText(c.address, MAX_TEXT.address),
      items,
      total_kes: Math.max(0, Math.floor(Number(src.totalPrice) || 0)),
      status: "pending",
      channel
    });
    if (error) throw error;
    return { id };
  } catch (err) {
    console.error("Order save error:", err && err.message);
    return null;
  }
};

function mapOrder(r) {
  return {
    id: r.id,
    customerInfo: { name: r.name, phone: r.phone, address: r.address },
    email: r.email,
    items: Array.isArray(r.items) ? r.items : [],
    totalPrice: r.total_kes,
    status: r.status,
    channel: r.channel,
    type: r.kind,
    createdAt: when(r.created_at)
  };
}

window.fetchOrders = async function () {
  if (!window._firebaseAdmin) return [];
  const { data, error } = await sb.from("orders").select("*")
    .order("created_at", { ascending: false }).limit(50);
  return error ? [] : (data || []).map(mapOrder);
};

window._ordersSnapFn = function (callback) {
  const load = async () => callback(await window.fetchOrders());
  load();
  const ch = sb.channel("adm-orders")
    .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, load)
    .subscribe();
  return () => sb.removeChannel(ch);
};

window.adminUpdateOrder = async function (id, updates) {
  if (!requireAdmin()) return null;
  if (!updates || !["pending", "completed", "cancelled", "paid"].includes(updates.status)) return null;
  const { error } = await sb.from("orders").update({ status: updates.status }).eq("id", String(id));
  return error ? null : true;
};

window.adminDeleteOrder = async function (id) {
  if (!requireAdmin()) return null;
  const { error } = await sb.from("orders").delete().eq("id", String(id));
  return error ? null : true;
};

/* ── admin: artworks ─────────────────────────────────────────────────── */
function artRow(d) {
  const row = {};
  if (d.title !== undefined) row.title = cleanText(d.title, MAX_TEXT.title) || "Untitled";
  if (d.priceNum !== undefined || d.price !== undefined) {
    row.price_kes = Math.max(0, Math.floor(Number(d.priceNum ?? parseInt(d.price, 10)) || 0));
  }
  if (d.desc !== undefined) row.description = cleanText(d.desc, MAX_TEXT.desc);
  if (d.image !== undefined) row.image_url = cleanText(d.image, 500) || "assets/brand/cover.jpg";
  if (d.dimensions !== undefined) row.dimensions = cleanText(d.dimensions, 80);
  if (d.status !== undefined) row.status = ["available", "featured", "sold"].includes(d.status) ? d.status : "available";
  return row;
}

window.adminAddArtwork = async function (data) {
  if (!requireAdmin()) return null;
  const row = { ...artRow({ title: "Untitled", priceNum: 0, image: "assets/brand/cover.jpg", desc: "", status: "available", ...(data || {}) }),
                id: crypto.randomUUID() };
  const { error } = await sb.from("artworks").insert(row);
  if (error) { toast("❌ Could not add artwork: " + error.message); return null; }
  await loadArtworks();
  return { id: row.id };
};

window.adminUpdateArtwork = async function (id, updates) {
  if (!requireAdmin()) return null;
  const { error } = await sb.from("artworks")
    .update({ ...artRow(updates || {}), updated_at: new Date().toISOString() })
    .eq("id", String(id));
  await loadArtworks();
  return error ? null : true;
};

window.adminDeleteArtwork = async function (id) {
  if (!requireAdmin()) return null;
  const { error } = await sb.from("artworks").update({ deleted_at: new Date().toISOString() }).eq("id", String(id));
  await loadArtworks();
  return error ? null : true;
};

window.adminRestoreArtwork = async function (id) {
  if (!requireAdmin()) return null;
  const { error } = await sb.from("artworks").update({ deleted_at: null }).eq("id", String(id));
  await loadArtworks();
  return error ? null : true;
};

window.fetchDeletedArtworks = async function () {
  if (!requireAdmin()) return [];
  const { data, error } = await sb.from("artworks").select("*").not("deleted_at", "is", null);
  return error ? [] : (data || []).map(mapArt);
};

/* ── pictures ────────────────────────────────────────────────────────── */
window.uploadArtworkImage = async function (file, onProgress, onComplete, onError) {
  if (!file || !/^image\//.test(file.type || "")) { onError?.(new Error("Only image files can be uploaded")); return; }
  if (file.size > 10 * 1024 * 1024) { onError?.(new Error("Image must be smaller than 10 MB")); return; }
  if (!requireAdmin()) { onError?.(new Error("Admin role required")); return; }
  const safe = String(file.name || "upload").replace(/[^\w.\-]/g, "_").slice(-80);
  const path = `uploads/${Date.now()}_${safe}`;
  onProgress?.(10);
  const { error } = await sb.storage.from("artworks").upload(path, file, { contentType: file.type, upsert: false });
  if (error) { onError?.(error); return; }
  onProgress?.(100);
  onComplete?.(sb.storage.from("artworks").getPublicUrl(path).data.publicUrl);
};

/* ── dashboard reads and users ───────────────────────────────────────── */
window.fetchDashboardStats = async function () {
  const empty = { totalOrders: 0, pending: 0, complete: 0, totalLikes: 0, revenue: 0 };
  if (!window._firebaseAdmin) return empty;
  const [o, l] = await Promise.all([
    sb.from("orders").select("status,total_kes").limit(1000),
    sb.from("likes").select("*", { count: "exact", head: true })
  ]);
  if (o.error) return empty;
  const orders = o.data || [];
  return {
    totalOrders: orders.length,
    pending: orders.filter((x) => x.status === "pending").length,
    complete: orders.filter((x) => x.status === "completed").length,
    totalLikes: l.count || 0,
    revenue: orders.filter((x) => x.status === "completed").reduce((s, x) => s + (Number(x.total_kes) || 0), 0)
  };
};

window.fetchUsers = async function () {
  if (!window._firebaseAdmin) return [];
  const { data, error } = await sb.from("profiles").select("id,email,role").order("email").limit(500);
  return error ? [] : (data || []);
};

window.adminUpdateUser = async function (uid, updates) {
  if (!window._firebaseAdmin) return null;
  if (window._currentRole !== "crown") { toast("⛔ Crown role required to manage users."); return null; }
  const role = ROLE_ORDER.includes(updates && updates.role) ? updates.role : null;
  if (!role) return null;
  if (String(uid) === String(window._currentUser && window._currentUser.uid) && role !== "crown") {
    toast("⛔ You cannot demote your own crown account.");
    return null;
  }
  const { error } = await sb.from("profiles").update({ role }).eq("id", String(uid));
  return error ? null : true;
};

/* ── studio (films and archive) ──────────────────────────────────────── */
function mapVideo(r) {
  return { id: r.id, youtube: r.youtube_id, title: r.title, description: r.description,
           tags: r.tags || [], timestamp: r.timestamp_label, createdAt: when(r.created_at) };
}
function mapArchive(r) {
  return { id: r.id, image: r.image_url, title: r.title, medium: r.medium, year: "",
           description: r.description, createdAt: when(r.created_at) };
}

window.sbStudioSubscribe = function (onChange) {
  const load = async () => {
    const [v, a] = await Promise.all([
      sb.from("studio_videos").select("*").order("created_at", { ascending: false }).limit(200),
      sb.from("studio_archive").select("*").order("created_at", { ascending: false }).limit(200)
    ]);
    onChange({ videos: (v.data || []).map(mapVideo), archive: (a.data || []).map(mapArchive) });
  };
  load();
  sb.channel("studio-pub")
    .on("postgres_changes", { event: "*", schema: "public", table: "studio_videos" }, load)
    .on("postgres_changes", { event: "*", schema: "public", table: "studio_archive" }, load)
    .subscribe();
};

window.sbStudioAdd = async function (kind, f) {
  if (!window._firebaseAdmin) return false;
  if (kind === "video") {
    const { error } = await sb.from("studio_videos").insert({
      id: crypto.randomUUID(), youtube_id: f.youtube, title: f.title,
      description: f.description, tags: f.tags, timestamp_label: f.timestamp
    });
    return !error;
  }
  const { error } = await sb.from("studio_archive").insert({
    id: crypto.randomUUID(), image_url: f.image, title: f.title, medium: f.medium,
    description: f.year ? "Year: " + f.year : ""
  });
  return !error;
};

window.sbStudioDelete = async function (kind, id) {
  if (!window._firebaseAdmin) return false;
  const table = kind === "video" ? "studio_videos" : "studio_archive";
  const { error } = await sb.from(table).delete().eq("id", String(id));
  return !error;
};

/* ── site settings (footer, contact, theme, layout) ──────────────────── */
window.sbSiteConfigSubscribe = function (onChange) {
  const load = async () => {
    const { data } = await sb.from("site_config").select("data").eq("id", "main").maybeSingle();
    onChange(data ? data.data : null);
  };
  load();
  sb.channel("cfg-pub")
    .on("postgres_changes", { event: "*", schema: "public", table: "site_config" }, load)
    .subscribe();
};

window.sbSiteConfigSave = async function (obj) {
  if (!window._firebaseAdmin) return false;
  const { error } = await sb.from("site_config")
    .upsert({ id: "main", data: obj, updated_at: new Date().toISOString() });
  return !error;
};

/* ── start the public live feeds ─────────────────────────────────────── */
window.startArtworksSync();
window.startLikesSync();
console.log("Supabase -- database ✅ auth ✅ storage ✅ realtime ✅");
