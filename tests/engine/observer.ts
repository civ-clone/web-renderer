// A game nobody plays is watched (#607, #606): set up with no human seat, the worker sends the page `observer` with
//  every player and the one seen as, that player's `gameData` and `turnEnded`, and the turn loop runs with nobody to
//  wait for. The page then sees the game as that player does: patches over the turns, at least one as each turn ends;
//  `observe` moves it to another player with a new `observer` and `gameData` and nothing of the first player after it,
//  and nothing of another player in full, or to several together, whose squares, units and cities are all there in full
//  with nobody else's, or to the whole map, every square of it with nobody's units or cities in full (#613), and a
//  choice of nobody in the game leaves it as it was; `pause` holds the turns between turns and `resume` lets them go; and an
//  `action` does nothing. A watched game stops at its ending as a played one does, so the rule that would carry a game
//  of computer players on is disabled in it and not in a game with a human seat, and no `DataTransferClient` is in the
//  `ClientRegistry`: every player's client is a computer's.
//
// The engine is a singleton, so each game is played in its own process of this same bundle (`--scenario <name>`),
//  through a stub transport and the worker's own `Game`, which reports what it saw as a line of JSON.

// Must stay first: it seeds the engine's random source before any engine module evaluates.
import './lib/seed';

import Player from '@civ-clone/core-player/Player';
import Game from '../../src/js/Engine/Game';
import { execFileSync } from 'child_process';
import { instance as cityRegistryInstance } from '@civ-clone/core-city/CityRegistry';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { defaultGame } from '@civ-clone/core-game/defaultGame';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import { instance as playerWorldRegistryInstance } from '@civ-clone/core-player-world/PlayerWorldRegistry';

const RULE = 'civ1-game-end:game-over/carry-on-unattended',
  SMALL_MAP = { width: 40, height: 25, difficulty: 'Chieftain' };

type Setup = { seats?: { kind: 'human' | 'computer' }[]; players?: number };

const SCENARIOS: { [name: string]: Setup } = {
  watch: {
    seats: [{ kind: 'computer' }, { kind: 'computer' }, { kind: 'computer' }],
  },
  // The same game, with the views of several players together and of the whole map taken in turn while it is held.
  views: {
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

// What a `gameData` says about the player's world: how many squares it lists, how many of them are undiscovered
//  (terrain `Unknown`), and which are, by position.
type Squares = { count: number; unknown: number; at: string[] };

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
  // The `views` scenario: where in the log each view was chosen, and the squares the engine knew when it was.
  views: {
    marks: {
      second: number;
      third: number;
      both: number;
      world: number;
      nowhere: number;
    };
    known: { second: number; third: number; both: number };
    world: { width: number; height: number };
    // The cities a watcher asked for (#613): one of a civilisation watched, one not.
    cities: {
      watched: { id: string; name: string };
      unwatched: { id: string; name: string };
    } | null;
  } | null;
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

// The squares a `gameData` lists in the player's world: a known square is a reference to a `PlayerTile`, an undiscovered
//  one is made up inline (see `makeDataFilter`), and either has its terrain.
const squaresOf = (payload: any): Squares => {
  const objects = payload?.objects ?? {},
    resolve = (value: any): any =>
      value?.['#ref'] ? objects[value['#ref']] : value,
    player = resolve(objects[idOf(payload?.hierarchy) ?? '']?.player),
    tiles: any[] = resolve(resolve(player?.world)?.tiles) ?? [],
    unknown = tiles
      .map(resolve)
      .filter((tile) => resolve(tile?.terrain)?._ === 'Unknown');

  return {
    count: tiles.length,
    unknown: unknown.length,
    at: unknown.map((tile) => `${tile.x},${tile.y}`),
  };
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
      views: null,
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
      // A request's answer (#470): logged on its own channel, as what it says of the city asked for (#613).
      reply: (channel: string, data: any, id: number) => {
        const sent = JSON.parse(JSON.stringify(data ?? null)),
          city = sent?.objects?.[idOf(sent.hierarchy)!];

        report.log.push({
          kind: 'send',
          channel: `reply:${channel}`,
          data: {
            id,
            city: city?.id ?? null,
            type: city?._ ?? null,
            name: city?.name ?? null,
            // A player goes as a plain object, not in full: none is an object of its own.
            playersInFull: Object.values(sent?.objects ?? {}).filter(
              (object: any) => object._ === 'Player'
            ).length,
          },
        });
      },
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
                ? {
                    player: idOf(sent.objects[idOf(sent.hierarchy)!]?.player),
                    squares: squaresOf(sent),
                  }
                : undefined,
            contents: contentsOf(sent),
          });
        } else if (channel === 'notification') {
          if (sent?.key === 'Game.progress.turn') {
            report.progress.all++;
          }
        } else if (channel === 'gameNotification') {
          const notification = sent.objects[idOf(sent.hierarchy)!] ?? {};

          report.log.push({
            kind: 'send',
            channel,
            data: { key: notification.key, bubble: notification.bubble },
          });
        } else if (
          ['observer', 'turnEnded', 'actionHandled', 'requestFailed'].includes(
            channel
          )
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

  // The views of one player, then another, then both together, then the whole map, each chosen while the turns are held
  //  so that what the engine knows is what is sent, and then a choice of nobody in the game.
  const viewed = async (): Promise<void> => {
    const [, second, third] = report.players,
      mark = (): number => report.log.length,
      choose = (view: any): number => {
        const at = mark();

        receivers.get('observe')!({ view });

        return at;
      },
      worlds = (ids: string[]) =>
        ids.map((id) =>
          playerWorldRegistryInstance
            .getByPlayer(
              playerRegistryInstance
                .entries()
                .find((player: Player) => player.id() === id)!
            )
            .entries()
            .map((playerTile) => playerTile.tile())
        ),
      known = (ids: string[]): number =>
        new Set(
          worlds(ids)
            .flat()
            .map((tile) => `${tile.x()},${tile.y()}`)
        ).size,
      map = worlds([second])[0][0].map(),
      cityOf = (id: string) =>
        cityRegistryInstance.getByPlayer(
          playerRegistryInstance
            .entries()
            .find((player: Player) => player.id() === id)!
        )[0],
      // A watcher opens a city (#613): the page's request, by square and with an id, as `answer` sees it.
      openCity = (square: { x: number; y: number }, requestId: number): void =>
        receivers.get('observeCity')!(square, { id: requestId }),
      squareOf = (city: { tile(): { x(): number; y(): number } }) => ({
        x: city.tile().x(),
        y: city.tile().y(),
      });

    receivers.get('pause')!(null);

    await until(() => sentCount('observer', true) > 0);
    await wait(100);

    // Chosen one after the other with nothing awaited between, and counted as each is.
    const marks = {
        second: choose({ kind: 'players', playerIds: [second] }),
        third: choose({ kind: 'players', playerIds: [third] }),
        both: choose({ kind: 'players', playerIds: [second, third] }),
        world: -1,
        nowhere: -1,
      },
      counts = {
        second: known([second]),
        third: known([third]),
        both: known([second, third]),
      };

    await wait(100);

    // Watching the second and third: a city of the second opens, a city of the first is refused.
    const watched = cityOf(second),
      unwatched = cityOf(report.players[0]);

    if (watched && unwatched) {
      openCity(squareOf(watched), 1);
      openCity(squareOf(unwatched), 2);
      openCity({ x: -1, y: -1 }, 3);
    }

    await wait(100);

    marks.world = choose({ kind: 'world' });

    await wait(100);

    // The whole map: any city opens.
    if (unwatched) {
      openCity(squareOf(unwatched), 4);
    }

    await wait(100);

    marks.nowhere = choose({ kind: 'players', playerIds: ['Nowhere'] });

    await wait(300);

    report.views = {
      marks,
      known: counts,
      world: { width: map.width(), height: map.height() },
      cities:
        watched && unwatched
          ? {
              watched: { id: watched.id(), name: watched.name() },
              unwatched: { id: unwatched.id(), name: unwatched.name() },
            }
          : null,
    };

    finish();
  };

  (async (): Promise<void> => {
    // A game with a human seat is not watched: it has played a few turns, and the rule is still on.
    if (name === 'played') {
      await until(() => report.turns.running >= 3);

      return finish();
    }

    // The game under way, watched: a few turns, then the third player.
    // Far enough in for the civilisations to have units as well as cities, which the checks below need in full.
    await until(() => report.turns.running >= 40);

    const observed = report.log.find(
      (entry) => entry.kind === 'send' && entry.channel === 'observer'
    ) as Extract<Entry, { kind: 'send' }> | undefined;

    report.players = (observed?.data.players ?? []).map(
      ({ id }: { id: string }) => id
    );
    report.clients!.later = names();

    if (name === 'views') {
      return viewed().catch((error: any): void => {
        process.stderr.write(`${error?.stack ?? error}
`);
        process.exit(1);
      });
    }

    report.marks.observed = report.log.length;
    receivers.get('observe')!({
      view: { kind: 'players', playerIds: [report.players[2]] },
    });

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
      [observers[0]?.data.view, observers[0]?.data.paused],
      [{ kind: 'players', playerIds: [first] }, false]
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
      observers.find((_, i) => i > 0)?.data.view,
      { kind: 'players', playerIds: [third] }
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
      [heldState?.data.paused, heldState?.data.view],
      [true, { kind: 'players', playerIds: [third] }]
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
      [resumedState?.data.paused, resumedState?.data.view],
      [false, { kind: 'players', playerIds: [third] }]
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

  // Several civilisations together, then the whole map, then nobody (#613).
  {
    const report = run('views'),
      [first, second, third] = report.players,
      { marks, known, world } = report.views!,
      order = [
        marks.second,
        marks.third,
        marks.both,
        marks.world,
        marks.nowhere,
      ],
      next = (mark: number): number | undefined =>
        order[order.indexOf(mark) + 1],
      // What was sent from one choice to the next (or to the end).
      after = (mark: number) => report.log.slice(mark, next(mark)),
      observerAfter = (mark: number) =>
        sends(report, 'observer', mark, next(mark)),
      gameDataAfter = (mark: number) =>
        sends(report, 'gameData', mark, next(mark)),
      owners = (mark: number, kind: 'units' | 'cities' | 'players'): string[] =>
        [
          ...new Set(
            after(mark).flatMap((entry) =>
              entry.kind === 'send' && entry.contents
                ? entry.contents[kind]
                : []
            )
          ),
        ].sort(),
      views = {
        both: { kind: 'players', playerIds: [second, third] },
        world: { kind: 'world' },
      };

    expect('the game has three players', report.players.length, 3);
    expect('no worker error was sent', report.workerErrors, []);

    // A watcher closes no windows: everything the civilisations watched are told of comes as a notice.
    const notifications = sends(report, 'gameNotification');

    expect(
      'the watcher is told what happens to the civilisations watched',
      notifications.length > 0,
      true
    );
    expect(
      'every notification a watcher is sent is a notice, not a window',
      notifications
        .filter((entry) => entry.data.bubble !== true)
        .map((entry) => entry.data.key),
      []
    );
    expect(
      'the views were taken in order',
      order.every((mark, i) => mark > 0 && (i === 0 || mark > order[i - 1])),
      true
    );

    // One player, then another, so that the counts are the ones to compare with.
    expect(
      'a view of the second player alone is their gameData',
      [
        observerAfter(marks.second)[0]?.data.view,
        gameDataAfter(marks.second)[0]?.data.player,
      ],
      [{ kind: 'players', playerIds: [second] }, second]
    );
    expect(
      'and of the third alone',
      [
        observerAfter(marks.third)[0]?.data.view,
        gameDataAfter(marks.third)[0]?.data.player,
      ],
      [{ kind: 'players', playerIds: [third] }, third]
    );
    expect(
      'a single player is sent the squares they know',
      [
        gameDataAfter(marks.second)[0]?.data.squares.count,
        gameDataAfter(marks.third)[0]?.data.squares.count,
      ],
      [known.second, known.third]
    );

    // A watcher opens a city of a civilisation watched, and any city of the whole map, each in full as a Diplomat's
    //  investigation is sent; a city of a civilisation not watched is answered with nothing, as is a square with none
    //  (#613).
    const cities = report.views!.cities!,
      answers = sends(report, 'reply:observeCity'),
      none = { city: null, type: null, name: null, playersInFull: 0 };

    expect(
      'the game had a watched and an unwatched city to open',
      cities !== null,
      true
    );
    expect(
      'a city of a civilisation watched opens, in full, with its players as plain objects; one not watched, or none there, is nothing',
      answers.map((entry) => entry.data),
      [
        {
          id: 1,
          city: cities.watched.id,
          type: 'City',
          name: cities.watched.name,
          playersInFull: 0,
        },
        { id: 2, ...none },
        { id: 3, ...none },
        {
          id: 4,
          city: cities.unwatched.id,
          type: 'City',
          name: cities.unwatched.name,
          playersInFull: 0,
        },
      ]
    );

    // Two together.
    const both = gameDataAfter(marks.both);

    expect(
      'choosing two players sends observer with both, then one gameData, then turnEnded',
      [
        observerAfter(marks.both).map((entry) => entry.data.view),
        both.length,
        sends(report, 'turnEnded', marks.both, next(marks.both)).length,
      ],
      [[views.both], 1, 1]
    );
    expect(
      "the union's gameData is the first of them, the second player's",
      both[0]?.data.player,
      second
    );
    expect(
      "its world has at least the most squares either knows alone, and at most both's together",
      [
        both[0]?.data.squares.count >= Math.max(known.second, known.third),
        both[0]?.data.squares.count <= known.second + known.third,
      ],
      [true, true]
    );
    expect(
      'and is every square either knows, once',
      both[0]?.data.squares.count,
      known.both
    );
    expect(
      "both players' units are in full, and nobody else's",
      owners(marks.both, 'units'),
      [second, third].sort()
    );
    expect(
      "both players' cities are in full, and nobody else's",
      owners(marks.both, 'cities'),
      [second, third].sort()
    );
    expect(
      "the first player's, who is neither, are not in full: units, cities and the player",
      [
        owners(marks.both, 'units').includes(first),
        owners(marks.both, 'cities').includes(first),
        owners(marks.both, 'players').includes(first),
      ],
      [false, false, false]
    );
    expect(
      'and both players are sent whole',
      [second, third].every((id) => owners(marks.both, 'players').includes(id)),
      true
    );

    // The whole map.
    const everything = gameDataAfter(marks.world);

    expect(
      'choosing the world sends observer with the world, then one gameData, then turnEnded',
      [
        observerAfter(marks.world).map((entry) => entry.data.view),
        everything.length,
        sends(report, 'turnEnded', marks.world, next(marks.world)).length,
      ],
      [[views.world], 1, 1]
    );
    expect(
      'the map is 40 by 25',
      [world.width, world.height],
      [SMALL_MAP.width, SMALL_MAP.height]
    );
    expect(
      'the world lists every square of the map',
      everything[0]?.data.squares.count,
      world.width * world.height
    );
    expect(
      'and none of them is undiscovered (terrain Unknown)',
      everything[0]?.data.squares.at,
      []
    );
    expect(
      'whereas a single player does not know every square, so the check could fail',
      gameDataAfter(marks.second)[0]?.data.squares.unknown > 0 ||
        known.second < world.width * world.height,
      true
    );
    expect(
      "the world's gameData is shaped as the player last watched, the second",
      everything[0]?.data.player,
      second
    );
    expect(
      'nobody has units in full in the world view',
      owners(marks.world, 'units'),
      []
    );
    expect('nor cities', owners(marks.world, 'cities'), []);
    expect(
      'and the units and cities of the earlier view were in full to begin with, so the check could fail',
      owners(marks.both, 'units').length > 0 &&
        owners(marks.both, 'cities').length > 0,
      true
    );

    // A choice of nobody in the game.
    expect(
      'a choice naming nobody in the game sends observer again with the view as it was',
      observerAfter(marks.nowhere).map((entry) => entry.data.view),
      [views.world]
    );
    expect(
      'and sends no new gameData, nor turnEnded',
      [
        gameDataAfter(marks.nowhere).length,
        sends(report, 'turnEnded', marks.nowhere).length,
      ],
      [0, 0]
    );
    expect(
      'the players are listed still, and the turns are held',
      [
        observerAfter(marks.nowhere)[0]?.data.players.map(
          ({ id }: { id: string }) => id
        ),
        observerAfter(marks.nowhere)[0]?.data.paused,
      ],
      [report.players, true]
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
