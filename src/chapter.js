// Turn a parsed GEDCOM individual into a playable "chapter" — the exact shape
// src/main.js and src/world.js already consume for the built-in ancestors.
// This is what lets the SAME engine render anyone's family tree.
//
// Design choices that matter:
//  - Every waypoint must carry lat/lng (geo.js projects the walk from them).
//    We use real coordinates from the file when present, fall back to the
//    bundled gazetteer for place strings, and as a last resort carry the last
//    known point forward with a deterministic nudge so a life with sparse
//    geography is still walkable. This mirrors geo.js's existing stance:
//    playability staging, never a claim about literal geography.
//  - Confidence badges come from date PRECISION (exact vs. ABT/EST/BET…),
//    since a user's own tree carries no source-quality grading. We only ever
//    label 'documented' or 'inferred' here — never 'legend', which is reserved
//    for curated lore in the built-in chapters.

import { lookupPlace } from './gazetteer.js';

const APPROX_RE = /\b(ABT|EST|CAL|BET|AND|FROM|TO|AFT|BEF|CIRCA|C\.)\b/i;
const MAX_WAYPOINTS = 14; // keep the walk to a sane length on huge lives

function confidenceOf(ev) {
  if (ev.date && !APPROX_RE.test(ev.date)) return 'documented';
  return 'inferred';
}

function titleCase(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function yearRange(indiv) {
  const birth = indiv.events.find((e) => e.tag === 'BIRT');
  const death = indiv.events.find((e) => e.tag === 'DEAT');
  return {
    birthYear: birth ? birth.year : null,
    deathYear: death ? death.year : null,
  };
}

// Events worth walking to: those with a date OR a place, sorted chronologically
// (falling back to the event-type ordering weight when years tie or are absent),
// then capped so a 40-event life doesn't become a 40-stop slog.
function orderedEvents(indiv) {
  const evs = indiv.events
    .filter((e) => e.date || e.place)
    .slice()
    .sort((a, b) => {
      const ay = a.year ?? 9999;
      const by = b.year ?? 9999;
      if (ay !== by) return ay - by;
      return a.order - b.order;
    });
  if (evs.length <= MAX_WAYPOINTS) return evs;
  // Always keep first (birth-ish) and last (death-ish); sample the middle evenly.
  const keep = [evs[0]];
  const midCount = MAX_WAYPOINTS - 2;
  const step = (evs.length - 2) / (midCount + 1);
  for (let i = 1; i <= midCount; i++) keep.push(evs[Math.round(i * step)]);
  keep.push(evs[evs.length - 1]);
  return keep;
}

// Resolve coordinates for every event, guaranteeing a usable lat/lng on each
// so geo.js can always project a path. Precedence: file coords → gazetteer →
// carry-forward-with-nudge.
function withCoordinates(events) {
  let last = null;
  const GOLDEN = 2.399963229728653;
  return events.map((ev, i) => {
    let lat = typeof ev.lat === 'number' ? ev.lat : null;
    let lng = typeof ev.lng === 'number' ? ev.lng : null;
    let approxLoc = false;
    if (lat == null || lng == null) {
      const g = lookupPlace(ev.place);
      if (g) { lat = g.lat; lng = g.lng; approxLoc = true; }
    }
    if (lat == null || lng == null) {
      // No geography at all: sit near the previous stop on a deterministic
      // spiral so consecutive placeless events don't stack on one another.
      const base = last || { lat: 0, lng: 0 };
      const a = i * GOLDEN;
      lat = base.lat + Math.cos(a) * 0.06;
      lng = base.lng + Math.sin(a) * 0.06;
      approxLoc = true;
    }
    last = { lat, lng };
    return { ...ev, lat, lng, approxLoc };
  });
}

function narrativeFor(ev, spouseName) {
  const where = ev.place ? ` in ${ev.place}` : '';
  const when = ev.date ? ` (${ev.date})` : '';
  switch (ev.tag) {
    case 'BIRT': return `Born${when}${where}.`;
    case 'CHR': return `Christened${when}${where}.`;
    case 'BAPM': return `Baptized${when}${where}.`;
    case 'MARR': return `Married${spouseName ? ' ' + spouseName : ''}${when}${where}.`;
    case 'IMMI': return `Immigrated${when}${where}.`;
    case 'EMIG': return `Emigrated${when}${where}.`;
    case 'RESI': return `Living${where}${when}.`;
    case 'CENS': return `Recorded in the census${where}${when}.`;
    case 'OCCU': return `Worked as ${ev.detail || 'recorded'}${where}${when}.`;
    case 'MILT': return `Military service${where}${when}.`;
    case 'DEAT': return `Died${when}${where}.`;
    case 'BURI': return `Buried${when}${where}.`;
    default: return `${titleCase(ev.event)}${when}${where}.`;
  }
}

// Find the individual's primary spouse and gather children across all families.
function familyOf(indiv, parsed) {
  let spouse = null;
  let spouseFam = null;
  const childIds = [];
  for (const famId of indiv.famsIds) {
    const fam = parsed.families.get(famId);
    if (!fam) continue;
    const otherId = fam.husb === indiv.id ? fam.wife : fam.husb;
    if (otherId && !spouse) {
      const other = parsed.individuals.get(otherId);
      if (other) {
        const yr = yearRange(other);
        spouse = {
          name: other.name,
          birthYear: yr.birthYear,
          deathYear: yr.deathYear,
          marriageYear: fam.marrYear,
          marriagePlace: fam.marrPlace ? fam.marrPlace.name : null,
          confidence: fam.marrDate && !APPROX_RE.test(fam.marrDate) ? 'documented' : 'inferred',
        };
        spouseFam = fam;
      }
    }
    childIds.push(...fam.children);
  }
  const children = childIds.map((cid) => {
    const c = parsed.individuals.get(cid);
    if (!c) return null;
    const yr = yearRange(c);
    const span = yr.birthYear && yr.deathYear ? `${yr.birthYear}–${yr.deathYear}`
      : yr.birthYear ? `b. ${yr.birthYear}` : yr.deathYear ? `d. ${yr.deathYear}` : 'dates unrecorded';
    return { name: c.name, fate: span };
  }).filter(Boolean);
  return { spouse, spouseFam, children };
}

/**
 * List the individuals rich enough to walk, best first, for the picker UI.
 * @returns {{id, name, birthYear, deathYear, eventCount, teaser}[]}
 */
export function listPlayableIndividuals(parsed) {
  const out = [];
  for (const id of parsed.order) {
    const indiv = parsed.individuals.get(id);
    if (!indiv) continue;
    const located = indiv.events.filter((e) => e.date || e.place);
    if (located.length < 2) continue; // need at least a couple of stops to walk
    const { birthYear, deathYear } = yearRange(indiv);
    out.push({
      id,
      name: indiv.name,
      birthYear,
      deathYear,
      eventCount: located.length,
      teaser: `${located.length} recorded life events.`,
    });
  }
  // Richest lives first; then earliest, so the "oldest well-documented ancestor"
  // tends to surface at the top.
  out.sort((a, b) => b.eventCount - a.eventCount || (a.birthYear ?? 9999) - (b.birthYear ?? 9999));
  return out;
}

/**
 * Build a full chapter object for one individual.
 * @returns chapter shaped exactly like src/data/*.js
 */
export function buildChapter(parsed, individualId) {
  const indiv = parsed.individuals.get(individualId);
  if (!indiv) throw new Error('That person is not in the parsed tree.');

  const { birthYear, deathYear } = yearRange(indiv);
  const { spouse, children } = familyOf(indiv, parsed);
  const events = withCoordinates(orderedEvents(indiv));

  const waypoints = events.map((ev, i) => ({
    seq: i + 1,
    place: ev.place || 'an unrecorded place',
    lat: ev.lat,
    lng: ev.lng,
    date: ev.date,
    year: ev.year,
    event: ev.event,
    narrative: narrativeFor(ev, spouse ? spouse.name : null),
    // A stop whose location we could only approximate can't claim "documented".
    confidence: ev.approxLoc ? 'inferred' : confidenceOf(ev),
  }));

  const places = [...new Set(events.map((e) => e.place).filter(Boolean))];
  const occ = indiv.events.find((e) => e.tag === 'OCCU' && e.detail);
  const lifespan = birthYear && deathYear ? `${birthYear}–${deathYear}`
    : birthYear ? `born ${birthYear}` : deathYear ? `died ${deathYear}` : 'dates unrecorded';

  const summaryBits = [`${indiv.name} (${lifespan}).`];
  if (waypoints.length) summaryBits.push(`This journey walks ${waypoints.length} recorded moments of their life${places.length ? ` across ${places.slice(0, 3).join('; ')}${places.length > 3 ? '; and elsewhere' : ''}` : ''}.`);
  if (spouse) summaryBits.push(`Married ${spouse.name}${spouse.marriageYear ? ` in ${spouse.marriageYear}` : ''}.`);

  return {
    id: indiv.id,
    name: indiv.name,
    birthYear: birthYear ?? (waypoints[0] ? waypoints[0].year : null),
    deathYear: deathYear ?? (waypoints.length ? waypoints[waypoints.length - 1].year : null),
    summary: summaryBits.join(' '),
    journeyStatus: 'imported',
    waypoints,
    occupation: occ ? { value: occ.detail, confidence: 'documented' } : null,
    spouse,
    legacyNote: children.length
      ? `${indiv.name} left ${children.length} recorded ${children.length === 1 ? 'child' : 'children'} in your tree — the line that reaches you.`
      : `${indiv.name}'s life, walked from the records in your own family tree.`,
    familyNote: null,
    children,
    childrenNote: children.length ? `${children.length} children recorded in the imported tree.` : 'No children recorded in the imported tree.',
    childrenConfidence: 'documented',
    imported: true, // marks a user-supplied chapter (vs. the curated built-ins)
  };
}
