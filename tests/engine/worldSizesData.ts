// The world sizes the worker sends New Game (#1175): the rules' own, from core-world-generator's `WorldSizeRegistry`,
//  as plain data, with what a size typed in may be; none, and no bounds, from rules that register none (Civ1's).

import WorldSize from '@civ-clone/core-world-generator/WorldSize';
import WorldSizeRegistry from '@civ-clone/core-world-generator/WorldSizeRegistry';
import worldSizesData from '@civ-clone/ui-worker-client/lib/worldSizes';

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

const players = { minPlayers: 3, maxPlayers: 7, players: 7 },
  empty = new WorldSizeRegistry();

expect(
  'rules that register no sizes send none, and no bounds',
  worldSizesData(empty),
  { sizes: [], custom: null }
);

const registry = new WorldSizeRegistry(),
  limits = {
    topologyId: 'staggered-iso' as const,
    minWidth: 20,
    maxWidth: 250,
    minHeight: 20,
    maxHeight: 250,
    minArea: 1000,
    maxArea: 10000,
    ...players,
  };

registry.register(
  new WorldSize('small', 40, 50, { topologyId: 'staggered-iso', ...players }),
  new WorldSize('large', 75, 120, {
    topologyId: 'staggered-iso',
    ...players,
    earth: true,
  })
);
registry.setCustomLimits(limits);

const data = worldSizesData(registry);

expect(
  'rules that register sizes send each, in their order, as plain data, with the bounds of a size typed in',
  data,
  {
    sizes: [
      {
        key: 'small',
        topologyId: 'staggered-iso',
        width: 40,
        height: 50,
        ...players,
        earth: false,
      },
      {
        key: 'large',
        topologyId: 'staggered-iso',
        width: 75,
        height: 120,
        ...players,
        earth: true,
      },
    ],
    custom: limits,
  }
);

expect(
  "the bounds sent are a copy, not the registry's own",
  data.custom !== registry.customLimits(),
  true
);

// civ2-world registers Civ2's own sizes, which is what the worker sends once the civ2 set is loaded.
require('@civ-clone/civ2-world/registerWorldSizes');

expect(
  "with civ2-world loaded, the worker sends Civ2's three sizes, from 3 to 7 civilizations, and its bounds",
  (({ sizes, custom }) => [
    sizes.map(({ key, width, height, minPlayers, maxPlayers, players }) => [
      key,
      width,
      height,
      minPlayers,
      maxPlayers,
      players,
    ]),
    custom === null
      ? null
      : [custom.minWidth, custom.maxWidth, custom.minArea, custom.maxArea],
  ])(worldSizesData()),
  [
    [
      ['small', 40, 50, 3, 7, 7],
      ['normal', 50, 80, 3, 7, 7],
      ['large', 75, 120, 3, 7, 7],
    ],
    [20, 250, 1000, 10000],
  ]
);

if (failures.length > 0) {
  process.stderr.write(
    `FAIL worldSizesData (${
      failures.length
    } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS worldSizesData (${checks} checks)\n`);
