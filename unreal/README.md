# Ancestor Journey — Unreal Engine build

The Unreal Engine 5 build of Ancestor Journey. It renders the **same ancestor
data** as the web build — one shared chapter model, exported to JSON by
`tools/export_chapter_json.mjs` (which reuses the web parser in `src/`).

## ⚠️ Status: authored scaffold, not yet built

**This C++ was written for Unreal Engine 5.5 but has _not_ been compiled or run**
— it was authored in an environment with no Unreal toolchain (a headless CI box
for the static web build). It is an idiomatic, buildable-by-design starting
point, not a verified binary. **To bring it up you need a real machine with the
Unreal Editor** (Windows/macOS/Linux + a GPU + Visual Studio / Rider / clang).
Expect to fix small API details for your exact engine version — treat the first
`Build` as part of setup, not a regression.

(There is no public "UE 5.8"; the latest stable line is 5.5/5.6. `EngineAssociation`
in `AncestorJourney.uproject` is set to `5.5` — change it to whatever you have
installed.)

## What's here

```
unreal/
  AncestorJourney.uproject            project descriptor (module + EnhancedInput plugin)
  Source/
    AncestorJourney.Target.cs         game build target
    AncestorJourneyEditor.Target.cs   editor build target
    AncestorJourney/
      AncestorJourney.Build.cs        module deps (Json, JsonUtilities, EnhancedInput…)
      AncestorTypes.h                 USTRUCTs mirroring the shared chapter JSON + confidence colors
      AncestorGeo.h/.cpp              port of src/geo.js (bearing-preserving distance compression)
      ChapterLoader.h/.cpp            GameInstance subsystem: loads Content/Data/*.json
      WaypointMarker.h/.cpp           a life-event marker (pillar + confidence-colored glow + label)
      AncestorPlayerCharacter.h/.cpp  first-person walker (legacy axis input)
      AncestorJourneyGameMode.h/.cpp  loads a chapter, projects it, spawns the markers
  Config/                             DefaultEngine/Game/Input .ini
  Content/Data/                       exported chapter JSON (index.json + one file per ancestor)
```

## Bring it up (once)

1. Install **Unreal Engine 5.5** (Epic Games Launcher) and a C++ toolchain
   (Visual Studio 2022 on Windows, Xcode on macOS, or clang on Linux).
2. From the repo root, refresh the data (already committed, but this is the loop):
   ```sh
   node tools/export_chapter_json.mjs --builtin --out unreal/Content/Data
   # or from any GEDCOM:
   node tools/export_chapter_json.mjs path/to/tree.ged --all --out unreal/Content/Data
   ```
3. Right-click `AncestorJourney.uproject` → **Generate Visual Studio project
   files** (or `GenerateProjectFiles` on Linux/macOS), then build the
   `AncestorJourneyEditor` target.
4. Open the project. Create an empty **Level** (there's no committed `.umap` —
   `.umap`/`.uasset` are binary and authored in-editor), add a floor + a
   `DirectionalLight` + sky, and **Play**. The game mode loads the first chapter
   from `Content/Data/index.json`, projects the waypoints, and spawns a marker
   at each — walk between them with WASD + mouse.

## Drive it with Claude Code (the `unreal-mcp` plugin)

This project is **pre-wired** for the
[`unreal-engine-skills-for-claude-code`](https://github.com/full-stack-assets/unreal-engine-skills-for-claude-code-plugin)
plugin, which lets a Claude Code session control the running Editor over MCP
(spawn actors, edit Blueprints/Materials/UMG, run automation tests, recompile
C++ via Live Coding, etc.). What's committed here:

- `AncestorJourney.uproject` enables the **`ModelContextProtocol`** (server) and
  **`AllToolsets`** (tools) plugins.
- `.mcp.json` (next to the `.uproject`) points Claude Code at the default MCP
  endpoint `http://127.0.0.1:8000/mcp`.

**This only works on a machine with the Unreal Editor** — the MCP server runs
*inside* a live Editor, so it cannot be driven from a headless/CI box (there is
no Editor and no `unreal-mcp` server there). To use it:

1. **Engine plugins.** `ModelContextProtocol` + `AllToolsets` must exist in your
   engine (they're Epic's UnrealMCP plugins). If your engine doesn't have them,
   the Editor will prompt about missing plugins on load — install/build them
   first, or remove the two entries from the `.uproject` to open without MCP.
2. **Install the Claude Code plugin** (from the plugin repo):
   ```
   /plugin marketplace add /path/to/unreal-engine-skills-for-claude-code-plugin
   /plugin install unreal-engine-skills-for-claude-code@unreal-engine-skills-for-claude-code
   ```
   (or the team-wide `.claude/settings.json` form in that repo's README).
3. **Auto-start the server.** Add to
   `Saved/Config/<Platform>Editor/EditorPerProjectUserSettings.ini` (per-user,
   not committed):
   ```ini
   [/Script/ModelContextProtocolEngine.ModelContextProtocolSettings]
   bAutoStartServer=True
   ```
   Or run `ModelContextProtocol.StartServer` in the Editor console each session.
4. **Confirm the link.** With the Editor running, `/mcp` in Claude Code should
   list `unreal-mcp` connected. If you changed the port, regenerate the client
   config with `ModelContextProtocol.GenerateClientConfig ClaudeCode` (or edit
   `.mcp.json`).

Once connected, Claude can drive this scaffold end-to-end. Useful first prompts,
in roughly the order this project needs them:

- *"Create a Level with a floor plane, a DirectionalLight, a SkyAtmosphere and a
  SkyLight, set it as the startup map, then Play."* — the scaffold spawns the
  chapter's markers on BeginPlay, so this is all that's between you and walking
  the sample ancestor.
- *"After I edit the C++, recompile with Live Coding and report any errors."* —
  the fastest loop for fixing whatever the first build surfaces.
- *"Build a UMG widget that shows a waypoint's narrative + confidence, and show
  it when the player is near a marker."* — implements the "examine" interaction
  from the roadmap below.
- *"Discover and run the project's C++ automation tests and summarize failures."*

Safety: MCP calls mutate a live Editor and run on the game thread — **save and
commit before a long MCP session**, keep calls sequential, and review the diff
after. See the plugin's `skills/unreal-mcp/SKILL.md` for the full contract.

## The data bridge (why both builds stay in sync)

`tools/export_chapter_json.mjs` runs the **same GEDCOM parser and chapter
builder the browser uses** (`src/gedcom.js` + `src/chapter.js`) and writes plain
JSON. `UChapterLoader` reads it via `FJsonObjectConverter`. So there is one
canonical data model — fix the parser once, both engines benefit — and no
divergent re-implementation of genealogy logic in C++.

## Gameplay status & roadmap

Implemented in the scaffold: chapter load → geo projection → marker spawn →
first-person walking, with confidence-colored markers/labels.

Not yet built (natural next steps, in rough order):
1. Proximity **interaction** — walk up to a marker, press a key, show the
   waypoint's narrative + confidence in a UMG widget (the web build's "examine").
2. **Family & legacy** screen and chapter completion flow.
3. Migrate input to **Enhanced Input** (the plugin is already enabled).
4. World dressing (landscape/foliage), sky + lighting, audio — the fidelity the
   web build approximates, which is where UE actually pays off.
5. A **chapter-select** menu driven by `index.json`.

## Honest notes on the platform choice

Moving to Unreal buys high-end rendering, but it changes the product's shape,
and those trade-offs are real:

- **Distribution.** UE ships as a **native download** (install friction, per-OS
  builds) or via **pixel streaming** (rendered on a cloud GPU, streamed to the
  browser). The web build's "click a link, play instantly, on any device"
  funnel does not carry over.
- **Privacy.** The web build parses your family tree **in your browser** and
  never uploads it. A native build can preserve that (parse locally), but
  **pixel streaming cannot** — the data and render live on a server. If the
  privacy promise matters, prefer native distribution over streaming.
- **Cost.** Pixel streaming means paying for a GPU per concurrent player —
  heavy against a one-time price. Native builds avoid that but add store/signing
  overhead.

None of this is a reason not to build the UE version — it's what to decide
before shipping it.

## CI

The repo's GitHub Actions (`.github/workflows/ci.yml`) covers the **web build**
(unit tests + Playwright smokes) and the **data bridge** (the JSON exporter),
because those run on a stock CI runner. A real **UE compile cannot run on the
hosted runners** (no engine, no license) — it needs a **self-hosted runner with
Unreal installed**. When you have one, add a job that runs
`RunUAT BuildCookRun` for the `AncestorJourney` target; until then, the UE build
is verified locally by whoever has the editor.
