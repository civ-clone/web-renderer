// The Next Turn button (#702), under the new interface (#735): the queue's order (the questions, the units as one
//  item, the notices, End turn), what the button says and where it is in the queue, pressing (the units centre the map;
//  End turn is sent once, #11), skipping and wrapping, keeping its place across a rebuild, waiting, and the HUD
//  mounting it in place of the orbs only with the flag on.

// Must stay first: the components read `document` as they load.
import './lib/dom';

import { GameData, Player, PlayerAction } from '../../src/js/UI/types';
import Hud from '../../src/js/UI/game/Hud';
import NextTurn from '../../src/js/UI/components/NextTurn';
import Notices from '../../src/js/UI/components/Notices';
import Portal from '../../src/js/UI/components/Portal';
import Transport from '../../src/js/UI/Transport';
import { applyInterface } from '../../src/js/UI/lib/interfaceMode';
import { assetStore } from '../../src/js/UI/AssetStore';
import i18next from 'i18next';
import i18nOptions from '../../src/js/UI/app/i18nOptions';
import nextTurnQueue from '../../src/js/UI/lib/nextTurnQueue';

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
    process.stderr.write(`FAIL nextTurn: stopped after ${checks} checks\n`);
    process.exitCode = 1;
  }
});

// No IndexedDB under node: the orbs' pictures are their paths.
(assetStore as any).get = (path: string) =>
  Promise.resolve({ name: path, uri: path });
(assetStore as any).spriteURL = (path: string) => Promise.resolve(path);

const action = (_: string, id: string, value: unknown = null) =>
    ({ _, id, value } as unknown as PlayerAction),
  city = (name: string) => ({
    id: name,
    name,
    originalPlayer: { civilization: { _: 'Babylonian' } },
  }),
  player = {} as Player;

let sent: unknown[] = [],
  centred = 0;

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const transport = {
    request: () => new Promise(() => {}),
    send: (name: string, data: unknown): void => {
      sent.push([name, data]);
    },
  } as unknown as Transport,
  portal = {} as Portal;

const run = async (): Promise<void> => {
  await i18next.init({ ...i18nOptions, lng: 'en' });
  await import('../../translations/local/en');

  const research = action('ChooseResearch', 'r', { id: 'research' }),
    buildKish = action('CityBuild', 'b1', { id: 'b1', city: city('Kish') }),
    buildUr = action('CityBuild', 'b2', { id: 'b2', city: city('Ur') }),
    disorder = action('CivilDisorder', 'c', city('Lagash')),
    end = action('EndTurn', 'e'),
    unitActions = [action('ActiveUnit', 'u1'), action('ActiveUnit', 'u2')];

  // The queue.

  const queue = nextTurnQueue(
    [disorder, buildKish, buildUr, research],
    [research, buildKish, buildUr, ...unitActions],
    false
  );

  expect(
    'the questions first (research, then each city in the order given), the units as one item, then the notices',
    queue.map((item) => item.id),
    [
      'ChooseResearch:research',
      'CityBuild:b1',
      'CityBuild:b2',
      'units',
      'CivilDisorder:Lagash',
    ]
  );
  expect(
    'the units item counts them',
    queue.find((item) => item.kind === 'units'),
    { id: 'units', kind: 'units', count: 2 }
  );
  expect('nothing while waiting', nextTurnQueue([end], [end], true), []);

  // The button.

  const area = document.createElement('div');

  document.body.append(area);

  const next = new NextTurn(area, {
      centreActiveUnit: () => centred++,
      portal,
      transport,
    }),
    shown = () => {
      const button = area.querySelector('button.ui-next-turn')!;

      return [
        button.querySelector('.ui-next-turn-label')?.textContent,
        button.querySelector('.ui-next-turn-place')?.textContent ?? null,
        button.classList.contains('btn-primary') ? 'primary' : 'secondary',
        (button as HTMLButtonElement).disabled,
      ];
    };

  next.build(queue, false, player);

  expect('it names the first item and its place', shown(), [
    'Choose research',
    '1 of 5',
    'secondary',
    false,
  ]);

  expect(
    'each kind is marked for its tint, beside a swatch',
    [
      area.querySelector<HTMLElement>('.ui-next-turn')!.dataset.kind,
      area.querySelector('.ui-next-turn-swatch') !== null,
    ],
    ['ChooseResearch', true]
  );

  next.skip();
  next.skip();

  expect('Shift+Enter moves on to the next item', shown(), [
    'Choose production in Ur',
    '3 of 5',
    'secondary',
    false,
  ]);

  next.build(
    nextTurnQueue([disorder, buildUr], [buildUr, ...unitActions], false),
    false,
    player
  );

  expect('a rebuild keeps it on the same item, wherever that now is', shown(), [
    'Choose production in Ur',
    '1 of 3',
    'secondary',
    false,
  ]);

  next.skip();
  next.press();

  expect(
    'pressing the units item centres the map on the active unit',
    [shown()[0], centred],
    ['2 units need orders', 1]
  );

  next.skip();
  next.skip();

  expect('skipping wraps to the first', shown()[1], '1 of 3');

  // Resolved, one by one: the place follows.
  next.build(nextTurnQueue([disorder], unitActions, false), false, player);

  expect('the item it was on gone, it takes the one in its place', shown(), [
    '2 units need orders',
    '1 of 2',
    'secondary',
    false,
  ]);

  // An item answered (its `Action` completes) goes at once, before the engine's update: Enter can't open it again.
  {
    const answeredArea = document.createElement('div'),
      answered = new NextTurn(answeredArea, {
        centreActiveUnit: () => {},
        portal,
        transport,
      }),
      government = action('ChooseGovernment', 'g', {
        id: 'government',
        available: [{ _: 'Monarchy' }],
      });

    document.body.append(answeredArea);
    answered.build(
      nextTurnQueue([government, research], [government, research], false),
      false,
      player
    );
    sent = [];
    // One government to choose from: the list chooses it itself (a one-option list picks it).
    answered.press();
    await settle();

    expect(
      'an item answered leaves the queue at once, before the engine sends the actions again',
      [
        sent.map((message) => (message as [string, { name: string }])[1].name),
        answeredArea.querySelector('.ui-next-turn-label')?.textContent,
      ],
      [['ChooseGovernment'], 'Choose research']
    );

    sent = [];
    document.querySelectorAll('dialog').forEach((dialog) => dialog.remove());
    answeredArea.remove();
  }

  // Civil disorder doesn't hold up the turn: the engine offers End turn beside it.
  next.build(nextTurnQueue([disorder, end], [end], false), false, player);

  expect('a standing notice comes before End turn', shown(), [
    'Civil disorder in Lagash!',
    '1 of 1',
    'secondary',
    false,
  ]);

  next.skip();

  expect('and End turn is a skip away', shown()[0], 'End turn');

  next.skip();
  next.press();
  await settle();

  expect(
    'opened, the notice leaves the queue for the turn, leaving End turn',
    [shown()[0], document.querySelectorAll('dialog[open]').length],
    ['End turn', 1]
  );

  document.querySelectorAll('dialog[open]').forEach((dialog) => {
    (dialog as HTMLDialogElement).close();
    dialog.remove();
  });

  // The engine sends the list again whenever it changes (a unit moved): the same disorder, under a new id.
  next.build(
    nextTurnQueue(
      [action('CivilDisorder', 'c-again', city('Lagash')), end],
      [end],
      false
    ),
    false,
    player
  );

  expect(
    'and stays out of it when the actions come again, under new ids',
    shown()[0],
    'End turn'
  );

  let dismissed = 0;

  const notice = action('Notice', 'notice-1', {
    city: null,
    colours: null,
    dismiss: () => dismissed++,
    notification: { key: 'Test.notice', data: {} },
  });

  next.build(nextTurnQueue([notice, end], [end], false), false, player);
  // Still on End turn, where it was: back round to the notice.
  next.skip();

  expect('a notice is named by its title', shown()[0], 'Notification');

  next.press();
  await settle();

  expect(
    'a notice, opened, is dismissed and leaves the queue at once',
    [dismissed, shown()[0], document.querySelectorAll('dialog[open]').length],
    [1, 'End turn', 1]
  );

  document.querySelectorAll('dialog[open]').forEach((dialog) => {
    (dialog as HTMLDialogElement).close();
    dialog.remove();
  });

  next.build(nextTurnQueue([end], [end], false), false, player);

  expect(
    'End turn has its glyph, not a swatch',
    [
      area.querySelector<HTMLElement>('.ui-next-turn')!.dataset.kind ?? null,
      area.querySelector('.ui-next-turn-swatch'),
      area.querySelector('.ui-next-turn .glyph') !== null,
    ],
    [null, null, true]
  );

  expect('with nothing left, End turn, as the primary button', shown(), [
    'End turn',
    null,
    'primary',
    false,
  ]);

  next.press();
  next.press();

  expect(
    'End turn is sent once, and the button is disabled at once (#11)',
    [sent, shown()[3]],
    [[['action', { name: 'EndTurn' }]], true]
  );

  next.build(nextTurnQueue([disorder, end], [end], false), false, player);

  expect(
    'and stays disabled until the turn ends, whatever else is left',
    shown()[3],
    true
  );

  next.build(nextTurnQueue([end], [end], false), false, player, 2);

  expect(
    'a new turn starts afresh, even with no waiting build between',
    shown()[3],
    false
  );

  next.build(nextTurnQueue([end], [end], true), true, player, 2);

  expect('waiting: disabled, saying so', shown(), [
    'Waiting for the other civilizations…',
    null,
    'secondary',
    true,
  ]);

  area.remove();

  // The HUD mounts it only under the new interface.

  const mount = (mode: string) => {
    applyInterface(mode, null);

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

    holder.append(...Object.values(areas));
    document.body.append(holder);

    const hud = new Hud({
      ...(areas as any),
      notices: { actions: () => [] } as unknown as Notices,
      portal,
      transport,
      unitAction: () => {},
      world: { get: () => ({} as any) },
    });

    hud.build(
      {
        difficulty: null,
        player: {
          id: 'Player-1',
          actions: [research],
          mandatoryActions: [research],
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
        turn: { value: 1 },
        year: { value: -4000 },
      } as unknown as GameData,
      null,
      false
    );

    const result = [
      hud.nextTurn() !== null,
      areas.actionArea.querySelector('.ui-next-turn') !== null,
    ];

    holder.remove();

    return result;
  };

  let classic: boolean[] = [],
    flagged: boolean[] = [];

  try {
    classic = mount('classic');
    flagged = mount('new');
  } catch (error) {
    failures.push(`mounting the HUD threw: ${error}`);
  }

  expect('classic: the orbs, no Next Turn button', classic, [false, false]);
  expect('new: the Next Turn button in the action area', flagged, [true, true]);

  applyInterface('classic', null);

  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL nextTurn (${
        failures.length
      } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS nextTurn (${checks} checks)\n`);
};

run().catch((error) => {
  process.stderr.write(`FAIL nextTurn: ${error.stack ?? error}\n`);
  process.exit(1);
});
