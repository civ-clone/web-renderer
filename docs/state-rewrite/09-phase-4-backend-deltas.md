# 09 — Phase 4: Backend Deltas

**Goal.** Stop sending a full snapshot of every city and every unit on every
turn and after every action.

**Depends on.** Phase 0 (fixtures). Independent of Phases 2, 3 and 5 — it can be
built in parallel, but its cutover commit must land after Phase 2, because the
frontend applier lives in the state layer.

**Risk.** Medium. The protocol is a contract between two bundles; get the diff
wrong and the frontend silently shows stale data. The mitigations below (the
shadow-audit in particular) exist because a *silent* wrong answer is the failure
mode to fear here, not a crash.

## The problem, precisely

`DataTransferClient` currently does this on every turn start:

```ts
this.#dataQueue.add(this.player().id(), () =>
  this.player().toPlainObject(
    this.#dataFilter(filterToReference(PlayerWorld, PlayerTile, Tile))
  )
);
```

`Player.toPlainObject` recurses through everything the `AdditionalDataRegistry`
attaches to a player — `cities`, `units`, `world`, `government`, `research`,
`spaceship`, `treasuries`, trade rates — and keeps going. The filter stops world
tiles being re-walked, but every city (with its build options and their costs,
its yields, its improvements) and every unit (with its action lists) is fully
re-serialised. That result is then structured-cloned across the worker boundary.

Three costs, per flush, several flushes per turn: the walk, the clone, and the
merge on the other side.

## Two steps

**4a** wraps the existing serialisation in a diff. Small, safe, and it removes
the transport and frontend costs entirely.

**4b** narrows the walk itself. Larger, and only worth doing if 4a's measurements
say the worker-side walk still matters.

Do 4a, measure, then decide on 4b.

## Step 4a — diff on send

### Land the protocol modules

Per [`04-protocol-spec.md`](./04-protocol-spec.md):

- `src/js/Engine/Protocol.ts`
- `src/js/Engine/ShadowState.ts`
- `src/js/Engine/DeltaBuilder.ts`
- `src/js/UI/State/applyDelta.ts`

Unit tests before wiring anything:

```ts
describe('ShadowState', () => {
  it('emits everything on first sight', ...);
  it('emits nothing when nothing changed', ...);
  it('emits only changed fields', () => {
    shadow.diff({ 'City-1': { _: 'City', id: 'City-1', name: 'A', size: 1 } });

    expect(
      shadow.diff({ 'City-1': { _: 'City', id: 'City-1', name: 'A', size: 2 } })
    ).toEqual({ 'City-1': { size: 2 } });
  });
  it('treats a ref array as changed only when the id list changes', ...);
  it('does not alias the caller\'s objects', () => {
    // mutate the input after diffing; the shadow copy must not follow
  });
});
```

That last one matters. `ShadowState` stores what it was sent; if it stores the
same object the engine still holds, the engine mutating it in place makes the
next diff see no change and the update is lost forever. Hence `structuredClone`
on store. If that shows up as a cost, replace it with a shallow clone per field —
values are refs, primitives, or small arrays of those — but do not remove it.

### Swap `DataQueue` for `DeltaBuilder`

`DataQueue.add` and `DataQueue.update` have identical bodies apart from a `type`
string that the frontend then used only to choose between assignment and path
mutation. With field-level deltas both collapse to `record(...)`.

```diff
-#dataQueue: DataQueue = new DataQueue();
+#deltas: DeltaBuilder = new DeltaBuilder();
```

Then, mechanically, at every call site:

```diff
-this.#dataQueue.update(playerTile.id(), () =>
-  playerTile.toPlainObject(this.#dataFilter(filterToReference(Player, City)))
-);
+this.#deltas.record(() =>
+  playerTile.toPlainObject(this.#dataFilter(filterToReference(Player, City)))
+);
```

The target-id argument goes away: `ShadowState` keys off `objects`, which
already contains every entity the walk produced. There are 34 live call sites —
10 `add` and 24 `update`, plus the one commented-out `remove`. List them with
`grep -n '#dataQueue\.' src/js/Engine/DataTransferClient.ts`.

**The three `add(..., index)` call sites need attention.** On `unit:created`
(`DataTransferClient.ts:373` to `:396`) v1 splices a ref into
`player.units[i]`, `playerTile.units[i]` and `city.units[i]`. With field-level
deltas there is no path: instead, re-serialise the *containers* so their `units`
arrays are diffed and re-sent whole:

```ts
this.#deltas.record(() =>
  this.player().toPlainObject(
    this.#dataFilter(filterToReferenceAllExcept(Player))
  )
);
this.#deltas.record(() =>
  playerTile.toPlainObject(this.#dataFilter(filterToReference(Player, City)))
);
```

The `units` array is a list of refs; sending it whole is a few dozen bytes and
the index-stability assumption disappears with it.

### `sendPatchData`

```ts
private sendPatchData(): void {
  if (!this.#deltas.hasChanges()) {
    return;
  }

  this.#deltas
    .flush()
    .forEach((delta) => this.#transport.send('gameDataPatch', delta));
}
```

Note the early return. Today `sendPatchData()` sends an empty array whenever the
queue is empty, which happens often — the `unit:moved` handler calls it
unconditionally. Skipping empty flushes removes a per-move round trip on its own.

### `sendInitialData`

```ts
private sendInitialData(): void {
  const root = new TransferObject(this.player(), turnInstance, yearInstance);

  this.#deltas.setRoot(root.id());
  this.#deltas.record(() =>
    root.toPlainObject(
      this.#dataFilter(filterToReference(PlayerWorld, PlayerTile, Tile))
    )
  );

  const [first, ...rest] = this.#deltas.flush();

  this.#transport.send('gameData', first);
  rest.forEach((delta) => this.#transport.send('gameDataPatch', delta));

  this.#sentInitialData = true;
}
```

The world tiles are `filterToReference`d out of the root walk, exactly as today,
and arrive through the existing per-tile `record` calls.

### Emit removes

Add `del` at these engine events. This is the part that stops the frontend store
growing without bound, so it is not optional.

```ts
engineInstance.on('unit:destroyed', (unit: Unit) => {
  this.#deltas.remove(unit.id());
  // plus a re-record of the tile and city whose `units` arrays shrank
});
```

| Event | Remove | Also re-record |
| ----- | ------ | -------------- |
| `unit:destroyed` | unit id | its tile, its city (if any), the player |
| `city:destroyed` | city, its `CityBuild`, its `CityGrowth` | the player, the tile |
| `city:captured` (ours) | the real city | the player; the `UnknownCity` wrapper is sent instead |
| negotiation end | the negotiation and its interactions | — |

Uncomment and adapt the dead line at `DataTransferClient.ts:519` while you are
in `city:captured`.

### The shadow audit — the safety net

The diff is only correct if `record` is called for everything that changed. A
missed call means the frontend keeps stale data, silently, possibly for the rest
of the game. Catch it in debug mode:

```ts
// Debug only. Serialises everything and compares against the shadow.
private auditShadow(): void {
  const { objects } = this.player().toPlainObject(this.#dataFilter()),
    missed = this.#deltas.auditAgainst(objects);

  if (missed.length > 0) {
    console.warn('shadow audit: stale entities', missed);
    this.#transport.send(
      'notification',
      `shadow audit: ${missed.length} stale`
    );
  }
}
```

`auditAgainst` diffs without recording, returning the ids that differ. Call it
at end of turn under `engine.option('debug')`. **Run a full stress session with
the audit on and get it to zero before considering this step done.** It is the
difference between "the diff looks right" and "the diff is right".

### Frontend side

Replace `applyV1Snapshot` / `applyV1Patches` with `DeltaApplier`, handle
`more` chunking, and wire the `resync` channel:

```ts
const applier = new DeltaApplier(store, (since) =>
  transport.send('resync', { since })
);

let pending = new Set<EntityId>();

transport.receive('gameDataPatch', (delta: Delta) => {
  const touched = applier.apply(delta);

  touched.forEach((id) => pending.add(id));

  if (delta.more) {
    return;
  }

  subscriptions.notify(pending);
  pending = new Set();
});
```

Backend side of `resync`: reset the shadow, re-serialise everything, send one
delta with `root` set.

### Cutover

Steps 4a-backend and 4a-frontend **land in the same commit**. Both bundles ship
from the same `dist/`; there is no value in supporting v1 and v2 at once.

Delete in that commit:

- `src/js/Engine/DataQueue.ts`
- `src/js/UI/State/legacy/` (keep a copy under `tests/legacy/` — the Phase 0
  fixtures are v1 and the golden test still needs to read them until v2 fixtures
  are recorded)
- the `DataPatch` types from `src/js/UI/types.d.ts`

Then re-record all fixtures in v2 and delete `tests/legacy/`.

## Step 4b — narrow the walk

Only if 4a's measurements show the worker-side serialisation still costing.

The idea: stop walking the whole player. Serialise the player with everything
referenced out, and separately serialise only the entities the engine events say
changed.

```ts
// Turn start, after 4b
this.#deltas.record(() =>
  this.player().toPlainObject(
    this.#dataFilter(filterToReferenceAllExcept(Player, Civilization))
  )
);

// plus, per changed entity, recorded by the event handlers that already exist
this.#changedThisFlush.forEach((entity) =>
  this.#deltas.record(() => entity.toPlainObject(this.#dataFilter(...)))
);
```

This is safe because a `{ '#ref': id }` to an unchanged entity resolves fine
against the frontend store — that entity is already there and has not moved.
That property is exactly what the normalised store buys.

The risk is an entity that changed without an engine event to announce it.
Derived values are the danger: a yield rule whose output changes because
something else did. **The shadow audit from 4a is the detector**; leave it in and
run a full stress session before shipping 4b.

If the audit finds a category of misses with no corresponding event, the honest
answer is to keep serialising that subtree in full and note it here. A correct
larger delta beats a smaller wrong one.

## Measurements

| Metric | Phase 0 baseline (t150) | After 4a | After 4b | Target |
| ------ | ----------------------- | -------- | -------- | ------ |
| `transport.receive` mean bytes | | | | 95% reduction |
| `transport.receive` max bytes | | | | under 256 KB per chunk |
| Messages per turn | | | | fewer (empty flushes gone) |
| Worker serialisation mean ms | | | | 4a: unchanged. 4b: large drop |
| Frontend delta apply mean ms | | | | under 2 |
| `store.size()` growth per 50 turns | | | | flat once `del` lands |
| Shadow audit misses per session | n/a | 0 | 0 | 0 |

## Definition of done

- [ ] `Protocol.ts`, `ShadowState.ts`, `DeltaBuilder.ts`, `applyDelta.ts` exist
      with unit tests.
- [ ] All 34 `dataQueue` call sites converted; the three `index` sites converted
      to container re-records.
- [ ] `del` emitted for all four cases in the table.
- [ ] `resync` implemented on both sides, with a test that forces a gap.
- [ ] Chunking works; a test replays a chunked batch and gets one `notify`.
- [ ] Shadow audit reports zero misses over a full stress session.
- [ ] `DataQueue.ts` and the v1 adapter are deleted from `src/`.
- [ ] `store.size()` is flat across 50 turns of stress play.
- [ ] Fixtures re-recorded in v2; `tests/legacy/` deleted.
- [ ] The measurement table is filled in.

## Notes for the executor

- **Correctness before size.** If unsure whether something changed, re-record
  it. A delta that is larger than necessary is a performance question; a delta
  that is missing a field is a bug the player will hit and you will not be able
  to reproduce.
- The `equalField` comparison is on the hot path. If it shows up in a profile,
  the fix is a cheaper representation (ref arrays compared by joined id string),
  not skipping the comparison.
- Keep the shadow audit in the shipped bundle behind the debug option. It costs
  nothing when off and it is the only tool that finds this class of bug.
