"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const handler = require(path.join(__dirname, "..", "api", "mpesa.js"));
const api = handler._internals;

test("module exports an async HTTP handler", () => {
  assert.equal(typeof handler, "function");
  assert.equal(handler.length, 2);
});

test("normalizePhone produces the 2547/2541 MSISDN Daraja expects", () => {
  assert.equal(api.normalizePhone("0184336391"), "254184336391");
  assert.equal(api.normalizePhone("0184 336 391"), "254184336391");
  assert.equal(api.normalizePhone("+254 184 336 391"), "254184336391");
  assert.equal(api.normalizePhone("254184336391"), "254184336391");
  assert.equal(api.normalizePhone("2540184336391"), "254184336391");
  assert.equal(api.normalizePhone("0112345678"), "254112345678");
  assert.equal(api.normalizePhone(null), "");
  assert.equal(api.normalizePhone("nonsense"), "");
});

test("isValidPhone only accepts Safaricom prefixes", () => {
  assert.equal(api.isValidPhone("254184336391"), true);
  assert.equal(api.isValidPhone("254112345678"), true);
  assert.equal(api.isValidPhone("254204708178"), false); // not 7xx/1xx
  assert.equal(api.isValidPhone("25470470817"), false);  // too short
  assert.equal(api.isValidPhone("2541843363919"), false); // too long
  assert.equal(api.isValidPhone("javascript:alert(1)"), false);
});

test("amount validation enforces integer bounds", () => {
  assert.equal(api.isValidAmount(0), false);
  assert.equal(api.isValidAmount(-5), false);
  assert.equal(api.isValidAmount(1), true);
  assert.equal(api.isValidAmount(1500), true);
  assert.equal(api.isValidAmount(api.MAX_AMOUNT), true);
  assert.equal(api.isValidAmount(api.MAX_AMOUNT + 1), false);
  assert.equal(api.isValidAmount(1.5), false);
  assert.equal(api.isValidAmount(NaN), false);
  assert.equal(api.isValidAmount("100"), false);
});

test("maskPhone never logs a full MSISDN", () => {
  const masked = api.maskPhone("254184336391");
  assert.ok(masked.includes("***"));
  assert.ok(!masked.includes("708178"));
  assert.equal(api.maskPhone(""), "***");
});

test("darajaTimestamp is 14 digits in local YYYYMMDDHHmmss order", () => {
  const ts = api.darajaTimestamp(new Date(2026, 0, 2, 3, 4, 5));
  assert.equal(ts, "20260102030405");
  assert.match(ts, /^\d{14}$/);
});

test("callback detection requires Body.stkCallback", () => {
  assert.equal(api.isSafaricomCallback({ Body: { stkCallback: {} } }), true);
  assert.equal(api.isSafaricomCallback({ Body: {} }), false);
  assert.equal(api.isSafaricomCallback({ phone: "0184336391", amount: 10 }), false);
  assert.equal(api.isSafaricomCallback(null), false);
  assert.equal(api.isSafaricomCallback("string"), false);
});

test("callbackDetails extracts and caps untrusted fields", () => {
  const details = api.callbackDetails({
    Body: {
      stkCallback: {
        CheckoutRequestID: "ws_CO_123",
        ResultCode: "1032",
        ResultDesc: "x".repeat(500),
        CallbackMetadata: {
          Item: [
            { Name: "Amount", Value: 100 },
            { Name: "MpesaReceiptNumber", Value: "QK1ABC" },
            { Name: 123, Value: "ignored" }
          ]
        }
      }
    }
  });

  assert.equal(details.checkoutId, "ws_CO_123");
  assert.equal(details.resultCode, 1032);
  assert.equal(details.resultDesc.length, 200);
  assert.equal(details.meta.Amount, 100);
  assert.equal(details.meta.MpesaReceiptNumber, "QK1ABC");
  assert.equal(Object.keys(details.meta).length, 2);
});

test("readJsonBody rejects arrays, scalars and bad JSON", () => {
  assert.deepEqual(api.readJsonBody({ body: { phone: "0704" } }), { phone: "0704" });
  assert.deepEqual(api.readJsonBody({ body: '{"phone":"0704"}' }), { phone: "0704" });
  assert.equal(api.readJsonBody({ body: "[1,2]" }), null);
  assert.equal(api.readJsonBody({ body: '"text"' }), null);
  assert.equal(api.readJsonBody({ body: "{oops" }), null);
  assert.equal(api.readJsonBody({ body: null }), null);
  assert.equal(api.readJsonBody({ body: Buffer.from('{"a":1}') }).a, 1);
});

/* ── HTTP behaviour ─────────────────────────────────────────────────── */

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    end() { return this; }
  };
}

test("OPTIONS preflight returns 204 without an unapproved origin echo", async () => {
  const res = mockRes();
  await handler({ method: "OPTIONS", headers: { origin: "https://evil.example" }, body: {} }, res);
  assert.equal(res.statusCode, 204);
  assert.equal(res.headers["access-control-allow-origin"], undefined);
  assert.equal(res.headers["cache-control"], "no-store");
  assert.equal(res.headers["x-content-type-options"], "nosniff");
});

test("approved origin receives a matching CORS header", async () => {
  const res = mockRes();
  await handler({ method: "OPTIONS", headers: { origin: "https://art-is-life-iota.vercel.app" }, body: {} }, res);
  assert.equal(res.headers["access-control-allow-origin"], "https://art-is-life-iota.vercel.app");
});

test("PUT is rejected with 405 and an Allow header", async () => {
  const res = mockRes();
  await handler({ method: "PUT", headers: {}, body: {} }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, "GET, POST, OPTIONS");
});

test("STK push rejects an invalid phone before touching the network", async () => {
  const res = mockRes();
  await handler({ method: "POST", headers: {}, body: { phone: "123", amount: 100 } }, res);
  // 503 (credentials missing) or 400 (validation) -- never a 2xx/500.
  assert.ok([400, 503].includes(res.statusCode), "unexpected status " + res.statusCode);
  assert.equal(typeof res.body.error, "string");
});

test("STK push rejects an out-of-range amount", async () => {
  const res = mockRes();
  await handler({ method: "POST", headers: {}, body: { phone: "0184336391", amount: 10_000_000 } }, res);
  assert.ok([400, 503].includes(res.statusCode));
  assert.ok(!JSON.stringify(res.body).includes("10,000,000 KES"));
});

test("browser-originated callbacks are refused", async () => {
  const res = mockRes();
  await handler({
    method: "POST",
    headers: { origin: "https://evil.example" },
    body: { Body: { stkCallback: { CheckoutRequestID: "ws_CO_1", ResultCode: 0 } } }
  }, res);
  assert.equal(res.statusCode, 403);
});

test("malformed callbacks are refused", async () => {
  const res = mockRes();
  await handler({ method: "POST", headers: {}, body: { Body: { stkCallback: {} } } }, res);
  assert.equal(res.statusCode, 400);
});
