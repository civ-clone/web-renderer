# Engine work tooling

Everything here exists to serve
[`../docs/engine-serialisation/05-engine-plan.md`](../docs/engine-serialisation/05-engine-plan.md).
`04-package-workflow.md` in the same directory explains why the workflow is
shaped this way; this file is what to type.

## `./tools/civ`

| Command | What it does |
| ------- | ------------ |
| `civ audit [--write]` | Recompute `packages.json` from `node_modules`: dependency graph, cycles (Tarjan), publish waves, per-stage surface. Run it first, and after every wave. |
| `civ clone [--stage N]` | Clone every manifest package missing from `~/Code/civ-clone`. |
| `civ sync [package…]` | Copy `.ts` and JSON data from each checkout into `web-renderer/node_modules`. |
| `civ watch [package…]` | `civ sync` on change. Pair with `npm run watch`. |
| `civ collisions` | Find classes declaring a private field an ancestor also declares. |
| `civ check-dts [--baseline \| --published] [package…]` | Diff each package's `.d.ts` against the commit before its refactor. `--baseline` snapshots the installed `.d.ts`; `--published` diffs against that snapshot. |
| `civ publish --pending [--dry-run] [--otp CODE]` | Verify, version, publish and push everything outstanding, in dependency order. |
| `civ publish --wave N [--dry-run]` | The same for one wave of one stage. |

`civ sync` never edits a file in place — it checks the hard-link count first and
refuses if the pnpm store is shared, then writes through a replacement. See
`04-package-workflow.md` §3 for the failure it is guarding against.

### Prefer `--pending` over `--wave`

`packages.json` reports work **remaining**: when a stage's codemod lands, its
packages drop out of that stage's set and take the wave mapping with them. That
is correct as a description and useless as a publish plan, and it caught me out
once per stage.

`--pending` asks the checkouts instead — anything with commits its remote does
not have, a version the registry does not have, or no upstream at all — and
orders them from the live dependency graph. A package a stage introduces
publishes before its dependents without anyone maintaining a list.

### Four rules the tools encode, learned the hard way

**A tool that deliberately preserves a file must also keep it up to date.**
`civ sync` excluded each package's `main` entrypoint from its stale-file
deletion, because `buildPluginList` needs it to exist — and then never
refreshed it. `node_modules` served a `core-game/index.js` from before an
export was added, so the export read `undefined`, a `Game` silently built its
own registries instead of adopting the singletons, and the rule that builds the
world registered where nothing would read it. The game stopped after
`engine:start` with no error and exit code 0.

**A codemod a rollout will re-run must recognise its own output.** Re-run over
an already-migrated file, `register-game.js` found the new
`game.rules.register(...)` call and rewrote its parent again, emitting
`export const register = export const register = ...`. A rollout across
seventeen packages gets re-run after any one of them fails.

**A check that cannot run is not a check that passed.** Missing test runners,
uninstallable packages and known-failing suites are reported by name with a
reason on every run, never silently skipped. `civ publish` keeps two explicit
lists for this — see `KNOWN_FAILING_TESTS` and `KNOWN_UNINSTALLABLE` — and
nothing goes on either without first confirming it fails identically at the
commit before the change.

**An entry on a known-failing list must name a cause someone found, not a
plausible one.** `KNOWN_FAILING_TESTS` carried `civ1-city` and
`civ1-city-improvement` through three stages as "shared registry state between
tests, which Stage 3 per-Game registries make properly fixable". Two of the
three actual causes were that. The third — the one behind five of the eight
failures — was a package installed twice, so `instanceof` compared two copies
of the same class; no amount of registry threading would have touched it. The
guess read as a diagnosis and cost a detour. The list is now empty, and the
causes are written up in
[`../docs/engine-serialisation/05-engine-plan.md`](../docs/engine-serialisation/05-engine-plan.md#the-two-failing-suites-resolved).

## Never symlink a scope directory into a checkout

`simple-ai-client` cannot be installed — around twenty `github:` dependencies,
each of which npm resolves with a nested install, recursively, until the
machine gives up. The tempting workaround is to point its `node_modules`
at the renderer's:

```
ln -s ../../web-renderer/node_modules/@civ-clone node_modules/@civ-clone   # DON'T
```

npm treats that as its own directory and prunes through it. A killed
`npm install` in that checkout deleted 106 packages from **web-renderer's**
`node_modules`, including three direct dependencies, and pnpm would not repair
it — `pnpm install` reports "Already up to date" because its state file says
so and it does not check that the hoisted links still exist. Recovery is
`rm -rf node_modules && pnpm install`.

`syncPackage`'s `into` option (`tools/lib/sync.js`, not a CLI flag) copies
rather than links precisely so this cannot happen.
Where a package's own toolchain is unavailable, the publish gate falls back
to the renderer's `tsc` and `prettier` by path, which needs no symlink at all.

## Tests

| Command | What it proves |
| ------- | -------------- |
| `npm run test:conformance` | A seeded 4-player game to turn 50 produces the same state checksums at turns 1, 10 and 50. This is the regression net for all 62 packages at once. |
| `npm run test:conformance -- --twice` | The run is deterministic. |
| `npm run arena -- --self-check` | The AI arena changes no play: two copies of the baseline AI, seated alternately, reproduce the conformance fixture, and every seat plays the same whichever copy sat in it. Not part of `npm test`; `npm run arena -- --candidate <ref>` is the comparison itself (`docs/arena.md`). |
| `civ duplicates` | No `@civ-clone` package is installed twice. Two copies are two classes, so `instanceof` across them is false and nothing reports it. Run it after any install, before trusting a conformance result. |
| `npm run test:transient` | The `transient` declarations take effect — names are real fields, `allTransient()` stays additive across the prototype chain, state survives, and `stateKeys()` is narrower than `Object.keys()` at all. |
| `civ typecheck` | Every checkout still compiles. The only gate here that is not per-package, and the only one that could have caught core-data-object@0.1.14 breaking 22 of them. |
| `civ stale` | Every installed copy matches its checkout. A suite cannot exercise code that is not in the tree — this is what a false "Stage 3 verified" looked like. |
| `npm run test:hydration` | `Object.assign(Object.create(City.prototype), state).name()` returns a value — the entire point of Stage 1. |

Both bundle their entrypoint with esbuild rather than running it through
`ts-node`. That is not incidental: node resolution finds each package's compiled
`.js` first, so a plain `require` would test the published artifact rather than
the source `civ sync` just wrote.

Most suites run through `tools/run-suite.js <engine|ui> <name>` (the
`test:*` scripts in `package.json` say which), which bundles
`tests/<kind>/<name>.ts`, runs it with a timeout, and passes it only if it
exits 0 **and** prints a line starting `PASS` (#473). Exit 0 alone is not a
pass: an engine suite whose game never reaches the human's turn drains the
event loop and exits 0 with no output. A new suite prints `PASS <name> …` when
its checks are done. `npm run test:run-suite` checks the runner itself.

The conformance fixture records two independent things:

- **`checksums`** — engine state. Stage 1 must not move these.
- **`snapshots.*.dto`** — the size and hash of what `toPlainObject()` emits, the
  renderer's actual transport payload. Kept out of the checksum on purpose, so
  "the engine behaves identically" and "the wire format is unchanged" are two
  answers rather than one.

The checksum is the deliberately narrow Stage 0 subset: entity id, type and
hand-listed scalars. Stage 4 widens it to every non-transient field once
`toState()` exists.
