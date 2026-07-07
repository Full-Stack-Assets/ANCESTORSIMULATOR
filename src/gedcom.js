// Dependency-free GEDCOM (5.5.1 / 7.0) parser — runs entirely in the browser.
//
// This is the front door of the "bring your own tree" product: a user's real
// family-history file is parsed HERE, on their device, and never uploaded
// anywhere. It turns the raw GEDCOM line stream into a small object graph of
// individuals and families that src/chapter.js can shape into a playable
// chapter.
//
// Scope: the common subset that real exports (Ancestry, FamilySearch, MyHeritage,
// Gramps, RootsMagic) actually emit — INDI/FAM records, NAME, SEX, event
// structures (BIRT/CHR/MARR/RESI/IMMI/DEAT/BURI/…) with DATE and PLAC, and
// coordinates when the file carries them (PLAC.MAP.LATI/LONG). CONC/CONT line
// continuations are honored. Unknown tags are ignored, not fatal — a partial
// but useful parse always beats a hard failure on someone's real data.

// ---- Line tokenizing -------------------------------------------------------

// A GEDCOM line is: <level> [@xref@] <tag> [value]
// e.g.  "1 BIRT", "2 DATE ABT 1706", "0 @I1@ INDI", "2 LATI N39.8918"
const LINE_RE = /^\s*(\d+)\s+(?:(@[^@]+@)\s+)?([A-Za-z0-9_.]+)(?:\s(.*))?$/;

function tokenize(text) {
  // Tolerate BOM and both CRLF and bare-CR line endings.
  const clean = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const nodes = [];
  for (const raw of clean.split('\n')) {
    if (!raw.trim()) continue;
    const m = LINE_RE.exec(raw);
    if (!m) continue; // skip malformed lines rather than aborting the whole parse
    nodes.push({
      level: parseInt(m[1], 10),
      xref: m[2] || null,
      tag: m[3].toUpperCase(),
      value: m[4] != null ? m[4] : '',
      children: [],
    });
  }
  return nodes;
}

// Fold the flat, level-numbered line list into a tree using a level stack.
// CONC (concatenate, no space) and CONT (continue, newline) fold into the
// parent's value rather than becoming their own nodes.
function buildTree(flat) {
  const roots = [];
  const stack = []; // stack[i] is the current node at level i
  for (const node of flat) {
    if (node.tag === 'CONC' || node.tag === 'CONT') {
      const parent = stack[node.level - 1];
      if (parent) parent.value += (node.tag === 'CONT' ? '\n' : '') + node.value;
      continue;
    }
    if (node.level === 0) {
      roots.push(node);
      stack.length = 0;
      stack[0] = node;
    } else {
      const parent = stack[node.level - 1];
      if (parent) parent.children.push(node);
      stack[node.level] = node;
      stack.length = node.level + 1;
    }
  }
  return roots;
}

// ---- Node helpers ----------------------------------------------------------

function child(node, tag) {
  return node.children.find((c) => c.tag === tag) || null;
}
function childValue(node, tag) {
  const c = child(node, tag);
  return c ? c.value.trim() : null;
}

// ---- Dates -----------------------------------------------------------------

// Pull a 3-4 digit year out of a GEDCOM date value. Handles ABT/EST/CAL
// prefixes, BET..AND / FROM..TO ranges (take the first year), and BC.
export function parseYear(dateValue) {
  if (!dateValue) return null;
  const bc = /\bB\.?C\.?\b/i.test(dateValue);
  const m = dateValue.match(/\d{3,4}/);
  if (!m) return null;
  const y = parseInt(m[0], 10);
  return bc ? -y : y;
}

// ---- Coordinates -----------------------------------------------------------

// GEDCOM stores coordinates as "N39.8918" / "W075.1163" (hemisphere letter +
// magnitude). Return a signed decimal, or null.
function parseCoord(value, negLetters) {
  if (!value) return null;
  const m = value.trim().match(/^([NSEW])?\s*([-+]?\d+(?:\.\d+)?)$/i);
  if (!m) return null;
  let n = parseFloat(m[2]);
  const hemi = (m[1] || '').toUpperCase();
  if (negLetters.includes(hemi)) n = -Math.abs(n);
  return n;
}

function placeOf(eventNode) {
  const plac = child(eventNode, 'PLAC');
  if (!plac) return null;
  const out = { name: plac.value.trim() || null, lat: null, lng: null };
  const map = child(plac, 'MAP');
  if (map) {
    out.lat = parseCoord(childValue(map, 'LATI'), ['S']);
    out.lng = parseCoord(childValue(map, 'LONG'), ['W']);
  }
  return out;
}

// ---- Names -----------------------------------------------------------------

// GEDCOM names use slashes around the surname: "Josiah /Albertson/".
export function cleanName(raw) {
  if (!raw) return 'Unknown';
  const name = raw.replace(/\//g, ' ').replace(/\s+/g, ' ').trim();
  return name || 'Unknown';
}

// ---- Events ----------------------------------------------------------------

// Event tags we surface as life "waypoints", with a human label and a rough
// ordering weight for events that share (or lack) a year.
const EVENT_LABELS = {
  BIRT: 'birth',
  CHR: 'christening',
  BAPM: 'baptism',
  IMMI: 'immigration',
  EMIG: 'emigration',
  MARR: 'marriage',
  RESI: 'residence',
  CENS: 'census',
  OCCU: 'occupation',
  EDUC: 'education',
  MILT: 'military service',
  EVEN: 'event',
  PROB: 'probate',
  WILL: 'will',
  DEAT: 'death',
  BURI: 'burial',
};
const EVENT_ORDER = { BIRT: 0, CHR: 1, BAPM: 1, IMMI: 3, EMIG: 3, MARR: 4, RESI: 5, CENS: 5, OCCU: 5, EDUC: 5, MILT: 5, EVEN: 6, PROB: 8, WILL: 8, DEAT: 9, BURI: 10 };

function extractEvents(node) {
  const events = [];
  for (const c of node.children) {
    const label = EVENT_LABELS[c.tag];
    if (!label) continue;
    const date = childValue(c, 'DATE');
    const place = placeOf(c);
    // Keep an event if it carries a date, a place, or an inline value (e.g.
    // "1 OCCU Shoemaker", which has neither date nor place but is still worth
    // surfacing — as the occupation field, not a walkable waypoint).
    if (!date && !(place && place.name) && !(c.value && c.value.trim())) continue;
    events.push({
      tag: c.tag,
      event: label,
      detail: c.value ? c.value.trim() : null, // inline payload, e.g. "1 OCCU Shoemaker"
      date: date || null,
      year: parseYear(date),
      order: EVENT_ORDER[c.tag] ?? 6,
      place: place ? place.name : null,
      lat: place ? place.lat : null,
      lng: place ? place.lng : null,
    });
  }
  return events;
}

// ---- Public API ------------------------------------------------------------

/**
 * Parse a GEDCOM string into an object graph.
 * @param {string} text raw file contents
 * @returns {{individuals: Map, families: Map, order: string[]}}
 *   individuals: xref -> { id, name, sex, events, famsIds, famcIds }
 *   families:    xref -> { id, husb, wife, marr, children: string[] }
 *   order:       individual xrefs in file order
 */
export function parseGedcom(text) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('Empty file — that does not look like a GEDCOM (.ged) export.');
  }
  const roots = buildTree(buildFlatOrThrow(text));

  const individuals = new Map();
  const families = new Map();
  const order = [];

  for (const rec of roots) {
    if (rec.tag === 'INDI' && rec.xref) {
      const events = extractEvents(rec);
      individuals.set(rec.xref, {
        id: rec.xref,
        name: cleanName(childValue(rec, 'NAME')),
        sex: (childValue(rec, 'SEX') || '').toUpperCase() || null,
        events,
        famsIds: rec.children.filter((c) => c.tag === 'FAMS').map((c) => c.value.trim()),
        famcIds: rec.children.filter((c) => c.tag === 'FAMC').map((c) => c.value.trim()),
      });
      order.push(rec.xref);
    } else if (rec.tag === 'FAM' && rec.xref) {
      const marr = child(rec, 'MARR');
      families.set(rec.xref, {
        id: rec.xref,
        husb: childValue(rec, 'HUSB'),
        wife: childValue(rec, 'WIFE'),
        marrYear: marr ? parseYear(childValue(marr, 'DATE')) : null,
        marrDate: marr ? childValue(marr, 'DATE') : null,
        marrPlace: marr ? placeOf(marr) : null,
        children: rec.children.filter((c) => c.tag === 'CHIL').map((c) => c.value.trim()),
      });
    }
  }

  if (individuals.size === 0) {
    throw new Error('No individuals (INDI records) found — is this a valid GEDCOM file?');
  }
  return { individuals, families, order };
}

function buildFlatOrThrow(text) {
  const flat = tokenize(text);
  // A real GEDCOM opens with a "0 HEAD" record; don't hard-require it (some
  // exports are messy) but if we see zero level-0 lines at all, it isn't one.
  if (!flat.some((n) => n.level === 0)) {
    throw new Error('That file has no GEDCOM records — expected level-0 lines like "0 @I1@ INDI".');
  }
  return flat;
}
