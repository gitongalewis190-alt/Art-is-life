/* ═══════════════════════════════════════════════════════════════════════
   daraja.js — Safaricom Daraja (M-Pesa) integration service  [Phase 1 STUB]
   ───────────────────────────────────────────────────────────────────────
   WHY THIS IS A STUB:
   The M-Pesa STK Push flow requires your Daraja Consumer Key, Consumer
   Secret and Lipa-na-M-Pesa Passkey. Those are SECRETS — they must NEVER
   live in front-end code, because anything shipped to the browser is
   readable by every visitor. They belong on a server you control
   (a small Node/Express endpoint, a Firebase Cloud Function, or Apps
   Script). This file is the clean, fully-wired CLIENT half: it collects
   the donation, validates it, and POSTs to YOUR backend endpoint, which
   holds the secrets and talks to Safaricom.
   ───────────────────────────────────────────────────────────────────────
   TO GO LIVE (no code changes needed here — just configuration):
     window.SITE_CONFIG.daraja = {
       endpoint: 'https://<your-backend>/stkpush',  // your secure endpoint
       businessName: 'Art is Life Foundation'
     };
   Backend responsibilities (server-side, holds the secrets):
     1. OAuth: GET /oauth/v1/generate?grant_type=client_credentials
              (Authorization: Basic base64(consumerKey:consumerSecret))
     2. STK Push: POST /mpesa/stkpush/v1/processrequest with
              BusinessShortCode, Password = base64(Shortcode+Passkey+Timestamp),
              Timestamp, TransactionType=CustomerPayBillOnline, Amount,
              PartyA=phone, PartyB=Shortcode, PhoneNumber, CallBackURL,
              AccountReference, TransactionDesc
     3. Handle the async C2B callback to confirm payment.
   ═══════════════════════════════════════════════════════════════════════ */

const Daraja = {
  /** Read live config (set in window.SITE_CONFIG.daraja). Empty by design. */
  get config() {
    return (window.SITE_CONFIG && window.SITE_CONFIG.daraja) || {};
  },

  get isConfigured() {
    return Boolean(this.config.endpoint);
  },

  /** Normalise a Kenyan number to the 2547XXXXXXXX MSISDN form Daraja expects. */
  normalizePhone(raw) {
    let p = String(raw || '').replace(/[^\d]/g, '');
    if (p.startsWith('0'))  p = '254' + p.slice(1);
    if (p.startsWith('7') || p.startsWith('1')) p = '254' + p;
    if (p.startsWith('2540')) p = '254' + p.slice(4);
    return p;
  },

  validate(phone, amount) {
    const msisdn = this.normalizePhone(phone);
    if (!/^2547\d{8}$/.test(msisdn) && !/^2541\d{8}$/.test(msisdn)) {
      return { ok: false, error: 'Enter a valid Safaricom number, e.g. 07XX XXX XXX.' };
    }
    const amt = Math.floor(Number(amount));
    if (!amt || amt < 1) return { ok: false, error: 'Enter a donation amount of at least KES 1.' };
    return { ok: true, msisdn, amount: amt };
  },

  /**
   * Initiate an STK Push by delegating to YOUR secure backend.
   * Returns { ok, message } — never throws into the UI.
   */
  async initiateSTKPush({ phone, amount, reference = 'Donation' }) {
    const v = this.validate(phone, amount);
    if (!v.ok) return { ok: false, message: v.error };

    if (!this.isConfigured) {
      // Honest, non-fake fallback until the backend endpoint is wired.
      return {
        ok: false,
        pending: true,
        message: 'M-Pesa donations are being finalised. Add your secure Daraja endpoint in SITE_CONFIG to activate the STK push prompt.'
      };
    }

    try {
      const res = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: v.msisdn,
          amount: v.amount,
          accountReference: reference,
          businessName: this.config.businessName || 'Art is Life Foundation'
        })
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json().catch(() => ({}));
      if (typeof window.track === 'function') window.track('donation_stk_requested', { amount: v.amount });
      return {
        ok: true,
        message: data.CustomerMessage || 'Check your phone — enter your M-Pesa PIN to complete the donation. Thank you!'
      };
    } catch (err) {
      return { ok: false, message: 'Could not reach the payment service. Please try again shortly.' };
    }
  }
};

window.Daraja = Daraja;

/* ─────────────────────  DONATE MODAL UI HANDLERS  ─────────────────────
   Exposed on window so the inline onclick handlers in index.html resolve
   (this file is a module, so its top-level scope is NOT global).        */
window.openDonate = function () {
  const m = document.getElementById('donateModal');
  if (!m) return;
  m.classList.add('active');
  document.body.style.overflow = 'hidden';
  const note = document.getElementById('donateNote');
  if (note) { note.textContent = ''; note.className = 'donate-note'; }
  if (typeof window.track === 'function') window.track('donate_opened');
};

window.closeDonate = function () {
  const m = document.getElementById('donateModal');
  if (m) m.classList.remove('active');
  document.body.style.overflow = '';
};

window.setDonateAmount = function (val) {
  const input = document.getElementById('donateAmount');
  if (input) input.value = val;
  document.querySelectorAll('.donate-chip').forEach((c) => {
    c.classList.toggle('sel', Number(c.textContent.replace(/[^\d]/g, '')) === Number(val));
  });
};

window.sendDonation = async function () {
  const phone  = (document.getElementById('donatePhone')  || {}).value;
  const amount = (document.getElementById('donateAmount') || {}).value;
  const note   = document.getElementById('donateNote');
  const btn    = document.getElementById('donateSendBtn');
  const setNote = (msg, cls) => { if (note) { note.textContent = msg; note.className = 'donate-note ' + (cls || ''); } };

  setNote('Processing…', '');
  if (btn) btn.disabled = true;

  const result = await Daraja.initiateSTKPush({ phone, amount, reference: 'Art is Life Donation' });

  if (btn) btn.disabled = false;
  setNote(result.message, result.ok ? 'ok' : (result.pending ? '' : 'err'));
  if (result.ok && typeof window.showToast === 'function') window.showToast('STK push sent — check your phone 📱');
};
