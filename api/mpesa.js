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
             → we verify it against Daraja's STK-query API and log it

   ── VERCEL ENVIRONMENT VARIABLES (Settings → Environment Variables) ──────
   DARAJA_CONSUMER_KEY     Your Daraja app Consumer Key
   DARAJA_CONSUMER_SECRET  Your Daraja app Consumer Secret
   DARAJA_PASSKEY          Your Lipa Na M-Pesa Passkey
   DARAJA_SHORTCODE        174379 (sandbox) or your PayBill number (live)
   DARAJA_ENV              sandbox   ← change to "production" when going live
   ALLOWED_ORIGINS         Optional. Comma-separated origins allowed to call
                           this endpoint cross-origin (defaults below).
   DARAJA_CALLBACK_URL     Optional. Explicit public URL Safaricom calls back.

   ── SECURITY NOTES ──────────────────────────────────────────────────────
   • All secrets live ONLY in Vercel's encrypted environment variables.
     They are never in source code, never sent to the browser.
   • Requests are validated (phone, integer amount, sane KES cap), rate
     limited per IP and per phone, and CORS-restricted to the site's own
     origins. STK-push spam is a real abuse vector, so it is throttled.
   • Callbacks are never trusted blindly: the result is re-checked with
     Safaricom's stkpushquery API before it is treated as confirmed.
   • Upstream error bodies are never echoed to the browser.
   ═══════════════════════════════════════════════════════════════════════ */

"use strict";

const DARAJA_URLS = {
  sandbox: "https://sandbox.safaricom.co.ke",
  production: "https://api.safaricom.co.ke"
};

const MIN_AMOUNT = 1;
const MAX_AMOUNT = 200000;          // KES per donation (server-side cap)
const MAX_BODY_BYTES = 4096;
const UPSTREAM_TIMEOUT_MS = 12000;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX_PER_IP = 5;
const RATE_MAX_PER_PHONE = 3;

const DEFAULT_ORIGINS = [
  "https://art-is-life-iota.vercel.app",
  "https://artislife-44968.web.app",
  "https://artislife-44968.firebaseapp.com"
];

/* ── Helpers ─────────────────────────────────────────────────────────── */

/** Normalise any Kenyan number format → 2547XXXXXXXX / 2541XXXXXXXX */
function normalizePhone(raw) {
  let p = String(raw == null ? "" : raw).replace(/\D/g, "");
  if (p.startsWith("2540")) p = "254" + p.slice(4);       // 254 0 7xx -> 254 7xx
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

/** Hide most digits before anything is written to logs. */
function maskPhone(phone) {
  const p = String(phone || "");
  return p.length >= 6 ? p.slice(0, 6) + "***" + p.slice(-2) : "***";
}

/** YYYYMMDDHHmmss timestamp that Daraja requires */
function darajaTimestamp(date) {
  const d = date || new Date();
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}` +
         `${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
}

/** Resolve Daraja configuration from the environment (never from the client). */
function getConfig() {
  const env = String(process.env.DARAJA_ENV || process.env.MPESA_ENV || "sandbox").toLowerCase();
  const safeEnv = env === "production" ? "production" : "sandbox";
  return {
    key: process.env.DARAJA_CONSUMER_KEY || process.env.MPESA_CONSUMER_KEY || "",
    secret: process.env.DARAJA_CONSUMER_SECRET || process.env.MPESA_CONSUMER_SECRET || "",
    passkey: process.env.DARAJA_PASSKEY || process.env.MPESA_PASSKEY || "",
    shortcode: process.env.DARAJA_SHORTCODE || process.env.MPESA_SHORTCODE || "174379",
    env: safeEnv,
    base: DARAJA_URLS[safeEnv]
  };
}

function missingCredentials(cfg) {
  return [
    !cfg.key && "DARAJA_CONSUMER_KEY (or MPESA_CONSUMER_KEY)",
    !cfg.secret && "DARAJA_CONSUMER_SECRET (or MPESA_CONSUMER_SECRET)",
    !cfg.passkey && "DARAJA_PASSKEY (or MPESA_PASSKEY)"
  ].filter(Boolean);
}

/** Exchange Consumer Key + Secret for a short-lived OAuth token */
async function getAccessToken(cfg) {
  const credentials = Buffer.from(`${cfg.key}:${cfg.secret}`).toString("base64");
  const response = await fetchWithTimeout(
    `${cfg.base}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${credentials}` } }
  );

  if (!response.ok) {
    throw new Error(`Daraja OAuth failed (${response.status})`);
  }

  const json = await response.json().catch(() => ({}));
  if (!json.access_token) throw new Error("Daraja OAuth returned no token");
  return json.access_token;
}

/** fetch() with a hard timeout so a stuck upstream can't hold the function. */
async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/* ── CORS — only the site's own origins may call this from a browser ─── */

function allowedOrigins() {
  const configured = String(process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return configured.length ? configured : DEFAULT_ORIGINS;
}

function setSecurityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Vary", "Origin");
}

function applyCors(req, res) {
  setSecurityHeaders(res);
  const origin = req.headers && req.headers.origin;
  if (origin && allowedOrigins().includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Max-Age", "600");
  }
}

/* ── Basic in-memory rate limiting (per warm serverless instance) ────── */

const rateBuckets = new Map();

function rateLimited(key, max) {
  const now = Date.now();
  const hits = (rateBuckets.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (hits.length >= max) {
    rateBuckets.set(key, hits);
    return true;
  }
  hits.push(now);
  rateBuckets.set(key, hits);
  // Opportunistic cleanup so the map can't grow without bound.
  if (rateBuckets.size > 500) {
    for (const [k, v] of rateBuckets) {
      if (!v.some((t) => now - t < RATE_WINDOW_MS)) rateBuckets.delete(k);
    }
  }
  return false;
}

function clientIp(req) {
  // x-real-ip is set by the platform and cannot be spoofed; x-forwarded-for is
  // client-controlled on the left, so only its last (proxy-appended) hop counts.
  const real = req.headers && req.headers["x-real-ip"];
  if (typeof real === "string" && real.trim()) return real.trim();
  const forwarded = req.headers && req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded) {
    const hops = forwarded.split(",").map((h) => h.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1];
  }
  return (req.socket && req.socket.remoteAddress) || "unknown";
}

/* ── Request parsing ─────────────────────────────────────────────────── */

/** Return a plain JSON object, or null when the body is missing/oversized. */
function readJsonBody(req) {
  let body = req.body;
  if (Buffer.isBuffer(body)) body = body.toString("utf8");
  if (typeof body === "string") {
    if (body.length > MAX_BODY_BYTES) return null;
    try { body = JSON.parse(body); } catch (_) { return null; }
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  // Re-check the serialised size: a pre-parsed body can still be huge.
  try {
    if (JSON.stringify(body).length > MAX_BODY_BYTES) return null;
  } catch (_) {
    return null;
  }
  return body;
}

/** Safaricom's callback body always has Body.stkCallback */
function isSafaricomCallback(body) {
  return Boolean(
    body && typeof body === "object" &&
    body.Body && typeof body.Body === "object" &&
    body.Body.stkCallback && typeof body.Body.stkCallback === "object"
  );
}

function callbackDetails(body) {
  const cb = body.Body.stkCallback;
  const checkoutId = typeof cb.CheckoutRequestID === "string" ? cb.CheckoutRequestID.slice(0, 64) : "";
  const resultCode = Number(cb.ResultCode);
  const meta = {};
  const items = (cb.CallbackMetadata && Array.isArray(cb.CallbackMetadata.Item)) ? cb.CallbackMetadata.Item : [];
  items.forEach((item) => {
    if (item && typeof item.Name === "string" && item.Name.length <= 40) meta[item.Name] = item.Value;
  });
  return {
    checkoutId,
    resultCode: Number.isFinite(resultCode) ? resultCode : null,
    resultDesc: typeof cb.ResultDesc === "string" ? cb.ResultDesc.slice(0, 200) : "",
    meta
  };
}

/* ── STK Push initiation ─────────────────────────────────────────────── */

async function handleStkPush(req, res) {
  const cfg = getConfig();

  const missing = missingCredentials(cfg);
  if (missing.length) {
    return res.status(503).json({
      error: "M-Pesa is not configured on the server yet. " +
             "Add the Daraja environment variables in Vercel, then redeploy."
    });
  }

  const body = readJsonBody(req);
  if (!body) {
    return res.status(400).json({ error: "Send a JSON body: { phone, amount }." });
  }

  const phone = normalizePhone(body.phone);
  if (!isValidPhone(phone)) {
    return res.status(400).json({
      error: "Enter a valid Safaricom number — 07XX XXX XXX or 01XX XXX XXX."
    });
  }

  const amount = Math.floor(Number(body.amount));
  if (!isValidAmount(amount)) {
    return res.status(400).json({
      error: `Enter a donation amount between KES ${MIN_AMOUNT} and KES ${MAX_AMOUNT.toLocaleString("en-KE")}.`
    });
  }

  // Throttle both by caller and by recipient to stop STK-push spam.
  if (rateLimited(`ip:${clientIp(req)}`, RATE_MAX_PER_IP) ||
      rateLimited(`phone:${phone}`, RATE_MAX_PER_PHONE)) {
    return res.status(429).json({
      error: "Too many donation attempts. Please wait a few minutes and try again."
    });
  }

  try {
    const ts = darajaTimestamp();
    const password = Buffer.from(`${cfg.shortcode}${cfg.passkey}${ts}`).toString("base64");
    const accessToken = await getAccessToken(cfg);

    const appUrl = process.env.DARAJA_CALLBACK_URL ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}/api/mpesa`
        : process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}/api/mpesa`
          : "https://art-is-life-iota.vercel.app/api/mpesa");

    const payload = {
      BusinessShortCode: cfg.shortcode,
      Password: password,
      Timestamp: ts,
      TransactionType: "CustomerPayBillOnline",
      Amount: amount,
      PartyA: phone,
      PartyB: cfg.shortcode,
      PhoneNumber: phone,
      CallBackURL: appUrl,
      AccountReference: String(body.accountReference || "Donation").replace(/[^\w .-]/g, "").slice(0, 12) || "Donation",
      TransactionDesc: String(body.businessName || "Art is Life").replace(/[^\w &'.-]/g, "").slice(0, 13) || "Art is Life"
    };

    const stkResponse = await fetchWithTimeout(`${cfg.base}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await stkResponse.json().catch(() => ({}));

    if (stkResponse.ok && data.ResponseCode === "0") {
      console.log("[mpesa/push] STK sent", JSON.stringify({
        checkoutId: data.CheckoutRequestID || null,
        amount,
        phone: maskPhone(phone)
      }));
      return res.status(200).json({
        ResponseCode: "0",
        ResponseDescription: data.ResponseDescription || "Success. Request accepted for processing",
        CustomerMessage: data.CustomerMessage ||
          "Check your phone — enter your M-Pesa PIN to complete the donation. Thank you!",
        CheckoutRequestID: data.CheckoutRequestID || null
      });
    }

    // Never echo Safaricom's raw body — it can contain request internals.
    console.warn("[mpesa/push] rejected", stkResponse.status, data.errorCode || data.ResponseCode || "");
    return res.status(400).json({
      error: typeof data.errorMessage === "string" && data.errorMessage
        ? data.errorMessage.slice(0, 160)
        : "M-Pesa could not start this payment. Please check the number and try again."
    });
  } catch (err) {
    console.error("[mpesa/push]", err && err.message);
    return res.status(502).json({
      error: "Could not reach M-Pesa. Please try again in a moment."
    });
  }
}

/* ── Health check — verifies credentials without sending any STK push ──── */

async function handleHealthCheck(req, res) {
  // Each check performs an OAuth round-trip, so keep it cheap to call once and
  // expensive to hammer.
  if (rateLimited(`health:${clientIp(req)}`, 10)) {
    return res.status(429).json({ ok: false, error: "Too many checks. Try again shortly." });
  }

  const cfg = getConfig();
  const missing = missingCredentials(cfg);

  if (missing.length) {
    return res.status(200).json({
      ok: false,
      stage: "env",
      error: `Missing: ${missing.join(", ")}. Add these in Vercel → Project → Settings → Environment Variables, then redeploy.`,
      env: cfg.env,
      shortcode: cfg.shortcode
    });
  }

  try {
    await getAccessToken(cfg);
    return res.status(200).json({
      ok: true,
      stage: "oauth",
      env: cfg.env,
      shortcode: cfg.shortcode,
      message: `Connected to Safaricom Daraja (${cfg.env}). Ready to accept donations.`
    });
  } catch (err) {
    return res.status(200).json({
      ok: false,
      stage: "oauth",
      error: "Could not authenticate with Safaricom. Check the Consumer Key/Secret.",
      env: cfg.env,
      shortcode: cfg.shortcode
    });
  }
}

/* ── Callback verification ───────────────────────────────────────────── */

/** Ask Daraja what really happened for this CheckoutRequestID. */
async function queryStkStatus(cfg, checkoutId) {
  const ts = darajaTimestamp();
  const password = Buffer.from(`${cfg.shortcode}${cfg.passkey}${ts}`).toString("base64");
  const token = await getAccessToken(cfg);

  const response = await fetchWithTimeout(`${cfg.base}/mpesa/stkpushquery/v1/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      BusinessShortCode: cfg.shortcode,
      Password: password,
      Timestamp: ts,
      CheckoutRequestID: checkoutId
    })
  });

  const data = await response.json().catch(() => ({}));
  return data && typeof data === "object" ? data : null;
}

/* ── Safaricom async callback ────────────────────────────────────────── */

async function handleCallback(req, res) {
  const body = readJsonBody(req);

  // A real Safaricom callback is server-to-server and never carries an
  // Origin header. A browser POST claiming to be one is ignored.
  if (req.headers && req.headers.origin) {
    console.warn("[mpesa/callback] rejected browser-originated callback");
    return res.status(403).json({ ResultCode: 1, ResultDesc: "Rejected" });
  }

  if (!body || !isSafaricomCallback(body)) {
    return res.status(400).json({ ResultCode: 1, ResultDesc: "Malformed callback" });
  }

  try {
    const { checkoutId, resultCode, resultDesc, meta } = callbackDetails(body);
    if (!checkoutId || resultCode === null) {
      return res.status(400).json({ ResultCode: 1, ResultDesc: "Malformed callback" });
    }

    // Verify with Daraja instead of trusting the POST body.
    let verified = null;
    const cfg = getConfig();
    if (!missingCredentials(cfg).length) {
      try {
        const status = await queryStkStatus(cfg, checkoutId);
        if (status && status.ResultCode !== undefined) {
          verified = Number(status.ResultCode) === resultCode;
          if (!verified) {
            console.warn("[mpesa/callback] ResultCode mismatch for", checkoutId,
              "posted:", resultCode, "queried:", status.ResultCode);
          }
        }
      } catch (err) {
        console.warn("[mpesa/callback] verification unavailable:", err && err.message);
      }
    }

    const confirmed = verified === true && resultCode === 0;

    console.log("[mpesa/callback]", JSON.stringify({
      checkoutId,
      status: resultCode === 0 ? "COMPLETED" : "FAILED",
      verified: verified === null ? "unverified" : verified,
      confirmed,
      reason: resultDesc,
      receipt: meta.MpesaReceiptNumber || null,
      amount: meta.Amount || null,
      phone: meta.PhoneNumber ? maskPhone(String(meta.PhoneNumber)) : null,
      paidAt: meta.TransactionDate || null
    }));

    /*
     * ── Optional: save to Firestore ─────────────────────────────────────
     * Only persist when `confirmed` is true, and only after adding
     * "firebase-admin" to a root package.json (or use the Cloud Function
     * version in functions/index.js, which already does this safely).
     * ───────────────────────────────────────────────────────────────────
     */
  } catch (err) {
    console.error("[mpesa/callback]", err && err.message);
  }

  // Always respond 200 — Safaricom keeps retrying until it sees 200.
  return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
}

/* ── Main handler ────────────────────────────────────────────────────── */

module.exports = async function handler(req, res) {
  applyCors(req, res);

  /* Preflight */
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method === "GET") return handleHealthCheck(req, res);
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST, OPTIONS");
    return res.status(405).json({ error: "POST only" });
  }

  /* Route: Safaricom callback vs donor-initiated push */
  const body = readJsonBody(req);
  if (isSafaricomCallback(body)) return handleCallback(req, res);
  return handleStkPush(req, res);
};

/* Exposed for unit tests (never part of the HTTP contract). */
module.exports._internals = {
  DARAJA_URLS,
  MIN_AMOUNT,
  MAX_AMOUNT,
  normalizePhone,
  isValidPhone,
  isValidAmount,
  maskPhone,
  darajaTimestamp,
  isSafaricomCallback,
  callbackDetails,
  readJsonBody,
  mode: "vercel"
};
