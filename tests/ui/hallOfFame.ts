// The Hall of Fame (#179): a game's ending makes an entry unless your civilization was destroyed or you'd already kept
// playing; entries are ranked by rating, then score, a game is recorded once, and storage that's missing, blocked or
// holding something else means an empty Hall of Fame rather than an error.

import {
  HallOfFameEntry,
  HallOfFameStorage,
  enterHallOfFame,
  hallOfFame,
  hallOfFameEntry,
  hallOfFameSize,
} from '../../src/js/UI/lib/hallOfFame';
import { GameOverDetails } from '../../src/js/Engine/lib/gameOver';

const failures: string[] = [];
let checks = 0;

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

const memoryStorage = (): HallOfFameStorage => {
    const items: { [key: string]: string } = {};

    return {
      getItem: (key: string) => items[key] ?? null,
      setItem: (key: string, value: string) => {
        items[key] = value;
      },
    };
  },
  blockedStorage: HallOfFameStorage = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
  },
  details = (overrides: Partial<GameOverDetails> = {}): GameOverDetails => ({
    id: 'GameResult-1',
    reason: 'retired',
    you: { civilization: 'Roman', leader: 'Caesar' },
    winner: null,
    turn: 300,
    year: 1850,
    difficulty: 'Prince',
    score: { terms: [], bonus: null, total: 500, scoringComplete: false },
    rating: 30,
    famousLeader: 'VladimirLenin',
    discovery: null,
    scoringComplete: false,
    keepPlaying: true,
    ...overrides,
  }),
  entry = (id: string, rating: number, score: number): HallOfFameEntry => ({
    ...hallOfFameEntry(details(), 0)!,
    id,
    rating,
    score,
  });

expect('a retired game makes an entry', hallOfFameEntry(details(), 1234), {
  id: 'GameResult-1|Roman|Caesar|Prince|retired|300|500',
  civilization: 'Roman',
  leader: 'Caesar',
  difficulty: 'Prince',
  reason: 'retired',
  year: 1850,
  score: 500,
  rating: 30,
  date: 1234,
});
expect(
  'a civilization destroyed makes none',
  hallOfFameEntry(
    details({ reason: 'destroyed', score: null, rating: null }),
    0
  ),
  null
);
expect(
  'an ending shown after Keep playing makes none',
  hallOfFameEntry(details({ scoringComplete: true }), 0),
  null
);

{
  const storage = memoryStorage();

  enterHallOfFame(entry('a', 20, 900), () => storage);
  enterHallOfFame(entry('b', 40, 100), () => storage);
  enterHallOfFame(entry('c', 20, 1000), () => storage);
  enterHallOfFame(entry('a', 99, 9999), () => storage);

  expect(
    'entries are ranked by rating, then score, and a game is recorded once',
    hallOfFame(() => storage).map(({ id }) => id),
    ['b', 'c', 'a']
  );

  for (let i = 0; i < hallOfFameSize + 2; i++) {
    enterHallOfFame(entry(`low-${i}`, 1, i), () => storage);
  }

  expect(
    `it keeps the best ${hallOfFameSize}`,
    hallOfFame(() => storage).length,
    hallOfFameSize
  );
  expect(
    'the best stay',
    hallOfFame(() => storage)
      .slice(0, 3)
      .map(({ id }) => id),
    ['b', 'c', 'a']
  );
}

expect(
  'no storage means none',
  hallOfFame(() => null),
  []
);
expect(
  'blocked storage means none',
  hallOfFame(() => blockedStorage),
  []
);
expect(
  'blocked storage still shows the game just ended',
  enterHallOfFame(entry('a', 20, 900), () => blockedStorage).map(
    ({ id }) => id
  ),
  ['a']
);

{
  const storage = memoryStorage();

  storage.setItem('civ.hallOfFame', '{"not": "a list"}');

  expect(
    'something else under the key means none',
    hallOfFame(() => storage),
    []
  );

  storage.setItem('civ.hallOfFame', 'not JSON');

  expect(
    'unreadable storage means none',
    hallOfFame(() => storage),
    []
  );
}

if (failures.length > 0) {
  console.error(
    `FAIL hallOfFame (${failures.length} of ${checks}):\n  ${failures.join(
      '\n  '
    )}`
  );
  process.exit(1);
}

console.log(`PASS hallOfFame (${checks} checks)`);
