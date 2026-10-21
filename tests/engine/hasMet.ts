// Whether the player has met another civilization decides whether a notification or a report names it (#59). This
//  checks, with plain data, each way of having met: an interaction between the two (a negotiation or a declaration),
//  having seen a city they hold, or having seen a city they founded (a defeated player holds none); and that a city
//  of theirs we haven't seen, or nothing at all, isn't meeting them.

import { HasMetDependencies, hasMet } from '../../src/js/Engine/lib/hasMet';
import City from '@civ-clone/core-city/City';
import InteractionRegistry from '@civ-clone/core-diplomacy/InteractionRegistry';
import { Peace } from '@civ-clone/library-diplomacy/Declarations';
import Player from '@civ-clone/core-player/Player';
import RuleRegistry from '@civ-clone/core-rule/RuleRegistry';
import Tile from '@civ-clone/core-world/Tile';

const failures: string[] = [];
let checks = 0,
  finished = false;

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

// A run that stops before it reports has checked nothing (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write('FAIL hasMet: stopped before the checks ran\n');
    process.exitCode = 1;
  }
});

const ruleRegistry = new RuleRegistry(),
  interactions = new InteractionRegistry(),
  reader = new Player(ruleRegistry),
  atPeace = new Player(ruleRegistry),
  holder = new Player(ruleRegistry),
  founder = new Player(ruleRegistry),
  hidden = new Player(ruleRegistry),
  stranger = new Player(ruleRegistry);

interactions.register(new Peace(reader, atPeace, ruleRegistry) as never);

// A city is read only for who holds it, who founded it and where it is, and the player's world only for whether it
//  has seen that tile, so plain stand-ins will do.
const tile = (): Tile => ({} as Tile),
  seenTile = tile(),
  capturedTile = tile(),
  hiddenTile = tile(),
  city = (owner: Player, original: Player, at: Tile): City =>
    ({
      player: () => owner,
      originalPlayer: () => original,
      tile: () => at,
    } as unknown as City),
  seen = new Set<Tile>([seenTile, capturedTile]),
  dependencies = {
    interactions,
    cities: {
      entries: () => [
        city(holder, holder, seenTile),
        // Founded by `founder`, since taken by `holder`: `founder` holds no cities.
        city(holder, founder, capturedTile),
        city(hidden, hidden, hiddenTile),
      ],
    },
    playerWorlds: {
      getByPlayer: (player: Player) => {
        if (player !== reader) {
          throw new Error("only the reader's world is read");
        }

        return {
          getByTile: (at: Tile) => (seen.has(at) ? at : null),
        };
      },
    },
  } as unknown as HasMetDependencies;

expect(
  'a player has always met itself',
  hasMet(reader, reader, dependencies),
  true
);

expect(
  'an interaction between the two is meeting them',
  hasMet(reader, atPeace, dependencies),
  true
);

expect(
  'having seen a city they hold is meeting them',
  hasMet(reader, holder, dependencies),
  true
);

expect(
  'having seen a city they founded is meeting them, though they no longer hold it',
  hasMet(reader, founder, dependencies),
  true
);

expect(
  "a city of theirs we haven't seen isn't meeting them",
  hasMet(reader, hidden, dependencies),
  false
);

expect(
  'no interaction and no city seen is not having met them',
  hasMet(reader, stranger, dependencies),
  false
);

finished = true;

if (failures.length > 0) {
  process.stderr.write(
    `FAIL hasMet (${failures.length} of ${checks} checks)\n  ${failures.join(
      '\n  '
    )}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS hasMet (${checks} checks)\n`);
