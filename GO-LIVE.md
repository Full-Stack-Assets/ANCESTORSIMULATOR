# Going live — turning on payments

Everything needed to sell **Ancestor Journey Pro** is already wired. The app
ships in free mode until you connect a store, and the Pro dialog says so
honestly (no broken or fake checkout). To start earning you only need to create
a Lemon Squeezy store and paste one URL.

**Why Lemon Squeezy?** It's the **merchant of record** — it collects payment and
**handles global sales tax / VAT for you** — and it issues **license keys** that
this app validates directly from the browser. So there is **no server to run**,
no Stripe account, no tax plumbing, and nothing about the customer or their
family tree is ever sent to a backend of ours. (Prefer a different provider?
See "Swapping providers" below.)

## One-time setup (≈10 minutes)

1. **Create a store** at <https://lemonsqueezy.com> and complete payout/tax
   onboarding.
2. **Create a product** — "Ancestor Journey Pro":
   - Pricing: **one-time**, **$29** (or whatever you choose — the number in
     `src/monetize.js` is display-only; the real charge is whatever the product
     is set to).
   - Turn on **License keys** for the product (Product → *License keys* →
     enable). Activation limit can be left at the default; this app uses
     *validation*, which doesn't consume activations.
3. **Copy the product's checkout URL** — the "buy" link, e.g.
   `https://YOURSTORE.lemonsqueezy.com/buy/XXXXXXXX-XXXX-...`.
4. **Paste it into the config** at the top of [`src/monetize.js`](src/monetize.js):
   ```js
   export const CONFIG = {
     productName: 'Ancestor Journey Pro',
     priceDisplay: '$29 once',        // display only
     checkoutUrl: 'https://YOURSTORE.lemonsqueezy.com/buy/XXXXXXXX', // ← paste
     storeUrl: '',                    // optional
     tipUrl: '',                      // optional pay-what-you-want / support link
     validateLicenses: true,
   };
   ```
   Optionally also update the price shown on the landing page
   (`index.html`, the Pricing section) to match.
5. **Deploy** — commit and push; Vercel auto-deploys. That's it.

## The customer flow (already built)

1. Customer clicks **Get Pro** → **Unlock Pro** → your Lemon Squeezy checkout
   opens in a new tab.
2. They pay; Lemon Squeezy emails them a **license key**.
3. Back in the app, they open **Get Pro → "I already have a license key"**,
   paste it, and click **Activate**. The key is validated against Lemon
   Squeezy's public license API and cached in `localStorage`; Pro features
   (keepsake export, Ultra fidelity, saved journeys) unlock immediately.

## Verifying before you announce

- Put the store in **test mode** and run a test purchase, or issue yourself a
  license key from the dashboard.
- In the app, activate that key and confirm the **✦ Get Pro** button flips to
  **✦ Pro active** and the keepsake/journeys features unlock.
- Confirm the honest-degrade path still works with `checkoutUrl` blank (the
  dialog should say checkout isn't connected yet).

## Notes & limits

- **Per-device unlock.** Entitlement is cached in the browser's `localStorage`,
  so a customer re-activates with their key on each device/browser. This is the
  standard trade-off for a no-backend product and is fine for a one-time
  purchase. If you later want cross-device accounts, that's the point at which a
  small backend becomes worth adding — not before.
- **No tracking.** There is deliberately no analytics or ad SDK. If you want
  conversion numbers, Lemon Squeezy's own dashboard has sales analytics without
  adding any tracking to the site.

## Swapping providers

`src/monetize.js` is the single integration point. To use a different
license-key provider (Gumroad, Paddle, your own):

- Point `startCheckout()` at that provider's checkout URL.
- Replace the fetch in `activateLicense()` with that provider's key-verification
  endpoint (or set `validateLicenses: false` to accept any non-empty key with no
  online check — simplest, least secure).

Nothing else in the app needs to change.
