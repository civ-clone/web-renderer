// Headless conformance run. Bundled by `tools/conformance.js` with esbuild so it
// resolves the same `.ts` sources the renderer bundles — a plain `require` would
// pick up each package's compiled `.js` and silently test the wrong thing after
// `civ sync`.
//
// Emits one JSON document on stdout, between the markers below.

// Must stay first: it seeds `Math.random` before any engine module evaluates.
import { config, random } from './lib/seed';

import Built from '@civ-clone/core-world/Rules/Built';
import Effect from '@civ-clone/core-rule/Effect';
import Player from '@civ-clone/core-player/Player';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import { Snapshot, checksum, snapshot } from './lib/checksum';
import World from '@civ-clone/core-world/World';
import { instance as cityRegistryInstance } from '@civ-clone/core-city/CityRegistry';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import { instance as ruleRegistryInstance } from '@civ-clone/core-rule/RuleRegistry';
import { instance as unitRegistryInstance } from '@civ-clone/core-unit/UnitRegistry';

export const START = '<<<conformance';
export const END = 'conformance>>>';

const snapshots: { [turn: number]: Snapshot } = {};
const checksums: { [turn: number]: string } = {};
let world: World | null = null;
let stopped = false;

const fail = (reason: string, error?: unknown): never => {
  process.stderr.write(
    `${reason}\n${error instanceof Error ? error.stack : String(error ?? '')}\n`
  );
  process.exit(1);

  throw new Error(reason);
};

// The turn loop perpetuates itself through `turn:end` → `turn:start`, so it has
// no natural exit. Swallowing the loop's events is the kill switch.
const LOOP_EVENTS = [
  'player:turn-end',
  'player:turn-start',
  'turn:end',
  'turn:start',
];
const emit = engine.emit.bind(engine);

engine.emit = (event: string, ...args: any[]): void => {
  if (stopped && LOOP_EVENTS.includes(event)) {
    return;
  }

  emit(event, ...args);
};

const finish = (): void => {
  stopped = true;

  const missing = config.checkpoints.filter((turn) => !(turn in snapshots));

  if (missing.length > 0) {
    fail(`never reached turn(s) ${missing.join(', ')}`);
  }

  process.stdout.write(
    `\n${START}\n${JSON.stringify(
      {
        config,
        note:
          'Stage 0 checksum: a deliberately narrow subset — entity id, type ' +
          'and hand-listed scalars only. It is NOT a complete state hash. ' +
          'Widen it in Stage 4 of docs/engine-serialisation/05-engine-plan.md, ' +
          'once toState() exists, and regenerate these fixtures.',
        checksums,
        snapshots,
      },
      null,
      2
    )}\n${END}\n`
  );

  process.exit(0);
};

// `World.build()` processes `Built` and is the only place the world is handed
// out — there is no world registry to read it back from.
ruleRegistryInstance.register(
  new Built(
    new Effect((built: World): void => {
      world = built;
    })
  )
);

engine.on('turn:start', (turn: number): void => {
  if (stopped) {
    return;
  }

  if (!world) {
    fail('turn started before the world was built');
  }

  if (process.env.CONFORMANCE_DUMP && turn === config.turns) {
    // Debugging aid for the one failure mode this stage can cause: a class
    // reached through `toPlainObject`'s plain-object branch gaining enumerable
    // `_`-prefixed own properties.
    require('fs').writeFileSync(
      process.env.CONFORMANCE_DUMP,
      JSON.stringify(
        [
          ...playerRegistryInstance.entries(),
          ...cityRegistryInstance.entries(),
          ...unitRegistryInstance.entries(),
        ].map((entity) => entity.toPlainObject()),
        null,
        2
      )
    );
  }

  if (config.checkpoints.includes(turn)) {
    const taken = snapshot(turn, random.calls(), world!);

    snapshots[turn] = taken;
    checksums[turn] = checksum(taken);
  }

  if (turn >= config.turns) {
    finish();
  }
});

// Registered before the plugins load, so it runs ahead of the `engine:start`
// handler that builds the world — the same ordering src/js/Engine/Game.ts relies
// on.
engine.on('engine:start', (): void => {
  new Array(config.players).fill(0).forEach((): void => {
    const player = new Player();

    playerRegistryInstance.register(player);
    clientRegistryInstance.register(new SimpleAIClient(player));
  });
});

engine.setOption('players', config.players);
engine.setOption('height', config.height);
engine.setOption('width', config.width);

process.on('uncaughtException', (error) => fail('uncaught exception', error));
process.on('unhandledRejection', (error) => fail('unhandled rejection', error));

engine.start();

import('../../src/js/plugins')
  .then(() => engine.emit('plugins:load:end'))
  .catch((error) => fail('failed to load plugins', error));
