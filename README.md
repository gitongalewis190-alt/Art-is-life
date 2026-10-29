# Art is Life Foundation — E-Gallery & Control Console

Original Kenyan contemporary artworks by **Lewis Gitonga**. A mobile-first,
installable (PWA) art e-gallery with a built-in developer Control Console,
a Studio/Exhibition wing, and an M-Pesa donation flow.

Contact: 0184336391 — Lewis Gitonga · Nairobi, Kenya

—

## Architecture

The site was refactored from a single 5,369-line `index.html` into clean,
build-free modules. No bundler — it runs straight from static hosting and
opens directly on a phone.

```
index.html                  # Lean markup shell only
manifest.webmanifest        # PWA install metadata
css/
  main.css                  # Base styles
  glass.css                 # Spatial/glassmorphism layer + splash + console/studio
  layouts.css               # 7 switchable structural layout presets
js/
  sanitize.js               # Output escaping + URL validation (loaded first)
  app.js                    # App logic
  splash.js                 # 4-phase launch sequence
  console.js                # Control Console UI (theme/layout/CMS)
  studio.js                 # Studio wing (YouTube videos + archive) [module]
  services/
    analytics.js            # Google Analytics
    firebase.js             # Auth, Firestore, Storage, RBAC, real-time [module]
    siteConfig.js           # Global CMS/theme engine (Firestore-backed) [module]
    daraja.js               # M-Pesa STK-push client [module]
firestore.rules             # Security rules (RBAC: crown>admin>editor>viewer)
storage.rules               # Storage rules (admin-only, image-only, ≤10 MB)
firebase.json               # Hosting + functions + rules + security headers
functions/
  index.js                  # Daraja STK-push Cloud Function (secret-holding backend)
  package.json
api/
  mpesa.js                  # Vercel serverless Daraja endpoint (push + callback)
tests/                      # node:test suite (no dependencies)
  sanitize.test.js          # escaping / URL-safety units
  mpesa.test.js             # payment validation + HTTP behaviour units
  rules.test.js             # guard-rails on the security rules
  config.test.js            # CSP / headers / auth-gate guard-rails
  syntax.test.js            # every shipped file parses
  dom-smoke.js              # optional jsdom end-to-end XSS smoke test
```

**Load order is preserved** so the extracted logic behaves identically to the

original inline version. `js/sanitize.js` is loaded synchronously in `<head>`
so escaping helpers exist before any app code runs.

—

## Features

- **Launch sequence** — logo draw → brand reveal → owner remark → auto-enter gallery.
- **Spatial design** — glassmorphism panels, animated ambient optics, 60fps micro-interactions, full `prefers-reduced-motion` support.
- **Control Console** (crown role only, in the Admin dashboard):
  - Live **palette** customizer (brand, accent, ink, surface, radius, glass opacity).
  - **7 layout presets** switcher (Obsidian, Linen, Museum, Matrix, Aurora, Cinematic, Spectrum).
  - **CMS** for footer, socials, address, owner remark.
  - Changes **publish to Firestore** and apply for every visitor in real time.
- **Studio / Exhibition wing** — Process Studio (YouTube-embedded behind-the-scenes films with title/tags/description/timestamp) + Archive (non-sale masters). Managed from the **Studio Manager** admin tab.
- **Donate via M-Pesa** — button beside Commission; STK push through the Daraja endpoint.
- All original commerce intact: gallery, cart, likes, comments, orders (WhatsApp/Email/SMS), commissions, admin dashboard.
- **Accessibility** — labelled form controls, `role=“dialog”`/`aria-modal` overlays whose `aria-hidden` tracks their open state, keyboard-operable cards and admin trigger, a live-region toast, and visible keyboard escapes (Esc closes every overlay).
- **Installable PWA** — real PNG icons (192/512 + maskable), a standalone manifest and a versioned service worker that never caches `/api/*`.

—

## Security model

The browser is treated as untrusted. Every privilege is enforced server-side.

| Concern | Control |
| — | — |
| Admin access | Verified Firebase email/password session **plus** `users/{uid}.role` = `admin`/`crown`. The UI mirrors the role; `firestore.rules` enforces it. |
| Local console PIN | Optional **screen-lock only**. It never grants access, can be cleared by anyone, and protects no data. |
| Stored XSS | All remote/CMS data is escaped at render time (`js/sanitize.js`), IDs are escaped for inline handlers, and URLs are scheme-checked (`javascript:`, `data:` blocked). |
| Write forgery | Rules pin document shape, required fields, server timestamps and allowed status/role values. Visitors cannot mark their own order paid or promote themselves. |
| Likes | Signed-in only, one document per `{uid}_{artworkId}`; anonymous clients cannot write. |
| Uploads | `storage.rules`: admin/crown only, `image/*`, ≤10 MB; the client re-checks type and size before sending. |
| Stored state | Cart/likes read from `localStorage` are treated as untrusted: rebuilt field-by-field with type coercion and length caps before rendering. |
| CMS writes | `SiteConfig.publish()` sanitises every string, re-validates colours/radius/layout/GA id and strips `__proto__` keys, so the world-readable config can never hold a payload or pollute a prototype. |
| Secrets | Daraja key/secret/passkey live only in server env vars. The ElevenLabs key is deliberately **not** storable in the browser. |
| Payment abuse | Server-side amount cap, phone validation, per-IP/per-phone throttling, origin allow-list, and callback re-verification via Daraja’s `stkpushquery`. |
| Transport | CSP, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, HSTS (see `firebase.json`). |
| CSV export | Formula-injection neutralised (`=`, `+`, `-`, `@` are prefixed). |

> The Firebase **web API key is public by design** — it identifies the project,
> it does not authorise anything. Access control lives entirely in the rules.

### Admin sign-in

1. Firebase Console → **Authentication → Users → Add user** (email + password).
2. Firestore → create `users/{that-uid}` with field `role: crown`.
3. Open the site → tap the gear icon → sign in with that email/password.

The Control Console and Studio Manager appear once the role check passes. The
dashboard is unopenable without it, and — more importantly — the database
rejects writes without it.

—

## Running locally

It’s static — open `index.html`, or serve the folder:

```bash
npx serve .        # or: python3 -m http.server
```

Firebase features use the config already present in `js/services/firebase.js`.
Add `localhost` to Firebase Console → Authentication → Settings → Authorized
domains if sign-in misbehaves locally.

—

## Tests

No dependencies, no build step:

```bash
node —test “tests/*.test.js”
```

Optional end-to-end DOM smoke test (renders the real page in jsdom and feeds it
hostile Firestore/CMS/storage payloads — XSS, `javascript:` URLs, CSS break-out,
prototype pollution, poisoned cart, admin-gate bypass):

```bash
npm i —no-save —no-package-lock jsdom
node tests/dom-smoke.js
```

—

## Deploying

```bash
npm install -g firebase-tools
firebase login
firebase use —add                 # select your Firebase project

firebase deploy —only firestore:rules,storage,hosting
```

Deploy the rules **before** (or together with) the new front-end: the client
now relies on them for likes, comments and order shape.

### Enabling M-Pesa donations (Daraja)

Secrets live **only** on the server — never in the site.

The Donate button talks to the same-origin **`/api/mpesa`** Vercel function
by default — no Control Console field needs to be set. Just add these
environment variables in Vercel → Project → Settings → Environment
Variables, then redeploy:

```
DARAJA_CONSUMER_KEY
DARAJA_CONSUMER_SECRET
DARAJA_PASSKEY
DARAJA_SHORTCODE      # 174379 (sandbox) or your PayBill number (live)
DARAJA_ENV            # “sandbox” or “production”

# optional
ALLOWED_ORIGINS       # comma-separated origins allowed to call /api/mpesa
DARAJA_CALLBACK_URL   # explicit public callback URL (defaults to the Vercel URL)
```

Server-side safeguards: KES 1–200,000 per donation, 5 attempts per IP and 3 per
phone per 10 minutes, and callbacks are re-checked with Daraja’s
`stkpushquery` instead of being trusted.

Verify it’s wired up from Admin → **Control Console → M-Pesa** → **Test
Connection** — it checks the env vars and does a real OAuth handshake with
Safaricom without sending an STK push. If the Console’s endpoint field is
ever left blank or still points at the retired `/stkpush` path, the Donate
button automatically falls back to `/api/mpesa` so donations keep working.

<details>
<summary>Alternate backend: Firebase Cloud Functions instead of Vercel</summary>

```bash
cd functions && npm install && cd ..

firebase functions:config:set \
  daraja.consumer_key=“YOUR_KEY” \
  daraja.consumer_secret=“YOUR_SECRET” \
  daraja.passkey=“YOUR_PASSKEY” \
  daraja.shortcode=“174379” \
  daraja.env=“sandbox”             # “production” when live

firebase deploy —only functions
```

Paste the deployed `/stkpush` URL into Control Console → M-Pesa to use this
instead of the built-in `/api/mpesa` endpoint. The Cloud Function `/callback`
only settles donation records it created and that are still `pending`.
</details>

### Notes on hosting

- `firebase.json` excludes `api/**`, `functions/**`, `tests/**` and the rules
  files from the static deploy — no server source is published.
- If you serve the site from **Firebase Hosting**, point Control Console →
  M-Pesa at the full Vercel URL (`https://…/api/mpesa`), because Firebase
  Hosting does not run the `api/` directory.
- Bump `CACHE` in `service-worker.js` when you change JS/CSS so returning
  visitors pick up the new release.
- Regenerate the brand icons from the cover art when the artwork changes:
  `convert assets/brand/cover.jpg -resize 512x512 -strip assets/brand/icon-512.png`
  (repeat at 192 and 180, and use the `icon-maskable-*` files for the padded
  maskable variant).
