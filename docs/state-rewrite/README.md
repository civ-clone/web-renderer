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
| 8 | [`08-phase-3-subscriptions.md`](./08-phase-3-subscriptions.md) | Replace DOM events; dismantle `Renderer.ts`: the re-plan and how it was built (2026-10-21) |
| 9 | [`09-phase-4-backend-deltas.md`](./09-phase-4-backend-deltas.md) | Stop re-serialising the world every turn |
| 10 | [`10-phase-5-map-renderer.md`](./10-phase-5-map-renderer.md) | Viewport buffers instead of 12 world canvases |
| 11 | [`11-phase-6-lifecycle.md`](./11-phase-6-lifecycle.md) | Restart, quit, and the seams for save/load |
| 12 | [`12-file-migration-map.md`](./12-file-migration-map.md) | Every file: keep / change / delete |
| 13 | [`13-data-transfer-client-split.md`](./13-data-transfer-client-split.md) | The split of the worker's `DataTransferClient` into `src/js/Engine/Client/`: the plan and how it was built (2026-10-21) |

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

Reviewed against the code on 2026-10-08 and updated on 2026-10-21. It is the
first thing the next person reads.

The plan was written on 2026-08-31 and never executed as written: there is no
`src/js/UI/State/`, and `reconstituteData` was never deleted. Between
September and October the performance work it was aimed at was done instead
through smaller, targeted changes (tracking issue #320). Most of the
**Expected effect** targets above have been met that way. What the plan would
still add is mainly structure: `Renderer.ts` split up, and the DOM event
plumbing replaced.

| Phase | Status | Landed | Notes |
| ----- | ------ | ------ | ----- |
| 0 | Done in substance, not as written | Sep–Oct 2026 | `npm test` runs about 110 suites (`tests/engine` and `tests/ui` through `tools/run-suite.js`, and a few `tools/*.js`), with a conformance fixture (`tests/engine/fixtures/baseline.json`, `NOTES.md`), `tools/bench.js` and load-time performance marks (#325). Not done: `?record=1`/`Alt+Shift+R` recording, the patch-replay fixtures, `seedRandom`, and `tsconfig.json` covering all of `src/`. That last gap matters: `npm run ts:compile` reaches 78 of the 158 files under `src/js/UI/` (at `dddbc18`: what `tsconfig.json`'s `include` lists, which is most of `lib/` and `app/`, `DebugFlags`, `GameState` and `ActiveUnitController`, and what those import), and esbuild strips types without checking them, so nothing type-checks the rest of the UI code (#339). A one-off check across `src/js` on 2026-10-08 found 35 type errors across 14 files (7 of them i18next `t()` results passed where a `string` is expected). |
| 1 | Superseded | — | No shadow store was built. |
| 2 | Superseded by a different design | 2026-10-08 | `IncrementalReconstituter` (`src/js/UI/lib/IncrementalReconstituter.ts`, #322, #327) rebuilds only the ids a patch changed and refills those objects in place, so work per patch is proportional to the change, the plan's main target. `reconstituteData` stays as the reference it is tested against (`test:incremental-reconstitute`) and for one-off messages. `WorkerTransport` still reconstitutes one-off messages; on load that rebuilds the initial data twice (#333). |
| 3 | Done | 2026-10-21 | `08-phase-3-subscriptions.md` was rewritten on 2026-10-21 (#344) on top of `IncrementalReconstituter` and executed the same day, one reviewed PR per step; #344 is closed. Track A: windows watch the ids they show through `lib/DataChanges.ts`, and `DataObserver` and the `dataupdated`/`patchdatareceived` events are gone (#497, #507, #509, #513, #517, #520). Track B: `Renderer.ts` (2,166 lines) is now `src/js/UI/bootstrap.ts`, 153 lines of page start-up (149 when it was renamed), with one game in `src/js/UI/game/` and the rest under `lib/`, `app/` and `debug/` (#499, #506, #508, #512, #516, #519, #522, #524, #527, #528, #532, #533, #535). The worker side got the same treatment in `13-data-transfer-client-split.md` (#449): `DataTransferClient.ts` (3,080 lines) is a 282-line composition root over 31 modules in `src/js/Engine/Client/` with a shared `ClientContext` and a `dispose()`, and nothing changed on the wire (#498, #505, #511, #514, #518, #521, #523, #525, #530, #531, #534, #536–#539, #541). Each plan now opens with an "As built" section: the PR per step, the modules with their real line counts, the "Done when" items not met, and the corrections the reviews recorded. Not met (sizes at `dddbc18`): `bootstrap.ts` is 153 lines rather than ~110; `DebugPanel` (494; 380 since #503 moved its exports to `debug/debugExport.ts`), `ActiveUnitController` (449) and `GameSession` (520) are over the 350-line cap; `lib/UIStressRunner` and `lib/savedGame` stay outside `tsconfig.json` (#339); `DataTransferClient.ts` is 282 lines rather than ~220; and `Client/PlayerPatches.ts`, 422 lines when the split finished, has been 495 since #488 (`31378e5`), over the 450-line cap plan 13 set for `Client/`. |
| 4 | Partly, by other means | Sep–Oct 2026 | No protocol v2, `del` ops or `resync`; `DataQueue` remains. Payloads were cut instead: one flush per action (#321), unit orders only for the active unit (#323), the production list only on request (#324), only the player's own known tiles (#328), smaller notifications and player data (#137). |
| 5 | Done in substance | 2026-09-22 | `4880639`: the map layers hold the window being looked through, not the world. The minimap draws from a layer of its own (`7e1f687`), and selecting a unit redraws two tiles (`74773f1`). `Map/Overview.ts` (the minimap) still sizes its canvas to the world, at one pixel per tile. There is no `StaticBuffer`/`TilePainter` split. |
| 6 | Done by other means | 2026-10-20 | The game ending shipped as #176 (`a9626ad`, #464): `gameOver`, Retire and `gameContinue` channels, with no `restart`; the `restart` and `quit` channels are gone (#340). Saving and loading shipped through the engine-serialisation work (`docs/engine-serialisation/`), as real saves rather than this plan's replay log. `DataTransferClient.dispose()` landed with the split (#541). On the UI side `MapView`, `GameState`, `InputController`, `DebugPanel` and `ReloadGuard` have a `dispose()` (`GameSession`, `ActiveUnitController` and `Hud` do not); the `pagehide` teardown calls those of `MapView`, `DebugPanel` and `GameState`, but not `ReloadGuard`'s or `InputController`'s, whose listeners last as long as the page. |

### Where to pick up

1. **Phase 3 is complete.** Both splits were executed on 2026-10-21: the
   `Renderer.ts` split (`08-phase-3-subscriptions.md`, #344, closed) and the
   `DataTransferClient` split (`13-data-transfer-client-split.md`, #449,
   closed with its step 16, #541). What is left is the tidy-up pass over the
   review notes collected in #503 (test gaps and stale comments, none blocking)
   and the "Done when" items each plan's "As built" section lists as not met:
   the three UI modules over 350 lines (`DebugPanel`, `ActiveUnitController`,
   `GameSession`), `bootstrap.ts` and `DataTransferClient.ts` above their target
   sizes, and the UI modules still outside `tsconfig.json` (#339).
   `Client/PlayerPatches.ts` has since gone over its 450-line cap too (#488).
2. Done since 2026-10-08: #333 (one rebuild on load), #326 (a move is drawn on
   the keypress), the rest of #320, and #176 (the game can end). #151's
   leftovers (batched turn-start notifications, coalesced AI flushes) stay
   open but are not measured problems.

The other documents in this folder are kept as the original plan. Each has a
short status note at the top; their file and line references date from
2026-08-31.
