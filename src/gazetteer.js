// A small, bundled place-name → coordinate fallback.
//
// Many real GEDCOM exports carry no MAP/LATI/LONG coordinates — just place
// STRINGS like "Gloucester, New Jersey, USA". To place those on the walkable
// map without shipping a full geocoder or making any network call (the whole
// product promise is "your data never leaves your device"), we resolve the
// coarsest recognizable component of the place string against this compact
// gazetteer of countries, US/UK/CA/AU regions, and common genealogy locales.
//
// This is deliberately approximate: it gets a life onto roughly the right part
// of the world so the journey reads true at the scale geo.js renders (which
// already compresses distance heavily). Trees WITH real coordinates always use
// those instead — see chapter.js. Coordinates here are rough centroids.

const PLACES = {
  // continents / broad regions
  'europe': [54.526, 15.255], 'north america': [40.0, -100.0], 'south america': [-8.783, -55.491],
  'africa': [8.783, 21.094], 'asia': [34.048, 100.62], 'oceania': [-22.735, 140.02],
  // countries (common in Anglo-American genealogy)
  'united states': [39.5, -98.35], 'usa': [39.5, -98.35], 'united states of america': [39.5, -98.35],
  'england': [52.355, -1.174], 'scotland': [56.49, -4.202], 'wales': [52.13, -3.784],
  'ireland': [53.413, -8.244], 'northern ireland': [54.787, -6.492], 'united kingdom': [54.0, -2.5],
  'canada': [56.13, -106.35], 'france': [46.228, 2.214], 'germany': [51.166, 10.452],
  'italy': [41.872, 12.567], 'spain': [40.464, -3.75], 'sweden': [60.128, 18.644],
  'norway': [60.472, 8.469], 'denmark': [56.264, 9.502], 'netherlands': [52.133, 5.291],
  'switzerland': [46.818, 8.228], 'poland': [51.919, 19.145], 'russia': [61.524, 105.319],
  'australia': [-25.274, 133.775], 'new zealand': [-40.9, 174.886], 'mexico': [23.635, -102.553],
  // US states
  'alabama': [32.806, -86.791], 'alaska': [61.37, -152.404], 'arizona': [33.729, -111.431],
  'arkansas': [34.97, -92.373], 'california': [36.116, -119.682], 'colorado': [39.059, -105.311],
  'connecticut': [41.598, -72.756], 'delaware': [39.319, -75.507], 'florida': [27.766, -81.687],
  'georgia': [33.04, -83.643], 'hawaii': [21.094, -157.498], 'idaho': [44.24, -114.478],
  'illinois': [40.349, -88.986], 'indiana': [39.849, -86.258], 'iowa': [42.011, -93.21],
  'kansas': [38.526, -96.726], 'kentucky': [37.668, -84.67], 'louisiana': [31.169, -91.867],
  'maine': [44.693, -69.381], 'maryland': [39.064, -76.802], 'massachusetts': [42.23, -71.53],
  'michigan': [43.326, -84.536], 'minnesota': [45.694, -93.9], 'mississippi': [32.741, -89.678],
  'missouri': [38.456, -92.288], 'montana': [46.921, -110.454], 'nebraska': [41.125, -98.268],
  'nevada': [38.313, -117.055], 'new hampshire': [43.452, -71.564], 'new jersey': [40.298, -74.521],
  'new mexico': [34.84, -106.248], 'new york': [42.166, -74.948], 'north carolina': [35.63, -79.806],
  'north dakota': [47.528, -99.784], 'ohio': [40.388, -82.765], 'oklahoma': [35.565, -96.928],
  'oregon': [44.572, -122.071], 'pennsylvania': [40.59, -77.209], 'rhode island': [41.68, -71.511],
  'south carolina': [33.856, -80.945], 'south dakota': [44.299, -99.438], 'tennessee': [35.747, -86.692],
  'texas': [31.054, -97.563], 'utah': [40.15, -111.862], 'vermont': [44.045, -72.71],
  'virginia': [37.769, -78.17], 'washington': [47.4, -121.49], 'west virginia': [38.491, -80.954],
  'wisconsin': [44.268, -89.616], 'wyoming': [42.756, -107.302],
  // a handful of frequently-seen cities/counties
  'london': [51.507, -0.128], 'liverpool': [53.408, -2.992], 'dublin': [53.35, -6.26],
  'belfast': [54.597, -5.93], 'edinburgh': [55.953, -3.188], 'glasgow': [55.864, -4.252],
  'manchester': [53.481, -2.242], 'bristol': [51.454, -2.588], 'york': [53.96, -1.08],
  'new york city': [40.713, -74.006], 'boston': [42.36, -71.058], 'philadelphia': [39.953, -75.164],
  'chicago': [41.878, -87.63], 'baltimore': [39.29, -76.612], 'nantucket': [41.284, -70.1],
  'quebec': [52.94, -73.549], 'ontario': [51.253, -85.323], 'nova scotia': [44.682, -63.744],
};

/**
 * Resolve a place STRING to a rough [lat, lng], or null if nothing matches.
 * Tries each comma-separated component (most specific first), then a loose
 * substring scan, so "Newton, Gloucester Co., New Jersey" resolves via
 * "new jersey" even though "newton" isn't in the table.
 */
export function lookupPlace(placeName) {
  if (!placeName) return null;
  const parts = placeName.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  // Most specific → least specific exact match.
  for (const part of parts) {
    if (PLACES[part]) return { lat: PLACES[part][0], lng: PLACES[part][1] };
  }
  // Loose contains match (handles "co. new jersey", "kingdom of england", …).
  const whole = placeName.toLowerCase();
  let best = null;
  for (const key of Object.keys(PLACES)) {
    if (whole.includes(key) && (!best || key.length > best.length)) best = key;
  }
  return best ? { lat: PLACES[best][0], lng: PLACES[best][1] } : null;
}
