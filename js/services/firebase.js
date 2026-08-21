
  import { initializeApp }   from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

  import { getAnalytics }    from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";

  import {

    getAuth,

    signInWithEmailAndPassword,

    signOut,

    onAuthStateChanged

  } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

  import {

    getFirestore,

    doc, getDoc, getDocs,

    collection, addDoc, query, orderBy, limit, where,

    updateDoc, deleteDoc, setDoc,

    onSnapshot,

    serverTimestamp,

    increment

  } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

  import {

    getStorage, ref,

    uploadBytesResumable, getDownloadURL

  } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

  const firebaseConfig = {

    apiKey:            "AIzaSyD3EHTs5MJO1614T6VfDZF31CANhAMzQbw",

    authDomain:        "artislife-44968.firebaseapp.com",

    projectId:         "artislife-44968",

    storageBucket:     "artislife-44968.firebasestorage.app",

    messagingSenderId: "634431592292",

    appId:             "1:634431592292:web:7e88d54be7291310f74c71",

    measurementId:     "G-G0NN8SHKMR"

  };

  const app     = initializeApp(firebaseConfig);

  getAnalytics(app);

  const auth    = getAuth(app);

  const db      = getFirestore(app);

  const storage = getStorage(app);

  const ROLE_HIERARCHY = { crown:4, admin:3, editor:2, viewer:1 };

  async function fetchUserRole(uid) {

    try {

      const snap = await getDoc(doc(db, "users", uid));

      if (!snap.exists()) {

        console.warn(`⛔ No Firestore doc for UID: ${uid}`);

        return { role: null, error: 'no_doc', uid };

      }

      const raw = (snap.data().role || "").toLowerCase().trim();

      if (!ROLE_HIERARCHY[raw]) {

        console.warn(`⛔ Unknown role: "${snap.data().role}"`);

        return { role: null, error: 'invalid_role', rawRole: snap.data().role };

      }

      return { role: raw, error: null };

    } catch(e) {

      console.error("Role fetch error:", e);

      return { role: null, error: 'fetch_error', message: e.message };

    }

  }

  function hasPermission(userRole, requiredRole) {

    if (!userRole || !requiredRole) return false;

    return (ROLE_HIERARCHY[userRole]||0) >= (ROLE_HIERARCHY[requiredRole]||999);

  }

  window._authReady     = false;

  window._currentUser   = null;

  window._currentRole   = null;

  window._firebaseAdmin = false;

  window._db            = db;

  window._auth          = auth;

  window._storage       = storage;

  // ── REAL-TIME ARTWORKS SYNC ──

  // 🔧 FIRESTORE SECURITY RULES (SERVER-SIDE ENFORCEMENT)
  // IMPLEMENT THE FOLLOWING IN FIRESTORE CONSOLE:
  /*
    rules_version = '2';
    service cloud.firestore {
      match /databases/{database}/documents {
        
        // ✅ ARTWORKS: Admin/Crown only can modify
        match /artworks/{artworkId} {
          allow read: if true;
          allow create, update, delete: if hasRole(['admin', 'crown']);
        }
        
        // ✅ ORDERS: Admin/Crown can manage
        match /orders/{orderId} {
          allow read: if request.auth != null && hasRole(['admin', 'crown']);
          allow create: if true;
          allow update, delete: if hasRole(['admin', 'crown']);
        }
        
        // ✅ LIKES: Users can create 1 per artwork; public read
        match /likes/{likeId} {
          allow read: if true;
          allow create: if request.auth != null || request.resource.data.userId != null;
          allow delete: if request.auth != null && request.auth.uid == resource.data.userId;
        }
        
        // ✅ COMMENTS: Public read/create; admin can manage
        match /comments/{commentId} {
          allow read: if true;
          allow create: if true;
          allow update, delete: if hasRole(['admin', 'crown']);
        }
        
        // ✅ USERS: Admin/Crown only
        match /users/{userId} {
          allow read, write: if hasRole(['admin', 'crown']);
        }
        
        // Helper function
        function hasRole(roles) {
          return request.auth != null && 
                 get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in roles;
        }
      }
    }
  */

  window._artworksUnsubscribe = null;

  window.startArtworksSync = function() {

    if (window._artworksUnsubscribe) return;

    console.log("🔄 Starting real-time artworks sync...");

    window._artworksUnsubscribe = onSnapshot(

      query(collection(db, "artworks"), orderBy("createdAt", "desc")),

      (snap) => {

        const firestoreArts = snap.docs.map(d => {

          try {

            const data = d.data();

            const priceNum = parseInt(data.priceNum || data.price) || 0;

            return {

              id: d.id,

              title: data.title || 'Untitled',

              price: data.price || `${priceNum} KES`,

              priceNum,

              image: (data.image && data.image.trim() !== '' && data.image.trim() !== 'assets/brand/cover.jpg') ? data.image.trim() : 'assets/brand/cover.jpg',

              desc: data.desc || data.description || '',

              likes: data.likes || 0,

              status: data.status || 'available'

            };

          } catch(docErr) {

            console.warn(`⚠️ Skipping malformed Firestore doc ${d.id}:`, docErr);

            return null;

          }

        }).filter(Boolean);

        window._firestoreArtworks = firestoreArts;

        window.dispatchEvent(new Event("artworks_updated"));

        console.log(`✅ Artworks synced: ${firestoreArts.length} Firestore items`);

      },

      (err) => {

        console.warn("Artworks sync error (using local data):", err.message);

      }

    );

  };

  // ── REAL-TIME LIKES COUNT SYNC ──

  window.startLikesSync = function() {

    onSnapshot(collection(db, "likes"), (snap) => {

      const likeCounts = {};

      snap.docs.forEach(d => {

        const artId = d.data().artworkId;

        if (artId) likeCounts[artId] = (likeCounts[artId] || 0) + 1;

      });

      window._firestoreLikeCounts = likeCounts;

      window.dispatchEvent(new Event("likes_updated"));

    });

  };

  // ── REAL-TIME ORDERS SNAP BRIDGE ──

  window._ordersSnapFn = function(callback) {

    return onSnapshot(

      query(collection(db, "orders"), orderBy("createdAt", "desc")),

      (snap) => {

        const orders = snap.docs.map(d => ({id: d.id, ...d.data()}));

        callback(orders);

      },

      (err) => { console.warn("Orders snap error:", err.message); }

    );

  };

  // ── REAL-TIME COMMENTS SYNC ──

  // 🔧 COMMENTS QUERY FIX START - Filter by artworkId in Firestore query instead of client-side
  window.startCommentsSync = function(artworkId, callback) {

    try {

      return onSnapshot(

        query(

          collection(db, "comments"),

          where("artworkId", "==", artworkId),

          orderBy("createdAt", "asc")

        ),

        (snap) => {

          const comments = snap.docs.map(d => ({id: d.id, ...d.data()}));

          callback(comments);

          console.log(`📝 Comments loaded for artwork ${artworkId}: ${comments.length} items`);

        },

        (err) => {

          console.error(`⚠️ Comments sync error for ${artworkId}:`, err.message);

          callback([]);

        }

      );

    } catch(e) {

      console.error("Comments sync setup error:", e);

      callback([]);

    }

  };
  // 🔧 COMMENTS QUERY FIX END

  onAuthStateChanged(auth, async (user) => {

    window._authReady = false;

    if (user) {

      const result = await fetchUserRole(user.uid);

      const role = result.role;

      window._currentUser   = user;

      window._currentRole   = role;

      window._firebaseAdmin = hasPermission(role, "admin");

      if (window._firebaseAdmin) console.log(`✅ Admin: ${user.email} | Role: ${role}`);

      else console.warn(`⛔ Role check failed:`, result);

    } else {

      window._currentUser = window._currentRole = null;

      window._firebaseAdmin = false;

    }

    window._authReady = true;

    window.dispatchEvent(new Event("auth_ready"));

  });

  window.firebaseAdminLogin = async function(email, password) {

    try {

      const cred = await signInWithEmailAndPassword(auth, email, password);

      const uid  = cred.user.uid;

      if (!window._authReady) {

        await new Promise(res => {

          const h = () => { window.removeEventListener("auth_ready", h); res(); };

          window.addEventListener("auth_ready", h);

        });

      }

      const role = window._currentRole;

      if (!hasPermission(role, "admin")) {

        let diagMsg = '';

        try {

          const snap = await getDoc(doc(db, "users", uid));

          if (!snap.exists()) {

            diagMsg = `No Firestore record found for this account.\n\nTo fix: Go to Firestore → "users" collection → Create document:\n  Document ID: ${uid}\n  Field: role  |  Value: crown`;

          } else {

            const rawRole = snap.data().role;

            if (!rawRole) {

              diagMsg = `Account found but has no "role" field.\n\nTo fix: Edit document "${uid}" in Firestore → add field:\n  role = crown`;

            } else {

              diagMsg = `Role "${rawRole}" does not have admin access.\nRequires: admin or crown. Contact system administrator.`;

            }

          }

        } catch(e) {

          diagMsg = `Could not read role data: ${e.message}`;

        }

        await signOut(auth);

        return { success: false, error: diagMsg, uid };

      }

      return { success: true, role };

    } catch(err) {

      const msgs = {

        "auth/user-not-found":    "No account with this email.",

        "auth/wrong-password":    "Incorrect password.",

        "auth/invalid-email":     "Invalid email address.",

        "auth/too-many-requests": "Too many attempts. Please wait.",

        "auth/invalid-credential":"Invalid email or password."

      };

      return { success: false, error: msgs[err.code] || err.message };

    }

  };

  window.firebaseResetPassword = async function(email) {
    const { sendPasswordResetEmail } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
    return sendPasswordResetEmail(window._auth, email);
  };

  window.firebaseAdminLogout = async function() {

    await signOut(auth);

    window._currentUser = window._currentRole = null;

    window._firebaseAdmin = false;

    if(typeof showToast==='function') showToast('👋 Signed out');

  };

  window.saveOrderToFirestore = async function(orderData) {

    try { await addDoc(collection(db,"orders"), {...orderData, status:"pending", createdAt:serverTimestamp()}); }

    catch(e) { console.error("Order save error:",e); if(typeof showToast==='function') showToast('❌ Order save error: ' + e.message); }

  };

  // ── LIKES — stored per user in Firestore ──

  // 🔧 LIKE SYSTEM SCALING START - Optional per-artwork like count using increment()
  window.toggleLikeFirestore = async function(artworkId) {

    const user = auth.currentUser;

    let anonId = localStorage.getItem("ail_anon_id");

    if (!anonId) { anonId = "anon_" + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem("ail_anon_id", anonId); }

    const likeId = user ? `${user.uid}_${artworkId}` : `${anonId}_${artworkId}`;

    try {

      const likeRef = doc(db, "likes", likeId);

      const snap = await getDoc(likeRef);

      if (snap.exists()) {

        // User already liked — remove like
        await deleteDoc(likeRef);

        // 🔧 OPTIONAL: Decrement artwork like count
        try {
          await updateDoc(doc(db, "artworks", artworkId), {
            likeCount: increment(-1)
          });
          console.log(`➖ Artwork like count decremented for ${artworkId}`);
        } catch(e) {
          console.warn(`⚠️ Could not decrement like count:`, e.message);
        }

        return 'unliked';

      } else {

        // User hasn't liked — add like
        await setDoc(likeRef, { userId: user?.uid || 'anon', artworkId, createdAt: serverTimestamp() });

        // 🔧 OPTIONAL: Increment artwork like count
        try {
          await updateDoc(doc(db, "artworks", artworkId), {
            likeCount: increment(1)
          });
          console.log(`➕ Artwork like count incremented for ${artworkId}`);
        } catch(e) {
          console.warn(`⚠️ Could not increment like count:`, e.message);
        }

        return 'liked';

      }

    } catch(e) {

      console.error("Like toggle error:", e);

      return null;

    }

  };
  // 🔧 LIKE SYSTEM SCALING END

  // ── COMMENTS ──

  window.saveCommentFirestore = async function(artworkId, text) {

    const user = auth.currentUser;

    try {

      // 🔧 ERROR LOGGING ENHANCEMENT START
      console.log(`📝 Attempting to save comment for artwork ${artworkId}...`);

      const docRef = await addDoc(collection(db, "comments"), {

        artworkId,

        text,

        author: user?.email?.split('@')[0] || 'Visitor',

        createdAt: serverTimestamp()

      });

      console.log(`✅ Comment saved successfully:`, docRef.id);
      // 🔧 ERROR LOGGING ENHANCEMENT END

      return true;

    } catch(e) {

      console.error("❌ Comment save failed:", {

        error: e.message,

        code: e.code,

        artworkId,

        timestamp: new Date().toISOString()

      });

      return false;

    }

  };

  window.uploadArtworkImage = function(file, onProgress, onComplete, onError) {

    if (!file || !hasPermission(window._currentRole, "editor")) {
      const error = new Error("An editor role is required to upload artwork.");
      onError?.(error);
      return null;
    }

    const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
    if (!allowedTypes.has(file.type) || file.size > 10 * 1024 * 1024) {
      const error = new Error("Use a JPEG, PNG, or WebP image under 10 MB.");
      onError?.(error);
      return null;
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
    const storageRef = ref(storage, `artworks/${auth.currentUser.uid}/${crypto.randomUUID()}_${safeName}`);

    const task = uploadBytesResumable(storageRef, file, {
      contentType: file.type,
      customMetadata: { uploadedBy: auth.currentUser.uid }
    });

    task.on('state_changed',

      s => onProgress?.(Math.round((s.bytesTransferred/s.totalBytes)*100)),

      e => { console.error("Upload error:",e); onError?.(e); },

      async () => onComplete?.(await getDownloadURL(task.snapshot.ref))

    );

  };

  function requireAdmin() {

    if (!window._firebaseAdmin) { if(typeof showToast==='function') showToast('⛔ Admin role required.'); return false; }

    return true;

  }

  window.adminAddArtwork    = async (data) => { if (!requireAdmin()) return; return await addDoc(collection(db,"artworks"), {...data, createdAt:serverTimestamp()}); };

  window.adminUpdateArtwork = async (id, updates) => { if (!requireAdmin()) return; await updateDoc(doc(db,"artworks",id), updates); };

  window.adminDeleteArtwork = async (id) => { if (!requireAdmin()) return; await updateDoc(doc(db,"artworks",id), {deleted:true, deletedAt:serverTimestamp()}); };

  window.adminRestoreArtwork = async (id) => { if (!requireAdmin()) return; await updateDoc(doc(db,"artworks",id), {deleted:false, deletedAt:null}); };

  window.fetchDeletedArtworks = async () => { try { const s = await getDocs(collection(db,"artworks")); return s.docs.filter(d=>d.data().deleted===true).map(d=>({id:d.id,...d.data()})); } catch(e){return[];} };

  window.adminUpdateOrder   = async (id, updates) => { if (!requireAdmin()) return; await updateDoc(doc(db,"orders",id), updates); };

  window.adminDeleteOrder   = async (id) => { if (!requireAdmin()) return; await deleteDoc(doc(db,"orders",id)); };

  window.fetchDashboardStats = async function() {

    try {

      const [ordersSnap, likesSnap] = await Promise.all([

        getDocs(collection(db,"orders")),

        getDocs(collection(db,"likes"))

      ]);

      const orders = ordersSnap.docs.map(d => ({id:d.id,...d.data()}));

      const pending  = orders.filter(o => o.status === 'pending').length;

      const complete = orders.filter(o => o.status === 'completed').length;

      const revenue  = orders.filter(o=>o.totalPrice).reduce((s,o)=>s+(o.totalPrice||0),0);

      return { totalOrders: orders.length, pending, complete, totalLikes: likesSnap.size, revenue };

    } catch(e) { console.error(e); return { totalOrders:0, pending:0, complete:0, totalLikes:0, revenue:0 }; }

  };

  window.fetchOrders = async function() {

    try {

      const snap = await getDocs(query(collection(db,"orders"), orderBy("createdAt","desc"), limit(50)));

      return snap.docs.map(d => ({id:d.id,...d.data()}));

    } catch(e) { return []; }

  };

  window.fetchUsers = async function() {

    try {

      const snap = await getDocs(collection(db,"users"));

      return snap.docs.map(d => ({id:d.id,...d.data()}));

    } catch(e) { return []; }

  };

  window.adminUpdateUser = async function(uid, updates) {

    if (!requireAdmin()) return;

    await updateDoc(doc(db,"users",uid), updates);

  };

  // ── ARTWORK LIKES COUNT FROM FIRESTORE for dashboard ──

  window.fetchArtworkLikesCounts = async function() {

    try {

      const snap = await getDocs(collection(db, "likes"));

      const counts = {};

      snap.docs.forEach(d => {

        const id = d.data().artworkId;

        if (id) counts[id] = (counts[id] || 0) + 1;

      });

      return counts;

    } catch(e) { return {}; }

  };

  window.getAdminSetupInfo = async function(email, password) {

    try {

      const cred = await signInWithEmailAndPassword(auth, email, password);

      const uid = cred.user.uid;

      await signOut(auth);

      return { uid, email };

    } catch(e) {

      return { error: e.message };

    }

  };

  // Start real-time syncs immediately

  window.startArtworksSync();

  window.startLikesSync();

  console.log("🔥 Firebase — Auth ✅ Firestore ✅ Storage ✅ RBAC ✅ Real-time ✅");

