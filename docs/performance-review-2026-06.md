# Performance Review (2026-06-10)

This review focuses on memory growth, CPU hotspots, and long-session behavior in the current implementation.

## Status (2026-10-08)

The findings below are kept as they were written. Checked against the code on
2026-10-08:

- **Addressed since:** finding 4, the full-world layer canvases. The static
  layers were merged into one (b13eab8), and every layer is now the size of
  the portal with dirty-rect compositing (4880639, #7): 137.4 MB of layer
  canvas down to 40.0 MB on an 80×60 world at scale 2. Findings 1–3, 5, 7 and
  8 were already marked resolved in this review.
- **Main-thread pressure** (roadmap item 3) is lower, though nothing has moved
  off the main thread. A unit move sends one patch rather than two
  (1e8fd07, #321), and the frontend rebuilds only the objects a patch changed
  (e70f65a, #322; f5633a0, #327). Tracked in #320.
- **Instrumentation:** loading a game now sets the `civ:load-sent`,
  `civ:game-data-received` and `civ:first-render` performance marks (1dbec5b,
  #325). There is still no timing around the rebuild, `pruneObjectMap(...)`
  or `portal.render()`.
- **Still stands:** finding 6, the prune's main-thread sweep. The thresholds are
  unchanged (over 5,000 objects, every 5 turns or on 1.5× growth); #68 asks
  whether `remove` patches should replace it, and suggests measuring first.
  Finding 8's channels are still unwired: #176 plans to replace `restart`, and
  `quit` has no issue.

## Review scope

- Static code audit of engine/frontend transport, render loop, patch handling, and stress tooling.
- No production profiler traces attached to this report.

## Findings (ordered by severity)

### Critical / High

1. **Resolved: `World` tile lookup now rebuilds safely on `setTiles()`**
   - File: `src/js/UI/components/World.ts`
   - Change:
     - Replaced index cache with coordinate -> tile map.
     - Rebuilds lookup map whenever tiles are replaced.
   - Result:
     - Removes stale-index correctness risk and avoids per-access linear scans.

2. **Resolved: sprite lookup now uses in-memory preload index**
   - File: `src/js/UI/lib/getPreloadedImage.ts`
   - Call path: `src/js/UI/components/Map.ts` -> `drawImage(...)`
   - Change:
     - Introduced cached image map populated from preload container.
     - Fallback query now occurs only when cache miss is encountered.
   - Result:
     - Removes repeated hot-path DOM queries during rendering.

3. **Resolved: transport listeners can now be unsubscribed**
   - Files:
     - `src/js/Engine/ParentTransport.ts`
     - `src/js/Engine/WorkerTransport.ts`
   - Change:
     - `receive(...)` now returns a `TransportDisposer` and `Renderer` collects and invokes disposers on page unload.
   - Result:
     - Listener stacking is avoidable. `receiveOnce(...)` also returns a disposer as of 2026-07-01, so one-shot listeners can be cleaned up when the expected message never arrives.

4. **Large per-layer world canvases drive very high baseline memory**
   - File: `src/js/UI/components/Map.ts:149-152`
   - Composition path: `src/js/UI/Renderer.ts` + many `Map/*` layers.
   - Problem:
     - Every layer is full world-size canvas (`width * height * tileSize * scale`).
   - Impact:
     - High baseline memory; mid/late game often trends toward GiB-scale usage.
   - Recommendation:
     - Consider viewport-sized layer buffers, chunked tile caches, or dirty-rect render strategy.

### Medium

5. **Resolved: action list sorting/filtering no longer mutates source arrays in update loop**
   - File: `src/js/UI/Renderer.ts`
   - Change:
     - Uses copied arrays and shared exclusion set.
     - Removes in-place sort of `data.player.actions`.
   - Result:
     - Lower update churn and less risk of side effects from mutation.

6. **Object-map pruning can introduce frame spikes when triggered**
   - Files: `src/js/UI/Renderer.ts` (`handler(...)` prune trigger), `src/js/UI/lib/pruneObjectMap.ts`
   - Problem:
     - Full reachability walk + object-key sweep runs on main thread.
   - Impact:
     - Better memory behavior, but possible intermittent long frame time at prune turns.
   - Recommendation:
     - Measure prune duration, and if needed split work across slices (`requestIdleCallback` / chunking).

7. **Resolved: memory testbed now supports bounded sample retention**
   - File: `src/js/UI/lib/memoryTestbed.ts`
   - Change:
     - Added `maxSamples` option with oldest-sample eviction.
     - Wired via query param support in renderer (`memoryMaxSamples`).
   - Result:
     - Profiling overhead can now be bounded in long runs.

8. **Resolved: `restart` and `quit` now part of typed transport contract**
   - File: `src/js/Engine/Transport.ts`
   - Change:
     - Added `restart` and `quit` to `TransportDataMap`.
   - Result:
     - Restores compile-time contract alignment for those runtime channels.

## Suggested optimization roadmap

1. **Long-session memory**
   - Benchmark layer memory footprint and evaluate viewport-buffer strategy.
   - Measure prune cadence/frame-time tradeoff and tune thresholds.
2. **Lifecycle hardening**
   - Add removable transport subscriptions and central dispose paths.
3. **Main-thread pressure**
   - Evaluate worker/off-main-thread options for reconstitution + patch application.

## Instrumentation suggestions

- Add timing for:
  - `reconstituteData(...)`
  - `pruneObjectMap(...)`
  - `portal.render()`
- Track counters:
  - patch count and payload size per turn
  - `objectMap.objects` cardinality over time
  - active transport listener count

These metrics will make optimization work measurable and reduce guesswork during rewrite planning.

## Status update

Implemented after this review:

- `World` lookup now uses a rebuilt coordinate map on `setTiles()`.
- Preloaded image lookup now uses an in-memory map (no repeated DOM query in hot path).
- `Renderer` update flow now avoids in-place action sorting and reduces repeated filter churn.
- Memory testbed supports bounded sample retention (capped at 5,000 samples in debug mode).
- Runtime `restart`/`quit` channels are now part of typed `TransportDataMap` (though neither has a receiver on the opposite side yet).
- `receive(...)` returns disposers on both transports; `Renderer` disposes its transport listeners on unload.

A follow-up leak analysis with concrete remediation proposals is in
[`memory-growth-analysis-2026-07.md`](./memory-growth-analysis-2026-07.md).


