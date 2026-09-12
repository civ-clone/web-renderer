# Engine Serialisation — Design Study

Can the civ-clone engine be given save/load, and what would it take?

## Verdict

**Yes, and the "rehydrate entities and populate registries" instinct is right —
but only after separating two things the codebase currently conflates.**

`DataObject.toPlainObject()` is a **view serialiser**: fog-of-war filtered,
recursion-terminated by reference filters, and full of rule-computed values
(`Unit.actionsForNeighbours`, `City.yields`, `Player.actions`). It is the wrong
basis for a save. Restoring those values would restore *stale derived data*.

A save needs a **state serialiser**: complete, authoritative, and containing only
fields that cannot be recomputed. That set is far smaller than the DTO — 24
classes and roughly 100 fields across the whole engine.

The recommendation is a `toState()` contract on those 24 classes plus a new
`core-save-game` package. No rewrite of the entity model, and it pays for itself
twice: `toState()` is also exactly what a delta-based transport protocol needs to
diff.

**One prior decision changes the size of the job by roughly an order of
magnitude.** `#private` fields mean private slots can only be installed by
running a constructor, so hydration must go class by class. Swapping them for
TypeScript `private` — a mechanical change — makes
`Object.assign(Object.create(Class.prototype), state)` produce a working
instance, and the save layer collapses into a single generic hydrator. See
[`02-design-review.md`](./02-design-review.md), which reviews that decision and
eight others against the goal of keeping every mechanic tweakable.

## Documents

| # | Document | Contents | Status |
| - | -------- | -------- | ------ |
| 1 | [`01-constraints.md`](./01-constraints.md) | Eight findings about the engine, each verified by experiment, plus three incidental bugs | Written |
| 2 | [`02-design-review.md`](./02-design-review.md) | Long-standing design decisions worth reconsidering, ranked | Written |
| 3 | [`03-save-format.md`](./03-save-format.md) | The save format and hydration protocol | Written |
| 4 | [`04-package-workflow.md`](./04-package-workflow.md) | Coordinating a change across 62 repositories | Written |
| 5 | [`05-engine-plan.md`](./05-engine-plan.md) | Eight staged work packages, in order | Written |

## Progress

| Stage | Status | Notes |
| ----- | ------ | ----- |
| 0 Foundations | **Done** | `web-renderer/tools/` — `civ`, the codemod, the Stage 1 driver, the conformance suite and the hydration spike. See [`../../tools/README.md`](../../tools/README.md). |
| 1 `#private` → `private` | **Converted and verified, awaiting publish** | All 62 packages committed on `master` in their own checkouts; 69 commits. Engine state checksums unchanged, generic hydration proven, no shadowed private fields, no stale compiled output. All twelve waves pass `civ publish --wave N --dry-run`. Nothing pushed, nothing published. |
| 2–7 | Not started | |

The renderer plan follows once `05` is agreed; it consumes Stage 4's `toState()`
and Stage 5's save format, so it is not independent of these.

## Decisions taken

- **`#private` → TypeScript `private` is in scope**, superseding
  `web-renderer-rewrite`'s DEC-011. This is what makes hydration generic.
- **Multiplayer is a genuine target**, so determinism and stable identity are
  prerequisites rather than conveniences.
- **`web-renderer-rewrite` is parked** — its ADRs are reconciled one by one in
  [`05-engine-plan.md`](./05-engine-plan.md), and several of its work packages
  are worth harvesting rather than rebuilding.
- **Stay on `0.1.x`** with range-compatible changes throughout. A `0.2.0` bump
  would require editing 325 `package.json` files and would make the
  `core-player` ↔ `core-world` ↔ `core-world-generator` cycle unpublishable.

## The findings in one table

Each was verified against the installed packages or with a runnable experiment,
not inferred. Details and reproductions in
[`01-constraints.md`](./01-constraints.md).

| # | Finding | Consequence |
| - | ------- | ----------- |
| 1 | `#private` slots can **only** be installed by running the constructor | No generic reflective rehydration is possible. Ever. |
| 2 | Constructors have side effects (`process(Created, this)`) | Hydration must suppress them |
| 3 | Every stateful class takes its registries as **injectable constructor params** | That is the suppression hook — and it needs no engine change |
| 4 | Static rule `enable()`/`disable()` is always balanced within one call — but one rule is registered dynamically as a closure | Static rules are never saved; Darwin's Voyage is an unserialisable continuation that must become state |
| 5 | The entity graph is a **DAG**, not cyclic — `player.cities` is a registry lookup, not a field | Single-pass hydration in topological order |
| 6 | 43 registries: 12 constructor (plugin-rebuilt), 31 entity — three of which mix definitions and state | Membership is saved as id lists filtered to the save's entity table |
| 7 | `DataObject` ids come from a module-level per-class counter that resets on reload | Loading collides with new entities unless counters are restored |
| 8 | ~70% of state is restorable through existing public methods; ~30% has no accessor | The gap is the actual work |

## Scope

This study covers the **engine** — `node_modules/@civ-clone/core-*` and the
`civ1-*` plugins. It deliberately steps outside the "engine stays as-is"
constraint that governs [`../state-rewrite/`](../state-rewrite/README.md),
because that constraint is what makes save/load impossible there.

The two efforts are complementary and independent:

- The state rewrite makes the **renderer** efficient. It needs no engine change.
- This makes the **engine** persistable. It needs no renderer change.

They meet at one point, noted in [`02-design-review.md`](./02-design-review.md) §5: the
`toState()` method introduced here is a better basis for the delta protocol in
[`../state-rewrite/09-phase-4-backend-deltas.md`](../state-rewrite/09-phase-4-backend-deltas.md)
than diffing `toPlainObject` output. That is a reason to do this, not a
dependency between them.

## Bugs found along the way

Incidental findings, unrelated to serialisation but worth fixing. Evidence in
[`01-constraints.md`](./01-constraints.md) §9.

- `PlayerTile.#additionalData` is written on every `setAdditionalData()` and
  **never read** — the live values come from the `Object.defineProperty`
  accessors defined alongside it. It is a pure retainer: one entry per
  `AdditionalData` provider per player tile, refreshed on every `update()`.
- `PlayerWorld.get(x, y)` and `getByTile(tile)` are **linear scans** over every
  discovered tile, and `entries()` returns the live array while `tiles()`
  returns `entries()`. On an 80×50 world late game that is a 4,000-element scan
  per lookup, and `DataTransferClient` calls `getByTile` on every `unit:moved`.
