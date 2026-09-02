# 05 — Phase 0: Foundations

**Goal.** Make the rest of the work verifiable. Nothing here changes runtime
behaviour; everything here is what lets later phases prove they did not break
anything.

**Do not skip this phase.** Phases 2 and 4 delete load-bearing code. Without
fixtures and a test runner, the only verification available is "played it for a
bit and it seemed fine", which is not enough for a change of this size.

**Depends on.** Nothing.

## Deliverables

1. A test runner that can execute TypeScript against the real source.
2. Captured patch streams from real games, checked in as fixtures.
3. Deterministic worker runs, so a fixture can be regenerated.
4. Timing and size instrumentation on the paths being replaced.
5. Recorded baseline numbers in this document.

## 1. Test runner

Vitest: esbuild-based like the existing build, TypeScript with no config, and a
watch mode. `jsdom` because components touch `document`.

```bash
npm i -D vitest jsdom @vitest/coverage-v8
```

`vitest.config.ts` at the repo root:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    testTimeout: 20000,
  },
});
```

Add to `package.json` scripts:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

Two notes:

- **Do not add `test` to `prebuild`.** `prebuild` already runs
  `prettier:format --write`, which mutates the tree; keep the build
  deterministic and run tests as a separate step.
- `tsconfig.json` currently has a narrow `include` covering only
  `src/js/Engine/*` plus two files that do not exist (`main.ts`,
  `src/js/preload.ts`). Widen it to `src/**/*.ts` and `tests/**/*.ts` and drop
  the dead entries, or `npm run ts:compile` will keep silently skipping most of
  the codebase.

**Check:** `npm test` runs and reports zero tests without erroring.

## 2. Fixture capture

A fixture is the exact sequence of transport messages a real game produced.
Replaying it drives the store the same way the worker would, in a test, in
milliseconds.

### The recorder

`src/js/Engine/RecordingTransport.ts` — a decorator, not a modification:

```ts
import Transport, {
  TransportData,
  TransportDisposer,
  TransportReceiveHandler,
  TransportSendArgs,
} from './Transport';

export type RecordedMessage = {
  at: number;
  direction: 'in' | 'out';
  channel: string;
  data: unknown;
};

export class RecordingTransport<
  DataMap extends { [key: string]: TransportData }
> implements Transport<DataMap>
{
  #inner: Transport<DataMap>;
  #log: RecordedMessage[] = [];
  #start = Date.now();
  #channels: Set<string>;

  constructor(
    inner: Transport<DataMap>,
    channels: string[] = ['gameData', 'gameDataPatch', 'gameNotification']
  ) {
    this.#inner = inner;
    this.#channels = new Set(channels);
  }

  receive<Channel extends keyof DataMap>(
    channel: Channel,
    handler: TransportReceiveHandler<DataMap[Channel]>
  ): TransportDisposer {
    return this.#inner.receive(channel, (data, rawData) => {
      if (this.#channels.has(channel as string)) {
        this.#log.push({
          at: Date.now() - this.#start,
          direction: 'in',
          channel: channel as string,
          // The raw ObjectMap where there is one; that is what a fixture needs.
          data: rawData ?? data,
        });
      }

      handler(data, rawData);
    });
  }

  // receiveOnce and request: delegate, recording the same way.
  // send: delegate, recording with direction 'out'.

  log(): RecordedMessage[] {
    return this.#log;
  }

  download(name = `fixture-${Date.now()}.json`): void {
    const blob = new Blob([JSON.stringify(this.#log)], {
        type: 'application/json',
      }),
      url = URL.createObjectURL(blob),
      anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = name;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}
```

Wire it in `src/js/frontend.ts` behind a query param:

```ts
const params = new URLSearchParams(window.location.search),
  base = new WorkerTransport(new Worker('dist/backend.js')),
  transport = params.get('record') === '1'
    ? new RecordingTransport(base)
    : base;

if (transport instanceof RecordingTransport) {
  window.__civRecorder = transport;
}

new Renderer(transport).init();
```

Add `Alt+Shift+R` to the existing debug panel to call `download()`, alongside
the existing `Alt+Shift+J` / `Alt+Shift+X` exports.

**Recording is opt-in and off by default.** It retains every message for the
session, so it must never be on for normal play.

### Fixtures to capture

Run with `?debug=1&record=1`, which combines the stress runner, local player
automation and recording. Capture and check in:

| File | How | Roughly |
| ---- | --- | ------- |
| `tests/fixtures/turn-001.json` | stop after the first `gameData` | initial snapshot only |
| `tests/fixtures/turns-050.json` | stop at turn 50 | mid game |
| `tests/fixtures/turns-150.json` | stop at turn 150 | late game — the one that matters |

Also capture one game with a captured city and one destroyed unit, so the
`del` paths in Phase 4 have something real to work against. Name it
`tests/fixtures/entity-removal.json` and note in this document what happened in
it.

These are large. Gzip them (`fixture.json.gz`, decompressed in the test helper)
and check the compressed files in — `.gitattributes` already exists, so add a
`*.json.gz binary` line.

### The replay helper

`tests/helpers/replay.ts`:

```ts
export type Fixture = RecordedMessage[];

export const loadFixture = (name: string): Fixture => { /* read + gunzip */ };

/** Feeds a fixture into any pair of snapshot/patch appliers. */
export const replay = (
  fixture: Fixture,
  handlers: {
    gameData(data: unknown): void;
    gameDataPatch(data: unknown): void;
  },
  { until = Infinity }: { until?: number } = {}
): void => {
  fixture
    .filter((message) => message.direction === 'in')
    .slice(0, until)
    .forEach((message) => {
      if (message.channel === 'gameData') {
        handlers.gameData(message.data);
      }

      if (message.channel === 'gameDataPatch') {
        handlers.gameDataPatch(message.data);
      }
    });
};
```

**Check:** a test that replays `turns-050.json` through the *existing*
`objectMap` + `reconstituteData` code and asserts the final `data.player.id` is a
non-empty string. That proves the fixture format and the replay harness work
before any new code depends on them.

## 3. Deterministic worker runs

Fixtures should be regenerable. Today they are not: world generation and the AI
both call `Math.random()` directly.

`src/js/lib/seededRandom.ts`:

```ts
/** mulberry32 — small, fast, good enough for reproducing a game. */
const mulberry32 = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;

  let t = seed;

  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const original = Math.random;

export const seedRandom = (seed: number | null): void => {
  Math.random = seed === null ? original : mulberry32(seed);
};

export const currentSeed = (): number | null => current;
```

In `src/js/backend.ts`, import it **first**:

```ts
import { seedRandom } from './lib/seededRandom';
import Game from './Engine/Game';
import ParentTransport from './Engine/ParentTransport';

new Game(new ParentTransport());
```

and handle a `seed` option in `Game`'s existing `setOption` / `setOptions`
handlers by calling `seedRandom(value)` before anything else. World generation
happens on `start`, which always arrives after `setOptions`, so the seed is in
place in time.

Two caveats. The first has already been checked; the second is permanent.

- **Module-scope capture — checked, clear.** If any engine or plugin module did
  `const random = Math.random` at module scope, overriding the global afterwards
  would not affect it. Nineteen packages call `Math.random()`
  (`simple-world-generator`, `simple-ai-client`, `civ1-world`, `civ1-unit`,
  `core-civilization`, the goody-hut packages and others) and **none of them
  capture it**:

  ```bash
  # Note -R, not -r: pnpm symlinks node_modules/@civ-clone/*, and -r does not
  # follow symlinks — it silently reports nothing. This bites every grep of
  # node_modules in this repo.
  grep -RnE "(const|let|var)\s+\w+\s*=\s*Math\.random\s*[;,)]" \
    node_modules/@civ-clone/ --include='*.ts' | grep -v tests
  # → no matches
  ```

  So a global override seeds the whole worker. Re-run this after any dependency
  bump and record the result here.

- **Determinism is per build.** A dependency bump can change the number of
  `Math.random()` calls and invalidate every fixture. That is fine — fixtures are
  regenerated, not maintained — but tests must not assert on exact tile contents,
  only on structural invariants.

**Check:** two runs with `?seed=12345` produce identical world dimensions and an
identical first-`gameData` entity count.

## 4. Instrumentation

Measure the paths that are about to be replaced, so Phase 2 and Phase 4 can be
shown to have worked rather than argued to have worked.

`src/js/UI/lib/metrics.ts`:

```ts
type Sample = { name: string; ms: number; at: number; detail?: number };

const samples: Sample[] = [];

let enabled = false;

export const enableMetrics = (value: boolean): void => {
  enabled = value;
};

export const measure = <T>(name: string, fn: () => T, detail?: number): T => {
  if (!enabled) {
    return fn();
  }

  const start = performance.now(),
    result = fn();

  samples.push({ name, ms: performance.now() - start, at: Date.now(), detail });

  return result;
};

export const summary = (): Record<
  string,
  { count: number; total: number; mean: number; p95: number; max: number }
> => { /* group by name, sort, compute */ };

export const reset = (): void => {
  samples.splice(0);
};
```

Instrument, all behind `?debug=1`:

| Site | Name | `detail` |
| ---- | ---- | -------- |
| `Renderer.ts:1101` reconstitution | `reconstitute` | `Object.keys(objectMap.objects).length` |
| `Renderer.ts` patch application loop | `applyPatches` | patch count |
| `pruneObjectMap` call | `prune` | entities removed |
| `render()` | `render` | — |
| `portal.render()` | `portal.render` | — |
| `world.setTiles` | `setTiles` | tile count |
| `WorkerTransport.receive`, per message | `transport.receive` | `JSON.stringify(data).length` |

Add the summary to the existing debug JSON export (`Alt+Shift+J`) under a
`metrics` key, so a run produces one file with heap, DOM counts and timings
together.

**Check:** a `?debug=1` run for 20 turns produces non-zero counts for every name
above.

## 5. Baseline

Run each fixture scenario and fill this in. **This table is the acceptance
criterion for Phases 2, 4 and 5** — leaving it empty makes those phases
unverifiable.

Method: `?debug=1&record=1`, stress runner on, stress windows off, an 80×50
world with 4 players, Chromium. Record at turn 50 and turn 150.

| Metric | Turn 50 | Turn 150 | Source |
| ------ | ------- | -------- | ------ |
| `objectMap.objects` count | | | debug JSON `runtime.objectCount` |
| `reconstitute` mean ms | | | metrics |
| `reconstitute` p95 ms | | | metrics |
| `reconstitute` calls per turn | | | metrics count ÷ turns |
| `applyPatches` mean ms | | | metrics |
| `prune` mean ms / frequency | | | metrics |
| `render` mean ms | | | metrics |
| `portal.render` mean ms | | | metrics |
| `transport.receive` mean bytes | | | metrics detail |
| `transport.receive` max bytes | | | metrics detail |
| `usedJSHeapSize` after forced GC | | | DevTools |
| `canvasCount` | | | debug JSON |
| Long frames (>50 ms) per turn | | | DevTools performance trace |

Save the raw exports as `docs/state-rewrite/baselines/YYYY-MM-DD-turn150.json`
so later comparisons are against data, not memory.

## Definition of done

- [ ] `npm test` runs; at least one test replays a fixture through the existing
      code path and passes.
- [ ] Three fixtures plus `entity-removal.json` checked in, gzipped.
- [ ] `?record=1` and `Alt+Shift+R` work and are off by default.
- [ ] `seedRandom` wired; two seeded runs match; the module-scope-capture grep
      result is recorded above.
- [ ] Metrics wired for all seven sites and included in the debug JSON export.
- [ ] The baseline table above is filled in and the raw exports are committed.
- [ ] `tsconfig.json` `include` covers the whole of `src/`.

## Notes for the executor

- Everything in this phase is additive. If a change here alters gameplay
  behaviour, it is wrong — revert and reconsider.
- The recorder must not be enabled by `?debug=1`. Keep it a separate param;
  `debug=1` is used for long soak runs where retaining every message would
  itself exhaust memory.
