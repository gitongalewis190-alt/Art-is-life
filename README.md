# Art is Life Foundation — E-Gallery & Control Console

Original Kenyan contemporary artworks by **Lewis Gitonga**. A mobile-first,
installable (PWA) art e-gallery with a built-in developer Control Console,
a Studio/Exhibition wing, and an M-Pesa donation flow.

Contact: 0704708178 — Lewis Gitonga · Nairobi, Kenya

---

## Architecture

The site was refactored from a single 5,369-line `index.html` into clean,
build-free modules. No bundler — it runs straight from static hosting and
opens directly on a phone.

```
index.html                  # Lean markup shell only
manifest.webmanifest        # PWA install metadata
css/
  main.css                  # Original styles (extracted verbatim)
  glass.css                 # Spatial/glassmorphism layer + splash + console/studio
  layouts.css               # 5 switchable structural layout presets
js/
  app.js                    # Original app logic (extracted verbatim)
  splash.js                 # 4-phase launch sequence
  console.js                # Control Console UI (theme/layout/CMS)
  studio.js                 # Studio wing (YouTube videos + archive) [module]
  services/
    analytics.js            # Google Analytics
    firebase.js             # Auth, Firestore, Storage, RBAC, real-time [module]
    siteConfig.js           # Global CMS/theme engine (Firestore-backed) [module]
    daraja.js               # M-Pesa STK-push client [module]
firestore.rules            # Security rules (RBAC: crown>admin>editor>viewer)
firebase.json              # Hosting + functions + rules config
functions/
  index.js                 # Daraja STK-push Cloud Function (secret-holding backend)
  package.json
```

**Load order is preserved** so the extracted logic behaves identically to the
original inline version.

---

## Features

- **Launch sequence** — logo draw → brand reveal → owner remark → auto-enter gallery.
- **Spatial design** — glassmorphism panels, animated ambient optics, 60fps micro-interactions, full `prefers-reduced-motion` support.
- **Control Console** (crown role only, in the Admin dashboard):
  - Live **palette** customizer (brand, accent, ink, surface, radius, glass opacity).
  - **5 layout presets** switcher (Editorial, Dense Grid, Spotlight, Soft Glass, Gallery Dark) — slots 6–10 reserved.
  - **CMS** for footer, socials, address, owner remark.
  - Changes **publish to Firestore** and apply for every visitor in real time.
- **Studio / Exhibition wing** — Process Studio (YouTube-embedded behind-the-scenes films with title/tags/description/timestamp) + Archive (non-sale masters). Managed from the **Studio Manager** admin tab.
- **Donate via M-Pesa** — button beside Commission; STK push through the Daraja Cloud Function.
- All original commerce intact: gallery, cart, likes, comments, orders (WhatsApp/Email/SMS), commissions, admin dashboard.

---

## Running locally

It's static — open `index.html`, or serve the folder:

```bash
npx serve .        # or: python3 -m http.server
```

Firebase features use the config already present in `js/services/firebase.js`.

---

## Deploying

```bash
npm install -g firebase-tools
firebase login
firebase use --add                 # select your Firebase project

firebase deploy --only firestore:rules,hosting
```

### Enabling M-Pesa donations (Daraja)

Secrets live **only** on the server — never in the site.

```bash
cd functions && npm install && cd ..

firebase functions:config:set \
  daraja.consumer_key="YOUR_KEY" \
  daraja.consumer_secret="YOUR_SECRET" \
  daraja.passkey="YOUR_PASSKEY" \
  daraja.shortcode="174379" \
  daraja.env="sandbox"             # "production" when live

firebase deploy --only functions
```

Then open the site → Admin → **Control Console → M-Pesa** and paste your
deployed `/stkpush` URL. The Donate button activates instantly. Until then it
shows a friendly "coming soon" — no fake values are ever displayed.

### Granting yourself the crown role

In Firestore, create `users/{your-auth-uid}` with field `role: crown`.
The Control Console and Studio Manager appear once you sign in.
