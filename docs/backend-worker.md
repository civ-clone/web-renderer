# Backend Worker

## Purpose

The worker runtime hosts engine execution and translates core game objects into UI-friendly transfer data.

Primary files:

- `src/js/backend.ts`
- `src/js/Engine/Game.ts`
- `src/js/Engine/DataTransferClient.ts`
- `src/js/Engine/DataQueue.ts`
- `src/js/Engine/Transport.ts`

## `Game` boot orchestration

`Game` listens for incoming control messages:

- `start`: bind event notifications and call `start()`.
- `setOption`: set single engine option.
- `getOptions`: return selected option values.
- `setOptions`: apply batch options and acknowledge.

On `start()`:

- Hooks `engine:start` to create players.
- Registers one human `DataTransferClient` (player index 0).
- Registers AI clients (`SimpleAIClient`) for all other players.
- Calls `engine.start()` and then dynamic-imports generated plugins.

## `DataTransferClient` responsibilities

`DataTransferClient` extends core client behavior for web-renderer communication.

### Input handling

Receives frontend events over transport:

- `action`: all player actions (unit movement, end turn, city actions, etc.).
- `cheat`: ad-hoc debug operations (`RevealMap`, `GrantAdvance`, `GrantGold`, `ModifyUnit`).

### Output handling

Sends data to frontend:

- `gameData`: initial full snapshot.
- `gameDataPatch`: incremental updates from `DataQueue`.
- `gameNotification`: user-facing gameplay notifications.
- `chooseFromList`: player decisions required by game flow.

### Action processing

`handleAction(...)` maps transport payloads to concrete player actions, with special handling for:

- `ActiveUnit` action + target resolution.
- `InactiveUnit` updates.
- `ChangeProduction`, `CityBuild`, `ChooseResearch`, `Revolution`, `AdjustTradeRates`, `LaunchSpaceship`.
- Synthetic/utility action: `ReassignWorkers`.

### Negotiation handling

Diplomacy uses iterative `chooseFromList` prompts while negotiation is active.
AI clients are timeout-protected for negotiation responses.

## Data conversion strategy

- Backend filters outgoing objects (`toPlainObject`) to avoid leaking hidden/unavailable entities.
- Unknown-object wrappers (`UnknownCity`, `UnknownUnit`, `UnknownPlayer`) represent fog-of-war/visibility boundaries.
- Function-valued patch payloads are resolved at send time in `DataQueue.transferData()`.

## Constraints and risks in current backend

- Heavy class-based mutation makes selective diffs difficult.
- Patch queue currently unchunked (`DataQueue` TODO).
- `restart` and `quit` are declared in the typed transport map but have no receiver on the other side (`restart` sent by the backend has no frontend handler; `quit` sent by the frontend has no backend handler).
- `Game` currently hardcodes only player index 0 as human.

## Rewrite carry-forward suggestions

- Keep worker boundary and message transport abstraction.
- Introduce explicit protocol schema versioning for transport payloads.
- Normalize action payloads behind a declarative dispatcher map.
- Replace manual patch path strings with operation objects or JSON Patch-like structure.
