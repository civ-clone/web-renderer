# 12 — File Migration Map

Every TypeScript file in `src/js/`, with what happens to it and when. Use this
to check nothing was forgotten, and to answer "does my change to X belong in
this phase?" without re-deriving it.

Legend:

- **Keep** — untouched, or trivially touched (an import path).
- **Change** — meaningful edits in the named phase.
- **Move** — relocated, contents largely intact.
- **Delete** — removed in the named phase.
- **New** — created in the named phase.

## Entry points

| File | Lines | Action | Phase | Notes |
| ---- | ----: | ------ | ----- | ----- |
| `backend.ts` | 4 | Change | 0 | Import `seededRandom` first |
| `frontend.ts` | 8 | Change | 0, 2, 3 | Recorder wrapper (0); state creation (2); import `bootstrap` (3) |
| `plugins.ts` | 120 | Keep | — | Generated |
| `translations.ts` | 17 | Keep | — | Generated |

## `src/js/Engine/` — worker side and transport

| File | Lines | Action | Phase | Notes |
| ---- | ----: | ------ | ----- | ----- |
| `Transport.ts` | 168 | Change | 4 | `gameData`/`gameDataPatch` carry `Delta`; add `resync` |
| `AbstractTransport.ts` | 44 | Keep | — | Sound seam |
| `ParentTransport.ts` | 75 | Keep | — | |
| `WorkerTransport.ts` | 96 | Change | 2 | Stop reconstituting on receive |
| `IpcTransport.ts` | 29 | **Delete** | 0 | The entire file is commented out |
| `DataTransferClient.ts` | 1406 | Change | 4, 6 | `DeltaBuilder` + `del` (4); `dispose()` (6) |
| `DataQueue.ts` | 79 | **Delete** | 4 | Replaced by `DeltaBuilder` |
| `Game.ts` | 170 | Change | 0, 6 | `seed` option (0); `restart`/`quit` (6) |
| `TransferObject.ts` | 34 | Keep | — | Still the root entity |
| `Notification.ts` | 25 | Keep | — | |
| `Request.ts` | 31 | Keep | — | Used by `NewGameWindow`, `EarthWindow` |
| `Requests/Options.ts` | 12 | Keep | — | |
| `Retryable.ts` | 46 | Keep | — | Used by the reveal-map cheat |
| `Error/Timeout.ts` | 3 | Keep | — | |
| `Error/RetryFailed.ts` | 11 | Keep | — | |
| `UnknownObjects/City.ts` | 65 | Keep | — | Fog-of-war boundary |
| `UnknownObjects/Player.ts` | 29 | Keep | — | |
| `UnknownObjects/Unit.ts` | 38 | Keep | — | |
| `Protocol.ts` | — | **New** | 4 | |
| `ShadowState.ts` | — | **New** | 4 | |
| `DeltaBuilder.ts` | — | **New** | 4 | |
| `RecordingTransport.ts` | — | **New** | 0 | Fixture capture |
| `ReplayLog.ts` | — | **New** | 6 | |

## `src/js/UI/` — top level

| File | Lines | Action | Phase | Notes |
| ---- | ----: | ------ | ----- | ----- |
| `Renderer.ts` | 1558 | **Delete** | 3 | Split into `bootstrap` + controllers |
| `DataObserver.ts` | 64 | **Delete** | 3 | Replaced by `watch` |
| `Transport.ts` | 36 | Change | 4 | Type mapping follows the protocol |
| `types.d.ts` | 336 | Change | 2, 4 | Entity shapes stay; `DataPatch*` goes in 4 |
| `Store.ts` | 55 | Keep | — | **IndexedDB wrapper. Not the entity store.** |
| `AssetStore.ts` | 358 | Keep | — | |
| `GameOptionsRegistry.ts` | 31 | Keep | — | |
| `GameOption.ts` | 19 | Keep | — | |
| `LocaleProvider.ts` | 100 | Keep | — | |
| `modules.d.ts` | 11 | Keep | — | |

## `src/js/UI/State/` — all new

| File | Phase | Notes |
| ---- | ----- | ----- |
| `types.ts` | 1 | |
| `EntityStore.ts` | 1 | |
| `tracking.ts` | 1 | |
| `views.ts` | 1 | Replaces `reconstituteData.ts` |
| `selectors.ts` | 1 | |
| `subscriptions.ts` | 1 | |
| `Component.ts` | 1 | |
| `createState.ts` | 1 | |
| `index.ts` | 1 | The only import surface |
| `applyDelta.ts` | 4 | |
| `legacy/applyV1.ts` | 1, deleted 4 | v1 adapter |
| `legacy/types.ts` | 2, deleted 4 | `ObjectMap` etc. |
| `selectors/player.ts` | 1 | |
| `selectors/city.ts` | 1 | |
| `selectors/unit.ts` | 1 | |
| `selectors/world.ts` | 1 | `TileSnapshot` |

## `src/js/UI/app/`, `controllers/`, `debug/` — all new in Phase 3

Contents are moved out of `Renderer.ts`; see
[`08-phase-3-subscriptions.md`](./08-phase-3-subscriptions.md) for the order.

| File | From |
| ---- | ---- |
| `bootstrap.ts` | `Renderer.init()` preamble |
| `app/AppContext.ts` | new |
| `app/elements.ts` | the DOM lookups |
| `app/i18n.ts` | i18next setup |
| `app/assets.ts` | cursor + preload |
| `app/options.ts` | `options.set(...)` defaults |
| `controllers/GameController.ts` | the `gameData` handler |
| `controllers/MapController.ts` | portal, layers, minimap, blink tick |
| `controllers/ActiveUnitController.ts` | `applyActiveUnit` / `renderActiveUnit` / `setActiveUnit` |
| `controllers/InputController.ts` | the `keydown` handler and key maps |
| `controllers/ChoiceController.ts` | `chooseFromList` + interaction labels |
| `controllers/NotificationController.ts` | `notification` + `gameNotification` |
| `controllers/HudController.ts` | details panels + `Actions` |
| `debug/DebugPanel.ts` | the debug controls |
| `debug/debugExport.ts` | JSON/CSV export |

## `src/js/UI/lib/`

| File | Lines | Action | Phase | Notes |
| ---- | ----: | ------ | ----- | ----- |
| `reconstituteData.ts` | 75 | **Delete** | 2 | The root cause |
| `pruneObjectMap.ts` | 66 | **Delete** | 2 | Unnecessary once `objectMap` is gone |
| `augmentData.ts` | 27 | **Delete** | 0 | Dead — nothing imports it |
| `getPreloadedImage.ts` | 51 | Change | 5 | Return cached, do not clone |
| `replaceColours.ts` | 137 | Change | 5 | Return cached canvas directly |
| `renderUnit.ts` | 53 | Change | 5 | Composite onto a scratch canvas |
| `IntervalHandler.ts` | 60 | Keep | — | Used by the blink tick |
| `instanceOf.ts` | 42 | Keep | — | Works on views unchanged |
| `mappedKey.ts` | 27 | Keep | — | |
| `html.ts` | 47 | Keep | — | |
| `yieldMap.ts` | 81 | Keep | — | |
| `scaleImage.ts` | 25 | Keep | — | |
| `memoryTestbed.ts` | 80 | Keep | — | Phase 0 measurement |
| `UIStressRunner.ts` | 455 | Change | 2, 3 | Reads views; takes `AppContext` |
| `metrics.ts` | — | **New** | 0 | |
| `../../lib/seededRandom.ts` | — | **New** | 0 | Shared by both bundles |

## `src/js/UI/components/` — map layers

All become `TilePainter`s in Phase 5. **Drawing logic is preserved verbatim**;
only the signature changes (explicit context and offsets).

| File | Lines | Action | Phase | Notes |
| ---- | ----: | ------ | ----- | ----- |
| `Map.ts` | 163 | Change | 5 | Split into `TilePainter`; world-sized canvas goes |
| `Portal.ts` | 278 | Change | 5 | Composites a buffer; public surface unchanged |
| `GamePortal.ts` | 116 | Keep | — | Pointer handling untouched |
| `World.ts` | 128 | Change | 2 | `TileSnapshot[]`, integer indexing |
| `Minimap.ts` | 71 | Change | 5 | Follows the new buffer |
| `Map/Land.ts` | 118 | Change | 5 | Signature only. **Do not touch the coast bitmask** |
| `Map/Terrain.ts` | 36 | Change | 5 | Signature only |
| `Map/TerrainAbstract.ts` | 27 | Change | 5 | Neighbour expansion moves to invalidation |
| `Map/Irrigation.ts` | 25 | Change | 5 | Signature only |
| `Map/Improvements.ts` | 106 | Change | 5 | Signature only |
| `Map/Feature.ts` | 27 | Change | 5 | Signature only |
| `Map/GoodyHuts.ts` | 20 | Change | 5 | Signature only |
| `Map/Fog.ts` | 20 | Change | 5 | Static buffer |
| `Map/Yields.ts` | 141 | Change | 5 | Dynamic painter |
| `Map/Units.ts` | 46 | Change | 5 | Dynamic painter |
| `Map/Cities.ts` | 49 | Change | 5 | Dynamic painter |
| `Map/CityNames.ts` | 62 | Change | 5 | Dynamic painter; keep the bottom-edge fix |
| `Map/ActiveUnit.ts` | 33 | Change | 5 | Dynamic painter; owns the blink |
| `Map/Unworkable.ts` | 28 | Change | 5 | City window only |
| `Map/StaticBuffer.ts` | — | **New** | 5 | |
| `Map/TilePainter.ts` | — | **New** | 5 | |

## `src/js/UI/components/` — windows and panels

| File | Lines | Action | Phase | Notes |
| ---- | ----: | ------ | ----- | ----- |
| `City.ts` | 537 | Change | 3, 5 | `watch` + id-based (3); buffer map (5). Split into sub-components while there |
| `CityStatus.ts` | 176 | Change | 3 | `watch` |
| `HappinessReport.ts` | 162 | Change | 3 | `watch` |
| `ScienceReport.ts` | 83 | Change | 3 | `watch` |
| `TradeReport.ts` | 196 | Change | 3 | `watch` |
| `UnitSelectionWindow.ts` | 75 | Change | 3 | `watch` |
| `Actions.ts` | 228 | Change | 3 | Own `watch`; selector-driven classification |
| `Actions/Action.ts` | 85 | Keep | — | |
| `Actions/AdjustTradeRates.ts` | 71 | Keep | — | |
| `Actions/ChooseResearch.ts` | 60 | Keep | — | |
| `Actions/CityBuild.ts` | 60 | Keep | — | |
| `Actions/CivilDisorder.ts` | 59 | Keep | — | |
| `Actions/EndTurn.ts` | 26 | Keep | — | |
| `Actions/Revolution.ts` | 56 | Keep | — | |
| `Actions/Spaceship.ts` | 209 | Keep | — | |
| `GameDetails.ts` | 39 | Change | 3 | Own `watch` |
| `PlayerDetails.ts` | 82 | Change | 3 | Own `watch` |
| `UnitDetails.ts` | 91 | Change | 3 | Own `watch` |
| `GameMenu.ts` | 104 | Change | 3 | Takes `AppContext` |
| `MainMenu.ts` | 144 | Change | 6 | `quit` acknowledgement |
| `Window.ts` | 317 | Keep | — | |
| `TransientElement.ts` | 43 | Keep | — | |
| `SelectionWindow.ts` | 191 | Keep | — | |
| `ActionWindow.ts` | 69 | Keep | — | |
| `ConfirmationWindow.ts` | 76 | Keep | — | |
| `NotificationWindow.ts` | 85 | Keep | — | |
| `Notifications.ts` | 84 | Keep | — | |
| `PopupMenu.ts` | 127 | Keep | — | |
| `UnitActionMenu.ts` | 135 | Keep | — | |
| `CityBuildSelectionWindow.ts` | 72 | Keep | — | |
| `NewGameWindow.ts` | 43 | Keep | — | |
| `EarthWindow.ts` | 23 | Keep | — | |
| `CustomiseWorldWindow.ts` | 123 | Change | 0 | Add the seed field |
| `ImportAssetsWindow.ts` | 210 | Keep | — | |
| `ReleaseWindow.ts` | 143 | Keep | — | |
| `GameOptions.ts` | 34 | Keep | — | Reached via `GameMenu` |
| `MandatorySelection.ts` | 40 | Keep | — | |
| `LockedSlider.ts` | 101 | Keep | — | |
| `LockedSliderGroup.ts` | 74 | Keep | — | |
| `SupportedUnit.ts` | 40 | Keep | — | |
| `Unit.ts` | 42 | Keep | — | |
| `lib/*.ts` (8 files) | 285 | Keep | — | Pure formatting helpers |

## Tally

| Bucket | Files |
| ------ | ----: |
| Delete | 6 (`Renderer`, `reconstituteData`, `pruneObjectMap`, `DataObserver`, `DataQueue`, plus `augmentData` and `IpcTransport` as dead code) |
| New | ~35 (state layer, controllers, protocol, map buffer, tests) |
| Change meaningfully | ~40 |
| Keep untouched | ~55 |

Roughly half the codebase is untouched. Most of the "change" column is signature
churn in the map layers and one-line swaps at the six `DataObserver` sites. The
genuinely new thinking is concentrated in `State/` and the protocol modules —
which is the point of doing it this way rather than starting a new repository.

## Dead code to remove in Phase 0

Free wins, unrelated to the rest of the work, worth taking while setting up:

- `src/js/Engine/IpcTransport.ts` — the entire file is commented out.
- `src/js/UI/lib/augmentData.ts` — nothing imports it.
- `tsconfig.json`'s `include` names `main.ts` and `src/js/preload.ts`; neither
  exists. It also excludes most of `src/`, so `npm run ts:compile` is currently
  type-checking a small fraction of the codebase.
