# Module Inventory

Quick reference map of key code areas.

## Top-level

- `index.html`: static shell with map/sidebar/menu containers.
- `esbuild.js`: bundling config and watch/dev flags.
- `buildPluginList.js`: generates `src/js/plugins.ts` import list.
- `buildTranslationList.js`: generates `src/js/translations.ts` import list.
- `build.json`: generated version metadata used by UI.
- `generate-changelog.mjs`: builds the release notes in `changelog/` from commit messages.
- `tests/engine/*`, `tests/ui/*`: test suites, each run by a matching script in `tools/` (`npm test` runs them all).

## Engine side (`src/js/Engine`)

- `Game.ts`: startup, options, save/load handling, player/client setup.
- `loadGame.ts`: restores a save into `defaultGame` and resumes the turn in progress.
- `diplomacy.ts`: registers the diplomacy classes a save can name, and cleans older saves' diplomacy data before hydrating.
- `DataTransferClient.ts`: backend-to-frontend state/action bridge.
- `Transport.ts`: channel and payload typing.
- `AbstractTransport.ts`: shared `request()` implementation (one request per channel at a time).
- `ParentTransport.ts` / `WorkerTransport.ts`: worker messaging implementations. `IpcTransport.ts` is an old Electron transport, entirely commented out.
- `DataQueue.ts`: patch queue and transfer serialization.
- `TransferObject.ts`: the root of the initial snapshot (player, turn, year).
- `Notification.ts`: the `gameNotification` payload (key, data, and whether it is a bubble notice).
- `Request.ts` + `Requests/*`: request/response convenience layer (`Options`, `CityBuildAvailable`, `TopCities`, `Intelligence`, `CheatAdvances`, `CheatPlayers`).
- `AdditionalData/*`: extra fields added to engine objects for the UI (`anarchyTurns`, `civilDisorderDeclared`, `researchCosts`, `tradeRoutes`).
- `lib/*`: worker-side helpers: report rows for Top Cities and the intelligence report, and the stand-in that sends a unit without its actions (`unitWithoutActions.ts`).
- `UnknownObjects/*`: wrappers for partially-known entities.
- `Retryable.ts`, `Error/*`: retry helper (used when a newly visible tile is not yet in the player's world) and its errors.

## UI side (`src/js/UI`)

- `Renderer.ts`: main frontend orchestrator.
- `Transport.ts`: UI-oriented transport type mapping.
- `AssetStore.ts`: IndexedDB + image caches.
- `DataObserver.ts`: patch/data event subscription helper.
- `Store.ts`: generic IndexedDB wrapper.
- `GameOptionsRegistry.ts`: in-memory UI options.
- `LocaleProvider.ts`: locale-aware number, percentage, list and relative-time formatting.
- `components/*`: windows, panels, menus, reports, details.
- `components/Map/*`: map canvas layers, sized to the portal rather than the world.
- `components/Portal.ts`, `GamePortal.ts`, `Minimap.ts`, `World.ts`: compositing the layers, map input (click, drag), the minimap, and the tile lookup (with stand-ins for tiles the player has not seen).
- `lib/*`: utility helpers (reconstitution, object-map pruning, key mapping, image scaling/recolouring, viewport geometry, saved games, etc.).
- `lib/IncrementalReconstituter.ts`: rebuilds the game data from the object map, touching only the ids a patch changed.
- `lib/reconstituteData.ts`: full rebuild of an object map; used for one-off payloads and as the reference for `IncrementalReconstituter`.
- `lib/pruneObjectMap.ts`: drops object-map entries nothing reachable refers to.
- `lib/unitActions.ts`: asks the worker for the active unit's actions (`unitActions`).
- `lib/savedGame.ts`: downloading saves, and handing a save to the next page load.
- `lib/memoryTestbed.ts`: opt-in heap/object-count sampler (debug mode).
- `lib/UIStressRunner.ts`: opt-in automated UI stress harness (debug mode).

## Styling and assets

- `src/css/app.scss`: entry style file.
- `src/css/components/*`: component-level SCSS modules.
- `src/img/main-menu-bg.jpg`: main menu background image.

## Localization

- `translations/*`: namespaced translation modules.
- `src/js/translations.ts`: generated import fan-in file.

## Changelog and release notes

- `changelog/*.json`: release snapshots.
- `changelog/releases.json`: aggregate release feed.
- `src/js/UI/components/ReleaseWindow.ts`: in-app release viewer.
