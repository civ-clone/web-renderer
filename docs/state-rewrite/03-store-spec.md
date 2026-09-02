# 03 — State Layer Specification

Complete specification for `src/js/UI/State/`. Written so it can be typed in.
Build it in the order given; each file only depends on the ones above it.

**Naming warning.** `src/js/UI/Store.ts` already exists — it is the generic
IndexedDB wrapper behind `AssetStore`. Do not rename it and do not collide with
it. The new entity store is `src/js/UI/State/EntityStore.ts`.

## `types.ts`

```ts
export type EntityId = string;

/** A cross-entity pointer as it arrives on the wire. Never resolved in place. */
export type Ref = { '#ref': EntityId };

/** A serialised entity exactly as the backend produced it. */
export type Entity = {
  /** Class name, e.g. 'City'. */
  _: string;
  /** Inheritance chain, e.g. ['City', 'DataObject']. Used by `instanceOf`. */
  __: string[];
  id: EntityId;
  [key: string]: unknown;
};

export const isRef = (value: unknown): value is Ref =>
  typeof value === 'object' && value !== null && '#ref' in value;
```

`isRef` is used in hot paths. Keep it a plain function, not a class method.

## `EntityStore.ts`

Holds the normalised map. Knows nothing about views, selectors or subscriptions.

```ts
import { Entity, EntityId } from './types';

export type EntityWriter = {
  replace(id: EntityId, entity: Entity): void;
  merge(id: EntityId, fields: Partial<Entity>): void;
  remove(id: EntityId): void;
  raw(id: EntityId): Entity | undefined;
};

export class EntityStore {
  #entities = new Map<EntityId, Entity>();
  #versions = new Map<EntityId, number>();
  #revision = 0;
  #rootId: EntityId | null = null;
  #onDelete = new Set<(id: EntityId) => void>();

  get(id: EntityId): Entity | undefined {
    return this.#entities.get(id);
  }

  has(id: EntityId): boolean {
    return this.#entities.has(id);
  }

  /** 0 when absent. Bumped on every write to the entity. */
  version(id: EntityId): number {
    return this.#versions.get(id) ?? 0;
  }

  /** Bumped once per applied batch. Coarse cache key only. */
  revision(): number {
    return this.#revision;
  }

  rootId(): EntityId | null {
    return this.#rootId;
  }

  setRootId(id: EntityId): void {
    this.#rootId = id;
  }

  size(): number {
    return this.#entities.size;
  }

  ids(): IterableIterator<EntityId> {
    return this.#entities.keys();
  }

  /** Called when an entity is removed, so selector caches can drop its keys. */
  onDelete(handler: (id: EntityId) => void): () => void {
    this.#onDelete.add(handler);

    return () => {
      this.#onDelete.delete(handler);
    };
  }

  /**
   * Runs `mutate`, collecting every id it touched, then bumps the revision.
   * Returns the touched set, for `Subscriptions.notify(...)`.
   * This is the only mutation entry point.
   */
  applyBatch(mutate: (writer: EntityWriter) => void): ReadonlySet<EntityId> {
    const touched = new Set<EntityId>(),
      writer: EntityWriter = {
        replace: (id, entity) => {
          this.#entities.set(id, entity);
          this.#versions.set(id, this.version(id) + 1);
          touched.add(id);
        },
        merge: (id, fields) => {
          const existing = this.#entities.get(id);

          if (existing === undefined) {
            // A delta for an entity we have not seen: treat it as a create.
            this.#entities.set(id, fields as Entity);
          } else {
            Object.assign(existing, fields);
          }

          this.#versions.set(id, this.version(id) + 1);
          touched.add(id);
        },
        remove: (id) => {
          if (!this.#entities.delete(id)) {
            return;
          }

          this.#versions.delete(id);
          touched.add(id);
          this.#onDelete.forEach((handler) => handler(id));
        },
        raw: (id) => this.#entities.get(id),
      };

    mutate(writer);

    this.#revision++;

    return touched;
  }

  clear(): void {
    Array.from(this.#entities.keys()).forEach((id) =>
      this.#onDelete.forEach((handler) => handler(id))
    );

    this.#entities.clear();
    this.#versions.clear();
    this.#rootId = null;
    this.#revision++;
  }
}
```

Design notes:

- **Mutation is in place.** `merge` does `Object.assign`. There is no structural
  sharing and none is wanted: change detection is by version, not by container
  identity.
- **`applyBatch` is the only mutation entry point.** The v1 adapter, the v2
  delta applier and the tests all go through it, so the touched set is always
  complete and the revision moves exactly once per batch.
- **`clear()` is for `restart`** (Phase 6) and for test isolation.

## `tracking.ts`

The dependency recorder. About twenty lines, and everything else depends on it.

```ts
import { EntityId } from './types';

let current: Set<EntityId> | null = null;

/** Called by view proxies on every property read. Hot — keep it trivial. */
export const track = (id: EntityId): void => {
  if (current !== null) {
    current.add(id);
  }
};

/** Runs `fn`, returning its result and every entity id read during it. */
export const withTracking = <T>(fn: () => T): [T, Set<EntityId>] => {
  const previous = current,
    deps = new Set<EntityId>();

  current = deps;

  try {
    return [fn(), deps];
  } finally {
    current = previous;
  }
};

/** Reports ids to the active tracker without re-reading them. */
export const trackAll = (ids: Iterable<EntityId>): void => {
  if (current === null) {
    return;
  }

  for (const id of ids) {
    current.add(id);
  }
};

/** Escape hatch: run `fn` without recording anything. */
export const untracked = <T>(fn: () => T): T => {
  const previous = current;

  current = null;

  try {
    return fn();
  } finally {
    current = previous;
  }
};
```

`withTracking` saves and restores `current`, so nested selectors compose: an
inner selector's dependencies propagate outward via `trackAll`, including on a
cache hit.

## `views.ts`

Lazy `#ref`-resolving proxies. This is the file that replaces
`src/js/UI/lib/reconstituteData.ts`.

```ts
import { Entity, EntityId, isRef } from './types';
import { EntityStore } from './EntityStore';
import { track } from './tracking';

/** Reads the entity id back out of any view. */
export const VIEW_ID = Symbol('civ.viewId');

export class ViewFactory {
  #store: EntityStore;
  #views = new Map<EntityId, any>();
  #children = new WeakMap<object, any>();

  constructor(store: EntityStore) {
    this.#store = store;

    // Drop the proxy when its entity goes, so a stale live view cannot be
    // resurrected by a later entity that reuses the id.
    store.onDelete((id) => {
      this.#views.delete(id);
    });
  }

  /**
   * A stable, live proxy over the entity. `view(id) === view(id)` always.
   * Reads always see current store contents.
   */
  view<T = any>(id: EntityId | null | undefined): T | null {
    if (id === null || id === undefined) {
      return null;
    }

    const cached = this.#views.get(id);

    if (cached !== undefined) {
      return cached;
    }

    const proxy = this.#createEntityView(id);

    this.#views.set(id, proxy);

    return proxy;
  }

  /** The root `TransferObject` view — replaces the old `data` variable. */
  root<T = any>(): T | null {
    return this.view<T>(this.#store.rootId());
  }

  #createEntityView(id: EntityId): any {
    const store = this.#store,
      resolve = (value: unknown) => this.#resolve(value);

    return new Proxy(Object.create(null) as Record<string, unknown>, {
      get(_target, property) {
        if (property === VIEW_ID) {
          return id;
        }

        track(id);

        const entity = store.get(id);

        if (entity === undefined) {
          // Removed while something still holds the view. `id` stays readable
          // so callers can report which entity vanished.
          return property === 'id' ? id : undefined;
        }

        return resolve(entity[property as string]);
      },

      has(_target, property) {
        track(id);

        const entity = store.get(id);

        return entity !== undefined && property in entity;
      },

      ownKeys() {
        track(id);

        const entity = store.get(id);

        return entity === undefined ? [] : Reflect.ownKeys(entity);
      },

      getOwnPropertyDescriptor(_target, property) {
        track(id);

        const entity = store.get(id);

        if (entity === undefined || !(property in entity)) {
          return undefined;
        }

        // `configurable: true` is required: the target does not carry this
        // property, so a non-configurable descriptor breaks proxy invariants.
        return {
          configurable: true,
          enumerable: true,
          writable: false,
          value: resolve(entity[property as string]),
        };
      },

      set() {
        throw new TypeError(
          'Entity views are read-only; mutate through EntityStore.applyBatch.'
        );
      },

      deleteProperty() {
        throw new TypeError('Entity views are read-only.');
      },
    });
  }

  #resolve(value: unknown): unknown {
    if (value === null || typeof value !== 'object') {
      return value;
    }

    if (Array.isArray(value)) {
      return this.#arrayView(value);
    }

    if (isRef(value)) {
      return this.view(value['#ref']);
    }

    return this.#plainView(value as Record<string, unknown>);
  }

  /**
   * Arrays and nested plain objects belong to exactly one entity, so they are
   * cached weakly against the raw value. When the entity is replaced the raw
   * value changes identity and the cache invalidates itself.
   */
  #arrayView(raw: unknown[]): unknown[] {
    const cached = this.#children.get(raw);

    if (cached !== undefined) {
      return cached;
    }

    const resolve = (value: unknown) => this.#resolve(value),
      proxy = new Proxy(raw, {
        get(target, property, receiver) {
          const value = Reflect.get(target, property, receiver);

          // Array methods pass through unwrapped: they read elements via
          // indexed gets, which hit this same trap and resolve correctly.
          if (
            typeof property === 'symbol' ||
            typeof value === 'function' ||
            property === 'length'
          ) {
            return value;
          }

          return resolve(value);
        },
      });

    this.#children.set(raw, proxy);

    return proxy;
  }

  #plainView(raw: Record<string, unknown>): Record<string, unknown> {
    const cached = this.#children.get(raw);

    if (cached !== undefined) {
      return cached;
    }

    const resolve = (value: unknown) => this.#resolve(value),
      proxy = new Proxy(raw, {
        get(target, property, receiver) {
          const value = Reflect.get(target, property, receiver);

          return typeof property === 'symbol' ? value : resolve(value);
        },
      });

    this.#children.set(raw, proxy);

    return proxy;
  }
}
```

### What works through a view

- `view.name`, `view.growth.size`, `view.player.civilization.leader.name`
- `view.units.map(...)`, `.filter(...)`, `.length`, `for...of`, `[...view.units]`
- `Object.entries(view)`, spread, `in`
- `instanceOf(view, 'City')` — `__` is a plain array of strings
- `viewA === viewB` for the same entity — **this is the point**

### What does not, and why

- **Mutation.** Views throw on `set` and `delete`. Anything that mutated the old
  reconstituted graph was a latent bug and needs finding — see the
  copy-before-sort fixes already applied in `Map/Units.ts` and `Map/Yields.ts`.
- **`JSON.stringify(view)`.** The graph is cyclic; it throws. Use `resolveDeep`
  below, and only in tests or debug tooling.
- **`structuredClone(view)`.** Proxies are not cloneable. Never post a view
  across the worker boundary.
- **A removed entity.** Reads return `undefined` (except `id`). Selectors must
  tolerate this — cities get captured and units die, so deletion is a normal
  event, not an error. Prefer `?.` and filter empties.

### `resolveDeep` — tests and debugging only

Produces exactly what `reconstituteData` produced. This is the oracle the
Phase 1 golden test compares against. It must never be called at runtime.

```ts
export const resolveDeep = (store: EntityStore, id: EntityId): unknown => {
  const seen = new Map<object, unknown>(),
    walk = (value: unknown): unknown => {
      if (value === null || typeof value !== 'object') {
        return value;
      }

      if (seen.has(value)) {
        return seen.get(value);
      }

      if (Array.isArray(value)) {
        const out: unknown[] = [];

        seen.set(value, out);
        value.forEach((entry) => out.push(walk(entry)));

        return out;
      }

      if (isRef(value)) {
        const out = walk(store.get(value['#ref']));

        seen.set(value, out);

        return out;
      }

      const out: Record<string, unknown> = {};

      seen.set(value, out);
      Object.entries(value).forEach(([key, entry]) => {
        out[key] = walk(entry);
      });

      return out;
    };

  return walk(store.get(id));
};
```

`seen` is keyed by source object identity, matching `reconstituteData` exactly —
including the detail that two distinct `#ref` literals pointing at the same
entity resolve to the same output object.

## `selectors.ts`

```ts
import { EntityId } from './types';
import { EntityStore } from './EntityStore';
import { trackAll, withTracking } from './tracking';

type CacheEntry<R> = {
  value: R;
  deps: Set<EntityId>;
  versions: Map<EntityId, number>;
};

export type Selector<A extends unknown[], R> = ((
  store: EntityStore,
  ...args: A
) => R) & {
  /** Drops every cached result. For tests and `restart`. */
  invalidate(): void;
};

const registries = new Set<{ dropByDependency(id: EntityId): void }>();

/** Wire once at startup so deleted entities cannot pin selector caches. */
export const bindSelectorCaches = (store: EntityStore): (() => void) =>
  store.onDelete((id) =>
    registries.forEach((registry) => registry.dropByDependency(id))
  );

export const createSelector = <A extends unknown[], R>(
  compute: (store: EntityStore, ...args: A) => R,
  keyOf: (...args: A) => string = (...args) => args.join(' ')
): Selector<A, R> => {
  const cache = new Map<string, CacheEntry<R>>(),
    isFresh = (store: EntityStore, entry: CacheEntry<R>): boolean => {
      for (const [id, version] of entry.versions) {
        if (store.version(id) !== version) {
          return false;
        }
      }

      return true;
    };

  registries.add({
    dropByDependency: (id) => {
      for (const [key, entry] of cache) {
        if (entry.deps.has(id)) {
          cache.delete(key);
        }
      }
    },
  });

  const selector = ((store: EntityStore, ...args: A): R => {
    const key = keyOf(...args),
      hit = cache.get(key);

    if (hit !== undefined && isFresh(store, hit)) {
      // Report dependencies even on a hit, or a selector calling this one from
      // inside `withTracking` silently loses them.
      trackAll(hit.deps);

      return hit.value;
    }

    const [value, deps] = withTracking(() => compute(store, ...args)),
      versions = new Map<EntityId, number>();

    deps.forEach((id) => versions.set(id, store.version(id)));
    cache.set(key, { value, deps, versions });
    trackAll(deps);

    return value;
  }) as Selector<A, R>;

  selector.invalidate = () => cache.clear();

  return selector;
};
```

Rules for writing selectors:

1. **Read only through views or other selectors.** Reaching into `store.get(id)`
   directly bypasses tracking and produces a selector that never invalidates.
   This is the easiest way to introduce a stale-UI bug — treat any direct
   `store.get` inside a selector as a defect.
2. **Return plain data or stable views.** Building a fresh array on each call is
   fine — the memo makes it once per change — but never return something the
   caller will mutate.
3. **`keyOf` must be injective.** The default joins arguments with a space.
   Override it for object arguments.
4. **Keep them small and compose them.** `selectCityYields` should call
   `selectCity`, not re-walk the entity. Nested tracking makes composition free.

## `subscriptions.ts`

```ts
import { EntityId } from './types';
import { EntityStore } from './EntityStore';
import { withTracking } from './tracking';

type Subscriber = {
  deps: Set<EntityId>;
  notify: () => void;
};

export class Subscriptions {
  #byId = new Map<EntityId, Set<Subscriber>>();
  #global = new Set<Subscriber>();

  /** Subscribes to a fixed dependency set. An empty set means "every batch". */
  observe(deps: Iterable<EntityId>, notify: () => void): () => void {
    const subscriber: Subscriber = { deps: new Set(deps), notify };

    if (subscriber.deps.size === 0) {
      this.#global.add(subscriber);
    } else {
      subscriber.deps.forEach((id) => {
        let set = this.#byId.get(id);

        if (set === undefined) {
          set = new Set();
          this.#byId.set(id, set);
        }

        set.add(subscriber);
      });
    }

    return () => this.#remove(subscriber);
  }

  notify(touched: ReadonlySet<EntityId>): void {
    // Collect first: a subscriber may dispose or re-subscribe during notify.
    const pending = new Set<Subscriber>(this.#global);

    touched.forEach((id) => {
      const set = this.#byId.get(id);

      if (set !== undefined) {
        set.forEach((subscriber) => pending.add(subscriber));
      }
    });

    pending.forEach((subscriber) => subscriber.notify());
  }

  #remove(subscriber: Subscriber): void {
    this.#global.delete(subscriber);
    subscriber.deps.forEach((id) => {
      const set = this.#byId.get(id);

      if (set === undefined) {
        return;
      }

      set.delete(subscriber);

      if (set.size === 0) {
        this.#byId.delete(id);
      }
    });
  }
}
```

### `watch` — re-subscribing on every evaluation

A reader's dependency set changes as the data changes: a city window watching
five units must watch six when one is built. `watch` re-runs the evaluation,
takes the new dependency set, and re-subscribes.

```ts
export const watch = <T>(
  store: EntityStore,
  subscriptions: Subscriptions,
  evaluate: () => T,
  onChange: (value: T) => void,
  { immediate = true }: { immediate?: boolean } = {}
): (() => void) => {
  let dispose: (() => void) | null = null,
    disposed = false,
    last: T;

  const run = (emit: boolean): void => {
    if (disposed) {
      return;
    }

    const [value, deps] = withTracking(evaluate);

    dispose?.();
    dispose = subscriptions.observe(deps, () => run(true));

    const changed = value !== last;

    last = value;

    if (emit && changed) {
      onChange(value);
    }
  };

  run(false);

  if (immediate) {
    onChange(last!);
  }

  return () => {
    disposed = true;
    dispose?.();
    dispose = null;
  };
};
```

The `value !== last` guard is why selectors must be memoised. A selector that
returns a fresh array on every call defeats it and its reader re-renders on
every batch. **If a reader re-renders too often, the fault is almost always an
unmemoised selector, not `watch`.**

## `Component.ts`

The base for reactive UI pieces. Deliberately small.

```ts
import { EntityStore } from './EntityStore';
import { Selector } from './selectors';
import { Subscriptions, watch } from './subscriptions';

export abstract class ReactiveComponent<T extends Node = HTMLElement> {
  #store: EntityStore;
  #subscriptions: Subscriptions;
  #dispose: (() => void) | null = null;
  #element: T | null = null;

  constructor(store: EntityStore, subscriptions: Subscriptions) {
    this.#store = store;
    this.#subscriptions = subscriptions;
  }

  /** Reads a selector; the read is recorded as a dependency of this build. */
  protected use<A extends unknown[], R>(
    selector: Selector<A, R>,
    ...args: A
  ): R {
    return selector(this.#store, ...args);
  }

  protected store(): EntityStore {
    return this.#store;
  }

  /** Produce DOM for the current state. Called under dependency tracking. */
  protected abstract build(): T;

  /** Replace rendered output. Override for finer-grained patching. */
  protected apply(next: T): void {
    this.#element?.parentNode?.replaceChild(next, this.#element);
    this.#element = next;
  }

  mount(parent: Node): void {
    this.#dispose = watch(
      this.#store,
      this.#subscriptions,
      () => this.build(),
      (next) => {
        if (this.#element === null) {
          this.#element = next;
          parent.appendChild(next);

          return;
        }

        this.apply(next);
      }
    );
  }

  element(): T | null {
    return this.#element;
  }

  dispose(): void {
    this.#dispose?.();
    this.#dispose = null;
    this.#element?.parentNode?.removeChild(this.#element);
    this.#element = null;
  }
}
```

`build()` returning a whole new subtree is acceptable for small panels and is
what the existing components already do. Override `apply` where a panel is big
enough for replacement to cost — `City` is the obvious case, and Phase 3 splits
it into sub-components with their own subscriptions rather than optimising the
replacement.

## `index.ts`

Everything outside `State/` imports from here, never from individual files.
That keeps the public surface small enough to change internals freely.

```ts
export { EntityStore } from './EntityStore';
export type { EntityWriter } from './EntityStore';
export { ViewFactory, VIEW_ID, resolveDeep } from './views';
export { createSelector, bindSelectorCaches } from './selectors';
export type { Selector } from './selectors';
export { Subscriptions, watch } from './subscriptions';
export { ReactiveComponent } from './Component';
export { withTracking, untracked } from './tracking';
export { isRef } from './types';
export type { Entity, EntityId, Ref } from './types';
```

## Wiring it together

One instance of each, created at startup and passed down. **No module-level
singletons** — they make tests order-dependent and would block Phase 6's
`restart`.

```ts
// src/js/UI/State/createState.ts
import { EntityStore } from './EntityStore';
import { Subscriptions } from './subscriptions';
import { ViewFactory } from './views';
import { bindSelectorCaches } from './selectors';

export const createState = () => {
  const store = new EntityStore(),
    views = new ViewFactory(store),
    subscriptions = new Subscriptions();

  bindSelectorCaches(store);

  return { store, views, subscriptions };
};

export type State = ReturnType<typeof createState>;
```

## Performance expectations

Record these in Phase 0 and check them after Phase 2.

| Operation | Cost |
| --------- | ---- |
| Apply a delta touching *n* entities | O(n) |
| `view(id)`, cached | one `Map` lookup |
| Property read through a view | one `Map` lookup, one `Set.add`, one resolve |
| Selector, cache hit | O(dependency count) version comparisons |
| Selector, cache miss | cost of `compute` |
| `notify(touched)` | O(touched × subscribers per id) |

### Measured proxy overhead

Benchmarked on the map's worst case — an 80×50 world, eight neighbour lookups
plus one field read per tile, so 32,000 property reads per full pass (Node 22,
Apple silicon):

| Access path | Per full-world pass |
| ----------- | ------------------: |
| Plain flat `TileSnapshot[]` | 0.57 ms |
| View proxies | 3.36 ms |
| View proxies, tracking active | 4.21 ms |

So a proxy read costs about **6× a plain read, 7.4× with tracking on** — roughly
100 ns versus 18 ns. Two conclusions:

- **Irrelevant for panels and windows.** They read tens to hundreds of
  properties per update; even a thousand reads is 0.1 ms.
- **Not irrelevant for the map.** 2.8 ms per full pass, and the blink tick fires
  twice a second. That is why the map layers read flat `TileSnapshot`s instead —
  see [`02-architecture.md`](./02-architecture.md) and
  [`10-phase-5-map-renderer.md`](./10-phase-5-map-renderer.md).

Both figures are dwarfed by what they replace: `reconstituteData` allocates the
entire graph, every flush, several times per turn.
