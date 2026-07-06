import { wrapText, drawButton, roundRect } from '../ui/canvas.js';
import { confidenceCss, confidenceLabel } from '../confidence.js';

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('../types.js').Chapter} chapter
 * @param {number} activeIndex
 * @param {number} progress
 * @param {number} W
 * @param {number} H
 * @param {(x: number, y: number, w: number, h: number, onClick: () => void) => void} addButton
 * @param {() => void} onContinue
 * @param {() => void} onFamily
 * @param {() => void} onClose
 */
export function renderDetail(
  ctx,
  chapter,
  activeIndex,
  progress,
  W,
  H,
  addButton,
  onContinue,
  onFamily,
  onClose
) {
  const wp = chapter.waypoints[activeIndex];

  const px = 60;
  const py = 70;
  const pw = W - 120;
  const ph = H - 140;
  ctx.fillStyle = 'rgba(20, 26, 32, 0.94)';
  roundRect(ctx, px, py, pw, ph, 10);
  ctx.fill();
  ctx.strokeStyle = '#556170';
  ctx.lineWidth = 2;
  roundRect(ctx, px, py, pw, ph, 10);
  ctx.stroke();

  let y = py + 40;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#f2efe6';
  ctx.font = 'bold 22px Georgia, serif';
  ctx.fillText(wp.event.toUpperCase(), px + 30, y);

  const badgeColor = confidenceCss(wp.confidence);
  const badgeLabel = confidenceLabel(wp.confidence);
  ctx.font = 'bold 13px Arial, sans-serif';
  const badgeW = ctx.measureText(badgeLabel).width + 26;
  ctx.fillStyle = badgeColor;
  roundRect(ctx, px + pw - 30 - badgeW, y - 20, badgeW, 26, 13);
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
  const lines = wrapText(ctx, wp.narrative || '(no narrative recorded)', pw - 60);
  for (const line of lines) {
    ctx.fillText(line, px + 30, y);
    y += 22;
  }

  const bw = 200;
  const bh = 44;
  const bx = px + pw - 30 - bw;
  const by = py + ph - 30 - bh;
  const isFrontier = activeIndex === progress;
  const isLast = activeIndex === chapter.waypoints.length - 1;

  if (isFrontier) {
    drawButton(ctx, bx, by, bw, bh, isLast ? 'See the Family & Legacy →' : 'Continue Journey →');
    addButton(bx, by, bw, bh, isLast ? onFamily : onContinue);
  } else {
    drawButton(ctx, bx, by, bw, bh, 'Close', false);
    addButton(bx, by, bw, bh, onClose);
  }
}
