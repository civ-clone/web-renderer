// The units whose GoTo stopped next to a choice (#357): each is made active in turn, and its actions for the tile it
//  stopped next to are offered once they have arrived, once, one window at a time.

import HaltedUnits from '../../src/js/UI/lib/haltedUnits';
import { Unit } from '../../src/js/UI/types';

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

const tile = (id: string) => ({ id }),
  unit = (id: string, withActions: boolean) =>
    ({
      id,
      actionsForNeighbours: withActions
        ? {
            n: [{ _: 'Move', to: tile('north') }],
            e: [
              { _: 'Move', to: tile('city') },
              { _: 'HelpBuildWonder', to: tile('city') },
            ],
          }
        : undefined,
    } as unknown as Unit);

const halted = new HaltedUnits();

expect('nothing halted, nothing to offer', halted.next([]), null);

halted.add({ unit: 'gone', target: 'city' });
halted.add({ unit: 'caravan', target: 'city' });

const waiting = halted.next([unit('caravan', false)]);

expect(
  'a unit that can no longer act is dropped, and the next is made active',
  waiting?.unit.id,
  'caravan'
);
expect(
  'until its actions arrive there is nothing to offer',
  waiting?.actions,
  null
);

const ready = halted.next([unit('caravan', true)]);

expect(
  'once they arrive, its actions for the tile it stopped next to are offered',
  ready?.actions?.map((action) => action._).join(' '),
  'Move HelpBuildWonder'
);
expect('and only once', halted.next([unit('caravan', true)]), null);

halted.add({ unit: 'caravan', target: 'city' });
halted.add({ unit: 'caravan', target: 'north' });

expect(
  'a unit halted again replaces its earlier halt',
  halted
    .next([unit('caravan', true)])
    ?.actions?.map((action) => action._)
    .join(' '),
  'Move'
);
expect('leaving none behind', halted.next([unit('caravan', true)]), null);

// Two GoTos halted at the start of the turn (Copilot on #395): while the first one's window is open the second waits,
//  and once it closes, chosen or dismissed, the second is up.
halted.add({ unit: 'caravan', target: 'city' });
halted.add({ unit: 'diplomat', target: 'city' });

const units = [unit('caravan', true), unit('diplomat', true)];

expect('the first halted unit is up', halted.next(units)?.unit.id, 'caravan');

halted.opened();

expect('the second waits while its window is open', halted.next(units), null);

halted.closed();

expect(
  'and is up once the window is dismissed',
  halted.next(units)?.unit.id,
  'diplomat'
);

if (failures.length) {
  console.error(`FAIL halted units\n  ${failures.join('\n  ')}`);

  process.exit(1);
}

console.log(`PASS halted units (${checks} checks)`);
