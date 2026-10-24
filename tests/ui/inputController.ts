// The game's keyboard, out of `Renderer.ts` (#344): Enter ends the turn only when EndTurn is mandatory and the game is
//  not waiting for the next turn; a key typed while the body has the focus goes to an open modal window; unit keys go
//  through the active unit's `pressKey`; Escape blurs; Tab focuses the first action; `c`/`w`/`t`/`y`; Shift+5 then
//  Shift+6 turns the cheats on; a leader screen opens, its key going on through the handler as any other, but not over
//  a modal window; `?` opens the Civilopedia, once; Shift+S saves, but not over a modal window; and `dispose` removes
//  the listener. Driven with stub dependencies.

// Must stay first: it gives the controller a `document`.
import './lib/dom';

import { GameData, Tile, Unit } from '../../src/js/UI/types';
import i18next from 'i18next';
import InputController from '../../src/js/UI/game/InputController';
import GamePortal from '../../src/js/UI/components/GamePortal';
import Transport from '../../src/js/UI/Transport';

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

// A record of how things are today, not a check: a later change may mean to flip it.
const notes: string[] = [];

const note = (line: string): void => {
  notes.push(line);
};

// A suite that stops before its checks would otherwise pass in silence (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write(
      'FAIL inputController: stopped before the checks ran\n'
    );
    process.exitCode = 1;
  }
});

// linkedom has no focus: what has it is set by hand.
let focused: Element | null = document.body;

Object.defineProperty(document, 'activeElement', {
  configurable: true,
  get: () => focused,
});

// What the controller did, through its dependencies.
let sent: Array<[string, unknown]> = [],
  pressed: string[] = [],
  unitKeys: string[] = [],
  calls: string[] = [],
  shown: string[] = [];

const reset = (): void => {
  sent = [];
  pressed = [];
  calls = [];
  shown = [];
};

const tile = { x: 3, y: 4 } as Tile,
  unit = { id: 'unit-1', tile } as unknown as Unit;

let activeUnit: Unit | null = unit,
  waiting = false,
  mandatoryActions: Array<{ _: string }> = [{ _: 'EndTurn' }];

const actionArea = document.createElement('div');

document.body.append(actionArea);

const controller = new InputController({
  actionArea,
  data: () =>
    ({
      player: {
        mandatoryActions,
      },
    } as unknown as GameData),
  gameMenu: {
    enableCheats: (): void => {
      calls.push('enableCheats');
    },
    saveGame: (): void => {
      calls.push('saveGame');
    },
  },
  mapView: {
    centre: (centred: Tile): void => {
      calls.push(`centre ${centred.x},${centred.y}`);
    },
    toggleUnits: (): void => {
      calls.push('toggleUnits');
    },
    toggleYields: (): void => {
      calls.push('toggleYields');
    },
  },
  notificationBar: {
    show: (html: string): void => {
      shown.push(html);
    },
  },
  portal: {} as GamePortal,
  transport: {
    // The leader screens ask the worker for what they show; never answered here.
    request: () => new Promise(() => {}),
    send: (name: string, data: unknown): void => {
      sent.push([name, data]);
    },
  } as unknown as Transport,
  unitController: {
    active: () => activeUnit,
    pressKey: (key: string): boolean => {
      pressed.push(key);

      return unitKeys.includes(key);
    },
    wait: (): void => {
      calls.push('wait');
    },
  },
  waiting: () => waiting,
});

let endTurnEvents = 0;

document.addEventListener('endturn', () => endTurnEvents++);

type KeyInit = {
  altKey?: boolean;
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  key: string;
  location?: number;
  shiftKey?: boolean;
};

// The test DOM's `KeyboardEvent` takes only `key` and `location`: the rest is set on the event.
const press = ({
  altKey = false,
  code = '',
  ctrlKey = false,
  key,
  location = 0,
  metaKey = false,
  shiftKey = false,
}: KeyInit): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key,
    location,
  });

  Object.defineProperties(event, {
    altKey: { value: altKey },
    code: { value: code },
    ctrlKey: { value: ctrlKey },
    metaKey: { value: metaKey },
    shiftKey: { value: shiftKey },
  });

  document.dispatchEvent(event);

  return event;
};

const run = async (): Promise<void> => {
  await i18next.init({ lng: 'en', resources: {} });

  // Enter.

  let event = press({ key: 'Enter' });

  expect('Enter ends the turn when EndTurn is mandatory', sent, [
    ['action', { name: 'EndTurn' }],
  ]);
  expect('through endTurn, which tells the notices', endTurnEvents, 1);
  expect('and the key goes no further', event.defaultPrevented, true);

  reset();
  waiting = true;
  press({ key: 'Enter' });

  expect('not while waiting for the next turn', sent, []);

  reset();
  waiting = false;
  mandatoryActions = [];
  event = press({ key: 'Enter' });

  expect('nor when EndTurn is not mandatory', sent, []);
  expect('when it does nothing', event.defaultPrevented, false);

  mandatoryActions = [{ _: 'EndTurn' }];

  // A modal window open while the body has the focus.

  reset();

  const modal = document.createElement('dialog'),
    modalKeys: string[] = [];

  modal.className = 'window modal';
  modal.addEventListener('keydown', (keyEvent) =>
    modalKeys.push((keyEvent as KeyboardEvent).key)
  );
  document.body.append(modal);

  // #351: one the browser has closed, but which is still in the page, isn't drawn and doesn't take the keys.
  event = press({ key: 'x' });

  expect(
    'a closed modal window gets no keys',
    [modalKeys, pressed, event.defaultPrevented],
    [[], ['x'], false]
  );

  reset();

  modal.setAttribute('open', '');

  // Nor does an open one with another open on top of it.
  const covered = document.createElement('dialog'),
    coveredKeys: string[] = [];

  covered.className = 'window modal';
  covered.setAttribute('open', '');
  covered.addEventListener('keydown', (keyEvent) =>
    coveredKeys.push((keyEvent as KeyboardEvent).key)
  );
  modal.before(covered);

  event = press({ key: 'Enter' });

  expect('the one beneath gets none', coveredKeys, []);

  covered.remove();

  expect(
    'a key typed while the body has the focus goes to the modal window',
    modalKeys,
    ['Enter']
  );
  expect('and nowhere else', [sent, pressed], [[], []]);
  expect('its own is stopped', event.defaultPrevented, true);

  reset();

  const input = document.createElement('input');

  modal.append(input);
  focused = input;
  press({ key: 'x' });

  expect(
    'not when something else has the focus',
    [modalKeys, pressed],
    [['Enter'], ['x']]
  );

  modal.remove();
  focused = document.body;

  // Shift+S.

  reset();
  event = press({ key: 'S', shiftKey: true });

  expect(
    'Shift+S saves the game',
    [calls, pressed, event.defaultPrevented],
    [['saveGame'], [], true]
  );

  reset();
  press({ key: 's' });

  expect("s is still the unit's", [calls, pressed], [[], ['s']]);

  reset();
  event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key: 'S',
  });
  Object.defineProperties(event, {
    repeat: { value: true },
    shiftKey: { value: true },
  });
  document.dispatchEvent(event);

  expect(
    'Shift+S held down saves once, not for each repeat',
    [calls, event.defaultPrevented],
    [[], true]
  );

  reset();
  modalKeys.splice(0);
  document.body.append(modal);
  press({ key: 'S', shiftKey: true });

  expect(
    'not over a modal window, which gets the key instead',
    [calls, modalKeys],
    [[], ['S']]
  );

  modal.remove();

  // Unit keys.

  reset();
  unitKeys = ['ArrowUp', 'f'];
  event = press({ key: '8', location: KeyboardEvent.DOM_KEY_LOCATION_NUMPAD });

  expect(
    "a unit key goes through pressKey, the number pad's as arrows",
    pressed,
    ['ArrowUp']
  );
  expect('and goes no further', event.defaultPrevented, true);

  reset();
  press({ key: 'w' });

  expect(
    'a key pressKey takes is not also the handler’s own',
    [pressed, calls],
    [['w'], ['wait']]
  );

  reset();
  unitKeys = ['w'];
  press({ key: 'w' });

  expect('pressKey goes first', [pressed, calls], [['w'], []]);

  unitKeys = [];

  // Ctrl/Cmd/Alt with a key is the browser's, not the game's: Ctrl+R is a reload the reload guard asks about, and
  //  must not also build a road (#479).
  reset();
  unitKeys = ['r', 'f'];
  event = press({ code: 'KeyR', ctrlKey: true, key: 'r' });
  press({ code: 'KeyF', key: 'f', metaKey: true });
  press({ code: 'KeyF', altKey: true, key: 'f' });
  press({ code: 'KeyT', ctrlKey: true, key: 't' });
  press({ code: 'KeyC', ctrlKey: true, key: 'c' });

  expect(
    'Ctrl, Cmd or Alt with a key sends no unit order and toggles nothing',
    [pressed, calls],
    [[], []]
  );
  expect('and is left to the browser', event.defaultPrevented, false);

  // Caps Lock on: the key comes as `P`, Shift isn't held (#479).
  reset();
  unitKeys = ['p', 'P', 'd', 'D'];
  press({ code: 'KeyP', key: 'P' });
  press({ code: 'KeyD', key: 'D' });
  press({ code: 'KeyP', key: 'p', shiftKey: true });

  expect(
    'Caps Lock leaves a letter as it is without Shift: p, not P (Pillage)',
    pressed,
    ['p', 'd', 'P']
  );

  unitKeys = [];

  // Escape.

  reset();

  let blurred = 0;

  focused = input;
  (input as HTMLElement).blur = (): void => {
    blurred++;
  };
  press({ key: 'Escape' });

  expect('Escape blurs what has the focus', blurred, 1);

  focused = document.body;

  // Tab.

  reset();

  let tabFocused = 0;

  actionArea.innerHTML =
    '<div class="action"><button>First</button></div><div class="action"><button>Second</button></div>';
  (actionArea.querySelector('button') as HTMLButtonElement).focus =
    (): void => {
      tabFocused++;
    };
  event = press({ key: 'Tab' });

  expect('Tab focuses the first action', tabFocused, 1);
  expect('in place of moving the focus', event.defaultPrevented, true);

  actionArea.innerHTML = '';
  event = press({ key: 'Tab' });

  expect('with no action, Tab is left alone', event.defaultPrevented, false);

  // `c`, `w`, `t`, `y`.

  reset();
  press({ key: 'c' });
  event = press({ key: 'w' });
  press({ key: 't' });
  press({ key: 'y' });

  expect(
    'c centres on the active unit, w waits, t and y toggle the layers',
    calls,
    ['centre 3,4', 'wait', 'toggleUnits', 'toggleYields']
  );
  expect('w goes no further', event.defaultPrevented, true);

  reset();
  activeUnit = null;
  press({ key: 'c' });
  press({ key: 'w' });

  expect('c and w need an active unit', calls, []);

  activeUnit = unit;

  // Shift+5, Shift+6.

  reset();
  press({ code: 'Digit5', key: '%', shiftKey: true });
  press({ code: 'Digit6', key: '^', shiftKey: true });

  expect('Shift+5 then Shift+6 turns the cheats on', calls, ['enableCheats']);
  expect('and says so', shown, ['GameMenu.cheat.enabled']);

  // The match leaves Shift+5 as the last key: Shift+6 again turns them on again, which changes nothing.
  press({ code: 'Digit6', key: '^', shiftKey: true });

  expect('a second Shift+6 straight after still counts', calls, [
    'enableCheats',
    'enableCheats',
  ]);

  reset();
  press({ code: 'Digit5', key: '%', shiftKey: true });
  press({ code: 'KeyA', key: 'a' });
  press({ code: 'Digit6', key: '^', shiftKey: true });

  expect('only one straight after the other', calls, []);

  reset();
  press({ code: 'Digit5', key: '5' });
  press({ code: 'Digit6', key: '6' });

  expect('and only shifted', calls, []);

  // Shift let go and pressed again between the two (#479).
  reset();
  press({ code: 'ShiftLeft', key: 'Shift', shiftKey: true });
  press({ code: 'Digit5', key: '%', shiftKey: true });
  press({ code: 'ShiftLeft', key: 'Shift', shiftKey: true });
  press({ code: 'Digit6', key: '^', shiftKey: true });

  expect('Shift pressed again in between still counts', calls, [
    'enableCheats',
  ]);

  // A leader screen (F8, the Top Cities): it opens, and the key goes on through the rest of the handler as any other
  //  does, so it is the last key typed, which breaks the Shift+5, Shift+6 sequence.
  reset();
  unitKeys = [];
  press({ code: 'Digit5', key: '%', shiftKey: true });
  event = press({ code: 'F8', key: 'F8' });

  const topCities = document.querySelector('dialog.top-cities-report');

  expect(
    'F8 opens the Top Cities',
    [topCities !== null, event.defaultPrevented],
    [true, true]
  );

  topCities?.remove();
  press({ code: 'Digit6', key: '^', shiftKey: true });

  expect(
    'and goes on through the handler: it is offered as a unit key, and a key between Shift+5 and Shift+6',
    [pressed, calls],
    [['%', 'F8', '^'], []]
  );

  // The Civilopedia (`?`, #183): it opens, and `?` again finds the one already open rather than another.
  reset();
  event = press({ code: 'Slash', key: '?', shiftKey: true });
  press({ code: 'Slash', key: '?', shiftKey: true });

  expect(
    '? opens the Civilopedia, once however often it is pressed',
    [
      document.querySelectorAll('dialog.civilopedia').length,
      event.defaultPrevented,
    ],
    [1, true]
  );

  document
    .querySelectorAll('dialog.civilopedia')
    .forEach((dialog) => dialog.remove());

  // Over a modal window a leader screen would be drawn out of reach: the key goes to the modal window instead.
  const notice = document.createElement('dialog');

  notice.className = 'window modal';
  notice.setAttribute('open', '');
  document.body.append(notice);

  const forwarded: string[] = [];

  notice.addEventListener('keydown', (event) =>
    forwarded.push((event as KeyboardEvent).key)
  );

  press({ code: 'Slash', key: '?', shiftKey: true });
  press({ code: 'F8', key: 'F8' });

  expect(
    'not over a modal window, which gets the keys',
    [
      document.querySelectorAll('dialog.civilopedia, dialog.top-cities-report')
        .length,
      forwarded,
    ],
    [0, ['?', 'F8']]
  );

  notice.remove();

  // `dispose`.

  reset();
  controller.dispose();
  press({ key: 'Enter' });
  press({ key: 't' });

  expect('dispose removes the listener', [sent, pressed, calls], [[], [], []]);

  finished = true;

  notes.forEach((line) => process.stdout.write(`note: ${line}\n`));

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL inputController (${
        failures.length
      } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS inputController (${checks} checks)\n`);
};

run().catch((error) => {
  process.stderr.write(`FAIL inputController: ${error.stack ?? error}\n`);
  process.exit(1);
});
