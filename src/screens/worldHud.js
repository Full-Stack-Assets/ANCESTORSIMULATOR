import { roundRect } from '../ui/canvas.js';

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('../types.js').Chapter} chapter
 * @param {object} worldState
 * @param {number} W
 * @param {number} H
 * @param {number} promptFlash
 * @param {(x: number, y: number, w: number, h: number, onClick: () => void) => void} addButton
 * @param {() => void} onInteract
 */
export function drawWorldHud(ctx, chapter, worldState, W, H, promptFlash, addButton, onInteract) {
  const wp = chapter.waypoints[worldState.interactable];
  ctx.clearRect(0, 0, W, H);

  ctx.textAlign = 'center';
  ctx.font = 'bold 13px Arial, sans-serif';
  const heading = ((((-worldState.player.yaw * 180) / Math.PI) % 360) + 360) % 360;
  ctx.fillStyle = 'rgba(20,26,32,0.75)';
  roundRect(ctx, W / 2 - 90, 14, 180, 26, 6);
  ctx.fill();
  ctx.fillStyle = '#f2efe6';
  ctx.fillText(`${chapter.name} — ${compassLabel(heading)}`, W / 2, 32);

  if (wp) {
    const pulse = 0.85 + Math.sin(promptFlash) * 0.15;
    const label = `Press E to examine: ${wp.event}`;
    ctx.font = 'bold 16px Georgia, serif';
    const pw = ctx.measureText(label).width + 48;
    const px = W / 2 - pw / 2;
    const py = H - 76;
    ctx.fillStyle = `rgba(242, 193, 78, ${pulse})`;
    roundRect(ctx, px, py, pw, 42, 8);
    ctx.fill();
    ctx.fillStyle = '#1c2530';
    ctx.fillText(label, W / 2, py + 27);
    addButton(px, py, pw, 42, onInteract);
  } else {
    ctx.font = 'italic 13px Georgia, serif';
    ctx.fillStyle = 'rgba(28,37,48,0.85)';
    ctx.fillText('Walk toward the glowing marker to continue the journey.', W / 2, H - 30);
  }
}

function compassLabel(heading) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(heading / 45) % 8];
}
