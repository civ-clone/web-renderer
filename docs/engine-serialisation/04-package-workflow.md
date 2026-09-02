# 04 — Multi-Package Workflow

How to make a change that spans 62 repositories without losing track of it. This
formalises and automates the existing approach — copy files into `node_modules`,
verify, then bump, publish and update usage — rather than replacing it.

Read this before starting any stage in [`05-engine-plan.md`](./05-engine-plan.md).

## The landscape

Measured, not estimated:

| | |
| - | - |
| `@civ-clone` packages installed | 325 |
| Cloned locally today | 9 (`civ1-asset-extractor`, `civ1-city`, `civ1-city-happiness`, `civ1-city-improvement`, `civ1-civilization`, `civ1-diplomacy`, `simple-world-path`, `web-renderer`, `web-renderer-rewrite`) |
| Contain `#private` fields (Stage 1 surface) | **62** |
| Total `#private` declarations | **280** |
| Have `registerRules.ts` (Stage 3 surface) | 17 |
| Publish waves for Stage 1 | 12 |
| Dependency cycles | **3**, all within one group |
| Resolved from npm | ~300, versions `0.1.0`–`0.1.7` |
| Resolved from GitHub | 22 (`civ1-*`, `simple-*` direct deps) |

Regenerate any of these with `tools/civ audit` (below) rather than trusting this
table after the tree moves.

## Three findings that shape the workflow

### 1. The renderer consumes `.ts` source, not compiled `.js`

Packages ship `City.ts`, `City.js`, `City.d.ts` and `City.js.map`. esbuild's
default `resolveExtensions` puts `.ts` first, and TypeScript's node resolution
does the same. Verified:

```
esbuild resolved to: node_modules/.pnpm/@civ-clone+core-city@0.1.10/
                     node_modules/@civ-clone/core-city/City.ts
```

**So the local loop needs no build step in the dependency.** Sync the `.ts`
files and `npm run build:dev` in `web-renderer` picks them up directly. Compiling
only matters at publish time, for consumers that resolve `main`.

This is the single biggest speedup available to this workflow and it is worth
not discovering by accident.

### 2. There is a dependency cycle

```
core-player  →  core-world  →  core-player
core-player  →  core-world  →  core-world-generator  →  core-player
core-world   →  core-world-generator  →  core-world
```

`core-player`, `core-world` and `core-world-generator` are mutually dependent.
They cannot be published in topological order because each needs the others to
exist at the version it requires.

This is survivable **only while changes stay range-compatible**. It is the
strongest single argument for the version strategy below.

### 3. pnpm's store layout is filesystem-dependent

`node_modules/@civ-clone/X` symlinks into the project-local
`node_modules/.pnpm/`, whose contents come from the global store at
`~/Library/pnpm/store/v11`. On this machine (APFS) files have a link count of 1 —
pnpm used copy-on-write clones, so editing in place affects only this project.

That is **not guaranteed**. With `packageImportMethod=hardlink` on a filesystem
without CoW, link counts exceed 1 and an in-place edit corrupts the global store
for every project on the machine. The sync script below therefore always writes
through a copy and never assumes.

## Version strategy: stay on `0.1.x`

**Every change in [`05-engine-plan.md`](./05-engine-plan.md) must be
range-compatible, published as a patch bump within `0.1.x`.**

All 325 packages depend on each other with `^0.1.0`, which npm reads as
`>=0.1.0 <0.2.0`. So:

- A `0.1.x` publish is picked up by every dependent automatically, with **no
  `package.json` edits anywhere**.
- A `0.2.0` publish is picked up by nothing. Every dependent range needs
  widening — 325 `package.json` files, and the `core-player`/`core-world`/
  `core-world-generator` cycle becomes a genuine chicken-and-egg problem.

This is why `#private` → `private` is safe to do this way: it changes no public
API. Callers already went through `city.name()`, never `city.#name`.

### The one thing that is not source-compatible

TypeScript `private` members **appear in `.d.ts`**, where `#private` did not:

```ts
// before                          // after
export declare class City {        export declare class City {
  name(): string;                    private _name;
}                                    name(): string;
                                   }
```

Two consequences to check during Stage 1:

- Structural typing. A consumer with `const c: { name(): string } = city` still
  compiles — extra members are fine. A consumer *assigning* a plain object to a
  `City` would now fail, but that never worked with `#private` either.
- Declaration merging or subclassing outside `@civ-clone` could collide on a
  field name. There is no such consumer today; if a plugin author hits it, the
  `_` prefix makes it obvious.

Verify with `tools/civ check-dts` (below) rather than by inspection.

### When a breaking change becomes unavoidable

Not in this plan. If it happens later, do it as a single coordinated `0.2.0`
across all 325 in one sitting, scripted, with the cycle group published using
`npm publish --tag next` first and ranges widened before promoting. Do not
attempt it incrementally.

## Repository management

53 of the 62 packages needing changes are not cloned. Get them under one root.

```
~/Code/civ-clone/
  web-renderer/          ← the app; tooling lives here for now
  core-data-object/
  core-registry/
  …
```

`tools/packages.json` is the manifest — generated once, then committed:

```jsonc
{
  "root": "~/Code/civ-clone",
  "org": "civ-clone",
  "packages": {
    "core-registry":    { "wave": 0, "privateFields": 4,  "stages": [1] },
    "core-data-object": { "wave": 1, "privateFields": 5,  "stages": [1, 2, 4, 5] },
    "core-rule":        { "wave": 1, "privateFields": 10, "stages": [1, 6] },
    // …
  },
  "cycles": [["core-player", "core-world", "core-world-generator"]]
}
```

Generate it with `tools/civ audit --write`, which recomputes waves, field counts
and cycles from `node_modules`. Re-run it whenever the dependency graph moves;
never hand-edit the derived fields.

## The tooling

Five commands. Put them in `web-renderer/tools/civ` (a Node script with
subcommands) and extract to their own repo once they stabilise.

### `civ audit`

Recomputes the manifest from `node_modules`: dependency graph, cycles via
Tarjan, publish waves via SCC condensation, `#private` counts per package,
npm-vs-GitHub resolution. `--write` updates `tools/packages.json`; without it,
prints a diff. **Run this first, and after every wave.**

### `civ clone [--stage N]`

Clones every manifest package not present under `root`, via
`git@github.com:civ-clone/<name>.git`. With `--stage`, only those the stage
touches. Skips existing checkouts, reports dirty ones.

### `civ sync [package…]`

The heart of the loop. For each package, copies `**/*.ts` (excluding `tests/`,
`node_modules/`) from the local checkout into
`web-renderer/node_modules/@civ-clone/<name>/`.

```
civ sync core-data-object core-registry
  core-data-object   14 files → node_modules  (2 changed)
  core-registry       6 files → node_modules  (0 changed)
```

Requirements, each earned from a way this goes wrong:

- **Copy, never symlink the directory.** A symlinked package directory changes
  module resolution and pnpm will fight it.
- **Resolve the symlink first**, then write into the real `.pnpm` path. Writing
  to `node_modules/@civ-clone/X` follows the link anyway; doing it explicitly
  makes the target visible in logs.
- **Refuse if link count > 1**, with a message pointing at
  `packageImportMethod`. This is the global-store-corruption guard from §3.
- **Delete the stale `.js`/`.d.ts` next to each synced `.ts`.** Nothing in
  `web-renderer` reads them, but leaving a stale compiled file beside edited
  source is exactly the sort of thing that costs an afternoon later.
- **Idempotent and fast.** It will run dozens of times per session.

### `civ watch [package…]`

`civ sync` on file-change. Pair with `npm run watch` in `web-renderer` for a
sub-second loop from editing `core-city/City.ts` to seeing it in the browser.

### `civ publish --wave N [--dry-run]`

For each package in the wave, in manifest order:

1. Refuse if the working tree is dirty or the branch is not `main`.
2. `npm run ts:compile` — the published artifact needs current `.js`/`.d.ts`.
3. `npm run prettier:format` then fail if the tree changed (formatting should
   already be committed).
4. `npm test`.
5. `npm version patch`.
6. `npm publish`.
7. `git push && git push --tags`.

Then, once the whole wave is published: `pnpm update '@civ-clone/*'` in
`web-renderer`, `npm test`, `npm run build:dev`, and the smoke checklist.

`--dry-run` performs 1–4 and prints the version bumps.

**Cycle handling.** `core-player`, `core-world` and `core-world-generator` are
one wave-4 unit. Publish all three back to back with no range changes; since each
already satisfies `^0.1.0`, order within the group does not matter. `civ publish`
refuses to publish a partial cycle group.

## The loop

Per package, per stage:

```
edit ~/Code/civ-clone/core-city/City.ts
  → civ sync core-city                    (instant; .ts is what's consumed)
  → npm run build:dev  in web-renderer
  → play, or run the conformance suite
  → commit in core-city
```

Per wave:

```
civ publish --wave N --dry-run
  → civ publish --wave N
  → pnpm update '@civ-clone/*'  in web-renderer
  → npm test && npm run build:dev
  → smoke checklist
  → commit the lockfile in web-renderer
```

Commit `pnpm-lock.yaml` after every wave. It is the record of which versions were
verified together, and it is what a bisect will need.

## Verification gates

Each stage in [`05-engine-plan.md`](./05-engine-plan.md) states its own
acceptance criteria. These apply to every wave regardless.

**Per package, before publish**
- `npm run ts:compile` clean
- `npm test` green (packages have `ts-mocha` suites already)
- Formatting produces no diff

**Per wave, after publish**
- `pnpm update` resolves with no peer warnings
- `web-renderer` builds
- The conformance suite passes (below)
- Smoke: start a game, move a unit, found a city, end turn, open the city
  window, save nothing — five minutes

**The conformance suite.** A new `web-renderer/tests/engine/` suite that drives
the engine headlessly through a seeded game and asserts on structural invariants:
entity counts by type, registry sizes, turn advancement, a snapshot checksum at
turns 1/10/50. It is the regression net for all 62 packages at once, and it is
worth building in Stage 0 before anything moves.

Deliberately not asserting exact tile contents — a dependency bump changes the
RNG draw sequence and would break it for no reason. Structure and checksums only,
with the checksum fixture regenerated whenever a bump is intentional.

## Rollback

Per package: `npm deprecate @civ-clone/x@0.1.n "reverted"` and publish `0.1.n+1`
reverting the change. **Never `npm unpublish`** — with `^0.1.0` ranges everywhere,
unpublishing a version that another package already resolved breaks installs for
everyone.

Per wave: pin the previous versions in `web-renderer/package.json` temporarily
(`"@civ-clone/core-city": "0.1.10"`, exact) to unblock the app while fixing
forward. Remove the pins once the fix publishes.

The lockfile commit per wave is what makes this tractable — `git checkout` the
previous `pnpm-lock.yaml` and `pnpm install --frozen-lockfile` restores a known
tree exactly.

## What this does not solve

Being honest about the residual cost:

- **62 repos still means 62 sets of commits, tags and releases.** The tooling
  removes the error-prone parts, not the volume.
- **A wave is a synchronisation point.** Wave 5 cannot start until wave 4 is
  published and verified. Stage 1 is therefore at least 12 publish rounds.
- **CI is per-repo.** Nothing here gives a cross-package pipeline. The
  conformance suite in `web-renderer` is the closest substitute and it only runs
  after a wave lands.

## The workspace-overlay alternative

Set aside for now, but the reasoning is worth recording because Stage 3 is likely
to make the case for it.

### What it is — and is not

Three different things get called "monorepo". Only the first is under discussion:

| | Git repos | Publishing | Effort |
| - | --------- | ---------- | ------ |
| **Workspace overlay** | 62, unchanged | 62 packages, unchanged | Low |
| True monorepo | 1 | One version, one publish | Very high |
| Submodule meta-repo | 63 | Unchanged | Medium, and awkward |

A workspace overlay adds a `pnpm-workspace.yaml` at `~/Code/civ-clone/` listing
the local checkouts. pnpm then symlinks them instead of fetching from npm.
Nothing about git or publishing changes.

### What it actually buys

An earlier draft of this document claimed it "converts 12 sequential publish
rounds into one". **That was wrong** and is corrected here. It changes two things,
and neither is the publish count:

1. **The inner loop.** `civ sync`'s copy step disappears — packages are
   symlinked, so an edit is visible immediately with no sync and no staleness.
   esbuild follows the symlink and resolves the source `.ts` directly out of the
   checkout.
2. **The verification cadence.** Today each wave is a verification checkpoint:
   publish, `pnpm update`, re-verify. In a workspace the entire change set across
   all 62 packages is verifiable *before* anything is published, so the 12 waves
   become a mechanical publish sequence rather than 12 rounds of test-and-wait.

It does **not** reduce the number of packages, publishes, commits or tags.

### The trap

pnpm 10 changed `linkWorkspacePackages` to default `false`. With pnpm 11.5.2 and
the existing `^0.1.0` ranges, adding a workspace file does **not** link anything —
pnpm goes to the registry:

```
[ERR_PNPM_FETCH_404] GET https://registry.npmjs.org/@civ-clone-test%2Flib-a
```

even though a local workspace package at a satisfying version exists. The fix is
one line in `pnpm-workspace.yaml`:

```yaml
packages:
  - 'web-renderer'
  - 'core-*'
  - 'civ1-*'
linkWorkspacePackages: true
```

Verified working: the dependency then resolves to the local checkout with **no
`package.json` changes**, because `0.1.10` already satisfies `^0.1.0`. This is
better than the `workspace:*` protocol, which would require editing every range
and relies on pnpm rewriting them at publish time.

### Costs

- **You test against working trees, not published artifacts.** Mitigate by
  re-running the conformance suite outside the workspace with
  `pnpm install --frozen-lockfile` after each wave publishes.
- **It weakens the rollback story.** The per-wave `pnpm-lock.yaml` commit is the
  record of which versions were verified together; in workspace mode the lockfile
  points at local paths and stops being that record.
- **`~/Code/civ-clone/` is not a git repo**, so the workspace root is new local
  scaffolding — either its own small repo or gitignored.
- **`web-renderer` becomes a workspace member rather than the root**, and its
  existing `pnpm-workspace.yaml` (`publicHoistPattern`) needs reconciling with
  the root one.
- **A partial workspace is a hazard.** With some of the 62 linked and the rest
  from npm it is easy to lose track of which. `pnpm list --depth 0` should be part
  of the routine.

### When to switch

Per stage, which is a sharper question than "after Stage 1":

| Stage | Needs cross-package iteration? | Verdict |
| ----- | ------------------------------ | ------- |
| 1 `#private` | No — independent and mechanical per package | `civ sync` is fine |
| 2 RNG | Barely | Either |
| 3 `Game` context | **Yes** — `core-registry` plus 45 packages must be coherent, and cannot be meaningfully tested until they all are | **Switch here** |
| 4 `transient` | No — one static declaration each | Either |
| 5 `core-save-game` | No — one new package | Either |
| 6–7 | Mostly no | Either |

Stage 3 is the case. Iterating on it with copy-sync means re-syncing dozens of
packages per attempt and no way to test the whole change until it is published.

The two approaches coexist: `civ audit`, `civ clone` and `civ publish` are needed
either way, and only `civ sync`/`civ watch` become redundant in workspace mode. So
the tooling investment in Stage 0 is not wasted whichever way this goes, and the
decision can be deferred to Stage 3 at no cost.
