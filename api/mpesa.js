/* ═══════════════════════════════════════════════════════════════════════════
   api/mpesa.js — Art Is Life Foundation · M-Pesa Daraja Integration
   Vercel Serverless Function — handles BOTH STK Push initiation AND the
   async Safaricom payment callback in a single file.

   ENDPOINT (paste this into your Control Console → M-Pesa field):
     https://art-is-life-iota.vercel.app/api/mpesa

   ── HOW IT WORKS ────────────────────────────────────────────────────────
   When a donor clicks "Donate with M-Pesa":
     Browser → POST /api/mpesa { phone, amount }
             → this function gets an OAuth token from Safaricom
             → sends an STK Push to the donor's phone
             → donor enters their M-Pesa PIN
             → Safaricom POSTs the result back to /api/mpesa
             → we log it (and optionally save to Firestore)

   ── VERCEL ENVIRONMENT VARIABLES (Settings → Environment Variables) ──────
   DARAJA_CONSUMER_KEY     Your Daraja app Consumer Key
   DARAJA_CONSUMER_SECRET  Your Daraja app Consumer Secret
   DARAJA_PASSKEY          Your Lipa Na M-Pesa Passkey
   DARAJA_SHORTCODE        174379 (sandbox) or your PayBill number (live)
   DARAJA_ENV              sandbox   ← change to "production" when going live

   ── HOW TO GET THESE VALUES ─────────────────────────────────────────────
   1. Go to: developer.safaricom.co.ke → Sign Up / Log In
   2. My Apps → Create New App → tick "Lipa Na M-Pesa Sandbox" → Create
   3. Click your app → copy Consumer Key and Consumer Secret
   4. Click the "Lipa Na M-Pesa" tab → copy the Passkey
   5. Add all 5 variables to Vercel → Redeploy
   6. Paste the endpoint URL above into your Control Console → Publish

   ── GOING LIVE ───────────────────────────────────────────────────────────
   When ready for real donations (requires Safaricom business approval):
   - Replace sandbox credentials with production credentials
   - Change DARAJA_SHORTCODE to your real PayBill number
   - Change DARAJA_ENV to "production"
   - Redeploy on Vercel — no code changes needed

   ── SECURITY ─────────────────────────────────────────────────────────────
   All secrets live ONLY in Vercel's encrypted environment variables.
   They are never in source code, never sent to the browser.
   ═══════════════════════════════════════════════════════════════════════ */

const DARAJA_URLS = {
  sandbox:    "https://sandbox.safaricom.co.ke",
  production: "https://api.safaricom.co.ke"
};

/* ── Helpers ─────────────────────────────────────────────────────────── */

/** Normalise any Kenyan number format → 2547XXXXXXXX that Daraja expects */
function normalizePhone(raw) {
  let p = String(raw || "").replace(/\D/g, "");
  if (p.startsWith("0"))                      p = "254" + p.slice(1);
  if (p.startsWith("7") || p.startsWith("1")) p = "254" + p;
  if (p.startsWith("2540"))                   p = "254" + p.slice(4);
  return p;
}

/** YYYYMMDDHHmmss timestamp that Daraja requires */
function darajaTimestamp() {
  const d = new Date();
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}` +
         `${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
}

/** Exchange Consumer Key + Secret for a short-lived OAuth token */
async function getAccessToken(baseUrl) {
  const credentials = Buffer.from(
    `${process.env.DARAJA_CONSUMER_KEY}:${process.env.DARAJA_CONSUMER_SECRET}`
  ).toString("base64");

  const response = await fetch(
    `${baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${credentials}` } }
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Daraja OAuth failed (${response.status}): ${body.slice(0, 80)}`);
  }

  const json = await response.json();
  if (!json.access_token) throw new Error("Daraja OAuth returned no token");
  return json.access_token;
}

/** Set CORS headers — required because the browser calls this from Vercel */
function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

/* ── Detect which kind of request this is ────────────────────────────── */

/** Safaricom's callback body always has Body.stkCallback */
function isSafaricomCallback(body) {
  return body && body.Body && body.Body.stkCallback !== undefined;
}

/* ── STK Push initiation ─────────────────────────────────────────────── */

async function handleStkPush(req, res) {
  const KEY     = process.env.DARAJA_CONSUMER_KEY;
  const SECRET  = process.env.DARAJA_CONSUMER_SECRET;
  const PASSKEY = process.env.DARAJA_PASSKEY;
  const SCODE   = process.env.DARAJA_SHORTCODE || "174379";
  const ENV     = process.env.DARAJA_ENV       || "sandbox";
  const BASE    = DARAJA_URLS[ENV] || DARAJA_URLS.sandbox;

  /* Guard: credentials not yet configured */
  if (!KEY || !SECRET || !PASSKEY) {
    return res.status(503).json({
      error: "M-Pesa credentials not yet configured on the server. " +
             "Add DARAJA_* environment variables in your Vercel dashboard and redeploy."
    });
  }

  /* Validate phone number */
  const phone = normalizePhone(req.body.phone);
  if (!/^254[71]\d{8}$/.test(phone)) {
    return res.status(400).json({
      error: "Enter a valid Safaricom number — 07XX XXX XXX or 01XX XXX XXX."
    });
  }

  /* Validate amount */
  const amount = Math.floor(Number(req.body.amount));
  if (!amount || amount < 1) {
    return res.status(400).json({ error: "Enter a donation amount of at least KES 1." });
  }

  try {
    const ts          = darajaTimestamp();
    const password    = Buffer.from(`${SCODE}${PASSKEY}${ts}`).toString("base64");
    const accessToken = await getAccessToken(BASE);

    /* The URL Safaricom will POST the payment result back to */
    const appUrl     = process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "https://art-is-life-iota.vercel.app";
    const callbackUrl = `${appUrl}/api/mpesa`;

    const payload = {
      BusinessShortCode: SCODE,
      Password:          password,
      Timestamp:         ts,
      TransactionType:   "CustomerPayBillOnline",
      Amount:            amount,
      PartyA:            phone,
      PartyB:            SCODE,
      PhoneNumber:       phone,
      CallBackURL:       callbackUrl,
      AccountReference:  String(req.body.accountReference || "Donation").slice(0, 12),
      TransactionDesc:   String(req.body.businessName     || "Art is Life").slice(0, 13)
    };

    const stkResponse = await fetch(`${BASE}/mpesa/stkpush/v1/processrequest`, {
      method:  "POST",
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await stkResponse.json().catch(() => ({}));

    /* Add a warm, human-readable message if Daraja succeeds */
    if (stkResponse.ok && data.ResponseCode === "0") {
      data.CustomerMessage = data.CustomerMessage ||
        "Check your phone — enter your M-Pesa PIN to complete the donation. Thank you!";
    }

    return res.status(stkResponse.ok ? 200 : 400).json(data);

  } catch (err) {
    console.error("[mpesa/push]", err.message);
    return res.status(500).json({
      error: "Could not reach M-Pesa. Please try again in a moment."
    });
  }
}

/* ── Safaricom async callback ────────────────────────────────────────── */

async function handleCallback(req, res) {
  try {
    const cb = req.body.Body.stkCallback;
    const ok = cb.ResultCode === 0;

    /* Extract payment details from the callback metadata */
    const meta = {};
    ((cb.CallbackMetadata || {}).Item || []).forEach((item) => {
      meta[item.Name] = item.Value;
    });

    /* Log to Vercel function logs — visible in Vercel → project → Logs */
    console.log("[mpesa/callback]", JSON.stringify({
      checkoutId: cb.CheckoutRequestID,
      status:     ok ? "COMPLETED" : "FAILED",
      reason:     cb.ResultDesc,
      receipt:    meta.MpesaReceiptNumber || null,
      amount:     meta.Amount            || null,
      phone:      meta.PhoneNumber       || null,
      paidAt:     meta.TransactionDate   || null
    }));

    /*
     * ── Optional: save to Firestore ─────────────────────────────────────
     * Uncomment this block if you want donation records in Firestore.
     * Also add "firebase-admin" to a root package.json first.
     *
     * const admin = require("firebase-admin");
     * if (!admin.apps.length) admin.initializeApp();
     * if (cb.CheckoutRequestID) {
     *   await admin.firestore()
     *     .collection("donations")
     *     .doc(cb.CheckoutRequestID)
     *     .set({
     *       status:       ok ? "completed" : "failed",
     *       resultDesc:   cb.ResultDesc,
     *       mpesaReceipt: meta.MpesaReceiptNumber || null,
     *       amount:       meta.Amount             || null,
     *       phone:        meta.PhoneNumber        || null,
     *       completedAt:  admin.firestore.FieldValue.serverTimestamp()
     *     }, { merge: true });
     * }
     * ─────────────────────────────────────────────────────────────────── */

  } catch (err) {
    console.error("[mpesa/callback]", err.message);
  }

  /* Always respond 200 — Safaricom keeps retrying until it sees 200 */
  return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
}

/* ── Main handler ────────────────────────────────────────────────────── */

module.exports = async function handler(req, res) {
  setCorsHeaders(res);

  /* Preflight */
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST")   return res.status(405).json({ error: "POST only" });

  /* Route: Safaricom callback vs donor-initiated push */
  if (isSafaricomCallback(req.body)) {
    return handleCallback(req, res);
  }
  return handleStkPush(req, res);
};
