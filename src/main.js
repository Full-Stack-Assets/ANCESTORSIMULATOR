// Ancestor Journey — vertical slice: Josiah Albertson.
// Plain canvas 2D, no dependencies, no build step. Open index.html directly
// or serve the repo root with any static file server.

import { JOSIAH } from './data/josiah.js';

// exposed for the smoke-test driver (tools/smoke.mjs) only
window.__ANC_WAYPOINT_COUNT__ = JOSIAH.waypoints.length;

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

/** @type {{screen: string, progress: number, activeIndex: number|null, buttons: Array}} */
const state = {
  screen: 'title', // 'title' | 'map' | 'detail' | 'end'
  progress: 0, // index of the furthest unlocked waypoint (0-based)
  activeIndex: null, // waypoint being viewed in the detail panel
  buttons: [], // clickable rects for the current frame, hit-tested on click
};

function nodePositions(count) {
  const marginX = 90;
  const usableW = W - marginX * 2;
  const midY = 250;
  const amplitude = 90;
  const positions = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1);
    const x = marginX + usableW * t;
    const y = midY + Math.sin(t * Math.PI * 1.5) * amplitude;
    positions.push({ x, y });
  }
  return positions;
}

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

function render() {
  state.buttons = [];
  clearStage();
  if (state.screen === 'title') renderTitle();
  else if (state.screen === 'map') renderMap();
  else if (state.screen === 'detail') renderDetail();
  else if (state.screen === 'end') renderEnd();
}

function renderTitle() {
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
  const lines = wrapText(JOSIAH.summary, 640);
  let y = 310;
  for (const line of lines) {
    ctx.fillText(line, W / 2, y);
    y += 22;
  }

  const bw = 220, bh = 46;
  addButton(W / 2 - bw / 2, y + 20, bw, bh, () => {
    state.screen = 'map';
    render();
  });
  drawButton(W / 2 - bw / 2, y + 20, bw, bh, 'Begin the Journey');
}

function renderMap() {
  const positions = nodePositions(JOSIAH.waypoints.length);

  ctx.strokeStyle = '#8a7a55';
  ctx.lineWidth = 4;
  ctx.beginPath();
  positions.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.stroke();

  ctx.fillStyle = '#1c2530';
  ctx.textAlign = 'center';
  ctx.font = 'bold 20px Georgia, serif';
  ctx.fillText(`${JOSIAH.name} — the life`, W / 2, 40);
  ctx.font = '13px Arial, sans-serif';
  ctx.fillStyle = '#3a4550';
  ctx.fillText('Click a stop along the path to read what really happened there.', W / 2, 62);

  JOSIAH.waypoints.forEach((wp, i) => {
    const { x, y } = positions[i];
    const reached = i <= state.progress;
    const isCurrent = i === state.progress;
    const color = reached ? CONFIDENCE_COLOR[wp.confidence] : '#9aa3a8';

    if (isCurrent) {
      ctx.beginPath();
      ctx.arc(x, y, 34, 0, Math.PI * 2);
      ctx.strokeStyle = '#f2c14e';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(x, y, 26, 0, Math.PI * 2);
    ctx.fillStyle = reached ? color : '#c9cfd2';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#1c2530';
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(reached ? CONFIDENCE_ICON[wp.confidence] : '•', x, y + 1);

    ctx.fillStyle = '#1c2530';
    ctx.font = '12px Arial, sans-serif';
    ctx.textBaseline = 'alphabetic';
    const label = wp.year ? String(wp.year) : '';
    ctx.fillText(label, x, y + 50);
    ctx.font = 'bold 12px Arial, sans-serif';
    ctx.fillText(wp.event, x, y - 40);

    if (reached) {
      addButton(x - 30, y - 30, 60, 60, () => {
        state.activeIndex = i;
        state.screen = 'detail';
        render();
      });
    }
  });
}

function renderDetail() {
  const i = state.activeIndex;
  const wp = JOSIAH.waypoints[i];

  // dim the map behind the panel
  renderMapBackdrop();

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
    drawButton(bx, by, bw, bh, isLast ? 'Close the Chapter' : 'Continue Journey →');
    addButton(bx, by, bw, bh, () => {
      if (isLast) {
        state.screen = 'end';
      } else {
        state.progress = Math.min(state.progress + 1, JOSIAH.waypoints.length - 1);
        state.screen = 'map';
      }
      render();
    });
  } else {
    drawButton(bx, by, bw, bh, 'Close', false);
    addButton(bx, by, bw, bh, () => {
      state.screen = 'map';
      render();
    });
  }
}

function renderMapBackdrop() {
  const savedButtons = state.buttons;
  state.buttons = [];
  renderMap();
  state.buttons = savedButtons;
}

function renderEnd() {
  ctx.textAlign = 'center';
  ctx.fillStyle = '#1c2530';
  ctx.font = 'bold 30px Georgia, serif';
  ctx.fillText('End of Chapter One', W / 2, 130);

  ctx.font = '18px Georgia, serif';
  ctx.fillText(
    `${JOSIAH.name}, c. ${JOSIAH.birthYear}–${JOSIAH.deathYear}`,
    W / 2,
    170
  );

  ctx.font = '15px Arial, sans-serif';
  const legacy =
    'He left the Otter Branch plantation, and the brick homestead he built in 1743, ' +
    "to his grandson John — and the land still carries the family's name today, " +
    'in the New Jersey locality of Albertson. Six generations later, his line reaches you.';
  const lines = wrapText(legacy, 640);
  let y = 220;
  for (const line of lines) {
    ctx.fillText(line, W / 2, y);
    y += 22;
  }

  const bw = 200, bh = 46;
  addButton(W / 2 - bw / 2, y + 30, bw, bh, () => {
    state.progress = 0;
    state.activeIndex = null;
    state.screen = 'title';
    render();
  });
  drawButton(W / 2 - bw / 2, y + 30, bw, bh, 'Play Again');
}

// exposed for the smoke-test driver (tools/smoke.mjs) only — returns the
// current frame's clickable rects so the driver can issue real mouse clicks
// at real positions instead of guessing canvas coordinates.
window.__ANC_DEBUG_STATE__ = () => ({
  screen: state.screen,
  progress: state.progress,
  buttons: state.buttons.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h })),
});

canvas.addEventListener('click', (evt) => {
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

render();
