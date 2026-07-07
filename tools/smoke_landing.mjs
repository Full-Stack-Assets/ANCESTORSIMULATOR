// Smoke test for the landing page (index.html).
// Verifies it loads with zero console errors, the primary CTAs point at the
// game (play.html), and the SEO/OpenGraph tags are present. Saves a full-page
// screenshot. Complements the game/import/pro smoke drivers.
//
// Usage: node tools/smoke_landing.mjs http://127.0.0.1:8917 /tmp/anc-landing-shots
// Set PW_CHROMIUM_PATH to use a preinstalled Chromium.

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const BASE_URL = process.argv[2] || 'http://127.0.0.1:8917';
const OUT_DIR = process.argv[3] || '/tmp/anc-landing-shots';
mkdirSync(OUT_DIR, { recursive: true });

const errors = [];
const failures = [];
const expect = (c, m) => { if (!c) failures.push(m); };

const launchOpts = process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {};
const browser = await chromium.launch(launchOpts);
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(`${BASE_URL}/index.html`);
await page.waitForTimeout(300);

// Every primary CTA should lead into the game.
const ctas = await page.$$eval('a.btn', (els) => els.map((e) => e.getAttribute('href')));
expect(ctas.length >= 3, `expected several CTA buttons, got ${ctas.length}`);
expect(ctas.every((h) => h === 'play.html'), `some CTA does not point to play.html: ${JSON.stringify(ctas)}`);

// The hero image must actually load (it's the OG image too).
const heroOk = await page.$eval('.hero-shot img', (img) => img.complete && img.naturalWidth > 0).catch(() => false);
expect(heroOk, 'hero image failed to load');

// SEO / OpenGraph essentials.
const og = await page.evaluate(() => ({
  title: document.querySelector('meta[property="og:title"]')?.content,
  image: document.querySelector('meta[property="og:image"]')?.content,
  desc: document.querySelector('meta[name="description"]')?.content,
  ld: !!document.querySelector('script[type="application/ld+json"]'),
}));
expect(!!og.title && !!og.image, 'missing OpenGraph title/image');
expect(!!og.desc, 'missing meta description');
expect(og.ld, 'missing JSON-LD structured data');

// Pricing section present with both plans.
const plans = await page.$$eval('.plan h3', (els) => els.map((e) => e.textContent));
expect(plans.includes('Free') && plans.includes('Pro'), `pricing plans missing: ${JSON.stringify(plans)}`);

await page.screenshot({ path: path.join(OUT_DIR, 'landing-full.png'), fullPage: true });

await browser.close();
if (errors.length) { console.error('CONSOLE ERRORS:'); errors.forEach((e) => console.error(' -', e)); }
if (failures.length) { console.error('FAILURES:'); failures.forEach((f) => console.error(' -', f)); }
if (errors.length || failures.length) process.exit(1);
console.log(`OK — landing verified (${ctas.length} CTAs → play.html); screenshot in ${OUT_DIR}`);
