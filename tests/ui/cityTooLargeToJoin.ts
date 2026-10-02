// When the join key should explain itself: a Settlers in one of its player's
// cities of size 10 or more, which the engine won't let it join (#243).

import cityTooLargeToJoin, {
  joinCitySizeLimit,
} from '../../src/js/UI/lib/cityTooLargeToJoin';

const failures: string[] = [];
let checks = 0;

const expect = (description: string, actual: unknown, expected: unknown) => {
  checks++;

  if (actual !== expected) {
    failures.push(
      `${description}\n    expected: ${JSON.stringify(
        expected
      )}\n    actual:   ${JSON.stringify(actual)}`
    );
  }
};

const unit = (type: string, actions: string[] = [], player = 'Player-1') => ({
    _: type,
    actions: actions.map((action) => ({ _: action })),
    player: { id: player },
  }),
  city = (size: number, player = 'Player-1') => ({
    growth: { size },
    name: 'Thebes',
    player: { id: player },
  });

const large = city(joinCitySizeLimit);

expect(
  'a Settlers in its own city at the size limit is told the city is too large',
  cityTooLargeToJoin(unit('Settlers', ['Fortify', 'Sleep']), large),
  large
);

expect(
  'a city under the limit is not too large, even when the join is not offered (no moves left)',
  cityTooLargeToJoin(unit('Settlers', ['Sleep']), city(joinCitySizeLimit - 1)),
  null
);

expect(
  'a Settlers that is offered the join is not told anything',
  cityTooLargeToJoin(unit('Settlers', ['JoinCity']), large),
  null
);

expect(
  'another unit in a large city is not told anything',
  cityTooLargeToJoin(unit('Warrior', ['Fortify']), large),
  null
);

expect(
  "a Settlers in another player's city is not told anything",
  cityTooLargeToJoin(unit('Settlers'), city(joinCitySizeLimit, 'Player-2')),
  null
);

expect(
  'a Settlers outside a city is not told anything',
  cityTooLargeToJoin(unit('Settlers', ['FoundCity']), null),
  null
);

if (failures.length) {
  process.stderr.write(
    `FAIL cityTooLargeToJoin\n${failures
      .map((failure) => `  ${failure}`)
      .join('\n')}\n`
  );
  process.exit(1);
}

console.log(`PASS cityTooLargeToJoin (${checks} checks)`);
