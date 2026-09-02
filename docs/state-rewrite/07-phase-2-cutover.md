# 07 — Phase 2: Cutover

**Goal.** Delete `reconstituteData` from the runtime. Components read live views
instead of a denormalised snapshot.

**Depends on.** Phase 1 (golden test green).

**Risk.** Medium. This is the load-bearing change. It is also, deliberately, a
small diff — the whole point of the view design is that reading code does not
have to change.

**Why it is a drop-in.** A view walks exactly like the object it replaces:
`data.player.cities[0].build.available[3].cost.value` resolves identically. So
the change is to what `data` *is*, not to the roughly ninety files that read it.

## The change, in one line

```diff
-data = reconstituteData(objectMap) as GameData;
+// `data` is now a live view; it never needs reassigning.
```

Everything below is the consequence of that.

## Step 1 — swap the state source in `Renderer`

Still one file, still one closure. Split it in Phase 3; do not do both at once.

```ts
// near the top of init()
const { store, views, subscriptions } = createState();
```

In the `gameData` handler, replace the `objectMap` bootstrap:

```ts
transport.receiveOnce('gameData', (_data, rawData) => {
  const touched = applyV1Snapshot(store, rawData as ObjectMap);

  // `data` was `let data: GameData`, reassigned per patch. It is now a
  // const live view and is never reassigned again.
  const data = views.root<GameData>()!;

  subscriptions.notify(touched);
  // ...the rest of the existing setup, unchanged
});
```

In the `gameDataPatch` handler, replace the patch-application block and the
reconstitution:

```ts
transport.receive('gameDataPatch', (patches: DataPatch[]) => {
  const touched = applyV1Patches(store, patches);

  updateState(touched);
});
```

`updateState` loses its first two jobs and keeps the rest:

```ts
const updateState = (touched: ReadonlySet<EntityId>): void => {
  // GONE: data = reconstituteData(objectMap)
  // GONE: the prune block — see step 4
  // GONE: world.setTiles(...) — see step 3

  currentTurn = Number(data?.turn?.value ?? 0);
  currentObjectCount = store.size();

  const activeUnits = selectActiveUnitActions(store);
  // ...active-unit selection, unchanged in shape — see step 2
  subscriptions.notify(touched);
  scheduleRender();
  // ...autoEndOfTurn check, unchanged
};
```

## Step 2 — the active-unit logic starts working

`Renderer.ts:1138` and `:1161` compare `lastUnit` against units from the
freshly rebuilt graph. Those comparisons never matched (see
[`01-diagnosis.md`](./01-diagnosis.md) §Consequence 2). With stable view
identity they start matching, and the code does what it was written to do.

**Change nothing here.** Leave the comparisons exactly as they are and verify
the behaviour change:

- Select a unit with more than one movement point among several active units.
- Move it one tile.
- The same unit must stay active rather than the selection jumping elsewhere.

That was the intent of the `unit === lastUnit ? 2 : ...` scoring all along. If
it does *not* work after cutover, the view identity cache is broken — check that
`views.view(id)` is not being recreated per call.

Once verified, delete the comment at `Renderer.ts:1092` about deferring
`updateState`. The hazard it describes — a stale snapshot for one frame — cannot
occur against a live store, so the constraint that forced the synchronous path
is gone. **Do not actually defer `updateState` in this phase**; note the freedom
and take it in Phase 3 with the render split.

## Step 3 — `World` reads snapshots, not the graph

`World` currently takes `data.player.world.tiles` and rebuilds a string-keyed
coordinate `Map` on every flush (`Renderer.ts:1124`, `World.ts` `rebuildLookup`).

Replace with the `selectTileSnapshots` selector from Phase 1. Because it is
memoised on the tile entities' versions, it rebuilds only when tiles actually
change, and the map layers get plain objects instead of proxies — which is
required, not merely nicer (see [`02-architecture.md`](./02-architecture.md)).

```ts
// src/js/UI/components/World.ts
export class World {
  #snapshots: readonly (TileSnapshot | undefined)[] = [];
  #width = 0;
  #height = 0;

  get(x: number, y: number): TileSnapshot {
    const wrappedX = ((x % this.#width) + this.#width) % this.#width,
      wrappedY = ((y % this.#height) + this.#height) % this.#height;

    return (
      this.#snapshots[wrappedY * this.#width + wrappedX] ??
      unknownTile(wrappedX, wrappedY)
    );
  }

  setSnapshots(snapshots: readonly (TileSnapshot | undefined)[]): void {
    this.#snapshots = snapshots;
  }
  // getNeighbour, width, height unchanged
}
```

Two wins beyond the memoisation: integer indexing replaces
`[x, y].toString()` key construction on every lookup, and the `while` loops in
`get` become modulo. `Map/Land.ts` alone does eight neighbour lookups per tile,
so this is on the hottest path in the renderer.

`unknownTile` is the existing `#unknown` factory, reshaped to `TileSnapshot`.
Keep it — fog-of-war depends on it — but hoist the returned object to a module
constant per coordinate-free shape and set `x`/`y` on a clone, rather than
allocating a full literal per miss.

## Step 4 — delete the pruning machinery

With the store, `objectMap` no longer exists, so nothing accumulates in it.
Entities still accumulate in the store until Phase 4 adds `del`, but the
reachability sweep was compensating for a data structure that is now gone.

Delete:

- `src/js/UI/lib/pruneObjectMap.ts`
- the prune block at `Renderer.ts:1110` to `:1122`
- `lastPrunedTurn`, `lastPrunedObjectCount`

Keep `currentObjectCount = store.size()` so the debug export still reports it.
**Expect `store.size()` to grow monotonically until Phase 4.** That is known and
temporary; the growth rate is far below what the old graph rebuilds cost, but
note the numbers so Phase 4 can show them flattening.

If a long soak between Phase 2 and Phase 4 is a problem, add a debug-only sweep
on a keypress. Do not put it back in the render path.

## Step 5 — `DataObserver` keeps working, briefly

`DataObserver` listens for `patchdatareceived` and `dataupdated` on `document`.
Six components use it. Keep both events firing in this phase so those components
are untouched:

```ts
// in updateState, after subscriptions.notify(touched)
document.dispatchEvent(
  new CustomEvent('patchdatareceived', {
    detail: { value: { objects: Object.fromEntries([...touched].map((id) => [id, true])) } },
  })
);
```

`DataObserver` only tests `id in objects`, so a boolean stand-in satisfies it.
This is scaffolding with a one-phase lifetime — mark it
`// TODO(phase-3): delete with DataObserver` so it cannot be mistaken for
design.

`dataupdated` still fires from `render()`, carrying `data` — now the root view.
Components reading `data.player.cities` off the event work unchanged.

## Step 6 — delete `reconstituteData`

Once the game plays:

1. Delete `src/js/UI/lib/reconstituteData.ts`.
2. Move its `ObjectMap` / `PlainObject` / `ObjectStore` types into
   `src/js/UI/State/legacy/types.ts` — `Transport.ts` and the v1 adapter still
   need them until Phase 4.
3. Remove the reconstitution from `WorkerTransport.receive` and `receiveOnce`.
   Handlers now get the raw payload, which is what every remaining caller
   already wanted:

```ts
const listener = ({ data: { channel: receivingChannel, data } }) => {
  if (channel !== receivingChannel) {
    return;
  }

  handler(data, data);
};
```

`gameNotification` is the one channel that relied on the transport
reconstituting for it (notifications are serialised standalone with
`#dataFilter()` and no reference indirection — see
`memory-growth-analysis-2026-07.md` §C4, and the note there explaining why
`filterToReference` was deliberately *not* used). Check `Notifications.receive`
and `NotificationWindow`: if the payload has a `hierarchy` key, resolve it once
at the call site with a small local helper rather than reinstating
reconstitution in the transport.

**Verify with a grep before committing:**

```bash
grep -rn "reconstituteData\|pruneObjectMap\|objectMap" src/js/ | grep -v State/legacy
```

Only `State/legacy` should match.

## What to test

### Automated

- The full Phase 1 golden test suite still passes.
- A new integration test: replay `turns-150` into a real `EntityStore`, then
  assert every selector used by the HUD returns sane values — a non-empty player
  name, a positive turn number, cities with names, units with tiles.
- A regression test for identity:
  `views.view(unitId) === selectActiveUnitActions(store)[0].value` for the same
  unit.

### Manual — the checklist that matters

Run a real game with assets and confirm:

- [ ] Main menu, new game and the welcome window appear.
- [ ] The map draws, terrain and units are correct, fog behaves.
- [ ] Scrolling and click-to-centre work.
- [ ] A unit moves; the map updates; the active unit stays selected through a
      multi-move (the step 2 behaviour change).
- [ ] `w` cycles active units.
- [ ] End turn advances the year; auto-end-of-turn still fires.
- [ ] The city window opens, shows current data, and **updates live** while
      open when production changes.
- [ ] Each report opens and shows current data: F1 city status, F4 happiness,
      F5 trade, F6 science.
- [ ] Choosing research and changing production both work.
- [ ] A `chooseFromList` prompt appears and resolves (found a city near a hut).
- [ ] Notifications appear.
- [ ] The minimap tracks the viewport.
- [ ] `?debug=1` panel, exports and stress runner still work.

### Numbers to record

Re-run the Phase 0 baseline method and fill in:

| Metric | Phase 0 baseline (t150) | After Phase 2 | Target |
| ------ | ----------------------- | ------------- | ------ |
| `reconstitute` mean ms | | 0 (gone) | 0 |
| `applyPatches` mean ms | | | under 5 |
| `render` mean ms | | | no worse |
| `setTiles` mean ms | | | near 0 |
| `usedJSHeapSize` after GC | | | materially lower |
| Long frames per turn | | | fewer |

`render` staying flat is expected — it still rebuilds panels imperatively.
Phase 3 fixes that. If `render` gets *worse*, a hot loop is reading through
views where it should read snapshots; find it with the metrics before moving on.

## Definition of done

- [ ] `reconstituteData.ts` and `pruneObjectMap.ts` are deleted.
- [ ] `WorkerTransport` no longer reconstitutes.
- [ ] The grep above matches only `State/legacy`.
- [ ] Golden and integration tests pass.
- [ ] The full manual checklist passes.
- [ ] The numbers table is filled in.
- [ ] The multi-move active-unit behaviour is confirmed fixed.

## Notes for the executor

- **This phase does not restructure `Renderer.ts`.** It stays a 1,400-line
  closure and that is correct for now. Doing the state swap and the file split in
  one change makes a regression impossible to bisect.
- If a component breaks, the cause is almost always one of two things: it
  mutated the graph (views throw — fix the mutation, it was always a bug), or it
  cached a value across a patch that it should re-read. Both are real defects
  that the old snapshot model concealed.
- If something needs a plain object — `structuredClone`, `JSON.stringify`,
  posting to a worker — that is a legitimate `resolveDeep` call site. There
  should be very few. Add a comment at each one saying why.
