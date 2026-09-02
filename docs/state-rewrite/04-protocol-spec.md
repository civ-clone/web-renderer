# 04 — Transport Protocol

Two protocols are described here.

- **v1** is what ships today. Phases 1 to 3 run on it unchanged, through an
  adapter, so the frontend can be rebuilt without touching the worker.
- **v2** replaces it in Phase 4. It is what removes the whole-subtree snapshots.

The `Transport` / `AbstractTransport` / `ParentTransport` / `WorkerTransport`
abstraction does **not** change. Only the payloads on `gameData` and
`gameDataPatch` change, plus one new channel.

## v1 — what arrives today

### `gameData`

Sent once, from `DataTransferClient.sendInitialData()`. `WorkerTransport.send`
detects the `DataObject` and calls `toPlainObject()`, producing:

```ts
{
  hierarchy: { '#ref': 'TransferObject-1' },
  objects: {
    'TransferObject-1': { _: 'TransferObject', __: [...], id: '...',
                          player: { '#ref': 'Player-1' }, turn: {...}, year: {...} },
    'Player-1': { ... },
    // ...every entity reachable from the root
  }
}
```

`WorkerTransport.receive` reconstitutes it before calling the handler, but also
passes the raw `ObjectMap` as the second argument. The current `Renderer`
ignores the reconstituted first argument entirely and uses the raw one
(`Renderer.ts:1202`) — so for `gameData` that reconstitution is 100% wasted work
today.

### `gameDataPatch`

An array of `DataPatch`, each an object keyed by target entity id:

```ts
type DataPatch = {
  [targetId: string]: {
    type: 'add' | 'remove' | 'update';
    index: string | null;   // e.g. 'units[3]' — a path *inside* the target
    value?: { hierarchy: PlainObject; objects: Record<string, PlainObject> };
  };
};
```

Three things to know before writing the adapter:

1. **`value.objects` carries the real payload.** `value.hierarchy` is almost
   always just `{ '#ref': targetId }`; the entities themselves are in
   `value.objects`. The current code assigns `objects[key] = value.hierarchy`
   and then immediately overwrites it from the `value.objects` loop, so that
   first assignment is redundant. Preserve the *ordering*, not the redundancy.
2. **`index` matters only for `add`.** It is used to splice a ref into an array
   inside the target, e.g. `units[3]` on `unit:created`. The adapter must still
   parse and apply it until v2 lands.
3. **`type: 'remove'` never occurs.** The only `DataQueue.remove` call site is
   commented out (`DataTransferClient.ts:519`). Implement it in the adapter
   anyway — it is three lines and it stops being dead the moment v2 lands.

### v1 adapter

Lives at `src/js/UI/State/legacy/applyV1.ts` and is **deleted in Phase 4**.

```ts
import { Entity, EntityId, EntityStore, EntityWriter } from '../index';

type ObjectMap = {
  hierarchy: Record<string, any>;
  objects: Record<string, any>;
};

type V1Patch = Record<
  string,
  { type: 'add' | 'remove' | 'update'; index?: string | null; value?: ObjectMap }
>;

const pathParts = (path: string): string[] =>
  path.replace(/]/g, '').split(/[.[]/);

const writeObjects = (writer: EntityWriter, objects: Record<string, any>) => {
  Object.entries(objects).forEach(([id, entity]) =>
    writer.replace(id, entity as Entity)
  );
};

/** Initial `gameData`. Replaces the whole store. */
export const applyV1Snapshot = (
  store: EntityStore,
  map: ObjectMap
): ReadonlySet<EntityId> => {
  const rootId: EntityId | undefined = map.hierarchy?.['#ref'];

  return store.applyBatch((writer) => {
    writeObjects(writer, map.objects);

    if (rootId !== undefined) {
      store.setRootId(rootId);
    }
  });
};

/** A `gameDataPatch` array. */
export const applyV1Patches = (
  store: EntityStore,
  patches: V1Patch[]
): ReadonlySet<EntityId> =>
  store.applyBatch((writer) => {
    patches.forEach((patch) =>
      Object.entries(patch).forEach(([targetId, { type, index, value }]) => {
        if (type === 'remove') {
          if (!index) {
            writer.remove(targetId);

            return;
          }

          removeAtPath(writer, targetId, index);

          return;
        }

        if (value === undefined || value.hierarchy === undefined) {
          console.error('v1 patch with no hierarchy', targetId, value);

          return;
        }

        // Order matters: the path write must land before `value.objects`
        // replaces the target wholesale, matching v1 semantics.
        if (index) {
          setAtPath(writer, targetId, index, value.hierarchy);
        }

        writeObjects(writer, value.objects ?? {});
      })
    );
  });
```

`setAtPath` / `removeAtPath` are the `setObjectPath` / `removeObjectPath`
helpers lifted verbatim from `Renderer.ts` (around lines 1225 to 1259), rewritten
to operate on `writer.raw(targetId)` and to call `writer.merge(targetId, {})`
afterwards so the version bump and the touched set are recorded. Do not
re-implement them from the description — copy them, so v1 behaviour is
bit-identical and the Phase 1 golden test is meaningful.

## v2 — the target protocol

### Goals

| Problem in v1 | v2 answer |
| ------------- | --------- |
| Whole player subtree per turn and per action | Field-level diff against a shadow copy |
| No removes; frontend sweeps for garbage | Explicit `del` list |
| String paths applied by parsing | Entity id plus changed fields; no paths |
| No versioning; a lost message is undetectable | Monotonic `v`, plus a resync channel |
| Unbounded flush size | Chunking with `more` |

### Types

`src/js/Engine/Protocol.ts`, imported by both runtimes.

```ts
export const PROTOCOL_VERSION = 2;

export type EntityId = string;

export type EntityFields = Record<string, unknown>;

export type Delta = {
  /** Protocol version. Mismatch is fatal; see the handshake below. */
  p: typeof PROTOCOL_VERSION;
  /** Monotonic sequence number, from 1. Gaps mean a lost message. */
  v: number;
  /** Entity id to changed fields only. Absent when nothing changed. */
  set?: Record<EntityId, EntityFields>;
  /** Entities that no longer exist. */
  del?: EntityId[];
  /** Root entity id. Present only on the first delta and after a resync. */
  root?: EntityId;
  /** True when this delta is one chunk of a larger batch. */
  more?: boolean;
};
```

### Channels

`gameData` and `gameDataPatch` both carry `Delta`. `gameData` is the first,
full delta (every entity in `set`, `root` present); `gameDataPatch` carries
subsequent ones. Keeping both channels avoids a special case for "is this the
first message".

One new channel is added to `TransportDataMap` in `src/js/Engine/Transport.ts`:

```ts
resync: TransportData<Delta, { since: number }>;
```

The frontend sends `resync` with the last `v` it applied when it detects a gap.
The backend replies on the same channel with a full delta (`root` set, every
entity in `set`, `v` continuing the sequence). This is the recovery path for a
dropped or reordered message; without it a gap is silently corrupting.

### Applying a delta

```ts
// src/js/UI/State/applyDelta.ts
import { Delta, PROTOCOL_VERSION } from '../../Engine/Protocol';
import { Entity, EntityId, EntityStore } from './index';

export class DeltaApplier {
  #store: EntityStore;
  #lastVersion = 0;
  #onGap: (since: number) => void;

  constructor(store: EntityStore, onGap: (since: number) => void) {
    this.#store = store;
    this.#onGap = onGap;
  }

  apply(delta: Delta): ReadonlySet<EntityId> {
    if (delta.p !== PROTOCOL_VERSION) {
      throw new Error(
        `Protocol mismatch: got ${delta.p}, expected ${PROTOCOL_VERSION}`
      );
    }

    if (delta.root !== undefined) {
      // A full snapshot or a resync: start from scratch.
      this.#store.clear();
      this.#lastVersion = 0;
    } else if (delta.v !== this.#lastVersion + 1) {
      this.#onGap(this.#lastVersion);

      return new Set();
    }

    const touched = this.#store.applyBatch((writer) => {
      Object.entries(delta.set ?? {}).forEach(([id, fields]) => {
        writer.merge(id, fields as Partial<Entity>);
      });

      (delta.del ?? []).forEach((id) => writer.remove(id));

      if (delta.root !== undefined) {
        this.#store.setRootId(delta.root);
      }
    });

    this.#lastVersion = delta.v;

    return touched;
  }

  lastVersion(): number {
    return this.#lastVersion;
  }
}
```

`merge` is `Object.assign`, so **a delta must send whole fields, never partial
ones**. If a city's `yields` array changed at all, the whole array is sent. That
keeps the applier trivial; array-level diffing is not worth the complexity at
these sizes.

### Producing a delta

`src/js/Engine/ShadowState.ts` keeps the last-sent copy of every entity and
diffs against it.

```ts
import { Delta, EntityFields, EntityId, PROTOCOL_VERSION } from './Protocol';

type PlainObject = Record<string, any>;

export class ShadowState {
  #sent = new Map<EntityId, PlainObject>();
  #version = 0;

  /**
   * Folds a `toPlainObject()` result into the pending delta, returning only
   * what actually changed since the last send.
   */
  diff(objects: Record<EntityId, PlainObject>): Record<EntityId, EntityFields> {
    const set: Record<EntityId, EntityFields> = {};

    Object.entries(objects).forEach(([id, entity]) => {
      const previous = this.#sent.get(id);

      if (previous === undefined) {
        set[id] = entity;
        this.#sent.set(id, structuredClone(entity));

        return;
      }

      const changed: EntityFields = {};

      let any = false;

      Object.entries(entity).forEach(([key, value]) => {
        if (equalField(previous[key], value)) {
          return;
        }

        changed[key] = value;
        previous[key] = structuredClone(value);
        any = true;
      });

      if (any) {
        set[id] = changed;
      }
    });

    return set;
  }

  forget(id: EntityId): void {
    this.#sent.delete(id);
  }

  has(id: EntityId): boolean {
    return this.#sent.has(id);
  }

  ids(): IterableIterator<EntityId> {
    return this.#sent.keys();
  }

  nextVersion(): number {
    return ++this.#version;
  }

  reset(): void {
    this.#sent.clear();
    this.#version = 0;
  }
}

/**
 * Field comparison. Values are `#ref` objects, primitives, arrays of those, or
 * small plain objects — never deep or cyclic, because refs terminate recursion.
 */
const equalField = (a: unknown, b: unknown): boolean => {
  if (a === b) {
    return true;
  }

  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return false;
  }

  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    return (
      a.length === b.length && a.every((entry, i) => equalField(entry, b[i]))
    );
  }

  const aKeys = Object.keys(a as PlainObject),
    bKeys = Object.keys(b as PlainObject);

  return (
    aKeys.length === bKeys.length &&
    aKeys.every((key) =>
      equalField((a as PlainObject)[key], (b as PlainObject)[key])
    )
  );
};
```

`equalField` recursing is safe: `toPlainObject` replaces every nested
`DataObject` with a `{ '#ref': id }`, so values bottom out quickly and cannot be
cyclic. The common comparison — an array of refs against an array of refs —
short-circuits on length, then on one string per element.

### `DeltaBuilder`

Sits where `DataQueue` sits today and has the same call shape, so
`DataTransferClient` changes minimally.

```ts
export class DeltaBuilder {
  #shadow = new ShadowState();
  #pendingSet: Record<EntityId, EntityFields> = {};
  #pendingDel = new Set<EntityId>();
  #rootId: EntityId | null = null;

  /** Replaces `DataQueue.add` and `DataQueue.update` — they were identical. */
  record(produce: () => { hierarchy: PlainObject; objects: Record<string, PlainObject> }): void {
    const { objects } = produce(),
      changed = this.#shadow.diff(objects);

    Object.entries(changed).forEach(([id, fields]) => {
      this.#pendingSet[id] = { ...(this.#pendingSet[id] ?? {}), ...fields };
      this.#pendingDel.delete(id);
    });
  }

  remove(id: EntityId): void {
    this.#pendingDel.add(id);
    delete this.#pendingSet[id];
    this.#shadow.forget(id);
  }

  setRoot(id: EntityId): void {
    this.#rootId = id;
  }

  hasChanges(): boolean {
    return (
      Object.keys(this.#pendingSet).length > 0 || this.#pendingDel.size > 0
    );
  }

  /** Drains into one or more chunked deltas. */
  flush(maxEntitiesPerChunk = 500): Delta[] { /* see chunking below */ }

  reset(): void {
    this.#shadow.reset();
    this.#pendingSet = {};
    this.#pendingDel.clear();
    this.#rootId = null;
  }
}
```

`record` takes a thunk because `DataQueue` already did — serialisation is
deferred to flush time so the engine can settle first. Keep that.

### Chunking

`DataQueue` has a standing TODO to chunk. `flush` splits `set` into chunks of at
most `maxEntitiesPerChunk` entities, marking all but the last `more: true`.
Sequence numbers still increment per chunk. The applier does not need to know —
each chunk is a valid delta and applying them in order is equivalent. `more`
exists so the frontend can defer notification until a batch completes:

```ts
if (delta.more) {
  pendingTouched = union(pendingTouched, applier.apply(delta));
} else {
  subscriptions.notify(union(pendingTouched, applier.apply(delta)));
  pendingTouched = new Set();
}
```

Start at 500. Tune with the Phase 0 instrumentation; the goal is to keep any
single `postMessage` structured clone off the long-frame list.

### Removes

With v2 the backend must emit `del`. Sources, all in `DataTransferClient`:

| Engine event | Emit |
| ------------ | ---- |
| `unit:destroyed` | `del` the unit id |
| `city:destroyed` | `del` the city, its `CityBuild`, `CityGrowth` |
| `city:captured` (from us) | `del` the real city; the `UnknownCity` wrapper takes over |
| End of a negotiation | `del` the negotiation and its interactions |

Anything missed leaks in the frontend store exactly as it does today, so treat a
growing `store.size()` in the Phase 0 harness as the regression signal.

Once `del` is emitted, **`src/js/UI/lib/pruneObjectMap.ts` is deleted** along
with the prune trigger in `Renderer.ts`. A belt-and-braces sweep can be kept as a
debug-only assertion — reachable set versus store keys — but never in the render
path.

### Handshake and versioning

1. Frontend sends `start`.
2. Backend's first `gameData` carries `p: PROTOCOL_VERSION` and `root`.
3. Frontend compares `p`. A mismatch is fatal — show "reload required" rather
   than trying to interoperate. Both bundles are served from the same `dist/`,
   so a mismatch means a stale cached worker, and reloading genuinely fixes it.
4. Every subsequent delta increments `v`. A gap triggers `resync`.

## Migration

Phases 1 to 3 use the v1 adapter. Phase 4 does the switch:

1. Land `Protocol.ts`, `ShadowState.ts`, `DeltaBuilder.ts` with unit tests.
2. Switch `DataTransferClient` from `DataQueue` to `DeltaBuilder`.
3. Switch the frontend from `applyV1*` to `DeltaApplier`.
4. Delete `DataQueue.ts`, `src/js/UI/State/legacy/`, `pruneObjectMap.ts`.

Steps 2 and 3 must land in **one commit** — the protocol is a contract between
two bundles built together, and there is no value in supporting both at once.
The fixtures captured in Phase 0 are v1, so keep the v1 adapter available to the
*test suite* (not the bundle) until v2 fixtures are recorded.
