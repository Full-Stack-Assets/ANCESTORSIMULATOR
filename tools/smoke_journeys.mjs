// Smoke test for the "Saved journeys" Pro feature.
// - Without Pro, the "My journeys" button opens the upsell (gated).
// - With Pro, walking ancestors saves journeys that show up in the list, can be
//   deleted, and can be resumed. On-device only; zero console errors.
//
// Usage: node tools/smoke_journeys.mjs http://127.0.0.1:8917 /tmp/anc-journeys-shots
// Set PW_CHROMIUM_PATH to use a preinstalled Chromium.

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const BASE_URL = process.argv[2] || 'http://127.0.0.1:8917';
const OUT_DIR = process.argv[3] || '/tmp/anc-journeys-shots';
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
  if (!b) throw new Error(`no canvas button ${index} on ${s.screen}`);
  const box = await page.locator('#stage').boundingBox();
  await page.mouse.click(box.x + ((b.x + b.w / 2) * box.width) / 960, box.y + ((b.y + b.h / 2) * box.height) / 540);
}

// Play a chapter (by archive index) from start to end, back to the archive.
async function playChapter(index) {
  await clickCanvasButton(index); // pick -> title
  await page.waitForTimeout(200);
  await clickCanvasButton(0); // Begin -> world
  await page.waitForTimeout(300);
  const wp = (await debugState()).waypointCount;
  for (let i = 0; i < wp; i++) {
    await page.evaluate((idx) => window.__ANC_DEBUG__.warpToWaypoint(idx), i);
    await page.waitForTimeout(130);
    await page.evaluate(() => window.__ANC_DEBUG__.interact());
    await page.waitForTimeout(100);
    await clickCanvasButton(0);
    await page.waitForTimeout(170);
  }
  await clickCanvasButton(0); // family -> end
  await page.waitForTimeout(110);
  await clickCanvasButton(0); // end -> archive
  await page.waitForTimeout(140);
}

await page.goto(`${BASE_URL}/play.html`);
await page.waitForTimeout(300);

// Gate: without Pro, "My journeys" opens the upsell, not the list.
await page.click('#journeys-btn');
await page.waitForTimeout(150);
expect(await page.isVisible('#pro-modal'), 'My journeys should open the Pro upsell when locked');
expect(!(await page.isVisible('#journeys-modal')), 'journeys list should stay closed when locked');
await page.keyboard.press('Escape');
await page.waitForTimeout(100);

// Unlock Pro, then walk BOTH built-in chapters (each auto-saves).
await page.evaluate(() => window.__ANC_MONETIZE__.setPro(true));
await playChapter(0);
await playChapter(1);
expect((await debugState()).screen === 'archive', 'did not return to the archive');

// Both walked ancestors should be saved.
await page.click('#journeys-btn');
await page.waitForTimeout(150);
expect(await page.isVisible('#journeys-modal'), 'journeys list should open when Pro');
const count = await page.$$eval('#journeys-list .journey-item', (els) => els.length);
expect(count === 2, `expected 2 saved journeys, got ${count}`);
await page.screenshot({ path: path.join(OUT_DIR, '01-journeys.png') });

// Delete one.
await page.click('.journey-del');
await page.waitForTimeout(150);
const afterDelete = await page.$$eval('#journeys-list .journey-item', (els) => els.length);
expect(afterDelete === 1, `delete should leave 1 journey, got ${afterDelete}`);

// Resume the remaining one → back into the flow at the title.
await page.click('.journey-main');
await page.waitForTimeout(200);
const resumed = await debugState();
expect(resumed.screen === 'title', `resume should reach the title (got ${resumed.screen})`);
expect(resumed.chapterId, 'resume produced no chapter');
await page.screenshot({ path: path.join(OUT_DIR, '02-resumed.png') });

await browser.close();
if (errors.length) { console.error('CONSOLE ERRORS:'); errors.forEach((e) => console.error(' -', e)); }
if (failures.length) { console.error('FAILURES:'); failures.forEach((f) => console.error(' -', f)); }
if (errors.length || failures.length) process.exit(1);
console.log(`OK — saved journeys verified (saved 2, deleted 1, resumed 1); screenshots in ${OUT_DIR}`);
