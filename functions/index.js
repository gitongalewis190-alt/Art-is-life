/* ═══════════════════════════════════════════════════════════════════════
   functions/index.js — Firebase Cloud Functions: M-Pesa STK Push
   ───────────────────────────────────────────────────────────────────────
   Exposes two HTTPS endpoints:
     POST /stkpush   ← called by the Donate button (js/services/daraja.js)
     POST /callback  ← called by Safaricom with the payment result

   ── ONE-TIME SETUP (Firebase approach) ─────────────────────────────────
   1)  cd functions && npm install
   2)  Set secrets (NEVER commit these):
         firebase functions:config:set \
           daraja.consumer_key="YOUR_KEY" \
           daraja.consumer_secret="YOUR_SECRET" \
           daraja.passkey="YOUR_PASSKEY" \
           daraja.shortcode="174379" \
           daraja.env="sandbox"
   3)  firebase deploy --only functions
   4)  Copy the /stkpush URL shown after deploy → paste into Control
       Console → M-Pesa Endpoint field → Publish.

   The deployed URL looks like:
     https://us-central1-artislife-44968.cloudfunctions.net/stkpush
   ── OR use the consolidated Vercel endpoint in /api/mpesa.js (simpler) ──

   SECURITY
   • Secrets only from functions config / environment (Secret Manager).
   • Amount, phone and payload are validated; requests are throttled.
   • /callback only updates a donation document that /stkpush created and
     that is still `pending`, so a forged POST cannot create or rewrite a
     payment record.
   ═══════════════════════════════════════════════════════════════════════ */

const functions = require("firebase-functions");
const admin     = require("firebase-admin");

if (!admin.apps.length) admin.initializeApp();

const BASES = {
  sandbox:    "https://sandbox.safaricom.co.ke",
  production: "https://api.safaricom.co.ke"
};

const PROJECT = process.env.GCLOUD_PROJECT || "artislife-44968";
const REGION  = process.env.FUNCTION_REGION || "us-central1";

const MIN_AMOUNT = 1;
const MAX_AMOUNT = 200000;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX_PER_KEY = 5;
const UPSTREAM_TIMEOUT_MS = 12000;

const DEFAULT_ORIGINS = [
  "https://art-is-life-iota.vercel.app",
  "https://artislife-44968.web.app",
  "https://artislife-44968.firebaseapp.com"
];

/* Read from firebase-functions config OR process.env (Secret Manager) */
function cfg() {
  let fc = {};
  try { fc = functions.config().daraja || {}; } catch (_) { fc = {}; }
  const env = String(process.env.DARAJA_ENV || fc.env || "sandbox").toLowerCase();
  return {
    consumer_key:    process.env.DARAJA_CONSUMER_KEY    || fc.consumer_key    || "",
    consumer_secret: process.env.DARAJA_CONSUMER_SECRET || fc.consumer_secret || "",
    passkey:         process.env.DARAJA_PASSKEY         || fc.passkey         || "",
    shortcode:       process.env.DARAJA_SHORTCODE       || fc.shortcode       || "174379",
    env:             env === "production" ? "production" : "sandbox",
    callback_url:    process.env.DARAJA_CALLBACK_URL    || fc.callback_url    || ""
  };
}

/* ── helpers ─────────────────────────────────────────────────────────── */

function allowedOrigins() {
  const configured = String(process.env.ALLOWED_ORIGINS || "")
    .split(",").map((o) => o.trim()).filter(Boolean);
  return configured.length ? configured : DEFAULT_ORIGINS;
}

function cors(req, res) {
  res.set("Vary", "Origin");
  const origin = req.headers && req.headers.origin;
  if (origin && allowedOrigins().includes(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.set("Access-Control-Max-Age", "600");
  }
  res.set("Cache-Control", "no-store");
  res.set("X-Content-Type-Options", "nosniff");
}

function nowStamp() {
  const d = new Date(), z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}` +
         `${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
}

function normalize(phone) {
  let p = String(phone == null ? "" : phone).replace(/\D/g, "");
  if (p.startsWith("2540")) p = "254" + p.slice(4);
  else if (p.startsWith("0")) p = "254" + p.slice(1);
  else if (p.startsWith("7") || p.startsWith("1")) p = "254" + p;
  return p;
}

function isValidPhone(phone) {
  return /^254[71]\d{8}$/.test(phone);
}

function isValidAmount(amount) {
  return Number.isInteger(amount) && amount >= MIN_AMOUNT && amount <= MAX_AMOUNT;
}

function maskPhone(phone) {
  const p = String(phone || "");
  return p.length >= 6 ? p.slice(0, 6) + "***" + p.slice(-2) : "***";
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function getToken(base, key, secret) {
  const creds = Buffer.from(`${key}:${secret}`).toString("base64");
  const r = await fetchWithTimeout(`${base}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${creds}` }
  });
  if (!r.ok) throw new Error(`OAuth ${r.status}`);
  const j = await r.json().catch(() => ({}));
  if (!j.access_token) throw new Error("No token");
  return j.access_token;
}

/** Ask Daraja what really happened for a CheckoutRequestID. */
async function queryStkStatus(c, checkoutId) {
  const base     = BASES[c.env] || BASES.sandbox;
  const ts       = nowStamp();
  const password = Buffer.from(`${c.shortcode}${c.passkey}${ts}`).toString("base64");
  const token    = await getToken(base, c.consumer_key, c.consumer_secret);
  const r = await fetchWithTimeout(`${base}/mpesa/stkpushquery/v1/query`, {
    method:  "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      BusinessShortCode: c.shortcode,
      Password:          password,
      Timestamp:         ts,
      CheckoutRequestID: checkoutId
    })
  });
  const data = await r.json().catch(() => ({}));
  return data && typeof data === "object" ? data : null;
}

/* Per-instance throttle (best effort — Cloud Functions scale horizontally). */
const rateBuckets = new Map();
function rateLimited(key) {
  const now = Date.now();
  const hits = (rateBuckets.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (hits.length >= RATE_MAX_PER_KEY) { rateBuckets.set(key, hits); return true; }
  hits.push(now);
  rateBuckets.set(key, hits);
  if (rateBuckets.size > 500) {
    for (const [k, v] of rateBuckets) {
      if (!v.some((t) => now - t < RATE_WINDOW_MS)) rateBuckets.delete(k);
    }
  }
  return false;
}

function clientIp(req) {
  // The left-most X-Forwarded-For entry is client-supplied; the last hop is
  // appended by the Google front end and is the only trustworthy value.
  const fwd = req.headers && req.headers["x-forwarded-for"];
  if (typeof fwd !== "string" || !fwd) return "unknown";
  const hops = fwd.split(",").map((h) => h.trim()).filter(Boolean);
  return hops.length ? hops[hops.length - 1] : "unknown";
}

/* ── /stkpush ─────────────────────────────────────────────────────────── */
exports.stkpush = functions.https.onRequest(async (req, res) => {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST")   return res.status(405).json({ error: "POST only" });

  const c = cfg();
  if (!c.consumer_key || !c.consumer_secret || !c.passkey) {
    return res.status(503).json({ error: "Daraja credentials not configured on the server." });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const phone  = normalize(body.phone);
  const amount = Math.floor(Number(body.amount));

  if (!isValidPhone(phone)) return res.status(400).json({ error: "Invalid phone number" });
  if (!isValidAmount(amount)) {
    return res.status(400).json({ error: `Amount must be between ${MIN_AMOUNT} and ${MAX_AMOUNT} KES` });
  }
  // Separate buckets: one caller cannot burn another number's allowance, and
  // rotating phone numbers does not reset the per-IP budget.
  if (rateLimited(`ip:${clientIp(req)}`) || rateLimited(`phone:${phone}`)) {
    return res.status(429).json({ error: "Too many attempts. Please wait a few minutes." });
  }

  try {
    const ts       = nowStamp();
    const base     = BASES[c.env] || BASES.sandbox;
    const password = Buffer.from(`${c.shortcode}${c.passkey}${ts}`).toString("base64");
    const token    = await getToken(base, c.consumer_key, c.consumer_secret);
    const cbUrl    = c.callback_url || `https://${REGION}-${PROJECT}.cloudfunctions.net/callback`;

    const payload = {
      BusinessShortCode: c.shortcode,
      Password:          password,
      Timestamp:         ts,
      TransactionType:   "CustomerPayBillOnline",
      Amount:            amount,
      PartyA:            phone,
      PartyB:            c.shortcode,
      PhoneNumber:       phone,
      CallBackURL:       cbUrl,
      AccountReference:  String(body.accountReference || "Donation").replace(/[^\w .-]/g, "").slice(0, 12) || "Donation",
      TransactionDesc:   String(body.businessName || "Art is Life").replace(/[^\w &'.-]/g, "").slice(0, 13) || "Art is Life"
    };

    const r = await fetchWithTimeout(`${base}/mpesa/stkpush/v1/processrequest`, {
      method:  "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body:    JSON.stringify(payload)
    });
    const data = await r.json().catch(() => ({}));

    if (r.ok && data.ResponseCode === "0" && data.CheckoutRequestID) {
      await admin.firestore().collection("donations").doc(data.CheckoutRequestID).set({
        amount,
        phone,
        status: "pending",
        env: c.env,
        merchantRequestID: data.MerchantRequestID || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log("[stkpush] sent", data.CheckoutRequestID, amount, maskPhone(phone));
      return res.status(200).json({
        ResponseCode: "0",
        ResponseDescription: data.ResponseDescription || "Success",
        CustomerMessage: data.CustomerMessage ||
          "Check your phone — enter your M-Pesa PIN to complete the donation. Thank you!",
        CheckoutRequestID: data.CheckoutRequestID
      });
    }

    console.warn("[stkpush] rejected", r.status);
    return res.status(400).json({
      error: typeof data.errorMessage === "string" && data.errorMessage
        ? data.errorMessage.slice(0, 160)
        : "M-Pesa could not start this payment. Please try again."
    });
  } catch (err) {
    console.error("[stkpush]", err && err.message);
    return res.status(502).json({ error: "Payment initiation failed. Try again." });
  }
});

/* ── /callback — Safaricom posts the payment result here ─────────────── */
exports.callback = functions.https.onRequest(async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ ResultCode: 1, ResultDesc: "POST only" });

  // Server-to-server only: a browser must never be able to forge a receipt.
  if (req.headers && req.headers.origin) {
    console.warn("[callback] rejected browser-originated callback");
    return res.status(403).json({ ResultCode: 1, ResultDesc: "Rejected" });
  }

  try {
    const cb = req.body && req.body.Body && req.body.Body.stkCallback;
    if (!cb || typeof cb !== "object" ||
        typeof cb.CheckoutRequestID !== "string" || !cb.CheckoutRequestID) {
      return res.status(400).json({ ResultCode: 1, ResultDesc: "Malformed callback" });
    }

    const resultCode = Number(cb.ResultCode);
    if (!Number.isFinite(resultCode)) {
      return res.status(400).json({ ResultCode: 1, ResultDesc: "Malformed callback" });
    }

    const donationRef = admin.firestore().collection("donations").doc(cb.CheckoutRequestID.slice(0, 64));
    const donationSnap = await donationRef.get();

    // Only update a donation this backend created and that is still pending.
    if (!donationSnap.exists || donationSnap.get("status") !== "pending") {
      console.warn("[callback] unknown or already-settled checkout id:", cb.CheckoutRequestID);
      return res.status(200).json({ ResultCode: 0, ResultDesc: "Ignored" });
    }

    const items = {};
    const raw = (cb.CallbackMetadata && Array.isArray(cb.CallbackMetadata.Item)) ? cb.CallbackMetadata.Item : [];
    raw.forEach((i) => {
      if (i && typeof i.Name === "string" && i.Name.length <= 40) items[i.Name] = i.Value;
    });

    // Never trust the POST body: a donor who knows their own CheckoutRequestID
    // could otherwise POST a forged success. Re-query Daraja and require the
    // result codes to agree before the donation is marked settled.
    const c = cfg();
    let verified = null;
    if (c.consumer_key && c.consumer_secret && c.passkey) {
      try {
        const status = await queryStkStatus(c, cb.CheckoutRequestID.slice(0, 64));
        if (status && status.ResultCode !== undefined) {
          verified = Number(status.ResultCode) === resultCode;
        }
      } catch (err) {
        console.warn("[callback] verification unavailable:", err && err.message);
      }
    }

    if (verified !== true) {
      console.warn("[callback] unverified result — left pending:", cb.CheckoutRequestID.slice(0, 64));
      return res.status(200).json({ ResultCode: 0, ResultDesc: "Pending verification" });
    }

    const ok = resultCode === 0;
    await donationRef.set({
      status:       ok ? "completed" : "failed",
      resultCode,
      resultDesc:   typeof cb.ResultDesc === "string" ? cb.ResultDesc.slice(0, 200) : "",
      mpesaReceipt: typeof items.MpesaReceiptNumber === "string" ? items.MpesaReceiptNumber.slice(0, 32) : null,
      amount:       Number.isFinite(Number(items.Amount)) ? Number(items.Amount) : null,
      phone:        items.PhoneNumber ? String(items.PhoneNumber).slice(0, 20) : null,
      completedAt:  admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    console.log("[callback]", cb.CheckoutRequestID, ok ? "COMPLETED" : "FAILED");
  } catch (err) {
    console.error("[callback]", err && err.message);
  }

  return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
});
