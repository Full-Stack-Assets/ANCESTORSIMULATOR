// Smoke-test driver for the Ancestor Journey web game.
// Launches the game in real Chromium (via Playwright), clicks through the
// full Josiah Albertson vertical slice end to end using REAL mouse events at
// the game's own reported button positions (window.__ANC_DEBUG_STATE__ —
// exposed by src/main.js for exactly this purpose), and saves a screenshot
// at every stage. Fails loudly on any console error or a click that finds
// no matching button.
//
// Usage (serve the repo root first, e.g. `npm run serve`):
//   node tools/smoke.mjs http://127.0.0.1:8917 /tmp/anc-shots

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const BASE_URL = process.argv[2] || 'http://127.0.0.1:8917';
const OUT_DIR = process.argv[3] || '/tmp/anc-shots';

mkdirSync(OUT_DIR, { recursive: true });

const errors = [];

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));

  await page.goto(`${BASE_URL}/index.html`);
  await page.waitForTimeout(300);
  await shot(page, '01-title');
  await assertScreen(page, 'title');

  await clickFirstButton(page);
  await page.waitForTimeout(200);
  await shot(page, '02-map');
  await assertScreen(page, 'map');

  const waypointCount = await page.evaluate(() => window.__ANC_WAYPOINT_COUNT__ ?? null);
  console.log('waypoint count reported by page:', waypointCount);
  if (waypointCount !== 6) throw new Error(`expected 6 waypoints, page reports ${waypointCount}`);

  for (let i = 0; i < waypointCount; i++) {
    // node buttons are the first `progress+1` buttons on the map screen
    await clickButtonAt(page, i);
    await page.waitForTimeout(150);
    const afterOpen = await debugState(page);
    if (afterOpen.screen !== 'detail') {
      throw new Error(`clicking node ${i} did not open detail (screen=${afterOpen.screen})`);
    }
    await shot(page, `03-detail-${i}`);

    await clickFirstButton(page); // Continue / Close / (on the last node) See Family & Legacy
    await page.waitForTimeout(150);
  }

  await shot(page, '04-family');
  await assertScreen(page, 'family');

  await clickFirstButton(page); // Continue -> end
  await page.waitForTimeout(150);
  await shot(page, '05-end');
  await assertScreen(page, 'end');

  // Keyboard navigation: Play Again (Enter on the end screen's single button),
  // then drive the whole map screen by keyboard alone for one node.
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  await assertScreen(page, 'title');
  await page.keyboard.press('Enter'); // Begin the Journey
  await page.waitForTimeout(150);
  await assertScreen(page, 'map');
  await page.keyboard.press('Enter'); // open the focused (only reachable) node
  await page.waitForTimeout(150);
  const kbState = await debugState(page);
  if (kbState.screen !== 'detail') throw new Error(`keyboard Enter on map did not open detail (screen=${kbState.screen})`);
  await shot(page, '06-keyboard-detail');

  await browser.close();

  if (errors.length) {
    console.error('CONSOLE ERRORS DETECTED:');
    for (const e of errors) console.error(' -', e);
    process.exit(1);
  }
  console.log(`OK — screenshots in ${OUT_DIR}`);
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`) });
}

async function debugState(page) {
  return page.evaluate(() => window.__ANC_DEBUG_STATE__());
}

async function assertScreen(page, expected) {
  const s = await debugState(page);
  if (s.screen !== expected) {
    throw new Error(`expected screen "${expected}", got "${s.screen}"`);
  }
}

/** Click the current furthest-progress node on the map screen (index-th button). */
async function clickButtonAt(page, index) {
  const s = await debugState(page);
  const btn = s.buttons[index];
  if (!btn) throw new Error(`no button at index ${index} (screen=${s.screen}, buttons=${s.buttons.length})`);
  await clickCanvasRect(page, btn);
}

/** Click whatever the single primary button on screen is (title/detail/end all expose exactly one actionable button as buttons[0] in this vertical slice). */
async function clickFirstButton(page) {
  const s = await debugState(page);
  if (!s.buttons.length) throw new Error(`no clickable buttons on screen "${s.screen}"`);
  await clickCanvasRect(page, s.buttons[0]);
}

async function clickCanvasRect(page, rect) {
  const box = await page.locator('#stage').boundingBox();
  const scaleX = box.width / 960;
  const scaleY = box.height / 540;
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  await page.mouse.click(box.x + cx * scaleX, box.y + cy * scaleY);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
