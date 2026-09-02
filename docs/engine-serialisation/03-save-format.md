# 03 — Save Format and Hydration

The technical design. Assumes the `#private` → `private` migration from
[`02-design-review.md`](./02-design-review.md) §1 has landed, which is what makes
the hydrator generic instead of per-class.

## Why this design and not the other one

Two designs were viable, and the `#private` decision picks between them:

| | Per-class contract | Generic hydrator (**chosen**) |
| - | ------------------ | ----------------------------- |
| Needs | `toState()` + `static hydrate()` on 24 classes | A field policy on 24 classes |
| Construction | Runs the real constructor with a suppressing `RuleRegistry` | `Object.assign(Object.create(proto), state)` — no constructor |
| Rule suppression | Required, and `EVENT_RULES` is an open set a plugin can break | Not required at all |
| New stateful field | Silently unsaved until someone updates `toState()` | Saved by default |
| Engine code | ~900 lines | ~250 lines |

The second column wins on every row, and the deciding one is the third: with no
constructor call there is nothing to suppress, so the unbounded correctness risk
in [`01-constraints.md`](./01-constraints.md) §3 disappears rather than being
managed.

## Principle: opt-out, not opt-in

Once fields are ordinary properties, `Object.keys(entity)` returns all of them.
The save takes **everything except an explicit exclusion list**.

This is deliberate. The two failure modes are not symmetric:

- Saving a field that did not need saving: harmless. A few wasted bytes, and the
  value is overwritten by recomputation.
- Failing to save a field that did: silent data loss, discovered by a player
  months later with no way to recover the game.

Opt-out makes the safe outcome the default. Adding a field to an entity gets it
persisted with no further action; forgetting to exclude a cache costs bytes.

```ts
export class Tile extends DataObject {
  static readonly transient = ['_ruleRegistry', '_yieldCache', '_neighbours'];
}
```

Three categories go in `transient`:

| Category | Examples | Why |
| -------- | -------- | --- |
| Injected collaborators | `_ruleRegistry`, `_workedTileRegistry`, `_advanceRegistry` | Re-injected from the `Game` context on hydrate |
| Derived caches | `Tile._yieldCache`, `Yield._valueCache`, `Tile._neighbours` | Recomputed on demand |
| Functions | `Spaceship._randomNumberGenerator` | Not serialisable; re-injected |

`DataObject` gains a static default so most classes declare nothing:

```ts
export class DataObject {
  static readonly transient: readonly string[] = [];

  static allTransient(): Set<string> {
    const out = new Set<string>();

    for (let c = this; c && c !== Function.prototype; c = Object.getPrototypeOf(c)) {
      (c.transient ?? []).forEach((f) => out.add(f));
    }

    return out;
  }
}
```

`allTransient()` walks the prototype chain, so a subclass inherits its parent's
exclusions and adds its own.

## The format

```ts
export type SaveGame = {
  format: 1;

  /** Compatibility gate — see "Compatibility" below. */
  engine: {
    /** Every loaded package at save time, name → exact version. */
    plugins: Record<string, string>;
    /** Build identifier, for reporting rather than gating. */
    build: string;
  };

  meta: {
    createdAt: number;
    turn: number;
    year: number;
    name: string;
  };

  /** Determinism — see 05-engine-plan.md Stage 2. */
  rng: {
    seed: number;
    /** Draws taken so far, so the stream resumes rather than restarts. */
    calls: number;
  };

  /** `DataObject` id counters, restored before hydration. */
  idCounters: Record<string, number>;

  /** Topologically ordered. */
  entities: SerialisedEntity[];

  /** Registry name → member ids, in registration order. */
  registries: Record<string, string[]>;

  /** Client descriptors — never the client objects themselves. */
  clients: Array<{ playerId: string; kind: 'human' | 'ai'; module: string }>;

  /** Serialisable continuations — see "Pending effects". */
  pendingEffects: Array<{ handler: string; data: Record<string, string> }>;
};

export type SerialisedEntity = {
  id: string;
  /** `static type`, not `constructor.name` — see 02-design-review.md §7. */
  type: string;
  state: Record<string, unknown>;
};
```

### Reference encoding

Inside `state`, values are encoded by kind:

| Value | Encoded as |
| ----- | ---------- |
| Primitive | itself |
| `DataObject` instance | `{ $ref: 'City-1' }` |
| Class constructor (e.g. `_researching`) | `{ $class: 'Bronzeworking' }` |
| Array | array of encoded values |
| Plain object | object of encoded values |
| `Map` / `Set` | `{ $map: [[k, v], …] }` / `{ $set: [...] }` |

`$class` matters more than it looks. `PlayerResearch._researching` holds a
*constructor*, not an instance, and `CityBuild._building` holds a `BuildItem`
wrapping one. Decoding needs a name → constructor lookup, which the twelve
`ConstructorRegistry` instances already provide — they just need a `getByName`.

`Map` and `Set` appear in `Interaction._players` (a `Set<Player>`) and
`Tile._yieldCache` (a `Map`, but transient).

## The hydrator

```ts
// core-save-game/hydrate.ts
export const hydrate = (save: SaveGame, game: Game): void => {
  assertCompatible(save, game);

  restoreIdCounters(save.idCounters);
  game.rng.restore(save.rng.seed, save.rng.calls);

  const instances = new Map<string, DataObject>();

  // Pass 1 — allocate. No constructors, so no side effects and no ordering
  // requirement. This is what the #private migration buys.
  for (const { id, type, state } of save.entities) {
    const Type = game.classes.get(type);

    if (!Type) {
      throw new SaveError(`Unknown entity type '${type}' — missing plugin?`);
    }

    instances.set(id, Object.create(Type.prototype));
  }

  // Pass 2 — fill. Refs resolve against the complete map, so cycles are free.
  for (const { id, state } of save.entities) {
    Object.assign(instances.get(id)!, decode(state, instances, game));
  }

  // Pass 3 — re-inject transient collaborators.
  for (const [id, entity] of instances) {
    game.inject(entity);
  }

  // Pass 4 — registry membership, in saved order.
  for (const [name, ids] of Object.entries(save.registries)) {
    game.registry(name).register(...ids.map((i) => instances.get(i)!));
  }

  // Pass 5 — claimed civilisations and leaders (see below).
  reclaimConstructorRegistries(game, instances);

  // Pass 6 — pending effects.
  save.pendingEffects.forEach(({ handler, data }) =>
    game.pendingEffects.register(new PendingEffect(handler, data))
  );
};
```

Six passes, but only passes 1 and 2 touch entity data and both are flat loops.

**Allocate-then-fill removes the topological ordering requirement entirely.**
[`01-constraints.md`](./01-constraints.md) §5 established that the graph is a DAG
so a single ordered pass *would* work — but relying on that means a plugin adding
one field could break loading with a confusing error. Two passes cost nothing and
cannot be broken this way. Entities are still written in topological order for
diffability and human inspection, not because the loader needs it.

### `game.inject`

Transient collaborators are re-attached from the `Game` context:

```ts
inject(entity: DataObject): void {
  const wants = (entity.constructor as typeof DataObject).allTransient();

  if (wants.has('_ruleRegistry')) (entity as any)._ruleRegistry = this.rules;
  if (wants.has('_workedTileRegistry')) (entity as any)._workedTileRegistry = this.workedTiles;
  // …one line per known collaborator
}
```

Blunt, but explicit and greppable. A registry map keyed by field name would be
cleverer and harder to follow; there are about a dozen.

## Registry membership

Saved as `registryName → [ids]`, filtered to ids present in `save.entities`.

This is what makes the mixed registries from
[`01-constraints.md`](./01-constraints.md) §6 fall out correctly with no
special-casing. `TerrainFeatureRegistry` holds definitions registered at import
*and* runtime state. On load:

1. Plugin imports re-register the definitions. They are fresh instances with
   fresh ids, and they never appeared in `save.entities`.
2. Hydration registers the saved entities on top.
3. `EntityRegistry.register` dedupes by identity, so nothing doubles.

Registries listed in [`01-constraints.md`](./01-constraints.md) §6 as pure
definitions (`RuleRegistry`, `AdditionalDataRegistry`, `StrategyRegistry`,
`CityNameRegistry`, `TraitRegistry`, `CivilizationStartTileRegistry`) are skipped
by an explicit allow-list rather than by inference — inference here would be a
silent-corruption risk and the list is 31 entries long.

`ClientRegistry` is **never** saved. Clients hold a `Transport`, an
`EventEmitter` and pending promises. `save.clients` carries descriptors and the
loader reconstructs them.

### Claimed civilisations

`civ1-player/Rules/World/built.ts` calls
`civilizationRegistry.unregister(civilization.sourceClass())` so no two players
share a civilisation. A fresh boot re-registers all of them.

`reclaimConstructorRegistries` walks the restored players and re-applies those
unregistrations. No extra save data — the players already carry their
civilisations — but omitting it silently allows a duplicate civilisation later.

## Pending effects

[`01-constraints.md`](./01-constraints.md) §4 found one unserialisable
continuation: Darwin's Voyage registers a closure-capturing one-shot rule.

```ts
export class PendingEffect extends DataObject {
  static readonly type = 'PendingEffect';

  constructor(
    /** A registered rule identifier — see 02-design-review.md §3. */
    private _handler: string,
    /** Entity ids only. Must be serialisable. */
    private _data: Record<string, string>
  ) { super(); }
}
```

Handlers are registered at import like any other rule and looked up by
identifier, so the closure lives in the plugin rather than in the save. This
depends on rule identity (Stage 6 of the engine plan) and is the one place where
save/load forces a design change rather than merely benefiting from one.

Until Stage 6 lands, `hydrate` should **refuse** a save whose
`pendingEffects` is non-empty rather than dropping them silently.

## Compatibility

`save.engine.plugins` records every loaded package and its exact version.

```ts
const assertCompatible = (save: SaveGame, game: Game): void => {
  if (save.format !== 1) throw new SaveError(`Unsupported save format ${save.format}`);

  const missing = Object.keys(save.engine.plugins).filter((p) => !game.plugins.has(p));

  if (missing.length) {
    throw new SaveError(`Save needs plugins not loaded: ${missing.join(', ')}`);
  }

  const changed = Object.entries(save.engine.plugins)
    .filter(([p, v]) => game.plugins.get(p) !== v)
    .map(([p, v]) => `${p} ${v} → ${game.plugins.get(p)}`);

  if (changed.length) {
    game.emit('save:version-drift', changed);   // warn, do not block
  }
};
```

Three tiers, deliberately:

- **Missing plugin — refuse.** The save contains entity types this engine cannot
  construct. Loading would fail mid-hydration with a worse message.
- **Extra plugin — allow.** New rules apply to the restored game. That is how a
  player adds a mod to a running game, and it is a feature.
- **Version drift — warn.** A patch bump is almost always fine. Blocking on it
  would make saves worthless after any dependency update, which given a 325-package
  tree is constantly.

This covers the second of the three requirements raised in conversation: which
registries to include is answered by the allow-list above; which plugins were
loaded is answered here.

## Determinism and ids

`save.rng` carries the seed **and the draw count**, so loading resumes the stream
rather than restarting it. Restarting would make a save/load cycle change the
outcome of the next combat, which is exactly the class of bug that makes replay
testing untrustworthy.

`save.idCounters` restores `DataObject`'s per-class counters
([`01-constraints.md`](./01-constraints.md) §7), so entities created after a load
cannot collide with loaded ones.

### On stable IDs

`web-renderer-rewrite`'s Finding 2 recommends a parallel stable ID (UUID, or a
semantic key) alongside the ephemeral `DataObject#id()`. **This design does not
adopt that**, and the reasoning should be recorded because it reverses a
documented recommendation.

A restored counter plus deterministic entity-creation order already yields ids
that are stable across sessions and identical across peers. Determinism is a
prerequisite for lockstep multiplayer regardless, so the counter rides on a
guarantee that must hold anyway. A dual-ID scheme adds a second identifier to
every entity, every protocol message and every index for a property that is
already implied.

The honest counter-argument is that dual IDs *decouple* id stability from
determinism: if determinism breaks subtly, a counter-based id silently resolves
to the wrong entity, whereas a UUID fails to resolve and the bug surfaces.

That risk is real, and the answer is to catch divergence directly rather than to
encode around it: WP-004's snapshot checksum compares full state between peers
and after a save/load round-trip. Divergence should be detected by a checksum,
not inferred from an id mismatch. If checksums prove impractical, revisit — this
is the decision most worth reversing if evidence appears.

## Size

An 80×50 world is 4,000 `Tile`s, each with roughly six state fields, plus
`PlayerTile`s per player per discovered tile, plus a few hundred units, cities
and components.

Estimate: 5,000–15,000 entities, 2–8 MB of JSON, 200–800 KB gzipped. Fine for
IndexedDB and fine to send over a network for a multiplayer join.

`PlayerTile` is the one to watch: one per discovered tile per player, and its
only real state is `_tile` and `_player`
([`01-constraints.md`](./01-constraints.md) §9 — `_additionalData` is dead and
should be deleted). Four players fully exploring an 80×50 world is 16,000
`PlayerTile`s carrying two refs each. If that dominates, encode `PlayerWorld` as
a tile-id list rather than as individual entities.

## Testing

The save/load contract needs three properties, and each has a cheap test.

**Round-trip identity.** Save, load into a fresh `Game`, save again; the two
saves must be byte-identical after normalising ids. Catches dropped fields
immediately.

```ts
const a = save(game);
const b = save(hydrateInto(new Game(), a));
expect(normalise(b)).toEqual(normalise(a));
```

**Replay equivalence.** Run N turns from a seed. Separately: run N/2 turns, save,
load, run the remaining N/2. Final snapshot checksums must match. This is the
test that catches the RNG-resume bug and any missed state.

**No-op suppression.** Loading must emit no `city:created`, `unit:created` or
similar engine events. Assert on an event spy — a regression here sprays a
half-loaded game at the renderer.

Every one of these needs the deterministic RNG from Stage 2, which is why it
sequences before the save work.
