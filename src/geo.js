// Turns a chapter's real lat/lng waypoints into a walkable local layout.
//
// The problem: William's life crosses an ocean (Ireland -> Delaware Valley,
// ~5,000 km); Josiah's covers "the fifteen miles his father settled" (~20 km).
// Rendered at true scale, one is unplayable and the other is a speck. Rendered
// at a single flat scale, William's chapter either takes twenty minutes to
// cross or Josiah's collapses to a point.
//
// The fix: walk the waypoints in order, and for each step from the previous
// stop, keep the REAL bearing (direction) but compress the REAL distance on a
// log curve. Short local hops (under LOCAL_CAP_KM) stay close to true scale —
// walking across a farm feels like walking across a farm. Everything beyond
// that gets compressed hard, so an ocean crossing becomes a few minutes of
// walking instead of a fact you take on faith. This is a staging choice for
// playability, not a claim about geography — the underlying lat/lng survive
// untouched in the waypoint data for anyone who wants true positions later
// (e.g. a future map/globe view).

const KM_PER_DEG_LAT = 110.574;
function kmPerDegLng(latDeg) {
  return 111.320 * Math.cos((latDeg * Math.PI) / 180);
}

const LOCAL_CAP_KM = 0.15; // up to 150 m of real travel renders 1:1 (1 unit = 1 m)
const UNITS_PER_KM_LOCAL = 1000;
const LOG_SPAN_UNITS = 130; // units added per factor-of-ten beyond the cap

function compressKm(km) {
  if (km <= 0) return 0;
  if (km <= LOCAL_CAP_KM) return km * UNITS_PER_KM_LOCAL;
  const base = LOCAL_CAP_KM * UNITS_PER_KM_LOCAL;
  return base + Math.log10(km / LOCAL_CAP_KM) * LOG_SPAN_UNITS;
}

// A life can revisit a place it's already been to, which lands two waypoints
// on (or near) the exact same real coordinates and collapses them to the same
// local spot -- impossible to tell apart in-world. When a freshly-projected
// point lands too close to an earlier one, nudge it out to a deterministic
// spot on a golden-angle spiral around whichever earlier point it collided
// with, so a return trip reads as "the same place, visited again" (a kink in
// the path) instead of one invisible, unreachable marker.
const MIN_SEPARATION_UNITS = 20; // comfortably more than world.js's ARRIVE_RADIUS (6)
const GOLDEN_ANGLE = 2.399963229728653; // radians

function resolveCollision(x, z, placed, seed) {
  let px = x;
  let pz = z;
  for (let attempt = 0; attempt < placed.length + 4; attempt++) {
    const hit = placed.find((p) => Math.hypot(p.x - px, p.z - pz) < MIN_SEPARATION_UNITS);
    if (!hit) return { x: px, z: pz };
    const angle = (seed + attempt) * GOLDEN_ANGLE;
    px = hit.x + Math.cos(angle) * MIN_SEPARATION_UNITS;
    pz = hit.z + Math.sin(angle) * MIN_SEPARATION_UNITS;
  }
  return { x: px, z: pz };
}

/**
 * @param {{lat:number, lng:number}[]} waypoints
 * @returns {{x:number, z:number, segmentKm:number}[]} local positions, one
 *   per waypoint, plus the real km walked to reach it from the previous stop
 *   (0 for the first). +x is east, -z is north (Three.js convention: camera
 *   looks down -z by default).
 */
export function projectWaypoints(waypoints) {
  const out = [];
  let cx = 0;
  let cz = 0;
  let prev = null;
  waypoints.forEach((wp, i) => {
    if (!prev) {
      out.push({ x: 0, z: 0, segmentKm: 0 });
    } else {
      const dLat = wp.lat - prev.lat;
      const dLng = wp.lng - prev.lng;
      const midLat = (wp.lat + prev.lat) / 2;
      const dzKm = -dLat * KM_PER_DEG_LAT; // north decreases z
      const dxKm = dLng * kmPerDegLng(midLat);
      const km = Math.hypot(dxKm, dzKm);
      const compressed = compressKm(km);
      const scale = km > 0 ? compressed / km : 0;
      cx += dxKm * scale;
      cz += dzKm * scale;
      const resolved = resolveCollision(cx, cz, out, i);
      cx = resolved.x;
      cz = resolved.z;
      out.push({ x: cx, z: cz, segmentKm: km });
    }
    prev = wp;
  });
  return out;
}
