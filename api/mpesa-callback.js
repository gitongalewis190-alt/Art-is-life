/* ═══════════════════════════════════════════════════════════════════════
   api/mpesa-callback.js — Safaricom posts the payment result here.
   No secrets needed — just acknowledge and record.
   ═══════════════════════════════════════════════════════════════════════ */
module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const cb = req.body && req.body.Body && req.body.Body.stkCallback;
    if (cb) {
      const ok      = cb.ResultCode === 0;
      const items   = {};
      ((cb.CallbackMetadata || {}).Item || []).forEach((i) => { items[i.Name] = i.Value; });
      /* Log to Vercel function logs (visible in Vercel dashboard → Logs) */
      console.log("[mpesa-callback]", JSON.stringify({
        checkoutId: cb.CheckoutRequestID,
        status:     ok ? "completed" : "failed",
        resultDesc: cb.ResultDesc,
        receipt:    items.MpesaReceiptNumber || null,
        amount:     items.Amount || null,
        phone:      items.PhoneNumber || null
      }));
      /* ── Optional: forward to Firestore ─────────────────────────────
         If you want Firestore records, add firebase-admin to a root
         package.json and uncomment:
         const admin = require("firebase-admin");
         if (!admin.apps.length) admin.initializeApp();
         await admin.firestore()
           .collection("donations").doc(cb.CheckoutRequestID)
           .set({ status: ok?"completed":"failed", ...items,
                  completedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      ─────────────────────────────────────────────────────────────── */
    }
  } catch (err) {
    console.error("[mpesa-callback]", err.message);
  }

  /* Always 200 — Safaricom retries until it receives 200. */
  return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
};
