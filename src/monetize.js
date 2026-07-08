// Monetization — freemium with a one-time "Pro" unlock.
//
// Deliberately backend-free and privacy-first, to match the rest of the
// product:
//   - Purchase happens on Lemon Squeezy's HOSTED checkout. Lemon Squeezy is the
//     merchant of record, so they handle global sales tax/VAT — the owner needs
//     no server, no Stripe account, no tax plumbing.
//   - The buyer receives a license key, which this module validates DIRECTLY
//     against Lemon Squeezy's public license API and caches in localStorage.
//     No backend of ours ever sees it.
//   - There is NO analytics, NO ad network, NO tracking, and nothing about the
//     user's family tree is ever transmitted anywhere. Monetization touches the
//     network only when the user themselves clicks "buy" or "activate".
//
// Until the owner fills in CONFIG (their store's checkout URL + product), the
// app runs fully in free mode and the Pro dialog says so honestly — it never
// shows a broken or fake checkout.

export const CONFIG = {
  // ─────────────────────────────────────────────────────────────────────────
  // OWNER SETUP: paste these from your Lemon Squeezy dashboard.
  //   1. Create a store + a one-time product ("Ancestor Journey Pro").
  //   2. Enable license keys on the product (Settings → License keys).
  //   3. Put the product's checkout URL in `checkoutUrl`.
  // Leaving these blank keeps the app in free mode with an honest "not yet
  // available" message — nothing breaks.
  // ─────────────────────────────────────────────────────────────────────────
  productName: 'Ancestor Journey Pro',
  priceDisplay: '$29 once', // display only — the real price lives in Lemon Squeezy
  checkoutUrl: '', // e.g. 'https://YOURSTORE.lemonsqueezy.com/buy/XXXXXXXX'
  storeUrl: '', // optional 'view all' / support landing
  tipUrl: '', // optional pay-what-you-want / tip link
  validateLicenses: true, // check keys against Lemon Squeezy's license API
};

// Lemon Squeezy's public, keyless license endpoints (safe to call from the
// browser; designed for exactly this — desktop/web apps validating a buyer's
// key without shipping a secret).
const LS_VALIDATE_URL = 'https://api.lemonsqueezy.com/v1/licenses/validate';
const STORE_KEY = 'anc_pro_entitlement_v1';

// The Pro feature set. Only those actually implemented are gated live today;
// the rest are declared so the upsell can advertise the roadmap honestly.
export const PRO_FEATURES = {
  keepsake_export: {
    name: 'Keepsake postcard',
    desc: 'Download a shareable postcard of any ancestor’s journey — title, lifespan, and every stop.',
    live: true,
  },
  ultra_fidelity: {
    name: 'Ultra visual fidelity',
    desc: 'Sharper shadows and a denser, richer world.',
    live: true,
  },
  unlimited_worlds: {
    name: 'Saved journeys',
    desc: 'Save every ancestor you’ve walked and pick up where you left off.',
    live: true,
  },
};

// ---- Entitlement state (localStorage; a one-time unlock never expires) ------

function readEntitlement() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeEntitlement(ent) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(ent));
  } catch {
    /* private-mode / storage disabled — Pro just won't persist */
  }
}

export function hasPro() {
  const ent = readEntitlement();
  return !!(ent && ent.status === 'active');
}

export function proStatusLabel() {
  return hasPro() ? '✦ Pro active' : '✦ Get Pro';
}

export function deactivate() {
  try {
    localStorage.removeItem(STORE_KEY);
  } catch {
    /* ignore */
  }
}

// True when a feature exists and is Pro-gated and the user hasn't unlocked it.
export function isLocked(featureKey) {
  return featureKey in PRO_FEATURES && !hasPro();
}

// ---- Purchase + activation --------------------------------------------------

export function isConfigured() {
  return !!CONFIG.checkoutUrl;
}

/**
 * Open Lemon Squeezy's hosted checkout in a new tab. Returns false (and does
 * nothing) if the owner hasn't configured a checkout URL yet, so the caller
 * can show an honest "not yet available" message instead.
 */
export function startCheckout() {
  const url = CONFIG.checkoutUrl || CONFIG.storeUrl;
  if (!url) return false;
  window.open(url, '_blank', 'noopener');
  return true;
}

/**
 * Validate a license key against Lemon Squeezy and, if valid, grant Pro on
 * this device. Fully client-side.
 * @returns {Promise<{ok: boolean, message: string}>}
 */
export async function activateLicense(rawKey) {
  const key = (rawKey || '').trim();
  if (!key) return { ok: false, message: 'Enter the license key from your purchase email.' };

  if (!CONFIG.validateLicenses) {
    // Owner opted out of online validation — accept any non-empty key locally.
    writeEntitlement({ status: 'active', key, activatedAt: Date.now(), mode: 'local' });
    return { ok: true, message: 'Pro unlocked on this device.' };
  }

  try {
    const res = await fetch(LS_VALIDATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ license_key: key }),
    });
    const data = await res.json().catch(() => ({}));
    // Lemon Squeezy's /validate returns { valid, error, license_key: { status } }.
    const status = data && data.license_key && data.license_key.status;
    if (res.ok && data && data.valid && (!status || status === 'active')) {
      writeEntitlement({ status: 'active', key, activatedAt: Date.now(), mode: 'lemonsqueezy' });
      return { ok: true, message: 'Thank you — Pro is unlocked on this device.' };
    }
    if (status === 'expired') return { ok: false, message: 'That license has expired.' };
    if (status === 'disabled') return { ok: false, message: 'That license has been disabled.' };
    return { ok: false, message: (data && data.error) || 'That key could not be validated — check for typos.' };
  } catch {
    return { ok: false, message: 'Could not reach the license server. Check your connection and try again.' };
  }
}

// Test-only hook: lets the smoke test toggle entitlement without a real
// purchase. Guarded behind an explicit call; never invoked in normal play.
export function __setProForTest(on) {
  if (on) writeEntitlement({ status: 'active', key: 'TEST', activatedAt: Date.now(), mode: 'test' });
  else deactivate();
}
