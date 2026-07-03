# Ancestor Journey

A family-history journey game — walk your real ancestors' documented lives,
with fact and legend labeled on screen. Data comes from the
[ANC](https://github.com/full-stack-assets/anc) repo's researched person and
journey records, not invented lore.

## Vertical slice: Josiah Albertson (c. 1706–1783)

The current build is a single playable chapter: a colonial New Jersey Quaker
farmer, walked stop-by-stop from birth to death through six documented life
events. Every stop shows a **confidence badge** — Documented / Inferred /
Legend — pulled straight from the source record, so invented texture is
never presented as fact.

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
driver that launches real Chromium, clicks through the full six-waypoint
journey using the game's own reported button positions (not guessed pixel
coordinates), and screenshots every screen.

```sh
npm run serve &                                   # start the static server
npm run smoke -- http://127.0.0.1:8917 /tmp/shots  # drive it, save screenshots
```

Exits non-zero on any browser console error or a click that finds no button.
`tools/smoke.mjs` is the harness; read it before writing a new one — it also
documents the debug hook (`window.__ANC_DEBUG_STATE__`) that `src/main.js`
exposes for exactly this purpose.

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

Note the sync script prefers the **journey's** birth/death waypoints over the
raw machine-exported vitals: the journey carries the reviewed, corrected
story (e.g. Josiah's real birth year, 1706, vs. the Ancestry export's
disproven 1692), and the game should tell that corrected story.

## Adding another ancestor

1. In ANC, get the person to `journeyStatus: "reviewed"` with populated
   `narrative` text on each waypoint — thin/unreviewed journeys make for a
   thin game chapter.
2. Run `sync_ancestor.py` for their id/slug.
3. Point `src/main.js` at the new data module (today it's hardcoded to
   `JOSIAH`; the next real task is parameterizing this into a chapter
   selector rather than a single hardcoded import).

## Project structure

```
index.html          entry point, canvas + confidence legend
src/style.css        page chrome (not game rendering — that's all canvas)
src/main.js           game state machine + canvas rendering + input handling
src/data/josiah.js    generated ancestor data (see Data pipeline above)
tools/sync_ancestor.py  ANC -> game data generator
tools/smoke.mjs         Playwright e2e driver / smoke test
```

## Where this is headed

This slice proves the format works and the data pipeline holds up end to
end. Longer-term the plan (from the original ANC project brief) is a
Godot/mobile build; this web version is the fast-iteration proving ground —
port once the format is validated across a few more ancestors, not before.
