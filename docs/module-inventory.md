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
- `DataTransferClient.ts`: the human player's client, the backend-to-frontend state/action bridge. It is the composition root over `Client/*`: it builds the shared context, registers each module's listeners and receivers in order, delegates `takeTurn`, `chooseFromList` and `handleAction`, keeps the one-line delegations tests use (`flush()`, `initialData()`, the serialisers, `topCities`), and undoes it all with `dispose()` (#449).
- `Client/*`: the client's concerns, one module each (#449, `docs/state-rewrite/13-data-transfer-client-split.md`):
  - `ClientContext.ts`: what the modules share, one object the constructor makes once (types only); each module declares what it reads as a `Pick` of it.
  - `registries.ts`: the engine registries the context holds, the singletons in one place.
  - `refs.ts`: pure helpers for how payloads refer to the game's objects (`referenceObject`, `filterToReference*`, `standalone`, `actionKey`).
  - `standIns.ts`: what is sent in place of the game's own objects (the `Unknown*` stand-ins, `withoutAvailable`), with module-level caches every client shares.
  - `registerAdditionalData.ts`: the AdditionalData providers the payloads carry, registered once on import.
  - `visibilityFilter.ts`: the visibility filter every payload goes through, and the serialisers for the player's tiles, units, cities and parts of the player.
  - `ActionsState.ts`: the action lists the UI was last sent (#411) and the one unit it has the actions of (#323).
  - `PlayerPatches.ts`: the patch queue (a `DataQueue`), the helpers that queue each part of the game once per flush, the player's actions, and the flush itself, held while an action is handled (#321).
  - `Notifier.ts`: notifications, each serialised as it is given and sent at once or held until the turn is handed over (#130).
  - `cityNews.ts`: what happened to each city during one engine call (captured, destroyed, famine), told once the call is over.
  - `notifications/*`: pure handler tables (`city`, `unit`, `diplomat`, `player`) that turn an engine event into a notice; `registerNotifications.ts` registers them after the patch listeners, and `NotificationContext.ts` is what the handlers read.
  - `events/patchEvents.ts`: the engine events that queue patches for what they changed; every `unit:moved` flushes, which is how the AI's moves reach the UI.
  - `Talks.ts`: talks with other players (those met on the way, a Diplomat's Meet with King, each negotiation step), one promise chain the action that started them waits for.
  - `ChoicePrompt.ts`: sends a choice to the UI and listens once for the answer; one prompt pending per client (#491).
  - `diplomatEvents.ts`: the intelligence report for an embassy established, and the city a Diplomat investigated.
  - `handleAction.ts`: acts on each `action`: Reassign Workers and End Turn, then the named player action through the `actionHandlers` table. The handlers are in `actions/unit.ts`, `actions/city.ts` and `actions/player.ts`, and `actions/ActionContext.ts` is what they read.
  - `TurnHandover.ts`: hands the turn to the UI and back: the first `gameData`, the hand-over patch, `turnStarted`, the held notices and halts, each action's patch and `actionHandled`, and `turnEnded`; an automated turn instead.
  - `Automation.ts`: whether the player's turns are automated, and the computer player that plays them; read live, as it is toggled mid-game.
  - `cheats.ts`: the `cheat` receiver and the cheat menu's lists, with the plain-data checks for `CreateUnit` and `ModifyUnit`.
  - `requests.ts`: what the UI asks for: Top Cities, intelligence, the Civilization Score, a city's build list and a unit's actions.
  - `gameEnd.ts`: how the game ends for the player: Retire, keep playing, the ending window, and our own destruction.
- `Transport.ts`: channel and payload typing.
- `AbstractTransport.ts`: shared `request()` implementation (one request per channel at a time).
- `ParentTransport.ts` / `WorkerTransport.ts`: worker messaging implementations.
- `DataQueue.ts`: patch queue and transfer serialization, owned by `Client/PlayerPatches.ts`.
- `TransferObject.ts`: the root of the initial snapshot (player, turn, year).
- `Notification.ts`: the `gameNotification` payload (key, data, and whether it is a bubble notice).
- `Request.ts` + `Requests/*`: request/response convenience layer (`Options`, `CityBuildAvailable`, `TopCities`, `Intelligence`, `CheatAdvances`, `CheatPlayers`).
- `AdditionalData/*`: extra fields added to engine objects for the UI (`anarchyTurns`, `civilDisorderDeclared`, `researchCosts`, `tradeRoutes`).
- `lib/*`: worker-side helpers: report rows for Top Cities and the intelligence report, the Civilization Score, the ending window's details (`gameOver.ts`), whether we have met a player (`hasMet.ts`), and the stand-ins that send a unit or the player without its actions (`unitWithoutActions.ts`, `playerWithoutActions.ts`).
- `UnknownObjects/*`: wrappers for partially-known entities.
- `Error/*`: `Timeout`, the error a computer player's answer in a meeting times out with.

## UI side (`src/js/UI`)

- `bootstrap.ts`: page start-up, the `Renderer` class `frontend.ts` starts; hands each game to `game/GameSession`.
- `game/*`: one game: `GameSession`, `GameState` (patches and rebuilds), `ActiveUnitController`, `MapView`, `Hud`, `InputController`.
- `app/*`: the page's elements, i18n, assets, options, reload guard, notification bar and choice windows.
- `debug/*`: the `?debug=1` flags and panel.
- `Transport.ts`: UI-oriented transport type mapping.
- `AssetStore.ts`: IndexedDB + image caches.
- `Store.ts`: generic IndexedDB wrapper.
- `GameOptionsRegistry.ts`: in-memory UI options.
- `LocaleProvider.ts`: locale-aware number, percentage, list and relative-time formatting.
- `components/*`: windows, panels, menus, reports, details.
- `components/Map/*`: map canvas layers, sized to the portal rather than the world.
- `components/Portal.ts`, `GamePortal.ts`, `Minimap.ts`, `World.ts`: compositing the layers, map input (click, drag), the minimap, and the tile lookup (with stand-ins for tiles the player has not seen).
- `lib/*`: utility helpers (reconstitution, object-map pruning, key mapping, image scaling/recolouring, viewport geometry, saved games, etc.).
- `lib/IncrementalReconstituter.ts`: rebuilds the game data from the object map, touching only the ids a patch changed.
- `lib/DataChanges.ts`: tells the open windows watching ids that one of them changed, once per render (#344); `components/lib/watchCity.ts` and `watchPlayer.ts` do it for the city screen and the reports.
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
