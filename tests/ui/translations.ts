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
// A city whose name isn't on its founder's list (Toronto, founded by the
// Mongols) is named as itself, not `Mongol.Toronto.name`: i18next before 23
// dropped a nested `$t`'s `defaultValue`, which `Generic.city-name` relies on
// (#337). The welcome doesn't put "the" before a nation that has no article
// (#335).
//
// After an exchange of knowledge, the computer player says which advance it
// took, by its nation and the advance's name (#453).
//
// English is all there is, so it's what a French browser sees too: everything
// here is checked with the app's own options and `fr-FR` (#471).
//
// A nation that opens a sentence is capitalised ("The Sioux Nation has been
// defeated …"), and keeps its lower-case article anywhere else in the sentence
// ("… by the Aztec Empire"). A city's name comes from its founder's list
// wherever it's shown, the map's `cityName` included (#359).

import * as Civ1Civilizations from '@civ-clone/civ1-civilization/Civilizations';
import * as WorldCivilizations from '@civ-clone/civ1-world-civilizations/Civilizations';
import {
  Aztec,
  Babylonian,
  Indian,
  Mongol,
} from '@civ-clone/civ1-civilization/Civilizations';
import { cityName, cityNameText } from '../../src/js/UI/components/lib/city';
import ChoiceMeta from '@civ-clone/core-client/ChoiceMeta';
import { CeremonialBurial } from '@civ-clone/civ1-science/Advances';
import {
  chooseFromListBody,
  chooseFromListChoice,
  chooseFromListTitle,
} from '../../src/js/UI/lib/chooseFromList';
import { readFileSync, readdirSync, statSync } from 'fs';
import i18next, { t } from 'i18next';
import {
  advanceName,
  advanceNames,
  researchingName,
} from '../../src/js/UI/components/lib/advances';
import Notification from '../../src/js/Engine/Notification';
import { PlayerResearch } from '../../src/js/UI/types';
import Tile from '@civ-clone/core-world/Tile';
import Barbarian from '@civ-clone/base-civilization-barbarian/Barbarian';
import { playerProgress, turnProgress } from '../../src/js/Engine/lib/progress';
import UnknownCity from '../../src/js/Engine/UnknownObjects/City';
import type Player from '@civ-clone/core-player/Player';
import UnknownPlayer from '../../src/js/Engine/UnknownObjects/Player';
import addFormatters from '../../src/js/UI/app/i18nFormatters';
import i18nOptions from '../../src/js/UI/app/i18nOptions';
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
  await i18next.init({ ...i18nOptions, lng: 'fr-FR' });
  addFormatters(i18next);
  await import('../../translations/local/en');
  await import('../../translations/civ1-city/en');
  await import('../../translations/civ1-city-improvement/en');
  await import('../../translations/civ1-civilization/en');
  await import('../../translations/civ1-diplomacy/en');
  await import('../../translations/civ1-science/en');
  await import('../../translations/civ1-unit/en');
  await import('../../translations/civ1-wonder/en');
  await import('../../translations/civ1-difficulty/en');
  await import('../../translations/civ1-government/en');
  await import('../../translations/civ1-spaceship/en');
  await import('../../translations/civ1-trade-rate/en');
  await import('../../translations/civ1-world/en');
  await import('../../translations/civ1-world-civilizations/en');
  await import('../../translations/base-civilization-barbarian/en');

  expect('Generic.ok (fr-FR)', t('Generic.ok'), 'OK');

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

    expect(
      'City.Build.build-item formats large costs',
      t('City.Build.build-item', { item, cost: 1234, turns: 80, lng: 'en-US' }),
      `${item} (Cost: 1,234 / 80 turns)`
    );

    expect(
      'City.Build.build-unit formats large costs',
      t('City.Build.build-unit', {
        item,
        attack: 1,
        defence: 1,
        movement: 1,
        visibility: 1,
        cost: 1234,
        turns: 80,
        lng: 'en-US',
      }),
      `${item} 1/1/1/1 (Cost: 1,234 / 80 turns)`
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

    expect(
      'City.SellImprovement.body',
      t('City.SellImprovement.body', {
        item,
        saleValue: { value: 40, resource: { _: 'Gold' } },
      }),
      `Do you want to sell your ${item} for 40 Gold?`
    );
  });

  expect(
    'PlayerDetails.Treasury.value formats large balances',
    t('PlayerDetails.Treasury.value', { value: 1234, lng: 'en-US' }),
    '1,234'
  );
  expect(
    'PlayerDetails.Treasury.detail signs a gain',
    t('PlayerDetails.Treasury.detail', { perTurn: 1234, lng: 'en-US' }),
    '+1,234 / turn'
  );
  expect(
    'PlayerDetails.Treasury.detail signs a loss',
    t('PlayerDetails.Treasury.detail', { perTurn: -5, lng: 'en-US' }),
    '-5 / turn'
  );
  expect(
    'PlayerDetails.Treasury.detail leaves nothing unsigned',
    t('PlayerDetails.Treasury.detail', { perTurn: 0, lng: 'en-US' }),
    '0 / turn'
  );

  expect(
    'GameOver.score formats large scores',
    t('GameOver.score', { score: 1234, lng: 'en-US' }),
    'Civilization Score: 1,234'
  );
  expect(
    'Barbarians.ransom.body formats large amounts',
    t('Barbarians.ransom.body', {
      amount: 1234,
      ns: 'notification',
      lng: 'en-US',
    }),
    'Barbarian leader captured! 1,234 Gold ransom paid.'
  );

  // Asansol is an Indian city name, now held by Babylon: the name has to come
  //  from the founder, not the current owner.
  // An `UnknownCity` takes the stand-ins for players as the client builds them, which aren't core `Player`s.
  const unknownPlayer = (
    ...args: ConstructorParameters<typeof UnknownPlayer>
  ): Player => new UnknownPlayer(...args) as unknown as Player;

  const india = unknownPlayer(new Indian()),
    babylon = unknownPlayer(new Babylonian()),
    asansol = new UnknownCity(
      'Asansol',
      null as unknown as Tile,
      babylon,
      3,
      india
    );

  const toronto = new UnknownCity(
    'Toronto',
    null as unknown as Tile,
    unknownPlayer(new Mongol()),
    3,
    unknownPlayer(new Mongol())
  );

  expect(
    'Actions.CityBuildSelectionWindow.title',
    t('Actions.CityBuildSelectionWindow.title', {
      city: reconstituteData(toronto.toPlainObject()),
    }),
    'What would you like to build in Toronto?'
  );

  expect(
    'Generic.city-name',
    t('Generic.city-name', { name: 'Toronto', civilization: 'Mongol' }),
    'Toronto'
  );

  // #382: a city name is passed to a nested `Generic.city-name` unescaped, so "Xi'an" is found on its founder's list.
  //  Passed escaped, the lookup missed and the default escaped it a second time: "View Xi&amp;#39;an".
  const xian = {
    name: "Xi'an",
    originalPlayer: { civilization: { _: 'Chinese' } },
  };

  [
    ['Generic.view-city', "View Xi'an"],
    ['HappinessReport.view-city', "View Xi'an"],
    ['Actions.ShowCity.label', "View Xi'an"],
    [
      'Actions.CityBuildSelectionWindow.title',
      "What would you like to build in Xi'an?",
    ],
  ].forEach(([key, expected]) => expect(key, t(key, { city: xian }), expected));

  // A name that isn't on the list is still escaped, once, by `Generic.city-name`'s default.
  expect(
    'Generic.view-city (a name not on the list)',
    t('Generic.view-city', {
      city: { name: 'A<b>', originalPlayer: { civilization: { _: 'Mongol' } } },
    }),
    'View A&lt;b&gt;'
  );

  // #472: the refusal is a text node, so a name with an apostrophe is written as one, whether or not it's on its
  //  founder's list.
  [
    [xian, "Xi'an"],
    [
      {
        name: "O'Brien",
        originalPlayer: { civilization: { _: 'Mongol' } },
      },
      "O'Brien",
    ],
  ].forEach(([city, name]: any) =>
    expect(
      'JoinCity.too-large.body',
      t('JoinCity.too-large.body', { city: cityNameText(city), size: 8 }),
      `${name} is too large for Settlers to join. Only cities smaller than size 8 can be joined.`
    )
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

  const aztec = unknownPlayer(new Aztec()),
    sioux = unknownPlayer(new WorldCivilizations.Sioux()),
    barbarians = unknownPlayer(new Barbarian());

  const colossus = { _: 'Colossus' },
    notifications: [string, any, string][] = [
      [
        'City.captured-from-us',
        { city: asansol, capturingPlayer: babylon, originalPlayer: india },
        'Our city Asansol has been captured by Babylon!',
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
        'India has been defeated by Babylon!',
      ],
      [
        'Player.defeated.unknown',
        { defeatedPlayer: india, player: null },
        'India defeated!',
      ],
      [
        'Player.defeated.unmet-by',
        { player: babylon },
        'An unknown civilization has been defeated by Babylon!',
      ],
      [
        'Player.defeated.unmet',
        { player: null },
        'News reaches us that an unknown civilization has been defeated!',
      ],
      // #359: a nation that opens a sentence is capitalised; one later on keeps its article in lower case. The nation
      //  that acts comes after the verb, which then agrees whichever it is: "Barbarians" is plural.
      [
        'Player.defeated.by',
        { defeatedPlayer: sioux, player: aztec },
        'The Sioux Nation has been defeated by the Aztec Empire!',
      ],
      [
        'Player.defeated.by',
        { defeatedPlayer: aztec, player: babylon },
        'The Aztec Empire has been defeated by Babylon!',
      ],
      [
        'Player.defeated.by',
        { defeatedPlayer: sioux, player: barbarians },
        'The Sioux Nation has been defeated by Barbarians!',
      ],
      [
        'Player.defeated.unknown',
        { defeatedPlayer: aztec, player: null },
        'The Aztec Empire defeated!',
      ],
      [
        'Player.defeated.unmet-by',
        { player: aztec },
        'An unknown civilization has been defeated by the Aztec Empire!',
      ],
      [
        'Player.respawned',
        { defeatedPlayer: aztec },
        'Where the Aztec Empire once stood, a new civilization has arisen.',
      ],
      [
        'City.captured-from-us',
        { city: asansol, capturingPlayer: aztec, originalPlayer: india },
        'Our city Asansol has been captured by the Aztec Empire!',
      ],
      [
        'City.captured-by-us',
        { city: asansol, capturingPlayer: babylon, originalPlayer: aztec },
        'We have captured Asansol from the Aztec Empire',
      ],
      [
        'City.destroyed-by',
        { city: asansol, player: barbarians },
        'Our city Asansol has been destroyed by Barbarians!',
      ],
      [
        'Unit.nuclear-attack',
        { player: aztec },
        'Nuclear weapons have been used by the Aztec Empire!',
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
      // #337
      [
        'City.civil-disorder',
        { city: toronto },
        'Civil disorder in Toronto. Mayor flees in panic!',
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

  // #169: the barbarians' arrival.
  notifications.push(
    [
      'Barbarians.landing',
      { city: asansol },
      'Barbarian raiding party lands near Asansol! Citizens are alarmed.',
    ],
    [
      'Barbarians.uprising',
      { city: asansol },
      'Travelers report: Barbarian uprising near Asansol!',
    ],
    [
      'Barbarians.uprising.guerrilla',
      { city: asansol },
      'Travelers report: Guerrilla uprising near Asansol!',
    ]
  );

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
    ],
    // #128: a Future Technology is named with its number, any other advance as it is.
    [
      'Player.research-complete',
      { advance: { _: 'FutureTechnology' }, number: 2 },
      'You have discovered the secrets of Future Technology 2!',
    ],
    [
      'Player.research-complete',
      { advance: { _: 'CeremonialBurial' }, number: 1 },
      'You have discovered the secrets of Ceremonial Burial!',
    ]
  );

  notifications.forEach(([key, data, expected]) => {
    // What the UI receives: serialised by `Notifier.notify`, rebuilt by the
    //  transport, then translated as `Notifications.publish` does.
    const notification = reconstituteData(
      new Notification(key, data).toPlainObject()
    );

    expect(
      `${key}.body`,
      String(
        t(`${notification.key}.body`, {
          ...notification.data,
          ns: 'notification',
          skipOnVariables: false,
        })
      ),
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

  // #472: the save alerts are text, so an error's quotes and brackets are written as they are.
  const parseError = `Unexpected token '<', "<html>" is not valid JSON`;

  [
    ['SavedGame.could-not-read', 'That save could not be read: '],
    ['SavedGame.could-not-write', 'That save could not be written: '],
    [
      'SavedGame.could-not-hand-over',
      'That save could not be handed to the reloading page, so the game has not been loaded: ',
    ],
  ].forEach(([key, prefix]) =>
    expect(key, t(key, { error: parseError }), prefix + parseError)
  );

  // #472: every key the UI looks up by name is there, in whichever namespace it's in.
  const namespaces = Object.keys(i18next.store.data.en),
    // A key looked up with a `count` or a `context` is there with a suffix: `Progress.turns_one`.
    flatten = (resources: object, prefix = ''): string[] =>
      Object.entries(resources).flatMap(([key, value]) =>
        typeof value === 'object'
          ? flatten(value, `${prefix}${key}.`)
          : [`${prefix}${key}`]
      ),
    suffixed = namespaces.flatMap((ns) =>
      flatten(i18next.getResourceBundle('en', ns))
    ),
    literalKeys = new Set<string>(),
    scanUI = (directory: string): void =>
      readdirSync(directory).forEach((name) => {
        const path = join(directory, name);

        if (statSync(path).isDirectory()) {
          scanUI(path);

          return;
        }

        if (!name.endsWith('.ts')) {
          return;
        }

        for (const [, key] of readFileSync(path, 'utf8').matchAll(
          /\bt\(\s*'([^']+)'/g
        )) {
          literalKeys.add(key);
        }
      });

  scanUI('src/js/UI');

  if (literalKeys.size < 100) {
    failures.push(`t() scan: only ${literalKeys.size} keys found`);
  }

  literalKeys.forEach((key) => {
    if (
      !i18next.exists(key, { ns: namespaces }) &&
      !suffixed.some((resource) => resource.startsWith(`${key}_`))
    ) {
      failures.push(`${key}: missing`);
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

  // As the page gets `AdvanceTaken` in a step of the talks: its speaker and the advance as a class name.
  expect(
    'AdvanceTaken.exchange-knowledge.taken',
    t('AdvanceTaken.exchange-knowledge.taken', {
      interaction: {
        _: 'AdvanceTaken',
        advance: { _: 'Writing' },
        by: { civilization: { _: 'Egyptian' } },
        key: 'exchange-knowledge.taken',
      },
      ns: 'diplomacy',
    }),
    'In exchange, the Egyptians take Writing.'
  );

  expect(
    'Resolution.AdvanceTaken.Acknowledge',
    t('Resolution.AdvanceTaken.Acknowledge', { ns: 'diplomacy' }),
    'OK'
  );

  // #128: what the Science report, the sidebar and the research choice show.
  const research = {
    complete: [
      { _: 'Writing' },
      { _: 'FutureTechnology' },
      { _: 'FutureTechnology' },
    ],
    researching: { _: 'FutureTechnology' },
  } as unknown as PlayerResearch;

  expect(
    'advanceNames',
    advanceNames(research.complete.map((advance) => advance._)).join(', '),
    'Writing, Future Technology 2'
  );
  expect(
    'researchingName',
    researchingName(research) ?? '',
    'Future Technology 3'
  );
  expect(
    'advanceName',
    advanceName('CeremonialBurial', 4),
    'Ceremonial Burial'
  );

  // #588: the line along the top of the page while the other civilizations move, as `Game` sends it and
  //  `NotificationBar` translates it, in a loaded game and a new one alike. Each key is there (they are sent from the
  //  worker, so the scan of the UI's keys above doesn't see them), and a civilization not yet met isn't named.
  const progress = (notice: { key: string; data: object } | null): string =>
      notice === null
        ? 'no line'
        : String(t(notice.key, { ...notice.data, skipOnVariables: false })),
    playerOf = (civilization: object): Player =>
      ({ civilization: () => civilization } as unknown as Player),
    reader = playerOf(new Babylonian()),
    met = () => true;

  expect('Game.progress.turn', progress(turnProgress(42)), 'Turn 42');
  expect(
    'Game.progress.player',
    progress(playerProgress(playerOf(new Mongol()), reader, met)),
    'The Mongols are moving…'
  );
  expect(
    'Game.progress.player (the barbarians)',
    progress(playerProgress(playerOf(new Barbarian()), reader, met)),
    'The Barbarians are moving…'
  );
  expect(
    'Game.progress.unmet-player',
    progress(playerProgress(playerOf(new Indian()), reader, () => false)),
    'An unknown civilization is moving…'
  );
  expect(
    "the player's own turn has no line",
    progress(playerProgress(reader, reader, met)),
    'no line'
  );

  // #359: every civilization opens a sentence with a capital, and keeps its own article later in the same sentence.
  //  The barbarians are never the ones defeated.
  const civilizations = [
    ...Object.values(Civ1Civilizations),
    ...Object.values(WorldCivilizations),
    Barbarian,
  ];

  civilizations.forEach((Civilization) => {
    const name = Civilization.name,
      nation = t(`${name}.nation`, { ns: 'civilization' }),
      player = { civilization: { _: name } },
      [first, ...rest] = nation;

    if (nation === `${name}.nation`) {
      failures.push(`${name}.nation: missing`);

      return;
    }

    if (Civilization === Barbarian) {
      return;
    }

    expect(
      `Player.defeated.by.body (${name})`,
      t('Player.defeated.by.body', {
        defeatedPlayer: player,
        ns: 'notification',
        player,
      }),
      `${first.toLocaleUpperCase('en')}${rest.join(
        ''
      )} has been defeated by ${nation}!`
    );
  });

  // #359: a string opening a sentence with a nation uses `nation-start`, whose first letter is capitalised; `.nation`
  //  and `Generic.unknown-civilization` start with "the" or "an" there.
  const sentenceStart = (directory: string): void =>
    readdirSync(directory).forEach((name) => {
      const path = join(directory, name);

      if (statSync(path).isDirectory()) {
        sentenceStart(path);

        return;
      }

      readFileSync(path, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          // `Generic.civilization-name.nation`, `nation-start` and `Generic.unknown-civilization-start` are defined by
          //  lookups that open their own values. A one-line entry opens after its key's colon.
          if (
            /((^\s*|:\s*)['`"]|[.!?:]\s+)\$t\((Generic\.civilization-name\.nation(?![-\w]|, capitalise\))|\{\{(?!- civilization\}\})[^}]+\}\}\.nation|Generic\.unknown-civilization(?![-\w]|, capitalise\)))/.test(
              line
            )
          ) {
            failures.push(
              `${path}:${
                index + 1
              }: a sentence opens with a lower-case nation; use Generic.civilization-name.nation-start`
            );
          }
        });
    });

  sentenceStart('translations');

  // #359: the city's name on the map and in the city screen comes from its founder's list, as `Generic.city-name` does.
  i18next.addResource('en', 'city', 'Mongol.Ulaanbaatar.name', 'Ulan Bator');

  expect(
    'cityName (captured)',
    cityName({
      name: 'Ulaanbaatar',
      originalPlayer: { civilization: { _: 'Mongol' } },
      player: { civilization: { _: 'Aztec' } },
    } as unknown as Parameters<typeof cityName>[0]),
    'Ulan Bator'
  );

  if (failures.length) {
    console.error(`FAIL translations\n  ${failures.join('\n  ')}`);

    process.exit(1);
  }

  console.log(
    `PASS translations (${names.length} names, 3 keys; ${notifications.length} notifications; ${choiceMetaKeys.size} choice lists; ${literalKeys.size} UI keys)`
  );
})();
