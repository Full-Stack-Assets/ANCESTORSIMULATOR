// Smoke test for mobile / touch controls.
// In a touch-emulated context: the on-screen joystick appears once you're in
// the world, dragging it walks the player, and there are no console errors.
// Uses Pointer Events (fired by Playwright's mouse) against the joystick, which
// is exactly what a real touch drag triggers.
//
// Usage: node tools/smoke_mobile.mjs http://127.0.0.1:8917 /tmp/anc-mobile-shots
// Set PW_CHROMIUM_PATH to use a preinstalled Chromium.

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const BASE_URL = process.argv[2] || 'http://127.0.0.1:8917';
const OUT_DIR = process.argv[3] || '/tmp/anc-mobile-shots';
mkdirSync(OUT_DIR, { recursive: true });

const errors = [];
const failures = [];
const expect = (c, m) => { if (!c) failures.push(m); };

const launchOpts = process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {};
const browser = await chromium.launch(launchOpts);
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
const page = await context.newPage();
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

await page.goto(`${BASE_URL}/play.html`);
await page.waitForTimeout(300);

// Joystick hidden until we're actually in the world.
expect(!(await page.locator('#touch-controls').evaluate((el) => el.classList.contains('visible'))),
  'touch controls should be hidden on the archive screen');

await clickCanvasButton(0); // pick a chapter -> title
await page.waitForTimeout(200);
await clickCanvasButton(0); // Begin -> world
await page.waitForTimeout(400);
expect((await debugState()).screen === 'map', 'did not reach the world');
expect(await page.locator('#touch-controls').evaluate((el) => el.classList.contains('visible')),
  'touch controls should be visible in the world');
await page.screenshot({ path: path.join(OUT_DIR, '01-world-joystick.png') });

// Drag the joystick "up" (forward) and confirm the player actually walks.
const before = (await debugState()).world.player;
const jb = await page.locator('#joystick').boundingBox();
const cx = jb.x + jb.width / 2;
const cy = jb.y + jb.height / 2;
await page.mouse.move(cx, cy);
await page.mouse.down();
await page.mouse.move(cx, cy - 44, { steps: 4 }); // push forward
await page.waitForTimeout(600);
const during = (await debugState()).world.player;
await page.mouse.up();
await page.waitForTimeout(100);
const after = (await debugState()).world.player;

const moved = Math.hypot(during.x - before.x, during.z - before.z);
expect(moved > 1, `joystick did not move the player (moved ${moved.toFixed(2)} units)`);
// After release the axis resets, so movement should stop.
await page.waitForTimeout(150);
const settled = (await debugState()).world.player;
expect(Math.hypot(settled.x - after.x, settled.z - after.z) < 0.4, 'player kept moving after releasing the joystick');
await page.screenshot({ path: path.join(OUT_DIR, '02-after-walk.png') });

await browser.close();
if (errors.length) { console.error('CONSOLE ERRORS:'); errors.forEach((e) => console.error(' -', e)); }
if (failures.length) { console.error('FAILURES:'); failures.forEach((f) => console.error(' -', f)); }
if (errors.length || failures.length) process.exit(1);
console.log(`OK — mobile joystick verified (walked ${moved.toFixed(2)} units); screenshots in ${OUT_DIR}`);
