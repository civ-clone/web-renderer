// The windows a unit action needs before it's sent (#57, #58): what each says and offers, and what choosing sends.
//
// `chooseUnitAction` (the arrow keys) and `performWithPrompts` (the unit action menu) are given actions as the UI
// holds them, and `perform` records what would be sent.

// Must stay first: `Window.ts` reads `document.body` as it loads.
import { document } from './lib/dom';

import {
  chooseUnitAction,
  performWithPrompts,
} from '../../src/js/UI/lib/unitActionPrompts';
import { Unit as UnitData, UnitAction } from '../../src/js/UI/types';
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

  // A Diplomat arriving at a rival city.
  const atWar = [
    action('StealTechnology'),
    action('IndustrialSabotage'),
    action('InciteRevolt', { cost: 900 }),
  ];

  chooseUnitAction(roman(1000), atWar, perform);

  expect(
    'the arrival window: title',
    shown().title,
    'Roman Diplomat arrives in Ur'
  );
  expect('the arrival window: options, in Civ1’s order', shown().options, [
    'Steal Technology',
    'Industrial Sabotage',
    'Incite a Revolt',
  ]);

  choose('steal-technology');

  expect('choosing to steal sends StealTechnology', sent, ['StealTechnology']);

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

  performWithPrompts(roman(100), atWar[2], atWar, perform);

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
