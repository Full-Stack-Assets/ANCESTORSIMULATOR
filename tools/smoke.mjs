// Smoke-test driver for the Ancestor Journey web game.
// Launches the game in real Chromium (via Playwright), selects each chapter
// from the archive and plays it end to end — mouse for the 2D screens
// (archive/title/detail/family/end), and for the open-world "map" screen,
// window.__ANC_DEBUG__.warpToWaypoint()/interact() to reach each waypoint
// without literally walking a compressed ocean (see world.js's
// debugWarpTo() doc comment — real play always reaches these by walking;
// this is a test-only shortcut). Saves a screenshot at every stage. Fails
// loudly on any console error or a click that finds no matching button.
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

  await page.goto(`${BASE_URL}/index.html?debug=1`);
  await page.waitForTimeout(300);
  await shot(page, '00-archive');
  await assertScreen(page, 'archive');

  const archiveState = await debugState(page);
  console.log('chapters available:', archiveState.chapterCount);
  if (archiveState.chapterCount < 2)
    throw new Error(`expected >=2 chapters, got ${archiveState.chapterCount}`);

  // Play every chapter by mouse, in order, verifying it returns to the
  // archive with the RIGHT chapter's data each time (not stale state from
  // a previous playthrough).
  for (let c = 0; c < archiveState.chapterCount; c++) {
    await playChapterByMouse(page, c, `chapter${c}`);
  }

  // Keyboard-only pass: select the second card by arrow keys + Enter from the
  // archive, then drive one full node by keyboard alone.
  await assertScreen(page, 'archive');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(100);
  const kbArchive = await debugState(page);
  if (kbArchive.chapterFocus !== 1)
    throw new Error(`ArrowRight did not move chapterFocus to 1 (got ${kbArchive.chapterFocus})`);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  const afterKbSelect = await debugState(page);
  if (afterKbSelect.screen !== 'title')
    throw new Error(`keyboard chapter select did not reach title (screen=${afterKbSelect.screen})`);
  await shot(page, '99-keyboard-select-title');

  await page.keyboard.press('Enter'); // Begin the Journey
  await page.waitForTimeout(300);
  await assertScreen(page, 'map');

  // Real keyboard movement in the open world (not the debug warp): hold "w"
  // for a beat and confirm the player actually moved, proving WASD drives
  // the Three.js player controller and not just the debug shortcut.
  const before = (await debugState(page)).world.player;
  await page.keyboard.down('w');
  await page.waitForTimeout(500);
  await page.keyboard.up('w');
  await page.waitForTimeout(100);
  const afterWalk = (await debugState(page)).world.player;
  const moved = Math.hypot(afterWalk.x - before.x, afterWalk.z - before.z);
  if (moved < 0.5)
    throw new Error(`holding "w" did not move the player (moved ${moved.toFixed(2)} units)`);
  console.log(`[keyboard] walked ${moved.toFixed(2)} units via real WASD input`);
  await shot(page, '99-keyboard-world-walked');

  // Reach a waypoint deterministically (see the mouse pass above for why)
  // and confirm "e" opens it.
  await page.evaluate(() => window.__ANC_DEBUG__.warpToWaypoint(0));
  await page.waitForTimeout(200);
  await page.keyboard.press('e');
  await page.waitForTimeout(150);
  const kbDetail = await debugState(page);
  if (kbDetail.screen !== 'detail')
    throw new Error(`keyboard "e" at a waypoint did not open detail (screen=${kbDetail.screen})`);
  await shot(page, '99-keyboard-detail');

  await browser.close();

  if (errors.length) {
    console.error('CONSOLE ERRORS DETECTED:');
    for (const e of errors) console.error(' -', e);
    process.exit(1);
  }
  console.log(`OK — screenshots in ${OUT_DIR}`);
}

/** Select chapter `index` from the archive by mouse, play its full loop
 * (every waypoint -> family -> end), and return to the archive. */
async function playChapterByMouse(page, index, prefix) {
  await assertScreen(page, 'archive');
  await clickButtonAt(page, index);
  await page.waitForTimeout(200);
  const afterSelect = await debugState(page);
  if (afterSelect.screen !== 'title')
    throw new Error(
      `selecting chapter ${index} did not reach title (screen=${afterSelect.screen})`
    );
  const chapterId = afterSelect.chapterId;
  await shot(page, `${prefix}-01-title`);

  await clickFirstButton(page); // Begin the Journey
  await page.waitForTimeout(300); // let the Three.js scene finish its first frame
  await shot(page, `${prefix}-02-world`);
  await assertScreen(page, 'map');

  const mapState = await debugState(page);
  const waypointCount = mapState.waypointCount;
  console.log(`[${prefix}] chapter=${chapterId} waypoints=${waypointCount}`);
  if (!waypointCount || waypointCount < 1)
    throw new Error(`chapter ${chapterId} reports ${waypointCount} waypoints`);
  if (!mapState.world) throw new Error(`[${prefix}] map screen reports no world state`);

  for (let i = 0; i < waypointCount; i++) {
    await page.evaluate((idx) => window.__ANC_DEBUG__.warpToWaypoint(idx), i);
    await page.waitForTimeout(200); // one render tick to register proximity
    const approached = await debugState(page);
    if (!approached.world || approached.world.interactable !== i) {
      throw new Error(
        `[${prefix}] warping to waypoint ${i} did not register as interactable (world=${JSON.stringify(approached.world)})`
      );
    }
    await page.evaluate(() => window.__ANC_DEBUG__.interact());
    await page.waitForTimeout(150);
    const afterOpen = await debugState(page);
    if (afterOpen.screen !== 'detail') {
      throw new Error(
        `[${prefix}] interacting with waypoint ${i} did not open detail (screen=${afterOpen.screen})`
      );
    }
    await shot(page, `${prefix}-03-detail-${i}`);
    await clickFirstButton(page); // Continue / Close / (last node) Family & Legacy
    await page.waitForTimeout(250); // re-entering the world reloads the Three.js scene
  }

  await shot(page, `${prefix}-04-family`);
  await assertScreen(page, 'family');

  await clickFirstButton(page); // Continue -> end
  await page.waitForTimeout(150);
  await shot(page, `${prefix}-05-end`);
  await assertScreen(page, 'end');

  await clickFirstButton(page); // Return to the Archive
  await page.waitForTimeout(150);
  await assertScreen(page, 'archive');
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

/** Click the button at a specific index on the current screen (map nodes,
 * archive chapter cards — anywhere buttons are added in a stable order). */
async function clickButtonAt(page, index) {
  const s = await debugState(page);
  const btn = s.buttons[index];
  if (!btn)
    throw new Error(
      `no button at index ${index} (screen=${s.screen}, buttons=${s.buttons.length})`
    );
  await clickCanvasRect(page, btn);
}

/** Click whatever the single primary button on screen is (title/detail/family/end all expose exactly one actionable button as buttons[0] in this vertical slice). */
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
