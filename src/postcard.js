// Keepsake postcard — the first Pro-gated feature.
//
// Renders a shareable card for an ancestor's journey on an offscreen 2D canvas
// (name, lifespan, every stop with its confidence, a footer mark) and downloads
// it as a PNG. Pure canvas, no dependencies, no network. 1200×630 so the same
// image doubles as a social/OpenGraph share card.

const W = 1200;
const H = 630;

const CONFIDENCE_COLOR = {
  documented: '#3ba55c',
  inferred: '#3b82c4',
  legend: '#9b59b6',
};

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Build the postcard canvas for a chapter. Exported for testing/preview. */
export function buildPostcard(chapter) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Dusk-parchment backdrop.
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#1c2530');
  bg.addColorStop(1, '#2b2417');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Inner frame.
  ctx.strokeStyle = 'rgba(242, 193, 78, 0.55)';
  ctx.lineWidth = 2;
  roundRect(ctx, 24, 24, W - 48, H - 48, 14);
  ctx.stroke();

  // Header.
  ctx.textAlign = 'left';
  ctx.fillStyle = '#f2c14e';
  ctx.font = 'italic 20px Georgia, serif';
  ctx.fillText('AN ANCESTOR JOURNEY', 60, 78);

  ctx.fillStyle = '#f2efe6';
  ctx.font = 'bold 52px Georgia, serif';
  ctx.fillText(fit(ctx, chapter.name || 'Unknown', 'bold 52px Georgia, serif', W - 120), 60, 138);

  const lifespan =
    chapter.birthYear && chapter.deathYear
      ? `${chapter.birthYear} – ${chapter.deathYear}`
      : chapter.birthYear
        ? `born ${chapter.birthYear}`
        : chapter.deathYear
          ? `died ${chapter.deathYear}`
          : 'dates unrecorded';
  ctx.fillStyle = '#c9d0d6';
  ctx.font = '24px Georgia, serif';
  ctx.fillText(lifespan, 60, 176);

  // Divider.
  ctx.strokeStyle = 'rgba(242,239,230,0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(60, 200);
  ctx.lineTo(W - 60, 200);
  ctx.stroke();

  // Waypoint list (up to 9, so it never overflows the card).
  const stops = (chapter.waypoints || []).slice(0, 9);
  let y = 240;
  const rowH = (H - 240 - 70) / Math.max(1, stops.length);
  ctx.textBaseline = 'middle';
  for (const wp of stops) {
    const cy = y + rowH / 2;
    ctx.fillStyle = CONFIDENCE_COLOR[wp.confidence] || '#8b9399';
    ctx.beginPath();
    ctx.arc(74, cy, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#f2efe6';
    ctx.font = 'bold 22px Georgia, serif';
    const year = wp.year || (wp.date || '').match(/\d{3,4}/)?.[0] || '—';
    ctx.fillText(`${year}`, 96, cy);

    ctx.fillStyle = '#e8e6df';
    ctx.font = '20px Georgia, serif';
    const label = `${cap(wp.event || 'event')} — ${wp.place || 'an unrecorded place'}`;
    ctx.fillText(fit(ctx, label, '20px Georgia, serif', W - 300), 176, cy);
    y += rowH;
  }

  // Footer.
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#9aa3a8';
  ctx.font = 'italic 16px Georgia, serif';
  ctx.fillText('Walked from a real family tree · ancestor-journey', 60, H - 42);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#f2c14e';
  ctx.font = '20px Georgia, serif';
  ctx.fillText('✦', W - 60, H - 42);

  return canvas;
}

/** Build + download the postcard as a PNG. */
export function downloadPostcard(chapter) {
  const canvas = buildPostcard(chapter);
  const slug = (chapter.name || 'ancestor').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const done = (blobUrl) => {
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `${slug || 'ancestor'}-journey.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  if (canvas.toBlob) {
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      done(url);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }, 'image/png');
  } else {
    done(canvas.toDataURL('image/png'));
  }
}

// Truncate `text` with an ellipsis so it fits `maxWidth` in the given font.
function fit(ctx, text, font, maxWidth) {
  const prev = ctx.font;
  ctx.font = font;
  if (ctx.measureText(text).width <= maxWidth) {
    ctx.font = prev;
    return text;
  }
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
  ctx.font = prev;
  return t + '…';
}

function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
