// Headless conformance run. Bundled by `tools/conformance.js` with esbuild so it
// resolves the same `.ts` sources the renderer bundles — a plain `require` would
// pick up each package's compiled `.js` and silently test the wrong thing after
// `civ sync`.
//
// Emits one JSON document on stdout, between the markers below.
//
// By default it plays civ.one's default plugin set on the square grid with computer players, to a fixed turn, and the
//  document is what `tests/engine/fixtures/baseline.json` holds. `CONFORMANCE_CONFIG` can choose another set, grid
//  and players, play until the game ends, and forbid rule ids by prefix (`lib/seed.ts`'s `Options`); the document
//  then carries a `run` report as well. `tools/soak.js` plays it that way (docs/soak.md).

// Must stay first: it seeds `Math.random` before any engine module evaluates.
import { config, mathRandomCalls, options, random } from './lib/seed';
import { spawnClientsWith } from './lib/spawnedClients';

import Built from '@civ-clone/core-world/Rules/Built';
import Effect from '@civ-clone/core-rule/Effect';
import Player from '@civ-clone/core-player/Player';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import BarbarianClient from '@civ-clone/simple-ai-client/BarbarianClient';
import EndTurnClient from './lib/EndTurnClient';
import { Snapshot, checksum, snapshot } from './lib/checksum';
import World from '@civ-clone/core-world/World';
import pluginSets from '../../src/js/pluginSets';
import { pluginsFrom } from '@civ-clone/ui-worker-client/Plugins';
import { defaultGame } from '@civ-clone/core-game/defaultGame';
import { typeNameOf } from '@civ-clone/core-data-object/DataObject';
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

// The `run` report's measurements, kept only when `options.report` is on.
const measured = {
  aiActionLimits: 0,
  aiActionsFailed: 0,
  errors: 0,
  errorExamples: [] as string[],
  // Found after the set has loaded, before the game starts.
  forbidden: [] as string[],
  // How the game ended, read from core-turn-based-game's `GameResultRegistry` once the set has loaded it.
  gameResult: (): { reason: () => string; turn: () => number } | null => null,
  lastTurn: 0,
  loaded: 0,
  rules: 0,
  started: Date.now(),
  turnsStarted: 0,
  year: (turn: number): number | null => null,
};

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

const report = (endReason: string) => {
  const ended = Date.now(),
    gameResult = measured.gameResult(),
    // Turns 1 to the last one started, less that one: the game stops as it starts.
    turnsPlayed = Math.max(0, measured.lastTurn - 1),
    yearOf = (turn: number): number | null => {
      if (turn < 1) {
        return null;
      }

      try {
        return measured.year(turn);
      } catch (e) {
        return null;
      }
    };

  return {
    set: options.set ?? pluginSets.default,
    grid: world?.topologyId() ?? options.grid,
    clients: options.clients,
    untilGameOver: options.untilGameOver,
    endReason,
    ending: gameResult
      ? {
          reason: gameResult.reason(),
          turn: gameResult.turn(),
          year: yearOf(gameResult.turn()),
        }
      : null,
    turn: measured.lastTurn,
    year: yearOf(measured.lastTurn),
    turnsPlayed,
    msPerTurn:
      turnsPlayed > 0
        ? Math.round(((ended - measured.turnsStarted) / turnsPlayed) * 10) / 10
        : null,
    msLoading: measured.loaded - measured.started,
    msTotal: ended - measured.started,
    errors: measured.errors,
    errorExamples: measured.errorExamples,
    aiActionsFailed: measured.aiActionsFailed,
    aiActionLimits: measured.aiActionLimits,
    isolation: {
      forbidPrefixes: options.forbidPrefixes,
      rules: measured.rules,
      forbidden: measured.forbidden,
    },
  };
};

const finish = (endReason: string = 'turns', exitCode: number = 0): void => {
  stopped = true;

  const missing = config.checkpoints.filter((turn) => !(turn in snapshots));

  // A game played to its end may end before a checkpoint, and one stopped by the isolation probe never starts.
  if (missing.length > 0 && !options.untilGameOver && endReason === 'turns') {
    fail(`never reached turn(s) ${missing.join(', ')}`);
  }

  process.stdout.write(
    `\n${START}\n${JSON.stringify(
      {
        config,
        ...(options.report ? { run: report(endReason) } : {}),
        note:
          'Stage 4 checksum: every non-transient field of every saveable ' +
          'entity, via stateKeys(). The Stage 0 numbers (7d6b6b04 / 73a0cc05 ' +
          '/ 3431063b) held unchanged through Stages 1-3 and are NOT ' +
          'comparable with these — the widening is what ended that ' +
          'comparability, and it was done in a commit of its own so the ' +
          'discontinuity has exactly one cause. snapshots.*.state carries the ' +
          'entity and field counts beside the hash, so a drift says how much ' +
          'moved as well as that something did. Regenerated once in Stage 5: ' +
          'tagging `base-trade-rate-research` as `ResearchTradeRate` changed ' +
          'that entity`s id prefix, since ids key on the tag. Verified to be ' +
          'the only difference by normalising ids out of both DTO dumps and ' +
          'comparing — `_` still reports `Research`, so nothing the renderer ' +
          'reads moved. Regenerated again in Stage 6: `Rule` gained an `_id` ' +
          'field, and a rule is reachable through `Unit._busy`, so `_id: null` ' +
          'now appears in the DTO for every fortified unit. Turn 1 is ' +
          'unchanged because nothing is fortified yet. That leak is what ' +
          'fixing `_busy` removes, which will move these numbers once more ' +
          'and shrink them. Since then it has been regenerated whenever a ' +
          'change was meant to alter play (each such PR says so). #253 ' +
          'widened it again, in a commit of its own: the city builds and city ' +
          'growth registries are now hashed too, so all three checkpoints ' +
          'moved with play unchanged. #194 then changed play (Auto, and ' +
          'computer players choosing improvements by need), regenerated in ' +
          'the lockfile commit that brought it in, and #378 again (computer ' +
          'players ranking units with improvements and Wonders), likewise, ' +
          'as did #30 (the Great Wall and the United Nations keeping other ' +
          'leaders peaceful towards their owner), #31 (the terrain, City ' +
          'Walls and fortified defence bonuses of Civ1 in combat), #115 ' +
          "with #236 (Isaac Newton's College and Hoover Dam taking effect, " +
          "Michelangelo's Chapel and J.S. Bach's Cathedral as in v474.05), " +
          'and #241 with #380 (buy prices as in v474.05, and no unit ' +
          'purchases in civil disorder: one Spend rule fewer, and the prices ' +
          'in the DTO change, but play does not). #31 (selling an ' +
          'improvement: a Sell and a Sold rule more, and each ' +
          "improvement's saleValue in the DTO) changes no play, though turn " +
          "50's state hash moves: the sale values built for the turn-10 DTO " +
          'take ids, so entities created after it are numbered differently. ' +
          'Random calls and entity and field counts are unchanged. #459 ' +
          "shrinks the DTO: a player's units no longer include its " +
          'destroyed ones. Play does not change. #965 changes no play ' +
          "either, though turn 50's checksum, state hash and DTO move: the " +
          'rule dropping obsolete builds at a discovery no longer lists ' +
          'everything each city could build, and those items took ids, so ' +
          'entities created after it are numbered differently. Random ' +
          'calls and entity and field counts are unchanged ' +
          '(tests/engine/fixtures/NOTES.md).',
        checksums,
        snapshots,
      },
      null,
      2
    )}\n${END}\n`
  );

  process.exit(exitCode);
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

  if (options.report) {
    if (measured.turnsStarted === 0) {
      measured.turnsStarted = Date.now();
    }

    measured.lastTurn = turn;
  }

  // A game that has ended goes on, with nobody to wait for, or waits for the players to keep playing (see the
  //  `beforeExit` handler below).
  if (options.untilGameOver && measured.gameResult() !== null) {
    finish('game-over');

    return;
  }

  if (config.checkpoints.includes(turn)) {
    const taken = snapshot(turn, random.calls(), world!, mathRandomCalls());

    snapshots[turn] = taken;
    checksums[turn] = checksum(taken);
  }

  if (turn >= config.turns) {
    finish(options.untilGameOver ? 'turn-limit' : 'turns');
  }
});

// Registered before the plugins load, so it runs ahead of the `engine:start`
// handler that builds the world — the same ordering packages/worker-client/Game.ts relies
// on.
engine.on('engine:start', (): void => {
  const Level = defaultGame.availableDifficulties
    .sorted()
    .find((Available) => typeNameOf(Available) === config.difficulty);

  if (!Level) {
    fail(`no difficulty level '${config.difficulty}'`, null);

    return;
  }

  // Before the players, as packages/worker-client/Game.ts does it.
  defaultGame.difficulty.set(Level);

  new Array(config.players).fill(0).forEach((): void => {
    const player = new Player();

    clientRegistryInstance.register(
      options.clients === 'end-turn'
        ? new EndTurnClient(player)
        : new SimpleAIClient(player)
    );
    playerRegistryInstance.register(player);
  });
});

if (options.grid !== null) {
  engine.setOption('topologyId', options.grid);
}

if (options.clients === 'end-turn') {
  spawnClientsWith((player: Player) => new EndTurnClient(player));
}

if (options.report) {
  // Errors the engine and the AI catch and carry on from, which reach only the console: a run with any isn't clean.
  const consoleError = console.error.bind(console);

  console.error = (...args: unknown[]): void => {
    measured.errors += 1;

    if (measured.errorExamples.length < 5) {
      measured.errorExamples.push(
        args
          .map((arg) => (arg instanceof Error ? arg.stack : String(arg)))
          .join(' ')
          .slice(0, 1000)
      );
    }

    consoleError(...args);
  };

  [SimpleAIClient, BarbarianClient].forEach((Client): void => {
    const prototype = Client.prototype as any,
      actionFailed = prototype.actionFailed,
      actionLimitReached = prototype.actionLimitReached;

    prototype.actionFailed = function (...args: unknown[]) {
      measured.aiActionsFailed += 1;

      return actionFailed.apply(this, args);
    };

    prototype.actionLimitReached = function (...args: unknown[]) {
      measured.aiActionLimits += 1;

      return actionLimitReached.apply(this, args);
    };
  });

  // The turn loop waits at a game's end until its players keep playing, and only a human can: with nothing else to
  //  do the process would exit without a word.
  process.on('beforeExit', (): void => {
    if (stopped) {
      return;
    }

    if (measured.gameResult() !== null) {
      finish('game-over');

      return;
    }

    fail('the turn loop stopped before the game ended');
  });
}

engine.setOption('players', config.players);
engine.setOption('height', config.height);
engine.setOption('width', config.width);

process.on('uncaughtException', (error) => fail('uncaught exception', error));
process.on('unhandledRejection', (error) => fail('unhandled rejection', error));

engine.start();

// The set (#668), the default unless `options.set` names another, as the worker loads it: each plugin imported in its
//  turn, in name order.
const plugins = pluginsFrom(pluginSets),
  setId = options.set ?? plugins.default,
  set = plugins.sets.find(({ id }) => id === setId);

if (!set) {
  fail(
    `no plugin set '${setId}': expected one of ${plugins.sets
      .map(({ id }) => id)
      .join(', ')}`
  );
}

// What the report reads once the set is in: imported only then, so the default run evaluates its modules in the order
//  it always has.
const measure = async (): Promise<void> => {
  const [{ instance: gameResultRegistry }, { instance: year }] =
    await Promise.all([
      import('@civ-clone/core-turn-based-game/GameResultRegistry'),
      import('@civ-clone/core-game-year/Year'),
    ]);

  measured.gameResult = () => gameResultRegistry.get();
  measured.year = (turn: number) => year.value(turn);
  measured.loaded = Date.now();

  const rules = ruleRegistryInstance.entries();

  measured.rules = rules.length;
  measured.forbidden = rules
    .map((rule) => rule.id())
    .filter(
      (id: string | null): id is string =>
        id !== null &&
        options.forbidPrefixes.some((prefix) => id.startsWith(prefix))
    )
    .sort();
};

set!
  .load()
  .then(async (): Promise<void> => {
    if (options.report) {
      await measure();

      if (measured.forbidden.length > 0) {
        finish('isolation', 1);

        return;
      }
    }

    engine.emit('plugins:load:end');
  })
  .catch((error) => fail('failed to load plugins', error));
