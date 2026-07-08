// Unit tests for the GEDCOM parser's robustness (no browser needed).
// Covers encoding detection (UTF-8/UTF-16 BOM, ANSI fallback) and name
// resolution from GIVN/SURN subtags — the real-world cases that trip up a
// naive UTF-8/slashed-NAME-only parser.
//
// Usage: node tools/test_gedcom.mjs

import { decodeGedcom, parseGedcom, cleanName } from '../src/gedcom.js';
import { listPlayableIndividuals } from '../src/chapter.js';

let failures = 0;
const ok = (cond, msg) => { if (!cond) { failures++; console.error('FAIL:', msg); } };

const enc = new TextEncoder();
function bytes(...arrs) {
  const total = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}
function utf16le(str) {
  const out = new Uint8Array(str.length * 2);
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    out[i * 2] = c & 0xff;
    out[i * 2 + 1] = c >> 8;
  }
  return out;
}

// --- Encoding ---
ok(decodeGedcom(bytes([0xef, 0xbb, 0xbf], enc.encode('0 HEAD'))) === '0 HEAD', 'UTF-8 BOM stripped');
ok(decodeGedcom(bytes([0xff, 0xfe], utf16le('0 HEAD'))) === '0 HEAD', 'UTF-16LE BOM decoded');
ok(decodeGedcom(bytes([0xfe, 0xff], utf16le('0 HEAD').reverse ? swapPairs(utf16le('0 HEAD')) : utf16le('0 HEAD'))).includes('HEAD'), 'UTF-16BE decoded');
// windows-1252 fallback: 0xE9 is 'é' in cp1252 but invalid standalone UTF-8.
ok(decodeGedcom(bytes(enc.encode('1 NAME Ren'), [0xe9], enc.encode('e /Dupont/'))).includes('Renée'), 'ANSI/windows-1252 fallback decodes accents');
ok(decodeGedcom(enc.encode('0 HEAD\n1 CHAR UTF-8')) === '0 HEAD\n1 CHAR UTF-8', 'plain UTF-8 passthrough');

function swapPairs(u8) {
  const out = new Uint8Array(u8.length);
  for (let i = 0; i + 1 < u8.length; i += 2) { out[i] = u8[i + 1]; out[i + 1] = u8[i]; }
  return out;
}

// --- Names from GIVN/SURN subtags ---
const ged = `0 HEAD
0 @I1@ INDI
1 NAME
2 GIVN John
2 SURN Smith
1 BIRT
2 DATE 1850
2 PLAC London, England
1 DEAT
2 DATE 1910
2 PLAC Boston, Massachusetts, USA
0 @I2@ INDI
1 NAME Mary /Jones/
1 BIRT
2 DATE 1852
0 TRLR`;
const parsed = parseGedcom(ged);
const i1 = parsed.individuals.get('@I1@');
ok(i1 && i1.name === 'John Smith', `GIVN/SURN name resolved (got ${i1 && i1.name})`);
ok(parsed.individuals.get('@I2@').name === 'Mary Jones', 'slashed NAME still works');
const walkable = listPlayableIndividuals(parsed);
ok(walkable.some((p) => p.name === 'John Smith'), 'GIVN/SURN individual is walkable');

// --- cleanName basics ---
ok(cleanName('Josiah /Albertson/') === 'Josiah Albertson', 'cleanName strips slashes');
ok(cleanName('') === 'Unknown', 'cleanName empty -> Unknown');

if (failures) { console.error(`\n${failures} test(s) failed`); process.exit(1); }
console.log('OK — GEDCOM parser unit tests passed');
