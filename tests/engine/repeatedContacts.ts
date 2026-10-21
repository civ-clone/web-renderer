// A save from before `civ1-diplomacy` 0.1.3 can hold a `Contact` for every move two players' units made side by side:
//  tens of thousands, which slowed every turn to minutes (#377). Loading keeps one for each pair of players, the first
//  in the file, and drops the rest from the entities and the registries. Other interactions, and other pairs, are left
//  alone.

import { Game } from '@civ-clone/core-game/Game';
import { SaveGame } from '@civ-clone/core-save-game/SaveGame';
import {
  dropRepeatedContacts,
  registerDiplomacyClasses,
} from '../../src/js/Engine/diplomacy';

const failures: string[] = [];
let checks = 0,
  finished = false;

const expect = (description: string, actual: unknown, expected: unknown) => {
  checks++;

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(
      `${description}\n    expected: ${JSON.stringify(
        expected
      )}\n    actual:   ${JSON.stringify(actual)}`
    );
  }
};

// A run that stops before it reports has checked nothing (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write(
      'FAIL repeatedContacts: stopped before the checks ran\n'
    );
    process.exitCode = 1;
  }
});

const game = new Game();

registerDiplomacyClasses(game);

const contact = (id: string, ...players: string[]) => ({
    id,
    type: 'Contact',
    keys: ['id', 'players', 'when'],
    state: {
      _players: { $set: players.map(($ref: string) => ({ $ref })) },
      _when: 1,
    },
  }),
  file = {
    entities: [
      contact('Contact-1', 'Player-1', 'Player-2'),
      contact('Contact-2', 'Player-2', 'Player-1'),
      contact('Contact-3', 'Player-1', 'Player-3'),
      contact('Contact-4', 'Player-1', 'Player-2'),
      {
        id: 'Peace-1',
        type: 'Peace',
        keys: ['id', 'players', 'when'],
        state: {
          _players: { $set: [{ $ref: 'Player-1' }, { $ref: 'Player-2' }] },
        },
      },
    ],
    registries: {
      interactions: [
        'Contact-1',
        'Contact-2',
        'Contact-3',
        'Contact-4',
        'Peace-1',
      ],
      players: ['Player-1', 'Player-2', 'Player-3'],
    },
  } as unknown as SaveGame;

dropRepeatedContacts(file, game);

expect(
  'one Contact for each pair, whichever player it names first, and every other interaction',
  file.entities.map(({ id }) => id),
  ['Contact-1', 'Contact-3', 'Peace-1']
);

expect('the dropped ones go from the registries too', file.registries, {
  interactions: ['Contact-1', 'Contact-3', 'Peace-1'],
  players: ['Player-1', 'Player-2', 'Player-3'],
});

finished = true;

if (failures.length > 0) {
  process.stderr.write(
    `FAIL repeatedContacts (${
      failures.length
    } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS repeatedContacts (${checks} checks)\n`);
