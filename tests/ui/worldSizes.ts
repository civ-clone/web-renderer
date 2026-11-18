// The world sizes New Game offers (#55): Civ1's 8:5 shape, growing in order,
// with Normal being Civ1's own 80 × 50 map. Each offers a range of
// civilizations, largest first, with its default inside it, and none offers
// more than the 14 civilizations Civ1 has. Earth offers the sizes there is an
// Earth map for: Normal, Large and Huge.

import worldSizes, {
  customSizeProblem,
  defaultWorldSize,
  earthWorldSizes,
  playerCounts,
  ruleWorldSizes,
} from '@civ-clone/ui-client/lib/worldSizes';

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

expect(
  'the sizes, smallest first',
  worldSizes.map(({ key }) => key),
  ['tiny', 'small', 'normal', 'large', 'huge']
);

expect(
  "Normal is selected, and is Civ1's 80 × 50 map",
  [defaultWorldSize.key, defaultWorldSize.width, defaultWorldSize.height],
  ['normal', 80, 50]
);

worldSizes.forEach((size, index) => {
  const counts = playerCounts(size);

  expect(`${size.key} is 8:5`, size.width * 5, size.height * 8);

  if (index > 0) {
    const previous = worldSizes[index - 1];

    expect(
      `${size.key} is bigger than ${previous.key}, and allows at least as many civilizations`,
      [
        size.width > previous.width,
        size.maxPlayers >= previous.maxPlayers,
        size.players >= previous.players,
      ],
      [true, true, true]
    );
  }

  expect(
    `${size.key} offers ${size.minPlayers} to ${size.maxPlayers}, largest first`,
    counts,
    [...counts].sort((a, b) => b - a)
  );

  expect(
    `${size.key} offers a whole range from ${size.minPlayers} to ${size.maxPlayers}`,
    [counts[0], counts[counts.length - 1], counts.length],
    [size.maxPlayers, size.minPlayers, size.maxPlayers - size.minPlayers + 1]
  );

  expect(
    `${size.key}'s selected count is offered`,
    counts.includes(size.players),
    true
  );

  expect(
    `${size.key} offers no more than the 14 civilizations Civ1 has`,
    size.maxPlayers <= 14,
    true
  );
});

expect(
  'Huge offers up to 14, with 12 selected',
  [playerCounts(worldSizes[4])[0], worldSizes[4].players],
  [14, 12]
);

expect(
  'Earth comes in Normal, Large and Huge',
  earthWorldSizes.map(({ key, width, height }) => [key, width, height]),
  [
    ['normal', 80, 50],
    ['large', 104, 65],
    ['huge', 128, 80],
  ]
);

expect(
  'Earth offers the size New Game selects',
  earthWorldSizes.includes(defaultWorldSize),
  true
);

// The rules' own sizes (#1175): offered as they come, or none, which leaves New Game offering the sizes above.
expect(
  "rules that offer no sizes (Civ1's), or an answer without them, leave New Game's own",
  [
    ruleWorldSizes(null),
    ruleWorldSizes(undefined),
    ruleWorldSizes({ sizes: [], custom: null }),
    ruleWorldSizes({} as any),
  ],
  [null, null, null, null]
);

expect(
  'rules that offer sizes have them offered, in their order, with their own civilizations and Earth',
  ruleWorldSizes({
    sizes: [
      {
        key: 'small',
        topologyId: 'staggered-iso',
        width: 40,
        height: 50,
        minPlayers: 3,
        maxPlayers: 7,
        players: 7,
        earth: true,
      },
    ],
    custom: null,
  }),
  [
    {
      key: 'small',
      width: 40,
      height: 50,
      minPlayers: 3,
      maxPlayers: 7,
      players: 7,
      earth: true,
    },
  ]
);

expect(
  "a size typed in, without rules' bounds, is any whole size its grid can be",
  [
    customSizeProblem('square', '19', '1001'),
    customSizeProblem('staggered-iso', '300', '300'),
  ],
  [null, null]
);

if (failures.length > 0) {
  process.stderr.write(
    `FAIL worldSizes (${
      failures.length
    } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS worldSizes (${checks} checks)\n`);
