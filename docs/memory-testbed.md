# Memory Testbed

This project now has an opt-in in-browser sampler to capture memory growth over time during real gameplay.

## Enable profiling

The sampler is part of debug mode. Open the game with the `debug` query param set:

`http://localhost:8080/?debug=1`

(Port/path depends on how you serve the app.)

Note: there is no standalone `profileMemory` query param — `Renderer.init()` only reads `debug`, which enables the sampler together with the stress runner and debug control panel (see [`ui-stress-harness.md`](./ui-stress-harness.md)).

## What is recorded

The sampler stores periodic samples (every 2s):

- `timestamp`
- `turn`
- `objectCount` (size of frontend object store)
- `usedJSHeapSize` (if supported by browser)

Implementation:

- `src/js/UI/lib/memoryTestbed.ts`
- wired in `src/js/UI/Renderer.ts`

## Collecting data in DevTools

After playing (for example ~100 turns), run in console:

```js
window.__civMemoryTestbed?.samples
```

Export CSV:

```js
const csv = window.__civMemoryTestbed?.exportCsv();
console.log(csv);
```

Stop sampling manually:

```js
window.__civMemoryTestbed?.stop();
```

## Recommended stress run

For a repeatable long-session browser run, `?debug=1` already combines memory sampling with the UI stress harness.

This keeps the UI active while continuously exercising screen creation, action dispatch, patch handling, and map rendering.

## Sample bounds

In debug mode the sampler is created with a fixed cap of 5,000 samples (hardcoded in `Renderer.init()`; there is no `memoryMaxSamples` query param). When the limit is reached, the oldest samples are dropped. The underlying `createMemoryTestbed(...)` API does accept a configurable `maxSamples` option if different bounds are needed programmatically.

## Notes

- `performance.memory` is Chromium-specific; on unsupported browsers `usedJSHeapSize` will be empty.
- `objectCount` is still useful cross-browser and should correlate with object-retention regressions.
- For repeatable comparisons, run similar map settings/player count and automation patterns between builds.

## Next step for full reproducibility

Add deterministic autoplay (or scripted action playback) so each benchmark run follows the same sequence and can be compared across commits.
