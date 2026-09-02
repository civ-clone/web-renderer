# State-Based Renderer Rewrite

Working documents for converting `@civ-clone/web-renderer` from its current
"rebuild the whole object graph on every patch" model to a state-based one:
a normalised entity store, dependency-tracked selectors, and views that update
only when the data they read actually changes.

These documents are written to be **executed**, not interpreted. Each phase
document lists the files to create, the files to change, the code to write, and
the checks that prove the phase is done. Where a decision has already been made,
it is stated as a decision, not as an option.

## Reading order

| # | Document | Read it for |
| - | -------- | ----------- |
| 1 | [`01-diagnosis.md`](./01-diagnosis.md) | What is actually wrong today, with file/line evidence |
| 2 | [`02-architecture.md`](./02-architecture.md) | The target design and why each piece exists |
| 3 | [`03-store-spec.md`](./03-store-spec.md) | Complete API + implementation of the new state layer |
| 4 | [`04-protocol-spec.md`](./04-protocol-spec.md) | Wire protocol v2 (deltas, removes, versioning) |
| 5 | [`05-phase-0-foundations.md`](./05-phase-0-foundations.md) | Tests, fixtures, determinism, instrumentation |
| 6 | [`06-phase-1-store-shadow.md`](./06-phase-1-store-shadow.md) | Build the store, prove it matches, ship nothing |
| 7 | [`07-phase-2-cutover.md`](./07-phase-2-cutover.md) | Delete `reconstituteData`. The big win |
| 8 | [`08-phase-3-subscriptions.md`](./08-phase-3-subscriptions.md) | Replace DOM events; dismantle `Renderer.ts` |
| 9 | [`09-phase-4-backend-deltas.md`](./09-phase-4-backend-deltas.md) | Stop re-serialising the world every turn |
| 10 | [`10-phase-5-map-renderer.md`](./10-phase-5-map-renderer.md) | Viewport buffers instead of 12 world canvases |
| 11 | [`11-phase-6-lifecycle.md`](./11-phase-6-lifecycle.md) | Restart, quit, and the seams for save/load |
| 12 | [`12-file-migration-map.md`](./12-file-migration-map.md) | Every file: keep / change / delete |

If you are picking this up cold, read 01 and 02, then go straight to the lowest
numbered phase document that is not yet marked complete.

## Ground rules

These constrain every phase. Do not renegotiate them mid-phase.

1. **The engine is off limits.** Nothing under `node_modules/@civ-clone/*` may be
   modified. That includes `core-data-object/DataObject.ts` and its
   `toPlainObject`. Everything in `src/` — including `src/js/Engine/`, which is
   renderer-side glue rather than engine code — is fair game.
2. **The game stays playable on `main` at every step.** Each phase lands as one
   or more commits that leave a working game. Where old and new paths must
   coexist, gate the new one behind a flag and delete the old path in the same
   phase that retires it.
3. **In-place, strangler.** No new repository. New code lands beside old code in
   this repo and the old code is deleted when its replacement is proven.
4. **Vanilla reactive core.** No UI framework. No new runtime dependencies for
   the state layer. `@dom111/element` stays as the DOM helper.
5. **Prove before you delete.** Every removal of an old path must be preceded by
   a test that shows the new path produces the same result. Phase 0 exists to
   make that possible.

## Phase summary

| Phase | Outcome | Depends on | Risk |
| ----- | ------- | ---------- | ---- |
| 0 — Foundations | Test runner, captured fixtures, seeded determinism, timing instrumentation | — | Low |
| 1 — Store (shadow) | `EntityStore` + views + selectors built and proven equivalent, wired to nothing | 0 | Low |
| 2 — Cutover | `reconstituteData` deleted; components read live views | 1 | Medium |
| 3 — Subscriptions | DOM `CustomEvent` plumbing gone; `Renderer.ts` split into modules | 2 | Medium |
| 4 — Backend deltas | Protocol v2; worker stops re-serialising all cities and units per turn | 0 (independent of 2/3) | Medium |
| 5 — Map renderer | Viewport-sized buffers; canvas baseline down from ~200 MB | 2 | Medium |
| 6 — Lifecycle | `restart`/`quit` wired; replay-based save seams | 3, 4 | Low |

Phases 2, 4 and 5 can proceed in parallel once 1 is done — they touch disjoint
files. Phase 3 must follow 2.

## Expected effect

The measurements to beat are established in Phase 0. The targets:

| Metric | Today | Target |
| ------ | ----- | ------ |
| Frontend work per patch flush | Full graph deep clone, O(all entities) | O(entities changed) |
| Frontend work per turn | Several full clones (one per flush) | One notify pass |
| Transport bytes per player action | Whole player subtree: all cities + all units | Changed fields only |
| Canvas baseline (80×50 world, scale 2) | ~200 MB (12 world-sized layers) | Under 30 MB |
| `objectMap` maintenance | Full reachability sweep every 5 turns | `del` ops; no sweep |
| `Renderer.ts` | 1,558 lines, one closure | Deleted; replaced by ~8 modules |

## Status

Update this table as phases land. It is the first thing the next person reads.

| Phase | Status | Landed | Notes |
| ----- | ------ | ------ | ----- |
| 0 | Not started | — | |
| 1 | Not started | — | |
| 2 | Not started | — | |
| 3 | Not started | — | |
| 4 | Not started | — | |
| 5 | Not started | — | |
| 6 | Not started | — | |
