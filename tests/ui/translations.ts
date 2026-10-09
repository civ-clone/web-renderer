// Names containing an apostrophe must survive translation intact (#3).
//
// `{{item}}` is HTML-escaped by i18next, so "J. S. Bach's Cathedral" came out
// as "J. S. Bach&#39;s Cathedral" wherever the string is set as text. And a
// finished label passed through `t()` a second time loses everything before
// the `:` in "(Cost: …", because i18next reads it as a namespace separator —
// which is why `SelectionWindow` no longer translates labels it is given.
//
// Another player's city must still carry its founder through serialisation
// (#2): `Generic.city-name` looks the name up by `city.originalPlayer`, and the
// `UnknownCity` sent in its place used to leave it out, so "City captured!"
// read `our city {{city.originalPlayer.civilization._}}.Asansol.name`. The
// same goes for another player's wonder (#43).
//
// Every list the engine asks the player to choose from needs its own title, or
// the window falls back to "Choose an option" (it used to fall back to the
// body text), and the advance taken from a captured city is named, not shown
// as its class name (#268).
//
// The welcome doesn't put "the" before a nation that has no article (#335).

import {
  Babylonian,
  Indian,
  Mongol,
} from '@civ-clone/civ1-civilization/Civilizations';
import ChoiceMeta from '@civ-clone/core-client/ChoiceMeta';
import { CeremonialBurial } from '@civ-clone/civ1-science/Advances';
import {
  chooseFromListBody,
  chooseFromListChoice,
  chooseFromListTitle,
} from '../../src/js/UI/lib/chooseFromList';
import { readFileSync, readdirSync, statSync } from 'fs';
import i18next, { t } from 'i18next';
import Notification from '../../src/js/Engine/Notification';
import Tile from '@civ-clone/core-world/Tile';
import UnknownCity from '../../src/js/Engine/UnknownObjects/City';
import UnknownPlayer from '../../src/js/Engine/UnknownObjects/Player';
import { join } from 'path';
import { reconstituteData } from '../../src/js/UI/lib/reconstituteData';
import worldSizes from '../../src/js/UI/lib/worldSizes';

const names = [
  "J. S. Bach's Cathedral",
  "Michelangelo's Chapel",
  "Magellan's Expedition",
];

const failures: string[] = [];

const expect = (description: string, actual: string, expected: string) => {
  if (actual !== expected) {
    failures.push(
      `${description}\n    expected: ${expected}\n    actual:   ${actual}`
    );
  }
};

(async () => {
  await i18next.init({ lng: 'en', defaultNS: 'default', ns: ['default'] });
  await import('../../translations/local/en');
  await import('../../translations/civ1-city/en');
  await import('../../translations/civ1-city-improvement/en');
  await import('../../translations/civ1-civilization/en');
  await import('../../translations/civ1-science/en');
  await import('../../translations/civ1-unit/en');
  await import('../../translations/civ1-wonder/en');

  // Each world size New Game offers has a label with its dimensions (#55).
  worldSizes.forEach(({ key, width, height }) => {
    const label = t(`NewGameWindow.WorldSize.${key}`, { width, height });

    expect(
      `NewGameWindow.WorldSize.${key}`,
      label.includes(`${width} × ${height}`) &&
        !label.startsWith('NewGameWindow')
        ? 'labelled'
        : label,
      'labelled'
    );
  });

  names.forEach((item) => {
    expect('City.Build.title', t('City.Build.title', { item }), item);

    expect(
      'City.Build.build-item',
      t('City.Build.build-item', { item, cost: 400, turns: 80 }),
      `${item} (Cost: 400 / 80 turns)`
    );

    const body = t('City.CompleteProduction.body', {
      item,
      spendCost: { value: 10, resource: { _: 'Gold' } },
      treasury: { value: 20, yield: { _: 'Gold' } },
    });

    expect(
      'City.CompleteProduction.body',
      body.includes(`rush building of ${item} for`) ? item : body,
      item
    );
  });

  // Asansol is an Indian city name, now held by Babylon: the name has to come
  //  from the founder, not the current owner.
  const india = new UnknownPlayer(new Indian()),
    babylon = new UnknownPlayer(new Babylonian()),
    asansol = new UnknownCity(
      'Asansol',
      null as unknown as Tile,
      babylon,
      3,
      india
    );

  [
    [
      'English',
      'ElizabethI',
      'Elizabeth I, you have risen to become leader of England.',
    ],
    [
      'Aztec',
      'MoctezumaII',
      'Moctezuma II, you have risen to become leader of the Aztec Empire.',
    ],
  ].forEach(([civilization, leader, expected]) =>
    expect(
      'Welcome.you-have-risen',
      t('Welcome.you-have-risen', {
        player: { civilization: { _: civilization, leader: { _: leader } } },
      }),
      expected
    )
  );

  const colossus = { _: 'Colossus' },
    notifications: [string, any, string][] = [
      [
        'City.captured-from-us',
        { city: asansol, capturingPlayer: babylon, originalPlayer: india },
        'Babylon have captured our city Asansol!',
      ],
      [
        'City.captured-by-us',
        { city: asansol, capturingPlayer: babylon, originalPlayer: india },
        'We have captured Asansol from India',
      ],
      // #43: this passed `"city": {{city}}`, which `Generic.city-name` does not
      //  take and the notification never sent.
      [
        'Wonder.building-complete.other-player.known',
        { city: asansol, build: colossus },
        'Asansol has completed work on Colossus!',
      ],
      [
        'Wonder.building-complete.other-player.unknown',
        { build: colossus },
        'A far away city has completed work on Colossus!',
      ],
      // #59: a civilization the human has not met is sent as `null` and not
      //  named.
      [
        'Player.defeated.by',
        { defeatedPlayer: india, player: babylon },
        'Babylon has defeated India!',
      ],
      [
        'Player.defeated.unknown',
        { defeatedPlayer: india, player: null },
        'India defeated!',
      ],
      [
        'Player.defeated.unmet-by',
        { player: babylon },
        'Babylon has defeated an unknown civilization!',
      ],
      [
        'Player.defeated.unmet',
        { player: null },
        'News reaches us that an unknown civilization has been defeated!',
      ],
      [
        'Spaceship.part-built.unmet',
        {},
        'Component added to the spaceship of an unknown civilization.',
      ],
      // #72
      [
        'Unit.lost-at-sea',
        { unit: { _: 'Trireme' } },
        'Our Trireme was lost at sea.',
      ],
      [
        'Unit.out-of-fuel',
        { unit: { _: 'Bomber' } },
        'Our Bomber ran out of fuel and crashed.',
      ],
      // #60
      [
        'Wonder.obsolete',
        { city: asansol, wonder: colossus },
        'Colossus in Asansol is now obsolete.',
      ],
      // #184
      [
        'CityImprovement.obsolete',
        { advance: { _: 'Gunpowder' }, improvement: 'Barracks' },
        'Development of Gunpowder makes existing Barracks obsolete.',
      ],
      // #111
      [
        'Player.government-collapsed',
        { city: asansol },
        'Civil disorder in Asansol has brought down your Democracy! Your civilization falls into Anarchy.',
      ],
      [
        'Player.government-collapsed.pyramids',
        { city: asansol },
        'Civil disorder in Asansol has brought down your Democracy! Thanks to the Pyramids, you can choose a new government straight away.',
      ],
    ];

  // #57. The goods are looked up in `default`, where they're registered, not the notification's own namespace. English
  //  names them as the engine does, so this one is given other text for the check.
  const goodsKey = 'TradeRoute.goods.Salt',
    salt = i18next.getResource('en', 'default', goodsKey);

  i18next.addResource('en', 'default', goodsKey, 'Rock salt');

  notifications.push([
    'Unit.trade-route-established',
    { home: asansol, city: asansol, goods: 'Salt', bonus: 30 },
    'Rock salt caravan from Asansol arrives in Asansol. The goods sold for 30 coins.',
  ]);

  // #58: a Diplomat's work, told to both sides.
  notifications.push(
    [
      'Diplomat.advance-stolen',
      { thief: babylon, advance: 'CeremonialBurial' },
      'Babylonians steal Ceremonial Burial.',
    ],
    [
      'Diplomat.incited',
      { city: asansol, inciter: babylon, originalPlayer: india },
      'Indians rebel! Civil War in Asansol. Babylonian influence suspected.',
    ],
    [
      'Diplomat.sabotaged.improvement',
      { city: asansol, improvement: 'Granary' },
      'Granary destroyed in Asansol.',
    ],
    [
      'Diplomat.sabotaged.production',
      { city: asansol },
      'Production sabotaged in Asansol.',
    ],
    [
      'Diplomat.sabotaged.production.unit',
      { city: asansol, build: { _: 'Chariot' } },
      'Chariot production sabotaged in Asansol.',
    ],
    [
      'Diplomat.sabotaged.production.city-improvement',
      { city: asansol, build: { _: 'Granary' } },
      'Granary production sabotaged in Asansol.',
    ],
    [
      'Diplomat.sabotaged.production.wonder',
      { city: asansol, build: { _: 'Colossus' } },
      'Colossus production sabotaged in Asansol.',
    ],
    [
      'Diplomat.unit-bribed',
      { unit: 'Chariot', briber: babylon, previousOwner: india },
      'Indian Chariot unit bribed by Babylonians!',
    ]
  );

  notifications.forEach(([key, data, expected]) => {
    // What the UI receives: serialised by `sendNotification`, rebuilt by the
    //  transport, then translated as `Notifications.publish` does.
    const notification = reconstituteData(
      new Notification(key, data).toPlainObject()
    );

    expect(
      `${key}.body`,
      t(`${notification.key}.body`, {
        ...notification.data,
        ns: 'notification',
        skipOnVariables: false,
      }),
      expected
    );
  });

  i18next.addResource('en', 'default', goodsKey, salt);

  // Every key a `ChoiceMeta` is created with, in the engine packages and here.
  const choiceMetaKeys = new Set<string>(),
    scan = (directory: string): void =>
      readdirSync(directory).forEach((name) => {
        const path = join(directory, name);

        if (name === 'node_modules' || name.startsWith('.')) {
          return;
        }

        if (statSync(path).isDirectory()) {
          scan(path);

          return;
        }

        if (!name.endsWith('.ts') || name.endsWith('.d.ts')) {
          return;
        }

        const source = readFileSync(path, 'utf8');

        for (const [, key] of source.matchAll(
          /new ChoiceMeta\([^']{0,200}?'([^']+)'/g
        )) {
          choiceMetaKeys.add(key);
        }
      });

  readdirSync('node_modules/@civ-clone').forEach((name) =>
    scan(join('node_modules/@civ-clone', name))
  );
  scan('src');

  ['capture-city.steal-advance', 'negotiation.next-step'].forEach((key) => {
    if (!choiceMetaKeys.has(key)) {
      failures.push(`ChoiceMeta scan: expected to find ${key}`);
    }
  });

  choiceMetaKeys.forEach((key) => {
    if (!i18next.exists(`ChooseFromList.${key}.title`)) {
      failures.push(`ChooseFromList.${key}.title: missing`);
    }
  });

  expect(
    'ChooseFromList title fallback',
    chooseFromListTitle('no-such-key', {}),
    'Choose an option'
  );

  // What the UI receives: the `ChoiceMeta` serialised by the transport and rebuilt.
  const stealAdvance = reconstituteData(
    new ChoiceMeta(
      [CeremonialBurial],
      'capture-city.steal-advance',
      asansol as any
    ).toPlainObject()
  );

  expect(
    'ChooseFromList.capture-city.steal-advance.title',
    chooseFromListTitle('capture-city.steal-advance', stealAdvance.data),
    'Acquire an advance'
  );

  expect(
    'ChooseFromList.capture-city.steal-advance.body',
    chooseFromListBody('capture-city.steal-advance', stealAdvance.data),
    'Choose an advance to acquire from Asansol:'
  );

  expect(
    'ChooseFromList.capture-city.steal-advance.choice',
    chooseFromListChoice(
      'capture-city.steal-advance',
      stealAdvance.choices[0].value
    ),
    'Ceremonial Burial'
  );

  if (failures.length) {
    console.error(`FAIL translations\n  ${failures.join('\n  ')}`);

    process.exit(1);
  }

  console.log(
    `PASS translations (${names.length} names, 3 keys; ${notifications.length} notifications; ${choiceMetaKeys.size} choice lists)`
  );
})();
