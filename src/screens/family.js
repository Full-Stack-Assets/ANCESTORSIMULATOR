import { wrapText, drawButton, roundRect } from '../ui/canvas.js';
import { confidenceCss, confidenceLabel } from '../confidence.js';

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('../types.js').Chapter} chapter
 * @param {number} W
 * @param {number} H
 * @param {(x: number, y: number, w: number, h: number, onClick: () => void) => void} addButton
 * @param {() => void} onContinue
 */
export function renderFamily(ctx, chapter, W, H, addButton, onContinue) {
  const px = 60;
  const py = 50;
  const pw = W - 120;
  const ph = H - 100;
  ctx.fillStyle = 'rgba(20, 26, 32, 0.96)';
  roundRect(ctx, px, py, pw, ph, 10);
  ctx.fill();
  ctx.strokeStyle = '#556170';
  ctx.lineWidth = 2;
  roundRect(ctx, px, py, pw, ph, 10);
  ctx.stroke();

  let y = py + 36;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#f2efe6';
  ctx.font = 'bold 20px Georgia, serif';
  ctx.fillText('FAMILY & LEGACY', px + 24, y);

  const badgeColor = confidenceCss(chapter.childrenConfidence);
  const badgeLabel = confidenceLabel(chapter.childrenConfidence);
  ctx.font = 'bold 12px Arial, sans-serif';
  const badgeW = ctx.measureText(badgeLabel).width + 24;
  ctx.fillStyle = badgeColor;
  roundRect(ctx, px + pw - 24 - badgeW, y - 18, badgeW, 24, 12);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.fillText(badgeLabel, px + pw - 24 - badgeW / 2, y - 2);
  ctx.textAlign = 'left';

  y += 26;
  ctx.font = '13px Arial, sans-serif';
  ctx.fillStyle = '#9aa3a8';
  const occ = chapter.occupation ? chapter.occupation.value : 'unrecorded';
  ctx.fillText(`Occupation: ${occ}`, px + 24, y);

  if (chapter.spouse) {
    y += 20;
    const sp = chapter.spouse;
    ctx.fillText(
      `Married ${sp.name} (${sp.birthYear}–${sp.deathYear}), ${sp.marriageYear} at ${sp.marriagePlace}`,
      px + 24,
      y
    );
  }

  if (chapter.familyNote) {
    y += 20;
    ctx.font = 'italic 12px Georgia, serif';
    ctx.fillStyle = '#9aa3a8';
    for (const line of wrapText(ctx, chapter.familyNote, pw - 48)) {
      ctx.fillText(line, px + 24, y);
      y += 16;
    }
    ctx.font = '13px Arial, sans-serif';
  }

  y += 26;
  ctx.font = 'italic 12px Georgia, serif';
  ctx.fillStyle = '#c9d0d6';
  const noteLines = wrapText(ctx, chapter.childrenNote || '', pw - 48);
  for (const line of noteLines) {
    ctx.fillText(line, px + 24, y);
    y += 16;
  }

  y += 14;
  const colCount = 3;
  const colW = (pw - 48) / colCount;
  const rowH = 54;
  chapter.children.forEach((child, i) => {
    const col = i % colCount;
    const row = Math.floor(i / colCount);
    const cx = px + 24 + col * colW;
    const cy = y + row * rowH;
    ctx.fillStyle = '#f2efe6';
    ctx.font = 'bold 14px Georgia, serif';
    ctx.fillText(child.name, cx, cy);
    ctx.fillStyle = '#b7c2c9';
    ctx.font = '11px Arial, sans-serif';
    const childLines = wrapText(ctx, child.fate, colW - 16);
    let cyy = cy + 16;
    for (const line of childLines.slice(0, 2)) {
      ctx.fillText(line, cx, cyy);
      cyy += 14;
    }
  });

  const bw = 200;
  const bh = 44;
  const bx = px + pw - 24 - bw;
  const by = py + ph - 24 - bh;
  drawButton(ctx, bx, by, bw, bh, 'Continue →');
  addButton(bx, by, bw, bh, onContinue);
}
