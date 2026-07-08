// GEDCOM → chapter JSON exporter — the data bridge between the web build and
// the Unreal build. It reuses the SAME parser the browser game uses
// (src/gedcom.js + src/chapter.js), so both engines render from one shared
// data model instead of two diverging implementations.
//
// Output is plain JSON: one file per chapter plus an index.json manifest. The
// Unreal importer (unreal/Source/AncestorJourney/ChapterData) reads these.
//
// Usage:
//   node tools/export_chapter_json.mjs --builtin --out unreal/Content/Data
//   node tools/export_chapter_json.mjs path/to/tree.ged --all --out out/
//   node tools/export_chapter_json.mjs path/to/tree.ged --id @I1@ --out out/
//
// Flags:
//   --builtin        export the two bundled sample chapters (no GEDCOM needed)
//   --all            export every walkable individual in the GEDCOM
//   --id <xref>      export a single individual by GEDCOM xref id
//   --out <dir>      output directory (default: ./chapters-json)

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeGedcom, parseGedcom } from '../src/gedcom.js';
import { listPlayableIndividuals, buildChapter } from '../src/chapter.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = { out: 'chapters-json', mode: 'default', input: null, id: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--builtin') args.mode = 'builtin';
    else if (a === '--all') args.mode = 'all';
    else if (a === '--id') { args.mode = 'id'; args.id = argv[++i]; }
    else if (a === '--out') args.out = argv[++i];
    else if (!a.startsWith('--')) args.input = a;
  }
  return args;
}

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'chapter';
}

async function builtinChapters() {
  // The bundled sample data are ES modules exporting the chapter objects.
  const { JOSIAH } = await import('../src/data/josiah.js');
  const { WILLIAM } = await import('../src/data/william.js');
  return [WILLIAM, JOSIAH];
}

function gedcomChapters(input, mode, id) {
  const bytes = readFileSync(input); // Buffer is Uint8Array-compatible
  const parsed = parseGedcom(decodeGedcom(bytes));
  if (mode === 'id') {
    if (!id) throw new Error('--id requires a GEDCOM xref, e.g. --id @I1@');
    return [buildChapter(parsed, id)];
  }
  const people = listPlayableIndividuals(parsed);
  if (!people.length) throw new Error('No walkable individuals found in that GEDCOM.');
  const chosen = mode === 'all' ? people : [people[0]];
  return chosen.map((p) => buildChapter(parsed, p.id));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let chapters;
  if (args.mode === 'builtin') {
    chapters = await builtinChapters();
  } else {
    if (!args.input) {
      console.error('Provide a GEDCOM file (or --builtin). See the header of this file for usage.');
      process.exit(2);
    }
    chapters = gedcomChapters(args.input, args.mode, args.id);
  }

  const outDir = path.isAbsolute(args.out) ? args.out : path.join(process.cwd(), args.out);
  mkdirSync(outDir, { recursive: true });

  const manifest = [];
  for (const ch of chapters) {
    const slug = slugify(ch.name);
    const file = `${slug}.json`;
    writeFileSync(path.join(outDir, file), JSON.stringify(ch, null, 2));
    manifest.push({ id: ch.id, name: ch.name, birthYear: ch.birthYear, deathYear: ch.deathYear, waypoints: (ch.waypoints || []).length, file });
  }
  writeFileSync(path.join(outDir, 'index.json'), JSON.stringify({ chapters: manifest }, null, 2));

  console.log(`Exported ${chapters.length} chapter(s) → ${outDir}`);
  for (const m of manifest) console.log(`  ${m.file}  (${m.name}, ${m.waypoints} stops)`);
}

main().catch((err) => { console.error(err.message || err); process.exit(1); });

export { slugify, gedcomChapters, builtinChapters, HERE };
