// Ancestor Journey — the archive and its playable chapters.
// Plain canvas 2D, no dependencies, no build step. Open index.html directly
// or serve the repo root with any static file server.

import { CHAPTERS } from './data/index.js';
import * as World from './world.js';
import { clearStage } from './ui/canvas.js';
import { renderArchive } from './screens/archive.js';
import { renderTitle } from './screens/title.js';
import { renderDetail } from './screens/detail.js';
import { renderFamily } from './screens/family.js';
import { renderEnd } from './screens/end.js';
import { drawWorldHud } from './screens/worldHud.js';

const DEBUG = new URLSearchParams(window.location.search).has('debug');

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');
const worldCanvas = document.getElementById('world');
const canvasStack = document.getElementById('canvas-stack');
const ariaLive = document.getElementById('aria-live');

let worldInitialized = false;
let worldHudRunning = false;
let promptFlash = 0;

/** @type {{screen: string, chapter: import('./types.js').Chapter|null, chapterFocus: number, progress: number, activeIndex: number|null, buttons: Array}} */
const state = {
  screen: 'archive',
  chapter: null,
  chapterFocus: 0,
  progress: 0,
  activeIndex: null,
  buttons: [],
};

function canvasW() {
  return canvas.width;
}

function canvasH() {
  return canvas.height;
}

function addButton(x, y, w, h, onClick) {
  state.buttons.push({ x, y, w, h, onClick });
}

function resizeCanvases() {
  const rect = canvasStack.getBoundingClientRect();
  const aspect = 960 / 540;
  const w = Math.max(320, Math.round(rect.width));
  const h = Math.round(w / aspect);
  canvas.width = w;
  canvas.height = h;
  worldCanvas.width = w;
  worldCanvas.height = h;
  if (worldInitialized) World.resize();
  if (state.screen !== 'map') render();
}

function setAriaLive(text) {
  if (ariaLive) ariaLive.textContent = text;
}

function enterWorld() {
  if (!worldInitialized) {
    World.initWorld(worldCanvas, canvas);
    worldInitialized = true;
  }
  World.loadChapter(state.chapter, state.progress);
  canvasStack.classList.add('world-active');
  World.start();
  worldHudRunning = true;
  setAriaLive(
    `${state.chapter.name} — open world. Walk with WASD or arrow keys. Press E near a marker to examine.`
  );
  requestAnimationFrame(worldHudLoop);
}

function exitWorld() {
  worldHudRunning = false;
  World.stop();
  canvasStack.classList.remove('world-active');
}

function worldHudLoop() {
  if (!worldHudRunning) return;
  promptFlash += 0.08;
  state.buttons = [];
  const ws = World.getWorldState();
  drawWorldHud(
    ctx,
    state.chapter,
    ws,
    canvasW(),
    canvasH(),
    promptFlash,
    addButton,
    interactWithWorld
  );
  requestAnimationFrame(worldHudLoop);
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
  clearStage(ctx, canvasW(), canvasH());
  const W = canvasW();
  const H = canvasH();

  if (state.screen === 'archive') {
    renderArchive(ctx, CHAPTERS, state, W, H, addButton, (chapter) => {
      state.chapter = chapter;
      state.progress = 0;
      state.activeIndex = null;
      state.screen = 'title';
      render();
    });
    setAriaLive('The Archive. Choose an ancestor to walk their documented life.');
  } else if (state.screen === 'title') {
    renderTitle(ctx, state.chapter, W, H, addButton, () => {
      state.screen = 'map';
      enterWorld();
    });
    setAriaLive(
      `${state.chapter.name}, c. ${state.chapter.birthYear}–${state.chapter.deathYear}. ${state.chapter.summary}`
    );
  } else if (state.screen === 'detail') {
    const wp = state.chapter.waypoints[state.activeIndex];
    renderDetail(
      ctx,
      state.chapter,
      state.activeIndex,
      state.progress,
      W,
      H,
      addButton,
      () => {
        state.progress = Math.min(state.progress + 1, state.chapter.waypoints.length - 1);
        state.screen = 'map';
        enterWorld();
      },
      () => {
        state.screen = 'family';
        render();
      },
      () => {
        state.screen = 'map';
        enterWorld();
      }
    );
    setAriaLive(`${wp.event}. ${wp.date || 'undated'} at ${wp.place}. ${wp.narrative || ''}`);
  } else if (state.screen === 'family') {
    renderFamily(ctx, state.chapter, W, H, addButton, () => {
      state.screen = 'end';
      render();
    });
    setAriaLive(`Family and legacy of ${state.chapter.name}.`);
  } else if (state.screen === 'end') {
    renderEnd(ctx, state.chapter, W, H, addButton, () => {
      state.chapter = null;
      state.progress = 0;
      state.activeIndex = null;
      state.chapterFocus = 0;
      state.screen = 'archive';
      render();
    });
    setAriaLive(`End of chapter: ${state.chapter.name}. ${state.chapter.legacyNote || ''}`);
  }
}

if (DEBUG) {
  window.__ANC_DEBUG_STATE__ = () => ({
    screen: state.screen,
    chapterId: state.chapter ? state.chapter.id : null,
    waypointCount: state.chapter ? state.chapter.waypoints.length : null,
    chapterCount: CHAPTERS.length,
    progress: state.progress,
    chapterFocus: state.chapterFocus,
    buttons: state.buttons.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h })),
    world: state.screen === 'map' && worldInitialized ? World.getWorldState() : null,
  });

  window.__ANC_DEBUG__ = {
    warpToWaypoint: (index) => World.debugWarpTo(index),
    interact: () => interactWithWorld(),
  };
}

canvas.tabIndex = 0;
canvas.addEventListener('click', (evt) => {
  canvas.focus();
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (evt.clientX - rect.left) * scaleX;
  const y = (evt.clientY - rect.top) * scaleY;

  for (const b of state.buttons) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      b.onClick();
      return;
    }
  }
});

// Keyboard: archive uses arrow keys to pick a chapter; map screen uses WASD
// for movement (handled in world.js) and E/Enter/Space to examine a waypoint
// once in range; every other screen activates its primary button on Enter/Space.
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
    if (evt.key.toLowerCase() === 'e' || evt.key === 'Enter' || evt.key === ' ') {
      evt.preventDefault();
      interactWithWorld();
    }
  } else if (evt.key === 'Enter' || evt.key === ' ') {
    evt.preventDefault();
    if (state.buttons[0]) state.buttons[0].onClick();
  }
});

window.addEventListener('resize', resizeCanvases);
resizeCanvases();
render();
