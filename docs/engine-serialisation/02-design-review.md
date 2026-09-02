# 02 — Design Decisions Worth Reconsidering

A review of long-standing decisions in the engine, judged against two goals:

1. **Keep the core idea.** Every game mechanic must stay tweakable, so the engine
   can host any Civ-like game. This is not negotiable and nothing below weakens
   it — several items exist because the current design *undermines* it.
2. **Make the project easier to work with.** Testable, debuggable, persistable.

Every claim here is backed by something in
[`01-constraints.md`](./01-constraints.md) or by a check recorded inline.

## The short answer on `#private`

**Yes, it was unhelpful, and it is the cheapest thing on this list to reverse.**

`#private` gives *runtime* encapsulation. Ask what that bought: nothing. This is
a game engine, not a security boundary — there is no untrusted code inside the
worker that needed to be kept away from `City.#name`. TypeScript's `private`
would have given identical compile-time safety at zero runtime cost.

What it cost is large and was measured in
[`01-constraints.md`](./01-constraints.md) §1: private slots can only be
installed by running the constructor, so no generic rehydrator is possible, and
no reflection can see the fields at all.

Swap to a plain property and the whole problem changes shape:

```js
class Base { constructor(){ this._id = 'x'; } id(){ return this._id; } }
class City extends Base {
  constructor(player, name){ super(); this._player = player; this._name = name; }
  name(){ return this._name; }
}

// allocate and fill generically — no constructor, no side effects, no per-class code
const revived = Object.assign(Object.create(City.prototype), {
  _id: 'City-1', _player: player, _name: 'Roma',
});

revived.name();            // 'Roma'
revived instanceof City;   // true
Object.keys(new City(p, 'Rome'));   // ['_id','_player','_name']  ← generic toState()
```

That single change turns save/load from *24 bespoke `hydrate()` methods plus a
rule-suppression harness* into *one generic hydrator plus a per-class list of
which fields are state*. It also makes the constructor-side-effect problem
(§2 of the constraints) disappear, because hydration stops calling constructors.

Two consequences to handle, neither serious:

- Fields become enumerable, so `JSON.stringify(entity)` now throws on the cyclic
  graph instead of returning `{}`. That is arguably an improvement — silent `{}`
  is worse — but anything relying on it must be found.
- `Object.keys` returns everything, including derived caches like
  `Tile._yieldCache`. The state/derived split (§5 below) is what makes that safe,
  so these two changes belong together.

Migration is mechanical: `#x` → `private _x` and `this.#x` → `this._x`, across
~24 core classes and any plugin with stateful classes. A codemod handles it; the
compiler catches the rest.

## Ranked

| # | Decision | Cost today | Change | Effort | Serves pluggability? |
| - | -------- | ---------- | ------ | -----: | -------------------- |
| 1 | `#private` fields | No generic serialisation, no cloning, poor debugging | TypeScript `private` | Low, mechanical | Neutral |
| 2 | Module-level singleton registries | One game per process; no restart; test isolation needs module reloading | A `Game` context object | Medium — the DI already exists | Strengthens |
| 3 | Anonymous rules | A plugin cannot replace or disable another's rule | Stable rule identifiers | Medium | **Strengthens most** |
| 4 | Five implicit `process()` contracts | Rule authors guess what their return value means | Combination strategy in the rule type | Medium | Strengthens |
| 5 | `addKey` conflates state with view | Saves would restore derived data; DTOs leak engine internals | Separate `toState()` from a client-owned projection | Medium | Neutral |
| 6 | Dynamic closure rules | Unserialisable continuations; silent data loss on load | `PendingEffect` state entity | Low — one site | Strengthens |
| 7 | `constructor.name` as identity | Depends on `keepNames: true` surviving every bundler change | Explicit `static type` | Low | Neutral |
| 8 | Linear-scan registries | O(n) lookups on hot paths | Declared indexes | Low–medium | Neutral |
| 9 | `AdditionalData` instance patching | `defineProperty` per instance; caused a real leak | Declared extension map | Medium | Neutral — keep the concept |

Items 1 and 2 are independent, mechanical, and unlock the most. Do those first.
Item 3 is the one that most directly serves the stated core goal.

---

## 1. `#private` → TypeScript `private`

Covered above. The one point worth repeating: the encapsulation you actually want
here is *compile-time discipline*, which `private` gives you in full. `#private`
adds a runtime guarantee that nothing in this project needed and that costs the
ability to inspect, clone, or persist an object.

---

## 2. Module-level singletons → a `Game` context

Every registry is a module singleton:

```ts
export const instance: CityRegistry = new CityRegistry();
```

There are 43 of them. Consequences:

- **One game per process.** You cannot run a second game to evaluate an AI move,
  preview a map, or hold a replay alongside a live game.
- **No restart.** [`../state-rewrite/11-phase-6-lifecycle.md`](../state-rewrite/11-phase-6-lifecycle.md)
  has to terminate and recreate the whole worker, purely because the registries
  cannot be reset.
- **Test isolation requires module reloading.** Every test that registers an
  entity pollutes every later test in the same module graph.
- **Load needs a fresh worker** for the same reason.

### Why this is cheaper than it looks

**The dependency injection is already there.** Every stateful class takes its
registries as constructor parameters, with the singleton merely as a *default*:

```ts
constructor(player: Player, tile: Tile, name: string,
            ruleRegistry: RuleRegistry = ruleRegistryInstance,
            workedTileRegistry: WorkedTileRegistry = workedTileRegistryInstance)
```

So does every rule factory:

```ts
export const getRules = (
  cityRegistry: CityRegistry = cityRegistryInstance,
  ruleRegistry: RuleRegistry = ruleRegistryInstance
): Created[] => [ /* ... */ ];
```

The seams exist. What is missing is something to pass. Introduce it:

```ts
export class Game {
  readonly rules = new RuleRegistry();
  readonly cities = new CityRegistry();
  readonly units = new UnitRegistry();
  readonly players = new PlayerRegistry();
  // ...one per registry

  readonly turn = new Turn();
  readonly year = new Year();
}
```

The binding point that currently forces the singletons is plugin registration —
`registerRules.ts` calls `getRules()` with no arguments, so the defaults win:

```ts
// today
ruleRegistryInstance.register(...cityCreated(), ...cityGrow(), /* ... */);

// after
export const register = (game: Game): void =>
  game.rules.register(
    ...cityCreated(game.cities, game.rules),
    ...cityGrow(game.cities),
    // ...
  );
```

That is 17 files. Keep the singleton exports as a default `Game` instance so
nothing outside breaks during the migration, and delete them once callers have
moved.

### Payoff

Tests construct a `Game`, register the plugins they care about, and throw it
away. Save/load becomes "hydrate into a fresh `Game`" with no worker juggling.
Restart becomes `new Game()`. And running two games at once — an AI evaluating a
branch, a replay verifying a save — becomes possible at all.

This also removes the awkwardness noted in
[`01-constraints.md`](./01-constraints.md) §6, where loading must remember to
re-apply `civilizationRegistry.unregister(...)` for each claimed civilisation.
With a per-game context, the registry state simply belongs to the game.

---

## 3. Anonymous rules → identified rules

This is the item most directly in tension with the stated core goal.

Rules are constructed anonymously and registered in bulk:

```ts
new Created(
  new Criterion((city: City) => /* ... */),
  new Effect((city: City) => /* ... */)
)
```

208 `Rule` subclasses exist across the tree. Not one rule instance has a name, an
id, or a declared origin.

### What works today

Pluggability is **partly** real, and it is worth being precise about which parts:

- **Collecting rule types work well.** `City.yields()` accumulates every `Yield`,
  `YieldModifier` and `Cost` rule. A plugin adding a modifier composes cleanly.
  This is the design working as intended.
- **First-wins rule types can be overridden by priority.** `City` does
  `[this.#tiles] = process(Tiles, this)` and `RuleRegistry.entries()` sorts by
  priority, so a lower-numbered rule wins. A plugin *can* replace city radius.

### What does not

- **You cannot remove or disable another plugin's rule.** Verified: apart from
  Darwin's Voyage unregistering its own one-shot rule, no plugin anywhere calls
  `ruleRegistry.unregister`. There is no handle to pass it. If `civ1-city`'s
  `Created` rule does something your variant must not do, your only options are
  forking the package or not importing it.
- **Priority is an uncoordinated magic number.** `High` is 1000, `Normal` 2000,
  `Low` 3000, and in practice: `new Priority(0) // X High`,
  `new Priority(500)`, `new Priority(4000) // X Low`, and
  `new Priority(9001)` with the comment *"`Low` is probably enough in most cases,
  but just to make sure, it's over 9000"*. Two plugins that both need to run last
  have no way to negotiate.
- **No diagnostics.** When a city produces an unexpected yield there is no way to
  ask which rule produced it. `Yield` carries a provider *string* per value,
  which is the closest thing — and it is supplied by hand at each call site.

### Change

Give rules a stable identifier, namespaced by package:

```ts
new Created(
  'civ1-city:city/created/register',
  new Criterion(/* ... */),
  new Effect(/* ... */)
)
```

Then the registry can offer what plugins actually need:

```ts
game.rules.replace('civ1-city:city/created/register', myRule);
game.rules.disable('civ1-city:city/created/register');
game.rules.before('civ1-city:city/grow', myRule);   // ordering by reference,
game.rules.after('civ1-city:city/grow', myRule);    // not by magic number
```

Relative ordering deserves emphasis: `before`/`after` against a named rule is
what replaces the 9001 problem. Priority numbers stay as a coarse fallback, but
plugins stop having to guess.

This is additive — an unnamed rule keeps working — so it can land incrementally,
package by package, starting with the ones a variant is most likely to override
(`civ1-city`, `civ1-unit`, `civ1-science`).

---

## 4. Declare what a rule type's results mean

`RuleRegistry.process()` returns `RuleReturn<RuleType>[]` — an array of every
matching rule's return value. What callers do with that array varies, and nothing
declares which is expected:

| Semantics | Example |
| --------- | ------- |
| First wins | `[this.#tiles] = process(Tiles, this)` — `core-city/City.ts:65` |
| First wins | `[cost] = process(Cost, ...)` — `core-city-build/BuildItem.ts:33` |
| First wins | `[year] = process(YearRule, turn)` — `core-game-year/Year.ts:38` |
| All must hold | `process(Active, slot, this).every((r) => r)` — `core-spaceship/Layout.ts:53` |
| Side effects only | `process(Created, this)` — `core-city/City.ts:67` |
| Collect all | `process(ActionRule, this, unit)` — `core-goody-hut/GoodyHut.ts:43` |
| Manual accumulate | `City.yields()` bypasses `process` entirely and iterates `get(YieldRule)`, `get(YieldModifier)`, `get(Cost)` by hand |

Five contracts and one bypass. A plugin author writing a new `Tiles` rule has no
way to learn that only the first result is used, other than reading the consumer.
That last row is the tell: `City.yields()` had to drop out of `process` because
accumulation was not expressible.

### Change

Make the combination strategy part of the rule type:

```ts
export class Tiles   extends Rule.First<[City], Tileset> {}
export class Yield   extends Rule.Reduce<[City, YieldValue[]], YieldValue[]> {}
export class Created extends Rule.Effect<[City]> {}
export class Active  extends Rule.Every<[Slot, Layout]> {}
```

`process` then returns the combined result with the right type, `City.yields()`
comes back inside the framework, and the contract is visible at the definition
rather than at the call site. 208 rule types is a lot to annotate, but each is a
one-line class declaration and the compiler finds every consumer that disagrees.

---

## 5. Separate state from view

`addKey` declares what `toPlainObject` emits:

```ts
this.addKey('actions', 'actionsForNeighbours', 'active', 'attack', 'busy',
            'city', 'defence', 'destroyed', 'movement', 'moves', 'player',
            'status', 'tile', 'visibility', 'waiting');
```

Nine of those fifteen are real `Unit` state. The other six — `actions`,
`actionsForNeighbours`, `attack`, `defence`, `movement`, `visibility` — are
computed by rules on every call.

Two problems follow:

- **A save built on this restores stale derived data.** This is the reason
  [`README.md`](./README.md) opens by insisting the two are different concerns.
- **The entity knows about the UI.** `addKey` exists to serve the web renderer.
  A headless server or a test harness pays the cost of serialising
  `actionsForNeighbours` — eight directions of rule evaluation per unit — for
  nobody.

### Change

Two distinct projections:

```ts
// persistence — engine-owned, only what cannot be recomputed
toState(): UnitState

// view — client-owned, declared by whoever is rendering
const unitProjection = { fields: ['active', 'busy', 'tile', /* ... */],
                         derived: ['attack', 'defence', 'actionsForNeighbours'] };
```

The engine keeps `toState()`. The renderer keeps its own projection and asks for
derived values explicitly. `addKey` goes away.

This pays a second dividend outside serialisation:
[`../state-rewrite/09-phase-4-backend-deltas.md`](../state-rewrite/09-phase-4-backend-deltas.md)
plans to diff `toPlainObject` output against a shadow copy. Diffing `toState()`
instead is strictly better — smaller, and it cannot produce spurious changes from
recomputed derived values that happen to allocate new `Yield` objects each call.
That is a real risk in the current plan and this removes it.

---

## 6. Dynamic closure rules → `PendingEffect`

Detailed in [`01-constraints.md`](./01-constraints.md) §4. Darwin's Voyage
registers a one-shot rule from inside an `Effect`, capturing a live
`PlayerResearch` in its closure. It is a continuation, it cannot be serialised,
and a save taken while it is pending silently loses the player an advance.

One site today. But nothing stops the next plugin author using the pattern and
nothing would warn them.

### Change

Model it as state:

```ts
game.pendingEffects.register(
  new PendingEffect('civ1-wonder:darwins-voyage/next-research',
                    { playerResearch: playerResearch.id() })
);
```

The handler is looked up by identifier — which is registered at import time like
any other rule — and the captured data is a plain, serialisable record of entity
ids. Save and load then work, and a lint rule can ban `register` inside `Effect`
so the pattern cannot silently return.

This depends on §3: without stable identifiers there is nothing to look the
handler up by.

---

## 7. `constructor.name` as identity

Entity type tags, the inheritance chain, translation keys and the renderer's
`instanceOf` all derive from `constructor.name`:

```ts
_: value.sourceClass().name,
__: generateInheritance(value),          // walks the prototype chain, maps to .name
return className + '-' + (++idCache[className]).toString(36);   // and ids
```

The whole scheme is held together by one line in `esbuild.js`:

```js
keepNames: true,
```

Remove it, or switch bundler, or hit a minifier that handles it differently, and
entity types silently become `t`, `n`, `e`. The renderer's translation lookups
fall back to raw keys, `instanceOf` stops matching, and ids collide across
classes. It would not fail loudly.

### Change

An explicit tag, checked at registration:

```ts
export class City extends DataObject {
  static readonly type = 'City';
}
```

`generateInheritance` walks `static type` instead of `.name`; `idProvider` uses
it; the registry rejects a duplicate tag at startup. `keepNames` can then be
dropped, which also shrinks the bundle.

Low effort, and it removes a failure mode that would be genuinely painful to
diagnose.

---

## 8. Registry indexes

`EntityRegistry.getBy` filters every entry and invokes the accessor on each:

```ts
getBy<K extends keyof T>(key: K, value): T[] {
  return this.filter((entity) => {
    const check = entity[key];
    if (check instanceof Function) return check.bind(entity)() === value;
    return entity[key] === value;
  });
}
```

`UnitRegistry.getByPlayer`, `getByTile`, `CityRegistry.getByPlayer` and the rest
all sit on this. Worse, `PlayerWorld` reimplements the same scan by hand
([`01-constraints.md`](./01-constraints.md) §9) and `DataTransferClient` calls
`getByTile` on every `unit:moved`.

These are also exactly the lookups `AdditionalData` performs during
serialisation — so every `toPlainObject` of a player walks every unit and every
tile repeatedly.

### Change

Declare indexes on the registry and maintain them in `register`/`unregister`:

```ts
class UnitRegistry extends EntityRegistry<Unit> {
  #byPlayer = this.index((unit) => unit.player());
  #byTile = this.index((unit) => unit.tile());

  getByPlayer(player: Player): Unit[] { return this.#byPlayer.get(player) ?? []; }
}
```

Mutable keys are the catch — a unit's tile changes when it moves — so an indexed
field needs a reindex hook on mutation. `Unit.setTile` is the natural place, and
it already exists.

---

## 9. `AdditionalData` — keep the idea, change the mechanism

`AdditionalData` is how plugins attach `cities` to `Player` and `units` to `Tile`
without modifying core classes. **The concept is right** and directly serves the
pluggability goal — do not remove it.

The implementation has two problems:

```ts
Object.defineProperty(this, additionalData.key(), {
  configurable: true,
  value: () => additionalData.data(this.#tile),
});
```

- **Per-instance `defineProperty`.** Every `PlayerTile` gets its own property
  descriptors and its own closure per provider. On an 80×50 world that is
  thousands of instances each carrying several closures, and it defeats the
  engine's shape optimisation.
- **It caused a real leak.** `PlayerTile.#additionalData` is written alongside
  the `defineProperty` and never read
  ([`01-constraints.md`](./01-constraints.md) §9) — a pure retainer holding
  cities, units and improvements, refreshed rather than cleared on `update()`.

### Change

Resolve extensions through the prototype or an explicit accessor, so the closure
lives once per class rather than once per instance:

```ts
playerTile.extension('units');     // registry lookup, no per-instance property
```

Or define the properties on the prototype at registration time, with the
provider reading `this`. Either way the per-instance cost disappears and the
dead field goes with it.

---

## What not to change

These are good decisions and the review should say so.

- **Rules as data (`Criterion` + `Effect` + `Priority`).** This is the heart of
  the pluggability goal and it works. Items 3 and 4 make it *more* effective, not
  less.
- **Dependency injection throughout.** Every class and rule factory already
  accepts its collaborators. This is why item 2 is a medium change rather than a
  rewrite; the hard part was done years ago.
- **`Buildable.build()` as a static factory.** Clean way to let a city construct
  a thing without knowing what it is.
- **The registry concept.** Central, queryable collections per entity type are
  the right shape. Only the lookup performance (item 8) needs work.
- **Plugins as side-effectful imports.** Simple, no manifest to drift, no load
  order to configure. The build-time import generation in `buildPluginList.js` is
  slightly awkward but the runtime model is sound.
- **`Yield` carrying provenance** (`values: [number, string][]`). It costs
  allocation, but it is what makes the happiness and trade reports explicable to
  the player. Keep it.
- **The engine/client split.** `Client` as the interface between the engine and
  whatever is driving a player — human UI or AI — is clean, and it is why the AI
  and the renderer can share a worker without knowing about each other.

---

## Sequencing

Items 1 and 2 are independent of everything and of each other, and both are
largely mechanical. They unlock the most, so do them first — and doing them
before the save/load work in [`03-save-format.md`](./03-save-format.md) makes that work
substantially smaller.

```
1. #private → private ────┐
                          ├──► save/load becomes a generic hydrator
2. singletons → Game ─────┘     (03-design.md, much reduced)

3. rule identity ─────────┬──► 4. declared process() semantics
                          └──► 6. PendingEffect

5. state / view split ───────► also improves state-rewrite Phase 4

7, 8, 9 — independent, any time
```

None of these blocks [`../state-rewrite/`](../state-rewrite/README.md), which
deliberately assumes an unchanged engine. Items 5 and 8 would make its Phase 4
better; the rest are orthogonal.

## Honest caveat

Items 1, 2, 3 and 5 touch every `@civ-clone` package, not just this repository.
That is a coordinated multi-repo change across 325 installed packages, of which
roughly 40 contain code that would need updating. The mechanical items (1, 7) are
codemod-able. Items 2, 3 and 4 need a person per package.

That is a real cost and it is the strongest argument for staging: item 1 alone
delivers most of the serialisation benefit, and item 2 alone delivers most of the
testability benefit. Neither requires the other, and either can be stopped after
without leaving the tree half-migrated — provided the singleton exports and
unnamed-rule support are kept as defaults during the transition, which both
designs above deliberately allow.
