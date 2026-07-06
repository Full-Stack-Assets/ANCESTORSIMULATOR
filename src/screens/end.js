import { wrapText, drawButton } from '../ui/canvas.js';

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('../types.js').Chapter} chapter
 * @param {number} W
 * @param {number} H
 * @param {(x: number, y: number, w: number, h: number, onClick: () => void) => void} addButton
 * @param {() => void} onReturn
 */
export function renderEnd(ctx, chapter, W, H, addButton, onReturn) {
  ctx.textAlign = 'center';
  ctx.fillStyle = '#1c2530';
  ctx.font = 'bold 30px Georgia, serif';
  ctx.fillText('End of Chapter', W / 2, 130);

  ctx.font = '18px Georgia, serif';
  ctx.fillText(`${chapter.name}, c. ${chapter.birthYear}–${chapter.deathYear}`, W / 2, 170);

  ctx.font = '15px Arial, sans-serif';
  const MAX_LEGACY_LINES = 7;
  const allLines = wrapText(ctx, chapter.legacyNote || '', 640);
  const lines =
    allLines.length > MAX_LEGACY_LINES
      ? [
          ...allLines.slice(0, MAX_LEGACY_LINES - 1),
          allLines[MAX_LEGACY_LINES - 1].replace(/\s*\S*$/, '') + '…',
        ]
      : allLines;
  let y = 220;
  for (const line of lines) {
    ctx.fillText(line, W / 2, y);
    y += 22;
  }

  const bw = 220;
  const bh = 46;
  const by = Math.min(y + 30, H - bh - 24);
  addButton(W / 2 - bw / 2, by, bw, bh, onReturn);
  drawButton(ctx, W / 2 - bw / 2, by, bw, bh, 'Return to the Archive');
}
