# 11 — Phase 6: Lifecycle

**Goal.** Make `restart` and `quit` work, and build the seams that make save and
load possible.

**Depends on.** Phase 3 (`AppContext`, no singletons) and Phase 4 (`resync`).

**Risk.** Low, with one honest caveat below about what "save" can mean here.

## Read this first: save/load is constrained by the engine

**The engine has no serialisation.** There is no save, no load, no state export
anywhere in `@civ-clone/core-engine` or the core packages — the world, players,
units, cities and every registry live only as object graphs in worker memory.
And the engine is out of scope by the ground rules in
[`README.md`](./README.md).

So a conventional "write the game state to a file and read it back" is not
available. Two things are:

1. **Restart and quit**, which need only wiring. Fully deliverable here.
2. **Replay-based saves**: record the seed plus every action, and reconstruct a
   game by replaying it into a fresh engine. Deliverable, with real limits.

What is *not* deliverable is a snapshot save. Do not build a frontend-store
export and call it a save — the store is a filtered, fog-of-war-limited replica
of one player's view. It cannot reconstruct the engine, and shipping it as
"save" would be a bug factory.

If a true save is wanted later, the engine work it needs is scoped at the end of
this document.

## Part A — `restart` and `quit`

Both channels are already typed in `TransportDataMap`. Neither has a receiver:

- the backend sends `restart` on local-player defeat
  (`DataTransferClient.ts:749`) and nothing listens;
- `MainMenu` sends `quit` (`MainMenu.ts:86`) and nothing listens.

`memory-growth-analysis-2026-07.md` §D1 also flags that if a second `gameData`
ever arrived, the old `gameDataPatch` handler would still be mutating the *first*
game's `objectMap` closure. After Phase 3 there is no closure — `AppContext`
holds the state — so a clean teardown becomes possible.

### Frontend: `restart`

```ts
// controllers/GameController.ts
transport.receive('restart', () => {
  new ConfirmationWindow(
    t('Restart.title'),
    t('Restart.body'),
    () => this.teardown(),
    { canCancel: false }
  );
});

private teardown(): void {
  this.#disposers.splice(0).forEach((dispose) => dispose());
  this.#store.clear();
  document.querySelectorAll('dialog.window').forEach((d) => (d as HTMLDialogElement).close());
  this.#elements.game.classList.remove('active');
  this.#mainMenu.show();
}
```

`store.clear()` fires `onDelete` for every entity, which drops every view and
every selector cache entry — the reason `EntityStore.clear` was specified that
way in [`03-store-spec.md`](./03-store-spec.md).

Everything a controller creates — transport listeners, intervals, `watch`
disposers, `beforeunload` handlers, the debug panel — must have been pushed to
`context.disposers` in Phase 3. **Audit that before writing this**: a missed
disposer becomes a leak that only shows up after several restarts, which is
exactly the kind of bug this project has already spent a lot of time on.

### Backend: `restart`

```ts
// Game.ts
transport.receive('restart', () => {
  this.#localPlayerClient?.dispose();
  this.#localPlayerClient = null;
  // The engine cannot be torn down in-process; see below.
  postMessage({ channel: 'reload', data: null });
});
```

The engine registries (`playerRegistryInstance`, `unitRegistryInstance`,
`cityRegistryInstance`, ...) are module-level singletons with no reset. A second
`engine.start()` in the same worker would append to the first game's state.

**So restart replaces the worker rather than resetting it.** The frontend
terminates the old worker and constructs a new one:

```ts
private restartWorker(): void {
  this.#worker.terminate();
  this.#worker = new Worker('dist/backend.js');
  this.#transport = new WorkerTransport(this.#worker);
}
```

That is clean, fast (worker startup is dominated by plugin import, which is
already on the critical path today), and it sidesteps the registry problem
entirely without touching the engine. Do not attempt an in-process reset.

`DataTransferClient` needs a `dispose()` that removes its engine listeners —
it registers 24 via `engineInstance.on(...)` and currently removes
none. With `terminate()` that is academic for restart, but it is not academic
for tests, which construct clients repeatedly in one process.

### `quit`

```ts
// Game.ts
transport.receive('quit', () => {
  this.#localPlayerClient?.dispose();
  postMessage({ channel: 'quit', data: null });
});
```

The frontend terminates the worker on the acknowledgement and returns to the
main menu. Same path as restart, minus the new worker until a game is started.

### Tests

- restart tears down: after `teardown()`, `store.size()` is 0, no `dialog.window`
  is open, and `context.disposers` is empty.
- restart then new game: two consecutive games leave one worker and one set of
  listeners. Assert on `transport` listener count.
- `quit` from the main menu during a game returns to the menu with no console
  errors.

## Part B — replay-based saves

### How it works

A game is fully determined by its options, its seed, and the ordered list of
player actions — *provided* the engine is deterministic under a seeded PRNG.
Phase 0 established the seeding; this builds on it.

```ts
// src/js/Engine/ReplayLog.ts
export type ReplayLog = {
  version: 1;
  createdAt: number;
  seed: number;
  options: Record<string, unknown>;
  /** Every action and choice, in the order the backend received them. */
  entries: Array<
    | { t: 'action'; turn: number; data: TransportPlayerAction }
    | { t: 'choice'; turn: number; key: string; id: string }
  >;
};
```

The backend appends to the log in `DataTransferClient`'s `action` handler and
its `chooseFromList` resolution — the two points where non-deterministic input
enters. Persist via the existing `Store` IndexedDB wrapper
(`src/js/UI/Store.ts`) in a `civ-clone-saves` store.

Loading: start a worker with the same seed and options, then feed `entries` back
in as if they were arriving from the UI, with rendering suppressed until the log
is exhausted.

### The limits, stated plainly

- **Load time is proportional to game length.** A 200-turn game replays 200
  turns of AI. Expect seconds to tens of seconds. Show progress; do not pretend
  it is instant.
- **It breaks on any change that alters the sequence of `Math.random()` calls.**
  A dependency bump, an AI change, a new plugin — any of these can invalidate
  every existing save. Stamp the log with the `build.json` version and refuse to
  load a mismatch with a clear message rather than replaying into a divergent
  game.
- **It requires full determinism.** Phase 0's grep for module-scope
  `Math.random` capture determines whether this holds. If any package captured
  it, replay is unreliable and this part should be shipped as a debug feature
  only, clearly labelled.

Given those limits, ship it as **"Save replay" / "Load replay"** rather than
"Save game". It is genuinely useful — bug reports become reproducible, and the
Phase 0 fixtures get a first-class capture path — and it does not promise
something it cannot deliver.

### Scope discipline

Build the log and its persistence. Do **not** build save-slot management, cloud
sync, or autosave in this phase. One save, one load, one clearly-labelled
limitation.

## What a real save would need

For whoever picks this up upstream. All of it is engine work, out of scope here:

1. `toPlainObject` already serialises a `DataObject` graph — the readable half
   exists. The missing half is `fromPlainObject`: a registry mapping class names
   to constructors that can rebuild an instance from a plain object and re-link
   `#ref`s.
2. Registry reset and rehydrate: every `instance as xRegistry` singleton needs
   `clear()` and `restore(entities)`.
3. Rule and event re-registration: rules are registered as plugin side effects
   at import, so they survive a reload. Rules holding closed-over state would not.
4. A schema version on the save, and a migration path.

That is a meaningful piece of work in `core-data-object` and `core-registry`, and
it would benefit every civ-clone client rather than just this renderer — which is
a good argument for doing it there rather than here.

## Definition of done

- [ ] `restart` shows a confirmation, tears down cleanly, and returns to the main
      menu with a fresh worker.
- [ ] `quit` returns to the main menu and terminates the worker.
- [ ] `DataTransferClient.dispose()` removes every engine listener it added.
- [ ] Teardown tests pass; two consecutive games leak no listeners and no store
      entries.
- [ ] `ReplayLog` records actions and choices; save and load round-trip a
      20-turn game to an identical final state.
- [ ] A build-version mismatch on load is refused with a clear message.
- [ ] The feature is labelled "replay", not "save game", in the UI and the
      translations.
- [ ] `README.md`'s known-issues list is updated: `restart` and `quit` are no
      longer unwired.

## Notes for the executor

- The disposer audit is the real work here. Grep for `addEventListener`,
  `setInterval`, `setTimeout`, `transport.receive` and `engineInstance.on`, and
  confirm each has a teardown path.
- Replacing the worker rather than resetting it is a deliberate decision, not a
  shortcut. Resetting would mean touching engine registries, which the ground
  rules exclude, and worker startup is cheap.
- If replay determinism turns out not to hold, say so in this document and ship
  Part A alone. Part A is worth having on its own and does not depend on Part B.
