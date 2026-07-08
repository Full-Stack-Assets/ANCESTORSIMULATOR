// Ancestor Journey — the archive and its playable chapters.
// Plain canvas 2D, no dependencies, no build step. Open index.html directly
// or serve the repo root with any static file server.

import { JOSIAH } from './data/josiah.js';
import { WILLIAM } from './data/william.js';
import * as World from './world.js';
import { parseGedcom } from './gedcom.js';
import { listPlayableIndividuals, buildChapter } from './chapter.js';
import * as Monetize from './monetize.js';
import { downloadPostcard } from './postcard.js';

// One entry per playable ancestor. Add a new chapter by running
// tools/sync_ancestor.py for a reviewed ANC ancestor and adding it here.
const CHAPTERS = [
  { data: WILLIAM, teaser: 'An Irish Quaker who crossed an ocean to found a settlement.' },
  { data: JOSIAH, teaser: "His son — a shoemaker who never left the fifteen miles his father settled." },
];

const CONFIDENCE_COLOR = {
  documented: '#3ba55c',
  inferred: '#3b82c4',
  legend: '#9b59b6',
};
const CONFIDENCE_LABEL = {
  documented: 'DOCUMENTED',
  inferred: 'INFERRED',
  legend: 'LEGEND',
};
const CONFIDENCE_ICON = {
  documented: '✓', // check
  inferred: '?',
  legend: '✦', // four-pointed star
};

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');
const W = canvas.width;
const H = canvas.height;
const worldCanvas = document.getElementById('world');
const canvasStack = document.getElementById('canvas-stack');
const importBar = document.getElementById('import-bar');

// Touch device? Show the on-screen joystick and enable tap/drag controls.
const IS_TOUCH = (typeof window !== 'undefined') &&
  (window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0);
const touchControls = document.getElementById('touch-controls');

let worldInitialized = false;
let worldHudRunning = false;
let promptFlash = 0; // small pulse timer for the "press E" prompt

/** @type {{screen: string, chapter: object|null, chapterFocus: number, progress: number, activeIndex: number|null, focusIndex: number, buttons: Array}} */
const state = {
  screen: 'archive', // 'archive' | 'title' | 'map' | 'detail' | 'family' | 'end'
  chapter: null, // the selected CHAPTERS[i].data — set on leaving 'archive'
  chapterFocus: 0, // keyboard-focused chapter card on the archive screen
  progress: 0, // index of the furthest unlocked waypoint (0-based)
  activeIndex: null, // waypoint being viewed in the detail panel
  focusIndex: 0, // keyboard-focused node on the map screen (0..progress)
  buttons: [], // clickable rects for the current frame, hit-tested on click
};


function wrapText(text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function addButton(x, y, w, h, onClick) {
  state.buttons.push({ x, y, w, h, onClick });
}

function drawButton(x, y, w, h, label, primary = true) {
  ctx.fillStyle = primary ? '#3b6e4f' : '#3a4550';
  roundRect(x, y, w, h, 6);
  ctx.fill();
  ctx.fillStyle = '#f2efe6';
  ctx.font = '15px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2 + 1);
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function clearStage() {
  ctx.clearRect(0, 0, W, H);
  // simple colonial-countryside backdrop wash
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#cfe3ea');
  sky.addColorStop(1, '#e8ddb8');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(90, 120, 70, 0.35)';
  ctx.fillRect(0, H - 90, W, 90);
}

// ---------------------------------------------------------------------
// The open-world "map" screen. Rendering here is continuous (the player
// walks in real time), unlike every other screen, which only re-renders on
// input — see worldHudLoop().
// ---------------------------------------------------------------------

function enterWorld() {
  if (!worldInitialized) {
    World.initWorld(worldCanvas, canvas);
    World.setOnArrive(() => {}); // reserved for future ambient cues; interaction is polled in the HUD loop
    worldInitialized = true;
  }
  World.loadChapter(state.chapter, state.progress);
  canvasStack.classList.add('world-active');
  if (IS_TOUCH && touchControls) touchControls.classList.add('visible');
  World.start();
  worldHudRunning = true;
  requestAnimationFrame(worldHudLoop);
}

function exitWorld() {
  worldHudRunning = false;
  World.stop();
  canvasStack.classList.remove('world-active');
  if (touchControls) touchControls.classList.remove('visible');
}

function worldHudLoop() {
  if (!worldHudRunning) return;
  drawWorldHud();
  requestAnimationFrame(worldHudLoop);
}

function drawWorldHud() {
  const ws = World.getWorldState();
  const wp = state.chapter.waypoints[ws.interactable];
  ctx.clearRect(0, 0, W, H);
  state.buttons = [];

  // compass, top center
  ctx.textAlign = 'center';
  ctx.font = 'bold 13px Arial, sans-serif';
  const heading = (((-ws.player.yaw * 180) / Math.PI) % 360 + 360) % 360;
  ctx.fillStyle = 'rgba(20,26,32,0.75)';
  roundRect(W / 2 - 90, 14, 180, 26, 6);
  ctx.fill();
  ctx.fillStyle = '#f2efe6';
  ctx.fillText(`${state.chapter.name} — ${compassLabel(heading)}`, W / 2, 32);

  drawMinimap(World.getMarkerLayout());

  if (wp) {
    promptFlash += 0.08;
    const pulse = 0.85 + Math.sin(promptFlash) * 0.15;
    const label = `Press E to examine: ${wp.event}`;
    ctx.font = 'bold 16px Georgia, serif';
    const pw = ctx.measureText(label).width + 48;
    const px = W / 2 - pw / 2, py = H - 76;
    ctx.fillStyle = `rgba(242, 193, 78, ${pulse})`;
    roundRect(px, py, pw, 42, 8);
    ctx.fill();
    ctx.fillStyle = '#1c2530';
    ctx.fillText(label, W / 2, py + 27);
    addButton(px, py, pw, 42, () => interactWithWorld());
  } else {
    ctx.font = 'italic 13px Georgia, serif';
    ctx.fillStyle = 'rgba(28,37,48,0.85)';
    ctx.fillText('Walk toward the glowing marker to continue the journey.', W / 2, H - 30);
  }
}

// Small top-right inset showing every reached/frontier waypoint relative to
// the player, plus a heading arrow — the walking-game equivalent of the
// radar/minimap HUD element every open-world reference build has.
const MINIMAP_SIZE = 128;
const MINIMAP_MARGIN = 14;

function drawMinimap(layout) {
  const size = MINIMAP_SIZE;
  const mx = W - size - MINIMAP_MARGIN;
  const my = MINIMAP_MARGIN;
  const scale = (size / 2 - 12) / Math.max(60, layout.extent);
  const cx = mx + size / 2;
  const cy = my + size / 2;

  ctx.save();
  ctx.fillStyle = 'rgba(20,26,32,0.75)';
  roundRect(mx, my, size, size, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(242,239,230,0.35)';
  ctx.lineWidth = 1;
  roundRect(mx, my, size, size, 8);
  ctx.stroke();

  ctx.beginPath();
  roundRect(mx, my, size, size, 8);
  ctx.clip();

  // World-space to minimap-space: player always stays centered so the map
  // reads as "what's around me" rather than needing the player located.
  const toMap = (x, z) => ({
    mx: cx + (x - layout.player.x) * scale,
    my: cy + (z - layout.player.z) * scale,
  });

  for (const m of layout.markers) {
    if (!m.reached && !m.isFrontier) continue;
    const p = toMap(m.x, m.z);
    ctx.beginPath();
    ctx.arc(p.mx, p.my, m.isFrontier ? 4.5 : 3, 0, Math.PI * 2);
    ctx.fillStyle = m.isFrontier ? '#f2c14e' : '#8fd0a0';
    ctx.fill();
  }

  // Player as a heading arrow, always at the map's center. Forward in world
  // space is (-sin(yaw), -cos(yaw)) in (x,z) (see world.js's step()); negate
  // yaw here so the arrow rotates the same direction the player turns.
  ctx.translate(cx, cy);
  ctx.rotate(-layout.player.yaw);
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(5, 6);
  ctx.lineTo(-5, 6);
  ctx.closePath();
  ctx.fillStyle = '#e8534a';
  ctx.fill();
  ctx.restore();
}

function compassLabel(heading) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(heading / 45) % 8];
}

function interactWithWorld() {
  const ws = World.getWorldState();
  if (ws.interactable == null) return;
  exitWorld();
  state.activeIndex = ws.interactable;
  state.screen = 'detail';
  render();
}

function render() {
  state.buttons = [];
  // The "walk your own tree" bar belongs to the archive (menu) screen only.
  if (importBar) importBar.classList.toggle('hidden', state.screen !== 'archive');
  refreshProButton();
  clearStage();
  if (state.screen === 'archive') renderArchive();
  else if (state.screen === 'title') renderTitle();
  // 'map' is the open world — see enterWorld()/worldHudLoop(), which draw
  // continuously and are never driven through this event-triggered render().
  else if (state.screen === 'detail') renderDetail();
  else if (state.screen === 'family') renderFamily();
  else if (state.screen === 'end') renderEnd();
}

function renderArchive() {
  ctx.fillStyle = '#1c2530';
  ctx.textAlign = 'center';
  ctx.font = 'bold 34px Georgia, serif';
  ctx.fillText('THE ARCHIVE', W / 2, 90);
  ctx.font = 'italic 15px Georgia, serif';
  ctx.fillText('Choose an ancestor to walk their documented life.', W / 2, 120);

  const cardW = 380, cardH = 150, gap = 30;
  const totalW = CHAPTERS.length * cardW + (CHAPTERS.length - 1) * gap;
  const startX = W / 2 - totalW / 2;
  const cardY = 180;

  CHAPTERS.forEach((ch, i) => {
    const cx = startX + i * (cardW + gap);
    ctx.fillStyle = 'rgba(20, 26, 32, 0.92)';
    roundRect(cx, cardY, cardW, cardH, 10);
    ctx.fill();
    ctx.strokeStyle = i === state.chapterFocus ? '#f2c14e' : '#556170';
    ctx.lineWidth = i === state.chapterFocus ? 3 : 2;
    roundRect(cx, cardY, cardW, cardH, 10);
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = '#f2efe6';
    ctx.font = 'bold 20px Georgia, serif';
    ctx.fillText(ch.data.name, cx + 20, cardY + 36);
    ctx.font = '14px Georgia, serif';
    ctx.fillStyle = '#c9d0d6';
    ctx.fillText(`c. ${ch.data.birthYear} – ${ch.data.deathYear}`, cx + 20, cardY + 58);
    ctx.font = 'italic 13px Arial, sans-serif';
    ctx.fillStyle = '#9aa3a8';
    const lines = wrapText(ch.teaser, cardW - 40);
    let ty = cardY + 84;
    for (const line of lines) {
      ctx.fillText(line, cx + 20, ty);
      ty += 18;
    }

    addButton(cx, cardY, cardW, cardH, () => {
      state.chapter = ch.data;
      state.progress = 0;
      state.activeIndex = null;
      state.focusIndex = 0;
      state.screen = 'title';
      render();
    });
  });
}

function renderTitle() {
  const JOSIAH = state.chapter;
  ctx.fillStyle = '#1c2530';
  ctx.textAlign = 'center';
  ctx.font = 'bold 40px Georgia, serif';
  ctx.fillText('ANCESTOR JOURNEY', W / 2, 130);

  ctx.font = 'italic 20px Georgia, serif';
  ctx.fillText('Vertical Slice', W / 2, 165);

  ctx.font = 'bold 26px Georgia, serif';
  ctx.fillText(`${JOSIAH.name}`, W / 2, 230);
  ctx.font = '18px Georgia, serif';
  ctx.fillText(`c. ${JOSIAH.birthYear} – ${JOSIAH.deathYear}`, W / 2, 260);

  ctx.font = '15px Arial, sans-serif';
  const MAX_SUMMARY_LINES = 7; // longer bios (e.g. William's two-wife life) must not push the button off-canvas
  const allLines = wrapText(JOSIAH.summary, 640);
  const lines = allLines.length > MAX_SUMMARY_LINES
    ? [...allLines.slice(0, MAX_SUMMARY_LINES - 1), allLines[MAX_SUMMARY_LINES - 1].replace(/\s*\S*$/, '') + '…']
    : allLines;
  let y = 310;
  for (const line of lines) {
    ctx.fillText(line, W / 2, y);
    y += 22;
  }

  const bw = 220, bh = 46;
  // Clamp as a backstop too: no summary length should ever push this off-canvas.
  const by = Math.min(y + 20, H - bh - 24);
  addButton(W / 2 - bw / 2, by, bw, bh, () => {
    state.screen = 'map';
    enterWorld();
  });
  drawButton(W / 2 - bw / 2, by, bw, bh, 'Begin the Journey');
}

function renderDetail() {
  const JOSIAH = state.chapter;
  const i = state.activeIndex;
  const wp = JOSIAH.waypoints[i];

  const px = 60, py = 70, pw = W - 120, ph = H - 140;
  ctx.fillStyle = 'rgba(20, 26, 32, 0.94)';
  roundRect(px, py, pw, ph, 10);
  ctx.fill();
  ctx.strokeStyle = '#556170';
  ctx.lineWidth = 2;
  roundRect(px, py, pw, ph, 10);
  ctx.stroke();

  let y = py + 40;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#f2efe6';
  ctx.font = 'bold 22px Georgia, serif';
  ctx.fillText(wp.event.toUpperCase(), px + 30, y);

  const badgeColor = CONFIDENCE_COLOR[wp.confidence];
  const badgeLabel = CONFIDENCE_LABEL[wp.confidence];
  ctx.font = 'bold 13px Arial, sans-serif';
  const badgeW = ctx.measureText(badgeLabel).width + 26;
  ctx.fillStyle = badgeColor;
  roundRect(px + pw - 30 - badgeW, y - 20, badgeW, 26, 13);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.fillText(badgeLabel, px + pw - 30 - badgeW / 2, y - 3);
  ctx.textAlign = 'left';

  y += 30;
  ctx.font = 'italic 15px Georgia, serif';
  ctx.fillStyle = '#c9d0d6';
  ctx.fillText(`${wp.date || 'undated'} — ${wp.place}`, px + 30, y);

  y += 34;
  ctx.font = '15px Georgia, serif';
  ctx.fillStyle = '#e8e6df';
  const lines = wrapText(wp.narrative || '(no narrative recorded)', pw - 60);
  for (const line of lines) {
    ctx.fillText(line, px + 30, y);
    y += 22;
  }

  const bw = 200, bh = 44;
  const bx = px + pw - 30 - bw;
  const by = py + ph - 30 - bh;
  const isFrontier = i === state.progress;
  const isLast = i === JOSIAH.waypoints.length - 1;

  if (isFrontier) {
    drawButton(bx, by, bw, bh, isLast ? 'See the Family & Legacy →' : 'Continue Journey →');
    addButton(bx, by, bw, bh, () => {
      if (isLast) {
        state.screen = 'family';
        render();
      } else {
        state.progress = Math.min(state.progress + 1, JOSIAH.waypoints.length - 1);
        state.focusIndex = state.progress;
        state.screen = 'map';
        enterWorld();
      }
    });
  } else {
    drawButton(bx, by, bw, bh, 'Close', false);
    addButton(bx, by, bw, bh, () => {
      state.screen = 'map';
      enterWorld();
    });
  }
}

function renderFamily() {
  const JOSIAH = state.chapter;

  const px = 60, py = 50, pw = W - 120, ph = H - 100;
  ctx.fillStyle = 'rgba(20, 26, 32, 0.96)';
  roundRect(px, py, pw, ph, 10);
  ctx.fill();
  ctx.strokeStyle = '#556170';
  ctx.lineWidth = 2;
  roundRect(px, py, pw, ph, 10);
  ctx.stroke();

  let y = py + 36;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#f2efe6';
  ctx.font = 'bold 20px Georgia, serif';
  ctx.fillText('FAMILY & LEGACY', px + 24, y);

  const badgeColor = CONFIDENCE_COLOR[JOSIAH.childrenConfidence] || CONFIDENCE_COLOR.documented;
  const badgeLabel = CONFIDENCE_LABEL[JOSIAH.childrenConfidence] || CONFIDENCE_LABEL.documented;
  ctx.font = 'bold 12px Arial, sans-serif';
  const badgeW = ctx.measureText(badgeLabel).width + 24;
  ctx.fillStyle = badgeColor;
  roundRect(px + pw - 24 - badgeW, y - 18, badgeW, 24, 12);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.fillText(badgeLabel, px + pw - 24 - badgeW / 2, y - 2);
  ctx.textAlign = 'left';

  y += 26;
  ctx.font = '13px Arial, sans-serif';
  ctx.fillStyle = '#9aa3a8';
  const occ = JOSIAH.occupation ? JOSIAH.occupation.value : 'unrecorded';
  ctx.fillText(`Occupation: ${occ}`, px + 24, y);

  if (JOSIAH.spouse) {
    y += 20;
    const sp = JOSIAH.spouse;
    ctx.fillText(
      `Married ${sp.name} (${sp.birthYear}–${sp.deathYear}), ${sp.marriageYear} at ${sp.marriagePlace}`,
      px + 24,
      y
    );
  }

  if (JOSIAH.familyNote) {
    y += 20;
    ctx.font = 'italic 12px Georgia, serif';
    ctx.fillStyle = '#9aa3a8';
    for (const line of wrapText(JOSIAH.familyNote, pw - 48)) {
      ctx.fillText(line, px + 24, y);
      y += 16;
    }
    ctx.font = '13px Arial, sans-serif';
  }

  y += 26;
  ctx.font = 'italic 12px Georgia, serif';
  ctx.fillStyle = '#c9d0d6';
  const noteLines = wrapText(JOSIAH.childrenNote || '', pw - 48);
  for (const line of noteLines) {
    ctx.fillText(line, px + 24, y);
    y += 16;
  }

  y += 14;
  const colCount = 3;
  const colW = (pw - 48) / colCount;
  const rowH = 54;
  ctx.font = 'bold 14px Georgia, serif';
  JOSIAH.children.forEach((child, i) => {
    const col = i % colCount;
    const row = Math.floor(i / colCount);
    const cx = px + 24 + col * colW;
    const cy = y + row * rowH;
    ctx.fillStyle = '#f2efe6';
    ctx.font = 'bold 14px Georgia, serif';
    ctx.fillText(child.name, cx, cy);
    ctx.fillStyle = '#b7c2c9';
    ctx.font = '11px Arial, sans-serif';
    const lines = wrapText(child.fate, colW - 16);
    let cyy = cy + 16;
    for (const line of lines.slice(0, 2)) {
      ctx.fillText(line, cx, cyy);
      cyy += 14;
    }
  });

  const bw = 200, bh = 44;
  const bx = px + pw - 24 - bw;
  const by = py + ph - 24 - bh;
  drawButton(bx, by, bw, bh, 'Continue →');
  addButton(bx, by, bw, bh, () => {
    state.screen = 'end';
    render();
  });
}

function renderEnd() {
  const JOSIAH = state.chapter;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#1c2530';
  ctx.font = 'bold 30px Georgia, serif';
  ctx.fillText('End of Chapter', W / 2, 130);

  ctx.font = '18px Georgia, serif';
  ctx.fillText(
    `${JOSIAH.name}, c. ${JOSIAH.birthYear}–${JOSIAH.deathYear}`,
    W / 2,
    170
  );

  ctx.font = '15px Arial, sans-serif';
  const MAX_LEGACY_LINES = 7; // same off-canvas-button risk as the title screen — see renderTitle
  const allLines = wrapText(JOSIAH.legacyNote || '', 640);
  const lines = allLines.length > MAX_LEGACY_LINES
    ? [...allLines.slice(0, MAX_LEGACY_LINES - 1), allLines[MAX_LEGACY_LINES - 1].replace(/\s*\S*$/, '') + '…']
    : allLines;
  let y = 220;
  for (const line of lines) {
    ctx.fillText(line, W / 2, y);
    y += 22;
  }

  // Two buttons on the end screen: the keepsake export (a Pro feature) and the
  // return-to-archive. Return stays buttons[0] so keyboard Enter still works.
  const bw = 220, bh = 46;
  const by = Math.min(y + 30, H - bh - 24);
  const gap = 16;
  const returnX = W / 2 - bw - gap / 2;
  const keepsakeX = W / 2 + gap / 2;

  addButton(returnX, by, bw, bh, () => {
    state.chapter = null;
    state.progress = 0;
    state.activeIndex = null;
    state.focusIndex = 0;
    state.chapterFocus = 0;
    state.screen = 'archive';
    render();
  });
  drawButton(returnX, by, bw, bh, 'Return to the Archive');

  const keepsakeLabel = Monetize.isLocked('keepsake_export') ? '✦ Keepsake (Pro)' : '✦ Download Keepsake';
  addButton(keepsakeX, by, bw, bh, () => {
    if (Monetize.isLocked('keepsake_export')) {
      openProModal();
    } else {
      downloadPostcard(state.chapter);
    }
  });
  drawButton(keepsakeX, by, bw, bh, keepsakeLabel, false);
}

// exposed for the smoke-test driver (tools/smoke.mjs) only — returns the
// current frame's clickable rects so the driver can issue real mouse clicks
// at real positions instead of guessing canvas coordinates.
window.__ANC_DEBUG_STATE__ = () => ({
  screen: state.screen,
  chapterId: state.chapter ? state.chapter.id : null,
  waypointCount: state.chapter ? state.chapter.waypoints.length : null,
  chapterCount: CHAPTERS.length,
  progress: state.progress,
  focusIndex: state.focusIndex,
  chapterFocus: state.chapterFocus,
  buttons: state.buttons.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h })),
  world: state.screen === 'map' && worldInitialized ? World.getWorldState() : null,
});

// test-only: the smoke test can't literally walk a compressed ocean, so it
// warps directly to interact range and presses "interact" — see
// World.debugWarpTo's own doc comment. Never used by real play.
window.__ANC_DEBUG__ = {
  warpToWaypoint: (index) => World.debugWarpTo(index),
  interact: () => interactWithWorld(),
};

// ---------------------------------------------------------------------
// Bring your own family tree: parse a GEDCOM entirely client-side, then let
// the player pick anyone in it to walk. The uploaded file is read with a
// FileReader and never leaves the browser — no upload, no network, no backend.
// ---------------------------------------------------------------------

const importBtn = document.getElementById('import-btn');
const gedcomInput = document.getElementById('gedcom-input');
const importStatus = document.getElementById('import-status');
const picker = document.getElementById('picker');
const pickerList = document.getElementById('picker-list');
const pickerSearch = document.getElementById('picker-search');
const pickerClose = document.getElementById('picker-close');
const pickerEmpty = document.getElementById('picker-empty');

let importedParse = null; // last successfully parsed GEDCOM object graph
let importedList = []; // playable individuals from it

function setImportStatus(msg, isError) {
  importStatus.textContent = msg || '';
  importStatus.classList.toggle('error', !!isError);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

importBtn.addEventListener('click', () => gedcomInput.click());

gedcomInput.addEventListener('change', () => {
  const file = gedcomInput.files && gedcomInput.files[0];
  if (!file) return;
  setImportStatus('Reading…');
  const reader = new FileReader();
  reader.onerror = () => setImportStatus('Could not read that file.', true);
  reader.onload = () => {
    try {
      importedParse = parseGedcom(String(reader.result));
      importedList = listPlayableIndividuals(importedParse);
      setImportStatus(
        `Loaded ${importedParse.individuals.size.toLocaleString()} people — ${importedList.length} ready to walk.`
      );
      openPicker();
    } catch (err) {
      importedParse = null;
      importedList = [];
      setImportStatus(err && err.message ? err.message : 'That file could not be parsed as GEDCOM.', true);
    }
  };
  reader.readAsText(file);
  gedcomInput.value = ''; // let the same file be re-picked later
});

function openPicker() {
  pickerSearch.value = '';
  renderPickerList(importedList);
  picker.classList.remove('hidden');
  pickerSearch.focus();
}

function closePicker() {
  picker.classList.add('hidden');
  canvas.focus();
}

function renderPickerList(list) {
  pickerList.innerHTML = '';
  pickerEmpty.classList.toggle('hidden', list.length > 0);
  for (const person of list) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'picker-item';
    const years =
      person.birthYear || person.deathYear
        ? `${person.birthYear || '?'}–${person.deathYear || '?'}`
        : 'dates unknown';
    btn.innerHTML =
      `<span class="pi-name">${escapeHtml(person.name)}</span>` +
      `<span class="pi-years">${escapeHtml(years)}</span>` +
      `<div class="pi-meta">${person.eventCount} life events</div>`;
    btn.addEventListener('click', () => startImportedChapter(person.id));
    li.appendChild(btn);
    pickerList.appendChild(li);
  }
}

function startImportedChapter(id) {
  try {
    const chapter = buildChapter(importedParse, id);
    closePicker();
    state.chapter = chapter;
    state.progress = 0;
    state.activeIndex = null;
    state.focusIndex = 0;
    state.screen = 'title';
    render();
  } catch (err) {
    setImportStatus(err && err.message ? err.message : 'Could not build that journey.', true);
  }
}

pickerSearch.addEventListener('input', () => {
  const q = pickerSearch.value.trim().toLowerCase();
  renderPickerList(q ? importedList.filter((p) => p.name.toLowerCase().includes(q)) : importedList);
});
pickerClose.addEventListener('click', closePicker);
picker.addEventListener('click', (evt) => { if (evt.target === picker) closePicker(); });
window.addEventListener('keydown', (evt) => {
  if (evt.key === 'Escape' && !picker.classList.contains('hidden')) closePicker();
});

// ---------------------------------------------------------------------
// Pro (freemium): a one-time unlock via Lemon Squeezy's hosted checkout, with
// license keys validated client-side (see src/monetize.js). No tracking, no
// ads, no data ever leaves the device. The dialog degrades honestly when the
// store owner hasn't connected a checkout yet.
// ---------------------------------------------------------------------

const proBtn = document.getElementById('pro-btn');
const proModal = document.getElementById('pro-modal');
const proClose = document.getElementById('pro-close');
const proFeatures = document.getElementById('pro-features');
const proBuy = document.getElementById('pro-buy');
const proPrice = document.getElementById('pro-price');
const proKey = document.getElementById('pro-key');
const proActivateBtn = document.getElementById('pro-activate-btn');
const proStatus = document.getElementById('pro-status');
const proSupport = document.getElementById('pro-support');

function refreshProButton() {
  if (!proBtn) return;
  const active = Monetize.hasPro();
  proBtn.textContent = Monetize.proStatusLabel();
  proBtn.classList.toggle('pro-active', active);
}

function setProStatus(msg, kind) {
  proStatus.textContent = msg || '';
  proStatus.classList.toggle('error', kind === 'error');
  proStatus.classList.toggle('ok', kind === 'ok');
}

function renderProFeatures() {
  proFeatures.innerHTML = '';
  for (const key of Object.keys(Monetize.PRO_FEATURES)) {
    const f = Monetize.PRO_FEATURES[key];
    const li = document.createElement('li');
    li.innerHTML =
      `<span class="pf-name">${escapeHtml(f.name)}</span>` +
      (f.live ? '' : '<span class="pf-soon">coming soon</span>') +
      `<div>${escapeHtml(f.desc)}</div>`;
    proFeatures.appendChild(li);
  }
}

function openProModal() {
  renderProFeatures();
  const owned = Monetize.hasPro();
  proBuy.disabled = owned;
  proBuy.textContent = owned ? 'Pro is unlocked — thank you' : `Unlock Pro`;
  proPrice.textContent = owned ? '' : `${Monetize.CONFIG.priceDisplay} · secure checkout by Lemon Squeezy`;
  if (Monetize.CONFIG.tipUrl) {
    proSupport.innerHTML = `Prefer to just tip? <a href="${escapeHtml(Monetize.CONFIG.tipUrl)}" target="_blank" rel="noopener">Support the project →</a>`;
    proSupport.classList.remove('hidden');
  } else {
    proSupport.classList.add('hidden');
  }
  setProStatus(owned ? 'Pro is active on this device.' : '', owned ? 'ok' : null);
  proModal.classList.remove('hidden');
  (owned ? proClose : proBuy).focus();
}

function closeProModal() {
  proModal.classList.add('hidden');
  canvas.focus();
}

proBtn.addEventListener('click', openProModal);
proClose.addEventListener('click', closeProModal);
proModal.addEventListener('click', (evt) => { if (evt.target === proModal) closeProModal(); });

proBuy.addEventListener('click', () => {
  if (Monetize.hasPro()) return;
  const opened = Monetize.startCheckout();
  if (opened) {
    setProStatus('Opening secure checkout in a new tab… after purchase, paste your license key below to unlock.', 'ok');
  } else {
    setProStatus('Checkout isn’t connected yet — the store owner still needs to link a payment provider. Everything here is free in the meantime.', 'error');
  }
});

proActivateBtn.addEventListener('click', async () => {
  proActivateBtn.disabled = true;
  setProStatus('Validating…');
  const result = await Monetize.activateLicense(proKey.value);
  setProStatus(result.message, result.ok ? 'ok' : 'error');
  proActivateBtn.disabled = false;
  if (result.ok) {
    refreshProButton();
    openProModal(); // re-render into the owned state
    if (state.screen === 'end') render(); // relabel the keepsake button
  }
});

window.addEventListener('keydown', (evt) => {
  if (evt.key === 'Escape' && !proModal.classList.contains('hidden')) closeProModal();
});

// Test hook: lets the smoke test toggle Pro without a real purchase.
window.__ANC_MONETIZE__ = {
  setPro: (on) => { Monetize.__setProForTest(on); refreshProButton(); if (state.screen === 'end') render(); },
  hasPro: () => Monetize.hasPro(),
};

refreshProButton();

// ---------------------------------------------------------------------
// On-screen joystick (touch): a draggable thumb feeds an analog movement axis
// into the world. Look-around is handled by touch-drag on the canvas itself
// (see world.js). Uses Pointer Events so it works for touch and mouse alike.
// ---------------------------------------------------------------------
if (touchControls) {
  const joystick = document.getElementById('joystick');
  const thumb = document.getElementById('joystick-thumb');
  const JOY_R = 48; // px travel that equals full tilt
  let joyId = null;
  let center = null;

  const setThumb = (tx, ty) => { thumb.style.transform = `translate(${tx}px, ${ty}px)`; };

  function joyMove(evt) {
    if (joyId !== evt.pointerId || !center) return;
    let dx = evt.clientX - center.x;
    let dy = evt.clientY - center.y;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, JOY_R);
    const ang = Math.atan2(dy, dx);
    const tx = Math.cos(ang) * clamped;
    const ty = Math.sin(ang) * clamped;
    setThumb(tx, ty);
    // screen-up (negative y) → walk forward; screen-right (positive x) → strafe right
    World.setMoveAxis(-ty / JOY_R, tx / JOY_R);
  }
  function joyEnd(evt) {
    if (joyId !== evt.pointerId) return;
    joyId = null;
    center = null;
    setThumb(0, 0);
    World.setMoveAxis(0, 0);
  }
  joystick.addEventListener('pointerdown', (evt) => {
    const r = joystick.getBoundingClientRect();
    center = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    joyId = evt.pointerId;
    joystick.setPointerCapture(evt.pointerId);
    joyMove(evt);
    evt.preventDefault();
  });
  joystick.addEventListener('pointermove', joyMove);
  joystick.addEventListener('pointerup', joyEnd);
  joystick.addEventListener('pointercancel', joyEnd);
}

canvas.tabIndex = 0; // make the canvas keyboard-focusable
canvas.addEventListener('click', (evt) => {
  canvas.focus();
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (evt.clientX - rect.left) * scaleX;
  const y = (evt.clientY - rect.top) * scaleY;

  if (state.screen === 'title') {
    // whole title screen is clickable as a fallback, but the button below wins
  }

  for (const b of state.buttons) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      b.onClick();
      return;
    }
  }
});

// Keyboard: ←/→ move focus among reached nodes on the map screen, Enter/Space
// opens the focused node; on every other screen (exactly one primary button
// each in this vertical slice) Enter/Space activates it directly.
window.addEventListener('keydown', (evt) => {
  if (state.screen === 'archive') {
    if (evt.key === 'ArrowLeft') {
      state.chapterFocus = Math.max(0, state.chapterFocus - 1);
      render();
    } else if (evt.key === 'ArrowRight') {
      state.chapterFocus = Math.min(CHAPTERS.length - 1, state.chapterFocus + 1);
      render();
    } else if (evt.key === 'Enter' || evt.key === ' ') {
      evt.preventDefault();
      if (state.buttons[state.chapterFocus]) state.buttons[state.chapterFocus].onClick();
    }
  } else if (state.screen === 'map') {
    // WASD / arrow-key movement and mouse-drag look are handled inside
    // world.js's own listeners; this is only the "examine" action, and only
    // once the player has actually walked into range (see drawWorldHud()).
    if (evt.key.toLowerCase() === 'e' || evt.key === 'Enter' || evt.key === ' ') {
      evt.preventDefault();
      interactWithWorld();
    }
  } else if (evt.key === 'Enter' || evt.key === ' ') {
    evt.preventDefault();
    if (state.buttons[0]) state.buttons[0].onClick();
  }
});

render();
