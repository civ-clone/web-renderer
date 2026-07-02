# Known Issues and Rewrite Notes

This document consolidates known problems from source comments, README notes, and observed architecture risks.

## High priority

- **Monolithic frontend orchestrator**
  - `src/js/UI/Renderer.ts` is a very large mixed-responsibility class (state, rendering, input, transport, window logic).
  - Increases regression risk and makes isolated feature rewrites difficult.
- **Late-game performance bottlenecks**
  - README notes slowdown when rebuilding transferred data.
  - `Renderer` has TODOs calling out expensive reconstitution and orphan cleanup concerns.
  - `DataQueue` includes TODO to chunk data transfer but currently sends full queue each flush.
- **Protocol drift risk in transport channels**
  - `quit` and `restart` are now declared in `TransportDataMap`, but neither channel has a receiver on the opposite side (`restart` from backend → no frontend handler; `quit` from frontend → no backend handler).
  - Suggests protocol contract is typed but only partially wired end to end.

## Medium priority

- **Hardcoded UI behavior and theme parameters**
  - Map scale/tile size hardcoded in `Renderer`.
  - Some options are local in-memory defaults only (`GameOptionsRegistry`) and not persisted.
- **Plugin/translation generation portability**
  - Generated import files use absolute filesystem paths, potentially brittle across environments.
- **Asset readiness is strict and static**
  - Required asset list is a large hardcoded path list in `AssetStore`.
  - Any naming/version mismatch blocks gameplay entry.

## Lower priority / UX defects (already noted upstream)

From `README.md` known issues/TODO:

- Some civilization colors are poor.
- Map portal recentring can fail in some situations.
- Trade-rate slider behavior can be inconsistent.
- Minimap highlight render position/wrapping needs work.

## Source-level TODO hotspots

- `src/js/UI/Renderer.ts`
  - Explicit note to break down and potentially use framework approach.
  - Performance TODOs around reconstitution and background processing.
- `src/js/Engine/DataTransferClient.ts`
  - Multiple TODOs around action handling structure, hidden actions, negotiation reuse, and cleanup behavior.
- `src/js/Engine/DataQueue.ts`
  - TODO for chunking patch transfer.
- `src/js/UI/components/Minimap.ts`
  - TODO around rectangle rendering near map edges.

## Rewrite-oriented acceptance targets

Suggested targets for a full rewrite to de-risk migration:

- Establish a versioned worker protocol and runtime validation.
- Replace global mutable object map with reactive normalized store + selectors.
- Split frontend into bounded modules (map rendering, HUD panels, modal windows, input controller).
- Keep asset import feature parity early to avoid blocking user testing.
- Add instrumentation around patch size, reconstitution time, and render frame cost.

## Candidate review/deep-dive topics next

1. Transport protocol audit (typed channels vs actual runtime usage).
2. Patch/reconstitution performance profiling under late-game saves.
3. Input handling redesign (hotkeys, modal routing, action dispatch).
4. Asset manifest and extraction format versioning plan.
