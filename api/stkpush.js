/* ═══════════════════════════════════════════════════════════════════════
   api/stkpush.js — Vercel Serverless: M-Pesa STK Push endpoint
   ───────────────────────────────────────────────────────────────────────
   The frontend (js/services/daraja.js) POSTs here when a donor clicks
   "Donate with M-Pesa".  This function holds the Daraja secrets — they
   live ONLY in Vercel environment variables, never in source code.

   ── VERCEL ENVIRONMENT VARIABLES (set in your Vercel dashboard) ────────
   DARAJA_CONSUMER_KEY     from developer.safaricom.co.ke
   DARAJA_CONSUMER_SECRET  from developer.safaricom.co.ke
   DARAJA_PASSKEY          from your Daraja app (sandbox: long static key)
   DARAJA_SHORTCODE        sandbox: 174379  |  production: your PayBill
   DARAJA_ENV              "sandbox"  (change to "production" when ready)
   DARAJA_CALLBACK_URL     optional — defaults to this app's /api/mpesa-callback
   ═══════════════════════════════════════════════════════════════════════ */

const BASES = {
  sandbox:    "https://sandbox.safaricom.co.ke",
  production: "https://api.safaricom.co.ke"
};

function normalize(phone) {
  let p = String(phone || "").replace(/\D/g, "");
  if (p.startsWith("0"))                    p = "254" + p.slice(1);
  if (p.startsWith("7") || p.startsWith("1")) p = "254" + p;
  return p;
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
  if (!j.access_token) throw new Error("No token in OAuth response");
  return j.access_token;
}

module.exports = async function handler(req, res) {
  /* CORS — allow the Vercel domain and local dev */
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST")   return res.status(405).json({ error: "POST only" });

  const KEY     = process.env.DARAJA_CONSUMER_KEY;
  const SECRET  = process.env.DARAJA_CONSUMER_SECRET;
  const PASSKEY = process.env.DARAJA_PASSKEY;
  const SCODE   = process.env.DARAJA_SHORTCODE    || "174379";
  const ENV     = process.env.DARAJA_ENV          || "sandbox";
  const BASE    = BASES[ENV] || BASES.sandbox;

  /* Guard: credentials not yet set */
  if (!KEY || !SECRET || !PASSKEY) {
    return res.status(503).json({
      error: "Daraja credentials not configured on server. Set DARAJA_* environment variables in Vercel."
    });
  }

  const body   = req.body || {};
  const phone  = normalize(body.phone);
  const amount = Math.floor(Number(body.amount));

  if (!/^254[71]\d{8}$/.test(phone))
    return res.status(400).json({ error: "Enter a valid Safaricom number (07XX or 01XX)." });
  if (!amount || amount < 1)
    return res.status(400).json({ error: "Enter an amount of at least KES 1." });

  try {
    const ts       = nowStamp();
    const password = Buffer.from(`${SCODE}${PASSKEY}${ts}`).toString("base64");
    const token    = await getToken(BASE, KEY, SECRET);

    /* Callback: Safaricom will POST the payment result here */
    const appRoot   = process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "https://art-is-life-iota.vercel.app";
    const callbackUrl = process.env.DARAJA_CALLBACK_URL || `${appRoot}/api/mpesa-callback`;

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
      AccountReference:  String(body.accountReference || "Donation").slice(0, 12),
      TransactionDesc:   String(body.businessName     || "Art is Life").slice(0, 13)
    };

    const r    = await fetch(`${BASE}/mpesa/stkpush/v1/processrequest`, {
      method:  "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body:    JSON.stringify(payload)
    });
    const data = await r.json().catch(() => ({}));

    /* Surface a friendly message even when Daraja returns success */
    if (r.ok && data.ResponseCode === "0") {
      data.CustomerMessage = data.CustomerMessage ||
        "Check your phone — enter your M-Pesa PIN to complete the donation. Thank you!";
    }

    return res.status(r.ok ? 200 : 400).json(data);
  } catch (err) {
    console.error("[stkpush]", err.message);
    return res.status(500).json({ error: "Payment initiation failed. Please try again shortly." });
  }
};
