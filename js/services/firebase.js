/* ═══════════════════════════════════════════════════════════════════════
   firebase.js — Auth, Firestore, Storage, RBAC, real-time bridges
   ───────────────────────────────────────────────────────────────────────
   SECURITY MODEL
   • The ONLY thing that grants admin privileges is a verified Firebase
     session whose `users/{uid}.role` in Firestore is admin or crown.
     Firestore security rules (firestore.rules) are the real gate — this
     module merely mirrors that decision for the UI.
   • Nothing here trusts localStorage. A local "console PIN" is a device
     screen-lock, never a permission.
   • Everything written to Firestore is validated/trimmed client-side so
     the rules and the UI agree on shape.
   ═══════════════════════════════════════════════════════════════════════ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc, getDoc, getDocs,
  collection, addDoc, query, where, orderBy, limit,
  updateDoc, deleteDoc, setDoc,
  onSnapshot,
  serverTimestamp,
  increment
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage, ref,
  uploadBytesResumable, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

/* A Firebase web config is public by design (it identifies the project, it
   does not authorise anything). Access control lives in firestore.rules and
   storage.rules. */
const firebaseConfig = {
  apiKey:            "AIzaSyD3EHTs5MJO1614T6VfDZF31CANhAMzQbw",
  authDomain:        "artislife-44968.firebaseapp.com",
  projectId:         "artislife-44968",
  storageBucket:     "artislife-44968.firebasestorage.app",
  messagingSenderId: "634431592292",
  appId:             "1:634431592292:web:7e88d54be7291310f74c71",
  measurementId:     "G-G0NN8SHKMR"
};

const app = initializeApp(firebaseConfig);

/* Analytics is optional polish — never let an ad-blocker or an unsupported
   browser take the whole module down with an unhandled exception. */
try {
  getAnalytics(app);
} catch (err) {
  console.warn("Analytics unavailable:", err && err.message);
}

const auth    = getAuth(app);
const db      = getFirestore(app);
let storage   = null;
try {
  storage = getStorage(app);
} catch (err) {
  console.warn("Firebase Storage unavailable:", err && err.message);
}

const ROLE_HIERARCHY = { crown: 4, admin: 3, editor: 2, viewer: 1 };
const ADMIN_ROLES    = ["admin", "crown"];
const MAX_TEXT       = { title: 140, desc: 2000, comment: 1000, name: 80, phone: 24, address: 240 };

/* ── small helpers ───────────────────────────────────────────────────── */

/** Coerce to a trimmed, single-line, length-capped string. */
function cleanText(value, max) {
  return String(value == null ? "" : value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim()
    .slice(0, max);
}

function normaliseRole(raw) {
  const role = String(raw == null ? "" : raw).trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(ROLE_HIERARCHY, role) ? role : null;
}

function hasPermission(userRole, requiredRole) {
  if (!userRole || !requiredRole) return false;
  return (ROLE_HIERARCHY[userRole] || 0) >= (ROLE_HIERARCHY[requiredRole] || 999);
}

function isAdminRole(role) {
  return ADMIN_ROLES.includes(role);
}

/* ── role lookup ─────────────────────────────────────────────────────── */

/**
 * Read users/{uid}.role.
 * @returns {{role: string|null, error: string|null, rawRole?: string, message?: string}}
 */
async function fetchUserRole(uid) {
  if (!uid) return { role: null, error: "no_uid" };
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) {
      console.warn("No Firestore role document for this account.");
      return { role: null, error: "no_doc", uid };
    }
    const role = normaliseRole(snap.data().role);
    if (!role) {
      console.warn("Unknown role value on users/" + uid);
      return { role: null, error: "invalid_role", rawRole: snap.data().role };
    }
    return { role, error: null };
  } catch (err) {
    console.error("Role fetch error:", err && err.message);
    return { role: null, error: "fetch_error", message: err && err.message };
  }
}

/* ── shared state (read by app.js / console.js / studio.js) ───────────── */

window._authReady     = false;
window._currentUser   = null;
window._currentRole   = null;
window._firebaseAdmin = false;
window._db            = db;
window._auth          = auth;
window._storage       = storage;
window._artworksUnsubscribe = null;
window._firestoreArtworks   = [];
window._firestoreLikeCounts = {};

/* ── REAL-TIME ARTWORKS SYNC (public read) ───────────────────────────── */

window.startArtworksSync = function () {
  if (window._artworksUnsubscribe) return;

  window._artworksUnsubscribe = onSnapshot(
    query(collection(db, "artworks"), orderBy("createdAt", "desc")),
    (snap) => {
      const firestoreArts = snap.docs.map((d) => {
        try {
          const data = d.data();
          // Soft-deleted pieces stay in Firestore for recovery but must not
          // reappear in the public gallery.
          if (data.deleted === true) return null;
          const priceNum = parseInt(data.priceNum || data.price, 10) || 0;
          // Coerce every field: legacy documents may hold non-string values
          // and a single bad document must not break the whole gallery.
          return {
            id: String(d.id),
            title: String(data.title || "Untitled").slice(0, 140),
            price: String(data.price || `${priceNum} KES`).slice(0, 32),
            priceNum,
            image: String(data.image || "").trim().slice(0, 500) || "assets/brand/cover.jpg",
            desc: String(data.desc || data.description || "").slice(0, 2000),
            likes: Number(data.likeCount ?? data.likes) || 0,
            status: ["available", "featured", "sold"].includes(data.status) ? data.status : "available"
          };
        } catch (docErr) {
          console.warn("Skipping malformed Firestore artwork document:", d.id);
          return null;
        }
      }).filter(Boolean);

      window._firestoreArtworks = firestoreArts;
      window.dispatchEvent(new Event("artworks_updated"));
    },
    (err) => {
      console.warn("Artworks sync error (using local data):", err && err.message);
    }
  );
};

/* ── REAL-TIME LIKE-COUNT SYNC ──────────────────────────────────────────
   Reads only the small likes collection. Bounded so a flood of likes can
   never turn into an unbounded realtime listener.                       */

window.startLikesSync = function () {
  onSnapshot(
    query(collection(db, "likes"), limit(5000)),
    (snap) => {
      const likeCounts = Object.create(null);
      snap.docs.forEach((d) => {
        const artId = d.data().artworkId;
        if (artId && typeof artId === "string") likeCounts[artId] = (likeCounts[artId] || 0) + 1;
      });
      window._firestoreLikeCounts = likeCounts;
      window.dispatchEvent(new Event("likes_updated"));
    },
    (err) => {
      console.warn("Likes sync error (counts stay local):", err && err.message);
    }
  );
};

/* ── REAL-TIME ORDERS BRIDGE (admin only; rules enforce the gate) ─────── */

window._ordersSnapFn = function (callback) {
  return onSnapshot(
    query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(100)),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => { console.warn("Orders snapshot error:", err && err.message); }
  );
};

/* ── REAL-TIME COMMENTS (per artwork) ─────────────────────────────────── */

window.startCommentsSync = function (artworkId, callback) {
  const safeId = cleanText(artworkId, 64);
  if (!safeId) {
    callback([]);
    return () => {};
  }
  try {
    return onSnapshot(
      query(
        collection(db, "comments"),
        where("artworkId", "==", safeId),
        orderBy("createdAt", "asc"),
        limit(200)
      ),
      (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => {
        console.warn("Comments sync error:", err && err.message);
        callback([]);
      }
    );
  } catch (err) {
    console.error("Comments sync setup error:", err && err.message);
    callback([]);
    return () => {};
  }
};

/* ── AUTH STATE — the single source of truth for privileges ───────────── */

function publishAuthState() {
  window._authReady = true;
  window.dispatchEvent(new Event("auth_ready"));
}

onAuthStateChanged(auth, async (user) => {
  window._authReady = false;

  if (user) {
    const result = await fetchUserRole(user.uid);
    window._currentUser   = user;
    window._currentRole   = result.role;
    window._firebaseAdmin = isAdminRole(result.role);
    if (window._firebaseAdmin) {
      console.log("Admin session active. Role:", result.role);
    } else {
      console.warn("Signed in without an admin role:", result.error || result.role);
    }
  } else {
    window._currentUser = null;
    window._currentRole = null;
    window._firebaseAdmin = false;
  }

  publishAuthState();
});

const AUTH_ERRORS = {
  "auth/user-not-found":     "No account with this email.",
  "auth/wrong-password":     "Incorrect password.",
  "auth/invalid-email":      "That email address is not valid.",
  "auth/too-many-requests":  "Too many attempts. Please wait a few minutes.",
  "auth/invalid-credential": "Invalid email or password.",
  "auth/user-disabled":      "This account has been disabled.",
  "auth/network-request-failed": "Network error — check your connection."
};

/**
 * Sign in and verify the Firestore role in one step.
 * Resolves to { success, role?, error? }. Never throws.
 */
window.firebaseAdminLogin = async function (email, password) {
  const cleanEmail = cleanText(email, 254);
  if (!cleanEmail || typeof password !== "string" || !password) {
    return { success: false, error: "Enter your admin email and password." };
  }

  try {
    const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
    const uid = cred.user.uid;

    // Authoritative role check for THIS uid (don't trust stale globals).
    const result = await fetchUserRole(uid);

    if (!isAdminRole(result.role)) {
      let diagMsg;
      if (result.error === "no_doc") {
        diagMsg = "This account has no role record. Ask the site owner to create " +
                  "Firestore → users → " + uid + " with field role = crown.";
      } else if (result.error === "invalid_role") {
        diagMsg = 'The role "' + cleanText(result.rawRole, 32) +
                  '" does not grant admin access. Requires admin or crown.';
      } else if (result.error === "fetch_error") {
        diagMsg = "Could not verify your role (" + cleanText(result.message, 120) +
                  "). Check that firestore.rules is deployed.";
      } else {
        diagMsg = 'The role "' + cleanText(result.role, 32) +
                  '" does not have admin access. Requires admin or crown.';
      }
      await signOut(auth);
      return { success: false, error: diagMsg, uid };
    }

    // Commit immediately so callers don't race the auth listener.
    window._currentUser   = cred.user;
    window._currentRole   = result.role;
    window._firebaseAdmin = true;
    publishAuthState();

    return { success: true, role: result.role };
  } catch (err) {
    const code = err && err.code;
    return { success: false, error: AUTH_ERRORS[code] || "Sign-in failed. Please try again." };
  }
};

window.firebaseResetPassword = async function (email) {
  const cleanEmail = cleanText(email, 254);
  if (!cleanEmail) return { success: false, error: "Enter your email address." };
  try {
    await sendPasswordResetEmail(auth, cleanEmail);
    return { success: true };
  } catch (err) {
    return { success: false, error: AUTH_ERRORS[err && err.code] || "Could not send the reset email." };
  }
};

window.firebaseAdminLogout = async function () {
  try {
    await signOut(auth);
  } catch (err) {
    console.warn("Sign-out error:", err && err.message);
  }
  window._currentUser   = null;
  window._currentRole   = null;
  window._firebaseAdmin = false;
  publishAuthState();
  if (typeof window.showToast === "function") window.showToast("👋 Signed out");
};

/* ── ORDERS ──────────────────────────────────────────────────────────── */

window.saveOrderToFirestore = async function (orderData) {
  try {
    const src      = orderData || {};
    const customer = src.customerInfo || {};
    const items    = Array.isArray(src.items) ? src.items.slice(0, 50) : [];
    const channel  = ["wa", "email", "sms"].includes(src.channel) ? src.channel : "wa";
    const total    = Math.max(0, Math.floor(Number(src.totalPrice) || 0));

    const order = {
      customerInfo: {
        name:    cleanText(customer.name, MAX_TEXT.name),
        address: cleanText(customer.address, MAX_TEXT.address),
        phone:   cleanText(customer.phone, MAX_TEXT.phone)
      },
      // Store only the fields we need — never arbitrary client objects.
      items: items.map((it) => ({
        id:       cleanText(it && it.id, 64),
        title:    cleanText(it && it.title, MAX_TEXT.title),
        price:    cleanText(it && it.price, 32),
        priceNum: Math.max(0, Math.floor(Number(it && it.priceNum) || 0)),
        qty:      Math.min(99, Math.max(1, Math.floor(Number(it && it.qty) || 1)))
      })),
      totalPrice: total,
      channel,
      status: "pending",
      createdAt: serverTimestamp()
    };

    if (!order.customerInfo.name || !order.customerInfo.address || !order.items.length) {
      throw new Error("Order is missing required fields");
    }

    await addDoc(collection(db, "orders"), order);
    return true;
  } catch (err) {
    console.error("Order save error:", err && err.message);
    if (typeof window.showToast === "function") window.showToast("❌ Could not save the order. Please send it via WhatsApp instead.");
    return false;
  }
};

/* ── LIKES ───────────────────────────────────────────────────────────── */

/* Signed-in only: the rules reject anonymous writes, so don't attempt them.
   Visitors still get local likes from app.js.                              */
window.toggleLikeFirestore = async function (artworkId) {
  const user = auth.currentUser;
  if (!user) return null;

  const artId = cleanText(artworkId, 64);
  if (!artId || !/^[\w:-]+$/.test(artId)) return null;

  const likeRef = doc(db, "likes", `${user.uid}_${artId}`);

  try {
    const snap = await getDoc(likeRef);

    if (snap.exists()) {
      await deleteDoc(likeRef);
      try {
        await updateDoc(doc(db, "artworks", artId), { likeCount: increment(-1) });
      } catch (_) { /* artwork may not exist (e.g. the story) */ }
      return "unliked";
    }

    await setDoc(likeRef, {
      userId: user.uid,
      artworkId: artId,
      createdAt: serverTimestamp()
    });
    try {
      await updateDoc(doc(db, "artworks", artId), { likeCount: increment(1) });
    } catch (_) { /* artwork may not exist (e.g. the story) */ }
    return "liked";
  } catch (err) {
    console.warn("Like toggle error:", err && err.message);
    return null;
  }
};

/* ── COMMENTS ────────────────────────────────────────────────────────── */

window.saveCommentFirestore = async function (artworkId, text) {
  const artId = cleanText(artworkId, 64);
  const body  = String(text == null ? "" : text).trim();

  if (!artId || body.length < 2) return false;
  if (body.length > MAX_TEXT.comment) {
    if (typeof window.showToast === "function") window.showToast("⚠️ Comment is too long (max 1000 characters)");
    return false;
  }

  const user = auth.currentUser;
  try {
    await addDoc(collection(db, "comments"), {
      artworkId: artId,
      text: body,
      author: user ? cleanText((user.email || "").split("@")[0], 40) || "Visitor" : "Visitor",
      createdAt: serverTimestamp()
    });
    return true;
  } catch (err) {
    console.error("Comment save failed:", err && err.message);
    return false;
  }
};

/* ── STORAGE UPLOAD ──────────────────────────────────────────────────── */

window.uploadArtworkImage = function (file, onProgress, onComplete, onError) {
  if (!storage) { onError?.(new Error("Storage is not available")); return; }
  if (!file || !/^image\//.test(file.type || "")) {
    onError?.(new Error("Only image files can be uploaded"));
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    onError?.(new Error("Image must be smaller than 10 MB"));
    return;
  }

  const safeName = String(file.name || "upload").replace(/[^\w.\-]/g, "_").slice(-80);
  const storageRef = ref(storage, `artworks/${Date.now()}_${safeName}`);
  const task = uploadBytesResumable(storageRef, file, { contentType: file.type });

  task.on("state_changed",
    (s) => onProgress?.(Math.round((s.bytesTransferred / s.totalBytes) * 100)),
    (e) => { console.error("Upload error:", e && e.message); onError?.(e); },
    async () => onComplete?.(await getDownloadURL(task.snapshot.ref))
  );
};

/* ── ADMIN-GATED WRITES (rules are the real gate) ─────────────────────── */

function requireAdmin() {
  if (!window._firebaseAdmin) {
    if (typeof window.showToast === "function") window.showToast("⛔ Admin role required.");
    return false;
  }
  return true;
}

function artworkPayload(data) {
  const d = data || {};
  return {
    title:      cleanText(d.title, MAX_TEXT.title) || "Untitled",
    price:      cleanText(d.price, 32) || "0 KES",
    priceNum:   Math.max(0, Math.floor(Number(d.priceNum) || 0)),
    image:      cleanText(d.image, 500) || "assets/brand/cover.jpg",
    desc:       cleanText(d.desc, MAX_TEXT.desc),
    status:     ["available", "featured", "sold"].includes(d.status) ? d.status : "available",
    dimensions: cleanText(d.dimensions, 60)
  };
}

window.adminAddArtwork = async (data) => {
  if (!requireAdmin()) return null;
  return addDoc(collection(db, "artworks"), { ...artworkPayload(data), createdAt: serverTimestamp() });
};

window.adminUpdateArtwork = async (id, updates) => {
  if (!requireAdmin()) return null;
  return updateDoc(doc(db, "artworks", String(id)), updates || {});
};

window.adminDeleteArtwork = async (id) => {
  if (!requireAdmin()) return null;
  return updateDoc(doc(db, "artworks", String(id)), { deleted: true, deletedAt: serverTimestamp() });
};

window.adminRestoreArtwork = async (id) => {
  if (!requireAdmin()) return null;
  return updateDoc(doc(db, "artworks", String(id)), { deleted: false, deletedAt: null });
};

window.fetchDeletedArtworks = async () => {
  if (!requireAdmin()) return [];
  try {
    const snap = await getDocs(collection(db, "artworks"));
    return snap.docs.filter((d) => d.data().deleted === true).map((d) => ({ id: d.id, ...d.data() }));
  } catch (_) { return []; }
};

window.adminUpdateOrder = async (id, updates) => {
  if (!requireAdmin()) return null;
  const allowed = {};
  if (updates && ["pending", "completed", "cancelled"].includes(updates.status)) allowed.status = updates.status;
  if (!Object.keys(allowed).length) return null;
  return updateDoc(doc(db, "orders", String(id)), allowed);
};

window.adminDeleteOrder = async (id) => {
  if (!requireAdmin()) return null;
  return deleteDoc(doc(db, "orders", String(id)));
};

/* ── DASHBOARD READS ─────────────────────────────────────────────────── */

window.fetchDashboardStats = async function () {
  const empty = { totalOrders: 0, pending: 0, complete: 0, totalLikes: 0, revenue: 0 };
  if (!window._firebaseAdmin) return empty;
  try {
    const [ordersSnap, likesSnap] = await Promise.all([
      getDocs(query(collection(db, "orders"), limit(1000))),
      getDocs(query(collection(db, "likes"), limit(5000)))
    ]);

    const orders = ordersSnap.docs.map((d) => d.data());
    const pending  = orders.filter((o) => o.status === "pending").length;
    const complete = orders.filter((o) => o.status === "completed").length;
    const revenue  = orders
      .filter((o) => o.status === "completed")
      .reduce((sum, o) => sum + (Number(o.totalPrice) || 0), 0);

    return { totalOrders: orders.length, pending, complete, totalLikes: likesSnap.size, revenue };
  } catch (err) {
    console.error("Stats error:", err && err.message);
    return empty;
  }
};

window.fetchOrders = async function () {
  if (!window._firebaseAdmin) return [];
  try {
    const snap = await getDocs(query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(50)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (_) { return []; }
};

window.fetchUsers = async function () {
  if (!window._firebaseAdmin) return [];
  try {
    const snap = await getDocs(query(collection(db, "users"), limit(500)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (_) { return []; }
};

window.adminUpdateUser = async function (uid, updates) {
  if (!window._firebaseAdmin) return null;
  if (window._currentRole !== "crown") {
    if (typeof window.showToast === "function") window.showToast("⛔ Crown role required to manage users.");
    return null;
  }
  const role = normaliseRole(updates && updates.role);
  if (!role) return null;
  if (String(uid) === String(window._currentUser && window._currentUser.uid) && role !== "crown") {
    if (typeof window.showToast === "function") window.showToast("⛔ You cannot demote your own crown account.");
    return null;
  }
  return updateDoc(doc(db, "users", String(uid)), { role });
};

window.fetchArtworkLikesCounts = async function () {
  try {
    const snap = await getDocs(query(collection(db, "artworks"), limit(1000)));
    const counts = {};
    snap.docs.forEach((d) => {
      const n = Number(d.data().likeCount) || 0;
      if (n) counts[d.id] = n;
    });
    return counts;
  } catch (_) { return {}; }
};

/* ── boot ────────────────────────────────────────────────────────────── */

window.startArtworksSync();
window.startLikesSync();

console.log("🔥 Firebase — Auth ✅ Firestore ✅ RBAC ✅ Real-time ✅");
