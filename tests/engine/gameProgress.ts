// The line along the top of the page says which turn has started and which civilization is moving (#588), in a game
//  loaded from a save as in a new one, and as a key for the page to translate rather than as English.
//
// Played through the worker's own `Game` over a stub transport, with the human's turns automated. The new game reveals
//  the map at turn 2, so its player has met the civilizations with cities, and saves at turn 3 through `save`. The save
//  is then loaded through `load` in a second process of this same bundle (`--load <file>`), as loading needs an engine
//  that has not started a game (see `src/js/Engine/loadGame.ts`), which plays on to turn 5 and reports what it sent.

// Must stay first: it seeds the engine's random source before any engine module evaluates.
import './lib/seed';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Game from '../../src/js/Engine/Game';
import Player from '@civ-clone/core-player/Player';
import { execFileSync } from 'child_process';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as turnInstance } from '@civ-clone/core-turn-based-game/Turn';

const mode = process.argv.includes('--load') ? 'load' : 'new',
  file =
    mode === 'load'
      ? process.argv[process.argv.indexOf('--load') + 1]
      : path.join(
          fs.mkdtempSync(path.join(os.tmpdir(), 'game-progress-')),
          'game.json'
        ),
  // The new game saves as this turn starts, and the loaded one stops as this one does.
  SAVE_AT = 3,
  STOP_AT = 5;

type Report = {
  // Every `notification` sent while the game was played, in order.
  notifications: any[];
  // How many times the human's turn started.
  humanTurnStarts: number;
  // Each other civilization's turn start: the turn, whose it was, and the line `Game` sent for it.
  others: { turn: number; civilization: string; notices: any[] }[];
  turns: number[];
};

const report: Report = {
  notifications: [],
  humanTurnStarts: 0,
  others: [],
  turns: [],
};

// Where the last turn start's notices ended, so each one's are its own.
let mark = 0;

const receivers = new Map<string, (data: any) => void>(),
  sent: [string, any][] = [],
  transport: any = {
    receive: (channel: string, handler: (data: any) => void) => {
      receivers.set(channel, handler);

      return () => receivers.delete(channel);
    },
    receiveOnce: () => () => {},
    send: (channel: string, data: any) => {
      sent.push([channel, data]);

      if (channel === 'notification') {
        report.notifications.push(data);
      }
    },
    request: () => new Promise(() => {}),
  };

// As the other suites stop a game: the turn events that would drive it on are dropped, rather than the process being
//  killed mid-turn.
let stopped = false;
const LOOP = ['player:turn-end', 'player:turn-start', 'turn:end', 'turn:start'],
  emitDirect = engine.emit.bind(engine);

engine.emit = ((event: string, ...args: any[]): void => {
  if (stopped && LOOP.includes(event)) {
    return;
  }

  emitDirect(event, ...args);
}) as typeof engine.emit;

new Game(transport);

const human = (): Player | null =>
  clientRegistryInstance
    .entries()
    .find((client) => client.constructor.name === 'DataTransferClient')
    ?.player() ?? null;

// After `Game`'s own listeners, which were bound as it was made.
engine.on('player:turn-start', (player: Player): void => {
  const notices = report.notifications.slice(mark);

  mark = report.notifications.length;

  if (player === human()) {
    report.humanTurnStarts++;

    return;
  }

  report.others.push({
    turn: turnInstance.value(),
    civilization: player.civilization().sourceClass().name,
    notices,
  });
});

const failures: string[] = [];
let checks = 0,
  finished = false;

const expect = (description: string, actual: unknown, expected: unknown) => {
  checks++;

  const [a, e] = [actual, expected].map((value) => JSON.stringify(value));

  if (a !== e) {
    failures.push(`${description}\n    expected: ${e}\n    actual:   ${a}`);
  }
};

// A run that stops before it reports has checked nothing (#473).
process.on('exit', (code: number): void => {
  if (mode === 'new' && code === 0 && !finished) {
    process.stderr.write('FAIL gameProgress: stopped before the checks ran\n');
    process.exitCode = 1;
  }
});

const progressKeys = [
    'Game.progress.turn',
    'Game.progress.player',
    'Game.progress.unmet-player',
  ],
  keyed = (notifications: any[]): { key: string; data: any }[] =>
    notifications.filter(
      (notice) => typeof notice === 'object' && notice !== null
    ),
  ofKey = (notifications: any[], ...keys: string[]) =>
    keyed(notifications).filter(({ key }) => keys.includes(key)),
  named = (notifications: any[]): string[] =>
    ofKey(notifications, 'Game.progress.player')
      .map(({ data }) => data.civilization)
      .filter((name, index, names) => names.indexOf(name) === index)
      .sort(),
  // The English the worker used to send for these (#588).
  english = (notifications: any[]): string[] =>
    notifications.filter(
      (notice) =>
        typeof notice === 'string' && /turn start|turn-start/.test(notice)
    );

const check = (played: Report, loaded: Report): void => {
  // The new game, which `start` binds its start-up lines for.
  expect(
    'a new game says each turn that starts, as a key',
    ofKey(played.notifications, 'Game.progress.turn').map(({ data }) => data),
    played.turns.map((turn) => ({ turn }))
  );
  expect(
    "and each other civilization's turn, as a key, and not the human's own",
    ofKey(
      played.notifications,
      'Game.progress.player',
      'Game.progress.unmet-player'
    ).length,
    played.others.length
  );
  // Nobody has met anybody on turn 1, before the map is revealed: the seeded game's civilizations start out of sight
  //  of one another.
  expect(
    'a new game leaves a civilization not yet met unnamed',
    played.others
      .filter(({ turn }) => turn === 1)
      .map(({ notices }) =>
        ofKey(notices, 'Game.progress.player', 'Game.progress.unmet-player')
      ),
    played.others
      .filter(({ turn }) => turn === 1)
      .map(() => [{ key: 'Game.progress.unmet-player', data: {} }])
  );
  expect(
    'and there were civilizations to leave unnamed',
    played.others.filter(({ turn }) => turn === 1).length > 0,
    true
  );
  expect(
    'a new game names the civilizations its player has met',
    named(played.notifications).length > 0,
    true
  );

  // The loaded game, which is never `start`ed.
  expect(
    'a loaded game says each turn that starts, as a key',
    ofKey(loaded.notifications, 'Game.progress.turn').map(({ data }) => data),
    loaded.turns.map((turn) => ({ turn }))
  );
  expect(
    'a loaded game had other civilizations move',
    loaded.others.length > 0,
    true
  );
  expect(
    "and says each other civilization's turn, as a key, and not the human's own",
    ofKey(
      loaded.notifications,
      'Game.progress.player',
      'Game.progress.unmet-player'
    ).length,
    loaded.others.length
  );
  expect(
    'naming the same civilizations the new game did, as they were met before the save',
    named(loaded.notifications),
    named(played.notifications)
  );

  (
    [
      ['new', played],
      ['loaded', loaded],
    ] as [string, Report][]
  ).forEach(([name, { notifications, others }]) => {
    expect(
      `each line the ${name} game names a civilization in is for that civilization's turn`,
      others.flatMap(({ civilization, notices }) =>
        ofKey(notices, 'Game.progress.player')
          .filter(({ data }) => data.civilization !== civilization)
          .map(({ data }) => `${data.civilization} on ${civilization}'s turn`)
      ),
      []
    );
    expect(
      `the ${name} game sends no English for them`,
      english(notifications),
      []
    );
    expect(
      `every key the ${name} game sends is one of the progress keys, with only its data`,
      keyed(notifications).filter(
        ({ key, data }) =>
          !progressKeys.includes(key) ||
          (key === 'Game.progress.turn' &&
            JSON.stringify(Object.keys(data)) !== '["turn"]') ||
          (key === 'Game.progress.player' &&
            JSON.stringify(Object.keys(data)) !== '["civilization"]') ||
          (key === 'Game.progress.unmet-player' && Object.keys(data).length > 0)
      ),
      []
    );
  });
};

const finish = (): void => {
  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL gameProgress (${
        failures.length
      } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS gameProgress (${checks} checks)\n`);
  process.exit(0);
};

engine.on('turn:start', (turn: number): void => {
  if (stopped) {
    return;
  }

  // `Game`'s line for it has gone already, as its listener was bound first.
  report.turns.push(turn);

  if (mode === 'new' && turn === 2) {
    // So the human has met everyone with a city, and the lines that follow name them.
    receivers.get('cheat')!({ name: 'RevealMap', value: null });
  }

  if (mode === 'new' && turn === SAVE_AT) {
    stopped = true;

    // Nothing in here exits, so the save's directory goes whatever happens.
    let loaded: Report | null = null,
      problem = '';

    try {
      receivers.get('save')!({ name: 'progress' });

      const saved = sent.find(([channel]) => channel === 'saveGame');

      if (!saved) {
        throw new Error('the game was not saved');
      }

      fs.writeFileSync(file, saved[1].data);

      const output = execFileSync(
        process.execPath,
        [process.argv[1], '--load', file],
        {
          encoding: 'utf8',
          maxBuffer: 64 * 1024 * 1024,
          // Well inside the suite runner's five minutes, so a loaded game that hangs is reported as this.
          timeout: 2 * 60 * 1000,
        }
      );

      loaded = JSON.parse(output.trim().split('\n').slice(-1)[0]);
    } catch (error) {
      problem = String(
        (error as any)?.stderr || (error as any)?.message || error
      );
    } finally {
      fs.rmSync(path.dirname(file), { recursive: true, force: true });
    }

    if (loaded === null) {
      process.stderr.write(
        `FAIL gameProgress: the loaded game did not report\n${problem}\n`
      );
      process.exit(1);
    }

    check(report, loaded);
    finish();

    return;
  }

  if (mode === 'load' && turn >= STOP_AT) {
    stopped = true;

    process.stdout.write(JSON.stringify(report) + '\n');
    process.exit(0);
  }
});

// Played by the computer, so nobody need answer.
receivers.get('setOption')!({ name: 'automateLocalPlayer', value: true });

if (mode === 'load') {
  receivers.get('load')!({ data: fs.readFileSync(file, 'utf8') });
} else {
  [
    ['players', 3],
    ['width', 40],
    ['height', 30],
    // A level, so the loaded game doesn't ask for one.
    ['difficulty', 'Chieftain'],
  ].forEach(([name, value]) => receivers.get('setOption')!({ name, value }));

  receivers.get('start')!(null);
}
