// The client options a player changes are kept in browser storage and come
// back on the next page load, falling back to the defaults when storage can't
// be used (#343).

// Must stay first: modules read `document` as they load. The interfaces registered, as the page does, give the
//  `interface` option its default.
import './lib/dom';
import './lib/interfaces';
import './lib/artPacks';

import GameOptionsRegistry, {
  OptionStorage,
  instance as options,
} from '@civ-clone/ui-platform/GameOptionsRegistry';
import setOptionDefaults from '@civ-clone/ui-game/app/options';

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

// Change handlers (#1114): one that throws keeps neither the value from being kept nor the others from hearing, and
//  each can be stopped.
{
  const { items, storage } = memoryStorage(),
    registry = new GameOptionsRegistry(() => storage),
    heard: string[] = [],
    errors: unknown[][] = [],
    logError = console.error;

  console.error = (...args: unknown[]) => errors.push(args);

  const stopThrowing = registry.onChange((key) => {
      throw new Error(`can't follow ${key}`);
    }),
    stopHearing = registry.onChange((key) => heard.push(key));

  registry.defaults(defaults);
  registry.set('mapScale', 3);

  expect(
    "a handler that throws: every default still registered, the change still kept, the other handler told, and it's logged",
    [
      registry.get('autoEndOfTurn'),
      registry.get('mapScale'),
      JSON.parse(items.gameOptions ?? '{}'),
      heard,
      errors.length,
    ],
    [
      true,
      3,
      { mapScale: 3 },
      ['autoEndOfTurn', 'autoEndOfTurnExceptions', 'mapScale', 'mapScale'],
      4,
    ]
  );

  stopThrowing();
  stopHearing();
  stopHearing();
  heard.length = 0;
  errors.length = 0;
  registry.set('mapScale', 4);

  expect(
    'stopped handlers hear nothing, and stopping one twice is harmless',
    [registry.get('mapScale'), heard, errors.length],
    [4, [], 0]
  );

  console.error = logError;
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

{
  // The page's own defaults: each option Options offers comes back from storage only if it has one.
  const { storage } = memoryStorage({
    gameOptions: JSON.stringify({ unitMarker: 'ring' }),
  });

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
  });

  setOptionDefaults();

  expect(
    'how the unit awaiting orders is marked survives a reload (#753)',
    options.get('unitMarker'),
    'ring'
  );
}

{
  // The sound (#126): on at 70 for a player who never changed it, and as they left it for one who did.
  const fresh = memoryStorage();

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: fresh.storage,
  });

  setOptionDefaults();

  expect(
    'the sound is on at 70 by default (#126)',
    [options.get('sound'), options.get('soundVolume')],
    [true, 70]
  );

  options.set('sound', false);
  options.set('soundVolume', 35);
  setOptionDefaults();

  expect(
    'the sound and its volume survive a reload (#126)',
    [options.get('sound'), options.get('soundVolume')],
    [false, 35]
  );
}

{
  // Each set's zoom (#97, #1063): Civ1's `zoom.civ1` and Civ2's `zoom.civ2` both registered, at the set's own default,
  //  and one the player chose comes back on a reload, as when a save is loaded.
  const fresh = memoryStorage();

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: fresh.storage,
  });

  setOptionDefaults();

  const before = [options.get('zoom.civ1'), options.get('zoom.civ2')];

  options.set('zoom.civ2', 1.7);
  setOptionDefaults();

  expect(
    "each set's zoom is registered at its default, and a chosen one survives a reload (#97, #1063)",
    [before, [options.get('zoom.civ1'), options.get('zoom.civ2')]],
    [
      [2, 1.4],
      [2, 1.7],
    ]
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
