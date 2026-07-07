// Smoke test for the "bring your own tree" import path.
// Loads the game in real Chromium, uploads a fixture GEDCOM to the client-side
// import, and verifies: the picker opens and lists the walkable individuals,
// search filters them, picking one builds a chapter and reaches the title, and
// "Begin the Journey" reaches the walkable 3D world — all with zero console
// errors. Complements tools/smoke.mjs (which covers the built-in chapters).
//
// Usage (serve the repo root first):
//   node tools/smoke_import.mjs http://127.0.0.1:8917 /tmp/anc-import-shots
// Set PW_CHROMIUM_PATH to use a preinstalled Chromium instead of a downloaded one.

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_URL = process.argv[2] || 'http://127.0.0.1:8917';
const OUT_DIR = process.argv[3] || '/tmp/anc-import-shots';
const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'sample.ged');

mkdirSync(OUT_DIR, { recursive: true });

const errors = [];
const failures = [];
const expect = (cond, msg) => { if (!cond) failures.push(msg); };

const launchOpts = process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {};
const browser = await chromium.launch(launchOpts);
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(`${BASE_URL}/play.html`);
await page.waitForTimeout(300);

await page.setInputFiles('#gedcom-input', FIXTURE);
await page.waitForTimeout(300);
expect(await page.isVisible('#picker'), 'picker did not open after import');
const items = await page.$$eval('.picker-item .pi-name', (els) => els.map((e) => e.textContent));
expect(items.length === 3, `expected 3 walkable people, got ${items.length}`);
await page.screenshot({ path: path.join(OUT_DIR, '01-picker.png') });

await page.fill('#picker-search', 'ann');
await page.waitForTimeout(150);
const filtered = await page.$$eval('.picker-item .pi-name', (els) => els.map((e) => e.textContent));
expect(filtered.length === 1 && filtered[0].includes('Ann'), `search filter failed: ${JSON.stringify(filtered)}`);
await page.fill('#picker-search', '');
await page.waitForTimeout(100);

await page.click('.picker-item');
await page.waitForTimeout(300);
const st1 = await page.evaluate(() => window.__ANC_DEBUG_STATE__());
expect(st1.screen === 'title', `picking an ancestor did not reach title (screen=${st1.screen})`);
expect(st1.waypointCount >= 2, `imported chapter has too few waypoints (${st1.waypointCount})`);
await page.screenshot({ path: path.join(OUT_DIR, '02-title.png') });

const btn = st1.buttons[0];
const box = await page.locator('#stage').boundingBox();
await page.mouse.click(box.x + ((btn.x + btn.w / 2) * box.width) / 960, box.y + ((btn.y + btn.h / 2) * box.height) / 540);
await page.waitForTimeout(500);
const st2 = await page.evaluate(() => window.__ANC_DEBUG_STATE__());
expect(st2.screen === 'map' && !!st2.world, `Begin did not reach the walkable world (screen=${st2.screen})`);
await page.screenshot({ path: path.join(OUT_DIR, '03-world.png') });

await browser.close();

if (errors.length) { console.error('CONSOLE ERRORS:'); errors.forEach((e) => console.error(' -', e)); }
if (failures.length) { console.error('FAILURES:'); failures.forEach((f) => console.error(' -', f)); }
if (errors.length || failures.length) process.exit(1);
console.log(`OK — import flow verified, screenshots in ${OUT_DIR}`);
