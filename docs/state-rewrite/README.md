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

If you are picking this up cold, read the **Status** section at the bottom
first. The plan was not followed phase by phase: its performance goals were
mostly met another way (see Status), so start from what is left rather than
from Phase 0.

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

Reviewed against the code on 2026-10-08. It is the first thing the next person
reads.

The plan was written on 2026-08-31 and never executed as written: there is no
`src/js/UI/State/`, and `reconstituteData` was never deleted. Between
September and October the performance work it was aimed at was done instead
through smaller, targeted changes (tracking issue #320). Most of the
**Expected effect** targets above have been met that way. What the plan would
still add is mainly structure: `Renderer.ts` split up, and the DOM event
plumbing replaced.

| Phase | Status | Landed | Notes |
| ----- | ------ | ------ | ----- |
| 0 | Done in substance, not as written | Sep–Oct 2026 | `npm test` runs about 40 suites (`tools/*.js`, `tests/engine`, `tests/ui`), with a conformance fixture (`tests/engine/fixtures/baseline.json`, `NOTES.md`), `tools/bench.js` and load-time performance marks (#325). Not done: `?record=1`/`Alt+Shift+R` recording, the patch-replay fixtures, `seedRandom`, and `tsconfig.json` covering all of `src/`. That last gap matters: `npm run ts:compile` reaches only two files under `src/js/UI/`, and esbuild strips types without checking them, so nothing type-checks the UI code (#339). A one-off check across `src/js` on 2026-10-08 found 35 type errors across 14 files (7 of them i18next `t()` results passed where a `string` is expected). |
| 1 | Superseded | — | No shadow store was built. |
| 2 | Superseded by a different design | 2026-10-08 | `IncrementalReconstituter` (`src/js/UI/lib/IncrementalReconstituter.ts`, #322, #327) rebuilds only the ids a patch changed and refills those objects in place, so work per patch is proportional to the change, the plan's main target. `reconstituteData` stays as the reference it is tested against (`test:incremental-reconstitute`) and for one-off messages. `WorkerTransport` still reconstitutes one-off messages; on load that rebuilds the initial data twice (#333). |
| 3 | Not started | — | `Renderer.ts` is 1,918 lines (1,558 when the plan was written). `DataObserver` and the `dataupdated`/`patchdatareceived` events are still how panels update. This is the main piece of the plan still worth doing, for maintainability rather than speed. The design in `08-phase-3-subscriptions.md` assumes the Phase 1 store, so it needs re-planning on top of `IncrementalReconstituter`. |
| 4 | Partly, by other means | Sep–Oct 2026 | No protocol v2, `del` ops or `resync`; `DataQueue` remains. Payloads were cut instead: one flush per action (#321), unit orders only for the active unit (#323), the production list only on request (#324), only the player's own known tiles (#328), smaller notifications and player data (#137). |
| 5 | Done in substance | 2026-09-22 | `4880639`: the map layers hold the window being looked through, not the world. The minimap draws from a layer of its own (`7e1f687`), and selecting a unit redraws two tiles (`74773f1`). `Map/Overview.ts` (the minimap) still sizes its canvas to the world, at one pixel per tile. There is no `StaticBuffer`/`TilePainter` split. |
| 6 | Not done | — | The end of a game sends `restart`, but nothing receives it (#176, the game ending). The main menu's Quit, an Electron leftover that was never shown in the browser, was removed along with the `quit` channel (#340). Saving and loading shipped through the engine-serialisation work (`docs/engine-serialisation/`), as real saves rather than this plan's replay log. |

### Where to pick up

1. **#333**: rebuild the initial game data once on load, not twice.
2. **#320, #326, #151**: the remaining responsiveness work (showing a move
   straight away, batched turn-start notifications, coalesced AI moves,
   keeping input typed while waiting).
3. **Phase 3, re-planned (#344)**: split `Renderer.ts` and replace the
   event plumbing, keeping `IncrementalReconstituter` as the data layer.
4. **Phase 6's lifecycle half**: wire `restart` (#176).

The other documents in this folder are kept as the original plan. Each has a
short status note at the top; their file and line references date from
2026-08-31.
