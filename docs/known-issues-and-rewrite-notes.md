# Known Issues and Rewrite Notes

This document consolidates known problems from source comments, README notes, and observed architecture risks.

Checked against the code on 2026-10-08. Items that have since been fixed are
marked as such, with the commit or issue that fixed them.

## High priority

- **Monolithic frontend orchestrator**
  - `src/js/UI/Renderer.ts` is a very large mixed-responsibility class (state, rendering, input, transport, window logic).
  - Increases regression risk and makes isolated feature rewrites difficult.
  - Still stands: about 1,900 lines on 2026-10-08. No issue tracks breaking it up.
- **Late-game performance bottlenecks** (mostly addressed; tracked in #320)
  - README notes slowdown when rebuilding transferred data. The README note is still there, but most of the cause has been fixed:
    - The turn-start freeze in large games: notifications and patches no longer resend the whole known world (97140f2, #130), and the frontend rebuilds at most once a frame while the other civilizations move (b00c490, #61).
    - A unit move sends one patch rather than two (1e8fd07, #321).
    - The frontend rebuilds only the objects a patch changed, with `src/js/UI/lib/IncrementalReconstituter.ts`, instead of the whole graph (e70f65a, #322; f5633a0, #327).
    - Patches no longer carry every unit's actions (4ae9bbd, #323) or every city's build list (4732149, #324), and the page is sent only the player's own map (9ae604f, #328).
  - Still open: #326 (show a move straight away, keep keypresses typed during the lag), #333 (the initial game data is rebuilt twice on load) and #151 (turn handover refinements).
  - `Renderer` has TODOs calling out expensive reconstitution and orphan cleanup concerns. One performance TODO is left, in `updateState`: reconstituting in a worker thread. The object map is still pruned by `src/js/UI/lib/pruneObjectMap.ts`, and #68 asks whether the backend should send `remove` patches instead.
  - `DataQueue` includes TODO to chunk data transfer but currently sends full queue each flush. Still true.
- **Protocol drift risk in transport channels**
  - `quit` and `restart` are now declared in `TransportDataMap`, but neither channel has a receiver on the opposite side (`restart` from backend → no frontend handler; `quit` from frontend → no backend handler).
  - Suggests protocol contract is typed but only partially wired end to end.
  - Still true on 2026-10-08. #176 plans to replace `restart` with a `gameOver` message; `quit` has no issue.

## Medium priority

- **Hardcoded UI behavior and theme parameters**
  - Map scale/tile size hardcoded in `Renderer`. Map scale is now an option, 1× to 4× (f781358, #13). Tile size is still 16 in `Renderer`; #56 is to take it from the tileset.
  - Some options are local in-memory defaults only (`GameOptionsRegistry`) and not persisted. Still true: `Renderer.init()` sets them on every page load.
- **Plugin/translation generation portability**
  - Generated import files use absolute filesystem paths, potentially brittle across environments.
  - Still true of `src/js/plugins.ts` and `src/js/translations.ts` (both git-ignored). It breaks the arena in a git worktree with a symlinked `node_modules` (#240).
- **Asset readiness is strict and static**
  - Required asset list is a large hardcoded path list in `AssetStore`.
  - Any naming/version mismatch blocks gameplay entry.
  - Still true: `#requiredAssets` in `src/js/UI/AssetStore.ts`.

## Lower priority / UX defects (already noted upstream)

From `README.md` known issues/TODO:

- Some civilization colors are poor. No issue; #167 (renderer themes, including colour keys) is related.
- Map portal recentring can fail in some situations. #14 (276fdc0) now brings a unit near the edge back to the middle, and #189 fixed a unit losing focus, and the map jumping, after a move. Whether that covers the README's case is not known; the README still lists it.
- Trade-rate slider behavior can be inconsistent. Not checked; no issue.
- Minimap highlight render position/wrapping needs work. Fixed: the viewport box wraps (91fe1f6) and a click lands on the tile clicked (#54). The README's TODO list still has it.

## Source-level TODO hotspots

- `src/js/UI/Renderer.ts`
  - Explicit note to break down and potentially use framework approach.
  - Performance TODOs around reconstitution and background processing. One is left: reconstituting in a worker thread.
- `src/js/Engine/DataTransferClient.ts`
  - Multiple TODOs around action handling structure, hidden actions, negotiation reuse, and cleanup behavior.
- `src/js/Engine/DataQueue.ts`
  - TODO for chunking patch transfer.
- `src/js/UI/components/Minimap.ts`
  - TODO around rectangle rendering near map edges. Fixed and removed in 91fe1f6.

## Rewrite-oriented acceptance targets

Suggested targets for a full rewrite to de-risk migration:

- Establish a versioned worker protocol and runtime validation.
- Replace global mutable object map with reactive normalized store + selectors.
- Split frontend into bounded modules (map rendering, HUD panels, modal windows, input controller).
- Keep asset import feature parity early to avoid blocking user testing.
- Add instrumentation around patch size, reconstitution time, and render frame cost. Partly there: loading a game sets `civ:load-sent`, `civ:game-data-received` and `civ:first-render` performance marks (1dbec5b, #325).

## Candidate review/deep-dive topics next

1. Transport protocol audit (typed channels vs actual runtime usage).
2. Patch/reconstitution performance profiling under late-game saves. Done for #320 on a turn-247 save (headless) and in the browser (#325).
3. Input handling redesign (hotkeys, modal routing, action dispatch).
4. Asset manifest and extraction format versioning plan.
