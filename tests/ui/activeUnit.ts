// Which unit is active after an update (#189). Every update rebuilds the
// units as fresh objects, so the unit that just moved has to be recognised by
// its id, or focus jumps to whichever unit on screen is listed first.

import chooseActiveUnit from '../../src/js/UI/lib/chooseActiveUnit';

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

const unit = (id: string, x: number, y: number = 0) => ({
    id,
    tile: { x, y },
  }),
  // Columns 0-9 are on screen.
  isVisible = (x: number) => x < 10;

// As the next update would send them: new objects, the moved unit not first.
const offScreen = unit('a', 40),
  onScreen = unit('b', 2),
  moved = unit('c', 5),
  units = [offScreen, onScreen, moved],
  movedBefore = unit('c', 4);

expect(
  'the unit that moved keeps focus, though it is a new object',
  chooseActiveUnit(units, movedBefore.id, isVisible),
  moved
);
expect(
  'an off-screen unit that moved keeps focus too',
  chooseActiveUnit(units, offScreen.id, isVisible),
  offScreen
);
expect(
  'once it has no moves left, the first unit on screen is next',
  chooseActiveUnit([offScreen, onScreen], 'c', isVisible),
  onScreen
);
expect(
  'with no last unit, the first unit on screen',
  chooseActiveUnit(units, null, isVisible),
  onScreen
);
expect(
  'with none on screen, the first unit',
  chooseActiveUnit([offScreen, unit('d', 50)], 'c', isVisible),
  offScreen
);
expect('no units, no active unit', chooseActiveUnit([], 'c', isVisible), null);

if (failures.length) {
  console.error(`FAIL active unit\n  ${failures.join('\n  ')}`);

  process.exit(1);
}

console.log(`PASS active unit (${checks} checks)`);
