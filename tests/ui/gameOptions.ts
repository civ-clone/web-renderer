// The client options a player changes are kept in browser storage and come
// back on the next page load, falling back to the defaults when storage can't
// be used (#343).

import GameOptionsRegistry, {
  OptionStorage,
} from '../../src/js/UI/GameOptionsRegistry';

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

const memoryStorage = (initial: { [key: string]: string } = {}) => {
    const items = { ...initial };

    return {
      items,
      storage: {
        getItem: (key: string) => items[key] ?? null,
        setItem: (key: string, value: string) => {
          items[key] = value;
        },
      } as OptionStorage,
    };
  },
  defaults = {
    autoEndOfTurn: true,
    autoEndOfTurnExceptions: ['CivilDisorder'],
    mapScale: 2,
  },
  pageLoad = (storage: () => OptionStorage | null) => {
    const registry = new GameOptionsRegistry(storage);

    registry.defaults(defaults);

    return registry;
  };

{
  const { storage } = memoryStorage(),
    first = pageLoad(() => storage);

  expect('with nothing stored, the default is used', first.get('mapScale'), 2);

  first.set('mapScale', 3);
  first.set('autoEndOfTurn', false);

  const second = pageLoad(() => storage);

  expect('a changed option survives a reload', second.get('mapScale'), 3);
  expect(
    'a changed false option survives a reload',
    second.get('autoEndOfTurn'),
    false
  );
  expect(
    'an option the player never changed keeps its default',
    second.get('autoEndOfTurnExceptions'),
    ['CivilDisorder']
  );
}

{
  const { items, storage } = memoryStorage(),
    registry = pageLoad(() => storage);

  registry.set('mapScale', 4);

  expect(
    'only options the player set are stored',
    Object.keys(JSON.parse(items.gameOptions)),
    ['mapScale']
  );
}

{
  const { storage } = memoryStorage({
      gameOptions: JSON.stringify({
        mapScale: '3',
        autoEndOfTurn: null,
        autoEndOfTurnExceptions: 'CivilDisorder',
      }),
    }),
    registry = pageLoad(() => storage);

  expect(
    'a stored value of the wrong type falls back',
    registry.get('mapScale'),
    2
  );
  expect('a stored null falls back', registry.get('autoEndOfTurn'), true);
  expect(
    'a stored non-array falls back for an array option',
    registry.get('autoEndOfTurnExceptions'),
    ['CivilDisorder']
  );
}

{
  const { storage } = memoryStorage({ gameOptions: '{not json' }),
    registry = pageLoad(() => storage);

  expect('unparseable storage falls back', registry.get('mapScale'), 2);
}

{
  const { storage } = memoryStorage({ gameOptions: '[1, 2]' }),
    registry = pageLoad(() => storage);

  expect('a stored array falls back', registry.get('mapScale'), 2);
}

{
  const blocked = () => {
      throw new Error('SecurityError: storage is blocked');
    },
    registry = pageLoad(blocked);

  expect('blocked storage gives the defaults', registry.get('mapScale'), 2);

  registry.set('mapScale', 3);

  expect(
    'with storage blocked, a change still applies for this page',
    registry.get('mapScale'),
    3
  );
}

{
  const registry = pageLoad(() => null);

  registry.set('mapScale', 3);

  expect(
    'with no storage at all, a change still applies',
    registry.get('mapScale'),
    3
  );
}

if (failures.length) {
  process.stderr.write(
    `FAIL gameOptions\n${failures
      .map((failure) => `  ${failure}`)
      .join('\n')}\n`
  );
  process.exit(1);
}

console.log(`PASS gameOptions (${checks} checks)`);
