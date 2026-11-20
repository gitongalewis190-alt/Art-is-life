/* ═══════════════════════════════════════════════════════════════════════════
   api/visit.js — Art Is Life · visitor alert
   Vercel serverless function. When someone opens the gallery, the browser
   pings this endpoint and the owner's Telegram bot sends one message.

   The bot token never ships to the browser. Set these in
   Vercel → Project → Settings → Environment Variables, then redeploy:

     TELEGRAM_BOT_TOKEN   From @BotFather (looks like 123456:ABC...)
     TELEGRAM_CHAT_ID     The chat the bot should message (your own user id)

   One alert per visitor per 30 minutes. Bots and blank clients are ignored.
   City/country come from the host's edge headers. The raw IP is never
   written into the Telegram message.
   ═══════════════════════════════════════════════════════════════════════ */

"use strict";

const crypto = require("crypto");

const RATE_WINDOW_MS = 30 * 60 * 1000;
const MAX_BODY_CHARS = 800;
const TELEGRAM_TIMEOUT_MS = 8000;

const ALLOWED_ORIGINS = [
  "https://art-is-life-iota.vercel.app",
  "https://artislife-44968.web.app",
  "https://artislife-44968.firebaseapp.com"
];

/* Best-effort cooldown. A cold serverless instance starts empty, and the
   browser also sends only once per tab session, so refreshes stay quiet. */
const recent = new Map();

function applyCors(req, res) {
  const origin = String(req.headers.origin || "");
  if (ALLOWED_ORIGINS.indexOf(origin) !== -1) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Max-Age", "600");
  }
}

function header(req, name) {
  const value = req.headers[name];
  if (Array.isArray(value)) return String(value[0] || "");
  return value == null ? "" : String(value);
}

function clientKey(req) {
  const fwd = header(req, "x-forwarded-for").split(",")[0].trim();
  const ip = (fwd || header(req, "x-real-ip") || "unknown").slice(0, 80);
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 24);
}

function seenRecently(key) {
  const now = Date.now();
  const prev = recent.get(key);
  if (prev && now - prev < RATE_WINDOW_MS) return true;
  recent.set(key, now);
  if (recent.size > 400) {
    for (const [k, t] of recent) {
      if (now - t > RATE_WINDOW_MS) recent.delete(k);
    }
  }
  return false;
}

function isBot(ua) {
  if (!ua || ua.length < 8) return true;
  return /bot|crawl|spider|preview|facebookexternal|telegrambot|whatsapp|slackbot|headless|lighthouse|uptime|curl\/|wget\/|python-requests|go-http/i.test(ua);
}

function cleanPath(raw) {
  const s = String(raw == null ? "" : raw)
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 180);
  if (!s.startsWith("/")) return "/";
  return s;
}

function referrerHost(raw) {
  try {
    const url = new URL(String(raw || ""));
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.host.slice(0, 80);
  } catch (_) {
    return "";
  }
}

function placeLabel(req) {
  const city = decodeURIComponent(header(req, "x-vercel-ip-city") || "").replace(/\+/g, " ").slice(0, 60);
  const country = header(req, "x-vercel-ip-country").slice(0, 8);
  if (city && country) return city + ", " + country;
  return city || country || "";
}

function deviceLabel(ua) {
  if (/iPad/i.test(ua)) return "iPad";
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/Android/i.test(ua)) return "Android";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Mac OS X/i.test(ua)) return "Mac";
  if (/Linux/i.test(ua)) return "Linux";
  return "Web browser";
}

function nairobiNow() {
  try {
    return new Intl.DateTimeFormat("en-KE", {
      timeZone: "Africa/Nairobi",
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date());
  } catch (_) {
    return new Date().toISOString();
  }
}

function readBody(req) {
  const body = req.body;
  if (body && typeof body === "object") return body;
  if (typeof body === "string") {
    if (body.length > MAX_BODY_CHARS) return {};
    try { return JSON.parse(body); } catch (_) { return {}; }
  }
  return {};
}

function buildMessage(req) {
  const body = readBody(req);
  const lines = [
    "Art is Life",
    "Someone just opened the gallery.",
    "",
    "When: " + nairobiNow() + " EAT",
    "Page: " + cleanPath(body.path)
  ];
  const place = placeLabel(req);
  if (place) lines.push("Place: " + place);
  lines.push("Device: " + deviceLabel(header(req, "user-agent")));
  const from = referrerHost(body.ref);
  if (from) lines.push("Came from: " + from);
  return lines.join("\n");
}

async function sendTelegram(token, chatId, text) {
  const ctrl = new AbortController();
  const timer = setTimeout(function () { ctrl.abort(); }, TELEGRAM_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        disable_web_page_preview: true
      }),
      signal: ctrl.signal
    });
    if (!response.ok) {
      console.warn("[visit] telegram rejected the alert");
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[visit] telegram send failed:", err && err.message);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ sent: false });
  }

  const ua = header(req, "user-agent");
  if (isBot(ua)) return res.status(200).json({ sent: false });

  const token = process.env.TELEGRAM_BOT_TOKEN || "";
  const chatId = process.env.TELEGRAM_CHAT_ID || "";
  if (!token || !chatId) {
    console.warn("[visit] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not set");
    return res.status(200).json({ sent: false });
  }

  const key = clientKey(req);
  if (seenRecently(key)) return res.status(200).json({ sent: true });

  const ok = await sendTelegram(token, chatId, buildMessage(req));
  if (!ok) recent.delete(key);
  return res.status(200).json({ sent: ok });
};
