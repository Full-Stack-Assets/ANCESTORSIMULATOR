# Ancestor Journey

A family-history journey game — walk your real ancestors' documented lives,
with fact and legend labeled on screen. Data comes from the
[ANC](https://github.com/full-stack-assets/anc) repo's researched person and
journey records, not invented lore.

## The Archive: two playable chapters

The current build is a small **archive** — a chapter-select screen — with two
playable ancestors:

- **William Albertson** (c. 1635–1709): an Irish Quaker who crossed the
  Atlantic, five life stops, two wives and seven children.
- **Josiah Albertson** (c. 1706–1783), his son: a shoemaker who never left
  the fifteen miles his father settled, six life stops, nine children.

Pick a chapter and you land in a real, walkable **3D open world** built from
that ancestor's own waypoints (see "The open world" below) — walk up to each
stop and every one shows a **confidence badge** — Documented / Inferred /
Legend — pulled straight from the source record, so invented texture is
never presented as fact. Each chapter ends with a Family & Legacy screen
(occupation, marriage, children with real sourced fates) before returning
you to the archive to pick the next one.

No build step, no framework: plain HTML5 canvas + Three.js (loaded via an
import map, no bundler) and vanilla JS.

## The open world

The "map" screen is a real 3D space, not a 2D path diagram. Three.js renders
a WebGL canvas (`#world`) stacked behind the existing 2D UI canvas
(`#stage`); the 2D canvas still draws the HUD (compass, "press E to
examine" prompt) and every non-map screen exactly as before.

- **Movement**: WASD/arrow keys walk and turn, drag the mouse to look
  around. There's no Pointer Lock — mouse-drag-to-look was chosen instead so
  the controls stay scriptable/testable in headless Chromium.
- **Waypoints** are placed by `src/geo.js`, which turns each stop's real
  lat/lng into a local position: it keeps the true bearing between
  consecutive stops but compresses the true distance on a log curve, so a
  transatlantic crossing (William, ~5,000 km) and a fifteen-mile colonial
  life (Josiah) are both walkable in a few minutes without one being a speck
  and the other unplayably vast. The compression is a staging choice for
  playability, not a claim about geography — the real lat/lng still live in
  the waypoint data. When a life revisits an earlier stop's exact
  coordinates (this happens — see William's return to Byberry), `geo.js`
  nudges the repeat stop to a nearby distinct spot so it stays reachable as
  its own marker rather than overlapping the earlier one.
- Only stops you've reached (plus the current frontier stop, marked with a
  glowing ring) are visible and walkable-to; walking within range of one and
  pressing **E** (or Enter/Space) opens its detail screen, same as before.

## Run it

```sh
npm install         # playwright is a devDependency, used only for the smoke test
npm run serve        # serves the repo root at http://127.0.0.1:8917
```

Then open `http://127.0.0.1:8917/index.html` in a browser (or just open
`index.html` directly from disk — it has no server-side dependencies).

## Verify it (smoke test)

The primary agent-facing way to confirm the game actually works: a Playwright
driver that launches real Chromium, selects each chapter from the archive,
plays it end to end (mouse), and separately drives a chapter-select + one
node entirely by keyboard — all using the game's own reported state
(`window.__ANC_DEBUG_STATE__`) rather than guessed pixel coordinates. In the
open world it also confirms real WASD input actually moves the player (not
just the debug shortcut below), then uses
`window.__ANC_DEBUG__.warpToWaypoint(index)`/`interact()` — a test-only
shortcut documented in `world.js`'s `debugWarpTo()` — to reach every
waypoint without literally walking a compressed ocean for each one.

Debug hooks are only exposed when the page is loaded with `?debug=1` (the
smoke test does this automatically).

```sh
npx playwright install chromium   # first time only — downloads the browser
npm run serve &                                   # start the static server
npm run smoke -- http://127.0.0.1:8917 /tmp/shots  # drive it, save screenshots
```

Exits non-zero on any browser console error or a click that finds no button.
`tools/smoke.mjs` is the harness; read it before writing a new one.

This harness has already caught two real bugs, not hypothetical ones:
adding William's (longer) bio exposed a title-screen layout bug where a long
enough summary pushed the "Begin the Journey" button off the bottom of the
canvas entirely (fixed by capping summary lines and clamping the button
position — see `renderTitle`/`renderEnd` in `src/screens/`), and the data
sync script was pulling William's _disproven_ 1697 marriage date from the
raw person record instead of the journey's corrected 1693 waypoint.

## Development

```sh
npm install
npm run test          # Vitest unit tests (geo.js projection)
npm run test:py       # Python unittest (sync_ancestor.py helpers)
npm run lint          # ESLint (JS) + Ruff (Python)
npm run format        # Prettier (auto-fix)
npm run format:check  # Prettier (check only, used in CI)
```

CI runs on every push/PR to `main` via GitHub Actions (`.github/workflows/ci.yml`):
lint, format check, unit tests, and the full Playwright smoke test.

For local development with debug hooks (warp shortcuts, state inspector):

```
http://127.0.0.1:8917/index.html?debug=1
```

## Data pipeline

Game content is generated from ANC's researched records, never hand-typed:

```sh
python3 tools/sync_ancestor.py --anc /path/to/ANC --id I182197770339 --slug josiah
```

This reads `data/people/{id}.json` and `data/journeys/{id}.json` from an ANC
checkout and emits `src/data/{slug}.js` — a plain JS object the game imports
directly. Re-run it whenever the source ANC records change; the output is
generated and should not be hand-edited (a comment at the top of each file
says so).

The sync script prefers the **journey's** waypoints over the raw
machine-exported vitals wherever they overlap — birth/death year, and now
marriage year/place too — because the journey carries the reviewed,
corrected story (e.g. Josiah's real birth year 1706 vs. the Ancestry
export's disproven 1692; William's real marriage year 1693 vs. the export's
disproven 1697), and the game should tell that corrected story, not the raw
export's.

`FAMILY_OVERRIDES` in `tools/sync_ancestor.py` holds hand-lifted, still-cited
family detail (occupation, children with real fates) too granular to exist
as separate linked ANC person records — add an entry there for a new
ancestor if their `manual.notes` has that kind of material worth surfacing.

## Adding another ancestor

1. In ANC, get the person to `journeyStatus: "reviewed"` with populated
   `narrative` text on each waypoint — thin/unreviewed journeys make for a
   thin game chapter. (`data/generated/game_bundle.json` in ANC has a
   `content_readiness`/`readiness_score` field per ancestor if you want to
   check before investing more research time.)
2. Run `sync_ancestor.py` for their id/slug.
3. Add an entry to `CHAPTER_MANIFEST` in `src/data/index.js` (and export the
   new module there) — that's the entire integration, the archive screen and
   game loop are already generic.

## Project structure

```
index.html              entry point, canvas stack + confidence legend + CSP
src/style.css           page chrome (not game rendering — that's canvas/WebGL)
src/main.js             game state machine, input routing, screen transitions
src/screens/            per-screen 2D canvas renderers (archive, title, detail, …)
src/ui/canvas.js        shared 2D drawing helpers (buttons, text wrap, backdrop)
src/confidence.js       shared Documented/Inferred/Legend palette (2D + 3D)
src/types.js            JSDoc typedefs for chapter/waypoint data shape
src/world.js            the 3D open world: Three.js scene, player controller, waypoint markers
src/geo.js              real lat/lng -> walkable local layout (distance compression, collision nudge)
src/data/index.js       chapter manifest + CHAPTERS array (integration point for new ancestors)
src/data/josiah.js      generated ancestor data (see Data pipeline above)
src/data/william.js     generated ancestor data
tools/sync_ancestor.py  ANC -> game data generator
tools/smoke.mjs         Playwright e2e driver / smoke test
tools/tests/            Python unit tests for the sync script
.github/workflows/ci.yml  lint + unit tests + smoke on every PR
```

## Where this is headed

This slice proves the format works and the data pipeline holds up end to
end across more than one ancestor. Longer-term the plan (from the original
ANC project brief) is a Godot/mobile build; this web version is the
fast-iteration proving ground — port once the format is validated across a
few more ancestors, not before.
