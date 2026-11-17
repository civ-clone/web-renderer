// A watched game stops at its ending under any rule set (#606, M2e): a game with no human seat disables the rule set's
//  own rule that would carry a game of computer players on past its ending, which the rule set names through its
//  worker rules (`carryOnUnattendedRule`), and a game with a human seat leaves it on. Civ1's and Civ2's rules each
//  have such a rule, under their own ids; before the hook the worker disabled only Civ1's, so a watched Civ2 game ran
//  on past its ending.
//
// Each game is started through the worker's own `Game`, as the page starts it, in a process of its own: the plugins
//  can't be unloaded.
//
//   --scenario <set>-<watched|played>   start a game of that set and print whether each rule is enabled once it starts
//   --scenario civ2-save <file>         start a watched civ2 game, play to its second turn and save it to <file>
//   --scenario civ2-load <file>         load <file> (`Game.load`), with the default set the page would start with, and
//                                       print whether each rule is enabled once it is back: a save with no human in it
//                                       is watched too
//
// Imports `src/js/pluginSets.ts`, never `src/js/plugins.ts`, which would run every plugin in the default set.

// Must stay first: seeds `Math.random` before any engine module evaluates.
import './lib/seed';
import './lib/spawnedClients';
import Game from '@civ-clone/ui-worker-client/Game';
import { defaultGame } from '@civ-clone/core-game/defaultGame';
import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import pluginSets from '../../src/js/pluginSets';
import { pluginsFrom } from '@civ-clone/ui-worker-client/Plugins';

// Each rule set's rule, by its own id: what the test checks, not what the worker reads.
const RULES = {
  civ1: 'civ1-game-end:game-over/carry-on-unattended',
  civ2: 'civ2-game-end:game-over/carry-on-unattended',
} as const;

type SetId = keyof typeof RULES;

type Report = {
  // Each rule set's rule once the game has started: whether it is enabled, or `null` where it isn't registered.
  rules: { [id: string]: boolean | null };
  workerErrors: unknown[];
  // Why a load failed, if one did.
  loadFailed: string | null;
};

type Scenario = {
  set: SetId;
  watched: boolean;
  // Play to the second turn and save the game to the file named after the scenario.
  save?: boolean;
  // Load the file named after the scenario instead of starting a game.
  load?: boolean;
};

const SCENARIOS: { [name: string]: Scenario } = {
  'civ1-watched': { set: 'civ1', watched: true },
  'civ1-played': { set: 'civ1', watched: false },
  'civ2-watched': { set: 'civ2', watched: true },
  'civ2-played': { set: 'civ2', watched: false },
};

const SAVE_AND_LOAD: { [name: string]: Scenario } = {
  'civ2-save': { set: 'civ2', watched: true, save: true },
  'civ2-load': { set: 'civ2', watched: true, load: true },
};

const scenarioIndex = process.argv.indexOf('--scenario'),
  scenario = scenarioIndex === -1 ? null : process.argv[scenarioIndex + 1],
  file = scenarioIndex === -1 ? null : process.argv[scenarioIndex + 2] ?? null;

const play = (name: string): void => {
  const {
      set,
      watched,
      save = false,
      load = false,
    } = {
      ...SCENARIOS,
      ...SAVE_AND_LOAD,
    }[name],
    receivers = new Map<string, (data: any, meta?: any) => void>(),
    sent: { channel: string; data: any }[] = [],
    replies: { data: any; id: number }[] = [],
    transport: any = {
      receive: (channel: string, handler: (data: any) => void) => {
        receivers.set(channel, handler);

        return () => {};
      },
      receiveOnce: () => () => {},
      reply: (channel: string, data: any, id: number) => {
        replies.push({ data, id });
      },
      request: () => new Promise(() => {}),
      send: (channel: string, data: any) => {
        sent.push({ channel, data });
      },
    },
    // A request as the page makes one: answered with a reply carrying its id, or refused with a `requestFailed`.
    ask = async (channel: string, data: unknown): Promise<any> => {
      const id = 1000 + replies.length + sent.length;

      receivers.get(channel)!(data, { id });

      for (let i = 0; i < 3000; i++) {
        const reply = replies.find((candidate) => candidate.id === id),
          failure = sent.find(
            (candidate) =>
              candidate.channel === 'requestFailed' && candidate.data?.id === id
          );

        if (reply) {
          return reply.data;
        }

        if (failure) {
          throw new Error(failure.data.message);
        }

        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      throw new Error(`${channel} was never answered`);
    },
    report = (): never => {
      process.stdout.write(
        JSON.stringify({
          rules: Object.fromEntries(
            Object.values(RULES).map((id) => [
              id,
              defaultGame.rules.getById(id)?.enabled() ?? null,
            ])
          ),
          workerErrors: sent
            .filter(({ channel }) => channel === 'workerError')
            .map(({ data }) => data),
          loadFailed:
            sent.find(({ channel }) => channel === 'loadFailed')?.data
              ?.message ?? null,
        } as Report) + '\n'
      );
      process.exit(0);
    };

  // Nothing the game throws is the suite's to hear.
  console.error = () => {};
  console.warn = () => {};

  new Game(transport, pluginsFrom(pluginSets));

  if (load) {
    // As the page loads a file: the set is the file's, and the rules are in once it says it has loaded.
    receivers.get('load')!({ data: readFileSync(file!, 'utf8') });

    const loaded = setInterval((): void => {
      if (
        sent.some(
          ({ channel, data }) =>
            channel === 'loadFailed' ||
            (channel === 'notification' &&
              typeof data === 'string' &&
              data.startsWith('loaded'))
        )
      ) {
        clearInterval(loaded);
        report();
      }
    }, 10);

    return;
  }

  let turns = 0;

  engine.on('turn:start', (): void => {
    turns++;

    if (save && turns === 2) {
      receivers.get('save')!({ name: 'stop at ending' });

      const saved = [...sent]
        .reverse()
        .find(({ channel }) => channel === 'saveGame');

      writeFileSync(file!, saved?.data?.data ?? '');
      report();
    }
  });

  engine.on('game:start', (): void => {
    if (!save) {
      report();
    }
  });

  (async (): Promise<void> => {
    receivers.get('setOption')!({ name: 'automateLocalPlayer', value: true });

    await ask('choosePluginSet', set);

    Object.entries({
      ...(set === 'civ2' ? { topologyId: 'staggered-iso' } : {}),
      width: 40,
      height: 32,
      difficulty: 'Chieftain',
      seats: [
        { kind: watched ? 'computer' : 'human' },
        { kind: 'computer' },
        { kind: 'computer' },
      ],
    }).forEach(([option, value]) =>
      receivers.get('setOption')!({ name: option, value })
    );

    receivers.get('start')!(null);

    await new Promise((resolve) => setTimeout(resolve, 60 * 1000));

    process.stderr.write(
      `the ${name} game never started: ${JSON.stringify(
        sent.filter(({ channel }) => channel === 'workerError')
      )}\n`
    );
    process.exit(1);
  })().catch((error) => {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exit(1);
  });
};

if (scenario !== null) {
  play(scenario);
} else {
  const failures: string[] = [];
  let checks = 0;

  const expect = (description: string, actual: unknown, expected: unknown) => {
    checks++;

    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      failures.push(
        `${description}: expected ${JSON.stringify(
          expected
        )}, got ${JSON.stringify(actual)}`
      );
    }
  };

  Object.entries(SCENARIOS).forEach(([name, { set, watched }]): void => {
    const output = execFileSync(
        process.execPath,
        [process.argv[1], '--scenario', name],
        {
          encoding: 'utf8',
          env: process.env,
          maxBuffer: 64 * 1024 * 1024,
          timeout: 2 * 60 * 1000,
        }
      ),
      report: Report = JSON.parse(output.trim().split('\n').pop()!),
      other = set === 'civ1' ? 'civ2' : 'civ1';

    expect(
      `the ${name} game started without a worker error`,
      report.workerErrors,
      []
    );
    expect(
      watched
        ? `a watched ${set} game disables ${RULES[set]}, so it stops at its ending`
        : `a played ${set} game leaves ${RULES[set]} on`,
      report.rules[RULES[set]],
      !watched
    );
    expect(
      `a ${set} game has no ${RULES[other]}`,
      report.rules[RULES[other]],
      null
    );
  });

  // And a watched Civ2 game put back from its save (`Game.load`), which stops at its ending too.
  const directory = mkdtempSync(join(tmpdir(), 'stop-at-ending-')),
    path = join(directory, 'civ2.json'),
    run = (name: string): Report =>
      JSON.parse(
        execFileSync(
          process.execPath,
          [process.argv[1], '--scenario', name, path],
          {
            encoding: 'utf8',
            env: process.env,
            maxBuffer: 64 * 1024 * 1024,
            timeout: 2 * 60 * 1000,
          }
        )
          .trim()
          .split('\n')
          .pop()!
      );

  try {
    const saved = run('civ2-save');

    expect(
      'the watched civ2 game was saved without a worker error',
      saved.workerErrors,
      []
    );

    const loaded = run('civ2-load');

    expect(
      'the saved civ2 game loaded',
      [loaded.loadFailed, loaded.workerErrors],
      [null, []]
    );
    expect(
      `a watched civ2 game loaded from its save disables ${RULES.civ2}, so it stops at its ending`,
      loaded.rules[RULES.civ2],
      false
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }

  if (failures.length > 0) {
    process.stderr.write(`FAIL stopAtEnding\n${failures.join('\n')}\n`);
    process.exit(1);
  }

  process.stdout.write(`PASS stopAtEnding (${checks} checks)\n`);
  process.exit(0);
}
