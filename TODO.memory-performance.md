# TODO: Memory and Performance Stabilization

Last updated: 2026-07-01

> See `docs/memory-growth-analysis-2026-07.md` for the July 2026 leak analysis
> and proposed fixes for the remaining long-session memory growth.

## 2026-07 leak fixes (from the analysis above)

- [x] Clear `Actions.#actions` registry on rebuild (dominant unbounded leak —
      pinned a full reconstituted data graph per patch batch).
  - File: `src/js/UI/components/Actions.ts`
- [x] Check channel before reconstituting in `WorkerTransport.receive`/`receiveOnce`.
  - File: `src/js/Engine/WorkerTransport.ts`
- [x] Replace `DataObserver` stacked one-shot listeners with a pending flag.
  - File: `src/js/UI/DataObserver.ts`
- [x] Stop caching canvas sources under random keys in `replaceColours`.
  - File: `src/js/UI/lib/replaceColours.ts`
- [x] Size city mini-map layer canvases to the city radius (local 7×7 remap)
      instead of the full world (~160 MB → ~2 MB per open/update).
  - File: `src/js/UI/components/City.ts`
- [x] Serialize `gameNotification` payloads through the visibility filter.
  - File: `src/js/Engine/DataTransferClient.ts`
- [x] `receiveOnce` returns disposers; dispose superseded `chooseFromList`
      listeners; remove `takeTurn` action listener on error.
  - Files: `src/js/Engine/Transport.ts`, `src/js/Engine/AbstractTransport.ts`,
    `src/js/Engine/ParentTransport.ts`, `src/js/Engine/WorkerTransport.ts`,
    `src/js/Engine/DataTransferClient.ts`
- [x] `PopupMenu` registry is a `WeakMap`; copy-before-sort in `Units`/`Yields`
      render paths.
  - Files: `src/js/UI/components/PopupMenu.ts`,
    `src/js/UI/components/Map/Units.ts`, `src/js/UI/components/Map/Yields.ts`
- [x] Add growth-based prune trigger (1.5× since last prune) alongside the
      5-turn cadence.
  - File: `src/js/UI/Renderer.ts`
- [ ] Emit backend `remove` patches for destroyed entities (object map
      self-maintenance).
- [ ] Coalesce full-graph reconstitution (per frame/turn instead of per patch
      flush).
- [ ] Viewport-sized main-portal layer buffers (rewrite track).

## P0 - High priority

- [x] Replace long-lived hidden-entity caches with weak references.
  - File: `src/js/Engine/DataTransferClient.ts`
  - Change: `Map` -> `WeakMap` for `unknownPlayers`, `unknownUnits`, `unknownCities`.
- [x] Stop leaking notification polling interval after queue drains.
  - File: `src/js/UI/components/Notifications.ts`
  - Change: interval now starts on enqueue and is cleared when idle.
- [x] Add periodic object-map compaction to reduce unreferenced object retention.
  - File: `src/js/UI/Renderer.ts`
  - File: `src/js/UI/lib/pruneObjectMap.ts`
  - Change: prune unreachable entries from `objectMap.objects` every 5 turns (after threshold).

## P1 - Important

- [x] Make `IntervalHandler` disposable and clean up on page unload.
  - File: `src/js/UI/lib/IntervalHandler.ts`
  - File: `src/js/UI/Renderer.ts`
- [x] Reset minimap canvas path each draw to avoid path accumulation.
  - File: `src/js/UI/components/Minimap.ts`
- [x] Ensure popup menu registry releases stale references.
  - File: `src/js/UI/components/PopupMenu.ts`
- [x] Clear/rebuild `World` tile lookup cache on `setTiles()`.
  - File: `src/js/UI/components/World.ts`
- [x] Replace hot-path image lookup DOM query with in-memory preload index.
  - File: `src/js/UI/lib/getPreloadedImage.ts`
  - Callers: `src/js/UI/components/Map.ts`

## P2 - Follow-up investigations

- [x] Audit dynamic transport channels not in `TransportDataMap` (`restart`, `quit`) and align protocol typing.
   - Files: `src/js/Engine/Transport.ts`, `src/js/Engine/DataTransferClient.ts`, `src/js/UI/components/MainMenu.ts`
- [ ] Measure prune cadence impact on frame time in late game and tune thresholds.
   - Files: `src/js/UI/Renderer.ts`, `src/js/UI/lib/pruneObjectMap.ts`
- [ ] Consider moving reconstitution and patch application off main thread.
   - Files: `src/js/UI/Renderer.ts`, `src/js/UI/lib/reconstituteData.ts`
- [x] Add transport `receive` disposer support (or equivalent unsubscribe API) to prevent listener stacking.
   - Files: `src/js/Engine/ParentTransport.ts`, `src/js/Engine/WorkerTransport.ts`, `src/js/Engine/Transport.ts`
   - Change: `receive()` now returns a `TransportDisposer` function that removes the listener.
   - Implementation: Renderer collects disposers and cleans them up on page unload.
   - Files modified: `src/js/Engine/Transport.ts`, `src/js/Engine/AbstractTransport.ts`, `src/js/Engine/ParentTransport.ts`, `src/js/Engine/WorkerTransport.ts`, `src/js/UI/Renderer.ts`, `src/js/Engine/Game.ts`
- [x] Reduce repeated `sort/filter` churn in high-frequency renderer update paths.
   - File: `src/js/UI/Renderer.ts`
- [x] Add optional bounded sample mode to memory testbed.
   - File: `src/js/UI/lib/memoryTestbed.ts`
- [ ] Promote local-player automation (`automatePlayer`) to a general game option (Game Options UI + persisted option flow).
   - Files: `src/js/UI/components/GameOptions.ts`, `src/js/UI/GameOptionsRegistry.ts`, `src/js/UI/Renderer.ts`, `src/js/Engine/Game.ts`

## Memory testbed

- [x] Add optional in-browser memory sampler for long-session profiling.
  - File: `src/js/UI/lib/memoryTestbed.ts`
  - File: `src/js/UI/Renderer.ts`
  - Usage: open with `?debug=1`, then use `window.__civMemoryTestbed` from DevTools.
- [x] Add automated UI stress harness to repeatedly drive actions, windows, and map updates.
  - File: `src/js/UI/lib/UIStressRunner.ts`
  - File: `src/js/UI/Renderer.ts`
  - Usage: open with `?debug=1` (sampler, stress runner and debug panel are all enabled by the single `debug` param).
- [ ] Add scripted scenario seeding / deterministic autoplay for cross-build reproducibility.
  - Candidate: seedable world/game configuration + repeatable action ordering across engine clients.
