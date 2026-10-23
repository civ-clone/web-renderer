// A game nobody plays is watched (#607, #606): set up with no human seat, the worker sends the page `observer` with
//  every player and the one seen as, that player's `gameData` and `turnEnded`, and the turn loop runs with nobody to
//  wait for. The page then sees the game as that player does: patches over the turns, at least one as each turn ends;
//  `observe` moves it to another player with a new `observer` and `gameData` and nothing of the first player after it,
//  and nothing of another player in full; `pause` holds the turns between turns and `resume` lets them go; and an
//  `action` does nothing. A watched game stops at its ending as a played one does, so the rule that would carry a game
//  of computer players on is disabled in it and not in a game with a human seat, and no `DataTransferClient` is in the
//  `ClientRegistry`: every player's client is a computer's.
//
// The engine is a singleton, so each game is played in its own process of this same bundle (`--scenario <name>`),
//  through a stub transport and the worker's own `Game`, which reports what it saw as a line of JSON.

// Must stay first: it seeds the engine's random source before any engine module evaluates.
import './lib/seed';

import Game from '../../src/js/Engine/Game';
import { execFileSync } from 'child_process';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { defaultGame } from '@civ-clone/core-game/defaultGame';
import { instance as engine } from '@civ-clone/core-engine/Engine';

const RULE = 'civ1-game-end:game-over/carry-on-unattended',
  SMALL_MAP = { width: 40, height: 25, difficulty: 'Chieftain' };

type Setup = { seats?: { kind: 'human' | 'computer' }[]; players?: number };

const SCENARIOS: { [name: string]: Setup } = {
  watch: {
    seats: [{ kind: 'computer' }, { kind: 'computer' }, { kind: 'computer' }],
  },
  played: { players: 2 },
};

// What a payload carries in full that belongs to a player: the owners of the units and cities with all their fields,
//  and the ids of the players with theirs, which another player's stand-in leaves out (#328). Whether a patch brings
//  the turn is noted as well, as that is what `refresh` sends.
type Contents = {
  units: string[];
  cities: string[];
  players: string[];
  turn: boolean;
};

type Entry =
  | { kind: 'turn:start' | 'turn:end' }
  | { kind: 'send'; channel: string; data?: any; contents?: Contents };

type Report = {
  // Every send that matters and every turn event, in the order they came.
  log: Entry[];
  // The clients the players had when the game started, and when it had run a while.
  clients: { atStart: string[]; later: string[] } | null;
  // Whether the rule is enabled, once the game has started: null if there is no such rule.
  rule: boolean | null;
  // The ids of the players, in order.
  players: string[];
  // The turns started: while the game ran, when paused and when it had been left paused for a while, and then after
  //  it was resumed.
  turns: { running: number; paused: number; held: number; resumed: number };
  // The `turnProgress` notices sent so far: when the turns were held and when they had been for a while.
  progress: { paused: number; held: number; all: number };
  // What happened to the page's `action`s: whether anything receives them, and what came of them.
  actions: { received: boolean; sent: string[]; errors: number };
  // Where in the log each step was taken from.
  marks: { observed: number; paused: number; resumed: number };
  workerErrors: any[];
};

const scenarioIndex = process.argv.indexOf('--scenario'),
  scenario = scenarioIndex === -1 ? null : process.argv[scenarioIndex + 1];

const idOf = (value: any): string | null =>
  value?.['#ref'] ?? value?.id ?? null;

// What one payload's objects hold in full.
const contentsOf = (payload: any): Contents => {
  const contents: Contents = {
      units: [],
      cities: [],
      players: [],
      turn: false,
    },
    patches: any[] = Array.isArray(payload) ? payload : [];

  const read = (map: any): void =>
    Object.values(map?.objects ?? {}).forEach((object: any) => {
      if ('moves' in object) {
        contents.units.push(idOf(object.player) ?? '');
      }

      if ('build' in object && 'improvements' in object) {
        contents.cities.push(idOf(object.player) ?? '');
      }

      if (object._ === 'Player' && 'units' in object) {
        contents.players.push(object.id);
      }
    });

  if (!Array.isArray(payload)) {
    read(payload);

    return contents;
  }

  patches.forEach((patch: any) =>
    Object.entries(patch).forEach(([id, { value }]: [string, any]) => {
      contents.turn ||= id.startsWith('Turn-');

      read(value);
    })
  );

  return contents;
};

// One game, played in this process, which reports what it saw as a last line of JSON and exits.
const play = (name: string, setup: Setup): void => {
  const receivers = new Map<string, (data: any, meta?: any) => void>(),
    report: Report = {
      log: [],
      clients: null,
      rule: null,
      players: [],
      turns: { running: 0, paused: 0, held: 0, resumed: 0 },
      progress: { paused: 0, held: 0, all: 0 },
      actions: { received: false, sent: [], errors: 0 },
      marks: { observed: -1, paused: -1, resumed: -1 },
      workerErrors: [],
    },
    transport: any = {
      receive: (channel: string, handler: (data: any, meta?: any) => void) => {
        receivers.set(channel, handler);

        return () => {
          // Only its own: a client made after the one it replaces has its receivers by then.
          if (receivers.get(channel) === handler) {
            receivers.delete(channel);
          }
        };
      },
      receiveOnce: () => () => {},
      reply: () => {},
      request: () => new Promise(() => {}),
      // Round-tripped, as `postMessage` would, and kept as what it says, not as the whole of it.
      send: (channel: string, data: any) => {
        const sent = JSON.parse(JSON.stringify(data ?? null));

        if (channel === 'workerError') {
          report.workerErrors.push(sent);
        }

        if (channel === 'gameData' || channel === 'gameDataPatch') {
          report.log.push({
            kind: 'send',
            channel,
            data:
              channel === 'gameData'
                ? { player: idOf(sent.objects[idOf(sent.hierarchy)!]?.player) }
                : undefined,
            contents: contentsOf(sent),
          });
        } else if (channel === 'notification') {
          if (sent?.key === 'Game.progress.turn') {
            report.progress.all++;
          }
        } else if (
          ['observer', 'turnEnded', 'actionHandled'].includes(channel)
        ) {
          report.log.push({ kind: 'send', channel, data: sent });
        }
      },
    },
    names = (): string[] =>
      clientRegistryInstance
        .entries()
        .map((client: any): string => client.constructor.name),
    until = async (done: () => boolean, tries = 1000): Promise<boolean> => {
      for (let i = 0; i < tries; i++) {
        if (done()) {
          return true;
        }

        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      return false;
    },
    wait = (ms: number): Promise<void> =>
      new Promise((resolve) => setTimeout(resolve, ms)),
    finish = (): never => {
      process.stdout.write(JSON.stringify(report) + '\n');
      process.exit(0);
    },
    sentCount = (channel: string, paused?: boolean): number =>
      report.log.filter(
        (entry) =>
          entry.kind === 'send' &&
          entry.channel === channel &&
          (paused === undefined || entry.data?.paused === paused)
      ).length;

  // Nothing the game throws is the suite's to hear, but it is counted: an `action` must not make one.
  console.error = () => {};
  process.on('uncaughtException', () => {
    report.actions.errors++;
  });
  process.on('unhandledRejection', () => {
    report.actions.errors++;
  });

  new Game(transport);

  engine.on('game:start', (): void => {
    report.clients = { atStart: names(), later: [] };
    report.rule = defaultGame.rules.getById(RULE)?.enabled() ?? null;
  });
  engine.on('turn:start', (): void => {
    report.turns.running++;
    report.log.push({ kind: 'turn:start' });
  });
  engine.on('turn:end', (): void => {
    report.log.push({ kind: 'turn:end' });
  });

  // Played by the computer, so that nobody need answer the human seat's choices (a played game).
  receivers.get('setOption')!({ name: 'automateLocalPlayer', value: true });

  Object.entries({ ...SMALL_MAP, ...setup }).forEach(([option, value]) =>
    receivers.get('setOption')!({ name: option, value })
  );

  receivers.get('start')!(null);

  (async (): Promise<void> => {
    // A game with a human seat is not watched: it has played a few turns, and the rule is still on.
    if (name === 'played') {
      await until(() => report.turns.running >= 3);

      return finish();
    }

    // The game under way, watched: a few turns, then the third player.
    await until(() => report.turns.running >= 5);

    const observed = report.log.find(
      (entry) => entry.kind === 'send' && entry.channel === 'observer'
    ) as Extract<Entry, { kind: 'send' }> | undefined;

    report.players = (observed?.data.players ?? []).map(
      ({ id }: { id: string }) => id
    );
    report.clients!.later = names();

    report.marks.observed = report.log.length;
    receivers.get('observe')!({ playerId: report.players[2] });

    // Its `observer` and `gameData` are there at once, and the turns go on being watched.
    const turnsBefore = report.turns.running;

    await until(() => report.turns.running >= turnsBefore + 4);

    // Held: the turn under way finishes, and no more start.
    receivers.get('pause')!(null);
    report.marks.paused = report.log.length;

    await until(() => sentCount('observer', true) > 0);
    // A moment for the turn under way, the AI clients yielding a macrotask each turn.
    await wait(100);

    report.turns.paused = report.turns.running;
    report.progress.paused = report.progress.all;

    // The page's actions do nothing, held or not.
    const heard = report.log.length;

    report.actions.received = receivers.has('action');
    receivers.get('action')?.({ name: 'EndTurn' });
    receivers.get('action')?.({ name: 'InactiveUnit', id: 'Settlers-1' });

    await wait(300);

    report.turns.held = report.turns.running;
    report.progress.held = report.progress.all;
    report.actions.sent = report.log
      .slice(heard)
      .flatMap((entry) =>
        entry.kind === 'send' && entry.channel === 'actionHandled'
          ? [entry.channel]
          : []
      );

    // Let go: the turns go on.
    receivers.get('resume')!(null);
    report.marks.resumed = report.log.length;

    await until(() => report.turns.running >= report.turns.held + 3);

    report.turns.resumed = report.turns.running;
    report.clients!.later = names();

    finish();
  })();
};

if (scenario !== null) {
  if (!(scenario in SCENARIOS)) {
    process.stderr.write(`FAIL observer: no scenario called '${scenario}'\n`);
    process.exit(1);
  }

  play(scenario, SCENARIOS[scenario]);
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
      process.stderr.write('FAIL observer: stopped before the checks ran\n');
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
          maxBuffer: 256 * 1024 * 1024,
          timeout: 2 * 60 * 1000,
        }
      );

      return JSON.parse(output.trim().split('\n').slice(-1)[0]);
    } catch (error) {
      process.stderr.write(
        `FAIL observer: ${name} did not report\n${
          (error as any)?.stderr || (error as any)?.message || error
        }\n`
      );
      process.exit(1);

      throw error;
    }
  };

  type Send = Extract<Entry, { kind: 'send' }>;

  const sends = (report: Report, channel: string, from = 0, to?: number) =>
      report.log
        .slice(from, to)
        .filter(
          (entry): entry is Send =>
            entry.kind === 'send' && entry.channel === channel
        ),
    indexOf = (report: Report, channel: string, nth = 0): number =>
      report.log.reduce(
        (found: number[], entry, index) =>
          entry.kind === 'send' && entry.channel === channel
            ? [...found, index]
            : found,
        []
      )[nth] ?? -1;

  // A game nobody plays.
  {
    const report = run('watch'),
      [first, , third] = report.players,
      observers = sends(report, 'observer'),
      gameData = sends(report, 'gameData'),
      switched = report.marks.observed;

    expect('the game has three players', report.players.length, 3);
    expect('no worker error was sent', report.workerErrors, []);

    // The start: `observer`, the first player's `gameData`, then `turnEnded`.
    expect(
      'the first thing the page is told is observer, then gameData, then turnEnded',
      [
        indexOf(report, 'observer'),
        indexOf(report, 'gameData'),
        indexOf(report, 'turnEnded'),
      ].every(
        (index, i, all) => index !== -1 && (i === 0 || index > all[i - 1])
      ),
      true
    );
    expect(
      'observer lists every player, with their civilization and leader',
      observers[0]?.data.players.map(({ id, civilization, leader }: any) => [
        id,
        typeof civilization,
        typeof leader,
      ]),
      report.players.map((id) => [id, 'string', 'string'])
    );
    expect(
      'observer is viewing the first player, and the turns are not held',
      [observers[0]?.data.viewing, observers[0]?.data.paused],
      [first, false]
    );
    expect(
      "the first gameData is the first player's",
      gameData[0]?.data.player,
      first
    );

    // The turn loop with nobody to wait for.
    expect(
      'turns keep starting with no human: at least five do',
      report.turns.running >= 5,
      true
    );
    expect(
      'a turnProgress notice is sent for each turn that starts',
      report.progress.paused,
      report.turns.paused
    );

    // Patches over the turns for the viewed player: one after each turn:end.
    const turnEnds = report.log.reduce(
        (found: number[], entry, index) =>
          entry.kind === 'turn:end' ? [...found, index] : found,
        []
      ),
      endsWithoutPatch = turnEnds
        .slice(0, -1)
        .map((end, i) => [end, turnEnds[i + 1]])
        .filter(
          ([from, to]) =>
            !sends(report, 'gameDataPatch', from, to).some(
              (patch) => patch.contents?.turn
            )
        );

    expect('a turn ends at least four times', turnEnds.length >= 4, true);
    expect(
      'a patch with the turn follows each turn:end, before the next',
      endsWithoutPatch.length,
      0
    );

    // Moved to the third player.
    expect(
      'observe sends a new observer state viewing the third player',
      observers.find((_, i) => i > 0)?.data.viewing,
      third
    );
    expect(
      "and then come the third player's gameData and turnEnded, the first sent",
      report.log
        .slice(switched)
        .flatMap((entry) =>
          entry.kind === 'send' && entry.channel !== 'gameDataPatch'
            ? [entry.channel]
            : []
        )
        .slice(0, 3),
      ['observer', 'gameData', 'turnEnded']
    );
    expect(
      "observe sends the third player's gameData",
      gameData[1]?.data.player,
      third
    );
    expect(
      'and turnEnded again after it',
      sends(report, 'turnEnded').length,
      2
    );

    // Nothing of the others, in full, from then on.
    const after = report.log.slice(
        Math.min(
          ...[indexOf(report, 'observer', 1)].filter((index) => index !== -1)
        )
      ),
      full = after.flatMap((entry) =>
        entry.kind === 'send' && entry.contents ? [entry.contents] : []
      ),
      owners = (kind: 'units' | 'cities' | 'players'): string[] =>
        [...new Set(full.flatMap((contents) => contents[kind]))].sort();

    expect(
      'once observing the third player, only theirs are sent in full: units',
      owners('units').filter((owner) => owner !== third),
      []
    );
    expect(
      'cities',
      owners('cities').filter((owner) => owner !== third),
      []
    );
    expect(
      'and players',
      owners('players').filter((owner) => owner !== third),
      []
    );
    // So that the checks could fail: the third player's own, a player with units and cities, are sent in full.
    expect(
      "and the third player's own units and cities are, so the check could fail",
      [...new Set([...owners('units'), ...owners('cities')])],
      [third]
    );
    expect('as is the third player, whole', owners('players'), [third]);

    // Before, the first player's.
    const before = report.log
      .slice(0, indexOf(report, 'observer', 1))
      .flatMap((entry) =>
        entry.kind === 'send' && entry.contents ? [entry.contents] : []
      );

    expect(
      'and before, the first player was the only one sent in full',
      [
        ...new Set(
          before.flatMap((contents) => [
            ...contents.units,
            ...contents.cities,
            ...contents.players,
          ])
        ),
      ],
      [first]
    );

    // Pause and resume.
    const [, , heldState, resumedState] = observers;

    expect(
      'pause sends observer paused, still viewing the third player',
      [heldState?.data.paused, heldState?.data.viewing],
      [true, third]
    );
    expect(
      'no turn starts for 300ms once held',
      report.turns.held,
      report.turns.paused
    );
    expect(
      'and none while the turns are held',
      report.progress.held,
      report.progress.paused
    );
    expect(
      'resume sends observer paused: false',
      [resumedState?.data.paused, resumedState?.data.viewing],
      [false, third]
    );
    expect(
      'the turns go on after resume',
      report.turns.resumed >= report.turns.held + 3,
      true
    );
    expect(
      'observer was sent for each of: the start, the observe, the pause and the resume',
      observers.length,
      4
    );

    // The page's actions.
    expect(
      'an action is answered by no actionHandled',
      report.actions.sent,
      []
    );
    expect('and makes no error', report.actions.errors, 0);

    // The rule and the clients.
    expect(`${RULE} is disabled while the game is watched`, report.rule, false);
    expect(
      'every player has the AI client when the game starts, the paced one keeping the name',
      report.clients?.atStart,
      ['SimpleAIClient', 'SimpleAIClient', 'SimpleAIClient']
    );
    expect(
      'and there is no DataTransferClient in the registry later, nor after observing',
      report.clients?.later.includes('DataTransferClient'),
      false
    );
  }

  // A game with a human seat is not watched.
  {
    const report = run('played');

    expect('players: 2 is a game with a human seat', report.clients?.atStart, [
      'DataTransferClient',
      'SimpleAIClient',
    ]);
    expect(
      `${RULE} stays enabled in a game with a human seat`,
      report.rule,
      true
    );
    expect(
      'no observer is sent for it',
      report.log.some(
        (entry) => entry.kind === 'send' && entry.channel === 'observer'
      ),
      false
    );
  }

  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL observer (${
        failures.length
      } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS observer (${checks} checks)\n`);
  process.exit(0);
}
