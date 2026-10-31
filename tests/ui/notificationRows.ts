// The notification rows (#416), under the new interface (#735): a row for each city in disorder and each kind of
//  notice, with its count when notices share it; five rows, the rest behind "+N more", which shows them all; rows kept
//  across renders; opened as its orb is (a notice dismissed by opening it); dismissed by the glyph, right-click or
//  Delete, a whole group at once; dismissals kept for the turn by what they're about; and the HUD leaving dismissed
//  ones out of the rows and the Next Turn queue alike.

// Must stay first: the components read `document` as they load.
import './lib/dom';

import { GameData, Player, PlayerAction } from '../../src/js/UI/types';
import Dismissals from '../../src/js/UI/lib/dismissals';
import Hud from '../../src/js/UI/game/Hud';
import NotificationRows from '../../src/js/UI/components/NotificationRows';
import Notices from '../../src/js/UI/components/Notices';
import Portal from '../../src/js/UI/components/Portal';
import Transport from '../../src/js/UI/Transport';
import { applyInterface } from '../../src/js/UI/lib/interfaceMode';
import { assetStore } from '../../src/js/UI/AssetStore';
import i18next from 'i18next';
import i18nOptions from '../../src/js/UI/app/i18nOptions';

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
      `FAIL notificationRows: stopped after ${checks} checks\n`
    );
    process.exitCode = 1;
  }
});

// No IndexedDB under node: the orbs' pictures are their paths.
(assetStore as any).get = (path: string) =>
  Promise.resolve({ name: path, uri: path });
(assetStore as any).spriteURL = (path: string) => Promise.resolve(path);

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const city = (name: string) => ({
    id: name,
    name,
    originalPlayer: { civilization: { _: 'Babylonian' } },
  }),
  disorder = (name: string, id = `CivilDisorder-${name}`) =>
    ({ _: 'CivilDisorder', id, value: city(name) } as unknown as PlayerAction),
  dismissed: string[] = [],
  notice = (id: string, key: string) =>
    ({
      _: 'Notice',
      id,
      value: {
        city: null,
        colours: null,
        dismiss: () => dismissed.push(id),
        notification: { key, data: {} },
      },
    } as unknown as PlayerAction),
  player = {} as Player,
  portal = {} as Portal,
  transport = {
    request: () => new Promise(() => {}),
    send: () => {},
  } as unknown as Transport;

const run = async (): Promise<void> => {
  await i18next.init({ ...i18nOptions, lng: 'en' });
  await import('../../translations/local/en');

  const area = document.createElement('div'),
    gone: string[] = [],
    rows = new NotificationRows(area, {
      dismiss: (action) => gone.push(action.id),
      portal,
      transport,
    }),
    read = () =>
      Array.from(area.children).map((child) =>
        child.classList.contains('ui-notification-more')
          ? `more: ${child.textContent}`
          : [
              (child as HTMLElement).dataset.kind,
              child.querySelector('.ui-notification-title')?.textContent,
              (child.querySelector('.ui-notification-count') as HTMLElement)
                .hidden
                ? null
                : child.querySelector('.ui-notification-count')?.textContent,
            ]
      );

  document.body.append(area);

  rows.build(
    [
      disorder('Ur'),
      notice('notice-1', 'Test.captured'),
      notice('notice-2', 'Test.captured'),
      notice('notice-3', 'Test.other'),
    ],
    player
  );

  expect('a row each, notices of one kind sharing one with a count', read(), [
    ['CivilDisorder', 'Civil disorder in Ur!', null],
    ['Notice', 'Notification', '×2'],
    ['Notice', 'Notification', null],
  ]);

  const first = area.children[0];

  rows.build(
    [
      disorder('Ur', 'CivilDisorder-sent-again'),
      notice('notice-1', 'Test.captured'),
      notice('notice-2', 'Test.captured'),
      notice('notice-3', 'Test.other'),
    ],
    player
  );

  expect(
    'a row is kept across renders, even when the action comes again under a new id',
    area.children[0] === first,
    true
  );

  // Dismissing: the glyph, right-click, Delete.
  (
    area.children[1].querySelector(
      '.ui-notification-dismiss'
    ) as HTMLButtonElement
  ).click();

  expect('the glyph dismisses the whole group', gone, ['notice-1', 'notice-2']);

  gone.length = 0;
  area.children[2].dispatchEvent(
    new Event('contextmenu', { bubbles: true, cancelable: true })
  );

  expect('right-click dismisses it', gone, ['notice-3']);

  gone.length = 0;

  const deleteKey = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key: 'Delete',
  });

  area.children[0]
    .querySelector('.ui-notification-open')!
    .dispatchEvent(deleteKey);

  expect(
    'and Delete on a focused row',
    [gone, deleteKey.defaultPrevented],
    [['CivilDisorder-sent-again'], true]
  );

  // Opening.
  gone.length = 0;
  rows.build([disorder('Ur'), notice('notice-4', 'Test.opened')], player);
  (
    area.children[0].querySelector('.ui-notification-open') as HTMLButtonElement
  ).click();
  await settle();

  expect(
    "a city in disorder opens its window, as its orb does, and isn't dismissed by it",
    [document.querySelector('dialog[open] h3')?.textContent ?? null, gone],
    ['Civil disorder in Ur!', []]
  );

  document.querySelectorAll('dialog').forEach((dialog) => dialog.remove());

  (
    area.children[1].querySelector('.ui-notification-open') as HTMLButtonElement
  ).click();
  await settle();

  expect(
    'a notice is dismissed by opening it, as its orb is',
    [dismissed, gone],
    [['notice-4'], ['notice-4']]
  );

  document.querySelectorAll('dialog').forEach((dialog) => dialog.remove());

  // A notice opened is the notice as it is now: the city in it is re-read on each update (`Notices`).
  {
    let opened = '';

    const asNow = (label: string) =>
      ({
        _: 'Notice',
        id: 'notice-5',
        value: {
          city: null,
          colours: null,
          dismiss: () => (opened = label),
          notification: { key: 'Test.again', data: {} },
        },
      } as unknown as PlayerAction);

    rows.build([asNow('first update')], player);
    rows.build([asNow('latest update')], player);
    (area.querySelector('.ui-notification-open') as HTMLButtonElement).click();
    await settle();

    expect('opened with the latest of its data', opened, 'latest update');

    document.querySelectorAll('dialog').forEach((dialog) => dialog.remove());
  }

  // Overflow.
  const many = Array.from({ length: 7 }, (_, index) =>
    notice(`notice-m${index}`, `Test.kind${index}`)
  );

  rows.build(many, player);

  expect(
    'five rows, the newest, behind a "+N more" row',
    [
      area.children.length,
      read()[0],
      area.querySelectorAll('.ui-notification-row').length,
    ],
    [6, 'more: +2 more', 5]
  );

  (area.querySelector('.ui-notification-more') as HTMLButtonElement).click();

  expect(
    'which shows them all',
    [area.querySelectorAll('.ui-notification-row').length, read()[0]],
    [7, 'more: Show fewer']
  );

  rows.build(many.slice(0, 3), player);

  expect(
    'and goes when they fit again',
    [
      area.querySelector('.ui-notification-more'),
      area.querySelectorAll('.ui-notification-row').length,
    ],
    [null, 3]
  );

  area.remove();

  // Dismissals: for the turn, by what they're about.
  const dismissals = new Dismissals();

  dismissals.dismiss('CivilDisorder:Ur', 4);

  expect(
    'a dismissal holds for its turn, and not the next',
    [
      dismissals.has('CivilDisorder:Ur', 4),
      dismissals.has('CivilDisorder:Ur', 5),
    ],
    [true, false]
  );

  // The HUD under the new interface: a dismissed disorder leaves the rows and the Next Turn queue, and says so.
  applyInterface('new', null);

  const holder = document.createElement('div'),
    areas = Object.fromEntries(
      [
        'actionArea',
        'gameArea',
        'gameInfo',
        'playerInfo',
        'secondaryActionArea',
        'unitActionArea',
      ].map((name) => [name, document.createElement('div')])
    );
  let changed = 0,
    // The game's turn as the session has it: newer than the last render's at times.
    dataTurn = 5,
    appended = 0;

  holder.append(...Object.values(areas));
  document.body.append(holder);

  const end = {
      _: 'EndTurn',
      id: 'EndTurn-1',
      value: null,
    } as unknown as PlayerAction,
    data = {
      difficulty: null,
      player: {
        id: 'Player-1',
        actions: [disorder('Ur'), end],
        mandatoryActions: [end],
        cities: [],
        civilization: {
          _: 'Egyptian',
          leader: { _: 'RamessesII' },
          attributes: [],
        },
        government: { current: { _: 'Despotism' }, anarchyTurns: null },
        research: {
          complete: [],
          cost: { value: 10 },
          progress: { value: 0 },
          researching: null,
        },
        treasuries: [{ yield: { _: 'Gold' }, value: 50 }],
      },
      turn: { value: 4 },
      year: { value: -3000 },
    } as unknown as GameData,
    hud = new Hud({
      ...(areas as any),
      changed: () => changed++,
      dismissals,
      turn: () => dataTurn,
      notices: { actions: () => [] } as unknown as Notices,
      portal,
      transport,
      unitAction: () => {},
      world: { get: () => ({} as any) },
    }),
    state = () => [
      areas.actionArea.querySelectorAll('.ui-notification-row').length,
      areas.actionArea.querySelector('.ui-next-turn-label')?.textContent,
    ];

  const append = areas.gameArea.append.bind(areas.gameArea);

  areas.gameArea.append = (...nodes: any[]) => {
    appended++;
    append(...nodes);
  };

  // Turn 5: the dismissal above was for turn 4, so this turn starts with none.
  hud.build(
    { ...data, turn: { value: 5 } } as unknown as GameData,
    null,
    false
  );

  expect('the row and the Next Turn button both show the disorder', state(), [
    1,
    'Civil disorder in Ur!',
  ]);

  areas.actionArea
    .querySelector('.ui-notification-row')!
    .dispatchEvent(
      new Event('contextmenu', { bubbles: true, cancelable: true })
    );

  expect('dismissing it tells the session', changed, 1);

  hud.build(
    { ...data, turn: { value: 5 } } as unknown as GameData,
    null,
    false
  );

  expect('and it leaves the rows and the Next Turn queue', state(), [
    0,
    'End turn',
  ]);

  expect(
    'for this turn, by the city: the session reads it for auto end turn',
    dismissals.has('CivilDisorder:Ur', 5),
    true
  );

  hud.build(
    { ...data, turn: { value: 6 } } as unknown as GameData,
    null,
    false
  );

  expect('a new turn brings it back', state(), [1, 'Civil disorder in Ur!']);

  expect(
    'the panel is moved to the end of the game area once, not put back on every render (its rows would slide in again)',
    appended,
    1
  );

  // Turn 7's data in, not yet drawn: a dismissal now is for turn 7, as the session reads it.
  dataTurn = 7;
  areas.actionArea
    .querySelector('.ui-notification-row')!
    .dispatchEvent(
      new Event('contextmenu', { bubbles: true, cancelable: true })
    );

  expect(
    "a dismissal is for the game's turn, even before that turn is drawn",
    [
      dismissals.has('CivilDisorder:Ur', 7),
      dismissals.has('CivilDisorder:Ur', 6),
    ],
    [true, false]
  );

  holder.remove();
  applyInterface('classic', null);

  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL notificationRows (${
        failures.length
      } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS notificationRows (${checks} checks)\n`);
};

run().catch((error) => {
  process.stderr.write(`FAIL notificationRows: ${error.stack ?? error}\n`);
  process.exit(1);
});
