// A unit's order and the end of the turn (#543). An order is waited for until the worker answers it, but the worker
// stops listening when the turn ends and starts again only once the next one is handed over. So an order sent from a
// window left open over End Turn (the Caravan's "Will you?", say) is never answered, and must not hold the next turn's
// keys and buttons; nor must one sent just before the turn was handed over.

// Must stay first: `Window.ts` reads `document.body` as it loads.
import { document } from './lib/dom';

import i18next from 'i18next';
import ActiveUnitController from '../../src/js/UI/game/ActiveUnitController';
import HaltedUnits from '../../src/js/UI/lib/haltedUnits';
import PendingMove from '../../src/js/UI/lib/PendingMove';
import topologyFor from '../../src/js/UI/lib/topologyFor';
import { TransportHandledAction } from '../../src/js/Engine/Transport';
import { Tile } from '../../src/js/UI/types';

const failures: string[] = [];
let checks = 0,
  finished = false;

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

// A suite that stops before its checks would otherwise pass in silence (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write(
      `FAIL ordersAcrossTurns: stopped after ${checks} checks\n`
    );
    process.exitCode = 1;
  }
});

(async () => {
  await i18next.init({ lng: 'en', defaultNS: 'default', ns: ['default'] });

  const tiles = [0, 1, 2].map(
      (x) => ({ id: `Tile-${x}`, x, y: 0, units: [] } as unknown as Tile)
    ),
    action = (_: string, to: Tile) => ({ _, id: `${_}-${to.id}`, to }),
    // A Caravan next to one of its player's cities: moving in offers to stop there.
    caravan: any = {
      _: 'Caravan',
      id: 'Caravan-1',
      tile: tiles[1],
      player: { civilization: { _: 'Roman' }, treasuries: [] },
      actions: ['Fortify', 'Sleep'].map((name) => action(name, tiles[1])),
      actionsForNeighbours: {
        e: [action('Move', tiles[2]), action('EstablishTradeRoute', tiles[2])],
        w: [],
      },
    },
    sent: string[] = [],
    unacknowledged: TransportHandledAction[] = [],
    pendingMove = new PendingMove<Tile>(),
    layer = { render() {}, setActiveUnit() {}, setVisible() {}, update() {} },
    topology = topologyFor({ width: 3, height: 1 }),
    controller = new ActiveUnitController({
      activeUnitLayer: layer,
      arrivalClosed: () => {},
      data: () => ({ player: { units: [caravan] } } as any),
      haltedUnits: new HaltedUnits(),
      options: { get: (key: string, defaultValue: any = null) => defaultValue },
      pendingMove,
      portal: {
        isVisible: () => true,
        render: () => {},
        setActiveUnit: () => {},
        setCenter: () => {},
      },
      scheduleRender: () => {},
      showUnitDetails: () => {},
      transport: {
        send: ((name: string, message: TransportHandledAction) => {
          if (name === 'action') {
            sent.push(`${message.id} ${message.unitAction}`);
            unacknowledged.push(message);
          }
        }) as any,
      },
      unitsLayer: layer,
      world: { get: (x: number) => tiles[x], topology: () => topology },
    }),
    // A rebuild during the turn, the Caravan up, or while waiting for the next one.
    rebuild = (waiting: boolean) =>
      controller.next(
        waiting ? [] : [{ _: 'ActiveUnit', value: caravan } as any],
        waiting
      ),
    acknowledgeOldest = () => {
      const message = unacknowledged.shift();

      if (message) {
        controller.actionHandled(message);
      }
    },
    choose = (value: string) => {
      const dialogs = document.querySelectorAll('dialog'),
        select = dialogs[dialogs.length - 1].querySelector(
          'select'
        ) as HTMLSelectElement;

      // linkedom's `value` is read-only: it follows the selected option.
      Array.from(select.querySelectorAll('option')).forEach((option) =>
        option.toggleAttribute(
          'selected',
          option.getAttribute('value') === value
        )
      );
      select.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' })
      );
    };

  rebuild(false);
  controller.pressKey('ArrowRight');

  expect('moving in opens the window, and sends nothing', sent, []);

  // End Turn, with the window still open: the turn ends, then the player answers it.
  rebuild(true);
  choose('EstablishTradeRoute');

  expect(
    'an order sent while waiting for the next turn goes, but is not waited for',
    `${sent.join()} ${pendingMove.pending()}`,
    'Caravan-1 EstablishTradeRoute false'
  );

  // Never answered: the worker wasn't listening. The next turn is handed over, as `GameSession` sees it.
  unacknowledged.splice(0);
  sent.splice(0);
  controller.turnStarted();
  rebuild(false);

  expect(
    "the next turn's buttons work",
    `${controller.act('Caravan-1', 'Fortify')} ${sent.join()}`,
    'true Caravan-1 Fortify'
  );

  acknowledgeOldest();
  controller.pressKey('s');

  expect(
    'and so do its keys',
    sent.join(' / '),
    'Caravan-1 Fortify / Caravan-1 Sleep'
  );

  acknowledgeOldest();

  // An order sent during the turn that the worker never heard: sent as the turn was handed over, say. The next
  // `turnStarted` lets it go.
  sent.splice(0);
  controller.pressKey('f');
  controller.pressKey('s');

  expect(
    'an order sent during the turn is waited for, the key after it kept',
    `${sent.join()} ${pendingMove.pending()} ${pendingMove.queued()}`,
    'Caravan-1 Fortify true true'
  );

  unacknowledged.splice(0);
  controller.turnStarted();

  expect(
    'the start of a turn waits for nothing sent before it, and keeps no keys',
    `${pendingMove.pending()} ${pendingMove.queued()}`,
    'false false'
  );

  rebuild(false);
  controller.pressKey('s');

  expect(
    'so a key goes at once',
    sent.join(' / '),
    'Caravan-1 Fortify / Caravan-1 Sleep'
  );

  finished = true;

  if (failures.length) {
    console.error(`FAIL ordersAcrossTurns\n  ${failures.join('\n  ')}`);

    process.exit(1);
  }

  console.log(`PASS ordersAcrossTurns (${checks} checks)`);
})();
