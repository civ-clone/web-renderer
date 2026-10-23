# 08 — Phase 3: Subscriptions and the `Renderer` Split (re-planned)

## As built (2026-10-21)

Both tracks landed on 2026-10-21, each step its own PR with a clean-context review before merging, and #344 is
closed. The plan from here down is kept as it was agreed (#468; re-planned on top of `IncrementalReconstituter`, with
line numbers from `main` at `18f28b0`; the 2026-08-31 text is in git history). Where it turned out wrong, the
correction is listed below and marked in the text as *(as built: correction N)*. The reviews' other notes (test
gaps, stale comments) are collected in #503.

### PR per step

- **Track A, subscriptions:** 1 #497, 2 #507, 3 #509 (closed #481), 4 #513 (closed #483), 5 #517, 6 #520.
- **Track B, the split:** 7 #499, 8 #535, 9 #506, 10 #512, 11 #508, 12 #516, 13 #519, 14 #522, 15 and 16 #524,
  17 #528, 18 #527, 19 #532, 20 #533.

`grep -rn "dataupdated\|patchdatareceived\|DataObserver" src tests tools` is empty, `Renderer.ts` (2,166 lines) is
`src/js/UI/bootstrap.ts` (149 lines when it was renamed, still the `Renderer` class `frontend.ts` starts), and one
game lives in `src/js/UI/game/`.

### The modules, as they are

Lines from `wc -l` on `main` at `7d3086e`. "Checked" means in `tsconfig.json`'s `include`.

| Tier | Module | Lines | Planned | Checked | PR |
| --- | --- | ---: | ---: | --- | --- |
| lib | `lib/DataChanges.ts` | 115 | 70 | yes | #507 |
| lib | `lib/applyDataPatches.ts` | 121 | 110 | yes | #497 |
| lib | `lib/parseBooleanParam.ts` | 26 | 25 | yes | #506 |
| lib | `lib/interactionLabels.ts` | 69 | 70 | yes | #512 |
| lib | `lib/playerActionPanels.ts` | 69 | 60 | yes | #508 |
| lib | `lib/autoEndTurn.ts` | 28 | 30 | yes | #508 |
| lib | `lib/PruneSchedule.ts` | 33 | 45 | yes | #508 |
| lib | `lib/UnitQueue.ts` | 92 | 90 | yes | #516 |
| state | `game/GameState.ts` | 232 | 190 | yes | #524 |
| state | `game/ActiveUnitController.ts` | 443 | 280 | yes | #519 |
| view | `game/MapView.ts` | 247 | 190 | no | #522 |
| view | `game/Hud.ts` | 93 | 90 | no | #528 |
| app | `app/NotificationBar.ts` | 36 | 35 | yes | #512 |
| app | `app/ChoiceHandler.ts` | 190 | 170 | yes | #512 |
| app | `app/elements.ts`, `i18n.ts`, `assets.ts`, `options.ts`, `ReloadGuard.ts` | 59 + 15 + 40 + 14 + 43 = 171 | 155 | yes | #506 |
| input | `game/InputController.ts` | 204 | 180 | no | #527 |
| debug | `debug/DebugFlags.ts` | 43 | 40 | yes | #499 |
| debug | `debug/DebugPanel.ts` | 380 | 340 | no | #499, #535, #503 |
| debug | `debug/debugExport.ts` | 132 | — | yes | #503 |
| session | `game/GameSession.ts` | 476 | 240 | no | #532 |
| boot | `bootstrap.ts` | 149 | 110 | no | #533 |

The 24 files come to 3,328 lines, against the plan's estimate of about 2,300. The rows marked #503 give the lines
after the #503 tidy-up moved code out of the modules over the cap: `DebugPanel`'s exports to `debug/debugExport.ts`
(`DebugPanel` was 494 lines at `dddbc18`). Track A added two helpers the table
does not list: `components/lib/watchCity.ts` (78 lines, #513) and `components/lib/watchPlayer.ts` (51, #517), both
checked.

What the shipped APIs look like where they differ from the table: `NotificationBar` is a class,
`new NotificationBar(area)` with `show(html)` and `listen(transport)`; `ChoiceHandler` is an object with
`listen(transport, deps)`; `interactionLabels` exports `interactionContext`, `interactionLabel` and
`negotiationLabel`; `MapView` also has `takeTiles()` and `tilesPending()`; `ActiveUnitController` has
`next(actions, waiting)`, `dataReceived()` and `wait()`, and takes the narrow layer interfaces risk 7 asks for
(`ActiveUnitPortal`, `ActiveUnitUnitsLayer`, `ActiveUnitLayer`).

### "Done when", against what landed

- **Met:** the `grep` is empty; `Renderer.ts` is gone; `tests/ui/activeUnit.ts` drives `ActiveUnitController`
  (#519), and `tests/ui/incrementalReconstitute.ts` and `tests/engine/patchRefs.ts` import `lib/applyDataPatches.ts`
  (#497); `DebugFlags` and `GameState` are checked.
- **Not met, line counts:** `bootstrap.ts` is 149 lines, not about 110 (153 at `dddbc18`). Three of the new modules
  are over the 350-line cap: `DebugPanel` (488 when it moved, 491 after #535, 494 at `dddbc18`, and 380 once #503
  moved its three export functions to `debug/debugExport.ts`), `ActiveUnitController` (443 when it moved, 449 at
  `dddbc18`; `playUnitKey` could go to `lib/playUnitKey.ts`) and `GameSession` (475 when it moved, 520 at `dddbc18`;
  the plan's 240 was wrong, as what was left of the `gameData` handler was about 390 lines on its own). Two older `lib/` files
  the plan did not touch are over it too: `lib/UIStressRunner.ts` (495) and `lib/IncrementalReconstituter.ts` (423).
  `MapView` (248 at `dddbc18`) is under the cap but well over its estimate.
- **Not met, type-checking:** `lib/UIStressRunner.ts` and `lib/savedGame.ts` stay outside `tsconfig.json` (#339).
  `UIStressRunner`'s imports reach the #339 errors in `components/City.ts` and `LocaleProvider.ts`; `savedGame`
  has errors of its own (`CompressionStream`/`DecompressionStream` are missing from this TypeScript's `dom` lib, and
  destructuring a `FileList`, `const [file] = input.files ?? []`, needs `dom.iterable`). The plan did not ask for the
  rest, but for the record `MapView`, `InputController`, `Hud`, `DebugPanel`, `GameSession` and `bootstrap.ts` are
  also outside, because their imports reach those errors (and `Map/Overview.ts`, `Notices.ts`, `GameMenu.ts`, and for
  `bootstrap.ts` also `ImportAssetsWindow.ts`, `MainMenu.ts` and the asset extractor's `canvas` types). `Hud` and
  `GameSession` also have an error of their own: `Hud` passes `PlayerAction<Notice>[]` to `partitionActions` (the
  #339 error that #508 moved there), and `GameSession`'s `pagehide` listener takes a `PageTransitionEvent` where
  `on()` expects a `CustomEvent`. The `feather-icons` svg errors behind `Hud` were only `src/js/UI/modules.d.ts`
  missing from `include` (#533); it has been in `include` since `6dc72db`.

### Corrections to the plan

1. **`DataChanges.notify` swaps the accumulated ids out before the pass**, rather than clearing them after it: a
   watcher can close a window whose `close` rebuilds again (the arrival window's does), and what that rebuild
   collects belongs to the next render. **Each watcher runs inside its own try/catch** and its error is logged, as
   a `document` listener's error was reported without stopping the others, so the render goes on.
2. **`dispatchEvent`, not `emit`.** The Renderer side of the Track A design says `dataupdated` was fired with
   `emit(document, 'dataupdated')`; it was `document.dispatchEvent`.
3. **`applyDataPatches` had a third callback for a while.** Step 1 (#497) shipped it as
   `applyDataPatches(objectMap, patches, { changed, received?, tile? })`: `received(key, value)` dispatched
   `patchdatareceived` once per add or update entry, after the entry's own `changed` and before its side-table, a
   point neither of the other callbacks marks. Step 3 (#509) deleted it with the event, which leaves the planned
   `{ changed, tile? }`.
4. **`refillAll` wording.** It refills in place, so a held object survives it, except that a dropped id, an alias or
   a change of shape (an object that has become an array or a ref) gets a fresh object. The #517 claim that
   `refillAll` left `HappinessReport`'s held player stale was wrong; only a rebuild of everything or a second
   `gameData` replaces the player (#503, from #517 and #520).
5. **Step 11.** `PruneSchedule#pruned` takes `(turn, count)`, not `(count)`. "Waiting empties the list" applies to
   the player's actions only: notices still reach the primary panel while waiting.
6. **Risk 3, `dispose()` and `pagehide`.** The reload guard lives for the page, from before a game exists, so its
   `dispose()` cannot be wired into the game's `pagehide` teardown without changing behaviour; `ReloadGuard` has a
   `dispose()` nothing calls. The same holds for `InputController` (step 18): its `keydown` listener has always
   lasted as long as the page, and its `dispose()` is not called either. The teardown disposes `MapView`,
   `DebugPanel` and `GameState`.
7. **Step 19, `GameSession`.** The planned `GameSession.start(objectMap, deps)` shipped as
   `new GameSession(deps).start(objectMap)`, with a `clearKeys()` the choice windows' receiver (registered before
   any game) calls.
8. **Step 8, the debug notices.** They go through `NotificationBar.show` via a `notificationBar` entry in
   `DebugPanelDeps` (#535). The Alt+Shift+X notice ("No memory sampler active") is routed the same way but cannot
   show in practice: the hotkeys exist only with `?debug=1`, and the memory sampler always runs then.
9. **Steps 15 and 16** landed together (#524). `GameState.replace(map)` keeps a second `gameData`'s map; it does not
   reset the `PruneSchedule` baseline (pre-existing).
10. **A fresh worktree needs generated files before `node esbuild.js dev`:** `npm run build:generate-version-text`
    (for `build.json`) and the two generated lists, `npm run build:generate-plugins-ts` and
    `npm run build:generate-translations-ts`.

---

**Goal.** Panels update when the data they show changes, without the `document` `CustomEvent` plumbing
(`dataupdated`, `patchdatareceived`, `DataObserver`), and `src/js/UI/Renderer.ts` (2,166 lines, one `init()` closure
holding a second 1,500-line closure for the game) becomes a set of modules that tests can import.

**Not a goal.** No entity store, no selectors, no framework (ground rule 4 still holds). `IncrementalReconstituter`
stays the data layer: it refills changed objects in place and knows which ids each rebuild filled. The gain is
boundaries and testability, not speed; the speed work is done (#320).

**Depends on.** Nothing open. `IncrementalReconstituter` (#322, #327) and the one-off `gameData` path (#333) are on
`main`.

**Risk.** Medium. 20 small PRs, 16 of them pure moves. Each leaves the game playable and `npm test` green.

## What `Renderer.ts` is today

`init()` runs 20 sections before a game exists (query flags, i18n, the reload guard, element lookups, the asset
preload, `applyActiveUnit`/`renderActiveUnit`, the tile queues, the `saveGame`/`gameOver`/`notification`/
`chooseFromList` receivers, then `load`). The `receiveOnce('gameData')` handler at L635–2146 holds 26 more: the
first rebuild, the map and its eight layers, the 388-line debug panel, `render()` (which dispatches `dataupdated`),
`playUnitKey`/`drainKeys`, the 168-line `updateState`, the patch applier (which dispatches `patchdatareceived` per
entry), the turn receivers and the 157-line `keydown` handler.

37 mutable closure variables are shared across those sections. The ones read most are `portal`, `activeUnit`,
`waitingForTurn`, `data` and `pendingMove`; each of `activeUnit`, `waitingForTurn` and `data` has one or two writers.
That single-writer property is what makes the split mechanical.

Nothing imports `Renderer.ts` but `frontend.ts`, and no test imports it: `tests/ui/activeUnit.ts` L359–470 and the two
patch-applier copies (`tests/ui/incrementalReconstitute.ts` L117–208, `tests/engine/patchRefs.ts` L92–101)
re-implement its logic. Until the split, a refactor that changes Renderer's behaviour is not caught by them.

The only listener of `dataupdated` and `patchdatareceived` is `src/js/UI/DataObserver.ts`, used by six windows:
`City`, `CityStatus`, `HappinessReport`, `ScienceReport`, `TradeReport`, `UnitSelectionWindow`.

## Track A — change subscriptions without DOM events

### Design

`IncrementalReconstituter#rebuild` already records every id it filled (afresh or in place, including owners refilled
because a ref they were waiting for arrived; every id on a full rebuild). Only the last call's set is kept, and
several rebuilds can happen between two renders (one per patch flush during the player's turn), so changes are
accumulated until the render that `dataupdated` fires from today.

The trigger set for a rebuild is `changedIds ∪ filledIds`. `changedIds` alone reproduces `DataObserver` exactly (it
matched the patch `key` and `value.objects` keys, the same ids `changedIds` collects) plus `remove` entries, which
`DataObserver` never saw. `filledIds` adds the owners refilled for late refs. A full rebuild wakes every watcher.

```ts
// src/js/UI/lib/IncrementalReconstituter.ts: one addition
/** Every id the last `rebuild` filled, afresh or in place. Replaced, not cleared, by the next call. */
filledIds(): ReadonlySet<string>;

// src/js/UI/lib/DataChanges.ts (new, ~70 lines, imports only `../types`)
export type WatchedIds = () => Iterable<string>;
export type ChangeHandler = (data: GameData) => void;

export class DataChanges {
  /** After each rebuild: the ids it changed, or `null` for a rebuild of everything. Accumulates until `notify`. */
  collect(ids: Iterable<string> | null): void;
  /** Once per render, before the HUD is rebuilt. Each watcher whose ids changed since the last call runs once, in
   *  registration order, over a snapshot: a watcher removed by an earlier one in the same pass is skipped; one added
   *  during the pass waits for the next. */
  notify(data: GameData): void;
  /** `ids` is read at notify time, after the refill, so a window follows its city's new units without re-subscribing. */
  watch(ids: WatchedIds, handler: ChangeHandler): () => void;
}

export const instance = new DataChanges();
```

A module singleton, like `GameOptionsRegistry.instance` and `assetStore`, rather than an injected context: the six
watchers are constructed from 21 call sites (`GamePortal`, `GameMenu`, `CityStatus`, `HappinessReport`,
`TradeReport`, `City`, `showCityAction`, `UIStressRunner`, `Renderer`), and threading a context through them is a
separate, larger change. The class stays constructible for tests.

Renderer side, two lines in `updateState` and one in `render()` *(as built: corrections 1 and 2)*:

```ts
data = reconstituter.rebuild(objectMap, changed) as GameData;
dataChanges.collect(changed === null ? null : [...changed, ...reconstituter.filledIds()]);
// …
const render = () => { …; dataChanges.notify(data); /* was emit(document, 'dataupdated') */ … };
```

`components/City.ts` after (replacing L525, L566–617 and L707):

```ts
#unwatch: (() => void) | null = null;
…
if (!readOnly) {
  this.#treasury = getTreasuryForYield(city.player, 'Gold');
  this.#unwatch = dataChanges.watch(
    () => [
      this.#city.id,
      this.#city.build.id,
      this.#city.growth.id,
      ...this.#city.units.map((unit) => unit.id),
      ...(this.#treasury ? [this.#treasury.id] : []),
    ],
    (data) => {
      const updatedCity = data.player.cities.find(({ id }) => id === this.#city.id);

      // Captured or destroyed.
      if (!updatedCity) {
        this.close();

        return;
      }

      this.#city = updatedCity;
      this.#treasury = getTreasuryForYield(data.player, 'Gold');
      this.update(cityDetails(updatedCity, this.#portal, this.#transport, /* same callbacks */ false));
      this.element().focus();
      setTimeout(() => resizeYields(this.element()), 200);
    }
  );
}
…
close(): void {
  this.#unwatch?.();
  super.close();
}
```

`setIds` goes (ids are read live). So does the bug at L592–597 where the re-subscription drops the treasury id, after
which a change to gold alone no longer refreshes the city screen's Buy prices.

### Invariants

- `notify` sits exactly where `dataupdated` fires today: first thing in `render()`, before the HUD and map. Watchers run
  in registration order, as `document` listeners did.
- `turnStarted` renders synchronously (L1798–1804) so the turn's windows open over the new turn. Keep that path
  calling `render()` directly.
- Windows hold objects, not ids. Because the reconstituter refills in place, a held `city` stays current between full
  rebuilds. `refillAll` (when an id is dropped or an alias moves) refills every object in place too, so a held object
  survives it *(as built: correction 4, the exceptions)*; only a full rebuild (a second `gameData`, or a rebuild of
  everything, which resets the reconstituter) replaces objects and leaves the held one stale. Handlers keep
  re-finding by id from `data`, as `City` does above. `HappinessReport` L127–130 re-subscribes from its constructor's
  `player`, which is correct only because of in-place refill; the `watch` version reads `data.player`.
- `collect` must accumulate across rebuilds, because `refilled()`/`filledIds()` are last-call only and the arrival
  window's `close` handler (L1662–1668) re-enters `updateState`.

## Track B — split `Renderer.ts`

Dependency direction is strictly downward through the tiers (lib ← state ← view/input ← session ← boot). No module
imports a module in its own tier or above, except `GameSession`, which composes its tier.

| Tier | Module | Path | From sections | Public exports | ~Lines |
| --- | --- | --- | --- | --- | --- |
| lib | DataChanges | `src/js/UI/lib/DataChanges.ts` | (Track A) | `DataChanges`, `instance` | 70 |
| lib | applyDataPatches | `src/js/UI/lib/applyDataPatches.ts` | `pathToParts`…`removeObjectPath` + the `gameDataPatch` loop (L1808–1937) | `applyDataPatches(objectMap, patches, { changed(id), tile(obj) })`, `setObjectPath`, `removeObjectPath` (as built: correction 3) | 110 |
| lib | parseBooleanParam | `src/js/UI/lib/parseBooleanParam.ts` | L106–126 | `parseBooleanParam` | 25 |
| lib | interactionLabels | `src/js/UI/lib/interactionLabels.ts` | L416–477 | `interactionLabel`, `negotiationLabel` | 70 |
| lib | playerActionPanels | `src/js/UI/lib/playerActionPanels.ts` | the priority table and partition in `render()` (L1295–1342) | `partitionActions(actions, notices, waiting)` | 60 |
| lib | autoEndTurn | `src/js/UI/lib/autoEndTurn.ts` | L1684–1699 | `shouldAutoEndTurn(player, options, waiting)` | 30 |
| lib | PruneSchedule | `src/js/UI/lib/PruneSchedule.ts` | L839–860 counters + L1565–1584 | `PruneSchedule#due(turn, count)`, `#pruned(count)` (as built: `pruned(turn, count)`, correction 5) | 45 |
| lib | UnitQueue | `src/js/UI/lib/UnitQueue.ts` | `activeUnits` + `waitedUnits` (L1600–1630, L2083–2101, L256) | `update(actions, waiting)`, `selectable()`, `wait(current)`, `activated(id)` | 90 |
| state | GameState | `src/js/UI/game/GameState.ts` | first rebuild, the data half of `updateState`, `scheduleStateUpdate`, the persistent `gameData` and `gameDataPatch` receivers; owns `objectMap`, `reconstituter`, `data`, `changedIds`, `stateFrame`, `waitingForTurn` | `data()`, `applyPatches()`, `replace(map)`, `update()`, `setWaiting()`, `onUpdated(cb)`, `dispose()`; frame scheduler injected (rAF in production) | 190 |
| state | ActiveUnitController | `src/js/UI/game/ActiveUnitController.ts` | `applyActiveUnit`, `renderActiveUnit`, `setActiveUnit`, `playUnitKey`, `drainKeys`, `actionHandled`; owns `activeUnit`, `lastUnit`, `activeUnitTiles`, `pendingMove`, `unitActionsRequest`, `UnitQueue` | `active()`, `apply(u)`, `render(u)`, `set(u)`, `next(data, isVisible, halted)`, `pressKey(key)`, `drain()`, `actionHandled(a)`, `clearKeys()` | 280 |
| view | MapView | `src/js/UI/game/MapView.ts` | world, portal, layers, minimap, focus, blink tick, resize, tile queues, `t`/`y`/`c` | `portal`, `world`, `queueTile`, `releaseTiles`, `flush()`, `toggleUnits()`, `toggleYields()`, `centre(tile)`, `dispose()` | 190 |
| view | Hud | `src/js/UI/game/Hud.ts` | rest of `render()`: `Actions` ×2, `UnitActions`, `GameDetails`, `PlayerDetails` | `build(data, activeUnit, waiting)` | 90 |
| app | NotificationBar | `src/js/UI/app/NotificationBar.ts` | `showNotification` + the `notification` receiver | `show(html)`, `listen(transport)` | 35 |
| app | ChoiceHandler | `src/js/UI/app/ChoiceHandler.ts` | the `chooseFromList` receiver (L479–633) | `listen(transport, { clearKeys, debug })` | 170 |
| app | elements, i18n, assets, options, ReloadGuard | `src/js/UI/app/*.ts` | L136–216, L314–331 | `appElements()`, `initI18n()`, `setCursor()`, `preloadAssets(el)`, `setOptionDefaults()`, `ReloadGuard` | 155 |
| input | InputController | `src/js/UI/game/InputController.ts` | leader screens + the main `keydown` (L1985–2141) | `constructor(deps)`, `dispose()` | 180 |
| debug | DebugFlags | `src/js/UI/debug/DebugFlags.ts` | the `?debug` flags and `uiStressRunner` handle | `DebugFlags` | 40 |
| debug | DebugPanel | `src/js/UI/debug/DebugPanel.ts` | the debug panel, hotkeys, memory testbed (L839–1249) | `DebugPanel(flags, deps)`, `dispose()` | 340 |
| session | GameSession | `src/js/UI/game/GameSession.ts` | what is left of the `gameData` handler: welcome, `render`/`scheduleRender`, the `updateState` order, `turnEnded`/`turnStarted`, `gameNotification`, `unitHalted`, `embassyEstablished`, `investigateCity`, `pagehide` | `GameSession.start(objectMap, deps)` (as built: correction 7) | 240 |
| boot | Renderer → `bootstrap.ts` | `src/js/UI/Renderer.ts` | pending save, `saveGame`/`gameOver` receivers, `load`, `receiveOnce('gameData')` → `GameSession.start` | `Renderer` (unchanged for `frontend.ts`) | 110 |

About 2,300 lines across 24 files, against 2,166 in one.

Getters over `data` (`GameMenu`'s `() => data.player`, `UIStressRunner`'s `getData`, the minimap marker's
`activeUnit`, `leaderScreensMap`) capture closure variables by reference today. Moved into classes they must keep
reading the live value through a getter, never a value copied at construction.

## Step order

Each step is one PR, leaves the game playable and `npm test` green, and adds its test suite to `package.json` and a
`tools/<name>.js` runner. **P** = pure move, **B** = behaviour change. Track A (1–6) and Track B (7–20) are
independent; within B, 13 needs 12, 15 needs 1–2, 19 needs 13–18.

| # | Kind | Step | Proved by | PR |
| --- | --- | --- | --- | --- |
| 1 | P | Extract `lib/applyDataPatches.ts` with `changed`/`tile` callbacks (the `patchdatareceived` dispatch stays in Renderer's callback). Point `tests/ui/incrementalReconstitute.ts` and `tests/engine/patchRefs.ts` at it and delete their copies | `test:incremental-reconstitute` and `test:patch-refs` now exercise shipped code | #497 |
| 2 | P | `IncrementalReconstituter#filledIds()` + `lib/DataChanges.ts`; Renderer `collect`s after each rebuild and `notify`s next to the `dataupdated` dispatch. Nothing watches yet | new `tests/ui/dataChanges.ts`: a watcher wakes for a changed id, a child id read live, a late ref's owner, a `remove`, a full rebuild; not for unrelated ids; once per notify however many rebuilds; unwatch during notify. `filledIds` check in `incrementalReconstitute.ts` | #507 |
| 3 | B | Re-base `DataObserver` on `DataChanges.watch(() => this.#ids, handler)`; delete both `dispatchEvent`s and the `GlobalEventHandlersEventMap` augmentation. Components untouched. Removes and late refs now wake windows | `dataChanges.ts`; manual: city screen updates after a buy, a unit built, a capture closes it | #509 |
| 4 | B | `City.ts` to `watch` (fixes the dropped treasury id) | `dataChanges.ts` with a `City`-shaped watcher; manual city screen | #513 |
| 5 | P | `CityStatus`, `HappinessReport`, `TradeReport`, `ScienceReport` to `watch` | manual F1/F4/F5/F6 | #517 |
| 6 | P | `UnitSelectionWindow` to `watch`; delete `DataObserver.ts`; update `docs/runtime-data-flow.md`, `architecture-overview.md`, `frontend-ui.md`, `module-inventory.md` | `grep -rn "dataupdated\|patchdatareceived\|DataObserver" src` is empty | #520 |
| 7 | P | `debug/DebugFlags.ts` + `debug/DebugPanel.ts` (400 lines out) | `npm test`; manual `?debug=1` panel and Alt+Shift hotkeys | #499 |
| 8 | B | Debug notices through `NotificationBar.show` instead of `transport.send('notification')`, which goes to the worker and is never received (dead today) | manual `?debug=1` Alt+Shift+X shows the notice | #535 |
| 9 | P | `app/` preamble: `elements`, `i18n`, `assets`, `options`, `ReloadGuard`, `lib/parseBooleanParam` | `tests/ui/parseBooleanParam.ts`; manual reload confirm before and after a game starts | #506 |
| 10 | P | `lib/interactionLabels.ts`, `app/NotificationBar.ts`, `app/ChoiceHandler.ts` | new `tests/ui/interactionLabels.ts` (i18next with the real translations, as `translations.ts` does); `difficulty.ts`, `selectionWindow.ts` | #512 |
| 11 | P | `playerActionPanels`, `autoEndTurn`, `PruneSchedule` | a unit test each (priority order, waiting empties the list *(as built: of the player's actions only, correction 5)*, exception list; 5th turn / 1.5× growth / 5000 floor) | #508 |
| 12 | P | `lib/UnitQueue.ts` | new tests: wait rotates, all-waited wraps to the oldest, a waited id is dropped when no longer active (untested today) | #516 |
| 13 | P | `game/ActiveUnitController.ts` | `tests/ui/activeUnit.ts` replaces its mirror (L359–470) with the controller; every existing expectation unchanged | #519 |
| 14 | P | `game/MapView.ts` | `minimap.ts`, `layerFailures.ts`; new check that a queued tile is built only after `releaseTiles` | #522 |
| 15 | P | `game/GameState.ts` with an injected frame scheduler | new `tests/ui/gameState.ts`: patches while waiting coalesce to one rebuild per frame; during the turn each flush rebuilds at once; `turnStarted` cancels the deferred rebuild; changes reach `DataChanges` | #524 |
| 16 | B | Fix the persistent `gameData` receiver keeping the old `objectMap` (see Risks) | `gameState.ts`: a patch after a second `gameData` applies to the new map | #524 |
| 17 | P | `game/Hud.ts` | `npm test`; manual end-turn button, notices | #528 |
| 18 | P | `game/InputController.ts` | new `tests/ui/inputController.ts` (linkedom): Enter ends the turn only with a mandatory EndTurn and not while waiting; a key is forwarded to a modal; unit keys go through `pressKey`; Shift+5,6 enables cheats | #527 |
| 19 | P | `game/GameSession.ts` takes the rest of the `gameData` handler; `Renderer.ts` ≈ 110 lines | `npm test`; manual new game, load, end turn, wait for the AI, unit moves with held keys | #532 |
| 20 | P | Rename `Renderer.ts` → `bootstrap.ts`, update `frontend.ts`; add the clean modules to `tsconfig.json` `include` (#339) | `npm run ts:compile` | #533 |

## Risks and invariants

1. **`updateState` stays synchronous during the player's turn.** Deferring it left `activeUnit` stale for a frame and
   broke multi-move units (L1544–1550, tried 2026-07-02). `GameState.update()` and `ActiveUnitController.next()` run
   in the same call stack as the patch, in today's order: rebuild → prune → `world.setTiles` → `releaseIncomingTiles`
   → unit queue → halted/arrival → `applyActiveUnit` → `scheduleRender` → `drainKeys` → auto end turn. `drainKeys`
   needs the new active unit; auto end turn is last.
2. **`refilled()` is last-call only.** `world.setTiles(..., reconstituter.refilled(worldId))` must read it before any
   other rebuild.
3. **`keydown` listener order on `document`.** The reload guard (L157, bubble, page scope) is registered before the
   game handler (L1997, bubble); the debug listener is capture. F5 reloads only while `!gameStarted`, otherwise it is
   the Trade Report. `InputController` attaches after `ReloadGuard`, and the guard reads `gameStarted` live. Neither
   bubble listener is removed today; each new module gets a `dispose()` the `pagehide` teardown calls *(as built:
   correction 6)*.
4. **Load handshake.** Every receiver is registered before `transport.send('load')` (L2152–2158). The game-scope
   receivers are registered synchronously inside the `gameData` handler; `GameSession.start` must not `await` before
   registering, or a `gameDataPatch`/`turnStarted` queued behind `gameData` is lost.
5. **Latent bug, persistent `gameData` (L1740–1746).** It rebuilds from `rawData`, but every later
   `updateState(objectMap)` and the patch handler use the closure's original `objectMap`, and the reconstituter
   resets when handed a different map. A second `gameData` would be undone by the next patch. Dormant today because
   `DataTransferClient.sendInitialData` sends it once per client. Step 16 fixes it.
6. **Hidden coupling through `document`.** `drainKeys` and the key handler query `dialog.window.modal` and
   `document.activeElement`; Tab focuses `actionArea`'s first button; `gameArea.append(primaryActions.element())`
   moves the element on every render; `Notices` clears on the `document` `endturn` event (from `lib/endTurn.ts`,
   the same pattern as `dataupdated`, out of scope here but a candidate for the same treatment);
   `closeOpenDialogs`/`exportDebugJson` sweep all `dialog.window`. Keep these in `InputController`/`DebugPanel` and
   name them in each module's comment rather than hide them.
7. **Type-checking spillover (#339).** Including a module in `tsconfig.json` checks its whole import graph. Keep the
   lib tier free of component imports; `ActiveUnitController` qualifies only if it takes narrow layer interfaces
   (`setActiveUnit`, `update`, `render`, `setVisible`, `isVisible`, `setCenter`) instead of importing `Units`,
   `ActiveUnit` and `GamePortal`. That is also what lets `tests/ui/activeUnit.ts` drive it with its `TestUnits`.

## Done when

- `grep -rn "dataupdated\|patchdatareceived\|DataObserver" src tests tools` finds nothing.
- `src/js/UI/Renderer.ts` is gone, `bootstrap.ts` is about 110 lines, and no module under `src/js/UI/game/`,
  `app/`, `debug/` or `lib/` is over 350 lines.
- `tests/ui/activeUnit.ts`, `incrementalReconstitute.ts` and `tests/engine/patchRefs.ts` import the shipped code
  instead of mirroring it.
- The lib tier, `DebugFlags` and `GameState` are in `tsconfig.json`'s `include`.
