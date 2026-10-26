// The windows a unit action needs before it's sent (#57, #58): what each says and offers, and what choosing sends.
//
// `chooseUnitAction` (the arrow keys) and `performWithPrompts` (the unit action menu) are given actions as the UI
// holds them, and `perform` records what would be sent.

// Must stay first: `Window.ts` reads `document.body` as it loads.
import { document } from './lib/dom';

import {
  chooseUnitAction,
  openArrivalWindow,
  performWithPrompts,
} from '../../src/js/UI/lib/unitActionPrompts';
import { Unit as UnitData, UnitAction } from '../../src/js/UI/types';
import playUnitKey from '../../src/js/UI/lib/playUnitKey';
import i18next from 'i18next';

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

const babylonian = { civilization: { _: 'Babylonian' } },
  ur = { name: 'Ur', originalPlayer: babylonian },
  cityTile = { id: 'tile-city', city: ur, units: [] },
  unitTile = {
    id: 'tile-unit',
    city: null,
    units: [{ _: 'Chariot', player: babylonian }],
  },
  roman = (gold: number) =>
    ({
      id: 'Diplomat-1',
      player: {
        civilization: { _: 'Roman' },
        treasuries: [{ yield: { _: 'Gold' }, value: gold }],
      },
    } as unknown as UnitData),
  action = (_: string, extra: object = {}, to: object = cityTile) =>
    ({ _, to, ...extra } as unknown as UnitAction);

// The window most recently opened, and what it says and offers.
const latest = () => {
    const dialogs = document.querySelectorAll('dialog');

    return dialogs[dialogs.length - 1] as HTMLElement;
  },
  text = (element: Element | null): string =>
    (element?.textContent ?? '').replace(/\s+/g, ' ').trim(),
  shown = () => {
    const dialog = latest();

    return {
      // The header holds the window's Close button too.
      title: text(dialog.querySelector('header')).replace(/Close$/, ''),
      body: text(dialog.querySelector('p')),
      options: Array.from(dialog.querySelectorAll('option')).map(text),
      buttons: Array.from(dialog.querySelectorAll('footer button')).map(text),
    };
  },
  choose = (value: string) => {
    const select = latest().querySelector('select') as HTMLSelectElement;

    // linkedom's `value` is read-only: it follows the selected option.
    Array.from(select.querySelectorAll('option')).forEach((option) =>
      option.toggleAttribute('selected', option.getAttribute('value') === value)
    );
    select.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' })
    );
  },
  press = (label: string) =>
    (
      Array.from(latest().querySelectorAll('footer button')).find(
        (button) => text(button) === label
      ) as HTMLElement
    ).dispatchEvent(new Event('click', { bubbles: true }));

(async () => {
  await i18next.init({ lng: 'en', defaultNS: 'default', ns: ['default'] });
  await import('../../translations/local/en');
  await import('../../translations/civ1-city/en');
  await import('../../translations/civ1-civilization/en');
  await import('../../translations/civ1-unit/en');

  const sent: string[] = [],
    perform = (chosen: UnitAction) => sent.push(chosen._);

  // A Diplomat arriving at a rival city, its actions in the order the engine offers them.
  const atWar = [
    action('StealTechnology'),
    action('EstablishEmbassy'),
    action('InvestigateCity'),
    action('IndustrialSabotage'),
    action('InciteRevolt', { cost: 900 }),
    action('MeetWithKing'),
  ];

  chooseUnitAction(roman(1000), atWar, perform);

  expect(
    'the arrival window: title',
    shown().title,
    'Roman Diplomat arrives in Ur'
  );
  expect('the arrival window: options, in Civ1’s order', shown().options, [
    'Establish Embassy',
    'Investigate City',
    'Steal Technology',
    'Industrial Sabotage',
    'Incite a Revolt',
    'Meet with King',
  ]);

  choose('steal-technology');

  expect('choosing to steal sends StealTechnology', sent, ['StealTechnology']);

  [
    ['establish-embassy', 'EstablishEmbassy'],
    ['investigate-city', 'InvestigateCity'],
    ['meet-with-king', 'MeetWithKing'],
  ].forEach(([option, name]) => {
    chooseUnitAction(roman(1000), atWar, perform);
    choose(option);

    expect(`choosing ${option} sends ${name}`, sent.slice(-1), [name]);
  });

  // Inciting opens the incite window.
  chooseUnitAction(roman(1000), atWar, perform);
  choose('incite-revolt');

  expect('the incite window', shown(), {
    title: 'Incite a Revolt',
    body: 'Dissidents in Ur will revolt for 900 coins.',
    options: [],
    buttons: ['Forget it', 'Incite revolt'],
  });

  press('Incite revolt');

  expect('inciting sends InciteRevolt', sent.slice(-1), ['InciteRevolt']);

  performWithPrompts(roman(100), atWar[4], atWar, perform);

  expect('the incite window, unaffordable: only Forget it', shown().buttons, [
    'Forget it',
  ]);

  // At peace: subverting, and a confirmation before anything that breaks the treaty.
  const atPeace = [
    action('SneakStealTechnology', { enemy: babylonian }),
    action('SneakInciteRevolt', { cost: 900, enemy: babylonian }),
    action('SubvertCity', { cost: 1800 }),
  ];

  performWithPrompts(roman(2000), atPeace[1], atPeace, perform);

  expect(
    'the incite window at peace, with the gold to subvert',
    shown().buttons,
    ['Forget it', 'Incite revolt', 'Subvert city for 1,800 coins']
  );

  press('Subvert city for 1,800 coins');

  expect('subverting sends SubvertCity', sent.slice(-1), ['SubvertCity']);

  performWithPrompts(roman(2000), atPeace[0], atPeace, perform);

  expect('stealing at peace asks first, with Civ1’s buttons', shown(), {
    title: 'Sneak attack?',
    body: 'We have signed a peace treaty with the Babylonians!',
    options: [],
    buttons: ['Break treaty', 'Cancel action'],
  });

  // Onto a treaty partner's land (#287): Civ1's question, and Cancel spends the move with `AbortMove`.
  const landTile = { id: 'tile-land', city: null, units: [] },
    ontoLand = [
      action('SneakMove', { enemy: babylonian }, landTile),
      action('AbortMove', { partner: babylonian }, landTile),
    ];

  chooseUnitAction(roman(0), ontoLand, perform);

  expect("a partner's land asks first", shown(), {
    title: 'Peace treaty',
    body: 'We have signed a peace treaty with the Babylonians!',
    options: [],
    buttons: ['Cancel action', 'Break treaty'],
  });
  expect('and must be answered', latest().querySelector('header button'), null);

  press('Cancel action');

  expect('Cancel sends AbortMove', sent.slice(-1), ['AbortMove']);

  // Escape is Cancel (#659).
  chooseUnitAction(roman(0), ontoLand, perform);

  const treaty = latest(),
    sentBeforeEscape = sent.length;

  // Pressed with Break treaty focused, as it would be: the key reaches the window from its button.
  Array.from(treaty.querySelectorAll('footer button'))
    .find((button) => text(button) === 'Break treaty')!
    .dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'Escape',
      })
    );

  expect(
    'Escape sends AbortMove and closes it',
    [sent.slice(sentBeforeEscape), treaty.isConnected],
    [['AbortMove'], false]
  );

  chooseUnitAction(roman(0), ontoLand, perform);
  press('Break treaty');

  expect('Break treaty sends SneakMove', sent.slice(-1), ['SneakMove']);

  performWithPrompts(
    roman(0),
    action('SneakPillage', { enemy: babylonian }, landTile),
    [],
    perform
  );

  expect('pillaging there asks too', shown().buttons, [
    'Cancel action',
    'Break treaty',
  ]);

  const sentBeforePillage = sent.length;

  press('Cancel action');

  expect('Cancel on pillaging sends nothing', sent.length, sentBeforePillage);

  // A GoTo that stopped next to the partner's land (#357) is offered the same window.
  const halted = openArrivalWindow(roman(0), ontoLand, perform);

  expect(
    'a GoTo stopped next to a partner’s land asks',
    [halted !== null, shown().title],
    [true, 'Peace treaty']
  );

  press('Cancel action');

  expect('and Cancel sends AbortMove', sent.slice(-1), ['AbortMove']);

  // Pillaging from the keys asks too, rather than sending at once or doing nothing.
  const keySent: string[] = [],
    keyContext = {
      apply: () => {},
      pendingMove: { start: () => {} },
      scheduleRender: () => {},
      send: (unitId: string, chosen: UnitAction) => keySent.push(chosen._),
      transport: { send: () => {} },
      world: {} as any,
    },
    onLand = (actions: UnitAction[]) =>
      ({ ...roman(0), actions } as unknown as UnitData);

  expect(
    'P on a partner’s land asks first',
    [
      playUnitKey(
        'P',
        onLand([action('SneakPillage', { enemy: babylonian }, landTile)]),
        keyContext as any
      ),
      shown().title,
      keySent,
    ],
    ['prompted', 'Peace treaty', []]
  );

  press('Break treaty');

  expect('and Break treaty sends SneakPillage', keySent, ['SneakPillage']);

  expect(
    'P under a Senate asks first too',
    playUnitKey(
      'P',
      onLand([
        action(
          'Overruled',
          { action: { _: 'SneakPillage', enemy: babylonian }, moves: 0 },
          landTile
        ),
      ]),
      keyContext as any
    ),
    'prompted'
  );

  press('Break treaty');

  expect('then is overruled', shown().title, 'The Senate');
  expect('and sends Overruled', keySent.slice(-1), ['Overruled']);

  expect(
    'P elsewhere pillages at once',
    playUnitKey(
      'P',
      onLand([action('Pillage', {}, landTile)]),
      keyContext as any
    ),
    'sent'
  );

  // Under a Senate (#133), Break treaty is overruled: it says so, and sends `Overruled` for the moves it spends.
  const overruledMove = [
    action(
      'Overruled',
      { action: { _: 'SneakMove', enemy: babylonian }, moves: 1 },
      landTile
    ),
    action('AbortMove', { partner: babylonian }, landTile),
  ];

  chooseUnitAction(roman(0), overruledMove, perform);

  expect('an overruled move asks the same question', shown().buttons, [
    'Cancel action',
    'Break treaty',
  ]);

  press('Break treaty');

  expect('Break treaty is overruled', shown(), {
    title: 'The Senate',
    body: 'Overruled by the Senate. Action canceled.',
    options: [],
    buttons: [],
  });
  expect('and sends Overruled', sent.slice(-1), ['Overruled']);

  chooseUnitAction(
    roman(0),
    [
      action(
        'Overruled',
        { action: { _: 'SneakAttack', enemy: babylonian }, moves: 0 },
        unitTile
      ),
    ],
    perform
  );

  expect(
    'an overruled sneak attack asks as one does',
    shown().title,
    'Sneak attack?'
  );

  press('OK');

  expect('then is overruled', shown().title, 'The Senate');
  expect('and sends Overruled', sent.slice(-1), ['Overruled']);

  // An overruled Diplomat is offered what it asked for, at its price.
  const overruledDiplomat = [
    action('Overruled', {
      action: { _: 'SneakStealTechnology', enemy: babylonian },
      moves: 0,
    }),
    action('Overruled', {
      action: { _: 'SneakInciteRevolt', cost: 900, enemy: babylonian },
      moves: 0,
    }),
    action('SubvertCity', { cost: 1800 }),
  ];

  chooseUnitAction(roman(1000), overruledDiplomat, perform);

  expect('an overruled Diplomat keeps its options', shown().options, [
    'Steal Technology',
    'Incite a Revolt',
  ]);

  choose('incite-revolt');

  expect(
    'and its price',
    shown().body,
    'Dissidents in Ur will revolt for 900 coins.'
  );

  press('Incite revolt');

  expect('inciting asks first', shown().buttons, [
    'Break treaty',
    'Cancel action',
  ]);

  press('Break treaty');

  expect('then is overruled', shown().title, 'The Senate');
  expect('and sends Overruled', sent.slice(-1), ['Overruled']);

  // Bribing a lone unit.
  performWithPrompts(
    roman(300),
    action('BribeUnit', { cost: 120 }, unitTile),
    [],
    perform
  );

  expect('the bribe window', shown(), {
    title: 'Bribe',
    body: 'Babylonian Chariot will desert for 120 coins. Our treasury currently contains 300 coins.',
    options: [],
    buttons: ['Cancel action', 'Bribe unit'],
  });

  press('Bribe unit');

  expect('bribing sends BribeUnit', sent.slice(-1), ['BribeUnit']);

  // A Caravan entering one of your cities.
  chooseUnitAction(
    roman(0),
    [action('Move'), action('HelpBuildWonder')],
    perform
  );

  expect('the Caravan’s choice', shown().title, 'Will you?');
  expect('lists every option at once', shown().options, [
    'Keep moving',
    'Help build Wonder',
  ]);
  expect(
    'as a list, not a drop-down',
    latest().querySelector('select')!.getAttribute('size'),
    '2'
  );

  // Anything else is sent straight away.
  chooseUnitAction(roman(0), [action('Move')], perform);

  expect('a plain move is sent with no window', sent.slice(-1), ['Move']);

  // A unit whose GoTo stopped next to a tile (#357) is offered the arrival window only: an attack or a capture opens
  //  none, and nothing is sent for the player.
  const sentBefore = sent.length;

  expect(
    'no arrival window for an attack',
    openArrivalWindow(roman(0), [action('Attack', {}, unitTile)], perform),
    null
  );
  expect(
    'no arrival window for capturing a city',
    openArrivalWindow(roman(0), [action('CaptureCity')], perform),
    null
  );
  expect('and nothing is sent for them', sent.length, sentBefore);

  const arrival = openArrivalWindow(
    roman(0),
    [action('Move'), action('HelpBuildWonder')],
    perform
  );

  let closed = 0;

  arrival?.on('close', () => closed++);

  expect('a Caravan’s arrival window', shown().title, 'Will you?');

  (latest().querySelector('header button') as HTMLElement).dispatchEvent(
    new Event('click', { bubbles: true })
  );

  expect('dismissing it says it closed', closed, 1);
  expect('and sends nothing', sent.length, sentBefore);

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL unitActionPrompts (${
        failures.length
      } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS unitActionPrompts (${checks} checks)\n`);
})().catch((error) => {
  process.stderr.write(`FAIL unitActionPrompts: ${error?.stack ?? error}\n`);
  process.exit(1);
});
