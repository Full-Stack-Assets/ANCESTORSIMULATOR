import { wrapText, drawButton } from '../ui/canvas.js';

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('../types.js').Chapter} chapter
 * @param {number} W
 * @param {number} H
 * @param {(x: number, y: number, w: number, h: number, onClick: () => void) => void} addButton
 * @param {() => void} onBegin
 */
export function renderTitle(ctx, chapter, W, H, addButton, onBegin) {
  ctx.fillStyle = '#1c2530';
  ctx.textAlign = 'center';
  ctx.font = 'bold 40px Georgia, serif';
  ctx.fillText('ANCESTOR JOURNEY', W / 2, 130);

  ctx.font = 'italic 20px Georgia, serif';
  ctx.fillText('Vertical Slice', W / 2, 165);

  ctx.font = 'bold 26px Georgia, serif';
  ctx.fillText(`${chapter.name}`, W / 2, 230);
  ctx.font = '18px Georgia, serif';
  ctx.fillText(`c. ${chapter.birthYear} – ${chapter.deathYear}`, W / 2, 260);

  ctx.font = '15px Arial, sans-serif';
  const MAX_SUMMARY_LINES = 7;
  const allLines = wrapText(ctx, chapter.summary, 640);
  const lines =
    allLines.length > MAX_SUMMARY_LINES
      ? [
          ...allLines.slice(0, MAX_SUMMARY_LINES - 1),
          allLines[MAX_SUMMARY_LINES - 1].replace(/\s*\S*$/, '') + '…',
        ]
      : allLines;
  let y = 310;
  for (const line of lines) {
    ctx.fillText(line, W / 2, y);
    y += 22;
  }

  const bw = 220;
  const bh = 46;
  const by = Math.min(y + 20, H - bh - 24);
  addButton(W / 2 - bw / 2, by, bw, bh, onBegin);
  drawButton(ctx, W / 2 - bw / 2, by, bw, bh, 'Begin the Journey');
}
