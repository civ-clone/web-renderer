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
| `civ sync [package…]` | Copy `.ts` from each checkout into `web-renderer/node_modules`. |
| `civ watch [package…]` | `civ sync` on change. Pair with `npm run watch`. |
| `civ collisions` | Find classes declaring a private field an ancestor also declares. |
| `civ check-dts [package…]` | Diff each package's `.d.ts` against the commit before its refactor. |
| `civ publish --wave N [--dry-run]` | Verify, version, publish and push a wave. |

`civ sync` never edits a file in place — it checks the hard-link count first and
refuses if the pnpm store is shared, then writes through a replacement. See
`04-package-workflow.md` §3 for the failure it is guarding against.

## Stage 1

```
./tools/civ audit --write
./tools/civ clone --stage 1
./tools/civ check-dts --baseline          # optional: snapshot what is on npm
npm run test:conformance:update           # record the baseline BEFORE converting

node tools/stage1.js --wave 0 --commit    # …through --wave 11
npm test                                  # conformance + hydration, after each wave
./tools/civ collisions
node tools/verify-stage1.js               # no package left with stale compiled output
```

`stage1.js` runs the per-package procedure: install if needed, record what was
already failing, run `codemod/private-fields.js`, compile, format, test, sync.
It stops at the first genuine failure and commits only what passed every step.
A package that could not build **before** the change is reported and carried
past — a pre-existing breakage is not this stage's to fix — but it then holds
stale compiled output, which is what `verify-stage1.js` is for.

## Tests

| Command | What it proves |
| ------- | -------------- |
| `npm run test:conformance` | A seeded 4-player game to turn 50 produces the same state checksums at turns 1, 10 and 50. This is the regression net for all 62 packages at once. |
| `npm run test:conformance -- --twice` | The run is deterministic. |
| `npm run test:hydration` | `Object.assign(Object.create(City.prototype), state).name()` returns a value — the entire point of Stage 1. |

Both bundle their entrypoint with esbuild rather than running it through
`ts-node`. That is not incidental: node resolution finds each package's compiled
`.js` first, so a plain `require` would test the published artifact rather than
the source `civ sync` just wrote.

The conformance fixture records two independent things:

- **`checksums`** — engine state. Stage 1 must not move these.
- **`snapshots.*.dto`** — the size and hash of what `toPlainObject()` emits, the
  renderer's actual transport payload. Kept out of the checksum on purpose, so
  "the engine behaves identically" and "the wire format is unchanged" are two
  answers rather than one.

The checksum is the deliberately narrow Stage 0 subset: entity id, type and
hand-listed scalars. Stage 4 widens it to every non-transient field once
`toState()` exists.
