// Smoke test for the Pro (freemium) monetization path.
// Verifies: the Pro dialog opens and lists features; an unconfigured checkout
// degrades honestly (no fake purchase); the end-screen keepsake export is gated
// (opens the upsell when locked) and actually downloads a PNG once Pro is
// active. Uses the test-only entitlement hook window.__ANC_MONETIZE__.setPro
// (never a real purchase). Complements smoke.mjs and smoke_import.mjs.
//
// Usage: node tools/smoke_pro.mjs http://127.0.0.1:8917 /tmp/anc-pro-shots
// Set PW_CHROMIUM_PATH to use a preinstalled Chromium.

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const BASE_URL = process.argv[2] || 'http://127.0.0.1:8917';
const OUT_DIR = process.argv[3] || '/tmp/anc-pro-shots';
mkdirSync(OUT_DIR, { recursive: true });

const errors = [];
const failures = [];
const expect = (c, m) => { if (!c) failures.push(m); };

const launchOpts = process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {};
const browser = await chromium.launch(launchOpts);
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

const debugState = () => page.evaluate(() => window.__ANC_DEBUG_STATE__());
async function clickCanvasButton(index) {
  const s = await debugState();
  const b = s.buttons[index];
  if (!b) throw new Error(`no canvas button ${index} on ${s.screen} (has ${s.buttons.length})`);
  const box = await page.locator('#stage').boundingBox();
  await page.mouse.click(box.x + ((b.x + b.w / 2) * box.width) / 960, box.y + ((b.y + b.h / 2) * box.height) / 540);
}

await page.goto(`${BASE_URL}/play.html`);
await page.waitForTimeout(300);

// 1. Pro dialog opens and lists the feature set.
await page.click('#pro-btn');
await page.waitForTimeout(150);
expect(await page.isVisible('#pro-modal'), 'Pro modal did not open');
const featureCount = await page.$$eval('#pro-features li', (els) => els.length);
expect(featureCount === 3, `expected 3 Pro features, got ${featureCount}`);
const soon = await page.$$eval('.pf-soon', (els) => els.length);
expect(soon >= 1, 'expected at least one "coming soon" feature');
await page.screenshot({ path: path.join(OUT_DIR, '01-pro-modal.png') });

// 2. Unconfigured checkout degrades honestly (no fake purchase).
await page.click('#pro-buy');
await page.waitForTimeout(150);
const status = await page.textContent('#pro-status');
expect(/isn.t connected/i.test(status || ''), `unconfigured checkout message missing (got: ${JSON.stringify(status)})`);

await page.keyboard.press('Escape');
await page.waitForTimeout(100);
expect(!(await page.isVisible('#pro-modal')), 'Escape did not close the Pro modal');

// 3. Walk the first built-in chapter to the end screen.
await clickCanvasButton(0); // pick chapter 0 -> title
await page.waitForTimeout(200);
await clickCanvasButton(0); // Begin -> world
await page.waitForTimeout(300);
const wpCount = (await debugState()).waypointCount;
for (let i = 0; i < wpCount; i++) {
  await page.evaluate((idx) => window.__ANC_DEBUG__.warpToWaypoint(idx), i);
  await page.waitForTimeout(150);
  await page.evaluate(() => window.__ANC_DEBUG__.interact());
  await page.waitForTimeout(120);
  await clickCanvasButton(0); // Continue / Family & Legacy
  await page.waitForTimeout(200);
}
// now on family screen
expect((await debugState()).screen === 'family', 'did not reach family screen');
await clickCanvasButton(0); // -> end
await page.waitForTimeout(150);
expect((await debugState()).screen === 'end', 'did not reach end screen');
await page.screenshot({ path: path.join(OUT_DIR, '02-end-locked.png') });

// 4. Locked: the keepsake button (buttons[1]) opens the upsell, not a download.
await clickCanvasButton(1);
await page.waitForTimeout(150);
expect(await page.isVisible('#pro-modal'), 'locked keepsake did not open the Pro upsell');
await page.keyboard.press('Escape');
await page.waitForTimeout(100);

// 5. Unlock Pro (test hook) and confirm the keepsake now downloads a PNG.
await page.evaluate(() => window.__ANC_MONETIZE__.setPro(true));
await page.waitForTimeout(150);
let downloaded = null;
try {
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 4000 }),
    clickCanvasButton(1),
  ]);
  downloaded = dl.suggestedFilename();
} catch {
  /* handled by the assertion below */
}
expect(!!downloaded && /\.png$/.test(downloaded), `keepsake did not download a PNG (got: ${downloaded})`);
await page.screenshot({ path: path.join(OUT_DIR, '03-end-unlocked.png') });

await browser.close();
if (errors.length) { console.error('CONSOLE ERRORS:'); errors.forEach((e) => console.error(' -', e)); }
if (failures.length) { console.error('FAILURES:'); failures.forEach((f) => console.error(' -', f)); }
if (errors.length || failures.length) process.exit(1);
console.log(`OK — Pro gate verified (downloaded ${downloaded}); screenshots in ${OUT_DIR}`);
