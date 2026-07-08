// Saved journeys — a Pro feature. Persists the ancestors you've walked (and how
// far) to localStorage so you can pick them back up later, including ones from
// an imported tree without re-uploading the file.
//
// Privacy-consistent with the rest of the product: this is the user's own data
// staying on the user's own device. Nothing is transmitted. The full chapter
// object is stored (it's self-contained JSON) so a journey resumes exactly.

const KEY = 'anc_journeys_v1';
const MAX = 30; // keep the most recent N; old ones fall off

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function write(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* storage full / disabled — saving is best-effort */
  }
}

/** Save (or update) a journey, most-recent first. Keyed by chapter id. */
export function saveJourney(chapter, progress, now) {
  if (!chapter || !chapter.id) return;
  const list = read().filter((j) => j.id !== chapter.id);
  list.unshift({
    id: chapter.id,
    name: chapter.name,
    birthYear: chapter.birthYear ?? null,
    deathYear: chapter.deathYear ?? null,
    progress: progress | 0,
    total: (chapter.waypoints && chapter.waypoints.length) || 0,
    imported: !!chapter.imported,
    savedAt: now || 0, // caller passes a timestamp; 0 is fine (display-only)
    chapter,
  });
  write(list);
}

export function listJourneys() {
  return read();
}

export function getJourney(id) {
  return read().find((j) => j.id === id) || null;
}

export function removeJourney(id) {
  write(read().filter((j) => j.id !== id));
}
