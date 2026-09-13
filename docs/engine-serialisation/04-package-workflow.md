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

## What actually goes wrong

Three stages have been published through this workflow. Everything below cost
real time to diagnose, and none of it is guessable from the outside. The
ordering is roughly how likely you are to hit it.

### The registry lies to you, twice

**A publish takes minutes to become visible, and `npm view` is the last thing to
know.** Right after publishing `core-registry@0.1.2`, `npm view` said `0.1.1`
and the package document at `registry.npmjs.org/@civ-clone/core-registry`
agreed — `time.modified` still read 2022. The only straight answer came from
trying to publish again, which said "cannot publish over the previously
published versions".

The versioned endpoint `registry.npmjs.org/<pkg>/<version>` is the least stale
answer available. Treat any "not published" as a hint, never as proof, and read
the publish conflict as success.

**But only *that* conflict.** npm has a second, near-identically worded one:

```
Cannot publish over the previously published versions   — already done
Cannot publish over previously staged version           — did NOT finish
```

The second (E409) means the publish began and stopped, leaving the version in
the registry's staging area and nowhere else. Matching loosely on "cannot
publish over" read it as success: `core-civ-client@0.1.2` was reported
published, tagged and pushed while the registry still had `0.1.1`. It finalised
on its own some minutes later, but nothing would have retried it.

**So verify against the registry, not against the tool's output.** Every stage
here was checked by comparing each installed version against the version in its
checkout, and that check is what caught the failures.

### pnpm 10 → 11 needs four settings, and one of them fails silently

| Symptom | Cause and fix |
| ------- | ------------- |
| `ERR_PNPM_UNEXPECTED_STORE`, then an empty `node_modules` | The tree is linked from store v10 and pnpm 11 wants v11. It purges *before* checking anything else, so a later failure leaves nothing installed. |
| `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` on `overrides` | pnpm 11 reads `overrides` from `pnpm-workspace.yaml`. The lockfile recorded pins no current config declared. |
| `ERR_PNPM_EXOTIC_SUBDEP` | 22 of these packages are `github:`-declared and several depend on each other that way. pnpm 11 blocks git-resolved subdependencies by default; pnpm 10 did not. `blockExoticSubdeps: false`. |
| **Resolution silently picks the previous version** | pnpm 11 refuses versions published very recently, as a supply-chain measure. Ours were minutes old. **No warning, no error.** `minimumReleaseAge: 0`. |

That last one is the dangerous one. `core-registry@0.1.2` was on the registry
and `pnpm install` quietly chose `0.1.1`. Clearing every cache and deleting both
lockfiles changed nothing. Without noticing it, a "verified against published
artifacts" run tests the *old* code and passes, proving nothing.

Two more pnpm behaviours worth knowing:

- `pnpm install` reports "Already up to date" from `node_modules/.modules.yaml`
  without checking the tree still exists. `--force` does not help. A damaged
  `node_modules` needs `rm -rf node_modules && pnpm install`.
- Deleting `pnpm-lock.yaml` is not enough to force re-resolution; pnpm keeps a
  copy at `node_modules/.pnpm/lock.yaml`.

### `tsc --build` skips, and a skipped compile looks like a successful one

`tsc --build` does nothing when its outputs are newer than its inputs, and exits
0. Five packages in this tree had never compiled from a clean checkout — missing
`@types/node`, or `lib: es2019` against `core-data-object`'s `BigInt` — and
nobody had noticed, because the stale success looked like a real one.

**Always pass `--force` when the point of the compile is to prove something.**

### Publishing a *new* scoped package needs `publishConfig.access`

npm defaults a new scoped package to restricted, so the first publish fails with
`E402 Payment Required — You must sign up for private packages`. On an account
with a paid plan it would instead have quietly created a private package.

That requirement makes `publishConfig.access` a reliable signal for *which*
packages belong on npm at all. No `civ1-*` or `simple-*` package is on npm —
they are consumed as `github:civ-clone/<name>`, and pushing is the release.

### Two-factor authentication stops a wave dead

With 2FA on writes, `npm publish` fails `EOTP`. A one-time password covers one
publish before its thirty-second window closes, and a stage is dozens of
publishes, so codes cannot be fed in by hand. Use an automation token, or set
2FA to authorisation-only for the run.

Because `npm version patch` has already committed and tagged by the time the
publish fails, **the release step must be idempotent**: a version already bumped
must not be bumped again, or it skips a number and leaves a tag pointing at
something never published.

### `simple-ai-client` cannot be installed

It has around twenty `github:` dependencies and npm resolves each with a nested
install, recursively — 124 concurrent `npm install` processes before the machine
gives up. There is no flag that avoids it; `--no-save` with explicit package
names still resolves the whole tree from `package.json`.

**Do not work around it by symlinking a scope directory.** npm prunes through
such a symlink: a killed install in that checkout deleted 106 packages from
web-renderer's `node_modules`, three of them direct dependencies. Copy instead,
or fall back to the renderer's `tsc` and `prettier` by path, which needs no
link at all.

### Tests that were never runnable, and tests that never asserted

Four packages carry a `ts-mocha ./tests/*.test.ts` script from a template and
have no `tests/` directory. Report that as "no tests", not as "the runner is
missing" — the second reads like lost coverage and there is none.

Worse, `expect(spy).called` and `expect(spy).not.called` are property accesses,
not assertions. An entire file of spy expectations in `core-strategy` asserted
nothing, which is how a test that registered two *identical* strategies and
asserted a specific one ran could never fail. The correct form is
`expect(spy).to.have.been.called()`. **After fixing an assertion, invert it once
and watch it fail.**

### A checkout carries untracked files that are not yours

Several have an untracked `pnpm-lock.yaml`. Use `git commit -am`, never
`git add -A`, or they end up in a refactor commit. For the same reason the
publish gate reports untracked files rather than refusing on them: npm never
packs `package-lock.json`, and the packages carrying a stray `pnpm-lock.yaml`
are all GitHub-resolved, so no tarball is affected.

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
