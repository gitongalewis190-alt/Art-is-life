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
   ═══════════════════════════════════════════════════════════════════════ */

const functions = require("firebase-functions");
const admin     = require("firebase-admin");
admin.initializeApp();

const BASES = {
  sandbox:    "https://sandbox.safaricom.co.ke",
  production: "https://api.safaricom.co.ke"
};
const PROJECT = process.env.GCLOUD_PROJECT || "artislife-44968";
const REGION  = process.env.FUNCTION_REGION || "us-central1";

/* Read from firebase-functions config OR process.env (Secret Manager / v2) */
function cfg() {
  const fc = (functions.config().daraja) || {};
  return {
    consumer_key:    process.env.DARAJA_CONSUMER_KEY    || fc.consumer_key    || "",
    consumer_secret: process.env.DARAJA_CONSUMER_SECRET || fc.consumer_secret || "",
    passkey:         process.env.DARAJA_PASSKEY         || fc.passkey         || "",
    shortcode:       process.env.DARAJA_SHORTCODE       || fc.shortcode       || "174379",
    env:             process.env.DARAJA_ENV             || fc.env             || "sandbox",
    callback_url:    process.env.DARAJA_CALLBACK_URL    || fc.callback_url    || ""
  };
}

function cors(res) {
  res.set("Access-Control-Allow-Origin",  "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
}

function nowStamp() {
  const d = new Date(), z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${z(d.getMonth()+1)}${z(d.getDate())}${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
}

async function getToken(base, key, secret) {
  const creds = Buffer.from(`${key}:${secret}`).toString("base64");
  const r = await fetch(`${base}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${creds}` }
  });
  if (!r.ok) throw new Error(`OAuth ${r.status}`);
  const j = await r.json();
  if (!j.access_token) throw new Error("No token");
  return j.access_token;
}

function normalize(phone) {
  let p = String(phone || "").replace(/\D/g, "");
  if (p.startsWith("0"))                      p = "254" + p.slice(1);
  if (p.startsWith("7") || p.startsWith("1")) p = "254" + p;
  return p;
}

/* ── /stkpush ─────────────────────────────────────────────────────────── */
exports.stkpush = functions.https.onRequest(async (req, res) => {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST")   return res.status(405).json({ error: "POST only" });

  const c = cfg();
  if (!c.consumer_key || !c.consumer_secret || !c.passkey) {
    return res.status(503).json({ error: "Daraja credentials not configured. Run firebase functions:config:set daraja.*" });
  }

  const phone  = normalize(req.body.phone);
  const amount = Math.floor(Number(req.body.amount));
  if (!/^254[71]\d{8}$/.test(phone)) return res.status(400).json({ error: "Invalid phone number" });
  if (!amount || amount < 1)         return res.status(400).json({ error: "Invalid amount" });

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
      AccountReference:  String(req.body.accountReference || "Donation").slice(0, 12),
      TransactionDesc:   String(req.body.businessName     || "Art is Life").slice(0, 13)
    };

    const r    = await fetch(`${base}/mpesa/stkpush/v1/processrequest`, {
      method:  "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body:    JSON.stringify(payload)
    });
    const data = await r.json().catch(() => ({}));

    if (data.CheckoutRequestID) {
      await admin.firestore().collection("donations").doc(data.CheckoutRequestID).set({
        amount, phone, status: "pending", env: c.env,
        merchantRequestID: data.MerchantRequestID || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    return res.status(r.ok ? 200 : 400).json(data);
  } catch (err) {
    console.error("[stkpush]", err.message);
    return res.status(500).json({ error: "Payment initiation failed. Try again." });
  }
});

/* ── /callback — Safaricom posts the payment result here ─────────────── */
exports.callback = functions.https.onRequest(async (req, res) => {
  try {
    const cb = req.body && req.body.Body && req.body.Body.stkCallback;
    if (cb && cb.CheckoutRequestID) {
      const ok    = cb.ResultCode === 0;
      const items = {};
      ((cb.CallbackMetadata || {}).Item || []).forEach((i) => { items[i.Name] = i.Value; });
      await admin.firestore().collection("donations").doc(cb.CheckoutRequestID).set({
        status:       ok ? "completed" : "failed",
        resultDesc:   cb.ResultDesc || "",
        mpesaReceipt: items.MpesaReceiptNumber || null,
        amount:       items.Amount || null,
        phone:        items.PhoneNumber || null,
        completedAt:  admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }
  } catch (err) {
    console.error("[callback]", err.message);
  }
  return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
});
