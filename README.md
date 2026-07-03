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

Pick a chapter, walk it stop-by-stop, and every stop shows a **confidence
badge** — Documented / Inferred / Legend — pulled straight from the source
record, so invented texture is never presented as fact. Each chapter ends
with a Family & Legacy screen (occupation, marriage, children with real
sourced fates) before returning you to the archive to pick the next one.

No build step, no framework: plain HTML5 canvas and vanilla JS.

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
plays it end to end (mouse), and separately drives a chapter-select +
one node entirely by keyboard — all using the game's own reported state
(`window.__ANC_DEBUG_STATE__`) rather than guessed pixel coordinates.

```sh
npm run serve &                                   # start the static server
npm run smoke -- http://127.0.0.1:8917 /tmp/shots  # drive it, save screenshots
```

Exits non-zero on any browser console error or a click that finds no button.
`tools/smoke.mjs` is the harness; read it before writing a new one.

This harness has already caught two real bugs, not hypothetical ones:
adding William's (longer) bio exposed a title-screen layout bug where a long
enough summary pushed the "Begin the Journey" button off the bottom of the
canvas entirely (fixed by capping summary lines and clamping the button
position — see `renderTitle`/`renderEnd` in `src/main.js`), and the data
sync script was pulling William's *disproven* 1697 marriage date from the
raw person record instead of the journey's corrected 1693 waypoint.

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
3. Import the new data module in `src/main.js` and add it to the `CHAPTERS`
   array — that's the entire integration, the archive screen and game loop
   are already generic.

## Project structure

```
index.html            entry point, canvas + confidence legend
src/style.css          page chrome (not game rendering — that's all canvas)
src/main.js            archive + game state machine + canvas rendering + input handling
src/data/josiah.js      generated ancestor data (see Data pipeline above)
src/data/william.js     generated ancestor data
tools/sync_ancestor.py  ANC -> game data generator
tools/smoke.mjs         Playwright e2e driver / smoke test
```

## Where this is headed

This slice proves the format works and the data pipeline holds up end to
end across more than one ancestor. Longer-term the plan (from the original
ANC project brief) is a Godot/mobile build; this web version is the
fast-iteration proving ground — port once the format is validated across a
few more ancestors, not before.
