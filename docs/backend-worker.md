# Backend Worker

## Purpose

The worker runtime hosts engine execution and translates core game objects into UI-friendly transfer data.

Primary files:

- `src/js/backend.ts`
- `src/js/Engine/Game.ts`
- `src/js/Engine/loadGame.ts`
- `src/js/Engine/DataTransferClient.ts`
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

`DataTransferClient` extends core client behavior for web-renderer communication.

### Input handling

Receives frontend events over transport:

- `action`: all player actions (unit movement, end turn, city actions, etc.).
- `cheat`: ad-hoc debug operations (`RevealMap`, `GrantAdvance`, `GrantGold`, `ModifyUnit`). `GrantAdvance` and `GrantGold` can target any player.
- `unitActions`: the UI asks for the actions of the unit it has made active.
- Requests answered on the same channel: `cityBuildAvailable`, `topCities`, `intelligence`, `cheatAdvances`, `cheatPlayers`.

### Output handling

Sends data to frontend:

- `gameData`: initial snapshot.
- `gameDataPatch`: incremental updates from `DataQueue`.
- `turnStarted` / `turnEnded`: the turn has been handed to the UI, or `EndTurn` has been accepted and actions are no longer listened for.
- `gameNotification`: user-facing gameplay notifications.
- `chooseFromList`: player decisions required by game flow.
- `embassyEstablished`, `investigateCity`: results of a Diplomat's actions.
- `restart`: on local-player defeat (nothing receives it).

### Turn handling

`takeTurn()` sends the initial snapshot if it has not been sent, then:

- With automation on, runs `SimpleAIClient.takeTurn()` for the player and sends one patch afterwards.
- Otherwise, sends the new turn, year and player as a patch, then `turnStarted`, then the notifications held back until then.
- Each `action` is handled with patch flushes held, then the player is queued and one patch is sent for the whole action (#321).
- When `EndTurn` is accepted it sends the last patch and `turnEnded`, and stops listening.

### Action processing

`handleAction(...)` maps transport payloads to concrete player actions, with special handling for:

- `ActiveUnit` action + target resolution. The acting unit becomes the one sent with its actions.
- `InactiveUnit` updates.
- `ChangeProduction`, `CityBuild`, `ChooseResearch`, `CompleteProduction`, `Revolution`, `ChooseGovernment`, `AdjustTradeRates`, `ChangeWorkedTile`, `ChangeSpecialist`, `LaunchSpaceship`.
- Synthetic/utility action: `ReassignWorkers`.

### Negotiation handling

Diplomacy uses iterative `chooseFromList` prompts while negotiation is active.
AI clients are timeout-protected (500 ms) for negotiation responses.
A move next to another player's unit can start talks (`canNegotiate`), and so can a Diplomat's Meet with King (`player:meet-with-king`).

## Data conversion strategy

- Backend filters outgoing objects (`#dataFilter`, passed to `toPlainObject`) to avoid leaking hidden/unavailable entities. The initial snapshot goes through it too (#328).
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
- `restart` is declared in the typed transport map but has no receiver on the other side: the backend sends it and the frontend has no handler (#176). `quit` was removed with the main menu's Quit button (#340).
- A new game hardcodes only player index 0 as human.

## Rewrite carry-forward suggestions

- Keep worker boundary and message transport abstraction.
- Introduce explicit protocol schema versioning for transport payloads.
- Normalize action payloads behind a declarative dispatcher map.
- Replace manual patch path strings with operation objects or JSON Patch-like structure.
