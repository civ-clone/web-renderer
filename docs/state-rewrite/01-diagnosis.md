# 01 — Diagnosis

What is actually wrong with the current renderer, with evidence. Read this
before touching anything; several of the "obvious" fixes are aimed at the wrong
layer.

## The headline

**The wire format is already normalised. The frontend throws that away on every
patch.**

The backend sends `{ hierarchy, objects }`, where `objects` is a flat
`id → plain object` map and every cross-entity link is a `{ '#ref': id }`
pointer (`node_modules/@civ-clone/core-data-object/DataObject.ts`, the module
level `toPlainObject`). That is a normalised entity store, delivered over the
wire, ready to use.

`src/js/UI/Renderer.ts:1101` then does this, on every patch flush:

```ts
data = reconstituteData(objectMap) as GameData;
```

`reconstituteData` (`src/js/UI/lib/reconstituteData.ts`) walks the entire
reachable graph and builds a **brand new denormalised object tree**, resolving
every `#ref` into a real object reference, using a `Map` to handle the cycles.
Nothing is reused between calls — every object in the graph is reallocated.

So the frontend takes a normalised store and, several times per turn, converts
it into a fully denormalised deep clone. That single line is the primary cost in
the frontend and the reason nearly every other frontend problem exists.

Going "state-based" is therefore mostly a matter of **deleting this step**, not
of inventing a new state model.

## Consequence 1 — cost is O(entire game state) per flush, not per change

`updateState` (`Renderer.ts:1099`) runs synchronously for every
`gameDataPatch` message. The backend flushes several times per turn: once on
turn start, once per handled player action, once per `unit:moved`, once per
cheat (`src/js/Engine/DataTransferClient.ts`, the `sendPatchData()` call sites).

Every one of those flushes rebuilds the whole graph, whether one tile changed or
a hundred cities did. The `objectMap` passes 5,000 entities well before the mid
game (that is the threshold the prune logic uses at `Renderer.ts:1118`), and each
of those entities becomes a fresh allocation per flush.

`docs/memory-growth-analysis-2026-07.md` §C2 identified this and proposed
coalescing reconstitution to once per frame. That helps, but it treats the
symptom: the correct number of full graph rebuilds is zero.

## Consequence 2 — object identity is destroyed every flush, which breaks logic

Because `reconstituteData` allocates fresh objects, **no object reference
survives a patch**. Any code that compares entities by identity across a patch
boundary is silently broken. Two live examples, both in `Renderer.ts`:

```ts
// Renderer.ts:1138 — inside the active-unit scoring reduce
const unitScore = unit === lastUnit ? 2 : portal.isVisible(...) ? 1 : 0;
```

```ts
// Renderer.ts:1161
if (lastUnit !== activeUnitAction?.value) {
  lastUnit = null;
}
```

`lastUnit` was captured from the *previous* graph. `unit` and
`activeUnitAction.value` come from the graph that was just rebuilt on line 1101.
They are never the same object, so:

- the `=== lastUnit ? 2` branch is unreachable — the "prefer the unit the player
  was just using" scoring never fires;
- the guard on 1161 always evaluates true, so `lastUnit` is reset to `null` on
  every single patch.

The "remember which unit the player was working with" feature is dead code in
practice. Nobody wrote it wrong; identity churn ate it. Stable entity identity
brings it back for free, and this is a concrete, testable behaviour change to
verify after Phase 2.

The same mechanism is behind the comment at `Renderer.ts:1092`, which records
that deferring `updateState` was tried on 2026-07-02 and reverted because it
"left `activeUnit` stale for ~1 frame and broke consecutive moves of multi-move
units". With a live store, reads always see current data and there is no stale
snapshot to be caught by — the constraint that forced the synchronous path
disappears.

## Consequence 3 — every downstream cache is defeated

Because the graph is new each time, downstream code cannot memoise anything:

- `world.setTiles(data.player.world.tiles)` (`Renderer.ts:1124`) rebuilds a
  coordinate `Map` of every tile in the world on every flush
  (`src/js/UI/components/World.ts`, `rebuildLookup`).
- `render()` (`Renderer.ts:997`) constructs `new GameDetails(...)`,
  `new PlayerDetails(...)`, `new UnitDetails(...)` and rebuilds both `Actions`
  panels from scratch, because it has no way to know what changed.
- The `Actions.#actions` map leak (`docs/memory-growth-analysis-2026-07.md` §A1)
  was severe precisely because each retained entry pinned a whole distinct graph.
  It is fixed, but the shape of the problem — "holding one entity holds a whole
  snapshot" — is inherent to denormalisation.

## Consequence 4 — change notification is coarse and goes through the DOM

Updates are announced by dispatching `CustomEvent`s on `document`:
`patchdatareceived` per patch entry and `dataupdated` after the rebuild
(`Renderer.ts:999`, `Renderer.ts:1288`). `DataObserver`
(`src/js/UI/DataObserver.ts`) subscribes to both, matches observed ids against
the patch payload, and calls back.

This works, but:

- it routes application state through global DOM events, so nothing is testable
  without a DOM and everything is implicitly coupled to `document`;
- the granularity is "an id you care about was touched", which is right, but the
  *response* is always "rebuild the entire window body" — see
  `src/js/UI/components/City.ts:406`, which re-runs `cityDetails(...)` in full;
- there is no way to express "recompute this derived value", only "something
  happened".

There are only six `DataObserver` call sites (`City`, `CityStatus`,
`HappinessReport`, `ScienceReport`, `TradeReport`, `UnitSelectionWindow`), so the
migration surface here is small.

## The backend half: patches are not deltas

`DataQueue` (`src/js/Engine/DataQueue.ts`) is a queue of
`{ type, index, value }` records where `value` is a full
`toPlainObject()` result. The dominant entries are whole-subtree snapshots:

```ts
// DataTransferClient.ts, turn start
this.#dataQueue.add(this.player().id(), () =>
  this.player().toPlainObject(
    this.#dataFilter(filterToReference(PlayerWorld, PlayerTile, Tile))
  )
);
```

`Player.toPlainObject` pulls in everything the `AdditionalDataRegistry` hangs off
a player — `cities`, `units`, `world`, `government`, `research`, `spaceship`,
`treasuries`, trade rates — and recurses. `filterToReference(PlayerWorld,
PlayerTile, Tile)` stops the world tiles being re-walked, but **every city and
every unit is fully re-serialised**, including each city's build options with
costs, its yields and improvements, and each unit's action lists.

So the "patch" sent at the start of every turn is a complete snapshot of the
player's half of the game. The same happens after every handled action
(`filterToReference(..., City)` there, so cities become refs, but all units are
still walked).

Three separate costs follow:

1. **Worker CPU** — the serialisation walk itself, per flush.
2. **Transport** — structured clone of the whole payload across the worker
   boundary, per flush.
3. **Frontend** — merging it into `objectMap`, then the full rebuild above.

Additionally:

- **No `remove` is ever emitted.** The only `DataQueue.remove` call is commented
  out (`DataTransferClient.ts:519`). The frontend map only shrinks via
  `pruneObjectMap`, a full reachability sweep on the main thread, gated on
  >5,000 objects and either a 5-turn cadence or 1.5× growth (`Renderer.ts:1118`).
- **`index` is a string path** (`units[3]`), applied by parsing and mutating
  (`Renderer.ts`, `setObjectPath` / `removeObjectPath`). It depends on array
  index stability between the two runtimes.
- **No version or ordering guarantee**, so a dropped or reordered flush cannot be
  detected, let alone recovered from.

## The rendering half: twelve world-sized canvases

`GamePortal` is constructed with 12 layers (`Renderer.ts:470`). Each layer is a
`Map` whose canvas is sized to the **whole world**
(`src/js/UI/components/Map.ts`, `setCanvasSize`):

```ts
this.#canvas.height = this.#world.height() * this.tileSize();
this.#canvas.width = this.#world.width() * this.tileSize();
```

For an 80×50 world at `tileSize 16 × scale 2` that is 2560×1600 per layer, about
16 MB of backing store, roughly **200 MB before the game starts**. `Portal.render`
then composites all visible layers into the viewport canvas, tiled for
wrap-around.

On top of that, `IntervalHandler` fires every 500 ms (`Renderer.ts:540`) and
runs a full `portal.render()` composite just to blink the active-unit marker.

This is documented as B2/C5 in `docs/memory-growth-analysis-2026-07.md` and is
the largest remaining fixed cost.

## The orchestrator

`src/js/UI/Renderer.ts` is 1,558 lines, and almost all of it is a single
`async init()` whose body is one closure: transport wiring, i18n setup, DOM
lookups, debug panel construction with inline styles, the memory testbed, the
stress runner, patch application, state derivation, the render pass, and every
keyboard binding. There are no seams, so nothing in it can be tested or replaced
in isolation. The file opens with a TODO saying exactly this.

## What is already fine

Do not rewrite these; they work and the plan depends on them.

- **The worker boundary.** Engine in a worker, UI on the main thread, typed
  channels. Keep it.
- **The `Transport` abstraction.** `Transport` / `AbstractTransport` /
  `ParentTransport` / `WorkerTransport` with disposers is a sound seam. Protocol
  v2 changes the payloads, not the abstraction.
- **The `#ref` normalised wire format.** It is the right shape. The bug is
  denormalising it on arrival.
- **The `_` / `__` type tags** and `instanceOf` / `instanceOfAll`. Cheap runtime
  type discrimination that survives serialisation. Keep.
- **`AssetStore`**, the extraction flow, IndexedDB caching, i18n, and the
  changelog/release machinery. Untouched by this work.
- **The map layer *drawing* code** (`Map/Land.ts`, `Map/Terrain.ts`, etc.). The
  per-tile drawing logic is fine; only what it draws *into* and what it reads
  *from* changes.
- **The debug harness.** `?debug=1`, `memoryTestbed`, `UIStressRunner` are how
  Phase 0 gets its baselines. Keep and extend.

## Summary of root causes

| # | Root cause | Fixed in |
| - | ---------- | -------- |
| 1 | Full graph denormalisation per patch flush | Phase 2 |
| 2 | Entity identity destroyed per flush | Phase 2 |
| 3 | Change notification via global DOM events | Phase 3 |
| 4 | Monolithic `Renderer.ts` with no seams | Phase 3 |
| 5 | Whole-subtree snapshots sent as "patches" | Phase 4 |
| 6 | No `remove` in the protocol; reachability sweeps instead | Phase 4 |
| 7 | String-path patch application | Phase 4 |
| 8 | Twelve world-sized canvases; full composite on a 500 ms tick | Phase 5 |
| 9 | `restart` / `quit` typed but unwired | Phase 6 |
