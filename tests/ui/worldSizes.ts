// The world sizes New Game offers (#55): Civ1's 8:5 shape, growing in order,
// with Normal being Civ1's own 80 × 50 map. Each offers a range of
// civilizations, largest first, with its default inside it, and none offers
// more than the 14 civilizations there are.

import worldSizes, {
  defaultWorldSize,
  playerCounts,
} from '../../src/js/UI/lib/worldSizes';

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
    `${size.key} offers no more than the 14 civilizations there are`,
    size.maxPlayers <= 14,
    true
  );
});

expect(
  'Huge offers up to 14, with 12 selected',
  [playerCounts(worldSizes[4])[0], worldSizes[4].players],
  [14, 12]
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
