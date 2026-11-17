// Civ2's Diplomat and Spy missions and trade routes in the interface (M2d part 2, #1007), from the data the engine sends,
//  with no rules here:
//
// - a Spy arriving at a rival city is offered poisoning the water and planting a nuclear device, after Civ1's missions,
//   and under a treaty their Sneak rows stand for them;
// - a mission the rules say breaks nothing unless its agent is lost (`consequence: incident-if-lost`) asks in those
//   words, and goes on to the target picker;
// - a Spy's theft or sabotage with `targets` asks what to aim at, one at random first, even with one target: an
//   advance by its name, a building by its name, and the production; at random sends no choice;
// - the incite window says what each price does to a treaty, where the rules say;
// - a Spy beside a lone unit bribes it through the bribe window, with its price;
// - the city screen's routes name what each carries, where it is sent;
// - the incident offer's words, and the new notices' keys have a title and a body.

// Must stay first: the components read `document` as they load.
import { document } from './lib/dom';
import './lib/interfaces';
import './lib/classicInterface';
import './lib/artPacks';

import { City, Tile, Unit, UnitAction } from '@civ-clone/ui-protocol/types';
import {
  openArrivalWindow,
  performWithPrompts,
} from '@civ-clone/ui-hud/lib/unitActionPrompts';
import i18next, { t } from 'i18next';
import i18nOptions from '@civ-clone/ui-game/app/i18nOptions';
import { renderTradeRoutes } from '@civ-clone/ui-city/components/City';

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
      `FAIL civ2-missions: stopped after ${checks} checks\n`
    );
    process.exitCode = 1;
  }
});

const roman = { id: 'Player-1', civilization: { _: 'Roman' } },
  babylonian = { id: 'Player-2', civilization: { _: 'Babylonian' } },
  babylon = {
    id: 'City-Babylon',
    name: 'Babylon',
    originalPlayer: babylonian,
  } as unknown as City,
  cityTile = {
    id: 'Tile-city',
    x: 1,
    y: 0,
    city: babylon,
    units: [],
  } as unknown as Tile,
  action = (_: string, extra: object = {}, to: Tile = cityTile): UnitAction =>
    ({ _, __: [], id: `${_}-1`, to, ...extra } as unknown as UnitAction),
  spy = (gold: number) =>
    ({
      _: 'Spy',
      id: 'Unit-1',
      moves: { value: 1 },
      player: {
        ...roman,
        treasuries: [{ yield: { _: 'Gold' }, value: gold }],
      },
    } as unknown as Unit);

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
      title: text(dialog.querySelector('header')).replace(/Close$/, ''),
      body: text(dialog.querySelector('p')),
      options: Array.from(dialog.querySelectorAll('option')).map(text),
      buttons: Array.from(dialog.querySelectorAll('footer button')).map(text),
    };
  },
  values = () =>
    Array.from(latest().querySelectorAll('option')).map((option) =>
      option.getAttribute('value')
    ),
  choose = (value: string) => {
    const select = latest().querySelector('select') as HTMLSelectElement;

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

const run = async (): Promise<void> => {
  await i18next.init({ ...i18nOptions, lng: 'en' });
  await import('./lib/strings');
  await import('../../translations/civ1-city-improvement/en');
  await import('../../translations/civ1-civilization/en');
  await import('../../translations/civ1-science/en');
  await import('../../translations/civ1-unit/en');
  await import('../../translations/civ2-city/en');
  await import('../../translations/civ2-diplomacy/en');
  await import('../../translations/civ2-unit/en');

  const sent: [string, string | undefined][] = [],
    perform = (chosen: UnitAction) => sent.push([chosen._, chosen.choice]);

  // The arrival window, at no treaty, and under one.

  const atWar = [
    action('StealTechnology', { targets: ['Writing', 'Alphabet'] }),
    action('EstablishEmbassy'),
    action('IndustrialSabotage', { targets: ['Barracks', 'production'] }),
    action('PoisonWater'),
    action('PlantNuclearDevice'),
    action('InciteRevolt', { cost: 400 }),
  ];

  openArrivalWindow(spy(1000), atWar, perform);

  expect(
    'a Spy at a rival city: arrives as a Spy, with Civ1’s missions, then poisoning and a nuclear device',
    [shown().title, ...shown().options],
    [
      'Roman Spy arrives in Babylon',
      'Establish Embassy',
      'Steal Technology',
      'Industrial Sabotage',
      'Poison the Water Supply',
      'Plant a Nuclear Device',
      'Incite a Revolt',
    ]
  );

  choose('poison-water');
  openArrivalWindow(spy(1000), atWar, perform);
  choose('plant-nuclear-device');

  expect('planting a nuclear device asks first', shown(), {
    title: 'Plant a nuclear device?',
    body: 'Our Spy will set off a nuclear device in Babylon.',
    options: [],
    buttons: ['Set it off', 'Cancel action'],
  });

  press('Set it off');

  performWithPrompts(
    spy(1000),
    action('PlantNuclearDevice', { consequence: 'device-may-be-found' }),
    [],
    perform
  );

  expect(
    'and says what may follow, where the rules say',
    shown().body,
    'Our Spy will set off a nuclear device in Babylon. If the world finds out who planted it, every civilization in contact with us will declare war on us.'
  );

  press('Cancel action');

  expect('each sends its action', sent.splice(0), [
    ['PoisonWater', undefined],
    ['PlantNuclearDevice', undefined],
  ]);

  // The picker: theft.

  openArrivalWindow(spy(1000), atWar, perform);
  choose('steal-technology');

  expect(
    'stealing asks what, at random first, each advance by its name',
    [shown().title, shown().options],
    [
      'Steal technology: which one?',
      ['Whatever we can find (at random)', 'Writing', 'Alphabet'],
    ]
  );

  choose('Alphabet');

  performWithPrompts(spy(1000), atWar[0]!, atWar, perform);
  choose(values()[0]!);

  expect(
    'the advance chosen goes with the theft; at random, no choice goes',
    sent.splice(0),
    [
      ['StealTechnology', 'Alphabet'],
      ['StealTechnology', undefined],
    ]
  );

  // The picker: sabotage, and one target alone still asks.

  performWithPrompts(spy(1000), atWar[2]!, atWar, perform);

  expect(
    'sabotage offers each building by its name and the production',
    shown().options,
    [
      'Whatever we can find (at random)',
      'Barracks',
      'What the city is building',
    ]
  );

  choose('production');

  performWithPrompts(
    spy(1000),
    action('IndustrialSabotage', { targets: ['production'] }),
    [],
    perform
  );

  expect(
    'with nothing but the production, it still asks: a chosen target and a random one are different missions',
    shown().options,
    ['Whatever we can find (at random)', 'What the city is building']
  );

  choose('production');

  performWithPrompts(spy(1000), action('IndustrialSabotage'), [], perform);

  expect(
    'and a Diplomat’s, which has no targets, is sent at once',
    sent.splice(0),
    [
      ['IndustrialSabotage', 'production'],
      ['IndustrialSabotage', 'production'],
      ['IndustrialSabotage', undefined],
    ]
  );

  // Under a treaty: the Sneak rows, warned of in the rules' words, then the picker.

  const atPeace = [
    action('SneakStealTechnology', {
      enemy: babylonian,
      targets: ['Writing'],
      consequence: 'incident-if-lost',
    }),
    action('SneakIndustrialSabotage', {
      enemy: babylonian,
      targets: [],
      consequence: 'incident-if-lost',
    }),
    action('SneakPoisonWater', {
      enemy: babylonian,
      consequence: 'incident-if-lost',
    }),
    action('InciteRevolt', { cost: 400, consequence: 'treaty-ends' }),
    action('SubvertCity', { cost: 800, consequence: 'treaty-kept' }),
  ];

  openArrivalWindow(spy(1000), atPeace, perform);

  expect(
    'under a treaty, the Sneak rows stand for theft, sabotage and poisoning',
    shown().options,
    [
      'Steal Technology',
      'Industrial Sabotage',
      'Poison the Water Supply',
      'Incite a Revolt',
    ]
  );

  choose('poison-water');

  expect(
    'and each is warned of first: the mission breaks nothing unless its agent is lost',
    shown(),
    {
      title: 'Mission under a treaty',
      body: 'We have a treaty with the Babylonians. The mission itself breaks nothing, but if our agent is lost, the incident could cost us the treaty.',
      options: [],
      buttons: ['Go ahead', 'Cancel action'],
    }
  );

  press('Cancel action');

  expect('Cancel sends nothing', sent, []);

  performWithPrompts(spy(1000), atPeace[0]!, atPeace, perform);
  press('Go ahead');

  expect('Go ahead on a theft goes on to the picker', shown().options, [
    'Whatever we can find (at random)',
    'Writing',
  ]);

  choose('Writing');

  performWithPrompts(spy(1000), atPeace[1]!, atPeace, perform);
  press('Go ahead');

  expect(
    'and sends the Sneak row, with the choice; a sabotage with nothing to choose from, as it is',
    sent.splice(0),
    [
      ['SneakStealTechnology', 'Writing'],
      ['SneakIndustrialSabotage', undefined],
    ]
  );

  // Inciting: the price, and what each price does to the treaty.

  // A Diplomat's: always lost, so the incident is certain, and under a Republic the Senate may fall.
  {
    const certain = action('SneakStealTechnology', {
      enemy: babylonian,
      targets: [],
      consequence: 'incident-certain',
      scandal: true,
    });

    performWithPrompts(spy(1000), certain, [certain], perform);

    expect(
      'a Diplomat’s mission under a treaty says the incident is certain, and that the Senate may fall',
      shown(),
      {
        title: 'Mission under a treaty',
        body: 'We have a treaty with the Babylonians. Our Diplomat will not come back from this mission, and the incident will cost us the treaty. Our Senate may bring the government down over it.',
        options: [],
        buttons: ['Break treaty', 'Cancel action'],
      }
    );

    press('Break treaty');

    expect('and Break treaty sends it', sent.splice(0), [
      ['SneakStealTechnology', undefined],
    ]);
  }

  performWithPrompts(
    spy(1000),
    { ...atPeace[3]!, scandal: true } as UnitAction,
    atPeace.map((row, index) =>
      index === 3 ? ({ ...row, scandal: true } as UnitAction) : row
    ),
    perform
  );

  expect(
    'with a Senate, inciting at the plain price says the government may fall',
    shown().body,
    'Dissidents in Babylon will revolt for 400 coins. At this price the revolt will be traced to us: there will be an incident, and war. Paying double keeps our treaty, though they will hold it against us. Our Senate may bring the government down over it.'
  );

  press('Forget it');

  performWithPrompts(spy(1000), atPeace[3]!, atPeace, perform);

  expect(
    'the incite window under a treaty says what each price costs it',
    shown(),
    {
      title: 'Incite a Revolt',
      body: 'Dissidents in Babylon will revolt for 400 coins. At this price the revolt will be traced to us: there will be an incident, and war. Paying double keeps our treaty, though they will hold it against us.',
      options: [],
      buttons: ['Forget it', 'Incite revolt', 'Subvert city for 800 coins'],
    }
  );

  press('Subvert city for 800 coins');

  performWithPrompts(spy(500), atPeace[3]!, atPeace, perform);

  expect(
    'paying double sends SubvertCity; without the gold for it, it isn’t offered',
    [sent.splice(0), shown().buttons],
    [[['SubvertCity', undefined]], ['Forget it', 'Incite revolt']]
  );

  press('Forget it');

  // A lone unit: bribe or sabotage, and the bribe's price.

  {
    const unitTile = {
        id: 'Tile-unit',
        x: 2,
        y: 0,
        city: null,
        units: [{ _: 'Warrior', player: babylonian }],
      } as unknown as Tile,
      bribe = action('BribeUnit', { cost: 60 }, unitTile),
      sabotage = action('SabotageUnit', {}, unitTile);

    openArrivalWindow(spy(100), [bribe, sabotage], perform);

    expect(
      'a Spy beside a lone unit may bribe it or sabotage it',
      shown().options,
      ['Bribe unit', 'Sabotage unit']
    );

    choose('bribe-unit');

    expect('bribing shows its price', shown(), {
      title: 'Bribe',
      body: 'Babylonian Warrior will desert for 60 coins. Our treasury currently contains 100 coins.',
      options: [],
      buttons: ['Cancel action', 'Bribe unit'],
    });

    press('Bribe unit');

    expect('and sends BribeUnit', sent.splice(0), [['BribeUnit', undefined]]);
  }

  // The city screen's routes, with what each carries.

  {
    const routes = renderTradeRoutes({
        tradeRoutes: [
          {
            civilization: 'Babylonian',
            goods: 'Hides',
            name: 'Babylon',
            trade: 3,
          },
          { civilization: 'Roman', name: 'Antium', trade: 1 },
        ],
      } as unknown as City) as HTMLElement,
      rows = Array.from(routes.querySelectorAll('.trade-route')).map((row) => [
        text(row.querySelector('.visually-hidden')),
        text(row.querySelector('.name')),
      ]);

    expect(
      'each route names its partner, and what it carries where that is sent (Civ1 sends none)',
      rows,
      [
        ['Babylon (Leather): +3', 'Babylon (Leather)'],
        ['Antium: +1', 'Antium'],
      ]
    );
  }

  // The incident offer's words.

  expect(
    'the incident offer: war, or the end of an alliance, with letting it pass first',
    ['diplomacy.incident-offer', 'diplomacy.incident-offer-alliance'].map(
      (key) => [
        t(`ChooseFromList.${key}.title`),
        t(`ChooseFromList.${key}.body`, {
          data: { player: babylonian },
        }),
        t(`ChooseFromList.${key}.choice.false`),
        t(`ChooseFromList.${key}.choice.true`),
      ]
    ),
    [
      [
        'Incident',
        'Agents of the Babylonians have been caught at work against us, for all our treaty. Shall we declare war on them?',
        'Let it pass',
        'Declare war',
      ],
      [
        'Incident',
        'Agents of our allies, the Babylonians, have been caught at work against us. Shall we end our alliance?',
        'Let it pass',
        'End the alliance',
      ],
    ]
  );

  // Every new notice has a title and a body, for each form.

  const keys = [
      'Unit.trade-route-delivered',
      'Espionage.water-poisoned-by-us',
      'Espionage.water-poisoned',
      'Espionage.water-poisoned.unmet',
      'Espionage.agent-caught',
      'Espionage.agent-caught-at-unit',
      'Espionage.agent-lost',
      'Espionage.agent-lost-at-unit',
      'Espionage.device-detonated',
      'Espionage.foreign-agent-caught',
      'Espionage.foreign-agent-caught.unmet',
      'Espionage.device-planted',
      'Espionage.device-discovered-ours',
      'Diplomacy.senate-scandal',
      'Diplomacy.senate-scandal.unmet',
      ...['attitude', 'terror', 'wimp-out'].flatMap((outcome) =>
        ['incident', 'incident-against-us'].flatMap((side) => [
          `Diplomacy.${side}.${outcome}`,
          `Diplomacy.${side}.${outcome}.unmet`,
        ])
      ),
    ],
    missing = keys.flatMap((key) =>
      ['title', 'body']
        .filter(
          (part) => !i18next.exists(`${key}.${part}`, { ns: 'notification' })
        )
        .map((part) => `${key}.${part}`)
    );

  expect('every new notice has a title and a body', missing, []);

  finished = true;

  if (failures.length) {
    process.stderr.write(
      `FAIL civ2-missions (${
        failures.length
      } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS civ2-missions (${checks} checks)\n`);
  process.exit(0);
};

run().catch((error) => {
  process.stderr.write(`FAIL civ2-missions: ${error.stack ?? error}\n`);
  process.exit(1);
});
