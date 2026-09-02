# 01 — Constraints

Eight findings that determine what a serialisation design can and cannot do,
plus three incidental bugs found while reading.
Each was verified against the installed packages or with a runnable experiment.
Where an experiment is given, run it — the conclusions are not obvious and two
of them rule out approaches that look reasonable on paper.

## 1. Private slots can only be installed by the constructor

The whole entity model uses `#private` fields. This is not a style preference
with a reflective workaround; it is a hard language constraint.

```js
class Base { #id; constructor(){ this.#id = 'x'; } id(){ return this.#id; } }
class City extends Base {
  #name; #player;
  constructor(player, name){ super(); this.#player = player; this.#name = name; }
  name(){ return this.#name; }
}

const bare = Object.create(City.prototype);
bare.name();
// TypeError: Cannot read private member #name from an object whose class did
//            not declare it

Object.assign(bare, new City({}, 'Rome')).name();   // same TypeError
structuredClone(new City({}, 'Rome')).name();       // not a function — prototype lost

Object.keys(new City({}, 'Rome'));                  // []
Object.getOwnPropertyNames(new City({}, 'Rome'));   // []
JSON.stringify(new City({}, 'Rome'));               // {}
```

`Object.create(Class.prototype)` produces an object that passes `instanceof` but
has no private slots, so every method on it throws. `Object.assign` cannot copy
them. `structuredClone` discards the prototype. No reflection sees them.

**Consequence.** There is no generic, class-agnostic rehydrator. Every
serialisable class must run its own constructor, which means every serialisable
class must participate in its own restoration. This single fact eliminates the
"walk the JSON and reconstruct" approach that most JS serialisers use, and it is
why the design in [`03-save-format.md`](./03-save-format.md) is a per-class contract rather
than a framework.

## 2. Constructors have side effects

Constructors are not passive initialisers. They process rules:

```ts
// core-player/Player.ts
constructor(ruleRegistry = ruleRegistryInstance) {
  super();
  this.#ruleRegistry = ruleRegistry;
  this.#ruleRegistry.process(Added, this);          // side effect
  this.addKey('actions', 'civilization', 'mandatoryActions');
}

// core-city/City.ts
constructor(player, tile, name, ruleRegistry = ..., workedTileRegistry = ...) {
  // ...
  [this.#tiles] = this.#ruleRegistry.process(Tiles, this);   // derived + cached
  this.#ruleRegistry.process(Created, this);                 // side effect
}

// core-unit/Unit.ts
constructor(city, player, tile, ruleRegistry = ruleRegistryInstance) {
  // ...
  this.#ruleRegistry.process(Created, this);                 // side effect
}
```

`Created` rules register the entity in registries, apply visibility, emit engine
events, and deduct build costs. Re-running them during a load would double the
game state and spray events at the renderer.

Note the mix: `City` uses rule processing for **both** a side effect (`Created`)
and a derived-and-cached field (`#tiles`). Hydration must suppress the first and
keep the second. That rules out a blunt "construct with an empty registry".

## 3. Every stateful class takes its registries as injectable parameters

This is the finding that makes the rest tractable.

```ts
constructor(player: Player, tile: Tile, name: string,
            ruleRegistry: RuleRegistry = ruleRegistryInstance,
            workedTileRegistry: WorkedTileRegistry = workedTileRegistryInstance)
```

Every one of the 24 stateful classes follows this pattern: dependencies injected,
singletons as defaults. So a caller can pass a registry that *selectively*
suppresses rule processing.

### Verified

```js
const EVENT_RULES = new Set(['Created', 'Added', 'Built', 'Destroyed', 'Captured']);

class HydrationRuleRegistry {
  #inner; #hydrating = true;
  constructor(inner){ this.#inner = inner; }
  process(type, ...args){
    if (this.#hydrating && EVENT_RULES.has(type)) return [];  // skip side effects
    return this.#inner.process(type, ...args);                 // allow computation
  }
  finish(){ this.#hydrating = false; }
}
```

Running the model in `04-implementation.md` §Appendix against this:

```
normal:  name=Rome tiles=tiles-around-Rome createdCount=1
hydrate: name=Rome tiles=tiles-around-Rome createdCount=0   ← side effects suppressed
derived field survived:  YES
post-hydrate rules live: ran normally
```

The derived-and-cached `#tiles` still computes, `Created` does not fire, and the
object behaves normally once `finish()` is called.

**But this is not sufficient on its own.** `EVENT_RULES` is an open set — any
plugin can define a new rule type with side effects, and hydration would fire it
silently. That is an unbounded correctness risk, and it is the reason
[`03-save-format.md`](./03-save-format.md) will reject "suppression alone" in favour of an
explicit per-class contract that *uses* suppression as its mechanism.

## 4. Static rules need no serialising — but one dynamic rule does

Rules hold `#enabled`, which is mutable. That looks like state. Mostly it is not.

There are exactly three runtime `disable()` sites in the whole dependency tree,
and all three are **balanced within a single synchronous call** — a re-entrancy
guard idiom, not state:

```ts
// civ1-player/Rules/Player/action.ts — prevents infinite recursion
new Criterion((player: Player) => {
  endOfTurnRule.disable();
  const otherActions = player.mandatoryActions();
  endOfTurnRule.enable();
  return otherActions.length === 0;
})

// civ1-player/Rules/Player/defeated.ts — avoids re-entering Defeated while
// destroying the defeated player's units; restores prior enabled state exactly
const defeatedRules = ruleRegistry.get(Defeated).map((rule) => [rule, rule.enabled()]);
defeatedRules.forEach(([rule]) => rule.disable());
unitRegistry.getByPlayer(player).forEach((unit) => unit.destroy(defeatingPlayer));
defeatedRules.forEach(([rule, enabled]) => { if (enabled) rule.enable(); });

// civ1-spaceship/Rules/Spaceship/active.ts — same shape
```

Find them with:

```bash
grep -Rn "\.disable()\|\.enable()" node_modules/@civ-clone/ --include='*.ts' \
  | grep -v tests | grep -v "core-rule/Rule.ts"
```

So for the 17 `registerRules.ts` files — every rule registered at import time —
`RuleRegistry` is a definition registry, rebuilt identically on every boot, and
nothing about it is saved.

### The exception: Darwin's Voyage

Exactly one site registers a rule **at runtime, from inside an `Effect`**:

```bash
for f in $(grep -Rl "ruleRegistry.register" node_modules/@civ-clone/ --include='*.ts' \
           | grep -v tests | grep -v registerRules); do
  grep -q "new Effect" "$f" && echo "$f"
done
# → civ1-wonder/Rules/City/building-complete.ts
```

```ts
// civ1-wonder/Rules/City/building-complete.ts — Darwin's Voyage
createOnStarted = (action: () => void) => {
  const onStarted = new Started(
    new Criterion((startedPlayerResearch) => startedPlayerResearch === playerResearch),
    new Effect(() => {
      ruleRegistry.unregister(onStarted);   // one-shot: removes itself
      action();
    })
  );

  ruleRegistry.register(onStarted);
};
```

This is a **continuation stored as a closure**. It captures a live
`PlayerResearch` by identity and waits for the player's next research to start,
then grants a free advance and deletes itself.

It cannot be serialised. Closures have no reachable body, no identity, and no
declarative form. Save a game between building Darwin's Voyage and starting the
next research, and on load the pending rule is gone — the player silently loses
an advance they paid 300 shields for. No error, no warning.

**Consequence.** The finding is narrower than it first appears:

- Static rules (all 17 registration files): not saved, rebuilt by import. ✅
- Dynamic rules: currently unserialisable. There is one, and it must be
  converted into state before save/load can be called correct.

The fix is a `PendingEffect` entity — a serialisable descriptor of "when X
happens to entity Y, do Z" held in a registry, rather than a closure held in
`RuleRegistry`. See [`02-design-review.md`](./02-design-review.md) §8; it is the
one place where save/load forces a design change rather than merely benefiting
from one.

This is also a good argument for auditing the pattern rather than banning it: one
occurrence today, but nothing stops the next plugin author reaching for it, and
nothing would tell them it breaks saves.

## 5. The entity graph is a DAG

The DTO produced by `toPlainObject` is densely cyclic — `unit → tile → units →
unit`, `city → player → cities → city`. That is misleading. Those cycles come
from `AdditionalData` providers doing registry lookups at serialisation time, not
from fields.

The actual fields:

| Class | Private fields holding entity references |
| ----- | ---------------------------------------- |
| `Player` | `#civilization` only |
| `City` | `#player`, `#originalPlayer`, `#tile`, `#tiles` |
| `Unit` | `#city`, `#player`, `#tile` |
| `Tile` | `#map`, `#terrain` (`#neighbours` is a derived cache) |
| `PlayerWorld` | `#player`, `#world`, `#tiles` |
| `PlayerTile` | `#player`, `#tile` |

`Player` has no `#cities` and no `#units`. `Tile` has no `#units` and no `#city`.
Those relationships live in `CityRegistry` and `UnitRegistry` and are queried:

```ts
new AdditionalData(Player, 'cities', (player) => cityRegistry.getByPlayer(player));
new AdditionalData(Tile,   'units',  (tile)   => unitRegistry.getByTile(tile));
```

**Consequence.** Hydration is a single forward pass in topological order:

```
World → Terrain → Tile → Player → Civilization/Leader → PlayerWorld →
PlayerTile → City → Unit → per-entity components → registry membership
```

No fixup phase is needed for the ordinary graph. The design still carries a
deferred-reference escape hatch for surprises (a plugin could add a field that
breaks the order), but it should be rare enough to assert on.

## 6. Registries split into definitions and state

43 registry classes, all with singleton instances. The split is structural:

**12 `ConstructorRegistry` — hold classes, populated at plugin import. Never
saved.**

`AdvanceRegistry`, `AIClientRegistry`, `AvailableGovernmentRegistry`,
`AvailableTerrainFeatureRegistry`, `AvailableTradeRateRegistry`,
`CivilizationRegistry`, `GeneratorRegistry`, `LayoutRegistry`, `LeaderRegistry`,
`PathFinderRegistry`, `TerrainRegistry`, `YieldRegistry`.

These double as the **name → constructor lookup** that hydration needs for type
marker classes (`Bronzeworking`, `Grassland`, `Settlers`). That machinery already
exists; it just has no `getByName`.

**31 `EntityRegistry` — hold instances. Candidates for saving.**

Three sub-categories, and the distinction matters:

| Kind | Registries | Saved? |
| ---- | ---------- | ------ |
| Pure game state | `CityRegistry`, `UnitRegistry`, `PlayerRegistry`, `PlayerWorldRegistry`, `CityBuildRegistry`, `CityGrowthRegistry`, `PlayerResearchRegistry`, `PlayerTreasuryRegistry`, `PlayerGovernmentRegistry`, `PlayerTradeRatesRegistry`, `SpaceshipRegistry`, `GoodyHutRegistry`, `InteractionRegistry`, `WorkedTileRegistry`, `CityImprovementRegistry`, `UnitImprovementRegistry`, `TileImprovementRegistry`, `WonderRegistry`, `TransportRegistry`, `AvailableCityBuildItemsRegistry`, `StrategyNoteRegistry` | Yes |
| Pure definitions | `RuleRegistry`, `AdditionalDataRegistry`, `StrategyRegistry`, `CityNameRegistry`, `TraitRegistry`, `CivilizationStartTileRegistry` | No — rebuilt by import |
| Mixed | `TerrainFeatureRegistry`, `AttributeRegistry`, `LandMassRegistry` | Yes, filtered |
| Runtime adapters | `ClientRegistry` | **No** — see below |

`TerrainFeatureRegistry` receives definitions from
`civ1-world/registerTerrainFeatures.ts` at import *and* runtime entries from
`core-terrain-feature/Rules/Feature.ts`. Saving it wholesale then loading into a
freshly-booted engine would duplicate the definitions, because `register()`
dedupes by object identity and a reloaded definition is a different instance.

The resolution is in [`03-save-format.md`](./03-save-format.md): registry membership is
saved as id lists filtered to ids present in the save's entity table. Definitions
registered at import never appear there, so mixed registries fall out correctly
with no per-registry special-casing.

`ClientRegistry` holds `DataTransferClient` and `SimpleAIClient` instances. These
are transport adapters, not game state — they hold a `Transport`, an
`EventEmitter` and pending promises. They must be **recreated** on load from a
descriptor (`{ playerId, kind: 'human' | 'ai' }`), never serialised.

### One asymmetry to remember

`civ1-player/Rules/World/built.ts` calls
`civilizationRegistry.unregister(civilization.sourceClass())` and the same for
leaders, so each civilisation is claimed by at most one player. A fresh boot
re-registers all of them. **Loading must re-apply those unregistrations**, driven
from the restored players' civilisations. No extra save data is needed — but
forgetting it lets a later game hand out a duplicate civilisation.

## 7. Entity ids collide across a reload

`DataObject` ids come from a module-level counter, keyed by class name:

```ts
const idCache: { [key: string]: number | bigint } = {},
  idProvider = (object: DataObject) => {
    const className = object.sourceClass().name;
    // ...
    return className + '-' + (++idCache[className]).toString(36);
  };
```

The counter resets when the module is re-evaluated:

```
boot 1: City-1, City-2, City-3
boot 2: City-1, City-2, City-3
```

**Consequence.** Load a save containing `City-1`…`City-9`, found a new city, and
it is issued `City-1` — colliding with a live entity. The save must carry the id
counters and restore them before hydrating. `core-data-object` needs a small
export for this; there is currently no way to read or write `idCache`.

## 8. About 70% of state is reachable through existing public methods

For the 24 stateful classes — roughly 100 private fields:

| Class | Private fields | Injectable registries | `set*` methods |
| ----- | -------------: | --------------------: | -------------: |
| `Unit` | 10 | 2 | 13 |
| `City` | 8 | 2 | 1 |
| `Player` | 2 | 1 | 2 |
| `World` | 6 | 2 | 0 |
| `Tile` | 7 | 1 | 2 |
| `PlayerWorld` | 4 | 1 | 0 |
| `PlayerTile` | 4 | 1 | 0 |
| `CityBuild` | 6 | 2 | 0 |
| `CityGrowth` | 5 | 1 | 1 |
| `PlayerResearch` | 7 | 2 | 0 |
| `PlayerTreasury` | 5 | 2 | 0 |
| `PlayerGovernment` | 4 | 2 | 0 |
| `PlayerTradeRates` | 2 | 0 | 2 |
| `Spaceship` | 9 | 1 | 0 |
| `GoodyHut` | 2 | 1 | 0 |
| `CityImprovement` | 3 | 2 | 0 |
| `Civilization` | 3 | 2 | 2 |
| `Interaction` | 4 | 1 | 0 |
| `Yield` | 2 | 0 | 0 |
| `Turn` | 1 | 0 | 0 |
| `Year` | 3 | 1 | 0 |
| others (3) | ~4 | ~1 | 0 |

Three patterns:

- **Already fine.** `Unit` is fully restorable: constructor covers `#city`,
  `#player`, `#tile`; `setActive`, `setBusy`, `setStatus`, `setWaiting`,
  `setDestroyed` cover the rest; `#moves` is a `Yield`, and
  `unit.moves().set(n)` works. `Player` is fully covered by the constructor plus
  `setCivilization`.
- **Restorable behaviourally.** `PlayerTreasury.set(value)` restores a gold
  total. `PlayerResearch` has `add()` and `addAdvance()` — but `addAdvance`
  processes `Complete` rules, so it needs suppression.
- **Genuinely missing.** `Turn` exposes only `increment()`, so restoring turn 150
  means calling it 150 times. `Spaceship` has nine fields and no setters —
  `#launched`, `#successful` and `#landingTurn` are reachable only through
  `launch()`, which fires rules and rolls a random number. `CityBuild.#building`
  and `#progress` have no restore path.

**Consequence.** The gap is real but small and enumerable: roughly 30 accessors
across a dozen classes. That is the actual work, and it is why the recommended
design adds an explicit contract rather than trying to be clever with the
existing API.

## 9. Incidental bugs found

Not serialisation issues, but found while reading and worth fixing.

### `PlayerTile.#additionalData` is write-only

```ts
private setAdditionalData(): void {
  this.#additionalDataRegistry.getByType(Tile).forEach((additionalData) => {
    this.#additionalData[additionalData.key()] = additionalData.data(this.#tile);  // written

    Object.defineProperty(this, additionalData.key(), {
      configurable: true,
      value: () => additionalData.data(this.#tile),   // this is what actually serves reads
    });

    this.addKey(additionalData.key());
  });
}
```

`#additionalData` is assigned and never read anywhere in the class. The live
values come from the `defineProperty` accessors. So it is a pure retainer: one
entry per provider per `PlayerTile`, holding whatever `additionalData.data(tile)`
returned — cities, units, improvements — and refreshed (not cleared) on every
`update()`. With one `PlayerWorld` per player and up to one `PlayerTile` per
discovered tile, this is thousands of unnecessary strong references.

Deleting the field should be behaviour-neutral. Verify with a grep for
`#additionalData` in `core-player-world/PlayerTile.ts` — there are six matches
and none of them read it.

### `PlayerWorld` lookups are linear scans

```ts
get(x: number, y: number): PlayerTile | UndiscoveredTile {
  const [tile] = this.entries().filter((tile) => tile.x() === x && tile.y() === y);
  // ...
}

getByTile(tile: Tile): PlayerTile | null {
  const [found] = this.filter((playerTile) => playerTile.tile() === tile);
  return found ?? null;
}
```

Both scan every discovered tile, and `filter` calls `entries()` which returns the
backing array — so `filter` allocates a closure per call over up to 4,000
elements. `DataTransferClient` calls `getByTile` on every `unit:moved` and inside
the reveal-map cheat's per-tile loop.

A `Map<string, PlayerTile>` keyed by `x,y` plus a `Map<Tile, PlayerTile>`, both
maintained in `register()`, makes both O(1). This is the same fix already applied
to the renderer's `World` class in June 2026.

### `World.entries()` versus `PlayerWorld.entries()`

`World.entries()` returns `this.#tiles.entries()`, which `EntityRegistry` copies
via `slice()`. `PlayerWorld.entries()` returns `this.#tiles` directly — the live
array. A caller mutating it corrupts the player's world. Return a copy, or make
the difference deliberate and documented.
