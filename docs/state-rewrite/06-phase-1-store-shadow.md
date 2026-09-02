# 06 — Phase 1: The Store, in Shadow

**Goal.** Build the whole state layer, prove it produces the same data as
`reconstituteData`, and ship it wired to nothing.

**Depends on.** Phase 0 (fixtures and the test runner).

**Risk.** Low. No production code path changes. The bundle grows by a few KB of
unreachable code for the duration of one phase.

## Deliverables

1. `src/js/UI/State/` implemented per [`03-store-spec.md`](./03-store-spec.md).
2. The v1 adapter from [`04-protocol-spec.md`](./04-protocol-spec.md).
3. A first set of selectors.
4. A golden test proving equivalence over every fixture.
5. A performance test proving the store is faster than what it replaces.

## 1. Build the state layer

Type in `03-store-spec.md`, in this order. Each file gets a unit test before the
next one is started.

| File | Test it must pass |
| ---- | ----------------- |
| `types.ts` | `isRef` accepts `{'#ref':'x'}`, rejects `null`, `{}`, `'x'`, `[]` |
| `EntityStore.ts` | version bumps on write; `applyBatch` returns exactly the touched ids; `remove` fires `onDelete`; `revision` moves once per batch regardless of how many writes |
| `tracking.ts` | nested `withTracking` restores the outer tracker; `untracked` records nothing; `trackAll` feeds the active tracker |
| `views.ts` | see below |
| `selectors.ts` | cache hit on unchanged versions; miss after a dependency changes; nested selector propagates deps on a hit; `onDelete` drops keys |
| `subscriptions.ts` | only intersecting subscribers fire; disposal during `notify` is safe; `watch` re-subscribes when deps change |

### `views.ts` tests specifically

This file carries the most risk, because everything else assumes its semantics.

**The design has been prototyped and verified.** A standalone implementation of
the `views.ts` + `tracking.ts` design from
[`03-store-spec.md`](./03-store-spec.md) was run against a cyclic fixture
(player → cities → player, unit → tile → units → unit) and all of the following
hold. Treat this as the acceptance list — if any of it fails, the implementation
has diverged from the spec, not the other way round:

| Behaviour | Verified |
| --------- | -------- |
| Deep read `p.cities[0].growth.size` | yes |
| `view(id) === view(id)` | yes |
| Identity through the graph: `p.cities[0].player === p` | yes |
| Cycle: `unit.tile.units[0] === unit` | yes |
| Cycle: `city.tile.city === city` | yes |
| `.map` / `.filter` / `.length` / spread / `for...of` | yes |
| `[...arr].sort(...)` on a copy | yes |
| `Object.keys` / `Object.entries` resolve values | yes |
| `in` operator | yes |
| Nested plain objects (`actionsForNeighbours.n[0].to.x`) | yes |
| Non-ref nested objects (`unit.defence.value`) | yes |
| `__` readable for `instanceOf` | yes |
| Write throws `TypeError` | yes |
| A held view sees a later `merge` | yes |
| A pre-held nested reference sees a later `merge` | yes |
| A replaced array is reflected | yes |
| A removed entity reads `undefined`, keeps `id` | yes |
| Tracking records exactly the ids read | yes |
| Tracking records array element ids | yes |
| Nested `withTracking` restores the outer tracker | yes |

```ts
describe('views', () => {
  it('resolves refs lazily', ...);
  it('returns the same proxy for the same id', () => {
    expect(views.view('City-1')).toBe(views.view('City-1'));
  });
  it('stays live across a store write', () => {
    const city = views.view('City-1');
    store.applyBatch((w) => w.merge('City-1', { name: 'Changed' }));
    expect(city.name).toBe('Changed');       // no re-fetch needed
  });
  it('handles cycles', () => {
    // unit -> tile -> units -> unit
    expect(views.view('Unit-1').tile.units[0]).toBe(views.view('Unit-1'));
  });
  it('supports array methods', () => {
    expect(player.cities.map((c) => c.name)).toEqual([...]);
    expect([...player.units]).toHaveLength(3);
    expect(player.cities.filter((c) => c.growth.size > 1)).toHaveLength(1);
  });
  it('supports Object.entries and spread', ...);
  it('returns undefined for a removed entity, but keeps id readable', ...);
  it('throws on write', () => {
    expect(() => { (city as any).name = 'x'; }).toThrow(TypeError);
  });
  it('records reads for the active tracker', () => {
    const [, deps] = withTracking(() => views.view('City-1').player.id);
    expect([...deps]).toEqual(['City-1', 'Player-1']);
  });
});
```

The cycle test matters most: `reconstituteData` needed an explicit `seenObjects`
map to survive cycles, and a naive eager resolver would stack-overflow on the
real graph. Views survive because they never recurse eagerly — write the test
that proves it.

## 2. The v1 adapter

`src/js/UI/State/legacy/applyV1.ts`, per `04-protocol-spec.md`.

**Copy `setObjectPath` and `removeObjectPath` verbatim** from `Renderer.ts`
(around lines 1225 to 1259) rather than reimplementing them. The golden test in
step 4 is only meaningful if the adapter reproduces v1's behaviour exactly,
including its quirks — the redundant `objects[key] = value.hierarchy` write, the
`console.warn` on an unresolvable path, and the array-splice branch in
`removeObjectPath`.

Tests:

- an `add` with an `index` splices a ref into the target's array at that index
- an `add` without an `index` replaces the entity from `value.objects`
- `value.objects` entries all land in the store
- a `remove` without an `index` deletes the entity
- a `remove` with an `index` deletes the array element
- a patch with no `hierarchy` logs and does not throw

## 3. First selectors

Only what Phase 2 will need. Do not build selectors speculatively.

`src/js/UI/State/selectors/player.ts`:

```ts
import { createSelector } from '../selectors';
import { GameData, Player, PlayerAction } from '../../types';

export const selectRoot = createSelector(
  (store) => views(store).root<GameData>(),
  () => 'root'
);

export const selectPlayer = createSelector(
  (store) => selectRoot(store)?.player ?? null,
  () => 'player'
);

export const selectPlayerActions = createSelector(
  (store): PlayerAction[] =>
    (selectPlayer(store)?.actions ?? []).filter(Boolean),
  () => 'playerActions'
);

export const selectActiveUnitActions = createSelector(
  (store) => selectPlayerActions(store).filter((a) => a._ === 'ActiveUnit'),
  () => 'activeUnitActions'
);

export const selectMandatoryActions = createSelector(
  (store) => selectPlayer(store)?.mandatoryActions ?? [],
  () => 'mandatoryActions'
);
```

`selectPrimaryActions` and `selectSecondaryActions` should encapsulate the
priority table and exclusion sets that currently live inline in `Renderer.ts`'s
`render()` (around line 1000). Moving that classification into a tested selector
is a real gain on its own.

`src/js/UI/State/selectors/world.ts` builds the flat `TileSnapshot` array —
specified in [`10-phase-5-map-renderer.md`](./10-phase-5-map-renderer.md). Build
it now, test it now, and let Phase 5 consume it.

**The ViewFactory needs reaching from selectors.** Selectors take only a
`store`, so hold the factory in a `WeakMap<EntityStore, ViewFactory>` populated
by `createState`, and expose `views(store)`. Do not use a module-level singleton
— it breaks test isolation and blocks `restart`.

## 4. The golden test

This is the phase's real deliverable: proof that the store carries the same
information as the graph it will replace.

`tests/golden/equivalence.test.ts`:

```ts
import { EntityStore, resolveDeep } from '../../src/js/UI/State';
import { applyV1Patches, applyV1Snapshot } from '../../src/js/UI/State/legacy/applyV1';
import reconstituteData from '../../src/js/UI/lib/reconstituteData';
import { loadFixture, replay } from '../helpers/replay';

describe.each(['turn-001', 'turns-050', 'turns-150', 'entity-removal'])(
  'store matches reconstituteData for %s',
  (name) => {
    it('produces an identical graph at every step', () => {
      const fixture = loadFixture(name),
        store = new EntityStore(),
        objectMap = { hierarchy: {}, objects: {} };

      let steps = 0;

      replay(fixture, {
        gameData: (data) => {
          applyV1Snapshot(store, data);
          Object.assign(objectMap, data);
          compare();
        },
        gameDataPatch: (data) => {
          applyV1Patches(store, data);
          applyLegacyPatchesToObjectMap(objectMap, data);
          compare();
        },
      });

      expect(steps).toBeGreaterThan(10);

      function compare() {
        steps++;

        expect(resolveDeep(store, store.rootId()!)).toEqual(
          reconstituteData(objectMap)
        );
      }
    });
  }
);
```

`applyLegacyPatchesToObjectMap` is the patch-application block lifted out of
`Renderer.ts:1262` into a standalone function. **Do that extraction first, as a
pure refactor with no behaviour change, and have `Renderer` call it.** That both
gives the test its oracle and removes 60 lines from `Renderer.ts` for free.

Comparing after *every* message, not just at the end, is deliberate: it pins
down which message first diverges instead of leaving a mismatch at turn 150 to
bisect by hand.

### When it fails

It will, at first. Likely causes, in order of probability:

1. **Key ordering.** `toEqual` is order-insensitive for object keys, so this
   should not bite — but if you switched to `toStrictEqual` or a snapshot, it
   will. Use `toEqual`.
2. **A missing entity.** `reconstituteData` logs `missing X` and yields
   `undefined`; `resolveDeep` must do the same. Check `resolveDeep`'s handling of
   an absent `store.get(ref)`.
3. **Shared-object identity.** `reconstituteData` keys `seenObjects` by source
   object identity. If `resolveDeep` diverges, two refs to one entity produce two
   output objects and deep-equality still passes — but the *structure* differs.
   Add an explicit identity assertion:
   `expect(out.player.cities[0].player).toBe(out.player)`.
4. **The redundant root write.** v1 writes `objects[key] = value.hierarchy`
   before the `value.objects` loop. If the adapter reorders those, an entity is
   left as a bare `{'#ref'}`.

## 5. Performance test

`tests/perf/store.test.ts`, run against `turns-150`:

```ts
it('applies a patch batch faster than reconstitution', () => {
  // Warm both paths to the same state, then time the last N batches.
  expect(storeApplyMean).toBeLessThan(reconstituteMean / 10);
});
```

A 10× floor is a deliberately loose regression guard, not the expected result —
the real gap on a late-game fixture should be two to three orders of magnitude,
because one is O(changed) and the other is O(everything). Assert loosely, but
**print both numbers** and record them here:

| Fixture | `reconstituteData` mean ms | `applyV1Patches` mean ms | Ratio |
| ------- | -------------------------- | ------------------------ | ----- |
| turns-050 | | | |
| turns-150 | | | |

Also assert that `store.size()` after replaying `turns-150` is within 5% of
`Object.keys(objectMap.objects).length`. A large gap means the adapter is
dropping or duplicating entities.

## Definition of done

- [ ] Every file in `src/js/UI/State/` exists with unit tests passing.
- [ ] `applyLegacyPatchesToObjectMap` extracted from `Renderer.ts`; `Renderer`
      calls it; the game still plays.
- [ ] The golden test passes on all four fixtures, comparing after every
      message.
- [ ] The identity assertion (`cities[0].player === player`) passes.
- [ ] The performance table above is filled in.
- [ ] `npm run ts:compile` is clean.
- [ ] Nothing in `src/js/UI/State/` is imported by any shipping code path yet
      (grep to confirm; only tests should import it).

## Notes for the executor

- Resist wiring it up early. The value of this phase is that the golden test
  gets to fail loudly against a working game.
- If a selector needs data the store does not have, that is a finding about the
  backend, not a reason to add a fallback. Write it down for Phase 4.
- The bundle carries dead code for one phase. That is fine and it is temporary —
  do not add build gymnastics to tree-shake it.
