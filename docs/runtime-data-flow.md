# Runtime Data Flow

## End-to-end turn flow

1. Frontend starts and waits for user to pick game mode/options (or takes a pending save, see below).
2. Frontend sends `setOptions` (as a request, waiting for the acknowledgement) then `start`.
3. Worker starts engine and creates clients.
4. Human client (`DataTransferClient`) sends the initial `gameData` snapshot the first time `takeTurn()` runs.
5. Frontend keeps the raw object map and builds the game data from it with `IncrementalReconstituter`.
6. As game changes occur, backend queues patches in `DataQueue` and flushes them as `gameDataPatch`.
7. Frontend mutates the local object map from patches, rebuilds only the ids they touched, and re-renders affected views.
8. At the start of the player's turn the worker sends the turn's patch, then `turnStarted`, then any notifications it held back.
9. Player input sends `action` messages; backend applies each action and sends one patch for it.
10. When the worker accepts `EndTurn` it sends `turnEnded`. The frontend shows a waiting banner and ignores input until the next `turnStarted`.

### Loading a saved game

1. `lib/savedGame.ts` stores the chosen save in IndexedDB, marks it in `sessionStorage`, and reloads the page.
2. `Renderer.init()` takes the pending save, registers all its transport listeners, then sends `load` (no `start`).
3. The worker imports the plugins, hydrates the save into `defaultGame` (`restoreGame`), and resumes the player who was mid-turn (`resumeGame`), or starts the turn if the save was taken between turns.
4. From there the flow is the same as above, starting at step 4.

### Performance marks

`Renderer` sets `performance.mark` entries for where a load's time goes (#325): `civ:load-sent` when `load` is sent, `civ:game-data-received` when the first `gameData` arrives, and `civ:first-render` on the first render. They show in a DevTools timeline or `performance.getEntriesByType('mark')`.

## Transport details

### Worker/main-thread transports

- `ParentTransport` (worker side)
  - Uses global `postMessage`/`addEventListener('message')`.
- `WorkerTransport` (frontend side)
  - Uses `Worker.postMessage` and worker event listeners.
  - Reconstitutes incoming hierarchy payloads (with `reconstituteData`) before handing them to the caller, only for the listener's own channel. The raw payload is passed as a second argument.

Both transport implementations normalize `DataObject` instances by converting to plain objects before send.

Both extend `AbstractTransport`, whose `request()` sends on a channel and resolves with the next reply on that channel. Because replies are matched by channel alone, a channel takes one request at a time; the next waits for the last reply (#324).

## Initial snapshot vs patch stream

### Initial snapshot (`gameData`)

- Sent from `DataTransferClient.sendInitialData()`.
- A `TransferObject` rooted at the player, turn and year, serialised through the visibility filter, so other players arrive as `UnknownPlayer` and only the tiles the player knows are sent (#328).
- Frontend treats this as full state bootstrap. A later `gameData` replaces the object map and rebuilds everything.

### Incremental patching (`gameDataPatch`)

`DataQueue` patch shape:

- `type`: `add | update | remove`
- `index`: optional object path string (`foo.bar[3]` style)
- `value`: object payload, or a function on the backend that is called when the queue is flushed

Most patches are queued as functions, so an object is serialised once, when the patch is sent.

When patches are flushed:

- While the human player's action is being handled, flushes are held, so the action (the moved unit's tiles, then the player) goes out as a single patch when it is done (#321). A unit sent somewhere with GoTo therefore appears at its destination in one step.
- Outside the player's actions (for example while other civilizations move), each `unit:moved` flushes the queue.
- Cheats, `unitActions` answers, the start of the turn and the end of the turn also flush.

What patches leave out:

- A unit goes out without its actions, except the unit the UI has made active. The frontend asks for that unit's actions with `unitActions` (`lib/unitActions.ts`), and the answer is a patch of that unit alone (#323).
- A city's `CityBuild` goes out without `available`. The production picker asks for the list with the `cityBuildAvailable` request when it opens (#324).

Frontend patch handling in `Renderer`:

- `add/update`
  - If `index` exists, set nested path inside target object.
  - Else replace root object entry.
  - Merge any `value.objects` references into object map.
  - Record every id touched in `changedIds`, and queue any `PlayerTile` in the patch to be redrawn.
- `remove`
  - Remove nested path or root object.
- Then `updateState` hands `changedIds` to `IncrementalReconstituter.rebuild()`, which refills only those ids' objects in place (#322, #327). Anything holding one of those objects sees the new contents without being rebuilt itself.

During the player's turn `updateState` runs synchronously on every patch, so input handlers always read the post-move state. While waiting for the other civilizations it runs at most once per animation frame (#61). Rendering (`render()`) always runs at most once per frame.

## Event bridge inside frontend

- `patchdatareceived` is dispatched for each applied `add`/`update` patch payload.
- `dataupdated` is dispatched at the start of each render, after state has been rebuilt.
- `DataObserver` subscribes by object IDs and calls its handler once per `dataupdated` if any observed ID was among the `objects` of a patch since the last one.

## Choice/interaction flow

When backend needs user choice (`chooseFromList`):

1. If there is only one choice (and it is not a negotiation step), the worker picks it without asking.
2. Otherwise the worker sends the `ChoiceMeta` (`choices`, `key`, contextual `data`), serialised as a standalone payload like a notification (#305).
3. Frontend opens `SelectionWindow`, or `ActionWindow` for a negotiation step with one option.
4. User selection sends chosen ID over `chooseFromList` channel.
5. Worker resolves pending `chooseFromList()` promise and continues turn logic.

## Requests for standalone data

Some data is fetched on demand rather than kept in the game data. The UI calls `transport.request()` with a `Requests/*` class, and the worker answers on the same channel:

- `cityBuildAvailable`: what a city can build, for the production picker.
- `topCities`: finished rows for the Top Cities report.
- `intelligence`: finished rows for the intelligence report.
- `getOptions`, `cheatAdvances`, `cheatPlayers`: options and cheat menu lists.

The worker also sends `embassyEstablished` (opens the intelligence report) and `investigateCity` (a read-only city screen) after a Diplomat's action.

## Notifications

- Low-level textual notifications use `notification` channel.
- Rich game notifications use `gameNotification` channel with typed data consumed by the `Notifications` UI. A notification marked `bubble` goes to `Notices` instead, which shows it as a button beside End Turn.
- Notifications are serialised with a standalone filter, so they say who and where but carry no refs into the game data (#130). Those raised for the player's turn before it is handed over (the turn-start rules run first) are held until after `turnStarted`.

## Known data-flow pain points

- `Renderer` still has a TODO about reconstituting in a worker thread. Rebuilds are now incremental, but `gameData` is reconstituted twice: once by `WorkerTransport` (used for the welcome window) and once by `IncrementalReconstituter`.
- Patch application relies on manual string-path mutation logic.
- The backend never emits `remove` patches (there is no `DataQueue.remove` call), so the frontend object map only shrinks via `pruneObjectMap`, which compacts unreachable entries every 5 turns — or on 1.5× growth since the last prune — once the map exceeds 5,000 objects. The ids it removes are passed to `IncrementalReconstituter.forget()`.

See [`memory-growth-analysis-2026-07.md`](./memory-growth-analysis-2026-07.md) for a detailed analysis of these paths.
