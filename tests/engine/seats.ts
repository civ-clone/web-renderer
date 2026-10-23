// A game starts from the seats it was set up with (#604): who plays each one, and the civilization, leader and AI
//  chosen for it, over a stub transport through the worker's own `Game`. A human seat gets the page's client and a
//  computer seat the AI client it asked for; with no `seats`, `players: N` is one human and N-1 computers, as it was
//  before; a game with no human seat plays itself; and a seat that can't be filled stops the game with a `workerError`
//  that says why. The setup menu's two requests, `civilizations` and `aiClients`, are answered before a game starts.
//
// The engine is a singleton, so each game is played in its own process of this same bundle (`--scenario <name>`),
//  which reports what it saw as a line of JSON.
//
// Each failed start is also checked for stopping there: `Game.start()` resolves every seat before anything is made, and
//  a seat that can't be filled sends the `workerError` and returns, so the engine is never started. After it the
//  player and client registries must be empty and neither `engine:start` nor `game:start` may have been heard; these
//  checks are reported on their own as well.
//
// The first scenario's last checks, that a civilization or leader chosen for a seat survives `world:built`, depend on
//  civ1-player keeping a preset choice, and are reported on their own so that they do not hide the others.

// Must stay first: it seeds the engine's random source before any engine module evaluates.
import './lib/seed';

import Game from '../../src/js/Engine/Game';
import Player from '@civ-clone/core-player/Player';
import { execFileSync } from 'child_process';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';

type Seat = {
  kind: 'human' | 'computer';
  civilization?: string;
  leader?: string;
  ai?: string;
  name?: string;
};

type Setup = { seats?: Seat[]; players?: number };

// A game that can't start: the seats it was given, and what the `workerError` should name.
const FAILURES: { [name: string]: { seats: Seat[]; names: string[] } } = {
    'two-humans': {
      seats: [{ kind: 'human' }, { kind: 'human' }],
      names: ['Only one human seat'],
    },
    'unknown-civilization': {
      seats: [{ kind: 'human', civilization: 'Nowhere' }, { kind: 'computer' }],
      names: ['Nowhere'],
    },
    'leader-of-another-civilization': {
      seats: [
        { kind: 'human', civilization: 'Roman', leader: 'Hammurabi' },
        { kind: 'computer' },
      ],
      names: ['Hammurabi', 'Roman'],
    },
    'leader-without-civilization': {
      seats: [{ kind: 'human', leader: 'Hammurabi' }, { kind: 'computer' }],
      names: ['Hammurabi', 'civilization'],
    },
    'same-civilization-twice': {
      seats: [
        { kind: 'human', civilization: 'Babylonian' },
        { kind: 'computer', civilization: 'Babylonian' },
      ],
      names: ['Babylonian', 'two seats'],
    },
    'unknown-ai': {
      seats: [{ kind: 'human' }, { kind: 'computer', ai: 'NoSuchAI' }],
      names: ['NoSuchAI'],
    },
  },
  SMALL_MAP = { width: 40, height: 30, difficulty: 'Chieftain' };

const SCENARIOS: { [name: string]: Setup } = {
  presets: {
    seats: [
      { kind: 'computer' },
      { kind: 'human', civilization: 'Babylonian', leader: 'Hammurabi' },
      { kind: 'computer', civilization: 'Roman', ai: 'SimpleAIClient' },
    ],
  },
  players: { players: 3 },
  computers: {
    seats: [{ kind: 'computer' }, { kind: 'computer' }, { kind: 'computer' }],
  },
  requests: { players: 3 },
  ...Object.fromEntries(
    Object.entries(FAILURES).map(([name, { seats }]) => [
      `fail:${name}`,
      { seats },
    ])
  ),
};

type Report = {
  // The players when the game started, in order: each one's client, civilization and leader.
  players: { client: string; civilization: string; leader: string | null }[];
  turnStarts: number;
  // Which of `engine:start` and `game:start` were heard, in the order they came.
  started: string[];
  // How many players and clients were registered once a failed start had been given time to go on, if it were going to.
  registered: { players: number; clients: number } | null;
  workerErrors: any[];
  replies: [string, any][];
};

const scenarioIndex = process.argv.indexOf('--scenario'),
  scenario = scenarioIndex === -1 ? null : process.argv[scenarioIndex + 1];

const named = (value: any): string => value?.sourceClass?.()?.name ?? '';

// One game, played in this process, which reports what it saw as a last line of JSON and exits.
const play = (name: string, setup: Setup): void => {
  const receivers = new Map<
      string,
      (data: any, meta?: { id: number }) => void
    >(),
    report: Report = {
      players: [],
      turnStarts: 0,
      started: [],
      registered: null,
      workerErrors: [],
      replies: [],
    },
    transport: any = {
      receive: (
        channel: string,
        handler: (data: any, meta?: { id: number }) => void
      ) => {
        receivers.set(channel, handler);

        return () => receivers.delete(channel);
      },
      receiveOnce: () => () => {},
      reply: (channel: string, data: any) =>
        report.replies.push([channel, data]),
      request: () => new Promise(() => {}),
      send: (channel: string, data: any) => {
        if (channel === 'workerError') {
          report.workerErrors.push(data);
        }
      },
    },
    until = async (done: () => boolean): Promise<boolean> => {
      for (let i = 0; i < 1000; i++) {
        if (done()) {
          return true;
        }

        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      return false;
    },
    finish = (): never => {
      process.stdout.write(JSON.stringify(report) + '\n');
      process.exit(0);
    };

  // Nothing a failed start throws is the suite's to hear: it is in the `workerError`.
  console.error = () => {};
  process.on('uncaughtException', () => {});
  process.on('unhandledRejection', () => {});

  new Game(transport);

  engine.on('game:start', (): void => {
    report.players = playerRegistryInstance.entries().map((player: Player) => ({
      client:
        clientRegistryInstance.getBy('player', player)[0]?.constructor.name ??
        '',
      civilization: named(player.civilization()),
      leader: named(player.civilization().leader()) || null,
    }));
  });

  engine.on('turn:start', (): void => {
    report.turnStarts++;
  });

  // Subscribed before `start` is fired, so that a game that did go on after a `workerError` would be seen to.
  ['engine:start', 'game:start'].forEach((event) =>
    engine.on(event as any, (): void => {
      report.started.push(event);
    })
  );

  // The setup menu's requests, made before the game has started, with ids so that they are answered as requests.
  if (name === 'requests') {
    receivers.get('civilizations')!(null, { id: 1 });
    receivers.get('aiClients')!(null, { id: 2 });

    until(() => report.replies.length >= 2).then(finish);

    return;
  }

  // Played by the computer, so that nobody need answer the human seat's choices.
  receivers.get('setOption')!({ name: 'automateLocalPlayer', value: true });

  Object.entries({ ...SMALL_MAP, ...setup }).forEach(([option, value]) =>
    receivers.get('setOption')!({ name: option, value })
  );

  receivers.get('start')!(null);

  if (name.startsWith('fail:')) {
    // The `workerError` is sent from inside `start`, so it is already there; a beat more is given for anything that
    //  would go on regardless (the engine's events are emitted as they come, and a registered player would be by then).
    until(() => report.workerErrors.length > 0)
      .then(() => new Promise((resolve) => setTimeout(resolve, 100)))
      .then(() => {
        report.registered = {
          players: playerRegistryInstance.entries().length,
          clients: clientRegistryInstance.entries().length,
        };

        finish();
      });

    return;
  }

  if (name === 'computers') {
    // The turn loop with nobody to wait for: two turns started is it running.
    until(() => report.turnStarts >= 2).then(finish);

    return;
  }

  // The seats are in once the game has started.
  until(() => report.players.length > 0).then(finish);
};

if (scenario !== null) {
  if (!(scenario in SCENARIOS)) {
    process.stderr.write(`FAIL seats: no scenario called '${scenario}'\n`);
    process.exit(1);
  }

  play(scenario, SCENARIOS[scenario]);
} else {
  const failures: string[] = [],
    presetFailures: string[] = [],
    stopFailures: string[] = [];
  let checks = 0,
    finished = false;

  const expectInto =
      (into: string[]) =>
      (description: string, actual: unknown, expected: unknown): void => {
        checks++;

        const [a, e] = [actual, expected].map((value) => JSON.stringify(value));

        if (a !== e) {
          into.push(`${description}\n    expected: ${e}\n    actual:   ${a}`);
        }
      },
    expect = expectInto(failures),
    expectPreset = expectInto(presetFailures),
    expectStop = expectInto(stopFailures);

  // A run that stops before it reports has checked nothing (#473).
  process.on('exit', (code: number): void => {
    if (code === 0 && !finished) {
      process.stderr.write('FAIL seats: stopped before the checks ran\n');
      process.exitCode = 1;
    }
  });

  const run = (name: string): Report => {
    try {
      const output = execFileSync(
        process.execPath,
        [process.argv[1], '--scenario', name],
        {
          encoding: 'utf8',
          env: process.env,
          maxBuffer: 64 * 1024 * 1024,
          timeout: 2 * 60 * 1000,
        }
      );

      return JSON.parse(output.trim().split('\n').slice(-1)[0]);
    } catch (error) {
      process.stderr.write(
        `FAIL seats: ${name} did not report\n${
          (error as any)?.stderr || (error as any)?.message || error
        }\n`
      );
      process.exit(1);

      throw error;
    }
  };

  const clients = (report: Report): string[] =>
    report.players.map(({ client }) => client);

  // Chosen for some seats, and left to the rules for the others.
  {
    const report = run('presets');

    expect('three seats make three players', report.players.length, 3);
    expect(
      'the human seat has the page client and the computer seats the AI client they asked for, or by default',
      clients(report),
      ['SimpleAIClient', 'DataTransferClient', 'SimpleAIClient']
    );

    // These need civ1-player's `world:built` rule to keep a civilization that was already chosen.
    expectPreset(
      "the Babylonian seat's civilization is kept",
      report.players[1]?.civilization,
      'Babylonian'
    );
    expectPreset(
      'and its leader is Hammurabi',
      report.players[1]?.leader,
      'Hammurabi'
    );
    expectPreset(
      "the Roman seat's civilization is kept",
      report.players[2]?.civilization,
      'Roman'
    );
    // One random draw only shows the seat is not one of the two chosen civilizations by luck as well as by design; the
    //  strong check, that a random seat is never given a civilization another seat has chosen, is civ1-player's own test.
    expectPreset(
      'the random seat, drawn once here, is neither the Babylonian nor the Roman',
      ['Babylonian', 'Roman'].includes(report.players[0]?.civilization),
      false
    );
  }

  // Without seats, as before.
  {
    const report = run('players');

    expect('players: 3 makes three players', report.players.length, 3);
    expect('one human, first, then computers', clients(report), [
      'DataTransferClient',
      'SimpleAIClient',
      'SimpleAIClient',
    ]);
  }

  // No human at all.
  {
    const report = run('computers');

    expect('three computer seats make three players', report.players.length, 3);
    expect(
      'and none of them has the page client',
      clients(report).includes('DataTransferClient'),
      false
    );
    expect(
      'the turn loop runs without a human: at least two turns start',
      report.turnStarts >= 2,
      true
    );
  }

  // Seats that can't be filled.
  Object.entries(FAILURES).forEach(([name, { names }]) => {
    const report = run(`fail:${name}`),
      message = String(report.workerErrors[0]?.message ?? '');

    expect(`${name}: the page is told once`, report.workerErrors.length, 1);
    expect(
      `${name}: the message names the problem (${names.join(', ')})`,
      names.every((part) => message.includes(part)),
      true
    );
    // The seats are resolved in `start()`, which sends the `workerError` and returns before the engine is started, so
    //  nothing has been made: no players, no clients, and neither `engine:start` nor `game:start` has been heard.
    expectStop(
      `${name}: no player or client was made for the seats that failed`,
      report.registered,
      { players: 0, clients: 0 }
    );
    expectStop(
      `${name}: the engine was not started and no game began`,
      report.started,
      []
    );
  });

  // The setup menu's requests.
  {
    const { replies } = run('requests'),
      civilizations: { name: string; leaders: string[] }[] =
        replies.find(([channel]) => channel === 'civilizations')?.[1] ?? [],
      aiClients: string[] =
        replies.find(([channel]) => channel === 'aiClients')?.[1] ?? [];

    expect(
      'civilizations lists Babylonian with Hammurabi among its leaders',
      civilizations
        .find(({ name }) => name === 'Babylonian')
        ?.leaders.includes('Hammurabi'),
      true
    );
    expect(
      'and lists Roman with JuliusCaesar among its leaders',
      civilizations
        .find(({ name }) => name === 'Roman')
        ?.leaders.includes('JuliusCaesar'),
      true
    );
    // StrategyAIClient, SimpleAIClient's base class, is registered with core-ai-client as well, so it is offered too.
    expect(
      'aiClients offers the default, SimpleAIClient, first',
      aiClients[0],
      'SimpleAIClient'
    );
    expect(
      'and not the barbarians',
      aiClients.includes('BarbarianClient'),
      false
    );
  }

  finished = true;

  const all = [...failures, ...presetFailures, ...stopFailures];

  if (all.length > 0) {
    process.stderr.write(
      `FAIL seats (${all.length} of ${checks} checks)\n${
        presetFailures.length > 0
          ? `  ${presetFailures.length} of them are the preset civilization checks, which need civ1-player's world:built rule to keep a civilization chosen for a seat\n`
          : ''
      }${
        stopFailures.length > 0
          ? `  ${stopFailures.length} of them are the failed starts that went on to make players or start the engine after the workerError\n`
          : ''
      }  ${all.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS seats (${checks} checks)\n`);
  process.exit(0);
}
