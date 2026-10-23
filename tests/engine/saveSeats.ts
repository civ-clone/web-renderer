// Does a save remember its seats (#608)? A game set up with a named human seat and two computer seats is played a
//  few turns and saved through the worker's own `save` receiver; the file records who was a person and their name.
//  Loaded through the worker's `load` receiver in a second process, the same clients are bound to the same players,
//  and saving again writes the same seats. A file written before saves could say (`kind: 'ai'` throughout) still
//  binds the person to the `DataTransferClient` by class name.
//
//   --scenario save <file>       play three turns, save to <file>
//   --scenario load <file>       load <file>, save again
//   --scenario load-old <file>   the same, with the file's clients rewritten as a file before #608 wrote them
//   --scenario load-unknown-ai <file>   the same, with a computer seat's AI client one this build doesn't have
//   --scenario load-reassigned <file>   the same, with the person's seat handed to the computer and the second taken
//   --scenario load-two-humans <file>   the same, with a second seat made a person's, which the load refuses

// Must stay first: seeds `Math.random` before any engine module evaluates.
import './lib/seed';
import './lib/spawnedClients';
import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ClientDescriptor } from '@civ-clone/core-save-game/SaveGame';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import Game from '../../src/js/Engine/Game';
import {
  isHumanDescriptor,
  savedSeats,
  seatFromDescriptor,
} from '../../src/js/Engine/lib/savedSeats';

type Bound = { player: string; client: string | null }[];

type Report = {
  clients: ClientDescriptor[];
  bound: Bound;
  loadFailed: unknown;
  // What the page was told of an AI client the build lacks.
  told: string[];
};

const SEATS = [
    { kind: 'human', name: 'Dom' },
    { kind: 'computer', ai: 'SimpleAIClient' },
    { kind: 'computer' },
  ],
  OPTIONS = { width: 40, height: 25, difficulty: 'Chieftain' };

const scenarioIndex = process.argv.indexOf('--scenario'),
  scenario = scenarioIndex === -1 ? null : process.argv[scenarioIndex + 1],
  file = scenarioIndex === -1 ? null : process.argv[scenarioIndex + 2];

// One game in this process, driven through the worker's receivers as the page drives it, which reports what it
//  saw as a last line of JSON and exits.
const play = (name: string, path: string): void => {
  const receivers = new Map<string, (data: any, meta?: any) => void>(),
    sent: { channel: string; data: any }[] = [],
    transport: any = {
      receive: (channel: string, handler: (data: any, meta?: any) => void) => {
        receivers.set(channel, handler);

        return () => {};
      },
      receiveOnce: () => () => {},
      reply: () => {},
      request: () => new Promise(() => {}),
      send: (channel: string, data: any) => {
        sent.push({ channel, data });
      },
    },
    until = async (done: () => boolean, tries = 2000): Promise<boolean> => {
      for (let i = 0; i < tries; i++) {
        if (done()) {
          return true;
        }

        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      return false;
    },
    finish = (report: Report): never => {
      process.stdout.write(JSON.stringify(report) + '\n');
      process.exit(0);
    },
    // Every player's client, by class name, in player order.
    bound = (): Bound =>
      playerRegistryInstance.entries().map((player) => ({
        player: player.id(),
        client:
          clientRegistryInstance.getBy('player', player)[0]?.constructor.name ??
          null,
      })),
    // The file the worker writes for the page's Save.
    saved = (): { clients: ClientDescriptor[] } => {
      receivers.get('save')!({ name: 'seats' });

      const message = [...sent]
        .reverse()
        .find(({ channel }) => channel === 'saveGame');

      if (!message) {
        throw new Error(
          `nothing was saved: ${JSON.stringify(
            sent.filter(({ channel }) => channel === 'notification')
          )}`
        );
      }

      return JSON.parse(message.data.data);
    };

  let turns = 0;

  engine.on('turn:start', (): void => {
    turns++;
  });

  // Nothing the game throws is the suite's to hear.
  console.error = () => {};
  console.warn = () => {};

  new Game(transport);

  (async (): Promise<void> => {
    if (name === 'save') {
      // The person's seat plays itself, so that nobody need answer its choices.
      receivers.get('setOption')!({ name: 'automateLocalPlayer', value: true });

      Object.entries({ ...OPTIONS, seats: SEATS }).forEach(([option, value]) =>
        receivers.get('setOption')!({ name: option, value })
      );

      receivers.get('start')!(null);

      if (!(await until(() => turns >= 3))) {
        throw new Error('the game never reached its third turn');
      }

      const written = saved();

      writeFileSync(path, JSON.stringify(written));

      finish({
        clients: written.clients,
        bound: bound(),
        loadFailed: null,
        told: [],
      });

      return;
    }

    const read = JSON.parse(readFileSync(path, 'utf8'));

    if (name === 'load-unknown-ai') {
      // A seat from a build with an AI client this one lacks: the default plays it, and the page is told.
      const [program] = read.clients.filter(
        ({ kind }: ClientDescriptor) => kind === 'ai'
      );

      program.module = 'NoSuchAIClient';
    }

    if (name === 'load-old') {
      // As a file written before #608 holds them: a program by class name, every one.
      read.clients = read.clients.map(
        ({ playerId, module }: ClientDescriptor) => ({
          playerId,
          kind: 'ai',
          module,
        })
      );
    }

    // The seats reassigned on the page before the load (#608): by player id, the person's seat handed to the computer
    //  and the next one taken, or a second person, which the load refuses.
    const [first, second] = read.clients.map(
        ({ playerId }: ClientDescriptor) => playerId
      ),
      seats =
        name === 'load-reassigned'
          ? {
              [first]: { kind: 'computer' },
              [second]: { kind: 'human', name: 'Pat' },
            }
          : name === 'load-two-humans'
          ? { [second]: { kind: 'human', name: 'Pat' } }
          : undefined;

    receivers.get('setOption')!({ name: 'automateLocalPlayer', value: true });
    receivers.get('load')!({
      data: JSON.stringify(read),
      ...(seats === undefined ? {} : { seats }),
    });

    const loaded = await until(
      () =>
        sent.some(
          ({ channel, data }) =>
            channel === 'loadFailed' ||
            (channel === 'notification' &&
              typeof data === 'string' &&
              data.startsWith('loaded'))
        ),
      3000
    );

    const failure = sent.find(({ channel }) => channel === 'loadFailed');

    finish({
      clients: failure || !loaded ? [] : saved().clients,
      bound: bound(),
      loadFailed: failure?.data ?? (loaded ? null : 'the load never finished'),
      told: sent
        .filter(
          ({ channel, data }) =>
            channel === 'notification' &&
            typeof data === 'string' &&
            data.includes('not available here')
        )
        .map(({ data }) => data),
    });
  })().catch((error: any): void => {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exit(1);
  });
};

if (scenario !== null) {
  if (
    ![
      'save',
      'load',
      'load-old',
      'load-unknown-ai',
      'load-reassigned',
      'load-two-humans',
    ].includes(scenario) ||
    !file
  ) {
    process.stderr.write(`FAIL saveSeats: bad scenario '${scenario}'\n`);
    process.exit(1);
  }

  play(scenario, file);
} else {
  const failures: string[] = [];
  let checks = 0,
    finished = false;

  const expect = (
    description: string,
    actual: unknown,
    expected: unknown
  ): void => {
    checks++;

    const [a, e] = [actual, expected].map((value) => JSON.stringify(value));

    if (a !== e) {
      failures.push(`${description}\n    expected: ${e}\n    actual:   ${a}`);
    }
  };

  // A run that stops before it reports has checked nothing (#473).
  process.on('exit', (code: number): void => {
    if (code === 0 && !finished) {
      process.stderr.write('FAIL saveSeats: stopped before the checks ran\n');
      process.exitCode = 1;
    }
  });

  const run = (name: string, path: string): Report => {
    try {
      const output = execFileSync(
        process.execPath,
        [process.argv[1], '--scenario', name, path],
        {
          encoding: 'utf8',
          env: process.env,
          maxBuffer: 256 * 1024 * 1024,
          timeout: 2 * 60 * 1000,
        }
      );

      return JSON.parse(output.trim().split('\n').slice(-1)[0]);
    } catch (error) {
      process.stderr.write(
        `FAIL saveSeats: ${name} did not report\n${
          (error as any)?.stderr || (error as any)?.message || error
        }\n`
      );
      process.exit(1);
    }
  };

  // The seats as the file records them, barbarians aside: their player is spawned by the rules, with no seat.
  const seatsOf = (clients: ClientDescriptor[]) =>
      clients
        .filter(({ module }) => module !== 'BarbarianClient')
        .map(({ kind, module, name }) => ({ kind, module, name })),
    boundOf = (bound: Bound) =>
      bound.filter(({ client }) => client !== 'BarbarianClient');

  // What a file says of a client, as a seat.
  expect(
    'a saved person is a human seat, with their name',
    seatFromDescriptor({
      kind: 'human',
      module: 'DataTransferClient',
      name: 'Dom',
    }),
    { kind: 'human', name: 'Dom' }
  );
  expect(
    "a file from before saves could say still has the person by the client's class",
    [
      seatFromDescriptor({ kind: 'ai', module: 'DataTransferClient' }),
      isHumanDescriptor({ kind: 'ai', module: 'DataTransferClient' }),
    ],
    [{ kind: 'human' }, true]
  );
  expect(
    'a program is a computer seat with that AI client',
    [
      seatFromDescriptor({ kind: 'ai', module: 'SimpleAIClient' }),
      isHumanDescriptor({ kind: 'ai', module: 'SimpleAIClient' }),
    ],
    [{ kind: 'computer', ai: 'SimpleAIClient' }, false]
  );

  const path = join(mkdtempSync(join(tmpdir(), 'save-seats-')), 'seats.json'),
    saved = run('save', path);

  expect(
    'the file records the person, with their name, and the programs by class',
    seatsOf(saved.clients),
    [
      { kind: 'human', module: 'DataTransferClient', name: 'Dom' },
      { kind: 'ai', module: 'SimpleAIClient' },
      { kind: 'ai', module: 'SimpleAIClient' },
    ]
  );
  expect(
    "the person's client in the file is the one bound to their player",
    saved.clients.find(({ kind }) => kind === 'human')?.playerId,
    boundOf(saved.bound).find(({ client }) => client === 'DataTransferClient')
      ?.player
  );

  const loaded = run('load', path);

  expect('the file loads', loaded.loadFailed, null);
  expect(
    'loaded, every player has the client it was saved with',
    boundOf(loaded.bound),
    boundOf(saved.bound)
  );
  expect(
    'and saving again records the same seats, name and all',
    loaded.clients.filter(({ module }) => module !== 'BarbarianClient'),
    saved.clients.filter(({ module }) => module !== 'BarbarianClient')
  );

  const old = run('load-old', path);

  expect('a file from before saves could say loads', old.loadFailed, null);
  expect(
    'and binds the person to their client by its class, the programs to theirs',
    boundOf(old.bound),
    boundOf(saved.bound)
  );
  expect(
    'saved again, it says who the person is, though their name is gone',
    seatsOf(old.clients),
    [
      { kind: 'human', module: 'DataTransferClient' },
      { kind: 'ai', module: 'SimpleAIClient' },
      { kind: 'ai', module: 'SimpleAIClient' },
    ]
  );

  const unknown = run('load-unknown-ai', path);

  expect(
    'a file naming an AI client this build lacks loads',
    unknown.loadFailed,
    null
  );
  expect(
    'and that seat plays with the default, the rest as they were',
    boundOf(unknown.bound),
    boundOf(saved.bound)
  );
  expect('the page is told once which AI client was missing', unknown.told, [
    "The AI client 'NoSuchAIClient' that played a computer seat is not available here; the default plays it instead.",
  ]);
  expect(
    'and saving again records the default for that seat',
    seatsOf(unknown.clients),
    [
      { kind: 'human', module: 'DataTransferClient', name: 'Dom' },
      { kind: 'ai', module: 'SimpleAIClient' },
      { kind: 'ai', module: 'SimpleAIClient' },
    ]
  );

  // The page's list of a file's seats (#608): every client but the barbarians', with its player's civilization and
  //  leader by class.
  const listed = savedSeats(JSON.parse(readFileSync(path, 'utf8')));

  expect(
    'the page lists the seats from the file, with civilization and leader',
    listed.map(({ playerId, seat, civilization, leader }) => [
      playerId === saved.clients[0].playerId,
      seat,
      typeof civilization === 'string' && civilization !== '',
      typeof leader === 'string' && leader !== '',
    ]),
    [
      [true, { kind: 'human', name: 'Dom' }, true, true],
      [false, { kind: 'computer', ai: 'SimpleAIClient' }, true, true],
      [false, { kind: 'computer', ai: 'SimpleAIClient' }, true, true],
    ]
  );

  const reassigned = run('load-reassigned', path),
    [firstPlayer, secondPlayer] = saved.clients.map(({ playerId }) => playerId);

  expect('a file loads with its seats reassigned', reassigned.loadFailed, null);
  expect(
    "the person's old seat is the computer's and the one taken is theirs",
    boundOf(reassigned.bound).map(({ player, client }) => [
      player === firstPlayer
        ? 'first'
        : player === secondPlayer
        ? 'second'
        : 'other',
      client,
    ]),
    [
      ['first', 'SimpleAIClient'],
      ['second', 'DataTransferClient'],
      ['other', 'SimpleAIClient'],
    ]
  );
  expect(
    'and saving again records the seats as reassigned',
    seatsOf(reassigned.clients),
    [
      { kind: 'ai', module: 'SimpleAIClient' },
      { kind: 'human', module: 'DataTransferClient', name: 'Pat' },
      { kind: 'ai', module: 'SimpleAIClient' },
    ]
  );

  const twoHumans = run('load-two-humans', path);

  expect(
    'a second person is refused, as the page can play one for now (#161)',
    typeof twoHumans.loadFailed === 'object' &&
      twoHumans.loadFailed !== null &&
      /one human/i.test(String((twoHumans.loadFailed as any).message)),
    true
  );

  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL saveSeats: ${
        failures.length
      } of ${checks} checks\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS saveSeats (${checks} checks)\n`);
}
