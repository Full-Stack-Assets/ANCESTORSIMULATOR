// Single source of truth for documented / inferred / legend styling.

export const CONFIDENCE = {
  documented: { hex: 0x3ba55c, css: '#3ba55c', label: 'DOCUMENTED', icon: '✓' },
  inferred: { hex: 0x3b82c4, css: '#3b82c4', label: 'INFERRED', icon: '?' },
  legend: { hex: 0x9b59b6, css: '#9b59b6', label: 'LEGEND', icon: '✦' },
};

export function confidenceCss(key) {
  return CONFIDENCE[key]?.css ?? CONFIDENCE.documented.css;
}

export function confidenceHex(key) {
  return CONFIDENCE[key]?.hex ?? 0x999999;
}

export function confidenceLabel(key) {
  return CONFIDENCE[key]?.label ?? CONFIDENCE.documented.label;
}

export function confidenceIcon(key) {
  return CONFIDENCE[key]?.icon ?? CONFIDENCE.documented.icon;
}
