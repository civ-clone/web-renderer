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

import { Babylonian, Indian } from '@civ-clone/civ1-civilization/Civilizations';
import i18next, { t } from 'i18next';
import Notification from '../../src/js/Engine/Notification';
import Tile from '@civ-clone/core-world/Tile';
import UnknownCity from '../../src/js/Engine/UnknownObjects/City';
import UnknownPlayer from '../../src/js/Engine/UnknownObjects/Player';
import { reconstituteData } from '../../src/js/UI/lib/reconstituteData';

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
  await import('../../translations/civ1-civilization/en');
  await import('../../translations/civ1-unit/en');
  await import('../../translations/civ1-wonder/en');

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
    ];

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

  if (failures.length) {
    console.error(`FAIL translations\n  ${failures.join('\n  ')}`);

    process.exit(1);
  }

  console.log(
    `PASS translations (${names.length} names, 3 keys; ${notifications.length} notifications)`
  );
})();
