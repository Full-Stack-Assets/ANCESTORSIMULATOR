// Lightweight, synthesized game audio via the Web Audio API — no audio files
// to fetch, host, or bundle, consistent with this project's "no external
// assets" approach. Everything here is procedural: filtered noise for wind
// and footsteps, a couple of sine tones for the arrival chime.

let ctx = null;
let windGain = null;
let supported = true;

function ensureContext() {
  if (ctx || !supported) return ctx;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) {
    supported = false;
    return null;
  }
  try {
    ctx = new Ctor();
  } catch {
    supported = false;
    ctx = null;
  }
  return ctx;
}

function noiseBuffer(context, seconds) {
  const buffer = context.createBuffer(1, Math.max(1, Math.floor(context.sampleRate * seconds)), context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** Unlocks the AudioContext and starts a soft, ever-present wind bed. Must be
 * called from a real user gesture (browsers block audio until then) — call
 * on the first keydown/mousedown once the world is entered. Safe to call
 * repeatedly; only does anything the first time. */
export function startAmbience() {
  const c = ensureContext();
  if (!c || windGain) return;
  if (c.state === 'suspended') c.resume().catch(() => {});

  const source = c.createBufferSource();
  source.buffer = noiseBuffer(c, 4);
  source.loop = true;

  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 500;

  windGain = c.createGain();
  windGain.gain.value = 0.045;

  source.connect(filter).connect(windGain).connect(c.destination);
  source.start();

  // A slow amplitude drift so the wind breathes instead of sitting static.
  const lfo = c.createOscillator();
  lfo.frequency.value = 0.07;
  const lfoGain = c.createGain();
  lfoGain.gain.value = 0.02;
  lfo.connect(lfoGain).connect(windGain.gain);
  lfo.start();
}

/** One short footstep tick, called from world.js's movement loop while the
 * player is actually covering ground. */
export function footstep() {
  const c = ensureContext();
  if (!c) return;
  const source = c.createBufferSource();
  source.buffer = noiseBuffer(c, 0.08);
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 180 + Math.random() * 60;
  filter.Q.value = 0.8;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.16, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.09);
  source.connect(filter).connect(gain).connect(c.destination);
  source.start();
  source.stop(c.currentTime + 0.1);
}

/** A soft rising two-note chime, played once when a waypoint newly becomes
 * examinable — an audible echo of the "press E" prompt appearing. */
export function arrivalChime() {
  const c = ensureContext();
  if (!c) return;
  [660, 880].forEach((freq, i) => {
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const gain = c.createGain();
    const start = c.currentTime + i * 0.09;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.09, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
    osc.connect(gain).connect(c.destination);
    osc.start(start);
    osc.stop(start + 0.55);
  });
}
