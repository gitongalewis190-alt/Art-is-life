/* ═══════════════════════════════════════════════════════════════════════
   functions/index.js — Daraja (M-Pesa) STK Push backend  (Phase 4)
   ───────────────────────────────────────────────────────────────────────
   This is the SECURE server half of the donate flow. It holds the Daraja
   secrets (never the browser) and exposes two HTTPS endpoints:

     POST /stkpush   <- called by the Donate button (js/services/daraja.js)
     POST /callback  <- called by Safaricom with the payment result

   The front-end Daraja.endpoint in the Control Console should point at the
   deployed /stkpush URL.

   ── ONE-TIME SETUP ─────────────────────────────────────────────────────
   1) cd functions && npm install
   2) Set secrets (NEVER commit these):
        firebase functions:config:set \
          daraja.consumer_key="xxx" \
          daraja.consumer_secret="xxx" \
          daraja.passkey="xxx" \
          daraja.shortcode="174379" \
          daraja.env="sandbox"            # or "production"
      (Or use Secret Manager / .env with firebase-functions v2 — see README.)
   3) firebase deploy --only functions,firestore:rules
   4) Paste the deployed stkpush URL into Control Console → M-Pesa endpoint.
   ═══════════════════════════════════════════════════════════════════════ */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

const CFG = () => (functions.config().daraja || {});
const BASES = {
  sandbox: "https://sandbox.safaricom.co.ke",
  production: "https://api.safaricom.co.ke"
};
const base = () => BASES[(CFG().env || "sandbox")] || BASES.sandbox;

/* Small CORS helper so the static site can call us from any origin. */
function cors(res) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
}

/* 1) OAuth — exchange key/secret for a short-lived access token. */
async function getToken() {
  const c = CFG();
  const auth = Buffer.from(`${c.consumer_key}:${c.consumer_secret}`).toString("base64");
  const r = await fetch(`${base()}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` }
  });
  if (!r.ok) throw new Error(`OAuth failed: ${r.status}`);
  return (await r.json()).access_token;
}

function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) +
         p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}

/* Normalise to 2547XXXXXXXX (server-side guard, mirrors the client). */
function normalize(phone) {
  let p = String(phone || "").replace(/\D/g, "");
  if (p.startsWith("0")) p = "254" + p.slice(1);
  if (p.startsWith("7") || p.startsWith("1")) p = "254" + p;
  return p;
}

/* ── /stkpush — initiate the prompt on the donor's phone ─────────────── */
exports.stkpush = functions.https.onRequest(async (req, res) => {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const c = CFG();
    const phone = normalize(req.body.phone);
    const amount = Math.floor(Number(req.body.amount));
    if (!/^254[71]\d{8}$/.test(phone)) return res.status(400).json({ error: "Invalid phone" });
    if (!amount || amount < 1) return res.status(400).json({ error: "Invalid amount" });

    const ts = timestamp();
    const password = Buffer.from(`${c.shortcode}${c.passkey}${ts}`).toString("base64");
    const token = await getToken();

    const payload = {
      BusinessShortCode: c.shortcode,
      Password: password,
      Timestamp: ts,
      TransactionType: "CustomerPayBillOnline",
      Amount: amount,
      PartyA: phone,
      PartyB: c.shortcode,
      PhoneNumber: phone,
      // Safaricom calls this URL with the result; same function, /callback:
      CallBackURL: `https://${process.env.GCLOUD_PROJECT}.web.app/callback`,
      AccountReference: (req.body.accountReference || "Donation").slice(0, 12),
      TransactionDesc: (req.body.businessName || "Art is Life Foundation").slice(0, 13)
    };

    const r = await fetch(`${base()}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await r.json();

    // Record the intent (server-only collection) for reconciliation.
    if (data.CheckoutRequestID) {
      await admin.firestore().collection("donations").doc(data.CheckoutRequestID).set({
        amount, phone, status: "pending",
        merchantRequestID: data.MerchantRequestID || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    return res.status(r.ok ? 200 : 400).json(data);
  } catch (err) {
    console.error("stkpush error", err);
    return res.status(500).json({ error: "STK push failed" });
  }
});

/* ── /callback — Safaricom posts the final result here ──────────────── */
exports.callback = functions.https.onRequest(async (req, res) => {
  try {
    const cb = req.body && req.body.Body && req.body.Body.stkCallback;
    if (cb && cb.CheckoutRequestID) {
      const ok = cb.ResultCode === 0;
      const items = {};
      (((cb.CallbackMetadata || {}).Item) || []).forEach((i) => { items[i.Name] = i.Value; });
      await admin.firestore().collection("donations").doc(cb.CheckoutRequestID).set({
        status: ok ? "completed" : "failed",
        resultDesc: cb.ResultDesc || "",
        mpesaReceipt: items.MpesaReceiptNumber || null,
        completedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }
  } catch (err) {
    console.error("callback error", err);
  }
  // Always 200 so Safaricom stops retrying.
  return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
});
