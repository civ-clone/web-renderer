# 13 — Splitting `DataTransferClient`

## As built (2026-10-21)

Every step landed on 2026-10-21, each its own PR with a clean-context review before merging (#449). This is the
worker-side counterpart of [`08-phase-3-subscriptions.md`](./08-phase-3-subscriptions.md); the two ran in parallel.
The plan from here down is kept as it was agreed (#468; line numbers from `main` at `18f28b0`). Where it turned out
wrong or incomplete, the correction is listed below and marked in the text as *(as built: correction N)*. The
reviews' other notes (test gaps, stale comments) are collected in #503.

### PR per step, and the tests each added

| # | PR | Tests added |
| --- | --- | --- |
| 0 | #498 | `tests/engine/clientTranscript.ts` (`test:client-transcript`, and `test:client-transcript:update`): 197 messages on 11 channels over 20 turns, against `tests/engine/fixtures/client-transcript.json` |
| 1 | #498 | `tests/engine/clientRefs.ts` (`test:client-refs`, 25 checks) |
| 2 | #505 | `tests/engine/hasMet.ts` (`test:has-met`, 6 checks) |
| 3 | #505 | `checkEntries()` in `tests/engine/topCities.ts`; `checkPlainData()` in `tests/engine/civilizationScore.ts` |
| 4 | #511 | `tests/engine/clientActionsState.ts` (`test:client-actions-state`, 38 checks) |
| 5 | #514 | `tests/engine/clientVisibilityFilter.ts` (`test:client-visibility-filter`, 16 checks) |
| 6 | #518 | `tests/engine/clientPlayerPatches.ts` (`test:client-player-patches`, 10 checks) |
| 7 | #521 | `tests/engine/clientCityNews.ts` (`test:client-city-news`, 24 checks) |
| 8 | #525 | `tests/engine/clientNotifications.ts` (`test:client-notifications`, 97 checks over the 51 keys the tables can make) |
| 9 | #530 | none: none of the moved listeners is pure, so the transcript and the named suites are the proof |
| 10 | #534 | none: nothing moved is pure |
| 11 | #523 | `tests/engine/clientCheats.ts` (`test:client-cheats`, 16 checks); a ModifyUnit case in `tests/engine/cheats.ts` |
| 12 | #531 | none |
| 13 | #536 | `tests/engine/clientHandleAction.ts` (`test:client-handle-action`, 65 checks, including the microtask counts); a LaunchSpaceship case in `tests/engine/sellImprovement.ts` |
| 14 | #537 | `tests/engine/clientTurnHandover.ts` (`test:client-turn-handover`, 25 checks, including the microtask counts and `automation.enabled` read live) |
| 15 | #538 | none (`ts:compile`) |
| 16 | #541 | `tests/engine/clientDispose.ts` (`test:client-dispose`) |
| 17 | #539 | none |

Every pure step left the transcript fixture byte-identical, checked without `--update`. The fixture was regenerated
twice in that time, by features rather than steps: the twelve new civilizations (`5668a93`, #466) and the new
civilization colours (`1e86273`, #540); no step changed it.

### The modules, as they are

Lines from `wc -l` at the head of #541 (`581b2bc`). All under `src/js/Engine/Client/` except the `lib/` files.

| Module | Lines | Planned |
| --- | ---: | ---: |
| `refs.ts` | 53 | 70 |
| `standIns.ts` | 63 | 70 |
| `registerAdditionalData.ts` | 32 | 20 |
| `ActionsState.ts` | 108 | 110 |
| `visibilityFilter.ts` | 214 | 200 |
| `PlayerPatches.ts` | 422 | 330 |
| `Notifier.ts` | 61 | 60 |
| `cityNews.ts` | 134 | 120 |
| `notifications/{city,unit,diplomat,player}.ts`, `registerNotifications.ts`, `NotificationContext.ts` | 160 + 88 + 107 + 156 + 93 + 26 = 630 | 450 |
| `events/patchEvents.ts` | 392 | 330 |
| `Talks.ts` | 232 | 150 |
| `ChoicePrompt.ts` | 85 | 70 |
| `diplomatEvents.ts` | 103 | 90 |
| `handleAction.ts`, `actions/{unit,city,player}.ts`, `actions/ActionContext.ts` | 143 + 79 + 174 + 127 + 30 = 553 | 360 |
| `TurnHandover.ts` | 291 | 200 |
| `cheats.ts` | 283 | 200 |
| `requests.ts` | 161 | 110 |
| `gameEnd.ts` | 143 | 120 |
| `Automation.ts` | 57 | 40 |
| `ClientContext.ts` (types), `registries.ts` (the singletons) | 102 + 51 | (types only) |
| `DataTransferClient.ts` (composition root) | 281 | 220 |
| `lib/hasMet.ts` | 43 | 40 |
| `lib/topCities.ts`, `lib/civilizationScore.ts` (extended) | 175, 50 | +90 |

`DataTransferClient.ts` plus the 30 files under `Client/` come to 4,451 lines, against 3,080 in one file.

**The composition root is 281 lines, not about 220,** and it got there late. Through step 14 each registrar took
a context of its own, built in the constructor from the registry singletons (`player: () => this.player()` ten
times), so after step 14 the file was still 398 lines: about 200 of them building contexts and about 75 imports.
The shared `ClientContext` the plan sketches under Target modules was not introduced by any move; it is a design
change that alters every registrar's signature, so it was paired with step 16's disposers (#537 review). Step 16
(#541) builds one context object once, which took the file to 253 lines, and `dispose()` brought it to 281. What is
left is about 50 import lines, the context literal, and the one-line delegations (`setAutomationEnabled` for `Game.ts`; `flush()`,
`initialData()`, the serialisers and `topCities` for tests). Each module
still declares what it reads as a `Pick<ClientContext, …>` (`CheatsContext`, `RequestsContext`, …), so its unit
tests can hand it a plain object.

### "Done when", against what landed

- **Not met:** `DataTransferClient.ts` is 281 lines, not about 220 (see above).
- **Met:** no file under `Client/` is over 450 lines (the largest is `PlayerPatches.ts`, 422); `test:client-transcript`
  exists and no step changed its fixture; `tests/engine/clientNotifications.ts` covers every key the notification
  tables can send (the four city-news notices are covered by `tests/engine/clientCityNews.ts`); no test reaches a
  `private` member through `as any` (the one cast left, in `clientTurnHandover.ts`, passes a truthy non-boolean to
  the public `setAutomationEnabled`); `tsconfig.json` includes `src/js/Engine/**/*` (#498).

### Corrections to the plan

1. **Constraint 2 overcounted what was private and undercounted the call sites.** `serialiseCity` and `topCities`
   were public, not TS-`private`; only `sendPatchData` and `sendInitialData` were. `sendPatchData` was called from
   11 sites in 9 test files, not 10 in 8. Step 15 replaced 14 casts (11 `sendPatchData`, 1 `sendInitialData`, and
   two needless casts to the public `serialiseCity` and `player()`), not 12, and dropped `sender`/`receiver` from 28
   constructor calls (`Game.ts` and 27 in 26 test files), not 22.
2. **Step 1: the `registerAdditionalData` import goes last, not at the top,** so that registering still follows the
   evaluation of every other import, as it did when it was part of the file.
3. **Step 7 and step 14: `#holdsNotifications` reads `#automationEnabled` and `#handedOver` live.** The predicate the
   `Notifier` is held by must read both (and the current player) each time a notification is given, never a copy;
   it is now `TurnHandover.holdsNotifications()`, and `clientTurnHandover.ts` pins the live reads.
4. **Constraint 9: the `hold` microtask gap (#518).** `PlayerPatches.hold(fn)` is `async`, so the action listener's
   post-action sends go one microtask later than before step 6: on tick 4 after an `ActiveUnit` (was 3) and tick 2
   after `EndTurn` (was 1). Nothing runs in the gap. Step 14 measured a synchronous release handle, which would
   restore the old timing but move every post-action send one microtask earlier than `main`, and kept `main`'s
   behaviour: the gap is explained above the `hold` call in `TurnHandover.ts` and pinned at 4 and 2 (#537).
5. **Constraint 9 and step 17: `Retryable` was deleted rather than caught** (#539, #478), with `Error/RetryFailed`.
   Its only use was the `playerTile === null` branch of `player:visibility-changed`, which cannot run: the engine
   adds the `PlayerTile` before it processes the `VisibilityChanged` rule. The branch now warns and returns (#539). Step 17's
   `resolveCheatPlayer` comment item was already done in step 11.
6. **Step 11: `validCreateUnit(value, world, unitTypes)`** takes the unit types as a third parameter.
7. **Step 13: the dispatcher.** `ReassignWorkers` is matched by name, with End Turn, before the lookup, not through
   the class table. The "13 branches" are 12 branches over 13 classes (`CityBuild` and `ChangeProduction` share
   one), so the table has 13 entries and 12 handlers. `handleAction` and the client's wrapper must not be `async`:
   an `async` function returning the handler's promise settles two microtasks later and releases the flush hold
   later with it. `clientHandleAction.ts` fails on either.
8. **Step 8: 66 listeners, not 58.** Eight mixed listeners were split into a patch half and a notice half: the seven
   the plan lists and `player:defeated` (our own destruction's ending, and another civilization's notice). Every
   later count of engine listeners, including step 16's `engine.off` calls, is 66.
9. **Step 10: `Talks` and `ChoicePrompt` have different shapes.** `Talks` exposes `pending`, `meetWithKing(other)`,
   `meetNeighboursOf(unit)`, `handOver()` and `talkToPlayersMet()`, not a generic `chain(fn)`/`afterAction()`: a
   generic chain cannot keep Meet with King's trailing `.then(() => {})`, and an `async` `afterAction()` adds a
   microtask to the action path. `ChoicePrompt` is a class per client, not a free `promptChoice` function, because
   a module-level pending prompt would be shared by every client.
10. **Step 16: no client is ever replaced,** so `Game.ts` needs no `dispose()` call. `Game#createClient` makes the
    human's client on `engine:start`, or once on `load`, which the UI sends only from a fresh worker. `patchRefs`'
    second client is disposed after its check, though no engine event reached it before the run exits.
11. **The registrars' signatures are not uniform.** There is no `Registrar` type: `registerCheats` and
    `registerRequests` take `(transport, ctx)`; `registerTalkEvents`, `registerPatchEvents`,
    `registerDiplomatEvents`, `registerGameEnd` and `registerNotifications` take `(engine, ctx)`; and
    `registerTurnHandoverEvents` takes `(engine, turnHandover)`. Each returns a `Disposer`.
12. **The transcript covers notifications thinly.** Its game sends one prompt and one notification and never
    constructs a `Retryable` (#498 review), so steps 7, 8, 10 and 14 leaned on their named suites (`cityNews`,
    `turnHandover`, `diplomats`, `oneFlushPerAction`, and the new unit tests) as much as on the transcript. It
    compares messages as JSON, so an `undefined`, `Infinity` or `NaN` difference is invisible to it. No suite caught
    a microtask regression on the talks path until steps 13 and 14 added tick-counting tests (#534 review).

---

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
| Action handling: `handleAction`, 13 branches *(as built: correction 7)* | L1757–2090 | ~330 |
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
2. **Tests reach TS-`private` members by name** *(as built: correction 1)*: `sendPatchData` (10 call sites in 8 files), `sendInitialData`
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
9. **Timers** *(as built: corrections 4 and 5)*. The hand-over `setTimeout(1)`, the resolve `setTimeout(10)`, `Retryable` (20 ms × 2, with an unhandled
   rejection after two failures) and the city-news `queueMicrotask`. `turnHandover` asserts notices arrive after
   `turnStarted`; `cityNews` asserts one notice per city per engine call.

## Target modules

All under `src/js/Engine/Client/` except the pure libs in `src/js/Engine/lib/`. No module imports
`DataTransferClient`. Each registrar takes a `ClientContext` and returns a disposer *(as built: see "The composition
root" above, and correction 11)*.

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
| `Client/TurnHandover.ts` | turn hand-over | `takeTurn()`, `sendInitialData()`, `handedOver` *(as built: and `holdsNotifications()`, correction 3)*; the `action` relay, `turnStarted`/`turnEnded`/`actionHandled`/`unitHalted`, held halts | no (timers) | 200 |
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

| # | Kind | Step | Proved by | PR |
| --- | --- | --- | --- | --- |
| 0 | test | **Client transcript fixture.** `tests/engine/clientTranscript.ts`, run by `tools/run-suite.js` (`test:client-transcript`; `npm run test:client-transcript:update` rewrites the fixture): a seeded game with a human client driven by a small script (the `turnHandover` setup plus a move, found a city, change production, research, rates, revolution), each cheat (RevealMap, GrantGold, CreateUnit) and each request (topCities, civilizationScore, intelligence, cityBuildAvailable, unitActions). It records every `send(channel, JSON(plain))` in order and compares a hash per channel and a whole-sequence hash with `tests/engine/fixtures/client-transcript.json`. Ids are per-class counters and the RNG is seeded, so the output is deterministic | two consecutive runs give the same hash. Every P step below leaves the fixture byte-identical. If a `Retryable` makes the cross-timer order unstable, hash each flush's content separately from the order | #498 |
| 1 | P | `Client/refs.ts`, `Client/registerAdditionalData.ts` (imported for its side effect at the top of DTC *(as built: last, correction 2)*), `standIns.ts`, `notifications/diplomat.ts` (`sabotagedBuildKind`). Widen `tsconfig.json` `include` to `src/js/Engine/**/*` so pure modules used only by tests are type-checked (#339). `tests/engine/clientRefs.ts` | transcript, patchRefs | #498 |
| 2 | P | `lib/hasMet.ts` with injected registries and a plain-data test like `intelligence.ts`'s | respawn, topCities, gameEnd, transcript | #505 |
| 3 | P | `topCitiesEntries` and `civilizationScore` into `lib/`; DTC delegates | topCities, civilizationScore, gameEnd | #505 |
| 4 | P | `ActionsState` + `diffActions` (moves `#heldActions`, `#heldActionKeys`, `#heldMandatoryActions`, `#serialisingActions`, `#unitWithActions`, `#answeringUnitActions`), with a `diffActions` unit test | patchRefs (action lists sent/held, #411 parity), goToArrival, transcript | #511 |
| 5 | P | `visibilityFilter.ts` + serialisers; DTC keeps `serialiseTile/Unit/City/Player` as delegations | patchRefs (#46/#328/#130/#138 checks), sellImprovement, civilDisorder, transcript | #514 |
| 6 | P | `PlayerPatches`: owns `DataQueue`, `#queued`, `#queuedTiles`, `#holdingFlushes` (as `hold(fn)`), the send-once helpers, `governmentChanged` and `flush()`. DTC's `sendPatchData()`/`sendInitialData()` stay as private-named delegations for the 11 test call sites | oneFlushPerAction, patchRefs, joinCity, tradeRoutes, transcript | #518 |
| 7 | P | `Notifier` + `cityNews`, with a `cityNewsNotifications` unit test | cityNews, turnHandover (notices after `turnStarted`), transcript | #521 |
| 8 | P | Notification tables. Split each mixed listener (`city:captured`, nuclear, trade route, building-complete, research-complete, obsolete, goody hut; *as built: and `player:defeated`, correction 8*) into a patch half and a notice half, registered in today's order, patch half first. Notices go out at once and patches only at a flush, and no listener among these flushes, so the wire is unchanged. `tests/engine/clientNotifications.ts` covers every key, including the 16 untested families | transcript, pollution, nuclear, diplomats, respawn, improvementObsolete, futureTechnology, tradeRoutes | #525 |
| 9 | P | `events/patchEvents.ts`, registered in the same relative order | civilDisorder, nuclear, joinCity, roadTo, terrainJob, patchRefs, transcript | #530 |
| 10 | P | `Talks` + `ChoicePrompt` + `diplomatEvents` *(as built: correction 9)* | diplomats (MeetWithKing, embassy, investigate), goToArrival, turnHandover, oneFlushPerAction, transcript | #534 |
| 11 | P | `cheats.ts` *(as built: correction 6)*, with validator unit tests and a ModifyUnit case (untested today) | cheats, patchRefs (RevealMap), transcript | #523 |
| 12 | P | `requests.ts` + `gameEnd.ts` | topCities, civilizationScore, intelligence, gameEnd, respawn, patchRefs, goToArrival, ui hallOfFame, transcript | #531 |
| 13 | P | `actions/*` handler table and `findPlayerAction` *(as built: correction 7)*; add a LaunchSpaceship case (untested today) | patchRefs (12 of 13 action kinds), sellImprovement, autoProduction, standingOrders, terrainJob, joinCity, tradeRoutes, diplomats, transcript | #536 |
| 14 | P | `TurnHandover` + `Automation`; DTC becomes the composition root | turnHandover, oneFlushPerAction, patchRefs (automated every 4th turn), goToArrival, standingOrders, transcript | #537 |
| 15 | B (API) | Public test hooks *(as built: correction 1)*: replace the 12 `(client as any).sendPatchData()` / `sendInitialData()` / `serialiseCity()` uses with a documented public `flush()` / `initialData()`; drop the dead `sender`/`receiver` constructor parameters (touches `Game.ts` and the 22 test constructors). No runtime change | `ts:compile`, every bundle builds, `npm test` | #538 |
| 16 | B | `dispose()` *(as built: with the shared `ClientContext`; corrections 8 and 10)*: registrars return disposers (`engine.off` for the 58 listeners, the transport disposers for the 12 receivers, the pending choice); `Game.ts` disposes a replaced client; `patchRefs`' second client (L811) disposes after its check | a new test that after `dispose()` an engine event sends nothing; patchRefs | #541 |
| 17 | B | Tidy-ups found by the inventory, each its own commit *(as built: correction 5)*: catch the `Retryable` rejection (unhandled after two failed tries); move the misplaced doc comment at L2092–2094 to `resolveCheatPlayer`; delete `DataQueue.remove` (never called, `remove` is never produced) | `npm test` | #539 |

## Done when

- `src/js/Engine/DataTransferClient.ts` is about 220 lines and no file under `src/js/Engine/Client/` is over 450.
- `test:client-transcript` exists and its fixture is unchanged from before step 1.
- `tests/engine/clientNotifications.ts` covers every notice key the client can send.
- No test reaches a `private` member through `as any`.
- `tsconfig.json` includes `src/js/Engine/**/*`.
