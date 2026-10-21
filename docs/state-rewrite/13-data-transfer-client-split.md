# 13 — Splitting `DataTransferClient`

> **Status (2026-10-21):** Planned, not started (#449). Line numbers are from `main` at `18f28b0`. This is the worker-side
> counterpart of [`08-phase-3-subscriptions.md`](./08-phase-3-subscriptions.md); the two are independent and can
> proceed in parallel. The original plan touched this file only for Phase 4's `DeltaBuilder` and Phase 6's `dispose()`
> (see `12-file-migration-map.md`), neither of which happened.

**Goal.** `src/js/Engine/DataTransferClient.ts` (3,080 lines: a 1,297-line constructor registering 58 engine
listeners and 13 transport receivers, plus 47 methods) becomes a composition root of about 220 lines over modules
that each own one concern and that tests can exercise without running a game. Nothing changes on the wire.

**Not a goal.** No protocol change, no `DeltaBuilder`, no change to what is sent or when. The patch sizes and flush
timing were fixed by #320's work and are tested by `oneFlushPerAction`, `turnHandover` and `patchRefs`.

**Risk.** Medium. The file's hazards are ordering, not size: patches are built lazily at flush time in queue order,
the visibility filter has a side effect on the held-actions cache, and flushes are held across awaited talks. The
step order below keeps every one of those behaviours inside a single module so that a move cannot reorder them, and
step 0 adds a transcript fixture that catches any change on the wire.

## What the file is today

By concern (section numbers from the 2026-10-21 inventory; lines from `18f28b0`):

| Concern | Where | Lines |
| --- | --- | --- |
| Serialisation and filters: `referenceObject`, `filterToReference*`, `standalone`, `actionKey`, the Unknown\* stand-ins, `withoutAvailable`, `#dataFilter`, `serialiseTile/Own/Unit/City/Player` | L142–238, L261–346, L2403–2499 | ~400 |
| Send queue and flushes: `DataQueue`, `#queued`, `#queuedTiles`, `#holdingFlushes`, the `#send*` once-per-flush helpers, `#sendActions`, `#sendWholePlayer`, `#playerState`, `sendPatchData`, `sendInitialData` | L2131–2159, L2501–2798 | ~330 |
| Patch-producing engine listeners: visibility, unit lifecycle, moves, tile improvements, city changes, worked tiles, government, nuclear, transfers | L697–1037, L1303–1317 | ~330 |
| Notifications: ~30 handlers mapping an engine event to a `Notification`, plus city news and `sendNotification` | L872–902, L1039–1233, L1319–1686, L2292–2401 | ~600 |
| Diplomacy: `#metOnTheWay`, `#talks`, `talkToPlayersMet`, `handleNegotiation`, `chooseFromList`, embassy and investigate | L790–806, L1235–1301, L1693–1755, L2975–3077 | ~300 |
| Action handling: `handleAction`, 13 branches | L1757–2090 | ~330 |
| Turn hand-over: `takeTurn`, `#handOver`, `#acknowledge`, `#sendHalts`, `unit:halted` | L808–826, L2833–2973 | ~170 |
| Cheats | L415–602, L2110–2129 | ~210 |
| Request handlers and derived views: `topCities`, `civilizationScore`, `intelligence`, `cityBuildAvailable`, `unitActions`, `gameOver`, `hasMet` | L604–690, L2161–2290 | ~210 |
| Game end: `retire`, `gameContinue`, `game:over`, `game:loaded`, `player:defeated` | L615–645, L1480–1546 | ~100 |
| Automation: `#automationEnabled`, `#automatedTurn()`, gates in 9 places | scattered | ~40 |

26 private fields, of which `#sender` and `#receiver` are never read. Five module-level caches (the Unknown\*
`WeakMap`s and the CityBuild stand-ins) are shared by every instance, and importing the file registers five
AdditionalData providers as a side effect.

## Constraints any step must respect

1. **The class name is part of the save format.** `loadGame.HUMAN_CLIENT = 'DataTransferClient'` is matched against
   `client.constructor.name` written by `core-save-game`; `esbuild.js` sets `keepNames: true` for it. Do not rename
   the class, subclass it, or move the `Client` inheritance into a helper.
2. **Tests reach TS-`private` members by name**: `sendPatchData` (10 call sites in 8 files), `sendInitialData`
   (`patchRefs.ts:833`), `serialiseCity` (`sellImprovement.ts:147`), `topCities`. They work because these are TS
   `private`, not `#`. Converting them breaks ten test files; keep them as named delegations until step 15.
3. **Registration stays synchronous in the constructor.** `loadGame` emits `game:loaded` straight after
   `createClient`, and the game-end listener must already be there.
4. **Patch pairs are enqueued by one call into one queue.** `#sendActions` queues `actions` then `mandatoryActions`,
   and the second closure reads a `let` the first sets (L2630, L2664, L2689). `#sendWholePlayer` clears the held keys
   inside its closure (L2717), relying on being built before the `#sendActions` entries queued straight after it.
   `cityChanged` mutates the shared `UnknownCity` inside a closure (L925).
5. **The filter's side effect stays.** Serialising a `PlayerAction` anywhere except inside `#sendActions` or
   `serialisePlayer` forgets the held actions (L274). `#answeringUnitActions` is set inside a queued closure (L672) and
   is only meaningful at flush time.
6. **All seven flush sites go through one `flush()` that honours the hold.** `#holdingFlushes` is true across
   `await this.#talks` and `talkToPlayersMet()` (L1846–1848), so a talk's `chooseFromList` prompt goes out before the
   patch of the move that started it, and every `unit:moved` (any player's) flushes (L860), which is how AI moves
   reach the UI.
7. **Transport shapes.** `chooseFromList` sends `Object.create(meta, { toPlainObject })`, relying on
   `ParentTransport.send` calling `toPlainObject()` while test stubs receive the live `ChoiceMeta` so an AI can
   answer it. `sendNotification` sends an already-plain object. Keep both.
8. **`Automation` is passed by reference, never copied.** It is toggled mid-game (`Game.ts` `setOption`;
   `patchRefs` automates every fourth turn) and gates behaviour in nine places.
9. **Timers.** The hand-over `setTimeout(1)`, the resolve `setTimeout(10)`, `Retryable` (20 ms × 2, with an unhandled
   rejection after two failures) and the city-news `queueMicrotask`. `turnHandover` asserts notices arrive after
   `turnStarted`; `cityNews` asserts one notice per city per engine call.

## Target modules

All under `src/js/Engine/Client/` except the pure libs in `src/js/Engine/lib/`. No module imports
`DataTransferClient`. Each registrar takes a `ClientContext` and returns a disposer.

```ts
// src/js/Engine/Client/ClientContext.ts (types only)
export interface ClientContext {
  player(): Player;
  transport: Transport<TransportDataMap>;
  patches: PlayerPatches; // queue, send-once helpers, hold, flush
  notifier: Notifier; // notify(), hold while it is not our turn, release
  automation: Automation; // enabled, automatedTurn(), the AI client
  talks: Talks; // metOnTheWay, chain, negotiate
  hasMet(player: Player): boolean;
}
export type Disposer = () => void;
export type Registrar = (engine: Engine, ctx: ClientContext) => Disposer;
```

| Module | Concern | Public exports | Pure? | ~Lines |
| --- | --- | --- | --- | --- |
| `Client/refs.ts` | serialisation | `referenceObject`, `filterToReference`, `filterToReferenceAllExcept`, `standalone`, `actionKey` | **pure** | 70 |
| `Client/standIns.ts` | serialisation | `unknownPlayerOf/UnitOf/CityOf`, `knownUnknownCity(city)`, `withoutAvailable`, `standsInForCityBuild` (module caches, as now) | caches only | 70 |
| `Client/registerAdditionalData.ts` | serialisation | side-effect import, idempotent `register()` | – | 20 |
| `Client/ActionsState.ts` | send queue | `class ActionsState { held; heldKeys; heldMandatory; serialising; unitWithActions; answering; forget(); sendsUnitActions(unit); setUnitWithActions(unit, onPrevious) }` and the pure `diffActions(actions, mandatory, held)` | `diffActions` pure | 110 |
| `Client/visibilityFilter.ts` | serialisation | `makeDataFilter(player, actionsState)`, `serialiseTile`, `serialiseOwn`, `serialiseUnit`, `serialiseCity`, `serialisePlayerPart`, `serialisePlayer` | pure given a player and registries | 200 |
| `Client/PlayerPatches.ts` | send queue and flushes | `add/update(id, value, index?)`, `tile`, `city`, `cityBuild`, `unit`, `onTiles`, `citiesAround`, `playerKey`, `actions`, `player`, `wholePlayer(filter, type)`, `playerObject`, `playerState`, `playerStateChanged(before)`, `allTilesAndCities`, `hold<T>(fn)`, `flush()` | no | 330 |
| `Client/Notifier.ts` | notifications | `notify(n)`, `holdWhile(pred)`, `release()` | no | 60 |
| `Client/cityNews.ts` | city news | `CityNews`, `CityNewsCollector#of(city)` (microtask), pure `cityNewsNotifications(entries, player)` | decision pure | 120 |
| `Client/notifications/{city,unit,diplomat,player}.ts` + `registerNotifications.ts` | notifications | a table `[event, (ctx, ...args) => Notification \| null]` per file; the registrar loops the tables in today's order. Includes `sabotagedBuildKind` and the building-complete suffix | handlers **pure** (args + player + hasMet) | 450 |
| `Client/events/patchEvents.ts` | engine → patches | `registerPatchEvents: Registrar` | no | 330 |
| `Client/Talks.ts` | diplomacy | `metOnTheWay`, `chain(fn)`, `afterAction()`, `handOver()`, `registerTalkEvents`, `handleNegotiation` | no | 150 |
| `Client/ChoicePrompt.ts` | prompts | `promptChoice(meta, transport, filter, fallback)` (owns the pending disposer) | no | 70 |
| `Client/diplomatEvents.ts` | diplomacy | `registerDiplomatEvents` (`embassyEstablished`, `investigateCity`) | serialiser pure-ish | 90 |
| `Client/actions/{unit,city,player}.ts` + `handleAction.ts` | action handling | `handleAction(ctx, action)`, a `[PlayerActionClass, handler]` table, pure `findPlayerAction(actions, { name, id })` | lookup pure | 360 |
| `Client/TurnHandover.ts` | turn hand-over | `takeTurn()`, `sendInitialData()`, `handedOver`; the `action` relay, `turnStarted`/`turnEnded`/`actionHandled`/`unitHalted`, held halts | no (timers) | 200 |
| `Client/cheats.ts` | cheats | `registerCheats`, `resolveCheatPlayer`, `cheatUnitTypes`, pure `validCreateUnit(value, world)` / `modifiableProperties` | validators pure | 200 |
| `Client/requests.ts` | requests | `registerRequests` (`topCities`, `civilizationScore`, `intelligence`, `cityBuildAvailable`, `unitActions`) | thin | 110 |
| `Client/gameEnd.ts` | game end | `registerGameEnd` (`retire`, `gameContinue`, `game:over`, `game:loaded`, the ending half of `player:defeated`), `gameOver(ctx, result)` | builder pure-ish | 120 |
| `Client/Automation.ts` | automation | `enabled`, `client`, `automatedTurn(player)` | trivially pure | 40 |
| `lib/hasMet.ts` | support | `hasMet(self, other, { interactions, cities, playerWorlds })`, injected registries like `lib/intelligence.ts` | **pure** | 40 |
| `lib/topCities.ts`, `lib/civilizationScore.ts` (extend) | requests | `topCitiesEntries(player, deps)`, `civilizationScore(player, deps)` | pure with deps | +90 |
| `DataTransferClient.ts` | composition root | same class name and constructor signature; wires the context, calls the registrars in order, delegates `takeTurn`, `chooseFromList`, `handleAction`; keeps the test-facing `serialiseTile/Unit/City/Player`, `sendPatchData`, `sendInitialData`, `cityBuildAvailable`, `topCities`, `civilizationScore`, `gameOver`, `setAutomationEnabled` as one-line delegations; later gains `dispose()` | – | 220 |

Dependency direction, no cycles: `refs`, `standIns`, `Automation`, `lib/*` → `ActionsState` → `visibilityFilter` →
`PlayerPatches`, `Notifier` → `cityNews`, `notifications/*`, `ChoicePrompt`, `Talks` → `patchEvents`,
`diplomatEvents`, `cheats`, `requests`, `gameEnd`, `actions/*` → `TurnHandover` → `DataTransferClient`. The one
would-be cycle (the filter needs the held-actions and active-unit state that `#sendActions` writes) is broken by
`ActionsState`, which both depend on.

What becomes unit-testable with plain data: the ref filters and `actionKey`; `withoutAvailable`;
`sabotagedBuildKind`; the ~30 notification handlers; `cityNewsNotifications`; `diffActions`; `hasMet`,
`topCitiesEntries` and `civilizationScore` with injected registries; the cheat validators; `findPlayerAction`.
Extracting the notification tables makes 16 families of notice keys testable that have no test today
(captured-by-us, lost-at-sea, out-of-fuel, unit and improvement unsupported, the building-complete kinds,
Wonder.obsolete, GoodyHut, retirement-warning, Player.defeated ×4, civil-disorder, order-restored,
government-collapsed ×2, the leader celebrations, Spaceship ×3, declaration-expired).

## Step order

**P** = pure move (nothing changes on the wire), **B** = changes behaviour or API. One PR each; `npm test` passes.
Steps 1–3 are independent; 4 → 5 → 6 is a chain; 7–14 depend on 6; 8 needs 7; 13–14 need 10.

| # | Kind | Step | Proved by |
| --- | --- | --- | --- |
| 0 | test | **Client transcript fixture.** `tests/engine/clientTranscript.ts` + `tools/client-transcript.js` (`test:client-transcript`, with `--update`): a seeded game with a human client driven by a small script (the `turnHandover` setup plus a move, found a city, change production, research, rates, revolution), each cheat (RevealMap, GrantGold, CreateUnit) and each request (topCities, civilizationScore, intelligence, cityBuildAvailable, unitActions). It records every `send(channel, JSON(plain))` in order and compares a hash per channel and a whole-sequence hash with `tests/engine/fixtures/client-transcript.json`. Ids are per-class counters and the RNG is seeded, so the output is deterministic | two consecutive runs give the same hash. Every P step below leaves the fixture byte-identical. If a `Retryable` makes the cross-timer order unstable, hash each flush's content separately from the order |
| 1 | P | `Client/refs.ts`, `Client/registerAdditionalData.ts` (imported for its side effect at the top of DTC), `standIns.ts`, `notifications/diplomat.ts` (`sabotagedBuildKind`). Widen `tsconfig.json` `include` to `src/js/Engine/**/*` so pure modules used only by tests are type-checked (#339). `tests/engine/clientRefs.ts` | transcript, patchRefs |
| 2 | P | `lib/hasMet.ts` with injected registries and a plain-data test like `intelligence.ts`'s | respawn, topCities, gameEnd, transcript |
| 3 | P | `topCitiesEntries` and `civilizationScore` into `lib/`; DTC delegates | topCities, civilizationScore, gameEnd |
| 4 | P | `ActionsState` + `diffActions` (moves `#heldActions`, `#heldActionKeys`, `#heldMandatoryActions`, `#serialisingActions`, `#unitWithActions`, `#answeringUnitActions`), with a `diffActions` unit test | patchRefs (action lists sent/held, #411 parity), goToArrival, transcript |
| 5 | P | `visibilityFilter.ts` + serialisers; DTC keeps `serialiseTile/Unit/City/Player` as delegations | patchRefs (#46/#328/#130/#138 checks), sellImprovement, civilDisorder, transcript |
| 6 | P | `PlayerPatches`: owns `DataQueue`, `#queued`, `#queuedTiles`, `#holdingFlushes` (as `hold(fn)`), the send-once helpers, `governmentChanged` and `flush()`. DTC's `sendPatchData()`/`sendInitialData()` stay as private-named delegations for the 11 test call sites | oneFlushPerAction, patchRefs, joinCity, tradeRoutes, transcript |
| 7 | P | `Notifier` + `cityNews`, with a `cityNewsNotifications` unit test | cityNews, turnHandover (notices after `turnStarted`), transcript |
| 8 | P | Notification tables. Split each mixed listener (`city:captured`, nuclear, trade route, building-complete, research-complete, obsolete, goody hut) into a patch half and a notice half, registered in today's order, patch half first. Notices go out at once and patches only at a flush, and no listener among these flushes, so the wire is unchanged. `tests/engine/clientNotifications.ts` covers every key, including the 16 untested families | transcript, pollution, nuclear, diplomats, respawn, improvementObsolete, futureTechnology, tradeRoutes |
| 9 | P | `events/patchEvents.ts`, registered in the same relative order | civilDisorder, nuclear, joinCity, roadTo, terrainJob, patchRefs, transcript |
| 10 | P | `Talks` + `ChoicePrompt` + `diplomatEvents` | diplomats (MeetWithKing, embassy, investigate), goToArrival, turnHandover, oneFlushPerAction, transcript |
| 11 | P | `cheats.ts`, with validator unit tests and a ModifyUnit case (untested today) | cheats, patchRefs (RevealMap), transcript |
| 12 | P | `requests.ts` + `gameEnd.ts` | topCities, civilizationScore, intelligence, gameEnd, respawn, patchRefs, goToArrival, ui hallOfFame, transcript |
| 13 | P | `actions/*` handler table and `findPlayerAction`; add a LaunchSpaceship case (untested today) | patchRefs (12 of 13 action kinds), sellImprovement, autoProduction, standingOrders, terrainJob, joinCity, tradeRoutes, diplomats, transcript |
| 14 | P | `TurnHandover` + `Automation`; DTC becomes the composition root | turnHandover, oneFlushPerAction, patchRefs (automated every 4th turn), goToArrival, standingOrders, transcript |
| 15 | B (API) | Public test hooks: replace the 12 `(client as any).sendPatchData()` / `sendInitialData()` / `serialiseCity()` uses with a documented public `flush()` / `initialData()`; drop the dead `sender`/`receiver` constructor parameters (touches `Game.ts` and the 22 test constructors). No runtime change | `ts:compile`, every bundle builds, `npm test` |
| 16 | B | `dispose()`: registrars return disposers (`engine.off` for the 58 listeners, the transport disposers for the 12 receivers, the pending choice); `Game.ts` disposes a replaced client; `patchRefs`' second client (L811) disposes after its check | a new test that after `dispose()` an engine event sends nothing; patchRefs |
| 17 | B | Tidy-ups found by the inventory, each its own commit: catch the `Retryable` rejection (unhandled after two failed tries); move the misplaced doc comment at L2092–2094 to `resolveCheatPlayer`; delete `DataQueue.remove` (never called, `remove` is never produced) | `npm test` |

## Done when

- `src/js/Engine/DataTransferClient.ts` is about 220 lines and no file under `src/js/Engine/Client/` is over 450.
- `test:client-transcript` exists and its fixture is unchanged from before step 1.
- `tests/engine/clientNotifications.ts` covers every notice key the client can send.
- No test reaches a `private` member through `as any`.
- `tsconfig.json` includes `src/js/Engine/**/*`.
