# Backend Worker

## Purpose

The worker runtime hosts engine execution and translates core game objects into UI-friendly transfer data.

Primary files:

- `src/js/backend.ts`
- `src/js/Engine/Game.ts`
- `src/js/Engine/loadGame.ts`
- `src/js/Engine/DataTransferClient.ts`
- `src/js/Engine/Client/*`
- `src/js/Engine/DataQueue.ts`
- `src/js/Engine/Transport.ts`

## `Game` boot orchestration

`Game` listens for incoming control messages:

- `start`: bind event notifications and call `start()`.
- `setOption`: set single engine option. `automateLocalPlayer` is handled here instead, and switches the local player's automation on or off.
- `getOptions`: return selected option values.
- `setOptions`: apply batch options and acknowledge.
- `save`: serialise `defaultGame` with `core-save-game`'s `save()` and send it back on `saveGame`. A failure is reported as a `notification` rather than thrown.
- `load`: parse the save and call `load()`.

On `start()`:

- Hooks `engine:start` to register the plugin manifest and the save-game classes (`registerClasses`, `registerDiplomacyClasses`) before any player claims a civilisation.
- Hooks `engine:start` to create players.
- Registers one human `DataTransferClient` (player index 0).
- Registers AI clients (`SimpleAIClient`) for all other players.
- Calls `engine.start()` and then dynamic-imports generated plugins.

On `load()`:

- Imports the plugins, then calls `loadGame()`. There is no `engine.start()`, so no world is generated and no settlers are spawned.
- `restoreGame()` registers the classes and plugins, strips old diplomacy data, hydrates the save into `defaultGame`, and repairs older saves (tiles held by destroyed cities, ships' registries). It makes a `DataTransferClient` for each player the save records as served by `DataTransferClient`, and a `SimpleAIClient` for the rest.
- `resumeGame()` hands the turn back to the player who was taking it, or emits `turn:start` if the save was taken between turns.

A save can only be loaded into a worker that has not started a game, because the plugins' rules close over the singleton registries. The frontend reloads the page to get a new worker.

## `DataTransferClient` responsibilities

`DataTransferClient` extends core client behavior for web-renderer communication. It is a composition root (#449, `docs/state-rewrite/13-data-transfer-client-split.md`): its constructor builds one shared `ClientContext` (the player, the transport, the patches, the notifier, automation, the talks and the registries), registers each module's engine listeners and transport receivers in a fixed order, and keeps what each registration returns so that `dispose()` can undo it. Apart from `chooseFromList`'s shortcuts (automation chooses, a single choice is taken), its methods are one-line delegations. The class name is part of the save format, so it is never renamed.

The modules, all under `src/js/Engine/Client/`:

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

### Input handling

Receives frontend events over transport:

- `action`: all player actions (unit movement, end turn, city actions, etc.).
- `cheat`: ad-hoc debug operations (`RevealMap`, `GrantAdvance`, `GrantGold`, `ModifyUnit`, `CreateUnit`). `GrantAdvance` and `GrantGold` can target any player.
- `unitActions`: the UI asks for the actions of the unit it has made active.
- Requests answered on the same channel: `cityBuildAvailable`, `topCities`, `civilizationScore`, `intelligence`, `cheatUnitTypes`, `cheatAdvances`, `cheatPlayers`.
- `retire`, `gameContinue`: Game → Retire, and keeping playing after the game has ended.

### Output handling

Sends data to frontend:

- `gameData`: initial snapshot (`TurnHandover.sendInitialData()`).
- `gameDataPatch`: incremental updates from `DataQueue`.
- `turnStarted` / `turnEnded`: the turn has been handed to the UI, or `EndTurn` has been accepted and actions are no longer listened for.
- `actionHandled`, `unitHalted`: an action has been acted on; a unit's GoTo halted.
- `gameNotification`: user-facing gameplay notifications.
- `chooseFromList`: player decisions required by game flow.
- `embassyEstablished`, `investigateCity`: results of a Diplomat's actions.
- `gameOver`: the ending window's details, whenever the game ends for the player.

### Turn handling

`takeTurn()` (`Client/TurnHandover.ts`) sends the initial snapshot if it has not been sent, then:

- With automation on, runs `SimpleAIClient.takeTurn()` for the player and sends one patch afterwards.
- Otherwise, sends the new turn, year and player as a patch, then `turnStarted`, then the notifications held back until then.
- Each `action` is handled with patch flushes held, then one patch is sent for the whole action (#321): what the action changed, and the player's actions if they changed, not the whole player (#411).
- When `EndTurn` is accepted it sends the last patch and `turnEnded`, and stops listening.

### Action processing

`handleAction(...)` (`Client/handleAction.ts`, handlers in `Client/actions/`) maps transport payloads to concrete player actions, with special handling for:

- `ActiveUnit` action + target resolution. The acting unit becomes the one sent with its actions.
- `InactiveUnit` updates.
- `ChangeProduction`, `CityBuild`, `ChooseResearch`, `CompleteProduction`, `Revolution`, `ChooseGovernment`, `AdjustTradeRates`, `ChangeWorkedTile`, `ChangeSpecialist`, `LaunchSpaceship`.
- Synthetic/utility action: `ReassignWorkers`.

### Negotiation handling

Diplomacy (`Client/Talks.ts`) uses iterative `chooseFromList` prompts while negotiation is active.
AI clients are timeout-protected (500 ms) for negotiation responses.
A move next to another player's unit can start talks (`canNegotiate`), and so can a Diplomat's Meet with King (`player:meet-with-king`).

## Data conversion strategy

- Backend filters outgoing objects (the filter `makeDataFilter` makes in `Client/visibilityFilter.ts`, passed to `toPlainObject`) to avoid leaking hidden/unavailable entities. The initial snapshot goes through it too (#328).
- Unknown-object wrappers (`UnknownCity`, `UnknownUnit`, `UnknownPlayer`) represent fog-of-war/visibility boundaries.
- A `Tile` is sent as the player's `PlayerTile` (or a made-up unknown tile if the player has not seen it), so the frontend only ever holds the map the player knows.
- The player's units are sent without `actions` and `actionsForNeighbours` (`lib/unitWithoutActions.ts`), except the unit the UI has active (#323).
- The player's `CityBuild`s are sent without `available`; `cityBuildAvailable` answers with it on request (#324).
- Notifications, choices and request answers use a `standalone` filter: players and tiles go out as just their id and a few fields, with no refs into the game data (#130, #305).
- Function-valued patch payloads are resolved at send time in `DataQueue.transferData()`.
- `AdditionalData/*` providers add fields the UI needs but the engine keeps elsewhere (`anarchyTurns`, `civilDisorderDeclared`, `researchCosts`, `tradeRoutes`).

## Constraints and risks in current backend

- Heavy class-based mutation makes selective diffs difficult.
- Patch queue currently unchunked (`DataQueue` TODO).
- A new game hardcodes only player index 0 as human.

## Rewrite carry-forward suggestions

- Keep worker boundary and message transport abstraction.
- Introduce explicit protocol schema versioning for transport payloads.
- Normalize action payloads behind a declarative dispatcher map.
- Replace manual patch path strings with operation objects or JSON Patch-like structure.
