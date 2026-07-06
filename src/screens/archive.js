import { wrapText, roundRect } from '../ui/canvas.js';

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('../types.js').ChapterEntry[]} chapters
 * @param {{ chapterFocus: number }} state
 * @param {number} W
 * @param {number} H
 * @param {(x: number, y: number, w: number, h: number, onClick: () => void) => void} addButton
 * @param {(chapter: import('../types.js').Chapter) => void} onSelectChapter
 */
export function renderArchive(ctx, chapters, state, W, H, addButton, onSelectChapter) {
  ctx.fillStyle = '#1c2530';
  ctx.textAlign = 'center';
  ctx.font = 'bold 34px Georgia, serif';
  ctx.fillText('THE ARCHIVE', W / 2, 90);
  ctx.font = 'italic 15px Georgia, serif';
  ctx.fillText('Choose an ancestor to walk their documented life.', W / 2, 120);

  const cardW = 380;
  const cardH = 150;
  const gap = 30;
  const totalW = chapters.length * cardW + (chapters.length - 1) * gap;
  const startX = W / 2 - totalW / 2;
  const cardY = 180;

  chapters.forEach((ch, i) => {
    const cx = startX + i * (cardW + gap);
    ctx.fillStyle = 'rgba(20, 26, 32, 0.92)';
    roundRect(ctx, cx, cardY, cardW, cardH, 10);
    ctx.fill();
    ctx.strokeStyle = i === state.chapterFocus ? '#f2c14e' : '#556170';
    ctx.lineWidth = i === state.chapterFocus ? 3 : 2;
    roundRect(ctx, cx, cardY, cardW, cardH, 10);
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
    const lines = wrapText(ctx, ch.teaser, cardW - 40);
    let ty = cardY + 84;
    for (const line of lines) {
      ctx.fillText(line, cx + 20, ty);
      ty += 18;
    }

    addButton(cx, cardY, cardW, cardH, () => onSelectChapter(ch.data));
  });
}
